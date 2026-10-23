"""Offline packaging checks: no public tree mutation and strictly isolated candidate."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.package_v9_preproduction_map import package


class PreparedMapPackageTests(unittest.TestCase):
    def test_package_isolated_map_and_reject_corruption(self):
        with tempfile.TemporaryDirectory(prefix="tcc-v9-package-") as temp:
            root = Path(temp)
            site, candidate, output = root / "built-site", root / "candidate", root / "preview"
            (site / "v9-production-shell").mkdir(parents=True)
            (site / "v9-production-runtime/assets/v9").mkdir(parents=True)
            (site / "index.html").write_text("<html><body>TCC control</body></html>")
            (site / "v9-production-runtime/assets/v9/runtime-engine.js").write_text("/* fixture */")
            (site / "v9-production-shell/shell-config.json").write_text(json.dumps({
                "schemaVersion": 1, "mode": "candidate", "runtimeBase": "v9-production-runtime",
                "observedCandidateSha": "fixture", "engineScopeCountries": ["CH"],
            }))
            (candidate / "sources").mkdir(parents=True)
            data = json.dumps({"schemaVersion": 1, "source": {"id": "FR:ionity_direct"}}).encode()
            (candidate / "sources/FR__ionity_direct.json").write_bytes(data)
            index = {"schemaVersion": 1, "bundleId": "a" * 64,
                     "status": "prepared", "rejected": [],
                     "sources": [{"source": "FR:ionity_direct",
                                  "path": "sources/FR__ionity_direct.json",
                                  "sha256": hashlib.sha256(data).hexdigest()}]}
            (candidate / "index.json").write_text(json.dumps(index))
            result = package(site, candidate, output)
            self.assertTrue(result["notPublished"])
            self.assertEqual(result["countries"], ["FR"])
            cfg = json.loads((output / "v9-production-shell/shell-config.json").read_text())
            self.assertTrue(cfg["preproductionIsolated"])
            self.assertEqual(cfg["preproductionCandidateBase"], "../prepared-v9")
            self.assertEqual(cfg["preparedBundleId"], "a" * 64)
            self.assertEqual(cfg["fallback"], "fail-closed")
            self.assertTrue((output / "v9-production-runtime/assets/v9/preproduction-candidate-loader.js").is_file())
            self.assertEqual(json.loads((site / "v9-production-shell/shell-config.json").read_text())["engineScopeCountries"], ["CH"])
            with self.assertRaises(ValueError):
                package(site, candidate, root / "built-site/subdirectory")
            (candidate / "sources/FR__ionity_direct.json").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "SHA mismatch"):
                package(site, candidate, root / "bad-preview")
            (candidate / "sources/FR__ionity_direct.json").write_bytes(data)
            (candidate / "index.json").write_text(json.dumps({**index, "bundleId": "unverified"}))
            with self.assertRaisesRegex(ValueError, "bundle identity"):
                package(site, candidate, root / "bad-bundle")


if __name__ == "__main__":
    unittest.main()
