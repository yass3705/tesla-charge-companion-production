# V9 exchange-rate evidence (13 October 2026)

The browser shell used a hard-coded fallback table of EUR exchange rates when `data/exchange_rates.json` was unavailable. Those numbers had no source or date at the point of use and could make a cross-currency quote appear comparable. The shell now accepts non-EUR rates only from a fetched file declaring an EUR base, observation date, check timestamp, source and valid positive rates. A failed fetch or malformed file leaves `EUR: 1` only. Local-currency amounts remain visible; unavailable EUR estimates say `conversion en € non disponible`, and the session engine cannot rank a quote requiring an unsupported currency conversion.

The pinned Stable rate file dated 11 October 2026 carries the required provenance and passes the guard. This change does not refresh that rate or alter source tariffs. Targeted tariff-lane and shell tests pass; global and pinned browser CI must pass before merge. No Pages deployment is authorized.
