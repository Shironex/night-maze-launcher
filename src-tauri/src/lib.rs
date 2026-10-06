//! The window around the launcher rules.
//!
//! This crate decides nothing. It opens the window, turns the methods of
//! [`night_maze_launcher_core::Launcher`] into commands, and forwards progress
//! and changes to the page as events. The page makes no network request.

mod bindings;
pub mod commands;
mod log;

use std::sync::Arc;

use night_maze_launcher_core::{Config, Launcher, Version};
use tauri::Manager;

/// What the commands share.
pub struct AppState {
    /// The launcher, or the reason it could not be opened.
    launcher: Result<Arc<Launcher>, String>,
}

impl AppState {
    pub(crate) fn launcher(&self) -> Result<&Arc<Launcher>, String> {
        self.launcher.as_ref().map_err(Clone::clone)
    }
}

/// The version of this launcher, from the package version.
fn launcher_version() -> Version {
    Version::parse(env!("CARGO_PKG_VERSION")).unwrap_or(Version {
        major: 0,
        minor: 0,
        patch: 0,
    })
}

fn open_launcher() -> Result<Arc<Launcher>, String> {
    let config = Config::from_environment(launcher_version())
        .ok_or_else(|| "The per-user application folder could not be found".to_owned())?;
    let launcher = Launcher::open(config).map_err(|error| error.to_string())?;
    log::write(
        launcher.layout(),
        &format!("launcher {} started", launcher_version()),
    );
    Ok(launcher)
}

/// Build and run the application.
///
/// # Panics
///
/// When the window system cannot be started at all. There is nothing to show
/// an error in at that point.
pub fn run() {
    let specta = bindings::builder();

    tauri::Builder::default()
        // First, so a second start hands over before anything else is set up.
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _directory| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            },
        ))
        .manage(AppState {
            launcher: open_launcher(),
        })
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            specta.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("the window system starts");
}
