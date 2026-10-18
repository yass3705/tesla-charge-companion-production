// Independent source-byte oracle for four exact Midhope guest connectors.
// It does not import either Production pricing engine or the Phase 2 oracle.
const money=n=>Math.round((n+Number.EPSILON)*1e6)/1e6;
const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',
  weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const local=instant=>{
  const p=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(x=>[x.type,x.value]));
  return{date:`${p.year}-${p.month}-${p.day}`,weekday:p.weekday,minute:Number(p.hour)*60+Number(p.minute)};
};
export function midhopeSourceOracle(offer,connectorId,session,fxEvidence){
  const pricing=offer?.pricing||{};
  const allowedPricing=['type','verifiedSourceVersion','includesVat','energyPerKwhGbp',
    'parkingPerStarted30minGbp','idleSupplementPerMinuteGbp'];
  if(offer?.connectorIds?.length!==1||offer.connectorIds[0]!==connectorId||
    offer.currency!=='GBP'||offer.directOperatorOnly!==true||
    pricing.type!=='connected_kerb_midhope_guest_verified'||pricing.includesVat!==true||
    Object.keys(pricing).some(key=>!allowedPricing.includes(key))||
    offer.subscriptionId!=null||offer.kind==='subscription'||
    offer.metadata?.pricingTimeZone!=='Europe/London'||
    offer.metadata?.feeRateScope!=='parked occupancy, no charging/idle double billing')
    return{status:'uncomputable',reason:'source_scope_or_semantics_unproved'};
  if(![pricing.energyPerKwhGbp,pricing.parkingPerStarted30minGbp,pricing.idleSupplementPerMinuteGbp]
    .every(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0))
    return{status:'uncomputable',reason:'source_rate_missing'};
  const start=Date.parse(session.startAt||'');
  if(!Number.isFinite(start)||!Number.isInteger(session.durationMinutes)||
    !Number.isInteger(session.chargingMinutes)||!Number.isInteger(session.postChargeMinutes)||
    session.durationMinutes<0||session.chargingMinutes<0||session.postChargeMinutes<0||
    session.durationMinutes!==session.chargingMinutes+session.postChargeMinutes||
    !Number.isFinite(session.energyKwh)||session.energyKwh<0||
    (session.energyKwh>0&&session.chargingMinutes===0))
    return{status:'uncomputable',reason:'invalid_session_timeline'};
  if(local(start).date<offer.validFrom)return{status:'uncomputable',reason:'before_observed_tariff'};
  const paid=new Map();
  for(let minute=0;minute<session.durationMinutes;minute++){
    const at=local(start+minute*60000);
    if(at.weekday!=='Sun'&&at.minute>=8*60+30&&at.minute<18*60)
      paid.set(at.date,(paid.get(at.date)||0)+1);
  }
  const energy=money(session.energyKwh*pricing.energyPerKwhGbp);
  const parkingTime=money([...paid.values()].reduce((n,minutes)=>n+Math.ceil(minutes/30)*pricing.parkingPerStarted30minGbp,0));
  const idleSupplement=money(session.postChargeMinutes*pricing.idleSupplementPerMinuteGbp);
  const total=money(energy+parkingTime+idleSupplement);
  const components={energy,parkingTime,idleSupplement};
  if(session.targetCurrency==='GBP')return{status:'priced',total,currency:'GBP',components,
    targetTotal:total,fxStatus:'same_currency',fxAsOf:null};
  if(session.targetCurrency==='EUR'&&fxEvidence?.date===local(start).date&&
    fxEvidence.base==='EUR'&&Number.isFinite(fxEvidence.rates?.GBP)&&fxEvidence.rates.GBP>0)
    return{status:'priced',total,currency:'GBP',components,
      targetTotal:money(total/fxEvidence.rates.GBP),fxStatus:'verified_dated_rate',fxAsOf:fxEvidence.date};
  return{status:'priced',total,currency:'GBP',components,targetTotal:null,
    fxStatus:'missing_dated_rate',fxAsOf:null};
}
export function chEdhPinnedOracle(offer,evseId,session){
  const rules=offer?.pricing?.rules;
  const allowedRule=['scope','pricePerKwh','connectedTimeFreeMinutes','connectedTimePerMinuteAfterFreeEur'];
  if(offer?.countries?.length!==1||offer.countries[0]!=='CH'||
    offer.currency!=='EUR'||offer.evseIds?.length!==1||offer.evseIds[0]!==evseId||
    offer.pricing?.type!=='rules'||rules?.length!==1||rules[0].scope!=='allDay'||
    Object.keys(offer.pricing).some(key=>!['type','rules'].includes(key))||
    Object.keys(rules[0]).some(key=>!allowedRule.includes(key))||
    offer.subscriptionId!=null||offer.kind==='subscription'||
    offer.connectorKinds?.join(',')!=='AC'||offer.minPowerKw!==21.99||offer.maxPowerKw!==22.01)
    return{status:'uncomputable',reason:'ch_edh_scope_or_rule_unproved'};
  const rule=rules[0];
  if(!Number.isFinite(rule.pricePerKwh)||!Number.isFinite(rule.connectedTimeFreeMinutes)||
    !Number.isFinite(rule.connectedTimePerMinuteAfterFreeEur)||
    !Number.isInteger(session.durationMinutes)||session.durationMinutes<0||
    !Number.isFinite(session.energyKwh)||session.energyKwh<0)
    return{status:'uncomputable',reason:'ch_edh_input_unproved'};
  const energy=money(session.energyKwh*rule.pricePerKwh);
  const connectedTime=money(Math.max(0,session.durationMinutes-rule.connectedTimeFreeMinutes)*
    rule.connectedTimePerMinuteAfterFreeEur);
  return{status:'priced',total:money(energy+connectedTime),currency:'EUR',
    components:{energy,connectedTime}};
}
