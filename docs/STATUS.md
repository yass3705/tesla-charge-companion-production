# TCC V9 production status

Updated: 2026-09-30

## Current baseline

The immutable production baseline is snapshot `2026-09-30`.

Validated scope:

- Tesla
- ES — complete
- NL — complete
- CH — complete with fail-closed residuals
- MA — partial CPO-consolidated
- FR — partial
- IT — partial
- DE — partial
- UK — partial

Build contract: 9 datasets, fail-closed policy, stable parity guard.

Germany baseline: 63,405 non-Tesla sites; 591 named CPOs; current recovery ledger 244 complete / 347 partial / 0 blocked.

UK: first pass complete; 46 canonical CPO/network entries in the pinned ledger.

## Current validated working revision

Release tag: `v9-snapshot-2026-09-30-r5`

Release asset: `tcc-v9-snapshot-2026-09-30-r5.zip`

Release asset digest: `sha256:d5ac18aba6a5562d1a20151153f7d7cfb0b71da8305cee32e5f21e840fe598bd`

This is the current validated working revision. It fixes the AVIA Switzerland refresh path end-to-end, preserves 583/583 national EVSE coverage with 587 guest-priced EVSEs visible, adds fresh IONITY Direct overlays for France (181/1,853), Italy (42/325), and Germany (199/1,578), all with zero unpriced connectors, and keeps revision-scoped validation so historical r2/r3/r4 builds remain reproducible.

Previous r4, r3, r2 and original 2026-09-30 releases remain preserved as rollback points.

Germany durability: the validated 63,405-site national baseline (including 5,471 direct-CPO-enriched sites) is now persisted in Data Lab. A dedicated CI test rebuilds r5 without the historical Actions artifact and passes, so artifact expiry no longer threatens reproducibility.

Historical r2/r3/r4 rebuild workflows are manual-only to avoid wasting public Actions capacity when the shared builder changes.

## Persistent rollback baseline

Release tag: `v9-snapshot-2026-09-30`

Release asset: `tcc-v9-snapshot-2026-09-30.zip`

Release asset digest: `sha256:0e4d1d76aa4c0efde4630eee082529a3ff92a354513862c8a8ea7812ef5a134a`

This release is the official rollback/reference package for the 2026-09-30 V9 baseline.

## Hosting

Current GitHub/stable hosting remains the active path.

Cloudflare work is paused. Its configuration and tests are retained for possible future use, but all Cloudflare validation/preflight/deploy workflows are manual-only and must not be considered part of the active production path.

## Source of truth

- Collection/investigation: `tesla-charge-companion-data-lab`
- Production build/snapshots: `tesla-charge-companion-production`
- Runtime fallback/reference: `tesla-charge-companion-stable`
- Legacy Germany recovery state: `tesla-stations-updater-test` until migrated

## Next work

1. Keep the 2026-09-30 snapshot immutable.
2. Publish it as a persistent GitHub Release.
3. Continue improving partial countries in their collection repos.
4. Promote only newly validated canonical inputs into future dated snapshots.
5. Keep unresolved tariffs/identities fail-closed.
