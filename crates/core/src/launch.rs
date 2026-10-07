//! Starting the game.
//!
//! The game runs with `data/` as its working directory, so the files it writes
//! there (the panel layout, later saves) survive an update. Its assets are
//! found next to its executable and do not depend on the working directory.
//!
//! Its console output goes straight into `data/logs/last-run.log` through a
//! file handle, not through a pipe the launcher would have to keep reading.
//! On Windows the game is a console program, so it is started without a
//! console window.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::error::{CoreError, Result};
use crate::layout::Layout;

/// The longest log line that is copied into a notice.
const MAX_DETAIL_CHARS: usize = 240;

/// Start `exe` of `version`.
///
/// # Errors
///
/// [`CoreError::Io`] when the log cannot be created, [`CoreError::Launch`] when
/// the executable is missing or the system refuses to start it.
pub fn spawn(layout: &Layout, version: &str, exe: &str) -> Result<tokio::process::Child> {
    let executable = layout.version_dir(version).join(exe);
    if !executable.is_file() {
        return Err(CoreError::Launch {
            version: version.to_owned(),
            message: "its files are missing".to_owned(),
        });
    }

    let data = layout.data_dir();
    let logs = layout.logs_dir();
    std::fs::create_dir_all(&logs).map_err(CoreError::io("create the log folder", &logs))?;
    let log_path = layout.last_run_log();
    let log = std::fs::File::create(&log_path)
        .map_err(CoreError::io("create the game log", &log_path))?;
    let log_for_errors = log
        .try_clone()
        .map_err(CoreError::io("create the game log", &log_path))?;

    let mut command = tokio::process::Command::new(&executable);
    command
        .current_dir(&data)
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_for_errors));
    hide_console(&mut command);

    command.spawn().map_err(|error| CoreError::Launch {
        version: version.to_owned(),
        message: error.to_string(),
    })
}

/// `CREATE_NO_WINDOW`: the child gets no console window of its own.
#[cfg(windows)]
fn hide_console(command: &mut tokio::process::Command) {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console(_command: &mut tokio::process::Command) {}

/// The line of the game log that best says why a start failed: the last line
/// holding `[error]`, otherwise the last line with any text.
pub fn last_error_line(log: &Path) -> Option<String> {
    let bytes = std::fs::read(log).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let lines = || text.lines().map(str::trim).filter(|line| !line.is_empty());
    let line = lines()
        .rfind(|line| line.contains("[error]"))
        .or_else(|| lines().next_back())?;
    Some(line.chars().take(MAX_DETAIL_CHARS).collect())
}

/// Keep the log of a failed start as `failed-<version>.log`, because the next
/// start overwrites `last-run.log`.
pub fn keep_failed_log(layout: &Layout, version: &str) -> Option<PathBuf> {
    let kept = layout.logs_dir().join(format!("failed-{version}.log"));
    std::fs::copy(layout.last_run_log(), &kept)
        .ok()
        .map(|_| kept)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_last_error_line_wins_over_later_plain_lines() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let log = temp.path().join("last-run.log");
        std::fs::write(
            &log,
            "[info] Window 1280x720\n[error] Shader failed\n[error] Fatal: no OpenGL 4.1\n[info] bye\n\n",
        )
        .expect("write the log");

        assert_eq!(
            last_error_line(&log).as_deref(),
            Some("[error] Fatal: no OpenGL 4.1")
        );
    }

    #[test]
    fn without_an_error_line_the_last_line_is_used() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let log = temp.path().join("last-run.log");
        std::fs::write(&log, "starting\nstopped without a reason\n").expect("write the log");
        assert_eq!(
            last_error_line(&log).as_deref(),
            Some("stopped without a reason")
        );

        std::fs::write(&log, "").expect("empty the log");
        assert_eq!(last_error_line(&log), None);
        assert_eq!(last_error_line(&temp.path().join("missing.log")), None);
    }

    #[test]
    fn a_missing_executable_is_a_launch_error_not_a_panic() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let layout = Layout::new(temp.path());
        let result = spawn(&layout, "0.9.0", "night_maze.exe");
        assert!(matches!(result, Err(CoreError::Launch { .. })));
    }
}
