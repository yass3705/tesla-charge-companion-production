#!/usr/bin/env python3
"""Build a Production-ready France IRVE static bundle directly from Data Lab."""
import argparse, gzip, hashlib, json, pathlib, shutil
p=argparse.ArgumentParser()
p.add_argument("--datalab",type=pathlib.Path,required=True)
p.add_argument("--output",type=pathlib.Path,required=True)
a=p.parse_args()
source=a.datalab/"data/national/france-irve-static-v9"
manifest=json.loads((source/"manifest.json").read_text())
def verify(path, expected):
    if hashlib.sha256(path.read_bytes()).hexdigest()!=expected:
        raise SystemExit("SHA256 mismatch: "+str(path))
verify(source/manifest["allFile"],manifest["allSha256"])
with gzip.open(source/manifest["allFile"],"rt") as f: rows=json.load(f)
if len(rows)!=manifest["stationCount"]: raise SystemExit("Station count mismatch")
tiles=[]
for t in manifest["tiles"]:
    path=source/t["file"]
    verify(path,t["sha256"])
    with gzip.open(path,"rt") as f: tile_rows=json.load(f)
    if len(tile_rows)!=t["count"]: raise SystemExit("Tile count mismatch")
    tiles.append({**t,"file":pathlib.Path(t["file"]).name})
out=a.output
(out/"tiles").mkdir(parents=True,exist_ok=True)
shutil.copy2(source/manifest["allFile"],out/"all.json.gz")
for t in manifest["tiles"]:
    name=pathlib.Path(t["file"]).name
    shutil.copy2(source/t["file"],out/"tiles"/name)
    shutil.copy2(source/t["file"],out/name)
published={**manifest,"tiles":tiles}
(out/"manifest.json").write_text(json.dumps(published,ensure_ascii=False,separators=(",",":"))+"\n")
print(json.dumps({"source":"Data Lab","stationCount":manifest["stationCount"],
                  "pdcCount":manifest.get("pdcCount"),"tileCount":len(tiles),
                  "sourceSha256":manifest.get("sourceSha256")},indent=2))
