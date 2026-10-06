//! The launcher's flows from end to end: a loopback server publishes releases,
//! a real child process stands in for the game, and a temporary directory is
//! the install root.

mod support;

use std::sync::Arc;
use std::time::Duration;

use night_maze_launcher_core::{
    Activity, CoreError, Launcher, NoticeKind, Phase, Progress, Remote, Snapshot, State,
};
use support::{EXE, Release, Reply, TestServer, config};

fn quiet(_progress: Progress) {}

/// Start the current version and wait until the launcher is idle again.
async fn play(launcher: &Arc<Launcher>) -> Snapshot {
    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    launcher
        .launch(Arc::new(move |snapshot| {
            let _ = sender.send(snapshot);
        }))
        .expect("the game starts");

    loop {
        let snapshot = tokio::time::timeout(Duration::from_secs(30), receiver.recv())
            .await
            .expect("the game exits in time")
            .expect("the launcher reports the exit");
        if snapshot.activity == Activity::Idle {
            return snapshot;
        }
    }
}

async fn check_and_install(launcher: &Arc<Launcher>) -> Snapshot {
    launcher.check().await;
    launcher.install(&quiet).await.expect("the install works")
}

fn saved_state(launcher: &Launcher) -> State {
    State::load(&launcher.layout().state_file()).expect("the state file is readable")
}

#[tokio::test(flavor = "multi_thread")]
async fn first_run_installs_the_newest_version_and_starts_it() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.publish(&Release::stub("0.9.0", 0, 0));
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    assert_eq!(launcher.snapshot().current, None);
    assert_eq!(launcher.snapshot().remote, Remote::Unknown);

    let checked = launcher.check().await;
    assert!(
        matches!(&checked.remote, Remote::UpdateAvailable { version, .. } if version == "0.9.0")
    );
    assert_eq!(checked.notes.as_deref(), Some("About 0.9.0"));
    assert_eq!(
        checked.feed.expect("the feed was read").updates[0].title,
        "Notes of 0.9.0"
    );

    let phases = std::sync::Mutex::new(Vec::new());
    let installed = launcher
        .install(&|progress: Progress| {
            assert!(progress.received <= progress.total);
            phases.lock().expect("the phase list").push(progress.phase);
        })
        .await
        .expect("the install works");

    assert_eq!(installed.current.as_deref(), Some("0.9.0"));
    assert_eq!(installed.remote, Remote::UpToDate);
    let phases = phases.into_inner().expect("the phase list");
    assert_eq!(phases.first(), Some(&Phase::Downloading));
    assert!(phases.contains(&Phase::Verifying));
    assert_eq!(phases.last(), Some(&Phase::Installing));

    let layout = launcher.layout();
    assert!(layout.version_dir("0.9.0").join(EXE).is_file());
    assert!(
        layout
            .version_dir("0.9.0")
            .join("assets")
            .join("shaders")
            .join("lit.frag")
            .is_file()
    );
    assert_eq!(
        std::fs::read_dir(layout.staging_dir())
            .expect("staging")
            .count(),
        0
    );

    let after = play(&launcher).await;
    assert_eq!(after.current.as_deref(), Some("0.9.0"));
    assert!(after.notices.is_empty());
    assert!(saved_state(&launcher).has_good_run("0.9.0"));

    let log = std::fs::read_to_string(layout.last_run_log()).expect("the game log exists");
    let data = layout
        .data_dir()
        .canonicalize()
        .expect("the data folder exists");
    let reported = log
        .lines()
        .next()
        .expect("the stub printed its working directory");
    let reported = std::path::Path::new(reported.trim_start_matches("[info] working directory: "))
        .canonicalize()
        .expect("the reported directory exists");
    assert_eq!(
        reported, data,
        "the game runs in data/, not in its version directory"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn an_update_keeps_one_previous_version_and_removes_older_ones() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    for version in ["0.9.0", "0.9.1", "0.9.2"] {
        server.publish(&Release::stub(version, 0, 0));
        let snapshot = check_and_install(&launcher).await;
        assert_eq!(snapshot.current.as_deref(), Some(version));
    }

    let snapshot = launcher.snapshot();
    assert_eq!(snapshot.previous.as_deref(), Some("0.9.1"));
    let layout = launcher.layout();
    assert!(
        !layout.version_dir("0.9.0").exists(),
        "only current and previous are kept"
    );
    assert!(layout.version_dir("0.9.1").is_dir());
    assert!(layout.version_dir("0.9.2").is_dir());
    assert!(!saved_state(&launcher).versions.contains_key("0.9.0"));

    // The manifest going back to an older version is a remote rollback.
    server.publish(&Release::stub("0.9.1", 0, 0));
    let snapshot = launcher.check().await;
    assert!(
        matches!(&snapshot.remote, Remote::UpdateAvailable { version, .. } if version == "0.9.1")
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_download_with_the_wrong_checksum_is_refused_and_the_old_version_still_starts() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.publish(&Release::stub("0.9.0", 0, 0));
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");
    check_and_install(&launcher).await;

    let mut damaged = Release::stub("0.9.1", 0, 0);
    damaged.sha256 = "0".repeat(64);
    server.publish(&damaged);
    launcher.check().await;

    let error = launcher
        .install(&quiet)
        .await
        .expect_err("the install is refused");
    assert!(
        matches!(error, CoreError::HashMismatch { .. }),
        "got {error:?}"
    );

    let layout = launcher.layout();
    assert!(!layout.version_dir("0.9.1").exists());
    assert_eq!(
        std::fs::read_dir(layout.staging_dir())
            .expect("staging")
            .count(),
        0
    );
    let snapshot = launcher.snapshot();
    assert_eq!(snapshot.current.as_deref(), Some("0.9.0"));
    assert_eq!(snapshot.activity, Activity::Idle);
    assert!(
        matches!(&snapshot.remote, Remote::UpdateAvailable { version, .. } if version == "0.9.1"),
        "the update is still on offer, so the player can try again"
    );

    let after = play(&launcher).await;
    assert_eq!(after.current.as_deref(), Some("0.9.0"));
    assert!(saved_state(&launcher).has_good_run("0.9.0"));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_download_of_the_wrong_length_is_refused() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    let mut longer = Release::stub("0.9.0", 0, 0);
    longer.size -= 1;
    server.publish(&longer);
    launcher.check().await;
    let error = launcher
        .install(&quiet)
        .await
        .expect_err("a longer body is refused");
    assert!(
        matches!(error, CoreError::SizeMismatch { .. }),
        "got {error:?}"
    );

    let mut shorter = Release::stub("0.9.0", 0, 0);
    shorter.size += 1;
    server.publish(&shorter);
    launcher.check().await;
    let error = launcher
        .install(&quiet)
        .await
        .expect_err("a shorter body is refused");
    assert!(
        matches!(error, CoreError::SizeMismatch { .. }),
        "got {error:?}"
    );

    assert_eq!(launcher.snapshot().current, None);
    assert!(!launcher.layout().version_dir("0.9.0").exists());
}

#[tokio::test(flavor = "multi_thread")]
async fn an_archive_with_an_escaping_entry_is_refused_as_a_whole() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.publish(&Release::from_entries(
        "0.9.0",
        &[
            (EXE, b"MZ".as_slice()),
            ("../../escaped.txt", b"pwned".as_slice()),
        ],
    ));
    let launcher = Launcher::open(config(root.path().join("install").as_path(), &server))
        .expect("the launcher opens");
    launcher.check().await;

    let error = launcher
        .install(&quiet)
        .await
        .expect_err("the archive is refused");

    assert!(matches!(error, CoreError::Archive(_)), "got {error:?}");
    assert!(!root.path().join("escaped.txt").exists());
    assert!(!root.path().join("install").join("escaped.txt").exists());
    assert!(!launcher.layout().version_dir("0.9.0").exists());
    assert_eq!(launcher.snapshot().current, None);
}

