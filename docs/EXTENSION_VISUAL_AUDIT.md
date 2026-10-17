# Extension audit — 13–14 October 2026

**Latest result:** all 15 compiled extensions pass the fixture audit (425 operations); all retain the native visual evidence below. The final LNori saved-position failure is fixed and visually verified. The complete non-UI suite passes 1,117 tests, with two skips and no failures. [Recorded timings](RECORDED_EXTENSION_TIMINGS.md) include fixture timings and the collected live measurements; repeated threshold benchmarking ended at the user’s request. Live services requiring login remain excluded. Earlier entries below are chronological evidence and may describe issues subsequently resolved.

This audit is local. At the user’s request, login-dependent live checks are excluded; OPDS, Komga, Kavita, Suwayomi, AniList and MyAnimeList use isolated fixtures. Public-source live checks remain in scope. Existing unrelated working-tree changes are preserved. Fixture and live results are separate; a successful WASM call does not establish a visual or website-relative performance pass.

## Reproducing the deterministic audit

1. `npm test` compiles release WASM and exercises the shared response fixtures.
2. `node scripts/audit-extensions.mjs` writes recordings and actual compiled packages to `target/extension-audit/fixtures/<extension>/`.
3. Reserve Manko's existing Simulator and canonical build slot using its `Scripts/build-resources.py` policy, build the Debug app, and install it.
4. Copy the generated fixture folders to the app container's `Documents/ExtensionAudit/`.
5. Launch with `MANKO_EXTENSION_AUDIT=<extension ID>`. `MANKO_EXTENSION_AUDIT_RESET=1` resets only that extension's disposable audit state. `MANKO_FIXTURE_APPEARANCE=dark` selects dark presentation.

The app uses the compiled package with the production content/connector/tracker adapters. Its HTTP transport matches method, complete URL, body, and byte range and rejects unrecorded requests. Audit database, extension state, and the file-backed download queue live below the selected fixture folder; content caches are memory-only. The queue replaces the original transient fixture queue, which could show a downloaded installment that could not reopen after app relaunch. Original cover artwork replaces recorded image bytes. Tracker artwork uses the injected client too, bypassing persistent image caches and preventing live-image fallback. URLSession POST body streams are matched byte-for-byte as well as in-memory bodies. Server publication downloads use an allowlist of the actual fixture acquisition results and pass through normal publication validation and installation. OPDS, Komga and Kavita use the checked-in original two-chapter EPUB in `scripts/fixtures/observatory.epub`. Tracker tokens and writes are fictional and isolated.

## Discovery mapping

| Source | Website/server surface | Extension equivalent |
|---|---|---|
| HitomiLA | English catalog; newest/published; daily, weekly, monthly, yearly popularity; random; tag/language navigation | Existing catalog and native sort/filter controls; single catalog contract retained |
| NHentai | Latest, Popular Today, search/tags | `latest`, `popular`, native search/filter configuration |
| LNori | Featured hero, seasonal anime, popular novels, library and library filters | New `featured`, `seasonal`, `popular`; compatible `library` retained and used for sorted browsing |
| MangaFox | Hot releases, being read, ranking, recommendations, new releases, trending, updates, genre directory | New `hot`, `reading`, `ranking`, `recommended`, `new`, `trending`, `latest`; compatible `directory` and native genre field |
| MangaFire | Daily, weekly and monthly trending, updates, directory | New `trending-day` and `trending-month`; compatible weekly `trending` and `latest` retained; native search configuration |
| MangaKakalot | Popular, latest, new, completed, genre navigation | Existing `hot`, `latest`, `new`, `completed`, filters |
| MangaNato | Popular, latest, new, completed, genre navigation | Shared MangaBox implementation |
| MangaBat | Popular, latest, new, completed, genre navigation | Shared MangaBox implementation |
| OmegaScans | Comic updates, popular comics, newly added comics | `latest` now sorts `updated_at`; separate `new` uses `created_at`; `popular` retained. Unsupported novel content excluded |
| OPDS | Server feed, navigation/acquisition links | Feed browse and acquisition |
| Komga | Server libraries, series, books | Connector discovery, catalog, installments and acquisition |
| Kavita | Server libraries, series, volumes/chapters | Connector discovery, catalog, installments and acquisition |
| Suwayomi | Configured server source, catalog and chapters | Connector browse/search, installments, page URLs and acquisition |
| AniList | Account, media search, reading lists/progress | Tracker presentation, search, matching, collections, fixture-only writes |
| MyAnimeList | Account, manga search, reading lists/progress | Tracker presentation, search, matching, collections, fixture-only writes |

## Implemented reliability changes

