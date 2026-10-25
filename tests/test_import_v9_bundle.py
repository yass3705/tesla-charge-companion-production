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
    def test_source_identifier_without_official_evse_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = bundle(root, "a")
            payload = json.loads((original / "FR__ionity_direct.json").read_bytes())
            payload["cpos"] = [{"id": "cpo", "country": "FR"}]
            payload["stations"] = [{"id": "station", "cpoId": "cpo", "country": "FR"}]
            payload["evses"] = [{"id": "evse", "stationId": "station", "cpoId": "cpo", "country": "FR",
                                 "sourceEvseId": "native-config-1", "officialEvseId": None}]
            payload["connectors"] = [{"id": "plug", "evseId": "evse", "sourceConnectorId": "1",
                                       "officialConnectorId": None}]
            source_bytes = json.dumps(payload).encode()
            manifest = json.loads((original / "manifest.json").read_bytes())
            manifest["sources"][1]["sha256"] = MODULE.sha256(source_bytes)
            manifest_bytes = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
            candidate = root / MODULE.sha256(manifest_bytes)
            candidate.mkdir()
            (candidate / "manifest.json").write_bytes(manifest_bytes)
            (candidate / "FR__ionity_direct.json").write_bytes(source_bytes)
            (candidate / "CH__swiss_integration.json").write_bytes((original / "CH__swiss_integration.json").read_bytes())
            MODULE.verify(candidate)

    def test_hash_correct_but_invented_official_identity_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = bundle(root, "a")
            payload = json.loads((original / "FR__ionity_direct.json").read_bytes())
            payload["cpos"] = [{"id": "cpo", "country": "FR"}]
            payload["stations"] = [{"id": "station", "cpoId": "cpo", "country": "FR"}]
            payload["evses"] = [{"id": "evse", "stationId": "station", "cpoId": "cpo", "country": "FR",
                                 "sourceEvseId": "FR*ABC*E1", "officialEvseId": "FR*ABC*E1"}]
            payload["connectors"] = [{"id": "plug", "evseId": "evse", "sourceConnectorId": "1",
                                       "officialConnectorId": "2"}]
            source_bytes = json.dumps(payload).encode()
            manifest = json.loads((original / "manifest.json").read_bytes())
            manifest["sources"][1]["sha256"] = MODULE.sha256(source_bytes)
            manifest_bytes = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
            forged = root / MODULE.sha256(manifest_bytes)
            forged.mkdir()
            (forged / "manifest.json").write_bytes(manifest_bytes)
            (forged / "FR__ionity_direct.json").write_bytes(source_bytes)
            (forged / "CH__swiss_integration.json").write_bytes((original / "CH__swiss_integration.json").read_bytes())
            with self.assertRaisesRegex(ValueError, "official connector identity"):
                MODULE.verify(forged)

    def test_hash_correct_but_cross_country_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = bundle(root, "a")
            payload = json.loads((original / "FR__ionity_direct.json").read_bytes())
            payload["countries"] = [{"code": "BE"}]
            payload["stations"] = [{"id": "station", "cpoId": "cpo", "country": "BE"}]
            payload["cpos"] = [{"id": "cpo", "country": "BE"}]
            source_bytes = json.dumps(payload).encode()
            manifest = json.loads((original / "manifest.json").read_bytes())
            manifest["sources"][1]["sha256"] = MODULE.sha256(source_bytes)
            manifest_bytes = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
            forged = root / MODULE.sha256(manifest_bytes)
            forged.mkdir()
            (forged / "manifest.json").write_bytes(manifest_bytes)
            (forged / "FR__ionity_direct.json").write_bytes(source_bytes)
            (forged / "CH__swiss_integration.json").write_bytes(
                (original / "CH__swiss_integration.json").read_bytes())
            with self.assertRaisesRegex(ValueError, "country scope"):
                MODULE.verify(forged)

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

    def test_hash_correct_but_invalid_scope_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = bundle(root, "a")
            raw = json.loads((original / "FR__ionity_direct.json").read_bytes())
            raw["offers"] = [{"id": "offer", "channel": "Direct", "scope": {"evseId": "missing", "connectorId": None}}]
            source_bytes = json.dumps(raw).encode()
            manifest = json.loads((original / "manifest.json").read_bytes())
            manifest["sources"][1]["sha256"] = MODULE.sha256(source_bytes)
            manifest_bytes = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
            forged = root / MODULE.sha256(manifest_bytes)
            forged.mkdir()
            (forged / "manifest.json").write_bytes(manifest_bytes)
            (forged / "FR__ionity_direct.json").write_bytes(source_bytes)
            (forged / "CH__swiss_integration.json").write_bytes((original / "CH__swiss_integration.json").read_bytes())
            with self.assertRaisesRegex(ValueError, "offer scope"):
                MODULE.import_source(forged, "FR:ionity_direct", root / "stage")

    def test_hash_correct_but_cross_evse_connector_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            original = bundle(root, "a")
            payload = json.loads((original / "FR__ionity_direct.json").read_bytes())
            payload["cpos"] = [{"id": "cpo", "country": "FR"}]
            payload["stations"] = [{"id": "station", "cpoId": "cpo", "country": "FR"}]
            payload["evses"] = [
                {"id": "evse-a", "stationId": "station", "cpoId": "cpo", "country": "FR"},
                {"id": "evse-b", "stationId": "station", "cpoId": "cpo", "country": "FR"},
            ]
            payload["connectors"] = [{"id": "plug-b", "evseId": "evse-b"}]
            payload["offers"] = [{"id": "offer", "channel": "Direct", "scope": {"evseId": "evse-a", "connectorId": "plug-b"}}]
            source_bytes = json.dumps(payload).encode()
            manifest = json.loads((original / "manifest.json").read_bytes())
            manifest["sources"][1]["sha256"] = MODULE.sha256(source_bytes)
            manifest_bytes = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
            forged = root / MODULE.sha256(manifest_bytes)
            forged.mkdir()
            (forged / "manifest.json").write_bytes(manifest_bytes)
            (forged / "FR__ionity_direct.json").write_bytes(source_bytes)
            (forged / "CH__swiss_integration.json").write_bytes((original / "CH__swiss_integration.json").read_bytes())
            with self.assertRaisesRegex(ValueError, "connector ownership"):
                MODULE.verify(forged)


if __name__ == "__main__":
    unittest.main()
