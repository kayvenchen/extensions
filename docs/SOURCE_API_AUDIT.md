# Public source API audit — 2026-10-09

Scope: HitomiLA, NHentai, LNori, OmegaScans, MangaFox, MangaFire. No trackers/connectors, publication, credential reset, or paid-content access. Browser observations used Vercel's `derive-client` skill with an isolated agent-browser session. Raw HARs are temporary verification evidence in the reserved Manko DerivedData `Artifacts` directory; they must not be committed. This document deliberately omits cookies, signing values, complete media URLs and site content.

## Request map

| Source | Catalog and pagination | Details and reading | Media / headers / expiry |
|---|---|---|---|
| HitomiLA | Browser `/index-all.nozomi` and `/galleryblock/{id}.html` card fragments on the static host; extension `/n/index-english.nozomi`, `date/published` and `popular/{period}` variants. Ranged big-endian 32-bit gallery IDs; 25-ID/100-byte windows. First response one gallery, next four complete the five-title window. | `ltn.gold-usergeneratedcontent.net/galleries/{id}.js` assigns `galleryinfo`, including metadata and file hashes. `/reader/{id}.html` uses `/gg.js` routing. Single gallery, no chapter transition. | `atn.gold-usergeneratedcontent.net/avifbigtn/…` covers; bounded `aN.gold-usergeneratedcontent.net` readers. Site Referer, Range and identity encoding for binary indexes. Routing generation expires; refresh routing on stale image errors. Native Standard allows four concurrent requests, retaining cooldowns. |
| nHentai | `/api/v2/galleries?page=…`, `/galleries/popular`, `/search?query=…&sort=…&page=…`. JSON gallery arrays and pagination metadata. | `/api/v2/galleries/{id}` includes titles, tags and ordered page paths. One gallery installment. Browser homepage remained on verification; API and real images succeeded via compiled extension, so browser trace coverage is incomplete. | `t.nhentai.net/galleries/{media}/…` covers and `i.nhentai.net/galleries/{media}/…` pages. Explicit supplied image paths, not guessed extensions. Site Referer, JSON Accept/Content-Type. Preserve verification cookies. |
| LNORI | `/library` returns the complete HTML catalog, filtered/paged locally in batches of 25. No catalog JSON endpoint observed. | `/series/{number}/{slug}` HTML/structured metadata links to `/book/{number}/{slug}`. Book HTML contains sectioned volume text and illustrations. Two distinct series and volumes observed. | `cdn.lnori.com/cover/*.webp`, `img.lnori.com`. Site Referer and reviewed HTTPS hosts. No expiring signature observed. |
| Omega Scans | `api.omegascans.org/query` with page, perPage and query/filter parameters; JSON data and meta. | `omegascans.org/series/{slug}` HTML/Flight metadata. API `/chapter/query?page=1&perPage=10000&series_id={id}` lists free chapters. `/series/{slug}/{chapter}` HTML provides ordered image paths. Two adjacent free chapters traced. | `media.omegascans.org/file/…`. Site Referer. Observed valid JPEG served as `image/jpg`; version 0.1.1 normalizes only that alias before SDK image validation. Native resource handles are preserved; HTML remains rejected. |
| MangaFox | `fanfox.net/directory/`, `/directory/{page}.html`; `/search?title=…&page=…`. HTML list and pager. | `/manga/{slug}/` metadata and chapter links. `m.fanfox.net/manga/{slug}/{chapter}/{page}.html` supplies `#image` and ordered page-selector URLs. Two titles and adjacent chapter pages observed. | Covers `fmcdn.mfcdn.net`; reader `zjcdn.mangafox.me`. Reader-page Referer for images. Query signatures and TTLs are retained verbatim and re-resolved through page HTML when expired. |
| MangaFire | `/api/top-titles?type&days&limit&genres_ex[]&vrf`, `/api/titles?content_rating[]&genres_ex[]&order[…]&page&limit&vrf`. JSON items/meta with current/last page and hasNext. | `/api/titles/{hid}`, `/api/titles/{hid}/chapters?language&sort&order&page&limit`, `/api/chapters/{chapterID}`. Two title IDs and adjacent chapter IDs traced. | Site Referer. `vrf` derived per request; do not store captured values. Current reader returned `l1n.mfcdn1.xyz` and `nw8.mfcdn2.xyz` URLs, missing from previous allowlist. Version 0.1.1 accepts DNS subdomains of mfcdn1.xyz and mfcdn2.xyz while rejecting lookalike suffixes, bare apex and HTTP. Browser catalog requests overlap; Manko Standard now permits bounded overlap, preserving slow modes/cooldowns. |

## Repairs and regression evidence

