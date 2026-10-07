//! The two small JSON files a release publishes: `manifest.json` and `news.json`.
//!
//! Both are read as untrusted text. Every string that later touches the file
//! system (the version, the executable name) is checked here, once, so the rest
//! of the crate can use a [`Manifest`] without looking at it again.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};
use crate::version::Version;

/// The only manifest and feed format this launcher understands.
pub const SCHEMA: u32 = 1;

/// `manifest.json`: which version is the newest and where its files are.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Manifest {
    /// Format number, see [`SCHEMA`].
    pub schema: u32,
    /// The version to install, `major.minor.patch`.
    pub version: String,
    /// One line about the release, the fallback when the feed cannot be read.
    #[serde(default)]
    pub notes: Option<String>,
    /// Where `news.json` is. Defaults to a file next to the manifest.
    #[serde(default)]
    pub feed: Option<String>,
    /// One build per platform key (`windows-x64`, `macos-arm64`).
    #[serde(default)]
    pub game: BTreeMap<String, GameBuild>,
    /// What the release needs from the launcher.
    #[serde(default)]
    pub launcher: Option<LauncherRequirement>,
}

/// One downloadable build of the game.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct GameBuild {
    /// The zip file.
    pub url: String,
    /// Its length in bytes.
    pub size: u64,
    /// Its SHA-256, 64 hex characters.
    pub sha256: String,
    /// The executable inside the zip, a bare file name.
    pub exe: String,
}

/// The `launcher` block of the manifest.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct LauncherRequirement {
    /// The oldest launcher that may install this release.
    #[serde(default)]
    pub min: Option<String>,
}

impl Manifest {
    /// Parse and check a manifest.
    ///
    /// # Errors
    ///
    /// [`CoreError::BadManifest`] for anything that is not JSON of the known
    /// schema, including an HTML page from a captive portal.
    pub fn parse(text: &str) -> Result<Self> {
        let manifest: Self = serde_json::from_str(text)
            .map_err(|error| CoreError::BadManifest(format!("it is not a manifest ({error})")))?;

        if manifest.schema != SCHEMA {
            return Err(CoreError::BadManifest(format!(
                "format {} is not known to this launcher",
                manifest.schema
            )));
        }
        if Version::parse(&manifest.version).is_none() {
            return Err(CoreError::BadManifest(format!(
                "\"{}\" is not a version",
                manifest.version
            )));
        }
        for (platform, build) in &manifest.game {
            build.check().map_err(|problem| {
                CoreError::BadManifest(format!("the {platform} build {problem}"))
            })?;
        }
        if let Some(min) = manifest
            .launcher
            .as_ref()
            .and_then(|launcher| launcher.min.as_ref())
            && Version::parse(min).is_none()
        {
            return Err(CoreError::BadManifest(format!(
                "\"{min}\" is not a launcher version"
            )));
        }

        Ok(manifest)
    }

    /// The build for `platform`.
    ///
    /// # Errors
    ///
    /// [`CoreError::NoBuildForPlatform`] when the release has none.
    pub fn build_for(&self, platform: &str) -> Result<&GameBuild> {
        self.game
            .get(platform)
            .ok_or_else(|| CoreError::NoBuildForPlatform(platform.to_owned()))
    }

    /// The lowest launcher version this release accepts, when it names one.
    pub fn minimum_launcher(&self) -> Option<Version> {
        self.launcher
            .as_ref()?
            .min
            .as_deref()
            .and_then(Version::parse)
    }
}

impl GameBuild {
    fn check(&self) -> std::result::Result<(), String> {
        if !is_bare_file_name(&self.exe) {
            return Err(format!(
                "names an executable that is not a plain file name: {}",
                self.exe
            ));
        }
        if self.sha256.len() != 64 || !self.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("has a checksum that is not 64 hex characters".to_owned());
        }
        if self.size == 0 {
            return Err("has no size".to_owned());
        }
        Ok(())
    }
}

/// A name with no directory part and no drive letter, so joining it onto a
/// version directory cannot leave that directory.
fn is_bare_file_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':'])
        && !name.chars().any(char::is_control)
}

/// `news.json`: the text the window shows.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct NewsFeed {
    /// Format number, see [`SCHEMA`].
    pub schema: u32,
    /// Release notes, newest first.
    #[serde(default)]
    pub updates: Vec<ReleaseNotes>,
    /// Posts that are not tied to a version.
    #[serde(default)]
    pub news: Vec<NewsPost>,
    /// Notices from the author, for example about a pulled release.
    #[serde(default)]
    pub notices: Vec<RemoteNotice>,
}

/// The notes of one release.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct ReleaseNotes {
    /// The version the notes describe.
    pub version: String,
    /// Release date, `YYYY-MM-DD`.
    #[serde(default)]
    pub date: String,
    /// A short label such as "Milestone release".
    #[serde(default)]
    pub tag: String,
    /// The headline.
    #[serde(default)]
    pub title: String,
    /// One intro sentence.
    #[serde(default)]
    pub summary: String,
    /// Whether this entry fills the highlight card.
    #[serde(default)]
    pub highlight: bool,
    /// Groups of bullet points.
    #[serde(default)]
    pub groups: Vec<NotesGroup>,
}

