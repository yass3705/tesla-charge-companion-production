# V9 production architecture

## Flow

1. Collectors and investigations run outside production.
2. A production snapshot pins exact source commits and immutable source artifacts.
3. The build copies or compiles only validated artifacts.
4. Validation checks schema, country coverage, duplicate identity and fail-closed behavior.
5. The resulting immutable snapshot is published.
6. Cloudflare mirrors the validated snapshot.
7. Traffic switches only after parity checks.

## Runtime scope

Tesla plus ES, NL, CH, MA, FR, IT, DE and UK.

Countries may be `complete` or `partial`; unresolved tariff or identity data remains fail-closed and never blocks publication of otherwise validated stations.

## Cloudflare target

Cloudflare's current recommendation for new applications is Workers Static Assets rather than Pages. TCC therefore targets:

- **Workers Static Assets**: frontend/runtime shell.
- **R2**: immutable snapshot payloads, country datasets and shards.
- **Worker code**: current-snapshot pointer, manifest/data routing, cache policy and health endpoint.
- **GitHub Actions**: collection/build orchestration remains outside Cloudflare initially.

R2 snapshots use immutable keys:

```
snapshots/2026-09-30/manifest.json
snapshots/2026-09-30/runtime/...
snapshots/2026-09-30/snapshot-inputs/...
current.json
```

`current.json` is the only mutable pointer. A deployment is promoted by changing that pointer after parity validation; rollback changes it back to the previous snapshot.

## Migration rule

Cloudflare is a mirror until parity passes. The legacy stable runtime remains the rollback baseline during migration. No collector credentials are committed; authentication material is supplied only through repository/environment secrets.
