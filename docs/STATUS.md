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

Release tag: `v9-snapshot-2026-09-30-r4`

Release asset: `tcc-v9-snapshot-2026-09-30-r4.zip`

Release asset digest: `sha256:02facb1a457d4c3ddaecbdab035b146639ba9e199044c201bd7011f11b6a9ba8`

This is the current validated working revision. It retains the r3 Atlante FR/IT and Electroverse FR refreshes, embeds the Morocco canonical CPO ledger, and adds the validated TotalEnergies Morocco native guest overlay (18 stations, 38 priced connectors, 38 live-status responses).

Previous r3, r2 and original 2026-09-30 releases remain preserved as rollback points.

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
