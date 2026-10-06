import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-2026-09-30-r8');
const runtime=path.join(root,'runtime');
const currentSnapshot=String(JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).snapshotId).slice(0,10)>='2026-10-06';

const dataEngine=require(path.join(runtime,'assets/v9/data-engine.js'));
const sessionEngine=require(path.join(runtime,'assets/v9/session-engine.js'));
const browserLoaders=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const de=require(path.join(runtime,'assets/v9/adapters/germany-national.js'));
const uk=require(path.join(runtime,'assets/v9/adapters/uk-open-feeds.js'));
const ma=require(path.join(runtime,'assets/v9/adapters/morocco-public.js'));
const nationalCompact=require(path.join(runtime,'assets/v9/adapters/national-compact.js'));
const directOffers=require(path.join(runtime,'assets/v9/adapters/direct-offers.js'));
const legacyDirectStations=require(path.join(runtime,'assets/v9/adapters/legacy-direct-stations.js'));
const legacyDirectTariffs=require(path.join(runtime,'assets/v9/adapters/legacy-direct-tariffs.js'));
const switzerlandAvia=require(path.join(runtime,'assets/v9/adapters/switzerland-avia.js'));
const italyIonityExact=require(path.join(runtime,'assets/v9/adapters/italy-ionity-exact.js'));
const franceIonityExact=require(path.join(runtime,'assets/v9/adapters/france-ionity-exact.js'));
const atlanteItalyExact=require(path.join(runtime,'assets/v9/adapters/atlante-italy-exact.js'));
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
const wanted=new Set(['germany-production-snapshot','germany-ionity-isolated-r8','uk-production-open-feeds','spain-reve','spain-reve-offers','netherlands-dotnl','netherlands-direct-offers','morocco-evgo-native','morocco-fastvolt-public','morocco-kilowatt-public','morocco-totalenergies-hosts','france-national','france-canonical-direct-offers','e55c-direct-france','atlante-direct-france','france-electra-direct','france-electra-bois-current-inventory','france-aldi-guyancourt-direct','france-izivia-fast-dole-inventory','france-izivia-fast-official-inventory','france-izivia-fast-official-france','france-electra-platform','france-electroverse-r8','italy-pun','italy-verified-offers','italy-ionity-r8','france-ionity-r8','italy-atlante-r8','switzerland-national','switzerland-verified-offers','switzerland-avia-r8']);
const subRegistry={...registry,sources:(registry.sources||[]).filter(s=>wanted.has(s.id))};

extension.install({
  baseLoaders:browserLoaders,
  adapters:{germanyNational:de,ukOpenFeeds:uk,moroccoPublic:ma,nationalCompact,directOffers,legacyDirectStations,legacyDirectTariffs,switzerlandAvia,italyIonityExact,franceIonityExact,atlanteItalyExact}
});

const loaders=browserLoaders.createRegistryLoaders({
  registry:subRegistry,
  basePath:pathToFileURL(runtime+path.sep).href,
  adapters:{germanyNational:de,ukOpenFeeds:uk,moroccoPublic:ma,nationalCompact,directOffers,legacyDirectStations,legacyDirectTariffs},
  fetchImpl:fileFetch(runtime)
});

assert.equal(typeof loaders['germany-production-snapshot'],'function');
assert.equal(typeof loaders['uk-production-open-feeds'],'function');
assert.equal(typeof loaders['morocco-evgo-native'],'function');
assert.equal(typeof loaders['morocco-kilowatt-public'],'function');
assert.equal(typeof loaders['france-national'],'function');
assert.equal(typeof loaders['e55c-direct-france'],'function');
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
assert.equal(supplement.sites.length,3,'Pinned German IONITY supplementary sites must be 3');
assert.equal(supplement.metadata.quarantinedNearThirdParty,8,'Ambiguous German IONITY sites must remain quarantined');
const supplementRows=await loaders['germany-ionity-isolated-r8']({});
assert.equal(supplementRows.length,3,'German isolated supplement loader did not retain all 3');
assert.ok(supplementRows.every(s=>s.offers.length===0),'Supplemental IONITY stations must not receive guessed tariffs');
const knownSupplementIds=new Set(supplementRows.map(s=>s.canonicalId));
assert.equal(knownSupplementIds.size,3,'Supplemental IONITY canonical identities collide');

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
assert.ok(nlResult.diagnostics.sources['netherlands-dotnl']?.loaded===true,'NL runtime source not loaded');

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

const joinSession={startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60};
const evaluatedProviders=station=>{
  const evaluated=sessionEngine.evaluateStation(station,joinSession);
  return new Set([evaluated.best,...evaluated.alternatives,...evaluated.incomplete].filter(Boolean).map(offer=>offer.provider));
};
assert.ok(frElectroverse.some(st=>evaluatedProviders(st).has('Electroverse')),
  'Electroverse tariffs attached to Paris-area stations must survive session filtering');
