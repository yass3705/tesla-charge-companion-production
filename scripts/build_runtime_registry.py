#!/usr/bin/env python3
import json, pathlib, sys

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def write(path,obj):
    path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def upsert(sources,row):
    for i,existing in enumerate(sources):
        if existing.get("id")==row["id"]:
            sources[i]=row
            return
    sources.append(row)

def build_registry(path):
    obj=load(path)
    sources=obj.setdefault("sources",[])
    sources[:]=[source for source in sources if source.get("id")!="france-electra-bois-darcy-direct"]
    upsert(sources,{
      "id":"germany-production-snapshot",
      "label":"Germany pinned BNetzA/direct-CPO production snapshot",
      "adapter":"germany-national-v1",
      "path":"../snapshot-inputs/DE/all.json.gz",
      "tileManifest":"../snapshot-inputs/DE/tiles/manifest.json",
      "tileRoot":"../snapshot-inputs/DE/tiles/",
      "ionityPath":"../snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz",
      "countries":["DE"],
      "capabilities":["inventory","connectors","access","status","tariff"],
      "priority":{"identity":70,"connectors":70,"access":55,"status":70,"tariff":125},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Only explicitly productionRankable tariffs are exposed, plus pinned IONITY Direct where a unique exact-coordinate + IONITY-operator match exists and every connector at the matched location has one uniform validated price. All other pricing remains fail-closed."
    })
    upsert(sources,{
      "id":"germany-ionity-isolated-r8",
      "label":"IONITY Germany pinned isolated first-party inventory supplement (unpriced)",
      "adapter":"germany-national-v1",
      "path":"../snapshot-inputs/DE/direct/ionity_isolated_unpriced_supplement.json",
      "countries":["DE"],
      "capabilities":["inventory"],
      "priority":{"identity":120,"connectors":0,"access":0,"status":0,"tariff":0},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Three direct-identified IONITY_CPO stations isolated from all national sites by at least 250m and all national IONITY sites by at least 2km. No EVSE identities or prices are inferred; eight nearby-third-party cases stay quarantined."
    })
    upsert(sources,{
      "id":"uk-production-open-feeds",
      "label":"UK pinned validated operator open feeds",
      "adapter":"uk-open-feeds-v1",
      "path":"../snapshot-inputs/UK/all.json.gz",
      "countries":["GB"],
      "capabilities":["inventory","connectors","access","status","tariff"],
      "priority":{"identity":75,"connectors":80,"access":60,"status":80,"tariff":125},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Tariffs join only by exact connector tariff_ids to same-source tariff.id; unsupported tariff semantics fail closed."
    })
    upsert(sources,{
      "id":"france-electra-platform",
      "label":"France Electra eMSP aggregate tariffs joined independently to national EVSEs",
      "adapter":"direct-offer-sharded-v1",
      "root":"../snapshot-inputs/FR/platforms/electra/",
      "manifest":"../snapshot-inputs/FR/platforms/electra/manifest.json",
      "countries":["FR"],
      "capabilities":["tariff"],
      "priority":{"tariff":82},
      "refresh":"snapshot-pinned",
      "active":False,
      "optional":True,
      "disabledReason":"Activated by build_snapshot only when a validated pinned Electra platform overlay is present.",
      "policy":"France national station/EVSE identities are the sole attachment hub. Electra offers attach independently by exact national IRVE EVSE ID; no Electroverse dependency and no proximity inference."
    })
    upsert(sources,{
      "id":"france-electra-direct",
      "label":"Electra France exact station app tariffs (captured 2026-09-02)",
      "adapter":"direct-offer-json",
      "path":"data/v9/electra-direct-france.json",
      "countries":["FR"],
      "capabilities":["tariff"],
      "priority":{"tariff":125},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Use only one unambiguous app tariff per officially matched Electra station, PAN station IDs within 10 m and DC connectors. Energy rates are selected by Europe/Paris session-start time; conditional congestion fees are excluded and visibly disclosed. Ambiguous stations stay unpriced."
    })
    upsert(sources,{
      "id":"france-izivia-fast-dole-direct",
      "label":"IZIVIA FAST McDonald's Dole exact station direct tariff (observed 2026-10-06)",
      "adapter":"direct-offer-json",
      "path":"data/v9/izivia-fast-dole-direct.json",
      "countries":["FR"],
      "capabilities":["tariff"],
      "priority":{"tariff":125},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Exact national station FRIZFPFAST422, operator IZIVIA, DC 150 kW only. The user transcribed this station tariff from the official IZIVIA map. Lock the Europe/Paris rate at plug-in; bill started kWh and connected minutes after 60 minutes. Do not infer a network default or Express tariff."
    })
    upsert(sources,{
      "id":"france-electroverse-r8",
      "label":"France pinned Electroverse exact station tariffs",
      "adapter":"direct-offer-json",
      "path":"../snapshot-inputs/FR/platforms/electroverse-runtime-offers.json",
      "countries":["FR"],
      "capabilities":["tariff"],
      "priority":{"tariff":80},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"France national station/EVSE identities are the sole attachment hub. Electroverse offers attach independently through validated IRVE mappings; no Electroverse-to-Electra dependency is permitted. Only high-confidence mappings with one uniform simple tariff across all cached connectors are exposed; complex or heterogeneous tariffs remain fail-closed."
    })
    upsert(sources,{
      "id":"france-ionity-r8",
      "label":"IONITY France pinned exact EVSE reconciliation",
      "adapter":"france-ionity-exact-v1",
      "path":"../snapshot-inputs/FR/direct/ionity_exact_france.json",
      "countries":["FR"],
      "capabilities":["tariff"],
      "priority":{"tariff":135},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Only exact resolved EVSE IDs from the pinned IONITY France reconciliation are rankable. The three unresolved EVSEs remain fail-closed."
    })
    upsert(sources,{
      "id":"italy-atlante-r8",
      "label":"Atlante Italy pinned exact EVSE tariffs",
      "adapter":"atlante-italy-exact-v1",
      "path":"../snapshot-inputs/IT/direct/atlante_direct_stations_italy_latest.json.gz",
      "countries":["IT"],
      "capabilities":["tariff"],
      "priority":{"tariff":135},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Exact IT*ATE EVSE identity only. Only simple unconditional ENERGY tariffs whose incl-VAT value matches pricePerKwhEur are rankable; all other cases fail closed."
    })
    upsert(sources,{
      "id":"italy-ionity-r8",
      "label":"IONITY Italy pinned exact PUN-EVSE reconciliation",
      "adapter":"italy-ionity-exact-v1",
      "path":"../snapshot-inputs/IT/direct/ionity_italy_exact_reconciliation_20260923.json",
      "countries":["IT"],
      "capabilities":["tariff"],
      "priority":{"tariff":135},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Only resolvedEvses from the validated exact reconciliation are rankable. The 13 unresolved PUN EVSEs and API-only connectors remain fail-closed."
    })
    upsert(sources,{
      "id":"switzerland-avia-r8",
      "label":"AVIA Switzerland pinned exact-EVSE guest tariffs",
      "adapter":"switzerland-avia-v1",
      "path":"../snapshot-inputs/CH/direct/avia-guest-direct-tariffs.json",
      "countries":["CH"],
      "capabilities":["tariff"],
      "priority":{"tariff":135},
      "refresh":"immutable-production-snapshot",
      "active":True,
      "optional":False,
      "policy":"Exact EVSE ID only. CHF/kWh incl. VAT only; time-based or unsupported tariff semantics fail closed."
    })

    # Convert source-registry entries that already have exact snapshot-local
    # equivalents. More complex EVGO/Kilowatt multi-file profiles remain
    # explicitly external until their immutable bundle is complete.
    for src in sources:
        if src.get("id")=="morocco-evgo-native":
            src["profile"]="evgo-production-local"
            src["path"]="../snapshot-inputs/MA/sources/evgo-production.json"
            src.pop("url",None)
            src.pop("statusUrl",None)
            src["refresh"]="immutable-production-snapshot"
        elif src.get("id")=="morocco-fastvolt-public":
            src["path"]="../snapshot-inputs/MA/sources/fastvolt-public-map.json"
            src.pop("url",None)
            src["refresh"]="immutable-production-snapshot"
        elif src.get("id")=="morocco-kilowatt-public":
            src["profile"]="kilowatt-native-local"
            src["paths"]={
              "inventory":"../snapshot-inputs/MA/sources/kilowatt-public-station-inventory.json",
              "native":"../snapshot-inputs/MA/sources/kilowatt-native-tariffs.json"
            }
            src.pop("urls",None)
            src["refresh"]="immutable-production-snapshot"
        elif src.get("id")=="morocco-totalenergies-hosts":
            src["path"]="../snapshot-inputs/MA/sources/totalenergies-native-overlay.json"
            src.pop("url",None)
            src["refresh"]="immutable-production-snapshot"
        elif src.get("id")=="atlante-direct-france":
            src["path"]="../snapshot-inputs/FR/direct/atlante_direct_stations_france_latest.json.gz"
            src["active"]=True
            src["optional"]=True
            src["refresh"]="immutable-production-snapshot"
            src["policy"]="Use the pinned r8 Atlante France exact-EVSE direct snapshot; unmatched EVSEs remain fail-closed."
        elif src.get("id")=="e55c-direct-france":
            src["label"]="Electric 55 Scan Pay direct tariffs attached by exact EVSE"
            src["path"]="../data/e55c_station_tariffs_v1.json.gz"
            src["active"]=True
            src["optional"]=False
            src["refresh"]="immutable-production-snapshot"
            src["policy"]="Use only the pinned Electric 55 Scan Pay tariffs attached by exact EVSE identity and physical operator. Unresolved points remain unpriced."

    obj["productionIntegration"]={
      "schemaVersion":1,
      "snapshotLocalSources":["germany-production-snapshot","germany-ionity-isolated-r8","uk-production-open-feeds","morocco-evgo-native","morocco-fastvolt-public","morocco-kilowatt-public","morocco-totalenergies-hosts","atlante-direct-france","e55c-direct-france","france-electra-direct","france-izivia-fast-dole-direct","france-electroverse-r8","france-ionity-r8","switzerland-avia-r8","italy-atlante-r8","italy-ionity-r8"],
      "remainingExternalSources":[],
      "policy":"Snapshot-local sources are required wherever an exact validated r8 artifact exists. No Morocco runtime source depends on Data Lab main; stale dynamic status fails closed while inventory and validated tariff evidence remain available."
    }
    return obj

def main():
    path=pathlib.Path(sys.argv[1])
    obj=build_registry(path)
    write(path,obj)
    print(json.dumps({"sources":len(obj.get("sources",[])),"productionIntegration":obj["productionIntegration"]},ensure_ascii=False))

if __name__=="__main__":
    main()
