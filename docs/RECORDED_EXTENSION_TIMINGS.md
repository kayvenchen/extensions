# Recorded extension timings — 14 October 2026

These are recorded observations, not an all-source performance acceptance. The user requested functional checks with timings retained, without continuing repeated threshold benchmarks. Login-dependent live testing remains excluded.

## All 15 fixture runtime checks

Fresh compiled-WASM audit: every source passed. Milliseconds below are individual Node/WASM operations against deterministic responses, excluding native rendering and real network latency. Reader media downloads are separate operations in the raw file. A zero means below the runner’s millisecond rounding precision. Connector acquisition describes the response; native EPUB opening has separate visual evidence.

| Extension | Catalog / search | Details / progress | Installments / collections | Reader descriptor, text or acquisition | Recorded operations |
|---|---:|---:|---:|---:|---:|
| HitomiLA | 61 | 6 | 1 | 5 | 68 |
| NHentai | 5 | 0 | 0 | 0 | 37 |
| LNori | 6 | 2 | 0 | 6 | 86 |
| MangaFox | 22 | 2 | 0 | 1 | 36 |
| MangaFire | 5 | 4 | 1 | 1 | 55 |
| MangaKakalot | 4 | 6 | 20 | 3 | 28 |
| MangaNato | 5 | 5 | 15 | 2 | 28 |
| MangaBat | 9 | 5 | 15 | 2 | 28 |
| OmegaScans | 4 | 7 | 18 | 1 | 22 |
| OPDS | 1 | 0 | 0 | 0 | 6 |
| Komga | 1 | 0 | 0 | 0 | 6 |
| Kavita | 2 | 0 | 0 | 0 | 6 |
| Suwayomi | 2 | 0 | 0 | 0 | 9 |
| AniList | 3 | 2 | 11 | 1 | 5 |
| MyAnimeList | 2 | 0 | 0 | 0 | 5 |

Tracker final column is the fixture-only progress write. Raw operations, filter/sort checks, request counts and status: [final-fixture-results.json](/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/final-fixture-results.json).

## Recorded public website and native timings

Optimized Debug build, same reserved iPad. In-process monotonic navigation-to-readiness observations; medians and ranges in milliseconds. Caches are isolated at the app/WebKit level, not DNS/TLS/CDN. Warm runs were collected in surface blocks, not alternating pairs. Native details may prepare more installments than the website initially displays. Catalog readiness covers an agreed first card and decoded cover, not the entire homepage. See [measurement protocol](PERFORMANCE_COMPARISON_PROTOCOL.md) for other limits.

