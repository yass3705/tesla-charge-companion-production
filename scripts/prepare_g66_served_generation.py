"""Prepare a full immutable bundle with the audited French national generation.
Only the canonical national catalogue enters the bundle. Private audit inputs stay outside it.
"""
import argparse
import gzip
import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

from import_v9_bundle import verify

MANIFEST_SHA = "cc8f947aaf9946a9c08e650d43f186a3f55816418f2a18b740adc1ad1f667bd4"
SOURCE = "FR:irve_static"


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def prepare(base, restored, directory):
    base, restored, directory = (p.resolve() for p in (base, restored, directory))
    checkout = Path(__file__).resolve().parents[1]
    if directory == checkout or checkout in directory.parents:
        raise ValueError("Use isolated storage")
    manifest_bytes = (restored / "manifest.json").read_bytes()
    if digest(manifest_bytes) != MANIFEST_SHA:
        raise ValueError("Unexpected recovery generation")
    sources = {r["artifact"]: r for r in json.loads(manifest_bytes)["artifacts"]}
    archive = restored / "15137656729.zip"
    if digest(archive.read_bytes()) != sources[15137656729]["zipSha256"]:
        raise ValueError("National alignment artifact mismatch")
    with zipfile.ZipFile(archive) as z:
        report = json.loads(z.read("g66b2-report.json"))
        signed_manifest = z.read("g66b2-bundle-manifest.json")
        if digest(signed_manifest) != report["bundleId"]:
            raise ValueError("National manifest mismatch")
        entry, = json.loads(signed_manifest)["sources"]
        raw = gzip.decompress(z.read("g66b2-national-active-canonical.json.gz")) + b"\n"
        if entry["source"] != SOURCE or digest(raw) != entry["sha256"] or entry["sha256"] != report["nationalCanonicalSha256"]:
            raise ValueError("Canonical bytes differ from audited generation")
    manifest = verify(base)
    original, = [r for r in manifest["sources"] if r["source"] == SOURCE]
    if original["path"] != entry["path"]:
        raise ValueError("National source path changed")
    manifest["sources"] = [entry if r is original else r for r in manifest["sources"]]
    encoded = (json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":"))+"\n").encode()
    directory.mkdir(parents=True, exist_ok=True)
    bundle = directory / digest(encoded)
    if not bundle.exists():
        with tempfile.TemporaryDirectory(dir=directory) as tmp:
            stage = Path(tmp) / bundle.name
            stage.mkdir()
            for row in manifest["sources"]:
                target = stage / row["path"]
                if row["source"] == SOURCE:
                    target.write_bytes(raw)
                else:
                    shutil.copyfile(base / row["path"], target)
            (stage / "manifest.json").write_bytes(encoded)
            verify(stage)
            stage.rename(bundle)
    else:
        verify(bundle)
    return dict(bundleId=bundle.name, previous=base.name, nationalSha256=entry["sha256"],
                privateRecoveryManifestSha256=MANIFEST_SHA, alignmentArtifact=15137656729,
                ledgerArtifact=15059529583, ledgerZipSha256=sources[15059529583]["zipSha256"],
                crosswalkSha256=report["exportSha256"]["g66b2-november-crosswalk.json.gz"],
                otherSourcesPreserved=len(manifest["sources"])-1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    for arg in ("base", "restored", "directory"):
        parser.add_argument("--"+arg, required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(prepare(args.base, args.restored, args.directory)))
