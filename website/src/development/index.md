<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Copyright 2025 Inkdex; Copyright 2026 manko Extension Contributors -->

# Development

Extensions are Rust crates compiled to native WebAssembly using the shared manko-sdk. The catalog contains AniList, MyAnimeList, HitomiLA and NHentai.

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

Metadata cache reads must be validated. SDK remember coalesces matching loaders through native leases and fences stale writes. Mutable gallery metadata expires after 30 minutes, index lists and suggestions after 5 minutes, routing after 1 minute. Only version-addressed data may use an indefinite lifetime.

Increment versions whenever executable bytes change. Preserve IDs, attribution, provenance and source links. CI compiles Rust and validates compiled-WASM fixtures, catalog integrity and the website. Pages builds artifacts pinned to the deployment source revision.

## Release Coordination

Publish API 2.0 artifacts only alongside a WASM-capable Manko release. Existing installations require the user to select Update. JavaScript is never executed during metadata import or backup restoration, and failed updates leave the prior record intact. Native server connections and compatible independent repositories remain supported.