- LNori and MangaFox reuse one homepage response across shelves and preserve source order while deduplicating cards. Their existing directory/library identifiers remain valid.
- MangaFox genre requests reject unsupported combinations instead of silently discarding filters.
- OmegaScans latest updates no longer accidentally means newly created series.
- MangaBox details and installments reuse validated series HTML for two minutes, removing a duplicate document fetch. Every chapter now retains its parent work ID, fixing native reader validation for MangaKakalot, MangaNato and MangaBat.
- Missing-cover lettering now retains a 2:3 layout instead of being enlarged and clipped by the shared cover container.
- Manko’s connector adapter now supplies a Library discovery grid. Previously, the catalog screen received no discovery sections even though connector browsing was implemented.
- EPUB scroll navigation now ignores the outer chapter pager when selecting a vertical viewport. The larger pager had no vertical travel and caused Next to skip the remaining chapter text. A nested-scroll regression test covers this, and OPDS manual inspection confirms movement within the chapter.
- The audit runner reports incomplete flows as blocked, including a catalog/title with no readable installment; these are not reader passes.
- Progressive text restoration re-resolves its DOM range after layout/annotation changes, fixing the saved-position timeout. Wide scroll readers use a centered 80ch text column.
- Retrying a failed first shelf retains already-loaded secondary shelves.
- Cancellation after a completed WASM dispatch no longer discards the shared guest instance. Missing-image retries previously changed from a useful not-found error to “runtime ended unexpectedly”; the rebuilt app retains the not-found error and can reopen the title.

## Evidence and remaining work

The core fixture flows and listed fixes are implemented. The follow-up fixes the reader restoration timeout and expands filter and failure coverage. Website-versus-native timing acceptance remains separate from fixture/runtime results.

Machine-readable fixture and live call results are generated under `target/extension-audit/{fixtures,live}/results.json`. Live mode is `node scripts/audit-extensions.mjs --live`; `--source=ID,ID` limits requests. It measures HTTP plus Node WASM execution, not app rendering or browser readiness. It does not supply the five paired cold/warm website-versus-app runs required for performance acceptance.

The initial audit exposed an intermittent progressive-reader saved-position timeout and an incomplete LNori HTML fixture. The fixture now contains a complete document. The follow-up reproduced and fixed the independent restoration timeout in production code; the latest complete non-UI run passes 1,114 tests with two skipped and no failures. See follow-up verification below for the regression and subsequent tablet checks.

Live checks for OPDS, Komga, Kavita, Suwayomi, AniList and MyAnimeList were excluded by the user. Their offline passes cannot be described as live passes. MangaKakalot returned verification challenges; one MangaNato section returned rate limiting. OmegaScans' sampled title had no readable installment. These checks remain explicitly blocked rather than hidden by fixture success.

## Per-extension evidence

“Native” below means manual Computer Use on the reserved iPhone 17 Simulator using the actual compiled package and offline transport. “Live” means the Node WASM runner against upstream HTTP, not a native live-session or browser comparison. All 15 offline runtime audits pass. Request-count assertions verify zero warm homepage requests for LNori/MangaFox and no duplicate series-document fetch for MangaKakalot/MangaNato/MangaBat details → installments. Screenshots use original synthetic artwork and text.

| Extension | Native fixture review | Live HTTP/WASM | Limits |
|---|---|---|---|
| HitomiLA | Catalog, details, reader; all three pages loaded | Pass | Other sort periods not visually traversed |
| NHentai | Catalog, details, reader; all three pages loaded | Pass | Tag/filter combinations not exhaustively traversed |
| LNori | Catalog, details, readable text; position 1 → 2 | Pass | Library pagination covered by runtime fixture |
| MangaFox | Catalog, details, reader | Pass | Third-page recording corrected and native next-page recheck passed |
| MangaFire | Catalog, details, reader and next chapter preview | Pass | Every fixture chapter recorded to match native first-chapter selection |
| MangaKakalot | Catalog, details, reader; third page loaded | Blocked by verification | No challenge bypass attempted |
| MangaNato | Catalog, details, reader; third page loaded | Partial: completed section rate-limited | Other catalog/detail/reader calls passed |
| MangaBat | Catalog, details, reader; third page loaded | Pass | Live measurements are single samples |
| OmegaScans | Catalog, details, reader; third page loaded | Partial | Sampled live title had no readable installment |
| OPDS | Library, details, download completion, EPUB text | Excluded by user | Original EPUB verified in paged and scroll modes; scroll viewport selection fixed; downloaded EPUB reopens after app relaunch |
| Komga | Library, details, download completion, EPUB text | Excluded by user | Original EPUB scroll navigation rechecked after shared viewport fix |
| Kavita | Library, details, download completion, EPUB text | Excluded by user | Original EPUB scroll navigation rechecked after shared viewport fix |
| Suwayomi | Library, details, streamed reader; third page loaded | Excluded by user | Missing-cover layout fixed and reviewed in dark/large text |
| AniList | Signed-in account, search, match, retrieved reading/chapter progress | Excluded by user | Collections and writes passed runtime fixtures; not native UI writes |
| MyAnimeList | Signed-in account, search, match, retrieved reading/chapter progress | Excluded by user | Collections and writes passed runtime fixtures; not native UI writes |

The tracker fixture intentionally has no local chapter metadata. The native tracking sheet correctly displays “Chapter numbers are unavailable” rather than pushing guessed progress. No real tracker account was changed.

## Performance evidence

These are **single live runtime samples in milliseconds**, inclusive of HTTP and Node WASM work. They are not medians, browser timings, native screen readiness, or evidence of meeting the 20%/250 ms comparison tolerance.