- MangaFire CDN/MIME regressions: eleven source behavior tests passed, including current host and hostile DNS boundary cases. The cover CDN also requires the source-specific `image/jpg` normalization.
- Omega MIME regression: six source behavior tests passed, including MIME parameters/case, native image-resource handles and rejection of HTML. Live repaired WASM fetched a free chapter's real JPEG successfully.
- Final extension validation: all Rust workspace tests, all 111 Node behavior/CLI tests, and the nine-extension manifest check passed. Local bundled catalog digests match the compiled modules; no publication was performed.
- Manko loads saved filter selections before the catalog, defers filter configuration behind landing structure, prefetches/decodes the first five covers through the existing coalescing cache, and delays secondary shelves until initial cover preparation finishes or fails.
- Short catalog pages fill toward five without relying on the bottom sentinel's viewport visibility. Existing cursor-progress and error guards still apply, with at most four initial continuations.
- Three new native prefetch tests passed: bounded distinct covers, image failure/missing URLs, and cancellation.

- Full native non-UI run passed: 1,037 tests (1,433 parameterized executions), two skipped, zero failed; app compiled successfully. MCP timed out while waiting at 300 seconds, but the recorded xcodebuild process completed successfully at 364 seconds and its result bundle confirmed the outcome.

## Measurement rules

Only the opt-in Simulator UI audit measures selection-to-five-decoded-covers. It clears the named `local-source-audit` source's content and image caches, retains credentials, discards its runtime, and performs three cold launches plus one warm launch. The clock begins before tapping the source; runtime initialization and cover readiness are included. The app exports its monotonic readiness timestamp only in the opt-in Debug Simulator audit. The test subtracts the monotonic timestamp recorded before tapping, excluding subsequent XCTest polling overhead; tap dispatch overhead remains included. All three cold runs must be below one second to pass. Direct WASM probes below are diagnostics, **not** acceptance results and do not include native rendering.

| Direct compiled-WASM probe | Catalog | Five cover responses | Reader |
|---|---:|---:|---|
| HitomiLA | 2.296 s | 3.461 s | 122-page list; actual AVIF |
| nHentai | 0.482 s | 2.112 s | 36-page list; actual WebP |
| Omega Scans | 1.013 s | 1.535 s | 15-page free chapter; actual JPEG |
| MangaFox | 0.393 s | 0.492 s | 61-page chapter; actual JPEG |
| MangaFire | 0.560 s | 0.749 s | 208-page older chapter; actual JPEG on mfcdn2 |

These individual observations cannot establish three-run performance. In particular, Hitomi and nHentai cover-host latency and Omega's catalog latency already exceed the target in observed network responses. Browser verification barriers and upstream delays remain failures/blockers, never cached passes.

## JavaScript versus WASM investigation

The user reported that the JavaScript implementation felt faster. Comparison against Manko commit `f63deb8` and extensions before `b7828f9` confirms several separate changes:

- JavaScript executed inside WKWebView. Current Rust/WASM executes in WasmKit 0.4.1's Swift interpreter, not a native-code WASM engine.
- Current Debug Simulator compile logs explicitly show `swiftc -module-name WasmKit -Onone`. WebKit's engine did not inherit Manko's Swift Debug optimization setting. A diagnostic build with `SWIFT_OPTIMIZATION_LEVEL=-O` reduced the 40-page fixture first-five time from 1.655 s to 0.753 s (initialization 0.075 s, first title 0.390 s, cached first title 0.052 s). This is a whole-build comparison, not an isolated WasmKit microbenchmark or a committed build-setting change.
- The WASM host serializes dispatch input to JSON, copies it into guest linear memory, copies output back, and decodes JSON for each invoke/resume. The JavaScript bridge also serialized messages; exact incremental cost is not yet isolated.
- The old native runtime did not have the new one-second catalog-start gate. The gate is source-aware now, while server cooldowns and concurrency caps remain.
- Old Hitomi JavaScript returned 25 items with a four-worker pool; current Hitomi returns one then four to expose an early selectable title. Manko now fills the first five without waiting for the pagination sentinel.
- The existing native fixture test, with local transport responses, recorded initialization 0.165 s, first title 1.043 s and first five 1.655 s for 40-page galleries in Debug. These are fixture diagnostics, not live network or cover-readiness measurements.

## Debug Simulator acceptance measurements

All 24 runs reached five decoded covers. All 18 cold runs missed the one-second target. Warm here means a fresh app launch retaining the source content cache. nHentai is accepted as subjectively responsive by the user; remaining performance work prioritizes Hitomi.

| Source | Cold 1 | Cold 2 | Cold 3 | Warm | <1 s cold target |
|---|---:|---:|---:|---:|---|
| HitomiLA | 5.697 s | 5.622 s | 5.308 s | 0.774 s | Failed |
| NHentai | 3.426 s | 3.453 s | 3.318 s | 0.569 s | Failed |
| LNori | 11.924 s | 12.151 s | 12.058 s | 0.538 s | Failed |
| OmegaScans | 2.827 s | 2.759 s | 2.615 s | 0.595 s | Failed |
| MangaFox | 4.165 s | 4.011 s | 3.990 s | 0.539 s | Failed |
| MangaFire | 2.573 s | 2.194 s | 2.262 s | 0.581 s | Failed |

