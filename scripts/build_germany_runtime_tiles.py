#!/usr/bin/env python3
import argparse, gzip, hashlib, json, math, pathlib, shutil

def load_gzip(path):
    with gzip.open(path,"rt",encoding="utf-8") as f:
        return json.load(f)

def canonical_bytes(obj):
    return (json.dumps(obj,ensure_ascii=False,separators=(",",":"),sort_keys=True)+"\n").encode("utf-8")

def write_gzip(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    raw=canonical_bytes(obj)
    with open(path,"wb") as fh:
        with gzip.GzipFile(filename="",mode="wb",fileobj=fh,mtime=0,compresslevel=9) as gz:
            gz.write(raw)
    return hashlib.sha256(path.read_bytes()).hexdigest()

def tile_id(lat,lon,size):
    iy=math.floor(lat/size)
    ix=math.floor(lon/size)
    return iy,ix

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("out")
    ap.add_argument("--tile-size",type=float,default=0.5)
    a=ap.parse_args()
    payload=load_gzip(a.input)
    sites=payload.get("sites") or []
    out=pathlib.Path(a.out)
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True)
    buckets={}
    skipped=0
    for site in sites:
        co=site.get("coordinates") or {}
        try:
            lat=float(co["latitude"]); lon=float(co["longitude"])
        except (KeyError,TypeError,ValueError):
            skipped+=1; continue
        iy,ix=tile_id(lat,lon,a.tile_size)
        buckets.setdefault((iy,ix),[]).append(site)
    tiles=[]
    for (iy,ix),rows in sorted(buckets.items()):
        name=f"t_{iy}_{ix}.json.gz"
        path=out/name
        sha=write_gzip(path,rows)
        tiles.append({
          "id":f"t_{iy}_{ix}","file":name,
          "minLat":iy*a.tile_size,"maxLat":(iy+1)*a.tile_size,
          "minLon":ix*a.tile_size,"maxLon":(ix+1)*a.tile_size,
          "count":len(rows),"bytes":path.stat().st_size,"sha256":sha
        })
    manifest={
      "schemaVersion":1,
      "dataset":"germany-production-runtime-tiles-r8",
      "countryCode":"DE",
      "tileSizeDegrees":a.tile_size,
      "stationCount":len(sites),
      "tiledStationCount":sum(t["count"] for t in tiles),
      "skippedWithoutCoordinates":skipped,
      "tileCount":len(tiles),
      "tiles":tiles
    }
    (out/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    assert manifest["tiledStationCount"]+skipped==len(sites)
    print(json.dumps({k:manifest[k] for k in ("stationCount","tiledStationCount","skippedWithoutCoordinates","tileCount")}))

if __name__=="__main__":
    main()
