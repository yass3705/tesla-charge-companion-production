# DOT-NL frozen replay: currency guard

The 12 October six-profile CI replay uses Data Lab commit `8d0e94910f8125203bbf99435d8e141f4ee9875c`. Its historical simulation runner assumed that every compiled source tariff became one V9 offer. Production later began retaining connectors but excluding source prices that are not EUR; the frozen input includes 15 USD and 9 XXX connector occurrences. That safety change made the historical runner fail on `NL:CPI:NLCPIT2QP*1*0` (USD), before any pricing calculation.

`scripts/v9_nl_frozen_tariff_simulation_runtime.cjs` is the frozen runner copied from that Data Lab commit with one currency-aware assertion: an all-EUR group must produce exactly one direct offer; any non-EUR, missing or mixed-currency group must produce none. The latter still contributes an incomplete result to each simulated profile. The source fixture, connector weights, six profiles, independent energy oracle and expected totals remain unchanged. The workflow continues to check all six profiles and their exact frozen counts. This is a correction to replay expectations, not a new conversion rate or promotion of the 24 source prices.

The current V9 development snapshot remains pinned separately in `config/refresh-policy.json`. This historical audit does not publish a snapshot or Pages.
