import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class DatasetMigrationSafetyTests(unittest.TestCase):
    def test_es_it_source_must_not_switch_before_parity(self):
        audit = json.loads((ROOT / "config/migration/es-it-stable-to-datalab-audit.json").read_text())
        snapshot = json.loads((ROOT / "config/snapshots/2026-10-13-be-energyvision-official-cpo-candidate.json").read_text())
        datasets = {d["id"]: d for d in snapshot["datasets"]}
        self.assertEqual(audit["migrationState"], "inventory-only-no-source-switch")
        for country in ("ES", "IT"):
            with self.subTest(country=country):
                entry = audit["countries"][country]
                self.assertFalse(entry["readyForSourceSwitch"])
                self.assertEqual(datasets[country]["primarySource"], "stable")
                self.assertTrue(entry["blockers"])
        self.assertEqual(audit["stableSha"], snapshot["sources"]["stable"]["sha"])


if __name__ == "__main__":
    unittest.main()
