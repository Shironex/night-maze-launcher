# Changelog

What changed in each release of the launcher, newest first. The release workflow copies the section of the released version into the notes of the GitHub release and into `latest.json`, where the launcher shows it as plain text before it updates itself. A version without a section here is not released.

## 0.1.2 (2026-10-07)

The first release built, signed and published by GitHub Actions instead of on my PC. An installed 0.1.1 updating to it is the proof that this works.

- The background is now a recorded loop of the real game, a slow glide over the maze, with a still picture when the video cannot play or motion is reduced.
- The header says Windows only, because that is what ships.
- Releases are built by GitHub Actions from a tag, and the installer signature is checked before anything is published.

## 0.1.1 (2026-10-07)

A small release that proves the launcher can update itself: an installed 0.1.0 finds it, installs it and restarts. Nothing else changed.

## 0.1.0 (2026-10-07)

The first release of the Night Maze launcher: it installs the game, shows what is new and keeps both the game and itself up to date.
