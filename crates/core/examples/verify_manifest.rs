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

use std::path::PathBuf;
use std::process::ExitCode;

use night_maze_launcher_core::Manifest;
use night_maze_launcher_core::signature::{self, RELEASE_KEYS};

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
    let mut sig_path = path.clone().into_os_string();
    sig_path.push(".sig");
    let sig_path = PathBuf::from(sig_path);

    // Bytes, not text: the signature is over the exact bytes of the file.
    let bytes = std::fs::read(&path)
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

    let text = std::str::from_utf8(&bytes)
        .map_err(|_| "the signature is good, but the manifest is not text".to_owned())?;
    let manifest = Manifest::parse(text).map_err(|error| {
        format!("the signature is good, but the launcher would refuse it: {error}")
    })?;

    Ok(format!(
        "verified: manifest of version {} is signed by the {} release key",
        manifest.version, KEY_NAMES[key]
    ))
}