#[tokio::test(flavor = "multi_thread")]
async fn a_new_version_that_fails_at_once_is_rolled_back_and_the_previous_one_starts() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    server.publish(&Release::stub("0.9.1", 0, 0));
    check_and_install(&launcher).await;
    play(&launcher).await;

    server.publish(&Release::stub("0.9.2", 1, 0));
    let snapshot = check_and_install(&launcher).await;
    assert_eq!(snapshot.current.as_deref(), Some("0.9.2"));

    let after = play(&launcher).await;

    assert_eq!(
        after.current.as_deref(),
        Some("0.9.1"),
        "back on the previous version"
    );
    assert_eq!(after.previous, None);
    assert_eq!(after.notices.len(), 1);
    let notice = &after.notices[0];
    assert_eq!(notice.kind, NoticeKind::RolledBack);
    assert_eq!(notice.failed, "0.9.2");
    assert_eq!(notice.restored.as_deref(), Some("0.9.1"));
    assert_eq!(
        notice.detail.as_deref(),
        Some("[error] Fatal: the stub was told to fail with 1")
    );

    let layout = launcher.layout();
    assert!(
        !layout.version_dir("0.9.2").exists(),
        "the bad version is deleted"
    );
    assert!(
        layout.logs_dir().join("failed-0.9.2.log").is_file(),
        "its log is kept"
    );
    let log = std::fs::read_to_string(layout.last_run_log()).expect("the game log exists");
    assert!(
        !log.contains("[error]"),
        "the last run was the restored version, which exits with 0"
    );

    let state = saved_state(&launcher);
    assert!(state.is_bad("0.9.2"));
    assert_eq!(state.current.as_deref(), Some("0.9.1"));

    // The same manifest is no longer an update, in this session or the next.
    assert_eq!(launcher.check().await.remote, Remote::UpToDate);
    assert!(matches!(
        launcher.install(&quiet).await,
        Err(CoreError::NotInstalled)
    ));
    let reopened = Launcher::open(config(root.path(), &server)).expect("the launcher reopens");
    assert_eq!(reopened.check().await.remote, Remote::UpToDate);
    assert_eq!(
        reopened.snapshot().notices.len(),
        1,
        "the notice survives a restart"
    );

    let dismissed = reopened
        .dismiss_notice(&notice.id)
        .expect("the notice is dismissed");
    assert!(dismissed.notices.is_empty());
}

