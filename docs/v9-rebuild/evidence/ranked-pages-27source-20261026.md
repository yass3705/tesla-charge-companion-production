# Global ranking and bounded pages — 26 October 2026

Candidate bundle `06d149100ca675108910663b2fe81f71bd0747988fc1b932b417256357eeed93`, 27 sources, nine countries. Local package: `.tcc-v9-cache/reproducible-27-izivia-2026-10-26/site-ranked-final`. No source data, EVSE join or price changed in this pagination correction.

The preceding page implementation selected station IDs before ranking. Its page timings did **not** establish a correct global offer ranking. This candidate evaluates successive batches of 40, yields between batches and retains compact ranking facts. The five existing business ranking modes operate over the entire matching search. Only the selected 160-station page materializes full details; the DOM initially renders 80 cards. Routing is shared across the search, preserving the existing candidate-selection policy instead of requesting routes again per batch. Source loads and spatial reconciliation are reused.

The map uses all matching station references and their calculable summaries, regardless of page. Visible markers are grouped by viewport/zoom/density. Off-page selection opens the globally ranked page. Zoom/center survive page changes. Operator choices include off-page stations. Radius above 100 km is explicitly rejected; no requested radius is silently reduced.

## Evidence

- `v9-global-ranking-pages.test.mjs`: all five ranking modes match the complete oracle for a synthetic multi-page fixture, including a cheapest offer in the last input batch; no repeated loads and one shared routing pass. Cached summaries retain no full EVSE/cards.
- 17 targeted Production tests PASS, including exact identities, canonical tariff scope, OCPI, DST, congestion SOC80, EnergyVision duration, DOT-NL, Midhope and the packaged full-session oracle. 31 Data Lab tests PASS, including canonical/join tests and offline collector failure handling.
- [Firefox radius steps](ranked-pages-radius-20261026.json): Paris 100/90/80/70/60 km measured 14,543/12,116/14,296/11,319/9,792 ms. The first radius within the locally chosen 10 s budget was 60 km. At 100 km all 8,623 matching stations remain accessible; next page 418 ms. These measurements precede the final small zoom-preservation change and exclude map drawing; final multi-country measurements include map drawing.
- [Final nine-country and 390 px Firefox journey](ranked-pages-multicountry-20261026.json): PASS for matching count = global ranking count = map count, pages bounded to 160, visible grouped markers, no repeated first-page card IDs, preserved zoom and no source errors. Mobile document width 390 px. Dense GB/BE/NL first queries remain above 10 s (14.6/11.4/18.0 s at the smoke-test radius of 20 km); this is **not** a blanket latency PASS.
- [Eight exact-source tariff browser journeys](ranked-pages-tariffs-20261026.json): calculated FR Electroverse, IT Atlante, DE IONITY, GB Source EV and NL DOT-NL reach the session and visible card; compound charging/parking fees remain visible. Exact NL Electra, UK Eco-Movement and FR Powerdot raw offers remain uncalculated and labelled. No source offer loses its scoped EVSE/connector.

The older monolithic browser smoke still assumes a 200 km radius and all sources on the first page. It is not counted as passing. The new focused tariff and multi-country journeys provide the above narrower evidence.

G3/G5/G6/G7/G8 remain open for full source/rule coverage, remaining dense-query latency and the remote isolated URL. No `main`, GitHub Actions activation or public deployment occurred. The Actions pilot remains a separate authorization gate.

## Subsequent dense-search correction (measurement pending)

Amsterdam 100 km exceeded Selenium's 120 s HTTP timeout on the initial final package. Caching global routing-candidate selection and limiting concurrent shard loading to four allowed the same search to finish on `site-bounded-fetch`: 62,779 matching/ranked/map stations, 109,367 ms initial query and 1,142 ms next page; 90 km took 84,328 ms. Those latencies remain unacceptable. The baseline sweep was intentionally stopped after these observations when the next correction was prepared.

G6 now reuses immutable `Intl.DateTimeFormat` instances (bounded to 64 locale/options combinations) instead of constructing them repeatedly for every tariff evaluation. No tariff, quote, session amount, date conversion result or business ranking is cached by this change. Independent-session amounts, invalid-zone rejection, DST and full-session oracles pass. `site-g6-cached-formatters` is being packaged for a new measurement; do not infer performance success from the unit tests. Tests also cover the four-load budget shared across multiple sources and reuse of every shard without station truncation.
