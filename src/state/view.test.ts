import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../bindings';
import { deriveView, launcherStatusText, type LauncherUpdateState, type ViewInput } from './view';

const MEGABYTE = 1024 * 1024;

const INSTALLED: Snapshot = {
  launcher_version: '0.1.0',
  install_root: 'C:\\root',
  logs_dir: 'C:\\root\\data\\logs',
  log_file: 'C:\\root\\data\\logs\\last-run.log',
  current: '0.9.0',
  previous: null,
  check_on_start: true,
  remote: { kind: 'up_to_date' },
  activity: { kind: 'idle' },
  notes: null,
  feed: null,
  notices: [],
};

/** The launcher's own update with nothing found and nothing running. */
const NO_LAUNCHER_UPDATE: LauncherUpdateState = {
  update: { kind: 'none' },
  checking: false,
  installing: false,
  progress: null,
  error: null,
};

const NEWER_LAUNCHER: LauncherUpdateState = {
  ...NO_LAUNCHER_UPDATE,
  update: { kind: 'available', version: '0.2.0', notes: null },
};

function view(snapshot: Partial<Snapshot>, rest: Partial<ViewInput> = {}) {
  return deriveView({
    snapshot: { ...INSTALLED, ...snapshot },
    progress: null,
    checking: false,
    error: null,
    fatal: null,
    ...rest,
  });
}

