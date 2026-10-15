import gzip
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from spain_reve_source import verify_bundle


class SpainReveSourceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        static = self.root / "spain-static"
        offers = self.root / "spain-reve-offers"
        static.mkdir()
        offers.mkdir()

        def payload(directory, name, rows):
            path = directory / name
            path.write_bytes(gzip.compress(json.dumps(rows).encode("utf-8")))
            return hashlib.sha256(path.read_bytes()).hexdigest()

        all_sha = payload(static, "all.json.gz", [["station", "EVSE"]])
        tile_sha = payload(static, "tile.json.gz", [["station", "EVSE"]])
        offer_sha = payload(offers, "offers.json.gz", {"directOffers": [{"evseIds": ["EVSE"]}]})
        (static / "manifest.json").write_text(json.dumps({
            "country": "ES", "generatedAt": "2026-09-27T00:00:00Z",
            "allFile": "all.json.gz", "allSha256": all_sha,
            "stationCount": 1, "uniqueEvseIds": 1, "physicalEvseOccurrences": 1,
            "tiles": [{"file": "tile.json.gz", "sha256": tile_sha, "count": 1}],
        }))
        (offers / "manifest.json").write_text(json.dumps({
            "country": "ES", "generatedAt": "2026-09-27T00:00:00Z", "offerCount": 1,
            "tiles": [{"file": "offers.json.gz", "sha256": offer_sha, "count": 1}],
        }))

    def test_complete_bundle_is_accepted(self):
        self.assertEqual(verify_bundle(self.root)["uniqueEvseIds"], 1)

    def test_corrupt_tile_is_rejected(self):
        (self.root / "spain-static/tile.json.gz").write_bytes(b"broken")
        with self.assertRaisesRegex(ValueError, "SHA256"):
            verify_bundle(self.root)

    def test_mixed_generations_are_rejected(self):
        path = self.root / "spain-reve-offers/manifest.json"
        manifest = json.loads(path.read_text())
        manifest["generatedAt"] = "2026-10-15T00:00:00Z"
        path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "generations"):
            verify_bundle(self.root)


if __name__ == "__main__":
    unittest.main()
