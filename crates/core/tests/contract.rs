//! The contract with the writer. The two files under
//! `scripts/fixtures/contract` are what the release scripts write for fixed
//! inputs: a Node test (`scripts/lib/feed.test.mjs`) regenerates them and
//! compares byte for byte. Here the launcher's own parsers read the same two
//! files, so the writer and the reader cannot drift apart without one of the
//! two tests failing.
//!
//! Values are compared, not only "it parses": most fields have a default, so
//! a key renamed by the writer would still parse, as an empty value.

use night_maze_launcher_core::{Manifest, NewsFeed, Version};

const MANIFEST: &str = include_str!("../../../scripts/fixtures/contract/manifest.json");
const NEWS: &str = include_str!("../../../scripts/fixtures/contract/news.json");

#[test]
fn the_launcher_reads_the_manifest_the_scripts_write() {
    let manifest = Manifest::parse(MANIFEST).expect("the fixture is a manifest");

    assert_eq!(manifest.version, "0.9.1");
    assert_eq!(
        manifest.notes.as_deref(),
        Some("A small release after the first round of feedback.")
    );
    assert_eq!(
        manifest.feed.as_deref(),
        Some("https://github.com/Shironex/night-maze/releases/download/v0.9.1/news.json")
    );
    assert_eq!(
        manifest.minimum_launcher(),
        Some(Version {
            major: 0,
            minor: 1,
            patch: 2
        })
    );

    assert_eq!(
        manifest.game.keys().collect::<Vec<_>>(),
        ["macos-arm64", "windows-x64"]
    );
    let windows = manifest.build_for("windows-x64").expect("a Windows build");
    assert_eq!(
        windows.url,
        "https://github.com/Shironex/night-maze/releases/download/v0.9.1/NightMaze-0.9.1-windows-x64.zip"
    );
    assert_eq!(windows.size, 15);
    assert_eq!(
        windows.sha256,
        "3414980677bf107c6c25dc303125b84295c8abb80d9c93db93d97ffd286662da"
    );
    assert_eq!(windows.exe, "night_maze.exe");
    assert_eq!(
        manifest
            .build_for("macos-arm64")
            .expect("a macOS build")
            .exe,
        "night_maze"
    );
}

#[test]
fn the_launcher_reads_the_news_the_scripts_write() {
    let feed = NewsFeed::parse(NEWS).expect("the fixture is a notes feed");

    assert_eq!(feed.updates.len(), 2);
    let newest = &feed.updates[0];
    assert_eq!(newest.version, "0.9.1");
    assert_eq!(newest.date, "2026-12-12");
    assert_eq!(newest.tag, "Fix release");
    assert_eq!(
        newest.title,
        "Brighter crystals and a fix for the exit gate"
    );
    assert_eq!(
        newest.summary,
        "A small release after the first round of feedback."
    );
    assert!(newest.highlight);
    assert_eq!(newest.groups.len(), 2);
    assert_eq!(newest.groups[0].title, "Gameplay");
    assert_eq!(
        newest.groups[0].items,
        [
            "The exit gate opens on the last crystal",
            "Crystals glow further than before"
        ]
    );
    assert!(!feed.updates[1].highlight);

    assert_eq!(feed.news.len(), 1);
    assert_eq!(feed.news[0].date, "2026-12-10");
    assert_eq!(feed.news[0].title, "A post");
    assert_eq!(feed.news[0].body, "Text");

    assert_eq!(feed.notices.len(), 1);
    assert_eq!(feed.notices[0].id, "n1");
    assert_eq!(feed.notices[0].level, "warning");
    assert_eq!(feed.notices[0].title, "A notice");
    assert_eq!(feed.notices[0].body, "Text");
}
