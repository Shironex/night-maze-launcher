// Builds the two files a release publishes next to its zips: manifest.json
// (which version, where, how large, which checksum) and news.json (the notes
// the launcher window shows). Node builtins only.
//
// Used by the release workflow and by the local packager, so a local test of
// the launcher reads files made by the same code as a real release.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SCHEMA = 1;

/** `NightMaze-0.9.0-windows-x64.zip` */
const PACKAGE_NAME = /^NightMaze-(\d+\.\d+\.\d+)-([a-z0-9]+-[a-z0-9]+)\.zip$/;

/** `## 0.9.0 (2026-12-05) Milestone release`. The date and the tag are optional. */
export const VERSION_HEADING =
  /^##\s+\[?v?(\d+\.\d+\.\d+)\]?\s*(?:-\s*)?(?:\(?(\d{4}-\d{2}-\d{2})\)?)?\s*(.*)$/;

export function packageName(version, platform) {
  return `NightMaze-${version}-${platform}.zip`;
}

/** The executable inside the package of `platform`. */
export function executableName(platform) {
  return platform.startsWith('windows') ? 'night_maze.exe' : 'night_maze';
}

export function isVersion(text) {
  return /^\d+\.\d+\.\d+$/.test(text);
}

/**
 * The manifest of `version`, from the packages found in `directory`.
 *
 * @param {{ directory: string, version: string, baseUrl: string, notes?: string,
 *           launcherMin?: string, published?: string }} options
 *   `baseUrl` is where the files of this release will be downloadable. Packages
 *   of other versions in the directory are ignored.
 */
export function buildManifest(options) {
  const { directory, version, baseUrl, notes, launcherMin = '0.1.0', published } = options;
  if (!isVersion(version)) throw new Error(`not a version: ${version}`);
  if (!isVersion(launcherMin)) throw new Error(`not a launcher version: ${launcherMin}`);
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  const game = {};
  for (const file of readdirSync(directory).sort()) {
    const match = PACKAGE_NAME.exec(file);
    if (!match || match[1] !== version) continue;
    const bytes = readFileSync(join(directory, file));
    game[match[2]] = {
      url: new URL(file, base).href,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      exe: executableName(match[2]),
    };
  }
  if (Object.keys(game).length === 0) {
    throw new Error(`no package of version ${version} in ${directory}`);
  }

  return {
    schema: SCHEMA,
    channel: 'stable',
    version,
    published: published ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    ...(notes ? { notes } : {}),
    feed: new URL('news.json', base).href,
    game,
    launcher: { min: launcherMin },
  };
}

/**
 * Release notes from a changelog, newest first.
 *
 * One section per version:
 *
 *     ## 0.9.0 (2026-12-05) Milestone release
 *
 *     The headline of the release
 *
 *     One intro sentence, on one or more lines.
 *
 *     ### Gameplay
 *     - A bullet point
 *
 * Text before the first version heading is ignored.
 */
export function parseChangelog(markdown) {
  const releases = [];
  let release = null;
  let group = null;
  let paragraph = [];

  const closeParagraph = () => {
    if (release && !group && paragraph.length > 0) {
      const text = paragraph.join(' ');
      if (!release.title) release.title = text;
      else release.summary = release.summary ? `${release.summary} ${text}` : text;
    }
    paragraph = [];
  };

  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = VERSION_HEADING.exec(line);

    if (heading) {
      closeParagraph();
      release = {
        version: heading[1],
        date: heading[2] ?? '',
        tag: heading[3].replace(/^[-:\s]+/, '').trim(),
        title: '',
        summary: '',
        highlight: false,
        groups: [],
      };
      group = null;
      releases.push(release);
    } else if (!release) {
      continue;
    } else if (line.startsWith('### ')) {
      closeParagraph();
      group = { title: line.slice(4).trim(), items: [] };
      release.groups.push(group);
    } else if (/^[-*]\s+/.test(line)) {
      closeParagraph();
      if (!group) {
        group = { title: 'Changes', items: [] };
        release.groups.push(group);
      }
      group.items.push(line.replace(/^[-*]\s+/, ''));
    } else if (line === '') {
      closeParagraph();
    } else if (group && group.items.length > 0) {
      // A wrapped bullet point continues on the next line.
      group.items[group.items.length - 1] += ` ${line}`;
    } else {
      paragraph.push(line);
    }
  }
  closeParagraph();
  return releases;
}

/**
 * news.json for a release of `version`.
 *
 * The release is published also when the changelog has no section for it: the
 * entry then carries the version, today's date and `fallbackTitle`.
 *
 * @param {{ version: string, changelog?: string, fallbackTitle?: string,
 *           extra?: { news?: unknown[], notices?: unknown[] }, today?: string }} options
 */
export function buildNews(options) {
  const { version, changelog = '', fallbackTitle, extra = {}, today } = options;
  const updates = parseChangelog(changelog);

  let current = updates.find(entry => entry.version === version);
  if (!current) {
    current = {
      version,
      date: today ?? new Date().toISOString().slice(0, 10),
      tag: '',
      title: fallbackTitle || `Version ${version}`,
      summary: '',
      highlight: false,
      groups: [],
    };
    updates.unshift(current);
  }
  for (const entry of updates) {
    if (!entry.title) entry.title = `Version ${entry.version}`;
    entry.highlight = entry === current;
  }

  return {
    schema: SCHEMA,
    updates,
    news: Array.isArray(extra.news) ? extra.news : [],
    notices: Array.isArray(extra.notices) ? extra.notices : [],
  };
}

/**
 * The exact text of manifest.json or news.json. These are the bytes that get
 * signed and that the launcher parses, so every writer goes through here.
 */
export function feedText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The value of `--name` in the arguments of the running script. */
export function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

export function flag(name) {
  return process.argv.includes(`--${name}`);
}
