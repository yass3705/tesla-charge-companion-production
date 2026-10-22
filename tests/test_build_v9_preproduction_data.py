import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from tests.test_import_v9_bundle import bundle

SPEC = importlib.util.spec_from_file_location("build_v9_preproduction_data", ROOT / "scripts/build_v9_preproduction_data.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PreproductionDataTest(unittest.TestCase):
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
