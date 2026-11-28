import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

from test_import_v9_bundle import bundle

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from compose_reviewed_import import compose, sha


class ScheduledImportTest(unittest.TestCase):
    def test_pin_lineage_contents_and_replay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            previous = bundle(root, "a")
            renewed = bundle(root, "b")
            archive = root / "import.zip"
            dest = root / "store"
            dest.mkdir()
            manifest = json.loads((renewed / "manifest.json").read_bytes())
            receipt = {"published": False, "event": "schedule", "artifactZipSha256": "c" * 64,
                       "runId": 123, "bundle": renewed.name, "sources": [r["source"] for r in manifest["sources"]]}
            for damaged in (True, False):
                with zipfile.ZipFile(archive, "w") as out:
                    out.writestr("receipt.json", json.dumps(receipt))
                    for file in renewed.iterdir():
                        out.write(file, f"bundles/{renewed.name}/{file.name}")
                        if file.name != "manifest.json":
                            out.writestr("production-import/"+file.name, b"incomplete" if damaged else file.read_bytes())
                pin = sha(archive.read_bytes())
                for bad_pin, bad_parent in ((pin, "e" * 64), ("f" * 64, "c" * 64)):
                    with self.assertRaises(ValueError):
                        compose(previous, archive, bad_pin, bad_parent, dest)
                if damaged:
                    with self.assertRaisesRegex(ValueError, "Imported bytes differ"):
                        compose(previous, archive, pin, "c" * 64, dest)
                    self.assertEqual(list(dest.iterdir()), [])
                else:
                    for _ in range(2):
                        result = compose(previous, archive, pin, "c" * 64, dest)
                        self.assertEqual(result["bundleId"], renewed.name)
            self.assertEqual(sha((previous / "manifest.json").read_bytes()), previous.name)
