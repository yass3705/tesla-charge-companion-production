# V9 production architecture

## Flow

1. Collectors and investigations run outside production.
2. A production snapshot pins exact source commits.
3. The build copies or compiles only validated artifacts.
4. Validation checks schema, country coverage, duplicate identity and fail-closed behavior.
5. The resulting immutable snapshot is published.
6. Cloudflare mirrors the validated snapshot.
7. Traffic switches only after parity checks.

## Target runtime layout

```
runtime/
  manifest.json
  tesla/
  countries/
    ES/
    NL/
    CH/
    MA/
    FR/
    IT/
    DE/
    UK/
```

Each country directory ultimately exposes a common runtime contract: manifest, station shards/all dataset, and offer/tariff overlays where available.

## Cloudflare target

- Pages: frontend.
- R2: immutable snapshot payloads and shards.
- Worker: manifest/routing/cache layer.
- GitHub Actions: collection/build orchestration remains outside Cloudflare initially.

No collector credentials are committed. Authentication material is supplied only through repository/environment secrets.
