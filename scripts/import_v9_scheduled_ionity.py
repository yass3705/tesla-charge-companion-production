"""Import the four IONITY files from a validated, immutable Data Lab collection."""
import argparse
import hashlib
import json
import tempfile
from pathlib import Path

from import_v9_bundle import import_source
from v9_rebuild.canonical import normalize_ionity, validate
from v9_rebuild.ionity import COUNTRIES, output_path, validate_output
from v9_rebuild.orchestrator import artifact_digest, safe_relative, sha256
from v9_rebuild.snapshot import prepare


def build(collection, out, provenance):
    if out.exists() or any(p.is_symlink() for p in collection.rglob("*")):
        raise ValueError("Isolated input and new destination required")
    manifest = json.loads((collection / "manifest.json").read_bytes())
    if manifest.get("status") != "complete" or manifest.get("schema_version") != 1 or len(manifest["sources"]) != 1:
        raise ValueError("Complete single source collection required")
    row = manifest["sources"][0]
    relative = safe_relative(row["artifact"])
    if (row["source"] != "FR:ionity_direct_family" or row["status"] != "ok"
            or relative.parts[:2] != ("objects", "FR_ionity_direct_family")
            or relative.parts[2] != row["artifact_set_sha256"]
            or sha256(collection / relative) != row["sha256"]):
        raise ValueError("Wrong source or object")
    state = collection.joinpath(*relative.parts[:3])
    if artifact_digest(state) != (row["artifact_set_sha256"], row["files"]):
        raise ValueError("Input file manifest mismatch")
    countries = validate_output(state)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as temp:
        stage = Path(temp)
        product = stage / "snapshot"
        canonical = {}
        for country in COUNTRIES:
            raw = (state / output_path(country)).read_bytes()
            data = normalize_ionity(countries[country], artifact_sha256=hashlib.sha256(raw).hexdigest())
            validate(data)
            path = stage / (country + ".json")
            path.write_text(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n")
            canonical[data["source"]["id"]] = path
        bundle = prepare(canonical, product / "bundles")
        for source in canonical:
            import_source(bundle, source, product / "production-import")
        receipt = dict(provenance, bundle=bundle.name, sourceArtifactSetSha256=row["artifact_set_sha256"],
                       sources=sorted(canonical), published=False)
        (product / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
        product.rename(out)
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.collection, args.out, json.loads(args.provenance.read_bytes()))))
