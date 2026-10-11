import copy
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from validate_r9_historical_sources import load_record, validate_built_sources, validate_compiled


class R9HistoricalSourcesTest(unittest.TestCase):
    def test_only_exact_snapshot_and_source_pins_use_historical_contract(self):
        config = json.loads((ROOT / "config/snapshots/2026-09-30-r9-electra-fr.json").read_text())
        record = load_record(config, config["sources"]["dataLab"]["sha"],
                             config["sources"]["stable"]["sha"])
        self.assertEqual(record["electroverseExpectedStats"]["publishedOffers"], 30676)
        for change in (
            lambda c: c.update(snapshotId="2026-10-12-r9999"),
            lambda c: c["sources"]["dataLab"].update(sha="a" * 40),
            lambda c: c["sourceSelection"].update(selectedDataLabCommit="a" * 40),
            lambda c: c["sources"]["stable"].update(sha="b" * 40),
        ):
            wrong = copy.deepcopy(config)
            change(wrong)
            with self.assertRaisesRegex(ValueError, "r9 historical provenance"):
                load_record(wrong)
        with self.assertRaisesRegex(ValueError, "Data Lab checkout"):
            load_record(config, "a" * 40)

    def test_compiled_counts_rejections_and_tile_integrity_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            tile = root / "tile.json.gz"
            tile.write_bytes(b"fixture")
            tile_meta = {"file": tile.name, "bytes": len(tile.read_bytes()),
                         "sha256": hashlib.sha256(tile.read_bytes()).hexdigest(), "count": 1}
            record = {"electroverseExpectedStats": {"publishedOffers": 1},
                      "electroverseExpectedRejected": {"unsupported_pricing": 2}}
            manifest = {"stats": copy.deepcopy(record["electroverseExpectedStats"]),
                        "rejected": copy.deepcopy(record["electroverseExpectedRejected"]),
                        "policy": {"nationalFranceIsIdentityHub": True,
                                   "exactUniqueNationalPdcOnly": True, "evseLevelPricing": True,
                                   "stationLevelFlattening": False,
                                   "electraDependency": False, "proximityInference": False,
                                   "heterogeneousConnectorsWithinEvseFailClosed": True,
                                   "unsupportedPricingFailClosed": True},
                        "tileCount": 1, "tiles": [tile_meta]}
            path = root / "manifest.json"
            path.write_text(json.dumps(manifest))
            validate_compiled(root, record)
            manifest["rejected"]["unsupported_pricing"] = 1
            path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "rejection ledger"):
                validate_compiled(root, record)
            manifest["rejected"]["unsupported_pricing"] = 2
            path.write_text(json.dumps(manifest))
            tile.write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "Electroverse tile"):
                validate_compiled(root, record)

    def test_embedded_source_changes_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            cache = root / "tariff_cache"
            cache.mkdir()
            names = [f"shard-{i:03d}.json" for i in range(128)]
            for name in names:
                (cache / name).write_bytes(name.encode())
            cache_manifest = {"shards": [{"file": name} for name in names]}
            (cache / "manifest.json").write_text(json.dumps(cache_manifest))
            mapping = root / "irve_location_mapping.json"
            mapping.write_text("{}")
            h = hashlib.sha256()
            for name in names:
                h.update(f"{name} {hashlib.sha256((cache / name).read_bytes()).hexdigest()}\n".encode())
            record = {"electroverseCacheManifestSha256": hashlib.sha256((cache / "manifest.json").read_bytes()).hexdigest(),
                      "electroverseMappingSha256": hashlib.sha256(mapping.read_bytes()).hexdigest(),
                      "electroverseCacheShardsSha256": h.hexdigest()}
            (root / "historical-provenance.json").write_text(json.dumps(record))
            validate_built_sources(root, record)
            (cache / names[0]).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "shard set"):
                validate_built_sources(root, record)
            (cache / names[0]).write_bytes(names[0].encode())
            mapping.write_text('{"changed":true}')
            with self.assertRaisesRegex(ValueError, "embedded mapping"):
                validate_built_sources(root, record)


if __name__ == "__main__":
    unittest.main()
