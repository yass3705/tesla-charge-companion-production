import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from verify_zewatt_offer_source import verify_handoff


def fixture(ids, guest=True):
    return {
        "country": "FR", "mode": "verified_zewatt_direct",
        "directOffers": [{
            "directOperatorOnly": True, "verifiedScope": "exact_evse",
            "metadata": {"visitorStripeRequired": guest},
            "evseIds": ids, "pricing": {"type": "rules", "rules": [{"pricePerKwh": 0.2}]},
        }],
        "sourceEvidence": {"summary": {"exactEvseIds": len(ids)}},
    }


class ZeWattHandoffTest(unittest.TestCase):
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

    def test_new_evse_is_allowed_with_guest_direct_scope(self):
        digest = self.write(fixture(["A", "B"]), fixture(["A"]))
        self.assertEqual(verify_handoff(self.current, digest, self.old)["dataLab"]["exactEvseIds"], 2)

    def test_coverage_decrease_is_observed_with_exact_scope(self):
        digest = self.write(fixture(["A"]), fixture(["A", "B"]))
        result = verify_handoff(self.current, digest, self.old)
        self.assertEqual(result["dataLab"]["exactEvseIds"], 1)
        self.assertEqual(result["historical"]["exactEvseIds"], 2)
        self.assertEqual(result["sourceSha256"], digest)

    def test_non_guest_offer_is_rejected(self):
        digest = self.write(fixture(["A"], guest=False), fixture(["A"]))
        with self.assertRaisesRegex(ValueError, "non-guest"):
            verify_handoff(self.current, digest, self.old)

    def test_unpinned_file_is_rejected(self):
        self.write(fixture(["A"]), fixture(["A"]))
        with self.assertRaisesRegex(ValueError, "SHA256"):
            verify_handoff(self.current, "0" * 64, self.old)


if __name__ == "__main__":
    unittest.main()
