# V9 tariff profile coverage

The snapshot build audits every JSON and JSON.gz file under `runtime`, `data` and `snapshot-inputs`. The 2026-10-06 pinned candidate contains 1,827 readable files, 239,651 physical `pricing` objects (including mirrored files), and 145 distinct structural tariff signatures. The complete machine-readable inventory, with source paths and representative offer IDs, is uploaded as the `v9-tariff-profile-inventory` Actions artifact.

| Representation | Physical pricing objects | Simulator treatment |
| --- | ---: | --- |
| `rules` | 131,144 | Day, time, weekday and holiday selection; energy, connected/charging time, fixed, minimum, conditional, post-charge and power-band charges. |
| `kwh` | 34,816 | Energy rate plus supported conditional and post-charge fees. |
| `component_groups` | 43,151 | Independent ENERGY, TIME, PARKING_TIME, FLAT and CONGESTION_TIME components, including tariff windows, power limits and duration tiers. |
| `electroverse_restrictions` | 30,540 | Electroverse-specific tariff evaluator and source-labelled result. |

The inventory also records raw OCPI price component kinds, including `ENERGY`, `TIME`, `PARKING_TIME`, `FLAT` and `CONGESTION_TIME`. It counts physical copies; it is not a count of unique stations or usable offers.

The calculation engine returns a price only when all applicable components can be determined. A missing rate, an expired effective date, an unsupported congestion history or a required power/energy timeline produces an explicit unavailable reason. A valid first free hour produces a complete 0 € result. REVE `endTime` minute labels are inclusive, so adjacent 15-minute bands meet without a gap; other time-window rules retain their existing boundary semantics.

The CI gate rebuilds the pinned snapshot, fails on unknown pricing types or a change to the 145 reviewed schema signatures, and exercises each structural profile with day and night scenarios. Separate regression tests cover representative tariffs from France, Italy, Spain and Tesla, the direct/Electra/Electroverse joins, station grouping, multi-country runtime, browser journey and manifest hashes. The inventory and sweep do not certify that every source offer is available at every requested time: date-limited and window-limited tariffs remain unavailable outside their stated validity.
