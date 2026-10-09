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
  function normalizeEvseRows(rows=[],opts={}){
    const allowed=new Set((opts.allowedChannels||['DIRECT','AD_HOC_PAYMENT','ELECTRA','ELECTROVERSE']).map(cleanChannel));
    const out=[];
    for(const row of rows||[]){
      const station=row.station||row, evses=station.evses||[];
      for(const evse of evses){
        const connectors=evse.connectors||[];
        for(const connector of connectors){
          const power=num(connector.powerKw??connector.power??evse.powerKw);
          const idsMatch=(wanted,actual)=>!Array.isArray(wanted)||!wanted.length||wanted.map(text).includes(text(actual));
          const offers=(connector.offers||evse.offers||station.offers||row.offers||[]).filter(x=>
            validOffer(x,allowed)&&idsMatch(x.evseIds,evse.id||evse.uid)&&idsMatch(x.connectorIds,connector.id||connector.connectorId||connector.uid));
          const priced=offers.map(offer=>({offer,pricePerKm:pricePerKm(row,offer,opts)})).filter(x=>x.pricePerKm!=null).sort((a,b)=>a.pricePerKm-b.pricePerKm);
          const best=priced[0]||null;
          out.push({stationId:text(station.id||row.id),stationName:text(station.name||row.name)||'Borne',evseId:text(evse.id||evse.uid),connectorId:text(connector.id||connector.connectorId||connector.uid),powerKw:power,lat:num(station.latitude??station.lat??station.coordinates?.latitude),lon:num(station.longitude??station.lon??station.coordinates?.longitude),bestPricePerKm:best?.pricePerKm??null,bestChannel:best?.offer?.channel||best?.offer?.source||null,offers:priced.map(x=>({channel:x.offer.channel||x.offer.source||null,source:x.offer.source||x.offer.provider||null,pricePerKm:x.pricePerKm}))});
        }
      }
    }
    return out.filter(x=>x.lat!=null&&x.lon!=null&&x.powerKw!=null);
  }
  function summarizePowerBuckets(rows=[],opts={}){
    const buckets=new Map();
    for(const row of normalizeEvseRows(rows,opts)){
      const key=(row.lat.toFixed(1)+':'+row.lon.toFixed(1)+':'+row.powerKw);
      if(!buckets.has(key))buckets.set(key,{zone:row.lat.toFixed(1)+':'+row.lon.toFixed(1),powerKw:row.powerKw,lat:row.lat,lon:row.lon,evseCount:0,bestPricePerKm:null,bestChannel:null});
      const bucket=buckets.get(key);bucket.evseCount++;
      if(row.bestPricePerKm!=null&&(bucket.bestPricePerKm==null||row.bestPricePerKm<bucket.bestPricePerKm)){bucket.bestPricePerKm=row.bestPricePerKm;bucket.bestChannel=row.bestChannel;}
    }
    return [...buckets.values()].sort((a,b)=>(a.bestPricePerKm??Infinity)-(b.bestPricePerKm??Infinity)||a.powerKw-b.powerKw);
  }
  return{zoneKey,normalizeRows,normalizeEvseRows,summarizeZones,summarizePowerBuckets,formatPricePerKm};
});
