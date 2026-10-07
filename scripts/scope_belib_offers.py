"""Bind the existing official Belib tariffs to the Paris station catalogue."""
import copy
import json
from pathlib import Path


def scope_belib_offers(offers_path: Path, stations_path: Path) -> int:
    payload = json.loads(offers_path.read_text(encoding="utf-8"))
    catalogue = json.loads(stations_path.read_text(encoding="utf-8"))
    count = 0
    for key in ("directOffers", "subscriptionOffers"):
        scoped = []
        for offer in payload.get(key, []):
            service_class = offer.get("metadata", {}).get("chargerClass")
            for station in catalogue["stations"]:
                for config in station.get("configurations", []):
                    if config.get("serviceClass") != service_class:
                        continue
                    evse_ids = config.get("roamingEvseIds") or []
                    if not evse_ids:
                        continue
                    item = copy.deepcopy(offer)
                    item["id"] = f'{offer["id"]}:{station["roamingStationId"]}:{config["kind"]}'
                    # Exact PDC identities also cover national rows whose station
                    # alias carries an IRVE prefix instead of the raw station ID.
                    item["stationIds"] = []
                    item["evseIds"] = evse_ids
                    item["connectorKinds"] = [config["kind"]]
                    item["networkAliases"] = []
                    item["verifiedScope"] = "exact_evse"
                    item.pop("minPowerKw", None)
                    item.pop("maxPowerKw", None)
                    scoped.append(item)
                    count += 1
        payload[key] = scoped
    offers_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return count


if __name__ == "__main__":
    import sys
    print(scope_belib_offers(Path(sys.argv[1]), Path(sys.argv[2])))
