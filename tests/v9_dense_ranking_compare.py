#!/usr/bin/env python3
"""Compare cold dense searches on two isolated V9 packages, without publication."""
from __future__ import annotations

import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def measure(site: Path, firefox: str) -> dict:
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options()
    options.add_argument("-headless")
    options.binary_location = firefox
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_script_timeout(180)
            browser.get(f"http://127.0.0.1:{server.server_port}/")
            WebDriverWait(browser, 40).until(lambda driver: driver.execute_script(
                "return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error"))
            if not browser.execute_script("return window.__TCC_V9_SHELL__?.ready"):
                raise AssertionError("Isolated V9 shell did not start")
            browser.execute_script("""
                window.resolveOrigin=async()=>({lat:52.3676,lon:4.9041,label:'Amsterdam'});
                sessionStorage.setItem('tcc-v9-country:52.368,4.904','NL');
                document.getElementById('simOrigin').value='Amsterdam';
                document.getElementById('simMaxDistance').value='100';
                document.getElementById('simOperatorFilter').dataset.v9Mode='all';
                document.getElementById('simDate').value='2026-10-28';
                document.getElementById('simTime').value='12:00';
                document.getElementById('simUnplugTime').value='';
                performance.clearResourceTimings();
            """)
            result = browser.execute_async_script("""
                const done=arguments[0],start=performance.now();
                const digest=async value=>{
                  const bytes=new TextEncoder().encode(JSON.stringify(value));
                  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
                  return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
                };
                window.compare().then(async area=>{
                  const ranks=area.mapRankingRows||[],map=area.mapStations||[];
                  const rankRows=ranks.map(row=>[row.station.id,row.total,row.costPerKm,row.distanceKm,
                    row.score?.totalTimeMinutes,row.evaluation?.best?.total]);
                  const pageRows=(area.stations||[]).map(st=>[st.id,(st.offers||[]).map(o=>[
                    o.id,o.kind,o.provider,o.currency,o.pricing]),(st.unparsedOffers||[]).map(o=>o.id)]);
                  const evaluated=Object.entries(area.sessionEvaluations||{}).sort((a,b)=>a[0].localeCompare(b[0]));
                  const shards=performance.getEntriesByType('resource').filter(e=>e.name.includes('/prepared-v9/shards/'));
                  done({matching:area.diagnostics?.sourceStationCount,visible:area.stations?.length,
                    mapCount:map.length,rankCount:ranks.length,
                    rankSha:await digest(rankRows),mapSha:await digest(map.map(st=>[st.id,st.page])),
                    pageSha:await digest(pageRows),evaluationSha:await digest(evaluated),
                    elapsedMs:Math.round(performance.now()-start),
                    shardCount:shards.length,shardLastResponseMs:Math.round(Math.max(...shards.map(e=>e.responseEnd))-start),
                    sourceErrors:area.diagnostics?.errors||[]});
                }).catch(error=>done({error:String(error)}));
            """)
            if result.get("error"):
                raise AssertionError(result["error"])
            return result
    finally:
        server.shutdown()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--baseline-json", type=Path,
                        help="Previously measured baseline result with identical fixed inputs")
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--firefox", default="/Applications/Firefox.app/Contents/MacOS/firefox")
    args = parser.parse_args()
    if not args.baseline and not args.baseline_json:
        parser.error("--baseline or --baseline-json is required")
    baseline = (json.loads(args.baseline_json.read_bytes())["baseline"] if args.baseline_json
                else measure(args.baseline, args.firefox))
    candidate = measure(args.candidate, args.firefox)
    keys = ("matching", "visible", "mapCount", "rankCount", "rankSha", "mapSha",
            "pageSha", "evaluationSha", "sourceErrors")
    differences = {key: [baseline.get(key), candidate.get(key)] for key in keys
                   if baseline.get(key) != candidate.get(key)}
    result = {"baseline": baseline, "candidate": candidate, "differences": differences,
              "sameBusinessResult": not differences, "deployed": False}
    print(json.dumps(result, sort_keys=True))
    if differences:
        raise SystemExit("Dense ranking business result differs")


if __name__ == "__main__":
    main()
