"""Dynamic UK coverage is accepted only when current source identities are coherent."""
import copy
import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    "compile_uk_direct_batch", Path(__file__).resolve().parents[1] / "scripts/compile_uk_direct_batch.py"
)
batch = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(batch)


def location(index, priced=True, price=0.83):
    cid = f"connector-{index}"
    return {
        "id": f"station-{index}", "country_code": "GB", "party_id": "ION", "publish": True,
        "coordinates": {"latitude": 52, "longitude": -1},
        "evses": [{"uid": cid, "connectors": [{
            "id": cid, "max_electric_power": 150000,
            "tariff_ids": [f"tariff-{index}"] if priced else [],
        }]}],
    }


class DynamicCoverage(unittest.TestCase):
    def compile(self, count, priced=True):
        locations = [location(i, priced) for i in range(count)]
        tariffs = [batch.tariff(f"tariff-{i}", 0.83) for i in range(count)] if priced else []
        return batch.source("IONITY", "ION", locations, tariffs, "fixture", b"fixture")

    def test_growth_decline_and_large_change(self):
        for count in (1, 84, 878, 2000):
            with self.subTest(count=count):
                result = self.compile(count)
                self.assertEqual((count, count, count), tuple(result["summary"][k] for k in ("locations", "connectors", "tariffs")))

    def test_missing_price_and_explicit_zero(self):
        self.assertEqual(0, self.compile(1, priced=False)["summary"]["tariffs"])
        self.assertEqual(0, batch.tariff("zero", 0)["elements"][0]["price_components"][0]["price"])

    def test_unexpected_zero_and_orphan_rejected(self):
        with self.assertRaisesRegex(AssertionError, "unexpectedly empty"):
            self.compile(0)
        with self.assertRaisesRegex(AssertionError, "orphan"):
            batch.source("IONITY", "ION", [location(0, False)], [batch.tariff("orphan", 1)], "fixture", b"fixture")

    def test_duplicate_connector_and_station_rejected(self):
        loc = location(0, False)
        loc["evses"][0]["connectors"].append(copy.deepcopy(loc["evses"][0]["connectors"][0]))
        with self.assertRaisesRegex(AssertionError, "duplicate exact connector"):
            batch.source("IONITY", "ION", [loc], [], "fixture", b"fixture")
        with self.assertRaisesRegex(AssertionError, "duplicate station"):
            batch.source("IONITY", "ION", [location(0, False), location(0, False)], [], "fixture", b"fixture")

    def test_ionity_missing_evse_not_fabricated(self):
        connector = {"uuid": "exact-connector", "sourceEvseId": "", "pricePerKwhGbp": None,
                     "powerKw": 350, "type": "CCS", "kind": "DC"}
        payload = {"locations": [{"uuid": "exact-station", "country": "GB", "cpoIdentifier": "IONITY_CPO",
                                 "connectors": [connector], "name": "IONITY", "latitude": 52, "longitude": -1}]}
        result = batch.ionity(payload, "fixture", b"fixture")
        evse = result["locations"][0]["evses"][0]
        self.assertEqual("exact-connector", evse["uid"])
        self.assertNotIn("evse_id", evse)
        self.assertEqual([], evse["connectors"][0]["tariff_ids"])
        connector["pricePerKwhGbp"] = 0
        self.assertEqual(0, batch.ionity(payload, "fixture", b"fixture")["tariffs"][0]["elements"][0]["price_components"][0]["price"])

    def test_one_failed_cpo_uses_dated_last_good_without_touching_other_cpos(self):
        previous = self.compile(1)
        previous["sourceAudit"]["collectedAt"] = "2026-10-17T10:00:00Z"
        preserved = batch.use_last_good("ionity.json.gz", ValueError("incomplete pagination"), {"ionity.json.gz": previous}, b"broken")
        other = self.compile(84)
        self.assertEqual("last_good_stale", preserved["summary"]["status"])
        self.assertEqual("2026-10-17T10:00:00Z", preserved["sourceAudit"]["lastGoodCollectedAt"])
        self.assertEqual(64, len(preserved["sourceAudit"]["rejectedSourceSha256"]))
        self.assertEqual(84, other["summary"]["locations"])
        self.assertEqual("complete", other["summary"]["status"])
        with self.assertRaisesRegex(AssertionError, "no dated last-good"):
            batch.use_last_good("missing", ValueError("empty"), {})


if __name__ == "__main__":
    unittest.main()
