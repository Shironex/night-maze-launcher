//! Where the launcher keeps things on disk.
//!
//! ```text
//! <root>/
//!   versions/<version>/   one unpacked game build per version
//!   staging/              downloads and unpacking, same disk as versions/
//!   data/                 the game's working directory (imgui.ini, later saves)
//!     logs/last-run.log   the game's console output
//!   cache/news.json       the last notes feed that was read, for offline starts
//!   state.json            current, previous, bad versions, good runs, settings
//!   launcher.log
//! ```
//!
//! Per user, no administrator rights. There is no "current" link: Windows needs
//! extra rights for symbolic links, so `state.json` names the current version.

use std::path::{Path, PathBuf};

/// Overrides the install root. Used by tests and by local runs so that nothing
/// is written to the real per-user folder.
pub const ROOT_ENV: &str = "NIGHT_MAZE_LAUNCHER_ROOT";

/// The name of the folder under the per-user application data directory.
const FOLDER: &str = "NightMaze";

/// The directory layout under one install root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Layout {
    root: PathBuf,
}

impl Layout {
    /// A layout under `root`. Nothing is created until it is needed.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// The layout the launcher uses when it is started normally: the override
    /// from [`ROOT_ENV`] when set, otherwise the per-user folder.
    pub fn from_environment() -> Option<Self> {
        if let Some(root) = std::env::var_os(ROOT_ENV).filter(|value| !value.is_empty()) {
            return Some(Self::new(PathBuf::from(root)));
        }
        default_root().map(Self::new)
    }

    /// The install root.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// `versions/`.
    pub fn versions_dir(&self) -> PathBuf {
        self.root.join("versions")
    }

    /// `versions/<version>/`. The caller passes a validated version only.
    pub fn version_dir(&self, version: &str) -> PathBuf {
        self.versions_dir().join(version)
    }

    /// `staging/`.
    pub fn staging_dir(&self) -> PathBuf {
        self.root.join("staging")
    }

    /// `data/`, the working directory of the game.
    pub fn data_dir(&self) -> PathBuf {
        self.root.join("data")
    }

    /// `data/logs/`.
    pub fn logs_dir(&self) -> PathBuf {
        self.data_dir().join("logs")
    }

    /// `data/logs/last-run.log`.
    pub fn last_run_log(&self) -> PathBuf {
        self.logs_dir().join("last-run.log")
    }

    /// `cache/news.json`.
    pub fn cached_feed(&self) -> PathBuf {
        self.root.join("cache").join("news.json")
    }

    /// `state.json`.
    pub fn state_file(&self) -> PathBuf {
        self.root.join("state.json")
    }

    /// `launcher.log`.
    pub fn launcher_log(&self) -> PathBuf {
        self.root.join("launcher.log")
    }
}

/// `%LOCALAPPDATA%\NightMaze` on Windows.
#[cfg(windows)]
fn default_root() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA").filter(|value| !value.is_empty())?;
    Some(PathBuf::from(base).join(FOLDER))
}

/// `~/Library/Application Support/NightMaze` on macOS.
#[cfg(target_os = "macos")]
fn default_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").filter(|value| !value.is_empty())?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(FOLDER),
    )
}

/// Other systems are not release targets. The XDG data directory keeps a
/// development build on them from writing into the home directory itself.
#[cfg(not(any(windows, target_os = "macos")))]
fn default_root() -> Option<PathBuf> {
    if let Some(data) = std::env::var_os("XDG_DATA_HOME").filter(|value| !value.is_empty()) {
        return Some(PathBuf::from(data).join(FOLDER));
    }
    let home = std::env::var_os("HOME").filter(|value| !value.is_empty())?;
    Some(
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join(FOLDER),
    )
}

/// The key of this system in the `game` table of the manifest.
pub fn platform_key() -> &'static str {
    if cfg!(all(windows, target_arch = "x86_64")) {
        "windows-x64"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "macos-arm64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "macos-x64"
    } else if cfg!(windows) {
        "windows-arm64"
    } else {
        "unsupported"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_path_stays_under_the_root() {
        let layout = Layout::new("root");
        for path in [
            layout.versions_dir(),
            layout.version_dir("0.9.0"),
            layout.staging_dir(),
            layout.data_dir(),
            layout.logs_dir(),
            layout.last_run_log(),
            layout.cached_feed(),
            layout.state_file(),
            layout.launcher_log(),
        ] {
            assert!(
                path.starts_with("root"),
                "{} is outside the root",
                path.display()
            );
        }
    }

    #[test]
    fn the_game_log_is_inside_the_working_directory() {
        let layout = Layout::new("root");
        assert!(layout.last_run_log().starts_with(layout.data_dir()));
    }
}