| Source | Flow | Cache | Surface | n | Median | Range |
|---|---|---|---|---:|---:|---:|
| LNori | catalog | warm | app | 5 | 331 | 310–348 |
| LNori | catalog | warm | website | 5 | 271 | 256–624 |
| LNori | details | warm | app | 5 | 175 | 162–211 |
| LNori | details | warm | website | 5 | 229 | 211–264 |
| LNori | reader | warm | app | 5 | 780 | 754–1,723 |
| LNori | reader | warm | website | 5 | 1,740 | 1,731–1,810 |
| MangaFox | catalog | warm | app | 5 | 345 | 342–357 |
| MangaFox | catalog | warm | website | 5 | 305 | 276–344 |
| MangaFox | details | warm | app | 5 | 188 | 170–197 |
| MangaFox | details | warm | website | 5 | 318 | 280–722 |
| MangaFox | reader | warm | app | 5 | 177 | 169–236 |
| MangaFox | reader | warm | website | 5 | 251 | 249–312 |
| MangaFire | catalog | warm | app | 5 | 368 | 365–427 |
| MangaFire | catalog | warm | website | 5 | 1,179 | 1,077–1,446 |
| MangaFire | details | warm | app | 5 | 202 | 191–213 |
| MangaFire | details | warm | website | 5 | 1,157 | 1,108–1,324 |
| MangaFire | reader | warm | app | 5 | 215 | 210–250 |
| MangaFire | reader | warm | website | 5 | 984 | 894–1,040 |
| MangaBat | catalog | warm | app | 5 | 298 | 270–568 |
| MangaBat | catalog | warm | website | 5 | 352 | 269–1,849 |
| MangaBat | details | warm | app | 5 | 202 | 167–240 |
| MangaBat | details | warm | website | 5 | 291 | 271–355 |
| MangaBat | reader | warm | app | 5 | 208 | 190–381 |
| MangaBat | reader | warm | website | 5 | 400 | 347–580 |
| LNori | catalog | cold | app | 5 | 4,206 | 3,466–6,622 |
| LNori | catalog | cold | website | 5 | 2,019 | 1,030–3,444 |
| MangaFox | catalog | cold | app | 5 | 5,033 | 4,033–7,707 |
| MangaFox | catalog | cold | website | 5 | 2,368 | 1,061–4,009 |
| MangaFire | catalog | cold (partial) | app | 3 | 2,683 | 1,966–2,943 |
| MangaFire | catalog | cold (partial) | website | 3 | 3,425 | 2,611–5,759 |
| MangaBat | catalog | cold (partial) | app | 1 | 2,853 | 2,853–2,853 |
| MangaBat | catalog | cold (partial) | website | 1 | 2,447 | 2,447–2,447 |
| LNori | details | cold | app | 5 | 2,344 | 2,106–2,855 |
| LNori | details | cold | website | 5 | 536 | 518–1,166 |
| MangaFox | details | cold | app | 5 | 2,122 | 1,665–2,359 |
| MangaFox | details | cold | website | 5 | 379 | 292–759 |
| MangaFire | details | cold (partial) | app | 3 | 4,140 | 3,881–4,271 |
| MangaFire | details | cold (partial) | website | 3 | 1,802 | 1,724–1,921 |
| MangaBat | details | cold (partial) | app | 1 | 3,811 | 3,811–3,811 |
| MangaBat | details | cold (partial) | website | 1 | 1,122 | 1,122–1,122 |
| LNori | reader | cold | app | 5 | 1,741 | 1,429–6,691 |
| LNori | reader | cold | website | 5 | 3,353 | 3,295–3,881 |
| MangaFox | reader | cold | app | 5 | 2,411 | 2,090–2,623 |
| MangaFox | reader | cold | website | 5 | 799 | 736–944 |
| MangaFire | reader | cold (partial) | app | 3 | 2,392 | 2,339–2,564 |
| MangaFire | reader | cold (partial) | website | 2 | 1,224 | 1,123–1,325 |
| MangaBat | reader | cold (partial) | app | 1 | 2,662 | 2,662–2,662 |
| MangaBat | reader | cold (partial) | website | 1 | 666 | 666–666 |
| MangaFox | next-page | warm | app | 5 | 51 | 49–62 |
| MangaFox | next-page | warm | website | 5 | 299 | 249–447 |

LNori warm rows precede the final streaming-parser improvement; its cold rows are after that change. All successful slow samples remain included. Cold catalog/detail openings remain visibly slower in these records; no blanket speed pass is claimed. Partial MangaFire/MangaBat sets were not completed after the scope change.

Raw evidence retains all 297 observations, including calibration runs and failures: [JSONL](/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/in-process-performance-raw.jsonl). Exact selected run/sequence IDs: [summary JSON](/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/recorded-timing-summary.json).

Excluded calibration sets include unoptimized/pre-cache-correction native runs, early reference viewport/startup trials, and predicates that did not match the visible page. MangaFire `fire-web-details-v4-1` timed out because the original predicate required an off-screen/paginated chapter; its corrected replacement is v4-2. MangaFox next-page sequences 3 and 8 timed out preparing the origin page and remain failures in the raw record, not successful next-page samples.

## Final native smoke observations

LNori was reopened after the final parser change: Featured/Seasonal/Popular/Library shelves, title details, readable text, and position 1 → 2 all worked. A subsequent reopen exposed a collapsed-whitespace restoration failure, retained in the smoke record; the final reader fix and verification are described in the audit report. [Click-to-accessibility observations](/Users/kayvenchen/.codex/visualizations/2026/10/13/01a13401-a7df-7ff1-8ab1-6cd90b91a511/final-native-smoke-timings.json) are retained separately. They include automation overhead and are **not rendering latency** or threshold-comparison inputs. All 15 sources retain the per-source native fixture evidence in [the audit matrix](EXTENSION_VISUAL_AUDIT.md#per-extension-evidence).

The corrected build subsequently reopened the identical saved position successfully; the final non-UI run passed 1,117 tests with two skips. The failed attempt remains in the observation file alongside the post-fix check.

Post-fix visual checks have screenshots and explicit success states, but no retained numerical observer duration; their duration is null, not zero, and they are excluded from timing summaries.
