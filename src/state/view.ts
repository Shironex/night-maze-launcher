// What the window shows for a given launcher state.
//
// Only three regions change between states: the version pill, the notice line
// and the main button. This file turns a snapshot from the Rust side into the
// text, icon and action of each. It is a pure function, so every state has a
// test and none depends on a running launcher.
//
// Every state has a text label and its own icon. None is told apart by colour
// alone.

import type { LocalNotice, Progress, Snapshot } from '../bindings';
import { megabytes, megabytesOf, percent } from '../lib/format';
import type { IconName } from '../components/Icon';

export type Action =
  | { type: 'check' }
  | { type: 'install' }
  | { type: 'launch' }
  | { type: 'open_logs' }
  | { type: 'copy_log_path' }
  | { type: 'dismiss'; id: string }
  | { type: 'clear_error' };

export interface PillView {
  tone: 'ok' | 'warn' | 'quiet';
  /** `dot` is the small teal dot of the calm states. */
  icon: IconName | 'dot';
  text: string;
}

export interface NoticeView {
  tone: 'warn' | 'quiet';
  icon: IconName;
  text: string;
  /** A second, quieter sentence. */
  dim?: string;
  /** A line from the game log, shown in the monospace face. */
  detail?: string;
  actions: { label: string; action: Action }[];
}

export interface StepView {
  label: string;
  state: 'done' | 'now' | 'todo';
}

export interface CtaView {
  /** `primary` is the amber button, `busy` shows progress, `off` is disabled. */
  style: 'primary' | 'busy' | 'off';
  icon: IconName;
  title: string;
  sub: string;
  /** Width of the progress line, 0 to 100. Only for `busy`. */
  percent?: number;
  /** Missing when the button is disabled. */
  action?: Action;
}

export interface View {
  pill: PillView;
  notice?: NoticeView;
  steps?: StepView[];
  cta: CtaView;
  /** A smaller button left of the main one. */
  secondary?: { label: string; icon: IconName; action: Action };
}

export interface ViewInput {
  snapshot: Snapshot | null;
  progress: Progress | null;
  /** An update check is running. */
  checking: boolean;
  /** Why the last install or start failed, as a sentence. */
  error: string | null;
  /** Why the launcher could not open its own state at all. */
  fatal: string | null;
}

const LOG_ACTIONS: NoticeView['actions'] = [
  { label: 'Open log folder', action: { type: 'open_logs' } },
  { label: 'Copy log path', action: { type: 'copy_log_path' } },
];

export function deriveView(input: ViewInput): View {
  const { snapshot, progress, checking, error, fatal } = input;

  if (fatal || !snapshot) {
    return {
      pill: fatal
        ? { tone: 'warn', icon: 'warning', text: 'launcher problem' }
        : { tone: 'quiet', icon: 'clock', text: 'starting' },
      notice: fatal
        ? {
            tone: 'warn',
            icon: 'warning',
            text: 'The launcher could not start.',
            dim: fatal,
            actions: [],
          }
        : undefined,
      cta: { style: 'off', icon: 'play', title: 'Launch', sub: 'not ready' },
    };
  }

  const { current, remote, activity } = snapshot;

  if (activity.kind === 'installing') {
    return installingView(activity.version, current, progress);
  }
  if (activity.kind === 'running') {
    return {
      pill: { tone: 'ok', icon: 'dot', text: `v ${activity.version} · running` },
      notice: localNotice(snapshot),
      cta: { style: 'off', icon: 'play', title: 'Running', sub: `v${activity.version}` },
    };
  }
  if (!current) {
    return firstRunView(snapshot, checking, error);
  }

  const launch: CtaView = {
    style: 'primary',
    icon: 'play',
    title: 'Launch',
    sub: `v${current}`,
    action: { type: 'launch' },
  };

  // A failed install or start comes first: it is the answer to the button the
  // player has just pressed. The installed version still starts.
  if (error) {
    return {
      pill: { tone: 'warn', icon: 'warning', text: `v ${current} · update failed` },
      notice: {
        tone: 'warn',
        icon: 'warning',
        text: sentence(error),
        dim: `Version ${current} still starts.`,
        actions: [
          ...(remote.kind === 'update_available'
            ? [{ label: 'Try again', action: { type: 'install' } as Action }]
            : []),
          { label: 'Dismiss', action: { type: 'clear_error' } },
        ],
      },
      cta: launch,
    };
  }

  const own = localNotice(snapshot);
  if (own) {
    const rolledBack = snapshot.notices.some(notice => notice.kind === 'rolled_back');
    return {
      pill: {
        tone: 'warn',
        icon: 'warning',
        text: rolledBack ? `v ${current} · rolled back` : `v ${current} · did not start`,
      },
      notice: own,
      cta: launch,
    };
  }

  switch (remote.kind) {
    case 'update_available':
      return {
        pill: { tone: 'warn', icon: 'upload', text: `v ${current} · update available` },
        cta: {
          style: 'primary',
          icon: 'download',
          title: 'Update',
          sub: `v${current} → v${remote.version}`,
          action: { type: 'install' },
        },
        secondary: { label: `Launch v${current}`, icon: 'play', action: { type: 'launch' } },
      };
    case 'launcher_too_old':
      return {
        pill: { tone: 'warn', icon: 'upload', text: 'launcher update needed' },
        notice: {
          tone: 'warn',
          icon: 'upload',
          text: `This launcher (${snapshot.launcher_version}) is too old to install newer game versions.`,
          dim: `Get launcher ${remote.required} or newer from the page you got this one from. Version ${current} still starts.`,
          actions: [],
        },
        cta: launch,
      };
    case 'offline':
      return {
        pill: { tone: 'quiet', icon: 'offline', text: `v ${current} · offline` },
        notice: {
          tone: 'quiet',
          icon: 'offline',
          text: 'Could not check for updates.',
          dim: `Version ${current} still starts.`,
          actions: [{ label: 'Try again', action: { type: 'check' } }],
        },
        cta: launch,
      };
    case 'up_to_date':
      return { pill: { tone: 'ok', icon: 'dot', text: `v ${current} · up to date` }, cta: launch };
    case 'unknown':
      return {
        pill: checking
          ? { tone: 'quiet', icon: 'clock', text: `v ${current} · checking for updates` }
          : { tone: 'quiet', icon: 'dot', text: `v ${current}` },
        cta: launch,
      };
  }
}

