import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from france_last_good_source import verify_and_copy


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class FranceLastGoodSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.bundle = root / "bundle"
        self.source = self.bundle / "france-static"
        self.historical = root / "historical"
        self.target = root / "target"
        for directory in (self.source, self.historical):
            directory.mkdir(parents=True)
        manifest = {"stationCount": 1, "pdcCount": 2}
        for directory in (self.source, self.historical):
            (directory / "manifest.json").write_text(json.dumps(manifest))
            (directory / "all.json.gz").write_bytes(b"same pinned static bytes")
        self.proof = {
            "mode": "preserved_validated_france_irve_static", "sourceSha": "a" * 40,
            "stationCount": 1, "pdcCount": 2, "manifestSha256": digest(self.source / "manifest.json"),
            "fileCount": 2, "allSha256": digest(self.source / "all.json.gz"),
        }

    def pin(self):
        (self.bundle / "provenance.json").write_text(json.dumps(self.proof))
        return digest(self.bundle / "provenance.json")

    def test_exact_validated_generation_copies(self):
        result = verify_and_copy(self.bundle, self.historical, self.target, self.pin(), "a" * 40)
        self.assertEqual(result["stationCount"], 1)
        self.assertEqual(digest(self.target / "all.json.gz"), self.proof["allSha256"])

    def test_changed_static_fails(self):
        (self.source / "all.json.gz").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "generation differs"):
            verify_and_copy(self.bundle, self.historical, self.target, self.pin(), "a" * 40)

    def test_wrong_provenance_pin_fails(self):
        self.pin()
        with self.assertRaisesRegex(ValueError, "provenance SHA256"):
            verify_and_copy(self.bundle, self.historical, self.target, "0" * 64, "a" * 40)


if __name__ == "__main__":
    unittest.main()
