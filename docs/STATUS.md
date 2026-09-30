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
