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
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def run(site: Path, firefox: str, screenshots: Path | None = None) -> dict:
    if not (site / "prepared-v9/index.json").is_file() or not (site / "v9-production-shell/index.html").is_file():
        raise ValueError("Isolated packaged site required")
    source_ids = {row["source"] for row in json.loads((site / "prepared-v9/index.json").read_bytes())["sources"]}
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

            def compare(lat: float, lon: float, country: str, label: str, min_power: int | None = None,
                        radius: int = 200, require_raw: bool = True) -> dict:
                browser.execute_script("""
                    const [lat,lon,country,label,minPower]=arguments;
                    window.resolveOrigin=async()=>({lat,lon,label});
                    sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
                    document.getElementById('simOrigin').value=label;
                    document.getElementById('simMaxDistance').value=String(arguments[5]);
                    document.getElementById('simOperatorFilter').dataset.v9Mode='all';
                    document.getElementById('simMinPowerKw').value=minPower==null?'':String(minPower);
                """, lat, lon, country, label, min_power, radius)
                result = browser.execute_async_script("""
                    const done=arguments[0];window.compare().then(area=>done({
                      count:area.stations.length,prepared:area.preproductionCandidate,
                      priced:area.stations.reduce((n,s)=>n+(s.offers||[]).length,0),
                      raw:area.stations.reduce((n,s)=>n+(s.unparsedOffers||[]).length,0),
                      firstSource:area.stations[0]?.provenance?.[0]?.sourceId||null,
                      sourceIds:[...new Set(area.stations.flatMap(s=>(s.provenance||[]).map(p=>p.sourceId)))].sort()
                    })).catch(error=>done({error:String(error)}));
                """)
                if "error" in result:
                    raise AssertionError(result["error"])
                if result["count"] <= 0 or result["priced"] != 0 or (require_raw and result["raw"] <= 0):
                    raise AssertionError(f"Candidate physical/pricing isolation failed: {result}")
                return result

            fr = compare(48.856, 2.352, "FR", "Paris fixture")
            text = browser.execute_script("return document.getElementById('results').innerText")
            fr_source_label = "Belib · FR" if "FR:belib_stations" in source_ids else "IONITY Direct · FR"
            for label in (fr_source_label, "Extraction :", "Tarif incalculable", "Prix non disponible", "Direct", "Electra", "Electroverse"):
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
            filtered = compare(48.856, 2.352, "FR", "Paris fixture", 300, require_raw=False)
            if filtered["count"] > fr["count"]:
                raise AssertionError("Minimum power filter expanded result set")
            gb = compare(51.507, -0.128, "GB", "London fixture")
            gb_text = browser.execute_script("return document.getElementById('results').innerText")
            if "IONITY Direct · UK" not in gb_text:
                raise AssertionError("UK candidate provenance missing")
            midhope = None
            if "GB:connected_kerb_midhope_verified" in source_ids:
                midhope = compare(51.30955, -0.56473, "GB", "Woking fixture", radius=10)
                woking_text = browser.execute_script("""
                    document.querySelectorAll('.v9-power-group,.v9-pdc-detail').forEach(item=>{item.open=true});
                    return document.getElementById('results').innerText;
                """)
                if ("GB:connected_kerb_midhope_verified" not in midhope["sourceIds"] or
                        "GB*CK0*E19825" not in woking_text or "IEC_62196_T2" not in woking_text):
                    raise AssertionError("Midhope exact EVSE/connector archive missing from candidate view")
            italy = None
            if "IT:atlante_direct" in source_ids:
                italy = compare(45.464, 9.19, "IT", "Milano fixture")
                it_text = browser.execute_script("return document.getElementById('results').innerText")
                if "Atlante Direct · IT" not in it_text:
                    raise AssertionError("Atlante Italy provenance missing")
            germany = None
            if "DE:ionity_direct" in source_ids:
                germany = compare(52.520, 13.405, "DE", "Berlin fixture")
                if "DE:ionity_direct" not in germany["sourceIds"]:
                    raise AssertionError("IONITY Germany candidate source missing")
            switzerland = None
            if "CH:swiss_integration" in source_ids:
                switzerland = compare(47.376, 8.541, "CH", "Zurich fixture", radius=100)
                if "CH:swiss_integration" not in switzerland["sourceIds"]:
                    raise AssertionError("Swiss national candidate source missing")
            zephyre = None
            if "FR:zephyre_epowerdirect_exact" in source_ids:
                zephyre = compare(43.579, 3.880, "FR", "Lattes fixture", radius=20)
                if "FR:zephyre_epowerdirect_exact" not in zephyre["sourceIds"]:
                    raise AssertionError(f"Zéphyre exact EVSE archive missing from physical map: {zephyre}")
            ozecar = None
            if "FR:ozecar_monta" in source_ids:
                ozecar = compare(41.926, 9.390, "FR", "Corsica fixture", radius=20)
                if "FR:ozecar_monta" not in ozecar["sourceIds"]:
                    raise AssertionError(f"OZECAR exact EVSE archive missing from physical map: {ozecar}")
                corsica_text = browser.execute_script("""
                    document.querySelectorAll('.v9-power-group,.v9-pdc-detail').forEach(item=>{item.open=true});
                    return document.getElementById('results').innerText;
                """)
                if "OZECAR" not in corsica_text or "FROZEE" not in corsica_text or "Type 2" not in corsica_text:
                    raise AssertionError(f"OZECAR station and exact EVSE are not visible: {corsica_text[:1200]}")
            # A same-origin iframe supplies a real 390 CSS-pixel viewport even
            # when headless Firefox enforces a 500-pixel minimum outer window.
            browser.get(f"http://127.0.0.1:{server.server_port}/control/index.html")
            browser.execute_script("""
                const frame=document.createElement('iframe');frame.id='v9-mobile-fixture';
                frame.style.cssText='width:390px;height:844px;border:0';frame.src=arguments[0];
                document.body.append(frame);
            """, f"http://127.0.0.1:{server.server_port}/v9-production-shell/")
            browser.switch_to.frame("v9-mobile-fixture")
            WebDriverWait(browser, 30).until(lambda driver: driver.execute_script(
                "return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error"))
            mobile = compare(48.856, 2.352, "FR", "Paris fixture")
            viewport = browser.execute_script("return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth}")
            if viewport["width"] != 390 or viewport["scrollWidth"] > viewport["width"]:
                raise AssertionError(f"Mobile station list overflows: {viewport}")
            browser.execute_script("document.querySelector('.v9-view-map').click()")
            mobile_map = browser.execute_script("""
                return {width:document.querySelector('.v9-real-map').getBoundingClientRect().width,
                    markers:document.querySelectorAll('.v9-map-marker').length,
                    scrollWidth:document.documentElement.scrollWidth};
            """)
            if mobile_map["width"] > 390 or mobile_map["scrollWidth"] > 390 or mobile_map["markers"] <= 0:
                raise AssertionError(f"Mobile map overflows or has no markers: {mobile_map}")
            browser.execute_script("document.getElementById('v9MapSummary').scrollIntoView()")
            browser.switch_to.default_content()
            if screenshots:
                browser.find_element(By.ID, "v9-mobile-fixture").screenshot(str(screenshots / "prepared-fr-mobile-390.png"))
            return {"fr": fr, "gb": gb, "midhope": midhope, "it": italy, "de": germany,
                    "ch": switzerland, "zephyre": zephyre, "ozecar": ozecar,
                    "minPower300": filtered["count"], "map": map_state,
                    "mobile390": {"stations": mobile["count"], "viewport": viewport, "map": mobile_map}}
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
