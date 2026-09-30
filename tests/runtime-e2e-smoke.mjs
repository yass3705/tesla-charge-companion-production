import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-2026-09-30-r8');
const runtime=path.join(root,'runtime');

const dataEngine=require(path.join(runtime,'assets/v9/data-engine.js'));
const browserLoaders=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const de=require(path.join(runtime,'assets/v9/adapters/germany-national.js'));
const uk=require(path.join(runtime,'assets/v9/adapters/uk-open-feeds.js'));
const ma=require(path.join(runtime,'assets/v9/adapters/morocco-public.js'));
const nationalCompact=require(path.join(runtime,'assets/v9/adapters/national-compact.js'));
const directOffers=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const legacyDirectStations=require(path.join(runtime,'assets/v9/adapters/legacy-direct-stations.js'));
const switzerlandAvia=require(path.join(runtime,'assets/v9/adapters/switzerland-avia.js'));
const italyIonityExact=require(path.join(runtime,'assets/v9/adapters/italy-ionity-exact.js'));
const extension=require(path.join(runtime,'assets/v9/production-loader-extension.js'));

function fileFetch(baseRoot){
  return async function(url){
    const u=String(url);
    let file;
    if(u.startsWith('file://')) file=new URL(u);
    else file=path.resolve(baseRoot,u);
    try{
      const bytes=fs.readFileSync(file);
      return new Response(bytes,{status:200});
    }catch(err){
      return new Response(String(err),{status:404});
    }
  };
}

const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json'),'utf8'));
const wanted=new Set(['germany-production-snapshot','uk-production-open-feeds','morocco-evgo-native','morocco-fastvolt-public','morocco-kilowatt-public','morocco-totalenergies-hosts','france-national','france-canonical-direct-offers','atlante-direct-france','italy-pun','italy-verified-offers','italy-ionity-r8','switzerland-national','switzerland-verified-offers','switzerland-avia-r8']);
const subRegistry={...registry,sources:(registry.sources||[]).filter(s=>wanted.has(s.id))};

extension.install({
  baseLoaders:browserLoaders,
  adapters:{germanyNational:de,ukOpenFeeds:uk,moroccoPublic:ma,nationalCompact,directOffers,legacyDirectStations,switzerlandAvia,italyIonityExact}
});

const loaders=browserLoaders.createRegistryLoaders({
  registry:subRegistry,
  basePath:pathToFileURL(runtime+path.sep).href,
  adapters:{germanyNational:de,ukOpenFeeds:uk,moroccoPublic:ma,nationalCompact,directOffers,legacyDirectStations},
  fetchImpl:fileFetch(runtime)
});

assert.equal(typeof loaders['germany-production-snapshot'],'function');
assert.equal(typeof loaders['uk-production-open-feeds'],'function');
assert.equal(typeof loaders['morocco-evgo-native'],'function');
assert.equal(typeof loaders['morocco-kilowatt-public'],'function');
assert.equal(typeof loaders['france-national'],'function');
assert.equal(typeof loaders['italy-pun'],'function');
assert.equal(typeof loaders['switzerland-national'],'function');
assert.equal(typeof loaders['switzerland-avia-r8'],'function');
assert.equal(typeof loaders['italy-ionity-r8'],'function');

const engine=dataEngine.createEngine({registry:subRegistry,loaders});

const deAll=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'snapshot-inputs/DE/all.json.gz'))).toString('utf8'));
const deIonity=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'snapshot-inputs/DE/direct/ionity_direct_stations_germany.json.gz'))).toString('utf8'));
const deCoordIndex=new Map();
for(const site of deAll.sites||[]){
  const co=site.coordinates||{},lat=Number(co.latitude),lon=Number(co.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
  const key=lat.toFixed(6)+'|'+lon.toFixed(6);
  const rows=deCoordIndex.get(key)||[];rows.push(site);deCoordIndex.set(key,rows);
}
let safeIonityPoint=null;
for(const loc of deIonity.locations||[]){
  const lat=Number(loc.latitude),lon=Number(loc.longitude),key=lat.toFixed(6)+'|'+lon.toFixed(6),rows=deCoordIndex.get(key)||[];
  if(rows.length===1&&String(rows[0].operator||'').toLowerCase().includes('ionity')){
    safeIonityPoint={lat,lon,name:loc.name};break;
  }
}
assert.ok(safeIonityPoint,'No safe IONITY Germany smoke point found');
const deResult=await engine.queryArea({countryCode:'DE',origin:safeIonityPoint,radiusKm:5,routingBudget:20});
assert.ok(deResult.stations.length>0,'DE area query returned no stations');
assert.ok(deResult.stations.length<5000,'DE tiled query loaded unexpectedly many stations: '+deResult.stations.length);
const dePriced=deResult.stations.filter(s=>(s.offers||[]).length>0);
const ionityPriced=deResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='IONITY Direct'));
assert.ok(ionityPriced.length>=1,'IONITY DE exact smoke point did not receive direct pricing');
assert.ok(deResult.diagnostics.sources['germany-production-snapshot']?.loaded===true);

