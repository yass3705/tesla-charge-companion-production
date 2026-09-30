(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.germanyNational=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const address=a=>[a?.street,a?.houseNumber,a?.extra,a?.postalCode,a?.city].map(text).filter(Boolean).join(', ');
  const coordKey=(lat,lon)=>{const a=num(lat),b=num(lon);return a==null||b==null?null:`${a.toFixed(6)}|${b.toFixed(6)}`;};
  function state(v){const s=text(v).toLowerCase();return s==='operational'?'available':s==='out_of_service'?'out_of_service':'unknown';}

  function simplePreferredTariff(site){
    const p=site?.pricing?.stagingPreferredTariff;
    if(!p||p.productionRankable!==true)return null;
    const currency=text(p.currency||p?.tariff?.currency||'EUR').toUpperCase();
    const price=num(p.eurPerKwh??p.pricePerKwh??p?.tariff?.eurPerKwh);
    if(price!=null)return{currency,pricePerKwh:price,metadata:{selectionMode:p.selectionMode||null,sourceType:p.sourceType||null,provider:p.provider||null}};
    return null;
  }

  function buildIonityExactOverlay(payload,ionityPayload){
    const sites=Array.isArray(payload?.sites)?payload.sites:[];
    const locs=Array.isArray(ionityPayload?.locations)?ionityPayload.locations:[];
    const byCoord=new Map();
    for(const site of sites){
      const key=coordKey(site?.coordinates?.latitude,site?.coordinates?.longitude);
      if(!key)continue;
      const rows=byCoord.get(key)||[];rows.push(site);byCoord.set(key,rows);
    }
    const offers=new Map(),diagnostics={locations:locs.length,exactUnique:0,rankable:0,failClosed:0,reasons:{}};
    const fail=reason=>{diagnostics.failClosed++;diagnostics.reasons[reason]=(diagnostics.reasons[reason]||0)+1;};
    for(const loc of locs){
      if(text(loc?.country).toUpperCase()!=='DE'||text(loc?.cpoIdentifier)!=='IONITY_CPO'){fail('scope');continue;}
      const key=coordKey(loc?.latitude,loc?.longitude),matches=key?byCoord.get(key)||[]:[];
      if(matches.length!==1){fail(matches.length?'ambiguous_coordinate':'no_exact_coordinate');continue;}
      const site=matches[0];
      if(!text(site?.operator).toLowerCase().includes('ionity')){fail('operator_mismatch');continue;}
      diagnostics.exactUnique++;
      const connectors=Array.isArray(loc?.connectors)?loc.connectors:[];
      if(!connectors.length||connectors.some(c=>num(c?.pricePerKwhEur)==null||num(c?.pricePerKwhEur)<=0)){fail('unpriced_connector');continue;}
      const prices=[...new Set(connectors.map(c=>num(c.pricePerKwhEur).toFixed(6)))];
      const kinds=[...new Set(connectors.map(c=>text(c?.kind).toUpperCase()))];
      if(prices.length!==1){fail('mixed_site_prices');continue;}
      if(kinds.length!==1||!['AC','DC'].includes(kinds[0])){fail('mixed_or_unknown_kind');continue;}
      const price=Number(prices[0]),kind=kinds[0];
      offers.set(text(site.id),{
        id:`ionity-direct:${text(loc.uuid)||text(loc.locationId)}`,
        provider:'IONITY Direct',
        kind:'direct',
        subscriptionId:null,
        countries:['DE'],
        currency:'EUR',
        connectorKinds:[kind],
        pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',pricePerKwh:price,chargePerMinute:0,connectionFee:0,idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]}]},
        priority:130,
        metadata:{
          verified:true,
          source:'pinned r8 IONITY Direct overlay',
          identityMode:'unique_exact_coordinate_plus_operator',
          sourceLocationUuid:text(loc.uuid),
          sourceLocationId:text(loc.locationId),
          connectorCount:connectors.length,
          allConnectorsSamePrice:true
        }
      });
      diagnostics.rankable++;
    }
    return{offers,diagnostics};
  }

  function normalizeSite(site,{sourceId='germany-national-snapshot',ionityOfferBySiteId}={}){
    if(!site||!text(site.id))return null;
    const lat=num(site?.coordinates?.latitude),lon=num(site?.coordinates?.longitude);
    if(lat==null||lon==null)return null;
    const ids=(site.evseIds||[]).map(text).filter(Boolean);
    const power=num(site.maxConnectionPowerKw);
    const evses=ids.length?ids.map(id=>({id,aliases:[id],connectors:power!=null?[{id:id+':connector',kind:'UNKNOWN',powerKw:power}]:[]})):[];
    const tariff=simplePreferredTariff(site),offers=[];
    if(tariff){
      offers.push({
        id:sourceId+':'+site.id+':direct',
        provider:text(site?.pricing?.stagingPreferredTariff?.provider||site.operator)||'Direct CPO',
        kind:'direct',subscriptionId:null,countries:['DE'],currency:tariff.currency,
        pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:tariff.currency,pricePerKwh:tariff.pricePerKwh,chargePerMinute:0,connectionFee:0,idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]}]},
        metadata:{...tariff.metadata,sourceDataset:site?.pricing?.directCpo?.sourceDataset||null}
      });
    }
    const ionity=ionityOfferBySiteId?.get?.(text(site.id));
    if(ionity)offers.push(ionity);
    return{
      canonicalId:'DE:national:'+site.id,
      aliases:[site.id,...(site.sourceStationIds||[]).map(text).filter(Boolean),...ids],
      sourceStationId:site.id,countryCode:'DE',
      name:text(site.name)||text(site.operator)||('Station '+site.id),address:address(site.address),
      latitude:lat,longitude:lon,physicalOperator:{name:text(site.operator)||'Unknown'},networkBrand:text(site.operator),
      evses,access:{kind:'unknown',limited:false},
      status:{state:state(site?.service?.state),sourceId,updatedAt:site?.service?.latestObservedAt||null},
      offers,updatedAt:site?.service?.latestObservedAt||null,
      legacy:{declaredChargePoints:num(site.declaredChargePoints),maxConnectionPowerKw:power,pricingFailClosed:offers.length===0}
    };
  }

  function normalizePayload(payload,opts={}){
    const sites=Array.isArray(payload?.sites)?payload.sites:[];
    let ionityOfferBySiteId=null,ionityDiagnostics=null;
    if(opts.ionityPayload){
      const overlay=buildIonityExactOverlay(payload,opts.ionityPayload);
      ionityOfferBySiteId=overlay.offers;ionityDiagnostics=overlay.diagnostics;
    }
    const stations=sites.map(x=>normalizeSite(x,{...opts,ionityOfferBySiteId})).filter(Boolean);
    if(ionityDiagnostics)Object.defineProperty(stations,'ionityDiagnostics',{value:ionityDiagnostics,enumerable:false});
    return stations;
  }
  return{normalizeSite,normalizePayload,simplePreferredTariff,buildIonityExactOverlay,coordKey};
});
