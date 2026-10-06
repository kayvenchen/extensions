# Extension ABI 2.0

Modules target wasm32-unknown-unknown, export memory, and have no imports, including WASI. Manko embeds WasmKit 0.4.1 with software memory checks and fuel metering on an isolated Swift actor.

## Exports

- manko_alloc(i32 byteCount) -> i32 pointer allocates guest-owned writable bytes.
- manko_dealloc(i32 pointer, i32 byteCount) -> void frees that exact allocation.
- manko_dispatch(i32 pointer, i32 byteCount) -> i64 reads UTF-8 JSON without taking ownership.
- Dispatch packs the output pointer in the high 32 bits and byte count in the low 32 bits. The host copies the result then frees it with manko_dealloc. No pointer survives a dispatch.

Memory references are checked before access. Modules are limited to 10 MiB, memory to 128 MiB, dispatch to 100 million fuel units, and an invocation to 500 million total fuel units. Existing operation deadlines still apply. Unsupported exports, imports, API versions and malformed responses are rejected.

## Dispatch

Requests are JSON objects:

```json
{"action":"metadata"}
{"action":"invoke","invocationID":"host-owned UUID","method":"search","arguments":{"title":"example","metadata":null}}
{"action":"resume","invocationID":"host-owned UUID","responses":[{"id":"guest effect ID","payload":{},"error":null}]}
{"action":"cancel","invocationID":"host-owned UUID"}
```

Metadata returns id, kind (content or tracker), apiVersion (2.0), imageRequestMode (independent), and cachePolicy (metadata). All must match the catalog where specified.

Operations return {"ok":true,"value":...}, {"ok":false,"error":{"name":"...","message":"...","type":"..."}}, or {"pending":[{"id":"...","service":"http","arguments":{...}}]}. Effect IDs are unique within an invocation. There may be up to 64 outstanding effects; pending can be empty while prior effects are still running. The host resumes after each effect finishes. Manko replaces guest-supplied invocation/request owners with native identities. Cancellation drops guest futures and cancels owned native requests.

Content inputs preserve Manko adapter contracts: details receives {workID}, installments {sourceWork}, imagePages {extensionInstallment}, search {title,selections,filters,sort,metadata}. The Rust SDK normalizes these to provider inputs. Other content methods include initialize, settings, discoverSections, discover, searchFilters, searchSuggestions, invalidateCache, updates and managedCollections. Tracker methods are authentication, trackerSearch, progress, update and collections. Domain result JSON is unchanged.

imagePageContents receives urls and requestIDs arrays (maximum four). Each dispatch can include completed: [{requestID,envelope}] alongside pending or the final result. The SDK emits independently completed images immediately, without waiting for other images. Opaque native resourceID values belong to the native invocation and cannot be persisted, forged or consumed by another runtime.

## Native Services

- http: url, method, headers, bodyBase64, imageResource. Manko retains its existing broker destination policy and system ATS enforcement; destinations are not pinned to advisory catalog hosts. Native HTTP handles cookies, redirects, pacing, Cloudflare inspection and verified browser transport.
- state / secureState: operation get, set, remove or reset, key and optional value. Writes require the active namespace authorization. Reserved verification keys are never exposed. Ordinary-state reset clears the namespace; secure-state reset removes only the specified key, never the native verification profile.
- cache: read/write/remove with key, ttlSeconds (positive or null for immutable data), permit and value. acquire/release serialize identical metadata loaders and release on cancellation. Revalidate cached data before reuse. Never cache tokens, cookies, HTTP envelopes, errors or image bytes.
- clock: now, milliseconds and random unsigned 32-bit integer.
- sleep: milliseconds, 0-60000, cancellation-aware.
- challenge: url requests visible native verification.
- log: accepts redacted diagnostic metadata.

There is no page execution, JavaScript evaluation, native filesystem, direct network, worker or process service. WebKit is reserved for native visible authentication, Cloudflare verification and verified transport.

Repository Schema V2 publishes extension.runtime = wasm, apiVersion = 2.0, moduleURL, sha256, size, allowedHTTPSHosts and authenticationModes. Legacy scriptURL metadata remains readable by Manko but cannot execute.

### Optional tracker reading metadata (API 2.0)

Trackers may implement `trackingCapabilities`, returning `{ "supportsDateUpdates": true|false }`. Older modules may reject this operation; hosts then treat date writes as unsupported. `progress` may add `startDate` and `finishDate` as objects containing optional Gregorian `year`, `month`, `day`, and positive `totalChapters` / `totalVolumes` (null or zero means unknown).

Scores use the host’s 1–10 scale (fractional inbound scores remain fractional), with null for unrated. Status uses `planning`, `reading`, `completed`, `paused`, `dropped`, `rereading`. Updates may contain `dateUpdates`: missing start/finish keys leave remote values untouched; explicit null clears them. AniList implements date writes. MyAnimeList exposes dates read-only because its documented manga-list update endpoint does not include date fields. Metadata-only totals are never written back.
