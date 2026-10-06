(function(root,factory){
  if(typeof module==='object'&&module.exports){
    module.exports=factory(require('./offer-engine.js'),require('./pricing-engine.js'));
  }else{
    root.TCCV9SessionEngine=factory(root.TCCV9OfferEngine,root.TCCV9PricingEngine);
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(OfferEngine,PricingEngine){
  'use strict';

  if(!OfferEngine)throw new Error('TCC V9 offer engine is required');
  if(!PricingEngine)throw new Error('TCC V9 pricing engine is required');

  const text=v=>String(v==null?'':v).trim();
  const num=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const money=v=>Math.round((Number(v)+Number.EPSILON)*1000000)/1000000;
  const addMinutes=(value,minutes)=>{const d=value instanceof Date?new Date(value.getTime()):new Date(value);if(Number.isNaN(d.getTime()))return null;return new Date(d.getTime()+Number(minutes||0)*60000);};
  const electroverseFormatters=new Map(),electroverseLocalCache=new Map();
  function electroverseLocal(at,timeZone){
    const minuteKey=`${timeZone}|${Math.floor(at.getTime()/60000)}`;
    if(electroverseLocalCache.has(minuteKey))return electroverseLocalCache.get(minuteKey);
    let formatter=electroverseFormatters.get(timeZone);
    if(!formatter){
      try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
      catch(_){return null;}
      electroverseFormatters.set(timeZone,formatter);
    }
    let result=null;
    try{
      const parts=formatter.formatToParts(at),get=type=>parts.find(part=>part.type===type)?.value;
      const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
      const weekday=weekdays[get('weekday')],hour=Number(get('hour')),minute=Number(get('minute'));
      if(weekday!=null&&Number.isFinite(hour)&&Number.isFinite(minute))result={weekday,minute:hour*60+minute,key:`${get('year')}-${get('month')}-${get('day')}`};
    }catch(_){}
    if(electroverseLocalCache.size>8192)electroverseLocalCache.clear();
    electroverseLocalCache.set(minuteKey,result);
    return result;
  }

  function connectorKind(connector={}){
    const raw=text(connector.kind||connector.currentType||connector.powerType||connector.plugName).toUpperCase();
    if(raw.includes('DC')||raw.includes('CCS')||raw.includes('CHADEMO'))return'DC';
    if(raw.includes('AC')||raw.includes('TYPE2')||raw.includes('TYPE 2'))return'AC';
    const power=num(connector.powerKw);return power!=null&&power>22?'DC':'AC';
  }

  function connectorUsable(connector={}){
    const state=text(connector?.status?.state??connector?.status).toLowerCase();
    return !['out_of_service','unavailable','offline','faulted','inoperative'].includes(state);
  }
  function stationChargingProfile(station){
    let selected=null;
    for(const evse of station?.evses||[])for(const connector of evse?.connectors||[]){
      if(!connectorUsable(connector))continue;
      const power=num(connector?.powerKw);if(power==null||power<=0)continue;
      const kind=connectorKind(connector);
      if(!selected||power>selected.powerKw||(power===selected.powerKw&&kind==='DC'&&selected.kind!=='DC'))selected={powerKw:power,kind,connectorId:text(connector?.id)||null,plugName:text(connector?.plugName||connector?.type)||null,evseIds:[evse?.id,...(evse?.aliases||[]),...(evse?.pdcIds||[])].map(text).filter(Boolean)};
    }
    return selected||{powerKw:null,kind:null,connectorId:null,plugName:null,evseIds:[]};
  }
  function stationChargingKind(station){return stationChargingProfile(station).kind;}

  function offerMatchesChargingKind(offer,chargingKind,chargingPowerKw=null,chargingPlugName=null,chargingConnectorId=null,chargingEvseIds=[]){
    const allowed=Array.isArray(offer?.connectorKinds)?offer.connectorKinds.map(v=>text(v).toUpperCase()).filter(Boolean):[];
    if(chargingKind&&allowed.length&&!allowed.includes(chargingKind))return false;
    const min=num(offer?.minPowerKw),max=num(offer?.maxPowerKw),power=num(chargingPowerKw);
    if((min!=null||max!=null)&&power==null)return false;
    if(power!=null&&min!=null&&power<min-1e-9)return false;
    if(power!=null&&max!=null&&power>max+1e-9)return false;
    const ids=Array.isArray(offer?.connectorIds)?offer.connectorIds.map(text).filter(Boolean):[];
    if(ids.length&&(!chargingConnectorId||!ids.includes(text(chargingConnectorId))))return false;
    const plugs=Array.isArray(offer?.plugNames)?offer.plugNames.map(v=>text(v).toUpperCase()).filter(Boolean):[];
    if(plugs.length&&(!chargingPlugName||!plugs.includes(text(chargingPlugName).toUpperCase())))return false;
    const exactEvses=Array.isArray(offer?.evseIds)?offer.evseIds.map(v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean):[];
    if(exactEvses.length){
      const selected=new Set((chargingEvseIds||[]).map(v=>text(v).toUpperCase().replace(/[^A-Z0-9]/g,'')).filter(Boolean));
      if(!exactEvses.some(id=>selected.has(id)))return false;
    }
    return true;
  }

  function fxRate(currency,targetCurrency,fxRates={}){
    const from=text(currency||targetCurrency||'EUR').toUpperCase(),to=text(targetCurrency||from).toUpperCase();
    if(from===to)return 1;
    const direct=num(fxRates[`${from}_${to}`]??fxRates[`${from}/${to}`]);if(direct!=null&&direct>0)return direct;
    const inverse=num(fxRates[`${to}_${from}`]??fxRates[`${to}/${from}`]);if(inverse!=null&&inverse>0)return 1/inverse;
    const fromEur=num(fxRates[from]),toEur=num(fxRates[to]);
    if(fromEur!=null&&fromEur>0&&toEur!=null&&toEur>0)return toEur/fromEur;
    return null;
  }

  function recoveredKm(session={}){
    const explicit=num(session.recoveredKm);if(explicit!=null&&explicit>0)return explicit;
    const energy=num(session.energyKwh),consumption=num(session.consumptionKwhPer100Km);
    if(energy==null||energy<=0||consumption==null||consumption<=0)return null;
    return energy/(consumption/100);
  }

  function stationSession(station,session={},options={}){
    const id=text(station?.id||station?.canonicalId||station?.stationId);
    const approach=num(options.approachEnergyKwhByStationId?.[id]??session.approachEnergyKwhByStationId?.[id]??station?.route?.approachEnergyKwh)??0;
    const requested=num(session.energyKwh)??0;
    const include=session.includeRouteEnergyInCharge!==false;
    return{...session,requestedEnergyKwh:requested,approachEnergyKwh:approach,energyKwh:money(Math.max(0,requested+(include?approach:0)))};
  }

  function validDateKey(value){
    const key=text(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return null;
    const [year,month,day]=key.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day?key:null;
  }

  function evaluateOfferValidity(offer,session={}){
    const rawFrom=text(offer?.validFrom),rawThrough=text(offer?.validThrough);
    if(!rawFrom&&!rawThrough)return{complete:true};
    const validFrom=rawFrom?validDateKey(rawFrom):null,validThrough=rawThrough?validDateKey(rawThrough):null;
    if((rawFrom&&!validFrom)||(rawThrough&&!validThrough)||(validFrom&&validThrough&&validFrom>validThrough)){
      return{complete:false,reason:'invalid_offer_validity_window',offerId:text(offer?.id||offer?.offerId),validFrom:rawFrom||null,validThrough:rawThrough||null};
    }
    if(!session.startAt)return{complete:false,reason:'offer_validity_requires_start_time',offerId:text(offer?.id||offer?.offerId),validFrom,validThrough};
    const timeZone=session.timeZone||offer?.metadata?.timeZone||null,start=PricingEngine.localDateParts(session.startAt,timeZone);
    if(!start)return{complete:false,reason:'offer_validity_local_date_unresolved',offerId:text(offer?.id||offer?.offerId),timeZone,validFrom,validThrough};
    if((validFrom&&start.key<validFrom)||(validThrough&&start.key>validThrough)){
      return{complete:false,reason:'offer_outside_validity_window',offerId:text(offer?.id||offer?.offerId),timeZone,sessionLocalDate:start.key,validFrom,validThrough};
    }
    const basis=text(offer?.validityBasis||offer?.metadata?.validityBasis)||'session_start_local_date';
    if(basis==='whole_session_local_date'){
      const duration=Math.max(0,num(session.durationMinutes)??0),endAt=addMinutes(session.startAt,duration),end=endAt&&PricingEngine.localDateParts(endAt,timeZone);
      if(!end)return{complete:false,reason:'offer_validity_local_date_unresolved',offerId:text(offer?.id||offer?.offerId),timeZone,validFrom,validThrough};
      if((validFrom&&end.key<validFrom)||(validThrough&&end.key>validThrough)){
        return{complete:false,reason:'offer_session_crosses_validity_window',offerId:text(offer?.id||offer?.offerId),timeZone,sessionLocalDate:start.key,sessionEndLocalDate:end.key,validFrom,validThrough};
      }
    }else if(basis!=='session_start_local_date'){
      return{complete:false,reason:'unsupported_offer_validity_basis',offerId:text(offer?.id||offer?.offerId),validityBasis:basis,validFrom,validThrough};
    }
    return{complete:true,timeZone,sessionLocalDate:start.key,validFrom,validThrough,validityBasis:basis};
  }

  function evaluateSessionStartLockedOffer(offer,session={}){
    const pricing=offer?.pricing||{},timeZone=session.timeZone||offer?.metadata?.timeZone||null;
    if(pricing.type!=='rules'||pricing.priceSelectionBasis!=='session_start_local_time')return null;
    const rule=PricingEngine.matchingRule(pricing,session.startAt,timeZone);
    if(!rule)return{complete:false,reason:'no_matching_time_rule',offerId:text(offer?.id||offer?.offerId),timeZone};
    const duration=num(session.durationMinutes);
    const billedSession=pricing.connectedTimeRounding==='started_minute'&&duration!=null
      ?{...session,durationMinutes:Math.ceil(Math.max(0,duration-1e-9))}:session;
    const base=PricingEngine.evaluateRule(rule,billedSession);
    const finalized=PricingEngine.applyMinimumTotal(pricing,base.totalEur,base.components);
    return{
      complete:true,totalEur:finalized.totalEur,components:finalized.components,
      offerId:text(offer?.id||offer?.offerId),currency:offer?.currency||'EUR',matchedRule:rule,
      segmented:false,timeZone,priceSelectionBasis:'session_start_local_time'
    };
  }

  function timelineEnergy(pricing,session,timeZone){
    const rows=Array.isArray(session.chargeTimeline)?session.chargeTimeline:[];
    if(!rows.length||!session.startAt)return null;
    let total=0;const segments=[];
    for(const step of rows){
      const offset=Math.max(0,num(step.offsetMinutes)??0),duration=Math.max(0,num(step.durationMinutes)??0),energy=Math.max(0,num(step.energyKwh)??0);
      if(duration<=1e-9||energy<=0)continue;
      let used=0;
      while(used<duration-1e-9){
        const at=addMinutes(session.startAt,offset+used);if(!at)return{complete:false,reason:'invalid_charge_timeline_start'};
        const rule=PricingEngine.matchingRule(pricing,at,timeZone);if(!rule)return{complete:false,reason:'no_matching_time_rule',segmentStartAt:at.toISOString()};
        if(!PricingEngine.segmentableRule(rule))return{complete:false,reason:'tariff_window_crossing_unsupported_components',segmentStartAt:at.toISOString(),matchedRule:rule};
        let boundary=PricingEngine.minutesUntilRuleBoundary(rule,at,timeZone,pricing);if(boundary==null)return{complete:false,reason:'unresolved_tariff_boundary'};
        if(!Number.isFinite(boundary))boundary=duration-used;
        const slice=Math.min(duration-used,Math.max(boundary,1e-6)),sliceEnergy=energy*(slice/duration),rate=num(rule.pricePerKwh),cost=rate==null?0:sliceEnergy*rate;
        total+=cost;
        segments.push({startAt:at.toISOString(),durationMinutes:money(slice),energyKwh:money(sliceEnergy),pricePerKwh:rate,costEur:money(cost),startSoc:num(step.startSoc),endSoc:num(step.endSoc),powerKw:num(step.powerKw),rule});
        used+=slice;
        if(segments.length>4096)return{complete:false,reason:'charge_timeline_segmentation_guard'};
      }
    }
    return{complete:true,totalEur:money(total),segments};
  }

  function evaluateCompactMinuteOffer(offer,session={}){
    const pricing=offer?.pricing||{},rules=Array.isArray(pricing.rules)?pricing.rules:[];
    const hasTimedComponent=rule=>(num(rule.chargePerMinute)??0)>0||(num(rule.idlePerMinute)??0)>0||(num(rule.connectionFee)??0)>0||(num(rule.afterMinutesRate)??0)>0||(num(rule.postChargeRate)??0)>0||(Array.isArray(rule.powerBands)&&rule.powerBands.length>0);
    if(pricing.type!=='rules'||!rules.some(hasTimedComponent))return null;
    const timeZone=session.timeZone||offer?.metadata?.timeZone||'Europe/Paris',start=new Date(session.startAt);
    const duration=num(session.durationMinutes),energy=num(session.energyKwh);
    const incomplete=reason=>({complete:false,reason,offerId:text(offer?.id||offer?.offerId),timeZone});
    if(Number.isNaN(start.getTime())||duration==null||duration<0||duration>72*60||energy==null||energy<0)return incomplete('invalid_compact_minute_session');
    if(pricing.conditionalSessionFees?.length||pricing.postChargeFee||pricing.longConnectionFee)return incomplete('unsupported_compact_minute_extra_fee');
    if(rules.some(rule=>Array.isArray(rule.ocpiDurationBands)&&rule.ocpiDurationBands.length))return incomplete('unsupported_compact_minute_tier');
    if(rules.some(rule=>(num(rule.afterMinutesRate)??0)>0&&!(num(rule.afterMinutesThreshold)>0)))return incomplete('unsupported_compact_minute_tier');
    const timeRules=rules.filter(rule=>rule.scope!=='allDay'),baseRules=rules.filter(rule=>rule.scope==='allDay');
    const charging=Math.max(0,Math.min(duration,num(session.chargingMinutes)??(duration-Math.max(0,num(session.postChargeMinutes)??0))));
    if(energy>0&&charging<=0&&duration>0)return incomplete('energy_without_charging_minutes');
    const timeline=Array.isArray(session.chargeTimeline)?session.chargeTimeline.map(step=>({start:Math.max(0,num(step.offsetMinutes)??0),duration:Math.max(0,num(step.durationMinutes)??0),energy:Math.max(0,num(step.energyKwh)??0),powerKw:num(step.powerKw)})).filter(step=>step.duration>0):[];
    const timelineTotal=timeline.reduce((sum,step)=>sum+step.energy,0),capUsed=new Map();
    const parseMinute=value=>{const parts=String(value||'').split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:null;};
    const dayRules=(rows,at)=>{const day=PricingEngine.localDateParts(at,timeZone)?.weekday;return rows.filter(rule=>!Array.isArray(rule.days)||!rule.days.length||rule.days.includes(day));};
    const matching=(at)=>PricingEngine.matchingRule({rules:dayRules(timeRules,at)},at,timeZone,session)||PricingEngine.matchingRule({rules:dayRules(baseRules,at)},at,timeZone,session);
    const baseAfter=baseRules.find(rule=>(num(rule.afterMinutesRate)??0)>0);
    let elapsed=0,total=0,fee=null,segments=[];
    while(elapsed<duration-1e-9){
      const at=addMinutes(start,elapsed),rule=matching(at);
      if(!rule)return incomplete('no_matching_compact_minute_rule');
      let boundary=PricingEngine.minutesUntilRuleBoundary(rule,at,timeZone);
      if(boundary==null)return incomplete('unresolved_compact_minute_boundary');
      const minute=PricingEngine.minuteOfDay(at,timeZone);
      if(minute==null)return incomplete('unresolved_compact_minute_boundary');
      for(const window of timeRules){
        const begins=parseMinute(window.start);if(begins==null)continue;
        const until=(begins-minute+1440)%1440;
        if(until>1e-9)boundary=Math.min(boundary,until);
      }
      const capStart=parseMinute(rule.afterMinutesCapStart),capEnd=parseMinute(rule.afterMinutesCapEnd);
      if((num(rule.afterMinutesCap)??0)>0&&capStart!=null&&capEnd!=null){
        for(const edge of [capStart,capEnd]){const until=(edge-minute+1440)%1440;if(until>1e-9)boundary=Math.min(boundary,until);}
      }
      const tier=(num(rule.afterMinutesRate)??0)>0?rule:baseAfter;
      const tierRate=num(tier?.afterMinutesRate)??0,tierThreshold=num(tier?.afterMinutesThreshold)??0;
      if(tierRate>0&&elapsed<tierThreshold)boundary=Math.min(boundary,tierThreshold-elapsed);
      if(!Number.isFinite(boundary))boundary=duration-elapsed;
      const end=Math.min(duration,elapsed+Math.max(boundary,1e-6));
      const chargeMinutes=Math.max(0,Math.min(end,charging)-elapsed),idleMinutes=Math.max(0,end-Math.max(elapsed,charging));
      const segmentEnergy=timelineTotal>0?energy*timeline.reduce((sum,step)=>sum+Math.max(0,Math.min(end,step.start+step.duration)-Math.max(elapsed,step.start))*step.energy/step.duration,0)/timelineTotal:charging>0?energy*chargeMinutes/charging:0;
      const surchargeMinutes=tierRate>0?Math.max(0,end-Math.max(elapsed,tierThreshold)):0;
      let surcharge=money(surchargeMinutes*tierRate);
      const cap=num(tier?.afterMinutesCap)??0;
      if(cap>0){
        const from=parseMinute(tier.afterMinutesCapStart),to=parseMinute(tier.afterMinutesCapEnd);
        if(from==null||to==null)return incomplete('invalid_after_minutes_cap_window');
        const inside=from===to?true:from<to?minute>=from&&minute<to:minute>=from||minute<to;
        if(inside){
          const local=PricingEngine.localDateParts(at,timeZone);if(!local)return incomplete('unresolved_compact_minute_cap_day');
          const day=from>to&&minute<to?new Date(Date.UTC(local.year,local.month-1,local.day-1)).toISOString().slice(0,10):local.key;
          const used=capUsed.get(day)||0;surcharge=money(Math.min(surcharge,Math.max(0,cap-used)));capUsed.set(day,money(used+surcharge));
        }
      }
      const postGrace=Math.max(0,num(rule.postChargeGraceMinutes)??0);
      const postBillable=Math.max(0,end-Math.max(elapsed,charging+postGrace));
      let powerCost=0;
      if(Array.isArray(rule.powerBands)&&rule.powerBands.length){
        const powerRate=power=>{if(power==null||!Number.isFinite(power)||power<0)return null;const band=rule.powerBands.find(row=>power>=Number(row.minKw)&&power<Number(row.maxKw));return band?num(band.ratePerMinute):null;};
        if(timeline.length){
          let covered=0;
          for(const step of timeline){const overlap=Math.max(0,Math.min(end,charging,step.start+step.duration)-Math.max(elapsed,step.start));if(overlap<=0)continue;const rate=powerRate(step.powerKw);if(rate==null)return incomplete('power_band_requires_valid_charge_power');powerCost+=overlap*rate;covered+=overlap;}
          if(covered+1e-6<chargeMinutes)return incomplete('power_band_timeline_gap');
        }else{
          const rate=powerRate(num(session.powerKw));if(rate==null)return incomplete('power_band_requires_charge_power');powerCost=chargeMinutes*rate;
        }
      }
      const segment=money(segmentEnergy*(num(rule.pricePerKwh)??0)+chargeMinutes*(num(rule.chargePerMinute)??0)+idleMinutes*(num(rule.idlePerMinute)??0)+surcharge+postBillable*(num(rule.postChargeRate)??0)+powerCost);
      total+=segment;
      if(fee==null)fee=num(rule.connectionFee)??0;
      segments.push({startAt:at.toISOString(),durationMinutes:money(end-elapsed),chargingMinutes:money(chargeMinutes),idleMinutes:money(idleMinutes),energyKwh:money(segmentEnergy),surchargeMinutes:money(surchargeMinutes),postChargeBillableMinutes:money(postBillable),powerCostEur:money(powerCost),costEur:segment});
      elapsed=end;
      if(segments.length>4096)return incomplete('compact_minute_segmentation_guard');
    }
    if(fee==null){const rule=matching(start);if(!rule)return incomplete('no_matching_compact_minute_rule');fee=num(rule.connectionFee)??0;total+=energy*(num(rule.pricePerKwh)??0);}
    const totalEur=money(total+fee),components={compactMinute:{segments,connectionFee:fee,chargingMinutes:charging,idleMinutes:Math.max(0,duration-charging)}};
    const finalized=PricingEngine.applyMinimumTotal(pricing,totalEur,components);
    return{complete:true,totalEur:finalized.totalEur,components:finalized.components,offerId:text(offer?.id||offer?.offerId),currency:offer?.currency||'EUR',timeZone,segmented:segments.length>1};
  }

  function evaluateTimelineOffer(offer,session={}){
    const pricing=offer?.pricing||{},timeZone=session.timeZone||offer?.metadata?.timeZone||null;
    if(pricing.type!=='rules'||pricing.priceSelectionBasis==='session_start_local_time'||!Array.isArray(session.chargeTimeline)||!session.chargeTimeline.length||!session.startAt)return null;
    const rule=PricingEngine.matchingRule(pricing,session.startAt,timeZone);if(!rule)return null;
    const duration=Math.max(0,num(session.durationMinutes)??0),boundary=PricingEngine.minutesUntilRuleBoundary(rule,session.startAt,timeZone,pricing);
    if(boundary==null||!Number.isFinite(boundary)||duration<=boundary+1e-9)return null;
    const threshold=num(pricing.longConnectionFee?.thresholdMinutes);if(threshold!=null&&duration>threshold)return null;
    const timeBase=PricingEngine.evaluateSegmentedRules(pricing,{...session,energyKwh:0},timeZone);if(timeBase.complete===false)return{...timeBase,offerId:text(offer?.id||offer?.offerId),timeZone};
    const energyBase=timelineEnergy(pricing,session,timeZone);if(!energyBase||energyBase.complete===false)return energyBase?{...energyBase,offerId:text(offer?.id||offer?.offerId),timeZone}:null;
    const conditional=PricingEngine.evaluateConditionalSessionFees(pricing.conditionalSessionFees,session);if(conditional.complete===false)return{complete:false,reason:conditional.reason,offerId:text(offer?.id||offer?.offerId),timeZone};
    const post=PricingEngine.evaluatePostChargeFee(pricing.postChargeFee,session,timeZone);if(post.complete===false)return{complete:false,reason:post.reason,offerId:text(offer?.id||offer?.offerId),timeZone};
    const total=timeBase.totalEur+energyBase.totalEur+conditional.totalEur+post.totalEur;
    const components={...timeBase.components,energyTimeline:{segments:energyBase.segments,costEur:energyBase.totalEur},...(conditional.component?{conditionalSessionFees:conditional.component}:{}),...(post.component?{postCharge:post.component}:{})};
    const finalized=PricingEngine.applyMinimumTotal(pricing,total,components);
    return{complete:true,totalEur:finalized.totalEur,components:finalized.components,offerId:text(offer?.id||offer?.offerId),currency:offer?.currency||'EUR',matchedRule:rule,segmented:true,energyTimelineApplied:true,timeZone};
  }

  function evaluateElectroverseOffer(offer,session={}){
    const pricing=offer?.pricing||{};
    if(pricing.type!=='electroverse_restrictions')return null;
    const timeZone=offer?.metadata?.timeZone||'Europe/Paris';
    const start=new Date(session.startAt),duration=num(session.durationMinutes),energy=num(session.energyKwh);
    if(Number.isNaN(start.getTime())||duration==null||duration<0||duration>72*60||energy==null||energy<0)
      return{complete:false,reason:'invalid_electroverse_session',offerId:text(offer?.id),timeZone};
    const rules=Array.isArray(pricing.rules)?pricing.rules:[];
    if(!rules.length)return{complete:false,reason:'missing_electroverse_rules',offerId:text(offer?.id),timeZone};
    const charging=Math.max(0,Math.min(duration,num(session.chargingMinutes)??(duration-Math.max(0,num(session.postChargeMinutes)??0))));
    const timeline=(Array.isArray(session.chargeTimeline)?session.chargeTimeline:[]).map(step=>({
      start:Math.max(0,num(step.offsetMinutes)??0),duration:Math.max(0,num(step.durationMinutes)??0),energy:Math.max(0,num(step.energyKwh)??0)
    })).filter(step=>step.duration>0&&step.energy>0);
    const timelineTotal=timeline.reduce((sum,step)=>sum+step.energy,0);
    const ruleMatches=(rule,parts,minute,elapsed)=>{
      const types=rule.types||[];
      if(types.includes('DATE_BASED')&&((rule.startDate&&parts.key<rule.startDate)||(rule.endDate&&parts.key>=rule.endDate)))return false;
      if(types.includes('TIME_BASED')){
        const hm=value=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
        const from=hm(rule.startTime),until=hm(rule.endTime);
        if(!(until>from?(minute>=from&&minute<until):(minute>=from||minute<until)))return false;
      }
      if(types.includes('DURATION_BASED')){
        const seconds=elapsed*60;
        if(rule.minDurationSeconds!=null&&seconds+1e-7<rule.minDurationSeconds)return false;
        if(rule.maxDurationSeconds!=null&&seconds>=rule.maxDurationSeconds-1e-7)return false;
      }
      if(types.includes('WEEKDAY_BASED')||types.includes('WEEKEND_BASED')){
        const names=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
        if(!Array.isArray(rule.daysOfWeek)||!rule.daysOfWeek.includes(names[parts.weekday]))return false;
      }
      return true;
    };
    const keys=['energy','chargingMinute','parkingMinute','flat'];
    const selected=(at,elapsed)=>{
      const parts=electroverseLocal(at,timeZone);
      if(!parts)return{reason:'invalid_electroverse_local_time'};
      const minute=parts.minute;
      const active=[];
      for(let i=0;i<rules.length;i++){
        if(ruleMatches(rules[i],parts,minute,elapsed))active.push(i);
      }
      const rates={},indices={};
      for(const key of keys){
        const applicable=active.filter(i=>(rules[i].components||keys).includes(key));
        if(applicable.length){
          const max=Math.max(...applicable.map(i=>(rules[i].types||[]).length));
          const best=applicable.filter(i=>(rules[i].types||[]).length===max);
          if(best.some(i=>rules[i].rates[key]!==rules[best[0]].rates[key]))return{reason:'ambiguous_electroverse_restriction'};
          rates[key]=rules[best[0]].rates[key];indices[key]=best[0];
        }else{
          const fallback=num(pricing.fallbackRates?.[key])??0;
          const everDefined=rules.some(rule=>(rule.components||keys).includes(key));
          if(everDefined&&fallback!==0)return{reason:'no_matching_electroverse_component'};
          rates[key]=everDefined?0:fallback;indices[key]=null;
        }
      }
      return{rates,indices,signature:JSON.stringify(indices)};
    };
    const startMs=start.getTime(),endMs=startMs+duration*60000;
    const totals={energy:0,chargingTime:0,parkingTime:0,connectionFee:0};
    const segments=[];
    const first=selected(start,0);
    if(first.reason)return{complete:false,reason:first.reason,offerId:text(offer?.id),timeZone};
    totals.connectionFee=first.rates.flat;
    let atMs=startMs,iterations=0;
    while(atMs<endMs-0.001){
      if(++iterations>72*60+100)return{complete:false,reason:'electroverse_segmentation_guard',offerId:text(offer?.id),timeZone};
      let next=Math.min(endMs,(Math.floor(atMs/60000)+1)*60000);
      for(const rule of rules)for(const seconds of [rule.minDurationSeconds,rule.maxDurationSeconds]){
        if(seconds==null)continue;const boundary=startMs+seconds*1000;
        if(boundary>atMs+0.001&&boundary<next)next=boundary;
      }
      if(next<=atMs+0.001)return{complete:false,reason:'electroverse_zero_segment',offerId:text(offer?.id),timeZone};
      const a=(atMs-startMs)/60000,b=(next-startMs)/60000,mid=new Date((atMs+next)/2);
      const match=selected(mid,(a+b)/2);
      if(match.reason)return{complete:false,reason:match.reason,offerId:text(offer?.id),timeZone};
      const chargeMinutes=Math.max(0,Math.min(b,charging)-a),parkMinutes=Math.max(0,b-Math.max(a,charging));
      let segmentEnergy=0;
      if(timelineTotal>0){
        for(const step of timeline){const overlap=Math.max(0,Math.min(b,step.start+step.duration)-Math.max(a,step.start));segmentEnergy+=step.energy*overlap/step.duration;}
        segmentEnergy*=energy/timelineTotal;
      }else if(charging>0)segmentEnergy=energy*chargeMinutes/charging;
      const rates=match.rates;
      totals.energy+=segmentEnergy*rates.energy;
      totals.chargingTime+=chargeMinutes*rates.chargingMinute;
      totals.parkingTime+=parkMinutes*rates.parkingMinute;
      const previous=segments[segments.length-1];
      if(previous&&previous.ruleSignature===match.signature){previous.durationMinutes+=b-a;previous.energyKwh+=segmentEnergy;}
      else segments.push({ruleSignature:match.signature,startAt:new Date(atMs).toISOString(),durationMinutes:b-a,energyKwh:segmentEnergy});
      atMs=next;
    }
    if(duration===0&&energy>0)totals.energy=energy*first.rates.energy;
    for(const key of Object.keys(totals))totals[key]=money(totals[key]);
    const total=money(Object.values(totals).reduce((sum,value)=>sum+value,0));
    return{complete:true,totalEur:total,currency:offer.currency||'EUR',offerId:text(offer?.id),timeZone,
      components:{electroverse:totals,segments:segments.map(row=>({...row,durationMinutes:money(row.durationMinutes),energyKwh:money(row.energyKwh)}))},segmented:segments.length>1};
  }

  function evaluateStation(station,session={},options={}){
    const selectedSubscriptions=options.selectedSubscriptions||session.selectedSubscriptions||[];
    const chargingProfile=stationChargingProfile(station),chargingKind=chargingProfile.kind,chargingPowerKw=chargingProfile.powerKw,chargingPlugName=chargingProfile.plugName,chargingConnectorId=chargingProfile.connectorId;
    const compatible=(station?.offers||[]).filter(offer=>offerMatchesChargingKind(offer,chargingKind,chargingPowerKw,chargingPlugName,chargingConnectorId,chargingProfile.evseIds));
    const offers=OfferEngine.eligibleOffers({...station,offers:compatible},selectedSubscriptions,{countryCode:station?.countryCode});
    const targetCurrency=text(options.targetCurrency||session.targetCurrency||'EUR').toUpperCase();
    const fxRates=options.fxRates||session.fxRates||{};
    const effectiveSession=stationSession(station,session,options),km=recoveredKm(session),evaluations=[];

    for(const offer of offers){
      const postChargeMinutes=Math.max(0,num(effectiveSession.postChargeMinutes)??0);
      const unknownPostCharge=offer?.pricing?.postChargeFeeUnknown===true||offer?.metadata?.postChargeFeeUnknown===true;
      const validity=evaluateOfferValidity(offer,effectiveSession);
      const locked=validity.complete?evaluateSessionStartLockedOffer(offer,effectiveSession):null;
      const timeline=validity.complete&&!locked?evaluateTimelineOffer(offer,effectiveSession):null;
      const electroverse=validity.complete?evaluateElectroverseOffer(offer,effectiveSession):null;
      const compactMinute=validity.complete?evaluateCompactMinuteOffer(offer,effectiveSession):null;
      const unverifiedZeroElectra=text(offer?.id).startsWith('electra-platform:')&&offer?.pricing?.type==='rules'&&Array.isArray(offer.pricing.rules)&&offer.pricing.rules.length>0&&offer.pricing.rules.every(rule=>['pricePerKwh','chargePerMinute','idlePerMinute','connectionFee','afterMinutesRate'].every(key=>(num(rule[key])??0)===0));
      const result=validity.complete===false
        ?validity
        :unknownPostCharge&&postChargeMinutes>0
        ?{complete:false,reason:'post_charge_fee_unknown_for_station',offerId:text(offer.id||offer.offerId),postChargeMinutes}
        :unverifiedZeroElectra
        ?{complete:false,reason:'zero_electra_tariff_components_unverified',offerId:text(offer.id||offer.offerId)}
        :(electroverse||compactMinute||locked||timeline||PricingEngine.evaluateOffer(offer,effectiveSession));
      const currency=text(result.currency||offer.currency||'EUR').toUpperCase();
      const rate=result.complete?fxRate(currency,targetCurrency,fxRates):null;
      const comparable=result.complete&&rate!=null;
      const normalizedTotal=comparable?money(result.totalEur*rate):null;
      evaluations.push({
        offerId:text(offer.id||offer.offerId),provider:text(offer.provider),kind:text(offer.kind),subscriptionId:text(offer.subscriptionId),selectionId:text(offer.selectionId)||null,
        priority:num(offer.priority)??0,currency,result,comparable,targetCurrency,
        total:normalizedTotal,costPerRecoveredKm:normalizedTotal!=null&&km?money(normalizedTotal/km):null
      });
    }

    const comparable=evaluations.filter(x=>x.comparable).sort((a,b)=>{
      if(a.total!==b.total)return a.total-b.total;
      if(a.priority!==b.priority)return b.priority-a.priority;
      return `${a.provider}|${a.offerId}`.localeCompare(`${b.provider}|${b.offerId}`);
    });
    const best=comparable[0]||null;
    return{
      stationId:text(station?.id||station?.canonicalId||station?.stationId),chargingKind,chargingPowerKw,chargingPlugName,chargingConnectorId,
      eligibleOfferCount:offers.length,comparableOfferCount:comparable.length,targetCurrency,recoveredKm:km,
      requestedEnergyKwh:effectiveSession.requestedEnergyKwh,approachEnergyKwh:effectiveSession.approachEnergyKwh,billedEnergyKwh:effectiveSession.energyKwh,
      best,
      alternatives:comparable.slice(1),
      incomplete:evaluations.filter(x=>!x.comparable)
    };
  }

  function evaluateArea(stations,session={},options={}){
    const rows=(stations||[]).map(station=>({station,evaluation:evaluateStation(station,session,options)}));
    const sortBy=options.sortBy||'total';
    rows.sort((a,b)=>{
      const av=sortBy==='costPerRecoveredKm'?a.evaluation.best?.costPerRecoveredKm:a.evaluation.best?.total;
      const bv=sortBy==='costPerRecoveredKm'?b.evaluation.best?.costPerRecoveredKm:b.evaluation.best?.total;
      if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;if(av!==bv)return av-bv;
      return a.evaluation.stationId.localeCompare(b.evaluation.stationId);
    });
    return rows;
  }

  return{evaluateStation,evaluateArea,recoveredKm,fxRate,stationSession,evaluateOfferValidity,evaluateSessionStartLockedOffer,evaluateTimelineOffer,evaluateElectroverseOffer,evaluateCompactMinuteOffer,timelineEnergy,stationChargingProfile,stationChargingKind,offerMatchesChargingKind,connectorKind,connectorUsable};
});