describe('deriveView', () => {
  it('ready: says up to date and launches the current version', () => {
    const ready = view({});
    expect(ready.pill).toEqual({ tone: 'ok', icon: 'dot', text: 'v 0.9.0 · up to date' });
    expect(ready.cta).toMatchObject({ title: 'Launch', sub: 'v0.9.0', action: { type: 'launch' } });
    expect(ready.notice).toBeUndefined();
  });

  it('update available: the main button installs, a smaller one still launches', () => {
    const update = view({ remote: { kind: 'update_available', version: '0.9.1', size: MEGABYTE } });
    expect(update.pill.text).toBe('v 0.9.0 · update available');
    expect(update.cta).toMatchObject({
      title: 'Update',
      sub: 'v0.9.0 → v0.9.1',
      action: { type: 'install' },
    });
    expect(update.secondary).toMatchObject({ label: 'Launch v0.9.0', action: { type: 'launch' } });
  });

  it('downloading: percent and megabytes are text, and the button is disabled', () => {
    const downloading = view(
      { activity: { kind: 'installing', version: '0.9.1' } },
      {
        progress: {
          version: '0.9.1',
          phase: 'downloading',
          received: 11.2 * MEGABYTE,
          total: 18 * MEGABYTE,
        },
      }
    );
    expect(downloading.pill.text).toBe('downloading v0.9.1');
    expect(downloading.cta).toMatchObject({
      style: 'busy',
      title: 'Updating 62%',
      sub: '11.2 of 18.0 MB',
      percent: 62,
    });
    expect(downloading.cta.action).toBeUndefined();
  });

  it('downloading before the first progress report shows zero, not NaN', () => {
    const starting = view({ current: null, activity: { kind: 'installing', version: '0.9.0' } });
    expect(starting.cta).toMatchObject({ title: 'Downloading 0%', sub: 'connecting', percent: 0 });
  });

  it('installing: shows the four steps with the current one marked', () => {
    const installing = view(
      { activity: { kind: 'installing', version: '0.9.1' } },
      { progress: { version: '0.9.1', phase: 'installing', received: MEGABYTE, total: MEGABYTE } }
    );
    expect(installing.pill.text).toBe('installing v0.9.1');
    expect(installing.steps?.map(step => step.state)).toEqual(['done', 'done', 'now', 'todo']);
    expect(installing.cta).toMatchObject({ style: 'busy', title: 'Installing', percent: 100 });
  });

  it('offline: a quiet line, a retry link, and Launch still works', () => {
    const offline = view({ remote: { kind: 'offline', reason: 'no connection' } });
    expect(offline.pill).toMatchObject({ tone: 'quiet', text: 'v 0.9.0 · offline' });
    expect(offline.notice).toMatchObject({
      tone: 'quiet',
      text: 'Could not check for updates.',
      dim: 'Version 0.9.0 still starts.',
    });
    expect(offline.notice?.actions).toEqual([{ label: 'Try again', action: { type: 'check' } }]);
    expect(offline.cta.action).toEqual({ type: 'launch' });
  });

  it('first run with a release: offers Install with the version and size', () => {
    const firstRun = view({
      current: null,
      remote: { kind: 'update_available', version: '0.9.0', size: 18 * MEGABYTE },
    });
    expect(firstRun.pill.text).toBe('not installed');
    expect(firstRun.cta).toMatchObject({
      title: 'Install',
      sub: 'v0.9.0 · 18.0 MB',
      action: { type: 'install' },
    });
  });

  it('first run without a network: one sentence, Retry, and a disabled Install', () => {
    const firstRun = view({ current: null, remote: { kind: 'offline', reason: 'no connection' } });
    expect(firstRun.notice?.text).toBe(
      'Night Maze needs an internet connection once, to download the game.'
    );
    expect(firstRun.cta.style).toBe('off');
    expect(firstRun.cta.action).toBeUndefined();
    expect(firstRun.secondary).toMatchObject({ label: 'Retry', action: { type: 'check' } });
  });

  it('rolled back: names both versions and offers the log', () => {
    const rolledBack = view({
      notices: [
        {
          id: 'local-3',
          kind: 'rolled_back',
          failed: '0.9.1',
          restored: '0.9.0',
          detail: '[error] x',
        },
      ],
    });
    expect(rolledBack.pill).toMatchObject({ tone: 'warn', text: 'v 0.9.0 · rolled back' });
    expect(rolledBack.notice).toMatchObject({
      text: 'Version 0.9.1 did not start. You are back on 0.9.0.',
      detail: '[error] x',
    });
    expect(rolledBack.notice?.actions.map(entry => entry.label)).toEqual([
      'Open log folder',
      'Copy log path',
      'Dismiss',
    ]);
    expect(rolledBack.notice?.actions.at(-1)?.action).toEqual({ type: 'dismiss', id: 'local-3' });
    expect(rolledBack.cta.action).toEqual({ type: 'launch' });
  });

  it('a start that failed with nothing to go back to says so without "rolled back"', () => {
    const failed = view({ notices: [{ id: 'local-1', kind: 'start_failed', failed: '0.9.0' }] });
    expect(failed.pill.text).toBe('v 0.9.0 · did not start');
    expect(failed.notice?.text).toBe('Version 0.9.0 did not start.');
  });

  it('a refused update keeps Launch and offers to try again', () => {
    const refused = view(
      { remote: { kind: 'update_available', version: '0.9.1', size: MEGABYTE } },
      { error: 'The download does not match its checksum, so it was not installed' }
    );
    expect(refused.notice).toMatchObject({
      tone: 'warn',
      text: 'The download does not match its checksum, so it was not installed.',
      dim: 'Version 0.9.0 still starts.',
    });
    expect(refused.notice?.actions[0]).toEqual({ label: 'Try again', action: { type: 'install' } });
    expect(refused.cta).toMatchObject({ title: 'Launch', action: { type: 'launch' } });
  });

  it('launcher too old: explains it and the installed game still starts', () => {
    const tooOld = view({ remote: { kind: 'launcher_too_old', required: '0.2.0' } });
    expect(tooOld.pill.text).toBe('launcher update needed');
    expect(tooOld.notice?.text).toContain('This launcher (0.1.0) is too old');
    expect(tooOld.cta.action).toEqual({ type: 'launch' });
  });

  it('launcher too old without a newer launcher found keeps Launch and the hint', () => {
    const tooOld = view(
      { remote: { kind: 'launcher_too_old', required: '0.2.0' } },
      { launcher: NO_LAUNCHER_UPDATE }
    );
    expect(tooOld.notice?.dim).toContain('Get launcher 0.2.0 or newer');
    expect(tooOld.cta).toMatchObject({ title: 'Launch', action: { type: 'launch' } });
    expect(tooOld.secondary).toBeUndefined();
  });

  it('launcher too old with a newer launcher: the main button updates the launcher', () => {
    const tooOld = view(
      { remote: { kind: 'launcher_too_old', required: '0.2.0' } },
      { launcher: NEWER_LAUNCHER }
    );
    expect(tooOld.pill.text).toBe('launcher update needed');
    expect(tooOld.cta).toMatchObject({
      style: 'primary',
      title: 'Update launcher',
      sub: 'v0.1.0 → v0.2.0',
      action: { type: 'update_launcher' },
    });
    expect(tooOld.notice?.dim).toBe(
      'Launcher 0.2.0 is ready to install. Version 0.9.0 still starts.'
    );
    // The installed game still starts, from the smaller button.
    expect(tooOld.secondary).toMatchObject({ label: 'Launch v0.9.0', action: { type: 'launch' } });
  });

  it('first run with a launcher that is too old offers the launcher update', () => {
    const firstRun = view(
      { current: null, remote: { kind: 'launcher_too_old', required: '0.2.0' } },
      { launcher: NEWER_LAUNCHER }
    );
    expect(firstRun.cta).toMatchObject({
      title: 'Update launcher',
      action: { type: 'update_launcher' },
    });
    expect(firstRun.secondary).toBeUndefined();

    const withoutUpdate = view({
      current: null,
      remote: { kind: 'launcher_too_old', required: '0.2.0' },
    });
    expect(withoutUpdate.cta).toMatchObject({ style: 'off', sub: 'launcher too old' });
  });

  it('a newer launcher changes nothing while the game can still be updated', () => {
    const update = view(
      { remote: { kind: 'update_available', version: '0.9.1', size: MEGABYTE } },
      { launcher: NEWER_LAUNCHER }
    );
    expect(update.cta).toMatchObject({ title: 'Update', action: { type: 'install' } });

    const ready = view({}, { launcher: NEWER_LAUNCHER });
    expect(ready.cta).toMatchObject({ title: 'Launch', action: { type: 'launch' } });
  });

  it('while the new launcher downloads the main button shows it and starts nothing', () => {
    const downloading = view(
      { remote: { kind: 'launcher_too_old', required: '0.2.0' } },
      {
        launcher: {
          ...NEWER_LAUNCHER,
          installing: true,
          progress: { received: 2.5 * MEGABYTE, total: 5 * MEGABYTE },
        },
      }
    );
    expect(downloading.cta).toMatchObject({
      style: 'busy',
      title: 'Updating launcher 50%',
      sub: '2.5 of 5.0 MB',
      percent: 50,
    });
    expect(downloading.cta.action).toBeUndefined();
    expect(downloading.secondary).toBeUndefined();

    // Started from the settings while the game is up to date: Launch is gone too.
    const fromSettings = view({}, { launcher: { ...NEWER_LAUNCHER, installing: true } });
    expect(fromSettings.cta).toMatchObject({
      style: 'busy',
      title: 'Updating launcher 0%',
      sub: 'connecting',
    });
    expect(fromSettings.cta.action).toBeUndefined();
  });

  it('a failed launcher update is explained and can be tried again', () => {
    const failed = view(
      { remote: { kind: 'launcher_too_old', required: '0.2.0' } },
      { launcher: { ...NEWER_LAUNCHER, error: 'Close the game first, then update the launcher' } }
    );
    expect(failed.notice).toMatchObject({
      tone: 'warn',
      text: 'Close the game first, then update the launcher.',
    });
    expect(failed.notice?.actions).toEqual([
      { label: 'Try again', action: { type: 'update_launcher' } },
    ]);
    expect(failed.cta.action).toEqual({ type: 'update_launcher' });
  });

  it('a launcher that could not start offers a newer launcher when there is one', () => {
    const broken = deriveView({
      snapshot: null,
      progress: null,
      checking: false,
      error: null,
      fatal: 'Could not read the state file',
      launcher: NEWER_LAUNCHER,
    });
    expect(broken.cta).toMatchObject({
      title: 'Update launcher',
      sub: 'v0.2.0',
      action: { type: 'update_launcher' },
    });
    expect(broken.notice?.dim).toBe(
      'Could not read the state file. Launcher 0.2.0 is ready to install.'
    );
  });

  it('running: the button is disabled while the game is open', () => {
    const running = view({ activity: { kind: 'running', version: '0.9.0', pid: 42 } });
    expect(running.pill.text).toBe('v 0.9.0 · running');
    expect(running.cta).toMatchObject({ style: 'off', title: 'Running' });
    expect(running.cta.action).toBeUndefined();
  });

  it('before the first snapshot and on a fatal error nothing can be started', () => {
    const starting = deriveView({
      snapshot: null,
      progress: null,
      checking: false,
      error: null,
      fatal: null,
    });
    expect(starting.cta.action).toBeUndefined();

    const broken = deriveView({
      snapshot: null,
      progress: null,
      checking: false,
      error: null,
      fatal: 'Could not read the state file',
    });
    expect(broken.notice).toMatchObject({ tone: 'warn', dim: 'Could not read the state file' });
    expect(broken.cta.action).toBeUndefined();
  });
});