if(requireElectra)assert.ok(frElectra.some(st=>evaluatedProviders(st).has('Electra')),
  'Electra platform tariffs attached to Paris-area stations must survive session filtering');

if(requireElectra){
const e55cSource=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/e55c_station_tariffs_v1.json.gz'))).toString('utf8'));
const e55cOffers=legacyDirectTariffs.e55cRules(e55cSource,{priority:{tariff:95}});
assert.ok(e55cOffers.length>=700,'Electric 55 Scan Pay coverage unexpectedly shrank');
for(const offer of e55cOffers){
  const rule=offer.pricing.rules.find(r=>r.scope==='timeWindow'&&r.start==='07:00')||offer.pricing.rules.find(r=>r.scope==='allDay');
  assert.ok(rule,'Electric 55 tariff lacks a daytime or all-day rule');
  for(const postChargeMinutes of [0,10]){
    const actual=sessionEngine.evaluateCompactMinuteOffer(offer,{startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60,postChargeMinutes});
    const expected=Math.round((10*Number(rule.pricePerKwh||0)+(60-postChargeMinutes)*Number(rule.chargePerMinute||0)+postChargeMinutes*Number(rule.idlePerMinute||0)+Number(rule.connectionFee||0))*1e6)/1e6;
    assert.equal(actual?.complete,true,`Electric 55 tariff cannot be evaluated: ${offer.id}`);
    assert.equal(actual.totalEur,expected,`Electric 55 tariff components dropped: ${offer.id}, post-charge ${postChargeMinutes} min`);
  }
}
const electraOverlayRoot=path.join(root,'snapshot-inputs/FR/platforms/electra');
const electraManifest=JSON.parse(fs.readFileSync(path.join(electraOverlayRoot,'manifest.json'),'utf8'));
let electraOffers=0,timedOffers=0,zeroOffers=0,mixedOffers=0;
const targetedElectra=new Map(),targetIds=new Set(['electra-platform:78ea662d-91e1-46f0-a46f-e2e5fd2d9d8f','electra-platform:6b4376f0-7dd1-4b65-a126-8d1074c63513','electra-platform:5d1840e1-0270-41ab-a0aa-f384fb7e7499']);
const checkedPricing=new Set();
for(const tile of electraManifest.tiles||[]){
  const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(electraOverlayRoot,tile.file))).toString('utf8'));
  for(const offer of payload.emspOffers||[]){
    electraOffers++;
    if(targetIds.has(offer.id))targetedElectra.set(offer.id,offer);
    const rules=offer.pricing?.rules||[];
    const timed=rules.some(rule=>['chargePerMinute','idlePerMinute','connectionFee','afterMinutesRate'].some(key=>Number(rule[key]||0)>0));
    const energy=rules.some(rule=>Number(rule.pricePerKwh||0)>0);
    if(timed)timedOffers++;
    if(timed&&energy)mixedOffers++;
    if(!timed&&!energy)zeroOffers++;
    if(!timed)continue;
    const signature=JSON.stringify(offer.pricing);
    if(checkedPricing.has(signature))continue;
    checkedPricing.add(signature);
    for(const postChargeMinutes of [0,10]){
      const session={startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60,postChargeMinutes};
      const actual=sessionEngine.evaluateCompactMinuteOffer(offer,session);
      assert.equal(actual?.complete,true,`Electra timed tariff incomplete: ${offer.id} / ${actual?.reason}`);
      assert.ok(Number.isFinite(actual.totalEur)&&actual.totalEur>=0,`Electra timed tariff invalid: ${offer.id}`);
      if(rules.length===1&&rules[0].scope==='allDay'){
        const rule=rules[0],charge=60-postChargeMinutes,threshold=Number(rule.afterMinutesThreshold||0);
        const surcharge=Number(rule.afterMinutesRate||0)*Math.max(0,60-threshold);
        const expected=Math.round((10*Number(rule.pricePerKwh||0)+charge*Number(rule.chargePerMinute||0)+postChargeMinutes*Number(rule.idlePerMinute||0)+Number(rule.connectionFee||0)+surcharge)*1e6)/1e6;
        assert.equal(actual.totalEur,expected,`Electra all-day components dropped: ${offer.id}`);
      }
    }
  }
}
assert.equal(electraOffers,electraManifest.stats.publishedOffers,'Electra overlay audit did not cover every offer');
assert.ok(timedOffers>0&&mixedOffers>0,'Electra overlay lost time or mixed tariffs');
console.log(JSON.stringify({electraOffers,timedOffers,mixedOffers,zeroOffers,uniqueTimedPricingChecked:checkedPricing.size}));
assert.equal(targetedElectra.size,3,'Pinned Electra mixed-pricing examples missing');
const timedTotal=(id,durationMinutes,postChargeMinutes=0)=>sessionEngine.evaluateCompactMinuteOffer(targetedElectra.get(id),{startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes,postChargeMinutes}).totalEur;
assert.equal(timedTotal('electra-platform:78ea662d-91e1-46f0-a46f-e2e5fd2d9d8f',660),12.49,'Indigo duration surcharge or connection fee missing');
assert.equal(timedTotal('electra-platform:6b4376f0-7dd1-4b65-a126-8d1074c63513',180),7.60002,'Seymaborne daytime duration surcharge missing');
assert.equal(timedTotal('electra-platform:5d1840e1-0270-41ab-a0aa-f384fb7e7499',60,10),7.3,'Métropolis daytime parking fee missing');
const grimaudResult=await engine.queryArea({countryCode:'FR',origin:{lat:43.279636,lon:6.577631},radiusKm:1,routingBudget:20});
const grimaud=grimaudResult.stations.find(st=>String(st.name).includes('SAINT-PONS'));
assert.ok(grimaud,'Grimaud Saint-Pons station missing');
const grimaudTotals=postChargeMinutes=>{
  const evaluation=sessionEngine.evaluateStation(grimaud,{startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60,postChargeMinutes});
  return [evaluation.best,...evaluation.alternatives,...evaluation.incomplete].find(o=>o?.provider==='E55C Scan Pay direct')?.total;
};
assert.equal(grimaudTotals(0),6.36,'Grimaud direct must include energy and the 0.60 € connection fee');
assert.equal(grimaudTotals(10),7.356,'Grimaud direct must include the 10-minute post-charge fee');
}

