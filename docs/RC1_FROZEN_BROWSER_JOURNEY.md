# Frozen RC1 browser journey diagnosis

Date: 2026-10-11. This document concerns only the historical `2026-09-30-r8` candidate artifact and its browser smoke workflow. It does not change the artifact, a snapshot pin, a release or a public deployment.

## Immutable input and observed failure

`.github/workflows/smoke-v9-rc1-journey.yml` downloads `tcc-v9-2026-09-30-r8-candidate` from successful run [36736001077](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36736001077), then serves it locally. The artifact records snapshot `2026-09-30-r8`, Stable `0a6d2c3415504397310d3dc92fae40be843b2435` and Data Lab `d0996b493bcfee5312b5ca1e38070df87b0d9642`. Its manifest verifies 1,554 files and 347,862,560 uncompressed bytes by SHA-256. The workflow does not build or deploy it.

Runs [38176374986](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38176374986) and [38176117869](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38176117869) timed out at the test's wait for `window.__TCC_V9_SHELL__.ready` or `.error`. The frozen `v9-production-shell/bridge.js` creates a marker with `mode`, `candidateSha`, `engineScopeCountries` and `fallback`; it never sets `ready` or `error`. Those properties were added to the test after the artifact was built. The frozen UI also exposes `#simOperatorFilter`, `#simMaxDistance` and `#simNow` directly, without `details.v9-filter-group` wrappers. The test's later selectors were likewise for a newer UI.

## Browser reproduction

The exact downloaded artifact was served read-only on `127.0.0.1:8765` and inspected in a local headless Chromium with network, script, console, exception and navigation events captured through CDP. The stable PWA checker performed one expected reload to `?app=7310&_refresh=…`. Both loads fetched `v9-production-shell/bridge.js`. After the reload, `compare` was a function, the operator filter and initial results prompt were present, and the marker had the four historical fields above with no `ready` or `error`. There were no bootstrap exceptions or failed requests. The only HTTP 404 was for the optional favicon; Service Worker registration did not block the bootstrap.

With the test adapted to the frozen marker and direct controls, Playwright 1.55.1 and cached Chromium completed the original Altnau 20–80% Tesla scenario against the unchanged artifact: 20 ranked stations, diagnostic `v9-ok`, country `CH`, 23 queried stations, zero source and routing errors, reverse geocoding called once, route mock called 23 times, and no page errors. This proves the 120-second timeout is a test/artifact contract mismatch rather than a demonstrated RC1 runtime failure.

## Validation policy

The frozen workflow retains its browser scenario and assertions about the snapshot pin, candidate mode, functional comparison, result cards, CH diagnostics, mocked geocoding and absence of page errors. It waits for the marker and stable results prompt after the possible PWA reload, which are capabilities the frozen artifact actually exposes. The workflow remains automatic for changes to its test or workflow and remains read-only. Modern V9 browser journeys continue to validate the current shell separately.

The workflow runs on `push` with a path filter for `tests/runtime-browser-journey.mjs` and its workflow file, without a branch restriction. GitHub evaluates files changed by each push, so the temporary changes and subsequent restoration of this test on Production PR #39 each triggered it even though the final test matched `main`. Its earlier failures include several runs before PR #39. If the frozen artifact later becomes unsuitable for a meaningful browser scenario, archival should be proposed openly in a separate review; an automatic success or `continue-on-error` would conceal the limitation.
