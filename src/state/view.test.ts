import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../bindings';
import { deriveView, type ViewInput } from './view';

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
