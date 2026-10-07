(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.ukOpenFeeds=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const uniq=a=>[...new Set((a||[]).map(text).filter(Boolean))];
  function status(v){const s=text(v).toUpperCase();if(['AVAILABLE','CHARGING','OCCUPIED','RESERVED'].includes(s))return'available';if(['OUTOFORDER','INOPERATIVE','REMOVED'].includes(s))return'out_of_service';return'unknown';}
  function powerKw(c){const w=num(c?.max_electric_power);if(w!=null&&w>0)return w/1000;const v=num(c?.max_voltage),a=num(c?.max_amperage);return v!=null&&a!=null?v*a/1000:null;}
  function connectorKind(c){const p=text(c?.power_type).toUpperCase();if(p.startsWith('DC'))return'DC';if(p.startsWith('AC'))return'AC';return text(c?.standard).toUpperCase()||'UNKNOWN';}
  function tariffPricing(t){
    if(!t||!Array.isArray(t.elements)||!t.elements.length)return null;
    const rules=[];
    for(const el of t.elements){
      if(el?.restrictions&&Object.keys(el.restrictions).length)return null;
      const pcs=Array.isArray(el?.price_components)?el.price_components:[];
      let energy=0,flat=0,time=0,parking=0,seen=false;
      for(const pc of pcs){
        const value=num(pc?.price);if(value==null)return null;
        const type=text(pc?.type).toUpperCase();
        if(type==='ENERGY'){energy+=value;seen=true;}
        else if(type==='FLAT'){flat+=value;seen=true;}
        else if(type==='TIME'){time+=value/60;seen=true;}
        else if(type==='PARKING_TIME'){parking+=value/60;seen=true;}
        else return null;
      }
      if(!seen)continue;
      rules.push({scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:text(t.currency||'GBP').toUpperCase(),pricePerKwh:energy,chargePerMinute:time,connectionFee:flat,idlePerMinute:parking,afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[]});
    }
    return rules.length?{type:'rules',rules}:null;
  }
  function validatedUbitricityOffer(offer,loc,eid,cid,source){
    if(source?.id!=='ubitricity-pcpr-payg'||!offer||offer.kind!=='direct'||offer.provider!=='Ubitricity'||offer.currency!=='GBP')return null;
    if(!offer.stationIds?.includes(String(loc.id))||!offer.evseIds?.includes(eid)||text(offer.metadata?.connectorId)!==cid)return null;
    if(offer.metadata?.scope!=='cpo_direct_payg_verified'||offer.metadata?.paygVerification!==true||!Array.isArray(offer.pricing?.rules)||!offer.pricing.rules.length)return null;
    if(offer.pricing.timeZone!=='Europe/London'||offer.pricing.rules.some(r=>r.currency!=='GBP'||!Number.isFinite(r.pricePerKwh)||r.pricePerKwh<0))return null;
    return offer;
  }
  function normalizeLocation(loc,source,tariffMap,{sourceId='uk-open-feeds-snapshot'}={}){
    if(!loc||!text(loc.id))return null;
    const lat=num(loc?.coordinates?.latitude),lon=num(loc?.coordinates?.longitude);if(lat==null||lon==null)return null;
    const party=text(loc.party_id||source?.partyIdsExpected?.[0]||'UK');
    const stationKey=party+':'+text(loc.id),offers=[],evses=[];
    for(const rawEvse of loc.evses||[]){
      const eid=text(rawEvse.evse_id||rawEvse.uid||rawEvse.id);if(!eid)continue;
      const connectors=[];
      for(const c of rawEvse.connectors||[]){
        const cid=text(c.id)||eid+':connector';
        connectors.push({id:cid,kind:connectorKind(c),powerKw:powerKw(c)});
        const verified=validatedUbitricityOffer(c.validatedV9Offer,loc,eid,cid,source);
        if(verified)offers.push(verified);
        for(const tid of uniq(c.tariff_ids||[])){
          const tariff=tariffMap.get(tid),pricing=tariffPricing(tariff);if(!pricing)continue;
          offers.push({id:sourceId+':'+stationKey+':'+eid+':'+cid+':'+tid,provider:text(loc?.operator?.name||source?.name||party),kind:'direct',subscriptionId:null,countries:['GB'],currency:text(tariff.currency||'GBP').toUpperCase(),evseIds:[eid],pricing,metadata:{tariffId:tid,partyId:party,sourceName:source?.name||null}});
        }
      }
      evses.push({id:eid,aliases:uniq([eid,rawEvse.uid,rawEvse.physical_reference]),connectors,status:status(rawEvse.status)});
    }
    const states=evses.map(e=>e.status);const stationState=states.includes('available')?'available':states.length&&states.every(x=>x==='out_of_service')?'out_of_service':'unknown';
    return{canonicalId:'GB:ocpi:'+party+':'+text(loc.id),aliases:uniq([stationKey,text(loc.id)]),sourceStationId:stationKey,countryCode:'GB',name:text(loc.name)||text(loc?.operator?.name)||('Station '+loc.id),address:[loc.address,loc.city,loc.postal_code].map(text).filter(Boolean).join(', '),latitude:lat,longitude:lon,physicalOperator:{name:text(loc?.operator?.name||source?.name)||'Unknown'},networkBrand:text(loc?.suboperator?.name||loc?.operator?.name||source?.name),evses,access:{kind:loc?.opening_times?.twentyfourseven===true?'24_7':'unknown',limited:loc?.opening_times?.twentyfourseven!==true},status:{state:stationState,sourceId,updatedAt:loc.last_updated||null},offers,updatedAt:loc.last_updated||null};
  }
  function normalizePayload(payload,opts={}){
    const out=[];
    for(const source of payload?.sources||[]){
      const tariffMap=new Map((source?.tariffs||[]).filter(x=>x&&x.id!=null).map(x=>[text(x.id),x]));
      for(const loc of source?.locations||[]){const row=normalizeLocation(loc,source,tariffMap,opts);if(row)out.push(row);}
    }
    return out;
  }
  return{normalizePayload,normalizeLocation,tariffPricing,powerKw,connectorKind};
});
