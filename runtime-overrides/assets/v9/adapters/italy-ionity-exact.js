(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.italyIonityExact=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const uniq=a=>[...new Set((a||[]).map(text).filter(Boolean))];
  const evseVariants=v=>{const raw=text(v),compact=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');return uniq([raw,compact]);};
  const kindFromType=v=>{const s=text(v).toUpperCase();if(s.includes('TYPE 2')||s.includes('TYPE2')||s==='AC')return'AC';if(s.includes('CCS')||s.includes('CHADEMO')||s==='DC')return'DC';return'UNKNOWN';};

  function resolvedEvseRule(row,match,{sourceId='italy-ionity-r8',priority=135}={}){
    const evseId=text(row?.evseId),price=num(row?.pricePerKwhEur),power=num(row?.powerKw),kind=kindFromType(row?.type);
    if(!evseId||price==null||price<=0||!['AC','DC'].includes(kind))return null;
    return{
      id:`ionity-it:${text(row?.connectorUuid)||evseId}`,
      provider:'IONITY Direct',
      offerKind:'direct',
      subscriptionId:null,
      countries:['IT'],
      currency:'EUR',
      operatorIds:['ionity'],
      evseIds:evseVariants(evseId),
      connectorKinds:[kind],
      minPowerKw:power,
      maxPowerKw:power,
      pricing:{type:'rules',rules:[{
        scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',
        pricePerKwh:price,chargePerMinute:0,connectionFee:0,idlePerMinute:0,
        afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]
      }]},
      priority,
      metadata:{
        verified:true,
        sourceId,
        identityMode:'exact_pun_evse_from_validated_reconciliation',
        sourceEvseId:evseId,
        connectorNumber:num(row?.number),
        connectorUuid:text(row?.connectorUuid),
        sourceLocationUuid:text(match?.ionityLocationUuid),
        sourceLocationName:text(match?.ionityName),
        reconciliationDistanceMeters:num(match?.distanceMeters)
      }
    };
  }

  function normalizePayload(payload,source={}){
    const rules=[],rejected={};
    let resolvedRows=0;
    for(const match of payload?.matches||[]){
      for(const row of match?.resolvedEvses||[]){
        resolvedRows++;
        const rule=resolvedEvseRule(row,match,{sourceId:source.id||'italy-ionity-r8',priority:Number(source?.priority?.tariff||135)});
        if(rule)rules.push(rule);
        else rejected.unsupported=(rejected.unsupported||0)+1;
      }
    }
    const counts=payload?.counts||{};
    if(Number(counts.resolvedPanEvses||0)!==resolvedRows)throw new Error(`IONITY Italy reconciliation count mismatch: ${resolvedRows} vs ${counts.resolvedPanEvses}`);
    return{
      stations:[],
      offerRules:rules,
      metadata:{
        dataset:'ionity-italy-exact-r8',
        generatedAt:payload?.generatedAt||null,
        resolvedPanEvses:Number(counts.resolvedPanEvses||0),
        unresolvedPanEvses:Number(counts.unresolvedPanEvses||0),
        exactOfferRules:rules.length,
        rejected,
        failClosed:true
      }
    };
  }
  return{resolvedEvseRule,normalizePayload,evseVariants,kindFromType};
});