function installingView(version: string, current: string | null, progress: Progress | null): View {
  const phase = progress?.phase ?? 'downloading';
  const received = progress?.received ?? 0;
  const total = progress?.total ?? 0;

  if (phase === 'downloading') {
    const done = percent(received, total);
    return {
      pill: { tone: 'ok', icon: 'download', text: `downloading v${version}` },
      cta: {
        style: 'busy',
        icon: 'download',
        title: `${current ? 'Updating' : 'Downloading'} ${done}%`,
        sub: total > 0 ? megabytesOf(received, total) : 'connecting',
        percent: done,
      },
    };
  }

  const verifying = phase === 'verifying';
  return {
    pill: { tone: 'ok', icon: 'clock', text: `installing v${version}` },
    steps: [
      { label: 'Downloaded', state: 'done' },
      { label: 'Verified', state: verifying ? 'now' : 'done' },
      { label: 'Installing', state: verifying ? 'todo' : 'now' },
      { label: 'Ready', state: 'todo' },
    ],
    cta: {
      style: 'busy',
      icon: 'clock',
      title: verifying ? 'Verifying' : 'Installing',
      sub: verifying ? 'checking SHA-256' : 'SHA-256 matches',
      percent: 100,
    },
  };
}

function firstRunView(snapshot: Snapshot, checking: boolean, error: string | null): View {
  const { remote } = snapshot;
  const pill: PillView = { tone: 'warn', icon: 'offline', text: 'not installed' };
  const disabled = (sub: string): CtaView => ({
    style: 'off',
    icon: 'download',
    title: 'Install',
    sub,
  });
  const retry = { label: 'Retry', icon: 'retry', action: { type: 'check' } } as const;

  if (remote.kind === 'update_available') {
    const size = remote.size ?? 0;
    return {
      pill: { tone: 'warn', icon: 'download', text: 'not installed' },
      notice: error
        ? {
            tone: 'warn',
            icon: 'warning',
            text: sentence(error),
            dim: 'Nothing was installed.',
            actions: [{ label: 'Dismiss', action: { type: 'clear_error' } }],
          }
        : undefined,
      cta: {
        style: 'primary',
        icon: 'download',
        title: 'Install',
        sub: `v${remote.version} · ${megabytes(size)}`,
        action: { type: 'install' },
      },
    };
  }
  if (remote.kind === 'offline') {
    return {
      pill,
      notice: {
        tone: 'warn',
        icon: 'offline',
        text: 'Night Maze needs an internet connection once, to download the game.',
        dim: remote.reason,
        actions: [],
      },
      cta: disabled('no connection'),
      secondary: retry,
    };
  }
  if (remote.kind === 'launcher_too_old') {
    return {
      pill: { tone: 'warn', icon: 'upload', text: 'launcher update needed' },
      notice: {
        tone: 'warn',
        icon: 'upload',
        text: `This launcher (${snapshot.launcher_version}) is too old to install the game.`,
        dim: `Get launcher ${remote.required} or newer from the page you got this one from.`,
        actions: [],
      },
      cta: disabled('launcher too old'),
    };
  }
  if (remote.kind === 'up_to_date') {
    // Nothing is installed and the newest release is one that failed to start
    // here before, so there is nothing this launcher will install.
    return {
      pill,
      notice: localNotice(snapshot) ?? {
        tone: 'warn',
        icon: 'warning',
        text: 'The newest version did not start on this computer, and there is no other one to install.',
        actions: LOG_ACTIONS,
      },
      cta: disabled('nothing to install'),
      secondary: retry,
    };
  }
  return {
    pill: checking ? { tone: 'quiet', icon: 'clock', text: 'checking for the game' } : pill,
    cta: disabled(checking ? 'checking' : 'not checked'),
    secondary: checking ? undefined : retry,
  };
}

/** Text from the Rust side as a sentence: it arrives without a final full stop. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** The newest of the launcher's own notices, as a notice line. */
function localNotice(snapshot: Snapshot): NoticeView | undefined {
  const notice = snapshot.notices.at(-1);
  if (!notice) return undefined;
  return {
    tone: 'warn',
    icon: 'warning',
    text: localNoticeText(notice),
    detail: notice.detail ?? undefined,
    actions: [...LOG_ACTIONS, { label: 'Dismiss', action: { type: 'dismiss', id: notice.id } }],
  };
}

/** One sentence for a notice the launcher wrote itself. */
export function localNoticeText(notice: LocalNotice): string {
  if (notice.kind === 'rolled_back' && notice.restored) {
    return `Version ${notice.failed} did not start. You are back on ${notice.restored}.`;
  }
  return `Version ${notice.failed} did not start.`;
}
