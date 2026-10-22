import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/import_v9_bundle.py"
SPEC = importlib.util.spec_from_file_location("import_v9_bundle", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def bundle(root, marker):
    entries = []
    files = {}
    for source in ("CH:swiss_integration", "FR:ionity_direct"):
        name = source.replace(":", "__") + ".json"
        payload = {"schemaVersion": 1, "source": {"id": source, "artifactSha256": marker * 64},
                   "countries": [], "cpos": [], "stations": [], "evses": [], "connectors": [], "offers": []}
        raw = json.dumps(payload).encode()
        files[name] = raw
        entries.append({"source": source, "path": name, "sha256": MODULE.sha256(raw),
                        "sourceArtifactSha256": marker * 64, "canonicalSchemaVersion": 1})
    manifest = {"schemaVersion": 1, "state": "prepared", "sources": entries}
    raw = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    path = root / MODULE.sha256(raw)
    path.mkdir()
    (path / "manifest.json").write_bytes(raw)
    for name, data in files.items():
        (path / name).write_bytes(data)
    return path


class ImportV9BundleTest(unittest.TestCase):
    def test_source_isolation_and_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = bundle(root, "a")
            newer = bundle(root, "b")
            target = root / "stage"
            path = MODULE.import_source(old, "CH:swiss_integration", target)
            self.assertEqual(json.loads(path.read_bytes())["source"]["artifactSha256"], "a" * 64)
            MODULE.import_source(newer, "CH:swiss_integration", target)
            self.assertEqual(json.loads(path.read_bytes())["source"]["artifactSha256"], "b" * 64)
            MODULE.import_source(old, "CH:swiss_integration", target)
            self.assertEqual(json.loads(path.read_bytes())["source"]["artifactSha256"], "a" * 64)
            (old / "FR__ionity_direct.json").write_text("corrupt")
            MODULE.import_source(old, "CH:swiss_integration", target)
            with self.assertRaisesRegex(ValueError, "SHA"):
                MODULE.import_source(old, "FR:ionity_direct", target)

    def test_tampered_manifest_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = bundle(root, "a")
            (path / "manifest.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "SHA"):
                MODULE.verify(path)


if __name__ == "__main__":
    unittest.main()
