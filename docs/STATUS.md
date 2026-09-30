# TCC V9 production status

Updated: 2026-09-30

## Current immutable baseline

The current validated data baseline is release `v9-snapshot-2026-09-30-r8`.

Release asset: `tcc-v9-snapshot-2026-09-30-r8.zip`

Release asset digest: `sha256:bc3351f84bff27ee8e376df39c2ba49e5c55050b429ab4df16c289705e1b7264`

Validated scope:

- Tesla
- ES — complete
- NL — complete
- CH — complete with fail-closed residuals
- MA — partial CPO-consolidated
- FR — partial
- IT — partial
- DE — partial
- UK/GB — partial

Build contract: 9 datasets, fail-closed policy, stable parity guard.

Germany baseline: 63,405 non-Tesla sites; 591 named CPOs; 244 complete / 347 partial / 0 blocked in the pinned r8 ledger.

UK: first pass complete; 46 canonical CPO/network entries in the pinned ledger.

IONITY direct overlays retained in r8:

- FR — 181 locations / 1,853 priced connectors / 0 unpriced
- IT — 42 locations / 325 priced connectors / 0 unpriced
- DE — 199 locations / 1,578 priced connectors / 0 unpriced

AVIA Switzerland remains reconciled at 583/583 national EVSE.

Older r7/r6/r5/r4/r3/r2 and original 2026-09-30 releases remain immutable rollback points.

## Current phase: production runtime integration

Collection of partial CPOs is **not** the blocking workstream. The already-released immutable r8 source data and SHA pins are the integration baseline. Current integration candidates intentionally differ from the original r8 release ZIP: they add production-owned runtime, adapters, Germany tiles, and compiled offers without modifying the historical release.

### Verified production integration (2026-09-30)

Latest fully successful candidate: [GitHub Actions run 36724636761](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36724636761), commit `668b5ac67bf57b034de364fb0056c49a77dd0ae2`.

All of the following passed in that run: source guards, adapter unit tests, candidate build/validation, stable parity, actual multi-country runtime area queries, and artifact upload.

- 9 datasets; Germany's 63,405 national non-Tesla stations are spatially tiled into 231 validated tiles.
- Runtime smoke: DE 67 queried/1 priced including IONITY Direct; GB 9/9 with exact MFG connector tariff join; FR 3,784/782 including Electroverse; IT 1,843/1,179 including exact IONITY and Atlante; CH 40/33 including AVIA; MA 175/175 using exclusively snapshot-local configured source paths.
- Production-owned DE, GB, FR IONITY, CH AVIA, IT IONITY and IT Atlante adapters; exact or proven joins only, fail-closed otherwise.
- Morocco EVGO/FastVolt/Kilowatt/TotalEnergies sources resolve from snapshot-local files rather than Data Lab main.
- Electoverse France runtime compilation uses only high-confidence uniform simple station tariffs; heterogeneous/complex tariffs fail closed.
- Root index enters the production V9 shell; legacy V7.3 control is a local explicit fallback; Cloudflare remains paused.

The original immutable r8 release and its digest above remain untouched. Passing Actions candidate artifacts are **not** a newly published release or live deployment.

### Browser deployment gate verified

Independent browser-asset candidate validation succeeded in [run 36730931772](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36730931772). The offline validator `scripts/validate_browser_asset_graph.py` verified **30 real shell dependencies**, **7 required production registry sources**, correct loader/extension/bootstrap order, and a local fallback. It rebuilt using the same pinned r8 sources; no release was mutated.

### Latest integration verification and performance pass

- Multi-country production candidate succeeded in [run 36733474618](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36733474618), including Tesla local inventory, Spain, Netherlands, Germany, UK, France, Italy, Switzerland and Morocco runtime smoke, and the strictly unpriced three-site IONITY Germany inventory supplement.
- Browser-asset validation is now a **mandatory gate within the primary r8 candidate CI build**, rather than relying only on a separately launched browser check.
- The runtime loader now memoizes only immutable UK full-feed, Germany tile manifest and IONITY Germany overlay payloads between map viewport queries; individual German station tiles remain viewport-scoped to limit resident memory. Rejected fetch promises are evicted to permit retries. The loader defaults its basePath to the pinned stable-loader default, `..`.
- `tests/runtime-loader-cache.test.mjs` covers reuse, viewport isolation, initial fetch failure/retry and path resolution. The latest integrated CI run is responsible for validating these changes; a successful prior candidate must not be represented as verification of this newer commit.
- Historical published r8 release remains immutable. Do not regenerate or publish over its original ZIP. A new, separately named candidate can be packaged only once all current gates pass.

