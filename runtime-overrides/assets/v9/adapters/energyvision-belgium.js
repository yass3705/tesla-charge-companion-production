(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.energyvisionBelgium=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
 const text=v=>String(v==null?'':v).trim();
 const numeric=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
 const statuses=new Set(['available','charging']);
 const connectors={TYPE2:'AC',CCS:'DC'};
 const allowedLeaves=new Set(['energyPrice/priceGroupIndex','energyPrice/priceType',
  'energyPrice/value','energyPrice/taxIncluded','energyPrice/taxRate']);
 // DATEX hierarchical adHoc station energyRate applies to child refill points
 // only where there are no site/point overrides. Accept exact VAT-included
 // kWh-only, or exactly kWh + one per-session basePrice. Every component must
 // share the one price group and have no clock/minute applicability.
 function safeKwh(site,station){
   if(site.sourceSiteEnergyRateCount!==0||station.sourceStationEnergyRateCount!==1)return null;
   const rs=station.sourceStationRatesUnassignedToPdc||[];
   if(rs.length!==1)return null;
   const rate=rs[0],ps=rate?.priceComponents||[];
   if(rate?.ratePolicy!=='adHoc'||text(rate.currency)!=='EUR'||!text(rate.sourceRateId)||
      !(ps.length===1||ps.length===2))return null;
   const kinds=ps.map(x=>text(x.priceType)).sort();
   const single=kinds.length===1&&kinds[0]==='pricePerKWh';
   const withFee=kinds.length===2&&kinds[0]==='basePrice'&&kinds[1]==='pricePerKWh';
   if(!single&&!withFee)return null;
   const groups=new Set(ps.map(x=>text(x.groupIndex)));
   // The official source groups these one-time and kWh charges together;
   // two unrelated price groups must not be silently compounded.
   if(groups.size!==1||!groups.has('1'))return null;
   for(const p of ps){
     const value=numeric(p.amountSource);
     if(p.taxIncluded!=='true'||numeric(p.taxRateSource)!==21||value==null||value<0||
        (p.priceType==='pricePerKWh'&&value>3)||
        (p.priceType==='basePrice'&&value>100)||
        (p.rawApplicabilityLeaves||[]).some(l=>!allowedLeaves.has(text(l.path))))return null;
   }
   return {value:numeric(ps.find(x=>x.priceType==='pricePerKWh').amountSource),
     sessionFee:withFee?numeric(ps.find(x=>x.priceType==='basePrice').amountSource):0,
     rateId:text(rate.sourceRateId),sourceUpdatedAt:text(rate.sourceLastUpdated)};
 }

 // Strict conditional families from official DATEX, isolated from checkout-unsupported shapes.
 // These return numeric offers only when every component matches a user-confirmed family.
 function safeConditional(site,station){
   if(site.sourceSiteEnergyRateCount!==0||station.sourceStationEnergyRateCount!==1)return null;
   const rs=station.sourceStationRatesUnassignedToPdc||[];
   if(rs.length!==1)return null;
   const rate=rs[0],parts=rate?.priceComponents||[];
   if(rate?.ratePolicy!=='adHoc'||text(rate.currency)!=='EUR'||!text(rate.sourceRateId)||
      ![2,3].includes(parts.length)||new Set(parts.map(p=>text(p.groupIndex))).size!==1||
      text(parts[0]?.groupIndex)!=='1')return null;
   const all=new Set(['energyPrice/priceGroupIndex','energyPrice/priceType',
     'energyPrice/value','energyPrice/taxIncluded','energyPrice/taxRate']);
   const exactLeaves=(p,threshold)=>{
     const leaves=p.rawApplicabilityLeaves||[];
     const expected=new Set([...all,...(threshold==null?[]:['energyPrice/timeBasedApplicability/fromMinute'])]);
     if(leaves.length!==expected.size)return false;
     if(new Set(leaves.map(l=>text(l.path))).size!==expected.size)return false;
     if(leaves.some(l=>!expected.has(text(l.path))))return false;
     if(threshold!=null&&!leaves.some(l=>l.path==='energyPrice/timeBasedApplicability/fromMinute'&&text(l.value)===String(threshold)))return false;
     return true;
   };
   for(const p of parts){
     const amt=numeric(p.amountSource);
     if(p.taxIncluded!=='true'||numeric(p.taxRateSource)!==21||amt==null||amt<0)return null;
   }
   const kwh=parts.filter(p=>p.priceType==='pricePerKWh');
   const minute=parts.filter(p=>p.priceType==='pricePerMinute');
   const base=parts.filter(p=>p.priceType==='basePrice');
   if(kwh.length!==1||minute.length!==1||base.length>1||!exactLeaves(kwh[0],null))return null;
   const amount=numeric(kwh[0].amountSource),rateMinute=numeric(minute[0].amountSource);
   // 45 minutes after charge completion, no additional grace: post-charge only.
   if(parts.length===2&&!base.length&&amount===0.61&&rateMinute===0.33&&exactLeaves(minute[0],45))
      return {value:amount,sessionFee:0,postChargeFee:{graceMinutes:45,eurPerMinute:rateMinute},
        rateId:text(rate.sourceRateId),sourceUpdatedAt:text(rate.sourceLastUpdated),
        tariffFamily:'energyvision-post-charge-45'};
   // Fee after 18 hours connected, measured from initial plug-in.
   if(parts.length===3&&base.length===1&&amount===0.37&&
      numeric(base[0].amountSource)===2.04&&exactLeaves(base[0],null)&&
      rateMinute===0.02&&exactLeaves(minute[0],1080))
      return {value:amount,sessionFee:2.04,connectedTimeFreeMinutes:1080,
        connectedTimePerMinuteAfterFreeEur:rateMinute,rateId:text(rate.sourceRateId),
        sourceUpdatedAt:text(rate.sourceLastUpdated),tariffFamily:'energyvision-connected-1080'};
   return null;
 }

 function normalizeSite(site,{sourceId='energyvision-be-official'}={}){
   const id=text(site.sourceSiteId),lat=numeric(site.latitude),lon=numeric(site.longitude);
   if(!id||lat==null||lon==null||Math.abs(lat)>90||Math.abs(lon)>180||site.sourceSiteType!=='openSpace')return null;
   const evses=[],offers=[],allKnown=new Set();
   for(const station of site.stations||[]){
     const src=station.pdc||[],eligible=[];
     const specs=new Set(src.map(p=>[text(p.connectorType),numeric(p.powerW)].join(':')));
     for(const pt of src){
       const eid=text(pt.externalEvseId),kind=connectors[text(pt.connectorType)],powerW=numeric(pt.powerW);
       if(!eid||allKnown.has(eid))throw new Error('EnergyVision duplicated or empty exact EVSE');
       allKnown.add(eid);
       if(!kind||!powerW||powerW<=0||!statuses.has(text(pt.status)))continue;
       const powerKw=powerW/1000;
       evses.push({id:eid,aliases:[eid],connectors:[{id:eid+':'+kind,kind,powerKw}]});
       eligible.push(pt);
     }
     // Never interpret mixed connector/power station as one common EVSE quote.
     const safe=specs.size===1&&src.length>0&&src.every(pt=>pt.sourcePointEnergyRateCount===0)
       ?(safeKwh(site,station)||safeConditional(site,station)):null;
     if(!safe)continue;
     for(const pt of eligible){
       const eid=text(pt.externalEvseId),kind=connectors[text(pt.connectorType)];
       offers.push({
         id:sourceId+':'+id+':'+eid+':'+safe.rateId,
         provider:'EnergyVision',kind:'direct',subscriptionId:null,
         countries:['BE'],currency:'EUR',evseIds:[eid],connectorKinds:[kind],
         pricing:{type:'rules',timeZone:'Europe/Brussels',
         ...(safe.postChargeFee?{postChargeFee:safe.postChargeFee}:{}),rules:[{
           scope:'allDay',start:'00:00',end:'24:00',billing:'kwh',currency:'EUR',
           pricePerKwh:safe.value,chargePerMinute:0,connectionFee:safe.sessionFee,idlePerMinute:0,
           afterMinutesRate:0,afterMinutesThreshold:0,days:null,ocpiDurationBands:[],
           ...(safe.connectedTimeFreeMinutes!=null?{connectedTimeFreeMinutes:safe.connectedTimeFreeMinutes,
             connectedTimePerMinuteAfterFreeEur:safe.connectedTimePerMinuteAfterFreeEur}: {})
         }]},priority:125,metadata:{
           source:'EnergyVision official AFIR/DATEX II 3.7 (adHoc CPO)',
           sourceStationId:text(station.sourceStationId),
           rateId:safe.rateId,sourceUpdatedAt:safe.sourceUpdatedAt,
           scope:safe.sessionFee?'one inherited station kWh + fixed session fee, no overrides':'single inherited station kWh rule, no point/site override',
           vat:'21% included',tariffFamily:safe.tariffFamily||'simple',
           verification:'official-source-adHoc-not-checkout-observation'
         }
       });
     }
   }
   if(!evses.length)return null; // Only positive source statuses are shown.
   return {canonicalId:'BE:energyvision:'+id,
     aliases:['energyvision:'+id],sourceStationId:id,countryCode:'BE',
     name:text(site.name)||'EnergyVision',
     address:[text(site.postalCode),text(site.city)].filter(Boolean).join(' '),
     latitude:lat,longitude:lon,physicalOperator:{name:'EnergyVision'},
     networkBrand:'EnergyVision',evses,offers,
     access:{kind:'public-network',limited:false,source:'EnergyVision AFIR source'},
     status:{state:'available',sourceId},updatedAt:null,
     metadata:{source:'EnergyVision DATEX',siteType:site.sourceSiteType,
       rateScope:'station',unpricedActivePdc:evses.length-offers.length}
   };
 }
 function normalizePayload(payload,{sourceId='energyvision-be-official',bounds=null}={}){
   if(payload?.provider!=='EnergyVision'||payload?.country!=='BE'||payload?.v9PublicationReady!==false||
      payload?.v9PricedPDC!==0||payload?.counts?.distinctExternalEvseIds<3500||
      payload?.counts?.sourcePDC!==payload?.counts?.distinctExternalEvseIds||
      payload?.napCrosswalk?.unmatchedIds!==payload?.counts?.sourcePDC||
      !/^[a-f0-9]{64}$/.test(text(payload.sourceSha256)))throw new Error('Unverified EnergyVision CPO source');
   const rows=(payload.sites||[]).filter(s=>{
     if(!bounds)return true;
     const lat=numeric(s.latitude),lon=numeric(s.longitude);
     return lat!=null&&lon!=null&&lat>=bounds.minLat&&lat<=bounds.maxLat&&
       lon>=bounds.minLon&&lon<=bounds.maxLon;
   });
   return rows.map(s=>normalizeSite(s,{sourceId})).filter(Boolean);
 }
 return {safeKwh,safeConditional,normalizeSite,normalizePayload};
});
