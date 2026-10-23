#!/usr/bin/env python3
"""Record proven exact EVSE/connector joins for an isolated prepared candidate.

The report contains identities and reasons only. It never moves a tariff or
creates an offer on a national station; unmatched offers remain independent.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from collections import Counter
from pathlib import Path

from join_v9_exact import match_offers
from package_v9_preproduction_map import ROOT, check_candidate


def compute(candidate: Path, national_source: str) -> dict:
    candidate = candidate.resolve()
    index = check_candidate(candidate)
    by_source = {row["source"]: row for row in index["sources"]}
    if national_source not in by_source:
        raise ValueError("Prepared national source absent")
    country = national_source.split(":", 1)[0]
    related = [source for source in sorted(by_source) if source.startswith(country + ":") and source != national_source]
    def read(source: str) -> dict:
        return json.loads((candidate / by_source[source]["path"]).read_bytes())
    result = match_offers(read(national_source), [read(source) for source in related])
    reasons = Counter(row["reason"] for row in result["unmatched"])
    coverage_by_source = {}
    by_channel = {}
    for source in related:
        matched = [row for row in result["matches"] if row["sourceId"] == source]
        unmatched = [row for row in result["unmatched"] if row["sourceId"] == source]
        coverage_by_source[source] = {"matchedOffers": len(matched), "unmatchedOffers": len(unmatched),
                             "distinctNationalEvses": len({row["nationalEvseId"] for row in matched})}
    for channel in ("Direct", "Electra", "Electroverse"):
        matched = [row for row in result["matches"] if row["channel"] == channel]
        by_channel[channel] = {"matchedOffers": len(matched),
                               "distinctNationalEvses": len({row["nationalEvseId"] for row in matched})}
    return {"schemaVersion": 1, "candidateBundleId": index["bundleId"],
              "nationalSource": national_source,
              "sourceInputs": [{"source": source, "sha256": by_source[source]["sha256"]}
                               for source in [national_source, *related]],
              "policy": "exact_official_evse_and_exact_official_connector_when_scoped;no_site_or_geo_price_propagation",
              "statistics": {**result["statistics"], "unmatchedReasons": dict(sorted(reasons.items())),
                             "bySource": coverage_by_source, "byChannel": by_channel},
              "matches": result["matches"], "unmatched": result["unmatched"]}


def build(candidate: Path, national_source: str, destination: Path) -> dict:
    candidate, destination = candidate.resolve(), destination.resolve()
    if destination == ROOT or ROOT in destination.parents or destination == candidate or candidate in destination.parents:
        raise ValueError("Join output must be outside checkout and candidate")
    report = compute(candidate, national_source)
    raw = (json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()
    report_sha = hashlib.sha256(raw).hexdigest()
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / (report_sha + ".json")
    if target.exists():
        if target.read_bytes() != raw:
            raise ValueError("Existing join report SHA collision")
    else:
        with tempfile.NamedTemporaryFile(dir=destination, prefix="v9-join-", suffix=".tmp", delete=False) as handle:
            handle.write(raw)
            temporary = Path(handle.name)
        try:
            try:
                os.link(temporary, target)
            except FileExistsError:
                if target.read_bytes() != raw:
                    raise ValueError("Concurrent join report SHA collision") from None
        finally:
            temporary.unlink(missing_ok=True)
    return {"report": str(target), "sha256": report_sha, "statistics": report["statistics"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared", required=True, type=Path)
    parser.add_argument("--national", required=True)
    parser.add_argument("--out-dir", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.prepared, args.national, args.out_dir)))


if __name__ == "__main__":
    main()
