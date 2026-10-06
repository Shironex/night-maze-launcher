# Night Maze launcher

A small desktop program that installs the newest build of Night Maze, keeps it up to date and
starts it. A friend downloads the launcher once and from then on always plays the latest
version.

It is a Tauri 2 application: the rules are a plain Rust library (`crates/core`), the window is
React and TypeScript (`src`), and `src-tauri` joins the two. It lives in this folder and shares
nothing with the game's CMake build.

**Status: first working version, tested on Windows 11 against a local test server only.**
Nothing has been published. See [Not done yet](#not-done-yet).

## What it does

- Reads `manifest.json` from the newest GitHub Release of the game repository:
  `https://github.com/Shironex/night-maze/releases/latest/download/manifest.json`.
- Downloads the zip for this system, checks its size and SHA-256 against the manifest, unpacks
  it next to the versions already installed and makes it the current one.
- Starts the game with `data/` as its working directory and writes its console output to
  `data/logs/last-run.log`.
- Goes back one version by itself when a new version does not start (see
  [Rollback](#rollback)).
- Starts the installed version when there is no network.

All network access is in Rust (`crates/core/src/net.rs`). The page makes no request: its
content security policy allows none, and the lint configuration forbids `fetch` in `src`.
Only https is accepted, also after redirects. Plain http is accepted for a loopback address
only, which is what local testing uses.

## Run it in development

Needed: Rust (stable, 1.88 or newer), Node 22, pnpm 10, and on Windows the WebView2 runtime
(part of Windows 11).

```sh
cd launcher
pnpm install
pnpm tauri dev
```

Started like this it reads the real release address and installs into the real per-user folder.
For development, point it at a local server and a throwaway folder instead.

### Against a local test server

1. Build the game in Release (see `docs/guides/build-windows.md`), for example into
   `build/release`.
2. Pack it as a release. This writes the zip, `manifest.json` and `news.json` into one folder,
   with the same scripts the release workflow uses:

   ```sh
   node launcher/scripts/package-game.mjs \
     --exe build/release/Release/night_maze.exe \
     --version 0.9.0 \
     --out /tmp/nm-feed \
     --base-url http://127.0.0.1:8123/
   ```

   Add `--changelog <file>` to fill the release notes from a changelog (format below).

3. Serve the folder on loopback. `--throttle` limits zip downloads to that many kB per second,
   so the progress display can be watched:

   ```sh
   node launcher/scripts/serve.mjs --root /tmp/nm-feed --port 8123 --throttle 1500
   ```

4. Start the launcher with two environment variables:

   | Variable                   | Meaning                                                                         |
   | -------------------------- | ------------------------------------------------------------------------------- |
   | `NIGHT_MAZE_LAUNCHER_FEED` | The URL of a `manifest.json`, or a base URL that `manifest.json` is appended to |
   | `NIGHT_MAZE_LAUNCHER_ROOT` | The install root, in place of the per-user folder                               |

   PowerShell:

   ```powershell
   $env:NIGHT_MAZE_LAUNCHER_FEED = 'http://127.0.0.1:8123/'
   $env:NIGHT_MAZE_LAUNCHER_ROOT = "$env:TEMP\nm-root"
   pnpm tauri dev
   ```

On Windows the webview keeps its own data in `%LOCALAPPDATA%\com.shironex.nightmaze.launcher`.
Set `WEBVIEW2_USER_DATA_FOLDER` to move that too.

In a development build, `http://localhost:15190/?preview=<name>` shows a fixed state without a
server: `ready`, `update`, `downloading`, `installing`, `running`, `offline`, `first-run`,
`first-run-offline`, `rolled-back`, `update-failed`, `launcher-too-old`. The list is in
`src/dev/preview.ts`, which is not part of a release build.

## Checks

Run from `launcher/`. Build the page first: the Rust shell embeds `dist/` at compile time and
does not compile without it.

```sh
pnpm build                 # typecheck and build the page into dist/
pnpm lint
pnpm format:check
pnpm test                  # view logic and text helpers
node --test scripts/lib/feed.test.mjs
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace     # rules, flows against a loopback server, bindings drift
pnpm tauri build           # installer in target/release/bundle
```

`src/bindings.ts` is generated from the Rust commands. After changing a command, a type it
returns or an event, regenerate it with `UPDATE_BINDINGS=1 cargo test -p night-maze-launcher`
(PowerShell: `$env:UPDATE_BINDINGS = '1'` first). A test fails while the file is out of date.

`target/` grows to several gigabytes. `cargo clean` in `launcher/` removes it.

## On a friend's computer

Per user, no administrator rights, nothing in Program Files.

```text
%LOCALAPPDATA%\NightMaze\              macOS: ~/Library/Application Support/NightMaze/
  versions\
    0.9.0\   night_maze.exe  assets\   the previous version, kept for rollback
    0.9.1\   night_maze.exe  assets\   the current version
  staging\                             downloads and unpacking, emptied on every start
  data\                                the game's working directory: imgui.ini, later saves
    logs\last-run.log                  the game's console output of the last run
    logs\failed-<version>.log          kept when a version did not start
  cache\news.json                      the last release notes read, for offline starts
  state.json                           current, previous, bad versions, good runs, settings
  launcher.log                         one line per thing the launcher did
```

There is no "current" link: `state.json` names the current version. It is written to a
temporary file and renamed over the old one. A version directory is created by renaming a
finished directory from `staging`, so it exists completely or not at all, and no file of an
installed version is ever overwritten.

### Rollback

A run counts as good when the game exits with code 0, or is still running after 15 seconds.

If a version that has never had a good run exits with an error within 15 seconds, and the
previous version has a recorded good run, the launcher marks the new version as bad, deletes
it, makes the previous one current, starts it and shows one message. A bad version is never
installed again on that computer. If the previous version has no good run either (a PC without
OpenGL 4.1 fails on every version), nothing is switched: the launcher shows the last `[error]`
line of the log instead.

Deleting a release on GitHub is a remote rollback: the launcher installs whatever version the
manifest names, also a lower one.

A build that starts but shows a black screen exits with 0 and is not caught.

## Release files

A release holds one zip per system, `manifest.json` and `news.json`. They are written by
`scripts/package-game.mjs` and `scripts/build-feed.mjs`, called from
`.github/workflows/release.yml`. **That workflow has never run.**

```text
NightMaze-0.9.0-windows-x64.zip        NightMaze-0.9.0-macos-arm64.zip
  night_maze.exe                         night_maze            (mode 755, ad hoc signed)
  assets/                                assets/
  THIRD-PARTY-NOTICES.txt                THIRD-PARTY-NOTICES.txt
```

`manifest.json`:

```json
{
  "schema": 1,
  "channel": "stable",
  "version": "0.9.0",
  "published": "2026-12-05T18:00:00Z",
  "notes": "One line about the release.",
  "feed": "https://github.com/Shironex/night-maze/releases/download/v0.9.0/news.json",
  "game": {
    "windows-x64": {
      "url": "https://github.com/Shironex/night-maze/releases/download/v0.9.0/NightMaze-0.9.0-windows-x64.zip",
      "size": 8676908,
      "sha256": "64 hex characters",
      "exe": "night_maze.exe"
    },
    "macos-arm64": { "url": "...", "size": 0, "sha256": "...", "exe": "night_maze" }
  },
  "launcher": { "min": "0.1.0" }
}
```

- `schema`: a launcher refuses a number it does not know and treats the check as failed.
- `version`: exactly `major.minor.patch`. It becomes a directory name.
- `exe`: a bare file name inside the zip.
- `launcher.min`: a launcher older than this does not install the release and says so. The
  installed game still starts.
- `feed`: where `news.json` is. Without it the launcher reads `news.json` next to the manifest.
- `channel`, `published`: written for people, not read by the launcher.

`news.json` fills the highlight card, the Updates, News and Notices tabs and the changelog
dialog. The launcher works without it and shows every string as plain text.

```json
{
  "schema": 1,
  "updates": [
    {
      "version": "0.9.0",
      "date": "2026-12-05",
      "tag": "Milestone release",
      "title": "The headline",
      "summary": "One intro sentence.",
      "highlight": true,
      "groups": [{ "title": "Gameplay", "items": ["A bullet point"] }]
    }
  ],
  "news": [{ "date": "2026-12-10", "title": "A post", "body": "Text" }],
  "notices": [{ "id": "n1", "level": "warning", "title": "A notice", "body": "Text" }]
}
```

`updates` is built from a changelog with one section per version, newest first:

```markdown
## 0.9.0 (2026-12-05) Milestone release

The headline of the release

One intro sentence.

### Gameplay

- A bullet point
```

A version without a section still gets an entry: its version, the date of the build and the
message of the tag. `news` and `notices` come from an optional JSON file passed to
`build-feed.mjs` with `--extra`.

`THIRD-PARTY-NOTICES.txt` in the repository root is generated from the licence files of the
linked libraries: `node launcher/scripts/build-notices.mjs --deps build/release/_deps`. Run it
again when a version in `cmake/Dependencies.cmake` changes.

## Not done yet

- **Nothing is published.** No tag, no release, and the repository is private. The launcher
  shows "offline" against the real address until the first release exists and the repository
  is public.
- **The release workflow has never run.** It was parsed as YAML and its scripts were run and
  tested locally on Windows. The macOS job, the `if:` conditions and the publish step are
  untested.
- **macOS: everything.** The launcher has not been built or started on macOS. The transparent
  title bar (`src-tauri/tauri.macos.conf.json`), the ad hoc signature of the bundle and the
  executable bit on the unpacked game are written from the documentation only.
- **The launcher does not update itself.** A friend with an old launcher sees "launcher update
  needed" (when a release raises `launcher.min`) and has to download a new installer by hand.
  The later step, in this order:
  1. The owner creates the updater key on his own machine: `pnpm tauri signer generate -w
<path outside the repository>`, with a password. Nobody else does this, and the private
     key never enters the repository.
  2. Two backups of the private key and its password in two different places, on the same day.
     The signature cannot be switched off later: if the key is lost, installed launchers can
     never update again.
  3. Add `tauri-plugin-updater` to `src-tauri`, and in `tauri.conf.json` set
     `bundle.createUpdaterArtifacts` to `true` and `plugins.updater` to the public key and the
     address of the launcher's `latest.json`.
  4. Decide where launcher releases live. They must not become the "latest" release of the
     game repository, or the game manifest address stops resolving. A second repository, or
     releases marked as prerelease with a fixed address, both work.
  5. Add the build job to the workflow (the TODO at its end), with the private key and its
     password as secrets, and wire the "Update launcher" button.
- **The manifest is not signed.** Size and SHA-256 catch a damaged download. They do not
  protect against someone who can change the release, because the checksum comes from the same
  place as the file.
- **No code signing.** Windows SmartScreen will warn about the installer on first start. How it
  behaves, and whether antivirus software objects to a program that downloads and starts
  another one, has not been tested on a clean PC.
- **No language switch.** The window is English only.
- **No link stack, no generated art.** The background is the placeholder scene drawn in SVG.
- **Running copies.** The launcher does not look for a copy of the game that was started
  outside of it.

## Third-party material in the launcher

Fonts, bundled through the `@fontsource` packages and used under the SIL Open Font License
1.1: Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono (Braille Institute of America) and
Cormorant Garamond (Christian Thalmann). The licences of the Rust and npm dependencies are
those stated in their packages. A notices file for the launcher installer itself is not
assembled yet.
