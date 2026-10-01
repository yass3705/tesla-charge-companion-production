import json
import pathlib
import subprocess
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
SCRIPT=ROOT/"scripts/build_refresh_candidate_config.py"
BASE=ROOT/"config/snapshots/2026-09-30-r9-electra-fr.json"

class SnapshotSourceSelectionTests(unittest.TestCase):
    def build(self,*extra):
        with tempfile.TemporaryDirectory() as temp:
            out=pathlib.Path(temp)/"candidate.json"
            subprocess.run([
                "python",str(SCRIPT),
                "--base",str(BASE),
                "--datalab-sha","a"*40,
                "--snapshot-id","test-snapshot",
                "--out",str(out),
                *extra
            ],check=True,capture_output=True,text=True)
            return json.loads(out.read_text(encoding="utf-8"))

    def test_default_keeps_existing_tesla_source(self):
        obj=self.build()
        tesla=next(x for x in obj["datasets"] if x["id"]=="TESLA")
        self.assertEqual(tesla["primarySource"],"stable")

    def test_explicit_flag_pins_tesla_to_same_datalab_sha(self):
        obj=self.build("--use-datalab-tesla")
        tesla=next(x for x in obj["datasets"] if x["id"]=="TESLA")
        self.assertEqual(tesla["primarySource"],"dataLab")
        self.assertEqual(tesla["path"],"data/suc-tracker/tesla_stations.json")
        self.assertEqual(tesla["metadata"],"data/suc-tracker/metadata.json")
        self.assertEqual(obj["sources"]["dataLab"]["sha"],"a"*40)
        self.assertIn("same pinned Data Lab SHA", " ".join(obj["sourceSelection"]["safeguards"]))

if __name__=="__main__":
    unittest.main()
