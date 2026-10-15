import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fx_datalab_source import CODES, verify


class FXDataLabSourceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "rates.json"
        self.data = {
            "base": "EUR", "date": "2026-10-15", "checkedAt": "2026-10-15T03:37:00Z",
            "source": "provider", "rates": {code: 1.0 for code in CODES},
        }

    def write(self):
        self.path.write_text(json.dumps(self.data))
        return hashlib.sha256(self.path.read_bytes()).hexdigest()

    def test_pinned_complete_rates(self):
        self.assertEqual(verify(self.path, self.write())["providerDate"], "2026-10-15")

    def test_missing_quote_fails(self):
        self.data["rates"].pop("MAD")
        with self.assertRaisesRegex(ValueError, "coverage"):
            verify(self.path, self.write())

    def test_non_positive_rate_fails(self):
        self.data["rates"]["CHF"] = 0
        with self.assertRaisesRegex(ValueError, "rate invalid"):
            verify(self.path, self.write())

    def test_wrong_pin_fails(self):
        self.write()
        with self.assertRaisesRegex(ValueError, "SHA256"):
            verify(self.path, "0" * 64)


if __name__ == "__main__":
    unittest.main()
