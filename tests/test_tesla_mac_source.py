import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from scripts.tesla_mac_source import verify


class TeslaMacSourceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(os.environ.get("TCC_TESLA_MAC_ROOT", "/tmp/tcc-dl-tesla"))
        if not (cls.source / "data/tesla/mac/last-good.json").is_file():
            raise unittest.SkipTest("Pinned Data Lab Mac fixture not checked out")

    def test_exact_seed_and_provenance(self):
        proof, path = verify(self.source)
        self.assertGreaterEqual(proof["stationCount"], 1100)
        self.assertEqual(len(json.loads(path.read_bytes())), proof["stationCount"])

    def test_corrupt_bytes_fail_and_original_remains_usable(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "data/tesla/mac"
            target.mkdir(parents=True)
            for name in ("catalogue.json", "last-good.json"):
                shutil.copyfile(self.source / "data/tesla/mac" / name, target / name)
            (target / "catalogue.json").write_bytes(b"[]\n")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                verify(temporary)
        self.assertGreaterEqual(verify(self.source)[0]["stationCount"], 1100)

    def test_bad_manifest_and_missing_catalogue_fail(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "data/tesla/mac"
            target.mkdir(parents=True)
            manifest = json.loads((self.source / "data/tesla/mac/last-good.json").read_text())
            manifest["catalogueSha256"] = "0" * 64
            (target / "last-good.json").write_text(json.dumps(manifest))
            with self.assertRaises(FileNotFoundError):
                verify(temporary)
            shutil.copyfile(self.source / "data/tesla/mac/catalogue.json", target / "catalogue.json")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                verify(temporary)


if __name__ == "__main__":
    unittest.main()
