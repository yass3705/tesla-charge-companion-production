# Station source and navigation in the common card

The pinned Tesla source supplies Matosinhos with a Google Maps destination, an official Tesla station page and a 2026-07-22 update date. The V9 Tesla adapter kept the date but discarded both URLs, and the common card did not render a navigation or station link.

The candidate carries source URLs through Tesla normalization and identity merge. The shared card displays the source update date and a coordinates-based Google Maps destination for every station with valid coordinates. It displays the official Tesla page only when its HTTPS host is `tesla.com`. The regression follows Matosinhos from adapter through entity merge into the shared HTML and rejects unsafe/non-Tesla URL hosts. Source tariff records and the published snapshot are unchanged.

The same adapter previously set every Tesla offer to EUR. The pinned catalogue includes 906 EUR, 216 GBP, 38 CHF and 6 MAD station-level pricing records; a regression now compares every configuration's source currency with its normalized offer. A mixed or missing source currency makes the offer non-comparable instead of silently using EUR. This changes only the development candidate's Tesla price interpretation. The source also has separate congestion amounts for 1,112 stations; occupancy/trigger evidence must be resolved before those amounts can enter a calculated quote.
