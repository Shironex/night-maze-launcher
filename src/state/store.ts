// The one store of the page: the last snapshot from the Rust side, the
// progress of a running install, and the actions the buttons call.
//
// The page decides nothing about updates. Every action calls a command and
// stores the snapshot it answers with.

import { create } from 'zustand';
import { commands, events, type Folder, type Progress, type Snapshot } from '../bindings';
import type { Action, LauncherUpdateState } from './view';

interface LauncherStore {
  snapshot: Snapshot | null;
  progress: Progress | null;
  checking: boolean;
  error: string | null;
  fatal: string | null;
  /** The launcher's own update. It does not depend on anything above. */
  launcher: LauncherUpdateState;

  /** Read the local state, subscribe to events, and check for updates. */
  start: () => Promise<void>;
  run: (action: Action) => Promise<void>;
  setCheckOnStart: (enabled: boolean) => Promise<void>;
  openFolder: (folder: Folder) => Promise<void>;
  /** `quiet` keeps a failed check to itself: nobody asked for the one on start. */
  checkLauncherUpdate: (quiet?: boolean) => Promise<void>;
  installLauncherUpdate: () => Promise<void>;
}

const NO_LAUNCHER_UPDATE: LauncherUpdateState = {
  update: null,
  checking: false,
  installing: false,
  progress: null,
  error: null,
};

/** A rejected command carries a sentence from the Rust side. */
function message(error: unknown): string {
  return typeof error === 'string' ? error : 'Something went wrong in the launcher.';
}

export const useLauncher = create<LauncherStore>((set, get) => {
  // React runs effects twice in development. One subscription and one update
  // check are enough.
  let started = false;

  const check = async () => {
    set({ checking: true });
    try {
      set({ snapshot: await commands.checkForUpdates() });
    } catch (error) {
      set({ fatal: message(error) });
    } finally {
      set({ checking: false });
    }
  };

  const install = async () => {
    set({ error: null, progress: null });
    // The answer to the command arrives when the install is over, so the
    // page marks it as running itself until the first progress event.
    const before = get().snapshot;
    if (before?.remote.kind === 'update_available') {
      set({
        snapshot: { ...before, activity: { kind: 'installing', version: before.remote.version } },
      });
    }
    try {
      set({ snapshot: await commands.installUpdate(), progress: null });
    } catch (error) {
      set({ error: message(error), progress: null, snapshot: await commands.snapshot() });
    }
  };

  const launch = async () => {
    set({ error: null });
    try {
      set({ snapshot: await commands.launchGame() });
    } catch (error) {
      set({ error: message(error) });
    }
  };

  const setLauncher = (change: Partial<LauncherUpdateState>) =>
    set({ launcher: { ...get().launcher, ...change } });

  return {
    snapshot: null,
    progress: null,
    checking: false,
    error: null,
    fatal: null,
    launcher: NO_LAUNCHER_UPDATE,

    start: async () => {
      if (started) return;
      started = true;
      if (import.meta.env.DEV) {
        const { previewFromLocation } = await import('../dev/preview');
        const preview = previewFromLocation();
        if (preview) {
          set(preview);
          return;
        }
      }

      // The setting lives in the state file. When that cannot be read the
      // setting is unknown, and the launcher's own update is still looked
      // for: a launcher in that state is the one that needs it most.
      let checkOnStart = true;
      let gameCheck = false;
      try {
        await events.installProgress.listen(event => set({ progress: event.payload }));
        await events.snapshotChanged.listen(event => set({ snapshot: event.payload }));
        const snapshot = await commands.snapshot();
        set({ snapshot });
        checkOnStart = snapshot.check_on_start;
        gameCheck = checkOnStart;
      } catch (error) {
        set({ fatal: message(error) });
      }

      // Two separate questions to two separate places, asked side by side.
      // Neither waits for the other and neither fails with the other.
      const own = (async () => {
        try {
          await events.launcherUpdateProgress.listen(event =>
            setLauncher({ progress: event.payload })
          );
        } catch {
          // Without the event the download still runs, it only shows no percent.
        }
        if (checkOnStart) await get().checkLauncherUpdate(true);
      })();
      if (gameCheck) await check();
      await own;
    },

    run: async action => {
      switch (action.type) {
        case 'check':
          return check();
        case 'install':
          return install();
        case 'launch':
          return launch();
        case 'open_logs':
          return get().openFolder('logs');
        case 'copy_log_path': {
          const path = get().snapshot?.log_file;
          if (path) await navigator.clipboard.writeText(path).catch(() => undefined);
          return;
        }
        case 'dismiss':
          try {
            set({ snapshot: await commands.dismissNotice(action.id) });
          } catch (error) {
            set({ error: message(error) });
          }
          return;
        case 'clear_error':
          set({ error: null });
          return;
        case 'update_launcher':
          return get().installLauncherUpdate();
      }
    },

    setCheckOnStart: async enabled => {
      try {
        set({ snapshot: await commands.setCheckOnStart(enabled) });
      } catch (error) {
        set({ error: message(error) });
      }
    },

    openFolder: async folder => {
      try {
        await commands.openFolder(folder);
      } catch (error) {
        set({ error: message(error) });
      }
    },

    checkLauncherUpdate: async (quiet = false) => {
      if (get().launcher.checking || get().launcher.installing) return;
      setLauncher({ checking: true, error: null });
      try {
        setLauncher({ update: await commands.checkLauncherUpdate(), checking: false });
      } catch (error) {
        setLauncher({ checking: false, error: quiet ? null : message(error) });
      }
    },

    installLauncherUpdate: async () => {
      if (get().launcher.installing) return;
      setLauncher({ installing: true, progress: null, error: null });
      try {
        // Answers only when it did not work: after a download that passed its
        // check the launcher is closed and started again as the new version.
        await commands.installLauncherUpdate();
      } catch (error) {
        setLauncher({ installing: false, progress: null, error: message(error) });
      }
    },
  };
});
