// Packs one game build into the zip a release publishes.
//
//   node launcher/scripts/package-game.mjs --exe build/release/Release/night_maze.exe \
//     --version 0.9.0 --out <folder> [--platform windows-x64] \
//     [--assets assets] [--notices THIRD-PARTY-NOTICES.txt]
//
// The zip holds the executable, the assets folder and the notices file:
//
//   NightMaze-0.9.0-windows-x64.zip
//     night_maze.exe
//     assets/...
//     THIRD-PARTY-NOTICES.txt
//
// Assets are read from the repository, not from the build directory: on macOS
// the build directory only holds a link to them, and on Windows its copy can
// contain files that were deleted from the repository since.
//
// For a local test of the launcher, add `--base-url http://127.0.0.1:8123/`:
// manifest.json and news.json are then written next to the zip, exactly as the
// release workflow does it with build-feed.mjs. Both files are then signed
// (manifest.json.sig, news.json.sig) with the development key. For a github.com
// address pass `--sign-key <key>` (the password comes from the environment,
// see sign-file.mjs) or `--no-sign`. See launcher/README.md.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  argument,
  buildManifest,
  buildNews,
  executableName,
  flag,
  isVersion,
  packageName,
} from './lib/feed.mjs';
import { feedSigningKey, signFeed } from './lib/sign.mjs';
import { createZip } from './lib/zip.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Files that are never part of a package, wherever they are. */
const SKIPPED = new Set(['.DS_Store', 'Thumbs.db', 'imgui.ini']);

function defaultPlatform() {
  if (process.platform === 'win32') return 'windows-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  throw new Error('pass --platform: this system is not a release target');
}

/** Every file under `directory`, as paths relative to it with forward slashes. */
function filesUnder(directory, prefix = '') {
  const found = [];
  for (const name of readdirSync(directory).sort()) {
    if (SKIPPED.has(name)) continue;
    const path = join(directory, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(path).isDirectory()) found.push(...filesUnder(path, relative));
    else found.push(relative);
  }
  return found;
}

const exe = argument('exe');
const version = argument('version');
const out = argument('out');
if (!exe || !version || !out) {
  console.error('usage: package-game.mjs --exe <file> --version <x.y.z> --out <folder>');
  process.exit(2);
}
if (!isVersion(version)) {
  console.error(`not a version: ${version}`);
  process.exit(2);
}

const baseUrl = argument('base-url');
let signingKey = null;
if (baseUrl) {
  try {
    signingKey = feedSigningKey({
      baseUrl,
      signKey: argument('sign-key'),
      noSign: flag('no-sign'),
    });
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

const platform = argument('platform', defaultPlatform());
const assets = resolve(argument('assets', join(repoRoot, 'assets')));
const notices = resolve(argument('notices', join(repoRoot, 'THIRD-PARTY-NOTICES.txt')));
for (const [what, path] of [
  ['executable', resolve(exe)],
  ['assets folder', assets],
  ['notices file', notices],
]) {
  if (!existsSync(path)) {
    console.error(`the ${what} does not exist: ${path}`);
    process.exit(1);
  }
}

const entries = [
  { name: executableName(platform), data: readFileSync(resolve(exe)), mode: 0o755 },
  ...filesUnder(assets).map(file => ({
    name: `assets/${file}`,
    data: readFileSync(join(assets, file)),
  })),
  { name: 'THIRD-PARTY-NOTICES.txt', data: readFileSync(notices) },
];

const outDirectory = resolve(out);
mkdirSync(outDirectory, { recursive: true });
const zipPath = join(outDirectory, packageName(version, platform));
const zip = createZip(entries);
writeFileSync(zipPath, zip);
console.log(`${zipPath}: ${entries.length} files, ${zip.length} bytes`);

if (baseUrl) {
  const changelogPath = argument('changelog');
  const changelog =
    changelogPath && existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
  const news = buildNews({ version, changelog, fallbackTitle: argument('title') });
  const current = news.updates.find(entry => entry.version === version);
  const manifest = buildManifest({
    directory: outDirectory,
    version,
    baseUrl,
    notes: current?.summary || current?.title,
    launcherMin: argument('launcher-min', '0.1.0'),
  });
  writeFileSync(join(outDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDirectory, 'news.json'), `${JSON.stringify(news, null, 2)}\n`);
  console.log(`manifest.json and news.json written for ${baseUrl}`);
  try {
    signFeed(outDirectory, signingKey);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
