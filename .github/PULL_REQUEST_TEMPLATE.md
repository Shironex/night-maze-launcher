<!-- Keep this short. CONTRIBUTING.md has the long version. -->

## What

<!-- One or two sentences: what was wrong, and what this changes. Link the issue we agreed on: Closes #123 -->

## Checklist

- [ ] I opened an issue first and we agreed on the fix.
- [ ] `pnpm build` ran first (the Rust shell embeds `dist/`), then `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test` and `pnpm test:scripts` are green.
- [ ] `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings` and `cargo test --workspace` are green.
- [ ] If I changed a command, a type it returns or an event: I regenerated `src/bindings.ts` with `UPDATE_BINDINGS=1 cargo test -p night-maze-launcher`, committed it, and `pnpm bindings` passes.
- [ ] The change is small and plain, and each commit is `type(scope): summary` with one logical change.
- [ ] It does not touch the signing keys, the update address, the manifest format or the release workflow, and not the video, the poster, the icons or the wording of the window.
