import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from verify_zephyre_offer_source import verify_handoff


def fixture(ids, scope="exact_evse"):
    return {
        "country": "FR", "mode": "verified_zephyre_direct",
        "directOffers": [{
            "directOperatorOnly": True, "verifiedScope": scope,
            "evseIds": ids, "pricing": {"type": "rules", "rules": [{"pricePerKwh": 0.2}]},
        }],
        "sourceEvidence": {"exactEvseIds": len(ids)},
    }


class ZephyreHandoffTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.current = root / "current.json"
        self.old = root / "old.json"

    def write(self, current, old):
        self.current.write_text(json.dumps(current))
        self.old.write_text(json.dumps(old))
        return hashlib.sha256(self.current.read_bytes()).hexdigest()

    def test_valid_pinned_source_with_more_evse(self):
        digest = self.write(fixture(["A", "B"]), fixture(["A"]))
        result = verify_handoff(self.current, digest, self.old)
        self.assertEqual(result["dataLab"]["exactEvseIds"], 2)

    def test_coverage_drop_fails(self):
        digest = self.write(fixture(["A"]), fixture(["A", "B"]))
        with self.assertRaisesRegex(ValueError, "coverage decreased"):
            verify_handoff(self.current, digest, self.old)

    def test_ambiguous_scope_fails(self):
        digest = self.write(fixture(["A"], "station"), fixture(["A"]))
        with self.assertRaisesRegex(ValueError, "exact EVSE scope"):
            verify_handoff(self.current, digest, self.old)

    def test_wrong_pin_fails(self):
        self.write(fixture(["A"]), fixture(["A"]))
        with self.assertRaisesRegex(ValueError, "SHA256"):
            verify_handoff(self.current, "0" * 64, self.old)


if __name__ == "__main__":
    unittest.main()
