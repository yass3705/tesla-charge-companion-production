#!/usr/bin/env python3
import gzip, json, pathlib, sys

def load_json(path):
    p=pathlib.Path(path)
    opener=gzip.open if p.suffix==".gz" else open
    with opener(p,"rt",encoding="utf-8") as f:
        return json.load(f)

def summarize(name,obj):
    out={"name":name,"type":type(obj).__name__}
    if isinstance(obj,list):
        out["count"]=len(obj)
        if obj:
            out["sampleKeys"]=sorted(obj[0].keys()) if isinstance(obj[0],dict) else []
            out["sample"]=obj[0]
        return out
    if not isinstance(obj,dict):
        return out

    out["keys"]=sorted(obj.keys())
    for key in ("stations","sites","rows","data","items","features"):
        if isinstance(obj.get(key),list):
            rows=obj[key]
            out["rowContainer"]=key
            out["count"]=len(rows)
            if rows and isinstance(rows[0],dict):
                out["sampleKeys"]=sorted(rows[0].keys())
                out["sample"]=rows[0]
            if name=="DE":
                priced=next((x for x in rows if isinstance(x,dict) and isinstance(x.get("pricing"),dict) and x["pricing"].get("directCpo")),None)
                if priced:
                    out["sampleDirectCpoSite"]=priced
            break

    if name=="UK" and isinstance(obj.get("sources"),list):
        out["sourceCount"]=len(obj["sources"])
        src=next((x for x in obj["sources"] if isinstance(x,dict) and (x.get("locations") or x.get("tariffs"))),None)
        if src:
            out["firstSourceName"]=src.get("name")
            out["firstSourceKeys"]=sorted(src.keys())
            if isinstance(src.get("locations"),list) and src["locations"]:
                out["sampleLocationKeys"]=sorted(src["locations"][0].keys()) if isinstance(src["locations"][0],dict) else []
                out["sampleLocation"]=src["locations"][0]
            if isinstance(src.get("tariffs"),list) and src["tariffs"]:
                out["sampleTariffKeys"]=sorted(src["tariffs"][0].keys()) if isinstance(src["tariffs"][0],dict) else []
                out["sampleTariff"]=src["tariffs"][0]
    return out

def main():
    dl=pathlib.Path(sys.argv[1])
    targets={
      "DE":dl/"data/national/germany_non_tesla_catalog_staging_direct_cpo.json.gz",
      "DE_IONITY":dl/"data/national/ionity_direct_stations_germany.json.gz",
      "UK":dl/"data/national/uk_validated_open_feeds.json.gz",
      "FR":dl/"data/national/france_public_charging_canonical.json",
      "CH":dl/"data/national/switzerland_public_charging_v9.json",
    }
    report={}
    for name,path in targets.items():
        report[name]={"exists":path.exists(),"path":str(path)}
        if path.exists():
            report[name].update(summarize(name,load_json(path)))
    print(json.dumps(report,ensure_ascii=False,indent=2,default=str))

if __name__=="__main__":
    main()
