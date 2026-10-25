# UK OCPI archives in the isolated V9 candidate — 25 October 2026

Data Lab `b330d126d` normalizes the archived Gridserve locations/tariffs pair and the archived Ubitricity PCPR file without new provider calls. Both retain raw tariffs at exact connector scope. Gridserve provides source UIDs but no official EVSE ID in this archive, so its official field remains null. The 96 Gridserve connector tariff references lacking a tariff record are preserved as `unresolvedTariffRefs`; no offer or price is fabricated for them. These figures describe the pinned archive and are not validation thresholds.

The repeatable 23-source, nine-country bundle is `7f844971aef29cb8c33b74db5bbf6dfd348646c98c91647c2e46848450bffdc7`; its exact eMSP join report SHA is `7a6dc67cf211384972854f32c4365569a2ba658a88db85e4cd48a85233b1433a`. Source import and spatial packaging passed with no rejected source. The latest local package is `.tcc-v9-cache/reproducible-23-preview-2026-10-25/site-band-guard`, with `deployed=false` and no remote preview URL.

Production keeps these two archives as `unparsedOffers`, outside tariff calculations and rankings. The map excludes their locations explicitly marked `publish=false` or `PARKING_GARAGE`; the raw canonical bundle retains them. `tests/canonical-v9-adapter.test.mjs`, the packaged full-session oracle, hosting integrity check, and Firefox headless across nine countries plus mobile passed. A compact result is in `v9-23-source-browser-20261025.json`; the full local result is `/tmp/tcc-v9-23-browser.json`.

The shared pricing engine also rejects paid connected time, charging time and parking fees when their required session duration is absent, regardless of identity tag. Focused OCPI, congestion, DST and channel tests passed. The packaged full-session oracle and Firefox nine-country/mobile replay passed on `site-duration-guard`; all functional browser observations matched the earlier 23-source package. Full local result: `/tmp/tcc-v9-23-duration-browser.json`.

The same missing-input guard now covers OCPI duration bands in all three paid dimensions, using the archived band tuple layout (dimension at index 0). The packaged oracle and Firefox nine-country/mobile replay passed on `site-band-guard`, with unchanged functional browser results. Full local result: `/tmp/tcc-v9-23-band-browser.json`.

A final Firefox replay checks the exact EVSE and connector scope of the two new UK sources after multi-source station merging. In the London query, 82 archived offers were observed as raw, none moved to another connector and none entered pricing; the observed count is descriptive only. Full result: `/tmp/tcc-v9-23-scope-browser.json`.

The package checker now validates every spatial shard's CPO, station, EVSE, connector and offer relations, exact tariff scope, channel and raw-only state, plus cross-shard identity uniqueness. A rehashed fixture with a moved connector offer is rejected. The actual 23-source package passes this full structural check; self-contained archived overlay tariffs remain valid when absent from a separate national catalogue.

G2–G8 remain FAIL: the 120 GitHub handoffs, full tariff coverage, complete technical acceptance and isolated remote URL are not verified. Data Lab Actions remain disabled; neither Tesla/Mac acquisition nor the public TCC site changed.
