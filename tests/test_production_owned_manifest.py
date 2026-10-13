import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ProductionOwnedManifestTests(unittest.TestCase):
    def test_manifest_source_is_production_owned(self):
        source = (ROOT / "scripts/build_snapshot.py").read_text(encoding="utf-8")
        self.assertIn('production_root/"deployment/manifest.webmanifest"', source)
        self.assertIn('name=="manifest.webmanifest"', source)
        self.assertIn('src.exists()', source)

    def test_manifest_is_present(self):
        import json
        manifest = json.loads((ROOT / "deployment/manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "Tesla Charge Companion")
        self.assertEqual(manifest["display"], "standalone")


if __name__ == "__main__":
    unittest.main()
