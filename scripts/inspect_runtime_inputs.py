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
            out["sample"]=obj[0] if isinstance(obj[0],dict) else obj[0]
    elif isinstance(obj,dict):
        out["keys"]=sorted(obj.keys())
        for key in ("stations","sites","rows","data","items","features"):
            if isinstance(obj.get(key),list):
                out["rowContainer"]=key
                out["count"]=len(obj[key])
                if obj[key] and isinstance(obj[key][0],dict):
                    out["sampleKeys"]=sorted(obj[key][0].keys())
                    out["sample"]=obj[key][0]
                break
    return out

def main():
    dl=pathlib.Path(sys.argv[1])
    targets={
      "DE":dl/"data/national/germany_non_tesla_catalog_staging_direct_cpo.json.gz",
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