| Source | Details | Installments | Reader descriptor/text |
|---|---:|---:|---:|
| HitomiLA | 257 | 1 | 279 |
| NHentai | 378 | 0 | 0 |
| LNori | 47 | 1 | 365 |
| MangaFox | 283 | 2 | 416 |
| MangaFire | 320 | 832 | 306 |
| MangaNato | 68 | 8983 | 1177 |
| MangaBat | 2053 | 13234 | 1205 |
| OmegaScans | 1367 | 398 | Unavailable |

No five paired cold/warm website-versus-app timing sets were completed. The available in-app-browser interface does not expose the browser Performance API in its read-only evaluation scope, and the native visual fixture flows do not provide comparable live readiness measurements. Performance acceptance remains open. MangaBox’s slow live chapter calls deserve a matched follow-up; the cache regression verifies eliminating the duplicate series-document request, not a claimed percentage speedup.

LNori’s discovery layout was also inspected at the iPhone’s wide landscape width. Dark appearance and large text were inspected on the shared Suwayomi catalog and details layout.

## Deterministic workload measurements

Five isolated runs of every compiled WASM package passed. These millisecond medians and ranges measure fixture transport plus Node WASM only; they exclude native rendering, image decoding, and real network latency. Warm catalog calls reuse the runtime’s cache. Zero milliseconds means below the runner’s one-millisecond rounding resolution.

| Extension | Details or tracker search | Installments or tracker progress | Warm catalog requests |
|---|---:|---:|---:|
| HitomiLA | 4 (3–6) | 0 (0–1) | 0 |
| NHentai | 0 (0–1) | 0 (0–1) | 1 |
| LNori | 2 (1–3) | 0 (0–0) | 0 |
| MangaFox | 4 (2–5) | 1 (1–1) | 0 |
| MangaFire | 5 (5–5) | 2 (2–2) | 0 |
| MangaKakalot | 6 (5–6) | 17 (16–19) | 1 |
| MangaNato | 5 (5–10) | 16 (16–18) | 1 |
| MangaBat | 5 (5–12) | 18 (16–27) | 1 |
| OmegaScans | 5 (4–5) | 13 (13–15) | 0 |
| OPDS | 0 (0–1) | 0 (0–0) | N/A |
| Komga | 0 (0–0) | 0 (0–0) | N/A |
| Kavita | 0 (0–0) | 0 (0–0) | N/A |
| Suwayomi | 0 (0–0) | 0 (0–1) | N/A |
| AniList | 1 (1–2) | 1 (1–1) | N/A |
| MyAnimeList | 2 (2–3) | 0 (0–1) | N/A |

Detailed request counts: `target/extension-audit/fixture-workload.json`. These measurements do not replace website/native comparisons.

## Exact remaining acceptance gaps

- Native public-source live sessions and five paired website/native cold/warm samples are not completed; no performance pass is claimed.
- Login-dependent live verification is excluded by the user; no credentials or private servers are required for this audit.
- Representative tablet catalog, details, reader, filters, empty results, retry, missing artwork, malformed responses and tracker expiry are manually reviewed. All configured sort choices and filter fields are invoked in the runtime audit. Every combination and every per-extension native failure state are not individually traversed.
- Narrow layouts have rendering-test coverage; manually dragging the tablet window resize handle did not resize it, so narrow tablet window interaction is not claimed. Portrait and landscape tablet views were inspected.
- Most compact catalog fixtures contain one representative title; realistic high-density, mixed-dimension artwork and large native chapter-list coverage are not complete across every source.
- OPDS, Komga and Kavita now use an original two-chapter EPUB. The discovered scroll-mode chapter skip is fixed; Next visibly moves within the current chapter. Readium’s position indicator counts publication positions, not viewport-sized pages.
- Suwayomi’s streamed reader passed; its CBZ download was not manually exercised. The publication fixture currently covers EPUB acquisition only.
- Fixture transport and package validation are local; publishing was not performed.

## Screenshot index

- HitomiLA: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/HitomiLA-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/HitomiLA-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/HitomiLA-reader.png)
- NHentai: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/NHentai-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/NHentai-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/NHentai-reader.png)
- LNori: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/LNori-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/LNori-details.png), [reader-next](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/LNori-reader-next.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/LNori-reader.png), [wide-catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/LNori-wide-catalog.png)
- MangaFox: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFox-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFox-details.png), [reader-next](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFox-reader-next.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFox-reader.png)
- MangaFire: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFire-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFire-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaFire-reader.png)
- MangaKakalot: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaKakalot-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaKakalot-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaKakalot-reader.png)
- MangaNato: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaNato-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaNato-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaNato-reader.png)
- MangaBat: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaBat-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaBat-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MangaBat-reader.png)
- OmegaScans: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OmegaScans-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OmegaScans-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OmegaScans-reader.png)
- OPDS: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OPDS-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OPDS-details.png), [reader-next](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OPDS-reader-next.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/OPDS-reader.png)
- Komga: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Komga-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Komga-details.png), [reader-next](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Komga-reader-next.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Komga-reader.png)
- Kavita: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Kavita-catalog.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Kavita-details.png), [reader-next](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Kavita-reader-next.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Kavita-reader.png)
- Suwayomi: [catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Suwayomi-catalog.png), [dark-catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Suwayomi-dark-catalog.png), [dark-large-catalog](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Suwayomi-dark-large-catalog.png), [dark-large-details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Suwayomi-dark-large-details.png), [details](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Suwayomi-details.png), [reader](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/Suwayomi-reader.png)
- AniList: [account](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/AniList-account.png), [progress](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/AniList-progress.png), [search](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/AniList-search.png)
- MyAnimeList: [account](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MyAnimeList-account.png), [progress](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MyAnimeList-progress.png), [search](/Users/kayvenchen/Library/Developer/Xcode/DerivedData/Manko-cqmnrorwgptkulgboicvvnhsccyf/Artifacts/ExtensionAudit/MyAnimeList-search.png)

