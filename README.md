# Night Maze Launcher

[![Latest release](https://img.shields.io/github/v/release/Shironex/night-maze-launcher)](https://github.com/Shironex/night-maze-launcher/releases/latest)

A small desktop program that installs [Night Maze](https://github.com/Shironex/night-maze), keeps it up to date and starts it.

> [!WARNING]
> This is a university project that I keep working on to learn OpenGL (for the game) and Tauri and Rust (for the launcher). It changes a lot, and things will break here and there. Expect rough edges and breaking changes between versions.

## Download

Get the installer from the [latest release](https://github.com/Shironex/night-maze-launcher/releases/latest). Windows 10 or 11, 64 bit, only for now.

The installer is not signed with a paid certificate, so Windows shows "Windows protected your PC". Click "More info", then "Run anyway".

## What the launcher does

- Installs the newest build of the game and shows its release notes
- Updates the game, and updates itself through the "Update launcher" button
- Keeps the previous game version, and goes back to it if a new version does not start
- Checks the signatures of the release information it downloads and of its own installers, and the size and SHA-256 of the game download
- Starts the installed game when there is no network
- Has no telemetry: it fetches release files from GitHub and sends nothing else anywhere

Everything is installed per user, with no administrator rights.

## Why this repository is separate

An installed launcher looks for its own updates at the latest release of this repository. The latest release of the [game repository](https://github.com/Shironex/night-maze) has to stay the newest game release, because the launcher reads the game's release information from there. If the launcher installers were released in the game repository, a launcher release would take over "latest" and break that address. So the installers have their own home here.

## Where the source is

For now the launcher's source lives in the [`launcher/`](https://github.com/Shironex/night-maze/tree/main/launcher) folder of the game repository. I plan to move it here.

## Licence

Until the source moves, see the [LICENSE](https://github.com/Shironex/night-maze/blob/main/LICENSE) in the game repository.
