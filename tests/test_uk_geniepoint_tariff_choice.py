import importlib.util
import unittest
from pathlib import Path


SPEC = importlib.util.spec_from_file_location(
    "compile_uk_direct_batch", Path(__file__).resolve().parents[1] / "scripts/compile_uk_direct_batch.py"
)
compiler = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(compiler)


class GeniePointTariffChoice(unittest.TestCase):
    def test_walk_up_tariff_wins_irrespective_of_reference_order(self):
        tariffs = {
            "walkup": {"id": "walkup", "type": "AD_HOC_PAYMENT", "currency": "GBP"},
            "member": {"id": "member", "type": "REGULAR", "currency": "GBP"},
        }
        for refs in (["walkup", "member"], ["member", "walkup"]):
            with self.subTest(refs=refs):
                self.assertIs(compiler.geniepoint_direct_tariff(refs, tariffs), tariffs["walkup"])

    def test_ambiguous_or_missing_identity_stays_unpriced(self):
        tariffs = {
            "a": {"type": "AD_HOC_PAYMENT"},
            "b": {"type": "AD_HOC_PAYMENT"},
            "r": {"type": "REGULAR"},
        }
        for refs in ([], ["missing"], ["a", "b"], ["r", "r"], ["a", "r", "b"]):
            with self.subTest(refs=refs):
                self.assertIsNone(compiler.geniepoint_direct_tariff(refs, tariffs))


if __name__ == "__main__":
    unittest.main()
