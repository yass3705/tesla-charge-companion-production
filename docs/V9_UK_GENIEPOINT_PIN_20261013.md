# V9 development candidate: GeniePoint walk-up prices

The development pin moves from `2026-10-12-izivia-fast-direct-candidate` to `2026-10-13-uk-geniepoint-ad-hoc-candidate` after its candidate validations. Both configuration files remain versioned for rollback. Source commits are unchanged: Data Lab `66ec5a67b5498a5e95ff5896d2d7b9ebc25fde60` and Stable `0a6d2c3415504397310d3dc92fae40be843b2435`.

The new identity records the reviewed compiler change in Production #56: GeniePoint increases from 235 to 281 connector-specific gross GBP offers, with 857 of 1,138 exact connectors still unpriced. IZIVIA FAST remains 616/616 eligible stations and 1,212 direct offers. No source file, CPO direct price, old snapshot definition or deployment setting is rewritten. A complete pinned build, multi-country smoke, Stable parity, browser journey and hash verification are required before merging this pin.

This pin only selects the V9 development candidate. Publishing to GitHub Pages or Cloudflare remains a separate manual action and is not requested.
