# Night Maze launcher

A small desktop program that installs the newest build of Night Maze, keeps it up to date and
starts it. A friend downloads the launcher once and from then on always plays the latest
version.

It is a Tauri 2 application: the rules are a plain Rust library (`crates/core`), the window is
React and TypeScript (`src`), and `src-tauri` joins the two. It lives in this folder and shares
nothing with the game's CMake build.

**Status: working version, released on 2026-10-07 (launcher 0.1.0 and 0.1.1, game 0.10.0).**
The owner built and signed both launcher releases on Windows and published them in
`Shironex/night-maze-launcher`. He installed 0.1.0 and updated it to 0.1.1 through the button in
Settings on one Windows 11 PC, then installed game 0.10.0 through the launcher and ran it. Still
not tried: key rotation, the update on a clean second machine, SmartScreen on a PC that never saw
the launcher, and anything on macOS. See [Not done yet](#not-done-yet) and, for later releases,
[Releasing](#releasing).

## What it does

- Reads `manifest.json` from the newest GitHub Release of the game repository:
  `https://github.com/Shironex/night-maze/releases/latest/download/manifest.json`, and
  `manifest.json.sig` next to it. A manifest (and a `news.json`) without a valid signature by
  one of the two release keys is refused. See [Keys](#keys).
- Downloads the zip for this system, checks its size and SHA-256 against the manifest, unpacks
  it next to the versions already installed and makes it the current one.
- Starts the game with `data/` as its working directory and writes its console output to
  `data/logs/last-run.log`.
- Goes back one version by itself when a new version does not start (see
  [Rollback](#rollback)).
- Starts the installed version when there is no network.
- Updates itself. It reads `latest.json` from the newest release of the launcher repository,
  `https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json`
  (through `tauri-plugin-updater`, `src-tauri/src/updater.rs`), on start and from the settings.
  When a newer launcher exists the window shows an "Update launcher" button. The installer is
  downloaded, its signature is checked against the updater key, and it replaces the launcher.
  A development build never does this.

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
   with the same scripts the release workflow uses, and signs both json files with the
   development key (`launcher/dev-keys/dev.key`, empty password, committed on purpose). A
   debug build of the launcher trusts that key; a release build never does:

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
`first-run-offline`, `rolled-back`, `update-failed`, `launcher-too-old`, `launcher-update`,
`launcher-downloading`. The list is in `src/dev/preview.ts`, which is not part of a release
build.

## Checks

Run from `launcher/`. Build the page first: the Rust shell embeds `dist/` at compile time and
does not compile without it.

```sh
pnpm build                 # typecheck and build the page into dist/
pnpm lint
pnpm format:check
pnpm test                  # view logic and text helpers
pnpm test:scripts          # the Node tests of scripts/ (node --test, Node 22)
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace     # rules, flows against a loopback server, bindings drift
pnpm tauri build           # installer in target/release/bundle, needs the variables below
```

`pnpm test:scripts` runs `node --test "scripts/**/*.test.mjs"`. Node 22 does not accept a bare
folder there, so the glob stays in quotes: Node expands it itself, which also works in
PowerShell and cmd.

`pnpm tauri build` makes the updater files too (`bundle.createUpdaterArtifacts`), so it stops
unless `TAURI_SIGNING_PRIVATE_KEY` names a key and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` holds
its password. Releases set both, see [Releasing](#releasing). For a trial build, the
development key works (`TAURI_SIGNING_PRIVATE_KEY` set to the path of `dev-keys/dev.key`, the
password empty); the CLI then warns that the key does not match the public key in the config.
That is expected for a trial, and such an installer must never be published. One trial build
with the development key was run on Windows on 2026-10-07 (NSIS only, about two minutes).

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

A game release holds one zip per system, `manifest.json`, `news.json` and the signature of each
json file, `manifest.json.sig` and `news.json.sig`. They are written by
`scripts/package-game.mjs` and `scripts/build-feed.mjs`, called from
`.github/workflows/release.yml`. **That workflow has never run**: the first releases (launcher
0.1.0 and 0.1.1, game 0.10.0) were built and signed locally, as planned. The workflow runs by
hand only and leaves a draft release without the two `.sig` files: the owner signs the json
files on his own PC and then publishes the draft (see [Releasing](#releasing)).

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

A `.sig` file is the base64 of a minisign signature over the exact bytes of its json file, made
by `scripts/sign-file.mjs` (the Tauri CLI's `signer sign`). The launcher fetches the file and
its `.sig` and checks them against the two release keys before it parses a byte. A feed whose
signature is wrong is treated like a missing feed: the launcher works without it. A manifest
whose signature is wrong is a failed check, and the installed game still starts.

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

## Releasing

Two things are released, from two repositories:

| What                  | Repository                              | Who builds it                          |
| --------------------- | --------------------------------------- | -------------------------------------- |
| The launcher          | `Shironex/night-maze-launcher` (public) | the owner's PC, no CI minutes          |
| The game and its feed | `Shironex/night-maze`                   | the owner's PC, or the manual workflow |

Launcher installers must not be released from the game repository: its "latest" release has to
stay the newest game release, or the manifest address stops resolving.

The private keys live outside every repository, in `%USERPROFILE%\.night-maze-keys`
(macOS: `~/.night-maze-keys`) and in the backups. They are never committed, and the file names below
are all this document says about them. See [Keys](#keys). The password is typed into a hidden
prompt, put into an environment variable for the commands that need it and removed afterwards.
It is never an argument, so it does not reach the shell history.

### 1. Release the launcher

Run in PowerShell, from `launcher/`. First release: Windows only.

1. Set the new version in `launcher/Cargo.toml`, `[workspace.package]`. That is the only place
   the launcher's version is read from (`package.json` is not used). Run `cargo check` so
   `Cargo.lock` follows, run `pnpm notices` if `Cargo.lock` or `pnpm-lock.yaml` changed, make
   the [checks](#checks) green and commit.

2. Remove the old installers, so that exactly one `*-setup.exe` is built:

   ```powershell
   Remove-Item target\release\bundle\nsis -Recurse -Force -ErrorAction SilentlyContinue
   ```

3. Set the signing variables. `updater-a.key` is the key whose public half is in
   `tauri.conf.json`:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.night-maze-keys\updater-a.key"
   $secure = Read-Host -AsSecureString 'Updater key password'
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
   ```

4. Build the installer:

   ```powershell
   pnpm tauri build --bundles nsis --ci
   ```

   Read the output. If the CLI warns that the private key does not match the public key
   configured in `tauri.conf.json`, stop: the wrong key file was used, and every installed
   launcher would refuse the installer. Do not release it. The build writes the installer's
   `.sig` too, with the version recorded in it (`requireSignedVersion` needs that).

5. Clear the variables, then check that exactly one installer and its `.sig` exist:

   ```powershell
   Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   Get-ChildItem target\release\bundle\nsis
   ```

6. Write `latest.json` and copy the installer next to it under a name without spaces (GitHub
   rewrites spaces in asset names):

   ```powershell
   node scripts/build-latest.mjs --bundle target/release/bundle/nsis --version 0.1.0 --repo Shironex/night-maze-launcher --out releases/launcher-0.1.0 --notes "One line about the release."
   ```

   `--notes` also accepts `@<file>`. The script stops when it finds no installer, more than one,
   or no `.sig`.

7. Publish. This must be a normal, published release: never `--draft` and never `--prerelease`,
   because `releases/latest/download/latest.json` only resolves to the newest published release
   that is not a prerelease. The tag is `v` plus the version, which is what the installer URL
   inside `latest.json` expects. The repository needs at least one commit for the tag to be
   created.

   ```powershell
   gh release create v0.1.0 --repo Shironex/night-maze-launcher --title "Night Maze Launcher 0.1.0" --notes "One line about the release." releases/launcher-0.1.0/NightMazeLauncher-0.1.0-windows-x64-setup.exe releases/launcher-0.1.0/latest.json
   ```

8. Check that the address the launchers read answers:

   ```powershell
   curl.exe -sL https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json
   ```

macOS differences: the variables are set with
`export TAURI_SIGNING_PRIVATE_KEY=~/.night-maze-keys/updater-a.key` and
`read -rs -p 'Updater key password: ' TAURI_SIGNING_PRIVATE_KEY_PASSWORD; export TAURI_SIGNING_PRIVATE_KEY_PASSWORD`,
and cleared with `unset`. `build-latest.mjs` writes the Windows entry only, so a macOS
installer (`--bundles app,dmg`) is not part of any release yet and `latest.json` has no macOS
entry.

### 2. Release the game

The version has one source, `project(NightMaze VERSION ...)` in `CMakeLists.txt`. The tag is `v`
plus that version, an annotated tag whose message subject is the release title, pushed before
the release is made. The examples use 0.10.0.

**Locally**, from the repository root in PowerShell. This is the same sequence as the workflow.

1. Build with the static runtime, so the exe needs no Visual C++ redistributable on a friend's
   PC, and run the tests. The two flags stay in the CMake cache of `build/release`:

   ```powershell
   cmake --preset release -DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded -DUSE_MSVC_RUNTIME_LIBRARY_DLL=OFF
   cmake --build --preset release
   ctest --test-dir build/release -C Release --output-on-failure
   ```

2. Pack it (the assets and the notices file come from the repository, not from the build
   directory):

   ```powershell
   node launcher/scripts/package-game.mjs --exe build/release/Release/night_maze.exe --version 0.10.0 --platform windows-x64 --out dist-release
   ```

3. Write and sign the feed. `manifest-a.key` signs both json files. The password goes in
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, read the same way as above. `TAURI_SIGNING_PRIVATE_KEY`
   is not needed here: the signing script removes it from the environment of the signing process
   on purpose, so it cannot pick another key.

   ```powershell
   $secure = Read-Host -AsSecureString 'Manifest key password'
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
   node launcher/scripts/build-feed.mjs --dir dist-release --version 0.10.0 --base-url https://github.com/Shironex/night-maze/releases/download/v0.10.0/ --changelog CHANGELOG.md --sign-key "$env:USERPROFILE\.night-maze-keys\manifest-a.key" --title (git tag -l --format='%(contents:subject)' v0.10.0)
   Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   ```

   For a github.com address the script refuses to run without `--sign-key` or `--no-sign`. The
   development key is never the default there.

4. Check the result with the code the launcher uses, against the release keys only (the
   development key is not among them, so a manifest signed with it by mistake fails here):

   ```powershell
   cargo run --manifest-path launcher/Cargo.toml -p night-maze-launcher-core --example verify_manifest -- dist-release/manifest.json
   ```

5. Publish the zip, both json files and both signatures in one normal release:

   ```powershell
   gh release create v0.10.0 --repo Shironex/night-maze --title "Night Maze 0.10.0" --notes "Install and update through the Night Maze launcher." --verify-tag dist-release/NightMaze-0.10.0-windows-x64.zip dist-release/manifest.json dist-release/news.json dist-release/manifest.json.sig dist-release/news.json.sig
   ```

macOS differences: configure with
`cmake --preset release -DCMAKE_OSX_DEPLOYMENT_TARGET=13.0 -DCMAKE_OSX_ARCHITECTURES=arm64`
(no static runtime flags), run `codesign --force --sign - build/release/night_maze` after the
build, and pack with `--exe build/release/night_maze --platform macos-arm64`. Put the zips of all
systems into the same `--dir` before `build-feed.mjs`, so that one manifest lists them. Set the
password with `read -rs` and `export`, as above.

**With the workflow**, which has never run (see its header comment). Nothing is signed on GitHub.

1. Commit and push the version, then create and push the tag:
   `git tag -a v0.10.0 -m "The release title"` and `git push origin v0.10.0`.
2. Start the run. The tag must exist already. Add `-f macos=true` for the macOS package:

   ```powershell
   gh workflow run release.yml --repo Shironex/night-maze --ref main -f tag=v0.10.0
   ```

   The run builds the code of the tag, whatever branch `--ref` names. It ends with a **draft**
   release holding the zips, `manifest.json` and `news.json`, unsigned. A draft is never
   "latest", so no launcher sees it.

3. Sign. These are the commands from the comment above the "Create the release" step. Set
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` first, as in step 3 of the local path:

   ```powershell
   gh release download v0.10.0 --repo Shironex/night-maze --pattern "*.json" --dir build/sign
   node launcher/scripts/sign-file.mjs --file build/sign/manifest.json --key "$env:USERPROFILE\.night-maze-keys\manifest-a.key"
   node launcher/scripts/sign-file.mjs --file build/sign/news.json --key "$env:USERPROFILE\.night-maze-keys\manifest-a.key"
   ```

4. Verify and upload the two signatures:

   ```powershell
   cargo run --manifest-path launcher/Cargo.toml -p night-maze-launcher-core --example verify_manifest -- build/sign/manifest.json
   gh release upload v0.10.0 build/sign/manifest.json.sig build/sign/news.json.sig --repo Shironex/night-maze
   ```

5. Publish the draft, which makes it the latest release:

   ```powershell
   gh release edit v0.10.0 --repo Shironex/night-maze --draft=false --latest
   ```

   If anything failed after the draft appeared, delete the draft (not the tag), fix the cause
   and run the workflow again for the same tag.

## Before the first friend gets a link

This list stays as the procedure for later releases. It was carried out for launcher 0.1.0 and
0.1.1 on the evening of 2026-10-07, by the owner, on one Windows 11 PC: steps 2 to 5 (the update
from 0.1.0 to 0.1.1 worked, the installed copy restarted as 0.1.1 and reported "up to date"),
step 6 (the game repository is public since that evening) and step 7 (game 0.10.0 was offered,
installed and started). Not covered: step 3 on a clean machine (and where the 0.1.0 installer
was downloaded from was not recorded), and the SmartScreen warning of step 8 on a PC that never
saw the launcher.

1. Make sure `Shironex/night-maze-launcher` exists, is public and has at least one commit.
2. Release launcher 0.1.0 (steps above).
3. Install 0.1.0 from that public repository, on a clean machine if possible: download the
   installer from the release page, not from your build folder.
4. Raise the version to 0.1.1 in `Cargo.toml` and release it the same way.
5. In the installed 0.1.0, click "Update launcher" (the window button, or Settings). Confirm
   that it downloads, closes, installs and starts again as 0.1.1. This is the only test of the
   whole update path, so do it before anyone else depends on it. If it fails, fix it and release
   0.1.2: 0.1.0 and 0.1.1 are then only on your machines.
6. The game repository, `Shironex/night-maze`, must be public. The launcher reads its releases
   without a token, so with a private repository it shows "offline".
7. Publish the first game release (steps above) and start the launcher: it should offer to
   install it.
8. Windows SmartScreen will warn about the installer, because it is not code signed. Tell the
   friend to click "More info", then "Run anyway".

## Keys

Four minisign keys, all made with `pnpm tauri signer generate`, each with a password. The
private halves of the two A keys are in `%USERPROFILE%\.night-maze-keys` on the owner's machine.
The two B keys are spares and were removed from the machine after the backups were made: they
exist in the backups only. All four have two backups in two different places, made on the day
the keys were made, and each backup was proven by signing a test file from it. A lost password is a lost key.

| Key          | Public half is in                                       | What it signs                                         |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------- |
| `updater-a`  | `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` | every launcher installer (`tauri build`)              |
| `updater-b`  | `ROTATION_KEY` in `src-tauri/src/updater.rs`            | nothing; a spare, kept offline                        |
| `manifest-a` | `RELEASE_KEYS[0]` in `crates/core/src/signature.rs`     | `manifest.json` and `news.json` of every game release |
| `manifest-b` | `RELEASE_KEYS[1]` in `crates/core/src/signature.rs`     | nothing; a spare, kept offline                        |

The development key in `dev-keys/` is not one of them. It exists in debug builds only and
signs local test feeds.

**Frozen into every installed launcher**, and changed only by an update that the installed copy
accepts:

- the public halves of updater A (config) and updater B (code), and of manifest A and B (code);
- the update address,
  `https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json`;
- the application identifier, `com.shironex.nightmaze.launcher`. Changing it would install a
  second program next to the old one instead of updating it;
- `requireSignedVersion`, which makes the updater refuse an installer whose signature does not
  carry the version that `latest.json` announced. It stops a fake `latest.json` from pairing a
  new version number with an older, genuine installer.

The signature check cannot be switched off later. A launcher that no key of a pair can sign for
can never update again, and its owner has to download a new installer by hand.

**If a key is lost or leaked**

- _Manifest A._ Sign the next game release with `manifest-b`. Installed launchers trust both
  keys, so nothing breaks. Then ship a new launcher whose `RELEASE_KEYS` hold manifest B and a
  newly made key, and stop using A. A leaked A stays accepted by launchers that have not updated
  yet.
- _Updater A._ Build the next launcher release with `updater-b.key` as
  `TAURI_SIGNING_PRIVATE_KEY`. The CLI warns that it does not match the configured key; that is
  the expected case this time. Installed launchers fail the check against A, try B once
  (`updater.rs`, `fetch`) and accept it. That release must carry a new `plugins.updater.pubkey`
  and a new `ROTATION_KEY`, or the next loss is final.
- _Both keys of a pair._ Nothing can be rotated. Make new keys, ship a new installer, and every
  friend installs it by hand.

**Rotation, in order:** make the new key pair; back it up in two places; put the new public
halves into the config or the constants (keep the one key that stays); build and release the
launcher signed with the key that installed copies still trust; check on a copy of the old
version that the update installs; only then retire the old key.

**Run once, on 2026-10-07, by the owner on one Windows 11 PC:** a real launcher update with key
A (0.1.0 to 0.1.1; `requireSignedVersion` accepted the signatures) and a real release signature
by manifest A (the `verify_manifest` example accepted the manifest of game 0.10.0, and the
installed launcher then showed its notes and installed it).

**Never run:** a rotation of either pair, the second-key retry in `updater.rs` against a real
release, the update on a clean second machine, the manual release workflow, and everything on
macOS (the build, the launcher update, the ad hoc signed bundle, the game package).

## Not done yet

- **The release workflow has never run.** The first releases were local. It was parsed as YAML
  and its scripts were run and tested locally on Windows. The macOS job, the `if:` conditions
  and the publish step are untested.
- **The real update path was run once and only once.** On 2026-10-07 the owner updated an
  installed 0.1.0 to 0.1.1 through the button in Settings on one Windows 11 PC (see
  [Before the first friend gets a link](#before-the-first-friend-gets-a-link)). The update on a
  clean second machine has not been tried.
- **Key rotation has never been tried**, for either pair.
- **macOS: everything.** The launcher has not been built or started on macOS. The transparent
  title bar (`src-tauri/tauri.macos.conf.json`), the ad hoc signature of the bundle, the
  executable bit on the unpacked game and the update of the launcher bundle are written from the
  documentation only. The first release is Windows only.
- **No code signing.** Windows SmartScreen will warn about the installer on first start. How it
  behaves, and whether antivirus software objects to a program that downloads and starts
  another one, has not been tested on a PC that never saw the launcher.
- **Dependabot alerts in `launcher/`.** Two are open: `source-map-js` (high, `pnpm-lock.yaml`)
  and `glib` (medium, `Cargo.lock`). The automatic update runs for both failed.
- **The window header says "Windows · macOS"** while only Windows ships. Left as it is for now.
- **English READMEs for both repositories** are planned, including an explanation in the
  launcher repository of why it is separate and the plan to move the launcher's source there
  later.
- **No language switch.** The window is English only.
- **No link stack, no generated art.** The background is the placeholder scene drawn in SVG.
- **Running copies.** The launcher does not look for a copy of the game that was started
  outside of it.

## Third-party material in the launcher

`THIRD-PARTY-NOTICES.txt` in this folder lists the Rust crates linked into the launcher, the
npm packages bundled into its window and the licence text of each. It is installed next to the
launcher (`bundle.resources` in `tauri.conf.json`). `scripts/build-launcher-notices.mjs`
(`pnpm notices`) writes it from `cargo metadata` and `node_modules`, for Windows and Apple
Silicon together, so the result is the same on both machines. Run it again when `Cargo.lock` or
`pnpm-lock.yaml` changes. It is committed, because the build fails when a listed resource is
missing. The game has its own file in the repository root.

Fonts, bundled through the `@fontsource` packages and used under the SIL Open Font License 1.1:
Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono (Braille Institute of America) and
Cormorant Garamond (Christian Thalmann). Their licence texts are part of the notices file.
