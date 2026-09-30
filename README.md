# Tesla Charge Companion — Production

Production runtime for Tesla Charge Companion V9.

## Repository roles

- `tesla-charge-companion-data-lab`: collectors, investigations, evidence and canonical national data.
- `tesla-charge-companion-production`: validated production runtime, pinned snapshots, deploy configuration and Cloudflare publication.
- `tesla-charge-companion-stable`: legacy V8/V9 reference and rollback baseline during migration.
- `tesla-stations-updater-test`: legacy source retained only where a country has not yet been fully migrated to Data Lab.

## Production policy

Every production build is reproducible from pinned source commits. Countries can be published as `complete` or `partial`. Partial coverage never authorizes extrapolation: unresolved prices and identities remain fail-closed.

Initial snapshot: `2026-09-30`.

Scope: Tesla + ES, NL, CH, MA, FR, IT, DE and UK.

Cloudflare migration is staged: build and validate the snapshot first, mirror it to Cloudflare second, compare parity, then switch production traffic.
