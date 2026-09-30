(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.atlanteItalyExact=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const uniq=a=>[...new Set((a||[]).map(text).filter(Boolean))];
  const evseVariants=v=>{const raw=text(v),compact=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');return uniq([raw,compact]);};
  const kind=v=>{const s=text(v).toUpperCase();if(s==='AC'||s.includes('TYPE2')||s.includes('TYPE 2'))return'AC';if(s==='DC'||s.includes('CCS')||s.includes('CHADEMO'))return'DC';return'UNKNOWN';};

  function simpleEnergyPrice(connector){
    const displayed=num(connector?.pricePerKwhEur);
    if(displayed==null||displayed<=0)return null;
    const tariffs=Array.isArray(connector?.tariffs)?connector.tariffs:[];
    if(!tariffs.length)return null;
    let observed=null;
    for(const tariff of tariffs){
      for(const pc of tariff?.priceComponents||[]){
        if(text(pc?.priceDimension).toUpperCase()!=='ENERGY')return null;
        if(Array.isArray(pc?.conditions)&&pc.conditions.length)return null;
        const incl=num(pc?.price?.incl_vat);
        if(incl==null||incl<=0)return null;
        if(observed==null)observed=incl;
        else if(Math.abs(observed-incl)>1e-9)return null;
      }
    }
    if(observed==null||Math.abs(observed-displayed)>1e-6)return null;
    return displayed;
  }

  function connectorRule(connector,location,{sourceId='italy-atlante-r8',priority=135}={}){
    const evseId=text(connector?.evseId),price=simpleEnergyPrice(connector);
    const k=kind(connector?.powerType||connector?.connectorType);
    if(!evseId||price==null||!['AC','DC'].includes(k))return null;
    if(text(location?.countryCode).toUpperCase()!=='IT')return null;
    if(text(location?.partyId).toUpperCase()!=='ATE')return null;
    if(text(location?.operatorName).toLowerCase()!=='atlante')return null;
    return{
      id:`atlante-it:${text(connector?.connectorId)||evseId}`,
      provider:'Atlante direct',
      offerKind:'direct',
      subscriptionId:null,
      countries:['IT'],
      currency:'EUR',
      evseIds:evseVariants(evseId),
      pricing:{type:'rules',rules:[{
        scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',
        pricePerKwh:price,chargePerMinute:0,connectionFee:0,idlePerMinute:0,
        afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]
      }]},
      priority,
      metadata:{
        verified:true,
        sourceId,
        identityMode:'exact_evse',
        matchPolicy:'exact_evse_only',
        sourceEvseId:evseId,
        sourceConnectorId:text(connector?.connectorId),
        sourceLocationId:text(location?.locationId||location?.id),
        sourceLocationName:text(location?.name),
        connectorKind:k,
        powerKw:num(connector?.powerKw),
        nativeStatus:text(connector?.status),
        statusLastUpdated:text(connector?.statusLastUpdated)||null
      }
    };
  }

  function normalizePayload(payload,source={}){
    const rules=[],rejected={};let connectors=0;
    for(const location of payload?.locations||[]){
      for(const connector of location?.connectors||[]){
        connectors++;
        const rule=connectorRule(connector,location,{sourceId:source.id||'italy-atlante-r8',priority:Number(source?.priority?.tariff||135)});
        if(rule)rules.push(rule);
        else rejected.unsupported_or_complex=(rejected.unsupported_or_complex||0)+1;
      }
    }
    return{
      stations:[],
      offerRules:rules,
      metadata:{
        dataset:'atlante-italy-r8',
        generatedAt:payload?.metadata?.generatedAt||payload?.generatedAt||null,
        locationCount:(payload?.locations||[]).length,
        connectorCount:connectors,
        exactOfferRules:rules.length,
        rejected
      }
    };
  }
  return{simpleEnergyPrice,connectorRule,normalizePayload,evseVariants};
});