## Validation commands

- Extensions: `npm test` passed the Rust workspace and 177 JavaScript/runtime tests. The final shared audit test passed all 16 cases after extending filter/suggestion recordings and the long-title fixture.
- Catalog: `npm run check` passed all 15 packages; `npm run bundle` and `npm run publish:dry-run` validated six official and nine community packages locally.
- Manko: after fixing the restoration timeout, the complete non-UI suite passed 1,114 tests, with two skipped and zero failures; the final rerun after cancellation-fixture isolation took 374.1 seconds. After the tablet text-column adjustment, all 155 reader tests passed (69.3 seconds). After the catalog retry-visibility and offline challenge-handoff changes, 37 source-catalog tests and all 54 rendering tests passed (145.3 seconds). The final test build compiled the app successfully (44.0 seconds); the subsequent runtime-cancellation build also succeeded (52.0 seconds), and that app was installed for the final tablet review. Earlier failed and successful summaries remain historical evidence, superseded by these results.
- No XCUITest was run. Computer Use supplied the manual visual evidence.


## Follow-up verification

The timeout was reproduced in the **return to beginning** stage after navigating to position 20 and applying an annotation. Both modern and legacy locators could fail, with the content still hidden. The old JavaScript retained one DOM Range for up to 120 animation frames. Restoration now resolves and aligns the requested text on each layout frame, checks a non-empty visible rectangle, and cancels an older check when superseded. A deterministic regression replaces the target text node in the same JavaScript turn; it verifies that text becomes visible again. This fixes the failure without increasing the timeout.

- Five repeated progressive-reader runs passed after the fix (88.1 s including runner overhead).
- Complete non-UI verification passed **1,114 tests, two skipped, zero failures**, with `TEST EXECUTE SUCCEEDED` (440.8 s). The MCP connection timed out after 300 s; the still-running process completed, and `xcresulttool` supplied the result. Evidence: `Artifacts/ExtensionAudit/full-suite-reader-fixed.json`.
- The extensions Rust workspace and all **177 JavaScript/runtime tests** passed. The final focused audit's 16 cases passed after extending suggestions and long-title fixtures. All 15 packages passed catalog validation, bundle creation, and local publication dry-run.
- The fixture audit now invokes all **40 sort choices**, **38 filter fields**, **18 supported exclusions**, and available pagination. LNori, MangaFox, MangaFire and OmegaScans also record blank and filtered lookup suggestions. These are runtime checks; native representative interactions are listed separately.
- All 15 packages reject HTTP 503 with an explicit service error and successfully retry against the same runtime/cache. The app's strictly recorded transport adds opt-in `MANKO_EXTENSION_AUDIT_FAULT=retry|unavailable|expired|challenge|malformed|missing-images`. `retry` fails only the first non-image request per isolated token. No scenario enables live fallback.
- A subsequent complete run after the WASM cancellation fix passed 1,113 tests and failed one cancellation-probe assertion, with two skipped (386.3 s). The fixture reused a global probe, allowing late URLSession callbacks from the preceding request to alter the next test. Requests now capture an independent probe generation by object identity; the final rerun is recorded below. The intermediate failed summary is retained as `full-suite-retry-fix.json`.
- **Final complete run: 1,114 passed, two skipped, zero failures (374.1 s)** after the probe isolation fix; `TEST EXECUTE SUCCEEDED`. The final incremental build succeeded in 52.0 s. Evidence: `Artifacts/ExtensionAudit/full-suite-final.json`. The missing-image Retry flow was rechecked with this app: repeated attempts retain the expected not-found error, and returning to details no longer shows the terminated-runtime failure. The final error layout was captured in portrait after rotation.

| Source | Sorts | Filter fields | Exclusions | Paginated flows |
|---|---:|---:|---:|---:|
| HitomiLA | 7 | 9 | 8 | 8 |
| NHentai | 4 | 12 | 7 | 0 |
| LNori | 4 | 2 | 2 | 6 |
| MangaFox | 1 | 1 | 0 | 2 |
| MangaFire | 12 | 4 | 1 | 13 |
| MangaKakalot | 3 | 3 | 0 | 0 |
| MangaNato | 3 | 3 | 0 | 0 |
| MangaBat | 3 | 3 | 0 | 0 |
| OmegaScans | 3 | 1 | 0 | 0 |

A zero pagination count means the compact recording is a terminal page, not proof that all upstream pagination has been exercised.

### Tablet and failure-state review

Manual Computer Use used the reserved iPad Pro 13-inch (M5), iOS 27, with the compiled production screens and isolated fixtures:

