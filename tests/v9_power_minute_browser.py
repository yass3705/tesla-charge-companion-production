#!/usr/bin/env python3
"""Pinned Tesla Morocco tariff through the real planner, engine and rendered UI."""
import argparse
import functools
import gzip
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def run(site):
    source = site / 'runtime/data/tesla_stations.json'
    catalogue = json.loads(source.read_bytes() if source.exists() else gzip.decompress(source.with_suffix('.json.gz').read_bytes()))
    target = next(s for s in catalogue if any(r.get('billing') == 'powerMinute'
        for c in s.get('chargingConfigurations', [s])
        for r in (c.get('pricing') or s.get('pricing') or {}).get('rules', [])))
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options(); options.add_argument('-headless')
    options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_script_timeout(90)
            browser.get(f'http://127.0.0.1:{server.server_port}/')
            WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            result = browser.execute_async_script('''
const [target,done]=arguments;
(async()=>{
 const lat=target.latitude,lon=target.longitude;
 window.resolveOrigin=async()=>({lat,lon,label:target.name});
 sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,'MA');
 document.getElementById('simOrigin').value=target.name;
 document.getElementById('simMaxDistance').value='2';
 for(const [id,value] of Object.entries({v9BatteryCapacity:75,v9Consumption:15,v9MaxAc:11,v9MaxDc:250}))
   document.getElementById(id).value=String(value);
 document.getElementById('simOperatorFilter').dataset.v9Mode='all';
 const area=await window.compare();
 if(!area)return{error:'compare returned null',routeStatus:document.getElementById('routeStatus')?.textContent,
   results:document.getElementById('results')?.textContent?.slice(0,500),
   vehicle:[...['v9BatteryCapacity','v9Consumption','v9MaxAc','v9MaxDc']].map(id=>[id,document.getElementById(id)?.value,document.getElementById(id)?.checkValidity()])};
 const st=area.stations.find(s=>s.id===target.id||s.sourceStationId===target.id);
 if(!st)throw Error('Pinned Tesla target absent');
 const e=area.sessionEvaluations[st.id];
 const rows=[e?.best,...(e?.alternatives||[])].filter(r=>r?.result?.components?.powerMinute);
 const card=[...document.querySelectorAll('.v9-result-card')].find(el=>el.dataset.v9StationId===st.id);
 card?.querySelectorAll('details').forEach(el=>el.open=true);
 return{station:st.id,evaluation:e,offers:st.offers,effectiveSession:area.effectiveSession,cardText:card?.textContent,quotes:rows.map(r=>({currency:r.currency,nativeTotal:r.result.totalEur,
  powerFee:r.result.components.powerMinute.costNative,segments:r.result.components.powerMinute.segments.length,
  recoveredKmCost:r.costPerRecoveredKm})),incomplete:e?.incomplete?.map(r=>r.result?.reason),
  hasFeeLabel:card?.textContent.includes('Charge selon la puissance délivrée'),
  hasPowerRate:card?.textContent.includes('kW délivrés'),sourceErrors:area.diagnostics?.errors||[]};
})().then(done).catch(e=>done({error:String(e)}));
''', target)
            assert not result.get('error'), result
            assert result['quotes'] and all(q['currency'] == 'MAD' and q['nativeTotal'] > 0 and q['powerFee'] > 0 and q['segments'] > 1 for q in result['quotes']), result
            assert result['hasFeeLabel'] and result['hasPowerRate'] and '0,00 MAD/kWh' not in result['cardText'] and not result['sourceErrors'], result
            return result
    finally:
        server.shutdown(); server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--site', type=Path, required=True)
    print(json.dumps(run(parser.parse_args().site), ensure_ascii=False))
