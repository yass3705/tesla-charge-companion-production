# Tesla outside the nine-country non-Tesla scope

The 2026-10-13 public shell sends Matosinhos, Portugal through the legacy comparison UI. Its V9 `executeV9` rejects every country absent from `engineScopeCountries`, even though the pinned V9 registry includes the global Tesla source. Portugal is absent from the nine-country non-Tesla scope by design.

The candidate now queries Tesla only when the origin is outside that scope. A request with an explicit non-Tesla operator still fails the scope check, and a query with no Tesla station falls back. In-scope countries continue using the normal full query. Tesla stations returned by the V9 engine use the same `renderCandidate` card, three tariff lanes, ranking and subscription plumbing as other stations. No price, EVSE or station identity is synthesized by this change.

The targeted regression uses a Portugal origin and checks that the query sent to the engine contains only the Tesla operator. The published Pages snapshot remains unchanged; this is a review candidate only.
