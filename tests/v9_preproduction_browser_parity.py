#!/usr/bin/env python3
"""Compare identical V9 bundles served whole and spatially sharded.

Counts here are equality checks between two representations of the same
immutable snapshot. They are not historical station or EVSE volume gates.
"""
import argparse
import json
from pathlib import Path


FIELDS = ("count", "priced", "raw", "sourceIds", "emspPriced", "emspEvaluated",
          "emspMisScoped", "emspPricedMisScoped", "compoundPriced",
          "compoundEvaluated", "compoundFees", "ukPcprPriced", "ukPcprEvaluated",
          "ukPcprMisScoped", "ukPcprPricedMisScoped", "spainNationalPriced")


def compare(whole: dict, sharded: dict) -> dict:
    differences = {}
    for name in ("minPower300",):
        if whole.get(name) != sharded.get(name):
            differences[name] = [whole.get(name), sharded.get(name)]
    if whole.get("mobile390", {}).get("stations") != sharded.get("mobile390", {}).get("stations"):
        differences["mobile390.stations"] = [whole.get("mobile390", {}).get("stations"),
                                              sharded.get("mobile390", {}).get("stations")]
    for name, before in whole.items():
        after = sharded.get(name)
        if not isinstance(before, dict) or "count" not in before:
            continue
        if not isinstance(after, dict):
            differences[name] = "missing scenario"
            continue
        changed = {field: [before.get(field), after.get(field)] for field in FIELDS
                   if before.get(field) != after.get(field)}
        if changed:
            differences[name] = changed
    if differences:
        raise ValueError(json.dumps(differences, ensure_ascii=False, sort_keys=True))
    return {"status": "pass", "scenarios": sorted(name for name, row in whole.items()
                                                 if isinstance(row, dict) and "count" in row)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("whole", type=Path)
    parser.add_argument("sharded", type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(json.loads(args.whole.read_bytes()),
                             json.loads(args.sharded.read_bytes())), ensure_ascii=False))
