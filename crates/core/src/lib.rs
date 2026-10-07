//! The rules of the Night Maze launcher.
//!
//! This crate knows how to read a release manifest, check its signature,
//! download and verify a game build, unpack it next to the versions already installed, start it and go
//! back to the previous version when a new one does not start. It has no
//! window code: the Tauri shell calls [`Launcher`] and shows its [`Snapshot`].
//!
//! All network access of the launcher is in [`net`].

pub mod archive;
pub mod error;
pub mod install;
pub mod launch;
pub mod launcher;
pub mod layout;
pub mod manifest;
pub mod net;
pub mod signature;
pub mod state;
pub mod version;

pub use error::{CoreError, Result};
pub use install::{Phase, Progress};
pub use launcher::{Activity, ChangeListener, Config, Launcher, Remote, START_WATCH, Snapshot};
pub use layout::Layout;
pub use manifest::{Manifest, NewsFeed};
pub use state::{LocalNotice, NoticeKind, State};
pub use version::Version;
