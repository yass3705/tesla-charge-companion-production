# V9 tariff labels and local validation — 2026-10-11

Branch: `fix/v9-tariff-labels-local`, PR #36. Source rule: Data Lab `docs/v9-pricing-result-labels-policy-2026-10-10.md`, amended on `docs/v9-tariff-labels-validation-local` (PR #194).

Review correction, 11 October: tariff time zone priority is `pricing.timeZone`, offer metadata, station, then session. The explicit source zone wins over a conflicting session or Mac zone; invalid source zones fail closed. The same resolver is used by offer validity, session start locked rates, timeline segmentation and general pricing. Regression cases cover DST, a local date change and a charge timeline. The Tesla display now distinguishes an identified incomplete offer (`Tarif incalculable`) from no offer (`Prix non disponible`). The bridge requires `result.complete === true` before a numeric total or cost per kilometre may enter rows, map markers or grouped rankings. No public V9 deployment is implied by these PR changes.

The bridge keeps `priced`, `ambiguous`, `unresolved` and `missing` as internal lane states. It renders `Tarif incalculable` for ambiguous or unresolved offers and `Prix non disponible` for an empty lane. The lane retains offer IDs and detailed reasons in `diagnostics`. Only a complete, comparable result with a numeric total can be priced or selected as best. The existing per connector, EVSE, power and category variant path remains the boundary for comparisons.

The OCPI component test exposed a separate pricing bug: `evaluateOffer` ignored the source `pricing.timeZone` when the session and offer metadata omitted a zone. A Monday UK tariff at 09:00 UTC was evaluated using the Mac's Europe/Paris clock (11:00), excluding its energy component. The engine now prioritizes `pricing.timeZone`. Calendar and time-window tariffs without a zone fail closed; an invalid explicit zone also fails closed. All-day rules without a zone remain calculable. Targeted tests cover both DST transitions, an overnight window and a session crossing a tariff boundary, including under `TZ=UTC`.

The local snapshot command is run from the TCC parent directory:

```sh
python3 tesla-charge-companion-production/scripts/build_snapshot.py --stable tesla-charge-companion-stable --datalab tesla-charge-companion-data-lab --config tesla-charge-companion-production/config/snapshots/2026-10-03-nl-datalab-candidate.json --out tesla-charge-companion-production/dist/v9-global-preview
```

This creates a local candidate only. The old Stable `scripts/test_tcc_v9_*status*` / `*failure_labels*` scripts expect a `tariffFailureLabel` API and earlier UI text that Production's bridge does not expose. They are historical contract tests, not the acceptance suite for this Production change; `tests/v9-tariff-lanes.test.mjs` covers the current bridge.

Local checks before commit: `v9-pricing-time-zone`, `v9-ocpi-component-coverage`, `v9-congestion-soc80`, `uk-ocpi-first-match`, `v9-tariff-lanes` and `v9-shell-grouping`; `validate_built_snapshot.py`, `git diff --check`, and the Data Lab public safety scanner. `dist/` is ignored and is never staged.
