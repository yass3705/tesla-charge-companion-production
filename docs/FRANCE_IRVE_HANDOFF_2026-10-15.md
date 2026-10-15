# France IRVE source handoff candidate — 15 October 2026

Production PR #104 is a source handoff inside the existing snapshot builder. The BUMP/Belib supplements, offer construction and pricing stages remain in their current order and use the same code. The default development snapshot and Stable relay are unchanged.

## Cause of the first CI failure

Run 38506877130 compared different source generations. Its development config pinned Stable `0a6d2c3415504397310d3dc92fae40be843b2435` (48,058 stations, 165,792 PDC, 362 tiles, all SHA-256 `204a5f7aaeecbd0988574d955a51f66f448325023977bccb9fe14dd9364b3b3d`) with Data Lab `94d4fc6785a0c1d2ed4df1d01b5a30d203bd4cd3` (49,185 stations, 165,129 PDC, 361 tiles, all SHA-256 `7113daf751ff34922474d8c9ead10c8e998ca651400d56a08f4964d3e66cf94f`). Strict byte parity cannot hold between those inputs. The file-difference list also contains the Data Lab `tiles/` tree, which the importer deliberately duplicates at the runtime root.

## Same-generation reference

Stable `6b1c62611d71ec96ea163b0dd1dc2df3003f292f` contains the relay of the Data Lab `94d4fc67` generation. Both manifests report 49,185 stations, 165,129 PDC and the same `allSha256`. Transforming only the Data Lab tile paths to the runtime layout yields the exact same manifest SHA-256 `c9f6427772b383e9bb9c45f5dff61ce88a2035d1584a6da5483777eda7538ddd` on both pinned commits. This proves source-manifest equivalence, not yet full built-output parity.

The separate handoff candidate config pins those commits. CI builds both the historical and direct variants against that same Stable reference, validates both snapshots, then checks SHA-256 of every France static file and both BUMP/Belib offer files. Any difference fails closed. The existing development snapshot is still built and validated against its own historical pins. No publication step exists in this workflow.

## Gates still open

- Successful CI run for the new candidate, including full built-output parity and downstream validations.
- Multiset counts by station, EVSE, normal/Type 2/CCS connector, power, status, supplement, offer and computed price, with exact business-difference report if byte checks fail.
- A separate approved pin change before the handoff becomes the default. Until then the Stable IRVE relay and V7/V8 rollback remain active.
