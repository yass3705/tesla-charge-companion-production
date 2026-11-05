#!/usr/bin/env python3
"""Verify real Mac archive stations on a preview, with no national joins."""
import argparse,json,functools,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait

def run(site,url=None):
 server=None
 if not url:
  class Quiet(SimpleHTTPRequestHandler):
   def log_message(self,*args):pass
  server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(site)))
  threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/'
 options=Options();options.add_argument('-headless');options.binary_location='/Applications/Firefox.app/Contents/MacOS/firefox'
 try:
  with webdriver.Firefox(options=options) as b:
   b.set_script_timeout(180);b.get(url);WebDriverWait(b,40).until(lambda b:b.execute_script('return window.__TCC_V9_SHELL__?.ready'))
   result=b.execute_async_script('''const done=arguments[0];(async()=>{
const raw=await fetch('../runtime/data/tesla_stations.json').then(r=>r.json()),adapter=TCCV9Adapters.teslaJson,rows=[];
for(const country of ['FR','IT','CH','DE','ES','NL','GB','MA','BE']){
 const stations=adapter.normalizePayload(raw).filter(s=>s.countryCode===country);
 const preferred=country==='FR'?'tesla-le-chesnay-france':country==='IT'?'tesla-milan-italy':null;
 const st=stations.find(s=>s.sourceStationId===preferred)||stations.find(s=>s.offers?.length)||stations[0];
 if(!st)throw Error('Mac archive country absent: '+country);
 const lat=st.latitude,lon=st.longitude;window.resolveOrigin=async()=>({lat,lon,label:st.name});
 sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
 document.getElementById('simOrigin').value=st.name;document.getElementById('simMaxDistance').value='1';
 document.getElementById('simDate').value='2026-10-15';document.getElementById('simTime').value='14:00';
 document.getElementById('v9TeslaOnly').click();const area=await compare();
 if(!area)throw Error('Tesla country search failed '+country);
 const target=area.stations.find(s=>s.id===st.canonicalId||s.id===st.sourceStationId);
 if(!target)throw Error('Mac station lost '+st.sourceStationId);
 if(Object.keys(area.diagnostics.sources).some(id=>id!=='tesla-global'))throw Error('National source used for Tesla');
 if(target.offers.some(o=>o.sourceId!=='tesla-global'))throw Error('National/CPO tariff entered Tesla');
 if(target.evses.some(e=>e.officialEvseId))throw Error('Fabricated official Tesla EVSE');
 const quote=area.sessionEvaluations?.[target.id]?.best;
 if(preferred&&(!quote?.result?.complete||quote.targetCurrency!=='EUR'))throw Error('Historical Tesla quote unavailable');
 rows.push({country,stationId:target.id,configurations:target.evses.length,offers:target.offers.length,complete:!!quote?.result?.complete,total:quote?.total??null,currency:quote?.targetCurrency??null,sources:Object.keys(area.diagnostics.sources)});
}
return rows;})().then(done).catch(e=>done({error:String(e)}));''')
   assert isinstance(result,list) and len(result)==9,result
   return {'url':url,'status':'pass','countries':result}
 finally:
  if server:server.shutdown();server.server_close()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);p.add_argument('--url');a=p.parse_args();print(json.dumps(run(a.site,a.url)))
