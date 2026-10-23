(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9CanonicalAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
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
    if(data.source?.id!=='FR:ionity_direct'&&data.source?.id!=='IT:atlante_direct')return null;
    if(offer.channel!=='Direct'||offer.calculationStatus!=='not_evaluated')return null;
    const raw=offer.rawOffer;
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!offer.scope?.connectorId)return null;
    const connector=data.connectors.find(row=>row.id===offer.scope.connectorId&&row.evseId===offer.scope.evseId);
    if(!connector||typeof connector.powerKw!=='number'||!Number.isFinite(connector.powerKw)||connector.powerKw<=0)return null;
    let price=null,provider=null,country=null,operator=null;
    if(data.source?.id==='FR:ionity_direct'){
      if(Object.keys(raw).length!==1||!Object.prototype.hasOwnProperty.call(raw,'pricePerKwhEur'))return null;
      if(!['AC','DC'].includes(connector.rawSourceFields?.kind))return null;
      price=raw.pricePerKwhEur;provider='IONITY Direct';country='FR';operator='ionity';
    }else if(data.source?.id==='IT:atlante_direct'){
      const source=connector?.rawSourceFields,components=raw.priceComponents;
      const sameConnector=data.offers.filter(row=>row.scope?.connectorId===offer.scope.connectorId);
      const type=String(source?.powerType||source?.connectorType||'').toUpperCase();
      if(!source||!(['AC','DC'].includes(type)||type.includes('TYPE 2')||type.includes('TYPE2')||
          type.includes('CCS')||type.includes('CHADEMO'))||
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
      provider='Atlante direct';country='IT';operator='atlante';
    }else return null;
    if(typeof price!=='number'||!Number.isFinite(price)||price<=0)return null;
    return{id:offer.id,provider,kind:'direct',currency:'EUR',
      countries:[country],operatorIds:[operator],evseIds:[offer.scope.evseId],
      connectorIds:[offer.scope.connectorId],subscriptionId:null,
      pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',
        currency:'EUR',pricePerKwh:price,chargePerMinute:0,connectionFee:0,
        idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0}]},
      metadata:{verified:true,identityMode:'exact_canonical_connector',sourceId:data.source.id,
        artifactSha256:data.source.artifactSha256}};
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
    if(active.some(([name])=>name!=='start_date')||active.length>1||
       (active.length===1&&(typeof active[0][1]!=='string'||
         !/^\d{4}-\d{2}-\d{2}$/.test(active[0][1])||
         Number.isNaN(Date.parse(active[0][1]+'T00:00:00Z'))||
         new Date(active[0][1]+'T00:00:00Z').toISOString().slice(0,10)!==active[0][1])))return null;
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
    if(active.length)rule.validFromDate=active[0][1];
    return{id:offer.id,provider:cpo.name||cpo.sourceOperatorId,kind:'direct',currency:'EUR',
      countries:['NL'],operatorIds:[cpo.sourceOperatorId],evseIds:[evse.id],
      connectorIds:[connector.id],subscriptionId:null,pricing:{type:'rules',rules:[rule]},
      metadata:{verified:true,identityMode:'exact_canonical_connector_ocpi',
        sourceId:data.source.id,artifactSha256:data.source.artifactSha256,
        sourceTariffKey:offer.sourceTariffKey,timeZone:'Europe/Amsterdam'}};
  }
  function toFragments(data){
    if(data?.schemaVersion!==1||!Array.isArray(data?.stations)||!Array.isArray(data?.evses)||!Array.isArray(data?.connectors)||!Array.isArray(data?.offers))throw new Error('canonical schema invalid');
    const cpos=new Map((data.cpos||[]).map(row=>[row.id,row]));
    const proofIndex={cpos,evses:new Map(data.evses.map(row=>[row.id,row])),
      connectors:new Map(),offerCounts:new Map(),connectorsById:new Map(),connectorOfferCounts:new Map()};
    if(data.source?.id==='BE:nap_static'){
      for(const row of data.connectors){const list=proofIndex.connectors.get(row.evseId)||[];list.push(row);proofIndex.connectors.set(row.evseId,list);}
      for(const row of data.offers)proofIndex.offerCounts.set(row.scope?.evseId,(proofIndex.offerCounts.get(row.scope?.evseId)||0)+1);
    }
    if(data.source?.id==='NL:dotnl_static'){
      for(const row of data.connectors)proofIndex.connectorsById.set(row.id,row);
      for(const row of data.offers)proofIndex.connectorOfferCounts.set(row.scope?.connectorId,
        (proofIndex.connectorOfferCounts.get(row.scope?.connectorId)||0)+1);
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
        officialConnectorId:row.officialConnectorId||null,kind:row.kind||row.rawSourceFields?.kind||null,
        plugType:row.plugType||null,powerKw:row.powerKw??null});
    }
    for(const offer of data.offers){
      const evse=evses.get(offer.scope?.evseId);
      if(!evse)throw new Error('canonical offer EVSE missing');
      const proved=provedDirectOffer(data,offer)||provedBelgiumOffer(data,offer,proofIndex)||
        provedNetherlandsOffer(data,offer,proofIndex);
      if(proved)evse.station.pricedOffers.push(proved);
      else evse.station.offers.push({id:offer.id,channel:offer.channel,scope:offer.scope,
        rawOffer:offer.rawOffer??null,sourceTariffKey:offer.sourceTariffKey||null,
        calculationStatus:'not_evaluated'});
    }
    return [...stations.values()].map(({row,evses,offers,pricedOffers})=>{
      const cpo=cpos.get(row.cpoId);
      if(!cpo)throw new Error('canonical station CPO missing');
      const [latitude,longitude]=coordinates(row);
      return{canonicalId:row.id,sourceStationId:row.sourceStationId,countryCode:row.country,
        name:row.name||row.names?.[0]?.value||row.sourceStationId,
        address:address(row),latitude,longitude,
        networkBrand:row.networkBrand||null,
        physicalOperator:{id:cpo.sourceOperatorId,name:cpo.name||cpo.sourceOperatorId},
        evses:evses.sort((a,b)=>a.id.localeCompare(b.id)),offers:pricedOffers,unparsedOffers:offers,
        provenance:[{sourceId:data.source?.id,artifactSha256:data.source?.artifactSha256,
          generatedAt:data.source?.generatedAt||null}]};
    }).sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId));
  }
  return{toFragments};
});
