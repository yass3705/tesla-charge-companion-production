import json
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_v9_remote_preview import verify, read_remote


class RemotePreviewCheckTests(unittest.TestCase):
    def test_transient_reads_retry_but_permanent_http_is_not_hidden(self):
        from unittest.mock import MagicMock, Mock
        from urllib.error import HTTPError
        from http.client import IncompleteRead
        response = MagicMock()
        response.__enter__.return_value = response
        response.status = 200
        response.headers = {"x-robots-tag": "noindex"}
        response.read.side_effect = [IncompleteRead(b"part", 20), b"complete"]
        opener = Mock(return_value=response)
        waits, events = [], []
        self.assertEqual(read_remote("https://preview.example.org/shard", opener=opener,
                                     sleeper=waits.append, on_retry=events.append)[0], b"complete")
        self.assertEqual(opener.call_count, 2)
        self.assertEqual(waits, [1])
        self.assertEqual(events[0]["error"], "IncompleteRead")
        failing = Mock(side_effect=TimeoutError("network"))
        with self.assertRaisesRegex(RuntimeError, "after 3 attempts.*shard"):
            read_remote("https://preview.example.org/shard", opener=failing, sleeper=lambda _: None)
        self.assertEqual(failing.call_count, 3)
        missing = Mock(side_effect=HTTPError("https://preview.example.org/shard", 404, "missing", {}, None))
        with self.assertRaises(HTTPError):
            read_remote("https://preview.example.org/shard", opener=missing, sleeper=lambda _: None)
        self.assertEqual(missing.call_count, 1)

    def test_fragment_receipt_resumes_only_same_immutable_candidate(self):
        from check_v9_remote_preview import ASSETS
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            site = root / "site"
            files = {name: b"asset" for name in ASSETS}
            files["v9-production-shell/shell-config.json"] = b"{}"
            fragments = {"prepared-v9/shards/a.json": b"a", "prepared-v9/shards/b.json": b"b"}
            files.update(fragments)
            files["prepared-v9/index.json"] = json.dumps({"schemaVersion": 2, "sources": [{"shards": [
                {"path": name.removeprefix("prepared-v9/"), "sha256": hashlib.sha256(body).hexdigest()}
                for name, body in fragments.items()]}]}).encode()
            for name, body in files.items():
                path = site / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(body)
            origin = "https://" + "a" * 24 + "--tcc-test.netlify.app"
            receipt = root / "receipt.jsonl"
            def read(url):
                name = url.split(".netlify.app/", 1)[1]
                return files[name], {"x-robots-tag": "noindex"}
            def interrupted(url):
                if url.endswith("/b.json"):
                    raise TimeoutError("interrupted transfer")
                return read(url)
            with patch("check_v9_remote_preview.check", return_value={"bundleId": "pinned"}):
                with self.assertRaises(TimeoutError):
                    verify(site, origin, interrupted, all_fragments=True, fragment_receipt=receipt, workers=1)
                self.assertEqual(len(receipt.read_text().splitlines()), 2)
                reader = Mock(side_effect=read)
                result = verify(site, origin, reader, all_fragments=True, fragment_receipt=receipt, workers=1)
                self.assertEqual(result["signedFragmentsVerified"], 2)
                self.assertEqual(result["previouslyVerifiedFragmentsReused"], 1)
                # The independent first-fragment and root/noindex checks still run.
                self.assertEqual(sum(c.args[0].endswith("/a.json") for c in reader.call_args_list), 1)
                self.assertEqual(len(receipt.read_text().splitlines()), 3)
                with self.assertRaisesRegex(ValueError, "provenance"):
                    verify(site, origin.replace("a" * 24, "b" * 24), read, fragment_receipt=receipt)
                with self.assertRaisesRegex(ValueError, "immutable"):
                    verify(site, "https://tcc-test.netlify.app", read, fragment_receipt=receipt)
                with self.assertRaisesRegex(ValueError, "noindex"):
                    verify(site, origin, lambda url: (read(url)[0], {}), all_fragments=True, fragment_receipt=receipt)
                old = files["prepared-v9/index.json"]
                files["prepared-v9/index.json"] = old + b" "
                (site / "prepared-v9/index.json").write_bytes(files["prepared-v9/index.json"])
                with self.assertRaisesRegex(ValueError, "provenance"):
                    verify(site, origin, read, fragment_receipt=receipt)

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
