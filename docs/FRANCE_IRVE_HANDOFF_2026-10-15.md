# France IRVE source handoff candidate — 15 October 2026

Production PR #104 is a source handoff inside the existing snapshot builder. The BUMP/Belib supplements, offer construction and pricing stages remain in their current order and use the same code. The default development snapshot and Stable relay are unchanged.

## Cause of the first CI failure

Run 38506877130 compared different source generations. Its development config pinned Stable `0a6d2c3415504397310d3dc92fae40be843b2435` (48,058 stations, 165,792 PDC, 362 tiles, all SHA-256 `204a5f7aaeecbd0988574d955a51f66f448325023977bccb9fe14dd9364b3b3d`) with Data Lab `94d4fc6785a0c1d2ed4df1d01b5a30d203bd4cd3` (49,185 stations, 165,129 PDC, 361 tiles, all SHA-256 `7113daf751ff34922474d8c9ead10c8e998ca651400d56a08f4964d3e66cf94f`). Strict byte parity cannot hold between those inputs. The file-difference list also contains the Data Lab `tiles/` tree, which the importer deliberately duplicates at the runtime root.

## Same-generation reference

Stable `6b1c62611d71ec96ea163b0dd1dc2df3003f292f` contains the relay of the Data Lab `94d4fc67` generation. Both manifests report 49,185 stations, 165,129 PDC and the same `allSha256`. Transforming only the Data Lab tile paths to the runtime layout yields the exact same manifest SHA-256 `c9f6427772b383e9bb9c45f5dff61ce88a2035d1584a6da5483777eda7538ddd` on both pinned commits. This proves source-manifest equivalence, not yet full built-output parity.

The separate handoff candidate config pins those commits. CI builds both the historical and direct variants against that same Stable reference, validates both snapshots, then compares all national rows and tiles as multisets after JSON/gzip normalization, plus the Belib/BUMP offer objects. Any business difference fails closed; raw hashes are reported separately. The existing development snapshot is still built and validated against its own historical pins. No publication step exists in this workflow.

## Gates still open

- Successful CI run for the new candidate, including full built-output parity and downstream validations.
- Multiset counts by station, EVSE, normal/Type 2/CCS connector, power, status, supplement, offer and computed price, with exact business-difference report if byte checks fail.
- A separate approved pin change before the handoff becomes the default. Until then the Stable IRVE relay and V7/V8 rollback remain active.

## First same-generation CI result

[Run 38722672261](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38722672261) reached the existing Belib supplement and failed on `FRV75PPX0750`: that station is already present in the newer national IRVE generation, while `supplement_france_irve_exact.py` correctly rejects applying the approved addition twice. Thus equal pre-supplement source manifests do **not** imply full build parity. The existing supplementation assumptions were approved against the older Stable France generation. The next change must prove, for each approved Belib/BUMP EVSE, whether the new national row is the same identity, active state and connector/power before making the supplement idempotent or changing the approved candidate. No assertion has been loosened and the current default build remains unchanged.

## Targeted EVSE comparison at the pinned SHAs

A read-only comparison of the compact France `all.json.gz` at Stable `0a6d2c34` and Data Lab `94d4fc67` confirms the four approved Belib station IDs and all 21 approved BUMP station IDs are absent from the old base and present in the new source. The national station count rises by 1,127 before any supplement. All 39 approved BUMP EVSE IDs are present on those 21 new national rows, **alongside 10 additional EVSE IDs**. For Belib, the four official, positively active 7 kW approved sets contain respectively 5, 4, 5 and 3 EVSE IDs; all 17 are present in the new rows, but `FRV75PPX1817` has one additional EVSE. Each Belib row has two AC 7 kW connector groups containing the same EVSE set, so group-entry counts must not be mistaken for distinct EVSE counts. These additional EVSEs require identity, status, connector and price review before a build-level handoff can claim business parity. They are not removed or priced by this PR.

## Idempotent supplement correction prepared

The existing Belib and BUMP approved evidence, offer sources and pricing code are untouched. For each approved station, the supplement still validates source provenance, operator, location, exact EVSE, connector and positive dynamic status. If the station is absent, it performs the original scoped addition. If present, it checks every approved EVSE connector signature against the newer national row, checks station metadata and rejects an approved EVSE at another station. It keeps the full national row, including additional EVSEs, without increasing the manifest counts or attaching any offer to those additional IDs. A mismatch fails with the station and missing/extra signatures. The 49,185 national stations therefore remain intact.

The [25-station comparison](FRANCE_IRVE_25_STATIONS_2026-10-15.md) records all 25 station IDs and 11 additional EVSE IDs. Historical approved scope is 17 Belib + 39 BUMP EVSE. The 11 distinct additional IDs belong to rows in the national public inventory and have explicit connector and power descriptions. Four are `hors_service` in the pinned dynamic data; seven have no matching dynamic record. None is positively `en_service` or present in the historical Belib/BUMP offer EVSE lists. Their individual public accessibility and active status remain unconfirmed; the migration keeps the national rows and does not infer a price.

Local targeted test: `python3 tests/test_france_irve_handoff_idempotence.py STABLE_OLD DATALAB_PINNED` exercises addition on the old base, verified no-op on the new base, preservation of all 11 additional IDs, and detailed rejection of divergent approved connectors in both families. The candidate workflow invokes this test, builds both variants, validates both snapshots, then runs `scripts/compare_france_irve_builds.py` for normalized business parity. CI result is pending.

## CI result at `2401c2b` — BUMP offer dependency remains

The single targeted [run 38724599850](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38724599850) passed the new add/present/divergent test, then stopped in the **reference build** at the existing BUMP exact offer validator (`FRBMPE3264`). Of 1,783 EVSE attached to the pinned BUMP offer overlay, **449 are absent** from the newer national source; all 449 remain in the historical supplemented France result, none is positively `en_service` in the pinned dynamic data, and they map to 122 historical station IDs. The complete [449-row identity and connector report](FRANCE_IRVE_BUMP_449_MISSING_2026-10-15.csv) records the old station, connector, power and whether its station ID survives in the new national source. There are no duplicate or foreign-operator matches for the attached set that does exist. Changing offers or silently carrying these historical EVSEs would alter approved coverage and is outside this idempotence correction.

The normalized comparison of the **two complete builds did not run** because the first build stopped at this guard. The 25-station supplement test and a local comparator self-check passed, but do not prove full build or price parity. The exact IDs and wider station/EVSE generation deltas are also recorded in the [PR #104 blocker comment](https://github.com/yass3705/tesla-charge-companion-production/pull/104#issuecomment-6190599297). France migration remains blocked by a business coverage dependency; Stable relay and default snapshot remain unchanged.
