#!/usr/bin/env node
// Read-only dual run against an immutable dist. No Production loader is changed.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {independentOracle,independentDotnlCompactOracle,independentKilowattFreeOracle,
  independentComponentGroupsOracle,independentOcpiEnergyOracle} from './v9_tariff_oracle_133.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'');
const runtime=path.join(root,'runtime');
if(!fs.existsSync(path.join(root,'manifest.json')))throw Error('dist manifest required');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
if(manifest.snapshotId!=='2026-10-15-v9-tesla-mac-ingress-verified')throw Error('wrong snapshot pin');
const dotnlPath='snapshot-inputs/NL/runtime/all.json.gz';
const dotnlBytes=fs.readFileSync(path.join(root,dotnlPath));
if(crypto.createHash('sha256').update(dotnlBytes).digest('hex')!==manifest.files.find(x=>x.path===dotnlPath)?.sha256)
  throw Error('pinned DOT-NL compact SHA mismatch');
const dotnlRawByStation=new Map(JSON.parse(zlib.gunzipSync(dotnlBytes)).map((row,index)=>[row[0],{row,index}]));
function pinnedJson(relative){
  const bytes=fs.readFileSync(path.join(root,relative));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.files.find(x=>x.path===relative)?.sha256)
    throw Error('pinned source SHA mismatch: '+relative);
  return JSON.parse(bytes);
}
function pinnedGzipJson(relative){
  const bytes=fs.readFileSync(path.join(root,relative));
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.files.find(x=>x.path===relative)?.sha256)
    throw Error('pinned source SHA mismatch: '+relative);
  return JSON.parse(zlib.gunzipSync(bytes));
}
const kilowattNative=pinnedJson('snapshot-inputs/MA/sources/kilowatt-native-tariffs.json');
const kilowattOverlay=pinnedJson('snapshot-inputs/MA/sources/kilowatt-tariff-overlay.json');
const kilowattRawByStation=new Map(kilowattNative.stations.map((row,index)=>[row.station_id,{row,index}]));
const ukOpen=pinnedGzipJson('snapshot-inputs/UK/all.json.gz');
const ukTariffByExactScope=new Map();
const ukTariffByPointer=new Map();
for(const [si,source] of ukOpen.sources.entries()){
  const tariffs=new Map((source.tariffs||[]).map((tariff,ti)=>[String(tariff.id),ti]));
  for(const [ti,tariff] of (source.tariffs||[]).entries())
    ukTariffByPointer.set(`snapshot-inputs/UK/all.json.gz:/sources/${si}/tariffs/${ti}`,tariff);
  for(const location of source.locations||[])for(const evse of location.evses||[])
    for(const connector of evse.connectors||[])for(const tariffId of connector.tariff_ids||[]){
      const ti=tariffs.get(String(tariffId));if(ti===undefined)continue;
      const key=[location.party_id,String(location.id),evse.evse_id,String(connector.id),String(tariffId)].join('\u001f');
      const matches=ukTariffByExactScope.get(key)||[];
      matches.push(`snapshot-inputs/UK/all.json.gz:/sources/${si}/tariffs/${ti}`);
      ukTariffByExactScope.set(key,matches);
    }
}
const esRawById=new Map();
for(const entry of manifest.files.filter(x=>/^runtime\/data\/v9\/spain-reve-offers\/.*\.json\.gz$/.test(x.path))){
  const payload=pinnedGzipJson(entry.path);
  for(const [index,offer] of (payload.directOffers||[]).entries()){
    const matches=esRawById.get(offer.id)||[];
    matches.push({offer,rawKey:`${entry.path}:directOffers:${index}`});
    esRawById.set(offer.id,matches);
  }
}
const beRawByExactScope=new Map();
for(const entry of manifest.files.filter(x=>/^snapshot-inputs\/BE\/pages\/nap-belgium-\d+\.json\.gz$/.test(x.path))){
  const page=pinnedGzipJson(entry.path),locations=page.locations||page;
  for(const [li,location] of locations.entries())for(const [si,station] of (location.stations||[]).entries())
    for(const [ei,evse] of (station.evses||[]).entries())for(const [pi,price] of (evse.prices||[]).entries()){
      const key=[String(location.id),String(evse.id),String(price.rateId)].join('\u001f');
      const matches=beRawByExactScope.get(key)||[];
      matches.push({rawKey:`${entry.path}:/locations/${li}/stations/${si}/evses/${ei}/prices/${pi}`,
        payload:JSON.stringify(price)});
      beRawByExactScope.set(key,matches);
    }
}
const electraPinned=pinnedGzipJson('snapshot-inputs/FR/platforms/electra/t_97_4.json.gz');
const electraRawById=new Map(electraPinned.emspOffers.map(x=>[x.id,x]));
const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json')));
const asset=name=>require(path.join(runtime,'assets/v9',name));
const dataEngine=asset('data-engine.js'),browserLoaders=asset('browser-loaders.js');
const pricing=asset('pricing-engine.js'),legacy=asset('session-engine.js');
const adapters={
  teslaJson:asset('adapters/tesla-json.js'),
  germanyNational:asset('adapters/germany-national.js'),ukOpenFeeds:asset('adapters/uk-open-feeds.js'),
  ukPcpr:asset('adapters/uk-pcpr.js'),moroccoPublic:asset('adapters/morocco-public.js'),
  nationalCompact:asset('adapters/national-compact.js'),directOffers:asset('adapters/direct-offers.js'),
  legacyDirectStations:asset('adapters/legacy-direct-stations.js'),
  legacyDirectTariffs:asset('adapters/legacy-direct-tariffs.js'),
  switzerlandAvia:asset('adapters/switzerland-avia.js'),italyIonityExact:asset('adapters/italy-ionity-exact.js'),
  franceIonityExact:asset('adapters/france-ionity-exact.js'),atlanteItalyExact:asset('adapters/atlante-italy-exact.js'),
  netherlandsDotnl:asset('adapters/netherlands-dotnl.js'),belgiumNap:asset('adapters/belgium-nap.js')
};
asset('production-loader-extension.js').install({baseLoaders:browserLoaders,adapters});
async function fileFetch(url){
  try{return new Response(fs.readFileSync(url.startsWith('file://')?new URL(url):path.resolve(runtime,url)),{status:200});}
  catch(e){return new Response(String(e),{status:404});}
}
const wanted=new Set([
  'tesla-global','france-national','france-canonical-direct-offers','france-e55c-offers','e55c-direct-france','france-spie-metropolis-direct-exact',
  'france-electra-platform','france-electroverse-r8','germany-production-snapshot','uk-production-open-feeds',
  'uk-connected-kerb-midhope-guest-verified',
  'spain-reve','spain-reve-offers','netherlands-dotnl','netherlands-dotnl-national','netherlands-direct-offers',
  'italy-pun','italy-verified-offers','switzerland-national','switzerland-verified-offers',
  'belgium-nap-national','morocco-evgo-native','morocco-fastvolt-public','morocco-kilowatt-public','morocco-totalenergies-hosts'
]);
// The legacy E55C file is intentionally inactive in Production. The dual run
// loads it explicitly as evidence, without changing the published registry.
const subset={...registry,sources:registry.sources.filter(source=>wanted.has(source.id)&&(source.active!==false||source.id==='e55c-direct-france'))
  .map(source=>source.id==='e55c-direct-france'?{...source,active:true}:source)};
