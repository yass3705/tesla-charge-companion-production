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
const franceIonityExact=require(path.join(runtime,'assets/v9/adapters/france-ionity-exact.js'));
const atlanteItalyExact=require(path.join(runtime,'assets/v9/adapters/atlante-italy-exact.js'));
const netherlandsDotnl=require(path.join(runtime,'assets/v9/adapters/netherlands-dotnl.js'));
const belgiumNap=require(path.join(runtime,'assets/v9/adapters/belgium-nap.js'));
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
const wanted=new Set(['germany-production-snapshot','germany-ionity-isolated-r8','uk-production-open-feeds','spain-reve','spain-reve-offers','netherlands-dotnl-national','belgium-nap-national','netherlands-direct-offers','morocco-evgo-native','morocco-fastvolt-public','morocco-kilowatt-public','morocco-totalenergies-hosts','france-national','france-canonical-direct-offers','atlante-direct-france','france-electra-platform','france-electroverse-r8','italy-pun','italy-verified-offers','italy-ionity-r8','france-ionity-r8','italy-atlante-r8','switzerland-national','switzerland-verified-offers','switzerland-avia-r8']);
const subRegistry={...registry,sources:(registry.sources||[]).filter(s=>wanted.has(s.id))};

extension.install({
  baseLoaders:browserLoaders,
  adapters:{germanyNational:de,ukOpenFeeds:uk,moroccoPublic:ma,nationalCompact,directOffers,legacyDirectStations,switzerlandAvia,italyIonityExact,franceIonityExact,atlanteItalyExact,netherlandsDotnl,belgiumNap}
});

const loaders=browserLoaders.createRegistryLoaders({
  registry:subRegistry,
  basePath:pathToFileURL(runtime+path.sep).href,
  adapters:{germanyNational:de,ukOpenFeeds:uk,moroccoPublic:ma,nationalCompact,directOffers,legacyDirectStations,netherlandsDotnl,belgiumNap},
  fetchImpl:fileFetch(runtime)
});

assert.equal(typeof loaders['germany-production-snapshot'],'function');
assert.equal(typeof loaders['uk-production-open-feeds'],'function');
assert.equal(typeof loaders['morocco-evgo-native'],'function');
assert.equal(typeof loaders['morocco-kilowatt-public'],'function');
assert.equal(typeof loaders['france-national'],'function');
if(process.env.REQUIRE_ELECTRA_PLATFORM==='1') assert.equal(typeof loaders['france-electra-platform'],'function');
assert.equal(typeof loaders['italy-pun'],'function');
assert.equal(typeof loaders['switzerland-national'],'function');
assert.equal(typeof loaders['switzerland-avia-r8'],'function');
assert.equal(typeof loaders['italy-ionity-r8'],'function');
assert.equal(typeof loaders['france-ionity-r8'],'function');
assert.equal(typeof loaders['italy-atlante-r8'],'function');

const engine=dataEngine.createEngine({registry:subRegistry,loaders});

// TESLA is a required local source: never silently replace it with a remote or empty feed.
const teslaPath=path.join(runtime,'data/tesla_stations.json');
const teslaBytes=fs.readFileSync(teslaPath);
assert.ok(teslaBytes.byteLength>1000,'TESLA inventory is unexpectedly empty');
const teslaInventory=JSON.parse(teslaBytes.toString('utf8'));
assert.ok(Array.isArray(teslaInventory)?teslaInventory.length>0:teslaInventory&&typeof teslaInventory==='object'&&Object.keys(teslaInventory).length>0,'TESLA inventory JSON is empty');
assert.ok(registry.sources.some(s=>(s.countries||[]).includes('ES')&&s.active!==false),'ES runtime sources missing');
assert.ok(registry.sources.some(s=>(s.countries||[]).includes('NL')&&s.active!==false),'NL runtime sources missing');

const supplement=JSON.parse(fs.readFileSync(path.join(root,'snapshot-inputs/DE/direct/ionity_isolated_unpriced_supplement.json'),'utf8'));
assert.equal(supplement.sites.length,4,'Updated German IONITY isolated unpriced sites must be 4');
assert.equal(supplement.metadata.quarantinedNearThirdParty,8,'Ambiguous German IONITY sites must remain quarantined');
const supplementRows=await loaders['germany-ionity-isolated-r8']({});
assert.equal(supplementRows.length,3,'German isolated supplement loader did not retain all 3');
assert.ok(supplementRows.every(s=>s.offers.length===0),'Supplemental IONITY stations must not receive guessed tariffs');
const knownSupplementIds=new Set(supplementRows.map(s=>s.canonicalId));
assert.equal(knownSupplementIds.size,4,'Supplemental IONITY canonical identities collide');

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
const isolatedPoint={lat:supplement.sites[0].coordinates.latitude,lon:supplement.sites[0].coordinates.longitude};
const isolatedResult=await engine.queryArea({countryCode:'DE',origin:isolatedPoint,radiusKm:0.2,routingBudget:20});
assert.ok(isolatedResult.stations.some(s=>knownSupplementIds.has(s.id)),'No isolated IONITY station surfaced through the production engine');
assert.ok(isolatedResult.stations.filter(s=>knownSupplementIds.has(s.id)).every(s=>(s.offers||[]).length===0),'Isolated IONITY stations acquired unsupported prices');
assert.ok(isolatedResult.diagnostics.sources['germany-ionity-isolated-r8']?.loaded===true,'Supplemental DE source did not load');

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


