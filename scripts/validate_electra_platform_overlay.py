#!/usr/bin/env python3
import gzip, hashlib, json, pathlib, sys

def main():
    root=pathlib.Path(sys.argv[1])
    manifest=root/"data/platforms/electra/france/manifest.json"
    if not manifest.exists():
        raise SystemExit("Electra platform overlay missing")
    obj=json.loads(manifest.read_text(encoding="utf-8"))
    policy=obj.get("policy") or {}
    stats=obj.get("stats") or {}
    assert policy.get("nationalFranceIsIdentityHub") is True, policy
    if policy.get("exactNationalEvseOnly") is not True:
        assert set(policy.get("acceptedIdentityModes") or []) == {
            "exact_national_irve_evse", "curated_irve_location"
        }, policy
        assert policy.get("curatedMatchRequiresValidatedDistanceNameAddressPowerAndConnectorEvidence") is True, policy
    assert policy.get("electroverseDependency") is False, policy
    assert policy.get("heterogeneousLocationTariffsFailClosed") is True, policy
    assert policy.get("unsupportedComponentsFailClosed") is True, policy
    assert int(stats.get("publishedOffers") or 0) > 0, stats
    assert int(stats.get("publishedEvseIds") or 0) > 0, stats
    tiles=obj.get("tiles") or []
    assert len(tiles)==int(obj.get("tileCount") or 0), (len(tiles),obj.get("tileCount"))
    counted=0
    for tile in tiles:
        p=manifest.parent/tile["file"]
        raw=p.read_bytes()
        assert hashlib.sha256(raw).hexdigest()==tile["sha256"], tile["file"]
        assert len(raw)==int(tile["bytes"]), tile["file"]
        payload=json.loads(gzip.decompress(raw).decode("utf-8"))
        offers=payload.get("emspOffers") or []
        assert len(offers)==int(tile["count"]), tile["file"]
        for offer in offers:
            assert offer.get("provider")=="Electra", offer.get("provider")
            assert offer.get("evseIds"), offer.get("id")
            serialized=json.dumps(offer,ensure_ascii=False).lower()
            assert "electroverse" not in serialized, offer.get("id")
        counted+=len(offers)
    assert counted==int(stats.get("publishedOffers") or 0), (counted,stats.get("publishedOffers"))
    print(json.dumps({
      "ok":True,
      "publishedOffers":stats.get("publishedOffers"),
      "publishedEvseIds":stats.get("publishedEvseIds"),
      "tileCount":obj.get("tileCount"),
      "verifiedShardOffers":counted,
      "nationalFranceIsIdentityHub":True,
      "electroverseDependency":False
    }))

if __name__=="__main__":
    main()
