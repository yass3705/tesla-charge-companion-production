"""Download a successful IONITY job from the reviewed default-branch workflow."""
import hashlib
import io
import json
import stat
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath

REPOSITORY = "yass3705/tesla-charge-companion-data-lab"


def api(path):
    return subprocess.check_output(["gh", "api", f"repos/{REPOSITORY}/" + path])


def download(run_id, out):
    if not run_id.isdecimal() or out.exists():
        raise ValueError("Expected run ID and unused destination")
    run = json.loads(api(f"actions/runs/{run_id}"))
    jobs = json.loads(api(f"actions/runs/{run_id}/jobs?per_page=100"))["jobs"]
    if (run["repository"]["full_name"] != REPOSITORY or run["head_branch"] != "main"
            or run["workflow_id"] != 425938005 or run["path"] != ".github/workflows/v9-scheduled.yml"
            or run["event"] not in ("workflow_dispatch", "schedule")
            or len([j for j in jobs if j["name"] == "collect (FR:ionity_direct_family, FR_ionity_direct_family)"
                    and j["status"] == "completed" and j["conclusion"] == "success"]) != 1):
        raise ValueError("No trusted successful source job")
    artifacts = json.loads(api(f"actions/runs/{run_id}/artifacts?per_page=100"))["artifacts"]
    matches = [a for a in artifacts if a["name"] == "tcc-v9-collection-FR_ionity_direct_family" and not a["expired"]]
    if len(matches) != 1:
        raise ValueError("Unique collection artifact required")
    a = matches[0]
    parent = a["workflow_run"]
    if parent["id"] != int(run_id) or parent["head_sha"] != run["head_sha"] or parent["head_branch"] != "main":
        raise ValueError("Artifact origin mismatch")
    raw = api(f"actions/artifacts/{a['id']}/zip")
    digest = hashlib.sha256(raw).hexdigest()
    if a["digest"] != "sha256:" + digest or a["size_in_bytes"] != len(raw):
        raise ValueError("Downloaded collection ZIP integrity mismatch")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        seen = set()
        for f in archive.infolist():
            name = PurePosixPath(f.filename)
            if name.is_absolute() or ".." in name.parts or name in seen or stat.S_ISLNK(f.external_attr >> 16):
                raise ValueError("Unsafe collection ZIP")
            seen.add(name)
        archive.extractall(out / "collection")
    receipt = dict(runId=int(run_id), workflowId=run["workflow_id"], head=run["head_sha"],
                   event=run["event"], artifactId=a["id"], artifactZipSha256=digest)
    (out / "provenance.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    download(sys.argv[1], Path(sys.argv[2]))
