# Night Maze launcher: development

> [!WARNING]
> Night Maze and its launcher are a university project that I keep working on to learn OpenGL, Tauri and Rust. It changes a lot, and things will break here and there. Expect rough edges and breaking changes between versions.

A small desktop program that installs the newest build of Night Maze, keeps it up to date and
starts it. A friend downloads the launcher once and from then on always plays the latest
version.

It is a Tauri 2 application: the rules are a plain Rust library (`crates/core`), the window is
React and TypeScript (`src`), and `src-tauri` joins the two. The game is a separate repository,
[`Shironex/night-maze`](https://github.com/Shironex/night-maze), and the two share no build.
What they do share, the release files, is written down in [contract.md](contract.md).

**Status: launcher 0.1.0 and 0.1.1 are released (2026-10-07, built and signed on my
PC), game 0.10.0 is released.** I installed 0.1.0 and updated it to 0.1.1 through the
button in Settings on one Windows 11 PC, then installed game 0.10.0 through the launcher and ran
it. The source moved here from the `launcher/` folder of the game repository on the same day,
with its history. From 0.1.2 on, releases are built by GitHub Actions
([Releasing](#releasing)); **that workflow has not run yet**. See
[Not done yet](#not-done-yet).

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
- Updates itself. It reads `latest.json` from the newest release of this repository,
  `https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json`
  (through `tauri-plugin-updater`, `src-tauri/src/updater.rs`), on start and from the settings.
  A newer launcher is offered under Settings, About, with its notes. The main window shows an
  "Update launcher" button only when this launcher is too old for the newest game or could not
  start. The installer is downloaded, its signature is checked against the updater key, and it
  replaces the launcher. A development build never does this.

All network access is in Rust (`crates/core/src/net.rs`). The page makes no request: its
content security policy allows none, and the lint configuration forbids `fetch` in `src`.
Only https is accepted, also after redirects. Plain http is accepted for a loopback address
only, which is what local testing uses.

## Run it in development

Needed: Rust (`rust-toolchain.toml` pins the version and rustup installs it by itself; the
floor is 1.88), Node 22, pnpm 10 (`corepack enable` gives the version `package.json` names),
and on Windows the WebView2 runtime (part of Windows 11).

```sh
pnpm install
pnpm tauri dev
```

Started like this it reads the real release address and installs into the real per-user folder.
For development, point it at a local server and a throwaway folder instead.

### Against a local test server

1. Build the game in Release in a checkout of the game repository (see its
   `docs/guides/build-windows.md`), for example into `build/release`.
2. Pack it as a release, from the root of the game repository. This writes the zip,
   `manifest.json` and `news.json` into one folder, with the same scripts a release uses, and
   signs both json files with the development key (`dev-keys/dev.key`, empty password,
   committed on purpose). A debug build of the launcher trusts that key; a release build never
   does. `<launcher>` is the path of this repository:

   ```sh
   node <launcher>/scripts/package-game.mjs \
     --exe build/release/Release/night_maze.exe \
     --version 0.9.0 \
     --out /tmp/nm-feed \
     --base-url http://127.0.0.1:8123/
   ```

   The assets folder and the notices file are taken from the working directory (`assets`,
   `THIRD-PARTY-NOTICES.txt`); from another directory, pass `--assets` and `--notices`. Add
   `--changelog <file>` to fill the release notes from a changelog (format in
   [contract.md](contract.md#newsjson)).

3. Serve the folder on loopback. `--throttle` limits zip downloads to that many kB per second,
   so the progress display can be watched:

   ```sh
   node scripts/serve.mjs --root /tmp/nm-feed --port 8123 --throttle 1500
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
`launcher-downloading`, `launcher-newer`. The list is in `src/dev/preview.ts`, which is not part
of a release build. The release notes in these states are the published ones of the game, kept
as static data in `src/dev/preview-feed.ts`.

## Checks

Build the page first: the Rust shell embeds `dist/` at compile time and does not compile
without it.

```sh
pnpm build                 # typecheck and build the page into dist/
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test                  # view logic and text helpers
pnpm test:scripts          # the Node tests of scripts/ (node --test, Node 22)
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace     # rules, flows against a loopback server, bindings drift
```

`.github/workflows/ci.yml` runs exactly these on every push to `main` and every pull request,
on a Windows runner. On `main` it also builds the installer signed with the development key
and keeps it for a week as an artifact named `DEV-KEY-NOT-A-RELEASE-launcher-installer`. That
proves the release build without a secret. No installed launcher accepts that installer as an
update.

`pnpm test:scripts` runs `node --test "scripts/**/*.test.mjs"`. Node 22 does not accept a bare
folder there, so the glob stays in quotes: Node expands it itself, which also works in
PowerShell and cmd.

`pnpm tauri build` makes the updater files too (`bundle.createUpdaterArtifacts`), so it stops
unless `TAURI_SIGNING_PRIVATE_KEY` holds a key (its content, or the path of the key file) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` its password. Two ways to build an installer without the
release key:

```sh
# No key at all: no .sig is made. This is what the release workflow's build job runs.
pnpm tauri build --bundles nsis --ci --config src-tauri/tauri.unsigned.conf.json

# The development key: the CLI warns that it does not match the key in the config.
# Expected for a trial, and such an installer must never be published.
TAURI_SIGNING_PRIVATE_KEY="$(cat dev-keys/dev.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
  pnpm tauri build --bundles nsis --ci
```

`src-tauri/tauri.unsigned.conf.json` is merged over `tauri.conf.json` by `--config` and
switches off that one setting. The NSIS build takes about two and a half minutes on my
PC.

`src/bindings.ts` is generated from the Rust commands. After changing a command, a type it
returns or an event, regenerate it with `UPDATE_BINDINGS=1 cargo test -p night-maze-launcher`
(PowerShell: `$env:UPDATE_BINDINGS = '1'` first). A test fails while the file is out of date.

`scripts/fixtures/contract/` holds the two release files as the scripts write them, and a test
on each side reads them (see [contract.md](contract.md#what-pins-each-piece)). After a meant
change of the format, write them again with `UPDATE_FIXTURES=1 pnpm test:scripts`.

`target/` grows to several gigabytes. `cargo clean` removes it.

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

The files a release publishes, their formats, the signature format, the addresses and the keys
are the contract between this repository and the game repository. They are in
[contract.md](contract.md), with the tests that pin each piece.

## Releasing

Two things are released, from two repositories:

| What                  | Repository                              | Who builds it                                       |
| --------------------- | --------------------------------------- | --------------------------------------------------- |
| The launcher          | `Shironex/night-maze-launcher` (public) | GitHub Actions, `.github/workflows/release.yml`     |
| The game and its feed | `Shironex/night-maze` (public)          | the game repository's own workflow and its own docs |

Launcher installers must not be released from the game repository, and game files not from
this one: "latest" in each repository has to stay what the launcher reads there.

The game's release workflow checks out this repository at a pinned commit and uses
`scripts/package-game.mjs`, `scripts/build-feed.mjs`, `scripts/sign-file.mjs` and the example
`verify_manifest`. What it may rely on is in
[contract.md](contract.md#what-the-games-release-workflow-uses). When one of those changes
here, the pin in the game repository has to be raised for the change to arrive there.

### Release the launcher

A pushed tag starts the release. I approve it once, and the runners build, sign, verify and
publish. Both repositories are public, so the runners cost nothing.

1. Set the new version in two places: `[workspace.package]` in `Cargo.toml` (the version the
   program is built with) and `version` in `package.json`. The workflow stops when they differ.
   Run `cargo check` so `Cargo.lock` follows.
2. Add a section for the version at the top of `CHANGELOG.md`:
   `## 0.1.2 (2026-10-07)`, then the text. It becomes the notes of the GitHub release and the
   `notes` of `latest.json`, which the launcher shows as plain text, so write plain sentences.
   A version without a section is not released.
3. Run `pnpm notices` if `Cargo.lock` or `pnpm-lock.yaml` changed beyond the version, make the
   [checks](#checks) green, commit and push `main`. Wait for the CI run of that commit.
4. Tag that commit and push the tag:

   ```sh
   git tag v0.1.2
   git push origin v0.1.2
   ```

5. Open the run of the `release` workflow in the Actions tab. When the `build` job is green,
   the `sign` job waits: click "Review deployments", tick `release`, approve. The summary of
   the `build` job shows the SHA-256 of the installer that is about to be signed.
6. Wait for `publish`. Its last step reads
   `https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json` and
   compares it with what was built. Then open an installed launcher and update it.

What the three jobs do:

| Job       | Runner  | Has                                                 | Does                                                                                                                                                                                                                                                                                                                        |
| --------- | ------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`   | Windows | no secret                                           | Checks that the tag is `v` plus the version, that `package.json` agrees, that the changelog has the section and that no release of the tag is published. Runs the tests. Builds the NSIS installer without a signature (`tauri.unsigned.conf.json`) and uploads it as `NightMazeLauncher-<version>-windows-x64-setup.exe`   |
| `sign`    | Windows | the updater key and its password, after my approval | Installs the Tauri CLI without running install scripts, downloads the installer and signs it with `tauri signer sign --app-version <version>`. Uploads the `.sig`. Nothing else runs in this job                                                                                                                            |
| `publish` | Ubuntu  | write access to releases, no signing secret         | Checks the `.sig` against the public key in `tauri.conf.json` and that it carries the version (`verify_file`). Writes `latest.json` and the notes. Removes a draft a failed run left behind, refuses when the release is already published. Creates a draft, compares the stored files, publishes, reads the public address |

The secrets are `TAURI_SIGNING_PRIVATE_KEY` (the content of `updater-a.key`) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. They belong to the environment `release`, not to the
repository, so only a job that names that environment gets them, and the environment asks for
my approval and accepts only `v*` tags. The workflow caches nothing and uses only actions
owned by GitHub, each pinned to a commit.

**If it fails**

- _`build` fails because of the code._ Nothing was signed or published. Fix it on `main`, then
  move the tag to the fixed commit: `git tag -f v0.1.2`, `git push -f origin v0.1.2`. That
  starts a new run. Moving a tag is fine as long as its release was never published.
- _A job fails for a reason outside the code_ (a runner, the network). Use "Re-run failed
  jobs" on the run. The installer of the first attempt is kept for a week and is used again;
  `sign` asks for approval again.
- _`publish` fails before its "Publish" step._ Nobody saw anything: a draft is never "latest".
  Re-run the failed job; it removes the draft and starts over.
- _The last step fails_ ("Check the address the launchers read"). The release **is** published.
  Do not re-run: look at the release page and at the address by hand.
- _A published release is bad._ Do not replace its files and do not reuse its version. Release
  a higher version. Deleting the release makes the previous one "latest" again for launchers
  that have not updated yet, but a launcher never goes back to a lower version by itself.

A second way to start the same release is a manual run of the workflow from the tag ("Run
workflow", then pick the tag instead of a branch).

**Rehearsal.** A manual run from a branch ("Run workflow" with `main`, or
`gh workflow run release.yml --ref main`) is a rehearsal: `build` runs completely and uploads
the unsigned installer as an artifact, `sign` and `publish` are skipped, no approval is asked
for and nothing is published. Do one after a change to the workflow.

### Fallback: release the launcher from my own PC

The way 0.1.0 and 0.1.1 were made. It needs `updater-a.key` on the machine. Use it when GitHub
Actions cannot be used; the result is the same two files. Run in PowerShell, from the
repository root, after steps 1 to 3 above.

1. Remove the old installers, so that exactly one `*-setup.exe` is built:

   ```powershell
   Remove-Item target\release\bundle\nsis -Recurse -Force -ErrorAction SilentlyContinue
   ```

2. Set the signing variables. The password is typed into a hidden prompt and is never an
   argument, so it does not reach the shell history:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.night-maze-keys\updater-a.key"
   $secure = Read-Host -AsSecureString 'Updater key password'
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
   ```

3. Build the installer. The build writes its `.sig` too, with the version recorded in it:

   ```powershell
   pnpm tauri build --bundles nsis --ci
   ```

   If the CLI warns that the private key does not match the public key configured in
   `tauri.conf.json`, stop: the wrong key file was used.

4. Clear the variables, then check the signature the way the workflow does:

   ```powershell
   Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
   $installer = (Get-ChildItem target\release\bundle\nsis\*-setup.exe).FullName
   cargo run -p night-maze-launcher-core --example verify_file -- $installer --version 0.1.2
   ```

5. Write the notes and `latest.json`, with the installer under its release name next to it:

   ```powershell
   New-Item -ItemType Directory -Force releases | Out-Null
   cmd /c "node scripts/release-notes.mjs --version 0.1.2 > releases/latest-notes.md"
   cmd /c "node scripts/release-notes.mjs --version 0.1.2 --footer .github/release-footer.md > releases/release-notes.md"
   node scripts/build-latest.mjs --bundle target/release/bundle/nsis --version 0.1.2 --repo Shironex/night-maze-launcher --out releases/launcher-0.1.2 --notes "@releases/latest-notes.md"
   ```

   `cmd` writes the bytes as they are; a PowerShell pipe would recode the text.

6. Create the release as a draft, look at it, then publish it. Only a published release that
   is not a prerelease becomes "latest". The tag must be pushed already:

```powershell
gh release create v0.1.2 --repo Shironex/night-maze-launcher --title "Night Maze Launcher 0.1.2" --notes-file releases/release-notes.md --draft --verify-tag releases/launcher-0.1.2/NightMazeLauncher-0.1.2-windows-x64-setup.exe releases/launcher-0.1.2/latest.json
gh release edit v0.1.2 --repo Shironex/night-maze-launcher --draft=false --latest
curl.exe -sL https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json
```

A tag pushed for this would also start the workflow. Reject its approval request, or the
two would race for the same release.

macOS: `build-latest.mjs` writes the Windows entry only and the workflow has no macOS job, so a
macOS installer is not part of any release and `latest.json` has no macOS entry. The places to
extend are named in the header of `release.yml`.

## What has been run by hand

On the evening of 2026-10-07, by me, on one Windows 11 PC: launcher 0.1.0 was released
and installed, 0.1.1 was released, and the installed 0.1.0 updated itself through the button in
Settings (it downloaded, closed, installed and started again as 0.1.1, and reported "up to
date"). Game 0.10.0 was then offered by the launcher, installed and started. Both repositories
are public since that evening; the launcher reads releases without a token, so with a private
game repository it shows "offline".

Not covered then: an install on a clean second machine, and the SmartScreen warning on a PC
that never saw the launcher. The installer is not code signed, so SmartScreen warns: "More
info", then "Run anyway".

## Keys

Four minisign keys, all made with `pnpm tauri signer generate`, each with a password. All four
have two backups in two different places, made on the day the keys were made, and each backup
was proven by signing a test file from it. A lost password is a lost key.

| Key          | Public half is in                                       | What it signs                                         | Where the private half is                                                       |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `updater-a`  | `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` | every launcher installer                              | my machine, the backups, and GitHub: a secret of the `release` environment here |
| `updater-b`  | `ROTATION_KEY` in `src-tauri/src/updater.rs`            | nothing; a spare, kept offline                        | the backups only                                                                |
| `manifest-a` | `RELEASE_KEYS[0]` in `crates/core/src/signature.rs`     | `manifest.json` and `news.json` of every game release | my machine and the backups; see the game repository's docs for its workflow     |
| `manifest-b` | `RELEASE_KEYS[1]` in `crates/core/src/signature.rs`     | nothing; a spare, kept offline                        | the backups only                                                                |

On my machine the keys are outside every repository, in `%USERPROFILE%\.night-maze-keys`
(macOS: `~/.night-maze-keys`). They are never committed, and the file names are all this
document says about them. The two B keys were removed from the machine after the backups were
made.

The development key in `dev-keys/` is not one of them. It exists in debug builds only and
signs local test feeds.

**What it means that updater A is on GitHub.** Until 0.1.1 the key existed on my PC and in the
backups, and signing needed my hands. Now GitHub holds it and its password too, so that a tag
can release without my PC. The plain consequence: **whoever takes over my GitHub account can
sign a launcher update that every installed launcher accepts**, by changing the workflow or the
environment rules and pushing a tag. The same is true for anybody who can change what runs in
the `sign` job. What stands in the way:

- the secrets belong to the environment, which only hands them to a job I approve, from a `v*`
  tag. That protects against a pull request or a stray branch, not against someone who is me
  on GitHub;
- the `sign` job runs no install scripts and nothing but the Tauri CLI, the actions are
  GitHub's own and pinned to commits, and nothing is cached, so less code can reach the key;
- the key is still encrypted with its password, but the password is stored next to it, so
  that only helps against a leak of one of the two.

**Updater B is what makes recovery possible.** It has never been on GitHub and is not on my
machine. If the account or key A is compromised, I take the account back (or move the
releases), sign the next release with B from a backup, and that release carries two new keys.
Installed launchers accept it because B is compiled into them. Without B, a leak of A could
not be undone: the attacker and I would hold the same key and nothing else. So B must never go
into a GitHub secret, and a release signed with B is made on my PC with the
[fallback](#fallback-release-the-launcher-from-my-own-pc), not on a runner.

A stolen key cannot be taken back from launchers that are already installed: they keep
accepting A until they update to a release that drops it.

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
- _Updater A._ Delete the two secrets from the `release` environment first. Build the next
  launcher release on my PC with `updater-b.key` as `TAURI_SIGNING_PRIVATE_KEY`. The CLI warns
  that it does not match the configured key; that is the expected case this time, and
  `verify_file` needs `--pubkey` with the content of the B public key. Installed launchers fail
  the check against A, try B once (`updater.rs`, `fetch`) and accept it. That release must
  carry a new `plugins.updater.pubkey` and a new `ROTATION_KEY`, or the next loss is final.
  Only the new A goes into the environment afterwards.
- _Both keys of a pair._ Nothing can be rotated. Make new keys, ship a new installer, and every
  friend installs it by hand.

**Rotation, in order:** make the new key pair; back it up in two places; put the new public
halves into the config or the constants (keep the one key that stays); build and release the
launcher signed with the key that installed copies still trust; check on a copy of the old
version that the update installs; only then retire the old key.

**Run once, on 2026-10-07, by me on one Windows 11 PC:** a real launcher update with key
A (0.1.0 to 0.1.1; `requireSignedVersion` accepted the signatures) and a real release signature
by manifest A (the `verify_manifest` example accepted the manifest of game 0.10.0, and the
installed launcher then showed its notes and installed it).

**Never run:** a rotation of either pair, the second-key retry in `updater.rs` against a real
release, signing with the key from the GitHub secret, and everything in
[Not done yet](#not-done-yet).

## Not done yet

- **The release workflow has never run.** Not the rehearsal and not a tag. It was parsed as
  YAML and read line by line, and what it runs was run on my PC on 2026-10-07 with
  the development key: the unsigned NSIS build with `tauri.unsigned.conf.json`, the signing
  command, `verify_file` (accepted with the development public key, refused with the key in
  the config) and `build-latest.mjs`. `verify_file` also accepted the published 0.1.1
  installer with the signature from its `latest.json`. Never run anywhere: the secrets as
  GitHub hands them over (the key may carry a line break, which the job removes), the approval
  of the `release` environment and its tag rule, artifacts passed between jobs, the `if:`
  conditions, `rustup` and `corepack` on the runners, the Ubuntu runner building the
  `verify_file` example, and every `gh` step of `publish` (finding and removing a draft,
  creating one, comparing its files, publishing).
- **CI has never run.** `ci.yml` was parsed and its commands are the local checks, which are
  green on Windows.
- **An installer signed on a runner has never been installed.** 0.1.2 is meant to be the first
  release built entirely on runners, and the update of an installed 0.1.1 to it is the proof.
  The signature of 0.1.2 is made by `tauri signer sign`, not by `tauri build` as for 0.1.0 and
  0.1.1. The two write the same format and `verify_file` checks it, but the updater in an
  installed launcher has only ever accepted the second kind.
- **The real update path was run once and only once**, on one PC (see
  [What has been run by hand](#what-has-been-run-by-hand)). The update on a clean second
  machine has not been tried.
- **Key rotation has never been tried**, for either pair.
- **macOS: everything.** The launcher has not been built or started on macOS. The transparent
  title bar (`src-tauri/tauri.macos.conf.json`), the ad hoc signature of the bundle, the
  executable bit on the unpacked game and the update of the launcher bundle are written from the
  documentation only. Releases are Windows only, and the window says so.
- **No code signing.** Windows SmartScreen warns about the installer on first start. How it
  behaves, and whether antivirus software objects to a program that downloads and starts
  another one, has not been tested on a PC that never saw the launcher.
- **Dependabot.** `.github/dependabot.yml` is new and has not produced a pull request yet. Two
  alerts were open for the launcher while it lived in the game repository: `source-map-js`
  (high, `pnpm-lock.yaml`) and `glib` (medium, `Cargo.lock`), and the automatic update runs
  for both had failed. Look at the alerts of this repository after the first push.
- **No language switch.** The window is English only.
- **The background is a recorded loop of the game** (a 45 second glide over the maze, about
  1.9 MB, made by `tools/record_launcher_loop.py` in the game repository), with a still picture
  when the video cannot play or motion is reduced. It has not been seen on macOS.
- **Running copies.** The launcher does not look for a copy of the game that was started
  outside of it.

## Third-party material in the launcher

`THIRD-PARTY-NOTICES.txt` in the repository root lists the Rust crates linked into the
launcher, the npm packages bundled into its window and the licence text of each. It is
installed next to the launcher (`bundle.resources` in `tauri.conf.json`).
`scripts/build-launcher-notices.mjs` (`pnpm notices`) writes it from `cargo metadata` and
`node_modules`, for Windows and Apple Silicon together, so the result is the same on both
machines. Run it again when `Cargo.lock` or `pnpm-lock.yaml` changes. It is committed, because
the build fails when a listed resource is missing. The game has its own notices file, written
by a script in the game repository.

Fonts, bundled through the `@fontsource` packages and used under the SIL Open Font License 1.1:
Atkinson Hyperlegible Next, Atkinson Hyperlegible Mono (Braille Institute of America) and
Cormorant Garamond (Christian Thalmann). Their licence texts are part of the notices file.

The launcher's own source is under the MIT licence (`LICENSE`). The recorded game footage and
the poster under `src/assets/` and the icons under `src-tauri/icons/` are not covered by it.
