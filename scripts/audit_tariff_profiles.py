#!/usr/bin/env python3
"""Inventory every tariff representation shipped in a built V9 snapshot."""
import argparse
import collections
import gzip
import json
import pathlib

TYPES = {"rules", "kwh", "component_groups", "electroverse_restrictions"}
SPECIAL = {"powerBands", "postChargeRate", "afterMinutesCap", "ocpiDurationBands"}


def source_name(root, path):
    parts = path.relative_to(root).parts
    if parts[:3] == ("runtime", "data", "v9"):
        return "/".join(parts[:4])
    if parts[:2] == ("runtime", "data"):
        return "/".join(parts[:3])
    if parts[0] == "snapshot-inputs":
        return "/".join(parts[: min(4, len(parts))])
    return "/".join(parts[: min(2, len(parts))])


def meaningful(value):
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, (list, dict)):
        return bool(value)
    return value not in (None, "", False)


def shape(pricing):
    kind = pricing.get("type")
    if kind == "rules":
        variants = sorted({
            json.dumps({
                "scope": rule.get("scope"),
                "billing": rule.get("billing"),
                "keys": sorted(rule),
            }, sort_keys=True)
            for rule in pricing.get("rules", []) if isinstance(rule, dict)
        })
    elif kind == "component_groups":
        variants = sorted({
            json.dumps({
                "kind": group.get("kind"),
                "rules": sorted({tuple(sorted(rule)) for rule in group.get("rules", []) if isinstance(rule, dict)}),
            }, sort_keys=True)
            for group in pricing.get("componentGroups", []) if isinstance(group, dict)
        })
    elif kind == "electroverse_restrictions":
        variants = sorted({
            json.dumps({
                "types": sorted(rule.get("types") or []),
                "keys": sorted(rule),
                "rates": sorted((rule.get("rates") or {})),
            }, sort_keys=True)
            for rule in pricing.get("rules", []) if isinstance(rule, dict)
        })
    else:
        variants = []
    return json.dumps({"type": kind, "keys": sorted(pricing), "variants": variants}, sort_keys=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot", type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--expected-profile-signatures", type=int)
    args = parser.parse_args()
    root = args.snapshot
    counts = collections.Counter()
    profiles = collections.Counter()
    examples = {}
    special = collections.Counter()
    raw_components = collections.Counter()
    errors = []

    def visit(value, path):
        if isinstance(value, list):
            for item in value:
                visit(item, path)
            return
        if not isinstance(value, dict):
            return
        pricing = value.get("pricing")
        if isinstance(pricing, dict) and pricing.get("type") not in TYPES and pricing.get("type") is not None:
            counts["unknown_pricing_type:" + str(pricing["type"])] += 1
        if isinstance(pricing, dict) and pricing.get("type") in TYPES:
            origin = source_name(root, path)
            signature = shape(pricing)
            key = (origin, signature)
            profiles[key] += 1
            examples.setdefault(key, {"file": str(path.relative_to(root)), "id": value.get("id"), "provider": value.get("provider")})
            counts["runtime_pricing_objects"] += 1
            counts["type:" + pricing["type"]] += 1
            for rule in pricing.get("rules", []):
                if not isinstance(rule, dict):
                    continue
                for field in SPECIAL:
                    if meaningful(rule.get(field)):
                        special[(origin, field)] += 1
        if isinstance(value.get("priceComponents"), list):
            origin = source_name(root, path)
            kinds = tuple(sorted({str(row.get("type")) for row in value["priceComponents"] if isinstance(row, dict)}))
            raw_components[(origin, kinds)] += 1
            counts["raw_price_component_groups"] += 1
        for name, item in value.items():
            if name == "pricing":
                continue
            if isinstance(item, (dict, list)):
                visit(item, path)

    for path in root.rglob("*"):
        if not path.is_file() or not (path.name.endswith(".json") or path.name.endswith(".json.gz")):
            continue
        if path.relative_to(root).parts[0] not in {"runtime", "data", "snapshot-inputs"}:
            continue
        try:
            with (gzip.open(path, "rt", encoding="utf-8") if path.name.endswith(".gz") else path.open(encoding="utf-8")) as stream:
                visit(json.load(stream), path)
            counts["files_read"] += 1
        except (OSError, ValueError, RecursionError) as error:
            errors.append({"file": str(path.relative_to(root)), "error": str(error)})

    report = {
        "snapshot": root.name,
        "counts": dict(counts),
        "unique_profile_signatures": len({key[1] for key in profiles}),
        "profiles": [
            {"source": source, "signature": json.loads(signature), "count": count, "example": examples[(source, signature)]}
            for (source, signature), count in profiles.most_common()
        ],
        "special_components": [
            {"source": source, "field": field, "count": count}
            for (source, field), count in special.most_common()
        ],
        "raw_components": [
            {"source": source, "kinds": kinds, "count": count}
            for (source, kinds), count in raw_components.most_common()
        ],
        "read_errors": errors,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"counts": report["counts"], "unique_profile_signatures": report["unique_profile_signatures"], "special_components": report["special_components"][:20], "raw_kinds": sorted({kind for row in report["raw_components"] for kind in row["kinds"]}), "read_errors": errors}, ensure_ascii=False))
    if errors or any(key.startswith("unknown_pricing_type:") for key in counts):
        raise SystemExit(1)
    if args.expected_profile_signatures is not None and report["unique_profile_signatures"] != args.expected_profile_signatures:
        raise SystemExit(f"Tariff profile schema changed: expected {args.expected_profile_signatures}, found {report['unique_profile_signatures']}")


if __name__ == "__main__":
    main()
