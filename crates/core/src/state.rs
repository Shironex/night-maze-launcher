//! `state.json`: what is installed, what ran, and the rollback rules.
//!
//! The file is the only record of which version is current. It is written to a
//! temporary file and renamed over the old one, so a crash leaves either the
//! old state or the new one, never half of each.
//!
//! The rules that change the state are plain functions on [`State`] with no
//! file access, so each one is tested on its own.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, Result};

/// The format number written to `state.json`.
pub const STATE_SCHEMA: u32 = 1;

/// Everything the launcher remembers between starts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    /// Format number, see [`STATE_SCHEMA`].
    pub schema: u32,
    /// The version Launch starts.
    #[serde(default)]
    pub current: Option<String>,
    /// The version before it, kept on disk for rollback.
    #[serde(default)]
    pub previous: Option<String>,
    /// Versions that failed to start here and are never installed again.
    #[serde(default)]
    pub bad: Vec<String>,
    /// What is known about each installed version.
    #[serde(default)]
    pub versions: BTreeMap<String, VersionRecord>,
    /// Whether the launcher asks for updates when it opens.
    #[serde(default = "enabled")]
    pub check_on_start: bool,
    /// Notices the launcher wrote itself, newest last.
    #[serde(default)]
    pub notices: Vec<LocalNotice>,
}

fn enabled() -> bool {
    true
}

impl Default for State {
    fn default() -> Self {
        Self {
            schema: STATE_SCHEMA,
            current: None,
            previous: None,
            bad: Vec::new(),
            versions: BTreeMap::new(),
            check_on_start: true,
            notices: Vec::new(),
        }
    }
}

/// What the launcher knows about one installed version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VersionRecord {
    /// The executable inside the version directory, from the manifest.
    pub exe: String,
    /// When this version last ran successfully, in seconds since 1970.
    #[serde(default)]
    pub last_good_run: Option<u64>,
}

/// Why a local notice was written.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum NoticeKind {
    /// A new version did not start and the previous one was restored.
    RolledBack,
    /// A version did not start and there was nothing to go back to.
    StartFailed,
}

/// A notice the launcher wrote itself. It stays until the player dismisses it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct LocalNotice {
    /// Unique within the state file.
    pub id: String,
    /// Why it was written.
    pub kind: NoticeKind,
    /// The version that did not start.
    pub failed: String,
    /// The version the launcher went back to, for [`NoticeKind::RolledBack`].
    #[serde(default)]
    pub restored: Option<String>,
    /// The last error line of the game log, when there was one.
    #[serde(default)]
    pub detail: Option<String>,
}

/// How one run of the game ended, as far as the rules care.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RunResult {
    /// Whether the exit code was 0.
    pub exit_ok: bool,
    /// Whether the game exited before the start watch ran out.
    pub within_watch: bool,
}

/// What the launcher does after a run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// Nothing: the run was fine, or it failed too late to blame the start.
    Fine,
    /// The version is marked bad and `to` becomes current again.
    RollBack {
        /// The version to go back to.
        to: String,
    },
    /// The version did not start and there is nothing safe to go back to.
    StartFailed,
}

