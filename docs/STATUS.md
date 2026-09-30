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

### Next production gates

1. Extend actual runtime smoke to Spain, Netherlands and local Tesla inventory, alongside existing six-country tests.
2. Keep the independently validated browser-asset graph as a required CI gate before packaging a new integration release.
3. Package validated integration into a **new, separately named release candidate** when all gates pass; do not overwrite the historical r8 tag or ZIP.
4. Later implement the scheduled refresh/promotion workflow independently of the frozen integration baseline. Future collection improvements belong in a future pinned snapshot.

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