if(requireElectra){
const galardResult=await engine.queryArea({countryCode:'FR',origin:{lat:48.808633,lon:2.064812},radiusKm:1,routingBudget:20});
const galard=galardResult.stations.find(st=>String(st.name).includes('GENEVIEVE DE GALARD'));
assert.ok(galard,'Geneviève de Galard station missing');
const galardEval=sessionEngine.evaluateStation(galard,{startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60});
const galardTotals=new Map([galardEval.best,...galardEval.alternatives,...galardEval.incomplete].filter(Boolean).map(o=>[o.provider,o.total]));
assert.equal(galardTotals.get('E55C Scan Pay direct'),5.64,'Galard direct must include 60 minutes and the 0.60 € connection fee');
assert.equal(galardTotals.get('Electra'),5.04,'Galard Electra must include 60 billed minutes');
assert.ok(galardTotals.get('Electroverse')>0,'Galard Electroverse tariff must remain available');

}

const lullyResult=await engine.queryArea({countryCode:'FR',origin:{lat:48.806024,lon:2.068762},radiusKm:1,routingBudget:20});
const lully=lullyResult.stations.find(s=>String(s.name).includes('PLACE LULLY'));
assert.ok(lully,'Electric 55 Place Lully is absent from the FR source');
const lullyDirect=(lully.offers||[]).filter(o=>o.provider==='E55C Scan Pay direct');
assert.equal(lullyDirect.length,2,'Place Lully should retain distinct 7.36 and 22.08 kW Scan Pay profiles');
for(const power of [7.4,22.1])assert.equal(lullyDirect.filter(o=>power>=o.minPowerKw&&power<=o.maxPowerKw).length,1,`Place Lully ${power} kW direct profile is missing or ambiguous`);
assert.ok(lullyResult.diagnostics.sources['e55c-direct-france']?.loaded===true,'Electric 55 direct source did not load');

