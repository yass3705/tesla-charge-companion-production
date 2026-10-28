import json
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
                    {"shards": [{"path": "shards/FR__test__0000.json"}]}]}).encode(),
                "prepared-v9/shards/FR__test__0000.json": b"fragment",
            }
            for name, body in files.items():
                path = site / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)

            def read(url):
                path = url.split("preview.pages.dev/", 1)[1]
                return files[path], {"x-robots-tag": "noindex"}

            with patch("check_v9_remote_preview.check", return_value={"bundleId": "pinned"}):
                result = verify(site, "https://preview.pages.dev/", read)
                self.assertEqual(result["status"], "remote_static_verified")
                self.assertFalse(result["browserVerified"])
                with self.assertRaisesRegex(ValueError, "Public TCC origin"):
                    verify(site, "https://teslachargecompanion.com/", read)
                with self.assertRaisesRegex(ValueError, "Preview must use HTTPS"):
                    verify(site, "http://preview.pages.dev/", read)
                with self.assertRaisesRegex(ValueError, "noindex"):
                    verify(site, "https://preview.pages.dev/", lambda url: (read(url)[0], {}))
                with self.assertRaisesRegex(ValueError, "SHA mismatch"):
                    verify(site, "https://preview.pages.dev/", lambda url: (
                        b"corrupt" if url.endswith("bridge.js") else read(url)[0],
                        {"x-robots-tag": "noindex"}))


if __name__ == "__main__":
    unittest.main()
