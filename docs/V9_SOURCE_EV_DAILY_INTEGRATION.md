# Source EV UK: daily PCPR collection and V9 candidate integration

Data Lab collects Source EV at 03:43 UTC every day through `uk-source_ev-pcpr-collect.yml`. The accepted 12 October 2026 run (`38289984508`) staged 36 public sites, 321 active Type 2/CCS connectors with exact prices, and two direct CPO PAYG tariffs. The staged dataset is not a production publication.

The Data Lab workflow runs `uk_source_ev_pcpr_validate.py` after each collection and commits the staged source, collection report and independent audit together. The audit checks the declared Source EV/SGB CPO identity, public UK coordinates, available or charging EVSEs, supported connector types, exact tariff references, GBP prices including VAT, the two officially corroborated PAYG prices, and the source SHA-256. A failed collection or audit leaves the prior committed evidence intact.

`build_snapshot.py` keeps Source EV inactive unless the pinned Data Lab checkout contains all three matching files. It verifies timestamps, run ID, source digest, public connector counts, tariff and operator identity, then activates `uk-source-ev-pcpr-direct` in the candidate registry. Only the filtered V9 source is copied; the raw PCPR feed is excluded. The UK adapter binds each direct offer to its exact connector and uses the VAT-inclusive OCPI component pricing path. The global preview workflow tests the deployed bytes and adapter output when an audit exists; without an audit, the source remains inactive. A future price or tariff ID outside the corroborated scope fails the Data Lab audit until reviewed.

Scheduled and PR candidate builds do not publish Pages. Publication still requires the manual `workflow_dispatch` with `publish=true` and a separately reviewed immutable snapshot pin. A successful daily collection alone never promotes the development pin.

Local validation on 12 October used Stable `3b2d4776029e2ce72d0de9a102d68e5afe5a0ef8` and Data Lab `8da6c953b94fda32105a92e3bb5ea273893f8fcf`. The candidate built and passed snapshot validation, manifest SHA-256 verification, the 321-offer adapter test, and a runtime query near the verified Alloa site. These checks do not establish a public deployment.
