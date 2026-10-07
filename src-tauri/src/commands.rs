//! The commands the page may call, and the events it listens to.
//!
//! Every command is `async`: a synchronous Tauri command runs on the main
//! thread and would freeze the window while it waits for the disk or the
//! network. Each one answers with the next [`Snapshot`], so the page never has
//! to guess what changed.

use std::sync::Arc;

use night_maze_launcher_core::{Progress, Snapshot};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, State};
use tauri_specta::Event;

use crate::updater::SelfUpdate;
use crate::{AppState, log};

/// Sent while a version is being downloaded and installed.
#[derive(Debug, Clone, Serialize, Type, Event)]
pub struct InstallProgress(pub Progress);

/// Sent when the launcher changed without a command asking for it: the game
/// exited, or a failed start made the launcher go back one version.
#[derive(Debug, Clone, Serialize, Type, Event)]
pub struct SnapshotChanged(pub Snapshot);

/// A folder the page may ask to see in the file manager.
#[derive(Debug, Clone, Copy, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Folder {
    /// The install root.
    Install,
    /// The folder with the game log.
    Logs,
}

/// Refuse to start something the launcher's own update would cut off: its
/// installer ends this process as soon as the download is checked.
fn refuse_during_self_update(own: &SelfUpdate) -> Result<(), String> {
    if own.is_installing() {
        return Err("The launcher is updating itself and restarts when that is done".to_owned());
    }
    Ok(())
}

/// What the window should show now. Reads local state only.
#[tauri::command]
#[specta::specta]
pub async fn snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    Ok(state.launcher()?.snapshot())
}

/// Ask the release feed for the newest version.
#[tauri::command]
#[specta::specta]
pub async fn check_for_updates(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let launcher = state.launcher()?;
    let snapshot = launcher.check().await;
    log::write(
        launcher.layout(),
        &format!("update check: {:?}", snapshot.remote),
    );
    Ok(snapshot)
}

/// Download and install the version the last check found.
#[tauri::command]
#[specta::specta]
pub async fn install_update(
    app: AppHandle,
    state: State<'_, AppState>,
    own: State<'_, SelfUpdate>,
) -> Result<Snapshot, String> {
    refuse_during_self_update(&own)?;
    let launcher = state.launcher()?;
    let report = |progress: Progress| {
        let _ = InstallProgress(progress).emit(&app);
    };

    match launcher.install(&report).await {
        Ok(snapshot) => {
            log::write(
                launcher.layout(),
                &format!("installed {:?}", snapshot.current),
            );
            Ok(snapshot)
        }
        Err(error) => {
            log::write(launcher.layout(), &format!("install failed: {error}"));
            Err(error.to_string())
        }
    }
}

/// Start the installed version. Answers as soon as the game process exists.
#[tauri::command]
#[specta::specta]
pub async fn launch_game(
    app: AppHandle,
    state: State<'_, AppState>,
    own: State<'_, SelfUpdate>,
) -> Result<Snapshot, String> {
    refuse_during_self_update(&own)?;
    let launcher = Arc::clone(state.launcher()?);
    let watcher = Arc::clone(&launcher);
    let listener = Arc::new(move |snapshot: Snapshot| {
        log::write(
            watcher.layout(),
            &format!(
                "game state: {:?}, current {:?}, notices {}",
                snapshot.activity,
                snapshot.current,
                snapshot.notices.len()
            ),
        );
        let _ = SnapshotChanged(snapshot).emit(&app);
    });

    match launcher.launch(listener) {
        Ok(snapshot) => {
            log::write(
                launcher.layout(),
                &format!("game started: {:?}", snapshot.activity),
            );
            Ok(snapshot)
        }
        Err(error) => {
            log::write(launcher.layout(), &format!("game start failed: {error}"));
            Err(error.to_string())
        }
    }
}

/// Turn the update check on start on or off.
#[tauri::command]
#[specta::specta]
pub async fn set_check_on_start(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<Snapshot, String> {
    state
        .launcher()?
        .set_check_on_start(enabled)
        .map_err(|error| error.to_string())
}

/// Remove one of the launcher's own notices.
#[tauri::command]
#[specta::specta]
pub async fn dismiss_notice(id: String, state: State<'_, AppState>) -> Result<Snapshot, String> {
    state
        .launcher()?
        .dismiss_notice(&id)
        .map_err(|error| error.to_string())
}

/// Show a launcher folder in the file manager of the system.
///
/// The page names one of two folders and never passes a path, so this cannot
/// be used to open anything else.
#[tauri::command]
#[specta::specta]
pub async fn open_folder(folder: Folder, state: State<'_, AppState>) -> Result<(), String> {
    let layout = state.launcher()?.layout();
    let path = match folder {
        Folder::Install => layout.root().to_path_buf(),
        Folder::Logs => layout.logs_dir(),
    };
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;

    let program = if cfg!(windows) {
        "explorer.exe"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the folder: {error}"))
}
