#!/usr/bin/env python3
"""Package a PREVIEW-ONLY TCC V9 map shell with verified prepared canonical data.

Reads an already-built shell and an isolated prepared candidate. Writes a NEW
static site outside the Production checkout; never changes published assets.
Run via local http://localhost (WebCrypto requires a secure context).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def check_candidate(candidate: Path) -> dict:
    index = json.loads((candidate / "index.json").read_bytes())
    if index.get("schemaVersion") != 1 or index.get("status") not in {"prepared", "partial_failure"}:
        raise ValueError("Prepared candidate index is invalid")
    sources = index.get("sources")
    if not isinstance(sources, list) or not sources or not isinstance(index.get("rejected"), list):
        raise ValueError("Prepared candidate source listing is invalid")
    if index["status"] == "partial_failure" and not index["rejected"]:
        raise ValueError("Incomplete candidate lacks rejection diagnostics")
    seen = set()
    for entry in sources:
        source = entry.get("source")
        if not isinstance(source, str) or len(source.split(":")) != 2:
            raise ValueError("Prepared source identity missing")
        country, code = source.split(":")
        if not (len(country) == 2 and country.isupper() and code.replace("_", "").isalnum()
                and code.lower() == code and source not in seen):
            raise ValueError("Prepared source identity invalid")
        seen.add(source)
        relative = Path("sources") / (source.replace(":", "__") + ".json")
        if entry.get("path") != relative.as_posix():
            raise ValueError("Prepared source path mismatch")
        payload = (candidate / relative).read_bytes()
        if digest(payload) != entry.get("sha256"):
            raise ValueError("Prepared source SHA mismatch")
        data = json.loads(payload)
        if data.get("schemaVersion") != 1 or data.get("source", {}).get("id") != source:
            raise ValueError("Prepared source provenance mismatch")
    return index


def package(site: Path, candidate: Path, destination: Path) -> dict:
    site, candidate, destination = site.resolve(), candidate.resolve(), destination.resolve()
    if (destination.exists() or destination == ROOT or ROOT in destination.parents or
            destination == site or site in destination.parents or
            destination == candidate or candidate in destination.parents):
        raise ValueError("Output must be a NEW directory outside checkout, source site and candidate")
    if not (site / "index.html").is_file():
        raise ValueError("Built site entry point missing")
    shell = site / "v9-production-shell"
    config = json.loads((shell / "shell-config.json").read_bytes())
    if config.get("schemaVersion") != 1 or config.get("mode") != "candidate":
        raise ValueError("Candidate shell config required")
    runtime = PurePosixPath(config.get("runtimeBase") or "")
    if not runtime.parts or runtime.is_absolute() or ".." in runtime.parts:
        raise ValueError("Runtime path is unsafe")
    if not (site / runtime / "assets/v9/runtime-engine.js").is_file():
        raise ValueError("Built runtime required")
    index = check_candidate(candidate)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tcc-v9-isolated-", dir=destination.parent) as tmp:
        stage = Path(tmp) / "site"
        shutil.copytree(site, stage)
        shutil.copytree(candidate, stage / "prepared-v9")
        assets = stage / runtime / "assets/v9"
        for source, target in (
            ("runtime-owned/assets/v9/adapters/canonical-v9.js", "adapters/canonical-v9.js"),
            ("runtime-owned/assets/v9/preproduction-candidate-loader.js", "preproduction-candidate-loader.js"),
            ("runtime-owned/assets/v9/data-engine.js", "data-engine.js"),
            ("runtime-overrides/assets/v9/map-price-engine.js", "map-price-engine.js"),
        ):
            output = assets / target
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / source, output)
        shutil.copy2(ROOT / "v9-production-shell/index.html", stage / "v9-production-shell/index.html")
        shutil.copy2(ROOT / "v9-production-shell/bridge.js", stage / "v9-production-shell/bridge.js")
        config.update({
            "preproductionCandidateBase": "../prepared-v9",
            "preproductionIsolated": True,
            "engineScopeCountries": sorted({entry["source"][:2] for entry in index["sources"]}),
            "fallback": "fail-closed",
        })
        (stage / "v9-production-shell/shell-config.json").write_text(
            json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        stage.rename(destination)
    return {"status": "packaged_preview_only", "output": str(destination), 
            "countries": config["engineScopeCountries"],"sourceCount": len(index["sources"]),
            "candidateStatus": index["status"],"notPublished": True}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, required=True, help="Existing BUILT TCC shell directory")
    parser.add_argument("--prepared", type=Path, required=True, help="Isolated prepared data/index.json directory")
    parser.add_argument("--out", type=Path, required=True, help="NEW directory OUTSIDE Production checkout")
    args = parser.parse_args()
    print(json.dumps(package(args.site, args.prepared, args.out), ensure_ascii=False))


if __name__ == "__main__":
    main()
