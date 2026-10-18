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

    def test_production_owned_shell(self):
        builder = (ROOT / "scripts/build_snapshot.py").read_text(encoding="utf-8")
        self.assertIn('copy_tree(production_root/"v9-production-shell", out/"v9-production-shell")', builder)
        self.assertIn('load_json(production_root/"v9-production-shell/shell-config.json")', builder)
        for name in ("index.html", "shell-config.json", "bridge.js"):
            self.assertTrue((ROOT / "v9-production-shell" / name).exists())

    def test_production_owned_core_engines(self):
        builder = (ROOT / "scripts/build_snapshot.py").read_text(encoding="utf-8")
        self.assertIn('owned_runtime=production_root/"runtime-owned"', builder)
        for name in ("access-router-engine.js", "offer-engine.js", "data-engine.js", "pricing-engine.js", "runtime-engine.js", "session-engine.js", "charge-model-engine.js", "session-planner-engine.js", "station-score-engine.js", "routing-engine.js", "device-scenario-engine.js", "vehicle-profile-engine.js", "readiness-engine.js", "parity-engine.js", "device-test-engine.js", "device-test-window-engine.js", "parity-scenario-engine.js", "rollout-engine.js", "enrollment-engine.js", "self-enrollment-engine.js", "whitelist-engine.js", "canary-policy-engine.js", "canary-identity.js", "canary-telemetry.js", "browser-loaders.js", "browser-routing.js", "v8-shadow-adapter.js", "tariff-shadow-adapter.js", "adapters/france-crosswalk.js", "adapters/france-irve-status.js", "adapters/legacy-direct-stations.js", "adapters/legacy-direct-tariffs.js", "adapters/morocco-evone-policy.js", "adapters/morocco-kilowatt-tariff.js", "adapters/tesla-json.js", "adapters/direct-offers.js", "adapters/national-compact.js", "adapters/morocco-shell-vivo-diagnostic.js", "adapters/morocco-public.js"):
            with self.subTest(name=name):
                self.assertTrue((ROOT / "runtime-owned/assets/v9" / name).is_file())
                self.assertIn(name, builder)

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
