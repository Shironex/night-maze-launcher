//! The launcher as one object: check, install, launch, roll back.
//!
//! The window never decides anything. It shows a [`Snapshot`] and calls one of
//! four methods; each of them answers with the next snapshot.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::error::{CoreError, Result};
use crate::install::{self, Progress};
use crate::launch;
use crate::layout::Layout;
use crate::manifest::{Manifest, NewsFeed};
use crate::net;
use crate::signature;
use crate::state::{LocalNotice, RunResult, State, Verdict};
use crate::version::Version;

/// How long a new version has to survive to count as started.
pub const START_WATCH: Duration = Duration::from_secs(15);

/// How long to wait before a file and its signature are fetched a second time.
const SIGNATURE_RETRY_PAUSE: Duration = Duration::from_secs(1);

/// What a [`Launcher`] is built from. Tests change the paths, the URL, the
/// keys and the start watch; the shell uses [`Config::from_environment`].
#[derive(Debug, Clone)]
pub struct Config {
    /// Where everything is installed.
    pub layout: Layout,
    /// The URL of `manifest.json`.
    pub manifest_url: String,
    /// The version of this launcher, compared with `launcher.min`.
    pub launcher_version: Version,
    /// The key of this system in the manifest.
    pub platform: String,
    /// See [`START_WATCH`].
    pub start_watch: Duration,
    /// The public keys whose signature on a manifest or a notes feed is
    /// accepted, each as the content of a `.pub` file of the Tauri CLI.
    pub trusted_keys: Vec<String>,
}

impl Config {
    /// The configuration of a normal start: per-user folder and the release
    /// feed, unless the two environment overrides are set. The trusted keys
    /// are [`signature::RELEASE_KEYS`], and in a development build also the
    /// development key. No environment variable changes them.
    pub fn from_environment(launcher_version: Version) -> Option<Self> {
        Some(Self {
            layout: Layout::from_environment()?,
            manifest_url: net::manifest_url_from_environment(),
            launcher_version,
            platform: crate::layout::platform_key().to_owned(),
            start_watch: START_WATCH,
            trusted_keys: signature::trusted_keys(),
        })
    }
}

/// What the last update check found.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Remote {
    /// No check has finished yet.
    Unknown,
    /// The check failed. The installed version still starts.
    Offline {
        /// Why, in one sentence.
        reason: String,
    },
    /// The installed version is the one the manifest names.
    UpToDate,
    /// Another version is waiting to be installed.
    UpdateAvailable {
        /// The version the manifest names.
        version: String,
        /// The size of its download in bytes.
        #[cfg_attr(feature = "specta", specta(type = f64))]
        size: u64,
    },
    /// The release needs a newer launcher than this one.
    LauncherTooOld {
        /// The lowest launcher version the manifest accepts.
        required: String,
    },
}

/// What the launcher is doing right now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Activity {
    /// Nothing.
    Idle,
    /// A version is being downloaded or unpacked.
    Installing {
        /// The version being installed.
        version: String,
    },
    /// The game is running.
    Running {
        /// The version that is running.
        version: String,
        /// The process id of the game, 0 when the system did not report one.
        pid: u32,
    },
}

/// Everything the window shows, at one moment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
pub struct Snapshot {
    /// The version of this launcher.
    pub launcher_version: String,
    /// The install root.
    pub install_root: String,
    /// The folder with the game log.
    pub logs_dir: String,
    /// The game log itself.
    pub log_file: String,
    /// The installed version Launch starts, if any.
    pub current: Option<String>,
    /// The version kept for rollback, if any.
    pub previous: Option<String>,
    /// Whether the launcher checks for updates when it opens.
    pub check_on_start: bool,
    /// The result of the last update check.
    pub remote: Remote,
    /// What the launcher is doing.
    pub activity: Activity,
    /// One line about the newest release, from the manifest.
    pub notes: Option<String>,
    /// The notes feed: fresh, or the copy kept from the last successful read.
    pub feed: Option<NewsFeed>,
    /// Notices the launcher wrote itself.
    pub notices: Vec<LocalNotice>,
}

/// Called with a fresh snapshot whenever something changes without a command
/// asking for it: the game was started again after a rollback, or it exited.
pub type ChangeListener = Arc<dyn Fn(Snapshot) + Send + Sync>;

/// The launcher. Cheap to share: every method takes `&self` or an `Arc`.
pub struct Launcher {
    config: Config,
    client: reqwest::Client,
    inner: Mutex<Inner>,
    busy: Arc<AtomicBool>,
}

struct Inner {
    state: State,
    /// The last check: the manifest, or why there is none.
    last_check: Option<std::result::Result<Manifest, String>>,
    feed: Option<NewsFeed>,
    activity: Activity,
}

