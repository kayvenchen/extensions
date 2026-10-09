<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright 2025 Inkdex; Copyright 2026 manko Extension Contributors -->

# Development

Extensions are Rust crates compiled to native WebAssembly using the shared manko-sdk. The catalog contains AniList, MyAnimeList, HitomiLA, NHentai, LNORI, MangaFox, MangaFire, Omega Scans and the Komga connector pilot.

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

Create a crate with manko-ext new --id ExampleSource, or add --kind tracker. The CLI registers it in the Rust workspace, validates metadata and exported ABI, and bundles a hashed, versioned main.wasm artifact.

Read the [Extension ABI](https://github.com/k800k/extensions/blob/main/ABI.md) for JSON dispatch, asynchronous native requests, cancellation, memory ownership and runtime limits.

Guest modules have no imports or WASI access. Use SDK context requests for HTTP, protected storage, metadata caching, time and visible authentication handoff. Domain result types, structured filters, suggestions and detail facets retain the native Manko contract.

Metadata cache reads must be validated. SDK remember coalesces matching loaders through native leases and fences stale writes. Mutable gallery metadata expires after 30 minutes, binary index ranges and suggestions after 5 minutes, routing after 1 minute. Only version-addressed data may use an indefinite lifetime. Hitomi browsing uses 100-byte page ranges; larger filtered indexes use binary chunks no larger than 16 KiB, with alignment and Content-Range validation.

Hitomi catalog projections validate every file hash but retain only the cover file. Details and installments omit unused file payloads; readers still resolve every page. Routing is parsed once as bounded labels and numeric assignments, never executed, and cached as a validated binary lookup table. Native fixtures cover cold and cached 1,070-page galleries and all 4,096 routing keys under the unchanged WasmKit fuel limits.

Increment versions whenever executable bytes change. Preserve IDs, attribution, provenance and source links. CI compiles Rust and validates compiled-WASM fixtures, catalog integrity and the website. Pages builds artifacts pinned to the deployment source revision.

CI verifies hashes, byte counts and ABI metadata against both committed and rebuilt artifacts. It compares generated catalog metadata without requiring cross-platform WASM byte identity. Manko's native tests also exercise compiled provider fixtures in WasmKit with the production execution limits.

## Release Coordination

Publish API 2.0 artifacts only alongside a WASM-capable Manko release. Existing installations require the user to select Update. JavaScript is never executed during metadata import or backup restoration, and failed updates leave the prior record intact. Native server connections and compatible independent repositories remain supported.

## Server connectors

Komga is an API 2.0 content package with `connectorKind: "komga"` and connector profile v1. It uses the same compiler, SDK, bundler and validation commands. One installed module can serve several native connections. Manko keeps setup, credentials, stable library IDs and file downloads native; Rust handles the server API. Existing connections opt in through Source Settings. Connector publication requires the corresponding app support.
