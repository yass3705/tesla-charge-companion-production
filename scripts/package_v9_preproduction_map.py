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
import math
import re
import shutil
import tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def check_candidate(candidate: Path) -> dict:
    index = json.loads((candidate / "index.json").read_bytes())
    if index.get("schemaVersion") not in {1, 2} or index.get("status") not in {"prepared", "partial_failure"}:
        raise ValueError("Prepared candidate index is invalid")
    if not re.fullmatch(r"[a-f0-9]{64}", str(index.get("bundleId", ""))):
        raise ValueError("Prepared bundle identity is invalid")
    sources = index.get("sources")
    if not isinstance(sources, list) or not sources or not isinstance(index.get("rejected"), list):
        raise ValueError("Prepared candidate source listing is invalid")
    if index["status"] == "partial_failure" and not index["rejected"]:
        raise ValueError("Incomplete candidate lacks rejection diagnostics")
    seen = set()
    declared = {"index.json"}
    for entry in sources:
        source = entry.get("source")
        if not isinstance(source, str) or len(source.split(":")) != 2:
            raise ValueError("Prepared source identity missing")
        country, code = source.split(":")
        if not (len(country) == 2 and country.isupper() and code.replace("_", "").isalnum()
                and code.lower() == code and source not in seen):
            raise ValueError("Prepared source identity invalid")
        seen.add(source)
        if index["schemaVersion"] == 1:
            relative = Path("sources") / (source.replace(":", "__") + ".json")
            if entry.get("path") != relative.as_posix():
                raise ValueError("Prepared source path mismatch")
            declared.add(relative.as_posix())
            payload = (candidate / relative).read_bytes()
            if digest(payload) != entry.get("sha256"):
                raise ValueError("Prepared source SHA mismatch")
            data = json.loads(payload)
            if data.get("schemaVersion") != 1 or data.get("source", {}).get("id") != source:
                raise ValueError("Prepared source provenance mismatch")
        else:
            if (not re.fullmatch(r"[a-f0-9]{64}", str(entry.get("sourceSha256", ""))) or
                    not re.fullmatch(r"[a-f0-9]{64}", str(entry.get("sourceArtifactSha256", ""))) or
                    not isinstance(entry.get("shards"), list) or not entry["shards"]):
                raise ValueError("Prepared shard source descriptor invalid")
            station_ids = set()
            for number, shard in enumerate(entry["shards"]):
                relative = Path("shards") / f"{source.replace(':', '__')}__{number:04d}.json"
                if (shard.get("path") != relative.as_posix() or
                        not re.fullmatch(r"[a-f0-9]{64}", str(shard.get("sha256", ""))) or
                        not isinstance(shard.get("bytes"), int) or not 0 < shard["bytes"] <= 8_000_000 or
                        not isinstance(shard.get("stationCount"), int) or shard["stationCount"] < 1):
                    raise ValueError("Prepared shard descriptor invalid")
                declared.add(relative.as_posix())
                raw = (candidate / relative).read_bytes()
                if len(raw) != shard["bytes"] or digest(raw) != shard["sha256"]:
                    raise ValueError("Prepared shard SHA or length mismatch")
                data = json.loads(raw)
                if (data.get("schemaVersion") != 1 or data.get("source", {}).get("id") != source or
                        data["source"].get("artifactSha256") != entry["sourceArtifactSha256"] or
                        not isinstance(data.get("stations"), list) or
                        len(data["stations"]) != shard["stationCount"]):
                    raise ValueError("Prepared shard provenance or station count invalid")
                ids = [row.get("id") for row in data["stations"]]
                if len(ids) != len(set(ids)) or station_ids.intersection(ids):
                    raise ValueError("Prepared shard station identity collision")
                station_ids.update(ids)
                bbox = shard.get("bbox")
                if bbox is not None and (not isinstance(bbox, list) or len(bbox) != 4 or
                                         not all(isinstance(value, (int, float)) for value in bbox) or
                                         bbox[0] > bbox[2] or bbox[1] > bbox[3]):
                    raise ValueError("Prepared shard bounding box invalid")
                if bbox is not None and any(
                    not isinstance(row.get("latitude"), (int, float)) or
                    not isinstance(row.get("longitude"), (int, float)) or
                    not math.isfinite(row["latitude"]) or not math.isfinite(row["longitude"]) or
                    not bbox[0] <= row["latitude"] <= bbox[2] or
                    not bbox[1] <= row["longitude"] <= bbox[3]
                    for row in data["stations"]
                ):
                    raise ValueError("Prepared shard bounding box omits a station")
    joins = index.get("joins", [])
    if not isinstance(joins, list):
        raise ValueError("Prepared join listing invalid")
    for entry in joins:
        national = entry.get("nationalSource")
        relative = Path("joins") / (str(national).replace(":", "__") + ".json")
        declared.add(relative.as_posix())
        if (national not in seen or entry.get("path") != relative.as_posix() or
                entry.get("status") != "exact_identity_only" or
                not re.fullmatch(r"[a-f0-9]{64}", str(entry.get("sha256", "")))):
            raise ValueError("Prepared exact join descriptor invalid")
        raw = (candidate / relative).read_bytes()
        if digest(raw) != entry["sha256"]:
            raise ValueError("Prepared exact join SHA mismatch")
        report = json.loads(raw)
        if (report.get("schemaVersion") != 1 or report.get("candidateBundleId") != index["bundleId"] or
                report.get("nationalSource") != national or
                not isinstance(report.get("matches"), list) or not isinstance(report.get("unmatched"), list) or
                report.get("statistics", {}).get("matchedOfferCount") != len(report["matches"]) or
                report.get("statistics", {}).get("unmatchedOfferCount") != len(report["unmatched"])):
            raise ValueError("Prepared exact join report invalid")
        expected = {row["source"]: row["sha256" if index["schemaVersion"] == 1 else "sourceSha256"]
                    for row in sources if row["source"].startswith(national[:2] + ":")}
        observed = {row.get("source"): row.get("sha256") for row in report.get("sourceInputs", [])}
        if observed != expected or len(report["sourceInputs"]) != len(expected):
            raise ValueError("Prepared exact join provenance mismatch")
    actual = {path.relative_to(candidate).as_posix() for path in candidate.rglob("*") if path.is_file()}
    if actual != declared:
        raise ValueError("Prepared candidate file set mismatch")
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
        # Build inputs are retained in the immutable source bundle, not served
        # to preview visitors. The runtime keeps its own required data files.
        if (stage / "snapshot-inputs").is_dir():
            shutil.rmtree(stage / "snapshot-inputs")
        shutil.copytree(candidate, stage / "prepared-v9")
        assets = stage / runtime / "assets/v9"
        for source, target in (
            ("runtime-owned/assets/v9/adapters/canonical-v9.js", "adapters/canonical-v9.js"),
            ("runtime-owned/assets/v9/preproduction-candidate-loader.js", "preproduction-candidate-loader.js"),
            ("runtime-owned/assets/v9/data-engine.js", "data-engine.js"),
            ("runtime-overrides/assets/v9/map-price-engine.js", "map-price-engine.js"),
            ("runtime-overrides/assets/v9/adapters/uk-open-feeds.js", "adapters/uk-open-feeds.js"),
        ):
            output = assets / target
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / source, output)
        shutil.copy2(ROOT / "v9-production-shell/index.html", stage / "v9-production-shell/index.html")
        shutil.copy2(ROOT / "v9-production-shell/bridge.js", stage / "v9-production-shell/bridge.js")
        config.update({
            "preproductionCandidateBase": "../prepared-v9",
            "preproductionIsolated": True,
            "preparedBundleId": index["bundleId"],
            "preparedIndexSha256": digest((candidate / "index.json").read_bytes()),
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
