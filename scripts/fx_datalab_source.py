"""Validate a pinned Data Lab FX file before using it in the V9 shell."""

import hashlib
import json


CODES = {"EUR", "CHF", "GBP", "NOK", "SEK", "DKK", "PLN", "CZK", "HUF", "RON", "BGN", "MAD", "DZD", "TND"}


def verify(path, expected_sha256):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected_sha256:
        raise ValueError("Pinned Data Lab FX SHA256 mismatch")
    data = json.loads(raw)
    if data.get("base") != "EUR" or set(data.get("rates", {})) != CODES:
        raise ValueError("Data Lab FX currency coverage mismatch")
    if data["rates"]["EUR"] != 1 or any(
        not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0
        for value in data["rates"].values()
    ):
        raise ValueError("Data Lab FX rate invalid")
    if not all(isinstance(data.get(field), str) and data[field] for field in ("date", "checkedAt", "source")):
        raise ValueError("Data Lab FX provenance incomplete")
    return {"sourceSha256": digest, "providerDate": data["date"], "checkedAt": data["checkedAt"]}
