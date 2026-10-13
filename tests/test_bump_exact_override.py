import copy
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from build_bump_exact_override import validate


class BumpExactOverrideTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stable = pathlib.Path(sys.argv[1])
        candidate = pathlib.Path(sys.argv[2])
        cls.inventory = candidate / "runtime/data/v9/france-static/all.json.gz"
        cls.stable_catalogue = stable / "v9-production-runtime/data/v9/france-bump-offers.json"
        cls.payload = json.loads((candidate / "runtime/data/v9/france-bump-offers.json").read_text())

    def test_exact_accounting_and_operator(self):
        proof = validate(self.payload, self.inventory, self.stable_catalogue)
        self.assertEqual((proof["attachedEvse"], proof["unjoinedCurrentSourceEvse"]), (1744, 543))
        self.assertEqual((proof["retainedOldEvse"], proof["removedOldEvse"], proof["newAttachedEvse"]),
                         (1690, 60, 54))

    def test_foreign_evse_and_duplicate_are_rejected(self):
        foreign = copy.deepcopy(self.payload)
        foreign["directOffers"][0]["evseIds"][0] = "UNRELATED-EVSE"
        with self.assertRaisesRegex(AssertionError, "unique Bump IRVE identity"):
            validate(foreign, self.inventory, self.stable_catalogue)
        duplicate = copy.deepcopy(self.payload)
        duplicate["directOffers"][0]["evseIds"].append(duplicate["directOffers"][0]["evseIds"][0])
        with self.assertRaisesRegex(AssertionError, "duplicate an exact EVSE"):
            validate(duplicate, self.inventory, self.stable_catalogue)

    def test_parser_only_rule_is_rejected(self):
        invalid = copy.deepcopy(self.payload)
        invalid["directOffers"][0]["pricing"]["rules"][0]["kind"] = "energy"
        with self.assertRaisesRegex(AssertionError, "parser-only rule"):
            validate(invalid, self.inventory, self.stable_catalogue)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: test_bump_exact_override.py STABLE_ROOT CANDIDATE_ROOT")
    unittest.main(argv=[sys.argv[0]], verbosity=2)
