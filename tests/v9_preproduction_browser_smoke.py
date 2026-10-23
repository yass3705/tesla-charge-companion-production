#!/usr/bin/env python3
"""Exercise an isolated prepared TCC shell with real candidate files, offline origins."""
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


def run(site: Path, firefox: str, screenshots: Path | None = None) -> dict:
    if not (site / "prepared-v9/index.json").is_file() or not (site / "v9-production-shell/index.html").is_file():
        raise ValueError("Isolated packaged site required")
    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass

    handler = functools.partial(QuietHandler, directory=str(site))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    options = Options()
    options.add_argument("-headless")
    options.binary_location = firefox
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(1280, 900)
            browser.set_script_timeout(45)
            browser.get(f"http://127.0.0.1:{server.server_port}/v9-production-shell/")
            WebDriverWait(browser, 30).until(lambda driver: driver.execute_script(
                "return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error"))
            marker = browser.execute_script("return window.__TCC_V9_SHELL__")
            if marker.get("ready") is not True:
                raise AssertionError(f"TCC shell did not load: {marker}")

            def compare(lat: float, lon: float, country: str, label: str, min_power: int | None = None) -> dict:
                browser.execute_script("""
                    const [lat,lon,country,label,minPower]=arguments;
                    window.resolveOrigin=async()=>({lat,lon,label});
                    sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
                    document.getElementById('simOrigin').value=label;
                    document.getElementById('simMaxDistance').value='200';
                    document.getElementById('simOperatorFilter').dataset.v9Mode='all';
                    document.getElementById('simMinPowerKw').value=minPower==null?'':String(minPower);
                """, lat, lon, country, label, min_power)
                result = browser.execute_async_script("""
                    const done=arguments[0];window.compare().then(area=>done({
                      count:area.stations.length,prepared:area.preproductionCandidate,
                      priced:area.stations.reduce((n,s)=>n+(s.offers||[]).length,0),
                      raw:area.stations.reduce((n,s)=>n+(s.unparsedOffers||[]).length,0),
                      firstSource:area.stations[0]?.provenance?.[0]?.sourceId||null
                    })).catch(error=>done({error:String(error)}));
                """)
                if "error" in result:
                    raise AssertionError(result["error"])
                if result["count"] <= 0 or result["priced"] != 0 or result["raw"] <= 0:
                    raise AssertionError(f"Candidate physical/pricing isolation failed: {result}")
                return result

            fr = compare(48.856, 2.352, "FR", "Paris fixture")
            text = browser.execute_script("return document.getElementById('results').innerText")
            for label in ("IONITY Direct · FR", "Extraction :", "Tarif incalculable", "Prix non disponible", "Direct", "Electra", "Electroverse"):
                if label not in text:
                    raise AssertionError(f"FR station view missing {label!r}")
            if "Base source : IRVE" in text:
                raise AssertionError("Canonical CPO provenance replaced by national fallback")
            if screenshots:
                screenshots.mkdir(parents=True, exist_ok=True)
                browser.execute_script("document.getElementById('results').scrollIntoView()")
                browser.save_screenshot(str(screenshots / "prepared-fr-station-list.png"))
            browser.execute_script("document.querySelector('.v9-view-map').click()")
            WebDriverWait(browser, 10).until(lambda driver: driver.execute_script(
                "return document.querySelectorAll('.v9-map-marker').length>0"))
            map_state = browser.execute_script("""
                return {markers:document.querySelectorAll('.v9-map-marker').length,
                    tiles:document.querySelectorAll('.v9-map-tiles img').length,
                    help:document.querySelector('#v9MapSummary .small').innerText};
            """)
            if map_state["markers"] <= 0 or "sans prix simulé" not in map_state["help"]:
                raise AssertionError(f"Prepared map invalid: {map_state}")
            browser.execute_script("document.querySelector('.v9-map-marker').click()")
            if not browser.execute_script("return document.getElementById('v9MapSelected').innerText.trim()"):
                raise AssertionError("Map marker selection did not open station detail")
            browser.execute_script("document.querySelector('.v9-map-tiles img').dispatchEvent(new Event('error'))")
            if browser.execute_script("return getComputedStyle(document.querySelector('.v9-map-tile-warning')).display") != "block":
                raise AssertionError("Tile failure was not disclosed")
            if screenshots:
                browser.execute_script("document.getElementById('v9MapSummary').scrollIntoView()")
                browser.save_screenshot(str(screenshots / "prepared-fr-map.png"))
            filtered = compare(48.856, 2.352, "FR", "Paris fixture", 300)
            if filtered["count"] > fr["count"]:
                raise AssertionError("Minimum power filter expanded result set")
            gb = compare(51.507, -0.128, "GB", "London fixture")
            gb_text = browser.execute_script("return document.getElementById('results').innerText")
            if "IONITY Direct · UK" not in gb_text:
                raise AssertionError("UK candidate provenance missing")
            return {"fr": fr, "gb": gb, "minPower300": filtered["count"], "map": map_state}
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True, type=Path)
    parser.add_argument("--firefox", default="/Applications/Firefox.app/Contents/MacOS/firefox")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.site, args.firefox, args.screenshots), ensure_ascii=False))
