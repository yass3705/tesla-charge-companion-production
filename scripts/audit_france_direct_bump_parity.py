#!/usr/bin/env python3
"""Read-only BUMP exact EVSE reconciliation across legacy and direct FR inventory."""
import argparse
import json
from collections import Counter
from pathlib import Path
from build_bump_exact_override import inventory_index, evse_ids

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--offers",required=True)
    parser.add_argument("--inventory",required=True)
    parser.add_argument("--stable-offers",required=True)
    parser.add_argument("--out",required=True)
    a=parser.parse_args()
    payload=json.loads(Path(a.offers).read_text())
    old=json.loads(Path(a.stable_offers).read_text())
    current=inventory_index(Path(a.inventory))
    offer_ids=evse_ids(payload)
    old_ids=evse_ids(old)
    buckets={"exactBump":[],"absent":[],"duplicate":[],"otherOperator":[]}
    for evse in sorted(offer_ids):
        matches=current.get(evse,[])
        if not matches:
            buckets["absent"].append(evse)
        elif len(matches)!=1:
            buckets["duplicate"].append(evse)
        elif matches[0][1].casefold()=="bump" and matches[0][2].casefold()=="bump":
            buckets["exactBump"].append(evse)
        else:
            buckets["otherOperator"].append(evse)
    report={
        "scope":"pinned-legacy-BUMP-offers-vs-direct-DataLab-FR-IRVE",
        "readOnly":True,
        "legacyPricedEvse":len(offer_ids),
        "stablePricedEvse":len(old_ids),
        "counts":{key:len(value) for key,value in buckets.items()},
        "retainedVsStable":len(offer_ids&old_ids),
        "stableNotInOverride":len(old_ids-offer_ids),
        "categories":buckets,
        "safeToReplayLegacyOfferSetUnchanged":len(buckets["absent"])+len(buckets["duplicate"])+len(buckets["otherOperator"])==0,
        "tariffParityCertified":False,
        "productionPromotionAllowed":False
    }
    dest=Path(a.out)
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({k:v for k,v in report.items() if k!="categories"},sort_keys=True))

if __name__=="__main__":
    main()
