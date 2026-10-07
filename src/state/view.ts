// What the window shows for a given launcher state.
//
// Only three regions change between states: the version pill, the notice line
// and the main button. A fourth, the toast, comes and goes with the launcher's
// own update. This file turns a snapshot from the Rust side into the text,
// icon and action of each. It is a pure function, so every state has a test
// and none depends on a running launcher.
//
// Every state has a text label and its own icon. None is told apart by colour
// alone.

import type {
  LauncherUpdate,
  LauncherUpdateProgress,
  LocalNotice,
  Progress,
  Snapshot,
} from '../bindings';
import { megabytes, megabytesOf, percent } from '../lib/format';
import type { IconName } from '../components/Icon';

export type Action =
  | { type: 'check' }
  | { type: 'install' }
  | { type: 'launch' }
  | { type: 'open_logs' }
  | { type: 'copy_log_path' }
  | { type: 'dismiss'; id: string }
  | { type: 'update_launcher' }
  | { type: 'dismiss_launcher_update'; version: string }
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

/** The toast that offers a newer launcher. */
export interface ToastView {
  /** `warn` after an update that failed. */
  tone: 'warn' | 'quiet';
  icon: IconName;
  text: string;
  /** A second, quieter sentence. */
  dim: string;
  /** The button that installs the newer launcher. Disabled while it downloads. */
  update: { label: string; icon: IconName; busy: boolean };
  /**
   * The version on offer: closing the toast hides it for this version. A
   * download cannot be closed, so that a failure is always seen.
   */
  version: string;
}

export interface View {
  pill: PillView;
  notice?: NoticeView;
  steps?: StepView[];
  cta: CtaView;
  /** A smaller button left of the main one. */
  secondary?: { label: string; icon: IconName; action: Action };
  toast?: ToastView;
}

/** The launcher's own update, as the Rust side last reported it. */
export interface LauncherUpdateState {
  /** What the last check found. Null before the first check has finished. */
  update: LauncherUpdate | null;
  /** A check is running. */
  checking: boolean;
  /** The new launcher is being downloaded. The launcher restarts after it. */
  installing: boolean;
  progress: LauncherUpdateProgress | null;
  /** Why the last check or install failed, as a sentence. */
  error: string | null;
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
  /** Left out, the launcher's own update plays no part in the view. */
  launcher?: LauncherUpdateState;
  /** The launcher version whose toast was closed since this launcher started. */
  dismissedLauncher?: string | null;
}

const LOG_ACTIONS: NoticeView['actions'] = [
  { label: 'Open log folder', action: { type: 'open_logs' } },
  { label: 'Copy log path', action: { type: 'copy_log_path' } },
];

export function deriveView(input: ViewInput): View {
  const view = { ...stateView(input), toast: launcherToast(input) };
  // While the new launcher downloads, the main button shows that and nothing
  // else can be started: the launcher restarts as soon as the download is in.
  if (input.launcher?.installing) {
    return { ...view, cta: launcherBusy(input.launcher.progress), secondary: undefined };
  }
  return view;
}

/**
 * The toast for a newer launcher, when there is one to show.
 *
 * Not shown where the main button already offers the same update (a launcher
 * that is too old or could not start), not while the game runs or is being
 * installed, because the launcher cannot be replaced then, and not for a
 * version whose toast was closed.
 */
function launcherToast(input: ViewInput): ToastView | undefined {
  const { snapshot, launcher } = input;
  const version = newerLauncher(launcher);
  if (!launcher || !version || version === input.dismissedLauncher) return undefined;
  if (input.fatal || !snapshot || snapshot.remote.kind === 'launcher_too_old') return undefined;
  if (snapshot.activity.kind !== 'idle') return undefined;

  if (launcher.installing) {
    return {
      tone: 'quiet',
      icon: 'upload',
      text: `Downloading launcher ${version}.`,
      dim: 'The launcher restarts when it is done.',
      update: { label: 'Update launcher', icon: 'upload', busy: true },
      version,
    };
  }
  if (launcher.error) {
    return {
      tone: 'warn',
      icon: 'warning',
      text: sentence(launcher.error),
      dim: 'The launcher was not changed.',
      update: { label: 'Try again', icon: 'retry', busy: false },
      version,
    };
  }
  return {
    tone: 'quiet',
    icon: 'upload',
    text: `Launcher ${version} is available.`,
    dim: 'The launcher restarts to install it.',
    update: { label: 'Update launcher', icon: 'upload', busy: false },
    version,
  };
}

