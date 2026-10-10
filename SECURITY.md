# Security

This file says what a vulnerability in the launcher can be, what is not one, and where to send a report.

The launcher downloads and starts a program, and it replaces itself. So the part that matters is the chain that decides what it is willing to install:

- The launcher's own update is checked against the updater public key compiled into it. `requireSignedVersion` is on, so an installer whose signature does not carry the announced version is refused.
- The game's `manifest.json` (and `news.json`) is checked against the two manifest public keys compiled into the launcher, before anything is parsed. Then the zip is checked against the size and SHA-256 in that manifest, before anything is unpacked.
- The release workflow signs in its own job, behind the `release` environment. Only a `v*` tag can reach it, and it waits for my approval. The `build` and `publish` jobs hold no signing secret. Every action is pinned to a commit.

[docs/contract.md](docs/contract.md) and [docs/development.md](docs/development.md) describe this in full.

## What counts

- **Anything that makes an installed launcher install or run something that was not signed by the release keys.** This covers the launcher's own update and the game.
- **A downgrade to a known bad version** that a signature check should have stopped.
- **An archive entry that writes outside the install folder.** The unpacker reads the whole zip first and refuses all of it if one entry has an absolute path, a drive letter or a colon, a `..` part, or is a symbolic link, or if the zip has more than 20,000 entries or unpacks to more than 2 GB. A name that gets past that counts.
- **A release asset that does not match the tagged source**, or a way to make the release workflow sign or publish something else.
- **A way for web content in the window to reach something it should not.** The page makes no network request (its content security policy allows none), and its Tauri capability is limited to listening to the launcher's events and moving, minimising, maximising and closing its own window. Anything that gets more than that counts.

## What does not count

- **The Windows SmartScreen warning.** The installer is not signed with a paid certificate. Click "More info", then "Run anyway".
- **The development key in `dev-keys/`.** Its private half is public on purpose, with an empty password. Only debug builds trust it (`#[cfg(debug_assertions)]` in `crates/core/src/signature.rs`), so no installed launcher accepts it. The CI installer signed with it is not a release.
- **A bug in the game itself.** Report it in the [game repository](https://github.com/Shironex/night-maze/issues/new/choose).
- **Advisories in the dev toolchain** (the test runner, the linter, the build tools) that do not ship in the installer. Send them as a normal issue.

## Reporting

Use GitHub's private vulnerability reporting for this repository: <https://github.com/Shironex/night-maze-launcher/security/advisories/new>. It opens a draft advisory that only I can see. Please do not put the finding in a public issue.

Say which version you tested, what you did, and what happened. There is no bounty. I will answer, fix it in a new release, and publish the details once the fix is out. I credit you unless you ask me not to.

## Supported versions

Only the latest release. I fix forward, never as a backport. The fix reaches people through the launcher's own update.