- LNori catalog, details and text reader in portrait and landscape. The scroll reader now centers an 80-character maximum-width text column on wide screens. Next and Previous move through the text without a restoration failure.
- Native Genre suggestion → include `fantasy` → 25 results → exclude → empty state → remove filter → discovery restored. Existing search and menu controls remain reachable.
- A first-request 503 leaves the other shelves populated. Retry now preserves those shelves while the failed Featured shelf reloads. Previously, the secondary-shelf loading gate temporarily hid loaded content.
- Malformed HTML produces local section errors and Retry controls. The synthetic challenge stays offline: debug audit mode prevents opening a real verification browser. The earlier capture showed the misleading “The source address is invalid”; the public-audit follow-up below corrects the debug handoff path. This does not validate real challenge resolution.
- HitomiLA dark appearance, enlarged text (Device Hub level 8), long title, missing-cover placeholders, title details, and reader failure with Retry. The long title wraps without clipping the Read action; missing artwork keeps the cover aspect ratio.
- AniList's fixture-only expired session produces “Sign in to this source and try again”, Try Again, and Tracker Account controls in the tablet sheet. No real login was attempted.
- MyAnimeList's tablet search, Link action, retrieved chapter/volume progress, and local Reading status selection work. Its missing-chapter warning prevents unsafe progress matching as intended. Remote writes remain verified through the WASM fixture tests, not this native title without chapters.

Rendering tests additionally cover narrow widths, long filter capsules, large text, loading silhouettes, tracking controls, retry feedback and dynamic resizing. Manual portrait/landscape tablet inspection supplements these tests; it does not claim every device, source and state combination.

### Native reader timing

On the iPad landscape LNori fixture, the app's monotonic Read-request and first-readable-text markers measured five **cold openings: 962.61 ms median, range 943.02–1,654.08 ms**, and five **warm openings: 875.83 ms median, range 695.50–930.83 ms**. Cold samples reset the selected audit state and relaunch the process; OS caches remain uncontrolled. Warm samples close and reopen the same title with its caches retained. Cold samples were 1,508.55, 1,654.08, 962.61, 943.02 and 948.95 ms; warm samples were 930.83, 875.83, 695.50, 890.47 and 704.38 ms. These exclude tool interaction latency and measure readable text rather than presentation of the reader shell. They are offline native samples, not paired website/app measurements or performance acceptance for all extensions. Raw evidence: `Artifacts/ExtensionAudit/LNori-native-reader-timings.json`. Subsequent text navigation was functionally reviewed; its paint latency was not separately instrumented.

Final tablet screenshots are under `Artifacts/ExtensionAudit`: `LNori-ipad-catalog.png`, `LNori-ipad-details.png`, `LNori-ipad-landscape.png`, `LNori-ipad-reader-final.png`, `LNori-ipad-filter.png`, `LNori-ipad-empty.png`, `LNori-ipad-final-recovery.png`, `LNori-ipad-malformed.png`, `LNori-ipad-challenge.png`, `HitomiLA-ipad-dark-large-missing.png`, `HitomiLA-ipad-long-detail.png`, `HitomiLA-ipad-reader-error.png`, `HitomiLA-ipad-reader-retry-final.png`, `AniList-ipad-expired.png`, `MyAnimeList-ipad-search.png`, and `MyAnimeList-ipad-progress.png`. The pre-adjustment reader and intermediate retry screenshots are retained as historical evidence; use the explicitly final files when assessing the implemented layout.


## Public native follow-up (13 October, evening)

The debug launcher now accepts `MANKO_PUBLIC_SOURCE_AUDIT=<website ID>` for the nine public content sources only. It rejects connector/tracker IDs and simultaneous fixture/live selection. Its database and state use a separate `PublicState` directory. Requests use the production HTTP and egress policy; no account access or credential import is performed. Verification challenges are reported directly rather than sent through a production registry that is absent in the isolated audit. Public mode does not establish publication-download coverage; these website checks exercise streaming readers.

MangaFire's live homepage exposed Day, Week and Month ranking tabs. The extension previously supplied only the weekly list. It now exposes three native carousel shelves, in that order, followed by Latest Updates. Tests verify `days=1`, `7` and `30`, the retained weekly identifier, and terminal ranking pagination. All 177 extension JavaScript/runtime tests, the Rust workspace, and all 15 package checks passed after the change.

Returning from a detail screen also reran initial-cover prefetch and emitted a catalog duration measured from the original opening, including time spent away. The catalog now retains a successfully completed cover identity. Refreshes with a new content revision still run; canceled and failed prefetches remain retryable. Pre-fix return-duration samples are excluded from performance acceptance.

### Live visual evidence

All screenshots in this subsection use the reserved iPad Pro 13-inch (M5), iOS 27, normal text size and light appearance. The browser viewport was 1032 × 1376, matching the tablet content viewport. Earlier dark, large-text, landscape, filter and error fixture reviews remain separate evidence.

