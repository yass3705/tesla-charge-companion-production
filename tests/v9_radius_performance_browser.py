#!/usr/bin/env python3
"""Measure the isolated candidate at 100 km, then 10 km steps on failure/slow runs."""
import argparse
import functools
import json
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from selenium import webdriver
from selenium.common.exceptions import WebDriverException
from urllib3.exceptions import HTTPError
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def measure(site: Path, lat: float, lon: float, country: str, label: str, budget_ms: int, radii=None, viewport_width=1280):
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options(); options.add_argument('-headless')
    options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    rows = []
    requested = list(radii if radii is not None else range(100, 0, -10))
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(viewport_width, 900)
            browser.set_script_timeout(90)
            def async_call(script, *args):
                started=time.monotonic()
                try:
                    return browser.execute_async_script(script, *args)
                except (WebDriverException, HTTPError) as error:
                    return {'error': str(error)[:300], 'durationMs': round((time.monotonic()-started)*1000), 'browserTransportFailed': True}
            browser.get(f'http://127.0.0.1:{server.server_port}/')
            WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error'))
            if viewport_width < 500:
                browser.get(f'http://127.0.0.1:{server.server_port}/control/index.html')
                browser.execute_script('''const frame=document.createElement('iframe');frame.id='v9-mobile-fixture';
                  frame.style.cssText=`width:${arguments[1]}px;height:844px;border:0`;frame.src=arguments[0];document.body.append(frame);''',
                  f'http://127.0.0.1:{server.server_port}/v9-production-shell/', viewport_width)
                browser.switch_to.frame('v9-mobile-fixture')
                WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error'))
            for radius in requested:
                browser.execute_script('''
                    const [lat,lon,country,label,radius]=arguments;
                    window.resolveOrigin=async()=>({lat,lon,label});
                    sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
                    document.getElementById('simOrigin').value=label;
                    document.getElementById('simMaxDistance').value=String(radius);
                    document.getElementById('simOperatorFilter').dataset.v9Mode='all';
                ''', lat, lon, country, label, radius)
                result = async_call('''
                    const done=arguments[0],start=performance.now();
                    window.compare().then(area=>{
                      document.querySelector('.v9-view-map')?.click();
                      const elapsed=Math.round(performance.now()-start);
                      const map=document.querySelector('.v9-real-map');
                      done({durationMs:elapsed,pageStations:area?.stations?.length||0,
                        matchingStations:area?.diagnostics?.sourceStationCount||0,
                        mapStations:area?.mapStations?.length||0,
                        globallyRankedStations:area?.diagnostics?.globallyRankedStationCount||0,
                        visibleMarkers:map?.querySelectorAll('.v9-map-marker').length||0,
                        nextPage:!!document.querySelector('.v9-next-page'),
                        availableOperatorCount:area?.availableOperators?.length||0,
                        operatorOptionCount:document.getElementById('simOperatorFilter')?.options.length||0,
                        radiusKm:Number(area?.query?.radiusKm),
                        sourceErrors:area?.diagnostics?.errors?.length||0,
                        pricedOffers:area?.stations?.reduce((n,st)=>n+(st.offers||[]).length,0)||0,
                        rawOffers:area?.stations?.reduce((n,st)=>n+(st.unparsedOffers||[]).length,0)||0,
                        completeStationEvaluations:Object.values(area?.sessionEvaluations||{}).filter(e=>e?.best?.result?.complete===true).length,
                        visibleCalculatedTariffs:document.querySelectorAll('#results [data-v9-effective-total]').length,
                        rawLabelVisible:document.getElementById('results')?.textContent.includes('Tarif incalculable')===true,
                        unavailableLabelVisible:document.getElementById('results')?.textContent.includes('Prix non disponible')===true,
                        iziviaMapStations:area?.stations?.filter(st=>st.provenance?.some(p=>p.sourceId==='FR:izivia_fast_map')).length||0,
                        iziviaMapOffers:area?.stations?.flatMap(st=>st.offers||[]).filter(o=>o.metadata?.sourceId==='FR:izivia_fast_map').length||0,
                        viewportWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth});
                    }).catch(error=>done({error:String(error),durationMs:Math.round(performance.now()-start)}));
                ''')
                if result.get('nextPage') and not result.get('error'):
                    page = async_call('''
                      const done=arguments[0],before=[...document.querySelectorAll('.v9-result-card')].map(e=>e.dataset.v9StationId),start=performance.now();
                      document.querySelector('.v9-map-zoom-in')?.click();
                      const view=JSON.stringify(document.getElementById('v9MapSummary')?._v9MapView);
                      const button=document.querySelector('.v9-next-page');button.click();
                      const timer=setInterval(()=>{const after=[...document.querySelectorAll('.v9-result-card')].map(e=>e.dataset.v9StationId);
                        if(after.length&&after[0]!==before[0]){clearInterval(timer);done({durationMs:Math.round(performance.now()-start),overlap:after.filter(id=>before.includes(id)).length,firstPage:before.length,nextPage:after.length,mapMarkers:document.querySelectorAll('.v9-map-marker').length,mapViewPreserved:view===JSON.stringify(document.getElementById('v9MapSummary')?._v9MapView)});}
                        else if(performance.now()-start>30000){clearInterval(timer);done({error:'page navigation timed out'});}
                      },100);
                    ''')
                    result['pagination']=page
                rows.append({'requestedRadiusKm': radius, **result})
                print(json.dumps(rows[-1],ensure_ascii=False),file=sys.stderr,flush=True)
                if result.get('browserTransportFailed'):
                    break
                if result.get('operatorOptionCount',0) < result.get('availableOperatorCount',0):
                    raise AssertionError(f'operator filter omitted off-page operators at {radius} km: {result}')
                if result.get('pagination',{}).get('error') or result.get('pagination',{}).get('overlap',0) or result.get('pagination',{}).get('mapViewPreserved') is False:
                    raise AssertionError(f'pagination failed at {radius} km: {result["pagination"]}')
                if not result.get('error') and result['durationMs'] <= budget_ms and result['mapStations'] == result['matchingStations']:
                    break
    finally:
        server.shutdown(); server.server_close()
    # A timed-out browser is closed before trying a smaller radius. Never run a
    # second expensive search alongside the abandoned JavaScript computation.
    if rows and rows[-1].get('browserTransportFailed'):
        remaining=[radius for radius in requested if radius < rows[-1]['requestedRadiusKm']]
        if remaining:
            rows.extend(measure(site,lat,lon,country,label,budget_ms,remaining,viewport_width))
    return rows

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path,required=True)
    parser.add_argument('--lat',type=float,default=48.856);parser.add_argument('--lon',type=float,default=2.352)
    parser.add_argument('--country',default='FR');parser.add_argument('--label',default='Paris performance')
    parser.add_argument('--budget-ms',type=int,default=10000)
    args=parser.parse_args()
    print(json.dumps(measure(args.site,args.lat,args.lon,args.country,args.label,args.budget_ms),ensure_ascii=False))
