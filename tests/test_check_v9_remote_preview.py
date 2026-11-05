import json
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_v9_remote_preview import verify


class RemotePreviewCheckTests(unittest.TestCase):
    def test_remote_integrity_origin_and_noindex(self):
        with tempfile.TemporaryDirectory() as directory:
            site = Path(directory)
            files = {
                "index.html": b"preview",
                "robots.txt": b"User-agent: *\nDisallow: /\n",
                "v9-production-shell/index.html": b"shell",
                "v9-production-shell/shell-config.json": b"{}",
                "v9-production-shell/bridge.js": b"bridge",
                "prepared-v9/index.json": json.dumps({"schemaVersion": 2, "sources": [
                    {"shards": [{"path": "shards/FR__test__0000.json",
                                 "sha256": hashlib.sha256(b"fragment").hexdigest()}]}]}).encode(),
                "prepared-v9/shards/FR__test__0000.json": b"fragment",
                "runtime/data/v9/france-crosswalk.json": b"crosswalk",
            }
            for name, body in files.items():
                path = site / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)

            def read(url):
                path = url.split("preview.example.org/", 1)[1]
                return files[path], {"x-robots-tag": "noindex"}

            with patch("check_v9_remote_preview.check", return_value={"bundleId": "pinned"}):
                result = verify(site, "https://preview.example.org/", read)
                self.assertEqual(result["status"], "remote_static_verified")
                self.assertFalse(result["browserVerified"])
                self.assertIn("runtime/data/v9/france-crosswalk.json", result["checkedAssets"])
                self.assertEqual(verify(site, "https://preview.example.org/", read,
                                        all_fragments=True)["signedFragmentsVerified"], 1)
                with self.assertRaisesRegex(ValueError, "crosswalk SHA mismatch"):
                    verify(site, "https://preview.example.org/", lambda url: (
                        b"corrupt" if url.endswith("france-crosswalk.json") else read(url)[0],
                        {"x-robots-tag": "noindex"}))
                with self.assertRaisesRegex(ValueError, "Public TCC origin"):
                    verify(site, "https://teslachargecompanion.com/", read)
                with self.assertRaisesRegex(ValueError, "Preview must use HTTPS"):
                    verify(site, "http://preview.example.org/", read)
                with self.assertRaisesRegex(ValueError, "noindex"):
                    verify(site, "https://preview.example.org/", lambda url: (read(url)[0], {}))
                with self.assertRaisesRegex(ValueError, "SHA mismatch"):
                    verify(site, "https://preview.example.org/", lambda url: (
                        b"corrupt" if url.endswith("bridge.js") else read(url)[0],
                        {"x-robots-tag": "noindex"}))
                import gzip
                ledger = gzip.compress(b'{"complete":"join evidence"}', mtime=0)
                files["prepared-v9/joins/FR__test.json.bin"] = ledger
                index = json.loads(files["prepared-v9/index.json"])
                index["joins"] = [{"path": "joins/FR__test.json.bin",
                                   "sha256": hashlib.sha256(ledger).hexdigest()}]
                files["prepared-v9/index.json"] = json.dumps(index).encode()
                (site / "prepared-v9/index.json").write_bytes(files["prepared-v9/index.json"])
                result = verify(site, "https://preview.example.org/", read)
                self.assertIn("prepared-v9/joins/FR__test.json.bin", result["checkedAssets"])
                with self.assertRaisesRegex(ValueError, "join SHA mismatch"):
                    verify(site, "https://preview.example.org/", lambda url: (
                        b"truncated" if url.endswith(".json.bin") else read(url)[0],
                        {"x-robots-tag": "noindex"}))


if __name__ == "__main__":
    unittest.main()