#[tokio::test(flavor = "multi_thread")]
async fn no_rollback_when_there_is_no_proven_version_to_go_back_to() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    // 0.9.0 is installed but never started, so it proves nothing.
    server.publish(&Release::stub("0.9.0", 0, 0));
    check_and_install(&launcher).await;
    server.publish(&Release::stub("0.9.1", 1, 0));
    check_and_install(&launcher).await;

    let after = play(&launcher).await;

    assert_eq!(
        after.current.as_deref(),
        Some("0.9.1"),
        "nothing is switched"
    );
    assert_eq!(after.previous.as_deref(), Some("0.9.0"));
    assert_eq!(after.notices.len(), 1);
    assert_eq!(after.notices[0].kind, NoticeKind::StartFailed);
    assert!(!saved_state(&launcher).is_bad("0.9.1"));
    assert!(launcher.layout().version_dir("0.9.1").is_dir());
}

#[tokio::test(flavor = "multi_thread")]
async fn a_failure_after_the_start_watch_is_not_a_failed_start() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    server.publish(&Release::stub("0.9.0", 0, 0));
    check_and_install(&launcher).await;
    play(&launcher).await;
    // Alive for 3 seconds, longer than the 1.5 second watch of the tests.
    server.publish(&Release::stub("0.9.1", 1, 3000));
    check_and_install(&launcher).await;

    let after = play(&launcher).await;

    assert_eq!(after.current.as_deref(), Some("0.9.1"));
    assert!(after.notices.is_empty());
    let state = saved_state(&launcher);
    assert!(
        state.has_good_run("0.9.1"),
        "surviving the watch counts as a good run"
    );
    assert!(!state.is_bad("0.9.1"));
}

#[tokio::test(flavor = "multi_thread")]
async fn without_a_server_the_installed_version_still_starts() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.publish(&Release::stub("0.9.0", 0, 0));
    let settings = config(root.path(), &server);
    let launcher = Launcher::open(settings.clone()).expect("the launcher opens");
    check_and_install(&launcher).await;
    drop(launcher);
    drop(server);

    let launcher = Launcher::open(settings).expect("the launcher opens offline");
    let offline = launcher.check().await;

    assert!(
        matches!(offline.remote, Remote::Offline { .. }),
        "got {:?}",
        offline.remote
    );
    assert_eq!(offline.current.as_deref(), Some("0.9.0"));
    assert_eq!(
        offline
            .feed
            .expect("the notes of the last check are kept")
            .updates[0]
            .title,
        "Notes of 0.9.0"
    );
    assert!(matches!(
        launcher.install(&quiet).await,
        Err(CoreError::NotInstalled)
    ));

    let after = play(&launcher).await;
    assert_eq!(after.current.as_deref(), Some("0.9.0"));
    assert!(saved_state(&launcher).has_good_run("0.9.0"));
}

