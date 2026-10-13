#!/usr/bin/env python3
"""Scoped E55C-only pricing extension for exact EVSE daily clock windows."""
import pathlib
import sys

path=pathlib.Path(sys.argv[1])
code=path.read_text(encoding="utf-8")
needle="  function evaluateOffer(offer,session={}){"
if "function evaluateE55cExact(offer,session)" in code:
    print("E55C exact extension already installed")
    sys.exit(0)
if code.count(needle)!=1:
    raise SystemExit("E55C patch insertion point missing or ambiguous")
extension=r"""
  // The E55C CPO checkout has two independent dimensions: charging minutes
  // within local tariff windows, and parking minutes AFTER charging ends.
  // This E55C-only type avoids double-billing the session fee across windows.
  function evaluateE55cExact(offer,session){
    const pricing=offer?.pricing||{},zone=pricing.timeZone||'Europe/Paris';
    if(zone!=='Europe/Paris')return{complete:false,reason:'e55c_invalid_timezone'};
    const fee=num(pricing.sessionFeeEur),windows=pricing.localRateWindows;
    if(fee==null||fee<0||!Array.isArray(windows)||windows.length!==2)
      return{complete:false,reason:'e55c_invalid_price'};
    function hhmm(raw){
      const m=/^(\d{2}):(\d{2})$/.exec(String(raw||''));
      if(!m)return null;const h=Number(m[1]),min=Number(m[2]);
      return h<=23&&min<=59?h*60+min:null;
    }
    const parsed=[];
    for(const w of windows){
      const start=hhmm(w.start),end=hhmm(w.end),charging=num(w.chargingTimeEurPerMinute),parking=num(w.parkingTimeEurPerMinute);
      if(start==null||end==null||charging==null||parking==null||charging<0||parking<0||charging>10||parking>10)
        return{complete:false,reason:'e55c_invalid_window'};
      parsed.push({start,end,charging,parking});
    }
    if(!parsed.some(w=>w.start===420&&w.end===1380)||!parsed.some(w=>w.start===1380&&w.end===420))
      return{complete:false,reason:'e55c_invalid_day_night_partition'};
    function rate(at,field){
      const local=minuteOfDay(at,zone);
      if(local==null)return null;
      const w=parsed.find(w=>w.end>w.start?(local>=w.start&&local<w.end):(local>=w.start||local<w.end));
      return w?w[field]:null;
    }
    const connected=num(session.durationMinutes),specifiedCharge=num(session.chargingMinutes),charge=specifiedCharge??connected??0;
    const parking=num(session.postChargeMinutes)??0;
    if(charge<0||parking<0||charge>43200||parking>43200||(connected!=null&&charge>connected+1e-9))
      return{complete:false,reason:'e55c_invalid_session_minutes'};
    const startAt=session.startAt?new Date(session.startAt):null;
    if((charge>0||parking>0)&&(!startAt||Number.isNaN(startAt.getTime())))
      return{complete:false,reason:'e55c_requires_start_time'};
    const postAt=session.postChargeStartAt?new Date(session.postChargeStartAt):(startAt?new Date(startAt.getTime()+charge*60000):null);
    if(parking>0&&(!postAt||Number.isNaN(postAt.getTime())))
      return{complete:false,reason:'e55c_requires_postcharge_start'};
    function segment(start,minutes,kind){
      let total=0,day=0,night=0;
      for(let elapsed=0;elapsed<minutes-1e-9;){
        const slice=Math.min(1,minutes-elapsed);
        const at=new Date(start.getTime()+(elapsed+slice/2)*60000),value=rate(at,kind);
        if(value==null)return null;
        const local=minuteOfDay(at,zone);
        if(local>=420&&local<1380)day+=value*slice;else night+=value*slice;
        total+=value*slice;elapsed+=slice;
      }
      return{totalEur:money(total),dayEur:money(day),nightEur:money(night)};
    }
    const perKwh=num(pricing.energyEurPerKwh),kwh=num(session.energyKwh);
    if(perKwh!=null&&(perKwh<0||perKwh>5||kwh==null||kwh<0))
      return{complete:false,reason:'e55c_invalid_or_missing_energy'};
    const charging=perKwh!=null?{totalEur:money(perKwh*kwh),energyKwh:kwh,eurPerKwh:perKwh}:
      (charge>0?segment(startAt,charge,'charging'):{totalEur:0,dayEur:0,nightEur:0});
    const post=parking>0?segment(postAt,parking,'parking'):{totalEur:0,dayEur:0,nightEur:0};
    if(!charging||!post)return{complete:false,reason:'e55c_window_resolution_failed'};
    return{complete:true,totalEur:money(fee+charging.totalEur+post.totalEur),currency:'EUR',
      offerId:offer?.id||null,timeZone:zone,components:{
        sessionFee:money(fee),
        chargingTime:{minutes:charge,...charging},
        postCharge:{postChargeMinutes:parking,graceMinutes:0,...post}
      }};
  }
"""
code=code.replace(needle,extension+needle+"\n    if(offer?.pricing?.type==='e55c_exact')return evaluateE55cExact(offer,session);",1)
path.write_text(code,encoding="utf-8")
print("E55C exact charging + post-charge window pricing installed")
