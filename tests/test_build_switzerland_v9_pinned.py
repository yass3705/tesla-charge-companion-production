import gzip
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_switzerland_v9.py"
spec = importlib.util.spec_from_file_location("build_switzerland_v9", SCRIPT)
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)


class PinnedSwissBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.national = root / "national.json.gz"
        feed = {"OperatorID": "CH*ABC", "OperatorName": "ABC", "Stations": [{
            "ChargingStationId": "S1", "ChargingStationNames": [{"value": "Example"}],
            "GeoCoordinates": {"Google": "47.0,8.0"},
            "EvseID": "CH*ABC*E1", "ChargingFacilities": [{"power": 22, "powertype": "AC"}],
        }]}
        self.national.write_bytes(gzip.compress(json.dumps(feed).encode(), mtime=0))
        self.datalab = root / "datalab"
        self.source = self.datalab / "data/switzerland/migrol-official-direct-tariffs.json"
        self.source.parent.mkdir(parents=True)
        self.source.write_text(json.dumps({"cpo": "ABC", "evses": [
            {"evseId": "CH*ABC*E1", "pricePerKwh": 0.5}
        ]}))
        self.fx = root / "exchange_rates.json"
        self.fx.write_text(json.dumps({"date": "2026-10-15", "rates": {"CHF": 0.95}}))
        self.output = root / "output"
        self.args = ["build_switzerland_v9.py", "--national-file", str(self.national),
                     "--datalab-root", str(self.datalab), "--fx-file", str(self.fx),
                     "--output-root", str(self.output)]

    def test_builds_local_inventory_and_direct_offer(self):
        with patch.object(compiler, "SOURCES", ["data/switzerland/migrol-official-direct-tariffs.json"]), patch.object(sys, "argv", self.args):
            compiler.main()
        manifest = json.loads((self.output / "switzerland-static/manifest.json").read_text())
        offers = json.loads((self.output / "switzerland-offers.json").read_text())
        self.assertEqual((manifest["stationCount"], manifest["evseCount"]), (1, 1))
        self.assertEqual(len(offers["directOffers"]), 1)
        self.assertEqual(offers["directOffers"][0]["evseIds"], ["CH*ABC*E1"])

    def test_missing_pinned_offer_source_fails_closed(self):
        with patch.object(compiler, "SOURCES", ["data/switzerland/missing.json"]), patch.object(sys, "argv", self.args):
            with self.assertRaisesRegex(RuntimeError, "Pinned Swiss CPO inputs"):
                compiler.main()
        self.assertFalse((self.output / "switzerland-offers.json").exists())


if __name__ == "__main__":
    unittest.main()
