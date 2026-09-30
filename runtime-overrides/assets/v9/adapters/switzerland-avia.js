(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.switzerlandAvia=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const uniq=a=>[...new Set((a||[]).map(text).filter(Boolean))];
  const evseVariants=v=>{const raw=text(v),compact=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');return uniq([raw,compact]);};
  const kindFromType=v=>{const s=text(v).toUpperCase();if(s.includes('CCS')||s.includes('CHADEMO')||s.includes('DC'))return'DC';if(s.includes('TYPE2')||s.includes('TYPE 2')||s.includes('AC'))return'AC';return'UNKNOWN';};

  function connectorRule(row,{sourceId='switzerland-avia-r8',priority=135}={}){
    const evseId=text(row?.evseId),price=row?.price||{},rate=num(price?.pricePerKwhInclVat),currency=text(price?.currency).toUpperCase();
    const power=num(row?.powerKw),kind=kindFromType(row?.connectorType);
    if(!evseId||rate==null||rate<0||currency!=='CHF')return null;
    if(price?.tariffHasTimeBasedPrice===true)return null;
    if(!['AC','DC'].includes(kind))return null;
    return{
      id:`avia-ch:${text(row?.connectorInternalId)||evseId}`,
      provider:'AVIA VOLT direct',
      offerKind:'direct',
      subscriptionId:null,
      countries:['CH'],
      currency:'CHF',
      operatorIds:['avia','avia-volt'],
      evseIds:evseVariants(evseId),
      connectorKinds:[kind],
      minPowerKw:power,
      maxPowerKw:power,
      pricing:{type:'rules',rules:[{
        scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'CHF',
        pricePerKwh:rate,chargePerMinute:0,connectionFee:0,idlePerMinute:0,
        afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]
      }]},
      priority,
      metadata:{
        verified:true,
        sourceId,
        sourceGeneratedAt:null,
        identityMode:'exact_evse_with_compact_alias',
        sourceEvseId:evseId,
        locationId:text(row?.locationId),
        locationUuid:text(row?.locationUuid),
        tariffIds:uniq(row?.tariffIds||[]),
        vatPercentage:num(price?.vatPercentage),
        pricePerKwhExclVat:num(price?.pricePerKwhExclVat),
        timeBased:false
      }
    };
  }

  function normalizePayload(payload,source={}){
    const connectors=Array.isArray(payload?.connectors)?payload.connectors:[];
    const rules=[],rejected={};
    for(const row of connectors){
      const rule=connectorRule(row,{sourceId:source.id||'switzerland-avia-r8',priority:Number(source?.priority?.tariff||135)});
      if(rule)rules.push(rule);else{
        const reason=!text(row?.evseId)?'missing_evse_id':row?.price?.tariffHasTimeBasedPrice===true?'time_based':text(row?.price?.currency).toUpperCase()!=='CHF'?'currency':'unsupported_or_unpriced';
        rejected[reason]=(rejected[reason]||0)+1;
      }
    }
    return{
      stations:[],
      offerRules:rules,
      metadata:{
        dataset:'avia-switzerland-r8',
        generatedAt:payload?.generatedAt||null,
        inputConnectors:connectors.length,
        exactOfferRules:rules.length,
        rejected
      }
    };
  }
  return{connectorRule,normalizePayload,evseVariants,kindFromType};
});
