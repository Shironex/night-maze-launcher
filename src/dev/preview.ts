// Fixed states for looking at the window without a server or a download.
//
// Development only: the store imports this file behind `import.meta.env.DEV`,
// so it is not part of a release build. Open the dev page with `?preview=`
// followed by one of the names below, for example `?preview=installing`.

import type { Progress, Snapshot } from '../bindings';
import type { LauncherUpdateState } from '../state/view';
import { FEED } from './preview-feed';

export interface Preview {
  snapshot: Snapshot;
  progress: Progress | null;
  checking: boolean;
  error: string | null;
  fatal: string | null;
  /** Only the previews of the launcher's own update set this. */
  launcher?: LauncherUpdateState;
  /** The launcher version whose toast counts as closed. */
  dismissedLauncher?: string;
}

const MEGABYTE = 1024 * 1024;

/** The game release the previews install, and the size of its published zip. */
const NEWEST = '0.10.0';
const BEFORE_NEWEST = '0.9.0';
/** NightMaze-0.10.0-windows-x64.zip, in bytes. */
const NEWEST_SIZE = 30_596_672;

const BASE: Snapshot = {
  launcher_version: '0.1.2',
  install_root: 'C:\\Users\\friend\\AppData\\Local\\NightMaze',
  logs_dir: 'C:\\Users\\friend\\AppData\\Local\\NightMaze\\data\\logs',
  log_file: 'C:\\Users\\friend\\AppData\\Local\\NightMaze\\data\\logs\\last-run.log',
  current: NEWEST,
  previous: BEFORE_NEWEST,
  check_on_start: true,
  remote: { kind: 'up_to_date' },
  activity: { kind: 'idle' },
  notes: null,
  feed: FEED,
  notices: [],
};

/** One version behind: the newest release is found and not installed yet. */
const BEHIND: Snapshot = {
  ...BASE,
  current: BEFORE_NEWEST,
  previous: '0.8.0',
  remote: { kind: 'update_available', version: NEWEST, size: NEWEST_SIZE },
};

const NOTHING_INSTALLED: Snapshot = { ...BASE, current: null, previous: null };

const QUIET = { progress: null, checking: false, error: null, fatal: null };

const TOO_OLD: Snapshot = { ...BASE, remote: { kind: 'launcher_too_old', required: '0.2.0' } };

/** A newer launcher was found and nothing is running yet. */
const NEWER_LAUNCHER: LauncherUpdateState = {
  update: {
    kind: 'available',
    version: '0.2.0',
    notes: 'Reads the new release format.\nThe window opens faster.',
  },
  checking: false,
  installing: false,
  progress: null,
  error: null,
};

/** The `notes` of the latest.json published with launcher 0.1.2, copied as they are. */
const LAUNCHER_0_1_2_NOTES =
  'The first release built, signed and published by GitHub Actions instead of on my PC. An installed 0.1.1 updating to it is the proof that this works.\n\n- The background is now a recorded loop of the real game, a slow glide over the maze, with a still picture when the video cannot play or motion is reduced.\n- The header says Windows only, because that is what ships.\n- Releases are built by GitHub Actions from a tag, and the installer signature is checked before anything is published.';

