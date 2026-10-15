# manko Extensions

Native WebAssembly Extension API 3.0 modules, a shared Rust SDK, the manko-ext publishing CLI, and the documentation website.

Two independent repositories are published from this workspace:

- Official: OPDS, Komga, Kavita, Suwayomi, AniList and MyAnimeList — `https://kayvenchen.github.io/extensions/dist/official/v1/stable/`
- Community: separately maintained content scrapers — `https://kayvenchen.github.io/extensions/dist/community/v1/stable/`

Manko starts empty. Adding a repository installs nothing; users choose each package explicitly. The old mixed catalog is retired and empty.

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

## Server connectors

All four server integrations run as downloaded WASM packages. Native Manko code owns endpoint policy, credentials and publication/image transfers. Install a connector, then add a connection from Extensions. Each connection has its own identity and state namespace. No server, repository, package or tracker account is preinstalled.

API 3 catalogs use ordinary schema-3 JSON and require no publisher signing keys. Run `npm run bundle` and `npm run publish:dry-run` before publishing. Users review website and account permissions in Manko. See [Security](SECURITY.md#catalogs-and-publishing).
