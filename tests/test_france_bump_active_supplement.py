import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from supplement_france_bump_active import read_gzip, sha256, source_index


class BumpActiveSupplementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.datalab = pathlib.Path(sys.argv[1])
        cls.candidate = pathlib.Path(sys.argv[2])
        cls.proof = json.loads((ROOT / "data/overlays/france-bump-active-supplement-evidence-2026-10-13.json").read_text())
        cls.static = cls.candidate / "runtime/data/v9/france-static"

    def test_exact_current_public_identity(self):
        newer = self.datalab / "data/national/france-irve-static-v9/all.json.gz"
        dynamic = self.datalab / "data/national/france-irve-dynamic-status-v9.json.gz"
        self.assertEqual(sha256(newer), self.proof["newerIrveSha256"])
        self.assertEqual(sha256(dynamic), self.proof["dynamicArtifactSha256"])
        active = set(read_gzip(dynamic)["enServicePdcIds"])
        source = source_index(read_gzip(newer))
        built = source_index(read_gzip(self.static / "all.json.gz"))
        approved = [item for row in self.proof["stations"] for item in row["evses"]]
        self.assertEqual((len(self.proof["stations"]), len(approved)), (21, 39))
        for item in approved:
            evse = item["evseId"]
            self.assertIn(evse, active)
            self.assertEqual(len(source[evse]), 1)
            self.assertEqual(len(built[evse]), 1)
            self.assertEqual(source[evse][0][0][0], built[evse][0][0][0])
            self.assertEqual(built[evse][0][0][5].casefold(), "bump")
        for item in self.proof["rejectedGeoOrName"]:
            self.assertNotIn(item["evseId"], built)

    def test_manifest_and_price_scope(self):
        manifest = json.loads((self.static / "manifest.json").read_text())
        self.assertEqual((manifest["stationCount"], manifest["pdcCount"]), (48083, 165848))
        self.assertEqual(manifest["tileCount"], len(manifest["tiles"]))
        self.assertEqual(sha256(self.static / "all.json.gz"), manifest["allSha256"])
        tiled_station_ids = set()
        for tile in manifest["tiles"]:
            self.assertEqual(sha256(self.static / tile["file"]), tile["sha256"])
            tiled_station_ids.update(row[0] for row in read_gzip(self.static / tile["file"]))
        self.assertTrue({station["nationalStationId"] for station in self.proof["stations"]} <= tiled_station_ids)
        offers = json.loads((self.candidate / "runtime/data/v9/france-bump-offers.json").read_text())
        attached = {evse for offer in offers["directOffers"] for evse in offer["evseIds"]}
        approved = {item["evseId"] for station in self.proof["stations"] for item in station["evses"]}
        self.assertTrue(approved <= attached)
        self.assertEqual(len(attached), 1783)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: test_france_bump_active_supplement.py DATALAB_ROOT CANDIDATE_ROOT")
    unittest.main(argv=[sys.argv[0]], verbosity=2)