const gbResult=await engine.queryArea({countryCode:'GB',origin:{lat:51.751274,lon:-0.313710},radiusKm:10,routingBudget:20});
assert.ok(gbResult.stations.length>0,'GB returned no stations');
const gbPriced=gbResult.stations.filter(s=>(s.offers||[]).length>0);
assert.ok(gbPriced.length>0,'GB returned no priced stations from exact tariff joins');
assert.ok(gbResult.diagnostics.sources['uk-production-open-feeds']?.loaded===true);

const exactMfg=gbResult.stations.find(s=>(s.evses||[]).some(e=>e.id==='GB*MFL*E5550'));
assert.ok(exactMfg,'Expected MFG EVSE GB*MFL*E5550 missing from GB runtime query');
const ukRaw=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'snapshot-inputs/UK/all.json.gz'))).toString('utf8'));
const mfgSource=(ukRaw.sources||[]).find(s=>s.name==='MFG EV Power');
assert.ok(mfgSource,'MFG source missing from pinned UK bundle');
let expectedTariff=null;
for(const loc of mfgSource.locations||[]){
  for(const evse of loc.evses||[]){
    if(evse.evse_id!=='GB*MFL*E5550')continue;
    const tid=String(evse.connectors?.[0]?.tariff_ids?.[0]??'');
    const rawTariff=(mfgSource.tariffs||[]).find(t=>String(t.id)===tid);
    expectedTariff=uk.tariffPricing(rawTariff);
  }
}
assert.ok(expectedTariff?.rules?.length,'Expected raw MFG tariff is not rankable');
const expectedRule=expectedTariff.rules[0];
const energyOffers=(exactMfg.offers||[]).flatMap(o=>(o.pricing?.rules||[]).map(r=>({provider:o.provider,price:r.pricePerKwh,currency:r.currency})));
assert.ok(energyOffers.some(x=>x.currency===expectedRule.currency&&Math.abs(Number(x.price)-Number(expectedRule.pricePerKwh))<1e-9),'Exact MFG tariff-id join did not survive runtime engine');


const frResult=await engine.queryArea({countryCode:'FR',origin:{lat:48.8566,lon:2.3522},radiusKm:25,routingBudget:20});
assert.ok(frResult.stations.length>0,'FR returned no stations');
const frPriced=frResult.stations.filter(s=>(s.offers||[]).length>0);

const itResult=await engine.queryArea({countryCode:'IT',origin:{lat:41.9028,lon:12.4964},radiusKm:25,routingBudget:20});
assert.ok(itResult.stations.length>0,'IT returned no stations');
const itPriced=itResult.stations.filter(s=>(s.offers||[]).length>0);
const itIonityPriced=itResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='IONITY Direct'));
assert.ok(itIonityPriced.length>0,'IT exact IONITY offers did not attach to Rome-area PUN stations');

const chResult=await engine.queryArea({countryCode:'CH',origin:{lat:47.61764,lon:9.2688},radiusKm:8,routingBudget:20});
assert.ok(chResult.stations.length>0,'CH returned no stations');
const chPriced=chResult.stations.filter(s=>(s.offers||[]).length>0);
const chAviaPriced=chResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='AVIA VOLT direct'));
assert.ok(chAviaPriced.length>0,'CH exact AVIA offers did not attach around validated Altnau EVSE');

const maResult=await engine.queryArea({countryCode:'MA',routingBudget:20});
assert.ok(maResult.stations.length>=150,'MA station count too low: '+maResult.stations.length);
const maPriced=maResult.stations.filter(s=>(s.offers||[]).length>0);
assert.ok(maPriced.length>=100,'MA priced station count too low: '+maPriced.length);
for(const id of ['morocco-evgo-native','morocco-fastvolt-public','morocco-kilowatt-public','morocco-totalenergies-hosts']){
  assert.ok(maResult.diagnostics.sources[id]?.loaded===true,'MA source not loaded: '+id);
}
const maRegistrySources=subRegistry.sources.filter(s=>(s.countries||[]).includes('MA'));
for(const src of maRegistrySources){
  const serialized=JSON.stringify(src);
  assert.ok(!serialized.includes('raw.githubusercontent.com/yass3705/tesla-charge-companion-data-lab/main'),'MA source still depends on Data Lab main: '+src.id);
}

console.log(JSON.stringify({
  ok:true,
  DE:{areaStations:deResult.stations.length,pricedStations:dePriced.length,ionityDirectSmokeStations:ionityPriced.length,tiled:true},
  GB:{stations:gbResult.stations.length,pricedStations:gbPriced.length,mfgExactTariffIdJoinVerified:true},
  FR:{stations:frResult.stations.length,pricedStations:frPriced.length},
  IT:{stations:itResult.stations.length,pricedStations:itPriced.length,ionityExactPricedStations:itIonityPriced.length},
  CH:{stations:chResult.stations.length,pricedStations:chPriced.length,aviaExactPricedStations:chAviaPriced.length},
  MA:{stations:maResult.stations.length,pricedStations:maPriced.length,allRuntimeSourcesSnapshotLocal:true}
}));
