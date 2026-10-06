#!/usr/bin/env python3
"""Export station-level Electroverse/IRVE join gaps from a pinned V9 sample."""
import argparse
import csv
import gzip
import importlib.util
import json
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--datalab", type=Path, required=True)
    parser.add_argument("--national", type=Path, required=True)
    parser.add_argument("--offers", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    spec = importlib.util.spec_from_file_location("electroverse_builder", Path(__file__).with_name("build_electroverse_runtime_offers.py"))
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)

    with gzip.open(args.national, "rt", encoding="utf-8") as stream:
        national_ids = {str(row[0]) for row in json.load(stream)}
    payload = json.loads(args.offers.read_text())
    published = payload["emspOffers"]
    fallback_pks = {str(offer.get("metadata", {}).get("electroverseLocationPk") or "") for offer in published if offer.get("evseIds")}
    unmatched_pks = {str(offer.get("metadata", {}).get("electroverseLocationPk") or "") for offer in published if offer.get("stationIds") and offer["stationIds"][0] not in national_ids and not offer.get("evseIds")}
    mappings = {str(row.get("electroverseLocationPk")): row for row in json.loads((args.datalab / "data/electroverse/irve_location_mapping.json").read_text())["mappings"]}
    rows = []
    cache = args.datalab / "data/electroverse/tariff_cache"
    manifest = json.loads((cache / "manifest.json").read_text())
    for shard in manifest["shards"]:
        for pk, station in json.loads((cache / shard["file"]).read_text())["stations"].items():
            pk = str(pk)
            _, reason = builder.station_offers(station)
            categories = []
            if pk in unmatched_pks:
                categories.append("sans_correspondance_irve_preview")
            if reason in {"same_power_tariff_collision", "power_specific_tariff_requires_exact_evse"} and pk not in fallback_pks:
                categories.append("tarifs_heterogenes_sans_jointure_borne")
            if not categories:
                continue
            mapping = mappings.get(pk) or {}
            irve = mapping.get("irve") or {}
            rows.append({
                "motif": ";".join(categories),
                "electroverse_location_pk": pk,
                "id_station_irve_source": station.get("irveStationId") or mapping.get("irveStationId") or "",
                "nom_station": irve.get("name") or "",
                "adresse": irve.get("address") or "",
                "operateur": irve.get("operator") or "",
                "latitude": irve.get("lat") or "",
                "longitude": irve.get("lon") or "",
                "tariff_hash": station.get("tariffHash") or "",
                "tariff_fetched_at": station.get("fetchedAt") or "",
                "irve_mapping_confidence": mapping.get("confidence") or "",
            })
    rows.sort(key=lambda row: (row["motif"], row["operateur"], row["nom_station"], row["electroverse_location_pk"]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ["motif", "electroverse_location_pk"])
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"rows": len(rows), "unmatchedStationPks": len(unmatched_pks), "heterogeneousUnresolvedPks": sum("tarifs_heterogenes_sans_jointure_borne" in row["motif"] for row in rows), "out": str(args.out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