const PREVIEWS: Record<string, Preview> = {
  ready: { ...QUIET, snapshot: BASE },
  update: { ...QUIET, snapshot: BEHIND },
  downloading: {
    ...QUIET,
    snapshot: { ...BEHIND, activity: { kind: 'installing', version: NEWEST } },
    progress: {
      version: NEWEST,
      phase: 'downloading',
      received: Math.round(NEWEST_SIZE * 0.38),
      total: NEWEST_SIZE,
    },
  },
  installing: {
    ...QUIET,
    snapshot: { ...BEHIND, activity: { kind: 'installing', version: NEWEST } },
    progress: {
      version: NEWEST,
      phase: 'installing',
      received: NEWEST_SIZE,
      total: NEWEST_SIZE,
    },
  },
  running: {
    ...QUIET,
    snapshot: { ...BASE, activity: { kind: 'running', version: NEWEST, pid: 1 } },
  },
  offline: {
    ...QUIET,
    snapshot: { ...BASE, remote: { kind: 'offline', reason: 'no connection to the server' } },
  },
  'first-run': {
    ...QUIET,
    snapshot: {
      ...NOTHING_INSTALLED,
      remote: { kind: 'update_available', version: NEWEST, size: NEWEST_SIZE },
    },
  },
  'first-run-offline': {
    ...QUIET,
    snapshot: {
      ...NOTHING_INSTALLED,
      feed: null,
      remote: {
        kind: 'offline',
        reason: 'Could not check for updates: no connection to the server',
      },
    },
  },
  'rolled-back': {
    ...QUIET,
    snapshot: {
      ...BASE,
      current: BEFORE_NEWEST,
      previous: null,
      notices: [
        {
          id: 'local-1',
          kind: 'rolled_back',
          failed: NEWEST,
          restored: BEFORE_NEWEST,
          detail: '[error] Fatal: Failed to create the window (OpenGL 4.1 is required)',
        },
      ],
    },
  },
  'update-failed': {
    ...QUIET,
    error: 'The download does not match its checksum, so it was not installed',
    snapshot: BEHIND,
  },
  'launcher-too-old': { ...QUIET, snapshot: TOO_OLD },
  'launcher-update': { ...QUIET, snapshot: TOO_OLD, launcher: NEWER_LAUNCHER },
  'launcher-downloading': {
    ...QUIET,
    snapshot: TOO_OLD,
    launcher: {
      ...NEWER_LAUNCHER,
      installing: true,
      progress: { received: 3.1 * MEGABYTE, total: 5 * MEGABYTE },
    },
  },
  // Nothing is wrong, a newer launcher exists and its toast was closed: the
  // update is offered in the settings only.
  'launcher-newer': {
    ...QUIET,
    snapshot: { ...BASE, launcher_version: '0.1.1' },
    launcher: {
      ...NEWER_LAUNCHER,
      update: { kind: 'available', version: '0.1.2', notes: LAUNCHER_0_1_2_NOTES },
    },
    dismissedLauncher: '0.1.2',
  },
  // Nothing is wrong and a newer launcher was found: the toast offers it.
  'launcher-toast': { ...QUIET, snapshot: BASE, launcher: NEWER_LAUNCHER },
  'launcher-toast-downloading': {
    ...QUIET,
    snapshot: BASE,
    launcher: {
      ...NEWER_LAUNCHER,
      installing: true,
      progress: { received: 3.1 * MEGABYTE, total: 5 * MEGABYTE },
    },
  },
  'launcher-toast-failed': {
    ...QUIET,
    snapshot: BASE,
    launcher: { ...NEWER_LAUNCHER, error: 'Could not reach the launcher update server' },
  },
  // The states below are not in the published feed or need a broken computer.
  // Their texts are invented, to see where each one lands on the pages.
  checking: { ...QUIET, checking: true, snapshot: { ...BASE, remote: { kind: 'unknown' } } },
  fatal: {
    ...QUIET,
    fatal: 'Could not read state.json: the file is not valid JSON',
    snapshot: BASE,
  },
  // News and notices from the author, and two notices of this computer: the
  // newest is the notice line, the older one a note in the margin.
  news: {
    ...QUIET,
    snapshot: {
      ...BASE,
      current: BEFORE_NEWEST,
      previous: null,
      feed: {
        ...FEED,
        news: [
          {
            date: '2026-10-09',
            title: 'A playtest evening on Friday',
            body: 'I will be online from eight in the evening. Tell me where you got lost, and which seed it was.',
          },
          {
            date: '2026-10-02',
            title: 'The launcher has its own repository now',
            body: 'Nothing changes for you: it keeps updating itself.',
          },
        ],
        notices: [
          {
            id: 'pulled-0-10-0',
            level: 'warning',
            title: 'Version 0.10.0 was pulled.',
            body: 'It did not start on some graphics cards. A fixed version follows.',
          },
        ],
      },
      notices: [
        { id: 'local-1', kind: 'start_failed', failed: '0.8.0', detail: null },
        {
          id: 'local-2',
          kind: 'rolled_back',
          failed: NEWEST,
          restored: BEFORE_NEWEST,
          detail: '[error] Fatal: Failed to create the window (OpenGL 4.1 is required)',
        },
      ],
    },
  },
  // As much text as the left page ever has to hold: a failed game update with
  // a long reason, and a failed launcher update on the slip.
  'long-texts': {
    ...QUIET,
    error:
      'Could not unpack NightMaze-0.10.0-windows-x64.zip into C:\\Users\\friend\\AppData\\Local\\NightMaze\\staging: there is not enough space on the disk',
    snapshot: BEHIND,
    launcher: {
      ...NEWER_LAUNCHER,
      error:
        'Could not download the launcher update: the connection to github.com was closed before the file was complete',
    },
  },
};

/** The names of all previews, for the test that renders each of them. */
export const PREVIEW_NAMES = Object.keys(PREVIEWS);

/** One preview by its name. */
export function previewNamed(name: string): Preview | null {
  return PREVIEWS[name] ?? null;
}

/** The preview named in the address of the page, if any. */
export function previewFromLocation(): Preview | null {
  const name = new URLSearchParams(window.location.search).get('preview');
  return name ? previewNamed(name) : null;
}
