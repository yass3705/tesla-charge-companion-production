# Germany r8 station inventory reconciliation

Date: 2026-09-30

## Scope and provenance

Frozen r8 Data Lab pin: `d0996b493bcfee5312b5ca1e38070df87b0d9642`.

The completed 591/591 first-pass CPO study and 244 complete / 347 partial status ledger classify **operators and tariff-resolution work**, not a separate exhaustive geolocated station inventory. Do not use those CPO counts as evidence that 591 station inventories have been independently reconciled.

The authoritative national non-Tesla BNetzA baseline contains **63,405 physical sites**. The source reports 63,739 input sites less 334 Tesla sites; all 63,405 non-Tesla sites are present in the runtime's 231 tiles. The staging manifest's `stagedOnly`/`publishesToTcc:false` describe the original Data Lab source; the production runtime's independent integration and fail-closed guards determine the candidate's actual visibility.

## Audited IONITY direct overlay

Audit workflows: [initial identity audit](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36732491083), [all-operator proximity audit](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36732766902), and [conservative supplement generation](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/36733038724). Each uses the same pinned r8 Data Lab inputs. Audits preserve full JSON artifacts for detailed review.

- Direct IONITY Germany: **199 first-party locations, 1,578 connectors**.
- National BNetzA baseline: **265 sites labeled IONITY** (not an EVSE equivalence claim).
- **125** overlay sites have one national station with precisely matching coordinates.
- **30** overlay sites have an ambiguous exact-coordinate national match.
- **44** overlay sites have no precise coordinate match.
- Among the 44 nonexact matches: **19** have another IONITY national site within 50 m, **14** within 250 m and **11** have no IONITY-labeled national site within 2 km.
- Of those 11, **8** have a different operator's national site within 250 m. Keep these quarantined pending independent station-identity evidence; proximity alone is not proof of identity or independence.
- Remaining **3** sites (IONITY Hasbergen, Nempitz and Willich) have **no national site of any operator within 250 m** and no national IONITY site within 2 km.

The IONITY overlay lacks usable national EVSE identifiers for these candidate site joins. It must **not** be used to infer connector-level identity or transfer connector prices to a national station by proximity.

## Conservative production supplement

`scripts/build_germany_ionity_inventory_supplement.py` generates
`snapshot-inputs/DE/direct/ionity_isolated_unpriced_supplement.json`
from the pinned r8 inputs. The generator requires first-party IONITY scope, distinct direct location UUIDs, valid coordinates, and the conservative separation guards above; unexpected r8 counts fail the build.

The three isolated provider-identified sites are registered as a **separate production inventory source** (`germany-ionity-isolated-r8`), not inserted into or counted as part of the authoritative national baseline. Each source row has a provider UUID/coordinate and explicitly empty EVSE identities and pricing. **No tariff is exposed** for these sites by this supplement.

Consequently, the production candidate can contain **63,405 baseline + 3 supplemental = 63,408 distinct German non-Tesla inventory records**, conditional on the end-to-end build gate passing. This is *not* proof that all 591 CPO estates are complete and does not change the 244/347 tariff-resolution CPO classification.

## Remaining work

1. Independently resolve the eight proximity-ambiguous IONITY site identities without merging by proximity.
2. If the broader 591-CPO station inventories become available as durable geolocated/EVSE datasets, reconcile them operator by operator against the national baseline before publishing additions.
3. Future verified national refreshes should rebuild this audited supplement rather than blindly preserving a hardcoded count.
4. The published historical `v9-snapshot-2026-09-30-r8` release remains immutable; these additions belong to a new production integration candidate.
