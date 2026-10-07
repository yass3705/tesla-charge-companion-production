import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from tesla_tariff_priority import select_tariffs


def station(code, ident, amount):
    price = {"rules": [{"currency": "EUR", "pricePerKwh": amount}]}
    return {"id": ident, "countryCode": code, "pricing": copy.deepcopy(price),
            "chargingConfigurations": [{"id": ident + ":main", "pricing": copy.deepcopy(price)}],
            "name": ident, "stalls": 8}


class PriorityTest(unittest.TestCase):
    def setUp(self):
        self.mac = [station("FR", "fr", .4), station("PT", "pt", .4),
                    station("MA", "ma", .4), station("DE", "de", .4),
                    station("GB", "gb", .4)]
        self.suc = [station(code, ident, .5) for code, ident in
                    [("FR", "fr"), ("PT", "pt"), ("MA", "ma"), ("DE", "de")]]
        self.updates = {"schemaVersion": 1, "timeZone": "Europe/Paris",
                        "countries": {"FR": {"updatedOn": "2026-10-07"},
                                      "PT": {"updatedOn": "2026-09-27"},
                                      "MA": {"updatedOn": "2026-01-01"}}}

    def test_country_date_boundary_and_morocco(self):
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        prices = {row["id"]: row["pricing"]["rules"][0]["pricePerKwh"] for row in rows}
        self.assertEqual(prices, {"fr": .4, "pt": .5, "ma": .4, "de": .5, "gb": .4})
        self.assertEqual(rows[1]["chargingConfigurations"][0]["pricing"], rows[1]["pricing"])
        self.assertEqual(report["countries"]["PT"]["ageCalendarDays"], 10)
        self.assertEqual(report["countries"]["GB"]["missingSucFallbacks"], 1)
        self.assertEqual(self.mac[1]["pricing"]["rules"][0]["pricePerKwh"], .4)

    def test_ninth_day_uses_mac(self):
        self.updates["countries"]["PT"]["updatedOn"] = "2026-09-28"
        rows, _ = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(rows[1]["pricing"]["rules"][0]["pricePerKwh"], .4)

    def test_suc_location_id_matches_mac_tesla_url(self):
        self.mac[3]["teslaUrl"] = "https://www.tesla.com/findus/location/supercharger/aachensupercharger"
        self.suc[3]["id"] = "tesla-suc-aachensupercharger"
        self.suc[3]["sucTracker"] = {"sourceStationId": "aachensupercharger"}
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(rows[3]["pricing"]["rules"][0]["pricePerKwh"], .5)
        self.assertEqual(report["countries"]["DE"]["sucTariffs"], 1)

    def test_future_country_date_is_rejected(self):
        self.updates["countries"]["FR"]["updatedOn"] = "2026-10-08"
        with self.assertRaises(ValueError):
            select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")


if __name__ == "__main__":
    unittest.main()
