import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/build_v9_exact_join_report.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("build_v9_exact_join_report", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def candidate(root):
    source_dir = root / "sources"
    source_dir.mkdir(parents=True)
    national = {"schemaVersion": 1, "source": {"id": "FR:irve_static", "artifactSha256": "a" * 64},
                "countries": [{"code": "FR"}], "cpos": [{"id": "cpo"}],
                "stations": [{"id": "station", "cpoId": "cpo", "country": "FR"}],
                "evses": [{"id": "n1", "stationId": "station", "cpoId": "cpo", "country": "FR",
                           "sourceEvseId": "FR*ABC*E1", "officialEvseId": "FR*ABC*E1"}],
                "connectors": [{"id": "plug", "evseId": "n1", "sourceConnectorId": "1", "officialConnectorId": "1"}],
                "offers": []}
    tariff = {"schemaVersion": 1, "source": {"id": "FR:exact_tariff", "artifactSha256": "b" * 64},
              "countries": [{"code": "FR"}], "cpos": [{"id": "cpo2"}],
              "stations": [{"id": "s2", "cpoId": "cpo2", "country": "FR"}],
              "evses": [{"id": "t1", "stationId": "s2", "cpoId": "cpo2", "country": "FR",
                         "sourceEvseId": "FR*ABC*E1", "officialEvseId": "FR*ABC*E1"}],
              "connectors": [{"id": "tplug", "evseId": "t1", "sourceConnectorId": "1", "officialConnectorId": "1"}],
              "offers": [{"id": "offer", "channel": "Direct", "scope": {"evseId": "t1", "connectorId": "tplug"},
                          "rawOffer": {"privatePrice": 999}, "calculationStatus": "not_evaluated"}]}
    entries = []
    for source, payload in (("FR:irve_static", national), ("FR:exact_tariff", tariff)):
        path = "sources/" + source.replace(":", "__") + ".json"
        raw = json.dumps(payload).encode()
        (root / path).write_bytes(raw)
        entries.append({"source": source, "path": path, "sha256": MODULE.hashlib.sha256(raw).hexdigest()})
    (root / "index.json").write_text(json.dumps({"schemaVersion": 1, "status": "prepared",
        "bundleId": "a" * 64, "sources": entries, "rejected": []}))


class ExactJoinReportTests(unittest.TestCase):
    def test_report_is_immutable_and_contains_no_tariff_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            prepared, output = root / "candidate", root / "reports"
            candidate(prepared)
            first = MODULE.build(prepared, "FR:irve_static", output)
            second = MODULE.build(prepared, "FR:irve_static", output)
            self.assertEqual(first["sha256"], second["sha256"])
            report = json.loads(Path(first["report"]).read_bytes())
            self.assertEqual(report["statistics"]["matchedOfferCount"], 1)
            self.assertEqual(report["statistics"]["bySource"]["FR:exact_tariff"],
                             {"matchedOffers": 1, "unmatchedOffers": 0, "distinctNationalEvses": 1})
            self.assertEqual(report["statistics"]["byChannel"]["Direct"]["matchedOffers"], 1)
            self.assertEqual(report["statistics"]["byChannel"]["Electroverse"]["matchedOffers"], 0)
            self.assertEqual(report["matches"][0]["nationalConnectorId"], "plug")
            self.assertNotIn("privatePrice", Path(first["report"]).read_text())
            (prepared / "sources" / "FR__exact_tariff.json").write_text("tampered")
            with self.assertRaisesRegex(ValueError, "SHA"):
                MODULE.build(prepared, "FR:irve_static", output)
            self.assertEqual(Path(first["report"]).read_bytes(), Path(second["report"]).read_bytes())


if __name__ == "__main__":
    unittest.main()