| Source | Browser and native result | Exact coverage or blocker |
|---|---|---|
| LNori | Live catalog → details → readable text passed | Ascendance of a Bookworm; featured, seasonal and popular covers; long series title and volume list; centered text reader. No native reader timeout observed. |
| MangaFox | Live catalog → details → reader → next page passed | Vigilante: Boku no Hero Academia Illegals; trailer chapter. Desktop website lists 17 pages while its mobile endpoint, used by the extension, lists 16. Performance samples use the matching mobile reader. |
| MangaFire | Live catalog → details → reader → next page passed | All-Class Awakening: God Slayer, prologue, 208 images. All three new period shelves render with different rankings. |
| MangaKakalot | Browser homepage/details/reader available; native catalog blocked | Exact listing endpoint returned Cloudflare verification. The earlier debug error masked that challenge as an invalid source address. |
| MangaNato | Live catalog → details → reader → next page passed after parser fix | Solo Leveling, chapter 0, 37 images. Latest Updates returned rate limiting while other shelves stayed visible; repeated timing stopped. |
| MangaBat | Live catalog → details → reader → next page passed | Solo Leveling, chapter 0, 37 images; matching website images decoded. |
| OmegaScans | Live discovery returned cards; reader remains fixture-only | Homepage inventory did not provide a suitable non-explicit title for the live reader audit. No live reader/performance pass claimed. |
| HitomiLA, NHentai | Original-media fixture visual passes retained | No live browser reader comparison in this follow-up. |
| OPDS, Komga, Kavita, Suwayomi, AniList, MyAnimeList | Live checks excluded by user | Existing isolated fixture evidence only; no login attempted. |

### Timing methodology and validity

Raw observations are saved in `/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/public-timing-observations.json`. Each includes source, flow, surface, run, cache condition, observer duration and readiness. Failed readiness and incomplete pairs are retained, not silently counted as passes. LNori complete pairs use runs 1, 4, 5, 6 and 7; the last valid website observation supersedes the incorrect first reader selector in run 1. MangaFox uses runs 1–5.

These are **automation observations, not threshold acceptance**. Native accessibility reads add substantially more overhead than browser DOM reads. App details and image-reader readiness lack equivalent internal paint timestamps. Browser retained-cache runs do not prove a warm HTTP cache hit, and the available browser API does not expose a controlled cold-cache reset. Thus five controlled cold pairs and the requested 20%/250 ms comparison remain unverified. No universal speed claim is made.

| Source / flow | Samples | Website observer median (range), ms | App observer median (range), ms |
|---|---:|---:|---:|
| LNori catalog | 5 | 172 (150–241) | 2,619 (2,366–3,663) |
| LNori details | 5 | 178 (130–382) | 2,540 (2,458–2,686) |
| LNori readable text | 5 | 1,883 (1,858–2,041) | 2,949 (2,778–3,063) |
| MangaFox catalog | 5 | 533 (472–2,303) | 2,780 (2,526–6,112) |
| MangaFox details | 5 | 320 (294–364) | 2,481 (2,407–2,553) |
| MangaFox reader | 5 | 432 (413–453) | 3,488 (2,783–3,781) |

LNori's app-only Read-request → first-readable-text monotonic markers for those five live warm runs measured **864 ms median (712–1,166 ms)**. These internal timestamps exclude observer latency. They are useful native evidence but are not directly interchangeable with the website observer timestamps. Catalog logs from reappearing views were found invalid, including the unusually large MangaFox sample; the raw observer values above remain recorded but cannot diagnose source latency. MangaFire's first catalog timing attempt failed because buffered log output was used as a readiness signal; it is excluded, despite the catalog subsequently being visibly complete.


### Additional fixes found by live inspection

- MangaNato's live Solo Leveling chapter exhausted the native **100,000,000 dispatch-fuel budget** on both the initial attempt and Retry. The shared MangaBox reader parsed the entire HTML document, including large navigation and script content. It now scans script blocks directly and builds a DOM only for the chapter-image fragment, retaining direct-child image selection and host validation. The common regression adds 5,000 unrelated navigation blocks for all three providers. MangaNato and MangaBat then opened the 37-page chapter and advanced to page 2 in Manko. MangaKakalot uses the same corrected parser but its live catalog remains challenge-blocked.
- The image-session initial failure used unstyled text on the black reader background, making the error unreadable in light appearance. It now reuses `ReaderFailureView` with a dark color scheme. Manual inspection of an offline chapter-only HTTP 503 confirms a readable heading, message and Try Again control; repeated retry retains the service error instead of failing the runtime. The original fixture response was restored afterward.
- The repeated progressive-reader test exposed a remaining scroll-commit race. A single visible rectangle immediately after `scrollBy` could precede WebKit's correction for prepended text. Restoration now requires two layout frames with no corrective scrolling before reporting success, without increasing the 120-frame bound. The test waits for actual visible DOM readiness before its separate text-replacement regression and records geometry on failure. Five repetitions across modern and legacy locators passed (40.5 s), following diagnostic runs that reproduced the failure. This supersedes the earlier claim that re-resolving the range alone completely fixed restoration.

Additional live retained-cache observations (five pairs, MangaFire runs 3–7):

| Flow | Website observer median (range), ms | App observer median (range), ms |
|---|---:|---:|
| MangaFire details | 736 (712–870) | 2,472 (2,458–2,701) |
| MangaFire reader | 897 (848–1,007) | 3,489 (3,130–3,615) |
| MangaFire next-page | 280 (279–282) | 1,659 (1,518–1,736) |

