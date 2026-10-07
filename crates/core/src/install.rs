//! Downloading one game build and putting it into `versions/<version>/`.
//!
//! The steps, in order:
//!
//! 1. Download the zip to `staging/<version>.zip.part`.
//! 2. Compare its length and its SHA-256 with the manifest. On a mismatch the
//!    file is deleted and nothing else happens.
//! 3. Unpack it into `staging/<version>/`.
//! 4. Rename that directory to `versions/<version>`. Both are on the same disk,
//!    so the rename is one step: the version directory exists completely or
//!    not at all.
//!
//! No file of an installed version is ever overwritten, so a copy of the game
//! that is still running does not block an update.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::archive;
use crate::error::{CoreError, Result};
use crate::layout::Layout;
use crate::manifest::GameBuild;
use crate::net;

/// How often the final rename is tried. Antivirus software can hold a freshly
/// written file for a moment.
const RENAME_ATTEMPTS: u32 = 6;

/// The pause between two rename attempts.
const RENAME_PAUSE: Duration = Duration::from_millis(250);

/// The step an install is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// Bytes are arriving.
    Downloading,
    /// The length and the checksum are compared with the manifest.
    Verifying,
    /// The archive is unpacked and moved into place.
    Installing,
}

/// One progress report of an install.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Progress {
    /// The version being installed.
    pub version: String,
    /// The current step.
    pub phase: Phase,
    /// Bytes received so far.
    #[cfg_attr(feature = "specta", specta(type = f64))]
    pub received: u64,
    /// Bytes the manifest announces.
    #[cfg_attr(feature = "specta", specta(type = f64))]
    pub total: u64,
}

/// Delete everything in `staging/`: the leftovers of an interrupted run.
pub fn clean_staging(layout: &Layout) {
    let staging = layout.staging_dir();
    let Ok(entries) = std::fs::read_dir(&staging) else {
        return;
    };
    for entry in entries.flatten() {
        remove_any(&entry.path());
    }
}

/// Download, verify and unpack `build` as `version`.
///
/// On every failure the staging files of this install are removed and the
/// installed versions are untouched.
///
/// # Errors
///
/// [`CoreError::InsecureUrl`], [`CoreError::Http`], [`CoreError::SizeMismatch`],
/// [`CoreError::HashMismatch`], [`CoreError::Archive`] or [`CoreError::Io`],
/// each for the step its name says.
pub async fn install_build(
    layout: &Layout,
    client: &reqwest::Client,
    version: &str,
    build: &GameBuild,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
) -> Result<()> {
    let staging = layout.staging_dir();
    let part = staging.join(format!("{version}.zip.part"));
    let unpacked = staging.join(version);

    let result = run_steps(
        layout,
        client,
        version,
        build,
        on_progress,
        &part,
        &unpacked,
    )
    .await;

    remove_any(&part);
    if result.is_err() {
        remove_any(&unpacked);
    }
    result
}

async fn run_steps(
    layout: &Layout,
    client: &reqwest::Client,
    version: &str,
    build: &GameBuild,
    on_progress: &(dyn Fn(Progress) + Send + Sync),
    part: &Path,
    unpacked: &Path,
) -> Result<()> {
    let report = |phase: Phase, received: u64| {
        on_progress(Progress {
            version: version.to_owned(),
            phase,
            received,
            total: build.size,
        });
    };

    let url = net::checked_url(&build.url)?;
    let staging = layout.staging_dir();
    std::fs::create_dir_all(&staging)
        .map_err(CoreError::io("create the staging folder", &staging))?;
    remove_any(part);
    remove_any(unpacked);

    report(Phase::Downloading, 0);
    let downloaded = net::download(client, &url, part, build.size, &|received| {
        report(Phase::Downloading, received);
    })
    .await?;

    report(Phase::Verifying, downloaded.bytes);
    if downloaded.bytes != build.size {
        return Err(CoreError::SizeMismatch {
            expected: build.size,
            actual: downloaded.bytes,
        });
    }
    if !downloaded.sha256.eq_ignore_ascii_case(&build.sha256) {
        return Err(CoreError::HashMismatch {
            expected: build.sha256.to_ascii_lowercase(),
            actual: downloaded.sha256,
        });
    }

    report(Phase::Installing, downloaded.bytes);
    let target = layout.version_dir(version);
    let exe = build.exe.clone();
    let (part, unpacked) = (part.to_path_buf(), unpacked.to_path_buf());
    tokio::task::spawn_blocking(move || unpack_and_place(&part, &unpacked, &target, &exe))
        .await
        .map_err(|error| CoreError::Archive(format!("unpacking stopped: {error}")))?
}

