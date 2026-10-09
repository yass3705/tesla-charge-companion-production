(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.ukOpenFeeds=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
  const uniq=a=>[...new Set((a||[]).map(text).filter(Boolean))];
  function status(v){const s=text(v).toUpperCase();if(s==='AVAILABLE')return'available';if(['OUTOFORDER','INOPERATIVE','REMOVED'].includes(s))return'out_of_service';return'unknown';}
  function powerKw(c){const w=num(c?.max_electric_power);if(w!=null&&w>0)return w/1000;const v=num(c?.max_voltage),a=num(c?.max_amperage);return v!=null&&a!=null?v*a/1000:null;}
  function connectorKind(c){const p=text(c?.power_type).toUpperCase();if(p.startsWith('DC'))return'DC';if(p.startsWith('AC'))return'AC';return text(c?.standard).toUpperCase()||'UNKNOWN';}
  function tariffPricing(t){
    if(!t||!Array.isArray(t.elements)||!t.elements.length)return null;
    const groups=[],unresolved=[];
    const currency=text(t.currency||'GBP').toUpperCase();
    const read=(o,a,b)=>o?.[a]??o?.[b];
    const days={'SUNDAY':0,'MONDAY':1,'TUESDAY':2,'WEDNESDAY':3,'THURSDAY':4,'FRIDAY':5,'SATURDAY':6};
    for(const [index,el] of t.elements.entries()){
      const restrict=el?.restrictions||{},rule={scope:'allDay',start:'00:00',end:'24:00',currency};
      if(Object.keys(restrict).length){
        rule.start=text(read(restrict,'start_time','startTime')||'00:00');
        rule.end=text(read(restrict,'end_time','endTime')||'24:00');
        rule.scope=rule.start==='00:00'&&rule.end==='24:00'?'allDay':'timeWindow';
        const day=read(restrict,'day_of_week','dayOfWeek');
        if(day!=null){
          if(!Array.isArray(day))unresolved.push('invalid_day_of_week');
          else{
            rule.days=day.map(value=>typeof value==='number'?value:days[text(value).toUpperCase()]);
            if(rule.days.some(n=>!Number.isInteger(n)||n<0||n>6))unresolved.push('invalid_day_of_week');
          }
        }
        for(const [src,dest,unit] of [['min_duration','minDurationMinutes',60],['max_duration','maxDurationMinutes',60],['min_power','minPowerKw',1],['max_power','maxPowerKw',1]]){
          const v=num(restrict[src]??restrict[src.replace(/_([a-z])/g,(_,s)=>s.toUpperCase())]);
          if(v!=null)rule[dest]=v/unit;
        }
        if(read(restrict,'start_date','startDate'))rule.validFromDate=text(read(restrict,'start_date','startDate')).slice(0,10);
        if(read(restrict,'end_date','endDate'))rule.validThroughDate=text(read(restrict,'end_date','endDate')).slice(0,10);
        const supported=new Set(['start_time','startTime','end_time','endTime','day_of_week','dayOfWeek','min_duration','minDuration','max_duration','maxDuration','min_power','minPower','max_power','maxPower','start_date','startDate','end_date','endDate']);
        for(const key of Object.keys(restrict))if(!supported.has(key)&&restrict[key]!=null)unresolved.push('unsupported_restriction:'+key);
      }
      const pcs=Array.isArray(el?.price_components)?el.price_components:[];
      let found=0;
      for(const pc of pcs){
        const price=num(pc?.price),step=num(pc?.step_size??pc?.stepSize),type=text(pc?.type).toUpperCase();
        if(price==null||price<0){unresolved.push('invalid_price:'+type);continue;}
        if(type==='ENERGY'){rule.pricePerKwh=(rule.pricePerKwh||0)+price;if(step>0)rule.energyStepWh=step;}
        else if(type==='TIME'){rule.chargePerMinute=(rule.chargePerMinute||0)+price/60;if(step>0)rule.chargingTimeStepSeconds=step;}
        else if(type==='FLAT')rule.connectionFee=(rule.connectionFee||0)+price;
        else if(type==='PARKING_TIME'){rule.idlePerMinute=(rule.idlePerMinute||0)+price/60;if(step>0)rule.parkingTimeStepSeconds=step;}
        else{unresolved.push('unsupported_component:'+type);continue;}
        found++;
      }
      if(!found)unresolved.push('element_without_recognized_component:'+index);
      groups.push({kind:'ocpi-element:'+index,rules:[rule]});
    }
    // Keep the existing single-element OCPI contract for MFG and other consumers.
    // Multiple elements are additive component groups (not competing alternatives).
    if(groups.length===1&&!Object.keys(t.elements[0]?.restrictions||{}).length&&!unresolved.length)
      return{type:'rules',rules:groups[0].rules,timeZone:'Europe/London'};
    return{type:'component_groups',componentGroups:groups,
      ...(unresolved.length?{incompletePricingReason:[...new Set(unresolved)].join(';')}:{}),
      timeZone:'Europe/London'};
  }
  function pcprDirectPricing(t){
    if(t?.tccPriceBasis!=='GBP_including_public_UK_VAT'||t.currency!=='GBP')return null;
    const dims={},keys={ENERGY:'pricePerKwh',TIME:'chargePerMinute',PARKING_TIME:'idlePerMinute',FLAT:'connectionFee'};
    const weekdays={SUNDAY:0,MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5,SATURDAY:6};
    for(const el of t.elements||[]){
      const r=el.restrictions||{};
      if(Object.keys(r).some(k=>!['start_time','end_time','day_of_week','min_duration','max_duration','min_power','max_power','start_date','end_date'].includes(k)))return null;
      for(const pc of el.price_components||[]){
        const kind=text(pc.type).toUpperCase(),key=keys[kind],v=num(pc.price),step=num(pc.step_size);
        if(!key||v==null||v<0||step==null||step<0||(step===0&&kind!=='FLAT'))return null;
        const rule={scope:'timeWindow',start:r.start_time||'00:00',end:r.end_time||'24:00',currency:'GBP'};
        if(r.day_of_week!=null){
          if(!Array.isArray(r.day_of_week))return null;
          rule.daysOfWeek=r.day_of_week.map(x=>typeof x==='number'?(x===7?0:x):weekdays[text(x).toUpperCase()]);
          if(rule.daysOfWeek.some(x=>!Number.isInteger(x)||x<0||x>6))return null;
        }
        for(const [from,to,factor] of [['min_duration','minDurationMinutes',60],['max_duration','maxDurationMinutes',60],['min_power','minPowerKw',1],['max_power','maxPowerKw',1]]){
          if(r[from]!=null)rule[to]=num(r[from])/factor;
        }
        if(r.start_date)rule.validFromDate=text(r.start_date).slice(0,10);
        if(r.end_date)rule.validThroughDate=text(r.end_date).slice(0,10);
        rule[key]=kind==='TIME'||kind==='PARKING_TIME'?v/60:v;
        if(kind==='ENERGY')rule.energyStepWh=step;
        if(kind==='TIME')rule.chargingTimeStepSeconds=step;
        if(kind==='PARKING_TIME')rule.parkingTimeStepSeconds=step;
        (dims[kind] ||= []).push(rule);
      }
    }
    const groups=Object.entries(dims).map(([kind,rules])=>({kind:'OCPI_'+kind,rules}));
    return groups.length?{type:'component_groups',componentGroups:groups,timeZone:'Europe/London',taxIncluded:true}:null;
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
        const connectorOut={id:cid,kind:connectorKind(c),powerKw:powerKw(c)};
        connectors.push(connectorOut);
        const verified=validatedUbitricityOffer(c.validatedV9Offer,loc,eid,cid,source);
        if(verified)offers.push(verified);
        for(const tid of uniq(c.tariff_ids||[])){
          const tariff=tariffMap.get(tid),pricing=source?.id==='eco-movement-pcpr-cpo-direct'?pcprDirectPricing(tariff):tariffPricing(tariff);if(!pricing)continue;
          const connectorExact=['gridserve-pcpr-direct','eco-movement-pcpr-cpo-direct'].includes(source?.id);
          const nextOffer={id:sourceId+':'+stationKey+':'+eid+':'+cid+':'+tid,provider:text(loc?.operator?.name||source?.name||party),kind:'direct',subscriptionId:null,countries:['GB'],currency:text(tariff.currency||'GBP').toUpperCase(),evseIds:[eid],
            ...(connectorExact?{connectorIds:[cid],stationIds:[text(loc.id)]}:{}),pricing,metadata:{tariffId:tid,partyId:party,sourceName:source?.name||null,connectorId:cid,priceBasis:tariff?.tccPriceBasis||null,pricingScope:source?.pricingScope||null,timeZone:'Europe/London',incompletePricingReason:pricing.incompletePricingReason||null}};
          offers.push(nextOffer);
          if(connectorExact){connectorOut.offers=connectorOut.offers||[];connectorOut.offers.push(nextOffer);}
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
