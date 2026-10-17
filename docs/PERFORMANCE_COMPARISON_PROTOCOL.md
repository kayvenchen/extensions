# Equivalent website and native timing

Status, 14 October 2026: Simulator admission succeeded after a fresh free-space check (15.55 GiB). An optimized Debug audit build now records in-process native and reference-WebKit measurements. Repeated benchmark collection was stopped at the user’s request. Functional checks continue with timings recorded; see [the timing record](RECORDED_EXTENSION_TIMINGS.md). Partial sets and slower observations are retained without an all-source threshold pass. Earlier external-observer measurements, unoptimized runs, viewport-mismatched reference runs, and native runs made before the audit cache correction remain calibration evidence only.

## Measurement contract

Use the same reserved iPad, orientation, effective viewport, network and content on both surfaces. The debug-only `SourceWebsiteTimingView` provides the website on that Simulator with a document-start readiness observer and a nonpersistent `WKWebsiteDataStore`. It is built in `AppFixtures.swift` and enabled only with `MANKO_PERFORMANCE_RUN`, a public-source audit selection, and `MANKO_WEBSITE_TIMING=1`. A locally staged `Documents/ExtensionAudit/website-timing.json` names the source, public URL, flow, content key, readiness predicate, and optional repetition count. Initial URLs must match the source manifest host allowlist. Login integrations cannot be selected. Keep native measurements on production screens and compiled WASM.

Start at the in-process navigation request, before fetching or preparing content. Finish at the next rendered frame after all applicable readiness conditions hold. Record monotonic durations within each process; never subtract clocks from different processes, or time tool calls. `requestAnimationFrame` and native display callbacks provide frame-aligned readiness proxies, not physical display-photon measurements. Record their frame interval and retain a conservative uncertainty band around the threshold.

| Flow | Identical readiness condition on both surfaces |
|---|---|
| Catalog | Agreed initial visible card set has titles, selectable destinations and decoded covers; record the exact set as the content key. A loading skeleton or downloaded-but-unrendered image does not qualify. |
| Details | The same title's metadata and installment list are laid out and the reading action is usable. Record the installment set/revision. Metadata alone does not qualify. |
| Reader | The same first page image is decoded and visible, or the same first text block has visible glyph layout. A presented reader shell does not qualify. |
| Next page | The requested next image/text content is visible after navigation. Record origin and destination; exclude resumed page 2 when page 1 was requested. |

Use five paired repetitions **per cache condition and flow**, preferably interleaving app and website order. Record when repetitions are collected in surface blocks instead; this weakens control of changing network conditions. Cold means fresh isolated application/HTTP/media caches on each surface; it does not imply reset DNS, TLS, OS disk or upstream CDN caches. Warm means a completed identical priming flow with caches retained. Do not prefetch a measured reader page while preparing a cold run's prerequisite screen. Preserve each surface's normal prefetch behavior during the measurement and record requests/bytes as diagnostic evidence.

Stop a source on rate limiting or verification challenges; retain the failure and mark its expected rows unverified. Never log in. OPDS, Komga, Kavita, Suwayomi, AniList and MyAnimeList remain excluded. Public sources lacking a usable comparison retain an explicit blocker; fixture measurements cannot fill live rows.

## Result validation

`node scripts/compare-performance.mjs INPUT.json OUTPUT.json` computes medians, ranges and the tolerance `max(0.2 × website median, 250 ms)`. It exits unsuccessfully for any failure, inconclusive or unverified row. All expected source/flow/cache rows must be declared before collecting samples. Missing rows, failed readiness, duplicate attempts, mismatched content/viewports, uncontrolled cache labels and external-observer clocks cannot become passes. Keep failed collection attempts separately with their reasons rather than silently overwriting samples.

Input has `schemaVersion: 1`, an `expected` array of `{source, flow, cache}`, and `samples`. Each sample requires:

- `source`, `flow` (`catalog`, `details`, `reader`, `next-page`), `cache` (`cold`, `warm`), `surface` (`website`, `app`), and integer `pair`.
- `status: "ready"`, `transport: "live-public"`, `clock: "in-process-monotonic"`, `start: "navigation-request"`, and `end: "frame-after-ready"`.
- `milestone`: respectively `visible-cards-and-decoded-covers`, `metadata-and-installments`, `first-readable-content`, or `next-readable-content`.
- Finite `durationMs`, observed `frameIntervalMs`, and `cacheState` (`isolated-empty` or `retained-after-prime`).
- A stable `contentKey`, `machine`, `network`, and `viewport: {width, height}` shared across all repetitions.

These fields are an evidence contract, not proof on their own: retain raw timestamp events, cache-reset logs and readiness screenshots with the recording. The validator cannot establish that a caller truthfully measured its declared endpoints.

For a repeatable breach, trace request count, fetch/parse/decode stages and native main-thread work. Fix the measured cause, rerun affected tests, and recollect the same five pairs under the same cache condition. Preserve before/after recordings. Do not tune the readiness predicate or remove slow successful samples to obtain a pass.

## Current harness safeguards and limitations

- The reference waits for app bootstrap before loading. Both durations use native monotonic uptime; the website endpoint includes delivery of its frame-ready message across the WebKit bridge. Tool and screenshot time is excluded.
- Native catalog timing begins at its initial content-load task, details at the first detail-load request, and readers before preparation. These are content-navigation measurements, not launch or touch-to-navigation-animation measurements.
- `viewport` records the same Simulator window in logical points (1032 × 1376). Reference records additionally retain the CSS `contentViewport`; some desktop sites select a wider layout viewport and scale it into the same window. Preserve this distinction in results.
- The catalog milestone currently targets one agreed first card, including its title/destination and visible decoded cover. It does not claim the whole homepage or all five first-shelf covers are ready.
- The audit now uses a real `ContentCache` beneath its isolated PublicState directory. Previously `memoryOnly: true` disabled retained entries, invalidating the intended normal warm-cache workload. A fresh run namespace isolates other media keys; resetting PublicState isolates database and metadata caches.
- Reference image predicates should call `decodedImage(image)`; this waits for `HTMLImageElement.decode()` and subsequent readiness frames. A completed download alone is insufficient.
- Retain all raw JSONL rows. Do not silently promote single cold samples, partial image transitions, unmatched text pagination, or missing source flows to threshold passes.
