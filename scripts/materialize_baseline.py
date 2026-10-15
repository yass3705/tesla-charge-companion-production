#!/usr/bin/env python3
"""Verify and materialize an immutable public V9 input archive from Data Lab."""

import argparse
import hashlib
import json
import pathlib
import shutil
import tarfile


def sha256(path):
    h = hashlib.sha256()
    with pathlib.Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load(bundle, archive_sha, manifest_sha, source_sha):
    bundle = pathlib.Path(bundle)
    manifest_path = bundle / "manifest.json"
    archive = bundle / "runtime-baseline.tar.gz"
    if sha256(manifest_path) != manifest_sha or sha256(archive) != archive_sha:
        raise ValueError("Pinned V9 baseline SHA256 mismatch")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest.get("mode") != "preserved_public_v9_runtime_baseline"
            or manifest.get("sourceSha") != source_sha
            or manifest.get("archiveSha256") != archive_sha):
        raise ValueError("V9 baseline source provenance mismatch")
    files = manifest.get("files")
    if not isinstance(files, dict) or len(files) != manifest.get("fileCount") or len(files) < 1200:
        raise ValueError("V9 baseline file inventory incomplete")
    return archive, manifest


def safe_name(value):
    path = pathlib.PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ValueError(f"Unsafe V9 baseline path: {value}")
    return path


def materialize(bundle, out, archive_sha, manifest_sha, source_sha):
    archive, manifest = load(bundle, archive_sha, manifest_sha, source_sha)
    out = pathlib.Path(out)
    if out.exists():
        raise FileExistsError("V9 baseline target already exists")
    out.mkdir(parents=True)
    seen = set()
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            relative = safe_name(member.name)
            if member.isdir():
                continue
            if not member.isfile() or member.name in seen or member.name not in manifest["files"]:
                raise ValueError(f"Unexpected V9 baseline entry: {member.name}")
            destination = out.joinpath(*relative.parts)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tar.extractfile(member) as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)
            expected = manifest["files"][member.name]
            if destination.stat().st_size != expected["bytes"] or sha256(destination) != expected["sha256"]:
                raise ValueError(f"V9 baseline entry hash mismatch: {member.name}")
            seen.add(member.name)
    if seen != set(manifest["files"]):
        raise ValueError("V9 baseline archive is missing inventoried files")
    return {"sourceSha": source_sha, "archiveSha256": archive_sha, "fileCount": len(seen)}


def verify_materialized(bundle, out, archive_sha, manifest_sha, source_sha):
    _, manifest = load(bundle, archive_sha, manifest_sha, source_sha)
    out = pathlib.Path(out)
    actual = {str(path.relative_to(out)) for path in out.rglob("*") if path.is_file()}
    if actual != set(manifest["files"]):
        raise ValueError("V9 baseline materialized file set mismatch")
    for name, expected in manifest["files"].items():
        path = out.joinpath(*safe_name(name).parts)
        if path.stat().st_size != expected["bytes"] or sha256(path) != expected["sha256"]:
            raise ValueError(f"V9 baseline materialized file changed: {name}")
    return {"sourceSha": source_sha, "archiveSha256": archive_sha, "fileCount": len(actual)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=pathlib.Path)
    parser.add_argument("out", type=pathlib.Path)
    parser.add_argument("--archive-sha", required=True)
    parser.add_argument("--manifest-sha", required=True)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    print(json.dumps(materialize(args.bundle, args.out, args.archive_sha, args.manifest_sha, args.source_sha), sort_keys=True))


if __name__ == "__main__":
    main()
