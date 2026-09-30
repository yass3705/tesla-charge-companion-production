#!/usr/bin/env python3
import json
import pathlib
import sys

def main():
    path=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else "config/snapshots/2026-09-30.json")
    cfg=json.loads(path.read_text(encoding="utf-8"))
    sources=cfg["sources"]
    de=next(d for d in cfg["datasets"] if d["id"]=="DE")
    art=de["nationalBaseArtifact"]
    values={
      "snapshot_id":cfg["snapshotId"],
      "stable_repo":sources["stable"]["repo"],
      "stable_sha":sources["stable"]["sha"],
      "datalab_repo":sources["dataLab"]["repo"],
      "datalab_sha":sources["dataLab"]["sha"],
      "germany_recovery_repo":sources["germanyRecovery"]["repo"],
      "germany_recovery_sha":sources["germanyRecovery"]["sha"],
      "germany_artifact_repo":art["repository"],
      "germany_artifact_id":str(art["artifactId"]),
      "germany_artifact_digest":art["digest"],
    }
    for k,v in values.items():
        print(f"{k}={v}")

if __name__=="__main__":
    main()
