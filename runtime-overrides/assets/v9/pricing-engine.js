(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9PricingEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const money=v=>Math.round((Number(v)+Number.EPSILON)*1000000)/1000000;
  function minuteOfDay(value,timeZone){
    if(typeof value==='number'&&Number.isFinite(value))return ((Math.floor(value)%1440)+1440)%1440;
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return null;
    if(timeZone){
      try{
        const parts=new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d);
        const get=t=>Number(parts.find(p=>p.type===t)?.value||0);
        return get('hour')*60+get('minute')+get('second')/60;
      }catch(_){return null;}
    }
    return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;
  }
  function localDateParts(value,timeZone){
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return null;
    try{
      if(timeZone){
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(d);
        const get=t=>parts.find(p=>p.type===t)?.value;
        const weekdays={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
        const weekday=weekdays[get('weekday')];
        const year=Number(get('year')),month=Number(get('month')),day=Number(get('day'));
        if(!Number.isFinite(year)||!Number.isFinite(month)||!Number.isFinite(day)||weekday==null)return null;
        return{year,month,day,weekday,key:`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
      }
      return{year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate(),weekday:d.getDay(),key:`${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
    }catch(_){return null;}
  }
  function easterSundayUtc(year){
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return new Date(Date.UTC(year,month-1,day));
  }
  function italianHolidayKeys(year){
    const fixed=['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].map(md=>`${year}-${md}`);
    const easter=easterSundayUtc(year),monday=new Date(easter.getTime()+86400000);
    fixed.push(`${monday.getUTCFullYear()}-${String(monday.getUTCMonth()+1).padStart(2,'0')}-${String(monday.getUTCDate()).padStart(2,'0')}`);
    return new Set(fixed);
  }
  function isHoliday(calendar,value,timeZone){
    if(!calendar)return false;const p=localDateParts(value,timeZone);if(!p)return null;
    if(String(calendar).toUpperCase()==='IT')return italianHolidayKeys(p.year).has(p.key);
    return false;
  }
  function hm(v,fallback){
    if(!v)return fallback;const m=String(v).match(/^(\d{1,2}):(\d{2})$/);if(!m)return fallback;
    const h=Number(m[1]),min=Number(m[2]);if(h===24&&min===0)return 1440;if(h>23||min>59)return fallback;return h*60+min;
  }
  function ruleContains(rule,minute){
    if(rule?.scope==='allDay')return true;
    const start=hm(rule?.start??rule?.startTime,0),end=hm(rule?.end??rule?.endTime,1440);
    if(start===end)return true;
    if(end>start)return minute>=start&&minute<end;
    return minute>=start||minute<end;
  }
  function ruleThresholdStatus(rule,session={},timeZone=null){
    const energy=num(session.energyKwh),power=num(session.powerKw),soc=num(session.vehicleSoc),congestion=num(session.congestionPct),duration=num(session.durationMinutes);
    const bound=(v,min,max)=>{if(min==null&&max==null)return'match';if(v==null)return'unknown';if(min!=null&&v<Number(min))return'no_match';if(max!=null&&v>Number(max))return'no_match';return'match';};
    for(const [v,min,max] of [[energy,rule?.minEnergyKwh,rule?.maxEnergyKwh],[power,rule?.minPowerKw,rule?.maxPowerKw],[duration,rule?.minDurationMinutes,rule?.maxDurationMinutes],[soc,rule?.minVehicleSoc,rule?.maxVehicleSoc],[congestion,rule?.minCongestionPct,rule?.maxCongestionPct]]){const s=bound(v,min,max);if(s!=='match')return s;}
    const reservation=rule?.reservationState;if(reservation!=null){const actual=String(session.reservationState||'').toUpperCase();if(!actual)return'no_match';if(actual!==String(reservation).toUpperCase())return'no_match';}
    const startDate=rule?.validFromDate,endDate=rule?.validThroughDate;if(startDate!=null||endDate!=null){const parts=localDateParts(session.startAt,timeZone||session.timeZone||null);if(!parts)return'unknown';if(startDate!=null&&parts.key<String(startDate))return'no_match';if(endDate!=null&&parts.key>String(endDate))return'no_match';}
    return'match';
  }
  function ruleThresholdMatches(rule,session={},timeZone=null){return ruleThresholdStatus(rule,session,timeZone)==='match';}
  function ruleDayMatches(rule,startAt,timeZone,pricing){
    const rawDays=Array.isArray(rule?.daysOfWeek)?rule.daysOfWeek:rule?.days;const names={SUN:0,MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6};const days=Array.isArray(rawDays)?rawDays.map(value=>names[String(value).slice(0,3).toUpperCase()]??Number(value)).filter(n=>Number.isInteger(n)&&n>=0&&n<=6):null;
    const constrained=Boolean(days?.length||rule?.holidayOnly===true||rule?.excludeHolidays===true);
    if(!constrained)return true;
    if(!startAt)return false;
    const parts=localDateParts(startAt,timeZone);if(!parts)return false;
    const holiday=isHoliday(pricing?.holidayCalendar,startAt,timeZone);
    if(rule?.holidayOnly===true&&holiday!==true)return false;
    if(rule?.excludeHolidays===true&&holiday===true)return false;
    if(days?.length&&!days.includes(parts.weekday))return false;
    return true;
  }
  function matchingRuleDetailed(pricing,startAt,timeZone,session={}){
    const rules=Array.isArray(pricing?.rules)?pricing.rules:[];if(!rules.length)return{rule:null,unknown:false};
    const minute=minuteOfDay(startAt,timeZone);
    const powerWidth=rule=>{const min=num(rule?.minPowerKw)??0,max=num(rule?.maxPowerKw);return max==null?Infinity:Math.max(0,max-min);};
    const ordered=[...rules.filter(rule=>rule.scope!=='allDay'),...rules.filter(rule=>rule.scope==='allDay')].sort((a,b)=>{
      if((a.scope==='allDay')!==(b.scope==='allDay'))return a.scope==='allDay'?1:-1;
      const width=powerWidth(a)-powerWidth(b);if(!Number.isNaN(width)&&width!==0)return width;
      const ad=(a.daysOfWeek||a.days||[]).length||7,bd=(b.daysOfWeek||b.days||[]).length||7;
      return ad-bd;
    });
    for(const rule of ordered){if(minute==null&&rule.scope!=='allDay')continue;if(!ruleDayMatches(rule,startAt,timeZone,pricing))continue;if(minute!=null&&!ruleContains(rule,minute))continue;const status=ruleThresholdStatus(rule,session,timeZone);if(status==='unknown')return{rule:null,unknown:true,reason:'missing_rule_context'};if(status==='match')return{rule,unknown:false};}
    return{rule:null,unknown:false};
  }
  function matchingRule(pricing,startAt,timeZone,session={}){return matchingRuleDetailed(pricing,startAt,timeZone,session).rule;}

  function minutesUntilRuleBoundary(rule,startAt,timeZone,pricing=null){
    if(!rule)return Infinity;
    const minute=minuteOfDay(startAt,timeZone);if(minute==null)return null;
    let delta=Infinity;
    if(rule.scope!=='allDay'){
      const end=hm(rule.end??rule.endTime,1440);delta=end-minute;if(delta<=0)delta+=1440;
    }
    const daySensitive=(Array.isArray(rule?.daysOfWeek)&&rule.daysOfWeek.length)||(Array.isArray(rule?.days)&&rule.days.length)||rule?.holidayOnly===true||rule?.excludeHolidays===true||rule?.mustEndSameLocalDay===true;
    if(daySensitive)delta=Math.min(delta,1440-minute);
    for(const candidate of pricing?.rules||[]){
      if(candidate?.scope==='allDay')continue;
      const begins=hm(candidate?.start??candidate?.startTime,null);if(begins==null)continue;
      const until=(begins-minute+1440)%1440;
      if(until>1e-9)delta=Math.min(delta,until);
    }
    return delta;
  }
  function evaluateRule(rule,{energyKwh=0,durationMinutes=0,chargingMinutes=null}={}){
    const energy=Math.max(0,num(energyKwh)??0),duration=Math.max(0,num(durationMinutes)??0),charging=Math.max(0,Math.min(duration,num(chargingMinutes)??duration)),components={};let total=0;
    const perKwh=num(rule?.pricePerKwh);
    if(perKwh!=null){
      const stepWh=num(rule?.energyStepWh);const billedEnergy=stepWh>0&&energy>0?Math.ceil((energy*1000)/stepWh)*stepWh/1000:rule?.energyRounding==='started_kwh'&&energy>0?Math.ceil(energy):energy;
      components.energy=money(billedEnergy*perKwh);total+=components.energy;
      if(billedEnergy!==energy)components.energyBilling={actualKwh:energy,billedKwh:billedEnergy,rounding:stepWh>0?'started_step':'started_kwh',stepWh:stepWh>0?stepWh:undefined};
    }
    const blockMinutes=num(rule?.connectedTimeBlockMinutes),blockEur=num(rule?.connectedTimeBlockEur);
    if(blockMinutes>0&&blockEur!=null){
      const blocks=rule?.connectedTimeBlockRounding==='started_block'?Math.ceil(duration/blockMinutes):duration/blockMinutes;
      components.connectedTimeBlocks={blocks,blockMinutes,unitPriceEur:blockEur,costEur:money(blocks*blockEur)};total+=components.connectedTimeBlocks.costEur;
    }
    const genericPerMinute=num(rule?.pricePerMinute),legacyPerMinute=num(rule?.connectedTimePerMinuteEur),perMinute=genericPerMinute??legacyPerMinute;
    if(perMinute!=null){const step=num(rule?.connectedTimeStepSeconds),billed=step>0&&duration>0?Math.ceil(duration*60/step)*step/60:duration;components.connectedTimePerMinute=money(billed*perMinute);total+=components.connectedTimePerMinute;if(billed!==duration)components.connectedTimeBilling={actualMinutes:duration,billedMinutes:billed,stepSeconds:step};}
    const chargingPerMinute=num(rule?.chargingTimePerMinuteEur);if(chargingPerMinute!=null){const step=num(rule?.chargingTimeStepSeconds),billed=step>0&&charging>0?Math.ceil(charging*60/step)*step/60:charging;components.chargingTime=money(billed*chargingPerMinute);total+=components.chargingTime;if(billed!==charging)components.chargingTimeBilling={actualMinutes:charging,billedMinutes:billed,stepSeconds:step};}
    const freeMinutes=num(rule?.connectedTimeFreeMinutes),afterFree=num(rule?.connectedTimePerMinuteAfterFreeEur);
    if(freeMinutes!=null&&freeMinutes>=0&&afterFree!=null){
      const billableMinutes=Math.max(0,duration-freeMinutes),costEur=money(billableMinutes*afterFree);
      components.connectedTimeAfterFree={freeMinutes,billableMinutes,eurPerMinute:afterFree,costEur};total+=costEur;
    }
    const initialMinutes=num(rule?.connectedTimeInitialMinutes),initialFlat=num(rule?.connectedTimeInitialFlatEur),afterInitial=num(rule?.connectedTimeAfterInitialPerMinuteEur);
    if(initialMinutes>0&&initialFlat!=null&&afterInitial!=null&&duration>0){
      const excessMinutes=Math.max(0,duration-initialMinutes),costEur=money(initialFlat+excessMinutes*afterInitial);
      components.connectedTimeInitialTier={initialMinutes,initialFlatEur:initialFlat,excessMinutes,eurPerMinuteAfterInitial:afterInitial,costEur};total+=costEur;
    }
    const fixed=num(rule?.connectedTimeComponentEur);if(fixed!=null&&fixed!==0){components.connectedTimeComponent=money(fixed);total+=components.connectedTimeComponent;}
    const sessionFee=num(rule?.sessionFeeEur);if(sessionFee!=null&&sessionFee!==0){components.sessionFee=money(sessionFee);total+=components.sessionFee;}
    const minimum=num(rule?.minimumSessionEur);if(minimum!=null&&total<minimum){components.minimumSession={minimumEur:minimum,preMinimumTotalEur:money(total),topUpEur:money(minimum-total)};total=minimum;}
    return{totalEur:money(total),components};
  }
  function segmentableRule(rule){
    if(!rule)return false;
    if(rule.mustEndSameLocalDay===true||rule.holidayOnly===true||rule.excludeHolidays===true||(Array.isArray(rule.daysOfWeek)&&rule.daysOfWeek.length))return false;
    if(rule.energyRounding==='started_kwh'||num(rule.energyStepWh)>0||num(rule.connectedTimeStepSeconds)>0||num(rule.chargingTimeStepSeconds)>0)return false;
    if(num(rule.connectedTimeBlockMinutes)>0||num(rule.connectedTimeBlockEur)!=null)return false;
    if(num(rule.connectedTimeFreeMinutes)!=null||num(rule.connectedTimePerMinuteAfterFreeEur)!=null)return false;
    if(num(rule.connectedTimeInitialMinutes)!=null||num(rule.connectedTimeInitialFlatEur)!=null||num(rule.connectedTimeAfterInitialPerMinuteEur)!=null)return false;
    if(num(rule.connectedTimeComponentEur)!=null&&num(rule.connectedTimeComponentEur)!==0)return false;
    if(num(rule.sessionFeeEur)!=null&&num(rule.sessionFeeEur)!==0)return false;
    if(num(rule.minimumSessionEur)!=null)return false;
    return true;
  }
  function addMinutes(value,minutes){
    const d=value instanceof Date?new Date(value.getTime()):new Date(value);if(Number.isNaN(d.getTime()))return null;
    return new Date(d.getTime()+Number(minutes||0)*60000);
  }
  function evaluateSegmentedRules(pricing,session={},timeZone=null){
    const duration=Math.max(0,num(session.durationMinutes)??0),energy=Math.max(0,num(session.energyKwh)??0),charging=Math.max(0,Math.min(duration,num(session.chargingMinutes)??duration));
    if(!session.startAt)return{complete:false,reason:'segmentation_requires_start_time'};
    if(duration<=0){
      const rule=matchingRule(pricing,session.startAt,timeZone,session);if(!rule)return{complete:false,reason:'no_matching_time_rule'};
      if(!segmentableRule(rule))return{complete:false,reason:'tariff_window_crossing_unsupported_components'};
      const evaluated=evaluateRule(rule,{energyKwh:energy,durationMinutes:0});
      return{complete:true,totalEur:evaluated.totalEur,components:{segmentedPricing:{segments:[{startAt:new Date(session.startAt).toISOString(),durationMinutes:0,energyKwh:energy,totalEur:evaluated.totalEur,rule}]}}};
    }
    let elapsed=0,total=0;const segments=[];
    while(elapsed<duration-1e-9){
      const at=addMinutes(session.startAt,elapsed);if(!at)return{complete:false,reason:'invalid_segmentation_start_time'};
      const rule=matchingRule(pricing,at,timeZone,session);if(!rule)return{complete:false,reason:'no_matching_time_rule',segmentStartAt:at.toISOString()};
      if(!segmentableRule(rule))return{complete:false,reason:'tariff_window_crossing_unsupported_components',segmentStartAt:at.toISOString(),matchedRule:rule};
      let boundary=minutesUntilRuleBoundary(rule,at,timeZone,pricing);if(boundary==null)return{complete:false,reason:'unresolved_tariff_boundary'};
      if(!Number.isFinite(boundary))boundary=duration-elapsed;
      const slice=Math.min(duration-elapsed,Math.max(boundary,1e-6));
      const chargeOverlap=Math.max(0,Math.min(charging,elapsed+slice)-elapsed),segmentEnergy=charging>0?energy*(chargeOverlap/charging):0;
      const evaluated=evaluateRule(rule,{energyKwh:segmentEnergy,durationMinutes:slice,chargingMinutes:chargeOverlap});
      total+=evaluated.totalEur;
      segments.push({startAt:at.toISOString(),durationMinutes:money(slice),chargingMinutes:money(chargeOverlap),energyKwh:money(segmentEnergy),totalEur:evaluated.totalEur,components:evaluated.components,rule});
      elapsed+=slice;
      if(segments.length>96)return{complete:false,reason:'tariff_segmentation_guard'};
    }
    return{complete:true,totalEur:money(total),components:{segmentedPricing:{segments,totalEur:money(total)}}};
  }
  function evaluateConditionalSessionFees(fees,session={}){
    if(fees==null)return{complete:true,totalEur:0,component:null};
    if(!Array.isArray(fees))return{complete:false,totalEur:0,component:null,reason:'invalid_conditional_session_fees'};
    const energy=Math.max(0,num(session.energyKwh)??0),duration=Math.max(0,num(session.durationMinutes)??0),items=[];let total=0;
    for(const fee of fees){
      const amount=num(fee?.amountEur),conditions=fee?.conditions;
      if(amount==null||amount<0||!Array.isArray(conditions)||!conditions.length)return{complete:false,totalEur:0,component:null,reason:'invalid_conditional_session_fee'};
      let applies=true;const evaluated=[];
      for(const condition of conditions){
        const threshold=num(condition?.value);if(threshold==null||threshold<0)return{complete:false,totalEur:0,component:null,reason:'invalid_conditional_fee_threshold'};
        let matched=false,detail=null;
        if(condition?.kind==='energy_above_kwh'){
          matched=energy>threshold;detail={kind:'energy_above_kwh',value:threshold,actualEnergyKwh:energy,matched};
        }else if(condition?.kind==='session_duration_after_minutes'){
          matched=duration>threshold;detail={kind:'session_duration_after_minutes',value:threshold,actualDurationMinutes:duration,matched};
        }else return{complete:false,totalEur:0,component:null,reason:'unsupported_conditional_fee_condition',conditionKind:condition?.kind||null};
        evaluated.push(detail);if(!matched)applies=false;
      }
      const costEur=applies?money(amount):0;if(applies)total+=costEur;
      items.push({amountEur:amount,applied:applies,costEur,conditions:evaluated});
    }
    return{complete:true,totalEur:money(total),component:{fees:items,costEur:money(total)}};
  }
  function exemptWindowContains(window,minute){
    const start=hm(window?.start,null),end=hm(window?.end,null);if(start==null||end==null)return false;
    if(start===end)return true;
    if(end>start)return minute>=start&&minute<end;
    return minute>=start||minute<end;
  }
  function postChargeBillableMinutes(fee,{postChargeMinutes=0,postChargeStartAt=null}={},timeZone=null){
    const duration=Math.max(0,num(postChargeMinutes)??0),grace=Math.max(0,num(fee?.graceMinutes)??0),afterGrace=Math.max(0,duration-grace);
    const windows=Array.isArray(fee?.exemptLocalWindows)?fee.exemptLocalWindows.filter(Boolean):[];
    if(afterGrace<=0)return{complete:true,duration,grace,afterGrace,billableMinutes:0,exemptMinutes:0};
    if(!windows.length)return{complete:true,duration,grace,afterGrace,billableMinutes:afterGrace,exemptMinutes:0};
    if(!postChargeStartAt)return{complete:false,reason:'post_charge_exemption_requires_start_time',duration,grace,afterGrace};
    const start=new Date(postChargeStartAt);if(Number.isNaN(start.getTime()))return{complete:false,reason:'invalid_post_charge_start_time',duration,grace,afterGrace};
    const billableStartMs=start.getTime()+grace*60000;let remaining=afterGrace,offset=0,billable=0,exempt=0;
    while(remaining>1e-9){
      const slice=Math.min(1,remaining),mid=new Date(billableStartMs+(offset+slice/2)*60000),minute=minuteOfDay(mid,timeZone);
      if(minute==null)return{complete:false,reason:'post_charge_exemption_timezone_unresolved',duration,grace,afterGrace};
      if(windows.some(w=>exemptWindowContains(w,minute)))exempt+=slice;else billable+=slice;
      remaining-=slice;offset+=slice;
    }
    return{complete:true,duration,grace,afterGrace,billableMinutes:money(billable),exemptMinutes:money(exempt)};
  }
  function evaluatePostChargeFee(fee,session={},timeZone=null){
    if(!fee)return{totalEur:0,component:null};
    const parked=Math.max(0,num(session.postChargeMinutes)??0),duration=Math.max(0,num(session.durationMinutes)??0);
    const charging=Math.max(0,num(session.chargingMinutes)??duration-parked);
    const postChargeStartAt=session.postChargeStartAt||((session.startAt&&parked>0)?addMinutes(session.startAt,charging):null);
    const span=postChargeBillableMinutes(fee,{...session,postChargeStartAt},timeZone);if(span.complete===false)return{totalEur:0,component:null,complete:false,reason:span.reason};
    const duration=span.duration,grace=span.grace,billable=span.billableMinutes,exemptMinutes=span.exemptMinutes;
    const baseComponent={postChargeMinutes:duration,graceMinutes:grace,billableMinutes:billable,exemptMinutes,costEur:0};
    if(billable<=0)return{totalEur:0,component:baseComponent};
    const blockMinutes=num(fee.blockMinutes),blockEur=num(fee.blockEur);
    if(blockMinutes>0&&blockEur!=null){
      const blocks=fee.rounding==='started_block'?Math.ceil(billable/blockMinutes):billable/blockMinutes,costEur=money(blocks*blockEur);
      return{totalEur:costEur,component:{...baseComponent,blocks,blockMinutes,unitPriceEur:blockEur,costEur}};
    }
    const perMinute=num(fee.eurPerMinute);if(perMinute!=null){const costEur=money(billable*perMinute);return{totalEur:costEur,component:{...baseComponent,eurPerMinute:perMinute,costEur}};}
    return{totalEur:0,component:null,complete:false,reason:'unsupported_post_charge_fee'};
  }
  function applyMinimumTotal(pricing,total,components){
    const minimum=num(pricing?.minimumTotalEur);if(minimum==null||total>=minimum)return{totalEur:money(total),components};
    const topUp=money(minimum-total);return{totalEur:money(minimum),components:{...components,minimumTotal:{minimumEur:minimum,preMinimumTotalEur:money(total),topUpEur:topUp}}};
  }
  function evaluateComponentGroups(pricing,session={},timeZone=null){
    const groups=Array.isArray(pricing?.componentGroups)?pricing.componentGroups:[];
    if(!groups.length)return{complete:false,reason:'missing_component_groups'};
    const components={componentGroups:[]};let total=0,matchedEnergy=false,energyRequired=false,matchedCount=0;
    const duration=Math.max(0,num(session.durationMinutes)??0),parked=Math.max(0,num(session.postChargeMinutes)??0);
    const charging=Math.max(0,Math.min(duration,num(session.chargingMinutes)??duration-parked));
    const timeline=Array.isArray(session.chargeTimeline)?session.chargeTimeline.map(step=>({
      start:Math.max(0,num(step.offsetMinutes)??0),duration:Math.max(0,num(step.durationMinutes)??0),energy:Math.max(0,num(step.energyKwh)??0)
    })).filter(step=>step.duration>0&&step.energy>0):[];
    const timelineTotal=timeline.reduce((sum,step)=>sum+step.energy,0);
    const fail=(reason,kind)=>({complete:false,reason,componentKind:kind,components});
    const boundaryFor=(rules,rule,at,elapsed,phaseDuration)=>{
      let boundary=rule?minutesUntilRuleBoundary(rule,at,timeZone,{rules}):Infinity;
      const minute=minuteOfDay(at,timeZone);
      if(minute==null)return null;
      for(const candidate of rules){
        const starts=hm(candidate?.start??candidate?.startTime,null);
        if(starts!=null){const until=(starts-minute+1440)%1440;if(until>1e-9)boundary=Math.min(boundary,until);}
        for(const key of ['minDurationMinutes','maxDurationMinutes']){
          const atMinute=num(candidate?.[key]);if(atMinute!=null&&atMinute>elapsed+1e-9)boundary=Math.min(boundary,atMinute-elapsed);
        }
      }
      boundary=Math.min(boundary,1440-minute,phaseDuration-elapsed);
      return Math.max(boundary,1e-6);
    };
    for(const group of groups){
      const rules=Array.isArray(group?.rules)?group.rules:[],kind=String(group?.kind||'').toUpperCase();
      if(!rules.length)continue;
      if(kind==='ENERGY'){
        energyRequired=energyRequired||rules.some(rule=>(num(rule.pricePerKwh)??0)>0);
        const energy=Math.max(0,num(session.energyKwh)??0);
        if(energy>0&&charging<=0)return fail('energy_without_charging_minutes',kind);
        if(charging<=0){components.componentGroups.push({kind,matched:true,costEur:0});matchedCount++;matchedEnergy=true;continue;}
        let elapsed=0,groupTotal=0;const segments=[];
        while(elapsed<charging-1e-9){
          const at=addMinutes(session.startAt,elapsed);if(!at)return fail('invalid_component_start_time',kind);
          const localPricing={...pricing,rules},probe={...session,startAt:at};
          const match=matchingRuleDetailed(localPricing,at,timeZone,probe);
          if(match.unknown)return fail(match.reason,kind);
          const rule=match.rule;if(!rule)return fail('no_matching_energy_component',kind);
          const boundary=boundaryFor(rules,rule,at,elapsed,charging);if(boundary==null)return fail('unresolved_component_boundary',kind);
          const end=Math.min(charging,elapsed+boundary),slice=end-elapsed;
          if(!timelineTotal&&end<charging-1e-9&&rules.some(row=>(num(row.pricePerKwh)??0)!==(num(rule.pricePerKwh)??0)))return fail('energy_timeline_required_for_window_crossing',kind);
          const sliceEnergy=timelineTotal>0?energy*timeline.reduce((sum,step)=>sum+Math.max(0,Math.min(end,step.start+step.duration)-Math.max(elapsed,step.start))*step.energy/step.duration,0)/timelineTotal:energy*slice/charging;
          const value=evaluateRule(rule,{energyKwh:sliceEnergy,durationMinutes:0});
          groupTotal+=value.totalEur;segments.push({startAt:at.toISOString(),durationMinutes:money(slice),energyKwh:money(sliceEnergy),costEur:value.totalEur});
          elapsed=end;if(segments.length>4096)return fail('component_segmentation_guard',kind);
        }
        total+=groupTotal;matchedCount++;matchedEnergy=true;
        components.componentGroups.push({kind,matched:true,costEur:money(groupTotal),segments});
        continue;
      }
      if(kind==='TIME'||kind==='PARKING_TIME'){
        const phaseDuration=kind==='TIME'?charging:parked;
        const phaseStart=kind==='TIME'?session.startAt:session.postChargeStartAt||addMinutes(session.startAt,charging);
        if(phaseDuration<=0){components.componentGroups.push({kind,matched:false,costEur:0});continue;}
        let elapsed=0,groupTotal=0,groupMatched=false;const segments=[];
        while(elapsed<phaseDuration-1e-9){
          const at=addMinutes(phaseStart,elapsed);if(!at)return fail('invalid_component_start_time',kind);
          const localPricing={...pricing,rules},probe={...session,startAt:at,energyKwh:0,durationMinutes:elapsed+1e-6,chargingMinutes:kind==='TIME'?elapsed+1e-6:0};
          const match=matchingRuleDetailed(localPricing,at,timeZone,probe);
          if(match.unknown)return fail(match.reason,kind);
          const rule=match.rule,boundary=boundaryFor(rules,rule,at,elapsed,phaseDuration);if(boundary==null)return fail('unresolved_component_boundary',kind);
          const slice=Math.min(phaseDuration-elapsed,boundary);
          if(rule){
            const value=evaluateRule(rule,{energyKwh:0,durationMinutes:slice,chargingMinutes:kind==='TIME'?slice:0});
            groupTotal+=value.totalEur;groupMatched=true;
            segments.push({startAt:at.toISOString(),durationMinutes:money(slice),costEur:value.totalEur});
          }
          elapsed+=slice;if(segments.length>4096)return fail('component_segmentation_guard',kind);
        }
        total+=groupTotal;if(groupMatched)matchedCount++;
        components.componentGroups.push({kind,matched:groupMatched,costEur:money(groupTotal),segments});
        continue;
      }
      if(kind==='CONGESTION_TIME'&&rules.some(rule=>(num(rule.connectedTimePerMinuteEur)??0)>0)){
        return fail('congestion_timeline_required',kind);
      }
      const match=matchingRuleDetailed({...pricing,rules},session.startAt,timeZone,session);
      if(match.unknown)return fail(match.reason,kind);
      if(!match.rule){components.componentGroups.push({kind,matched:false,costEur:0});continue;}
      const value=evaluateRule(match.rule,session);
      total+=value.totalEur;matchedCount++;
      components.componentGroups.push({kind,matched:true,costEur:value.totalEur,components:value.components,rule:match.rule});
    }
    if(!matchedCount)return fail('no_matching_component_group',null);
    if(energyRequired&&!matchedEnergy)return fail('no_matching_energy_component','ENERGY');
    return{complete:true,totalEur:money(total),components};
  }

  function evaluateOffer(offer,session={}){
    const pricing=offer?.pricing||{},timeZone=session.timeZone||offer?.metadata?.timeZone||null;
    if(pricing.type==='component_groups'){
      const base=evaluateComponentGroups(pricing,session,timeZone);if(base.complete===false)return{...base,offerId:offer?.id||null,timeZone};
      const finalized=applyMinimumTotal(pricing,base.totalEur,base.components);return{complete:true,totalEur:finalized.totalEur,components:finalized.components,offerId:offer?.id||null,currency:offer?.currency||'EUR',timeZone};
    }
    if(pricing.type!=='rules'){
      const rate=num(pricing.pricePerKwh);if(rate==null)return{complete:false,reason:'unsupported_pricing',offerId:offer?.id||null};
      const energy=Math.max(0,num(session.energyKwh)??0),base=money(rate*energy),conditional=evaluateConditionalSessionFees(pricing.conditionalSessionFees,session);
      if(conditional.complete===false)return{complete:false,reason:conditional.reason,offerId:offer?.id||null,conditionKind:conditional.conditionKind||null};
      const post=evaluatePostChargeFee(pricing.postChargeFee,session,timeZone);if(post.complete===false)return{complete:false,reason:post.reason,offerId:offer?.id||null};
      const components={energy:base,...(conditional.component?{conditionalSessionFees:conditional.component}:{}),...(post.component?{postCharge:post.component}:{})};
      const finalized=applyMinimumTotal(pricing,base+conditional.totalEur+post.totalEur,components);
      return{complete:true,totalEur:finalized.totalEur,components:finalized.components,offerId:offer?.id||null,currency:offer?.currency||'EUR'};
    }
    const match=matchingRuleDetailed(pricing,session.startAt,timeZone,session);if(match.unknown)return{complete:false,reason:match.reason,offerId:offer?.id||null,timeZone};const rule=match.rule;if(!rule)return{complete:false,reason:'no_matching_time_rule',offerId:offer?.id||null,timeZone};
    const duration=Math.max(0,num(session.durationMinutes)??0),boundary=minutesUntilRuleBoundary(rule,session.startAt,timeZone,pricing);
    let base,segmented=false;
    if(boundary!=null&&Number.isFinite(boundary)&&duration>boundary+1e-9){
      base=evaluateSegmentedRules(pricing,session,timeZone);if(base.complete===false)return{...base,offerId:offer?.id||null,timeZone,boundaryMinutes:boundary};segmented=true;
    }else base=evaluateRule(rule,session);
    const longFee=pricing.longConnectionFee;let longConnection=null,total=base.totalEur;
    if(longFee&&duration>(num(longFee.thresholdMinutes)??Infinity)){
      const rate=num(longFee.eurPerHourAfterThreshold);if(rate!=null){const excess=duration-Number(longFee.thresholdMinutes);longConnection={complete:false,reason:'hourly_rounding_unspecified',excessMinutes:excess,rateEurPerHour:rate};}
    }
    const conditional=evaluateConditionalSessionFees(pricing.conditionalSessionFees,session);if(conditional.complete===false)return{complete:false,reason:conditional.reason,offerId:offer?.id||null,timeZone,conditionKind:conditional.conditionKind||null};
    total+=conditional.totalEur;
    const post=evaluatePostChargeFee(pricing.postChargeFee,session,timeZone);if(post.complete===false)return{complete:false,reason:post.reason,offerId:offer?.id||null,timeZone};
    total+=post.totalEur;
    const components={...base.components,...(conditional.component?{conditionalSessionFees:conditional.component}:{}),...(post.component?{postCharge:post.component}:{})};
    const finalized=applyMinimumTotal(pricing,total,components);
    return{complete:!longConnection,totalEur:finalized.totalEur,components:finalized.components,longConnection,offerId:offer?.id||null,currency:offer?.currency||'EUR',matchedRule:rule,segmented,timeZone};
  }
  return{evaluateOffer,evaluateRule,evaluateSegmentedRules,evaluateComponentGroups,segmentableRule,ruleThresholdStatus,ruleThresholdMatches,matchingRuleDetailed,evaluateConditionalSessionFees,evaluatePostChargeFee,postChargeBillableMinutes,exemptWindowContains,matchingRule,ruleContains,ruleDayMatches,localDateParts,isHoliday,italianHolidayKeys,minuteOfDay,minutesUntilRuleBoundary,applyMinimumTotal};
});