// The one store of the page: the last snapshot from the Rust side, the
// progress of a running install, and the actions the buttons call.
//
// The page decides nothing about updates. Every action calls a command and
// stores the snapshot it answers with.

import { create } from 'zustand';
import { commands, events, type Folder, type Progress, type Snapshot } from '../bindings';
import type { Action } from './view';

interface LauncherStore {
  snapshot: Snapshot | null;
  progress: Progress | null;
  checking: boolean;
  error: string | null;
  fatal: string | null;

  /** Read the local state, subscribe to events, and check for updates. */
  start: () => Promise<void>;
  run: (action: Action) => Promise<void>;
  setCheckOnStart: (enabled: boolean) => Promise<void>;
  openFolder: (folder: Folder) => Promise<void>;
}

/** A rejected command carries a sentence from the Rust side. */
function message(error: unknown): string {
  return typeof error === 'string' ? error : 'Something went wrong in the launcher.';
}

export const useLauncher = create<LauncherStore>((set, get) => {
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

  return {
    snapshot: null,
    progress: null,
    checking: false,
    error: null,
    fatal: null,

    start: async () => {
      if (import.meta.env.DEV) {
        const { previewFromLocation } = await import('../dev/preview');
        const preview = previewFromLocation();
        if (preview) {
          set(preview);
          return;
        }
      }
      try {
        await events.installProgress.listen(event => set({ progress: event.payload }));
        await events.snapshotChanged.listen(event => set({ snapshot: event.payload }));
        const snapshot = await commands.snapshot();
        set({ snapshot });
        if (snapshot.check_on_start) await check();
      } catch (error) {
        set({ fatal: message(error) });
      }
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
  };
});
