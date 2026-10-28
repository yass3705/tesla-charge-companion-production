import functools
import json
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait

site = Path(sys.argv[1])
bundle_id = json.loads((site / 'prepared-v9/index.json').read_bytes())['bundleId']
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
threading.Thread(target=server.serve_forever, daemon=True).start()
options = Options()
options.add_argument('-headless')
options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
try:
    with webdriver.Firefox(options=options) as browser:
        browser.set_script_timeout(90)
        browser.get(f'http://127.0.0.1:{server.server_port}/')
        WebDriverWait(browser, 30).until(lambda d: d.execute_script(
            'return window.__TCC_V9_SHELL__?.ready || window.__TCC_V9_SHELL__?.error'))
        assert browser.execute_script('return window.__TCC_V9_SHELL__?.ready') is True
        browser.execute_script('''
            const lat=43.8954267,lon=1.8814333;
            window.resolveOrigin=async()=>({lat,lon,label:'Gaillac archived fixture'});
            sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,'FR');
            document.getElementById('simOrigin').value='Gaillac archived fixture';
            document.getElementById('simMaxDistance').value='2';
            document.getElementById('simOperatorFilter').dataset.v9Mode='all';
        ''')
        result = browser.execute_async_script('''
            const done=arguments[0];
            window.compare().then(area=>{
              const found=area.stations.filter(s=>s.provenance?.some(p=>p.sourceId==='FR:allego_direct'));
              done({bundleId:area.preproductionCandidate?.bundleId,
                stationCount:found.length,
                sourceStationIds:found.map(s=>s.sourceStationId),
                rawOffers:found.flatMap(s=>s.unparsedOffers||[]).filter(o=>o.sourceId==='prepared:FR:allego_direct').length,
                pricedOffers:found.flatMap(s=>s.offers||[]).filter(o=>o.sourceId==='prepared:FR:allego_direct'||o.metadata?.sourceId==='FR:allego_direct').length,
                evses:found.flatMap(s=>s.evses||[]).length,
                connectors:found.flatMap(s=>s.evses||[]).flatMap(e=>e.connectors||[]).length,
                cardText:document.getElementById('results')?.innerText?.slice(0,2000)});
            }).catch(e=>done({error:String(e)}));
        ''')
        assert result.get('bundleId') == bundle_id, result
        assert result['stationCount'] >= 1 and result['rawOffers'] >= 1 and result['evses'] >= 1, result
        assert result['pricedOffers'] == 0, result
        assert 'Burger King Gaillac' in result['cardText'], result
        assert 'Tarif incalculable' in result['cardText'] or 'Prix non disponible' in result['cardText'], result
        print(json.dumps({k:v for k,v in result.items() if k!='cardText'},ensure_ascii=False))
finally:
    server.shutdown()
    server.server_close()
