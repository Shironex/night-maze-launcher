//! Everything that can go wrong in the launcher, as one type.

use std::path::PathBuf;

/// The result type of this crate.
pub type Result<T> = std::result::Result<T, CoreError>;

/// A failure of one launcher step. The text of each variant is shown to the
/// player as it is, so it is written as a full sentence without jargon.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    /// A file or directory operation failed.
    #[error("Could not {operation} ({path}): {source}")]
    Io {
        /// What was being done, as a verb phrase ("write the state file").
        operation: &'static str,
        /// The path it was done to.
        path: PathBuf,
        /// The error of the operating system.
        #[source]
        source: std::io::Error,
    },

    /// A request failed, timed out or was answered with an error status.
    #[error("Could not {operation}: {message}")]
    Http {
        /// What was being fetched ("read the manifest").
        operation: &'static str,
        /// Why it failed.
        message: String,
    },

    /// A URL that is not https (plain http is accepted for loopback only).
    #[error("Refused a URL that is not https: {0}")]
    InsecureUrl(String),

    /// The manifest or the notes feed is not what this launcher understands.
    #[error("The update information is not valid: {0}")]
    BadManifest(String),

    /// The manifest or the notes feed has no signature by a trusted key, or
    /// the signature is over other bytes than the ones that arrived.
    #[error("The update information is not signed with a Night Maze key, so it was ignored")]
    BadSignature,

    /// The manifest has no build for this operating system.
    #[error("This release has no build for {0}")]
    NoBuildForPlatform(String),

    /// The manifest asks for a newer launcher than this one.
    #[error("This launcher is too old for the newest game version (needs launcher {required})")]
    LauncherTooOld {
        /// The lowest launcher version the manifest accepts.
        required: String,
    },

    /// The download has a different length than the manifest says.
    #[error("The download is {actual} bytes, the release says {expected}")]
    SizeMismatch {
        /// Bytes the manifest names.
        expected: u64,
        /// Bytes that arrived.
        actual: u64,
    },

    /// The download has a different SHA-256 than the manifest says.
    #[error("The download does not match its checksum, so it was not installed")]
    HashMismatch {
        /// The digest the manifest names.
        expected: String,
        /// The digest of the bytes that arrived.
        actual: String,
    },

    /// The zip file is damaged or contains an entry that must not be unpacked.
    #[error("The downloaded archive was refused: {0}")]
    Archive(String),

    /// An install or a game start is already in progress.
    #[error("The launcher is busy with another step")]
    Busy,

    /// There is no installed version to start.
    #[error("Night Maze is not installed yet")]
    NotInstalled,

    /// The game executable could not be started.
    #[error("Could not start version {version}: {message}")]
    Launch {
        /// The version that was started.
        version: String,
        /// Why the start failed.
        message: String,
    },
}

impl CoreError {
    /// Shorthand for the `Io` variant.
    pub(crate) fn io(
        operation: &'static str,
        path: &std::path::Path,
    ) -> impl FnOnce(std::io::Error) -> Self {
        let path = path.to_path_buf();
        move |source| Self::Io {
            operation,
            path,
            source,
        }
    }
}
