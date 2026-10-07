# The contract between the launcher and the game repository

Two repositories publish files that an installed launcher reads:

| Repository                     | Publishes                                                                     | Read by                    |
| ------------------------------ | ----------------------------------------------------------------------------- | -------------------------- |
| `Shironex/night-maze`          | game zips, `manifest.json`, `news.json` and a `.sig` for each of the two json | the launcher's core (Rust) |
| `Shironex/night-maze-launcher` | the launcher installer and `latest.json`                                      | `tauri-plugin-updater`     |

An installed launcher cannot be changed from outside, only replaced by an update it accepts. So everything on this page is frozen into every copy that is installed today. A change here needs a new launcher first, and `launcher.min` in the manifest to keep the old ones away from what they cannot read.

The game's release workflow checks out this repository at a pinned commit and runs its scripts. This page is what that workflow may rely on.

## The two addresses

| What                    | Address                                                                                | Compiled in at                                             |
| ----------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| The game's manifest     | `https://github.com/Shironex/night-maze/releases/latest/download/manifest.json`        | `DEFAULT_FEED` in `crates/core/src/net.rs`                 |
| The launcher's own feed | `https://github.com/Shironex/night-maze-launcher/releases/latest/download/latest.json` | `plugins.updater.endpoints` in `src-tauri/tauri.conf.json` |

`manifest.json.sig` is read from the same address with `.sig` appended. `news.json` is read from the `feed` address in the manifest, or next to the manifest when there is none, and its signature from that address with `.sig` appended.

"Latest" means the newest published release that is not a prerelease. That is why each repository releases only its own thing: a launcher release in the game repository would take over "latest" there and the manifest address would stop resolving. It is also why a release is created as a draft and published last, when all of its files are in place.

Only https is accepted, also after redirects.

## Game release files

A game release holds one zip per system, `manifest.json`, `news.json`, `manifest.json.sig` and `news.json.sig`.

```text
NightMaze-0.9.0-windows-x64.zip        NightMaze-0.9.0-macos-arm64.zip
  night_maze.exe                         night_maze            (mode 755, ad hoc signed)
  assets/                                assets/
  THIRD-PARTY-NOTICES.txt                THIRD-PARTY-NOTICES.txt
```

The zip name is `NightMaze-<version>-<platform>.zip`. The platform keys are `windows-x64` and `macos-arm64` (`platform_key` in `crates/core/src/layout.rs`). Only Windows is released so far.

### `manifest.json`

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

- `schema`: a launcher refuses a number it does not know and treats the check as failed. It is `1`.
- `version`: exactly `major.minor.patch`. It becomes a directory name.
- `game.<platform>.url`: the zip, by the permanent address of its release, not the moving "latest" one.
- `size`, `sha256`: checked after the download. A size of 0 is refused.
- `exe`: a bare file name inside the zip.
- `launcher.min`: see below.
- `feed`: where `news.json` is. Without it the launcher reads `news.json` next to the manifest.
- `notes`: one line, shown when the feed cannot be read.
- `channel`, `published`: written for people, not read by the launcher.

### `launcher.min`

A launcher older than `launcher.min` does not install the release and says so; the main button turns into "Update launcher". The installed game still starts. It is the one tool for a change that old launchers cannot read: raise it in the same release that needs the newer launcher. The scripts write `0.1.0` unless `--launcher-min` says otherwise.

### `news.json`

It fills the highlight card, the Updates, News and Notices tabs and the changelog dialog. The launcher works without it and shows every string as plain text.

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

`updates` is built from the game's changelog, one section per version, newest first:

```markdown
## 0.9.0 (2026-12-05) Milestone release

The headline of the release

One intro sentence.

### Gameplay

- A bullet point
```

A version without a section still gets an entry: its version, the date of the build and the title passed with `--title`. `news` and `notices` come from an optional JSON file passed to `build-feed.mjs` with `--extra`.

## The `.sig` format

A `.sig` file is what the Tauri CLI's `signer sign` writes: the base64 of a minisign signature text, four lines.

```text
untrusted comment: signature from tauri secret key
<base64 of the signature: the algorithm "ED", the key id, the Ed25519 signature>
trusted comment: timestamp:1791390998	file:manifest.json
<base64 of the signature over the line above>
```

- The signature is prehashed (the `ED` kind: Ed25519 over the BLAKE2b hash of the file). The older kind that signs the file directly is refused. The Tauri CLI has never written it.
- It is over the exact bytes of the file. Nothing may reformat a json file after it is signed, and the launcher checks the signature before it parses a byte.
- The fields of the trusted comment are separated by tabs. A signature of a launcher installer has a third field, `version:<x.y.z>`, see below.
- A public key has the same wrapping: the base64 of the two lines of a minisign `.pub` file.

