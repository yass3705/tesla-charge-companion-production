# Tesla V9 tariff lanes (13 October 2026)

The V9 shell previously returned a special one-line Tesla price before rendering the independent Direct, Electra and Electroverse lanes. That hid the two unavailable eMSP lanes even when the UI contract required all three to remain visible. The special return is removed; Tesla's validated direct quote appears in Direct, and absent eMSP quotes say `Prix non disponible`. Incomplete quotes remain `Tarif incalculable` and outside the best-price ranking. This changes presentation only, not Tesla inventory, tariff amounts or the development pin.

The targeted lane and station-grouping tests cover priced and unpriced Tesla examples. Full global and pinned browser CI must pass before merge. No Pages deployment is part of this change.
