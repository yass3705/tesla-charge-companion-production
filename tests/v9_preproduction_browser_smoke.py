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
            guidance = browser.execute_script("""
                const panel=document.getElementById('v9ValidationPanel');
                return {tab:!!document.getElementById('v9ValidationTab'),
                  steps:panel?.querySelectorAll('ol li').length||0,
                  feedback:!!panel?.querySelector('#v9FeedbackText')&&!!panel?.querySelector('#v9FeedbackShare')};
            """)
            if not guidance["tab"] or guidance["steps"] != 5 or not guidance["feedback"]:
                raise AssertionError(f"Preview validation flow missing: {guidance}")
            preview_accessibility = browser.execute_script("""
                const tab=document.getElementById('v9ValidationTab');
                const panel=document.getElementById(tab?.getAttribute('aria-controls'));
                const feedback=document.getElementById('v9FeedbackText');
                const share=document.getElementById('v9FeedbackShare');
                return {tabNamed:!!tab?.textContent.trim(),targetExists:!!panel,
                  feedbackLabelled:!!feedback?.labels?.length,
                  shareNamed:!!share?.textContent.trim(),statusLive:document.getElementById('v9FeedbackStatus')?.getAttribute('aria-live')};
            """)
            if preview_accessibility != {"tabNamed": True, "targetExists": True,
                                          "feedbackLabelled": True, "shareNamed": True,
                                          "statusLive": "polite"}:
                raise AssertionError(f"Preview guidance accessibility failed: {preview_accessibility}")
            invalid_vehicle = browser.execute_async_script("""
                const done=arguments[0],field=document.getElementById('v9BatteryCapacity');
                if(!field){done({error:'battery control missing'});return;}
                field.value='0';
                window.compare().then(area=>done({blocked:area===null,
                  message:document.getElementById('routeStatus')?.textContent||''}))
                  .catch(error=>done({error:String(error)}));
            """)
            if not invalid_vehicle.get("blocked") or "Vérifie les paramètres" not in invalid_vehicle.get("message", ""):
                raise AssertionError(f"Invalid vehicle input was not blocked: {invalid_vehicle}")
            vehicle = browser.execute_script("""
                const values={v9BatteryCapacity:90,v9Consumption:18,v9MaxAc:22,v9MaxDc:180};
                for(const [id,value] of Object.entries(values)){
                  const input=document.getElementById(id);
                  if(!input)return {error:`missing ${id}`};
                  input.value=String(value);
                }
                const session=TCCV9ProductionShell.buildSession(TCCV9ProductionShell.readInputs(window),'FR');
                return {capacity:session.batteryCapacityKwh,consumption:session.consumptionKwhPer100Km,
                  ac:session.vehicleMaxAcKw,dc:session.vehicleMaxDcKw};
            """)
            if vehicle != {"capacity": 90, "consumption": 18, "ac": 22, "dc": 180}:
                raise AssertionError(f"Vehicle settings did not reach the session: {vehicle}")

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
                    const done=arguments[0],began=performance.now();window.compare().then(area=>{if(!area){done({error:'compare returned no area',diagnostics:localStorage.getItem('tccV9ProductionShellDiagnosticsV1'),resultText:document.getElementById('results')?.innerText?.slice(0,1200)});return;}
                      const compoundIds=new Set(area.stations.flatMap(s=>s.offers||[]).filter(o=>
                        o.metadata?.sourceId==='NL:dotnl_static'&&o.pricing?.rules?.some(r=>
                          r.chargePerMinute>0||r.connectionFee>0||r.idlePerMinute>0)).map(o=>o.id));
                      const emspIds=new Set(area.stations.flatMap(s=>s.offers||[]).filter(o=>
                        o.metadata?.sourceId==='FR:emsp_exact').map(o=>o.id));
                      const evaluated=Object.values(area.sessionEvaluations||{}).flatMap(row=>
                        [row?.best,...(row?.alternatives||[]),...(row?.incomplete||[])]).filter(Boolean);
                      done({
                      count:area.stations.length,prepared:area.preproductionCandidate,
                      queryDurationMs:Math.round(performance.now()-began),
                      priced:area.stations.reduce((n,s)=>n+(s.offers||[]).length,0),
                      emspPriced:area.stations.reduce((n,s)=>n+(s.offers||[]).filter(o=>
                        o.metadata?.sourceId==='FR:emsp_exact'&&o.provider==='Electroverse').length,0),
                      emspEvaluated:evaluated.filter(row=>emspIds.has(row.offerId)&&row.result?.complete).length,
                      emspCostPerKm:evaluated.filter(row=>emspIds.has(row.offerId)&&row.result?.complete&&
                        Number.isFinite(row.costPerRecoveredKm)).length,
                      compoundPriced:area.stations.reduce((n,s)=>n+(s.offers||[]).filter(o=>
                        o.metadata?.sourceId==='NL:dotnl_static'&&o.pricing?.rules?.some(r=>
                          r.chargePerMinute>0||r.connectionFee>0||r.idlePerMinute>0)).length,0),
                      compoundEvaluated:evaluated.filter(row=>compoundIds.has(row.offerId)&&row.result?.complete).length,
                      compoundFees:evaluated.filter(row=>compoundIds.has(row.offerId)&&row.result?.complete&&
                        (row.result.components?.connectionFee>0||row.result.components?.chargingTime>0||
                          row.result.components?.parkingTime>0)).length,
                      pricedOutsideProved:area.stations.flatMap(s=>s.offers||[]).filter(o=>
                        !['FR:ionity_direct','IT:atlante_direct','BE:nap_static','NL:dotnl_static','FR:emsp_exact'].includes(o.metadata?.sourceId)||o.metadata?.verified!==true||
                        !['exact_canonical_connector','exact_canonical_evse_supported_connectors','exact_canonical_connector_ocpi','exact_canonical_emsp_evse'].includes(o.metadata?.identityMode)).length,
                      raw:area.stations.reduce((n,s)=>n+(s.unparsedOffers||[]).length,0),
                      emspRaw:area.stations.reduce((n,s)=>n+(s.unparsedOffers||[]).filter(o=>
                        o.channel==='Electra'||o.channel==='Electroverse').length,0),
                      emspMisScoped:area.stations.reduce((n,s)=>n+(s.unparsedOffers||[]).filter(o=>
                        (o.channel==='Electra'||o.channel==='Electroverse')&&
                        !(s.evses||[]).some(evse=>evse.id===o.scope?.evseId)).length,0),
                      emspPricedMisScoped:area.stations.reduce((n,s)=>n+(s.offers||[]).filter(o=>
                        o.metadata?.sourceId==='FR:emsp_exact'&&
                        !(s.evses||[]).some(evse=>o.evseIds?.includes(evse.id)&&
                          o.connectorIds?.every(id=>(evse.connectors||[]).some(c=>c.id===id)))).length,0),
                      firstSource:area.stations[0]?.provenance?.[0]?.sourceId||null,
                      sourceIds:[...new Set(area.stations.flatMap(s=>(s.provenance||[]).map(p=>p.sourceId)))].sort()
                    });}).catch(error=>done({error:String(error)}));
                """)
                if "error" in result:
                    raise AssertionError(result)
                if result["count"] <= 0 or result["pricedOutsideProved"] != 0 or (require_raw and result["raw"] <= 0):
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
            emsp = None
            if "FR:emsp_exact" in source_ids:
                emsp_data = json.loads((site / "prepared-v9/sources/FR__emsp_exact.json").read_bytes())
                target = next((row for row in emsp_data["stations"] if row.get("latitude") is not None and row.get("longitude") is not None), None)
                if target is None:
                    raise AssertionError("Exact eMSP source has no archived national station coordinates")
                emsp = compare(target["latitude"], target["longitude"], "FR", "Exact eMSP fixture", radius=2, require_raw=False)
                if emsp["emspRaw"] + emsp["emspPriced"] <= 0 or emsp["emspMisScoped"] != 0 or emsp["emspPricedMisScoped"] != 0:
                    raise AssertionError("Exact eMSP offer was lost or moved to another EVSE/connector")
                if emsp["emspPriced"]:
                    if not emsp["emspEvaluated"] or not emsp["emspCostPerKm"]:
                        raise AssertionError("Proved eMSP session or cost per kilometre was not calculated")
                    emsp_totals = browser.execute_script("return [...document.querySelectorAll('#results .v9-tariff-row[data-v9-lane-label=\"Electroverse\"][data-v9-effective-total]')].map(row=>Number(row.dataset.v9EffectiveTotal))")
                    if not any(total > 0 for total in emsp_totals):
                        raise AssertionError("Proved Electroverse offer did not reach the tariff comparison")
                    if "Durée de charge estimée :" not in browser.execute_script(
                            "return document.getElementById('results').innerText"):
                        raise AssertionError("Calculated charging duration was not visible with the session price")
                if screenshots:
                    browser.execute_script("document.getElementById('results').scrollIntoView()")
                    browser.save_screenshot(str(screenshots / "prepared-fr-electroverse-exact.png"))
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
                priced_totals = browser.execute_script("return [...document.querySelectorAll('#results .v9-tariff-row[data-v9-effective-total]')].map(row=>Number(row.dataset.v9EffectiveTotal))")
                if italy["priced"] and not any(total > 0 for total in priced_totals):
                    raise AssertionError("Proved Atlante tariff was loaded but no calculated offer reached the UI")
                italy["calculatedCards"] = len(priced_totals)
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
            belgium = None
            if "BE:nap_static" in source_ids:
                belgium = compare(50.850, 4.352, "BE", "Brussels fixture", radius=50)
                if "BE:nap_static" not in belgium["sourceIds"]:
                    raise AssertionError("Belgium NAP physical archive missing")
                be_totals = browser.execute_script("return [...document.querySelectorAll('#results .v9-tariff-row[data-v9-effective-total]')].map(row=>Number(row.dataset.v9EffectiveTotal))")
                if belgium["priced"] and not any(total > 0 for total in be_totals):
                    raise AssertionError("Proved Belgium energy-only tariff did not reach the UI")
                belgium["calculatedCards"] = len(be_totals)
            netherlands = None
            if "NL:dotnl_static" in source_ids:
                netherlands = compare(52.367, 4.904, "NL", "Amsterdam fixture", radius=30)
                if "NL:dotnl_static" not in netherlands["sourceIds"]:
                    raise AssertionError("DOT-NL national archive missing")
                nl_totals = browser.execute_script("return [...document.querySelectorAll('#results .v9-tariff-row[data-v9-effective-total]')].map(row=>Number(row.dataset.v9EffectiveTotal))")
                if netherlands["priced"] and not any(total > 0 for total in nl_totals):
                    raise AssertionError("Proved DOT-NL energy-only tariff did not reach the UI")
                if netherlands["compoundPriced"] and not netherlands["compoundFees"]:
                    raise AssertionError("Proved DOT-NL compound fees did not reach session calculations")
                netherlands["calculatedCards"] = len(nl_totals)
                repeated = compare(52.367, 4.904, "NL", "Amsterdam fixture", radius=30)
                if repeated["count"] != netherlands["count"] or repeated["compoundEvaluated"] != netherlands["compoundEvaluated"]:
                    raise AssertionError("Repeated candidate query changed stations or evaluated offers")
                netherlands["repeatQueryDurationMs"] = repeated["queryDurationMs"]
                if screenshots:
                    browser.execute_script("document.getElementById('results').scrollIntoView()")
                    browser.save_screenshot(str(screenshots / "prepared-nl-compound.png"))
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
            if screenshots:
                browser.execute_script("document.getElementById('results').scrollIntoView()")
                browser.switch_to.default_content()
                browser.find_element(By.ID, "v9-mobile-fixture").screenshot(str(screenshots / "prepared-fr-mobile-list-390.png"))
                browser.switch_to.frame("v9-mobile-fixture")
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
            return {"fr": fr, "emsp": emsp, "gb": gb, "midhope": midhope, "it": italy, "de": germany,
                    "ch": switzerland, "be": belgium, "nl": netherlands,
                    "zephyre": zephyre, "ozecar": ozecar,
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
