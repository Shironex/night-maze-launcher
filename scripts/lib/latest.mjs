// Builds latest.json, the file the Tauri updater plugin reads to learn about a
// new launcher installer. Node builtins only.
//
// Only the Windows platform is written: the updater validates every platform
// entry of the file, so a platform that is not shipped must be absent.

import { isVersion } from './feed.mjs';

export const PLATFORM = 'windows-x86_64';

/** `NightMazeLauncher-0.1.0-windows-x64-setup.exe`. No spaces: GitHub rewrites them in asset names. */
export function installerAssetName(version) {
  if (!isVersion(version)) throw new Error(`not a version: ${version}`);
  return `NightMazeLauncher-${version}-windows-x64-setup.exe`;
}

/** Where GitHub serves the installer of release `v<version>`. */
export function installerUrl(repo, version) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error(`not a repository, expected owner/name: ${repo}`);
  }
  return `https://github.com/${repo}/releases/download/v${version}/${installerAssetName(version)}`;
}

/**
 * The content of latest.json.
 *
 * @param {{ version: string, repo: string, signature: string, notes?: string, now?: Date }} options
 *   `signature` is the content of the `.sig` file, taken as it is apart from
 *   surrounding whitespace.
 */
export function buildLatest({ version, repo, signature, notes = '', now = new Date() }) {
  const trimmed = (signature ?? '').trim();
  if (!trimmed) throw new Error('the signature is empty.');
  return {
    version,
    notes,
    pub_date: now.toISOString(),
    platforms: {
      [PLATFORM]: { signature: trimmed, url: installerUrl(repo, version) },
    },
  };
}
