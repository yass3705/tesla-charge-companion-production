#!/usr/bin/env python3
"""Exercise ordinary V9 searches and the exact archived Fécamp EVSE scope."""
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


FECAMP_ID = "tcc:9b113cb493f52405cda4d54933f6865d47b224bad46fec7c1a5e15fe946d51f9"
SEARCHES = [
    ("Fécamp Carrefour Allego", "FR", 49.75434, 0.37304),
    ("Rouen", "FR", 49.4431, 1.0993),
    ("Lyon", "FR", 45.7640, 4.8357),
    ("Milan", "IT", 45.4642, 9.1900),
    ("Berlin", "DE", 52.5200, 13.4050),
    ("Amsterdam", "NL", 52.3676, 4.9041),
    ("London", "GB", 51.5072, -0.1276),
    ("Brussels", "BE", 50.8503, 4.3517),
    ("Zurich", "CH", 47.3769, 8.5417),
    ("Madrid", "ES", 40.4168, -3.7038),
    ("Agadir", "MA", 30.4278, -9.5981),
]


def run(site: Path, url: str | None = None) -> list[dict]:
    server = None
    if url is None:
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self, *_args):
                pass
        server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(site)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options()
    options.add_argument("-headless")
    options.binary_location = "/Applications/Firefox.app/Contents/MacOS/firefox"
    results = []
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(1280, 900)
            browser.set_script_timeout(180)
            browser.get(url or f"http://127.0.0.1:{server.server_port}/")
            WebDriverWait(browser, 30).until(lambda d: d.execute_script("return window.__TCC_V9_SHELL__?.ready"))
            for name, country, lat, lon in SEARCHES:
                result = browser.execute_async_script(r"""
const [name,country,lat,lon,fecampId]=arguments[0],done=arguments[1];
(async()=>{
 window.resolveOrigin=async()=>({lat,lon,label:name});
 sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
 document.getElementById('simOrigin').value=name;
 document.getElementById('simMaxDistance').value='5';
 document.getElementById('simRanking').value='price';
 document.getElementById('simOperatorFilter').dataset.v9Mode='all';
 let area=await window.compare();
 if(!area)throw Error('Search failed: '+(localStorage.getItem('tccV9ProductionShellDiagnosticsV1')||''));
 const ranked=area.mapRankingRows||[],map=area.mapStations||[];
 const priced=ranked.filter(row=>Number.isFinite(row.total)).length;
 const rawStations=ranked.filter(row=>row.station?.hasRawOffer).length;
 const pageOffers=area.stations.reduce((sum,row)=>sum+(row.offers||[]).length,0);
 const pageRawOffers=area.stations.reduce((sum,row)=>sum+(row.unparsedOffers||[]).length,0);
 const pageIncomplete=Object.values(area.sessionEvaluations||{}).reduce((sum,row)=>sum+(row.incomplete||[]).length,0);
 if(ranked.length!==map.length)throw Error('Map/ranking inventory mismatch');
 if(ranked.slice(0,priced).some(row=>!Number.isFinite(row.total))||
    ranked.slice(priced).some(row=>Number.isFinite(row.total)))throw Error('Price ranking placed an unpriced station before a priced one');
 const cards=()=>[...document.querySelectorAll('#results .v9-result-card')];
 const initial=cards().length,firstCard=cards()[0]?.dataset.v9StationId||null;
 if(initial>20||initial!==Math.min(20,area.stations.length))throw Error('Initial card limit: '+initial);
 if(firstCard&&firstCard!==ranked[0]?.station?.id)throw Error('First visible card differs from global ranking');
 let afterMore=initial;
 if(area.stations.length>20){
   const more=document.querySelector('#results .v9-more-stations');if(!more)throw Error('Remaining station button missing');
   more.click();afterMore=cards().length;
   if(afterMore!==Math.min(40,area.stations.length))throw Error('More station action lost rows');
 }
 document.querySelector('.v9-view-map')?.click();
 const markerLabels=[...document.querySelectorAll('.v9-map-marker')].map(row=>row.textContent.trim());
 if(markerLabels.some(label=>label==='—'||label.startsWith('— ·')))
   throw Error('Map marker still hides unavailable-price meaning');
 document.querySelector('.v9-view-list')?.click();
 let fecamp=null;
 if(name.startsWith('Fécamp')){
   const target=fecampId;
   const marker=map.find(row=>row.id===target);if(!marker)throw Error('Fécamp EVSE station missing');
   if(marker.page)area=await area.navigateToPage(marker.page);
   const station=area.stations.find(row=>row.id===target);if(!station)throw Error('Fécamp station page missing');
   while(!cards().some(card=>card.dataset.v9StationId===target)){
     const more=document.querySelector('#results .v9-more-stations');if(!more)break;more.click();
   }
   const card=cards().find(row=>row.dataset.v9StationId===target);
   if(!card)throw Error('Fécamp card inaccessible');
   fecamp={stationId:target,sourceIds:[...new Set((station.provenance||[]).map(row=>row.sourceId))],
     evseIds:station.evses.map(row=>row.officialEvseId||row.sourceEvseId),
     ac:station.evses.filter(row=>row.connectors?.some(c=>c.kind==='AC')).length,
     dc:station.evses.filter(row=>row.connectors?.some(c=>c.kind==='DC')).length,
     offers:station.offers.length,unparsedOffers:station.unparsedOffers.length,
     evaluation:area.sessionEvaluations?.[target]||null,
     allChannels:['Direct','Electra','Electroverse'].every(channel=>card.textContent.includes(channel)),
     unavailable:card.textContent.includes('Prix non disponible'),
     cardText:card.textContent.replace(/\s+/g,' ').slice(0,1000)};
   if(fecamp.offers||fecamp.unparsedOffers||!fecamp.allChannels||!fecamp.unavailable)
     throw Error('Fécamp offer status or channel rendering changed');
 }
 return{name,country,matching:ranked.length,priced,unpriced:ranked.length-priced,
   rawStations,pageOffers,pageRawOffers,pageIncomplete,
   initialCards:initial,afterMore,firstCard,firstRanked:ranked[0]?.station?.id||null,
   markerLabels:markerLabels.slice(0,5),
   sourceErrors:area.diagnostics?.errors?.length||0,fecamp};
})().then(done).catch(error=>done({name,error:String(error)}));
""", [name, country, lat, lon, FECAMP_ID])
                if result.get("error") or result.get("sourceErrors"):
                    raise AssertionError(result)
                results.append(result)
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=Path, required=True)
    parser.add_argument("--url")
    args = parser.parse_args()
    print(json.dumps(run(args.site, args.url), ensure_ascii=False))
