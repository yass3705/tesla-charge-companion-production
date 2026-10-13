# Functional audit of the first public V9

## Reference and method

The published Pages site was checked over HTTP on 2026-10-13. It serves Production `6e3eaef101d72bf6d4855a819bcc2e4408e94528`, snapshot `2026-10-13-nine-country-be-belib-exact-candidate`, Data Lab `047e1911a5dfd4dcce741ad9b461c6096effb9cd` and Stable `0a6d2c3415504397310d3dc92fae40be843b2435`. Its deployment ID is `7026921334`. The user’s full battery, SOC and time settings were not recoverable from the six described screenshots, so they have not been inferred. Local quote checks use declared deterministic inputs: 2026-10-13 12:00 Europe/Paris, 30 kWh, 45 charging minutes and zero post-charge minutes. Actual road routing and vehicle curve can change the displayed session totals; screenshot amounts are reference observations, not recalculated oracle results.

The candidate preserves the public source pins and data mappings. No Pages or Cloudflare publication was triggered for the corrections. Production code and source overlays were traced independently; a source record is not equivalent to a calculated and displayed offer.

## Six reported stations

| Site | Exact evidence and finding | Resolution |
| --- | --- | --- |
| Lidl `LFR3148EVCP01`, FR | National station `FRLDLPLFR3148EVCP`; CCS EVSE `FRLDLE00002411/12` match Electra GraphQL EVSE IDs exactly at 48.80923, 2.0553. Electra eMSP 0.39 €/kWh and Lidl Plus direct 0.29 €/kWh are distinct. The Electra GraphQL CPO label is inconsistent, but the EVSE and location prove this specific station. | No false-positive eMSP demonstrated. Deterministic 30 kWh energy terms: €11.70 Electra, €8.70 direct. Do not globally exclude Lidl or Electra. |
| Electric 55, Place Lully, Saint-Cyr-l’École | National `FR55CP78210SA1P21PL`; 7.4 kW EVSE `FR55CEFR78210P21PL1/2/3` have exact Electroverse source location `4402250`, day 0.04 €/min and night 0.03 €/min. EVSE 0 is a separate 22.1 kW price. No matching Electra eMSP offer was found in the pinned overlay. | Electroverse attach is justified. Deterministic 45-minute daytime charge = €1.80 before any other applicable component. The national direct Electric 55 check has no verified consumer amount for this site; the separate exact Lons-le-Saunier offer is not applicable here. |
| Electric 55, allée des Chevreuils, Bois-d’Arcy | National `FR55CP78390BDACHEVREU1LS`; `FR55CEFR78390CHEVREU1LS0/1` match Electra source `792a7fa4-334c-4848-961a-49c38b587176` and Electroverse source `2333492`. Daytime charging rates are 0.084 and 0.08 €/min respectively. | Both eMSP paths are specific to the EVSE. Deterministic 45-minute charge/zero post-charge = €3.78 Electra and €3.60 Electroverse. No unverified direct Electric 55 price is inferred. |
| Electra Vélizy, Carré Vélizy | Official location `d17140ee...`, national station `FRELCP12954229`, ten EVSE at 22/300 kW. Two distinct station-level direct grids are collected. | The Production `kind: direct` adapter bug discarded both before evaluation; #66 restores attachment. Neither grid has verified tariff-to-EVSE attribution, so the price lane must remain ambiguous instead of picking the cheaper grid. |
| Electra Le Plessis-Robinson, La Boursidière | Official location `f4bb9f44...`, national station `FRELCP12953869`, seven EVSE at 22/150/400 kW; same two-grid attribution gap. | #66 restores the direct records. A unique connector price still requires official tariff-to-EVSE evidence. |
| Tesla Matosinhos, Portugal | Global pinned Tesla catalogue contains `tesla-matosinhos-portugal`, 20 stalls, 250 kW, direct offer, official Tesla URL and GBP/CHF/MAD peers. The published shell rejects PT before V9 rendering. | #69 routes outside-scope Tesla through the common V9 card. #72 carries links and exact source currencies through normalization; its post-build runtime test queries the actual Matosinhos record. |

