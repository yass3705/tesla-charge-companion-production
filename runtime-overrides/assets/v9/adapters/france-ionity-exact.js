(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.franceIonityExact=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const uniq=a=>[...new Set((a||[]).map(text).filter(Boolean))];
  const evseVariants=v=>{const raw=text(v),compact=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');return uniq([raw,compact]);};
  const kindFromType=v=>{const s=text(v).toUpperCase();if(s.includes('TYPE 2')||s.includes('TYPE2')||s==='AC')return'AC';if(s.includes('CCS')||s.includes('CHADEMO')||s==='DC')return'DC';return'UNKNOWN';};

  function connectorRule(row,station,{sourceId='france-ionity-r8',priority=135}={}){
    const evseId=text(row?.sourceEvseId),price=row?.adhocPrice||{},amount=num(price?.amount),currency=text(price?.currency).toUpperCase(),unit=text(price?.unit).toLowerCase();
    const powerW=num(row?.maxPowerW),powerKw=powerW==null?null:powerW/1000,kind=kindFromType(row?.type);
    if(!evseId||amount==null||amount<=0||currency!=='EUR'||unit!=='kwh'||!['AC','DC'].includes(kind))return null;
    if(row?.blockingFee!=null)return null;
    return{
      id:`ionity-fr:${text(row?.connectorUuid)||evseId}`,
      provider:'IONITY Direct',
      offerKind:'direct',
      subscriptionId:null,
      countries:['FR'],
      currency:'EUR',
      operatorIds:['ionity'],
      evseIds:evseVariants(evseId),
      connectorKinds:[kind],
      minPowerKw:powerKw,
      maxPowerKw:powerKw,
      pricing:{type:'rules',rules:[{
        scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',
        pricePerKwh:amount,chargePerMinute:0,connectionFee:0,idlePerMinute:0,
        afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]
      }]},
      priority,
      metadata:{
        verified:true,
        sourceId,
        identityMode:'exact_irve_evse_from_validated_resolver',
        sourceEvseId:evseId,
        connectorUuid:text(row?.connectorUuid),
        connectorNumber:num(row?.number),
        sourceLocationUuid:text(station?.locationUuid),
        sourceLocationName:text(station?.name),
        nativeStatus:text(row?.status)
      }
    };
  }

  function normalizePayload(payload,source={}){
    const rules=[],rejected={};let connectorRows=0;
    for(const station of payload?.stations||[]){
      for(const row of station?.connectors||[]){
        connectorRows++;
        const rule=connectorRule(row,station,{sourceId:source.id||'france-ionity-r8',priority:Number(source?.priority?.tariff||135)});
        if(rule)rules.push(rule);else rejected.unsupported=(rejected.unsupported||0)+1;
      }
    }
    const expected=Number(payload?.resolvedEvseCount||0);
    if(expected!==connectorRows)throw new Error(`IONITY France resolved count mismatch: ${connectorRows} vs ${expected}`);
    return{
      stations:[],
      offerRules:rules,
      metadata:{
        dataset:'ionity-france-exact-r8',
        generatedAt:payload?.generatedAt||null,
        evseCount:Number(payload?.evseCount||0),
        resolvedEvseCount:expected,
        failureCount:Number(payload?.failureCount||0),
        missingPriceCount:Number(payload?.missingPriceCount||0),
        exactOfferRules:rules.length,
        rejected,
        failClosed:payload?.failClosed===true
      }
    };
  }
  return{connectorRule,normalizePayload,evseVariants,kindFromType};
});
