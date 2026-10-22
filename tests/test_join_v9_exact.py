import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/join_v9_exact.py"
SPEC = importlib.util.spec_from_file_location("join_v9_exact", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExactJoinTest(unittest.TestCase):
    def setUp(self):
        self.national = {"evses": [{"id": "n1", "country": "FR", "officialEvseId": "FR*ABC*E1", "stationId": "station"},
                                    {"id": "n2", "country": "FR", "officialEvseId": "FR*ABC*E2", "stationId": "station"}],
                         "connectors": [{"id": "c1", "evseId": "n1", "officialConnectorId": "1"},
                                        {"id": "c2", "evseId": "n1", "officialConnectorId": "2"}]}

    def source(self, evse_id="FR*ABC*E1", connector_id="1", channel="Direct"):
        return {"source": {"id": "FR:archived_source"},
                "evses": [{"id": "s1", "country": "FR", "officialEvseId": evse_id}],
                "connectors": [{"id": "sc1", "evseId": "s1", "officialConnectorId": connector_id}],
                "offers": [{"id": "offer", "channel": channel, "scope": {"evseId": "s1", "connectorId": "sc1"}}]}

    def test_exact_connector_only_and_channel(self):
        result = MODULE.match_offers(self.national, [self.source(channel="Electroverse")])
        self.assertEqual(result["matches"][0]["nationalConnectorId"], "c1")
        self.assertEqual(result["matches"][0]["channel"], "Electroverse")
        self.assertEqual(result["matches"][0]["proof"], "exact_official_evse_and_connector")
        self.assertEqual(result["statistics"]["nationalEvseCount"], 2)

    def test_no_station_or_power_propagation(self):
        result = MODULE.match_offers(self.national, [self.source(evse_id="FR*ABC*E9")])
        self.assertEqual(result["matches"], [])
        self.assertEqual(result["unmatched"][0]["reason"], "no_exact_evse")
        result = MODULE.match_offers(self.national, [self.source(connector_id="3")])
        self.assertEqual(result["matches"], [])
        self.assertEqual(result["unmatched"][0]["reason"], "no_exact_connector")

    def test_missing_and_ambiguous_ids_stay_unmatched(self):
        self.assertEqual(MODULE.match_offers(self.national, [self.source(evse_id=None)])["unmatched"][0]["reason"], "official_evse_id_missing")
        self.assertEqual(MODULE.match_offers(self.national, [self.source(connector_id=None)])["unmatched"][0]["reason"], "official_connector_id_missing")
        self.national["evses"].append({"id": "n3", "country": "FR", "officialEvseId": "FR*ABC*E1", "stationId": "other"})
        self.assertEqual(MODULE.match_offers(self.national, [self.source()])["unmatched"][0]["reason"], "ambiguous_exact_evse")


if __name__ == "__main__":
    unittest.main()