impl State {
    /// Read the state file. A missing file is a first run.
    ///
    /// A file that cannot be parsed is set aside as `state.json.broken` and the
    /// launcher starts as if nothing were installed: a second download is
    /// cheaper than a launcher that refuses to open.
    ///
    /// # Errors
    ///
    /// [`CoreError::Io`] when the file exists and cannot be read.
    pub fn load(path: &Path) -> Result<Self> {
        let text = match std::fs::read_to_string(path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Self::default());
            }
            Err(error) => return Err(CoreError::io("read the state file", path)(error)),
        };
        match serde_json::from_str::<Self>(&text) {
            Ok(state) if state.schema == STATE_SCHEMA => Ok(state),
            _ => {
                let mut broken = path.as_os_str().to_owned();
                broken.push(".broken");
                let _ = std::fs::rename(path, broken);
                Ok(Self::default())
            }
        }
    }

    /// Write the state file through a temporary file and a rename.
    ///
    /// # Errors
    ///
    /// [`CoreError::Io`] when writing or renaming fails. The old file is intact
    /// in that case.
    pub fn save(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(CoreError::io("create the launcher folder", parent))?;
        }
        let mut temporary = path.as_os_str().to_owned();
        temporary.push(".tmp");
        let temporary = std::path::PathBuf::from(temporary);

        let text = serde_json::to_string_pretty(self).map_err(|error| CoreError::Io {
            operation: "write the state file",
            path: path.to_path_buf(),
            source: std::io::Error::other(error),
        })?;

        let write = || -> std::io::Result<()> {
            let mut file = std::fs::File::create(&temporary)?;
            file.write_all(text.as_bytes())?;
            file.write_all(b"\n")?;
            file.sync_all()?;
            drop(file);
            std::fs::rename(&temporary, path)
        };
        write().map_err(CoreError::io("write the state file", path))
    }

    /// Record that `version` is installed and make it current.
    ///
    /// The version that was current becomes the rollback target. Installing the
    /// current version again changes nothing but its executable name.
    pub fn mark_installed(&mut self, version: &str, exe: &str) {
        if self.current.as_deref() != Some(version) {
            self.previous = self.current.take();
            self.current = Some(version.to_owned());
        }
        if self.previous.as_deref() == Some(version) {
            self.previous = None;
        }
        // A version that is installed a second time keeps its proof of a good
        // run: the manifest named it again, it did not become a new build.
        let last_good_run = self
            .versions
            .get(version)
            .and_then(|record| record.last_good_run);
        self.versions.insert(
            version.to_owned(),
            VersionRecord {
                exe: exe.to_owned(),
                last_good_run,
            },
        );
    }

    /// Record a successful run of `version` at `now` (seconds since 1970).
    pub fn record_good_run(&mut self, version: &str, now: u64) {
        if let Some(record) = self.versions.get_mut(version) {
            record.last_good_run = Some(now);
        }
    }

    /// Whether `version` has ever run successfully on this computer.
    pub fn has_good_run(&self, version: &str) -> bool {
        self.versions
            .get(version)
            .is_some_and(|record| record.last_good_run.is_some())
    }

    /// Whether `version` failed to start here before.
    pub fn is_bad(&self, version: &str) -> bool {
        self.bad.iter().any(|bad| bad == version)
    }

    /// Decide what follows a run of `version`.
    ///
    /// Only one case leads to a rollback: a version that has never run
    /// successfully exits with an error inside the start watch, and the
    /// previous version has a recorded good run. The last condition stops a
    /// cascade on a computer where no version can start at all (no OpenGL 4.1,
    /// for example): there the launcher stops and shows the log line instead.
    pub fn judge(&self, version: &str, run: RunResult) -> Verdict {
        if run.exit_ok || !run.within_watch || self.has_good_run(version) {
            return Verdict::Fine;
        }
        match self.previous.as_deref() {
            Some(previous) if previous != version && self.has_good_run(previous) => {
                Verdict::RollBack {
                    to: previous.to_owned(),
                }
            }
            _ => Verdict::StartFailed,
        }
    }

    /// Apply a [`Verdict::RollBack`]: mark `failed` bad, make `to` current
    /// again and leave a notice. The caller deletes the failed directory.
    pub fn roll_back(&mut self, failed: &str, to: &str, detail: Option<String>) {
        if !self.is_bad(failed) {
            self.bad.push(failed.to_owned());
        }
        self.versions.remove(failed);
        self.current = Some(to.to_owned());
        self.previous = None;
        self.push_notice(NoticeKind::RolledBack, failed, Some(to.to_owned()), detail);
    }

    /// Leave a notice that `failed` did not start and nothing was changed.
    pub fn note_start_failure(&mut self, failed: &str, detail: Option<String>) {
        self.push_notice(NoticeKind::StartFailed, failed, None, detail);
    }

    fn push_notice(
        &mut self,
        kind: NoticeKind,
        failed: &str,
        restored: Option<String>,
        detail: Option<String>,
    ) {
        // One notice per failed version: a second failed start replaces the
        // first notice instead of stacking a copy under it.
        self.notices
            .retain(|notice| !(notice.kind == kind && notice.failed == failed));
        let next = self
            .notices
            .iter()
            .filter_map(|notice| notice.id.strip_prefix("local-")?.parse::<u64>().ok())
            .max()
            .map_or(1, |highest| highest + 1);
        self.notices.push(LocalNotice {
            id: format!("local-{next}"),
            kind,
            failed: failed.to_owned(),
            restored,
            detail,
        });
    }

    /// Remove the notice with `id`. Unknown ids are ignored.
    pub fn dismiss_notice(&mut self, id: &str) {
        self.notices.retain(|notice| notice.id != id);
    }

    /// The versions whose directories must stay: current and previous.
    pub fn kept_versions(&self) -> Vec<&str> {
        self.current
            .as_deref()
            .into_iter()
            .chain(self.previous.as_deref())
            .collect()
    }

    /// Forget every version record except the kept ones.
    pub fn forget_removed_versions(&mut self) {
        let kept: Vec<String> = self
            .kept_versions()
            .into_iter()
            .map(str::to_owned)
            .collect();
        self.versions.retain(|version, _| kept.contains(version));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const EARLY_FAILURE: RunResult = RunResult {
        exit_ok: false,
        within_watch: true,
    };

    fn installed(versions: &[&str]) -> State {
        let mut state = State::default();
        for version in versions {
            state.mark_installed(version, "night_maze.exe");
        }
        state
    }

    #[test]
    fn installing_moves_current_to_previous() {
        let state = installed(&["0.9.0", "0.9.1"]);
        assert_eq!(state.current.as_deref(), Some("0.9.1"));
        assert_eq!(state.previous.as_deref(), Some("0.9.0"));
        assert_eq!(state.kept_versions(), vec!["0.9.1", "0.9.0"]);
    }

    #[test]
    fn installing_the_current_version_again_keeps_the_rollback_target() {
        let mut state = installed(&["0.9.0", "0.9.1"]);
        state.mark_installed("0.9.1", "night_maze.exe");
        assert_eq!(state.current.as_deref(), Some("0.9.1"));
        assert_eq!(state.previous.as_deref(), Some("0.9.0"));
    }

    #[test]
    fn going_back_to_the_previous_version_by_manifest_swaps_the_two() {
        let mut state = installed(&["0.9.0", "0.9.1"]);
        state.mark_installed("0.9.0", "night_maze.exe");
        assert_eq!(state.current.as_deref(), Some("0.9.0"));
        assert_eq!(state.previous.as_deref(), Some("0.9.1"));
    }

    #[test]
    fn a_new_version_that_fails_at_once_rolls_back_to_a_proven_previous_one() {
        let mut state = installed(&["0.9.1"]);
        state.record_good_run("0.9.1", 100);
        state.mark_installed("0.9.2", "night_maze.exe");

        assert_eq!(
            state.judge("0.9.2", EARLY_FAILURE),
            Verdict::RollBack {
                to: "0.9.1".to_owned()
            }
        );

        state.roll_back(
            "0.9.2",
            "0.9.1",
            Some("[error] Fatal: no window".to_owned()),
        );
        assert_eq!(state.current.as_deref(), Some("0.9.1"));
        assert_eq!(state.previous, None);
        assert!(state.is_bad("0.9.2"));
        assert!(!state.versions.contains_key("0.9.2"));
        assert_eq!(state.notices.len(), 1);
        assert_eq!(state.notices[0].kind, NoticeKind::RolledBack);
        assert_eq!(state.notices[0].restored.as_deref(), Some("0.9.1"));
    }

    #[test]
    fn no_rollback_when_the_previous_version_never_ran_successfully() {
        let state = installed(&["0.9.1", "0.9.2"]);
        assert_eq!(state.judge("0.9.2", EARLY_FAILURE), Verdict::StartFailed);
    }

    #[test]
    fn no_rollback_on_a_first_install() {
        let state = installed(&["0.9.0"]);
        assert_eq!(state.judge("0.9.0", EARLY_FAILURE), Verdict::StartFailed);
    }

    #[test]
    fn a_version_that_ran_before_is_never_marked_bad() {
        let mut state = installed(&["0.9.0", "0.9.1"]);
        state.record_good_run("0.9.0", 100);
        state.record_good_run("0.9.1", 200);
        assert_eq!(state.judge("0.9.1", EARLY_FAILURE), Verdict::Fine);
    }

    #[test]
    fn a_late_failure_or_a_clean_exit_changes_nothing() {
        let mut state = installed(&["0.9.0"]);
        state.record_good_run("0.9.0", 100);
        state.mark_installed("0.9.1", "night_maze.exe");

        let late = RunResult {
            exit_ok: false,
            within_watch: false,
        };
        let clean = RunResult {
            exit_ok: true,
            within_watch: true,
        };
        assert_eq!(state.judge("0.9.1", late), Verdict::Fine);
        assert_eq!(state.judge("0.9.1", clean), Verdict::Fine);
    }

    #[test]
    fn a_repeated_failure_replaces_its_notice_and_ids_stay_unique() {
        let mut state = installed(&["0.9.0"]);
        state.note_start_failure("0.9.0", None);
        state.note_start_failure("0.9.0", Some("[error] again".to_owned()));
        state.note_start_failure("0.9.1", None);

        assert_eq!(state.notices.len(), 2);
        assert_ne!(state.notices[0].id, state.notices[1].id);
        assert_eq!(state.notices[0].detail.as_deref(), Some("[error] again"));

        let id = state.notices[0].id.clone();
        state.dismiss_notice(&id);
        assert_eq!(state.notices.len(), 1);
    }

    #[test]
    fn the_file_round_trips_and_leaves_no_temporary_file() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("nested").join("state.json");
        let mut state = installed(&["0.9.0", "0.9.1"]);
        state.record_good_run("0.9.1", 1_790_000_000);
        state.check_on_start = false;

        state.save(&path).expect("the state is written");
        state
            .save(&path)
            .expect("writing over an existing file works");

        assert_eq!(State::load(&path).expect("the state is read"), state);
        let names: Vec<_> = std::fs::read_dir(path.parent().expect("a parent"))
            .expect("the folder is listed")
            .map(|entry| entry.expect("an entry").file_name())
            .collect();
        assert_eq!(names, vec![std::ffi::OsString::from("state.json")]);
    }

    #[test]
    fn a_missing_file_is_a_first_run_and_a_broken_one_is_set_aside() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("state.json");
        assert_eq!(State::load(&path).expect("a first run"), State::default());

        std::fs::write(&path, b"{ not json").expect("write a broken file");
        assert_eq!(
            State::load(&path).expect("a broken file is survivable"),
            State::default()
        );
        assert!(temp.path().join("state.json.broken").exists());
        assert!(!path.exists());
    }

    #[test]
    fn an_older_file_without_new_fields_still_loads() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let path = temp.path().join("state.json");
        std::fs::write(&path, br#"{"schema":1,"current":"0.9.0"}"#).expect("write the file");

        let state = State::load(&path).expect("the state is read");
        assert_eq!(state.current.as_deref(), Some("0.9.0"));
        assert!(state.check_on_start, "the default is to check on start");
    }
}
