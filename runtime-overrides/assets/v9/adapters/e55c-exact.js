(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.e55cExact=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const t=x=>String(x==null?'':x).trim();
 const n=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
 const unique=x=>[...new Set(x)];
 const canonical=x=>t(x).toUpperCase().replace(/[^A-Z0-9]/g,'');
 function tariff(profile){
  if(!profile||profile.currency!=='EUR'||profile.taxIncluded!==true||profile.adHocDirectVerified!==true)return null;
  const methods=profile.sourceMethods||[];
  if(methods.includes('ROAMING_EMPS')&&profile.classificationBasis!=='national_sole_E55C_ROAMING_EMPS')return null;
  if(methods.some(m=>m!=='ROAMING_EMPS')&&profile.classificationBasis==='national_sole_E55C_ROAMING_EMPS')return null;
  if(!Array.isArray(profile.rules))return null;
  const flat=profile.rules.filter(r=>r.billingDimensions?.length===1&&r.billingDimensions[0]==='flat'&&r.scope==='allDay');
  const windowed=profile.rules.filter(r=>r.billingDimensions?.includes('charging_time')&&r.billingDimensions?.includes('parking_time'));
  if(flat.length!==1||windowed.length!==2||profile.rules.length!==3)return null;
  const fee=n(flat[0].flatEur);
  if(fee===null||fee<0||fee>100)return null;
  const windows=[];
  for(const r of windowed){
   const charge=n(r.chargingTimeEurPerMinute),parking=n(r.parkingTimeEurPerMinute);
   if(r.scope!=='timeWindow'||charge===null||parking===null||charge<0||parking<0||charge>10||parking>10||!/^\\d{2}:\\d{2}$/.test(t(r.start))||!/^\\d{2}:\\d{2}$/.test(t(r.end)))return null;
   windows.push({start:r.start,end:r.end,chargePerMinute:charge,parkingPerMinute:parking});
  }
  if(!windows.some(r=>r.start==='07:00'&&r.end==='23:00')||!windows.some(r=>r.start==='23:00'&&r.end==='07:00'))return null;
  windows.sort((a,b)=>a.start.localeCompare(b.start));
  return {fee,windows};
 }
 function normalizePayload(payload,source={}){
  if(payload?.source?.directTariff?.nationalOwnEmspOnlyVerified!==true||payload?.dataset!=='electric55-operated-stations-france'||payload?.country!=='FR'||payload?.operator!=='Electric 55 Charging (E55C)'||payload?.tccIntegration?.operatorDirectTariffsReady!==true)throw Error('E55C candidate source identity invalid');
  const profiles=new Map((payload.directTariffProfiles||[]).map(p=>[p.profileId,p]));
  const offers=[],ids=new Set(),rejected={};
  for(const st of payload.stations||[])for(const p of st.chargePoints||[]){
   const profileId=p?.pricing?.profileId,profile=profiles.get(profileId),value=tariff(profile);
   const evse=t(p.localEvseId||p.evseId);
   if(p?.pricing?.status!=='resolved_e55c_scan_pay'||!value||!evse||!/^FR\\*55C\\*/i.test(evse)){
    rejected.noSafeTariff=(rejected.noSafeTariff||0)+1;continue;
   }
   const id=canonical(evse);
   if(ids.has(id))throw Error('E55C duplicate EVSE '+id);
   ids.add(id);
   const day=value.windows.find(w=>w.start==='07:00'),night=value.windows.find(w=>w.start==='23:00');
   const power=n(p.powerKw);
   offers.push({
    id:'e55c-exact:'+id,sourceId:source.id||'france-e55c-exact',provider:'Electric 55 Charging',kind:'direct',offerKind:'direct',subscriptionId:null,
    countries:['FR'],currency:'EUR',operatorIds:['electric-55-charging-e55c','electric-55-charging','e55c'],evseIds:unique([evse,id]),
    ...(p.kind==='AC'||p.kind==='DC'?{connectorKinds:[p.kind]}:{}),
    pricing:{type:'e55c_exact',timeZone:'Europe/Paris',sessionFeeEur:value.fee,
      localRateWindows:value.windows.map(w=>({start:w.start,end:w.end,chargingTimeEurPerMinute:w.chargePerMinute,parkingTimeEurPerMinute:w.parkingPerMinute}))},
    priority:138,metadata:{source:'E55C public Scan Pay exact connector',sourceEvseId:evse,profileId,
     classificationBasis:profile.classificationBasis||null,exactEvseOnly:true,postChargeBeginsAtEnd:true,
     defaultDepartureAtChargeEnd:true,powerKw:power}
   });
  }
  return {stations:[],offerRules:offers,metadata:{dataset:'e55c-france-exact',evseCount:offers.length,
    stationCount:payload?.stats?.stationCount,sourcePdcCount:payload?.stats?.chargePointCount,
    sourcePricedCount:payload?.stats?.chargePointCountWithMachineReadablePricing,
    sourceOnlyE55cMethod:payload?.source?.directTariff?.nationalOwnEmspOnlyVerified,
    rejected}};
 }
 return {tariff,normalizePayload};
});
