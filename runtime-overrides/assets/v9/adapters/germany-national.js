(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.germanyNational=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const address=a=>[a?.street,a?.houseNumber,a?.extra,a?.postalCode,a?.city].map(text).filter(Boolean).join(', ');
  function state(v){const s=text(v).toLowerCase();return s==='operational'?'available':s==='out_of_service'?'out_of_service':'unknown';}
  function simplePreferredTariff(site){
    const p=site?.pricing?.stagingPreferredTariff;
    if(!p||p.productionRankable!==true)return null;
    const currency=text(p.currency||p?.tariff?.currency||'EUR').toUpperCase();
    const price=num(p.eurPerKwh??p.pricePerKwh??p?.tariff?.eurPerKwh);
    if(price!=null)return{currency,pricePerKwh:price,metadata:{selectionMode:p.selectionMode||null,sourceType:p.sourceType||null,provider:p.provider||null}};
    return null;
  }
  function normalizeSite(site,{sourceId='germany-national-snapshot'}={}){
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
        kind:'direct',
        subscriptionId:null,
        countries:['DE'],
        currency:tariff.currency,
        pricing:{type:'rules',rules:[{scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:tariff.currency,pricePerKwh:tariff.pricePerKwh,chargePerMinute:0,connectionFee:0,idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]}]},
        metadata:{...tariff.metadata,sourceDataset:site?.pricing?.directCpo?.sourceDataset||null}
      });
    }
    return{
      canonicalId:'DE:national:'+site.id,
      aliases:[site.id,...(site.sourceStationIds||[]).map(text).filter(Boolean),...ids],
      sourceStationId:site.id,
      countryCode:'DE',
      name:text(site.name)||text(site.operator)||('Station '+site.id),
      address:address(site.address),
      latitude:lat,longitude:lon,
      physicalOperator:{name:text(site.operator)||'Unknown'},
      networkBrand:text(site.operator),
      evses,
      access:{kind:'unknown',limited:false},
      status:{state:state(site?.service?.state),sourceId,updatedAt:site?.service?.latestObservedAt||null},
      offers,
      updatedAt:site?.service?.latestObservedAt||null,
      legacy:{declaredChargePoints:num(site.declaredChargePoints),maxConnectionPowerKw:power,pricingFailClosed:!tariff}
    };
  }
  function normalizePayload(payload,opts={}){
    const sites=Array.isArray(payload?.sites)?payload.sites:[];
    return sites.map(x=>normalizeSite(x,opts)).filter(Boolean);
  }
  return{normalizeSite,normalizePayload,simplePreferredTariff};
});