## Cross-cutting defects and fixes

| Stage | Defect or control | Evidence / change |
| --- | --- | --- |
| Direct adapter | `kind: direct` became the fictitious connector kind `DIRECT`, rejecting all 724 exact Electra direct rules. | #66 fixes adapter and asserts exact station scope. 717 source rules reference 514 stations present in the published IRVE; 7 source rules remain unjoined. |
| eMSP identity | No wrong eMSP assignment was confirmed in the three reported Lidl/Electric 55 examples. | Pinned Electra overlay: 88,886 `exact_national_irve_evse` and 8,485 curated location joins. Electroverse uses exact/unique national identity modes. No operator/power-only inheritance is accepted. This is an inventory of source modes, not proof that every individual offer was manually reviewed. |
| Descriptions | Full day/night grids and zero congestion were printed in compact cards. | #67 shows applied segments/components in the summary and full terms in a disclosure; targeted day/night/post-charge regression. |
| Subscription | Electra+ was selectable but did not change quotes. | #70 derives Essential −€0.10/kWh and Smart −€0.20/kWh only from one verified exact direct Electra grid at an Electra-operated FR station. 320/521 stations qualify; 201 multi-grid stations do not. Monthly fees are separate. The selector is compact and multiselect; distinct providers may be selected together. |
| Ranking | Price and distance labels used a 70/30 weighted score, and total time had no mode. | #71 makes price, routed distance, total time and cost/km strict sorts. Unpriced stations remain visible after priced ones; balanced remains weighted. |
| Tesla adapter | Currency was hardcoded EUR for all offers, while source has 906 EUR, 216 GBP, 38 CHF and 6 MAD station-level pricing records. Maps and official Tesla URLs were dropped. | #72 preserves source currency per charging configuration, retains URLs, and marks ambiguous/missing currency non-comparable. It also exposes navigation and date in the shared card. Congestion amounts appear separately on 1,112 source stations; their occupancy/trigger conditions are not yet safe to add to a calculated charge. |
| FR national power | A real public Firefox search ranked `SAFRAN VELIZY` as AC 7,360 kW; the pinned IRVE compact source carried watts in a kW field. | #74 converts 675 AC groups / 663 stations when the conversion gives a plausible AC rating, preserves EVSE IDs, and retains two-decimal power grouping. Nine uncertain DC groups / six stations remain visible but non-comparable pending exact source proof. |
| Cross-window parking minutes | The pinned Electric 55 Electroverse rules charge time while connected after charging. For Place Lully, 45 charging minutes from 22:45 plus 10 parked minutes should be 15×€0.04 + 40×€0.03 = **€1.80**; the candidate engine returned **€1.50**, omitting all ten parked minutes. The Bois-d'Arcy sibling similarly returned €3.00 instead of **€3.60**. | #77 distributes parked minutes to the actual tariff windows and charges `PARKING_TIME` on each segment, while keeping one-time fees once. Its compact summary lists the post-charge rate only for the segment that incurred it. A paid parking rounding step across changing windows remains incalculable. The test reads the two exact EVSE offers from the pinned overlay and checks day, night and crossing scenarios against independent arithmetic. |

## Coverage losses and candidate gates

