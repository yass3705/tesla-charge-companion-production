"""G6.6b-1: import an immutable diagnostic projection into the exact national
canonical catalogue. No price attachment, source mutation or publication."""
import argparse, collections, csv, gzip, hashlib, io, json, math, os, re, tempfile, zipfile
from pathlib import Path
from import_v9_bundle import verify

SOURCE = "FR:irve_static"
NAMES = {"g66-runtime-identity-projection.csv.gz", "g66-runtime-quotes.csv.gz", "g66-runtime-report.json"}
PLUG = {"TYPE2": "TYPE2", "Type 2": "TYPE2", "CCS": "CCS", "EF": "EF"}
def canonical_plug(value):
    """IRVE compact group label is not an OCPI plug token."""
    if not isinstance(value, str): return None
    if value in PLUG: return PLUG[value]
    match = re.fullmatch(r"IRVE · (Type 2|CCS|EF) [0-9]+(?:\.[0-9]+)? kW", value)
    return PLUG[match.group(1)] if match else None

def digest(b): return hashlib.sha256(b).hexdigest()
def rows(b): return list(csv.DictReader(io.StringIO(gzip.decompress(b).decode("utf-8"))))
def power(v):
    if v is None or v == "": return None
    x = float(v)
    if not math.isfinite(x) or x < 0: raise ValueError("Invalid power")
    return x if x > 0 else None

def import_projection(zip_path, pin):
    raw = zip_path.read_bytes()
    if digest(raw) != pin["zipSha256"]: raise ValueError("ZIP SHA mismatch")
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(z.namelist()) != len(NAMES) or set(z.namelist()) != NAMES or z.testzip() is not None:
            raise ValueError("Artifact file set or CRC invalid")
        files = {n:z.read(n) for n in NAMES}
    if {n:digest(v) for n,v in files.items()} != pin["files"]:
        raise ValueError("Export SHA mismatch")
    report = json.loads(files["g66-runtime-report.json"])
    if report["codeSha"] != pin["codeSha"] or report["automaticPublication"] is not False or report["pricesPromoted"] != 0 or report["identityChanges"] != 0 or report["supplierCalls"] != 0:
        raise ValueError("Source scope invalid")
    projection = rows(files["g66-runtime-identity-projection.csv.gz"])
    quotes = rows(files["g66-runtime-quotes.csv.gz"])
    for field in ("national_id","source_id"):
        if any(not r[field] for r in projection) or len({r[field] for r in projection}) != len(projection):
            raise ValueError("Projection identity collision")
    keys = {(q["signature"], q["scenario"]) for q in quotes}
    if len(keys) != len(quotes) or any(q["publication_eligible"] != "False" for q in quotes):
        raise ValueError("Quote scope or uniqueness invalid")
    signatures = {r["tariff_signature"] for r in projection}
    if len(projection) != report["identityPairs"] or len(quotes) != report["quoteCases"] or signatures != {q["signature"] for q in quotes} or len(signatures) != report["signatures"]:
        raise ValueError("Internal count mismatch")
    return projection, report

def crosswalk(national, projection):
    if national["source"]["id"] != SOURCE: raise ValueError("Not national France")
    stations = {s["id"]:s for s in national["stations"]}
    evses = collections.defaultdict(list)
    connectors = collections.defaultdict(list)
    for e in national["evses"]:
        evses[e.get("officialEvseId")].append(e)
    for c in national["connectors"]:
        connectors[c["evseId"]].append(c)
    results = []
    for r in projection:
        out = dict(r, nationalStationKey=None, nationalEvseKey=None, nationalConnectorKey=None, publicationEligible=False)
        es = evses.get(r["evse_id"], [])
        reason = None
        if len(es) != 1: reason = "EVSE_ABSENT" if not es else "EVSE_AMBIGUOUS"
        else:
            e = es[0]; s = stations[e["stationId"]]
            if s["sourceStationId"] != r["station_id"]: reason = "STATION_ID_CHANGED"
            elif s.get("publicAccessDecision") == "exclude_non_public": reason = "NON_PUBLIC"
            elif (e.get("rawSourceFields") or {}).get("ambiguousNationalEvseId"): reason = "EVSE_AMBIGUOUS"
            elif power(r["national_kw"]) is None: reason = "NATIONAL_POWER_MISSING"
            else:
                cs = [c for c in connectors[e["id"]] if canonical_plug(c.get("plugType")) == r["national_plug"] and c.get("kind") == r["national_mode"]]
                if not cs: reason = "PLUG_OR_CURRENT_MISMATCH"
                else:
                    matches = [c for c in cs if power(c.get("powerKw")) == power(r["national_kw"])]
                    if len(matches) != 1: reason = "POWER_MISMATCH" if not matches else "CONNECTOR_AMBIGUOUS"
                    else: out.update(nationalStationKey=s["id"], nationalEvseKey=e["id"], nationalConnectorKey=matches[0]["id"])
        out["reason"] = reason or "EXACT_RUNTIME_CROSSWALK"
        results.append(out)
    counts = collections.Counter(r["nationalConnectorKey"] for r in results if r["nationalConnectorKey"])
    for r in results:
        if r["nationalConnectorKey"] and counts[r["nationalConnectorKey"]] != 1:
            r.update(nationalStationKey=None,nationalEvseKey=None,nationalConnectorKey=None,reason="CROSSWALK_COLLISION")
    return results

def build(bundle, artifact, pin, out):
    if out.exists(): raise ValueError("New staging destination required")
    manifest = verify(bundle, selected_source=SOURCE)
    entry = next(e for e in manifest["sources"] if e["source"] == SOURCE)
    national = json.loads((bundle / entry["path"]).read_bytes())
    projection, report = import_projection(artifact,pin)
    result = crosswalk(national,projection)
    counts = dict(collections.Counter(r["reason"] for r in result))
    receipt = dict(status="diagnostic_crosswalk_only", bundleId=bundle.name,
        nationalCanonicalSha256=entry["sha256"], nationalSourceArtifactSha256=entry["sourceArtifactSha256"],
        sourcePin=pin, counts=counts, identities=len(result), matched=counts.get("EXACT_RUNTIME_CROSSWALK",0),
        pricesPromoted=0, published=False, runtimeActivated=False)
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=out.parent) as temp:
        stage=Path(temp)/"result"; stage.mkdir()
        payload=json.dumps(result,sort_keys=True,separators=(",",":")).encode()
        (stage/"crosswalk.json.gz").write_bytes(gzip.compress(payload,mtime=0))
        receipt["crosswalkSha256"]=digest((stage/"crosswalk.json.gz").read_bytes())
        (stage/"receipt.json").write_text(json.dumps(receipt,sort_keys=True,indent=2)+"\n")
        stage.rename(out)
    return receipt

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    for name in ("bundle","artifact","pin","out"): p.add_argument("--"+name,type=Path,required=True)
    a=p.parse_args()
    print(json.dumps(build(a.bundle,a.artifact,json.loads(a.pin.read_bytes()),a.out)))