### Next production gates

1. Maintain verified multi-country coverage including Spain, Netherlands and local Tesla inventory; review new CI results after every loader/runtime change.
2. Keep the independently validated browser-asset graph as a required CI gate before packaging a new integration release.
3. Package validated integration into a **new, separately named release candidate** when all gates pass; do not overwrite the historical r8 tag or ZIP.
4. Later implement the scheduled refresh/promotion workflow independently of the frozen integration baseline. Future collection improvements belong in a future pinned snapshot.

## Production runtime release candidate RC1

**Published and immutable:** [v9-runtime-2026-09-30-rc1](https://github.com/yass3705/tesla-charge-companion-production/releases/tag/v9-runtime-2026-09-30-rc1).

- Exact validated build: [run 36736001077](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36736001077), source commit `1f3954935ec558eb320009ccd6319377c11a215f`.
- Promotion check: [run 36737605173](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36737605173) **success**. Reused source artifact `11107471281` and verified its GitHub archive digest, then rechecked **all 1,554 manifest-listed file SHA-256 hashes**, runtime contract, browser asset graph and stable parity before packaging.
- Release assets: `tcc-v9-runtime-2026-09-30-rc1.zip` and separate `.sha256` checksum. This is a pre-release package, not a public-hosting cutover; the legacy stable deployment is unchanged. The package retains internal `snapshotId=2026-09-30-r8` because its source data is pinned, but its code and integration layer are those of RC1.
- Independent browser launch [run 36737793157](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36737793157) **succeeded** using installed headless Google Chrome and a local HTTP server. The actual loaded DOM included the V9 shell marker, loader extension, and production bootstrap (1,172,856 DOM bytes); evidence is retained in the workflow artifact. This validates launch, not all interactive UI behavior.

**Next gate:** optional non-destructive staging preview with interactive browser UI checks, then independent live-data refresh/promotion design. Cloudflare remains paused. Historical r8 release and all prior rollback releases stay untouched.

## Verified interactive UI and safe source monitoring

- Actual Chrome/Playwright [interactive RC1 run 36738705658](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36738705658) **passed**: production shell initialized, tabs toggled, charge inputs/radius/operator mode changed, and subscription checkbox click persisted selection and invoked comparison. Zero critical console/page/HTTP errors. This uses frozen RC1, does not call external geocoding/routing, and is *not* a full live end-to-end journey test.
- `.github/workflows/v9-source-freshness-audit.yml` is configured to run an inexpensive **daily read-only** comparison of pinned Data Lab source file blob IDs versus Data Lab main. **No data refresh, tariff modification, snapshot release or live deployment is triggered** by this workflow. The input is explicitly limited to the monitored files; it does not independently validate source contents or cover every operator.
- First audit [run 36738913760](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36738913760) **passed**, including two classification tests. Of 18 monitored files, 15 are unchanged and 3 tracking/ledger files changed. No monitored national/operator/platform dataset has changed. The FR ledger and global progress index move FR from 94 treated / 27 set aside / 170 active to **94 / 32 / 165**; IT current counters remain 26 treated / 66 partial. These newer ledger counters are *not* a replacement r8 snapshot.
- Safe promotion gate: an actual validated source-data change, new coherent country ledgers, all source guards, full multi-country runtime smoke, independent Chrome UI tests, manifest hash verification and an immutable, separately named release must all precede any staging promotion.

**Current next step:** exercise routing/geocoding-dependent comparisons in a controlled staging preview with deterministic mocked external responses, then separately design the data collector/refresh jobs and their cost/latency budget. Cloudflare remains paused.

## Hosting

Current GitHub/stable hosting remains the active path.

Cloudflare work is paused. Its configuration and tests are retained for possible future use, but Cloudflare validation/preflight/deploy workflows are manual-only and are not part of the active integration path.

## Source of truth

- Collection/investigation: `tesla-charge-companion-data-lab`
- Production integration/build/snapshots: `tesla-charge-companion-production`
- Runtime fallback/reference: `tesla-charge-companion-stable`
- Legacy recovery material: `tesla-stations-updater-test` only where not yet migrated

## Governing policy

- r8 is the frozen integration baseline.
- No tariff invention or extrapolation.
- Unmatched/unsupported pricing remains fail-closed.
- Historical releases are never overwritten.
- New Data Lab improvements wait for a future snapshot unless explicitly selected for a new immutable revision.
