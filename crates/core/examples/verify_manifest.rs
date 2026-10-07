//! The gate before every publish: is this `manifest.json` signed by one of the
//! release keys?
//!
//! ```sh
//! cargo run -p night-maze-launcher-core --example verify_manifest -- path/to/manifest.json
//! ```
//!
//! It reads `manifest.json.sig` next to the file and runs the same check the
//! launcher runs, against the keys a release build trusts. The development key
//! is never among them, so a manifest signed with it by mistake fails here.
//! It also reads the manifest the way the launcher does, because a signed file
//! the launcher cannot parse helps nobody.
//!
//! When `news.json` or `news.json.sig` sits next to the manifest, the pair is
//! checked the same way, and one of the two without the other is a failure: a
//! release with half a feed must not be published.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use night_maze_launcher_core::signature::{self, RELEASE_KEYS};
use night_maze_launcher_core::{Manifest, NewsFeed};

/// The names of the keys, in the order of [`RELEASE_KEYS`].
const KEY_NAMES: [&str; 2] = ["first (manifest-a)", "second (manifest-b)"];

fn main() -> ExitCode {
    match check() {
        Ok(message) => {
            println!("{message}");
            ExitCode::SUCCESS
        }
        Err(reason) => {
            eprintln!("NOT VERIFIED: {reason}");
            ExitCode::FAILURE
        }
    }
}

fn check() -> Result<String, String> {
    let path = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .ok_or("usage: verify_manifest <path to manifest.json>")?;

    let (text, key) = signed_text(&path)?;
    let manifest = Manifest::parse(&text).map_err(|error| {
        format!("the signature is good, but the launcher would refuse the manifest: {error}")
    })?;
    let mut message = format!(
        "verified: manifest of version {} is signed by the {} release key",
        manifest.version, KEY_NAMES[key]
    );

    let news_path = path.with_file_name("news.json");
    if news_path.exists() || sig_path(&news_path).exists() {
        let (text, key) = signed_text(&news_path)?;
        let news = NewsFeed::parse(&text).map_err(|error| {
            format!("the signature is good, but the launcher would refuse the news: {error}")
        })?;
        message.push_str(&format!(
            "\nverified: news with {} release(s) is signed by the {} release key",
            news.updates.len(),
            KEY_NAMES[key]
        ));
    }

    Ok(message)
}

/// `<path>.sig`.
fn sig_path(path: &Path) -> PathBuf {
    let mut sig_path = path.as_os_str().to_owned();
    sig_path.push(".sig");
    PathBuf::from(sig_path)
}

/// The text of the file at `path`, once its `.sig` is accepted, and which
/// release key made the signature.
fn signed_text(path: &Path) -> Result<(String, usize), String> {
    let sig_path = sig_path(path);

    // Bytes, not text: the signature is over the exact bytes of the file.
    let bytes = std::fs::read(path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let sig_text = std::fs::read_to_string(&sig_path)
        .map_err(|error| format!("could not read {}: {error}", sig_path.display()))?;

    let key = signature::matching_key(&bytes, &sig_text, &RELEASE_KEYS).map_err(|_| {
        format!(
            "{} is not a signature of {} by a release key",
            sig_path.display(),
            path.display()
        )
    })?;

    let text = String::from_utf8(bytes)
        .map_err(|_| format!("the signature is good, but {} is not text", path.display()))?;
    Ok((text, key))
}