The optimized full-suite diagnostic was stopped after repeated rendering/accessibility failures (64 reported issues); it is not a passing validation run. The earlier normal Debug suite passed. A first focused selector matched zero tests and was corrected to select the complete compiled-provider suite.

The optimized compiled-provider suite passed all 13 tests. The 1,070-page Hitomi fixture still took 2.894 s to five titles despite optimization, versus 0.753 s for 40-page galleries, exposing remaining payload-dependent work. A Simulator restart restored accessibility temporarily, but opening MangaFox title details in the experimental app produced repeated `UIObservationTrackingFeedbackLoopDetected` logs; the normal Debug rebuild successfully opened the same title and reader. No optimization override was committed.

## Native reader journey observations

- MangaFox: One Piece details, chapter list and actual decoded pages passed; continuous scrolling crossed chapter 1 into 1.1.
- MangaFire: All-Class Awakening details and actual decoded pages passed; continuous scrolling crossed chapter 49 into 50 using the repaired 0.1.1 bundle.
- The large Computer Use drag gestures in MangaFox and MangaFire landed near the next chapter’s end. A subsequent short Omega swipe entered page 1 of chapter 2 correctly. No reader implementation change was made from these observations; small-gesture entry-position verification for MangaFox/MangaFire remains incomplete.
- Omega Scans native details exposed HTML markup in the synopsis. The local 0.1.1 bundle now decodes the description to plain text; formatted/entity fixture and catalog digest checks passed (nine focused Node tests).

- Omega Scans: metadata and native image rendering passed; a short continuous swipe crossed chapter 1 to page 1 of chapter 2. The synopsis repair subsequently passed focused source tests; that final text-only change was not reinstalled for another native screenshot.
- LNORI: title metadata, volumes, actual text, saved position, and contents navigation passed. The requested text-chapter scroll boundary was not conclusively verified.
- HitomiLA and NHentai: five decoded covers passed in the native catalog audit, and direct compiled-WASM probes loaded metadata, page lists and actual images. Native end-of-gallery journeys were not completed; those checks are **unverified**, not passes.

The user subsequently requested that testing be finished and the task wrapped up. No additional reader-timing instrumentation was added. Reader opening was observed functionally where listed above, but no trustworthy Read-tap-to-first-content timings were collected.

## Completion matrix

| Source | Native catalog: five decoded covers | Native title / reader | Required scrolling | Repair / remaining limit | Final screenshot files under `Artifacts/SourceAudit` |
|---|---|---|---|---|---|
| HitomiLA | Passed readiness; cold timing failed | Direct WASM probe only; native journey incomplete | Gallery end unverified | Native pacing and automatic first-five continuation; remaining interpreter/payload/network cost | `HitomiLA-catalog.png` |
| NHentai | Passed readiness; cold timing failed | Direct WASM probe only; native journey incomplete | Gallery end unverified | Behavior retained; browser verification prevented complete trace | `NHentai-catalog.png` |
| LNori | Passed readiness; cold timing failed | Passed metadata, volumes and rendered text | Text chapter boundary unverified | Whole-library HTML parsing remains slow; no extension change | `LNori-catalog.png`, `LNori-reader.png` |
| OmegaScans | Passed readiness; cold timing failed | Passed metadata and decoded pages | Chapter 1 → chapter 2 page 1 passed | JPEG alias and plain-text synopsis fixes; final synopsis fixture passed | `OmegaScans-catalog.png`, `OmegaScans-reader.png` |
| MangaFox | Passed readiness; cold timing failed | Passed metadata and decoded pages | Chapter 1 → 1.1 passed; small-gesture entry position unverified | No extension parser change needed in traced requests | `MangaFox-catalog.png`, `MangaFox-reader.png` |
| MangaFire | Passed readiness; cold timing failed | Passed metadata and decoded pages | Chapter 49 → 50 passed; small-gesture entry position unverified | CDN1/CDN2, JPEG alias and native bounded Standard concurrency | `MangaFire-catalog.png`, `MangaFire-reader.png` |

No source meets the unchanged three-cold-runs-under-one-second acceptance target. This is a partial repair and measured audit, not a claim that all requested journeys or performance targets passed.

## Final verification

The final normal Debug build succeeded, followed by the complete non-UI suite: **1,037 passed, 2 skipped, 0 failed** (result bundle total 1,039 tests). The run finished successfully after MCP's 300-second response timeout; the native result bundle was inspected and a JSON summary retained as `Artifacts/SourceAudit/final-native-test-summary.json`. No extra app build was needed because this test build compiled Manko.

Extension validation: all Rust tests and all 111 Node tests passed before the final Omega synopsis-only repair. After that repair, the WASM bundle rebuilt and all nine affected Omega/CLI checks passed. Local MangaFire and Omega versions are 0.1.1; nothing was published. Browser raw HARs and duplicate screenshot exports were removed after the sanitized report and final captures were retained.
