"""Check a G5-bound Ajaccio connector with the real preview shell and worker."""
import argparse
import functools
import http.server
import json
import pathlib
import threading
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait

cli = argparse.ArgumentParser()
cli.add_argument("--site", required=True, type=pathlib.Path)
cli.add_argument("--url")
args = cli.parse_args()
station = {'id': 'tcc:03dc369436c24a824b0e39d801eda725ddb52d8a8de73680689f0e85be44914e', 'name': 'ALTENSYS/66a37ca424218b8d9e8e9e56', 'latitude': 41.94567, 'longitude': 8.75445}
url = args.url
if not url:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(args.site))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_port}/"
o=Options();o.add_argument('-headless');o.binary_location='/Applications/Firefox.app/Contents/MacOS/firefox'
with webdriver.Firefox(options=o) as b:
 b.get(url);b.set_script_timeout(120)
 WebDriverWait(b,40).until(lambda x:x.execute_script('return window.__TCC_V9_SHELL__?.ready'))
 result=b.execute_async_script("""const [s,done]=arguments;(async()=>{
const lat=s.latitude,lon=s.longitude;
window.resolveOrigin=async()=>({lat,lon,label:s.name});
sessionStorage.setItem('tcc-v9-country:'+lat.toFixed(3)+','+lon.toFixed(3),'FR');
document.getElementById('simOrigin').value=s.name;document.getElementById('simMaxDistance').value='2';document.getElementById('simDate').value='2026-11-26';document.getElementById('simTime').value='14:00';document.getElementById('simOperatorFilter').dataset.v9Mode='all';
const a=await window.compare();if(!a)throw Error(localStorage.getItem('tccV9ProductionShellDiagnosticsV1'));
const st=a.stations.find(x=>x.id===s.id);
const card=[...document.querySelectorAll('.v9-result-card')].find(x=>x.dataset.v9StationId===s.id);
return {sourceErrors:a.diagnostics?.errors,offers:st?.offers?.filter(o=>o.metadata?.g66Dynamic).length,
 lines:[...(card?.querySelectorAll('.v9-tariff-row')||[])].filter(e=>e.innerText.includes('Electroverse')||e.textContent.includes('Electroverse')).map(e=>({text:e.textContent,total:e.dataset.v9EffectiveTotal})), assets:performance.getEntriesByType('resource').filter(x=>x.name.includes('/g66-preview')).map(x=>new URL(x.name).pathname)};
})().then(done).catch(e=>done({error:String(e)}));""",station)
 print(json.dumps(result),flush=True)
 assert not result.get('error') and not result['sourceErrors'] and result['offers']
 assert any(x.get('total')=='22.8' and '21,60' in x['text'] and '1,20' in x['text'] for x in result['lines'])
 assert '/g66-preview/worker.js' in result['assets']
