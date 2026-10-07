// Fixed states for looking at the window without a server or a download.
//
// Development only: the store imports this file behind `import.meta.env.DEV`,
// so it is not part of a release build. Open the dev page with `?preview=`
// followed by one of the names below, for example `?preview=installing`.

import type { NewsFeed, Progress, Snapshot } from '../bindings';
import type { LauncherUpdateState } from '../state/view';

export interface Preview {
  snapshot: Snapshot;
  progress: Progress | null;
  checking: boolean;
  error: string | null;
  fatal: string | null;
  /** Only the previews of the launcher's own update set this. */
  launcher?: LauncherUpdateState;
}

const FEED: NewsFeed = {
  schema: 1,
  updates: [
    {
      version: '0.9.1',
      date: '2026-12-12',
      tag: 'Fix release',
      title: 'Brighter crystals and a fix for the exit gate',
      summary: 'A small release after the first round of feedback.',
      highlight: true,
      groups: [
        {
          title: 'Gameplay',
          items: ['The exit gate opens on the last crystal', 'Crystals glow further'],
        },
        { title: 'Fixes', items: ['The battery no longer drains while the game is paused'] },
      ],
    },
    {
      version: '0.9.0',
      date: '2026-12-05',
      tag: 'Milestone release',
      title: 'The whole maze: menus, sound and a final polish',
      summary: 'Everything from the first step to the exit.',
      groups: [{ title: 'Gameplay', items: ['A full round from start to exit'] }],
    },
  ],
  news: [],
  notices: [],
};

const BASE: Snapshot = {
  launcher_version: '0.1.0',
  install_root: 'C:\\Users\\friend\\AppData\\Local\\NightMaze',
  logs_dir: 'C:\\Users\\friend\\AppData\\Local\\NightMaze\\data\\logs',
  log_file: 'C:\\Users\\friend\\AppData\\Local\\NightMaze\\data\\logs\\last-run.log',
  current: '0.9.0',
  previous: null,
  check_on_start: true,
  remote: { kind: 'up_to_date' },
  activity: { kind: 'idle' },
  notes: null,
  feed: FEED,
  notices: [],
};

const QUIET = { progress: null, checking: false, error: null, fatal: null };
const MEGABYTE = 1024 * 1024;

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

const PREVIEWS: Record<string, Preview> = {
  ready: { ...QUIET, snapshot: BASE },
  update: {
    ...QUIET,
    snapshot: {
      ...BASE,
      remote: { kind: 'update_available', version: '0.9.1', size: 18 * MEGABYTE },
    },
  },
  downloading: {
    ...QUIET,
    snapshot: { ...BASE, activity: { kind: 'installing', version: '0.9.1' } },
    progress: {
      version: '0.9.1',
      phase: 'downloading',
      received: 11.2 * MEGABYTE,
      total: 18 * MEGABYTE,
    },
  },
  installing: {
    ...QUIET,
    snapshot: { ...BASE, activity: { kind: 'installing', version: '0.9.1' } },
    progress: {
      version: '0.9.1',
      phase: 'installing',
      received: 18 * MEGABYTE,
      total: 18 * MEGABYTE,
    },
  },
  running: {
    ...QUIET,
    snapshot: { ...BASE, activity: { kind: 'running', version: '0.9.0', pid: 1 } },
  },
  offline: {
    ...QUIET,
    snapshot: { ...BASE, remote: { kind: 'offline', reason: 'no connection to the server' } },
  },
  'first-run': {
    ...QUIET,
    snapshot: {
      ...BASE,
      current: null,
      remote: { kind: 'update_available', version: '0.9.0', size: 18 * MEGABYTE },
    },
  },
  'first-run-offline': {
    ...QUIET,
    snapshot: {
      ...BASE,
      current: null,
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
      notices: [
        {
          id: 'local-1',
          kind: 'rolled_back',
          failed: '0.9.1',
          restored: '0.9.0',
          detail: '[error] Fatal: Failed to create the window (OpenGL 4.1 is required)',
        },
      ],
    },
  },
  'update-failed': {
    ...QUIET,
    error: 'The download does not match its checksum, so it was not installed',
    snapshot: {
      ...BASE,
      remote: { kind: 'update_available', version: '0.9.1', size: 18 * MEGABYTE },
    },
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
};

/** The preview named in the address of the page, if any. */
export function previewFromLocation(): Preview | null {
  const name = new URLSearchParams(window.location.search).get('preview');
  return name ? (PREVIEWS[name] ?? null) : null;
}
