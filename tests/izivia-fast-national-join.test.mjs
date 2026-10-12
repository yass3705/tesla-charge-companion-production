import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-izivia-fast-candidate');
const runtime=path.join(root,'runtime');
const engineModule=require(path.join(runtime,'assets/v9/data-engine.js'));
const loadersModule=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const nationalCompact=require(path.join(runtime,'assets/v9/adapters/national-compact.js'));
const directOffers=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const extension=require(path.join(runtime,'assets/v9/production-loader-extension.js'));
const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json'),'utf8'));
const keys=new Set(['france-national','france-izivia-fast-direct-exact','france-izivia-fast-connector-correction']);
const scoped={...registry,sources:registry.sources.filter(s=>keys.has(s.id))};
assert.equal(scoped.sources.length,3);
extension.install({baseLoaders:loadersModule,adapters:{nationalCompact,directOffers}});
const fetchImpl=async url=>{
  const p=String(url).startsWith('file://')?new URL(String(url)):path.resolve(runtime,String(url));
  try{return new Response(fs.readFileSync(p),{status:200});}
  catch(e){return new Response(String(e),{status:404});}
};
const loaders=loadersModule.createRegistryLoaders({
  registry:scoped,basePath:pathToFileURL(runtime+path.sep).href,
  adapters:{nationalCompact,directOffers},fetchImpl
});
const data=JSON.parse(fs.readFileSync(path.join(root,'snapshot-inputs/FR/direct/izivia_fast_direct_offers.json'),'utf8'));
const corrections=JSON.parse(fs.readFileSync(path.join(root,'snapshot-inputs/FR/direct/izivia_fast_connector_correction.json'),'utf8'));
const sites=new Set(corrections.stations.map(s=>s.sourceStationId));
assert.equal(sites.size,616);
assert.equal(data.policy.chademoOfferAssignmentsRemoved,12);
const auditMap=new Map();
for(const o of data.directOffers){
  const power=o.metadata.powerKw;
  for(const sid of o.stationIds){
    if(!auditMap.has(sid))auditMap.set(sid,[]);
    auditMap.get(sid).push({id:o.id,kind:o.connectorKinds[0],power});
  }
}
assert.equal(auditMap.size,616);
const engine=engineModule.createEngine({registry:scoped,loaders});
const result=await engine.queryArea({countryCode:'FR',origin:{lat:46.65,lon:2.0},radiusKm:1120,routingBudget:20});
const seen=new Map(),extraneous=[],violations=[];
for(const station of result.stations){
 const offers=(station.offers||[]).filter(o=>String(o.provider||'').startsWith('IZIVIA FAST direct'));
 if(!offers.length)continue;
 const id=station.id.replace(/^FR:national:/,'');
 if(!sites.has(id)){extraneous.push(station.id);continue;}
 if(seen.has(id)){violations.push({id,reason:'duplicate_station_entity'});continue;}
 const expected=auditMap.get(id);
 if(offers.length!==expected.length)violations.push({id,reason:'offer_count',got:offers.length,expected:expected.length});
 for(const offer of offers){
   const e=expected.find(x=>x.id===offer.id);
   if(!e){violations.push({id,reason:'unexpected_offer',offer:offer.id});continue;}
   if(offer.kind!=='direct')violations.push({id,reason:'not_direct'});
   const compatible=(station.evses||[]).flatMap(x=>x.connectors||[]).some(c=>
     c.kind===e.kind && Math.abs(Number(c.powerKw)-e.power)<.01);
   if(!compatible)violations.push({id,reason:'connector_incompatible',kind:e.kind,power:e.power});
 }
 if(station.evses?.some(e=>String(e.id||'').toLowerCase().includes('chademo')))
   violations.push({id,reason:'chademo_evse_id'});
 seen.set(id,offers.length);
}
const missing=[...sites].filter(id=>!seen.has(id));
const report={expectedStations:616,matchedStations:seen.size,missingStations:missing.length,
   unexpectedStations:extraneous.length,invalidMatches:violations.length,
   totalAttachedOffers:[...seen.values()].reduce((a,b)=>a+b,0),
   inspectedNationalStations:result.stations.length,missingSamples:missing.slice(0,15),
   unexpectedSamples:extraneous.slice(0,15),violationSamples:violations.slice(0,15)};
console.log(JSON.stringify(report));
const out=path.join(root,'izivia-fast-national-join-audit.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
assert.equal(seen.size,616,'not all 616 FAST stations receive exact direct offers');
assert.deepEqual(extraneous,[],'a direct offer was assigned outside validated FAST stations');
assert.deepEqual(violations,[],'station connector/power or offer identity is inconsistent');
assert.equal(missing.length,0,'national FAST station IDs missing');
