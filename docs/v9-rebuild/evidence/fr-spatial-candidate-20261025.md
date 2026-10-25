# V9 French spatial candidate parity, 25 October 2026

The prepared French eMSP derivative copies its national station identity and coordinates. Coordinate-less shards remain eligible for exact-key closure. The preview loader now applies the same spatial shard selection to France as to the other countries; it no longer fetches every French shard for a local query.

`preproduction-sharded-loader.test.mjs` verifies a French near/far fixture, unbounded fallback and SHA rejection. The real 21-source, nine-country Firefox run passed desktop and 390 px mobile. Against the previous package with identical data, the tested Paris, exact eMSP, Zéphyre and OZECAR queries retained the same station, priced-offer and raw-offer counts. Paris initial query measured 10,243 ms before and 7,300 ms after in this local headless run; these timings are observations, not pass thresholds. Browser outputs: `/tmp/tcc-v9-21-browser-provenance.json` and `/tmp/tcc-v9-21-browser-spatial.json`.

The isolated package is `.tcc-v9-cache/reproducible-21-preview-2026-10-25/site-spatial`. Hosting integrity and packaged full-session oracle pass; `deployed=false`. No public site or Data Lab Actions change. G7/G8 remain FAIL pending complete coverage and accessible remote preproduction.
