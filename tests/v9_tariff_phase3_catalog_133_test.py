"""Pin-scale preservation and active DOT-NL provenance invariants."""
import os
import sqlite3
import unittest


class Phase3CatalogueTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(os.environ['TCC_V9_PHASE3_CATALOG_DB'])
        cls.db.execute('ATTACH DATABASE ? AS phase2', (os.environ['TCC_V9_PHASE2_CATALOG_DB'],))

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def count(self, query):
        return self.db.execute(query).fetchone()[0]

    def test_all_phase2_offers_preserved(self):
        self.assertEqual(self.count('''SELECT COUNT(*) FROM phase2.RawOffer p
            LEFT JOIN main.RawOffer n ON n.raw_key=p.raw_key
            WHERE n.raw_key IS NULL OR n.raw_json!=p.raw_json OR n.source_sha256!=p.source_sha256
              OR n.offer_id!=p.offer_id'''), 0)
        self.assertEqual(self.count('SELECT COUNT(*) FROM main.RawOffer'), 666631)

    def test_active_compact_has_distinct_exact_evidence(self):
        active = 'snapshot-inputs/NL/runtime/all.json.gz'
        historic = 'runtime/data/non_tesla_netherlands/all.json.gz'
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM RawOffer WHERE source_path=?', (active,)).fetchone()[0], 87984)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM RawOffer WHERE source_path=?', (historic,)).fetchone()[0], 45553)
        self.assertEqual(self.db.execute('''SELECT COUNT(*) FROM RawOffer r
            JOIN OfferScope s ON s.raw_key=r.raw_key WHERE r.source_path=?
              AND s.link_status='source_exact_join' AND s.point_key IS NOT NULL''', (active,)).fetchone()[0], 87984)
        self.assertEqual(self.db.execute('''SELECT COUNT(*) FROM RawOffer r
            LEFT JOIN Evidence e ON e.source_path=r.source_path AND e.source_sha256=r.source_sha256
            WHERE r.source_path=? AND e.evidence_key IS NULL''', (active,)).fetchone()[0], 0)

    def test_site_identity_does_not_become_tariff_scope(self):
        self.assertEqual(self.count('''SELECT COUNT(*) FROM OfferScope
            WHERE link_status='station_only_no_point_link' AND
              (point_key IS NOT NULL OR connector_key IS NOT NULL)'''), 0)


if __name__ == '__main__':
    unittest.main()