/// One titled list of bullet points in the notes of a release.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct NotesGroup {
    /// The group heading.
    #[serde(default)]
    pub title: String,
    /// The bullet points.
    #[serde(default)]
    pub items: Vec<String>,
}

/// A post in the News tab.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct NewsPost {
    /// Date of the post, `YYYY-MM-DD`.
    #[serde(default)]
    pub date: String,
    /// The headline.
    #[serde(default)]
    pub title: String,
    /// The text.
    #[serde(default)]
    pub body: String,
}

/// A notice from the feed.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct RemoteNotice {
    /// A stable id.
    #[serde(default)]
    pub id: String,
    /// `info` or `warning`.
    #[serde(default)]
    pub level: String,
    /// The headline.
    #[serde(default)]
    pub title: String,
    /// The text.
    #[serde(default)]
    pub body: String,
}

impl NewsFeed {
    /// Parse a feed.
    ///
    /// # Errors
    ///
    /// [`CoreError::BadManifest`] for anything that is not a feed of the known
    /// schema. The launcher works without a feed, so callers treat this as
    /// "no notes", not as a failed update check.
    pub fn parse(text: &str) -> Result<Self> {
        let feed: Self = serde_json::from_str(text)
            .map_err(|error| CoreError::BadManifest(format!("it is not a notes feed ({error})")))?;
        if feed.schema != SCHEMA {
            return Err(CoreError::BadManifest(format!(
                "notes format {} is not known to this launcher",
                feed.schema
            )));
        }
        Ok(feed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn manifest_with(version: &str, exe: &str, sha256: &str) -> String {
        format!(
            r#"{{"schema":1,"version":"{version}","game":{{"windows-x64":{{
                "url":"https://example.com/a.zip","size":10,"sha256":"{sha256}","exe":"{exe}"}}}},
                "launcher":{{"min":"0.1.0"}}}}"#
        )
    }

    #[test]
    fn a_complete_manifest_parses() {
        let manifest = Manifest::parse(&manifest_with("0.9.0", "night_maze.exe", HASH))
            .expect("the manifest is valid");
        assert_eq!(manifest.version, "0.9.0");
        assert_eq!(
            manifest.build_for("windows-x64").expect("a build").exe,
            "night_maze.exe"
        );
        assert_eq!(
            manifest.minimum_launcher().map(|v| v.to_string()),
            Some("0.1.0".to_owned())
        );
        assert!(matches!(
            manifest.build_for("macos-arm64"),
            Err(CoreError::NoBuildForPlatform(_))
        ));
    }

    #[test]
    fn an_html_page_is_not_a_manifest() {
        let error = Manifest::parse("<html><body>Sign in to the hotel Wi-Fi</body></html>");
        assert!(matches!(error, Err(CoreError::BadManifest(_))));
    }

    #[test]
    fn an_unknown_schema_is_refused() {
        let text =
            manifest_with("0.9.0", "night_maze.exe", HASH).replace("\"schema\":1", "\"schema\":2");
        assert!(matches!(
            Manifest::parse(&text),
            Err(CoreError::BadManifest(_))
        ));
    }

    #[test]
    fn a_version_that_could_leave_the_versions_directory_is_refused() {
        for version in ["../../evil", "0.9", "v0.9.0", "0.9.0/..", ""] {
            let text = manifest_with(version, "night_maze.exe", HASH);
            assert!(
                matches!(Manifest::parse(&text), Err(CoreError::BadManifest(_))),
                "{version:?} must be refused"
            );
        }
    }

    #[test]
    fn an_executable_name_with_a_path_is_refused() {
        for exe in [
            "../night_maze.exe",
            "bin/night_maze",
            "C:night_maze.exe",
            "..",
            "",
        ] {
            let text = manifest_with("0.9.0", exe, HASH);
            assert!(
                matches!(Manifest::parse(&text), Err(CoreError::BadManifest(_))),
                "{exe:?} must be refused"
            );
        }
    }

    #[test]
    fn a_checksum_of_the_wrong_shape_is_refused() {
        for sha256 in ["abc", &HASH[1..], &format!("{}g", &HASH[1..])] {
            let text = manifest_with("0.9.0", "night_maze.exe", sha256);
            assert!(matches!(
                Manifest::parse(&text),
                Err(CoreError::BadManifest(_))
            ));
        }
    }

    #[test]
    fn a_feed_parses_with_missing_optional_parts() {
        let feed = NewsFeed::parse(
            r#"{"schema":1,"updates":[{"version":"0.9.0","title":"First","groups":[
                {"title":"Gameplay","items":["One","Two"]}]}]}"#,
        )
        .expect("the feed is valid");
        assert_eq!(feed.updates[0].groups[0].items.len(), 2);
        assert!(feed.news.is_empty());
        assert!(feed.notices.is_empty());
    }

    #[test]
    fn a_feed_of_another_schema_is_refused() {
        assert!(NewsFeed::parse(r#"{"schema":7}"#).is_err());
        assert!(NewsFeed::parse("not json").is_err());
    }
}
