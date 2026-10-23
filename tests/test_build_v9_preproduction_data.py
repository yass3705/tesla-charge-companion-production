import importlib.util
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from tests.test_import_v9_bundle import bundle
from tests.test_build_v9_exact_join_report import candidate as exact_candidate
from scripts.package_v9_preproduction_map import check_candidate

SPEC = importlib.util.spec_from_file_location("build_v9_preproduction_data", ROOT / "scripts/build_v9_preproduction_data.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PreproductionDataTest(unittest.TestCase):
    def test_prepared_national_bundle_carries_verified_exact_join_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fixture = root / "fixture"
            exact_candidate(fixture)
            index = json.loads((fixture / "index.json").read_bytes())
            entries = []
            for row in index["sources"]:
                payload = json.loads((fixture / row["path"]).read_bytes())
                entries.append({"source": row["source"], "path": row["source"].replace(":", "__") + ".json",
                                "sha256": row["sha256"], "sourceArtifactSha256": payload["source"]["artifactSha256"],
                                "canonicalSchemaVersion": 1})
            manifest_raw = (json.dumps({"schemaVersion": 1, "state": "prepared", "sources": entries},
                                       sort_keys=True, separators=(",", ":")) + "\n").encode()
            source = root / hashlib.sha256(manifest_raw).hexdigest()
            source.mkdir()
            (source / "manifest.json").write_bytes(manifest_raw)
            for row in index["sources"]:
                (source / (row["source"].replace(":", "__") + ".json")).write_bytes((fixture / row["path"]).read_bytes())
            output = root / "preview"
            prepared = MODULE.build(source, output)
            self.assertEqual(prepared["status"], "prepared")
            self.assertEqual(prepared["joins"][0]["nationalSource"], "FR:irve_static")
            check_candidate(output)
            report_path = output / prepared["joins"][0]["path"]
            self.assertEqual(json.loads(report_path.read_bytes())["statistics"]["matchedOfferCount"], 1)
            report_path.write_text("tampered")
            with self.assertRaisesRegex(ValueError, "join SHA"):
                check_candidate(output)

    def test_build_isolated_multi_source_and_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = bundle(root, "a")
            target = root / "preview"
            index = MODULE.build(source, target)
            self.assertEqual(index["status"], "prepared")
            self.assertEqual(len(index["sources"]), 2)
            self.assertTrue((target / "sources/FR__ionity_direct.json").is_file())
            with self.assertRaisesRegex(ValueError, "already exists"):
                MODULE.build(source, target)
            (source / "FR__ionity_direct.json").write_text("broken")
            partial = MODULE.build(source, root / "partial")
            self.assertEqual(partial["status"], "partial_failure")
            self.assertEqual([row["source"] for row in partial["sources"]], ["CH:swiss_integration"])
            self.assertEqual([row["source"] for row in partial["rejected"]], ["FR:ionity_direct"])
            self.assertEqual(json.loads((target / "index.json").read_text())["status"], "prepared")

    def test_checkout_destination_forbidden(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = bundle(root, "a")
            with self.assertRaisesRegex(ValueError, "outside"):
                MODULE.build(source, ROOT / "dist/test-v9")


if __name__ == "__main__":
    unittest.main()
