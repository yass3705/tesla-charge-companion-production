import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from materialize_baseline import materialize, verify_materialized


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class MaterializeBaselineTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.bundle = root / "bundle"
        self.bundle.mkdir()
        self.out = root / "out"
        self.archive = self.bundle / "runtime-baseline.tar.gz"
        files = {}
        with tarfile.open(self.archive, "w:gz") as tar:
            for index in range(1201):
                name = f"data/file_{index}.json"
                payload = f"{{\"id\":{index}}}".encode()
                info = tarfile.TarInfo(name)
                info.size = len(payload)
                tar.addfile(info, io.BytesIO(payload))
                files[name] = {"sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)}
        self.archive_sha = digest(self.archive)
        manifest = {
            "mode": "preserved_public_v9_runtime_baseline", "sourceSha": "a" * 40,
            "archiveSha256": self.archive_sha, "fileCount": len(files), "files": files,
        }
        self.manifest = self.bundle / "manifest.json"
        self.manifest.write_text(json.dumps(manifest))
        self.manifest_sha = digest(self.manifest)

    def test_exact_archive_materializes_and_detects_tampering(self):
        result = materialize(self.bundle, self.out, self.archive_sha, self.manifest_sha, "a" * 40)
        self.assertEqual(result["fileCount"], 1201)
        verify_materialized(self.bundle, self.out, self.archive_sha, self.manifest_sha, "a" * 40)
        (self.out / "data/file_500.json").write_text("changed")
        with self.assertRaisesRegex(ValueError, "changed"):
            verify_materialized(self.bundle, self.out, self.archive_sha, self.manifest_sha, "a" * 40)

    def test_wrong_archive_pin_fails_before_extraction(self):
        with self.assertRaisesRegex(ValueError, "SHA256"):
            materialize(self.bundle, self.out, "0" * 64, self.manifest_sha, "a" * 40)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
