# V9 tariff component labels (13 October 2026)

The session calculator already handles fixed session and connection fees, started connected-time blocks, minimum totals, OCPI duration bands and late connection fees. The V9 shell's tariff summary omitted these components, so a calculated total could appear beside an incomplete rate description. The summary now names each component from the existing offer rule, includes its time window where present, and shows late connection fees with their threshold in both the tariff lane and power line. Amount calculation and ranking are unchanged.

The targeted V9 lane test checks that the component descriptions appear. Full global and pinned browser CI must pass before merge. No new price evidence, data pin or Pages deployment is involved.
