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

### Source generations in later candidates (2026-10-11)

The historical development snapshot `2026-10-03-nl-datalab-candidate` remains pinned to Data Lab `40806cdd10c428579ed7c6b0bbecca0a01b70d12`: **199** direct IONITY locations produce **3** isolated unpriced sites. The Ubitricity integration snapshot `2026-10-07-r10` uses Data Lab `8e3462094dfa36d6e5623bfc9838f5fc53bab914` and has a distinct IONITY source fingerprint, but the same **199/3** result, eight quarantined UUIDs and three isolated UUIDs as r8 and the development snapshot. The 10 October collection at `4930259dc78889cd59b4405f5227c5a348d610a0` and the 11 October generation represented by `01f6c2a1d67d1b67d53e1c0951ccf12c28c74f0a` have distinct file fingerprints but each contains **200** direct locations and produces **4** isolated unpriced sites. All retain **188** locations near an existing national IONITY site and **8** proximity-ambiguous sites in quarantine. The frozen r8 pin `d0996b493bcfee5312b5ca1e38070df87b0d9642` has its own source fingerprint and the historical **199/3** result.

The versioned [provenance manifest](../config/germany-ionity-supplement-provenance.json) binds each accepted pair of compressed national/IONITY source SHA-256 digests **and its Data Lab checkout SHA** to exact expected counters. The snapshot builder also compares the Data Lab checkout HEAD with the SHA in its snapshot config. Different commits using byte-identical sources require separate explicit entries. The supplement generator, built-snapshot validator and runtime smoke reject an unknown association or counter drift. New source bytes or a new source commit require a reviewed manifest entry and tests; the constructor does not substitute Data Lab `main` for an immutable snapshot pin. The supplemental sites continue to have no EVSE IDs or prices. This correction fixes candidate validation; it does not promote a snapshot or deploy V9.

The global PR validation pins Data Lab `28697e01c904f172f52c544f766f899f085a6163`. Its national and IONITY compressed files are byte-identical to those at `01f6c2a1d67d1b67d53e1c0951ccf12c28c74f0a`, with **200/4**, the same eight quarantined UUIDs and the same four isolated UUIDs. It has a separate manifest entry because file identity does not imply checkout identity. A future change to the global workflow pin needs a reviewed entry even if those two source files remain unchanged.

The pinned development workflow also runs on pull requests that touch its builder, source manifest, validator, runtime or browser tests. This provides a read-only, no-publish CI check before merge; its existing push-on-`main` and manual triggers remain. Separate concurrency groups prevent PR validation from cancelling a `main` validation. The Ubitricity integration check remains a separate pin and must also pass.

For the Ubitricity pin, a local `2026-10-07-r10` build from Data Lab `8e3462094dfa36d6e5623bfc9838f5fc53bab914` and Stable `0a6d2c3415504397310d3dc92fae40be843b2435` passed the built-snapshot validator, Stable parity, browser resource graph, manifest digest verification, Ubitricity adapter test, Electra source-overlay validation, OCPI and congestion tests. Its Electra overlay includes the source archive, so the historical archive exception is not used. The general multi-country smoke targets a later NL national runtime and cannot pass on this older `2026-10-07-r10` configuration, where `netherlands-dotnl-national` is explicitly inactive; this does not affect the Ubitricity workflow, which does not run that smoke. The pinned 3 October development snapshot passed that smoke and its other local validations. CI results must still be checked on the PR.

The development workflow also validates the built snapshot and uses the existing `--allow-pricing-engine-override` parity mode for the tested V9 pricing engine from PR #36. The pinned 3 October Electra overlay predates `source-locations.json.gz`; its exact compiled manifest SHA-256 and every tile digest are checked under [a separate legacy provenance record](../config/electra-legacy-source-provenance.json). This does not establish conservation of Electra's original source locations, which are absent from that immutable snapshot. Later Electra overlays still require their source archive. The workflow uploads a candidate artifact only after all validation steps succeed.

The artifact uploaded by [failed run 38172211767](https://github.com/yass3705/tesla-charge-companion-production/actions/runs/38172211767) is **invalid**: its build stopped at the IONITY count assertion before parity, runtime and browser checks. It must not be used as a validated snapshot or release input.

Consequently, the production candidate can contain **63,405 baseline + 3 supplemental = 63,408 distinct German non-Tesla inventory records**, conditional on the end-to-end build gate passing. This is *not* proof that all 591 CPO estates are complete and does not change the 244/347 tariff-resolution CPO classification.

## Remaining work

1. Independently resolve the eight proximity-ambiguous IONITY site identities without merging by proximity.
2. If the broader 591-CPO station inventories become available as durable geolocated/EVSE datasets, reconcile them operator by operator against the national baseline before publishing additions.
3. Future verified national refreshes should rebuild this audited supplement rather than blindly preserving a hardcoded count.
4. The published historical `v9-snapshot-2026-09-30-r8` release remains immutable; these additions belong to a new production integration candidate.
