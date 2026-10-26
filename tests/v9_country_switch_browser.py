#!/usr/bin/env python3
"""Exercise country changes and return navigation in one Firefox session."""
import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def run(site, screenshots=None):
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options()
    options.add_argument('-headless')
    options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    results = []
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(1280, 900)
            browser.set_script_timeout(90)
            browser.get(f'http://127.0.0.1:{server.server_port}/')
            WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            for country, lat, lon in [('FR', 48.856, 2.352), ('DE', 52.520, 13.405), ('NL', 52.367, 4.904), ('FR', 48.856, 2.352)]:
                result = browser.execute_async_script('''
                  const [country,lat,lon,done]=arguments;
                  window.resolveOrigin=async()=>({lat,lon,label:country+' recette'});
                  sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
                  document.getElementById('simOrigin').value=country+' recette';
                  document.getElementById('simMaxDistance').value='20';
                  document.getElementById('simOperatorFilter').dataset.v9Mode='all';
                  const start=performance.now();
                  window.compare().then(area=>done({country:area.query.countryCode,
                    durationMs:Math.round(performance.now()-start),
                    matching:area.diagnostics.sourceStationCount,map:area.mapStations.length,
                    sourceErrors:(area.diagnostics.errors||[]).length,
                    foreignStations:area.stations.filter(st=>st.countryCode!==country).length,
                    firstIds:area.stations.map(st=>st.id)})).catch(error=>done({error:String(error)}));
                ''', country, lat, lon)
                assert not result.get('error') and result['country'] == country, result
                assert result['matching'] == result['map'] and result['matching'] > 0, result
                assert not result['sourceErrors'] and not result['foreignStations'], result
                results.append(result)
                if country == 'DE' and screenshots:
                    screenshots.mkdir(parents=True, exist_ok=True)
                    for view, target in [('map', '.v9-real-map'), ('list', '.v9-result-card')]:
                        browser.execute_script("document.querySelector('.v9-view-'+arguments[0])?.click();document.querySelector(arguments[1])?.scrollIntoView({block:'start'});", view, target)
                        if view == 'map':
                            WebDriverWait(browser, 20).until(lambda d: d.execute_script("const imgs=[...document.querySelectorAll('.v9-map-tiles img')];return imgs.length&&imgs.every(i=>i.complete);"))
                            result['loadedMapTiles'] = browser.execute_script("return [...document.querySelectorAll('.v9-map-tiles img')].filter(i=>i.naturalWidth>0).length")
                            result['mapBackgroundUnavailable'] = browser.execute_script("return getComputedStyle(document.querySelector('.v9-map-tile-warning')).display!=='none'")
                            assert result['loadedMapTiles'] or result['mapBackgroundUnavailable'], 'missing map background has no explanation'
                        browser.save_screenshot(str(screenshots / f'germany-28-{view}.png'))
            assert results[0]['firstIds'] == results[-1]['firstIds'], 'return to France retained stale country/page state'
            assert results[0]['matching'] == results[-1]['matching']
            return results
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.site, args.screenshots), ensure_ascii=False))