describe('the launcher update toast', () => {
  const TOO_OLD: Partial<Snapshot> = { remote: { kind: 'launcher_too_old', required: '0.2.0' } };

  it('offers a newer launcher with its version', () => {
    const { toast } = view({}, { launcher: NEWER_LAUNCHER });
    expect(toast).toEqual({
      tone: 'quiet',
      icon: 'upload',
      text: 'Launcher 0.2.0 is available.',
      dim: 'The launcher restarts to install it.',
      update: { label: 'Update launcher', icon: 'upload', busy: false },
      version: '0.2.0',
    });
  });

  it('is shown next to a game update too', () => {
    const update = view(
      { remote: { kind: 'update_available', version: '0.9.1', size: MEGABYTE } },
      { launcher: NEWER_LAUNCHER }
    );
    expect(update.toast?.text).toBe('Launcher 0.2.0 is available.');
    expect(update.cta.action).toEqual({ type: 'install' });
  });

  it('is not shown without a newer launcher, before a check or after a quiet failed one', () => {
    expect(view({}).toast).toBeUndefined();
    expect(view({}, { launcher: NO_LAUNCHER_UPDATE }).toast).toBeUndefined();
    expect(view({}, { launcher: { ...NO_LAUNCHER_UPDATE, update: null } }).toast).toBeUndefined();
  });

  it('stays closed for the version it was closed for, and comes back for a newer one', () => {
    const closed = view({}, { launcher: NEWER_LAUNCHER, dismissedLauncher: '0.2.0' });
    expect(closed.toast).toBeUndefined();

    const newer = view({}, { launcher: NEWER_LAUNCHER, dismissedLauncher: '0.1.9' });
    expect(newer.toast?.version).toBe('0.2.0');
  });

  it('is left out where the main button already offers the launcher update', () => {
    const tooOld = view(TOO_OLD, { launcher: NEWER_LAUNCHER });
    expect(tooOld.cta.action).toEqual({ type: 'update_launcher' });
    expect(tooOld.toast).toBeUndefined();

    const broken = deriveView({
      snapshot: null,
      progress: null,
      checking: false,
      error: null,
      fatal: 'Could not read the state file',
      launcher: NEWER_LAUNCHER,
    });
    expect(broken.cta.action).toEqual({ type: 'update_launcher' });
    expect(broken.toast).toBeUndefined();
  });

  it('is not shown while the game runs or is being installed', () => {
    const running = view(
      { activity: { kind: 'running', version: '0.9.0', pid: 42 } },
      { launcher: NEWER_LAUNCHER }
    );
    expect(running.toast).toBeUndefined();

    const installing = view(
      { activity: { kind: 'installing', version: '0.9.1' } },
      { launcher: NEWER_LAUNCHER }
    );
    expect(installing.toast).toBeUndefined();
  });

  it('stays while the new launcher downloads, with its button disabled', () => {
    const downloading = view({}, { launcher: { ...NEWER_LAUNCHER, installing: true } });
    expect(downloading.toast).toMatchObject({
      text: 'Downloading launcher 0.2.0.',
      update: { busy: true },
    });
    // The progress is on the main button, as it is when started from the settings.
    expect(downloading.cta).toMatchObject({ style: 'busy', title: 'Updating launcher 0%' });
  });

  it('a failed update is explained in the toast and can be tried again', () => {
    const failed = view(
      {},
      { launcher: { ...NEWER_LAUNCHER, error: 'Could not reach the launcher update server' } }
    );
    expect(failed.toast).toMatchObject({
      tone: 'warn',
      icon: 'warning',
      text: 'Could not reach the launcher update server.',
      dim: 'The launcher was not changed.',
      update: { label: 'Try again', icon: 'retry', busy: false },
    });
    expect(failed.cta.action).toEqual({ type: 'launch' });
  });
});

describe('launcherStatusText', () => {
  it('says what the last check found, next to the version', () => {
    const idle = { ...NO_LAUNCHER_UPDATE, update: null };
    expect(launcherStatusText('0.1.0', idle)).toBe('0.1.0');
    expect(launcherStatusText('0.1.0', { ...idle, checking: true })).toBe(
      '0.1.0 · checking for updates'
    );
    expect(launcherStatusText('0.1.0', NO_LAUNCHER_UPDATE)).toBe('0.1.0 · up to date');
    expect(launcherStatusText('0.1.0', NEWER_LAUNCHER)).toBe('0.1.0 · version 0.2.0 is available');
  });

  it('shows the download as percent and megabytes', () => {
    const downloading = { ...NEWER_LAUNCHER, installing: true };
    expect(launcherStatusText('0.1.0', downloading)).toBe('0.1.0 · downloading the update');
    expect(
      launcherStatusText('0.1.0', {
        ...downloading,
        progress: { received: 2.5 * MEGABYTE, total: 5 * MEGABYTE },
      })
    ).toBe('0.1.0 · downloading the update, 50% (2.5 of 5.0 MB)');
  });
});
