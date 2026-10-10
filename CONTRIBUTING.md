# Contributing

Thanks for looking. This is a small project that I make alone, to learn Tauri and Rust. I want to be able to explain every line in it, so I keep it small and plain. Please read the next section before you spend time on a pull request.

## What is welcome

- **Bug reports and install or update reports.** The issue forms ask for what I need. Use them.
- **Pull requests that fix a bug.** Open an issue first, so we agree on the fix before you write it.
- **A new feature starts as an idea**, in [Ideas in the game repository](https://github.com/Shironex/night-maze/discussions/categories/ideas). Discussions are off here on purpose, so there is one place to look. A feature pull request without that talk will be closed.

I may rewrite a pull request, ask you to shrink it, or decline it. This is not about the quality of your work. I need to understand and keep the code. A small pull request that changes one thing has the best chance.

## What is not open to pull requests

- **The window's art, the background video and the texts.** They are mine and stay all rights reserved (see `LICENSE`). A wrong spelling or a broken sentence is a fine bug report.
- **The signing keys, the update address, the manifest format and the release workflow.** The updater keys and the update address are compiled into every installed launcher and cannot be changed from outside. If you think something there is wrong, report it (privately, if it is a security problem: see [SECURITY.md](SECURITY.md)). In files, this means `.github/workflows/`, `dev-keys/`, `docs/contract.md`, `crates/core/src/signature.rs`, `src-tauri/src/updater.rs`, the `plugins.updater` part of `src-tauri/tauri.conf.json` and the release scripts that the game repository uses.

## Set up

You need Rust (`rust-toolchain.toml` pins it), Node 22 and pnpm 10, and the WebView2 runtime on Windows. Then:

```sh
pnpm install
pnpm tauri dev
```

[docs/development.md](docs/development.md) has the rest: how to run against a local test server and a throwaway folder (do this, so you do not touch your real install), what each folder does, and the layout on disk. [docs/contract.md](docs/contract.md) describes the release files that the launcher and the game share.

pnpm refuses a dependency version younger than 7 days (`minimumReleaseAge` in `pnpm-workspace.yaml`). If an install fails on a fresh release, that is why. Do not add a dependency in a bug fix.

## Before you open the pull request

`.github/workflows/ci.yml` runs these on a Windows runner. Run them yourself first:

```sh
pnpm build                 # first: the Rust shell embeds dist/ and does not compile without it
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:scripts
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace
```

If you changed a command, a type it returns or an event, regenerate `src/bindings.ts` with `UPDATE_BINDINGS=1 cargo test -p night-maze-launcher` and commit it. `pnpm bindings` checks it: a test fails while the file is out of date.

I do not ask for a `CHANGELOG.md` entry in pull requests. I write it when I make a release.

## Commits and pull requests

Conventional commits, always with a scope, in lowercase: `type(scope): summary`. The types are `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build` and `perf`. The scopes in use are `launcher`, `window`, `core`, `scripts`, `development`, `release` and `deps`, among a few more (`git log --format=%s` shows them). One logical change per commit. The title of the pull request has the same shape, for example `fix(window): keep a long error text inside the ledger`.

## Labels

Besides the usual `bug`, `documentation` and so on, the `area:*` labels say where a change lives:

- `area:window`: the page of the window: React, styles, texts.
- `area:core`: download, verify, install, go back a version, start the game.
- `area:updater`: the launcher updating itself.
- `area:build`: scripts, CI, the release workflow, the installer.

I set the labels. You do not need to.
