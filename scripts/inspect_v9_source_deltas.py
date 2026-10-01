#!/usr/bin/env python3
"""Read-only TCC V9 Data Lab delta gate.

Compares the immutable RC1/r8 Data Lab pin with current Data Lab main without
downloading country datasets. An inventory/content change is only a review
candidate. This script must never mutate production pins, releases or tariffs.
"""
import argparse
import datetime as dt
import json
import os
import pathlib
import urllib.request

MONITORED = {
  "tesla": [
    "data/suc-tracker/tesla_stations.json",
    "data/suc-tracker/metadata.json",
  ],
  "national": [
    "data/national/france_public_charging_canonical.json",
    "data/national/switzerland_public_charging_v9.json",
    "data/national/uk_validated_open_feeds.json.gz",
    "data/national/germany_non_tesla_catalog_staging_direct_cpo.json.gz",
    "data/national/germany_non_tesla_catalog_staging_direct_cpo_manifest.json",
    "data/national/ionity_direct_stations_germany.json.gz",
    "data/national/atlante_direct_stations_france_latest.json.gz",
    "data/national/atlante_direct_stations_italy_latest.json.gz",
  ],
  "validated_direct": [
    "data/operator_direct/ionity_exact_france.json",
    "data/reports/ionity_italy_exact_reconciliation_20260923.json",
    "data/switzerland/avia-guest-direct-tariffs.json",
  ],
  "platform": [
    "data/electroverse/tariff_cache/manifest.json",
    "data/electroverse/inventory/france-current.json",
  ],
  "cpo_ledgers": [
    "docs/france-cpo-progress-2026-09.json",
    "docs/italy-cpo-progress-2026-09.json",
    "docs/germany-cpo-progress-2026-09.json",
    "docs/uk-cpo-progress-2026-09.json",
    "docs/v9-country-progress-2026-09-30.json",
  ],
}

def classify(old, new):
    """Use file blob IDs only; never equate a ledger edit with validation."""
    rows=[]
    for category, paths in MONITORED.items():
        for path in paths:
            old_sha=old.get(path)
            new_sha=new.get(path)
            if old_sha==new_sha and old_sha is not None: state="unchanged"
            elif old_sha is None and new_sha is None:state="missing_both"
            elif old_sha is None:state="new_candidate"
            elif new_sha is None:state="missing_current"
            else:state="changed_candidate"
            rows.append({"group":category,"path":path,"baselineBlob":old_sha,
                         "currentBlob":new_sha,"state":state})
    return rows

def git_tree(repo, ref, token=None):
    request=urllib.request.Request(
        f"https://api.github.com/repos/{repo}/git/trees/{ref}?recursive=1",
        headers={
            "Accept":"application/vnd.github+json",
            "User-Agent":"tcc-v9-readonly-source-audit",
            **({"Authorization":"Bearer "+token} if token else {})
        }
    )
    with urllib.request.urlopen(request,timeout=40) as r:
        result=json.load(r)
    if result.get("truncated"):
        raise RuntimeError("Git tree was truncated; refusing partial audit")
    return {row["path"]:row["sha"] for row in result.get("tree",[])
            if row.get("type")=="blob" and row.get("sha")}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--config",default="config/snapshots/2026-09-30-r8.json")
    parser.add_argument("--output",required=True)
    parser.add_argument("--summary",default="")
    args=parser.parse_args()
    config=json.loads(pathlib.Path(args.config).read_text(encoding="utf-8"))
    source=config["sources"]["dataLab"]
    repo=source["repo"]; baseline=source["sha"]
    token=os.getenv("GITHUB_TOKEN")
    old=git_tree(repo,baseline,token)
    current=git_tree(repo,"main",token)
    rows=classify(old,current)
    counts={s:sum(row["state"]==s for row in rows)
            for s in ["unchanged","changed_candidate","new_candidate","missing_current","missing_both"]}
    output={
      "schemaVersion":1,"generatedAt":dt.datetime.now(dt.timezone.utc).isoformat(),
      "baselineRepo":repo,"pinnedBaselineSha":baseline,
      "currentRef":"main","scope":"monitored source blobs, NOT complete CPO coverage",
      "counts":counts,"files":rows,
      "promotionAllowed":False,
      "nextAction":"Review changed source evidence and updated national coverage; construct a new immutable pin only after existing source guards and full V9 runtime CI pass.",
      "policy":"No auto-merge, pricing inference, release overwrite or deployment."
    }
    dest=pathlib.Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    summary=[
      "## V9 source delta audit (read-only)",
      f"Frozen Data Lab pin: \`{baseline}\`",
      "Compared with Data Lab main (file content blob IDs, not progress claims).",
      f"Changed candidates: {counts['changed_candidate']}; new: {counts['new_candidate']}; missing current: {counts['missing_current']}; unchanged: {counts['unchanged']}.",
      "No production promotion or deployment was attempted.",
    ]
    summary += [f"- {row['state']}: \`{row['path']}\`"
                for row in rows if row["state"]!="unchanged"]
    if args.summary:
        pathlib.Path(args.summary).write_text("\n".join(summary)+"\n",encoding="utf-8")
    print(json.dumps({"ok":True,"counts":counts,"promotionAllowed":False}))
if __name__=="__main__":
    main()
