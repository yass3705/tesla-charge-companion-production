import hashlib
import importlib.util
import json
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/check_published_pages.py"
spec = importlib.util.spec_from_file_location("check_published_pages", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    bodies = {path: b"asset" for path in module.CRITICAL}
    bodies["index.html"] = b"v9-production-shell/"
    bodies["v9-production-shell/shell-config.json"] = json.dumps({"snapshotId": "candidate"}).encode()
    files = [{"path": path, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
             for path, body in bodies.items()]
    files.extend({"path": f"other/{i}", "bytes": 1, "sha256": "0" * 64} for i in range(2000))
    return {"snapshotId": "candidate", "datasets": [{"id": x} for x in module.COUNTRIES],
            "files": files, "fileCount": len(files)}, bodies


class PublishedPagesCheckTest(unittest.TestCase):
    def test_valid_published_snapshot(self):
        manifest, bodies = fixture()
        self.assertEqual(module.verify(manifest, "candidate", bodies.__getitem__)["checkedAssets"], len(module.CRITICAL))

    def test_asset_hash_mismatch_fails(self):
        manifest, bodies = fixture()
        bodies["service-worker.js"] = b"changed"
        with self.assertRaisesRegex(ValueError, "service-worker"):
            module.verify(manifest, "candidate", bodies.__getitem__)

    def test_snapshot_mismatch_fails(self):
        manifest, bodies = fixture()
        with self.assertRaisesRegex(ValueError, "snapshot ID"):
            module.verify(manifest, "other", bodies.__getitem__)


if __name__ == "__main__":
    unittest.main()