/// Unpack `part` into `unpacked` and rename it to `target`.
fn unpack_and_place(part: &Path, unpacked: &Path, target: &Path, exe: &str) -> Result<()> {
    archive::extract(part, unpacked)?;

    let executable = unpacked.join(exe);
    if !executable.is_file() {
        return Err(CoreError::Archive(format!("it does not contain {exe}")));
    }
    archive::make_executable(&executable)?;

    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(CoreError::io("create the versions folder", parent))?;
    }
    // A directory of the same version is in the way only when that version is
    // installed again. It is moved into staging first, so the place is free
    // for the rename even if deleting it takes a while.
    if target.exists() {
        let aside = sibling(unpacked, ".replaced");
        remove_any(&aside);
        std::fs::rename(target, &aside).map_err(CoreError::io(
            "move the old copy of this version away",
            target,
        ))?;
        remove_any(&aside);
    }

    rename_with_retries(unpacked, target)
}

fn rename_with_retries(from: &Path, to: &Path) -> Result<()> {
    let mut attempt = 1;
    loop {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(error) if attempt >= RENAME_ATTEMPTS => {
                return Err(CoreError::io("move the new version into place", to)(error));
            }
            Err(_) => {
                attempt += 1;
                std::thread::sleep(RENAME_PAUSE);
            }
        }
    }
}

/// `path` with `suffix` appended to its last component.
fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

/// Delete every directory in `versions/` whose name is not in `keep`.
///
/// Best effort: a version that cannot be deleted now (a copy of it is still
/// running on Windows) is tried again after the next run.
pub fn remove_old_versions(layout: &Layout, keep: &[&str]) {
    let Ok(entries) = std::fs::read_dir(layout.versions_dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if !keep.iter().any(|kept| name == std::ffi::OsStr::new(kept)) {
            remove_any(&entry.path());
        }
    }
}

/// Delete a file or a directory tree, ignoring every failure.
pub(crate) fn remove_any(path: &Path) {
    match std::fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => {
            let _ = std::fs::remove_dir_all(path);
        }
        Ok(_) => {
            let _ = std::fs::remove_file(path);
        }
        Err(_) => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_versions_go_and_the_kept_ones_stay() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let layout = Layout::new(temp.path());
        for version in ["0.8.0", "0.9.0", "0.9.1"] {
            let directory = layout.version_dir(version);
            std::fs::create_dir_all(directory.join("assets")).expect("create a version");
            std::fs::write(directory.join("night_maze.exe"), b"MZ").expect("write the exe");
        }

        remove_old_versions(&layout, &["0.9.1", "0.9.0"]);

        assert!(!layout.version_dir("0.8.0").exists());
        assert!(layout.version_dir("0.9.0").join("night_maze.exe").exists());
        assert!(layout.version_dir("0.9.1").join("night_maze.exe").exists());
    }

    #[test]
    fn staging_is_emptied_but_kept() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let layout = Layout::new(temp.path());
        let staging = layout.staging_dir();
        std::fs::create_dir_all(staging.join("0.9.1").join("assets")).expect("a leftover folder");
        std::fs::write(staging.join("0.9.1.zip.part"), b"half").expect("a leftover download");

        clean_staging(&layout);

        assert!(staging.exists());
        assert_eq!(
            std::fs::read_dir(&staging)
                .expect("staging is listed")
                .count(),
            0
        );
    }

    #[test]
    fn a_repeated_install_of_one_version_replaces_its_directory() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let part = temp.path().join("staging").join("0.9.0.zip.part");
        let unpacked = temp.path().join("staging").join("0.9.0");
        let target = temp.path().join("versions").join("0.9.0");
        std::fs::create_dir_all(&target).expect("the old copy");
        std::fs::write(target.join("old.txt"), b"old").expect("an old file");
        std::fs::create_dir_all(part.parent().expect("staging")).expect("staging");
        crate::archive::tests::write_zip(&part, &[("night_maze.exe", b"MZ")]);

        unpack_and_place(&part, &unpacked, &target, "night_maze.exe").expect("the install works");

        assert!(target.join("night_maze.exe").exists());
        assert!(
            !target.join("old.txt").exists(),
            "no file of the old copy survives"
        );
        assert!(!unpacked.exists());
    }

    #[test]
    fn an_archive_without_the_named_executable_is_refused() {
        let temp = tempfile::tempdir().expect("a temporary directory");
        let part = temp.path().join("0.9.0.zip.part");
        let target = temp.path().join("versions").join("0.9.0");
        crate::archive::tests::write_zip(&part, &[("readme.txt", b"hello")]);

        let result = unpack_and_place(&part, &temp.path().join("0.9.0"), &target, "night_maze.exe");

        assert!(matches!(result, Err(CoreError::Archive(_))));
        assert!(!target.exists());
    }
}