#[tokio::test(flavor = "multi_thread")]
async fn answers_that_are_not_a_manifest_count_as_offline() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    for reply in [
        Reply::Body(b"<html>Sign in to the hotel Wi-Fi</html>".to_vec()),
        Reply::Body(br#"{"schema":2,"version":"0.9.0"}"#.to_vec()),
        Reply::Status(404),
        Reply::Status(500),
        Reply::Redirect("http://example.com/manifest.json".to_owned()),
    ] {
        server.route("/manifest.json", reply);
        let snapshot = launcher.check().await;
        assert!(
            matches!(snapshot.remote, Remote::Offline { .. }),
            "got {:?}",
            snapshot.remote
        );
    }
    assert!(
        !server.requests().iter().any(|path| path.ends_with(".zip")),
        "nothing is downloaded without a valid manifest"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_server_that_never_answers_gives_up_after_the_timeout() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.route("/manifest.json", Reply::Hang);
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    let started = std::time::Instant::now();
    let snapshot = launcher.check().await;

    assert!(matches!(snapshot.remote, Remote::Offline { .. }));
    assert!(
        started.elapsed() < Duration::from_secs(8),
        "took {:?}",
        started.elapsed()
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn redirects_on_loopback_are_followed_for_the_manifest_and_the_download() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let release = Release::stub("0.9.0", 0, 0);
    server.route("/cdn/game.zip", Reply::Body(release.zip.clone()));
    server.route(
        "/download/game.zip",
        Reply::Redirect("/cdn/game.zip".to_owned()),
    );
    server.route(
        "/cdn/manifest.json",
        Reply::Body(
            release
                .manifest(&server.url("/download/game.zip"))
                .into_bytes(),
        ),
    );
    server.route(
        "/manifest.json",
        Reply::Redirect(server.url("/cdn/manifest.json")),
    );
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");

    let snapshot = check_and_install(&launcher).await;

    assert_eq!(snapshot.current.as_deref(), Some("0.9.0"));
    assert!(server.requests().contains(&"/cdn/game.zip".to_owned()));
}

#[tokio::test(flavor = "multi_thread")]
async fn a_download_url_that_is_not_https_is_never_requested() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let release = Release::stub("0.9.0", 0, 0);
    server.route(
        "/manifest.json",
        Reply::Body(
            release
                .manifest("http://example.com/NightMaze-0.9.0.zip")
                .into_bytes(),
        ),
    );
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");
    launcher.check().await;

    let error = launcher
        .install(&quiet)
        .await
        .expect_err("the URL is refused");

    assert!(matches!(error, CoreError::InsecureUrl(_)), "got {error:?}");
}

#[tokio::test(flavor = "multi_thread")]
async fn a_release_that_needs_a_newer_launcher_is_not_installed() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.publish(&Release::stub("0.9.0", 0, 0));
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");
    check_and_install(&launcher).await;

    let mut newer = Release::stub("0.9.1", 0, 0);
    newer.launcher_min = "9.0.0".to_owned();
    server.publish(&newer);

    let snapshot = launcher.check().await;
    assert_eq!(
        snapshot.remote,
        Remote::LauncherTooOld {
            required: "9.0.0".to_owned()
        }
    );
    assert!(matches!(
        launcher.install(&quiet).await,
        Err(CoreError::LauncherTooOld { .. })
    ));
    assert_eq!(
        play(&launcher).await.current.as_deref(),
        Some("0.9.0"),
        "0.9.0 still starts"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_second_start_while_the_game_runs_is_refused() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    server.publish(&Release::stub("0.9.0", 0, 800));
    let launcher = Launcher::open(config(root.path(), &server)).expect("the launcher opens");
    check_and_install(&launcher).await;

    let (sender, mut receiver) = tokio::sync::mpsc::unbounded_channel();
    let running = launcher
        .launch(Arc::new(move |snapshot| {
            let _ = sender.send(snapshot);
        }))
        .expect("the game starts");
    assert!(
        matches!(&running.activity, Activity::Running { version, pid } if version == "0.9.0" && *pid != 0)
    );

    assert!(matches!(
        launcher.launch(Arc::new(|_| {})),
        Err(CoreError::Busy)
    ));
    assert!(matches!(
        launcher.install(&quiet).await,
        Err(CoreError::Busy)
    ));

    let after = receiver
        .recv()
        .await
        .expect("the launcher reports the exit");
    assert_eq!(after.activity, Activity::Idle);
    assert_eq!(
        play(&launcher).await.activity,
        Activity::Idle,
        "free again after the exit"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn a_version_folder_deleted_by_hand_is_noticed_on_the_next_start() {
    let root = tempfile::tempdir().expect("a temporary directory");
    let server = TestServer::start().await;
    let settings = config(root.path(), &server);
    let launcher = Launcher::open(settings.clone()).expect("the launcher opens");
    server.publish(&Release::stub("0.9.0", 0, 0));
    check_and_install(&launcher).await;
    server.publish(&Release::stub("0.9.1", 0, 0));
    check_and_install(&launcher).await;
    std::fs::write(
        launcher.layout().staging_dir().join("0.9.2.zip.part"),
        b"half",
    )
    .expect("a leftover download");
    std::fs::remove_dir_all(launcher.layout().version_dir("0.9.1")).expect("delete the version");
    drop(launcher);

    let reopened = Launcher::open(settings).expect("the launcher reopens");

    let snapshot = reopened.snapshot();
    assert_eq!(
        snapshot.current.as_deref(),
        Some("0.9.0"),
        "falls back to what is on disk"
    );
    assert_eq!(snapshot.previous, None);
    assert_eq!(
        std::fs::read_dir(reopened.layout().staging_dir())
            .expect("staging")
            .count(),
        0
    );
}
