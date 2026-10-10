# manko Extensions

Native WebAssembly Extension API 2.0 modules, a shared Rust SDK, the manko-ext publishing CLI, and the documentation website.

The local catalog contains AniList, MyAnimeList, HitomiLA, NHentai, LNORI, Omega Scans, MangaFox, MangaFire, MangaKakalot, MangaNato, MangaBat, and the Komga connector pilot. New providers are prepared locally; publication remains a separate release step. Existing source IDs and the repository URL are unchanged:
https://k800k.github.io/extensions/dist/v1/stable/

## Build And Validate

Install Rust with the pinned rust-toolchain.toml and wasm32-unknown-unknown target, then:

```sh
npm ci
cargo test --workspace --locked
npm run bundle
npm test
npm run check
npm run docs:check
npm run docs:build
npm run publish:dry-run
```

Cargo uses the default workspace target directory. Bundles contain versioned main.wasm files with SHA-256 and declared byte counts. The CLI validates guest ABI metadata before bundling.

```sh
node packages/cli/bin/manko-ext.mjs new --id ExampleSource --name "Example Source"
node packages/cli/bin/manko-ext.mjs new --kind tracker --id ExampleTracker
```

Scaffolding adds the crate to the workspace. Implement its JSON operations with manko-sdk. WASI and native imports are prohibited.

See [ABI.md](ABI.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md).

## Migration And Release

Existing JavaScript installations remain unavailable until the user selects Update. Manko preserves library IDs, downloads, history, settings, cookies, credentials and tracker queues. Failed staged validation leaves the prior installation intact. Removed providers keep their library content and removal controls.

Do not publish this catalog until the WASM-capable Manko app is released. Prepare local artifacts and run the publish dry run first. Other repositories remain supported by Manko when they publish compatible API 2.0 modules; native server connectors are unaffected.

Komga uses the same Rust/WASM toolchain with connector profile v1. Install the package, then add independent servers or explicitly switch an existing connection in Source Settings. Keep its catalog unpublished until a connector-capable Manko release is available.
