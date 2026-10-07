//! What the flow tests share: a loopback HTTP server, release fixtures and a
//! key that signs them.
//!
//! The server is deliberately not a real HTTP implementation. It reads one
//! request, answers with whatever the test registered for that path, and
//! closes the connection.
//!
//! A fixture manifest names a zip on the server's port, and the port is only
//! known once the server runs. So nothing is signed ahead of time: every
//! server makes a throwaway key pair, signs what it publishes, and [`config`]
//! trusts exactly that key.

#![allow(dead_code, reason = "each test uses a different subset")]

use std::collections::{HashMap, VecDeque};
use std::io::{Cursor, Write};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use night_maze_launcher_core::{Config, Layout, Version};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// What the server does for one path.
#[derive(Clone)]
pub(crate) enum Reply {
    /// A 200 with these bytes.
    Body(Vec<u8>),
    /// A redirect to `location`.
    Redirect(String),
    /// A status with an empty body.
    Status(u16),
    /// Accept the request and never answer.
    Hang,
}

impl Reply {
    fn render(&self) -> Vec<u8> {
        match self {
            Self::Body(body) => {
                let mut raw = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                )
                .into_bytes();
                raw.extend_from_slice(body);
                raw
            }
            Self::Redirect(location) => format!(
                "HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\n\
                 Connection: close\r\n\r\n"
            )
            .into_bytes(),
            Self::Status(status) => {
                format!("HTTP/1.1 {status} Nope\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .into_bytes()
            }
            Self::Hang => Vec::new(),
        }
    }
}

/// A throwaway signing key, in the formats of the Tauri CLI: what
/// `tauri signer generate` and `tauri signer sign` write is base64 of the
/// minisign text.
pub(crate) struct Signer {
    pair: minisign::KeyPair,
}

impl Signer {
    /// A new key pair. Without a password: the password only protects the
    /// private key on disk, and applying it is slow.
    pub(crate) fn new() -> Self {
        Self {
            pair: minisign::KeyPair::generate_unencrypted_keypair().expect("a key pair"),
        }
    }

    /// The content of the `.pub` file of this key.
    pub(crate) fn public_key(&self) -> String {
        let text = self.pair.pk.to_box().expect("a public key box").to_string();
        STANDARD.encode(text)
    }

    /// The content of the `.sig` file for `bytes`.
    pub(crate) fn sign(&self, bytes: &[u8]) -> String {
        let signature = minisign::sign(
            None,
            &self.pair.sk,
            Cursor::new(bytes),
            Some("timestamp:1791280496\tfile:fixture"),
            Some("signature from tauri secret key"),
        )
        .expect("a signature");
        STANDARD.encode(signature.to_string())
    }
}

type Routes = Arc<Mutex<HashMap<String, Reply>>>;

/// Replies that are given once, in order, before the lasting route of a path.
type FirstReplies = Arc<Mutex<HashMap<String, VecDeque<Reply>>>>;

/// A server on an ephemeral loopback port. It stops when it is dropped.
pub(crate) struct TestServer {
    address: SocketAddr,
    routes: Routes,
    first: FirstReplies,
    signer: Signer,
    requests: Arc<Mutex<Vec<String>>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

impl TestServer {
    pub(crate) async fn start() -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("binding an ephemeral loopback port");
        let address = listener
            .local_addr()
            .expect("the bound address is readable");
        let routes: Routes = Arc::default();
        let first: FirstReplies = Arc::default();
        let requests: Arc<Mutex<Vec<String>>> = Arc::default();

        let (served, once, seen) = (
            Arc::clone(&routes),
            Arc::clone(&first),
            Arc::clone(&requests),
        );
        let task = tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                let (served, once, seen) =
                    (Arc::clone(&served), Arc::clone(&once), Arc::clone(&seen));
                tokio::spawn(async move {
                    let path = request_path(&read_head(&mut stream).await).unwrap_or_default();
                    seen.lock().expect("the request list").push(path.clone());
                    let queued = once
                        .lock()
                        .expect("the first replies")
                        .get_mut(&path)
                        .and_then(VecDeque::pop_front);
                    let reply = queued.unwrap_or_else(|| {
                        served
                            .lock()
                            .expect("the routes")
                            .get(&path)
                            .cloned()
                            .unwrap_or(Reply::Status(404))
                    });
                    if matches!(reply, Reply::Hang) {
                        tokio::time::sleep(Duration::from_secs(600)).await;
                        return;
                    }
                    let _ = stream.write_all(&reply.render()).await;
                    let _ = stream.flush().await;
                    let _ = stream.shutdown().await;
                });
            }
        });

        Self {
            address,
            routes,
            first,
            signer: Signer::new(),
            requests,
            task,
        }
    }

    /// The public key of this server's signing key, as a `.pub` file holds it.
    pub(crate) fn public_key(&self) -> String {
        self.signer.public_key()
    }

    /// What this server's key signs `bytes` with, as a `.sig` file holds it.
    pub(crate) fn sign(&self, bytes: &[u8]) -> String {
        self.signer.sign(bytes)
    }

    /// Answer `path` with `body` and `path.sig` with its signature, from now
    /// on.
    pub(crate) fn route_signed(&self, path: &str, body: &[u8]) {
        self.route(path, Reply::Body(body.to_vec()));
        self.route(
            &format!("{path}.sig"),
            Reply::Body(self.sign(body).into_bytes()),
        );
    }

    /// Answer the next request for `path` with `reply`, and go back to the
    /// lasting route after it. A file that changes between two requests is
    /// what a launcher sees while a release is being published.
    pub(crate) fn route_once(&self, path: &str, reply: Reply) {
        self.first
            .lock()
            .expect("the first replies")
            .entry(path.to_owned())
            .or_default()
            .push_back(reply);
    }

    /// Answer `path` with `reply` from now on.
    pub(crate) fn route(&self, path: &str, reply: Reply) {
        self.routes
            .lock()
            .expect("the routes")
            .insert(path.to_owned(), reply);
    }

    /// The URL of `path` on this server.
    pub(crate) fn url(&self, path: &str) -> String {
        format!("http://{}{path}", self.address)
    }

    /// Every request path received so far.
    pub(crate) fn requests(&self) -> Vec<String> {
        self.requests.lock().expect("the request list").clone()
    }

    /// Publish a release: its zip, a manifest that names it and the notes
    /// feed, the last two signed.
    pub(crate) fn publish(&self, release: &Release) {
        let zip_path = format!("/NightMaze-{}.zip", release.version);
        self.route(&zip_path, Reply::Body(release.zip.clone()));
        self.route_signed(
            "/manifest.json",
            release.manifest(&self.url(&zip_path)).as_bytes(),
        );
        self.route_signed("/news.json", release.news().as_bytes());
    }
}

