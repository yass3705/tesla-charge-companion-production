"""Pin-scale invariants for the additive #133 Phase 2 catalogue copy."""
import json
import os
import sqlite3
import unittest
from pathlib import Path


class Phase2CatalogueTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads(Path(os.environ['TCC_V9_PHASE2_COVERAGE_REPORT']).read_text())
        cls.db = sqlite3.connect(os.environ['TCC_V9_PHASE2_CATALOG_DB'])
        cls.db.execute("ATTACH DATABASE ? AS baseline", (os.environ['TCC_V9_CATALOG_DB'],))

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def count(self, query):
        return self.db.execute(query).fetchone()[0]

    def test_additive_byte_identical_baseline_offers(self):
        self.assertEqual(self.count('''SELECT COUNT(*) FROM baseline.RawOffer b
            LEFT JOIN main.RawOffer a ON a.raw_key=b.raw_key
            WHERE a.raw_key IS NULL OR a.raw_json!=b.raw_json OR a.source_sha256!=b.source_sha256
               OR a.offer_id!=b.offer_id'''), 0)
        self.assertEqual(self.count('SELECT COUNT(*) FROM main.RawOffer'), 578647)
        self.assertEqual(self.report['delta']['rawOffers'], 213581)

    def test_every_new_offer_has_scope_and_file_evidence(self):
        self.assertEqual(self.count('''SELECT COUNT(*) FROM main.RawOffer r
            LEFT JOIN main.OfferScope s ON s.raw_key=r.raw_key WHERE s.raw_key IS NULL'''), 0)
        self.assertEqual(self.count('''SELECT COUNT(*) FROM main.RawOffer r
            LEFT JOIN main.Evidence e ON e.source_path=r.source_path AND e.source_sha256=r.source_sha256
            WHERE e.source_path IS NULL'''), 0)

    def test_station_scope_cannot_become_point_scope(self):
        self.assertEqual(self.count('''SELECT COUNT(*) FROM main.OfferScope
            WHERE link_status='station_only_no_point_link' AND (point_key IS NOT NULL OR connector_key IS NOT NULL)'''), 0)
        self.assertEqual(self.count('''SELECT COUNT(*) FROM main.OfferScope
            WHERE link_status='source_exact_join' AND point_key IS NULL AND connector_key IS NULL'''), 0)
        self.assertEqual(self.count("SELECT COUNT(*) FROM main.OfferScope WHERE link_status='station_only_no_point_link'"), 29746)

    def test_lully_profile_and_midhope_connector_evidence(self):
        self.assertEqual(self.count("""SELECT COUNT(*) FROM main.RawOffer WHERE offer_id='e55c-scanpay-584ac48145a63ad4'"""), 1)
        self.assertEqual(self.count("""SELECT COUNT(*) FROM main.OfferScope s JOIN main.RawOffer r ON r.raw_key=s.raw_key
            WHERE r.offer_id='e55c-scanpay-584ac48145a63ad4' AND s.scope_kind='EVSE'
              AND s.link_status='source_exact_join'"""), 731)
        self.assertEqual(self.count("""SELECT COUNT(*) FROM main.OfferScope s
            JOIN main.RawOffer r ON r.raw_key=s.raw_key
            WHERE r.offer_id='e55c-scanpay-584ac48145a63ad4'
              AND s.source_id LIKE '%FR55CP78210SA1P21PL%'"""), 3)
        self.assertEqual(self.count("""SELECT COUNT(*) FROM main.RawOffer
            WHERE source_path='snapshot-inputs/UK/sources/uk_connected_kerb_midhope_verified_v9.json.gz'"""), 4)


if __name__ == '__main__':
    unittest.main()
