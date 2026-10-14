#!/usr/bin/env python3
"""Read-only comparison of pinned Production Pages with legacy Stable Pages."""
import argparse,json,pathlib,re
p=argparse.ArgumentParser()
p.add_argument("--production-root",type=pathlib.Path,required=True)
p.add_argument("--stable-root",type=pathlib.Path,required=True)
p.add_argument("--report",type=pathlib.Path,required=True)
a=p.parse_args()
pub=a.production_root/".github/workflows/publish-v9-pinned-pages.yml"
old=a.stable_root/".github/workflows/pages.yml"
new=pub.read_text()
legacy=old.read_text()
prod_builder=(a.production_root/"scripts/build_snapshot.py").read_text()
checks={
 "productionPagesRequiresExplicitPublish":'inputs.publish == true' in new and 'workflow_dispatch' in new,
 "productionUsesPinnedSnapshot":'steps.pin.outputs.snapshot_id' in new and 'config/refresh-policy.json' in new,
 "productionBuildsAssetGraph":'validate_browser_asset_graph.py' in new,
 "productionDeploysPages":'actions/deploy-pages@v4' in new,
 "stableStillHasPagesRollback":'actions/deploy-pages@v4' in legacy or 'actions/deploy-pages@' in legacy,
 "stableBuildsV8Preview":'site/v8-preview' in legacy,
 "productionBundleContainsV8PreviewBuilder":'v8-preview' in prod_builder,
 "productionKeepsV7ControlFallback":'control/index.html' in prod_builder,
}
report={
 "source":"migration issue #305",
 "scope":"Pages workflow and build contract only; no publication",
 "checks":checks,
 "notReadyToDisableStablePages":True,
 "blockers":[k for k in ("productionBundleContainsV8PreviewBuilder",) if not checks[k]],
 "notice":"Check actual domain, URL paths, PWA and rollback in an isolated Pages target before switching."
}
a.report.parent.mkdir(parents=True,exist_ok=True)
a.report.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
if not all(checks[k] for k in ("productionPagesRequiresExplicitPublish","productionUsesPinnedSnapshot","productionBuildsAssetGraph","productionDeploysPages","stableStillHasPagesRollback","stableBuildsV8Preview","productionKeepsV7ControlFallback")):
 raise SystemExit("GitHub Pages migration baseline not met")
