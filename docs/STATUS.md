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

Data collection is **not** the blocking workstream for the current phase.

The r8 dataset is frozen as the integration baseline. New CPO research belongs in Data Lab and may feed a future snapshot, but must not block or silently mutate r8 integration.

The production repository now owns the integration layer on top of the pinned stable engine:

- Germany snapshot adapter: `runtime-overrides/assets/v9/adapters/germany-national.js`
- UK validated-open-feed adapter: `runtime-overrides/assets/v9/adapters/uk-open-feeds.js`
- Production loader extension: `runtime-overrides/assets/v9/production-loader-extension.js`
- Production bootstrap: `runtime-overrides/assets/v9/production-bootstrap.js`
- Runtime registry builder: `scripts/build_runtime_registry.py`

The r8 build overlays these production components after copying the pinned stable runtime, then rewrites the runtime source registry.

### Runtime integration already validated

A dedicated r8 candidate build validates:

- DE 63,405-site snapshot present and registered as a required runtime source.
- UK validated open-feed bundle present and registered as a required runtime source.
- Germany pricing remains fail-closed unless explicitly marked production-rankable.
- UK tariffs are joined only by exact connector `tariff_ids -> tariff.id` within the same validated source.
- Restricted/unsupported UK tariff semantics remain fail-closed.
- FastVolt and TotalEnergies Morocco sources use snapshot-local r8 files instead of Data Lab `main` URLs.
- Stable critical-file parity remains enforced.

Validated integration candidate run: `36713025128`.

That run passed adapter tests, snapshot validation, built-snapshot validation and stable parity.

## Remaining runtime integration work

1. Wire all validated direct overlays already present in r8 into the runtime registry, beginning with IONITY Germany.
2. Continue eliminating avoidable live/unpinned runtime dependencies where an exact r8-local artifact exists.
3. Validate the production bootstrap as the single entry point for production-specific loaders.
4. Add end-to-end country smoke tests for DE and GB queries.
5. Keep the existing r8 release immutable; integration candidates are build artifacts until a new release/revision is intentionally created.

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
