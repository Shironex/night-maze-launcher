//! Would the launcher read these two files? The format alone, no signature.
//!
//! ```sh
//! cargo run --locked -p night-maze-launcher-core --example parse_feed -- \
//!     path/to/manifest.json path/to/news.json
//! ```
//!
//! It runs the two parsers the launcher runs after it has accepted the
//! signatures. The game repository's CI uses it on a feed built from its real
//! changelog, where nothing is signed. Before a publish the check is
//! `verify_manifest`, which also demands the signatures.

use std::process::ExitCode;

use night_maze_launcher_core::{Manifest, NewsFeed};

fn main() -> ExitCode {
    match check() {
        Ok(message) => {
            println!("{message}");
            ExitCode::SUCCESS
        }
        Err(reason) => {
            eprintln!("NOT READABLE: {reason}");
            ExitCode::FAILURE
        }
    }
}

fn check() -> Result<String, String> {
    let arguments: Vec<String> = std::env::args().skip(1).collect();
    let [manifest_path, news_path] = arguments.as_slice() else {
        return Err("usage: parse_feed <manifest.json> <news.json>".to_owned());
    };

    let manifest = Manifest::parse(&text(manifest_path)?)
        .map_err(|error| format!("the launcher would refuse {manifest_path}: {error}"))?;
    let news = NewsFeed::parse(&text(news_path)?)
        .map_err(|error| format!("the launcher would refuse {news_path}: {error}"))?;

    Ok(format!(
        "{manifest_path}: manifest of version {} for {}\n{news_path}: {} release(s), {} news, {} notice(s)",
        manifest.version,
        manifest
            .game
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>()
            .join(", "),
        news.updates.len(),
        news.news.len(),
        news.notices.len()
    ))
}

/// The file as text. Read as bytes first, as the launcher receives it.
fn text(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|error| format!("could not read {path}: {error}"))?;
    String::from_utf8(bytes).map_err(|_| format!("{path} is not text"))
}
