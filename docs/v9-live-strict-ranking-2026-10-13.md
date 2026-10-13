# V9 ranking semantics

The public shell labels two modes as price and distance priority, while the implementation uses a 70/30 weighted score. A distant cheap station can therefore appear before the lowest priced one, and an expensive near station can appear before the nearest. The requested total travel plus charge time mode is absent.

The candidate uses strict ascending sorts for price, routed distance and total time, with deterministic tie breaks. The existing balanced mode remains weighted. Cost per recovered kilometre remains a strict sort. Stations without a validated comparable price stay visible after priced stations in every mode. In distance mode, stations with a routed distance are listed before those with only an explicitly labelled straight-line estimate.

The regression checks all four strict modes and the unpriced tail. It uses the already selected comparable quote from the evaluation; no source tariff or immutable snapshot changes.