| Source path | Collected / compiled | Attached to pinned national identity | Evaluation and public visibility |
| --- | --- | --- | --- |
| Electra direct FR | 724 official exact rules in the compiled overlay | 717 rules reference 514 stations in the pinned IRVE; seven rules have no national join | The published adapter discarded all 724 by interpreting `direct` as a connector type. #66 restores loading in the candidate. A station with multiple grids remains non-comparable until a tariff-to-EVSE mapping is proven. |
| Electra eMSP FR | 97,371 source offers | 92,850 unique-station joins, 4,521 unjoined | The checked Lidl and Electric 55 offers are EVSE-specific. Unjoined offers are not displayed as matched prices. |
| Electroverse eMSP FR | 89,991 source offers | 86,782 unique-station joins, 3,209 unjoined | The checked Electric 55 offers are EVSE-specific. Unjoined offers are not displayed as matched prices. |
| Electric 55 direct | The [national operator check](https://github.com/yass3705/tesla-charge-companion-data-lab/blob/main/data/operator_direct/electric55_official_france.json) (2026-10-11) finds no national consumer tariff; public minute rates are indicative wholesale. **Separately**, the pinned `france-e55c-offers.json` contains one independently verified exact consumer direct offer at Lons-le-Saunier (`FR55CEFR39000P7PPFG1`). | That single offer attaches to national station `FR55CP39000LSAP7PPFG` and no other station in the local probe. No such direct offer is collected for Place Lully or Bois-d'Arcy. | Preserve the Lons exact price. The two reported Electric 55 sites stay direct-unavailable until their own checkout price and fees are captured. Never generalize the Lons offer or wholesale sheet to the network. |

For a fixed 2026-10-13 22:45 Europe/Paris session (45 charging minutes, 10 parked minutes, 10 kWh), a before/after engine comparison scanned all 89,991 pinned FR Electroverse offers. The 3,859 offers with a paid parking rate and at least one clock window remained calculable; **2,222** totals increased with the parking correction, **1,637** were unchanged, and **zero** decreased. This measures affected *offer/scenario evaluations*, not real charging sessions or unique stations. The two Electric 55 exact EVSE examples above are included in the independently checked regression.

The global evaluated-offer and visible-card totals depend on country, radius, session and power. No national UI count is inferred from these source and identity counts. The Firefox scenario below records the observable cards for its declared inputs.

To unblock the two Electra sites, request a current operator `chargeTariffId` → EVSE/connector mapping for official locations `d17140ee-16a7-4090-bd6e-91520e30c4b3` (Carré Vélizy) and `f4bb9f44-3c3c-4804-854b-d6f87862063b` (La Boursidière), including AC/DC power restrictions, validity and fees. Both expose two grids but no verified grid-to-EVSE link in the existing source. Electric 55 requires the actual ad-hoc checkout price for the named EVSEs, not its wholesale sheet. Neither missing direct amount can be safely reconstructed from an eMSP price.

The public FR IRVE base has 48,058 stations / 165,792 EVSE. A more recent Data Lab base has 49,211 / 164,368. On the public base, 92,850 of 97,371 Electra overlay offers and 86,782 of 89,991 Electroverse overlay offers retain an exact EVSE identity. Simply replacing the IRVE base would restore 4,521 Electra links but lose 3,932 currently matched Electroverse links while restoring 3,086 others. The replacement was built and validated only as a local experiment; it was **not** promoted. This is an unresolved identity reconciliation, not a reason to fabricate matches.

The automated full-overlay audit `scripts/audit_france_emsp_assignments.py` checked all 187,362 FR eMSP source offers against all 165,792 published national EVSE IDs. It found zero national EVSE IDs shared by two stations and zero eMSP offers whose EVSE IDs resolve to more than one national station. The joined counts are 92,850 Electra and 86,782 Electroverse, with 4,521 and 3,209 unmatched respectively; unmatched offers are not assigned by CPO or power. Thus **zero false positives are confirmed or corrected in the reported eMSP examples**, and zero ambiguous multi-station joins are detected by this exact-identity audit. Pricing completeness and tariff-to-connector attribution remain separate checks. The pinned workflow now fails if a multi-station identity appears or these validated joined counts decrease silently.

Pinned CI after #70 successfully built 2,442 files / 743,666,847 bytes and verified all SHA-256 entries. The nine-country runtime smoke returned FR 3,767 local area stations (3,309 priced), IT 1,828 (1,179), CH 40 (33), DE 67 (1 in the selected probe), ES 752, NL 3,298, GB 47 (33), MA 175 (175), BE 2,880 (905). These are **probe areas**, not national totals. The global preview may use a newer Data Lab SHA; its counts must not be reported as those of the pinned public data.

The corrected development ID is `2026-10-13-live-audit-corrected-candidate`. Its dataset SHAs and all ten dataset paths equal the public snapshot. PR #73 passed pinned CI, browser and manifest gates and advanced the development pointer on `main`; #74 passed global and pinned CI with Pages deployment skipped. The first public Pages snapshot and its rollback remain untouched. The screenshots originally supplied as `blob:` references could not be fetched from the repository.

## Firefox before/after captures

The public Pages URL and local corrected candidate were both opened in headless Firefox from `60 rue Gabriel Péri, 78210 Saint-Cyr-l’École`, 20 km, on 2026-10-13 at 12:00 local, 20→80% SOC, all operators and price sort. The address geocode was pinned to 48.810, 2.060 in both browsers. Routing still used the available OSRM service, so these captures establish rendering and tariff-source behavior; minor route and calculated total differences are not an independent routing oracle. Both searches returned 20 ranked cards with no V9 source or routing error.

Matosinhos was tested separately at 41.20845, −8.688498 within 10 km, using the same SOC target and date/time inputs. The published site returned one legacy Tesla card; the corrected local candidate returned one common V9 card.

| Station | Public before | Corrected candidate after | Visible change |
| --- | --- | --- | --- |
| Lidl `LFR3148EVCP01` | [Capture PNG](evidence/v9-live-audit-2026-10-13/published-fr-lidl.png) | [Capture PNG](evidence/v9-live-audit-2026-10-13/corrected-fr-lidl.png) | Zero-minute and zero-congestion components are absent from the compact summary; direct, Electra and Electroverse remain separate. A later display fix uses the source IRVE address `Rue de l'Aérostation Maritime` with operator `Lidl France` instead of this technical title, keeping its original IDs for pricing. |
| Ze-Watt Safran Vélizy | [Capture PNG](evidence/v9-live-audit-2026-10-13/published-fr-safran.png) | [Capture PNG](evidence/v9-live-audit-2026-10-13/corrected-fr-safran.png) | AC 7,360 kW becomes AC 7.36 kW; charge time and the minute-based Electra quote are recalculated using the corrected power. |
| Tesla Matosinhos, Portugal | [Capture PNG](evidence/v9-live-audit-2026-10-13/published-pt.png) | [Capture PNG](evidence/v9-live-audit-2026-10-13/corrected-pt.png) | The special legacy Tesla card becomes the shared V9 Direct / Electra / Electroverse card with navigation, source date and official Tesla link. The €15.16 legacy and €14.40 V9 totals come from different default vehicle/session models; they are **not** treated as a verified tariff correction. |

## Merged code and CI evidence

| PR | Merge SHA | Global CI / pinned CI |
| --- | --- | --- |
| #66 Direct Electra | `21070b17be921b1e45725271e3885dfc556d250e` | `38330916176` / `38330916172` |
| #67 Applied tariff display | `e3aa6ea402cf1b121168e892d17b53cd62f45362` | `38330924891` / `38330924854` |
| #69 Tesla common card | `04b27e288a6061d5089c1f330dee6263e7072385` | `38331242520` / `38331242524` |
| #70 Electra+ | `ed4d34accbb167eda69a17818f90e739e2bf2c89` | `38331807487` / `38331807703` |
| #71 Strict ranking | `323645a141e281462f373a2782647d5284940e22` | `38332098854` / `38332098931` |
| #72 Tesla links/currency | `e18e58e7aa62b7657f32b131bca85a01f0ba1a5c` | `38332296395` / `38332296420` |
| #73 Development pin / full FR eMSP identity audit | `269811f97f42eae1676cc464971ba4fc5b9b5f3b` | `38332686039` / `38332686044` |
| #74 FR IRVE power units and browser captures | `0ecb47db2bf47f580bf6e5a8b406881e8c131015` | `38333976174` / `38333976229` |
| #75 Sourced technical station titles | `3a0c6ae5cb770ea8f9be206359902e207c3bca81` | `38334235851` / `38334235902` |
| #77 Segmented post-charge parking | `fabeda672309cba8c1683219c44329be7015308f` | Global `38334933475`, pinned `38334935941`, NL/IZIVIA `38334933459` / `38334933464` / `38334933493` / `38334933490` |

All listed runs completed successfully, with the Pages deployment jobs skipped. The development pin passed its own validation. The live Pages site still serves the first public snapshot; none of these merged changes has been deployed to Pages or Cloudflare.
