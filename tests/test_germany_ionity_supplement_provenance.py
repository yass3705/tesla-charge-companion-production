import copy
import gzip
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from build_germany_ionity_inventory_supplement import build, provenance_for, require_checkout_sha, validate_result


class GermanyIonityProvenanceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name)
        self.national_path = root / "national.json.gz"
        self.direct_path = root / "ionity.json.gz"
        self.manifest_path = root / "provenance.json"
        self.national = {"sites": [{"operator": "IONITY", "coordinates": {"latitude": 50, "longitude": 8}}]}
        self.direct = {"locations": [
            {"country": "DE", "cpoIdentifier": "IONITY_CPO", "uuid": "00000000-0000-4000-8000-000000000001",
             "latitude": 50, "longitude": 8, "name": "Known"},
            {"country": "DE", "cpoIdentifier": "IONITY_CPO", "uuid": "00000000-0000-4000-8000-000000000002",
             "latitude": 51, "longitude": 9, "name": "Isolated", "connectors": [{"powerKw": 150}]},
        ]}
        self.entry = {"id": "fixture", "referenceDataLabSha": "a" * 40,
                      "expected": {"nationalBaselineStations": 1, "ionitySourceLocations": 2,
                                   "alreadyNearNationalIonity": 1, "quarantinedNearThirdParty": 0,
                                   "isolatedUnpricedSupplement": 1}}
        self.write_sources()

    def write_sources(self):
        for path, data in ((self.national_path, self.national), (self.direct_path, self.direct)):
            with gzip.open(path, "wt", encoding="utf-8") as stream:
                json.dump(data, stream)
        self.entry["nationalSha256"] = hashlib.sha256(self.national_path.read_bytes()).hexdigest()
        self.entry["ionitySha256"] = hashlib.sha256(self.direct_path.read_bytes()).hexdigest()
        self.manifest_path.write_text(json.dumps({"schemaVersion": 1, "sources": [self.entry]}))

    def test_known_provenance_and_unpriced_inventory(self):
        entry = provenance_for(self.national_path, self.direct_path, "a" * 40, self.manifest_path)
        result = build(self.national, self.direct)
        validate_result(result, entry)
        self.assertEqual(result["metadata"]["alreadyNearNationalIonity"], 1)
        self.assertEqual(result["sites"][0]["evseIds"], [])
        self.assertEqual(result["sites"][0]["pricing"], {})

    def test_changed_source_and_unknown_provenance_fail(self):
        self.direct_path.write_bytes(self.direct_path.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "Unknown Germany IONITY source provenance"):
            provenance_for(self.national_path, self.direct_path, "a" * 40, self.manifest_path)
        self.manifest_path.write_text(json.dumps({"schemaVersion": 1, "sources": []}))
        with self.assertRaisesRegex(ValueError, "Unknown Germany IONITY source provenance"):
            provenance_for(self.national_path, self.direct_path, "a" * 40, self.manifest_path)

    def test_same_source_bytes_across_unrelated_data_lab_commits(self):
        # Different Data Lab commit, identical approved DE source payloads:
        # no new manifest row is necessary, but the checkout remains traceable.
        known = provenance_for(self.national_path, self.direct_path, "a" * 40, self.manifest_path)
        moved = provenance_for(self.national_path, self.direct_path, "b" * 40, self.manifest_path)
        self.assertEqual(known["id"], moved["id"])
        explicitly_allowed = copy.deepcopy(self.entry)
        explicitly_allowed["id"] = "same-bytes-different-commit"
        explicitly_allowed["referenceDataLabSha"] = "b" * 40
        self.manifest_path.write_text(json.dumps({"schemaVersion": 1, "sources": [self.entry, explicitly_allowed]}))
        self.assertEqual(provenance_for(self.national_path, self.direct_path, "b" * 40, self.manifest_path)["id"],
                         "same-bytes-different-commit")
        self.assertEqual(provenance_for(self.national_path, self.direct_path, "c" * 40, self.manifest_path)["id"],
                         "fixture")

    def test_checkout_still_must_equal_the_snapshot_pin(self):
        require_checkout_sha("a" * 40, "a" * 40)
        with self.assertRaisesRegex(ValueError, "Data Lab checkout SHA mismatch"):
            require_checkout_sha("b" * 40, "a" * 40)
        with self.assertRaisesRegex(ValueError, "Invalid Data Lab checkout SHA"):
            provenance_for(self.national_path, self.direct_path, "not-a-commit", self.manifest_path)

    def test_unknown_source_pair_and_contradictory_counts_fail(self):
        wrong_pair = copy.deepcopy(self.entry)
        wrong_pair["ionitySha256"] = "0" * 64
        self.manifest_path.write_text(json.dumps({"schemaVersion": 1, "sources": [wrong_pair]}))
        with self.assertRaisesRegex(ValueError, "Unknown Germany IONITY source provenance"):
            provenance_for(self.national_path, self.direct_path, "b" * 40, self.manifest_path)
        conflicting = copy.deepcopy(self.entry)
        conflicting["id"] = "contradictory-provenance"
        conflicting["referenceDataLabSha"] = "b" * 40
        conflicting["expected"]["isolatedUnpricedSupplement"] = 99
        self.manifest_path.write_text(json.dumps({"schemaVersion": 1, "sources": [self.entry, conflicting]}))
        with self.assertRaisesRegex(ValueError, "Conflicting Germany IONITY source provenance"):
            provenance_for(self.national_path, self.direct_path, "a" * 40, self.manifest_path)
        with self.assertRaisesRegex(ValueError, "Conflicting Germany IONITY source provenance"):
            provenance_for(self.national_path, self.direct_path, "c" * 40, self.manifest_path)

    def test_duplicate_uuid_and_invalid_coordinate_fail(self):
        duplicate = copy.deepcopy(self.direct)
        duplicate["locations"][1]["uuid"] = duplicate["locations"][0]["uuid"]
        with self.assertRaisesRegex(ValueError, "duplicate provider UUID"):
            build(self.national, duplicate)
        invalid = copy.deepcopy(self.direct)
        invalid["locations"][1]["latitude"] = 91
        with self.assertRaisesRegex(ValueError, "invalid coordinate"):
            build(self.national, invalid)

    def test_count_drift_and_guessed_prices_fail(self):
        result = build(self.national, self.direct)
        wrong = copy.deepcopy(self.entry)
        wrong["expected"]["isolatedUnpricedSupplement"] = 2
        with self.assertRaisesRegex(ValueError, "isolatedUnpricedSupplement"):
            validate_result(result, wrong)
        result["sites"][0]["pricing"] = {"pricePerKwh": 0.5}
        with self.assertRaisesRegex(ValueError, "remain unpriced"):
            validate_result(result, self.entry)

    def test_quarantine_and_evse_identity_drift_fail(self):
        self.national["sites"].append({"operator": "Other", "coordinates": {"latitude": 51, "longitude": 9}})
        result = build(self.national, self.direct)
        changed = copy.deepcopy(self.entry)
        changed["expected"]["nationalBaselineStations"] = 2
        changed["expected"]["quarantinedNearThirdParty"] = 1
        changed["expected"]["isolatedUnpricedSupplement"] = 0
        validate_result(result, changed)
        result["metadata"]["quarantine"][0]["providerUuid"] = "00000000-0000-4000-8000-000000000099"
        result["metadata"]["quarantine"].append(copy.deepcopy(result["metadata"]["quarantine"][0]))
        result["metadata"]["quarantinedNearThirdParty"] = 2
        changed["expected"]["quarantinedNearThirdParty"] = 2
        with self.assertRaisesRegex(ValueError, "quarantine identity"):
            validate_result(result, changed)
        clean = build({"sites": self.national["sites"][:1]}, self.direct)
        clean["sites"][0]["evseIds"] = ["invented"]
        with self.assertRaisesRegex(ValueError, "remain unpriced"):
            validate_result(clean, self.entry)


if __name__ == "__main__":
    unittest.main()