MangaFire's revised catalog collector measures accessible cards, whereas its website collector waits for decoded covers. Those catalog observations are **not equivalent** and are excluded from the paired summary. Its first opening after process launch took 11,437 ms to observed readable page, versus roughly 3.5 seconds for subsequent observed openings; these include accessibility overhead and uncontrolled OS/media caches. They are not a measured 8-second implementation overhead or an accepted cold comparison. MangaNato's single first-opening observer sample was 6,491 ms for catalog cards, 3,480 ms for details, 10,702 ms for a readable page, and 1,638 ms for the next page; rate limiting prevented five paired runs. No speed pass is inferred from these single samples.

Screenshots from this follow-up are saved under `/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/`. Principal files are `LNori-live-ipad-{catalog,details,reader}.png`, `MangaFox-live-ipad-{catalog,details,reader,next}.png`, `MangaFire-live-ipad-{catalog,details,reader}.png`, `MangaNato-live-ipad-catalog-final.png`, `MangaNato-live-ipad-details.png`, `MangaNato-live-ipad-reader-final.png`, `MangaBat-live-ipad-{catalog,details,reader}.png`, `MangaKakalot-live-ipad-challenge.png`, and `reader-error-contrast-final.png`. Initial catalog captures may show secondary shelves still loading; they do not prove every shelf finished loading.


### Final verification and remaining acceptance limits

**Final complete non-UI suite: 1,115 passed, two skipped, zero failures (393.1 s)**, with `TEST EXECUTE SUCCEEDED`. This includes the new audit-selection test, rendering, sources, extension runtime, app workflows and both reader locator formats. Evidence: `Artifacts/ExtensionAudit/public-audit-final.json`. The final test build also compiled Manko. The restored-position regression separately passed five repetitions after the stable-scroll fix. The final live LNori reader was then reopened and manually advanced from position 1 to 3 of 439 without a timeout; see `LNori-live-ipad-reader-final.png`.

Final extension validation passed the Rust workspace, all 177 JavaScript/runtime tests, all 15 fixture audits and all 15 package checks after retaining direct-child selection in the narrowed reader fragment. The exact final MangaBat package subsequently passed five repeated catalog → detail → reader → next-page flows. Its first priming attempt correctly resumed saved page 2; that attempt is excluded from the timing comparison, and the subsequent runs explicitly start at page 1.

Final deterministic bundling and publication **dry-run** validated all six official and nine community packages; nothing was published. The reserved build slot and Simulator were released successfully after verification, with no Manko source changes detected during the final reservation. The reserved Simulator was shut down and disposable test bundles were cleaned; audit evidence was retained.

| MangaBat flow, five pairs | Website observer median (range), ms | App observer median (range), ms |
|---|---:|---:|
| details | 339 (278–426) | 2,564 (2,504–2,954) |
| reader | 313 (232–435) | 5,124 (3,555–5,524) |
| next-page | 288 (279–3,108) | 1,707 (1,596–1,832) |

These inherit the same observer-overhead limitations. MangaBat's catalog-card samples are not paired with decoded-cover samples. Website next-page measurement scrolls the matching second image into view; the native reader uses Next page. Both surfaces preserve their normal media prefetch behavior. Warm sessions may outlive an upstream cache TTL, so retained caches do not guarantee zero requests.

Acceptance is **partial**, not an all-source performance pass:

- Live native principal flows passed for LNori, MangaFox, MangaFire, MangaNato and MangaBat. All 15 extensions retain their earlier native fixture evidence. MangaKakalot is verification-blocked; MangaNato's Latest Updates was rate-limited. OmegaScans, HitomiLA and NHentai have no live reader visual/performance pass in this follow-up.
- Five retained-cache observer pairs cover details/readers for LNori, MangaFox, MangaFire and MangaBat, plus comic next-page navigation. Controlled cold browser/app pairs and equivalent internal paint timestamps are still missing, so the 20%/250 ms criterion cannot be accepted or rejected from these observations.
- Login-dependent live work remains explicitly excluded. No credentials were read, and no account login or tracker write was performed against a live service.
- Earlier fixture limitations still apply: this is not an exhaustive manual cross-product of every source, filter, failure mode, text size and width. Original fixture art is reused; mixed-artwork coverage, tracker native write completion and Suwayomi native CBZ acquisition remain as documented in the original matrix.

### Equivalent-timing follow-up, 14 October 2026

The requested threshold verification remains unfinished. Two attempts to reserve the existing iPad and canonical build slot exited 75 because free space was below the repository's 15 GiB minimum (14.55 GiB at initial inspection). No lease was acquired, no Simulator was operated, and no Manko code was changed during this follow-up. Login-dependent live checks remain excluded.

Prepared [the equivalent-timing protocol](PERFORMANCE_COMPARISON_PROTOCOL.md) and `scripts/compare-performance.mjs`. The validator requires five matching pairs per declared source/flow/cache condition, rejects the old external-observer timings, and reports frame-precision ambiguity around the threshold. Its nine regression cases pass. New website/native rendering instrumentation, cold/warm measurements, and any resulting slow-path fixes still require a successful resource reservation. The earlier timings must not be relabeled as equivalent measurements.


### Equivalent-timing implementation resumed, 14 October 2026

The disk blocker above was superseded by a new check reporting 15.55 GiB, followed by a successful reservation of slot 1 and the existing iPad Pro 13-inch (M5). No additional build directory or Simulator was created.

