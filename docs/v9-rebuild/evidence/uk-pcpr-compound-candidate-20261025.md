# V9 UK PCPR compound OCPI candidate, 25 October 2026

Scope: isolated candidate on `rebuild/v9-20261020`. No supplier request, price investigation, public deployment, or Data Lab Actions activation.

The existing UK PCPR converter and historic OCPI component oracle cover ENERGY, TIME, FLAT and PARKING_TIME. The canonical adapter and candidate loader now admit the complete, exact-connector, single-element subset only when the archived VAT and component contract is intact. The packaged pricing engine rejects missing charging or post-charge duration for paid components, including component groups. Unsupported and incomplete offers remain raw and unranked.

Fixture session: 10.1 kWh, 55 minutes connected, 43 minutes charging, 12 minutes after charge. The independent component total is GBP 13.87044: 11 kWh billed at 0.89004, 43 minutes at 3.6 per hour, 1.2 fixed, and 15 parking minutes at 1.2 per hour. `canonical-v9-uk-pcpr-pricing.test.mjs` verifies parity with the historic converter, station ranking, rejection when either required duration is absent, exact connector scope and candidate loader integrity.

Executed tests, all PASS:

- `node tests/canonical-v9-uk-pcpr-pricing.test.mjs`
- `node tests/canonical-v9-proved-pricing.test.mjs`
- `node tests/uk-ocpi-first-match.test.mjs`
- `node tests/v9-ocpi-component-coverage.test.mjs <isolated-site>`
- `python3 scripts/check_v9_preview_hosting.py --site <isolated-site>`: `hosting_ready_local_only`, 20 sources, 2,636 files, `deployed=false`.
- `PYTHONPATH=/tmp/tcc-v9-selenium python3 tests/v9_preproduction_browser_smoke.py --site <isolated-site>`: nine countries, UK PCPR, desktop and 390 px mobile PASS.
- `git diff --check`: PASS; Production branch GitHub Actions runs: `[]`.

After the 21-source package was built, `node tests/v9_packaged_full_session_oracle.test.mjs <isolated-site>` also passed against the **packaged** pricing, session and offer engines. Its synthetic session combines kWh, charging time, fixed and parking fees; checks independent component arithmetic, Direct/Electroverse/Electra ranking, subscription selection, cost/km, explicit GBP→EUR conversion and exclusion when FX or paid parking duration is absent. Its fixture values are test data, not supplier prices or new candidate tariffs.

The packaged engine now returns an explicit incomplete result for archived `incompletePricingReason` and unverified OCPI `minPrice`/`maxPrice` bounds, including bounds nested in rules. The canonical DOT-NL adapter keeps such offers raw. The full-session fixture verifies that neither a partial warning nor an ignored cap can enter station ranking. Congestion and DST oracles, canonical pricing tests and the nine-country Firefox replay passed after this guard. Final local package `.tcc-v9-cache/reproducible-21-preview-2026-10-25/site-failclosed`; browser result `/tmp/tcc-v9-21-browser-failclosed.json`. Cap calculation itself remains unproved and G6 FAIL.

The isolated site is `.tcc-v9-cache/reproducible-gzip-preview-2026-10-25/site-uk-compound` outside both Git checkouts. This is a local proof. G6, G7 and G8 remain FAIL pending complete documented tariff coverage and a remotely accessible isolated preproduction.