const loaders=browserLoaders.createRegistryLoaders({registry:subset,basePath:pathToFileURL(runtime+path.sep).href,adapters,fetchImpl:fileFetch});
const engine=dataEngine.createEngine({registry:subset,loaders});
const scenarioConfig=JSON.parse(fs.readFileSync(new URL('../config/v9-tariff-dualrun-133-scenarios.json',import.meta.url)));
if(scenarioConfig.snapshotId!==manifest.snapshotId)throw Error('scenario pin differs from dist');
const teslaCatalog=JSON.parse(fs.readFileSync(path.join(runtime,'data/tesla_stations.json')));
const scenarios=scenarioConfig.scenarios.map(spec=>{
  if(spec.source!=='tesla')return spec;
  const row=teslaCatalog.find(item=>item.countryCode===spec.countryTesla&&Number.isFinite(item.latitude)&&Number.isFinite(item.longitude));
  return {...spec,origin:row?{lat:row.latitude,lon:row.longitude}:null};
});
const phase4=process.env.TCC_V9_PHASE4_SAMPLE==='1';
const sampleAudit=[];
const phase6Census=process.env.TCC_V9_PHASE6_CENSUS==='1';
const cohortCensus=new Map();
const normalize=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const componentKeys=result=>Object.keys(result?.components||{}).sort();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function runtimeSession(offer,session){
  if(offer.pricing?.type!=='connected_kerb_midhope_guest_verified')return session;
  if(!Number.isInteger(session.durationMinutes)||!Number.isInteger(session.chargingMinutes)||
     !Number.isInteger(session.postChargeMinutes)||
     session.chargingMinutes+session.postChargeMinutes!==session.durationMinutes)
    throw Error('Midhope occupancy must equal charging plus post-charge minutes');
  return {...session,durationMinutes:session.chargingMinutes};
}
function scoped(offer,evse,connector){
  const ids=new Set([evse.id,evse.evseId,evse.pdcId,...(evse.aliases||[]),...(evse.pdcIds||[])].map(normalize));
  const evseIds=offer.evseIds||[],connectorIds=offer.connectorIds||[];
  if(!evseIds.length&&!connectorIds.length)return{eligible:false,reason:'no_exact_scope'};
  if(evseIds.length&&!evseIds.some(id=>ids.has(normalize(id))))return{eligible:false,reason:'evse_scope_mismatch'};
  if(connectorIds.length&&!connectorIds.some(id=>normalize(id)===normalize(connector.id)))return{eligible:false,reason:'connector_scope_mismatch'};
  return{eligible:true};
}
function evaluatePure(station,evse,connector,offer,session){
  const relation=scoped(offer,evse,connector);
  if(!relation.eligible)return{status:'ineligible',reason:relation.reason};
  if((offer.subscriptionId||offer.kind==='subscription')&&session.selectedSubscriptionId!==offer.subscriptionId)
    return{status:'ineligible',reason:'subscription_not_selected'};
  if(offer.minPowerKw!=null&&finite(connector.powerKw)&&connector.powerKw<offer.minPowerKw)
    return{status:'ineligible',reason:'below_offer_power'};
  if(offer.maxPowerKw!=null&&finite(connector.powerKw)&&connector.powerKw>offer.maxPowerKw)
    return{status:'ineligible',reason:'above_offer_power'};
  if(offer.connectorKinds?.length&&!offer.connectorKinds.includes(connector.kind))
    return{status:'ineligible',reason:'connector_kind_mismatch'};
  const oracleSession={...session,stationTimeZone:station.timeZone||station.metadata?.timeZone||session.stationTimeZone};
  const sourceStation=String(station.id||'').replace(/^NL:national:/,'');
  const dotnlSource=String(offer.id||'').startsWith('netherlands-dotnl-national:')
    ? dotnlRawByStation.get(sourceStation):null;
  const dotnlPointIndex=dotnlSource?.row[8]?.findIndex(p=>p[0]===evse.id)??-1;
  const dotnlPoint=dotnlPointIndex>=0?dotnlSource.row[8][dotnlPointIndex]:null;
  const kilowattStation=String(station.id||'').replace(/^MA:kilowatt:/,'');
  const kilowattSource=String(offer.id||'').startsWith('kilowatt-native:')
    ? kilowattRawByStation.get(kilowattStation):null;
  const kilowattConnectorIndex=kilowattSource?.row.connectors.findIndex(x=>'kilowatt-native:'+x.id===connector.id)??-1;
  const kilowattConnector=kilowattConnectorIndex>=0?kilowattSource.row.connectors[kilowattConnectorIndex]:null;
  const electraRaw=String(offer.id||'').startsWith('electra-platform:')?electraRawById.get(offer.id):null;
  let oracle=dotnlPoint?independentDotnlCompactOracle(dotnlPoint[5],oracleSession):
    kilowattConnector?independentKilowattFreeOracle(kilowattConnector,kilowattStation,
      kilowattOverlay.freeStationIds,oracleSession):
    electraRaw?independentOracle(electraRaw,oracleSession,{connectorId:connector.id,powerKw:connector.powerKw}):
    independentOracle(offer,oracleSession,{connectorId:connector.id,powerKw:connector.powerKw});
  if(kilowattConnector)
    oracle.rawKey=`snapshot-inputs/MA/sources/kilowatt-native-tariffs.json:/stations/${kilowattSource.index}/connectors/${kilowattConnectorIndex}`;
  if(dotnlPoint)
    oracle.rawKey=`${dotnlPath}:/${dotnlSource.index}/8/${dotnlPointIndex}/5`;
  if(String(offer.id||'').startsWith('uk-production-open-feeds:')){
    const prefix='GB:ocpi:',parts=String(station.id||'').startsWith(prefix)?String(station.id).slice(prefix.length).split(':'):[];
    const party=parts.shift(),locationId=parts.join(':');
    const suffix=String(offer.id).slice('uk-production-open-feeds:'.length);
    const keys=[...ukTariffByExactScope.keys()].filter(key=>{
      const [p,l,e,c,t]=key.split('\u001f');
      return p===party&&l===locationId&&e===evse.id&&c===String(connector.id)&&suffix.endsWith(':'+t);
    });
    const matches=keys.flatMap(key=>ukTariffByExactScope.get(key));
    if(matches.length===1){
      const pinnedTariff=ukTariffByPointer.get(matches[0]);
      const sourceOracle=independentOcpiEnergyOracle(pinnedTariff,oracleSession);
      if(sourceOracle.status==='priced')oracle=sourceOracle;
      oracle.rawKey=matches[0];
    }
  }
  if(offer.pricing?.type==='component_groups'&&String(offer.id||'').startsWith('es:reve:')){
    const matches=esRawById.get(offer.id)||[];
    if(matches.length===1&&matches[0].offer.provider===offer.provider){
      oracle=independentComponentGroupsOracle(matches[0].offer,oracleSession);
      oracle.rawKey=matches[0].rawKey;
    }
  }
  if(String(offer.id||'').startsWith('belgium-nap-national:')){
    const locationId=String(station.id||'').replace(/^BE:national:/,'');
    const rateId=String(offer.id).split(':').at(-1);
    const matches=beRawByExactScope.get([locationId,String(evse.id),rateId].join('\u001f'))||[];
    if(matches.length&&matches.every(x=>x.payload===matches[0].payload)){
      oracle.rawKey=matches[0].rawKey;
      if(matches.length>1)oracle.equivalentRawKeys=matches.map(x=>x.rawKey);
    }
  }
  // The verified Midhope runtime contract calls durationMinutes the charging
  // period and adds postChargeMinutes to obtain occupancy. The scenario and
  // independent oracle call durationMinutes the entire occupied period.
  const engineSession=runtimeSession(offer,session);
  const raw=pricing.evaluateOffer(offer,{...engineSession,powerKw:connector.powerKw,chargingKind:connector.kind,
    stationTimeZone:station.timeZone||station.metadata?.timeZone||session.stationTimeZone});
  if(!raw?.complete)return{status:'uncomputable',reason:raw?.reason||'unknown',currency:raw?.currency||offer.currency||null,oracle};
  const amount=Number(raw.totalEur);
  if(!finite(amount))return{status:'uncomputable',reason:'non_numeric_total',oracle};
  const currency=raw.currency||offer.currency||null;
  const sameCurrency=currency&&currency===session.targetCurrency;
  const verified=session.fxEvidence;
  const datedRate=!sameCurrency&&verified?.date&&/^\d{4}-\d{2}-\d{2}$/.test(verified.date)&&
    finite(verified.rates?.[currency])&&verified.rates[currency]>0&&
    finite(verified.rates?.[session.targetCurrency])&&verified.rates[session.targetCurrency]>0;
  return{status:'priced',total:amount,currency,
    targetTotal:sameCurrency?amount:datedRate?Math.round(amount/verified.rates[currency]*verified.rates[session.targetCurrency]*1e6)/1e6:null,
    fxStatus:sameCurrency?'same_currency':datedRate?'verified_dated_rate':'missing_dated_rate',fxAsOf:datedRate?verified.date:null,
    components:componentKeys(raw),componentValues:raw.components||{},source:offer.sourceId||offer.source||null,
    oracle};
}
function compare(candidate,current){
  const old=current?.best?.offerId===candidate.offerId?current.best:
    [...(current?.alternatives||[]),...(current?.incomplete||[])].find(x=>x.offerId===candidate.offerId);
  const oldStatus=!old?'missing':old.comparable&&old.result?.complete?'priced':
    /ambig/i.test(String(old.result?.reason||''))?'ambiguous':'uncomputable';
  const differences=[];
  if(oldStatus!==candidate.status)differences.push('status');
  if(candidate.status==='priced'&&oldStatus==='priced'){
    if(Math.abs(Number(old.result?.totalEur)-candidate.total)>1e-5)differences.push('amount');
    if(String(old.currency||'')!==String(candidate.currency||''))differences.push('currency');
    if(JSON.stringify(componentKeys(old.result))!==JSON.stringify(candidate.components))differences.push('components');
    else if(JSON.stringify(canonical(old.result?.components||{}))!==JSON.stringify(canonical(candidate.componentValues||{})))
      differences.push('component_values');
  }
  if(old?.connectorId&&candidate.connectorId&&normalize(old.connectorId)!==normalize(candidate.connectorId))differences.push('connector_scope');
  if(old?.evseId&&candidate.evseId&&normalize(old.evseId)!==normalize(candidate.evseId))differences.push('evse_scope');
  const oldSource=old?.sourceId||null;
  if(oldSource&&candidate.source&&oldSource!==candidate.source)differences.push('provenance');
  const oracle=candidate.oracle?.status==='priced'?candidate.oracle.total:null;
  const candidateVerified=finite(oracle)&&candidate.status==='priced'&&Math.abs(oracle-candidate.total)<1e-5;
  const legacyVerified=finite(oracle)&&oldStatus==='priced'&&Math.abs(oracle-Number(old?.result?.totalEur))<1e-5;
  // A simple arithmetic oracle proves an amount, not the applicability of a
  // source offer, FX freshness or every status transition.
  const amountOnly=differences.length===1&&differences[0]==='amount'&&oldStatus==='priced'&&candidate.status==='priced'&&
    String(old.currency||'')===String(candidate.currency||'');
  const classification=!differences.length?'match':amountOnly&&candidateVerified&&!legacyVerified?'correction_demonstrated':
    amountOnly&&legacyVerified&&!candidateVerified?'regression':'data_insufficient';
  return{oldStatus,oldTotal:old?.result?.totalEur??null,oldCurrency:old?.currency??null,
    differences,classification};
}
const fxSource=JSON.parse(fs.readFileSync(path.join(root,'snapshot-inputs/FX/source.json')));
const fxBytes=fs.readFileSync(path.join(root,'data/exchange_rates.json'));
if(crypto.createHash('sha256').update(fxBytes).digest('hex')!==fxSource.sourceSha256)
  throw Error('pinned FX SHA mismatch');