Implemented debug-only native frame readiness and a reference WKWebView on the same Simulator. The reference uses a fresh nonpersistent website store, locally staged source predicates, and a monotonic navigation-to-frame-message duration. It waits for app startup, preserves CSS viewport dimensions separately from the 1032 × 1376 window, and explicitly decodes measured images. Native hooks use production catalog/detail/reader screens and the staged compiled WASM. Runs use Swift `-O` with Debug audit hooks retained; these are optimized audit builds, not a claim about an App Store binary.

A calibration defect was found and corrected: `ContentCache(memoryOnly: true)` does not retain entries in this implementation. The audit had therefore repeated work during supposedly warm runs. Public audit metadata now uses the real cache in its isolated PublicState directory. A regression verifies retained warm entries, isolation between run roots, and clearing. Earlier native `lnori-optimized-1` timings are excluded from normal-cache acceptance. Earlier reference samples with changing viewports or excessive frame uncertainty are also excluded.

Raw evidence is preserved in the task visualization directory as `in-process-performance-raw.jsonl`; per-source predicates are recorded in [public-performance-specs.json](public-performance-specs.json). The user subsequently requested functional checks with timings recorded, ending repeated threshold benchmarking. See [recorded timings](RECORDED_EXTENSION_TIMINGS.md) for the collected medians, ranges, partial sets and raw evidence. Single cold samples and unmatched next-page flows are not five-pair passes. Login-dependent integrations remain excluded.


### Functional completion and timing record, 14 October 2026

The user changed the final priority to checking that extensions open and work while recording timings. Repeated website-versus-app threshold benchmarking is no longer a completion requirement. The [timing record](RECORDED_EXTENSION_TIMINGS.md) preserves all 297 in-process observations, selected medians/ranges and partial sets, plus fresh fixture operation timings for every extension. Cold catalog/details observations include remaining slower paths; they are not described as a speed pass.

Fresh validation of the final extension packages passed all 15 source audits (**425 recorded operations**), the Rust workspace, **187 JavaScript/runtime tests**, and validation of all 15 packages. This includes discovery, pagination, supported search/sort/filter operations, metadata, installments, reader content, connector acquisition and fictional tracker progress writes. Fixtures are deterministic and have no live-network fallback. Earlier per-source native visual evidence remains in the matrix above; this final pass does not relabel fixture results as live verification.

LNori's homepage parser now extracts card headers and links without building a full DOM for each homepage shelf. A regression covers nested featured markup, escaped entities and missing-alt text fallback. The current compiled package was reopened on the reserved iPad: Featured, Seasonal Preview, Popular Novels and Library rendered; title details and readable text opened; Next advanced position 1 to 2.

That final check exposed another saved-position failure on reopening: the saved caret pointed to collapsed whitespace at a line wrap, and the visibility check required positive character width. The reader now includes an adjacent painted character in the visibility range while retaining the saved text offset. A native WebKit regression covers a saved space immediately before a line break. The failed attempt is retained in the smoke observations; final verification is recorded below.

Login-dependent live testing remains excluded. MangaKakalot's verification challenge, MangaNato rate limiting, and missing suitable live reader comparisons for OmegaScans/HitomiLA/NHentai remain as documented above. Native tracker writes and Suwayomi CBZ download are still covered by runtime fixtures rather than a claimed manual native completion. No credentials were read and nothing was published.


**Final verification:** the current test build succeeded in 59.6 seconds. `Scripts/test.sh all --mcp` using the existing reservation completed with **1,117 passed, two skipped, zero failed**, `TEST EXECUTE SUCCEEDED` (352.8 seconds). This supersedes the earlier instrumented run's stale cancellation-test failure. The tool response itself timed out after 300 seconds; the underlying process continued, and its completed log and result bundle confirm success. The new collapsed-whitespace regression passed in 2.095 seconds. Existing dependency-scan warnings and test QoS warnings remain; there were no compilation errors or test failures.

After installing that same build, Computer Use reopened the **unchanged saved position that had failed**. Position 2 of 6 displayed readable text without recovery/error UI; the next-page action scrolled toward the end of the short volume. No reset or replacement of the saved locator was used. Final screenshots include `final-LNori-catalog.png`, `final-LNori-details.png`, and `final-LNori-reader-reopened-after-fix.png` in the task visualization directory. The final visual check confirms the corrected reader behavior and the shared tablet text column; dark/large-text/error and other source screens retain their earlier explicit evidence rather than a claim that every layout/state was repeated.

Current machine-readable evidence: [fixture results](/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/final-fixture-results.json), [non-UI suite](/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/final-non-ui-suite.json), and [recorded timings](RECORDED_EXTENSION_TIMINGS.md). Build log: `build_sim_2026-10-13T16-04-54-097Z_pid46045_7376d531.log`; completed test log: `test_sim_2026-10-13T16-06-22-232Z_pid46045_6030d9ec.log`, both under the XcodeBuildMCP `manko-a8be87176fb1/logs` directory.

The final reservation was released successfully; the reserved Simulator shut down, fixed test bundles were cleaned, and no source changes occurred during the final build/test reservation. Saved reports, raw timings and screenshots were retained.
