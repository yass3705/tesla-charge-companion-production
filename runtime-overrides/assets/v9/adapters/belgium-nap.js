(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.belgiumNap=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const text=v=>String(v==null?'':v).trim();
 const num=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
 const supported=new Set(['iec62196T2','iec62196T2COMBO','domesticE']);

 // NAP prices are attached to the EVSE. A single energy-only ad-hoc rate is
 // complete; minute/flat records need their own semantics before publication.
 function directEnergyPrice(prices){
  if(!Array.isArray(prices)||prices.length!==1)return null;
  const p=prices[0],value=num(p.value);
  if(p.priceType!=='pricePerKWh'||p.ratePolicy!=='adHoc'||
     text(p.currency).toUpperCase()!=='EUR'||p.taxIncluded!==false||
     num(p.taxRate)!==21||!text(p.rateId)||value==null||value<0||value>3)return null;
  return {rateId:text(p.rateId),grossEurPerKwh:Math.round(value*1.21*1e8)/1e8};
 }

 function normalizeLocation(loc,{sourceId='belgium-nap'}={}){
  if(!loc||!text(loc.id))return null;
  const evses=[],offers=[];
  for(const st of loc.stations||[])for(const ev of st.evses||[]){
   const eid=text(ev.id)||text((ev.externalIdentifiers||[])[0]);
   if(!eid)continue;
   const connectors=(ev.connectors||[]).filter(c=>supported.has(text(c.type))&&num(c.maxPowerW)>0)
    .map((c,i)=>({id:eid+':'+i,kind:text(c.type)==='iec62196T2COMBO'?'DC':'AC',powerKw:num(c.maxPowerW)/1000}));
   if(!connectors.length)continue;
   evses.push({id:eid,aliases:[eid,...(ev.externalIdentifiers||[]).map(text).filter(Boolean)],connectors});
   const price=directEnergyPrice(ev.prices);
   if(!price)continue;
   offers.push({
    id:sourceId+':'+text(loc.id)+':'+eid+':'+price.rateId,
    provider:text(loc.operator||st.operator)||'Belgium CPO',kind:'direct',subscriptionId:null,
    countries:['BE'],currency:'EUR',evseIds:[eid],connectorKinds:[...new Set(connectors.map(c=>c.kind))],
    pricing:{type:'rules',timeZone:'Europe/Brussels',rules:[{scope:'allDay',start:'00:00',end:'24:00',
     billing:'kwh',currency:'EUR',pricePerKwh:price.grossEurPerKwh,chargePerMinute:0,
     connectionFee:0,idlePerMinute:0,afterMinutesRate:0,afterMinutesThreshold:0,
     days:null,ocpiDurationBands:[]}]},priority:125,
    metadata:{source:'Eco-Movement Belgium NAP',rateId:price.rateId,
     priceBasis:'EUR including 21% VAT; source energy-only ad-hoc rate'}
   });
  }
  return {canonicalId:'BE:national:'+text(loc.id),aliases:[text(loc.id)],sourceStationId:text(loc.id),
   countryCode:'BE',name:text(loc.brand)||text(loc.operator)||'Belgium charging station',
   address:[...(loc.addressLines||[]),text(loc.postcode),text(loc.city)].filter(Boolean).join(', '),
   latitude:num(loc.latitude),longitude:num(loc.longitude),
   physicalOperator:{name:text(loc.operator)||'Unknown'},networkBrand:text(loc.operator),
   evses,access:{kind:'unknown',limited:false},status:{state:'unknown',sourceId},offers};
 }
 return {normalizeLocation,directEnergyPrice};
});
