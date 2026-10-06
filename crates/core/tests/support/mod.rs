//! What the flow tests share: a loopback HTTP server and release fixtures.
//!
//! The server is deliberately not a real HTTP implementation. It reads one
//! request, answers with whatever the test registered for that path, and
//! closes the connection.

#![allow(dead_code, reason = "each test uses a different subset")]

use std::collections::HashMap;
use std::io::Write;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

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

type Routes = Arc<Mutex<HashMap<String, Reply>>>;

/// A server on an ephemeral loopback port. It stops when it is dropped.
pub(crate) struct TestServer {
    address: SocketAddr,
    routes: Routes,
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
        let requests: Arc<Mutex<Vec<String>>> = Arc::default();

        let (served, seen) = (Arc::clone(&routes), Arc::clone(&requests));
        let task = tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                let (served, seen) = (Arc::clone(&served), Arc::clone(&seen));
                tokio::spawn(async move {
                    let path = request_path(&read_head(&mut stream).await).unwrap_or_default();
                    seen.lock().expect("the request list").push(path.clone());
                    let reply = served
                        .lock()
                        .expect("the routes")
                        .get(&path)
                        .cloned()
                        .unwrap_or(Reply::Status(404));
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
            requests,
            task,
        }
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

    /// Publish a release: its zip and a manifest that names it.
    pub(crate) fn publish(&self, release: &Release) {
        let zip_path = format!("/NightMaze-{}.zip", release.version);
        self.route(&zip_path, Reply::Body(release.zip.clone()));
        self.route(
            "/manifest.json",
            Reply::Body(release.manifest(&self.url(&zip_path)).into_bytes()),
        );
        self.route(
            "/news.json",
            Reply::Body(
                format!(
                    r#"{{"schema":1,"updates":[{{"version":"{}","title":"Notes of {}"}}]}}"#,
                    release.version, release.version
                )
                .into_bytes(),
            ),
        );
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

/// A launcher configuration under `root` that reads its manifest from `server`.
pub(crate) fn config(root: &Path, server: &TestServer) -> Config {
    Config {
        layout: Layout::new(root),
        manifest_url: server.url("/manifest.json"),
        launcher_version: Version::parse("0.1.0").expect("a valid version"),
        platform: PLATFORM.to_owned(),
        start_watch: Duration::from_millis(1500),
    }
}