function stateView(input: ViewInput): View {
  const { snapshot, progress, checking, error, fatal } = input;
  const newer = newerLauncher(input.launcher);

  if (fatal || !snapshot) {
    // A launcher that cannot open its own state may be fixed by a newer one,
    // and the update does not need that state.
    if (fatal && newer) {
      return {
        pill: { tone: 'warn', icon: 'warning', text: 'launcher problem' },
        notice: {
          tone: 'warn',
          icon: 'warning',
          text: 'The launcher could not start.',
          dim: `${sentence(fatal)} Launcher ${newer} is ready to install.`,
          actions: [],
        },
        cta: launcherCta(`v${newer}`),
      };
    }
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
    return firstRunView(snapshot, checking, error, input.launcher);
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
      if (newer) {
        return {
          pill: { tone: 'warn', icon: 'upload', text: 'launcher update needed' },
          notice: launcherNotice(
            input.launcher,
            `This launcher (${snapshot.launcher_version}) is too old to install newer game versions.`,
            `Launcher ${newer} is ready to install. Version ${current} still starts.`
          ),
          cta: launcherCta(`v${snapshot.launcher_version} → v${newer}`),
          secondary: { label: `Launch v${current}`, icon: 'play', action: { type: 'launch' } },
        };
      }
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

/** The version of a newer launcher that can be installed, if the last check found one. */
function newerLauncher(launcher: LauncherUpdateState | undefined): string | null {
  return launcher?.update?.kind === 'available' ? launcher.update.version : null;
}

/** The main button when a newer launcher is the way forward. */
function launcherCta(sub: string): CtaView {
  return {
    style: 'primary',
    icon: 'upload',
    title: 'Update launcher',
    sub,
    action: { type: 'update_launcher' },
  };
}

/** The main button while the new launcher is being downloaded. */
function launcherBusy(progress: LauncherUpdateProgress | null): CtaView {
  const received = progress?.received ?? 0;
  const total = progress?.total ?? 0;
  const done = percent(received, total);
  return {
    style: 'busy',
    icon: 'upload',
    title: `Updating launcher ${done}%`,
    sub: total > 0 ? megabytesOf(received, total) : 'connecting',
    percent: done,
  };
}

/**
 * The notice of a launcher that is too old while a newer one can be
 * installed. A failed try replaces the explanation, as the answer to the
 * button that was just pressed.
 */
function launcherNotice(
  launcher: LauncherUpdateState | undefined,
  text: string,
  dim: string
): NoticeView {
  if (launcher?.error) {
    return {
      tone: 'warn',
      icon: 'warning',
      text: sentence(launcher.error),
      dim: 'The launcher was not changed.',
      actions: [{ label: 'Try again', action: { type: 'update_launcher' } }],
    };
  }
  return { tone: 'warn', icon: 'upload', text, dim, actions: [] };
}

/** The line under "Launcher version" in the settings. */
export function launcherStatusText(version: string, launcher: LauncherUpdateState): string {
  const { update, progress } = launcher;
  if (launcher.installing) {
    const received = progress?.received ?? 0;
    const total = progress?.total ?? 0;
    return total > 0
      ? `${version} · downloading the update, ${percent(received, total)}% (${megabytesOf(received, total)})`
      : `${version} · downloading the update`;
  }
  if (launcher.checking) return `${version} · checking for updates`;
  if (update?.kind === 'available') return `${version} · version ${update.version} is available`;
  if (update?.kind === 'none') return `${version} · up to date`;
  return version;
}

function firstRunView(
  snapshot: Snapshot,
  checking: boolean,
  error: string | null,
  launcher: LauncherUpdateState | undefined
): View {
  const { remote } = snapshot;
  const newer = newerLauncher(launcher);
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
    if (newer) {
      return {
        pill: { tone: 'warn', icon: 'upload', text: 'launcher update needed' },
        notice: launcherNotice(
          launcher,
          `This launcher (${snapshot.launcher_version}) is too old to install the game.`,
          `Launcher ${newer} is ready to install.`
        ),
        cta: launcherCta(`v${snapshot.launcher_version} → v${newer}`),
      };
    }
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
export function sentence(text: string): string {
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
