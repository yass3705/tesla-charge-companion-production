import gzip
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_v9_emsp_exact_join_report import match_proofs, read_electroverse, read_electra


class ExactEmspJoinTest(unittest.TestCase):
    def test_only_unique_official_evse_matches_without_connector_or_price(self):
        national = {"evses": [
            {"id": "n1", "stationId": "s1", "country": "FR", "officialEvseId": "FR*ABC*E1"},
            {"id": "n2", "stationId": "s2", "country": "FR", "officialEvseId": "FR*ABC*E2"},
            {"id": "n3", "stationId": "s3", "country": "FR", "officialEvseId": "FR*ABC*E2"},
        ]}
        proofs = [
            {"channel": "Electra", "offerId": "p1", "officialEvseId": "FR*ABC*E1", "proof": "app"},
            {"channel": "Electroverse", "offerId": "p2", "officialEvseId": "FR*ABC*E1", "proof": "source"},
            {"channel": "Electra", "offerId": "p3", "officialEvseId": "FR*ABC*E2", "proof": "app"},
            {"channel": "Electroverse", "offerId": "p4", "officialEvseId": "FR*ABC*E9", "proof": "source"},
        ]
        result = match_proofs(national, proofs)
        self.assertEqual({row["channel"] for row in result["matches"]}, {"Electra", "Electroverse"})
        self.assertEqual({row["nationalEvseId"] for row in result["matches"]}, {"n1"})
        self.assertTrue(all(row["nationalConnectorId"] is None and "price" not in row for row in result["matches"]))
        self.assertEqual({row["reason"] for row in result["unmatched"]}, {"ambiguous_exact_evse", "no_exact_evse"})

    def test_tile_integrity_and_exact_proof_filter(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            offers = [
                {"id": "exact", "verifiedScope": "exact_evse", "evseIds": ["FR*ABC*E1"],
                 "metadata": {"identityMode": "exact_unique_national_irve_pdc"}},
                {"id": "geo", "verifiedScope": "exact_evse", "evseIds": ["FR*ABC*E2"],
                 "metadata": {"identityMode": "proximity"}},
            ]
            raw = gzip.compress(json.dumps({"country": "FR", "emspOffers": offers}).encode())
            (root / "t_0_0.json.gz").write_bytes(raw)
            manifest = {"country": "FR", "dataset": "electroverse-france-evse-national-overlay",
                        "tileCount": 1, "tiles": [{"file": "t_0_0.json.gz", "sha256": hashlib.sha256(raw).hexdigest(),
                                                  "bytes": len(raw), "count": len(offers)}]}
            (root / "manifest.json").write_text(json.dumps(manifest))
            rows, digest = read_electroverse(root)
            self.assertEqual([row["offerId"] for row in rows], ["exact"])
            self.assertEqual(len(digest), 64)
            (root / "t_0_0.json.gz").write_bytes(raw + b"bad")
            with self.assertRaisesRegex(ValueError, "SHA or length"):
                read_electroverse(root)

    def test_electra_screenshot_proof_required(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "electra.json"
            path.write_text(json.dumps({"schemaVersion": 1, "verifiedLinks": [
                {"screenshotSha256": "a" * 64, "verifiedForPublishedSource": "2026-10-10",
                 "mappings": [{"evseId": "FR*ABC*E1", "chargeTariffId": "T1", "rateEurPerKwh": 0.5}]},
                {"mappings": [{"evseId": "FR*ABC*E2", "chargeTariffId": "T2"}]},
            ]}))
            rows, _ = read_electra(path)
            self.assertEqual(rows, [{"channel": "Electra", "offerId": "T1",
                                    "officialEvseId": "FR*ABC*E1",
                                    "proof": "archived_app_screenshot_exact_evse_tariff_id"}])


if __name__ == "__main__":
    unittest.main()
