// Writes manifest.json and news.json for one release.
//
//   node scripts/build-feed.mjs --dir <folder with the zips> --version 0.9.0 \
//     --base-url https://github.com/Shironex/night-maze/releases/download/v0.9.0/ \
//     [--changelog CHANGELOG.md] [--extra news-extra.json] [--title "tag message"] \
//     [--launcher-min 0.1.0] [--out <folder>] [--sign-key <key>] [--no-sign]
//
// `--dir` holds the packages made by package-game.mjs. Both files are written
// to `--out`, which defaults to `--dir`, and signed (manifest.json.sig,
// news.json.sig). For a github.com address `--sign-key` is required (the
// password comes from the environment, see sign-file.mjs) unless `--no-sign`;
// any other address is signed with the development key by default.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argument, buildManifest, buildNews, flag } from './lib/feed.mjs';
import { feedSigningKey, signFeed } from './lib/sign.mjs';

const directory = argument('dir');
const version = argument('version');
const baseUrl = argument('base-url');
if (!directory || !version || !baseUrl) {
  console.error('usage: build-feed.mjs --dir <folder> --version <x.y.z> --base-url <url>');
  process.exit(2);
}
const out = resolve(argument('out', directory));
let signingKey;
try {
  signingKey = feedSigningKey({ baseUrl, signKey: argument('sign-key'), noSign: flag('no-sign') });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const changelogPath = argument('changelog');
const changelog =
  changelogPath && existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '';
if (changelogPath && !changelog) {
  console.warn(`no changelog at ${changelogPath}: the notes fall back to the title`);
}
const extraPath = argument('extra');
const extra = extraPath && existsSync(extraPath) ? JSON.parse(readFileSync(extraPath, 'utf8')) : {};

const news = buildNews({ version, changelog, fallbackTitle: argument('title'), extra });
const current = news.updates.find(entry => entry.version === version);
const manifest = buildManifest({
  directory: resolve(directory),
  version,
  baseUrl,
  notes: current?.summary || current?.title,
  launcherMin: argument('launcher-min', '0.1.0'),
});

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(out, 'news.json'), `${JSON.stringify(news, null, 2)}\n`);
console.log(
  `manifest.json: version ${version}, platforms ${Object.keys(manifest.game).join(', ')}`
);
console.log(`news.json: ${news.updates.length} release(s)`);
try {
  signFeed(out, signingKey);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
