#!/usr/bin/env python3
import argparse, json, pathlib

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--base", default="config/snapshots/2026-09-30-r9-electra-fr.json")
    ap.add_argument("--datalab-sha", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--snapshot-id", default=None)
    args=ap.parse_args()
    obj=json.loads(pathlib.Path(args.base).read_text(encoding="utf-8"))
    sha=args.datalab_sha.strip().lower()
    if len(sha)!=40 or any(c not in "0123456789abcdef" for c in sha):
        raise SystemExit("invalid Data Lab SHA")
    obj["snapshotId"]=args.snapshot_id or ("refresh-candidate-"+sha[:12])
    obj["sources"]["dataLab"]["sha"]=sha
    obj["sourceSelection"]["selectedDataLabCommit"]=sha
    obj["sourceSelection"]["reason"]="Explicit SHA-pinned snapshot candidate; never auto-published."
    obj["sourceSelection"]["safeguards"]=list(dict.fromkeys(
      obj["sourceSelection"].get("safeguards",[])+[
        "Ephemeral refresh candidate only; no release or deployment.",
        "All unsupported/unmatched tariffs remain fail closed."
      ]))
    pathlib.Path(args.out).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"snapshotId":obj["snapshotId"],"dataLabSha":sha,"out":args.out}))
if __name__=="__main__":
    main()
