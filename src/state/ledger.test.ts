import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../bindings';
import { marginNotes, statusSentence, waitingVersion } from './ledger';
import { deriveView } from './view';

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

const QUIET = { progress: null, checking: false, error: null, fatal: null };

function sentence(snapshot: Partial<Snapshot>, rest: Partial<typeof QUIET> = {}) {
  return statusSentence({ ...QUIET, snapshot: { ...INSTALLED, ...snapshot }, ...rest });
}

describe('statusSentence', () => {
  it('says what is installed', () => {
    expect(sentence({})).toBe('Night Maze 0.9.0 is installed and up to date.');
    expect(sentence({ remote: { kind: 'unknown' } })).toBe('Night Maze 0.9.0 is installed.');
    expect(sentence({ remote: { kind: 'unknown' } }, { checking: true })).toBe(
      'Night Maze 0.9.0 is installed. Checking for updates.'
    );
    expect(sentence({ remote: { kind: 'offline', reason: 'no network' } })).toBe(
      'Night Maze 0.9.0 is installed.'
    );
  });

  it('names both versions when a newer one is out', () => {
    expect(sentence({ remote: { kind: 'update_available', version: '0.10.0', size: 1 } })).toBe(
      'Night Maze 0.10.0 is out. 0.9.0 is installed here.'
    );
  });

  it('follows the three phases of an install', () => {
    const installing = { activity: { kind: 'installing', version: '0.10.0' } } as const;
    const progress = { version: '0.10.0', received: 1, total: 2 };
    expect(sentence(installing)).toBe('Fetching Night Maze 0.10.0.');
    expect(
      statusSentence({
        ...QUIET,
        snapshot: { ...INSTALLED, ...installing },
        progress: { ...progress, phase: 'verifying' },
      })
    ).toBe('Checking Night Maze 0.10.0.');
    expect(
      statusSentence({
        ...QUIET,
        snapshot: { ...INSTALLED, ...installing },
        progress: { ...progress, phase: 'installing' },
      })
    ).toBe('Unpacking Night Maze 0.10.0.');
  });

  it('says that the game runs', () => {
    expect(sentence({ activity: { kind: 'running', version: '0.9.0', pid: 1 } })).toBe(
      'Night Maze 0.9.0 is running.'
    );
  });

  it('speaks of the first install when nothing is installed', () => {
    const nothing = { current: null, remote: { kind: 'unknown' } } as const;
    expect(sentence(nothing)).toBe('Night Maze is not installed yet.');
    expect(sentence(nothing, { checking: true })).toBe('Looking for the newest Night Maze.');
    expect(
      sentence({ current: null, remote: { kind: 'update_available', version: '0.10.0', size: 1 } })
    ).toBe('Night Maze 0.10.0 is ready to install.');
  });

  it('has a sentence before the launcher has read its state, and when it cannot', () => {
    expect(statusSentence({ ...QUIET, snapshot: null })).toBe('The launcher is starting.');
    expect(statusSentence({ ...QUIET, snapshot: null, fatal: 'no state' })).toBe(
      'The launcher could not start.'
    );
  });
});

describe('waitingVersion', () => {
  it('is the release that is found or being installed', () => {
    expect(waitingVersion(null)).toBeNull();
    expect(waitingVersion(INSTALLED)).toBeNull();
    expect(
      waitingVersion({
        ...INSTALLED,
        remote: { kind: 'update_available', version: '0.10.0', size: 1 },
      })
    ).toBe('0.10.0');
    expect(
      waitingVersion({ ...INSTALLED, activity: { kind: 'installing', version: '0.10.0' } })
    ).toBe('0.10.0');
  });
});

describe('marginNotes', () => {
  const WITH_NOTICES: Snapshot = {
    ...INSTALLED,
    feed: {
      schema: 1,
      notices: [
        { id: 'a', level: 'warning', title: 'Version 0.8.0 was pulled.', body: 'It crashed.' },
        { id: 'b', level: 'info', title: 'A new seed format.', body: 'Old seeds still work.' },
      ],
    },
    notices: [
      { id: 'local-1', kind: 'start_failed', failed: '0.7.0', detail: '[error] no OpenGL' },
      { id: 'local-2', kind: 'rolled_back', failed: '0.10.0', restored: '0.9.0' },
    ],
  };

  it('holds every notice the notice line does not show', () => {
    const view = deriveView({ ...QUIET, snapshot: WITH_NOTICES });
    expect(view.notice?.text).toBe('Version 0.10.0 did not start. You are back on 0.9.0.');
    expect(marginNotes(WITH_NOTICES, view.notice)).toEqual([
      {
        key: 'local-1',
        label: 'This computer',
        text: 'Version 0.7.0 did not start.',
        detail: '[error] no OpenGL',
      },
      { key: 'a-0', label: 'Warning', text: 'Version 0.8.0 was pulled.', detail: 'It crashed.' },
      { key: 'b-1', label: 'Notice', text: 'A new seed format.', detail: 'Old seeds still work.' },
    ]);
  });

  it('holds the notices of this computer too while another message has the notice line', () => {
    const view = deriveView({ ...QUIET, snapshot: WITH_NOTICES, error: 'The download failed' });
    expect(marginNotes(WITH_NOTICES, view.notice).map(note => note.key)).toEqual([
      'local-1',
      'local-2',
      'a-0',
      'b-1',
    ]);
  });

  it('is empty without notices and without a snapshot', () => {
    expect(marginNotes(INSTALLED, undefined)).toEqual([]);
    expect(marginNotes(null, undefined)).toEqual([]);
  });
});
