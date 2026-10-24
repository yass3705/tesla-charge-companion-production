import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location("shard_v9", ROOT / "scripts/shard_v9_preproduction_data.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def fixture(root: Path) -> Path:
    candidate = root / "prepared"
    (candidate / "sources").mkdir(parents=True)
    data = {"schemaVersion": 1, "source": {"id": "NL:dotnl_static", "artifactSha256": "a" * 64},
            "countries": [{"code": "NL"}], "cpos": [{"id": "cpo", "country": "NL"}],
            "stations": [{"id": "one", "country": "NL", "cpoId": "cpo", "latitude": 52.3, "longitude": 4.9},
                         {"id": "two", "country": "NL", "cpoId": "cpo", "latitude": 50.8, "longitude": 5.7}],
            "evses": [{"id": "evse-one", "stationId": "one", "cpoId": "cpo", "country": "NL"},
                      {"id": "evse-two", "stationId": "two", "cpoId": "cpo", "country": "NL"}],
            "connectors": [{"id": "plug-one", "evseId": "evse-one"},
                           {"id": "plug-two", "evseId": "evse-two"}],
            "offers": [{"id": "offer-one", "channel": "Direct", "scope": {"evseId": "evse-one", "connectorId": "plug-one"},
                        "sourceTariffKey": "T1"},
                       {"id": "offer-two", "channel": "Direct", "scope": {"evseId": "evse-two", "connectorId": "plug-two"},
                        "sourceTariffKey": "T2"}],
            "tariffCatalog": {"T1": {"id": "T1"}, "T2": {"id": "T2"}}}
    raw = json.dumps(data).encode()
    (candidate / "sources/NL__dotnl_static.json").write_bytes(raw)
    index = {"schemaVersion": 1, "status": "prepared", "bundleId": "b" * 64,
             "sources": [{"source": "NL:dotnl_static", "path": "sources/NL__dotnl_static.json",
                          "sha256": hashlib.sha256(raw).hexdigest()}], "rejected": [], "joins": []}
    (candidate / "index.json").write_text(json.dumps(index))
    return candidate


class ShardV9PreproductionTest(unittest.TestCase):
    def test_exact_entities_and_tariff_scope_survive_spatial_partition(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = fixture(root)
            out = root / "sharded"
            report = MODULE.build(candidate, out, max_bytes=3000)
            self.assertEqual(report["shardCount"], 2)
            index = json.loads((out / "index.json").read_bytes())
            self.assertEqual(index["bundleId"], "b" * 64)
            self.assertEqual(MODULE.check_candidate(out)["schemaVersion"], 2)
            rows = []
            for item in index["sources"][0]["shards"]:
                raw = (out / item["path"]).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), item["sha256"])
                self.assertLessEqual(len(raw), 3000)
                shard = json.loads(raw)
                self.assertEqual(len(shard["stations"]), 1)
                self.assertEqual(len(shard["evses"]), 1)
                self.assertEqual(len(shard["connectors"]), 1)
                self.assertEqual(len(shard["offers"]), 1)
                self.assertEqual(list(shard["tariffCatalog"]), [shard["offers"][0]["sourceTariffKey"]])
                rows.extend(row["id"] for row in shard["stations"])
            self.assertEqual(sorted(rows), ["one", "two"])
            index["sources"][0]["shards"][0]["bbox"] = [0, 0, 0, 0]
            (out / "index.json").write_text(json.dumps(index))
            with self.assertRaisesRegex(ValueError, "bounding box omits"):
                MODULE.check_candidate(out)

    def test_corrupted_source_fails_before_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            candidate = fixture(root)
            (candidate / "sources/NL__dotnl_static.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "SHA"):
                MODULE.build(candidate, root / "sharded")
            self.assertFalse((root / "sharded").exists())


if __name__ == "__main__":
    unittest.main()
