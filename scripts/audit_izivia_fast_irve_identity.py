#!/usr/bin/env python3
"""Audit exact IRVE FAST station IDs and power/kind concordance, no writes to source."""
import gzip
import json
import sys
from collections import Counter
from pathlib import Path

root=Path(sys.argv[1])
with gzip.open(root/"runtime/data/v9/france-static/all.json.gz","rt",encoding="utf-8") as f:
    national=json.load(f)
if isinstance(national,dict):
    print("FR IRVE source keys",sorted(national.keys()))
    stations=national.get("stations") or national.get("locations") or national.get("items") or []
else:stations=national
print("FR IRVE national rows",len(stations))
print("FR IRVE sample",json.dumps(stations[0] if stations else {},ensure_ascii=False)[:1700])
inv=json.loads((root/"snapshot-inputs/FR/direct/izivia_fast_inventory_evidence.json").read_text())
idx={str(s[0]):s for s in stations if isinstance(s,list) and len(s)>=9}
print("Compact IRVE station records",len(idx))
print("FR IRVE FAST exact IDs",sum(x["sourceStationId"] in idx for x in inv["stations"]))
matches=0;discordant=[]
for row in inv["stations"]:
    n=idx.get(row["sourceStationId"])
    if not n:
        discordant.append({"stationId":row["sourceStationId"],"reason":"absent_from_pinned_irve"})
        continue
    source={(c.get("kind"),round(float(c.get("powerKw") or 0),1))
            for e in row["evses"] if "chademo" not in e.get("id","").lower()
            for c in e.get("connectors",[])}
    actual={(str(e[2]).upper(),round(float(e[3] or 0),1))
            for e in n[8] if isinstance(e,list) and len(e)>3}
    if source.intersection(actual):matches+=1
    else:discordant.append({"stationId":row["sourceStationId"],"reason":"kind_power_discordance",
                            "official":sorted(map(str,source)),"irve":sorted(map(str,actual))})
print("FR IZIVIA FAST exact kind-power matches",matches)
print("FR IZIVIA FAST sample conflicts",json.dumps(discordant[:12],ensure_ascii=False))
