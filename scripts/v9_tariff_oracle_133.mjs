// Independent, deliberately narrow arithmetic oracle. Unsupported semantics
// return null; they never turn into a guessed amount.
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const round=value=>Math.round((value+Number.EPSILON)*1e6)/1e6;
export function simpleOracle(offer,scenario){
  const pricing=offer?.pricing||{};
  if(pricing.postChargeFee||pricing.conditionalSessionFees||pricing.longConnectionFee||pricing.componentGroups||
     pricing.minimumSessionEur!=null||pricing.maximumSessionEur!=null)return null;
  let rule;
  if(pricing.type==='kwh')rule=pricing;
  else if(pricing.type==='rules'&&pricing.rules?.length===1){
    rule=pricing.rules[0];
    if(rule.scope!=='allDay'||(rule.start&&rule.start!=='00:00')||(rule.end&&rule.end!=='24:00')||
       rule.days||rule.daysOfWeek||rule.ocpiDurationBands?.length||rule.powerBands?.length||
       rule.congestionTimePerMinute||rule.afterMinutesRate||rule.connectedTimeFreeMinutes!=null||
       rule.connectedTimeInitialMinutes!=null||rule.energyStepWh||rule.chargingTimeStepSeconds||
       rule.parkingTimeStepSeconds||rule.connectedTimeStepSeconds)return null;
  }else return null;
  const energy=number(scenario.energyKwh),duration=number(scenario.durationMinutes),charging=number(scenario.chargingMinutes),parking=number(scenario.postChargeMinutes);
  if([energy,duration,charging,parking].some(v=>v==null||v<0)||charging>duration||parking>duration)return null;
  const terms={
    energy:energy*(number(rule.pricePerKwh)??0),
    connectedTime:duration*(number(rule.pricePerMinute)??number(rule.connectedTimePerMinuteEur)??0),
    chargingTime:charging*(number(rule.chargePerMinute)??number(rule.chargingTimePerMinuteEur)??0),
    parkingTime:parking*(number(rule.idlePerMinute)??0),
    connectionFee:number(rule.connectionFee)??0,
    sessionFee:number(rule.sessionFeeEur)??0
  };
  if(Object.values(terms).some(v=>v<0))return null;
  return{total:round(Object.values(terms).reduce((a,b)=>a+b,0)),components:terms,currency:offer.currency||rule.currency||'EUR'};
}