const boisResult=await engine.queryArea({countryCode:'FR',origin:{lat:48.799557,lon:2.039009},radiusKm:0.5,routingBudget:20});
const boisIds=new Set(['FRELCP12954082']);
const boisPriced=boisResult.stations.filter(st=>(st.offers||[]).some(o=>o.sourceId==='france-electra-direct'));
assert.equal(boisPriced.length,1,'Only the current Bois-d\'Arcy DC national station ID should receive the app energy tariff');
for(const st of boisPriced){
  assert.ok((st.provenance||[]).some(p=>boisIds.has(p.sourceStationId)),'Electra direct offer attached outside Bois-d\'Arcy');
  const direct=st.offers.find(o=>o.sourceId==='france-electra-direct'&&o.kind==='direct');
  assert.deepEqual(direct.connectorKinds,['DC']);
  assert.equal(direct.pricing.priceSelectionBasis,'session_start_local_time');
  assert.ok(direct.pricing.rules.length>=1,'exact Electra schedule must retain energy rules');
  assert.ok(direct.pricing.rules.every(rule=>Number.isFinite(rule.pricePerKwh)),'all Electra energy rules must be numeric');
  assert.equal(direct.metadata.timeZone,'Europe/Paris');
  assert.equal(direct.metadata.conditionalCongestionFeeExcluded,true);
  assert.ok(evaluatedProviders(st).has(direct.provider),'Bois-d’Arcy direct tariff must survive the joined runtime session filter');
  if(currentSnapshot){
    assert.ok(st.evses.every(evse=>evse.connectors.every(connector=>connector.kind==='DC')),'historical Bois-d’Arcy 22 kW AC rows must be hidden');
    assert.equal(st.evses.reduce((sum,evse)=>sum+evse.stalls,0),19,'current Electra connector count must be retained');
    assert.deepEqual(st.offers.filter(offer=>offer.kind==='subscription').map(offer=>offer.subscriptionId).sort(),['electra-plus-essential','electra-plus-smart'],'both Electra+ plans must attach to the current station');
  }
}
assert.ok(boisResult.diagnostics.sources['france-electra-direct']?.loaded===true,'Bois-d\'Arcy exact tariff source did not load');
if(currentSnapshot)assert.ok(boisResult.diagnostics.sources['france-electra-bois-current-inventory']?.loaded===true,'Bois-d\'Arcy current connector source did not load');

const aldiResult=await engine.queryArea({countryCode:'FR',origin:{lat:48.76858,lon:2.06473},radiusKm:0.5,routingBudget:20});
const aldi=aldiResult.stations.find(st=>st.id==='FR:national:FRALNP25007130');
assert.ok(aldi,'ALDI Guyancourt station must be present');
assert.ok(evaluatedProviders(aldi).has('ALDI direct · charge lente'),'official ALDI slow AC tariff must survive the exact station join');

const iziviaDole=await engine.queryArea({countryCode:'FR',origin:{lat:47.0819,lon:5.47522},radiusKm:5,routingBudget:20});
const fastRows=iziviaDole.stations.filter(st=>(st.provenance||[]).some(p=>p.sourceStationId==='FRIZFPFAST422'));
const fastDcInventory=fastRows.some(st=>(st.evses||[]).some(evse=>(evse.connectors||[]).some(connector=>connector.kind==='DC'&&connector.powerKw===150)));
const fastOffers=iziviaDole.stations.filter(st=>(st.offers||[]).some(o=>o.sourceId==='france-izivia-fast-official-france'));
const doleFastOffers=fastRows.filter(st=>(st.offers||[]).some(o=>o.sourceId==='france-izivia-fast-official-france'));
const fastSource=registry.sources.find(source=>source.id==='france-izivia-fast-official-france');
if(fastSource?.active===false){
  assert.equal(fastOffers.length,0,'Historical snapshot must not receive the later Dole tariff');
}else{
  assert.ok(iziviaDole.diagnostics.sources['france-izivia-fast-dole-inventory']?.loaded===true,'IZIVIA FAST Dole connector correction did not load');
  assert.ok(iziviaDole.diagnostics.sources['france-izivia-fast-official-france']?.loaded===true,'IZIVIA FAST national direct source did not load');
  assert.ok(fastDcInventory,"Current Data Lab pin must contain the exact McDonald's Dole FAST DC connectors");
  assert.equal(doleFastOffers.length,1,"The exact McDonald's Dole FAST station must inherit its direct tariff");
  assert.equal(doleFastOffers[0].offers.find(o=>o.sourceId==='france-izivia-fast-official-france').pricing.connectedTimeRounding,'started_minute');
}
if(process.env.REQUIRE_IZIVIA_FAST_DOLE==='1')assert.equal(doleFastOffers.length,1,'Current explicit candidate requires the Dole FAST direct tariff');
if(fastSource?.active!==false){
  const noisy=await engine.queryArea({countryCode:'FR',origin:{lat:48.83456,lon:2.56171},radiusKm:3,routingBudget:20});
  const noisyFast=noisy.stations.find(st=>(st.provenance||[]).some(p=>p.sourceStationId==='FRIZFPFAST1'));
  assert.ok(noisyFast,'Noisy-le-Grand FAST national inventory did not load');
  assert.ok(noisy.diagnostics.sources['france-izivia-fast-official-inventory']?.loaded===true,
    'Official FAST connector correction did not load');
  assert.ok((noisyFast.evses||[]).some(evse=>(evse.connectors||[]).some(c=>c.kind==='DC'&&c.powerKw===200)),
    'Noisy-le-Grand stale AC 200 kW inventory was not corrected to CCS');
  assert.ok((noisyFast.offers||[]).some(o=>o.sourceId==='france-izivia-fast-official-france'),
    'National IZIVIA FAST direct tariff must attach beyond Dole');
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
