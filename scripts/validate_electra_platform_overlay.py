#!/usr/bin/env python3
import json, pathlib, sys

def main():
    root=pathlib.Path(sys.argv[1])
    manifest=root/"data/platforms/electra/france/manifest.json"
    if not manifest.exists():
        raise SystemExit("Electra platform overlay missing")
    obj=json.loads(manifest.read_text(encoding="utf-8"))
    policy=obj.get("policy") or {}
    stats=obj.get("stats") or {}
    assert policy.get("nationalFranceIsIdentityHub") is True, policy
    assert policy.get("exactNationalEvseOnly") is True, policy
    assert policy.get("electroverseDependency") is False, policy
    assert policy.get("heterogeneousLocationTariffsFailClosed") is True, policy
    assert policy.get("unsupportedComponentsFailClosed") is True, policy
    assert int(stats.get("publishedOffers") or 0) > 0, stats
    assert int(stats.get("publishedEvseIds") or 0) > 0, stats
    print(json.dumps({
      "ok":True,
      "publishedOffers":stats.get("publishedOffers"),
      "publishedEvseIds":stats.get("publishedEvseIds"),
      "tileCount":obj.get("tileCount"),
      "nationalFranceIsIdentityHub":True,
      "electroverseDependency":False
    }))

if __name__=="__main__":
    main()
