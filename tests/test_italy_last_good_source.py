import gzip
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from italy_last_good_source import verify_and_copy


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ItalyLastGoodSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.source = root / "source"
        self.historical = root / "historical"
        self.target = root / "target"
        for directory in (self.source / "italy-static", self.historical / "italy-static", self.target):
            directory.mkdir(parents=True)
        tile = gzip.compress(b'[{}]', mtime=0)
        manifest = {
            "country": "IT", "stationCount": 1, "allFile": "all.json.gz",
            "allSha256": hashlib.sha256(tile).hexdigest(),
            "tiles": [{"file": "tile_1_1.json.gz", "sha256": hashlib.sha256(tile).hexdigest()}],
        }
        for directory in (self.source / "italy-static", self.historical / "italy-static"):
            for name in ("all.json.gz", "tile_1_1.json.gz"):
                (directory / name).write_bytes(tile)
            (directory / "manifest.json").write_text(json.dumps(manifest))
        offers = {"country": "IT", "directOffers": [{}], "subscriptionOffers": [{}], "emspOffers": [{}]}
        raw = json.dumps(offers).encode()
        (self.historical / "italy-offers.json").write_bytes(raw)
        (self.source / "italy-offers.json.gz").write_bytes(gzip.compress(raw, mtime=0))
        self.proof = {
            "country": "IT", "mode": "preserved_validated_v9_runtime",
            "sourceOffersSha256": digest(self.historical / "italy-offers.json"),
            "compressedOffersSha256": digest(self.source / "italy-offers.json.gz"),
            "staticManifestSha256": digest(self.source / "italy-static/manifest.json"),
            "stations": 1, "directOffers": 1, "subscriptionOffers": 1, "emspOffers": 1,
        }
        self.write_proof()
        (self.target / "unrelated.json").write_text("preserve")

    def write_proof(self):
        (self.source / "bundle.json").write_text(json.dumps(self.proof))
        return digest(self.source / "bundle.json")

    def test_exact_bundle_replaces_only_italy(self):
        proof = verify_and_copy(self.source, self.historical, self.target, self.write_proof())
        self.assertEqual(proof["directOffers"], 1)
        self.assertEqual(digest(self.target / "italy-offers.json"), proof["sourceOffersSha256"])
        self.assertEqual((self.target / "unrelated.json").read_text(), "preserve")

    def test_offer_change_fails_closed(self):
        (self.historical / "italy-offers.json").write_text("changed")
        with self.assertRaisesRegex(ValueError, "differ from validated baseline"):
            verify_and_copy(self.source, self.historical, self.target, self.write_proof())

    def test_unpinned_bundle_fails(self):
        with self.assertRaisesRegex(ValueError, "bundle SHA256"):
            verify_and_copy(self.source, self.historical, self.target, "0" * 64)


if __name__ == "__main__":
    unittest.main()
