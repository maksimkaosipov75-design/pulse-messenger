# Contributing to Pulse

## Development setup

1. Install [rustup](https://rustup.rs/), Node.js 20+, and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.
2. `npm install`
3. `npm run tauri dev`

## Code style

- **Rust** — `cargo fmt`; `cargo clippy --all-targets -- -D warnings` must be clean. Avoid `unwrap()` in service code: return `Result<_, String>` and propagate with `?`.
- **TypeScript** — strict mode is on; `npx tsc --noEmit` must pass. Components are function components; shared state lives in Zustand stores under `src/stores/`.
- **User-facing strings** go through i18next: add keys to **both** `src/locales/en.json` and `src/locales/ru.json`.
- Backend calls from new code should use `invokeWithRetry` from `src/services/api.ts` for reads; mutations should surface failures via the toast store.

## Tests

```bash
cd src-tauri && cargo test --lib
```

Service tests live in `#[cfg(test)]` modules next to the code. Tests must not touch the real OS keyring or user data — use the `from_signing_key` / `from_secret` test constructors and `tempfile::tempdir()` for storage.

## Pull requests

1. Branch from `main`.
2. Make sure CI passes locally: `cargo fmt --check`, clippy, tests, `npm run build`.
3. Keep commits focused; describe *why* in the commit body when the change isn't obvious.
4. Database schema changes need a migration in `storage.rs` (bump `DB_VERSION`, add a guarded migration block) and a test covering upgrade from the previous version.

## Reporting security issues

See [SECURITY.md](SECURITY.md) — please do not open public issues for vulnerabilities.
