#!/usr/bin/env python3
"""Scope a pinned Data Lab BUMP catalogue to exact EVSE in the current FR runtime."""
import argparse
import copy
import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def inventory_index(path):
    rows = json.load(gzip.open(path, "rt", encoding="utf-8"))
    index = defaultdict(list)
    for row in rows:
        for group in row[8] or []:
            for evse in group[6] or []:
                index[str(evse).upper()].append((row[0], row[5], row[10]))
    return index


def evse_ids(payload):
    ids = [str(evse).upper() for offer in payload["directOffers"] for evse in offer.get("evseIds") or []]
    if len(ids) != len(set(ids)):
        raise AssertionError("BUMP offers duplicate an exact EVSE")
    return set(ids)


def validate(payload, inventory_path, stable_catalogue_path):
    inventory = inventory_index(inventory_path)
    attached = evse_ids(payload)
    for evse in attached:
        rows = inventory.get(evse) or []
        if len(rows) != 1 or rows[0][1].casefold() != "bump" or rows[0][2].casefold() != "bump":
            raise AssertionError(f"BUMP exact EVSE has no unique Bump IRVE identity: {evse}")
    source = payload["sourceEvidence"]
    unjoined = payload.get("unjoinedSourceRankableEvse") or []
    unjoined_ids = [row["evseId"] for row in unjoined]
    if len(unjoined_ids) != len(set(unjoined_ids)) or attached.intersection(unjoined_ids):
        raise AssertionError("BUMP attached/unjoined EVSE overlap")
    if len(attached) + len(unjoined_ids) != source["runtimeSourcePricedPoints"]:
        raise AssertionError("BUMP current source-priced accounting mismatch")
    if len(attached) + len(unjoined_ids) + source["quarantinedSourceRankablePoints"] + source["unresolvedPoints"] != source["francePoints"]:
        raise AssertionError("BUMP full source accounting mismatch")
    if any("kind" in rule for offer in payload["directOffers"] for rule in offer["pricing"].get("rules") or []):
        raise AssertionError("BUMP parser-only rule leaked into runtime")
    stable = json.loads(Path(stable_catalogue_path).read_text(encoding="utf-8"))
    old = evse_ids(stable)
    return {"sourcePricedEvse": source["runtimeSourcePricedPoints"],
            "attachedEvse": len(attached), "unjoinedCurrentSourceEvse": len(unjoined_ids),
            "oldStableEvse": len(old), "retainedOldEvse": len(old & attached),
            "removedOldEvse": len(old - attached), "newAttachedEvse": len(attached - old),
            "offerGroups": len(payload["directOffers"]),
            "operatorCounts": dict(Counter(inventory[evse][0][1] for evse in attached))}


def generate(source_path, inventory_path, stable_catalogue_path, source_commit):
    source = json.loads(Path(source_path).read_text(encoding="utf-8"))
    inventory = inventory_index(inventory_path)
    if source.get("country") != "FR" or source.get("mode") != "operator-direct-exact-evse":
        raise AssertionError("Unexpected BUMP Data Lab source scope")
    evse_ids(source)
    offers, unjoined = [], set()
    for offer in source["directOffers"]:
        attached = []
        for evse in offer["evseIds"]:
            rows = inventory.get(str(evse).upper()) or []
            if len(rows) > 1 or (rows and (rows[0][1].casefold() != "bump" or rows[0][2].casefold() != "bump")):
                raise AssertionError(f"Ambiguous or foreign BUMP EVSE: {evse}")
            if rows:
                attached.append(evse)
            else:
                unjoined.add(evse)
        if attached:
            scoped = copy.deepcopy(offer)
            scoped["evseIds"] = sorted(attached)
            scoped.setdefault("metadata", {})["exactEvseCount"] = len(attached)
            offers.append(scoped)
    payload = copy.deepcopy(source)
    payload["directOffers"] = offers
    payload["unjoinedSourceRankableEvse"] = [{"evseId": evse, "reason": "absent_pinned_fr_irve"} for evse in sorted(unjoined)]
    evidence = payload["sourceEvidence"]
    evidence["runtimeSourcePricedPoints"] = evidence["rankablePoints"]
    evidence["rankablePoints"] = sum(len(o["evseIds"]) for o in offers)
    evidence["unjoinedCurrentSourceEvse"] = len(unjoined)
    evidence["sourceDataLabCommit"] = source_commit
    evidence["sourceArtifactSha256"] = sha256(source_path)
    evidence["runtimeInventoryScope"] = "unique_exact_evse_and_bump_operator"
    summary = validate(payload, inventory_path, stable_catalogue_path)
    return payload, summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--inventory", required=True)
    parser.add_argument("--stable-catalogue", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    payload, summary = generate(args.source, args.inventory, args.stable_catalogue, args.source_commit)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
