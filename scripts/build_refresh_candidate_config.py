#!/usr/bin/env python3
import argparse, json, pathlib

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--base", default="config/snapshots/2026-09-30-r9-electra-fr.json")
    ap.add_argument("--datalab-sha", required=True)
    ap.add_argument("--stable-sha")
    ap.add_argument("--use-stable-tesla-data", action="store_true")
    ap.add_argument("--out", required=True)
    ap.add_argument("--snapshot-id", default=None)
    ap.add_argument("--use-datalab-tesla", action="store_true")
    ap.add_argument("--use-datalab-nl", action="store_true")
    args=ap.parse_args()
    obj=json.loads(pathlib.Path(args.base).read_text(encoding="utf-8"))
    sha=args.datalab_sha.strip().lower()
    if len(sha)!=40 or any(c not in "0123456789abcdef" for c in sha):
        raise SystemExit("invalid Data Lab SHA")
    obj["snapshotId"]=args.snapshot_id or ("refresh-candidate-"+sha[:12])
    obj["sources"]["dataLab"]["sha"]=sha
    if args.stable_sha:
        stable_sha=args.stable_sha.strip().lower()
        if len(stable_sha)!=40 or any(c not in "0123456789abcdef" for c in stable_sha):
            raise SystemExit("invalid Stable SHA")
        obj["sources"]["stable"]["sha"]=stable_sha
    obj["sourceSelection"]["selectedDataLabCommit"]=sha
    if args.use_datalab_tesla and args.use_stable_tesla_data:
        raise SystemExit("select exactly one Tesla source")
    if args.use_stable_tesla_data:
        tesla=next((d for d in obj.get("datasets",[]) if d.get("id")=="TESLA"),None)
        if not tesla:
            raise SystemExit("TESLA dataset missing from base snapshot config")
        tesla["primarySource"]="stable"
        tesla["path"]="data/tesla_stations.json"
        tesla.pop("metadata",None)
    if args.use_datalab_tesla:
        tesla=next((d for d in obj.get("datasets",[]) if d.get("id")=="TESLA"),None)
        if not tesla:
            raise SystemExit("TESLA dataset missing from base snapshot config")
        tesla["primarySource"]="dataLab"
        tesla["path"]="data/suc-tracker/tesla_stations.json"
        tesla["metadata"]="data/suc-tracker/metadata.json"
    if args.use_datalab_nl:
        nl=next((d for d in obj.get("datasets",[]) if d.get("id")=="NL"),None)
        if not nl:
            raise SystemExit("NL dataset missing from base snapshot config")
        nl["primarySource"]="dataLab"
        nl["path"]="data/national/netherlands_dotnl/runtime"
        nl["coverage"]="complete"
        nl["manifest"]="data/national/netherlands_dotnl/runtime/manifest.json"
    obj["sourceSelection"]["reason"]="Explicit SHA-pinned preview candidate; deployment requires validation." if args.use_stable_tesla_data else "Explicit SHA-pinned snapshot candidate; never auto-published."
    obj["sourceSelection"]["safeguards"]=list(dict.fromkeys(
      obj["sourceSelection"].get("safeguards",[])+[
        "Ephemeral refresh candidate only; no release or deployment." if not args.use_stable_tesla_data else "Preview deployment only; no production release.",
        *(["Tesla Mac catalogue comes from the pinned Stable data/tesla_stations.json; SuC Tracker remains comparison evidence."] if args.use_stable_tesla_data else []),
        "All unsupported/unmatched tariffs remain fail closed.",
        *(["Tesla catalogue comes from the same pinned Data Lab SHA via SuC Tracker."] if args.use_datalab_tesla else []),
        *(["NL national runtime comes from the DOT-NL Data Lab snapshot; Tesla is excluded and unresolved tariffs remain fail-closed."] if args.use_datalab_nl else [])
      ]))
    pathlib.Path(args.out).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"snapshotId":obj["snapshotId"],"dataLabSha":sha,"out":args.out}))
if __name__=="__main__":
    main()
