#!/usr/bin/env python3
"""Rebuild the isolated V9 candidate from the two versioned repositories.

The final directory appears only after source, exact-join, import and package
validation. Data Lab Actions and the published TCC site are never touched.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(*command: object) -> dict:
    done = subprocess.run([str(part) for part in command], check=True, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        return json.loads(done.stdout)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid builder result: {command[1]}") from exc


def build(datalab: Path, built_site: Path, destination: Path,
          expected_bundle_id: str | None = None) -> dict:
    datalab, built_site, destination = datalab.resolve(), built_site.resolve(), destination.resolve()
    if (destination.exists() or destination == ROOT or ROOT in destination.parents or
            destination == datalab or datalab in destination.parents or
            destination == built_site or built_site in destination.parents or
            not (datalab / "scripts/build_v9_canonical_batch.py").is_file() or
            not (built_site / "index.html").is_file()):
        raise ValueError("Preview output or source path invalid")
    if expected_bundle_id is not None and (len(expected_bundle_id) != 64 or
                                           any(ch not in "0123456789abcdef" for ch in expected_bundle_id)):
        raise ValueError("Expected bundle SHA invalid")
    electroverse = datalab / "data/platforms/electroverse/france-evse"
    electra = datalab / "data/platforms/electra/verified-app-evse-tariff-map.json"
    if not (electroverse / "manifest.json").is_file() or not electra.is_file():
        raise ValueError("Archived eMSP evidence missing")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="tcc-v9-rebuild-", dir=destination.parent) as temporary:
        stage = Path(temporary) / "candidate"
        stage.mkdir()
        base_report = run(sys.executable, datalab / "scripts/build_v9_canonical_batch.py",
                          "--out", stage / "base")
        base_bundle = Path(base_report["bundle"])
        base_index = run(sys.executable, ROOT / "scripts/build_v9_preproduction_data.py",
                         "--bundle", base_bundle, "--out", stage / "base-prepared")
        if (base_index.get("status") != "prepared" or base_index.get("rejected") or
                not any(row["source"] == "FR:irve_static" for row in base_index["sources"])):
            raise ValueError("Base canonical import incomplete")
        join = run(sys.executable, ROOT / "scripts/build_v9_emsp_exact_join_report.py",
                   "--prepared", stage / "base-prepared", "--electroverse", electroverse,
                   "--electra", electra, "--out", stage / "exact-emsp-join.json")
        emsp = run(sys.executable, datalab / "scripts/build_v9_emsp_exact_canonical.py",
                   "--national", base_bundle / "FR__irve_static.json",
                   "--join-report", stage / "exact-emsp-join.json", "--report-sha", join["sha256"],
                   "--electroverse", electroverse, "--electra", electra,
                   "--out", stage / "FR__emsp_exact.json")
        if emsp.get("source") != "FR:emsp_exact" or hashlib.sha256(
                (stage / "FR__emsp_exact.json").read_bytes()).hexdigest() != emsp.get("sha256"):
            raise ValueError("Exact eMSP canonical output invalid")
        sys.path.insert(0, str(datalab))
        from v9_rebuild.snapshot import prepare, verify  # noqa: E402
        manifest = json.loads((base_bundle / "manifest.json").read_bytes())
        inputs = {entry["source"]: base_bundle / entry["path"] for entry in manifest["sources"]}
        if "FR:emsp_exact" in inputs:
            raise ValueError("eMSP source already present in base")
        inputs["FR:emsp_exact"] = stage / "FR__emsp_exact.json"
        bundle = prepare(inputs, stage / "bundles")
        verified = verify(bundle)
        if expected_bundle_id is not None and bundle.name != expected_bundle_id:
            raise ValueError("Rebuilt bundle differs from pinned candidate")
        final_index = run(sys.executable, ROOT / "scripts/build_v9_preproduction_data.py",
                          "--bundle", bundle, "--out", stage / "prepared")
        if (final_index.get("status") != "prepared" or final_index.get("rejected") or
                len(final_index.get("sources", [])) != len(inputs)):
            raise ValueError("Final canonical import incomplete")
        sharded = run(sys.executable, ROOT / "scripts/shard_v9_preproduction_data.py",
                      "--prepared", stage / "prepared", "--out", stage / "sharded")
        if (sharded.get("status") != "prepared" or sharded.get("bundleId") != bundle.name or
                sharded.get("sourceCount") != len(inputs) or not sharded.get("shardCount")):
            raise ValueError("Spatial candidate incomplete")
        # The signed final bundle retains all inputs; discard only redundant
        # intermediate copies before packaging the site.
        shutil.rmtree(stage / "base")
        shutil.rmtree(stage / "base-prepared")
        shutil.rmtree(stage / "prepared")
        packaged = run(sys.executable, ROOT / "scripts/package_v9_preproduction_map.py",
                       "--site", built_site, "--prepared", stage / "sharded",
                       "--out", stage / "site")
        if packaged.get("status") != "packaged_preview_only" or packaged.get("notPublished") is not True:
            raise ValueError("Isolated preview packaging failed")
        report = {"schemaVersion": 1, "status": "prepared_local_only", "bundleId": bundle.name,
                  "sourceCount": len(verified["sources"]), "countries": packaged["countries"],
                  "shardCount": sharded["shardCount"],
                  "joinReportSha256": join["sha256"], "sitePath": "site/v9-production-shell/",
                  "published": False}
        (stage / "rebuild-report.json").write_text(
            json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        stage.rename(destination)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--datalab", type=Path, required=True)
    parser.add_argument("--built-site", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--expected-bundle-id")
    args = parser.parse_args()
    print(json.dumps(build(args.datalab, args.built_site, args.out, args.expected_bundle_id)))
