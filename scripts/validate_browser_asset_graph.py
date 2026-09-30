#!/usr/bin/env python3
"""Validate actual browser-visible asset graph of a built, pinned TCC V9 candidate.

Run after build, without network access. The shell's injected dependencies must
exist under runtime and the fallback must point to this candidate's local
control page, never a mutable remote repo.
"""
import json
import pathlib
import re
import sys
from urllib.parse import urlsplit

def validate(root: pathlib.Path):
    shell = root / "v9-production-shell/index.html"
    text = shell.read_text(encoding="utf-8")
    cfg = json.loads((root / "v9-production-shell/shell-config.json").read_text(encoding="utf-8"))
    assert cfg.get("mode") == "candidate"
    assert cfg.get("runtimeBase") == "runtime"
    assert cfg.get("controlIndex") == "../control/index.html"
    assert "const CONTROL_FALLBACK='../control/index.html'" in text
    assert "TCCV9ProductionBootstrap.install()" not in text, "Shell must load bootstrap once via script dependencies"
    dep_match = re.search(r"const dependencies\s*=\s*\[([\s\S]*?)\];", text)
    assert dep_match, "Unable to find real browser dependency list"
    deps = re.findall(r"['\"](assets/v9/[^'\"]+\.js)['\"]", dep_match.group(1))
    assert deps and len(deps) == len(set(deps)), "Missing or duplicate V9 browser dependencies"
    assert deps[-3:] == [
        "assets/v9/browser-loaders.js",
        "assets/v9/production-loader-extension.js",
        "assets/v9/production-bootstrap.js",
    ], "Loaders, extension, bootstrap must run in this order"
    for dep in deps:
        assert not urlsplit(dep).scheme and ".." not in pathlib.PurePosixPath(dep).parts, dep
        assert (root / "runtime" / dep).is_file(), f"Missing browser dependency: {dep}"
    assert (root/"v9-production-shell/bridge.js").is_file()
    assert (root/"control/index.html").is_file()
    registry=json.loads((root/"runtime/data/v9/source-registry.json").read_text(encoding="utf-8"))
    required={
        "germany-production-snapshot", "uk-production-open-feeds", "italy-atlante-r8",
        "italy-ionity-r8", "france-ionity-r8", "switzerland-avia-r8",
        "france-electroverse-r8",
    }
    sources={x.get("id"):x for x in registry.get("sources",[]) if isinstance(x,dict)}
    assert required <= sources.keys(), f"Missing production sources: {sorted(required-sources.keys())}"
    for source_id in required:
        row=sources[source_id]
        assert row.get("active") is True
        assert row.get("refresh") == "immutable-production-snapshot"
        for field in ("path","tileManifest","ionityPath"):
            value=row.get(field)
            if value:
                candidate=(root/"runtime"/value).resolve()
                assert candidate.is_relative_to(root.resolve()), f"Source escapes snapshot: {source_id} {value}"
                assert candidate.is_file(), f"Missing production source: {source_id} {field} {value}"
    print(json.dumps({
        "ok":True,
        "browserDependencies":len(deps),
        "productionRegistrySourcesVerified":len(required),
        "fallback":"local",
        "snapshotId":cfg.get("snapshotId"),
    }))

if __name__=="__main__":
    validate(pathlib.Path(sys.argv[1] if len(sys.argv)>1 else "dist/v9-2026-09-30-r8"))