/// Held while an install or a run is in progress. Dropping it frees the
/// launcher for the next one, on every path out.
struct Lease(Arc<AtomicBool>);

impl Drop for Lease {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl Launcher {
    /// Open the launcher: read the state, clear `staging/` and drop versions
    /// whose directories are gone.
    ///
    /// # Errors
    ///
    /// [`CoreError::Io`] when the state file cannot be read, or
    /// [`CoreError::Http`] when the network client cannot be set up.
    pub fn open(config: Config) -> Result<Arc<Self>> {
        let client = net::client(&config.launcher_version.to_string())?;
        let mut state = State::load(&config.layout.state_file())?;
        install::clean_staging(&config.layout);

        if reconcile(&config.layout, &mut state) {
            state.save(&config.layout.state_file())?;
        }

        let feed = std::fs::read_to_string(config.layout.cached_feed())
            .ok()
            .and_then(|text| NewsFeed::parse(&text).ok());

        Ok(Arc::new(Self {
            config,
            client,
            inner: Mutex::new(Inner {
                state,
                last_check: None,
                feed,
                activity: Activity::Idle,
            }),
            busy: Arc::new(AtomicBool::new(false)),
        }))
    }

    /// The directory layout this launcher uses.
    pub fn layout(&self) -> &Layout {
        &self.config.layout
    }

    /// What the window should show now.
    pub fn snapshot(&self) -> Snapshot {
        let inner = self.lock();
        let layout = &self.config.layout;
        Snapshot {
            launcher_version: self.config.launcher_version.to_string(),
            install_root: layout.root().display().to_string(),
            logs_dir: layout.logs_dir().display().to_string(),
            log_file: layout.last_run_log().display().to_string(),
            current: inner.state.current.clone(),
            previous: inner.state.previous.clone(),
            check_on_start: inner.state.check_on_start,
            remote: self.remote(&inner),
            activity: inner.activity.clone(),
            notes: match &inner.last_check {
                Some(Ok(manifest)) => manifest.notes.clone(),
                _ => None,
            },
            feed: inner.feed.clone(),
            notices: inner.state.notices.clone(),
        }
    }

    /// Ask the release feed which version is the newest.
    ///
    /// Never fails: a check that does not work becomes [`Remote::Offline`] and
    /// the installed version still starts.
    pub async fn check(&self) -> Snapshot {
        let checked = self.fetch_manifest().await;

        let feed = match &checked {
            Ok((manifest, manifest_url)) => self.fetch_feed(manifest, manifest_url).await,
            Err(_) => None,
        };

        {
            let mut inner = self.lock();
            inner.last_check = Some(match checked {
                Ok((manifest, _)) => Ok(manifest),
                Err(error) => Err(error.to_string()),
            });
            if let Some(feed) = feed {
                inner.feed = Some(feed);
            }
        }
        self.snapshot()
    }

    async fn fetch_manifest(&self) -> Result<(Manifest, url::Url)> {
        let url = net::checked_url(&self.config.manifest_url)?;
        let bytes = self.fetch_signed(&url, "check for updates").await?;
        Ok((Manifest::parse(text_of(&bytes)?)?, url))
    }

    /// Fetch the file at `url` and its signature, and hand out the bytes only
    /// when a trusted key signed exactly them.
    ///
    /// A failed check is tried once more after a short pause. The file and
    /// its `.sig` are two separate downloads, so while a release is being
    /// published the launcher can get the new file with the old signature.
    /// Only a failed check is retried: a request that fails or times out has
    /// already used its time.
    async fn fetch_signed(&self, url: &url::Url, operation: &'static str) -> Result<Vec<u8>> {
        match self.fetch_signed_once(url, operation).await {
            Err(CoreError::BadSignature) => {
                tokio::time::sleep(SIGNATURE_RETRY_PAUSE).await;
                self.fetch_signed_once(url, operation).await
            }
            other => other,
        }
    }

    async fn fetch_signed_once(&self, url: &url::Url, operation: &'static str) -> Result<Vec<u8>> {
        let bytes = net::fetch_bytes(&self.client, url, operation).await?;
        let sig = net::fetch_bytes(
            &self.client,
            &net::signature_url(url),
            "verify the update information",
        )
        .await?;
        let sig_text = std::str::from_utf8(&sig).map_err(|_| CoreError::BadSignature)?;
        signature::verify(&bytes, sig_text, &self.config.trusted_keys)?;
        Ok(bytes)
    }

    /// Read `news.json` and keep a copy for offline starts. The launcher works
    /// without it, so every failure is simply "no fresh notes". That includes
    /// a feed without a valid signature: its text is shown in the window, so
    /// it is neither shown nor written to the cache.
    async fn fetch_feed(&self, manifest: &Manifest, manifest_url: &url::Url) -> Option<NewsFeed> {
        let url = net::feed_url(manifest_url, manifest.feed.as_deref())?;
        let bytes = self
            .fetch_signed(&url, "read the release notes")
            .await
            .ok()?;
        let feed = NewsFeed::parse(text_of(&bytes).ok()?).ok()?;

        let cache = self.config.layout.cached_feed();
        if let Some(parent) = cache.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&cache, bytes);
        Some(feed)
    }

