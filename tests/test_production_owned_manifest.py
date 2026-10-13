import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
PWA_FILES = ("manifest.webmanifest", "app-version.json", "service-worker.js")


class ProductionOwnedManifestTests(unittest.TestCase):
    def test_deployment_files_are_production_owned(self):
        builder = (ROOT / "scripts/build_snapshot.py").read_text(encoding="utf-8")
        self.assertIn('src=production_root/"deployment"/name', builder)
        self.assertIn('raise FileNotFoundError(f"Production-owned PWA file missing:', builder)
        for name in PWA_FILES:
            with self.subTest(name=name):
                self.assertTrue((ROOT / "deployment" / name).is_file())

    def test_manifest_is_present(self):
        manifest = json.loads((ROOT / "deployment/manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "Tesla Charge Companion")
        self.assertEqual(manifest["display"], "standalone")

    def test_version_and_worker_are_valid(self):
        version = json.loads((ROOT / "deployment/app-version.json").read_text(encoding="utf-8"))
        self.assertIn("build", version)
        worker = (ROOT / "deployment/service-worker.js").read_text(encoding="utf-8")
        self.assertIn("addEventListener('fetch'", worker)


if __name__ == "__main__":
    unittest.main()
