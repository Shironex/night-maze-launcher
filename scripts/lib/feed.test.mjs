// Run with: node --test launcher/scripts/lib

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { buildManifest, buildNews, parseChangelog } from './feed.mjs';
import { createZip } from './zip.mjs';

const CHANGELOG = `# Changelog

Text before the first version is ignored.

## 0.9.1 (2026-12-12) Fix release

Brighter crystals and a fix for the exit gate

A small release after the
first round of feedback.

### Gameplay
- The exit gate opens on the last crystal
- Crystals glow
  further than before

### Fixes
* The battery no longer drains while the game is paused

## 0.9.0 (2026-12-05) Milestone release

The whole maze

- A bullet without a group
`;

test('a changelog becomes release notes, newest first', () => {
  const [newest, older] = parseChangelog(CHANGELOG);

  assert.equal(newest.version, '0.9.1');
  assert.equal(newest.date, '2026-12-12');
  assert.equal(newest.tag, 'Fix release');
  assert.equal(newest.title, 'Brighter crystals and a fix for the exit gate');
  assert.equal(newest.summary, 'A small release after the first round of feedback.');
  assert.deepEqual(newest.groups, [
    {
      title: 'Gameplay',
      items: ['The exit gate opens on the last crystal', 'Crystals glow further than before'],
    },
    { title: 'Fixes', items: ['The battery no longer drains while the game is paused'] },
  ]);

  assert.equal(older.version, '0.9.0');
  assert.equal(older.title, 'The whole maze');
  assert.deepEqual(older.groups, [{ title: 'Changes', items: ['A bullet without a group'] }]);
});

test('heading variants are understood', () => {
  const versions = parseChangelog(
    '## [1.2.3] 2026-01-02\n\n## v1.2.2\n\n## 1.2.1 - 2026-01-01 Hotfix\n'
  );
  assert.deepEqual(
    versions.map(entry => [entry.version, entry.date, entry.tag]),
    [
      ['1.2.3', '2026-01-02', ''],
      ['1.2.2', '', ''],
      ['1.2.1', '2026-01-01', 'Hotfix'],
    ]
  );
});

test('the released version is the highlight', () => {
  const news = buildNews({ version: '0.9.0', changelog: CHANGELOG });
  assert.deepEqual(
    news.updates.map(entry => [entry.version, entry.highlight]),
    [
      ['0.9.1', false],
      ['0.9.0', true],
    ]
  );
  assert.equal(news.schema, 1);
  assert.deepEqual(news.news, []);
});

test('a release without a changelog section still gets an entry', () => {
  const news = buildNews({
    version: '0.9.2',
    changelog: CHANGELOG,
    fallbackTitle: 'Tag message',
    today: '2026-12-20',
  });
  assert.deepEqual(news.updates[0], {
    version: '0.9.2',
    date: '2026-12-20',
    tag: '',
    title: 'Tag message',
    summary: '',
    highlight: true,
    groups: [],
  });
  assert.equal(buildNews({ version: '1.0.0' }).updates[0].title, 'Version 1.0.0');
});

test('the manifest names every package of the version with its size and checksum', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nm-feed-'));
  try {
    const windows = Buffer.from('windows package');
    writeFileSync(join(directory, 'NightMaze-0.9.0-windows-x64.zip'), windows);
    writeFileSync(join(directory, 'NightMaze-0.9.0-macos-arm64.zip'), 'mac package');
    writeFileSync(join(directory, 'NightMaze-0.8.0-windows-x64.zip'), 'an older version');
    writeFileSync(join(directory, 'notes.txt'), 'not a package');

    const manifest = buildManifest({
      directory,
      version: '0.9.0',
      baseUrl: 'https://github.com/Shironex/night-maze/releases/download/v0.9.0',
      notes: 'One line',
      published: '2026-12-05T18:00:00Z',
    });

    assert.deepEqual(Object.keys(manifest.game), ['macos-arm64', 'windows-x64']);
    assert.deepEqual(manifest.game['windows-x64'], {
      url: 'https://github.com/Shironex/night-maze/releases/download/v0.9.0/NightMaze-0.9.0-windows-x64.zip',
      size: windows.length,
      sha256: createHash('sha256').update(windows).digest('hex'),
      exe: 'night_maze.exe',
    });
    assert.equal(manifest.game['macos-arm64'].exe, 'night_maze');
    assert.equal(
      manifest.feed,
      'https://github.com/Shironex/night-maze/releases/download/v0.9.0/news.json'
    );
    assert.deepEqual(manifest.launcher, { min: '0.1.0' });
    assert.equal(manifest.schema, 1);

    assert.throws(() => buildManifest({ directory, version: '1.0.0', baseUrl: 'https://x/' }));
    assert.throws(() => buildManifest({ directory, version: 'v0.9.0', baseUrl: 'https://x/' }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a zip made here can be read back entry by entry', () => {
  const body = Buffer.from('void main() {}\n'.repeat(40));
  const zip = createZip(
    [
      { name: 'night_maze', data: Buffer.from('binary'), mode: 0o755 },
      { name: 'assets/shaders/lit.frag', data: body },
    ],
    new Date(2026, 11, 5, 18, 0, 0)
  );

  // End of central directory: two entries.
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2);

  // First central entry: Unix mode 755 on a regular file.
  const central = zip.readUInt32LE(end + 16);
  assert.equal(zip.readUInt32LE(central), 0x02014b50);
  assert.equal(zip.readUInt32LE(central + 38) >>> 16, 0o100755);

  // Second local entry: find it through the central directory and inflate it.
  const second = central + 46 + zip.readUInt16LE(central + 28);
  const offset = zip.readUInt32LE(second + 42);
  const nameLength = zip.readUInt16LE(offset + 26);
  const compressedSize = zip.readUInt32LE(offset + 18);
  const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
  const data = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + compressedSize);
  assert.equal(name, 'assets/shaders/lit.frag');
  assert.deepEqual(inflateRawSync(data), body);

  assert.throws(() => createZip([{ name: '../escape.txt', data: Buffer.from('x') }]));
  assert.throws(() => createZip([{ name: '/absolute.txt', data: Buffer.from('x') }]));
});
