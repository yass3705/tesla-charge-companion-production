(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9MapPriceEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const blocked=new Set(['EMSP','E-MSP','EMSP_TARIFF','REGULAR','SUBSCRIPTION_ONLY']);
  const cleanChannel=v=>text(v).toUpperCase().replace(/[ -]+/g,'_');
  function validOffer(offer,allowed){
    if(!offer||offer.active===false||offer.verified===false)return false;
    const channel=cleanChannel(offer.channel||offer.priceChannel||offer.tariffChannel||offer.kind);
    const source=cleanChannel(offer.source||offer.provider||offer.network);
    // Electra/Electroverse remain explicit overlay channels; generic eMSP and
    // REGULAR offers stay excluded even when they happen to have a price.
    if(blocked.has(channel)&&!allowed.has(source))return false;
    if(!allowed.has(channel)&&!allowed.has(source)&&channel!=='DIRECT'&&channel!=='AD_HOC_PAYMENT')return false;
    return true;
  }
  function pricePerKm(row,offer,opts={}){
    const explicit=num(offer?.pricePerKm??row?.pricePerKm);
    if(explicit!=null&&explicit>=0)return explicit;
    const total=num(offer?.total??offer?.amount??row?.total??row?.cost);
    const km=num(offer?.routeDistanceKm??row?.distanceKm??row?.route?.distanceKm);
    if(total==null||km==null||km<=0)return null;
    return total/km;
  }
  function zoneKey(lat,lon,opts={}){
    const precision=Math.max(0,Math.min(4,Math.floor(num(opts.precision)??1)));
    const a=num(lat),o=num(lon);if(a==null||o==null)return null;
    return a.toFixed(precision)+':'+o.toFixed(precision);
  }
  function normalizeRows(rows=[],opts={}){
    const allowed=new Set((opts.allowedChannels||['DIRECT','AD_HOC_PAYMENT','ELECTRA','ELECTROVERSE']).map(cleanChannel));
    return (rows||[]).map(row=>{
      const station=row.station||row;
      const offers=(row.offers||station.offers||station.prices||[]).filter(x=>validOffer(x,allowed));
      const priced=offers.map(offer=>({offer,pricePerKm:pricePerKm(row,offer,opts)})).filter(x=>x.pricePerKm!=null);
      const best=priced.sort((a,b)=>a.pricePerKm-b.pricePerKm)[0]||null;
      const lat=num(station.latitude??station.lat??station.coordinates?.latitude);
      const lon=num(station.longitude??station.lon??station.coordinates?.longitude);
      return {id:text(station.id||row.id),name:text(station.name||row.name)||'Borne',lat,lon,zone:zoneKey(lat,lon,opts),bestPricePerKm:best?.pricePerKm??null,bestChannel:best?.offer?.channel||best?.offer?.source||null,offerCount:priced.length,station};
    }).filter(row=>row.zone);
  }
  function summarizeZones(rows=[],opts={}){
    const zones=new Map();
    for(const row of normalizeRows(rows,opts)){
      if(!zones.has(row.zone))zones.set(row.zone,{zone:row.zone,lat:0,lon:0,stationCount:0,pricedStationCount:0,bestPricePerKm:null,bestChannel:null,bestStation:null});
      const z=zones.get(row.zone);z.lat+=row.lat;z.lon+=row.lon;z.stationCount++;
      if(row.bestPricePerKm!=null){z.pricedStationCount++;if(z.bestPricePerKm==null||row.bestPricePerKm<z.bestPricePerKm){z.bestPricePerKm=row.bestPricePerKm;z.bestChannel=row.bestChannel;z.bestStation={id:row.id,name:row.name};}}
    }
    return [...zones.values()].map(z=>({...z,lat:z.lat/z.stationCount,lon:z.lon/z.stationCount})).sort((a,b)=>(a.bestPricePerKm??Infinity)-(b.bestPricePerKm??Infinity)||b.stationCount-a.stationCount);
  }
  function formatPricePerKm(value,currency='€'){const n=num(value);return n==null?'—':n.toFixed(3)+' '+currency+'/km';}
  return{zoneKey,normalizeRows,summarizeZones,formatPricePerKm};
});
