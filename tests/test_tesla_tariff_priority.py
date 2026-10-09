import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from tesla_tariff_priority import select_tariffs


def station(code, ident, amount, observed=None):
    price = {"rules": [{"currency": "EUR", "pricePerKwh": amount}]}
    row = {"id": ident, "countryCode": code, "pricing": copy.deepcopy(price),
           "chargingConfigurations": [{"id": ident + ":main", "pricing": copy.deepcopy(price)}],
           "name": ident, "stalls": 8}
    if observed is not None:
        row["sourceObservedAt"] = observed
    return row


class PriorityTest(unittest.TestCase):
    def setUp(self):
        self.mac = [station("FR", "fr", .4, "2026-10-07"),
                    station("PT", "pt", .4, "2026-09-27"),
                    station("MA", "ma", .4, "2026-01-01"),
                    station("DE", "de", .4, "2026-09-20"),
                    station("GB", "gb", .4, "2026-09-20")]
        self.suc = [station(code, ident, .5, "2026-10-02T13:02:45.599Z")
                    for code, ident in [("FR", "fr"), ("PT", "pt"), ("MA", "ma"), ("DE", "de")]]
        self.updates = {"schemaVersion": 1, "timeZone": "Europe/Paris",
                        "countries": {"FR": {"updatedOn": "2026-10-07"},
                                      "PT": {"updatedOn": "2026-09-27"},
                                      "MA": {"updatedOn": "2026-01-01"}}}

    @staticmethod
    def prices(rows):
        return {r["id"]: r["pricing"]["rules"][0]["pricePerKwh"] for r in rows}

    def test_country_date_boundary_and_morocco(self):
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows), {"fr": .4, "pt": .5, "ma": .4, "de": .5, "gb": .4})
        self.assertEqual(rows[1]["chargingConfigurations"][0]["pricing"], rows[1]["pricing"])
        self.assertEqual(report["countries"]["PT"]["ageCalendarDays"], 10)
        self.assertEqual(report["countries"]["GB"]["missingSucFallbacks"], 1)
        self.assertEqual(self.mac[1]["pricing"]["rules"][0]["pricePerKwh"], .4)

    def test_ninth_day_uses_mac_even_if_suc_newer(self):
        self.updates["countries"]["PT"]["updatedOn"] = "2026-09-28"
        self.suc[1]["sourceObservedAt"] = "2026-10-07T00:00:00Z"
        rows, _ = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["pt"], .4)

    def test_tenth_day_suc_older_and_equal_both_keep_mac(self):
        for observed in ["2026-09-25T19:00:00Z", "2026-09-27T12:00:00Z"]:
            with self.subTest(observed=observed):
                self.suc[1]["sourceObservedAt"] = observed
                rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
                self.assertEqual(self.prices(rows)["pt"], .4)
                self.assertEqual(report["countries"]["PT"]["olderOrEqualSucFallbacks"], 1)
                self.assertEqual(report["countries"]["PT"]["sucTariffs"], 0)

    def test_newer_station_override_only_not_entire_country(self):
        self.mac.append(station("PT", "pt-older", .4, "2026-09-27"))
        self.suc.append(station("PT", "pt-older", .7, "2026-09-23T09:00:00Z"))
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["pt"], .5)
        self.assertEqual(self.prices(rows)["pt-older"], .4)
        self.assertEqual(report["countries"]["PT"]["sucTariffs"], 1)
        self.assertEqual(report["countries"]["PT"]["olderOrEqualSucFallbacks"], 1)

    def test_download_date_does_not_count_as_observation(self):
        self.suc[1]["sourceObservedAt"] = "2026-09-20"
        self.suc[1]["sucTracker"] = {"lastCheckedAt": "2026-10-07T23:00:00Z",
                                      "datasetGeneratedAt": "2026-10-07T23:00:00Z"}
        rows, _ = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["pt"], .4)

    def test_missing_or_bad_suc_observation_keeps_mac(self):
        for value in [None, "unparseable", "2026-10-08T00:00:00Z"]:
            with self.subTest(value=value):
                if value is None:
                    self.suc[1].pop("sourceObservedAt", None)
                else:
                    self.suc[1]["sourceObservedAt"] = value
                rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
                self.assertEqual(self.prices(rows)["pt"], .4)
                self.assertEqual(report["countries"]["PT"]["unknownSucDateFallbacks"], 1)

    def test_fallback_to_suc_station_last_successful_observation(self):
        self.suc[1].pop("sourceObservedAt")
        self.suc[1]["sucTracker"] = {"lastSuccessfulAt": "2026-10-02T11:00:00Z"}
        rows, _ = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["pt"], .5)

    def test_mac_without_date_does_not_get_unproven_override(self):
        self.mac[3].pop("sourceObservedAt")
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["de"], .4)
        self.assertEqual(report["countries"]["DE"]["unknownMacDateFallbacks"], 1)

    def test_suc_location_id_matches_mac_tesla_url(self):
        self.mac[3]["teslaUrl"] = "https://www.tesla.com/findus/location/supercharger/aachensupercharger"
        self.suc[3]["id"] = "tesla-suc-aachensupercharger"
        self.suc[3]["sucTracker"] = {"sourceStationId": "aachensupercharger"}
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["de"], .5)
        self.assertEqual(report["countries"]["DE"]["sucTariffs"], 1)

    def test_countries_interleaved_use_correct_dates(self):
        self.mac.extend([station("FR", "fr2", .4, "2026-09-01"),
                         station("PT", "pt2", .4, "2026-09-01")])
        self.suc.extend([station("FR", "fr2", .5, "2026-10-02"),
                         station("PT", "pt2", .5, "2026-10-02")])
        rows, report = select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")
        self.assertEqual(self.prices(rows)["fr2"], .4)
        self.assertEqual(self.prices(rows)["pt2"], .5)
        self.assertEqual(report["countries"]["FR"]["sucTariffs"], 0)

    def test_future_country_date_is_rejected(self):
        self.updates["countries"]["FR"]["updatedOn"] = "2026-10-08"
        with self.assertRaises(ValueError):
            select_tariffs(self.mac, self.suc, self.updates, "2026-10-07")


if __name__ == "__main__":
    unittest.main()