    /// Install the version the last check found.
    ///
    /// # Errors
    ///
    /// [`CoreError::Busy`] while another install or the game is running,
    /// [`CoreError::LauncherTooOld`] when the release refuses this launcher,
    /// [`CoreError::NotInstalled`] when there is nothing new to install, and
    /// the errors of [`install::install_build`]. After any of them the
    /// installed versions are as they were.
    pub async fn install(
        &self,
        on_progress: &(dyn Fn(Progress) + Send + Sync),
    ) -> Result<Snapshot> {
        let _lease = self.lease()?;

        let (version, build) = {
            let inner = self.lock();
            let Some(Ok(manifest)) = &inner.last_check else {
                return Err(CoreError::NotInstalled);
            };
            match self.remote(&inner) {
                Remote::UpdateAvailable { version, .. } => {
                    (version, manifest.build_for(&self.config.platform)?.clone())
                }
                Remote::LauncherTooOld { required } => {
                    return Err(CoreError::LauncherTooOld { required });
                }
                _ => return Err(CoreError::NotInstalled),
            }
        };

        self.lock().activity = Activity::Installing {
            version: version.clone(),
        };
        let installed = install::install_build(
            &self.config.layout,
            &self.client,
            &version,
            &build,
            on_progress,
        )
        .await;

        let mut inner = self.lock();
        inner.activity = Activity::Idle;
        installed?;

        inner.state.mark_installed(&version, &build.exe);
        inner.state.save(&self.config.layout.state_file())?;
        install::remove_old_versions(&self.config.layout, &inner.state.kept_versions());
        inner.state.forget_removed_versions();
        inner.state.save(&self.config.layout.state_file())?;
        drop(inner);

        Ok(self.snapshot())
    }

    /// Start the current version and watch it in the background.
    ///
    /// Returns as soon as the game process exists. `on_change` is called when
    /// the game exits, and also when a failed start made the launcher go back
    /// to the previous version and start that one.
    ///
    /// # Errors
    ///
    /// [`CoreError::Busy`] while an install or the game is running,
    /// [`CoreError::NotInstalled`] when no version is installed, and
    /// [`CoreError::Launch`] when the process cannot be started.
    pub fn launch(self: &Arc<Self>, on_change: ChangeListener) -> Result<Snapshot> {
        let lease = self.lease()?;
        let (version, child) = self.start_current()?;

        let launcher = Arc::clone(self);
        tokio::spawn(async move {
            launcher.supervise(version, child, &on_change).await;
            drop(lease);
            on_change(launcher.snapshot());
        });

        Ok(self.snapshot())
    }

    /// Spawn the current version and record it as running.
    fn start_current(&self) -> Result<(String, tokio::process::Child)> {
        let mut inner = self.lock();
        let version = inner.state.current.clone().ok_or(CoreError::NotInstalled)?;
        let exe = inner
            .state
            .versions
            .get(&version)
            .map(|record| record.exe.clone())
            .ok_or(CoreError::NotInstalled)?;
        let child = launch::spawn(&self.config.layout, &version, &exe)?;
        inner.activity = Activity::Running {
            version: version.clone(),
            pid: child.id().unwrap_or_default(),
        };
        Ok((version, child))
    }

    /// Wait for the game, apply the rollback rule, and start the previous
    /// version when the rule says so.
    async fn supervise(
        &self,
        mut version: String,
        mut child: tokio::process::Child,
        on_change: &ChangeListener,
    ) {
        loop {
            let run = self.watch(&version, &mut child).await;
            let verdict = self.lock().state.judge(&version, run);

            match verdict {
                Verdict::Fine => break,
                Verdict::StartFailed => {
                    let detail = self.failure_detail(&version);
                    self.update_state(|state| state.note_start_failure(&version, detail));
                    break;
                }
                Verdict::RollBack { to } => {
                    let detail = self.failure_detail(&version);
                    self.update_state(|state| state.roll_back(&version, &to, detail));
                    install::remove_any(&self.config.layout.version_dir(&version));

                    // The restored version has a recorded good run, so it can
                    // never be rolled back itself: this loop runs twice at most.
                    match self.start_current() {
                        Ok((restored, restarted)) => {
                            version = restored;
                            child = restarted;
                            on_change(self.snapshot());
                        }
                        Err(_) => break,
                    }
                }
            }
        }

        let mut inner = self.lock();
        inner.activity = Activity::Idle;
        install::remove_old_versions(&self.config.layout, &inner.state.kept_versions());
        inner.state.forget_removed_versions();
        let _ = inner.state.save(&self.config.layout.state_file());
    }

