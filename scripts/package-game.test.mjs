// Run with: node --test launcher/scripts
//
// Runs the packager on a tiny fake game folder. Signing starts the real Tauri
// CLI; without it (no `pnpm install`) the signing test is skipped.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findTauriCli, isBase64 } from './lib/sign.mjs';

const script = join(dirname(fileURLToPath(import.meta.url)), 'package-game.mjs');
const skip = findTauriCli() ? false : 'the Tauri CLI is not installed: run `pnpm install`';

/** A fake build: an executable, one asset and a notices file. */
function fakeGame(directory) {
  mkdirSync(join(directory, 'assets'), { recursive: true });
  writeFileSync(join(directory, 'night_maze.exe'), 'fake executable');
  writeFileSync(join(directory, 'assets', 'level.txt'), 'fake asset');
  writeFileSync(join(directory, 'NOTICES.txt'), 'fake notices');
}

function packageGame(directory, extra) {
  return spawnSync(
    process.execPath,
    [
      script,
      '--exe',
      join(directory, 'night_maze.exe'),
      '--assets',
      join(directory, 'assets'),
      '--notices',
      join(directory, 'NOTICES.txt'),
      '--version',
      '0.9.0',
      '--platform',
      'windows-x64',
      '--out',
      join(directory, 'out'),
      ...extra,
    ],
    { encoding: 'utf8' }
  );
}

test('a local feed is signed with the dev key', { skip }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'nm-package-'));
  try {
    fakeGame(directory);
    const result = packageGame(directory, ['--base-url', 'http://127.0.0.1:8123/']);
    assert.equal(result.status, 0, result.stderr);
    for (const name of ['manifest.json.sig', 'news.json.sig']) {
      const path = join(directory, 'out', name);
      assert.ok(existsSync(path), `${name} was not written`);
      const text = readFileSync(path, 'utf8');
      assert.ok(text.length > 0 && isBase64(text), `${name} is not base64`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('--no-sign writes no signatures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nm-package-'));
  try {
    fakeGame(directory);
    const result = packageGame(directory, ['--base-url', 'http://127.0.0.1:8123/', '--no-sign']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(directory, 'out', 'manifest.json')));
    assert.ok(!existsSync(join(directory, 'out', 'manifest.json.sig')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('a GitHub release address needs --sign-key or --no-sign', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nm-package-'));
  try {
    fakeGame(directory);
    const result = packageGame(directory, [
      '--base-url',
      'https://github.com/Shironex/night-maze/releases/download/v0.9.0/',
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--sign-key/);
    assert.ok(!existsSync(join(directory, 'out')), 'nothing is written before the refusal');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
