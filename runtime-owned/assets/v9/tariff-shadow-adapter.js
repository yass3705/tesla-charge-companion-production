(function(root,factory){
  const api=factory(root?.TCCV9PricingEngine||(typeof module==='object'&&module.exports?require('./pricing-engine.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9TariffShadowAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(PricingEngine){
  'use strict';
  const PIN='2026-10-15-v9-tesla-mac-ingress-verified';
  const STATION='GB:ocpi:CK0:cd20ba89-4241-4b39-b738-514f49093e8d';
  const CPO='Connected Kerb',COUNTRY='GB',CHANNEL='Connected Kerb';
  // Generated from Phase 7 exact RawOffer/OfferScope assertions, not a site key.
  const tuples=Object.freeze([
    ['GB*CK0*E19825','a46c9e98-5d68-4025-989a-ab416d7ab670'],
    ['GB*CK0*E19865','d19e0ae8-1424-40d8-ae9a-b13fe6704484'],
    ['GB*CK0*E19716','f02dbb6d-7fcb-4dd0-8f51-1a27111ab5b0'],
    ['GB*CK0*E19707','9a1d7557-d59c-4e95-a929-b667d73843f0']
  ].map(([evseId,connectorId])=>Object.freeze({stationId:STATION,evseId,connectorId,
    offerId:'connected-kerb-midhope-verified:'+connectorId,channel:CHANNEL,
    rawKey:'snapshot-inputs/UK/sources/uk_connected_kerb_midhope_verified_v9.json.gz:/sources/0/locations/0/evses/'+
      ({'GB*CK0*E19825':0,'GB*CK0*E19865':1,'GB*CK0*E19716':2,'GB*CK0*E19707':3}[evseId])+'/connectors/0/validatedV9Offer'})));
  const byConnector=new Map(tuples.map(t=>[t.connectorId,t]));
  const SOURCE_SHA='f19c37f917a692a4d6efd0d1f42cfb94707941fbfb990f987bf938ecd4a12796';
  const hash=value=>{let h=2166136261;for(const c of String(value||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');};
  const status=item=>!item?'missing':item.comparable&&item.result?.complete?'priced':
    /ambig/i.test(String(item.result?.reason||''))?'ambiguous':'uncomputable';
  const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?
    Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
  const equivalent=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const validFlag=flag=>flag?.enabled===true&&flag.mode==='shadow'&&flag.pin===PIN&&
    flag.country===COUNTRY&&flag.cpo===CPO&&flag.channel===CHANNEL&&
    flag.stationId===STATION&&Array.isArray(flag.exactTuples)&&flag.exactTuples.length===4&&
    tuples.every(t=>flag.exactTuples.some(x=>x?.evseId===t.evseId&&x?.connectorId===t.connectorId&&x?.offerId===t.offerId));
  function evaluateTuple(station,evse,connector,offers,session){
    const t=byConnector.get(connector?.id);
    if(!t||station?.id!==t.stationId||station?.countryCode!==COUNTRY||station?.physicalOperator?.name!==CPO||
      evse?.id!==t.evseId)return{status:'ineligible',reason:'exact_scope_mismatch'};
    const matching=(offers||[]).filter(o=>o?.id===t.offerId&&o?.provider===CHANNEL&&
      o?.connectorIds?.length===1&&o.connectorIds[0]===t.connectorId&&
      o?.evseIds?.length===1&&o.evseIds[0]===t.evseId);
    if(!matching.length)return{status:'missing',reason:'exact_offer_missing'};
    if(matching.length!==1)return{status:'ambiguous',reason:'duplicate_exact_offer'};
    const offer=matching[0];
    if(offer?.pricing?.type!=='connected_kerb_midhope_guest_verified'||offer?.kind!=='direct'||
      offer?.currency!=='GBP'||offer?.validFrom!=='2026-10-10'||offer?.validThrough||
      offer?.metadata?.sourceEvidence!=='midhope-guest-2026-10-10')
      return{status:'uncomputable',reason:'pinned_offer_semantics_mismatch'};
    if(!PricingEngine?.evaluateOffer)return{status:'uncomputable',reason:'pure_evaluator_unavailable'};
    // Runtime session.durationMinutes is charge time; the pinned pricing primitive
    // adds postChargeMinutes to obtain occupied time. No seasonal validity gate.
    const raw=PricingEngine.evaluateOffer(offer,{...session,powerKw:connector.powerKw,
      chargingKind:connector.kind,stationTimeZone:'Europe/London'});
    if(!raw?.complete)return{status:'uncomputable',reason:raw?.reason||'calculation_incomplete',
      currency:raw?.currency||offer.currency||null};
    return{status:'priced',total:raw.totalEur,currency:raw.currency||'GBP',components:raw.components||{},
      sourceId:offer.sourceId||null};
  }
  function create({flag,emit}={}){
    let enabled=validFlag(flag),stopped=false;
    const events=[],timings=[],metrics={evaluations:0,errors:0,status:0,amount:0,currency:0,components:0,provenance:0};
    function rollback(){enabled=false;stopped=true;events.length=0;}
    function observeStation(station,session,current){
      if(!enabled||stopped||station?.id!==STATION||station?.countryCode!==COUNTRY||
        station?.physicalOperator?.name!==CPO)return current;
      const all=[current?.best,...(current?.alternatives||[]),...(current?.incomplete||[])].filter(Boolean);
      for(const evse of station.evses||[])for(const connector of evse.connectors||[]){
        const t=byConnector.get(connector?.id);if(!t||evse?.id!==t.evseId)continue;
        try{
          const started=typeof performance!=='undefined'?performance.now():Date.now();
          const candidate=evaluateTuple(station,evse,connector,station.offers,session);
          timings.push((typeof performance!=='undefined'?performance.now():Date.now())-started);
          const old=all.find(x=>x.offerId===t.offerId&&x.connectorId===t.connectorId);
          const delta={status:status(old)!==candidate.status,
            amount:old?.result?.totalEur!==candidate.total,
            currency:(old?.currency||null)!==(candidate.currency||null),
            components:!equivalent(old?.result?.components||{},candidate.components||{}),
            provenance:Boolean(old?.sourceId&&candidate.sourceId&&old.sourceId!==candidate.sourceId)};
          metrics.evaluations++;for(const k of Object.keys(delta))if(delta[k])metrics[k]++;
          const event={event:'tariff_shadow',pin:PIN,country:COUNTRY,cpoHash:hash(CPO),channelHash:hash(CHANNEL),
            stationHash:hash(STATION),evseHash:hash(t.evseId),connectorHash:hash(t.connectorId),
            offerHash:hash(t.offerId),currentStatus:status(old),candidateStatus:candidate.status,difference:delta};
          if(events.length===32)events.shift();events.push(event);if(typeof emit==='function')emit(event);
        }catch(error){metrics.errors++;const event={event:'tariff_shadow_error',pin:PIN,country:COUNTRY,
          reasonHash:hash(error?.name||'error')};if(events.length===32)events.shift();events.push(event);
          if(typeof emit==='function')emit(event);}
      }
      return current;
    }
    return{enabled:()=>enabled&&!stopped,observeStation,rollback,metrics:()=>({...metrics}),
      events:()=>events.slice(),timings:()=>timings.slice()};
  }
  return{PIN,STATION,SOURCE_SHA,tuples,validFlag,evaluateTuple,create};
});
