#!/usr/bin/env python3
"""Measure the isolated candidate at 100 km, then 10 km steps on failure/slow runs."""
import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from selenium import webdriver
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
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(viewport_width, 900)
            browser.set_script_timeout(150)
            browser.get(f'http://127.0.0.1:{server.server_port}/')
            WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error'))
            if viewport_width < 500:
                browser.get(f'http://127.0.0.1:{server.server_port}/control/index.html')
                browser.execute_script('''const frame=document.createElement('iframe');frame.id='v9-mobile-fixture';
                  frame.style.cssText=`width:${arguments[1]}px;height:844px;border:0`;frame.src=arguments[0];document.body.append(frame);''',
                  f'http://127.0.0.1:{server.server_port}/v9-production-shell/', viewport_width)
                browser.switch_to.frame('v9-mobile-fixture')
                WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error'))
            for radius in (radii if radii is not None else range(100, 0, -10)):
                browser.execute_script('''
                    const [lat,lon,country,label,radius]=arguments;
                    window.resolveOrigin=async()=>({lat,lon,label});
                    sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
                    document.getElementById('simOrigin').value=label;
                    document.getElementById('simMaxDistance').value=String(radius);
                    document.getElementById('simOperatorFilter').dataset.v9Mode='all';
                ''', lat, lon, country, label, radius)
                result = browser.execute_async_script('''
                    const done=arguments[0],start=performance.now();
                    window.compare().then(area=>{
                      const elapsed=Math.round(performance.now()-start);
                      document.querySelector('.v9-view-map')?.click();
                      const map=document.querySelector('.v9-real-map');
                      done({durationMs:elapsed,pageStations:area?.stations?.length||0,
                        matchingStations:area?.diagnostics?.sourceStationCount||0,
                        mapStations:area?.mapStations?.length||0,
                        visibleMarkers:map?.querySelectorAll('.v9-map-marker').length||0,
                        nextPage:!!document.querySelector('.v9-next-page'),
                        radiusKm:Number(area?.query?.radiusKm),
                        sourceErrors:area?.diagnostics?.errors?.length||0,
                        viewportWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth});
                    }).catch(error=>done({error:String(error),durationMs:Math.round(performance.now()-start)}));
                ''')
                if result.get('nextPage') and not result.get('error'):
                    page = browser.execute_async_script('''
                      const done=arguments[0],before=[...document.querySelectorAll('.v9-result-card')].map(e=>e.dataset.v9StationId),start=performance.now();
                      const button=document.querySelector('.v9-next-page');button.click();
                      const timer=setInterval(()=>{const after=[...document.querySelectorAll('.v9-result-card')].map(e=>e.dataset.v9StationId);
                        if(after.length&&after[0]!==before[0]){clearInterval(timer);done({durationMs:Math.round(performance.now()-start),overlap:after.filter(id=>before.includes(id)).length,firstPage:before.length,nextPage:after.length,mapMarkers:document.querySelectorAll('.v9-map-marker').length});}
                        else if(performance.now()-start>30000){clearInterval(timer);done({error:'page navigation timed out'});}
                      },100);
                    ''')
                    result['pagination']=page
                rows.append({'requestedRadiusKm': radius, **result})
                if result.get('pagination',{}).get('error') or result.get('pagination',{}).get('overlap',0):
                    raise AssertionError(f'pagination failed at {radius} km: {result["pagination"]}')
                if not result.get('error') and result['durationMs'] <= budget_ms and result['mapStations'] == result['matchingStations']:
                    break
    finally:
        server.shutdown(); server.server_close()
    return rows

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path,required=True)
    parser.add_argument('--lat',type=float,default=48.856);parser.add_argument('--lon',type=float,default=2.352)
    parser.add_argument('--country',default='FR');parser.add_argument('--label',default='Paris performance')
    parser.add_argument('--budget-ms',type=int,default=10000)
    args=parser.parse_args()
    print(json.dumps(measure(args.site,args.lat,args.lon,args.country,args.label,args.budget_ms),ensure_ascii=False))
