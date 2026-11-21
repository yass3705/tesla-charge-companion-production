import hashlib
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
        self.assertEqual(len(json.loads(path.read_bytes())), proof["stationCount"])

    def test_corrupt_bytes_fail_and_original_remains_usable(self):
        manifest_digest = verify(self.source)[0]["catalogueSha256"]
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "data/tesla/mac"
            target.mkdir(parents=True)
            for name in ("catalogue.json", "last-good.json"):
                shutil.copyfile(self.source / "data/tesla/mac" / name, target / name)
            (target / "catalogue.json").write_bytes(b"[]\n")
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                verify(temporary)
        self.assertEqual(verify(self.source)[0]["catalogueSha256"], manifest_digest)

    def test_one_country_change_uses_actual_manifest_and_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "data/tesla/mac"
            target.mkdir(parents=True)
            base = self.source / "data/tesla/mac"
            row = json.loads((base / "catalogue.json").read_bytes())[0]
            country = row["countryCode"]
            raw = json.dumps([row]).encode()
            manifest = json.loads((base / "last-good.json").read_bytes())
            manifest.update(stationCount=1, catalogueBytes=len(raw), catalogueSha256=hashlib.sha256(raw).hexdigest(),
                            countriesUpdated=[country], countryDates={country: manifest["countryDates"][country]})
            (target / "catalogue.json").write_bytes(raw)
            (target / "last-good.json").write_text(json.dumps(manifest))
            self.assertEqual(verify(temporary)[0]["stationCount"], 1)
            for changes in [{"stationCount": 2}, {"sourcePath": "unexpected"}, {"countryDates": {}}]:
                (target / "last-good.json").write_text(json.dumps({**manifest, **changes}))
                with self.assertRaises(ValueError):
                    verify(temporary)

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
