import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),bundle=path.resolve(process.argv[2]);
globalThis.TCCV9Adapters={ukOpenFeeds:require('../runtime-overrides/assets/v9/adapters/uk-open-feeds.js')};
const adapter=require('../runtime-owned/assets/v9/adapters/canonical-v9.js');
const {consolidateNational,resolveEntities,isTeslaNetwork}=require('../runtime-owned/assets/v9/data-engine.js');
const catalogues={FR:'FR:irve_static',BE:'BE:nap_static',CH:'CH:swiss_integration',DE:'DE:bnetza_afir_archive',ES:'ES:reve_static',NL:'NL:dotnl_static'};
const report={bundleId:path.basename(bundle),countries:{},exceptions:[]};
for(const country of ['FR','BE','CH','DE','ES','NL','GB','IT','MA']){
 const items=[],bySource={};
 for(const file of fs.readdirSync(bundle).filter(f=>f.startsWith(country+'__')&&f.endsWith('.json'))){
  const data=JSON.parse(fs.readFileSync(path.join(bundle,file))),fragments=adapter.toFragments(data);
  bySource[data.source.id]={stations:fragments.length,pricedOffers:fragments.reduce((n,s)=>n+s.offers.length,0),rawOffers:data.offers.length};
  items.push(...fragments.map(fragment=>({source:{id:'prepared:'+data.source.id,priority:100},fragment})));
 }
 const projected=consolidateNational(items,catalogues),stations=resolveEntities(projected.items);
 const reference=catalogues[country];
 if(reference){
  const expected=new Map(items.filter(i=>i.source.id==='prepared:'+reference&&!isTeslaNetwork(i.fragment)).map(i=>[i.fragment.canonicalId,i.fragment]));
  assert.deepEqual(stations.map(s=>s.id).sort(),[...expected.keys()].sort());
  for(const station of stations)assert.deepEqual(station.evses,expected.get(station.id).evses);
 }
 for(const s of stations)for(const o of s.offers){
  assert.ok((o.evseIds||[]).every(id=>s.evses.some(e=>e.id===id)));
  assert.ok((o.connectorIds||[]).every(id=>s.evses.some(e=>(o.evseIds||[]).includes(e.id)&&e.connectors.some(c=>c.id===id))));
 }
 const pricedByChannel={};for(const s of stations)for(const o of s.offers){const channel=o.kind==='direct'?'Direct':o.provider;pricedByChannel[channel]=(pricedByChannel[channel]||0)+1;}
 report.countries[country]={reference:reference||'qualified_CPO_archives',sources:bySource,stations:stations.length,pricedByChannel,
 matchedOffers:projected.diagnostics.matchedOffers,unassigned:projected.diagnostics.unassigned.length};
 if(country==='FR'){
  const original=items.find(i=>i.source.id==='prepared:FR:irve_static'&&i.fragment.sourceStationId==='FRPD1PITMBUC');
  assert.ok(original);const buc=stations.find(s=>s.id===original.fragment.canonicalId);assert.ok(buc);
  assert.equal(stations.some(s=>s.provenance.some(p=>p.sourceStationId==='DL002019')),false);
  report.buc={id:buc.id,evseIds:buc.evses.map(e=>e.officialEvseId),offers:buc.offers.length,rawOffers:buc.unparsedOffers.length};
 }
}
report.status='pass';console.log(JSON.stringify(report,null,2));
