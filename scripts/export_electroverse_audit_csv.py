#!/usr/bin/env python3
"""Export station-level Electroverse/IRVE join gaps from a pinned V9 sample."""
import argparse
import csv
import gzip
import importlib.util
import json
import math
from collections import defaultdict
from pathlib import Path


def tariff_details(builder, tariff):
    by_power = defaultdict(lambda: defaultdict(list))
    for evse in tariff.get("evses") or []:
        reference = str(evse.get("physicalReference") or evse.get("pk") or "")
        for connector in evse.get("connectors") or []:
            power = connector.get("kilowatts")
            if power is None:
                continue
            policy, _ = builder.connector_policy(connector)
            if not policy:
                continue
            rates = policy.get("fallbackRates") or {}
            parts = [f"{rates[key]:g} EUR/{unit}" for key, unit in (("energy", "kWh"), ("chargingMinute", "min charge"), ("parkingMinute", "min stationnement")) if rates.get(key)]
            if rates.get("flat"):
                parts.append(f"{rates['flat']:g} EUR fixes")
            for rule in policy.get("rules") or []:
                restricted = rule.get("rates") or {}
                if restricted != rates:
                    parts.append("restriction " + ", ".join(f"{key}={value:g}" for key, value in restricted.items() if value))
            label = ", ".join(dict.fromkeys(parts)) or "0 EUR"
            by_power[math.floor(float(power))][label].append(reference)
    details = []
    for power, variants in sorted(by_power.items()):
        details.append(f"{power} kW : " + " ; ".join(f"{rate} ({len(refs)} borne(s))" for rate, refs in sorted(variants.items())))
    references = sorted({ref for variants in by_power.values() for refs in variants.values() for ref in refs if ref})
    return " | ".join(details), ";".join(references)


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

    national_ids = set()
    national_files = sorted(args.national.glob("*.json.gz")) if args.national.is_dir() else [args.national]
    for national_file in national_files:
        with gzip.open(national_file, "rt", encoding="utf-8") as stream:
            national_ids.update(str(row[0]) for row in json.load(stream))
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
            heterogeneous = reason in {"same_power_tariff_collision", "power_specific_tariff_requires_exact_evse"}
            if heterogeneous:
                categories.append("tarifs_heterogenes")
            if not categories:
                continue
            connectors = [connector for evse in (station.get("tariff") or {}).get("evses") or [] for connector in evse.get("connectors") or []]
            tariff_variants = {json.dumps(builder.connector_policy(connector)[0], sort_keys=True, separators=(",", ":")) for connector in connectors} if heterogeneous else set()
            powers = sorted({str(connector.get("kilowatts")) for connector in connectors if connector.get("kilowatts") is not None}, key=lambda value: float(value))
            mapping = mappings.get(pk) or {}
            irve = mapping.get("irve") or {}
            conflict_rates, evse_references = tariff_details(builder, station.get("tariff") or {}) if heterogeneous else ("", "")
            comment = []
            if heterogeneous:
                comment.append("Tarifs différents pour une même puissance : identifier la borne Electroverse exacte avant de généraliser." if reason == "same_power_tariff_collision" else "Tarifs différents selon la puissance ou la borne : correspondance EVSE exacte requise.")
            if pk in unmatched_pks:
                comment.append("Aucune station IRVE correspondante dans le snapshot preview ; contrôler le code de station Electroverse et les coordonnées source.")
            rows.append({
                "motif": ";".join(categories),
                "jointure_tarif_par_borne": "resolue" if pk in fallback_pks else "non_resolue" if heterogeneous else "sans_objet",
                "nombre_tarifs_distincts": len(tariff_variants) if heterogeneous else "",
                "puissances_kw": ";".join(powers),
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
                "code_station_electroverse": str((station.get("tariff") or {}).get("chargingLocationPk") or station.get("electroverseLocationPk") or pk),
                "tarifs_en_conflit": conflict_rates,
                "references_bornes_electroverse": evse_references,
                "commentaire": " ".join(comment),
            })
    rows.sort(key=lambda row: (row["motif"], row["operateur"], row["nom_station"], row["electroverse_location_pk"]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]) if rows else ["motif", "electroverse_location_pk"])
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"rows": len(rows), "unmatchedStationPks": len(unmatched_pks), "heterogeneousPks": sum("tarifs_heterogenes" in row["motif"] for row in rows), "heterogeneousUnresolvedPks": sum("tarifs_heterogenes" in row["motif"] and row["jointure_tarif_par_borne"] == "non_resolue" for row in rows), "out": str(args.out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