async fn read_head(stream: &mut tokio::net::TcpStream) -> String {
    let mut raw = Vec::new();
    let mut scratch = [0_u8; 1024];
    while !raw.windows(4).any(|window| window == b"\r\n\r\n") {
        match stream.read(&mut scratch).await {
            Ok(0) | Err(_) => break,
            Ok(read) => raw.extend_from_slice(&scratch[..read]),
        }
    }
    String::from_utf8_lossy(&raw).into_owned()
}

fn request_path(request: &str) -> Option<String> {
    request
        .lines()
        .next()?
        .split_whitespace()
        .nth(1)
        .map(str::to_owned)
}

/// The platform key the fixtures publish a build for.
pub(crate) const PLATFORM: &str = "test-platform";

/// The executable name inside the fixture zips.
pub(crate) const EXE: &str = if cfg!(windows) {
    "night_maze.exe"
} else {
    "night_maze"
};

/// One fixture release.
pub(crate) struct Release {
    pub(crate) version: String,
    pub(crate) zip: Vec<u8>,
    /// The checksum written into the manifest. Tests change it to simulate a
    /// damaged download.
    pub(crate) sha256: String,
    /// The size written into the manifest.
    pub(crate) size: u64,
    pub(crate) launcher_min: String,
}

impl Release {
    /// A release whose game is the stub, told to exit with `exit_code` after
    /// `alive_ms` milliseconds.
    pub(crate) fn stub(version: &str, exit_code: u32, alive_ms: u64) -> Self {
        let exe = std::fs::read(env!("CARGO_BIN_EXE_stub_game")).expect("the stub game is built");
        let settings = format!("{exit_code} {alive_ms}");
        Self::from_entries(
            version,
            &[
                (EXE, exe.as_slice()),
                ("stub.txt", settings.as_bytes()),
                ("assets/shaders/lit.frag", b"void main() {}"),
            ],
        )
    }

    pub(crate) fn from_entries(version: &str, entries: &[(&str, &[u8])]) -> Self {
        let zip = zip_bytes(entries);
        Self {
            version: version.to_owned(),
            sha256: hex(&Sha256::digest(&zip)),
            size: zip.len() as u64,
            zip,
            launcher_min: "0.1.0".to_owned(),
        }
    }

    pub(crate) fn manifest(&self, zip_url: &str) -> String {
        format!(
            r#"{{"schema":1,"version":"{}","notes":"About {}","game":{{"{PLATFORM}":{{
                "url":"{zip_url}","size":{},"sha256":"{}","exe":"{EXE}"}}}},
                "launcher":{{"min":"{}"}}}}"#,
            self.version, self.version, self.size, self.sha256, self.launcher_min
        )
    }
}

impl Release {
    /// The notes feed [`TestServer::publish`] puts next to the manifest.
    pub(crate) fn news(&self) -> String {
        format!(
            r#"{{"schema":1,"updates":[{{"version":"{}","title":"Notes of {}"}}]}}"#,
            self.version, self.version
        )
    }
}

fn zip_bytes(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    for (name, body) in entries {
        writer
            .start_file(*name, options)
            .expect("start a fixture entry");
        writer.write_all(body).expect("write a fixture entry");
    }
    writer
        .finish()
        .expect("finish the fixture archive")
        .into_inner()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// A launcher configuration under `root` that reads its manifest from `server`
/// and trusts the key of that server only.
pub(crate) fn config(root: &Path, server: &TestServer) -> Config {
    Config {
        layout: Layout::new(root),
        manifest_url: server.url("/manifest.json"),
        launcher_version: Version::parse("0.1.0").expect("a valid version"),
        platform: PLATFORM.to_owned(),
        start_watch: Duration::from_millis(1500),
        trusted_keys: vec![server.public_key()],
    }
}
