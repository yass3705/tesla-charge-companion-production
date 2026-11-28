"""Compose a verified, scheduled Production import into an existing preview bundle."""
import argparse
import hashlib
import json
import tempfile
import zipfile
from pathlib import Path
from import_v9_bundle import verify
from package_v9_preproduction_map import ROOT, copy_preview_file

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def compose(base, archive, expected_sha, source_sha, destination):
    destination = destination.resolve()
    if destination == ROOT or ROOT in destination.parents or base.resolve() in (destination, *destination.parents):
        raise ValueError("Use an isolated bundle store outside the checkout and base bundle")
    if sha(archive.read_bytes()) != expected_sha:
        raise ValueError("Production import ZIP digest mismatch")
    manifest = verify(base)
    with zipfile.ZipFile(archive) as z:
        receipt = json.loads(z.read("receipt.json"))
        if receipt["event"] != "schedule" or receipt["published"] is not False or receipt["artifactZipSha256"] != source_sha:
            raise ValueError("Unverified acquisition lineage")
        ref = receipt["bundle"]
        raw = z.read(f"bundles/{ref}/manifest.json")
        if sha(raw) != ref:
            raise ValueError("Scheduled import manifest mismatch")
        imported = json.loads(raw)
        if imported.get("schemaVersion") != 1 or imported.get("state") != "prepared":
            raise ValueError("Incomplete scheduled import")
        incoming = {r["source"]: r for r in imported["sources"]}
        if not incoming or len(incoming) != len(imported["sources"]) or len(incoming) != len(receipt["sources"]):
            raise ValueError("Empty or duplicate imported source")
        if set(incoming) != set(receipt["sources"]) or not set(incoming) <= {r["source"] for r in manifest["sources"]}:
            raise ValueError("Invalid imported source set")
        with tempfile.TemporaryDirectory(dir=destination) as tmp:
            staging = Path(tmp)/"stage"
            staging.mkdir()
            for idx,row in enumerate(manifest["sources"]):
                target = staging/row["path"]
                if row["source"] not in incoming:
                    copy_preview_file(base/row["path"],target)
                    continue
                updated=incoming[row["source"]]
                if updated["path"]!=row["path"]:
                    raise ValueError("Inconsistent source path")
                payload=z.read("production-import/"+row["path"])
                if sha(payload)!=updated["sha256"] or payload!=z.read(f"bundles/{ref}/"+row["path"]):
                    raise ValueError("Imported bytes differ from collected source")
                target.write_bytes(payload)
                manifest["sources"][idx]=updated
            raw=(json.dumps(manifest,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n").encode()
            (staging/"manifest.json").write_bytes(raw)
            pinned=staging.rename(Path(tmp)/sha(raw))
            verify(pinned)
            result=destination/pinned.name
            if result.exists():verify(result)
            else:pinned.rename(result)
    return {"bundleId":result.name,"base":base.name,"scheduledImport":ref,"runId":receipt["runId"],"sources":sorted(incoming)}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    for k in ("base","archive","destination"):p.add_argument("--"+k,type=Path,required=True)
    for k in ("expected-sha","source-sha"):p.add_argument("--"+k,required=True)
    args=p.parse_args()
    print(json.dumps(compose(args.base,args.archive,args.expected_sha,args.source_sha,args.destination)))