const esResult=await engine.queryArea({countryCode:'ES',origin:{lat:40.4168,lon:-3.7038},radiusKm:12,routingBudget:20});
assert.ok(esResult.stations.length>0,'ES Madrid runtime query returned no stations');
assert.ok(esResult.diagnostics.sources['spain-reve']?.loaded===true,'ES REVE runtime source not loaded');

const nlResult=await engine.queryArea({countryCode:'NL',origin:{lat:52.3676,lon:4.9041},radiusKm:12,routingBudget:20});
assert.ok(nlResult.stations.length>0,'NL Amsterdam runtime query returned no stations');
assert.ok(nlResult.diagnostics.sources['netherlands-dotnl-national']?.loaded===true,'NL runtime source not loaded');

const frResult=await engine.queryArea({countryCode:'FR',origin:{lat:48.8566,lon:2.3522},radiusKm:25,routingBudget:20});
assert.ok(frResult.stations.length>0,'FR returned no stations');
const frPriced=frResult.stations.filter(s=>(s.offers||[]).length>0);
const frElectroverse=frResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='Electroverse'));
const frElectra=frResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='Electra'));
const frDualEmsp=frResult.stations.filter(st=>{
  const providers=new Set((st.offers||[]).map(o=>o.provider));
  return providers.has('Electra')&&providers.has('Electroverse');
});
assert.ok(frElectroverse.length>0,'FR compact Electroverse offers did not attach in Paris-area runtime query');
const requireElectra=process.env.REQUIRE_ELECTRA_PLATFORM==='1';
if(requireElectra){
  assert.ok(frResult.diagnostics.sources['france-electra-platform']?.loaded===true,'FR Electra platform overlay source not loaded');
  assert.ok(frElectra.length>0,'FR Electra platform offers did not attach to national France stations');
  assert.ok(frDualEmsp.length>0,'FR national station hub did not independently receive both Electra and Electroverse offers');
}

const itResult=await engine.queryArea({countryCode:'IT',origin:{lat:41.9028,lon:12.4964},radiusKm:25,routingBudget:20});
assert.ok(itResult.stations.length>0,'IT returned no stations');
const itPriced=itResult.stations.filter(s=>(s.offers||[]).length>0);
const itIonityPriced=itResult.stations.filter(s=>(s.offers||[]).some(o=>o.provider==='IONITY Direct'));
assert.ok(itIonityPriced.length>0,'IT exact IONITY offers did not attach to Rome-area PUN stations');

const atlanteProbe=await engine.queryArea({countryCode:'IT',origin:{lat:44.958471,lon:9.909126},radiusKm:2,routingBudget:20});
const atlanteSmoke=atlanteProbe.stations.find(s=>
  (s.evses||[]).some(e=>e.id==='IT*ATE*E01003*1'||(e.aliases||[]).includes('IT*ATE*E01003*1')) &&
  (s.offers||[]).some(o=>o.provider==='Atlante direct')
);
assert.ok(atlanteSmoke,'Atlante Italy exact offer did not attach to pinned Fiorenzuola EVSE IT*ATE*E01003*1');

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
  TESLA:{localInventoryPresent:true,bytes:teslaBytes.byteLength},
  ES:{stations:esResult.stations.length,sourceLoaded:true},
  NL:{stations:nlResult.stations.length,sourceLoaded:true},
  DE:{supplementalIsolatedUnpriced:supplementRows.length,areaStations:deResult.stations.length,pricedStations:dePriced.length,ionityDirectSmokeStations:ionityPriced.length,tiled:true},
  GB:{stations:gbResult.stations.length,pricedStations:gbPriced.length,mfgExactTariffIdJoinVerified:true},
  FR:{stations:frResult.stations.length,pricedStations:frPriced.length,electroverseStations:frElectroverse.length,electraStations:frElectra.length,dualEmspStations:frDualEmsp.length},
  IT:{stations:itResult.stations.length,pricedStations:itPriced.length,ionityExactPricedStations:itIonityPriced.length,atlanteExactSmoke:true},
  CH:{stations:chResult.stations.length,pricedStations:chPriced.length,aviaExactPricedStations:chAviaPriced.length},
  MA:{stations:maResult.stations.length,pricedStations:maPriced.length,allRuntimeSourcesSnapshotLocal:true}
}));
