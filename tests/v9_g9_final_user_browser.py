#!/usr/bin/env python3
"""User regressions on an actual isolated package/URL; no supplier traffic."""
from __future__ import annotations
import argparse, functools, json, threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BUC='tcc:65a4419836d7213884ef581d66a51a526ccf8e82970bdd8bd017c8f3c8ac8ded'

def run(site, url=None):
    server=None
    if not url:
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self,*args): pass
        server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(site)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
        url=f'http://127.0.0.1:{server.server_port}/'
    options=Options();options.add_argument('-headless');options.binary_location='/Applications/Firefox.app/Contents/MacOS/firefox'
    output={'url':url,'queries':[]}
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(1280,900);browser.set_script_timeout(180);browser.get(url)
            WebDriverWait(browser,30).until(lambda b:b.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            layout=browser.execute_script('''
const save=document.getElementById('v9SaveDefaultOrigin'),gps=document.getElementById('v9UseCurrentPosition'),input=document.getElementById('simOrigin');
if(!save||!gps||save.parentElement!==gps.parentElement||!input.parentElement.contains(save))throw Error('Address actions misplaced');
input.value='Adresse de recette';save.click();return {sameGroup:true,stored:localStorage.getItem('tccDefaultOrigin')};''')
            browser.switch_to.alert.accept();assert browser.execute_script("return localStorage.getItem('tccDefaultOrigin')")=='Adresse de recette';output['address']={'sameGroup':True,'stored':True}
            for name,country,lat,lon,radius in [('Buc','FR',48.771,2.128,3),('Milan Arduino','IT',45.47814258,9.15235154,2),('Le Chesnay','FR',48.828051,2.1191,2),('Paris','FR',48.8566,2.3522,5)]:
                result=browser.execute_async_script(r'''
const [name,country,lat,lon,radius,buc]=arguments[0],done=arguments[1];
(async()=>{
window.resolveOrigin=async()=>({lat,lon,label:name});sessionStorage.setItem(`tcc-v9-country:${lat.toFixed(3)},${lon.toFixed(3)}`,country);
document.getElementById('simOrigin').value=name;document.getElementById('simMaxDistance').value=String(radius);
document.getElementById('simOperatorFilter').dataset.v9Mode='all';document.getElementById('simRanking').value='price';
document.getElementById('simDate').value='2026-10-15';document.getElementById('simTime').value='14:00';
let area=await compare();if(!area)throw Error('No area');
const ids=area.mapStations.map(s=>s.id),initial=document.querySelectorAll('.v9-result-card').length;
if(initial>20)throw Error('Initial card overflow');
let counts=[initial];for(let n=0;n<2;n++){const more=document.querySelector('.v9-more-stations');if(!more)break;more.click();const count=document.querySelectorAll('.v9-result-card').length;
 if(count!==Math.min(initial+20*(n+1),area.stations.length))throw Error('Explicit increment is not 20');counts.push(count);}
const originalIds=area.stations.map(s=>s.id);let pageRoundtrip=false;
if(ids.length>160){const last=Math.floor((ids.length-1)/160);await area.navigateToPage(last);const back=await area.navigateToPage(0);if(JSON.stringify(originalIds)!==JSON.stringify(back.stations.map(s=>s.id)))throw Error('Page roundtrip altered ranking');area=back;pageRoundtrip=true;}
let target=null;
if(name==='Buc'){
 const marker=area.mapStations.find(s=>s.id===buc);if(!marker)throw Error('National Buc absent');if(marker.page)area=await area.navigateToPage(marker.page);
 const station=area.stations.find(s=>s.id===buc);if(!station)throw Error('Buc page missing');
 target={id:station.id,evseIds:station.evses.map(e=>e.officialEvseId),offers:station.offers.length,raw:station.unparsedOffers.length};
 if(target.evseIds.length!==6||new Set(target.evseIds).size!==6||target.offers||target.raw)throw Error('Buc identity or unattributed tariff changed');
 if(area.mapStations.filter(s=>s.name?.toLowerCase().includes('intermarch')&&s.name?.toLowerCase().includes('buc')).length!==1)throw Error('Buc duplicate');
}
if(name==='Milan Arduino'){
 const id='tesla-milan-italy',marker=area.mapStations.find(s=>s.id===id);if(!marker)throw Error('Milan missing');if(marker.page)area=await area.navigateToPage(marker.page);
 const s=area.stations.find(s=>s.id===id),e=area.sessionEvaluations[id];
 target={id,offers:s.offers.length,complete:e?.best?.result?.complete,total:e?.best?.total,currency:s.offers[0]?.currency};
 if(!target.offers||!target.complete||!(target.total>0)||target.currency!=='EUR')throw Error('Milan tariff not evaluated: '+JSON.stringify(target));
}
if(name==='Le Chesnay'&&ids.includes('tesla-le-chesnay-france'))throw Error('Tesla standalone station escaped national policy');
const bad=area.stations.flatMap(s=>s.offers||[]).filter(o=>o.metadata?.nationalJoin&&!(o.evseIds||[]).length);
if(bad.length)throw Error('Unscoped national offer');
const labels=[...document.querySelectorAll('.v9-result-card')].map(c=>c.textContent);
if(labels.some(t=>!['Direct','Electra','Electroverse'].every(x=>t.includes(x))))throw Error('Channel missing');
const identity=TCCV9ProductionShell.pdcEntries({station:{evses:[{id:'technical',officialEvseId:'FR*ABC*E1',connectors:[{id:'technical-plug'}]}]}});
if(identity[0].label!=='FR*ABC*E1')throw Error('Official EVSE label missing');
document.querySelector('.v9-view-map')?.click();const markers=document.querySelectorAll('.v9-map-marker').length;
if(ids.length&&!markers)throw Error('Map empty');document.querySelector('.v9-map-zoom-in')?.click();document.querySelector('.v9-map-zoom-out')?.click();
return {name,country,matching:ids.length,initial,counts,pageRoundtrip,target,markers,sourceErrors:area.diagnostics.errors,mapIds:ids};
})().then(done).catch(e=>done({error:String(e)}));''',[name,country,lat,lon,radius,BUC])
                assert not result.get('error'),result
                assert not result['sourceErrors'],result
                output['queries'].append(result)
            controls=browser.execute_async_script(r"""
const done=arguments[0];
(async()=>{
 const shell=TCCV9ProductionShell;
 const invalid=document.getElementById('v9BatteryCapacity'),previous=invalid.value;
 invalid.value='0';const blocked=await compare();if(blocked!==null)throw Error('Invalid battery accepted');invalid.value=previous;
 const values={v9BatteryCapacity:90,v9Consumption:18,v9MaxAc:22,v9MaxDc:180};
 for(const [id,value] of Object.entries(values))document.getElementById(id).value=String(value);
 const session=shell.buildSession(shell.readInputs(window),'FR');
 if(session.batteryCapacityKwh!==90||session.consumptionKwhPer100Km!==18||session.vehicleMaxAcKw!==22||session.vehicleMaxDcKw!==180)throw Error('Vehicle inputs lost');
 const select=document.getElementById('simOperatorFilter');select.dataset.v9Mode='all';
 const all=await compare();
 const selected=[...new Set(all.stations.map(s=>TCCV9DataEngine.operatorId(s.physicalOperator)))].slice(0,2);
 if(selected.length!==2)throw Error('Fixture must exercise two networks');
 for(const option of select.options)option.selected=selected.includes(option.value);
 select.dataset.v9Mode='selected';const filtered=await compare();
 const observed=[...new Set(filtered.stations.map(s=>TCCV9DataEngine.operatorId(s.physicalOperator)))];
 if(!filtered.stations.length||observed.some(id=>!selected.includes(id)))throw Error('Network multiselect failed');
 document.getElementById('v9AllNetworks').click();document.getElementById('simMinPowerKw').value='50';
 const powered=await compare();
 if(!powered||powered.mapStations.length>all.mapStations.length)throw Error('Power filter expanded results');
 document.getElementById('simMinPowerKw').value='';
 document.getElementById('v9TeslaOnly').click();const tesla=await compare();
 if(tesla.stations.some(s=>!/tesla/i.test(TCCV9DataEngine.operatorId(s.physicalOperator))))throw Error('Tesla filter leaked another network');
 document.getElementById('v9AllNetworks').click();
 const catalogue=await shell.loadSubscriptionCatalogue(window,window.__TCC_V9_SHELL_CONFIG__);
 if(catalogue.length)throw Error('Unqualified historical subscription catalogue leaked');
 const guidance=document.getElementById('v9ValidationPanel'),feedback=document.getElementById('v9FeedbackText');
 if(!feedback?.labels?.length||!document.getElementById('v9FeedbackShare')||document.getElementById('v9FeedbackStatus')?.getAttribute('aria-live')!=='polite')throw Error('Feedback inaccessible');
 const radius=document.getElementById('simMaxDistance');if(Number(radius.max)!==100)throw Error('Radius silently reduced');
 return {invalidBatteryBlocked:true,vehicle:{capacity:session.batteryCapacityKwh,consumption:session.consumptionKwhPer100Km,ac:session.vehicleMaxAcKw,dc:session.vehicleMaxDcKw},networks:{selected,observed},powerFiltered:powered.mapStations.length,teslaFiltered:tesla.mapStations.length,unqualifiedSubscriptionsExcluded:true,feedbackAccessible:true,maxRadius:100};
})().then(done).catch(e=>done({error:String(e)}));
""")
            assert 'error' not in controls,controls
            output['controls']=controls
            browser.get(url.rstrip('/')+'/control/index.html')
            browser.execute_script("const f=document.createElement('iframe');f.id='mobile';f.style.cssText='width:390px;height:844px;border:0';f.src=arguments[0];document.body.append(f);",url.rstrip('/')+'/v9-production-shell/')
            browser.switch_to.frame('mobile')
            WebDriverWait(browser,30).until(lambda b:b.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            browser.execute_async_script("""const done=arguments[0];window.resolveOrigin=async()=>({lat:48.8566,lon:2.3522,label:'Paris mobile'});sessionStorage.setItem('tcc-v9-country:48.857,2.352','FR');document.getElementById('simOrigin').value='Paris mobile';document.getElementById('simMaxDistance').value='5';document.getElementById('simOperatorFilter').dataset.v9Mode='all';compare().then(a=>{document.querySelector('.v9-view-map')?.click();done(!!a);}).catch(e=>done(String(e)));""")
            mobile=browser.execute_script('''
const d=document.documentElement,save=document.getElementById('v9SaveDefaultOrigin'),gps=document.getElementById('v9UseCurrentPosition');
return {width:innerWidth,scrollWidth:d.scrollWidth,sameGroup:save.parentElement===gps.parentElement,
 mapMarkers:document.querySelectorAll('.v9-map-marker').length,feedback:!!document.getElementById('v9FeedbackShare'),initialCards:document.querySelectorAll('.v9-result-card').length};''')
            assert mobile['width']==390 and mobile['scrollWidth']<=390,mobile
            assert mobile['sameGroup'] and mobile['mapMarkers']>0 and mobile['feedback'] and mobile['initialCards']<=20,mobile
            output['mobile']=mobile;output['status']='pass'
    finally:
        if server: server.shutdown();server.server_close()
    return output
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--site',type=Path,required=True);p.add_argument('--url');a=p.parse_args()
    print(json.dumps(run(a.site,a.url),ensure_ascii=False))
