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
  function toFragments(data){
    if(data?.schemaVersion!==1||!Array.isArray(data?.stations)||!Array.isArray(data?.evses)||!Array.isArray(data?.connectors)||!Array.isArray(data?.offers))throw new Error('canonical schema invalid');
    const cpos=new Map((data.cpos||[]).map(row=>[row.id,row]));
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
      const proved=provedDirectOffer(data,offer);
      if(proved)evse.station.pricedOffers.push(proved);
      else evse.station.offers.push({id:offer.id,channel:offer.channel,scope:offer.scope,
        rawOffer:offer.rawOffer??null,calculationStatus:'not_evaluated'});
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