    /// Wait for one run to end. A game that is still alive when the start
    /// watch runs out has started successfully, whatever happens later.
    async fn watch(&self, version: &str, child: &mut tokio::process::Child) -> RunResult {
        match tokio::time::timeout(self.config.start_watch, child.wait()).await {
            Ok(status) => {
                let exit_ok = status.is_ok_and(|status| status.success());
                if exit_ok {
                    self.update_state(|state| state.record_good_run(version, unix_now()));
                }
                RunResult {
                    exit_ok,
                    within_watch: true,
                }
            }
            Err(_) => {
                self.update_state(|state| state.record_good_run(version, unix_now()));
                let exit_ok = child.wait().await.is_ok_and(|status| status.success());
                RunResult {
                    exit_ok,
                    within_watch: false,
                }
            }
        }
    }

    /// The log line that explains a failed start, with the log kept aside.
    fn failure_detail(&self, version: &str) -> Option<String> {
        let detail = launch::last_error_line(&self.config.layout.last_run_log());
        launch::keep_failed_log(&self.config.layout, version);
        detail
    }

    /// Turn the update check on start on or off.
    ///
    /// # Errors
    ///
    /// [`CoreError::Io`] when the state file cannot be written.
    pub fn set_check_on_start(&self, enabled: bool) -> Result<Snapshot> {
        let mut inner = self.lock();
        inner.state.check_on_start = enabled;
        inner.state.save(&self.config.layout.state_file())?;
        drop(inner);
        Ok(self.snapshot())
    }

    /// Remove one of the launcher's own notices.
    ///
    /// # Errors
    ///
    /// [`CoreError::Io`] when the state file cannot be written.
    pub fn dismiss_notice(&self, id: &str) -> Result<Snapshot> {
        let mut inner = self.lock();
        inner.state.dismiss_notice(id);
        inner.state.save(&self.config.layout.state_file())?;
        drop(inner);
        Ok(self.snapshot())
    }

    /// Change the state and write it. A failed write is not fatal here: the
    /// run goes on and the next successful write carries the change.
    fn update_state(&self, change: impl FnOnce(&mut State)) {
        let mut inner = self.lock();
        change(&mut inner.state);
        let _ = inner.state.save(&self.config.layout.state_file());
    }

    fn remote(&self, inner: &Inner) -> Remote {
        let manifest = match &inner.last_check {
            None => return Remote::Unknown,
            Some(Err(reason)) => {
                return Remote::Offline {
                    reason: reason.clone(),
                };
            }
            Some(Ok(manifest)) => manifest,
        };
        let state = &inner.state;

        // The launcher installs the version the manifest names, also when it
        // is lower than the installed one: deleting a bad release is a remote
        // rollback. A version that failed to start here is never taken again.
        if state.current.as_deref() == Some(manifest.version.as_str())
            || state.is_bad(&manifest.version)
        {
            return Remote::UpToDate;
        }
        if let Some(required) = manifest.minimum_launcher()
            && required > self.config.launcher_version
        {
            return Remote::LauncherTooOld {
                required: required.to_string(),
            };
        }
        match manifest.build_for(&self.config.platform) {
            Ok(build) => Remote::UpdateAvailable {
                version: manifest.version.clone(),
                size: build.size,
            },
            Err(error) => Remote::Offline {
                reason: error.to_string(),
            },
        }
    }

    fn lease(&self) -> Result<Lease> {
        if self.busy.swap(true, Ordering::AcqRel) {
            return Err(CoreError::Busy);
        }
        Ok(Lease(Arc::clone(&self.busy)))
    }

    /// The lock is never held across an await, and no code panics while
    /// holding it, so a poisoned lock still holds a consistent value.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Drop versions whose directories are gone (deleted by hand, for example).
/// Returns whether the state changed.
fn reconcile(layout: &Layout, state: &mut State) -> bool {
    let present = |version: &Option<String>| {
        version
            .as_deref()
            .is_some_and(|version| layout.version_dir(version).is_dir())
    };
    let before = (state.current.clone(), state.previous.clone());

    if !present(&state.previous) {
        state.previous = None;
    }
    if !present(&state.current) {
        state.current = state.previous.take();
    }
    state.forget_removed_versions();

    before != (state.current.clone(), state.previous.clone())
}

/// The text of a file whose signature has been checked. Strict, because a
/// file that is not UTF-8 is not one of ours and must not be repaired.
fn text_of(bytes: &[u8]) -> Result<&str> {
    std::str::from_utf8(bytes).map_err(|_| CoreError::BadManifest("it is not text".to_owned()))
}

/// Seconds since 1970.
fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs())
}
