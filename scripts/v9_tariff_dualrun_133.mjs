#!/usr/bin/env node
// Read-only dual run against an immutable dist. No Production loader is changed.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import {independentOracle} from './v9_tariff_oracle_133.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'');
const runtime=path.join(root,'runtime');
if(!fs.existsSync(path.join(root,'manifest.json')))throw Error('dist manifest required');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
if(manifest.snapshotId!=='2026-10-15-v9-tesla-mac-ingress-verified')throw Error('wrong snapshot pin');
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
const normalize=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const componentKeys=result=>Object.keys(result?.components||{}).sort();
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
  const oracle=independentOracle(offer,{...session,stationTimeZone:station.timeZone||station.metadata?.timeZone||session.stationTimeZone},
    {connectorId:connector.id,powerKw:connector.powerKw});
  const raw=pricing.evaluateOffer(offer,{...session,powerKw:connector.powerKw,chargingKind:connector.kind,
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
    components:componentKeys(raw),source:offer.sourceId||offer.source||null,
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
  }
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
    const scenarioSession={...session,...(spec.session||{}),fxEvidence:session.fxEvidence};
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
    if(!station){rows.push({key:spec.key,country:spec.countryCode,status:'missing_station',areaStations:area.stations.length,
      nearby:area.stations.slice(0,3).map(x=>({id:x.id,name:x.name,operator:x.physicalOperator?.name}))});continue;}
    if(!chosen){
      const evse=station.evses?.find(evse=>evse.connectors?.length)||null;
      rows.push({key:spec.key,country:spec.countryCode,stationId:station.id,stationName:station.name,
        evseId:evse?.id,connectorId:evse?.connectors?.[0]?.id,status:'no_exact_offer',sourceOffers:station.offers?.length||0});continue;
    }
    // One independent sample per exact source offer on the selected physical
    // station. The source offer remains distinct even when its provider matches.
    const selected=(spec.key==='FR-bois-d-arcy'?combinations:combinations.filter(x=>x.station.id===chosen.station.id))
      .filter((x,index,all)=>all.findIndex(y=>y.station.id===x.station.id&&y.offer.id===x.offer.id)===index);
    for(const {station:sample,evse,connector,offer} of selected){
      const legacyResult=legacy.evaluateStation({...sample,evses:[{...evse,connectors:[connector]}],offers:[offer]},scenarioSession);
      const next={offerId:offer.id||offer.offerId,...evaluatePure(sample,evse,connector,offer,scenarioSession)};
      const delta=compare(next,legacyResult);
      rows.push({key:spec.key,country:spec.countryCode,stationId:sample.id,stationName:sample.name,
        evseId:evse.id,connectorId:connector.id,powerKw:connector.powerKw,offerId:next.offerId,
        channel:offer.provider,sourceOffers:sample.offers.length,new:next,legacy:delta,
        classification:delta.classification});
    }
  }catch(error){rows.push({key:spec.key,country:spec.countryCode,status:'load_error',reason:String(error?.message||error)});}
}
const summary={snapshotId:manifest.snapshotId,scenarioCount:rows.length,
  byStatus:Object.fromEntries([...new Set(rows.map(x=>x.new?.status||x.status))].map(s=>[s,rows.filter(x=>(x.new?.status||x.status)===s).length])),
  byClassification: Object.fromEntries([...new Set(rows.map(x=>x.classification||'not_compared'))].map(s=>[s,rows.filter(x=>(x.classification||'not_compared')===s).length]))};
const output={summary,rows};
const file=process.argv[3];if(file)fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(summary));
