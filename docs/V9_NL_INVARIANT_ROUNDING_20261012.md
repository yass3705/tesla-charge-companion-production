# NL V9 — invariant all-day rounding, one whole session

**Candidate, no merge, no deployment.** Data Lab audit #197 identified 171 connector occurrences whose midnight crossing still fails after PR #43. There are 150 paid TIME-step cases (including duration bands) and 21 paid ENERGY-step cases.

This separate and complementary change is allowed **only** for exactly one tariff rule valid all hours on all seven days, with no holiday, date, or same-day restriction, and an actually billable TIME/ENERGY step. The same rule then applies throughout the session, including midnight. Charge the full energy, full charging duration and one-time fees once, before rounding steps. Never divide a priced rounded duration into two independent blocks.

For two or more windows, partial days, date/holiday restrictions, and varying prices, retain strict `tariff_window_crossing_unsupported_components` behavior. This PR is independent of the zero-price-step PR #43 and should be integration-tested with #42 and #43 before any merge.

Read-only PR workflow simulates six profiles on the exact Data Lab audit pin `8d0e94910f8125203bbf99435d8e141f4ee9875c`. Weighted connector counts can indicate engine failures, not proof of public charging availability or commercial price validity. USD and XXX NL currencies remain isolated, and no tariff/snapshot/Pages changes are made.