const fx=JSON.parse(fxBytes);
if(fx.date!==fxSource.providerDate||fx.base!=='EUR')throw Error('pinned FX date or base mismatch');
const session={...scenarioConfig.session,fxEvidence:{date:fx.date,base:fx.base,rates:fx.rates,
  sourceSha256:fxSource.sourceSha256,providerDate:fxSource.providerDate}};
const rows=[];
for(const spec of scenarios){
  try{
    // The legacy station evaluator accepts FX rates separately from the
    // read-only candidate. Feed it only the SHA-verified, dated pin rates.
    const scenarioSession={...session,...(spec.session||{}),fxEvidence:session.fxEvidence,
      fxRates:session.fxEvidence.rates};
    const area=await engine.queryArea({...spec,routingBudget:20});
    const pattern=spec.namePattern?new RegExp(spec.namePattern,'i'):null;
    const candidates=area.stations.filter(station=>spec.source==='tesla'
      ? (station.provenance||[]).some(item=>/tesla/i.test(String(item?.sourceId||item?.id||item)))||
        /tesla/i.test(String(station.physicalOperator?.name||''))||/tesla/i.test(String(station.id||''))
      : (!spec.stationIds||spec.stationIds.some(id=>String(station.id||'').endsWith(':'+id)))&&
        (!pattern||pattern.test(station.name||'')||pattern.test(station.physicalOperator?.name||''))&&
        (!spec.excludeTesla||!/tesla/i.test(String(station.id||'')+String(station.physicalOperator?.name||''))));
    const combinations=candidates.flatMap(station=>(station.evses||[]).flatMap(evse=>(evse.connectors||[]).flatMap(connector=>(station.offers||[])
      .filter(offer=>scoped(offer,evse,connector).eligible).map(offer=>({station,evse,connector,offer})))));
    const chosen=combinations[0]||null;
    const station=chosen?.station||candidates.find(st=>st.evses?.length&&st.offers?.length)||candidates.find(st=>st.evses?.length)||null;
    if(!station){if(phase4)sampleAudit.push({scenario:spec.key,exactTuplesInArea:0,strata:0,sampled:0});rows.push({key:spec.key,country:spec.countryCode,status:'missing_station',areaStations:area.stations.length,
      nearby:area.stations.slice(0,3).map(x=>({id:x.id,name:x.name,operator:x.physicalOperator?.name}))});continue;}
    if(!chosen){
      if(phase4)sampleAudit.push({scenario:spec.key,exactTuplesInArea:0,strata:0,sampled:0});
      const evse=station.evses?.find(evse=>evse.connectors?.length)||null;
      rows.push({key:spec.key,country:spec.countryCode,stationId:station.id,stationName:station.name,
        evseId:evse?.id,connectorId:evse?.connectors?.[0]?.id,status:'no_exact_offer',sourceOffers:station.offers?.length||0});continue;
    }
    // One independent sample per exact source offer on the selected physical
    // station. The source offer remains distinct even when its provider matches.
    const selected=phase4?(()=>{
      // Stable selection over exact station/PDC/connector/offer tuples. The
      // population is only the loaded stations inside this scenario radius.
      const tuples=[...new Map(combinations.map(x=>[
        [x.station.id,x.evse.id,x.connector.id,x.offer.id].join('\u001f'),x])).values()]
        .sort((a,b)=>{
          const left=[a.station.id,a.evse.id,a.connector.id,a.offer.id].join('\u001f');
          const right=[b.station.id,b.evse.id,b.connector.id,b.offer.id].join('\u001f');
          return left<right?-1:left>right?1:0;
        });
      const strata=new Map();
      for(const x of tuples){
        const family=String(x.offer.pricing?.type||x.offer.kind||'unknown');
        const power=Number(x.connector.powerKw)||0;
        const powerBand=power<25?'AC/low':power<150?'DC/mid':'DC/high';
        const key=[spec.countryCode,x.station.physicalOperator?.name||'unknown',x.offer.provider||'unknown',powerBand,family].join('\u001f');
        const bucket=strata.get(key)||[];bucket.push(x);strata.set(key,bucket);
      }
      const sampled=spec.key.startsWith('FR-bois-d-arcy')?tuples:[...strata.values()].flatMap(bucket=>bucket.slice(0,2));
      if(phase6Census){
        const sampleKeys=new Set(sampled.map(x=>[x.station.id,x.evse.id,x.connector.id,x.offer.id].join('\u001f')));
        for(const x of tuples){
          const key=[manifest.snapshotId,spec.countryCode,x.station.physicalOperator?.name||null,
            x.offer.provider||null,x.offer.pricing?.type||x.offer.kind||'unknown'];
          const serial=JSON.stringify(key);
          const entry=cohortCensus.get(serial)||{key,exactTuplesInAreas:0,sampled:0,scenarios:{}};
          entry.exactTuplesInAreas++;
          if(sampleKeys.has([x.station.id,x.evse.id,x.connector.id,x.offer.id].join('\u001f')))entry.sampled++;
          entry.scenarios[spec.key]=(entry.scenarios[spec.key]||0)+1;
          cohortCensus.set(serial,entry);
        }
      }
      sampleAudit.push({scenario:spec.key,exactTuplesInArea:tuples.length,strata:strata.size,sampled:sampled.length,
        selection:spec.key.startsWith('FR-bois-d-arcy')?'all exact Electra tuples':
          'ASCII first two exact tuples per country/CPO/channel/power band/pricing family'});
      return sampled;
    })(): (spec.key==='FR-bois-d-arcy'?combinations:combinations.filter(x=>x.station.id===chosen.station.id))
      .filter((x,index,all)=>all.findIndex(y=>y.station.id===x.station.id&&y.offer.id===x.offer.id)===index);
    for(const {station:sample,evse,connector,offer} of selected){
      const engineSession=runtimeSession(offer,scenarioSession);
      const legacyResult=legacy.evaluateStation({...sample,evses:[{...evse,connectors:[connector]}],offers:[offer]},engineSession);
      const next={offerId:offer.id||offer.offerId,evseId:evse.id,connectorId:connector.id,
        ...evaluatePure(sample,evse,connector,offer,scenarioSession)};
      const delta=compare(next,legacyResult);
      rows.push({key:spec.key,country:spec.countryCode,stationId:sample.id,stationName:sample.name,
        evseId:evse.id,connectorId:connector.id,powerKw:connector.powerKw,offerId:next.offerId,
        cpo:sample.physicalOperator?.name||null,channel:offer.provider,tariffFamily:offer.pricing?.type||offer.kind||'unknown',
        sourceOffers:sample.offers.length,new:next,legacy:delta,
        classification:delta.classification});
    }
  }catch(error){rows.push({key:spec.key,country:spec.countryCode,status:'load_error',reason:String(error?.message||error)});}
}
const summary={snapshotId:manifest.snapshotId,scenarioCount:rows.length,
  byStatus:Object.fromEntries([...new Set(rows.map(x=>x.new?.status||x.status))].map(s=>[s,rows.filter(x=>(x.new?.status||x.status)===s).length])),
  byClassification: Object.fromEntries([...new Set(rows.map(x=>x.classification||'not_compared'))].map(s=>[s,rows.filter(x=>(x.classification||'not_compared')===s).length]))};
if(phase4){summary.sampling={method:'deterministic exact tuple strata within configured pinned query areas',
  scenarios:sampleAudit,exactTuplesInAreas:sampleAudit.reduce((n,x)=>n+x.exactTuplesInArea,0),
  sampled:sampleAudit.reduce((n,x)=>n+x.sampled,0)};}
if(phase6Census)summary.cohortCensus=[...cohortCensus.values()].sort((a,b)=>JSON.stringify(a.key).localeCompare(JSON.stringify(b.key),'en'));
const output={summary,rows};
const file=process.argv[3];if(file)fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(summary));