`scripts/sign-file.mjs` makes a `.sig`. It takes the key as a file and the password from the environment variable `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, never as an argument.

What the launcher does with a bad signature: a manifest whose signature is missing or wrong is a failed check, and the installed game still starts. A feed whose signature is missing or wrong is treated like a missing feed.

## The launcher's own update

The release of this repository holds two files:

- `NightMazeLauncher-<version>-windows-x64-setup.exe`, the NSIS installer.
- `latest.json`:

```json
{
  "version": "0.1.2",
  "notes": "Plain text, shown in the settings before the update.",
  "pub_date": "2026-10-07T16:36:53.801Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<the content of the installer's .sig, verbatim>",
      "url": "https://github.com/Shironex/night-maze-launcher/releases/download/v0.1.2/NightMazeLauncher-0.1.2-windows-x64-setup.exe"
    }
  }
}
```

The only platform key is `windows-x86_64`. The updater validates every entry of `platforms`, so a system that is not shipped must be absent, not empty.

`requireSignedVersion` is on: the trusted comment of the installer's signature must carry `version:<version>`, the version `latest.json` announces. `tauri build` writes it by itself; `tauri signer sign` needs `--app-version`. It stops a changed `latest.json` from pairing a new version number with an older, genuine installer.

The tag of a launcher release is `v` plus the version, because the installer address inside `latest.json` is built from it.

## The keys

Four release keys, all minisign keys made by `pnpm tauri signer generate`. Each public half is compiled into the launcher:

| Key          | Public half is in                                       | Signs                                                 |
| ------------ | ------------------------------------------------------- | ----------------------------------------------------- |
| `manifest-a` | `RELEASE_KEYS[0]` in `crates/core/src/signature.rs`     | `manifest.json` and `news.json` of every game release |
| `manifest-b` | `RELEASE_KEYS[1]` in `crates/core/src/signature.rs`     | nothing; the spare, kept offline                      |
| `updater-a`  | `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` | every launcher installer                              |
| `updater-b`  | `ROTATION_KEY` in `src-tauri/src/updater.rs`            | nothing; the spare, kept offline                      |

A manifest or a feed is accepted when either manifest key signed it. An installer is checked against updater A, and against updater B when that check fails. Who holds the private halves, and what to do when one is lost, is in [development.md](development.md#keys).

**The development key** (`dev-keys/dev.key`, public half `dev-keys/dev.key.pub`) is not one of them. Its private half is committed with an empty password on purpose, so it proves nothing. A debug build of the launcher trusts it in addition to the manifest keys, for local test feeds; in a release build the constant does not exist (`#[cfg(debug_assertions)]` in `signature.rs`). The scripts sign with it by default for any address that is not on github.com, and refuse to use it by default for one that is.

## What pins each piece

| Piece                                                            | Pinned by                                                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| The bytes the scripts write for a manifest and a feed            | `scripts/lib/feed.test.mjs`: regenerates `scripts/fixtures/contract/manifest.json` and `news.json` from fixed inputs and compares byte for byte |
| That the launcher reads exactly those files                      | `crates/core/tests/contract.rs`: parses the same two fixtures with `Manifest::parse` and `NewsFeed::parse` and compares the values              |
| Manifest rules (schema, version, `exe`, checksum)                | the unit tests in `crates/core/src/manifest.rs`                                                                                                 |
| `launcher.min`                                                   | `crates/core/tests/flows.rs` (a release that asks for launcher 9.0.0)                                                                           |
| The `.sig` format as the real CLI writes it                      | `a_signature_written_by_the_tauri_cli_is_accepted` in `signature.rs`, on `crates/core/tests/data/signed-by-dev-key.json` (never edit that file) |
| Signing through the scripts                                      | `scripts/lib/sign.test.mjs`, `scripts/package-game.test.mjs`                                                                                    |
| Missing, wrong or foreign signatures                             | `crates/core/tests/flows.rs` (five tests from `a_manifest_without_a_signature_is_ignored...` on)                                                |
| The release keys and that the dev key is not one                 | `release_keys_are_real` and `a_release_build_trusts_the_release_keys_only` in `signature.rs`                                                    |
| The updater keys, the update address, no `version` in the config | the tests in `src-tauri/src/updater.rs`                                                                                                         |
| `version:<x>` in a signature                                     | `the_signed_version_is_the_whole_version_field_of_the_trusted_comment` in `signature.rs`                                                        |
| The shape of `latest.json` and the installer name                | `scripts/lib/latest.test.mjs`, `scripts/build-latest.test.mjs`                                                                                  |

To change the format on purpose: change the writer, run `UPDATE_FIXTURES=1 pnpm test:scripts` (PowerShell: `$env:UPDATE_FIXTURES = '1'` first), then make `crates/core/tests/contract.rs` and the parser agree, and think about `launcher.min`.

## What the game's release workflow uses

All of these work from another working directory, with explicit arguments. The usage is in the comment at the top of each file.

| Tool                                                                                                                       | Use                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/package-game.mjs`                                                                                                 | Packs one build into the zip. `--assets` and `--notices` default to `assets` and `THIRD-PARTY-NOTICES.txt` in the working directory, which is the root of the game repository there         |
| `scripts/build-feed.mjs`                                                                                                   | Writes `manifest.json` and `news.json` for the zips in a folder and signs them. For a github.com address it needs `--sign-key` or `--no-sign`                                               |
| `scripts/sign-file.mjs`                                                                                                    | Signs one file                                                                                                                                                                              |
| `cargo run --manifest-path <checkout>/Cargo.toml -p night-maze-launcher-core --example verify_manifest -- <manifest.json>` | Checks `manifest.json` against the two manifest keys and parses it as the launcher does. When `news.json` or `news.json.sig` is next to it, that pair is checked too, and half a pair fails |

The scripts need Node 22 and no `pnpm install`, except signing, which starts the Tauri CLI from this repository's `node_modules`. `rust-toolchain.toml` pins the Rust version for commands started inside this repository; a `cargo run --manifest-path` from another directory uses that directory's toolchain.
