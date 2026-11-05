(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9CanonicalAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  function coordinates(row){
    if(Number.isFinite(row.latitude)&&Number.isFinite(row.longitude))return[row.latitude,row.longitude];
    const raw=row.coordinates?.Google;
    if(typeof raw==='string'){
      const match=raw.match(/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/);
      if(match){const lat=Number(match[1]),lon=Number(match[2]);if(Math.abs(lat)<=90&&Math.abs(lon)<=180)return[lat,lon];}
    }
    return[null,null];
  }
  function address(row){
    if(typeof row.address==='string')return row.address;
    if(row.address&&typeof row.address==='object')return Object.values(row.address).filter(value=>typeof value==='string'&&value.trim()).join(', ');
    return'';
  }
  // The archived FR IONITY connector rate matches the existing all-day kWh rule.
  function provedDirectOffer(data,offer){
    if(!['FR:ionity_direct','DE:ionity_direct','IT:ionity_direct','GB:ionity_direct','FR:atlante_direct','IT:atlante_direct'].includes(data.source?.id))return null;
    if(offer.channel!=='Direct'||offer.calculationStatus!=='not_evaluated')return null;
    const raw=offer.rawOffer;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!offer.scope?.connectorId)return null;
    const connector=data.connectors.find(row=>row.id===offer.scope.connectorId&&row.evseId===offer.scope.evseId);
    if(!connector||typeof connector.powerKw!=='number'||!Number.isFinite(connector.powerKw)||connector.powerKw<=0)return null;
    let price=null,provider=null,country=null,operator=null,currency='EUR';
    if(['FR:ionity_direct','DE:ionity_direct','IT:ionity_direct','GB:ionity_direct'].includes(data.source?.id)){
      const field=data.source.id==='GB:ionity_direct'?'pricePerKwhGbp':'pricePerKwhEur';
      if(Object.keys(raw).length!==1||!Object.prototype.hasOwnProperty.call(raw,field))return null;
      const source=connector.rawSourceFields;
      if(!['AC','DC'].includes(source?.kind)||source[field]!==raw[field]||
         !offer.sourceConnectorId||offer.sourceConnectorId!==connector.sourceConnectorId||
         source.uuid!==connector.sourceConnectorId||
         data.cpos?.find(row=>row.id===data.evses?.find(evse=>evse.id===offer.scope.evseId)?.cpoId)
           ?.sourceOperatorId!=='IONITY_CPO')return null;
      price=raw[field];provider='IONITY Direct';country=data.source.id.slice(0,2);operator='ionity';
      if(country==='GB')currency='GBP';
    }else if(['FR:atlante_direct','IT:atlante_direct'].includes(data.source?.id)){
      const source=connector?.rawSourceFields,components=raw.priceComponents;
      const sameConnector=data.offers.filter(row=>row.scope?.connectorId===offer.scope.connectorId);
      const powerType=String(source?.powerType||'').toUpperCase();
      const connectorType=String(source?.connectorType||'').toUpperCase();
      const knownType=['AC','DC'].includes(powerType)||
        (powerType==='AC_3_PHASE'&&connectorType==='TYPE2')||
        (!powerType&&(connectorType.includes('TYPE 2')||connectorType.includes('TYPE2')||
          connectorType.includes('CCS')||connectorType.includes('CHADEMO')));
      if(!source||!knownType||
         sameConnector.length!==1||!Array.isArray(components)||components.length!==1||
         Object.keys(raw).sort().join(',')!=='connectorId,identifiers,priceComponents'||
         raw.identifiers?.evseId!==source.evseId||raw.identifiers?.connectorId!==source.connectorId||
         source.tariffs?.length!==1||source.tariffs[0]?.connectorId!==raw.connectorId||
         source.tariffs[0]?.priceComponents?.length!==1||
         source.tariffs[0].priceComponents[0]?.price?.incl_vat!==components[0]?.price?.incl_vat)return null;
      const component=components[0],validity=component?.validity||{};
      if(component?.priceDimension!=='ENERGY'||component.currency!=='EUR'||
         Object.keys(component).sort().join(',')!==
           'conditions,currency,price,priceDimension,stepSize,surchargeName,validity'||
         Object.keys(validity).sort().join(',')!=='absolute,relative'||
         Object.keys(validity.absolute||{}).sort().join(',')!=='daysOfWeekValidity,validitySchemes'||
         Object.keys(component.price||{}).sort().join(',')!=='excl_vat,incl_vat'||
         !Array.isArray(component.conditions)||component.conditions.length||component.stepSize!=null||
         component.surchargeName!=null||
         (validity.absolute?.daysOfWeekValidity||[]).length||
         (validity.absolute?.validitySchemes||[]).length||
         Object.values(validity.relative||{}).some(value=>Array.isArray(value)?value.length:value!=null))return null;
      price=component.price?.incl_vat;
      if(typeof source.pricePerKwhEur!=='number'||price!==source.pricePerKwhEur)return null;
      provider='Atlante direct';country=data.source.id.slice(0,2);operator='atlante';
    }else return null;
    if(typeof price!=='number'||!Number.isFinite(price)||price<=0)return null;
    return{id:offer.id,provider,kind:'direct',currency,
      countries:[country],operatorIds:[operator],evseIds:[offer.scope.evseId],
      connectorIds:[offer.scope.connectorId],subscriptionId:null,
      pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',
        currency,pricePerKwh:price,chargePerMinute:0,connectionFee:0,
        idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0}]},
      metadata:{verified:true,identityMode:'exact_canonical_connector',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256}};
  }
  function provedBumpOffer(data,offer,index){
    if(data.source?.id!=='FR:bump_national_exact'||offer.channel!=='Direct'||
       offer.calculationStatus!=='not_evaluated'||offer.scope?.connectorId!=null)return null;
    const evse=index.evses.get(offer.scope?.evseId),cpo=index.cpos.get(evse?.cpoId);
    const raw=offer.rawOffer,source=raw?.compiledOffer,point=raw?.sourcePoint;
    const connectors=index.connectors.get(evse?.id)||[];
    if(!evse||cpo?.sourceOperatorId!=='BUMP'||
       evse.officialEvseId!==offer.officialEvseId||offer.officialEvseId!==point?.idPdcItinerance||
       point?.rankable!==true||!source||source.id!==offer.sourceOfferId||
       source.verifiedScope!=='exact_evse'||source.currency!=='EUR'||
       !Array.isArray(source.evseIds)||!source.evseIds.includes(evse.officialEvseId)||
       !Array.isArray(source.metadata?.tariffIds)||
       !source.metadata.tariffIds.includes(point.tariffId)||
       !connectors.length||connectors.some(row=>row.evseId!==evse.id)||
       source.pricing?.type!=='rules'||!Array.isArray(source.pricing.rules)||
       source.pricing.rules.length!==1)return null;
    const pricing=source.pricing,rule=pricing.rules[0];
    const allowedPricing=new Set(['type','rules','minimumTotalEur','conditionalSessionFees','postChargeFee']);
    const allowedRule=new Set(['scope','start','end','currency','pricePerKwh',
      'chargingTimePerMinuteEur','sessionFeeEur','afterMinutesComponent',
      'afterMinutesRate','afterMinutesThreshold']);
    if(Object.keys(pricing).some(k=>!allowedPricing.has(k))||
       Object.keys(rule).some(k=>!allowedRule.has(k))||
       rule.scope!=='allDay'||rule.start!=='00:00'||rule.end!=='24:00'||
       rule.currency!=='EUR'||
       ['pricePerKwh','chargingTimePerMinuteEur','sessionFeeEur','afterMinutesRate','afterMinutesThreshold']
         .some(k=>rule[k]!=null&&(!Number.isFinite(rule[k])||rule[k]<0))||
       (rule.afterMinutesRate!=null&&rule.afterMinutesComponent!=='TIME')||
       (pricing.minimumTotalEur!=null&&(!Number.isFinite(pricing.minimumTotalEur)||pricing.minimumTotalEur<0)))return null;
    if(pricing.postChargeFee!=null&&
       (Object.keys(pricing.postChargeFee).sort().join(',')!=='eurPerMinute,graceMinutes'||
        !Number.isFinite(pricing.postChargeFee.eurPerMinute)||pricing.postChargeFee.eurPerMinute<0||
        !Number.isFinite(pricing.postChargeFee.graceMinutes)||pricing.postChargeFee.graceMinutes<0))return null;
    if(pricing.conditionalSessionFees!=null&&
       (!Array.isArray(pricing.conditionalSessionFees)||pricing.conditionalSessionFees.some(fee=>
         Object.keys(fee).sort().join(',')!=='amountEur,conditions'||
         !Number.isFinite(fee.amountEur)||fee.amountEur<0||
         !Array.isArray(fee.conditions)||!fee.conditions.length||fee.conditions.some(condition=>
           Object.keys(condition).sort().join(',')!=='kind,value'||
           !['energy_above_kwh','session_duration_after_minutes'].includes(condition.kind)||
           !Number.isFinite(condition.value)||condition.value<0))))return null;
    return{id:offer.id,provider:'Bump direct',kind:'direct',currency:'EUR',
      countries:['FR'],operatorIds:['BUMP'],evseIds:[evse.id],
      connectorIds:connectors.map(row=>row.id).sort(),subscriptionId:null,pricing,
      metadata:{verified:true,identityMode:'exact_national_irve_evse',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceOfferId:source.id,
        sourceEvseId:evse.officialEvseId,timeZone:'Europe/Paris'}};
  }
  function provedBelgiumOffer(data,offer,index){
    if(data.source?.id!=='BE:nap_static'||offer.channel!=='Direct'||
       offer.calculationStatus!=='not_evaluated'||offer.scope?.connectorId!=null)return null;
    const evse=index.evses.get(offer.scope?.evseId);
    const scopedCount=index.offerCounts.get(offer.scope?.evseId)||0;
    const raw=offer.rawOffer,cpo=index.cpos.get(evse?.cpoId);
    const allowed=['currency','lastUpdated','priceType','rateId','ratePolicy','taxIncluded','taxRate','value'];
    if(!evse||!cpo||scopedCount!==1||evse.unclassifiedPrices?.length||
       !raw||Object.keys(raw).some(name=>!allowed.includes(name))||
       raw.priceType!=='pricePerKWh'||raw.ratePolicy!=='adHoc'||raw.currency!=='EUR'||
       raw.taxIncluded!==false||raw.taxRate!==21||typeof raw.rateId!=='string'||!raw.rateId||
       typeof raw.value!=='number'||!Number.isFinite(raw.value)||raw.value<0||raw.value>3||
       (evse.archiveVariants||[]).some(row=>row.prices?.length!==1||
         JSON.stringify(row.prices[0])!==JSON.stringify(raw)))return null;
    const supported=new Set(['iec62196T2','iec62196T2COMBO','domesticE']);
    const connectors=(index.connectors.get(evse.id)||[]).filter(row=>
      supported.has(row.plugType)&&typeof row.powerKw==='number'&&row.powerKw>0);
    if(!connectors.length)return null;
    const rate=Math.round(raw.value*1.21*1e8)/1e8;
    return{id:offer.id,provider:cpo.name||cpo.sourceOperatorId,kind:'direct',currency:'EUR',
      countries:['BE'],operatorIds:[cpo.sourceOperatorId],evseIds:[evse.id],
      connectorIds:connectors.map(row=>row.id),subscriptionId:null,
      pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',
        currency:'EUR',pricePerKwh:rate,chargePerMinute:0,connectionFee:0,
        idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0}]},
      metadata:{verified:true,identityMode:'exact_canonical_evse_supported_connectors',
        sourceId:data.source.id,artifactSha256:data.source.artifactSha256,rateId:raw.rateId,
        vatRate:21,timeZone:'Europe/Brussels'}};
  }
  function provedNetherlandsOffer(data,offer,index){
    if(data.source?.id!=='NL:dotnl_static'||offer.channel!=='Direct'||
       offer.calculationStatus!=='not_evaluated'||!offer.scope?.connectorId||
       index.connectorOfferCounts.get(offer.scope.connectorId)!==1)return null;
    const connector=index.connectorsById.get(offer.scope.connectorId),evse=index.evses.get(offer.scope.evseId);
    const raw=data.tariffCatalog?.[offer.sourceTariffKey];
    if(!connector||connector.evseId!==evse?.id||!(connector.powerKw>0)||
       !['AC','DC'].includes(connector.kind)||!raw||
       Object.keys(offer.rawOffer||{}).join(',')!=='tariffKey'||
       offer.rawOffer.tariffKey!==offer.sourceTariffKey||raw.tariffKey!==offer.sourceTariffKey||
       ![null,'REGULAR','AD_HOC_PAYMENT'].includes(raw.type)||raw.currency!=='EUR'||
       raw.startDateTime!=null||raw.endDateTime!=null||raw.minPrice!=null||raw.maxPrice!=null||
       !Array.isArray(raw.elements)||raw.elements.length!==1)return null;
    const element=raw.elements[0],restriction=element?.restrictions;
    const active=restriction?Object.entries(restriction).filter(([,value])=>
      Array.isArray(value)?value.length:value!=null&&value!==''):[];
    const days={SUNDAY:0,MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5,SATURDAY:6};
    if(active.some(([name])=>!['start_date','end_date','start_time','end_time','day_of_week',
      'min_duration','max_duration','min_power','max_power'].includes(name)))return null;
    const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
      !Number.isNaN(Date.parse(value+'T00:00:00Z'))&&
      new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
    const clock=(value,end)=>typeof value==='string'&&/^\d{2}:\d{2}$/.test(value)&&
      (value==='24:00'?end:Number(value.slice(0,2))<24&&Number(value.slice(3))<60);
    const activeMap=Object.fromEntries(active);
    if((activeMap.start_date!=null&&!date(activeMap.start_date))||
       (activeMap.end_date!=null&&!date(activeMap.end_date))||
       (activeMap.start_date!=null&&activeMap.end_date!=null&&activeMap.start_date>activeMap.end_date)||
       (activeMap.start_time!=null&&!clock(activeMap.start_time,false))||
       (activeMap.end_time!=null&&!clock(activeMap.end_time,true))||
       ['min_duration','max_duration','min_power','max_power'].some(name=>
         activeMap[name]!=null&&(!Number.isFinite(activeMap[name])||activeMap[name]<0))||
       (activeMap.min_duration!=null&&activeMap.max_duration!=null&&
         activeMap.min_duration>activeMap.max_duration)||
       (activeMap.min_power!=null&&activeMap.max_power!=null&&
         activeMap.min_power>activeMap.max_power)||
       (activeMap.day_of_week&&(!Array.isArray(activeMap.day_of_week)||
         !activeMap.day_of_week.length||activeMap.day_of_week.some(day=>
           !Number.isInteger(typeof day==='number'?day:days[String(day).toUpperCase()])||
           (typeof day==='number'&&(day<0||day>7))))))return null;
    const components=element?.priceComponents;
    if(!Array.isArray(components)||!components.length)return null;
    let energy=null,step=null,time=null,timeStep=null,flat=null,parking=null,parkingStep=null;
    for(const component of components){
      const type=component?.type,amount=component?.priceInclVat,billingStep=component?.stepSize;
      if(!['ENERGY','TIME','FLAT','PARKING_TIME'].includes(type)||
         typeof amount!=='number'||!Number.isFinite(amount)||amount<0||
         (billingStep!=null&&(!Number.isInteger(billingStep)||billingStep<0)))return null;
      if(type==='ENERGY'){
        if(energy!=null||!(billingStep>=1))return null;
        energy=amount;step=billingStep;
      }else if(type==='TIME'){
        if(time!=null||(amount>0&&!(billingStep>=1)))return null;
        time=amount;timeStep=billingStep;
      }else if(type==='FLAT'){
        if(flat!=null)return null;
        flat=amount;
      }else if(type==='PARKING_TIME'){
        if(parking!=null||(amount>0&&!(billingStep>=1)))return null;
        parking=amount;parkingStep=billingStep;
      }
    }
    if(energy==null)return null;
    const cpo=index.cpos.get(evse.cpoId);
    if(!cpo)return null;
    const rule={scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',
      pricePerKwh:energy,chargePerMinute:0,connectionFee:0,idlePerMinute:0,
      afterMinutesRate:0,afterMinutesThreshold:0,energyStepWh:step};
    if(time>0){rule.chargePerMinute=time/60;rule.chargingTimeStepSeconds=timeStep;}
    if(flat>0)rule.connectionFee=flat;
    if(parking>0){rule.idlePerMinute=parking/60;rule.parkingTimeStepSeconds=parkingStep;}
    if(activeMap.start_date)rule.validFromDate=activeMap.start_date;
    if(activeMap.end_date)rule.validThroughDate=activeMap.end_date;
    if(activeMap.start_time||activeMap.end_time){
      rule.start=activeMap.start_time||'00:00';rule.end=activeMap.end_time||'24:00';
      rule.scope=rule.start==='00:00'&&rule.end==='24:00'?'allDay':'timeWindow';
    }
    if(activeMap.day_of_week)rule.daysOfWeek=activeMap.day_of_week.map(day=>
      typeof day==='number'?(day===7?0:day):days[String(day).toUpperCase()]);
    for(const [source,target,divisor] of [['min_duration','minDurationMinutes',60],
      ['max_duration','maxDurationMinutes',60],['min_power','minPowerKw',1],
      ['max_power','maxPowerKw',1]]){
      if(activeMap[source]!=null)rule[target]=activeMap[source]/divisor;
    }
    return{id:offer.id,provider:cpo.name||cpo.sourceOperatorId,kind:'direct',currency:'EUR',
      countries:['NL'],operatorIds:[cpo.sourceOperatorId],evseIds:[evse.id],
      connectorIds:[connector.id],subscriptionId:null,pricing:{type:'rules',rules:[rule]},
      metadata:{verified:true,identityMode:'exact_canonical_connector_ocpi',
        sourceId:data.source.id,artifactSha256:data.source.artifactSha256,
        sourceTariffKey:offer.sourceTariffKey,timeZone:'Europe/Amsterdam'}};
  }
  function provedAllegoOffer(data,offer,index){
    if(data.source?.id!=='FR:allego_direct'||offer.channel!=='Direct'||offer.calculationStatus!=='not_evaluated'||offer.scope?.connectorId!=null)return null;
    const e=index.evses.get(offer.scope?.evseId),r=offer.rawOffer,fee=r?.feePolicy;
    if(!e?.officialEvseId||r?.sourceEvseId!==e.officialEvseId||r.rankableDirectInArchive!==true||
       Object.keys(r).sort().join(',')!=='conditionalOffers,directEurPerKwh,feePolicy,rankableDirectInArchive,sourceEvseId'||
       !Array.isArray(r.conditionalOffers)||r.conditionalOffers.length||
       !Number.isFinite(r.directEurPerKwh)||r.directEurPerKwh<0||
       !fee||Object.keys(fee).sort().join(',')!=='notBeforeSessionMinute,onlyAfterChargingStops,ratePerMinuteEur,source,type'||
       fee.type!=='idle_after_charging'||fee.onlyAfterChargingStops!==true||fee.notBeforeSessionMinute!==45||
       fee.source!=='https://www.allego.eu/fr/overstay-fee/'||!Number.isFinite(fee.ratePerMinuteEur)||fee.ratePerMinuteEur<0)return null;
    const evidence=e.rawSourceFields;
    if(evidence?.evseId!==e.officialEvseId||evidence.kind!=='DC'||!Number.isFinite(evidence.powerKw)||evidence.powerKw<=22.5||
       evidence.isOwnNetwork!==true||evidence.rankableDirect!==true||evidence.feeModelExact!==true||evidence.blockingReason!=null||
       evidence.directEurPerKwh!==r.directEurPerKwh||JSON.stringify(evidence.feePolicy)!==JSON.stringify(fee))return null;
    return{id:offer.id,provider:'Allego Direct',kind:'direct',currency:'EUR',countries:['FR'],evseIds:[e.id],connectorKinds:['DC'],
      pricing:{type:'rules',rules:[{scope:'allDay',currency:'EUR',pricePerKwh:r.directEurPerKwh,
        afterMinutesComponent:'PARKING_TIME',afterMinutesThreshold:fee.notBeforeSessionMinute,afterMinutesRate:fee.ratePerMinuteEur}]},
      metadata:{verified:true,identityMode:'archived_allego_exact_evse_idle_policy',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceEvseId:e.officialEvseId,timeZone:'Europe/Paris'}};
  }
  // Frozen parity pairs from the archived official Belib profiles and historical
  // france-belib-offers.json. Compare ALL input fields: the minute-normalised
  // profiles alone cannot recover started 15-minute blocks or future fees.
  const BELIB_PROFILES={"belib-nonresident-boost":{"raw":{"annualFeeEur":7.0,"channel":"Belib direct","customerPlan":"nonresident","customerPlanLabelFr":"Abonne non-resident","parkingFeesIncluded":false,"profileId":"belib-nonresident-boost","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.133333333,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"24:00","energyEurPerKwh":0.0,"idleTimeEurPerMinute":0.133333333,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"boost","subscriptionId":"belib-nonresident","taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"allDay","start":"00:00","end":"24:00","currency":"EUR","connectedTimeBlockMinutes":15,"connectedTimeBlockEur":2.0,"connectedTimeBlockRounding":"started_block"}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-nonresident-boostPlus":{"raw":{"annualFeeEur":7.0,"channel":"Belib direct","customerPlan":"nonresident","customerPlanLabelFr":"Abonne non-resident","parkingFeesIncluded":false,"profileId":"belib-nonresident-boostPlus","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.38,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"24:00","energyEurPerKwh":0.0,"idleTimeEurPerMinute":0.38,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"boostPlus","subscriptionId":"belib-nonresident","taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"allDay","start":"00:00","end":"24:00","currency":"EUR","connectedTimePerMinuteEur":0.38}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-nonresident-flex":{"raw":{"annualFeeEur":7.0,"channel":"Belib direct","customerPlan":"nonresident","customerPlanLabelFr":"Abonne non-resident","parkingFeesIncluded":false,"profileId":"belib-nonresident-flex","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.0,"connectedTimeEurPerMinute":0.024666667,"currency":"EUR","end":"24:00","energyEurPerKwh":0.33,"idleTimeEurPerMinute":0.0,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"flex","subscriptionId":"belib-nonresident","taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"allDay","start":"00:00","end":"24:00","currency":"EUR","pricePerKwh":0.33,"connectedTimeBlockMinutes":15,"connectedTimeBlockEur":0.37,"connectedTimeBlockRounding":"started_block"}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-resident-boost":{"raw":{"annualFeeEur":7.0,"channel":"Belib direct","customerPlan":"resident","customerPlanLabelFr":"Abonne resident Paris","parkingFeesIncluded":false,"profileId":"belib-resident-boost","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.133333333,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"24:00","energyEurPerKwh":0.0,"idleTimeEurPerMinute":0.133333333,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"boost","subscriptionId":"belib-resident","taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"timeWindow","start":"08:00","end":"20:00","currency":"EUR","connectedTimeBlockMinutes":15,"connectedTimeBlockEur":2.0,"connectedTimeBlockRounding":"started_block"},{"scope":"timeWindow","start":"20:00","end":"23:00","currency":"EUR","connectedTimeBlockMinutes":15,"connectedTimeBlockEur":2.0,"connectedTimeBlockRounding":"started_block"},{"scope":"timeWindow","start":"23:00","end":"08:00","currency":"EUR","connectedTimeBlockMinutes":15,"connectedTimeBlockEur":2.0,"connectedTimeBlockRounding":"started_block"}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-resident-boostPlus":{"raw":{"annualFeeEur":7.0,"channel":"Belib direct","customerPlan":"resident","customerPlanLabelFr":"Abonne resident Paris","parkingFeesIncluded":false,"profileId":"belib-resident-boostPlus","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.38,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"24:00","energyEurPerKwh":0.0,"idleTimeEurPerMinute":0.38,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"boostPlus","subscriptionId":"belib-resident","taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"timeWindow","start":"08:00","end":"20:00","currency":"EUR","connectedTimePerMinuteEur":0.38},{"scope":"timeWindow","start":"20:00","end":"23:00","currency":"EUR","connectedTimePerMinuteEur":0.38},{"scope":"timeWindow","start":"23:00","end":"08:00","currency":"EUR","connectedTimePerMinuteEur":0.38}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-resident-flex":{"raw":{"annualFeeEur":7.0,"channel":"Belib direct","customerPlan":"resident","customerPlanLabelFr":"Abonne resident Paris","parkingFeesIncluded":false,"profileId":"belib-resident-flex","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.0,"connectedTimeEurPerMinute":0.024666667,"currency":"EUR","end":"20:00","energyEurPerKwh":0.33,"idleTimeEurPerMinute":0.0,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"timeWindow","start":"08:00"},{"chargeTimeEurPerMinute":0.0,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"23:00","energyEurPerKwh":0.33,"idleTimeEurPerMinute":0.0,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"timeWindow","start":"20:00"},{"chargeTimeEurPerMinute":0.0,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"08:00","energyEurPerKwh":0.25,"idleTimeEurPerMinute":0.0,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"timeWindow","start":"23:00"}],"serviceClass":"flex","subscriptionId":"belib-resident","taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"timeWindow","start":"08:00","end":"20:00","currency":"EUR","pricePerKwh":0.33,"connectedTimeBlockMinutes":15,"connectedTimeBlockEur":0.37,"connectedTimeBlockRounding":"started_block"},{"scope":"timeWindow","start":"20:00","end":"23:00","currency":"EUR","pricePerKwh":0.33,"connectedTimeComponentEur":0.0},{"scope":"timeWindow","start":"23:00","end":"08:00","currency":"EUR","pricePerKwh":0.25,"connectedTimeComponentEur":0.0}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-visitor-boost":{"raw":{"annualFeeEur":0.0,"channel":"Belib direct","customerPlan":"visitor","customerPlanLabelFr":"Visiteur","parkingFeesIncluded":false,"profileId":"belib-visitor-boost","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.153333333,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"24:00","energyEurPerKwh":0.0,"idleTimeEurPerMinute":0.153333333,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"boost","subscriptionId":null,"taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"allDay","start":"00:00","end":"24:00","currency":"EUR","connectedTimeBlockMinutes":15,"connectedTimeBlockEur":2.3,"connectedTimeBlockRounding":"started_block"}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-visitor-boostPlus":{"raw":{"annualFeeEur":0.0,"channel":"Belib direct","customerPlan":"visitor","customerPlanLabelFr":"Visiteur","parkingFeesIncluded":false,"profileId":"belib-visitor-boostPlus","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.42,"connectedTimeEurPerMinute":0.0,"currency":"EUR","end":"24:00","energyEurPerKwh":0.0,"idleTimeEurPerMinute":0.42,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"boostPlus","subscriptionId":null,"taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"allDay","start":"00:00","end":"24:00","currency":"EUR","connectedTimePerMinuteEur":0.42}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}},"belib-visitor-flex":{"raw":{"annualFeeEur":0.0,"channel":"Belib direct","customerPlan":"visitor","customerPlanLabelFr":"Visiteur","parkingFeesIncluded":false,"profileId":"belib-visitor-flex","reservationFeesIncluded":false,"rules":[{"chargeTimeEurPerMinute":0.0,"connectedTimeEurPerMinute":0.038,"currency":"EUR","end":"24:00","energyEurPerKwh":0.33,"idleTimeEurPerMinute":0.0,"longConnectionEurPerMinute":0.166666667,"longConnectionThresholdMinutes":840,"scope":"allDay","start":"00:00"}],"serviceClass":"flex","subscriptionId":null,"taxIncluded":true},"pricing":{"type":"rules","rules":[{"scope":"allDay","start":"00:00","end":"24:00","currency":"EUR","pricePerKwh":0.33,"connectedTimeBlockMinutes":15,"connectedTimeBlockEur":0.57,"connectedTimeBlockRounding":"started_block"}],"longConnectionFee":{"thresholdMinutes":840,"eurPerHourAfterThreshold":10.0,"basis":"connection_time"}}}};
  function provedBelibOffer(data,offer,index){
    if(data.source?.id!=='FR:belib_stations'||offer.channel!=='Direct'||offer.calculationStatus!=='not_evaluated')return null;
    const raw=offer.rawOffer,reference=BELIB_PROFILES[offer.sourceProfileId];
    const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    if(!reference||JSON.stringify(stable(raw))!==JSON.stringify(stable(reference.raw)))return null;
    const e=index.evses.get(offer.scope?.evseId),c=(index.connectors.get(e?.id)||[]).find(c=>c.id===offer.scope?.connectorId);
    if(!e?.officialEvseId||!c||c.rawSourceFields?.serviceClass!==raw.serviceClass||!['AC','DC'].includes(c.rawSourceFields?.kind))return null;
    // Historical scope_belib_offers: exact official EVSE and the configuration's
    // current kind; never station/name/location or invented connector identity.
    return{id:offer.id,provider:'Belib direct',kind:'direct',currency:'EUR',countries:['FR'],
      evseIds:[e.id],connectorKinds:[c.rawSourceFields.kind],subscriptionId:raw.subscriptionId,
      pricing:JSON.parse(JSON.stringify(reference.pricing)),metadata:{verified:true,
        identityMode:'archived_belib_exact_evse_service_class',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceProfileId:offer.sourceProfileId,
        historicalPricingSha256:'92d4904ecd8b9517dd4c2e388dfea422accb4c4000992cce4291af4703cf1a7e',timeZone:'Europe/Paris'}};
  }
  // Historical build_switzerland_v9.simple_evse_offer, retaining native CHF.
  // Only complete exact-ID forms are admitted; coordinate-only overlays and
  // monetary fields omitted by the old compiler remain outside calculation.
  function provedSwissOffer(data,offer,index){
    if(data.source?.id!=='CH:swiss_integration'||offer.channel!=='Direct'||
       offer.calculationStatus!=='not_evaluated'||offer.scope?.connectorId!=null)return null;
    const e=index.evses.get(offer.scope?.evseId),raw=offer.rawOffer;
    if(!e?.officialEvseId||offer.sourceEvseId!==e.officialEvseId||raw?.evseId!==e.officialEvseId)return null;
    const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
    const exactKeys=(v,keys)=>v&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
    let rate,power,provider;
    if(offer.sourceFile==='data/switzerland/migrol-official-direct-tariffs.json'){
      if(!exactKeys(raw,['chargingStationId','currency','evseId','maxPowerKw','pricePerKwh','pricePerMinute','source','startFee'])||
         raw.currency!=='CHF'||raw.source!=='Migrol official M-Charge national public tariff schedule'||
         !e.officialEvseId.startsWith('CH*MIG*E*')||raw.startFee!==0||raw.pricePerMinute!==0)return null;
      rate=raw.pricePerKwh;power=raw.maxPowerKw;provider='Migrol Direct';
    }else if(offer.sourceFile==='data/switzerland/ecarup-owner-direct-tariffs.json'){
      const ec=raw.ecarup,price=ec?.price;
      if(!exactKeys(raw,['classification','ecarup','evseId','nationalRecord'])||
         raw.classification!=='priced_public_direct'||ec?.accessType!==0||
         Object.keys(ec).some(k=>!['accessType','address','connectorId','connectorName','hubjectId','latitude','longitude','maxPowerW','operatorName','price','state','stationId','stationName'].includes(k))||
         ec.hubjectId!==e.officialEvseId||raw.nationalRecord?.EvseID!==e.officialEvseId||
         !exactKeys(price,['Currency','EnergyPrice','ParkingPrice','PenaltyGracePeriodMinutes','PenaltyMaxFee','PenaltyPricePerMinute','SpecialUserEnergyPrice','SpecialUserParkingPrice'])||
         String(price.Currency).toUpperCase()!=='CHF'||price.ParkingPrice!==0||
         ['PenaltyGracePeriodMinutes','PenaltyMaxFee','PenaltyPricePerMinute','SpecialUserEnergyPrice','SpecialUserParkingPrice'].some(k=>price[k]!=null&&price[k]!==0))return null;
      rate=price.EnergyPrice;power=ec.maxPowerW/1000;provider='eCarUp Direct';
    }else return null;
    const connectors=index.connectors.get(e.id)||[];
    if(!finite(rate)||!finite(power)||power<=0||!connectors.length||connectors.some(c=>c.powerKw!==power))return null;
    return{id:offer.id,provider,kind:'direct',currency:'CHF',countries:['CH'],evseIds:[e.id],connectorIds:connectors.map(c=>c.id),
      pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',currency:'CHF',billing:'kwh',pricePerKwh:rate}]},
      metadata:{verified:true,identityMode:'archived_exact_swiss_evse_complete_energy',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceFile:offer.sourceFile,sourceEvseId:offer.sourceEvseId,timeZone:'Europe/Zurich'}};
  }
  function provedArchivedEmspOffer(data,offer,index){
    const expected={'FR:emsp_exact':['Electroverse','exact_unique_national_irve_pdc'],
      'FR:electra_emsp_exact':['Electra','exact_national_irve_evse']}[data.source?.id];
    const parent=offer.proof==='archived_exact_parent_connector_variant';
    if(!expected||!['archived_unique_normalized_official_evse','archived_exact_parent_connector_variant'].includes(offer.proof)||
       data.source.identityContract!=='historical_normalized_official_evse_unique'||
       !/^[a-f0-9]{64}$/.test(data.source.archiveManifestSha256||'')||
       !/^[a-f0-9]{64}$/.test(data.source.nationalSha256||'')||offer.calculationHold||
       offer.calculationStatus!=='not_evaluated'||(!parent&&offer.scope?.connectorId!=null))return null;
    const raw=offer.rawOffer,evse=index.evses.get(offer.scope.evseId),metadata=raw?.metadata;
    const identity=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!evse?.officialEvseId||offer.officialEvseId!==evse.officialEvseId||
       offer.channel!==expected[0]||raw?.provider!==expected[0]||raw.id!==offer.sourceOfferId||
       metadata?.verified!==true||metadata.identityMode!==(parent?'exact_unique_national_irve_pdc_parent_connector_suffix':expected[1])||
       (expected[0]==='Electroverse'?raw.verifiedScope:metadata.verifiedScope)!==(parent?'exact_evse_connector_power':'exact_evse')||
       raw.evseIds?.length!==1||raw.evseIds[0]!==offer.sourceEvseId||
       !identity(offer.sourceEvseId)||identity(offer.sourceEvseId)!==identity(evse.officialEvseId)||
       raw.currency!=='EUR'||raw.pricing?.type!=='rules'||!Array.isArray(raw.pricing.rules)||!raw.pricing.rules.length||
       raw.pricing.rules.some(rule=>!rule||rule.currency!=='EUR'))return null;
    let connectors=index.connectors.get(evse.id)||[];
    if(parent){
      const kinds={IEC_62196_T2:'Type 2',IEC_62196_T2_COMBO:'CCS',DOMESTIC_F:'EF'},m=metadata;
      const prefix=identity(evse.officialEvseId),refs=m.physicalReferences;
      if(expected[0]!=='Electroverse'||m.offerGranularity!=='connector_power'||
         !Array.isArray(refs)||!refs.length||refs.some(r=>!identity(r).startsWith(prefix)||!/^\d{1,2}$/.test(identity(r).slice(prefix.length)))||
         !Number.isFinite(m.powerKw)||m.powerKw<=0||!Array.isArray(m.standards)||!m.standards.length||m.standards.some(v=>!kinds[v])||
         !Array.isArray(m.tariffHashes)||!m.tariffHashes.length||m.tariffHashes.some(v=>!/^[a-f0-9]{64}$/.test(v))||
         !Array.isArray(m.connectorPks)||!m.connectorPks.length||m.connectorCount!==m.connectorPks.length)return null;
      const kind=c=>/^IRVE\s*·\s*(Type 2|CCS|EF)(?:\s|$)/.exec(c.plugType||'')?.[1];
      connectors=connectors.filter(c=>c.id===offer.scope.connectorId&&c.powerKw===m.powerKw&&m.standards.some(v=>kinds[v]===kind(c)));
      if(connectors.length!==1)return null;
    }
    if(!connectors.length)return null;
    // Preserve every archived component. The session engine must reject any
    // unsupported/missing component, never price a reduced subset of this offer.
    return{id:offer.id,provider:expected[0],kind:'roaming',currency:raw.currency,
      countries:['FR'],evseIds:[evse.id],connectorIds:connectors.map(c=>c.id),
      pricing:JSON.parse(JSON.stringify(raw.pricing)),metadata:{verified:true,
        identityMode:'archived_unique_normalized_official_evse',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceOfferId:offer.sourceOfferId,
        sourceEvseId:offer.sourceEvseId,nationalEvseId:evse.officialEvseId,timeZone:'Europe/Paris'}};
  }
  function provedElectraOffer(data,offer,index){
    if(data.source?.id!=='FR:electra_emsp_exact'||offer.channel!=='Electra'||
       offer.calculationStatus!=='not_evaluated'||offer.scope?.connectorId!=null)return null;
    const evse=index.evses.get(offer.scope?.evseId),raw=offer.rawOffer,m=raw?.mapping,t=raw?.tariff,e=raw?.evidence;
    const identity=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!evse?.officialEvseId||offer.officialEvseId!==evse.officialEvseId||
       offer.proof!=='archived_screenshot_and_unique_historical_normalized_evse'||
       m?.evseId!==offer.sourceEvseId||identity(m.evseId)!==identity(evse.officialEvseId)||
       !/^[a-f0-9]{64}$/.test(e?.screenshotSha256||'')||!e.verifiedForPublishedSource||
       e.requiresSourceTariffUnchanged!==true||!e.locationId||
       m.chargeTariffId!==offer.sourceOfferId||t?.chargeTariffId!==offer.sourceOfferId||
       JSON.stringify(m.components)!=='["ENERGY"]'||t.currency!=='EUR'||
       Object.keys(t).sort().join(',')!=='chargeTariffId,currency,currentPricePerKwh,elements'||
       !Number.isFinite(m.rateEurPerKwh)||m.rateEurPerKwh<0||t.currentPricePerKwh!==m.rateEurPerKwh||
       t.elements?.length!==1)return null;
    const element=t.elements[0],components=element.priceComponents;
    const restrictions=new Set(['dayOfWeek','startTime','endTime','minDuration','maxDuration','startDate','endDate','minKwh','maxKwh','minPower','maxPower']);
    if(Object.keys(element).sort().join(',')!=='priceComponents,restrictions'||
       !element.restrictions||Object.entries(element.restrictions).some(([k,v])=>
         !restrictions.has(k)||(Array.isArray(v)?v.length>0:v!=null))||
       components?.length!==1||Object.keys(components[0]).sort().join(',')!=='price,type'||
       components[0].type!=='ENERGY'||components[0].price!==m.rateEurPerKwh)return null;
    const connectors=index.connectors.get(evse.id)||[];
    if(!connectors.length||!Number.isFinite(m.powerKw)||m.powerKw<=0||
       connectors.some(c=>c.powerKw!==m.powerKw))return null;
    return {id:offer.id,provider:'Electra',kind:'roaming',currency:'EUR',countries:['FR'],
      evseIds:[evse.id],connectorIds:connectors.map(c=>c.id),subscriptionId:null,
      pricing:{type:'kwh',pricePerKwh:m.rateEurPerKwh},
      metadata:{verified:true,identityMode:'archived_electra_screenshot_exact_evse',
        sourceId:data.source.id,artifactSha256:data.source.artifactSha256,
        screenshotSha256:e.screenshotSha256,sourceOfferId:offer.sourceOfferId,
        sourceEvseId:offer.sourceEvseId,nationalEvseId:evse.officialEvseId,timeZone:'Europe/Paris'}};
  }
  function provedElectroverseOffer(data,offer,index){
    if(data.source?.id!=='FR:emsp_exact'||offer.channel!=='Electroverse'||
       offer.calculationStatus!=='not_evaluated'||offer.scope?.connectorId!=null)return null;
    const evse=index.evses.get(offer.scope?.evseId),raw=offer.rawOffer;
    if(!evse||!evse.officialEvseId||offer.officialEvseId!==evse.officialEvseId||
       raw?.id!==offer.sourceOfferId||raw.provider!=='Electroverse'||
       raw.verifiedScope!=='exact_evse'||raw.metadata?.verified!==true||
       raw.metadata?.identityMode!=='exact_unique_national_irve_pdc'||
       !Array.isArray(raw.evseIds)||raw.evseIds.length!==1||
       raw.evseIds[0]!==evse.officialEvseId||raw.currency!=='EUR'||
       raw.pricing?.type!=='rules'||!Array.isArray(raw.pricing.rules)||
       raw.pricing.rules.length!==1)return null;
    const rule=raw.pricing.rules[0];
    if(Object.keys(rule).sort().join(',')!==
         'afterMinutesRate,afterMinutesThreshold,billing,chargePerMinute,connectionFee,currency,days,end,idlePerMinute,ocpiDurationBands,pricePerKwh,scope,start'||
       rule.scope!=='allDay'||rule.start!=='00:00'||rule.end!=='24:00'||
       rule.currency!=='EUR'||rule.billing!=='kwh'||rule.days!=null||
       !Array.isArray(rule.ocpiDurationBands)||rule.ocpiDurationBands.length||
       rule.afterMinutesRate!==0||rule.afterMinutesThreshold!==0||
       !['pricePerKwh','chargePerMinute','connectionFee','idlePerMinute'].every(name=>
         typeof rule[name]==='number'&&Number.isFinite(rule[name])&&rule[name]>=0)||
       rule.pricePerKwh<=0)return null;
    const connectors=(index.connectors.get(evse.id)||[]).filter(row=>
      typeof row.powerKw==='number'&&Number.isFinite(row.powerKw)&&row.powerKw>0);
    if(!connectors.length)return null;
    return{id:offer.id,provider:'Electroverse',kind:'roaming',currency:'EUR',
      countries:['FR'],evseIds:[evse.id],connectorIds:connectors.map(row=>row.id),
      subscriptionId:null,pricing:JSON.parse(JSON.stringify(raw.pricing)),
      metadata:{verified:true,identityMode:'exact_canonical_emsp_evse',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceOfferId:raw.id,timeZone:'Europe/Paris'}};
  }
  function provedArchivedDirectProfile(data,offer,index){
    if(data.source?.id!=='FR:archived_direct_exact'||offer.channel!=='Direct'||offer.calculationHold||
       offer.calculationStatus!=='not_evaluated'||offer.proof!=='identical_archived_direct_compiler_exact_evse')return null;
    const raw=offer.rawOffer,e=index.evses.get(offer.scope?.evseId),proof=data.source.archives?.[offer.family];
    const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!e?.officialEvseId||offer.officialEvseId!==e.officialEvseId||norm(offer.sourceEvseId)!==norm(e.officialEvseId)||
       !proof||!['sourceSha256','compiledSha256','compilerSha256'].every(k=>/^[a-f0-9]{64}$/.test(proof[k]||''))||
       raw?.currency!=='EUR'||raw.directOperatorOnly!==true||raw.verifiedScope!=='exact_evse'||
       raw.id!==offer.sourceOfferId||JSON.stringify(raw.countries)!=='["FR"]'||
       !raw.evseIds?.includes(offer.sourceEvseId)||raw.stationIds||
       Object.keys(raw).some(k=>!['id','selectionId','provider','operatorAliases','countries','currency','priority','pricing','source','directOperatorOnly','verifiedScope','defaultSelected','evseIds','metadata'].includes(k)))return null;
    const r={scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',pricePerKwh:0};
    const expected={type:'rules',rules:[r]},m=raw.metadata||{},finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
    let connectorKinds;
    if(offer.family==='zewatt'){
      const p=m.structuredTtcProfile;
      if(raw.provider!=='Ze-Watt direct'||m.visitorStripeRequired!==true||m.pricingContext!=='anonymous_guest_card'||
         !p||Object.keys(p).sort().join(',')!=='connectedTimeGraceMinutes,connectedTimePerMinuteEurTtc,perKwhEurTtc,perMinuteEurTtc,perSessionEurTtc,postChargeGraceMinutes,postChargePerMinuteEurTtc'||
         !Object.values(p).every(finite))return null;
      r.pricePerKwh=p.perKwhEurTtc;
      if(p.perSessionEurTtc>0)r.sessionFeeEur=p.perSessionEurTtc;
      if(p.perMinuteEurTtc>0)r.chargingTimePerMinuteEur=p.perMinuteEurTtc;
      if(p.connectedTimePerMinuteEurTtc>0){r.connectedTimePerMinuteAfterFreeEur=p.connectedTimePerMinuteEurTtc;r.connectedTimeFreeMinutes=Math.round(p.connectedTimeGraceMinutes);}
      if(p.postChargePerMinuteEurTtc>0)expected.postChargeFee={eurPerMinute:p.postChargePerMinuteEurTtc,graceMinutes:Math.round(p.postChargeGraceMinutes)};
    }else if(offer.family==='zephyre'){
      if(raw.provider!=='Zephyre direct'||m.pricingContext!=='anonymous_direct_payment'||!['AC','DC'].includes(m.currentType)||!m.rawPriceComponents?.length)return null;
      connectorKinds=[m.currentType];const seen=new Set();
      for(const c of m.rawPriceComponents){
        if(Object.keys(c).sort().join(',')!=='freeParkingCostMinutes,price,priceUnit,restrictionEndTime,restrictionStartTime,taxAmount'||
           !finite(c.price)||!finite(c.freeParkingCostMinutes)||c.restrictionStartTime||c.restrictionEndTime||seen.has(c.priceUnit))return null;
        seen.add(c.priceUnit);
        if(c.priceUnit==='CHARGING_KWH')r.pricePerKwh=c.price;
        else if(c.priceUnit==='CHARGING_TIME'){if(c.price>0)r.chargingTimePerMinuteEur=c.price;}
        else if(c.priceUnit==='CHARGING_SESSION'){if(c.price>0)r.sessionFeeEur=c.price;}
        else if(c.priceUnit==='PARKING_TIME'){if(c.price>0)expected.postChargeFee={eurPerMinute:c.price,graceMinutes:c.freeParkingCostMinutes};}
        else return null;
      }
    }else return null;
    const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    if(JSON.stringify(stable(expected))!==JSON.stringify(stable(raw.pricing)))return null;
    const connectors=index.connectors.get(e.id)||[];
    if(!connectors.length||!connectors.some(c=>c.powerKw>0))return null;
    return {id:offer.id,provider:raw.provider,kind:'direct',currency:'EUR',countries:['FR'],evseIds:[e.id],
      connectorIds:connectors.map(c=>c.id),...(connectorKinds?{connectorKinds}:{}),subscriptionId:null,
      pricing:JSON.parse(JSON.stringify(raw.pricing)),metadata:{...m,verified:true,identityMode:'exact_archived_direct_profile_evse',
        sourceId:data.source.id,sourceOfferId:raw.id,artifactSha256:data.source.artifactSha256,
        compiledSha256:proof.compiledSha256,generatedAt:proof.generatedAt,timeZone:'Europe/Paris'}};
  }
  // Already compiled historical UK offers, bound to the exact archived connector.
  // The offline transformer reproduces the historical first-match/VAT compiler;
  // the signed input retains both original OCPI and compiled offer unchanged.
  function provedUbitricityOffer(data,offer,index){
    if(data.source?.id!=='GB:ubitricity_pcpr_direct'||offer.channel!=='Direct'||
       offer.calculationStatus!=='not_evaluated'||offer.calculationHold||
       offer.proof!=='identical_archived_ocpi_and_compiled_uk_connector'||
       !['rawArtifactSha256','compiledArtifactSha256','compilerSha256'].every(k=>/^[a-f0-9]{64}$/.test(data.source[k]||'')))return null;
    const e=index.evses.get(offer.scope?.evseId),c=index.connectorsById.get(offer.scope?.connectorId),
      st=index.stations.get(e?.stationId),raw=offer.archivedCompiledOffer,m=raw?.metadata,p=raw?.pricing;
    if(!e?.officialEvseId||!c||c.evseId!==e.id||!st||st.country!=='GB'||
       !(c.powerKw>0)||index.connectorOfferCounts.get(c.id)!==1||
       Object.keys(raw||{}).sort().join(',')!=='countries,currency,evseIds,id,kind,metadata,pricing,provider,stationIds,subscriptionId'||
       Object.keys(m||{}).sort().join(',')!=='collectedAt,connectorId,idleFeeSource,paygVerification,pricingSource,scope,tariffId,vatIncluded'||
       raw?.provider!=='Ubitricity'||raw.kind!=='direct'||raw.currency!=='GBP'||raw.subscriptionId!==null||
       JSON.stringify(raw.countries)!=='["GB"]'||JSON.stringify(raw.stationIds)!==JSON.stringify([st.sourceStationId])||
       JSON.stringify(raw.evseIds)!==JSON.stringify([e.officialEvseId])||
       m?.connectorId!==c.sourceConnectorId||m.tariffId!==offer.sourceTariffKey||
       m.collectedAt!==data.source.generatedAt||m.vatIncluded!==true||
       m.scope!=='cpo_direct_pcpr_verified'||m.pricingSource!=='PCPR OCPI first-match'||
       JSON.stringify(c.rawSourceFields?.tariff_ids)!==JSON.stringify([m.tariffId])||
       offer.rawOffer?.id!==m.tariffId||offer.rawOffer.currency!=='GBP'||
       p?.type!=='rules'||p.timeZone!=='Europe/London'||!Array.isArray(p.rules)||!p.rules.length||
       Object.keys(p).some(k=>!['type','timeZone','rules','postChargeFee'].includes(k)))return null;
    const keys='billing,chargePerMinute,connectionFee,currency,days,end,idlePerMinute,ocpiDurationBands,pricePerKwh,scope,start';
    if(p.rules.some(r=>Object.keys(r).sort().join(',')!==keys||r.currency!=='GBP'||r.billing!=='kwh'||
      !Number.isFinite(r.pricePerKwh)||r.pricePerKwh<0||r.chargePerMinute!==0||r.connectionFee!==0||
      r.idlePerMinute!==0||JSON.stringify(r.ocpiDurationBands)!=='[]'))return null;
    const idle=c.powerKw>=7&&c.powerKw<=22;
    if(idle?(m.idleFeeSource!=='https://ubitricity.com/en/driver/pricing/'||
      Object.keys(p.postChargeFee||{}).sort().join(',')!=='eurPerMinute,exemptLocalWindows,graceMinutes'||p.postChargeFee.eurPerMinute!==0.05||p.postChargeFee.graceMinutes!==60||p.postChargeFee.exemptLocalWindows?.length!==1||Object.keys(p.postChargeFee.exemptLocalWindows[0]).sort().join(',')!=='end,start'||p.postChargeFee.exemptLocalWindows[0].start!=='20:00'||p.postChargeFee.exemptLocalWindows[0].end!=='08:00'):
      (p.postChargeFee!=null||m.idleFeeSource!=null))return null;
    return {id:offer.id,provider:'Ubitricity',kind:'direct',currency:'GBP',countries:['GB'],
      evseIds:[e.id],connectorIds:[c.id],subscriptionId:null,pricing:JSON.parse(JSON.stringify(p)),
      metadata:{...m,verified:true,identityMode:'exact_archived_uk_compiled_connector',
        sourceId:data.source.id,artifactSha256:data.source.artifactSha256,
        compiledArtifactSha256:data.source.compiledArtifactSha256,timeZone:'Europe/London'}};
  }
  function provedUkPcprOffer(data,offer,index){
    if(!['GB:blink_pcpr_direct','GB:allego_pcpr_direct','GB:source_ev_pcpr_direct'].includes(data.source?.id)||
       offer.channel!=='Direct'||offer.calculationStatus!=='not_evaluated'||
       !offer.scope?.connectorId||index.connectorOfferCounts.get(offer.scope.connectorId)!==1)return null;
    const converter=root?.TCCV9Adapters?.ukOpenFeeds?.pcprDirectPricing;
    if(typeof converter!=='function')return null;
    const connector=index.connectorsById.get(offer.scope.connectorId),evse=index.evses.get(offer.scope.evseId);
    const raw=offer.rawOffer,key=offer.sourceTariffKey;
    if(!connector||connector.evseId!==evse?.id||!(connector.powerKw>0)||
       !['AC','DC'].some(kind=>String(connector.rawSourceFields?.power_type||'').startsWith(kind))||
       !Array.isArray(connector.rawSourceFields?.tariff_ids)||
       connector.rawSourceFields.tariff_ids.length!==1||connector.rawSourceFields.tariff_ids[0]!==key||
       JSON.stringify(connector.rawSourceFields.sourceTariffIds)!==JSON.stringify([key])||
       !raw||raw.id!==key||JSON.stringify(raw)!==JSON.stringify(data.tariffCatalog?.[key])||
       raw.currency!=='GBP'||raw.tccPriceBasis!=='GBP_including_public_UK_VAT'||
       raw.tccSourcePriceBasis!=='OCPI_2.2.1_excluding_VAT'||
       !Array.isArray(raw.elements)||raw.elements.length!==1)return null;
    const element=raw.elements[0],restriction=element?.restrictions||{};
    if(Object.keys(restriction).join(',')!=='start_date'||typeof restriction.start_date!=='string'||
       !/^\d{4}-\d{2}-\d{2}$/.test(restriction.start_date)||
       Number.isNaN(Date.parse(restriction.start_date+'T00:00:00Z'))||
       new Date(restriction.start_date+'T00:00:00Z').toISOString().slice(0,10)!==restriction.start_date||
       !Array.isArray(element.price_components)||!element.price_components.length)return null;
    const kinds=new Set();let paidEnergy=false;
    for(const component of element.price_components){
      const kind=component?.type;
      if(!['ENERGY','TIME','FLAT','PARKING_TIME'].includes(kind)||kinds.has(kind)||
         typeof component.price!=='number'||!Number.isFinite(component.price)||component.price<0||
         !Number.isInteger(component.step_size)||component.step_size<1||
         component.tccVatRateAppliedPct!==20||
         Object.keys(component).sort().join(',')!==
           'price,sourcePriceExVat,step_size,tccVatOrigin,tccVatRateAppliedPct,type,vat')return null;
      kinds.add(kind);if(kind==='ENERGY'&&component.price>0)paidEnergy=true;
    }
    if(!paidEnergy)return null;
    const pricing=converter(raw),cpo=index.cpos.get(evse.cpoId);
    if(!pricing||!cpo||pricing.type!=='component_groups'||pricing.ocpiFirstMatch!==true||
       pricing.timeZone!=='Europe/London'||pricing.taxIncluded!==true)return null;
    return{id:offer.id,provider:cpo.name||cpo.sourceOperatorId,kind:'direct',currency:'GBP',
      countries:['GB'],operatorIds:[cpo.sourceOperatorId],evseIds:[evse.id],
      connectorIds:[connector.id],subscriptionId:null,pricing,
      metadata:{verified:true,identityMode:'exact_canonical_connector_pcpr',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256,sourceTariffKey:key,timeZone:'Europe/London'}};
  }
  function toFragments(data){
    if(data?.schemaVersion!==1||!Array.isArray(data?.stations)||!Array.isArray(data?.evses)||!Array.isArray(data?.connectors)||!Array.isArray(data?.offers))throw new Error('canonical schema invalid');
    const cpos=new Map((data.cpos||[]).map(row=>[row.id,row]));
    const proofIndex={cpos,stations:new Map(data.stations.map(row=>[row.id,row])),evses:new Map(data.evses.map(row=>[row.id,row])),
      connectors:new Map(),offerCounts:new Map(),connectorsById:new Map(),connectorOfferCounts:new Map()};
    if(data.source?.id==='BE:nap_static'){
      for(const row of data.connectors){const list=proofIndex.connectors.get(row.evseId)||[];list.push(row);proofIndex.connectors.set(row.evseId,list);}
      for(const row of data.offers)proofIndex.offerCounts.set(row.scope?.evseId,(proofIndex.offerCounts.get(row.scope?.evseId)||0)+1);
    }
    if(data.source?.id==='NL:dotnl_static'||
       ['GB:ubitricity_pcpr_direct','GB:blink_pcpr_direct','GB:allego_pcpr_direct','GB:source_ev_pcpr_direct'].includes(data.source?.id)){
      for(const row of data.connectors)proofIndex.connectorsById.set(row.id,row);
      for(const row of data.offers)proofIndex.connectorOfferCounts.set(row.scope?.connectorId,
        (proofIndex.connectorOfferCounts.get(row.scope?.connectorId)||0)+1);
    }
    if(['FR:archived_direct_exact','FR:emsp_exact','FR:bump_national_exact','FR:electra_emsp_exact','CH:swiss_integration','FR:belib_stations','FR:allego_direct'].includes(data.source?.id)){
      for(const row of data.connectors){const list=proofIndex.connectors.get(row.evseId)||[];
        list.push(row);proofIndex.connectors.set(row.evseId,list);}
    }
    const stations=new Map(data.stations.map(row=>[row.id,{row,evses:[],offers:[],pricedOffers:[]}]));
    const evses=new Map();
    for(const row of data.evses){
      const station=stations.get(row.stationId);
      if(!station)throw new Error('canonical EVSE station missing');
      const output={id:row.id,officialEvseId:row.officialEvseId||null,sourceEvseId:row.sourceEvseId||null,connectors:[]};
      station.evses.push(output);evses.set(row.id,{output,station});
    }
    for(const row of data.connectors){
      const evse=evses.get(row.evseId);
      if(!evse)throw new Error('canonical connector EVSE missing');
      evse.output.connectors.push({id:row.id,sourceConnectorId:row.sourceConnectorId||null,
        officialConnectorId:row.officialConnectorId||null,kind:row.kind||row.rawSourceFields?.kind||
          (String(row.rawSourceFields?.power_type||row.rawFacility?.powertype||'').startsWith('DC')?'DC':
            String(row.rawSourceFields?.power_type||row.rawFacility?.powertype||'').startsWith('AC')?'AC':null),
        plugType:row.plugType||null,powerKw:row.powerKw??null});
    }
    for(const offer of data.offers){
      const evse=evses.get(offer.scope?.evseId);
      if(!evse)throw new Error('canonical offer EVSE missing');
      const proved=provedArchivedDirectProfile(data,offer,proofIndex)||provedUbitricityOffer(data,offer,proofIndex)||provedAllegoOffer(data,offer,proofIndex)||provedBelibOffer(data,offer,proofIndex)||provedSwissOffer(data,offer,proofIndex)||provedArchivedEmspOffer(data,offer,proofIndex)||provedDirectOffer(data,offer)||provedBelgiumOffer(data,offer,proofIndex)||
        provedNetherlandsOffer(data,offer,proofIndex)||provedElectroverseOffer(data,offer,proofIndex)||
        provedUkPcprOffer(data,offer,proofIndex)||provedBumpOffer(data,offer,proofIndex)||provedElectraOffer(data,offer,proofIndex);
      if(proved)evse.station.pricedOffers.push(proved);
      else evse.station.offers.push({...offer,calculationStatus:'not_evaluated'});
    }
    const ukOcpiArchive=['GB:gridserve_pcpr_direct','GB:ubitricity_pcpr_direct',
      'GB:eco_movement_pcpr_raw'].includes(data.source?.id);
    return [...stations.values()].filter(({row})=>row.publicAccessDecision!=='exclude_non_public'&&
      (!ukOcpiArchive||(row.rawSourceFields?.publish!==false&&row.rawSourceFields?.parking_type!=='PARKING_GARAGE')))
      .map(({row,evses,offers,pricedOffers})=>{
      const cpo=cpos.get(row.cpoId);
      if(!cpo)throw new Error('canonical station CPO missing');
      const [latitude,longitude]=coordinates(row);
      const addressName=data.source?.id==='DE:bnetza_afir_archive'?
        [row.address?.street,row.address?.houseNumber,row.address?.city].filter(Boolean).join(' '):null;
      return{canonicalId:row.id,sourceStationId:row.sourceStationId,countryCode:row.country,
        ...(data.source?.id==='FR:emsp_exact'?{fieldPriority:{identity:0,connectors:0,rawOfferProvenance:110}}:{}),
        ...(data.source?.id==='FR:bump_national_exact'?{fieldPriority:{identity:0,connectors:0,rawOfferProvenance:110}}:{}),
        ...(data.source?.id==='FR:izivia_fast_map'?{fieldPriority:{identity:0,connectors:0}}:{}),
        name:row.name||row.names?.[0]?.value||addressName||row.sourceStationId,
        address:address(row),latitude,longitude,
        networkBrand:row.networkBrand||null,
        physicalOperator:{id:cpo.sourceOperatorId,name:cpo.name||cpo.sourceOperatorId},
        evses:evses.sort((a,b)=>a.id.localeCompare(b.id)),offers:pricedOffers,unparsedOffers:offers,
        provenance:[{sourceId:data.source?.id,artifactSha256:data.source?.artifactSha256,
          generatedAt:data.source?.generatedAt||null}]};
    }).sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId));
  }
  return{toFragments,proveArchivedDirectProfile:provedArchivedDirectProfile,proveUbitricityOffer:provedUbitricityOffer,proveAllegoOffer:provedAllegoOffer,proveBelibOffer:provedBelibOffer,proveBumpOffer:provedBumpOffer,proveElectraOffer:provedElectraOffer,proveArchivedEmspOffer:provedArchivedEmspOffer,proveSwissOffer:provedSwissOffer};
});
