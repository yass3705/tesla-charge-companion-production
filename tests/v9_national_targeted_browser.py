#!/usr/bin/env python3
"""Archived journeys under national-only catalogues, with independently checked exclusions."""
import argparse
import functools
import json
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def run(site, bundle, url=None):
    script = r'''
const fs=require('fs'),path=require('path');
globalThis.TCCV9Adapters={ukOpenFeeds:require(path.resolve(process.argv[1],'runtime/assets/v9/adapters/uk-open-feeds.js'))};
const adapter=require(path.resolve(process.argv[1],'runtime/assets/v9/adapters/canonical-v9.js'));
const pricing=require(path.resolve(process.argv[1],'runtime/assets/v9/pricing-engine.js'));
const sources=['FR:allego_direct','FR:belib_stations','CH:swiss_integration','FR:emsp_exact','FR:atlante_direct','IT:atlante_direct','IT:ionity_direct','GB:ionity_direct','DE:ionity_direct','GB:source_ev_pcpr_direct','NL:dotnl_static','NL:electra_direct_exact','GB:eco_movement_pcpr_raw','FR:powerdot_direct'];
if(fs.existsSync(path.join(process.argv[2],'FR__bump_national_exact.json')))sources.unshift('FR:bump_national_exact');
if(fs.existsSync(path.join(process.argv[2],'FR__electra_emsp_exact.json')))sources.unshift('FR:electra_emsp_exact');
const nationalIds={FR:'FR:irve_static',BE:'BE:nap_static',CH:'CH:swiss_integration',DE:'DE:bnetza_afir_archive',ES:'ES:reve_static',NL:'NL:dotnl_static'};
const nationalCache=new Map();
function national(source){
 const name=nationalIds[source.slice(0,2)];if(!name||name===source)return null;
 if(!nationalCache.has(name)){
  const d=JSON.parse(fs.readFileSync(path.join(process.argv[2],name.replace(':','__')+'.json')));
  const byOfficial=new Map(),byInternal=new Map(),plugs=new Map();
  for(const row of d.evses){const e={id:row.id,officialEvseId:row.officialEvseId,stationId:row.stationId};for(const [map,k] of [[byOfficial,e.officialEvseId],[byInternal,e.id]])if(k){const list=map.get(k)||[];list.push(e);map.set(k,list);}}
  for(const row of d.connectors){const c={id:row.id,evseId:row.evseId,officialConnectorId:row.officialConnectorId};const list=plugs.get(c.evseId)||[];list.push(c);plugs.set(c.evseId,list);}
  nationalCache.set(name,{byOfficial,byInternal,plugs});
 }
 return nationalCache.get(name);
}
function targetScope(fragment,reference,offer,raw){
 if(!reference)return fragment.canonicalId;
 const ids=raw?[offer.scope.evseId]:offer.evseIds||[];
 const matches=ids.map(id=>{const e=fragment.evses.find(e=>e.id===id);if(!e)return null;
   const rows=(e.officialEvseId?reference.byOfficial.get(e.officialEvseId):reference.byInternal.get(e.id))||[];
   return rows.length===1?rows[0]:null;});
 if(!matches.length||matches.some(e=>!e)||new Set(matches.map(e=>e.stationId)).size!==1)return null;
 const connectorIds=raw?(offer.scope.connectorId?[offer.scope.connectorId]:[]):offer.connectorIds||[];
 for(const id of connectorIds){
  const sourceEvse=fragment.evses.find(e=>e.connectors.some(c=>c.id===id)),c=sourceEvse?.connectors.find(c=>c.id===id);
  const index=ids.indexOf(sourceEvse?.id);if(index<0)return null;
  const exact=(reference.plugs.get(matches[index].id)||[]).filter(n=>n.id===c.id||c.officialConnectorId&&n.officialConnectorId===c.officialConnectorId);
  if(exact.length!==1)return null;
 }
 return matches[0].stationId;
}
const targets=sources.map(source=>{
 const data=JSON.parse(fs.readFileSync(path.join(process.argv[2],source.replace(':','__')+'.json')));
 const rawOnly=['GB:eco_movement_pcpr_raw','FR:powerdot_direct','NL:electra_direct_exact'].includes(source);
 const fragments=adapter.toFragments(data).filter(st=>st.latitude!=null&&st.longitude!=null&&(rawOnly?st.unparsedOffers.length:st.offers.length));
 if(!fragments.length)throw Error('No representative archived offer: '+source);
 // A parking rate is not a billed fee when the default session has no idle
 // period. Select an archived positive charging fee applicable to this session.
 const probe=o=>pricing.evaluateOffer(o,{energyKwh:45,durationMinutes:60,chargingMinutes:60,postChargeMinutes:0,powerKw:22,startAt:'2026-10-15T12:00:00Z'});
 const compound=st=>st.offers.some(o=>{const q=probe(o);return q.complete&&q.components?.chargingTime>0&&o.pricing?.rules?.every(r=>r.chargePerMinute>0);});
 const calculable=st=>rawOnly||st.offers.some(o=>probe(o).complete);
 const reference=national(source);
 const candidates=fragments.filter(calculable).map(st=>({st,targetIds:[...st.offers.map(o=>targetScope(st,reference,o,false)),...st.unparsedOffers.map(o=>targetScope(st,reference,o,true))]}));
 const chosen=candidates.find(x=>x.targetIds.length&&x.targetIds.every(id=>id&&id===x.targetIds[0])&&compound(x.st))||
   candidates.find(x=>x.targetIds.length&&x.targetIds.every(id=>id&&id===x.targetIds[0]))||candidates[0];
 const st=chosen.st,excluded=chosen.targetIds.some(id=>!id)||!chosen.targetIds.length;
 return{source,excluded,exclusionReason:excluded?'exact_national_scope_unproved':null,id:excluded?st.canonicalId:chosen.targetIds[0],sourceStationId:st.canonicalId,lat:st.latitude,lon:st.longitude,country:st.countryCode,rawOnly,compound:compound(st),pricedIds:st.offers.map(o=>o.id),rawIds:st.unparsedOffers.map(o=>o.id)};
});
console.log(JSON.stringify(targets));
'''
    targets = json.loads(subprocess.check_output(['node', '-e', script, str(site), str(bundle)], text=True))
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *_args):
            pass
    server = None
    if url is None:
        server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(site)))
        threading.Thread(target=server.serve_forever, daemon=True).start()
    options = Options(); options.add_argument('-headless')
    options.binary_location = '/Applications/Firefox.app/Contents/MacOS/firefox'
    results = []
    try:
        with webdriver.Firefox(options=options) as browser:
            browser.set_window_size(1280, 900); browser.set_script_timeout(120)
            browser.get(url or f'http://127.0.0.1:{server.server_port}/')
            WebDriverWait(browser, 30).until(lambda d: d.execute_script('return window.__TCC_V9_SHELL__?.ready'))
            for target in targets:
                result = browser.execute_async_script(r'''
const target=arguments[0],done=arguments[1];
(async()=>{
 window.resolveOrigin=async()=>({lat:target.lat,lon:target.lon,label:target.source});
 sessionStorage.setItem(`tcc-v9-country:${target.lat.toFixed(3)},${target.lon.toFixed(3)}`,target.country);
 document.getElementById('simOrigin').value=target.source;
 document.getElementById('simMaxDistance').value='2';
 document.getElementById('simDate').value='2026-10-15';
 document.getElementById('simTime').value='14:00';
 document.getElementById('simUnplugTime').value='';
 document.getElementById('simOperatorFilter').dataset.v9Mode='all';
 let area=await window.compare();
 if(!area)throw Error('No search area: '+(localStorage.getItem('tccV9ProductionShellDiagnosticsV1')||''));
 const map=area.mapStations.find(st=>st.id===target.id);
 if(target.excluded){
   if(map)throw Error('Unattributable CPO station leaked into national catalogue');
   return {source:target.source,stationId:target.id,excluded:true,reason:target.exclusionReason,
     matching:area.mapStations.length,sourceErrors:area.diagnostics?.errors?.length||0};
 }
 if(!map)throw Error('Archived target missing from search: '+target.id);
 if(map.page)area=await area.navigateToPage(map.page);
 const st=area.stations.find(st=>st.id===target.id);
 if(!st)throw Error('Target page missing its station');
 const own=o=>o.metadata?.sourceId===target.source||o.sourceId==='prepared:'+target.source||o.sourceId===target.source;
 const offers=(st.offers||[]).filter(own),raw=(st.unparsedOffers||[]).filter(own);
 const ids=new Set(offers.map(o=>o.id));
 const missingOfferIds=target.pricedIds.filter(id=>!(st.offers||[]).some(o=>o.id===id||o.aliases?.includes(id)));
 const missingRawIds=target.rawIds.filter(id=>!(st.unparsedOffers||[]).some(o=>o.id===id));
 const evseIds=new Set(st.evses.map(e=>e.id)),connectorIds=new Set(st.evses.flatMap(e=>e.connectors.map(c=>c.id)));
 const badScope=offers.some(o=>(o.evseIds||[]).some(id=>!evseIds.has(id))||(o.connectorIds||[]).some(id=>!connectorIds.has(id)||!st.evses.some(e=>(o.evseIds||[]).includes(e.id)&&e.connectors.some(c=>c.id===id))))||
   raw.some(o=>!evseIds.has(o.scope?.evseId)||o.scope?.connectorId!=null&&!st.evses.some(e=>e.id===o.scope.evseId&&e.connectors.some(c=>c.id===o.scope.connectorId)));
 const e=area.sessionEvaluations?.[st.id],evaluated=[e?.best,...(e?.alternatives||[]),...(e?.incomplete||[])].filter(o=>o&&ids.has(o.offerId));
 // A page has at most 160 ranked stations; reveal only explicit 20-card batches.
 while(![...document.querySelectorAll('.v9-result-card')].some(el=>el.dataset.v9StationId===target.id)){
   const more=document.querySelector('.v9-more-stations');if(!more)break;more.click();
 }
 const card=[...document.querySelectorAll('.v9-result-card')].find(el=>el.dataset.v9StationId===target.id);
 if(!card)throw Error('Target card not rendered');
 card.querySelectorAll('details').forEach(el=>el.open=true);
 const text=card.textContent;
 const calculated=[...card.querySelectorAll('[data-v9-effective-total]')].map(el=>Number(el.dataset.v9EffectiveTotal));
 return{source:target.source,stationId:target.id,page:map.page,offers:offers.length,raw:raw.length,badScope,missingOfferIds,missingRawIds,
   complete:evaluated.filter(o=>o.result?.complete&&Number.isFinite(o.costPerRecoveredKm)).length,
   compound:evaluated.some(o=>o.result?.complete&&(o.result.components?.chargingTime>0||o.result.components?.parkingTime>0)),
   calculated,rawLabel:text.includes('Tarif incalculable'),channels:['Direct','Electra','Electroverse'].every(c=>text.includes(c)),
   feeDetail:text.includes('Temps de charge :')||text.includes('Stationnement :'),sourceErrors:area.diagnostics?.errors?.length||0};
})().then(done).catch(error=>done({error:String(error),source:target.source}));
''', target)
                print(json.dumps(result, ensure_ascii=False), file=sys.stderr, flush=True)
                if result.get('excluded'):
                    if not target['excluded'] or result.get('sourceErrors'):
                        raise AssertionError(result)
                    results.append(result)
                    continue
                if result.get('error') or result.get('badScope') or result.get('sourceErrors') or result.get('missingOfferIds') or result.get('missingRawIds') or not result.get('channels'):
                    raise AssertionError(result)
                if target['rawOnly']:
                    if result['offers'] or not result['raw'] or not result['rawLabel']:
                        raise AssertionError(f'Raw source promoted or hidden: {result}')
                elif not result['complete'] or not any(amount > 0 for amount in result['calculated']):
                    raise AssertionError(f'Proved tariff missing from session/UI: {result}')
                if target['compound'] and (not result['compound'] or not result['feeDetail']):
                    raise AssertionError(f'Compound fee missing: {result}')
                results.append(result)
    finally:
        if server is not None:
            server.shutdown(); server.server_close()
    return results

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--site',type=Path,required=True);parser.add_argument('--bundle',type=Path,required=True);parser.add_argument('--url')
    args=parser.parse_args();print(json.dumps(run(args.site,args.bundle,args.url),ensure_ascii=False))
