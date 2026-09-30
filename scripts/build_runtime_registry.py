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

    obj["productionIntegration"]={
      "schemaVersion":1,
      "snapshotLocalSources":["germany-production-snapshot","uk-production-open-feeds","morocco-evgo-native","morocco-fastvolt-public","morocco-kilowatt-public","morocco-totalenergies-hosts","atlante-direct-france","switzerland-avia-r8","italy-ionity-r8"],
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
