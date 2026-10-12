# Belib Paris: exact EVSE tariff scope (13 October 2026)

The pinned Stable catalogue contains four visitor tariffs and eight subscription tariffs. Before this change, all twelve use `network_brand_exact_power`, which can attach a Belib tariff to a station without proof of its charge-point identity. The pinned Data Lab catalogue `data/national/belib_stations_paris.json` supplies the official roaming EVSE IDs, service class and connector kind for 381 Paris stations.

At snapshot build time, `scripts/scope_belib_offers.py` binds each existing tariff to matching service-class configurations and sets `verifiedScope=exact_evse`. The result is 473 visitor and 946 subscription offer records, with 1,419 unique IDs. The 80 excluded motorcycle points have no supported configurations and receive no numeric offer. Stations outside the official catalogue keep no Belib direct price through this source. A missing catalogue or empty scope fails the build.

The Production session-engine override had diverged from Stable and omitted the EVSE identity check. It now matches exact offers against the EVSE identities of the same connector and evaluates them at that connector's power. A mixed 7/22 kW station regression verifies that the 7 kW tariff is not applied to its 22 kW neighbor, and an unrelated EVSE receives no offer.

This ports only the scoped tariff join from historical Production PR #28. Its older national adapter and UI changes remain under separate review. The source tariff amounts are unchanged. The development pin and immutable snapshots are unchanged until CI validates the new builder and a new candidate is promoted. No Pages deployment is authorized.
