# Read-only integration of three independent PRs

This branch intentionally combines **Production #42** (IONITY source-digest provenance), **#43** (zero-priced step crosses midnight) and **#44** (single invariant rule paid rounding billed once). It is a temporary verification candidate, **not a replacement PR for any of the three**.

Production base is `84e86c317af2f4d2380f2fd1543dd4befafc10fe`; Data Lab current source on 2026-10-12 is `641fce3038d8039f915b7153ff87c0726100f64e`. The German source blobs match the previously reviewed national `d4610a40a66ea813342c74aa2874fb8d7aaea8a2` and IONITY `8c81d1bbbeddfff9b59497908ddd5f2b9579d008`; the provenance assertions remain fail-closed on both compressed SHA-256 hashes and all station counters.

Expected Dutch simulation check: six profiles, **969 054** weighted evaluations on exact Data Lab frozen pin `8d0e94910f8125203bbf99435d8e141f4ee9875c`, 161 509 active connectors with compiled offers, no zero-price invention, 24 anomalous-currency connectors still isolated. Exact number of midnight failures must come from CI, not inference. The combined candidate must improve versus both separate PRs without regressing other sessions or independent ENERGY checks.

**Do not merge or deploy this integration branch**. Review, then merge normal PRs individually on explicit authorization and rerun all checks afterward. Pages publication remains gated by manual publish request, no automatic promotion.
