"""Prepare an isolated Production FX input from a verified Data Lab handoff."""
import argparse
import json
from pathlib import Path
import re
import shutil
import tempfile

from v9_rebuild.fx import META, RATES
from v9_rebuild.orchestrator import artifact_digest, sha256, validated_dependency


def build(collection, out, provenance):
    if (provenance.get("sourceId") != "GL:fx" or provenance.get("event") != "schedule"
            or provenance.get("runBranch") != "main" or provenance.get("workflowId") != 425938005
            or provenance.get("technicalValidation") != "PASS"
            or provenance.get("jobConclusion") != "success"
            or not re.fullmatch(r"[a-f0-9]{64}", provenance.get("artifactZipSha256", ""))):
        raise ValueError("Verified scheduled FX receipt required")
    if out.exists() or collection.is_symlink() or any(path.is_symlink() for path in collection.rglob("*")):
        raise ValueError("Isolated FX input and new destination required")
    manifest = json.loads((collection / "manifest.json").read_bytes())
    if manifest.get("schema_version") != 1 or manifest.get("status") != "complete" or len(manifest["sources"]) != 1:
        raise ValueError("Complete FX collection required")
    state = validated_dependency(collection, "GL:fx", "fx")
    digest, files = artifact_digest(state)
    if (digest, files) != (provenance.get("artifactSetSha256"), provenance.get("files")):
        raise ValueError("FX collection differs from verified receipt")
    rates_sha256 = sha256(state / RATES)
    rates_date = json.loads((state / RATES).read_bytes())["date"]
    receipt = {
        "runId": provenance["runId"],
        "artifactId": provenance["artifactId"],
        "sourceArtifactSetSha256": digest,
        "ratesSha256": rates_sha256,
        "ratesDate": rates_date,
        "published": False,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as temp:
        stage = Path(temp) / "fx-input"
        stage.mkdir()
        for source in (RATES, META):
            shutil.copyfile(state / source, stage / source.name)
        (stage / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        stage.rename(out)
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.collection, args.out, json.loads(args.provenance.read_bytes()))))
