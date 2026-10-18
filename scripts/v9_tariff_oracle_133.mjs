// Independent source-currency tariff oracle for the pinned #133 dual-run.
// It never imports a Production engine. Unknown semantics return a reason.
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const nonnegative=x=>finite(x)&&x>=0;
const money=x=>Math.round((x+Number.EPSILON)*1e6)/1e6;
const fail=reason=>({status:'uncomputable',reason});
const hhmm=value=>{
  if(value==='24:00')return 1440;
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value)))return null;
  const [h,m]=value.split(':').map(Number);return h*60+m;
};
const inWindow=(minute,start,end)=>start===end?false:start<end?minute>=start&&minute<end:minute>=start||minute<end;
const formatters=new Map();
function localParts(instant,zone){
  try{
    if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
    const fields=Object.fromEntries(formatters.get(zone).formatToParts(instant).map(x=>[x.type,x.value]));
    return{minute:Number(fields.hour)*60+Number(fields.minute),date:`${fields.year}-${fields.month}-${fields.day}`,weekday:fields.weekday};
  }catch{return null}
}
// Read the DOT-NL wire row itself. Its positions are fixed by the pinned
// Data Lab compiler: scope, local window, billing, currency, kWh, charging
// minute, one-time FLAT, parking minute, deferred fee, threshold, weekdays,
// OCPI duration bands and billing steps. No Production adapter is imported.
export function independentDotnlCompactOracle(rows,scenario){
  const duration=scenario.durationMinutes,charging=scenario.chargingMinutes,parking=scenario.postChargeMinutes;
  if(!Array.isArray(rows)||!rows.length||!Number.isInteger(duration)||!Number.isInteger(charging)||
     !Number.isInteger(parking)||duration<0||charging<0||parking<0||charging+parking!==duration||
     !nonnegative(scenario.energyKwh))return fail('invalid_dotnl_session_or_rows');
  const start=Date.parse(scenario.startAt||'');if(!Number.isFinite(start))return fail('invalid_start_instant');
  const zone='Europe/Amsterdam',components={energy:0,chargingTime:0,parkingTime:0,flat:0};
  const flatRates=new Set(),currencies=new Set();
  for(let i=0;i<duration;i++){
    const instant=new Date(start+i*60000),local=localParts(instant,zone);
    if(!local)return fail('invalid_dotnl_local_time');
    const day=new Date(local.date+'T12:00:00Z').getUTCDay();
    const matching=rows.filter(r=>Array.isArray(r)&&r.length>=13&&r[0]==='timeWindow'&&
      Array.isArray(r[11])&&r[11].includes(day)&&hhmm(r[1])!=null&&hhmm(r[2])!=null&&
      inWindow(local.minute,hhmm(r[1]),hhmm(r[2])));
    if(matching.length!==1)return fail('dotnl_window_overlap_or_gap');
    const r=matching[0];
    if(r[3]!=='kwh'||r[4]!=='EUR'||![r[5],r[6],r[7],r[8],r[9],r[10]].every(nonnegative)||
       r[9]!==0||r[10]!==0)return fail('unsupported_dotnl_component');
    // A positive band can only be ignored when its start is beyond this
    // entire session; otherwise the duration interpretation needs proof.
    if(!Array.isArray(r[12])||r[12].some(b=>!Array.isArray(b)||b.length<4||
       !nonnegative(b[1])||!nonnegative(b[3])||b[1]<=duration*60&&b[3]>0))
      return fail('dotnl_duration_band_not_proven');
    // The pinned compact uses seconds. A 60-second step is exactly one
    // scenario minute; larger or fractional steps require separate proof.
    if(r[13]&&Object.values(r[13]).some(x=>x!=null&&x!==1&&x!==60))return fail('dotnl_billing_step_not_proven');
    currencies.add(r[4]);flatRates.add(r[7]);
    if(i<charging){components.energy+=scenario.energyKwh/charging*r[5];components.chargingTime+=r[6]}
    else components.parkingTime+=r[8];
  }
  if(currencies.size!==1||flatRates.size!==1)return fail('dotnl_flat_or_currency_changes_within_session');
  components.flat=[...flatRates][0];
  for(const key of Object.keys(components))components[key]=money(components[key]);
  const total=money(Object.values(components).reduce((a,b)=>a+b,0));
  return{status:'priced',total,currency:'EUR',components,...fxResult(total,'EUR',scenario)};
}
export function independentKilowattFreeOracle(connector,stationId,freeStationIds,scenario){
  if(!connector||!Array.isArray(freeStationIds)||!freeStationIds.includes(stationId)||
     connector.active!==true||connector.rate_price!==0||connector.rate_currency!=='MAD'||
     connector.rate_description!=='Free'||!connector.rate_id)
    return fail('kilowatt_free_source_not_exactly_verified');
  const total=0;
  return{status:'priced',total,currency:'MAD',components:{energy:0},
    ...fxResult(total,'MAD',scenario)};
}
// Evaluate only REVE component groups whose meaning is explicit in the pinned
// offer itself. Reservation, duration and time-window rules fail closed.
export function independentComponentGroupsOracle(sourceOffer,scenario){
  const pricing=sourceOffer?.pricing,groups=pricing?.componentGroups;
  if(pricing?.type!=='component_groups'||!Array.isArray(groups)||!groups.length||
     !nonnegative(scenario.energyKwh)||!sourceOffer.currency)return fail('component_groups_source_incomplete');
  if(Object.keys(pricing).some(k=>!['type','componentGroups'].includes(k)))return fail('component_groups_extra_pricing_semantics');
  let energy=null,flat=0;
  for(const group of groups){
    if(!Array.isArray(group.rules)||group.rules.length!==1)return fail('component_groups_multiple_rules');
    const rule=group.rules[0];
    if(group.kind==='ENERGY'){
      if(energy!==null||Object.keys(rule).some(k=>!['pricePerKwh','energyStepWh'].includes(k))||
         !nonnegative(rule.pricePerKwh)||!Number.isInteger(rule.energyStepWh)||rule.energyStepWh<=0)
        return fail('component_groups_energy_semantics_unproved');
      const billedWh=Math.ceil(scenario.energyKwh*1000/rule.energyStepWh)*rule.energyStepWh;
      energy=billedWh/1000*rule.pricePerKwh;
    }else if(group.kind==='FLAT'){
      if(Object.keys(rule).some(k=>k!=='sessionFeeEur')||!nonnegative(rule.sessionFeeEur))
        return fail('component_groups_conditional_flat_unproved');
      flat+=rule.sessionFeeEur;
    }else return fail('component_groups_duration_or_other_unproved');
  }
  if(energy===null)return fail('component_groups_no_energy');
  const components={energy:money(energy),sessionFee:money(flat)};
  const total=money(energy+flat);
  return{status:'priced',total,currency:sourceOffer.currency,components,
    ...fxResult(total,sourceOffer.currency,scenario)};
}
export function independentOcpiEnergyOracle(tariff,scenario){
  const elements=tariff?.elements;
  if(!Array.isArray(elements)||elements.length!==1||elements[0]?.restrictions||
     !Array.isArray(elements[0]?.price_components)||elements[0].price_components.length!==1)
    return fail('ocpi_source_elements_not_unique');
  const c=elements[0].price_components[0];
  if(c.type!=='ENERGY'||!nonnegative(c.price)||c.step_size!==1||c.vat!=null||!tariff.currency||
     !nonnegative(scenario.energyKwh))return fail('ocpi_energy_or_tax_semantics_unproved');
  const total=money(scenario.energyKwh*c.price);
  return{status:'priced',total,currency:tariff.currency,components:{energy:total},
    ...fxResult(total,tariff.currency,scenario)};
}
function ruleAt(rules,instant,zone){
  const local=localParts(instant,zone);if(!local)return{error:'invalid_source_time_zone'};
  const matches=rules.filter(rule=>{
    if(rule.days?.length)return false;
    if(rule.scope==='allDay')return true;
    if(rule.scope!=='timeWindow')return false;
    const start=hhmm(rule.start),end=hhmm(rule.end);
    return start!=null&&end!=null&&inWindow(local.minute,start,end);
  });
  return matches.length===1?{rule:matches[0],local}:{error:matches.length?'overlapping_time_rules':'missing_time_rule'};
}
function value(rule,primary,alias){
  const a=rule[primary],b=alias?rule[alias]:undefined;
  if(a!=null&&b!=null&&a!==b&&a!==0&&b!==0)return null;
  return a&&a!==0?a:b??a??0;
}
function oneTime(rules,field){
  const vals=[...new Set(rules.map(r=>r[field]??0))];return vals.length===1?vals[0]:null;
}
function fxResult(total,currency,scenario){
  const target=scenario.targetCurrency||currency;
  if(currency===target)return{convertedTotal:total,fxStatus:'same_currency',targetCurrency:target,fxAsOf:null};
  const proof=scenario.fxEvidence;
  if(!proof||!/^\d{4}-\d{2}-\d{2}$/.test(proof.date)||
     !/^[a-f0-9]{64}$/.test(proof.sourceSha256||'')||proof.base!=='EUR'||
     !nonnegative(proof.rates?.[currency])||!nonnegative(proof.rates?.[target])||
     proof.rates[currency]===0||proof.rates[target]===0)
    return{convertedTotal:null,fxStatus:'missing_verified_dated_rate',targetCurrency:target,fxAsOf:null};
  return{convertedTotal:money(total/proof.rates[currency]*proof.rates[target]),fxStatus:'verified_dated_rate',
         targetCurrency:target,fxAsOf:proof.date,fxSourceSha256:proof.sourceSha256};
}
function feeAfterMinutes(rule,scenario,elapsed,local,zone){
  const rate=rule.afterMinutesRate??0;if(rate===0)return{cost:0};
  const component=rule.afterMinutesComponent;
  if(!['CONNECTED_TIME','TIME','PARKING_TIME'].includes(component))return{error:'after_minutes_component_unverified'};
  const threshold=rule.afterMinutesThreshold;
  if(!nonnegative(threshold))return{error:'after_minutes_threshold_unverified'};
  const minuteInComponent=component==='CONNECTED_TIME'?elapsed:
    component==='TIME'?elapsed<scenario.chargingMinutes?elapsed:null:
    elapsed>=scenario.chargingMinutes&&elapsed<scenario.chargingMinutes+scenario.postChargeMinutes?
      elapsed-scenario.chargingMinutes:null;
  if(minuteInComponent==null||minuteInComponent<threshold)return{cost:0};
  if(rule.afterMinutesCap>0){
    if(rule.afterMinutesCapMode!=='night_window_local_per_night')return{error:'after_minutes_cap_mode_unverified'};
    if(!zone)return{error:'after_minutes_cap_time_zone_missing'};
    const start=hhmm(rule.afterMinutesCapStart),end=hhmm(rule.afterMinutesCapEnd);
    if(start==null||end==null)return{error:'after_minutes_cap_window_missing'};
    if(inWindow(local.minute,start,end)){
      // A post-midnight minute belongs to the preceding evening's cap.
      const anchor=local.minute<end&&start>end?
        new Date(new Date(local.date+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10):local.date;
      return{cost:rate,capKey:anchor,cap:rule.afterMinutesCap};
    }
  }
  return{cost:rate};
}
function postChargeFee(pricing,scenario,zone,startMs){
  const fee=pricing.postChargeFee;if(!fee)return{cost:0};
  const grace=fee.graceMinutes??0,minutes=scenario.postChargeMinutes;
  if(!nonnegative(grace)||!nonnegative(minutes))return{error:'invalid_post_charge_duration'};
  if(fee.rounding==='started_block'){
    if(!nonnegative(fee.blockMinutes)||fee.blockMinutes===0||!nonnegative(fee.blockEur)||
       fee.exemptLocalWindows?.length||fee.localRateWindows?.length)return{error:'post_charge_block_semantics_unknown'};
    return{cost:money(Math.ceil(Math.max(0,minutes-grace)/fee.blockMinutes)*fee.blockEur)};
  }
  let cost=0;
  for(let i=Math.floor(grace);i<minutes;i++){
    const local=localParts(new Date(startMs+(scenario.chargingMinutes+i)*60000),zone);
    if(!local)return{error:'post_charge_time_zone_missing'};
    const exempt=(fee.exemptLocalWindows||[]).some(w=>{
      const a=hhmm(w.start),b=hhmm(w.end);return a!=null&&b!=null&&inWindow(local.minute,a,b);
    });
    if(exempt)continue;
    if(Array.isArray(fee.localRateWindows)){
      const matching=fee.localRateWindows.filter(w=>{
        const a=hhmm(w.start),b=hhmm(w.end);return a!=null&&b!=null&&inWindow(local.minute,a,b);
      });
      if(matching.length!==1||!nonnegative(matching[0].eurPerMinute))return{error:'post_charge_rate_window_ambiguous'};
      cost+=matching[0].eurPerMinute;
    }else if(nonnegative(fee.eurPerMinute))cost+=fee.eurPerMinute;
    else return{error:'post_charge_fee_semantics_unknown'};
  }
  return{cost:money(cost)};
}
export function independentOracle(offer,scenario,context={}){
  let pricing=offer?.pricing||{};
  if((offer?.subscriptionId||offer?.kind==='subscription')&&scenario.selectedSubscriptionId!==offer.subscriptionId)
    return{status:'ineligible',reason:'subscription_not_selected'};
  if(pricing.postChargeFeeUnknown&&scenario.postChargeMinutes>0)
    return fail('unknown_station_specific_post_charge_fee');
  const duration=scenario.durationMinutes,charging=scenario.chargingMinutes,parking=scenario.postChargeMinutes,energy=scenario.energyKwh;
  if(![duration,charging,parking,energy].every(nonnegative)||!Number.isInteger(duration)||duration>10080||
     !Number.isInteger(charging)||!Number.isInteger(parking)||charging+parking>duration||(energy>0&&charging===0))
    return fail('invalid_or_missing_session_timeline');
  if(pricing.type==='connected_kerb_midhope_guest_verified'){
    if(!offer.connectorIds?.includes(context.connectorId))return fail('midhope_exact_connector_required');
    const start=Date.parse(scenario.startAt||'');if(!Number.isFinite(start))return fail('invalid_start_instant');
    const zone='Europe/London',first=localParts(new Date(start),zone);
    if(!first||first.date<'2026-10-10')return fail('midhope_before_observed_tariff');
    if(![pricing.energyPerKwhGbp,pricing.parkingPerStarted30minGbp,pricing.idleSupplementPerMinuteGbp].every(nonnegative))
      return fail('midhope_source_component_missing');
    const paidByDate=new Map();
    for(let i=0;i<duration;i++){
      const local=localParts(new Date(start+i*60000),zone);
      if(!['Sun'].includes(local.weekday)&&local.minute>=510&&local.minute<1080)
        paidByDate.set(local.date,(paidByDate.get(local.date)||0)+1);
    }
    const components={energy:money(energy*pricing.energyPerKwhGbp),
      parkingTime:money([...paidByDate.values()].reduce((sum,minutes)=>sum+Math.ceil(minutes/30)*pricing.parkingPerStarted30minGbp,0)),
      idleSupplement:money(parking*pricing.idleSupplementPerMinuteGbp)};
    const total=money(Object.values(components).reduce((a,b)=>a+b,0));
    return{status:'priced',total,currency:'GBP',components,...fxResult(total,'GBP',scenario)};
  }
  if(offer.metadata?.source==='Electra eMSP GraphQL'&&offer.metadata?.cpo==='Electra'&&
     offer.metadata?.verifiedScope==='exact_evse'){
    if(pricing.priceSelectionBasis!=='session_start_local_time'||
       pricing.tariffStartLockEvidence!=='electra_official_2026-10-10'||
       offer.currency!=='EUR'||!Array.isArray(offer.evseIds)||offer.evseIds.length!==1)
      return fail('electra_source_contract_unverified');
    if(scenario.includeCongestionFees!==false)return fail('electra_saturation_or_soc_unverified');
    const start=Date.parse(scenario.startAt||''),local=localParts(new Date(start),'Europe/Paris');
    if(!Number.isFinite(start)||!local)return fail('electra_invalid_start_time');
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(local.weekday);
    const matches=pricing.rules?.filter(r=>r.scope==='timeWindow'&&r.days?.includes(day)&&
      hhmm(r.start)!=null&&hhmm(r.end)!=null&&hhmm(r.start)<hhmm(r.end)&&
      inWindow(local.minute,hhmm(r.start),hhmm(r.end)))||[];
    if(matches.length!==1)return fail('electra_start_window_not_unique');
    const rule=matches[0];
    if(!nonnegative(rule.pricePerKwh)||[rule.chargePerMinute,rule.connectionFee,rule.idlePerMinute,
       rule.afterMinutesRate,rule.congestionTimePerMinute].some(x=>x!=null&&x!==0)||
       rule.ocpiDurationBands?.length||rule.ocpiCongestionDurationBands?.length)
      return fail('electra_additional_component_unverified');
    const total=money(energy*rule.pricePerKwh);
    return{status:'priced',total,currency:'EUR',components:{energy:total},
      priceSelectionBasis:'session_start_local_time',...fxResult(total,'EUR',scenario)};
  }
  if(pricing.type==='ocpi'){
    const tariff=pricing.tariff;
    const elements=tariff?.elements;
    if(!Array.isArray(elements)||elements.length!==1||elements[0].restrictions||
       !Array.isArray(elements[0].price_components)||elements[0].price_components.length!==1)
      return fail('unsupported_ocpi_components');
    const component=elements[0].price_components[0];
    if(component.type!=='ENERGY'||!nonnegative(component.price)||component.step_size!==1)
      return fail('unsupported_ocpi_component_semantics');
    pricing={type:'rules',timeZone:pricing.timeZone,rules:[{scope:'allDay',currency:tariff.currency,
      pricePerKwh:component.price}]};
  }
  if(pricing.type!=='rules'&&pricing.type!=='kwh')return fail('unsupported_pricing_type');
  const rules=pricing.type==='kwh'?[{scope:'allDay',pricePerKwh:pricing.pricePerKwh,currency:offer.currency}]:pricing.rules;
  if(!Array.isArray(rules)||!rules.length)return fail('missing_rules');
  if(pricing.componentGroups||pricing.longConnectionFee||pricing.conditionalSessionFees)return fail('unsupported_composite_pricing');
  const unsupported=['ocpiDurationBands','energyStepWh','chargingTimeStepSeconds','parkingTimeStepSeconds',
    'connectedTimeStepSeconds','connectedTimeBlockMinutes','connectedTimeBlockEur',
    'connectedTimeInitialMinutes','ocpiCongestionDurationBands','congestionTimeStepSeconds'];
  for(const rule of rules){
    if(rule.days?.length||rule.holidayOnly||rule.excludeHolidays||rule.mustEndSameLocalDay)return fail('unsupported_calendar_restriction');
    if(unsupported.some(key=>Array.isArray(rule[key])?rule[key].length:!!rule[key]))return fail('unsupported_rule_dimension');
    if(rule.connectedTimeFreeMinutes!=null){
      if(!nonnegative(rule.connectedTimeFreeMinutes)||
         !nonnegative(rule.connectedTimePerMinuteAfterFreeEur)||
         (duration>rule.connectedTimeFreeMinutes&&rule.connectedTimePerMinuteAfterFreeEur>0))
        return fail('connected_time_after_free_boundary_unproved');
    }
    if(rule.scope!=='allDay'&&rule.scope!=='timeWindow')return fail('unsupported_rule_scope');
    if(rule.scope==='timeWindow'&&(hhmm(rule.start)==null||hhmm(rule.end)==null))return fail('invalid_time_window');
    for(const key of ['pricePerKwh','pricePerMinute','connectedTimePerMinuteEur','chargePerMinute',
      'chargingTimePerMinuteEur','idlePerMinute','parkingPerMinute','connectionFee','sessionFeeEur','afterMinutesRate',
      'congestionTimePerMinute'])if(rule[key]!=null&&!nonnegative(rule[key]))return fail('invalid_'+key);
    if(rule.afterMinutesRate>0&&!['CONNECTED_TIME','TIME','PARKING_TIME'].includes(rule.afterMinutesComponent))
      return fail('after_minutes_component_unverified');
  }
  const currencies=[...new Set(rules.map(r=>r.currency||offer.currency).filter(Boolean))];
  if(currencies.length!==1)return fail('mixed_or_missing_source_currency');
  const currency=currencies[0];
  const allDayTimeIndependent=rules.every(r=>r.scope==='allDay'&&!r.days?.length&&!r.daysOfWeek?.length&&
    !r.holidayOnly&&!r.excludeHolidays&&!r.mustEndSameLocalDay&&!r.afterMinutesCap&&
    !(r.congestionTimePerMinute>0)&&r.billing!=='powerMinute'&&!r.powerBands?.length)&&!pricing.postChargeFee;
  const zone=pricing.timeZone||offer.metadata?.timeZone||scenario.stationTimeZone||
    (allDayTimeIndependent?'UTC':null);
  if(!zone)return fail('missing_tariff_time_zone');
  const startMs=Date.parse(scenario.startAt||'');if(!Number.isFinite(startMs))return fail('invalid_start_instant');
  const fixed=oneTime(rules,'connectionFee'),sessionFee=oneTime(rules,'sessionFeeEur');
  if(fixed==null||sessionFee==null)return fail('time_varying_fixed_fee_semantics_unknown');
  const components={energy:0,connectedTime:0,chargingTime:0,parkingTime:0,afterMinutes:0,
                    connectionFee:fixed,sessionFee:sessionFee,congestion:0,postChargeFee:0};
  const caps=new Map();
  const roundedEnergyRates=[];
  for(let i=0;i<duration;i++){
    const selected=ruleAt(rules,new Date(startMs+i*60000),zone);
    if(selected.error)return fail(selected.error);
    const {rule,local}=selected;
    const connected=value(rule,'pricePerMinute','connectedTimePerMinuteEur');
    const charge=value(rule,'chargePerMinute','chargingTimePerMinuteEur');
    if(connected==null||charge==null)return fail('conflicting_minute_rate_aliases');
    let powerRate=0;
    if(rule.billing==='powerMinute'||rule.powerBands?.length){
      if(!nonnegative(context.powerKw))return fail('power_band_connector_power_missing');
      const matches=(rule.powerBands||[]).filter(b=>context.powerKw>=b.minKw&&context.powerKw<b.maxKw);
      if(matches.length!==1||!nonnegative(matches[0].ratePerMinute))return fail('power_band_ambiguous');
      powerRate=matches[0].ratePerMinute;
    }
    if(i<charging){
      if(rule.energyRounding==='started_kwh')roundedEnergyRates.push(rule.pricePerKwh);
      else if(rule.energyRounding)return fail('energy_rounding_unknown');
      else components.energy+=energy/charging*(rule.pricePerKwh??0);
      components.chargingTime+=charge+powerRate;
    }
    components.connectedTime+=connected;
    const parkingRate=value(rule,'idlePerMinute','parkingPerMinute');
    if(parkingRate==null)return fail('conflicting_parking_rates');
    if(i>=charging&&i<charging+parking)components.parkingTime+=parkingRate;
    const after=feeAfterMinutes(rule,scenario,i,local,zone);
    if(after.error)return fail(after.error);
    if(after.capKey){
      const used=caps.get(after.capKey)||0;
      const accepted=Math.max(0,Math.min(after.cost,after.cap-used));
      caps.set(after.capKey,used+accepted);components.afterMinutes+=accepted;
    }else components.afterMinutes+=after.cost;
    const congestion=rule.congestionTimePerMinute??0;
    if(congestion>0&&scenario.includeCongestionFees!==false){
      if(offer.connectorIds?.length&&context.connectorId&&!offer.connectorIds.includes(context.connectorId))
        return fail('congestion_connector_scope_mismatch');
      if(scenario.congestionOffBy?.includes(`${offer.id}|${context.connectorId}`))continue;
      if(!scenario.linearSocVerified||!nonnegative(scenario.startSoc)||!nonnegative(scenario.targetSoc)||
         !nonnegative(scenario.batteryCapacityKwh)||scenario.batteryCapacityKwh===0||charging===0)
        return fail('congestion_soc_timeline_unverified');
      const threshold=rule.congestionStartSoc??80;
      const soc=i<charging?scenario.startSoc+(scenario.targetSoc-scenario.startSoc)*(i+.5)/charging:scenario.targetSoc;
      if(soc>=threshold&&(i<charging||i<charging+parking))components.congestion+=congestion;
    }
  }
  const post=postChargeFee(pricing,scenario,zone,startMs);
  if(post.error)return fail(post.error);
  components.postChargeFee=post.cost;
  if(roundedEnergyRates.length){
    if(roundedEnergyRates.length!==charging||new Set(roundedEnergyRates).size!==1||
       !nonnegative(roundedEnergyRates[0]))return fail('energy_rounding_across_rates_unknown');
    components.energy=Math.ceil(energy)*roundedEnergyRates[0];
  }
  let total=Object.values(components).reduce((a,b)=>a+b,0);
  const minimum=pricing.minimumTotalEur??(rules.some(r=>r.minimumSessionEur!=null)?oneTime(rules,'minimumSessionEur'):null);
  const maximum=pricing.maximumTotalEur??(rules.some(r=>r.maximumSessionEur!=null)?oneTime(rules,'maximumSessionEur'):null);
  if(minimum!=null){if(!nonnegative(minimum))return fail('invalid_minimum');components.minimumTopUp=Math.max(0,minimum-total);total=Math.max(total,minimum)}
  if(maximum!=null){if(!nonnegative(maximum)||maximum<(minimum??0))return fail('invalid_maximum');components.maximumReduction=Math.max(0,total-maximum);total=Math.min(total,maximum)}
  for(const key of Object.keys(components))components[key]=money(components[key]);
  total=money(total);
  return{status:'priced',total,currency,components,...fxResult(total,currency,scenario)};
}

// Compatibility for phase-1 consumers; only proved results are returned.
export function simpleOracle(offer,scenario){
  const result=independentOracle(offer,{...scenario,startAt:scenario.startAt||'2026-10-15T12:00:00Z',
    stationTimeZone:scenario.stationTimeZone||'UTC'});
  return result.status==='priced'?{total:result.total,components:result.components,currency:result.currency}:null;
}
