(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){
    root.TCCV9ProductionShell=api;
    if(root.document){
      const start=()=>{
        if(root.__TCC_V9_SHELL__?.pending||root.__TCC_V9_SHELL__?.ready)return;
        api.install(root).catch(err=>{
          const marker=root.__TCC_V9_SHELL__||{};
          marker.pending=false;marker.ready=false;marker.error=String(err?.message||err);
          root.__TCC_V9_SHELL__=marker;
          console.error('[TCC V9 shell] install failed',err);
        });
      };
      if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
      else root.setTimeout(start,0);
    }
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const num=v=>{if(v==null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const V7_DC_POINTS=[[0,175],[10,175],[20,170],[30,160],[40,145],[50,125],[60,105],[70,85],[80,60],[85,42],[90,28],[95,16],[98,10],[100,6]];
  const SUBSCRIPTION_KEY='tccV9SelectedSubscriptionsV1';

  function selectedSubscriptions(w){
    try{const raw=JSON.parse(w.localStorage.getItem(SUBSCRIPTION_KEY)||'[]');return Array.isArray(raw)?[...new Set(raw.map(text).filter(Boolean))]:[];}catch(_){return[];}
  }
  function saveSelectedSubscriptions(w,ids){const clean=[...new Set((ids||[]).map(text).filter(Boolean))];try{w.localStorage.setItem(SUBSCRIPTION_KEY,JSON.stringify(clean));}catch(_){}return clean;}
  function subscriptionLabel(row){const provider=text(row?.provider),label=text(row?.label),id=text(row?.id);if(label&&label!==id)return label;if(provider&&provider!==id)return provider;return id;}
  function subscriptionOptionsForArea(area,countryCode){
    const options=new Map(),country=text(countryCode).toUpperCase();
    for(const station of area?.stations||[])for(const offer of station?.offers||[]){
      const id=text(offer?.subscriptionId);if(!id)continue;
      const countries=(offer?.countries||[]).map(value=>text(value).toUpperCase());
      if(countries.length&&!countries.includes('*')&&!countries.includes(country))continue;
      const metadata=offer?.metadata||{},label=text(metadata.subscriptionName||metadata.subscriptionLabel||offer?.subscriptionName||offer?.provider||id);
      const promotionEnd=text(offer?.monthlyFeePromotionEnd||metadata.promotionEnd),feeCurrent=!promotionEnd||promotionEnd>=new Date().toISOString().slice(0,10);
      const monthlyFeeEur=feeCurrent?num(offer?.monthlyFeeEur??metadata.monthlyFeeEur):null,annualFeeEur=num(offer?.annualFeeEur??metadata.annualFeeEur);
      if(!options.has(id))options.set(id,{id,label,provider:text(offer?.provider)||label,countries:[country],monthlyFeeEur,annualFeeEur,feeNote:feeCurrent?'':'Mensualité à vérifier après promotion'});
    }
    return [...options.values()].sort((a,b)=>subscriptionLabel(a).localeCompare(subscriptionLabel(b),'fr'));
  }
  function renderSubscriptionSelector(w,options,countryCode,stations=[]){
    const compare=w.document.getElementById('compare'),card=compare?.querySelector('.card');if(!card)return;
    let box=w.document.getElementById('v9SubscriptionSelector');
    if(!box){box=w.document.createElement('div');box.id='v9SubscriptionSelector';box.className='box v9-filter-group';box.style.marginTop='10px';const primary=card.querySelector('button.primary');if(primary)card.insertBefore(box,primary);else card.appendChild(box);}
    const selected=new Set(selectedSubscriptions(w)),rows=(options||[]).slice();
    const emspProviders=[...new Set((stations||[]).flatMap(st=>st?.offers||[])
      .filter(offer=>/^(emsp|roaming)$/i.test(text(offer?.kind))||/electra|electroverse/i.test(text(offer?.provider)))
      .map(offer=>text(offer?.provider)).filter(name=>/electra|electroverse/i.test(name)))];
    const emspMessage=emspProviders.length?' Les tarifs '+emspProviders.join(', ')+' affichés dans les résultats sont des prix eMSP, distincts d’un abonnement.':'';
    const choices=rows.map(row=>'<label style="display:flex;align-items:flex-start;gap:8px;margin:0;padding:5px 2px"><input type="checkbox" value="'+esc(row.id)+'"'+(selected.has(text(row.id))?' checked':'')+' style="width:auto;margin:2px 0 0"><span><b>'+esc(subscriptionLabel(row))+'</b>'+(row.monthlyFeeEur!=null?' · '+esc(formatCurrencyAmount(row.monthlyFeeEur,'EUR'))+'/mois':row.annualFeeEur!=null?' · '+esc(formatCurrencyAmount(row.annualFeeEur,'EUR'))+'/an':row.feeNote?' · '+esc(row.feeNote):'')+'<span class="small" style="display:block">'+esc(row.provider)+'</span></span></label>').join('');
    box.innerHTML='<b>Abonnements recharge</b> <span class="small">('+rows.length+' compatible(s) en '+esc(countryCode)+')</span>'+
      '<div class="small" style="margin-top:6px">Choisis les abonnements que tu possèdes. Leurs tarifs vérifiés participent au calcul; les frais mensuels sont indiqués séparément.</div>'+
      (rows.length?'<div id="v9SubscriptionChoices" role="group" aria-label="Abonnements recharge, sélection multiple" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:3px;max-height:180px;overflow:auto;margin-top:8px">'+choices+'</div>'+
        '<div class="row" style="margin-top:8px"><button type="button" class="secondary v9-sub-apply" style="width:auto">Valider</button><button type="button" class="secondary v9-sub-cancel" style="width:auto">Annuler</button><button type="button" class="secondary v9-sub-none" style="width:auto">Aucun abonnement</button></div>':
        '<div class="small" style="margin-top:8px">Aucun tarif d’abonnement vérifié pour les bornes de cette zone.'+esc(emspMessage)+'</div>');
    const selectedIds=()=>[...box.querySelectorAll('#v9SubscriptionChoices input:checked')].map(input=>text(input.value));
    const restore=()=>{const applied=new Set(selectedSubscriptions(w));for(const input of box.querySelectorAll('#v9SubscriptionChoices input'))input.checked=applied.has(text(input.value));};
    box.querySelector('.v9-sub-apply')?.addEventListener('click',()=>{saveSelectedSubscriptions(w,selectedIds());w.compare();});
    box.querySelector('.v9-sub-cancel')?.addEventListener('click',restore);
    box.querySelector('.v9-sub-none')?.addEventListener('click',()=>{saveSelectedSubscriptions(w,[]);w.compare();});
  }

  function rankingWeights(mode){if(mode==='price')return{price:.7,distance:.3};if(mode==='distance')return{price:.3,distance:.7};return{price:.5,distance:.5};}
  function rankRows(rows,mode='balanced',limit=20){
    const available=(rows||[]).filter(x=>Number.isFinite(x.total)&&Number.isFinite(x.distanceKm));
    const unknown=(rows||[]).filter(x=>!Number.isFinite(x.total)&&Number.isFinite(x.distanceKm)).sort((a,b)=>a.distanceKm-b.distanceKm);
    if(mode==='costPerKm'){
      const withCost=available.filter(x=>Number.isFinite(x.costPerKm)),withoutCost=available.filter(x=>!Number.isFinite(x.costPerKm));
      withCost.sort((a,b)=>a.costPerKm-b.costPerKm||a.total-b.total||a.distanceKm-b.distanceKm||text(a.station?.name).localeCompare(text(b.station?.name),'fr'));
      return withCost.concat(withoutCost,unknown).slice(0,limit);
    }
    if(!available.length)return unknown.slice(0,limit);
    const costs=available.map(x=>x.total),distances=available.map(x=>x.distanceKm),minC=Math.min(...costs),maxC=Math.max(...costs),minD=Math.min(...distances),maxD=Math.max(...distances),w=rankingWeights(mode);
    for(const row of available){const cn=maxC===minC?0:(row.total-minC)/(maxC-minC),dn=maxD===minD?0:(row.distanceKm-minD)/(maxD-minD);row.shellScore=w.price*cn+w.distance*dn;}
    available.sort((a,b)=>a.shellScore-b.shellScore||a.total-b.total||a.distanceKm-b.distanceKm||text(a.station?.name).localeCompare(text(b.station?.name),'fr'));
    return available.concat(unknown).slice(0,limit);
  }
  function combineDateTime(date,time,startValue=null){
    if(!date||!time)return null;
    const midnight=text(time)==='24:00',normalized=midnight?'00:00':text(time);
    let d=new Date(date+'T'+normalized+':00');
    if(!Number.isFinite(d.getTime()))return null;
    if(midnight)d=new Date(d.getTime()+24*60*60*1000);
    if(startValue){const start=new Date(startValue);if(Number.isFinite(start.getTime())&&d<=start)d=new Date(d.getTime()+24*60*60*1000);}
    return d.toISOString();
  }
  function dcCurve(condition='normal',profile='realistic'){
    const cf=condition==='warm'?1:(condition==='cold'?.68:.86),pf=profile==='optimistic'?1.08:(profile==='conservative'?.88:1);
    return V7_DC_POINTS.map(([soc,powerKw])=>({soc,powerKw:Math.max(3,powerKw*cf*pf)}));
  }
  function readInputs(w){
    const get=id=>w.document.getElementById(id),date=get('simDate')?.value||'',time=get('simTime')?.value||'',unplug=get('simUnplugTime')?.value||'',startAt=combineDateTime(date,time),disconnectAt=unplug?combineDateTime(date,unplug,startAt):null;
    const rawRadius=text(get('simMaxDistance')?.value),radius=rawRadius===''?0:Math.max(0,num(rawRadius)||0);
    const operatorSelect=get('simOperatorFilter'),selectedOperatorIds=operatorSelect?.multiple?[...operatorSelect.selectedOptions].map(option=>text(option.value)).filter(Boolean):(text(operatorSelect?.value)?[text(operatorSelect.value)]:[]),operatorMode=operatorSelect?.dataset?.v9Mode||(selectedOperatorIds.length?'selected':'all'),operatorIds=operatorMode==='all'?[]:operatorMode==='tesla'?['tesla']:selectedOperatorIds;
    const powerSelect=get('simPowerType'),acCheckbox=get('simPowerAc'),dcCheckbox=get('simPowerDc'),connectorKinds=acCheckbox&&dcCheckbox?[...(acCheckbox.checked?['AC']:[]),...(dcCheckbox.checked?['DC']:[])]:powerSelect?.multiple?[...powerSelect.selectedOptions].map(option=>text(option.value)).filter(v=>v==='AC'||v==='DC'):(text(powerSelect?.value)&&text(powerSelect?.value)!=='all'?[text(powerSelect.value)]:[]);
    const minPowerInput=num(get('simMinPowerKw')?.value),maxPowerInput=num(get('simMaxPowerKw')?.value);
    const minPowerKw=minPowerInput!=null?Math.max(1,minPowerInput):null,maxPowerKw=maxPowerInput!=null?Math.max(1,maxPowerInput):null;
    return{startSoc:num(get('simNow')?.value),targetSoc:num(get('simTarget')?.value),date,time,startAt,disconnectAt,condition:get('simCondition')?.value||'normal',profile:get('simProfile')?.value||'realistic',operatorMode,operatorIds,connectorKinds,minPowerKw,maxPowerKw,rankingMode:get('simRanking')?.value||'balanced',radiusKm:radius,originText:text(get('simOrigin')?.value)};
  }
  function buildSession(input){return{startSoc:input.startSoc,targetSoc:input.targetSoc,startAt:input.startAt,disconnectAt:input.disconnectAt,targetCurrency:'EUR',batteryCapacityKwh:75,consumptionKwhPer100Km:15,vehicleMaxAcKw:11,vehicleMaxDcKw:250,chargeEfficiency:.92,chargeCurve:dcCurve(input.condition,input.profile)};}
  function diagnosticStore(w,event){try{const key='tccV9ProductionShellDiagnosticsV1',rows=JSON.parse(w.localStorage.getItem(key)||'[]');rows.unshift({...event,at:new Date().toISOString()});w.localStorage.setItem(key,JSON.stringify(rows.slice(0,20)));}catch(_){}}
  async function countryCodeForOrigin(w,origin){
    const cacheKey=`tcc-v9-country:${Number(origin.lat).toFixed(3)},${Number(origin.lon).toFixed(3)}`;
    try{const cached=w.sessionStorage.getItem(cacheKey);if(cached)return cached;}catch(_){ }
    const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(origin.lat)}&lon=${encodeURIComponent(origin.lon)}`;
    const response=await w.fetch(url,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`country lookup ${response.status}`);const data=await response.json();const code=text(data?.address?.country_code).toUpperCase();if(!/^[A-Z]{2}$/.test(code))throw new Error('country unavailable');
    try{w.sessionStorage.setItem(cacheKey,code);}catch(_){ }return code;
  }
  function adapters(w){return{teslaJson:w.TCCV9Adapters?.teslaJson,nationalCompact:w.TCCV9Adapters?.nationalCompact,directOffers:w.TCCV9Adapters?.directOffers,legacyDirectTariffs:w.TCCV9Adapters?.legacyDirectTariffs,legacyDirectStations:w.TCCV9Adapters?.legacyDirectStations,franceEmspCompact:w.TCCV9Adapters?.franceEmspCompact,franceCrosswalk:w.TCCV9Adapters?.franceCrosswalk,franceIrveStatus:w.TCCV9Adapters?.franceIrveStatus,moroccoPublic:w.TCCV9Adapters?.moroccoPublic,moroccoKilowattTariff:w.TCCV9Adapters?.moroccoKilowattTariff};}
  async function createEngine(w,cfg){
    if(!w.TCCV9RuntimeEngine||!w.TCCV9BrowserLoaders||!w.TCCV9BrowserRouting)throw new Error('V9 runtime dependency missing');
    const base=String(cfg.runtimeBase||'.').replace(/\/$/,''),[registry,vehicleProfiles]=await Promise.all([
      w.fetch(`${base}/data/v9/source-registry.json`,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(`registry ${r.status}`);return r.json();}),
      w.fetch(`${base}/data/v9/vehicle-profiles.json`,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(`vehicle profiles ${r.status}`);return r.json();})
    ]);
    const exchangeFallback={rates:{EUR:1,CHF:.945922,GBP:.85799,NOK:10.836693,SEK:11.322245,DKK:7.475513,PLN:4.372226,CZK:24.39362,HUF:367.109795,RON:5.275231,BGN:1.95583,MAD:10.96131,DZD:152.302423,TND:3.359272}};
    const exchangeUrl=new URL('../data/exchange_rates.json',w.location.href).toString();
    const exchange=await w.fetch(exchangeUrl,{cache:'no-cache'}).then(r=>r.ok?r.json():exchangeFallback).catch(()=>exchangeFallback);
    const loaders=w.TCCV9BrowserLoaders.createRegistryLoaders({registry,basePath:base,adapters:adapters(w)}),routeProvider=w.TCCV9BrowserRouting.osrmProvider();
    const engine=w.TCCV9RuntimeEngine.createEngine({registry,loaders,routeProvider,vehicleProfiles});
    engine.__tccFxRates=exchange?.rates||{};
    return engine;
  }
  function rowsFromArea(area){return(area.rankedStations||area.stations||[]).map(st=>{const evaluation=area.sessionEvaluations?.[st.id],score=area.stationScores?.[st.id],route=area.routes?.byStationId?.[st.id];return{station:st,evaluation,score,route,total:num(evaluation?.best?.total),costPerKm:num(evaluation?.best?.costPerRecoveredKm),recoveredKm:num(evaluation?.recoveredKm??evaluation?.best?.result?.recoveredKm),distanceKm:num(score?.distanceKm??route?.distanceKm)};});}
  function maxPower(st){let max=0;for(const evse of st?.evses||[])for(const c of evse?.connectors||[])max=Math.max(max,num(c?.powerKw)||0);return max;}
  function connectorKind(c={}){const raw=text(c.kind||c.currentType||c.powerType||c.plugName).toUpperCase();if(raw.includes('DC')||raw.includes('CCS')||raw.includes('CHADEMO'))return'DC';if(raw.includes('AC')||raw.includes('TYPE2')||raw.includes('TYPE 2'))return'AC';const power=num(c.powerKw);return power!=null&&power>22?'DC':'AC';}
  function powerLines(row){
    if(row?.powerLine)return[row.powerLine];
    const map=new Map(),station=row?.station||{};
    for(const [evseIndex,evse] of (station.evses||[]).entries())for(const connector of evse.connectors||[]){
      const power=num(connector.powerKw??connector.power??evse.powerKw);if(power==null||power<=0)continue;
      const kind=connectorKind(connector),key=kind+':'+power,current=map.get(key)||{kind,powerKw:power,evseIds:new Set()};
      current.evseIds.add(text(evse.id||evse.evseId||evse.idTag)||'evse-'+evseIndex);map.set(key,current);
    }
    return [...map.values()].map(line=>({kind:line.kind,powerKw:line.powerKw,count:line.evseIds.size})).sort((a,b)=>a.kind.localeCompare(b.kind)||b.powerKw-a.powerKw);
  }
  function formatMinutes(value){const n=num(value);if(n==null)return'—';const total=Math.max(0,Math.round(n)),h=Math.floor(total/60),m=total%60;return h?h+' h '+String(m).padStart(2,'0')+' min':m+' min';}
  function formatRate(value,currency,unit){const n=num(value);if(n==null)return null;return Number(n).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:3})+' '+text(currency||'EUR').toUpperCase()+'/'+unit;}
  function tariffRateLabels(offer){
    const pricing=offer?.pricing||{},rules=Array.isArray(pricing.rules)?pricing.rules:[],labels=[],seen=new Set();
    const fields=['pricePerKwh','pricePerMinute','chargePerMinute','chargingTimePerMinuteEur','connectedTimePerMinuteEur','idlePerMinute','connectionFee','sessionFeeEur','connectedTimeComponentEur','connectedTimeBlockEur'];
    const positive=rule=>fields.some(key=>(num(rule?.[key])??0)>0)||(Array.isArray(rule?.ocpiDurationBands)&&rule.ocpiDurationBands.some(b=>(num(b?.[3])??0)>0));
    const zeroPlaceholder=rule=>{
      const values=fields.map(key=>num(rule?.[key])).filter(value=>value!=null);
      return values.length>0&&values.every(value=>value===0)&&!positive(rule)&&
        !(Array.isArray(rule?.ocpiDurationBands)&&rule.ocpiDurationBands.some(b=>(num(b?.[3])??0)>0));
    };
    const hasPricedWindow=rules.some(rule=>rule?.scope!=='allDay'&&positive(rule));
    const add=(value,unit,currency,qualifier='')=>{
      const label=formatRate(value,currency,unit);if(!label)return;
      const full=label+qualifier;if(!seen.has(full)){seen.add(full);labels.push(full);}
    };
    for(const rule of rules){
      if(hasPricedWindow&&rule?.scope==='allDay'&&zeroPlaceholder(rule))continue;
      const currency=rule?.currency||pricing.currency||offer?.currency;
      const window=rule?.scope==='allDay'?'':' ('+text(rule?.start||'')+'–'+text(rule?.end||'')+')';
      add(rule?.pricePerKwh,'kWh',currency,window);
      add(rule?.pricePerMinute,'min',currency,' connecté'+window);
      add(rule?.chargePerMinute??rule?.chargingTimePerMinuteEur,'min',currency,' charge'+window);
      add(rule?.connectedTimePerMinuteEur,'min',currency,' connecté'+window);
      add(rule?.idlePerMinute,'min',currency,' après charge'+window);
    }
    add(pricing.pricePerKwh,'kWh',pricing.currency||offer?.currency);
    add(pricing.pricePerMinute,'min',pricing.currency||offer?.currency,' connecté');
    add(pricing.chargePerMinute??pricing.chargingTimePerMinuteEur,'min',pricing.currency||offer?.currency,' charge');
    return labels;
  }
  function baseTariffsForPower(row,line){
    const station=row?.station||{},out=[],seen=new Set(),connectors=[];
    for(const evse of station.evses||[])for(const connector of evse.connectors||[]){
      const power=num(connector.powerKw??connector.power??evse.powerKw);
      if(power!=null&&Math.abs(power-line.powerKw)<1e-9&&connectorKind(connector)===line.kind)connectors.push(connector);
    }
    const connectorIds=new Set(connectors.map(c=>text(c.id||c.connectorId)).filter(Boolean));
    const plugNames=new Set(connectors.map(c=>text(c.plugName||c.type).toUpperCase()).filter(Boolean));
    for(const offer of station.offers||[]){
      const kinds=Array.isArray(offer?.connectorKinds)?offer.connectorKinds.map(v=>text(v).toUpperCase()).filter(Boolean):[];
      if(kinds.length&&!kinds.includes(text(line.kind).toUpperCase()))continue;
      const min=num(offer?.minPowerKw),max=num(offer?.maxPowerKw);
      if(min!=null&&line.powerKw<min-1e-9)continue;
      if(max!=null&&line.powerKw>max+1e-9)continue;
      const ids=(offer?.connectorIds||[]).map(text).filter(Boolean);
      if(ids.length&&![...connectorIds].some(id=>ids.includes(id)))continue;
      const plugs=(offer?.plugNames||[]).map(v=>text(v).toUpperCase()).filter(Boolean);
      if(plugs.length&&![...plugNames].some(name=>plugs.includes(name)))continue;
      const provider=text(offer?.provider||offer?.network||offer?.operator||'tarif');
      for(const rate of tariffRateLabels(offer)){
        const label=rate+' · '+provider;
        if(!seen.has(label)){seen.add(label);out.push(label);}
      }
    }
    return out.slice(0,6);
  }
  function evaluatedBaseTariffs(row){
    const station=row?.station||{},item=row?.evaluation?.best,labels=[];
    if(!item||!['cpo_direct','direct','subscription'].includes(text(item.kind).toLowerCase()))return labels;
    const offer=(station.offers||[]).find(candidate=>text(candidate?.id||candidate?.offerId)===text(item.offerId));
    const result=item.result||{},segments=[
      ...(result?.components?.segmentedPricing?.segments||[]),
      ...(result?.components?.energyTimeline?.segments||[])
    ];
    const rules=segments.map(segment=>segment?.rule).filter(Boolean);
    if(!rules.length&&result.matchedRule)rules.push(result.matchedRule);
    const effectiveOffer=offer||{currency:item.currency,pricing:{rules}};
    const rates=rules.length?tariffRateLabels({currency:item.currency||effectiveOffer.currency,pricing:{rules}}):tariffRateLabels(effectiveOffer);
    for(const rate of rates){const label=rate+' · '+text(item.provider||'tarif');if(!labels.includes(label))labels.push(label);}
    return labels;
  }
  function renderPowerLines(row){
    const lines=powerLines(row);if(!lines.length)return'<div class="small">Puissance non renseignée</div>';
    const applied=row?.evaluation?.best||null;
    const appliedRules=[];
    const matched=applied?.result?.matchedRule;
    if(matched)appliedRules.push(matched);
    for(const segment of [
      ...(applied?.result?.components?.segmentedPricing?.segments||[]),
      ...(applied?.result?.components?.energyTimeline?.segments||[]),
      ...(applied?.result?.components?.compactMinute?.segments||[])
    ]){if(segment?.rule)appliedRules.push(segment.rule);}
    const appliedLabels=appliedRules.length?tariffRateLabels({currency:applied.currency||'EUR',pricing:{rules:appliedRules}}):[];
    const appliedOffer=(row?.station?.offers||[]).find(offer=>text(offer?.id||offer?.offerId)===text(applied?.offerId));
    const hasTimeWindows=(appliedOffer?.pricing?.rules||[]).some(rule=>rule?.scope!=='allDay');
    return'<div class="v9-power-lines" style="margin-top:8px">'+lines.map(line=>{
      const fallback=applied&&!hasTimeWindows&&appliedOffer?tariffRateLabels(appliedOffer):[];
      const tariffs=[...new Set(appliedLabels.length?appliedLabels:fallback)];
      const provider=text(applied?.provider||'');
      const baseLine=tariffs.length
        ?'<div class="small" style="color:#c7d0d9">Base utilisée: '+tariffs.map(esc).join(' · ')+(provider?' · '+esc(provider):'')+'</div>'
        :row?.evaluation?.best
          ?'<div class="small" style="color:#c7d0d9">Tarif unitaire appliqué non détaillé · prix final ci-dessous</div>'
          :'<div class="small" style="color:#c7d0d9">Tarif de base non disponible</div>';
      return '<div class="small" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><span>'+esc(line.kind)+' · <b>'+line.powerKw+' kW</b>'+baseLine+'</span><span>'+line.count+' point(s)</span></div>';
    }).join('')+'</div>';
  }
  function renderMapSummary(w,area,rows){
    const engine=w.TCCV9MapPriceEngine;if(!engine)return;
    const host=w.document.getElementById('v9MapSummary')||w.document.createElement('section');host.id='v9MapSummary';host.className='box';host.style.cssText='margin:10px 0;background:#11151a;border:1px solid #28323d';
    const bestByStation=new Map();for(const row of rows||[]){const id=text(row?.station?.id||row?.station?.canonicalId||row?.station?.stationId);if(!id)continue;const current=bestByStation.get(id),cost=num(row?.costPerKm);if(!current||(cost!=null&&(num(current.costPerKm)==null||cost<num(current.costPerKm))))bestByStation.set(id,row);}
    const points=[...bestByStation.values()].filter(row=>Number.isFinite(Number(row?.station?.latitude))&&Number.isFinite(Number(row?.station?.longitude))),zoneRows=engine.summarizeZones(points,{precision:1}),visible=zoneRows.slice(0,12);
    host.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Résultats V9</b><div role="group" aria-label="Mode d’affichage"><button type="button" class="secondary v9-view-list" style="width:auto;padding:6px 10px">☷ Liste</button><button type="button" class="secondary v9-view-map" style="width:auto;padding:6px 10px">⌖ Carte</button></div></div><div class="small" style="margin-top:6px">Stations sur fond OpenStreetMap · les points proches sont regroupés · orange = tarif/km calculable.</div><div id="v9MapZones" style="display:none;margin-top:8px"><div class="v9-real-map" role="img" aria-label="Carte des stations V9 sur fond OpenStreetMap" style="position:relative;width:100%;height:380px;overflow:hidden;border:1px solid #34404c;border-radius:8px;background:#e5e3df;touch-action:none"><div class="v9-map-tiles" style="position:absolute;inset:0"></div><div class="v9-map-markers" style="position:absolute;inset:0;pointer-events:none"></div><div style="position:absolute;right:10px;top:10px;display:grid;gap:4px"><button type="button" class="v9-map-zoom-in" aria-label="Zoomer" style="width:34px;padding:5px;background:white;color:#111">+</button><button type="button" class="v9-map-zoom-out" aria-label="Dézoomer" style="width:34px;padding:5px;background:white;color:#111">−</button></div><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style="position:absolute;bottom:2px;right:4px;background:#ffffffdd;color:#222;font-size:10px">© OpenStreetMap</a></div><div class="small" style="margin-top:5px">Déplacez la carte ou zoomez ; sélectionnez un point pour voir ses tarifs.</div><div id="v9MapSelected" class="box" style="display:none;margin-top:8px"></div></div><div id="v9MapZoneSummary" style="display:none;margin-top:8px">'+(visible.length?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">'+visible.map(z=>'<div style="padding:8px;border-radius:8px;background:#1a222b"><b>'+engine.formatPricePerKm(z.bestPricePerKm)+'</b><div class="small">'+esc(z.bestStation?.name||'Zone')+' · '+z.pricedStationCount+'/'+z.stationCount+' tarifée(s)</div></div>').join('')+'</div>':'<div class="small">Aucun prix/km vérifiable dans cette zone.</div>')+'</div>';
    const results=w.document.getElementById('results');if(results&&host.parentNode!==results.parentNode)results.parentNode.insertBefore(host,results);
    const listButton=host.querySelector('.v9-view-list'),mapButton=host.querySelector('.v9-view-map'),zones=host.querySelector('#v9MapZones'),summary=host.querySelector('#v9MapZoneSummary'),selected=host.querySelector('#v9MapSelected'),canvas=host.querySelector('.v9-real-map'),tiles=host.querySelector('.v9-map-tiles'),markers=host.querySelector('.v9-map-markers');
    const project=(lat,lon,z)=>{const scale=256*2**z,clamped=Math.max(-85.0511,Math.min(85.0511,lat)),rad=clamped*Math.PI/180;return{x:(lon+180)/360*scale,y:(1-Math.log(Math.tan(rad)+1/Math.cos(rad))/Math.PI)/2*scale};};
    const unproject=(x,y,z)=>{const scale=256*2**z,n=Math.PI-2*Math.PI*y/scale;return{lat:180/Math.PI*Math.atan(Math.sinh(n)),lon:x/scale*360-180};};
    const lats=points.map(row=>Number(row.station.latitude)),lons=points.map(row=>Number(row.station.longitude));
    let center=points.length?{lat:(Math.min(...lats)+Math.max(...lats))/2,lon:(Math.min(...lons)+Math.max(...lons))/2}:{lat:Number(area?.query?.origin?.lat)||46.6,lon:Number(area?.query?.origin?.lon)||2.2},zoom=12,drag=null;
    const fit=()=>{if(!points.length)return;const width=Math.max(320,canvas?.clientWidth||640),height=Math.max(260,canvas?.clientHeight||380);for(let z=16;z>=3;z--){const p=points.map(row=>project(Number(row.station.latitude),Number(row.station.longitude),z));if(Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x))<width-70&&Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y))<height-70){zoom=z;break;}}};
    const draw=()=>{if(!canvas||!tiles||!markers||!canvas.clientWidth)return;const width=canvas.clientWidth,height=canvas.clientHeight,mid=project(center.lat,center.lon,zoom),left=mid.x-width/2,top=mid.y-height/2,world=2**zoom;let tileHtml='';for(let tx=Math.floor(left/256);tx<=Math.floor((left+width)/256);tx++)for(let ty=Math.floor(top/256);ty<=Math.floor((top+height)/256);ty++){if(ty<0||ty>=world)continue;const wrapped=((tx%world)+world)%world;tileHtml+='<img src="https://tile.openstreetmap.org/'+zoom+'/'+wrapped+'/'+ty+'.png" alt="" draggable="false" loading="lazy" style="position:absolute;left:'+(tx*256-left).toFixed(1)+'px;top:'+(ty*256-top).toFixed(1)+'px;width:256px;height:256px;max-width:none">';}tiles.innerHTML=tileHtml;
      const clusters=[];
      points.forEach((row,index)=>{const p=project(Number(row.station.latitude),Number(row.station.longitude),zoom),x=p.x-left,y=p.y-top;
        const group=clusters.find(item=>Math.hypot(item.x-x,item.y-y)<28);
        if(group)group.indices.push(index);else clusters.push({x,y,indices:[index]});
      });
      markers.innerHTML=clusters.map(group=>{const rows=group.indices.map(index=>points[index]),priced=rows.some(row=>num(row.costPerKm)!=null),count=group.indices.length,label=count===1?text(rows[0].station.name||'Station'):count+' stations proches';return'<button type="button" class="v9-map-marker" data-indices="'+group.indices.join(',')+'" title="'+esc(label)+'" aria-label="Sélectionner '+esc(label)+'" style="position:absolute;left:'+group.x.toFixed(1)+'px;top:'+group.y.toFixed(1)+'px;width:'+(count>1?'26':'19')+'px;height:'+(count>1?'26':'19')+'px;transform:translate(-50%,-50%);border:2px solid white;border-radius:50%;box-shadow:0 1px 5px #1118;background:'+(priced?'#f4a64a':'#8c9399')+';pointer-events:auto;cursor:pointer;padding:0;color:#111;font-size:11px;font-weight:700">'+(count>1?count:'')+'</button>';}).join('');
    };
    const setMode=mode=>{const map=mode==='map';if(zones)zones.style.display=map?'block':'none';if(summary)summary.style.display=map?'block':'none';if(results)results.style.display=map?'none':'';listButton?.classList.toggle('primary',!map);mapButton?.classList.toggle('primary',map);host.dataset.v9View=mode;if(map){fit();draw();}};
    const selectPoint=index=>{
      const row=points[index];if(!row||!selected)return;
      const st=row.station,price=num(row.costPerKm);
      selected.style.display='block';
      selected.innerHTML='<b>'+esc(st.name||'Station')+'</b><div class="small">'+esc(st.physicalOperator?.name||'Opérateur inconnu')+' · '+esc(row.powerLine?.kind||'')+' '+esc(row.powerLine?.powerKw||'')+' kW</div>'+renderTariffs(row.evaluation,st)+'<div class="small" style="margin-top:6px">'+(price==null?'Prix/km non disponible':esc(price.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})+' €/km'))+'</div><button type="button" class="secondary v9-map-open-row" style="width:auto;margin-top:8px">Voir la fiche dans la liste</button>';
      selected.querySelector('.v9-map-open-row')?.addEventListener('click',()=>{setMode('list');const card=[...(results?.querySelectorAll('.v9-result-card')||[])].find(item=>text(item.dataset.v9StationId)===text(st.id));card?.scrollIntoView?.({behavior:'smooth',block:'center'});});
      for(const marker of markers.querySelectorAll('.v9-map-marker'))marker.style.outline=marker.dataset.indices.split(',').includes(String(index))?'3px solid #fff':'none';
    };
    markers?.addEventListener('click',event=>{const marker=event.target.closest('.v9-map-marker');if(!marker)return;event.stopPropagation();
      const indices=marker.dataset.indices.split(',').map(Number).filter(Number.isInteger);
      if(indices.length===1){selectPoint(indices[0]);return;}
      selected.style.display='block';
      selected.innerHTML='<b>'+indices.length+' stations proches</b><div class="small">Choisis une station pour voir ses tarifs.</div><div style="display:grid;gap:4px;margin-top:8px">'+indices.map(index=>'<button type="button" class="secondary v9-map-choice" data-index="'+index+'" style="width:100%;text-align:left">'+esc(points[index].station.name||'Station')+'</button>').join('')+'</div>';
      selected.querySelectorAll('.v9-map-choice').forEach(button=>button.addEventListener('click',()=>selectPoint(Number(button.dataset.index))));
    });
    listButton?.addEventListener('click',()=>setMode('list'));mapButton?.addEventListener('click',()=>setMode('map'));
    host.querySelector('.v9-map-zoom-in')?.addEventListener('click',()=>{zoom=Math.min(18,zoom+1);draw();});host.querySelector('.v9-map-zoom-out')?.addEventListener('click',()=>{zoom=Math.max(2,zoom-1);draw();});
    canvas?.addEventListener('pointerdown',event=>{if(event.target.closest('button,a'))return;drag={x:event.clientX,y:event.clientY,center:project(center.lat,center.lon,zoom)};canvas.setPointerCapture?.(event.pointerId);});canvas?.addEventListener('pointermove',event=>{if(!drag)return;center=unproject(drag.center.x-(event.clientX-drag.x),drag.center.y-(event.clientY-drag.y),zoom);draw();});canvas?.addEventListener('pointerup',()=>{drag=null;});canvas?.addEventListener('pointercancel',()=>{drag=null;});
    canvas?.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(2,Math.min(18,zoom+(event.deltaY<0?1:-1)));draw();},{passive:false});
    if(w.ResizeObserver&&canvas){new w.ResizeObserver(()=>{if(host.dataset.v9View==='map')draw();}).observe(canvas);}
    setMode('list');
  }
  function formatCurrencyAmount(value,currency){
    const amount=num(value);if(amount==null)return null;
    const code=text(currency||'EUR').toUpperCase();
    const formatted=amount.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
    return code==='EUR'?formatted+' €':formatted+' '+code;
  }
  function offerPriceCategory(item){
    const provider=text(item?.provider).toLowerCase(),offerId=text(item?.offerId).toLowerCase(),kind=text(item?.kind).toLowerCase();
    if(text(item?.subscriptionId))return'subscription:'+text(item.subscriptionId);
    // Direct CPO tariffs stay in the Direct lane even when the operator name is Electra.
    if(kind!=='emsp'&&kind!=='roaming')return'direct';
    if(provider.includes('electroverse')||offerId.includes('electroverse'))return'electroverse';
    if(provider.includes('electra')||offerId.includes('electra'))return'electra';
    return null;
  }
  function renderTariffs(evaluation,station){
    if(isTeslaStation(station)){
      const item=[evaluation?.best,...(evaluation?.alternatives||[])].filter(row=>row&&num(row.total)!=null).sort((a,b)=>num(a.total)-num(b.total))[0];
      return item?'<div class="v9-tesla-price"><strong>Tesla</strong> · '+esc(formatCurrencyAmount(item.total,item.targetCurrency||'EUR'))+'</div>':'<div class="v9-tesla-price">Prix Tesla non disponible</div>';
    }
    const offers=[evaluation?.best,...(evaluation?.alternatives||[]),...(evaluation?.incomplete||[])].filter(Boolean);
    const subscriptions=[...new Map(offers.filter(item=>text(item.subscriptionId)).map(item=>[text(item.subscriptionId),{id:'subscription:'+text(item.subscriptionId),label:text(item.provider)||text(item.subscriptionId),color:'#f5d6a1'}])).values()];
    const categories=[
      {id:'direct',label:'Direct',color:'#f4a64a'},
      ...subscriptions,
      {id:'electra',label:'Electra',color:'#a8e8d4'},
      {id:'electroverse',label:'Electroverse',color:'#c9b3f4'}
    ];
    const picked=Object.fromEntries(categories.map(category=>[category.id,offers.filter(item=>offerPriceCategory(item)===category.id&&num(item.total)!=null).sort((a,b)=>num(a.total)-num(b.total))[0]||null]));
    const bestId=categories.map(category=>({id:category.id,total:num(picked[category.id]?.total)})).filter(item=>item.total!=null).sort((a,b)=>a.total-b.total)[0]?.id||null;
    return'<div class="v9-tariffs" aria-label="Comparaison des tarifs directs, abonnements et plateformes" style="display:grid;gap:6px;margin-top:8px">'+categories.map(category=>{
      const item=picked[category.id],best=category.id===bestId;
      let amount='Prix non disponible',provider=category.id==='electroverse'&&!offers.some(offer=>offerPriceCategory(offer)==='electroverse')?'Aucune correspondance Electroverse vérifiée pour cette station':'';
      if(item){
        const targetCurrency=text(item.targetCurrency||'EUR').toUpperCase(),nativeCurrency=text(item.currency||targetCurrency).toUpperCase(),nativeTotal=num(item.result?.totalEur);
        const showNative=nativeCurrency!==targetCurrency&&nativeTotal!=null;
        amount=showNative?formatCurrencyAmount(nativeTotal,nativeCurrency):formatCurrencyAmount(item.total,targetCurrency);
        if(showNative)amount+=' (≈ '+formatCurrencyAmount(item.total,targetCurrency)+')';
        provider=text(item.provider)||(text(item.subscriptionId)?'Abonnement sélectionné':'');
      }
      return'<div class="v9-tariff-row'+(best?' v9-best-tariff':'')+'" role="listitem" style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:3px 10px;padding:8px 10px;border:1px solid '+(best?'#fff':'#343a42')+';border-radius:8px;background:'+category.color+';color:#15171b;min-width:0;'+(best?'font-weight:800;box-shadow:0 0 0 2px #fff':'')+'">'+
        '<strong style="font-size:14px;line-height:1.3">'+esc(category.label)+(best?' · MEILLEUR TARIF':'')+'</strong>'+
        '<span style="font-size:15px;line-height:1.3;text-align:right">'+esc(amount)+'</span>'+
        (provider?'<span style="grid-column:1/-1;font-size:12px;line-height:1.3;opacity:.8;overflow-wrap:anywhere">'+esc(provider)+(text(item?.subscriptionId)?' · abonnement':'')+'</span>':'')+
      '</div>';
    }).join('')+'</div>';
  }
  function isTeslaStation(station){
    const operator=text(station?.physicalOperator?.name||station?.operator?.name||station?.operatorName).toLowerCase();
    const provenance=(station?.provenance||station?.sources||[]).map(item=>text(item?.sourceId||item?.id||item)).filter(Boolean);
    return operator.includes('tesla')||provenance.some(id=>/tesla|suc-tracker/i.test(id));
  }
  function stationBaseSource(station){
    const operator=text(station?.physicalOperator?.name||station?.operator?.name||station?.operatorName).toLowerCase();
    const provenance=(station?.provenance||station?.sources||[]).map(item=>text(item?.sourceId||item?.id||item)).filter(Boolean);
    if(isTeslaStation(station))return'TESLA · SuC Tracker';
    const labels={'france-national':'IRVE','spain-reve':'REVE','italy-pun':'PUN','switzerland-national':'Base nationale CH','germany-production-snapshot':'Base nationale DE','uk-production-open-feeds':'Open data UK','netherlands-dotnl-national':'DOT-NL','belgium-nap-national':'NAP Belgique','morocco-evgo-native':'EVgo MA','morocco-fastvolt-public':'FastVolt MA','morocco-kilowatt-public':'Kilowatt MA','morocco-totalenergies-hosts':'TotalEnergies MA'};
    const found=provenance.map(id=>labels[id]).filter(Boolean);
    if(found.length)return[...new Set(found)].join(' · ');
    const byCountry={FR:'IRVE',ES:'REVE',IT:'PUN',CH:'Base nationale CH',DE:'Base nationale DE',GB:'Open data UK',MA:'Base CPO Maroc',NL:'DOT-NL',BE:'NAP Belgique'};
    return byCountry[text(station?.countryCode).toUpperCase()]||'Source nationale';
  }
  function renderCostPerKm(row){
    const evaluation=row?.evaluation,best=evaluation?.best,cost=num(best?.costPerRecoveredKm),km=num(evaluation?.recoveredKm??row?.recoveredKm);
    if(cost==null)return'<div class="small warn">Coût au km récupéré : non calculable</div>';
    return'<div class="small">Coût au km récupéré : <b>'+cost.toLocaleString('fr-FR',{minimumFractionDigits:3,maximumFractionDigits:3})+' '+esc(best?.targetCurrency||'EUR')+'/km</b>'+(km!=null?' · '+km.toFixed(1)+' km récupérés':'')+'</div>';
  }

  function offerAppliesToEvseGroup(offer,evseTokens,connectorIds){
    const evseIds=(offer?.evseIds||[]).map(text).filter(Boolean),offerConnectorIds=(offer?.connectorIds||[]).map(text).filter(Boolean);
    if(evseIds.length&&![...evseTokens||[]].some(id=>evseIds.includes(text(id))))return false;
    if(offerConnectorIds.length&&![...connectorIds||[]].some(id=>offerConnectorIds.includes(text(id))))return false;
    return true;
  }
  function variantsByPower(w,rows,session,selectedSubscriptions=[]){
    const planner=w.TCCV9SessionPlannerEngine,sessionEngine=w.TCCV9SessionEngine,scoreEngine=w.TCCV9StationScoreEngine;
    if(!planner?.planStation||!sessionEngine?.evaluateStation||!sessionEngine?.offerMatchesChargingKind||!scoreEngine?.scoreStation)throw new Error('per-power pricing engines unavailable');
    const variants=[];
    for(const row of rows||[]){
      const station=row?.station||{},groups=new Map();
      for(const [evseIndex,evse] of (station.evses||[]).entries())for(const [connectorIndex,raw] of (evse.connectors||[]).entries()){
        const power=num(raw.powerKw??raw.power??evse.powerKw);if(power==null||power<=0)continue;
        const connector={...raw,powerKw:power},kind=connectorKind(connector),connectorId=text(connector.id||connector.connectorId)||null,plug=text(connector.plugName||connector.type)||null;
        const evseKey=text(evse.id||evse.evseId)||'evse-'+evseIndex,evseTokens=new Set([evseKey,text(evse.evseId),...(evse.aliases||[]).map(text),...(evse.pdcIds||[]).map(text)].filter(Boolean)),connectorTokens=new Set(connectorId?[connectorId]:[]);
        const matching=(station.offers||[]).filter(offer=>offerAppliesToEvseGroup(offer,evseTokens,connectorTokens)&&sessionEngine.offerMatchesChargingKind(offer,kind,power,plug,connectorId)).map(offer=>text(offer.id||offer.offerId)||JSON.stringify(offer)).sort();
        const key=[kind,power,matching.join(',')].join('|');
        const group=groups.get(key)||{kind,powerKw:power,offerIds:matching,evseConnectors:new Map(),evseKeys:new Set(),evseTokens:new Set(),connectorIds:new Set()};
        const connectors=group.evseConnectors.get(evseIndex)||[];
        connectors.push({connectorIndex,connector});group.evseConnectors.set(evseIndex,connectors);group.evseKeys.add(evseKey);
        evseTokens.forEach(id=>group.evseTokens.add(id));connectorTokens.forEach(id=>group.connectorIds.add(id));groups.set(key,group);
      }
      for(const group of groups.values()){
        const evses=[];
        for(const [evseIndex,connectors] of group.evseConnectors){
          const original=station.evses[evseIndex];
          evses.push({...original,connectors:connectors.map(item=>item.connector)});
        }
        const scopedOffers=(station.offers||[]).filter(offer=>offerAppliesToEvseGroup(offer,group.evseTokens,group.connectorIds));
        const variant={...station,evses,offers:scopedOffers},routeMap={[text(station.id||station.canonicalId||station.stationId)]:row.route||{}};
        const plan=planner.planStation(variant,session,{route:{byStationId:routeMap}});
        const evaluation=sessionEngine.evaluateStation(variant,plan.effectiveSession,{selectedSubscriptions,targetCurrency:session.targetCurrency||'EUR',fxRates:session.fxRates||{}});
        const score=scoreEngine.scoreStation(variant,evaluation,plan.effectiveSession,{route:{byStationId:routeMap},plan});
        const line={kind:group.kind,powerKw:group.powerKw,count:group.evseKeys.size};
        variants.push({...row,station:variant,powerLine:line,evaluation,score,total:num(evaluation?.best?.total),costPerKm:num(evaluation?.best?.costPerRecoveredKm),recoveredKm:num(evaluation?.recoveredKm),displayKey:[text(station.name),line.kind,line.powerKw,group.offerIds.join(',')].join('|')});
      }
    }
    return variants;
  }

  function siteKey(st,power){
    const normalize=value=>text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const latitude=num(st?.latitude),longitude=num(st?.longitude);
    const place=isTeslaStation(st)&&latitude!=null&&longitude!=null
      ?'tesla-site|'+latitude.toFixed(3)+'|'+longitude.toFixed(3)
      :(normalize(st?.address)||normalize(st?.name))+'|'+latitude?.toFixed(3)+'|'+longitude?.toFixed(3);
    return [text(st?.countryCode),normalize(st?.physicalOperator?.name),place,power].join('|');
  }
  function powerBuckets(st){
    const buckets=new Map();
    for(const evse of st?.evses||[]){
      const pdcs=(evse?.pdcIds||[]).map(text).filter(Boolean);
      const identity=text(evse?.aliases?.[0]||evse?.id);
      const count=Math.max(1,Math.floor(num(evse?.stalls)||1));
      const ids=pdcs.length?pdcs:Array.from({length:count},(_,index)=>`${identity}:${index}`);
      for(const connector of evse?.connectors||[]){
        const power=num(connector?.powerKw);
        if(power==null||power<=0)continue;
        if(!buckets.has(power))buckets.set(power,new Set());
        for(const id of ids)buckets.get(power).add(id);
      }
    }
    if(!buckets.size)buckets.set(0,new Set());
    return buckets;
  }
  function energyOnlyEvaluation(row,power){
    const evaluations=[row.evaluation?.best,...(row.evaluation?.alternatives||[])].filter(Boolean);
    const connectors=(row.station?.evses||[]).flatMap(evse=>evse.connectors||[]).filter(connector=>num(connector.powerKw)===power);
    for(const evaluated of evaluations){
      const offer=(row.station?.offers||[]).find(offer=>text(offer.id)===text(evaluated.offerId)&&offer.metadata?.energyOnly===true);
      if(!offer)continue;
      const kinds=(offer.connectorKinds||[]).map(kind=>text(kind).toUpperCase());
      const eligible=connectors.some(connector=>{
        const kind=text(connector.kind).toUpperCase(),value=num(connector.powerKw);
        return (!kinds.length||kinds.includes(kind))&&(num(offer.minPowerKw)==null||value>=num(offer.minPowerKw))&&(num(offer.maxPowerKw)==null||value<=num(offer.maxPowerKw));
      });
      if(eligible)return{...row.evaluation,best:evaluated,alternatives:[],incomplete:[]};
    }
    return null;
  }
  function stationAtPower(station,power){
    const evses=(station?.evses||[]).map(evse=>({...evse,connectors:(evse.connectors||[]).filter(connector=>num(connector.powerKw)===power)})).filter(evse=>evse.connectors.length);
    return {...station,evses};
  }
  function evaluatePower(row,power,context){
    const station=stationAtPower(row.station,power),engine=context.engine,area=context.area;
    const session=area?.effectiveSession,route=area?.routes;
    if(!station.evses.length||!session||!engine?.planStation||!engine?.evaluateStation)return null;
    const plan=engine.planStation(station,session,{route});
    const evaluation=engine.evaluateStation(station,plan.effectiveSession||session,{
      selectedSubscriptions:context.selectedSubscriptions||[],targetCurrency:session.targetCurrency||'EUR',fxRates:session.fxRates||{}
    });
    const score=engine.scoreStation?.(station,evaluation,plan.effectiveSession||session,{route,plan})||row.score;
    return{...row,station,evaluation,score,total:num(evaluation.best?.total),distanceKm:num(score?.distanceKm??row.distanceKm)};
  }
  function combinedEvaluation(group){
    const selected=group.evaluation;
    const all=group.evaluations.flatMap(evaluation=>[evaluation?.best,...(evaluation?.alternatives||[]),...(evaluation?.incomplete||[])]).filter(Boolean);
    const unique=new Map();
    for(const offer of all){
      const key=[text(offer.provider),text(offer.kind),text(offer.subscriptionId),Number.isFinite(offer.total)?Number(offer.total).toFixed(6):text(offer.result?.reason)].join('|');
      if(!unique.has(key))unique.set(key,offer);
    }
    const values=[...unique.values()];
    const best=selected?.best||null;
    const bestKey=best&&[text(best.provider),text(best.kind),text(best.subscriptionId),Number.isFinite(best.total)?Number(best.total).toFixed(6):text(best.result?.reason)].join('|');
    return{...(selected||{}),best,alternatives:values.filter(offer=>offer.comparable&&[text(offer.provider),text(offer.kind),text(offer.subscriptionId),Number.isFinite(offer.total)?Number(offer.total).toFixed(6):text(offer.result?.reason)].join('|')!==bestKey),incomplete:values.filter(offer=>!offer.comparable)};
  }
  function groupRows(rows,context){
    const groups=new Map();
    for(const row of rows||[]){
      for(const [power,ids] of powerBuckets(row.station)){
        const key=siteKey(row.station,power)+'|'+connectorKind((row.station?.evses||[]).flatMap(evse=>evse.connectors||[]).find(connector=>num(connector.powerKw)===power)||{}),selectedConnector=text(row.evaluation?.chargingConnectorId);
        const matchingConnector=selectedConnector&&(row.station?.evses||[]).some(evse=>(evse.connectors||[]).some(connector=>text(connector.id)===selectedConnector&&num(connector.powerKw)===power));
        const scoped=context?evaluatePower(row,power,context):null;
        const evaluated=matchingConnector||(!selectedConnector&&power===maxPower(row.station));
        const evaluation=scoped?.evaluation||(evaluated?row.evaluation:energyOnlyEvaluation(row,power));
        const candidate={...(scoped||row),displayPowerKw:power,evaluation,total:num(evaluation?.best?.total)};
        let group=groups.get(key);
        if(!group){group={...candidate,pointIds:new Set(),pointCount:0,groupedStationCount:0,evaluations:[]};groups.set(key,group);}
        if(evaluation)group.evaluations.push(evaluation);
        group.groupedStationCount++;
        if(isTeslaStation(row.station))group.pointCount=Math.max(group.pointCount,ids.size||1);
        else if(ids.size){for(const id of ids)group.pointIds.add(id);}else group.pointCount++;
        if((Number.isFinite(candidate.total)&&(!Number.isFinite(group.total)||candidate.total<group.total))||(!Number.isFinite(group.total)&&candidate.distanceKm<group.distanceKm))Object.assign(group,{station:candidate.station,evaluation:candidate.evaluation,score:candidate.score,route:candidate.route,total:candidate.total,distanceKm:candidate.distanceKm});
      }
    }
    return [...groups.values()].map(group=>{group.pointCount+=group.pointIds.size;delete group.pointIds;group.evaluation=combinedEvaluation(group);delete group.evaluations;return group;});
  }

  function renderCandidate(w,area,rows,originLabel){
    const results=w.document.getElementById('results'),routeStatus=w.document.getElementById('routeStatus');if(!results)throw new Error('stable results container missing');
    if(routeStatus)routeStatus.innerHTML='<span class="good">Moteur V9 canary · '+rows.length+' borne(s) classée(s) depuis '+esc(originLabel)+'.</span>';
    if(!rows.length){renderMapSummary(w,area,rows);results.innerHTML='<div class="warn">Aucune borne V9 exploitable pour cette recherche. Retour au moteur stable recommandé.</div>';return;}
    results.innerHTML='<div class="small box"><b>Moteur V9</b> · une ligne par puissance et tarif calculé.</div>'+rows.map((row,i)=>{const st=row.station,best=row.evaluation?.best,score=row.score,route=row.route;return '<div class="box v9-result-card" data-v9-station-id="'+esc(st.id||'')+'" style="margin-top:10px"><b>'+(i+1)+'. '+esc(st.name||'Borne')+'</b><div class="small">'+esc(st.physicalOperator?.name||'Opérateur inconnu')+'</div><div class="small" style="color:#9fa9b5">Base source : '+esc(stationBaseSource(st))+'</div>'+renderPowerLines(row)+'<div style="margin-top:6px">'+renderTariffs(row.evaluation,st)+(Number.isFinite(row.distanceKm)?' · '+row.distanceKm.toFixed(1)+' km':'')+'</div>'+renderCostPerKm(row)+(score?'<div class="small">Charge '+formatMinutes(score.chargingMinutes)+' · trajet '+formatMinutes(score.driveMinutes)+' · total '+formatMinutes(score.totalTimeMinutes)+(score.chargeModel?.averagePowerKw!=null?' · moyenne '+Number(score.chargeModel.averagePowerKw).toFixed(1)+' kW':'')+'</div>':'')+(route?.provider?'<div class="small">Routage '+esc(route.provider)+'</div>':'')+'</div>';}).join('');
    renderMapSummary(w,area,rows);
  }


  function areaFiltersFromInputs(input){
    return{
      ...(input?.operatorIds?.length?{operatorIds:input.operatorIds.slice()}:{}),
      ...(input?.connectorKinds?.length?{connectorKinds:input.connectorKinds.slice()}:{}),
      ...(input?.minPowerKw!=null?{minPowerKw:Number(input.minPowerKw)}:{}),
      ...(input?.maxPowerKw!=null?{maxPowerKw:Number(input.maxPowerKw)}:{})
    };
  }
  function variantMatchesFilters(row,input={}){
    const line=row?.powerLine||{},kind=text(line.kind).toUpperCase(),power=num(line.powerKw);
    return(!input.connectorKinds?.length||input.connectorKinds.includes(kind))&&
      (input.minPowerKw==null||power!=null&&power>=input.minPowerKw)&&
      (input.maxPowerKw==null||power!=null&&power<=input.maxPowerKw);
  }
  async function executeV9(w,engine,cfg,input){
    if(!(input.targetSoc>input.startSoc))throw new Error('invalid SOC target');if(!input.originText)throw new Error('origin required');
    if(cfg.mode==='candidate'&&!(input.radiusKm>0))throw new Error('unbounded radius not production-equivalent');
    if(typeof w.resolveOrigin!=='function')throw new Error('stable origin resolver unavailable');const origin=await w.resolveOrigin(input.originText),countryCode=await countryCodeForOrigin(w,origin),scope=cfg.engineScopeCountries||[];
    if(scope.length&&!scope.includes(countryCode))throw new Error(`country outside V9 shell scope: ${countryCode}`);
    const queryRadius=input.radiusKm>0?input.radiusKm:20,filters=areaFiltersFromInputs(input),session=buildSession(input);session.fxRates=engine.__tccFxRates||{};
    const selected=selectedSubscriptions(w);
    const area=await engine.queryArea({countryCode,origin:{lat:Number(origin.lat),lon:Number(origin.lon)},radiusKm:queryRadius,filters,session,vehicleProfileId:'generic-ev-preview',selectedSubscriptions:selected,subscriptionFilters:{countryCodes:[countryCode],coverageMode:'any'},routingBudget:80,perOperatorFloor:2,stationLimit:500,sortBy:'finalCost'});
    const baseSession=area.effectiveSession||session,expanded=variantsByPower(w,rowsFromArea(area),baseSession,selected),eligible=expanded.filter(row=>variantMatchesFilters(row,input)),grouped=groupRows(eligible).map(row=>({...row,powerLine:{kind:connectorKind((row.station.evses||[]).flatMap(evse=>evse.connectors||[])[0]||{}),powerKw:row.displayPowerKw,count:row.pointCount}})),rows=rankRows(grouped,input.rankingMode,20);return{area,rows,origin,countryCode,queryRadius,partialRadius:!(input.radiusKm>0),selectedSubscriptions:selected};
  }
  function normalizeLegacyChrome(w){
    const d=w.document;
    d.documentElement.dataset.tccVersion='v9';
    d.title='Tesla Charge Companion V9';
    const heading=d.querySelector('header h1,h1');
    if(heading)heading.textContent='⚡ Tesla Charge Companion V9';
    const versionNodes=[...d.querySelectorAll('header *,body *')].filter(el=>el.children.length===0);
    const version=versionNodes.find(el=>/Version 7\.3 Stable/i.test(text(el.textContent)));
    if(version)version.textContent='Version V9 · snapshot figé · comparaison de prix';
    const hideLegacyNlBlocks=()=>{
      const refreshButtons=[...d.querySelectorAll('button')].filter(btn=>/recharger les données|recharger.*pays[-\s]?bas/i.test(text(btn.textContent)));
      refreshButtons.forEach(btn=>{
        const obsoleteCard=btn.closest('.card');
        if(obsoleteCard&&obsoleteCard!==d.querySelector('#compare > .card'))obsoleteCard.remove();
        else btn.remove();
      });
      [...d.querySelectorAll('.small,p,small')].filter(el=>/snapshot DOT[-\s]?NL|données Pays[-\s]?Bas|données des Pays[-\s]?Bas/i.test(text(el.textContent))).forEach(el=>{
        const obsoleteCard=el.closest('.card');
        if(obsoleteCard&&obsoleteCard!==d.querySelector('#compare > .card'))obsoleteCard.remove();
        else el.remove();
      });
    };
    hideLegacyNlBlocks();
    if(typeof w.MutationObserver==='function'){
      const observer=new w.MutationObserver(hideLegacyNlBlocks);
      observer.observe(d.body,{childList:true,subtree:true});
    }
    const legacyTabs=[...d.querySelectorAll('button')].filter(btn=>/^(Bornes|Ajouter \/ modifier|Devises|Synchronisation)$/i.test(text(btn.textContent)));
    legacyTabs.forEach(btn=>{btn.hidden=true;btn.style.display='none';});
  }
  function installUsageHelpTab(w){
    const d=w.document,nav=d.querySelector('header nav'),main=d.querySelector('main');
    if(!nav||!main||d.getElementById('v9UsageHelpTab'))return;
    const button=d.createElement('button');button.id='v9UsageHelpTab';button.type='button';button.textContent='Mode d’emploi';
    button.setAttribute('aria-controls','v9UsageHelp');button.setAttribute('aria-label','Ouvrir le mode d’emploi');
    const panel=d.createElement('section');panel.id='v9UsageHelp';panel.className='panel';
    panel.innerHTML='<div class="card"><h2>Mode d’emploi</h2>'+
      '<h3>1. Préparer la recherche</h3><p>Saisis une adresse de départ ou utilise « Position actuelle », puis règle le niveau de batterie, l’objectif et le profil de calcul.</p>'+
      '<h3>2. Choisir les réseaux</h3><p>« Tesla uniquement » limite la recherche au réseau Tesla. « Tous les réseaux » retire le filtre. Après une recherche, la liste déroulante Opérateurs se met à jour et permet de choisir un ou plusieurs réseaux.</p>'+
      '<h3>3. Régler les filtres et lancer le calcul</h3><p>Choisis le type AC/DC, la puissance minimale et maximale, la distance et la priorité de classement. Appuie sur « Simuler » pour afficher les résultats.</p>'+
      '<h3>4. Lire les prix</h3><p>Chaque puissance présente toujours Direct (ou l’abonnement sélectionné), Electra et Electroverse, dans cet ordre. « Prix non disponible » signifie qu’aucun prix comparable et validé n’est disponible dans cette catégorie. Le tarif le plus bas est mis en évidence.</p>'+
      '<h3>5. Comprendre une fiche</h3><p>Chaque fiche précise la base source de la station et le tarif de base retenu pour le calcul. Les stations sont séparées par type et puissance. Le coût par kilomètre récupéré aide au classement; le routage détaillé se lance à la demande.</p>'+
      '<h3>6. Fraîcheur des données</h3><p>En bas de page, consulte la dernière date fournie par les métadonnées de chaque base. Si la source ne donne pas de date, la page indique la date de révision du snapshot épinglé.</p>'+
      '<p class="small">Les états de disponibilité en temps réel ne sont pas utilisés. Les tarifs non validés ou non comparables restent signalés comme indisponibles.</p></div>';
    main.appendChild(panel);
    button.addEventListener('click',()=>{
      d.querySelectorAll('nav button,.panel').forEach(el=>el.classList.remove('active'));
      button.classList.add('active');panel.classList.add('active');
    });
    nav.querySelectorAll('button').forEach(tab=>tab.addEventListener('click',()=>{
      if(tab===button)return;
      button.classList.remove('active');panel.classList.remove('active');
      const targetId=tab.getAttribute('data-tab');
      const targetNode=targetId?d.getElementById(targetId):null;
      const target=targetNode?.classList.contains('panel')?targetNode:
        targetNode?.closest('.panel')||targetNode?.querySelector('.panel');
      if(target)d.querySelectorAll('.panel').forEach(item=>item.classList.toggle('active',item===target));
    }));
    nav.appendChild(button);
  }

  function installBaseUpdatesFooter(w,cfg){
    const d=w.document;if(d.getElementById('v9BaseUpdates'))return;
    const footer=d.createElement('footer');footer.id='v9BaseUpdates';footer.className='card small';
    footer.style.cssText='max-width:720px;margin:18px auto 24px;padding:12px 16px;box-sizing:border-box';
    footer.innerHTML='<details><summary><b>Dates de mise à jour des bases TCC</b></summary><p>Chargement des dates des sources…</p></details>';
    (d.querySelector('main')||d.body).appendChild(footer);
    const base=String(cfg?.runtimeBase||'runtime');
    w.fetch(base+'/data/v9/base-dates.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('dates '+response.status);return response.json();}).then(data=>{
      const rows=(data?.bases||[]).map(item=>{
        const date=item.date?new Date(item.date+'T00:00:00').toLocaleDateString('fr-FR',{timeZone:'Europe/Paris'}):'Date non fournie';
        const note=item.dateType==='source'?'Source':'Révision épinglée';
        return'<tr><th style="text-align:left;padding:4px 10px 4px 0">'+esc(item.label||item.id)+'</th><td style="padding:4px 8px">'+esc(date)+'</td><td style="padding:4px 0;color:#9299a2">'+note+'</td></tr>';
      }).join('');
      footer.querySelector('details').innerHTML='<summary><b>Dates de mise à jour des bases TCC</b></summary><p>Dates source si disponibles; sinon date de révision épinglée du snapshot.</p><div style="overflow:auto"><table><tbody>'+rows+'</tbody></table></div><p class="small">Snapshot '+esc(data.snapshotId||'V9')+' · données figées pour les tests.</p>';
    }).catch(()=>{footer.querySelector('details').innerHTML='<summary><b>Dates de mise à jour des bases TCC</b></summary><p>Le relevé des dates est indisponible dans cette version du snapshot.</p>';});
  }
  function installV9MobileLayout(w){
    const d=w.document;
    if(d.getElementById('v9MobileLayoutStyle'))return;
    const style=d.createElement('style');
    style.id='v9MobileLayoutStyle';
    style.textContent='html,body{width:100%!important;max-width:none!important;overflow-x:hidden!important}body{zoom:1!important}#compare,#compare .card,#compare .grid,#results{width:100%!important;max-width:720px!important;box-sizing:border-box!important;margin-left:auto!important;margin-right:auto!important}#v9OperatorControls{align-items:center!important}#v9OperatorDropdown{min-width:200px}#v9UsageHelp{max-width:720px;margin:0 auto}#v9UsageHelp .card{line-height:1.55}#v9UsageHelp h2{margin-top:0}#v9BaseUpdates{width:calc(100% - 20px)}@media(max-width:600px){body{font-size:16px!important}#compare{padding-left:10px!important;padding-right:10px!important}#v9OperatorControls{display:grid!important;grid-template-columns:1fr 1fr}#v9OperatorControls select{grid-column:1/-1;width:100%;box-sizing:border-box}.v9-select-dropdown{grid-column:1/-1;width:100%;box-sizing:border-box}.v9-select-dropdown select{max-height:230px;overflow:auto}.v9-dropdown-panel{max-height:240px;overflow:auto}.v9-dropdown-value{float:right;color:#aaa;font-weight:400;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#compare .v9-filter-group .grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;min-width:0!important}#compare .v9-filter-group .grid>div{min-width:0!important}#compare input#simDate,#compare input#simTime,#compare input#simUnplugTime{display:block!important;width:100%!important;max-width:160px!important;min-width:0!important;height:42px!important;min-height:42px!important;padding:6px 8px!important;font-size:15px!important;line-height:1.2!important;box-sizing:border-box!important;-webkit-appearance:none!important;appearance:none!important}#compare input#simTime,#compare input#simUnplugTime{text-align:center!important}}';
    d.head.appendChild(style);
  }

  function installCurrentPositionButton(w){
    const input=w.document.getElementById('simOrigin');
    if(!input||w.document.getElementById('v9UseCurrentPosition'))return;
    const button=w.document.createElement('button');
    button.id='v9UseCurrentPosition';button.type='button';
    button.className='secondary';button.textContent='⌖ Position actuelle';
    button.setAttribute('aria-label','Utiliser ma position actuelle');
    button.title='Utiliser la position GPS actuelle';
    button.style.cssText='width:auto;margin-top:6px;padding:8px 12px';
    const host=input.parentElement||input;
    host.appendChild(button);
    button.addEventListener('click',()=>{
      if(!w.navigator?.geolocation){button.textContent='GPS indisponible';return;}
      button.disabled=true;button.textContent='Localisation…';
      w.navigator.geolocation.getCurrentPosition(
        position=>{
          const lat=Number(position.coords.latitude).toFixed(6),lon=Number(position.coords.longitude).toFixed(6);
          input.value=lat+', '+lon;input.dataset.v9Coordinates='true';
          input.dispatchEvent(new w.Event('input',{bubbles:true}));
          button.disabled=false;button.textContent='⌖ Position actuelle';
        },
        error=>{
          button.disabled=false;button.textContent='⌖ Position actuelle';
          diagnosticStore(w,{mode:'candidate',outcome:'geolocation-error',reason:error?.message||'permission-or-unavailable'});
        },
        {enableHighAccuracy:true,maximumAge:120000,timeout:10000}
      );
    });
  }

  function mountCheckboxDropdown(w,select,detailsId,{title,allValue=null}={}){
    if(!select)return null;
    select.multiple=true;
    select.style.display='block';
    select.setAttribute('aria-label',title||'Sélection multiple');
    select.style.width='100%';
    select.style.minHeight='96px';
    let details=w.document.getElementById(detailsId);
    if(!details){
      details=w.document.createElement('details');
      details.id=detailsId;
      details.className='v9-select-dropdown';
      select.parentNode?.insertBefore(details,select);
    }
    details.innerHTML='<summary><b>'+esc(title||'Sélection')+'</b><span class="v9-dropdown-value"></span></summary>';details.style.flex='1 1 auto';
    details.appendChild(select);
    const summary=details.querySelector('.v9-dropdown-value');
    const redraw=()=>{
      const options=[...select.options],selected=[...select.selectedOptions];
      const labels=selected.map(o=>text(o.textContent));
      if(summary)summary.textContent=allValue&&selected.some(o=>text(o.value)===allValue)?'Tous les réseaux':(select.dataset.v9Mode==='all'?'Tous les réseaux':select.dataset.v9Mode==='tesla'?'Tesla uniquement':(labels.length?labels.join(', '):'Aucun'));
    };
    if(!select.dataset.v9DropdownBound){
      select.dataset.v9DropdownBound='true';
      select.addEventListener('change',()=>{
        if(allValue){
          const all=[...select.options].find(o=>text(o.value)===allValue);
          const picked=[...select.selectedOptions];
          if(all&&picked.some(o=>o===all)&&picked.length>1){
            [...select.options].forEach(o=>{o.selected=o===all;});
          }else if(all&&picked.some(o=>o!==all)){
            all.selected=false;
          }
        }
        redraw();
      });
    }
    select._v9Redraw=redraw;
    redraw();
    return details;
  }

  function mountOperatorPicker(w,select){
    let panel=w.document.getElementById('v9OperatorDropdown');
    if(!panel){panel=w.document.createElement('div');panel.id='v9OperatorDropdown';}
    panel.style.cssText='flex:1 1 280px;min-width:240px;max-width:450px;border:1px solid #46505b;border-radius:8px;padding:8px;background:#1a222b;box-sizing:border-box';
    panel.innerHTML='<b style="display:block;margin-bottom:6px">Opérateurs</b><div class="v9-operator-choices" role="group" aria-label="Choix des réseaux" style="max-height:150px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:4px"></div><div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="secondary v9-operator-apply" style="width:auto;margin:0;padding:6px 10px">Valider</button><button type="button" class="secondary v9-operator-cancel" style="width:auto;margin:0;padding:6px 10px">Annuler</button></div>';
    const choices=panel.querySelector('.v9-operator-choices'),selected=()=>new Set([...select.selectedOptions].map(option=>text(option.value)));
    const redraw=()=>{const values=selected();choices.innerHTML=[...select.options].map(option=>'<label style="display:flex;align-items:center;gap:5px;margin:0"><input type="checkbox" value="'+esc(option.value)+'" '+(values.has(text(option.value))?'checked':'')+' style="width:auto;margin:0"><span>'+esc(option.textContent)+'</span></label>').join('');};
    panel.querySelector('.v9-operator-apply')?.addEventListener('click',()=>{const values=new Set([...choices.querySelectorAll('input:checked')].map(input=>text(input.value)));for(const option of [...select.options])option.selected=values.has(text(option.value));select.dispatchEvent(new w.Event('change',{bubbles:true}));});
    panel.querySelector('.v9-operator-cancel')?.addEventListener('click',redraw);
    select._v9Redraw=redraw;redraw();return panel;
  }

  function installOperatorMultiSelect(w){
    const select=w.document.getElementById('simOperatorFilter');
    if(!select)return;
    const field=select.closest('.full')||select.parentElement;
    field?.querySelector(':scope > label')?.remove();
    const previousValues=select.multiple?[...select.selectedOptions].map(option=>text(option.value)).filter(Boolean):[];
    const previous=text(select.value),previousMode=select.dataset.v9Mode;
    const options=new Map();
    for(const option of [...select.options]){
      const value=text(option.value),label=text(option.textContent);
      if(!value||value==='all')continue;
      options.set(value,value==='tesla'?'Tesla':label);
    }
    if(!options.has('tesla'))options.set('tesla','Tesla');
    select.multiple=true;select.setAttribute('multiple','');select.dataset.v9Multi='true';
    select.setAttribute('aria-label','Opérateurs à afficher');
    const mode=previousMode||(previous==='all'||!previous?'all':previous==='tesla'?'tesla':'selected');
    select.innerHTML=[...options.entries()].map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
    const initial=mode==='all'?[]:mode==='tesla'?['tesla']:(previousValues.length?previousValues:(previous?[previous]:[]));
    for(const option of [...select.options])option.selected=initial.includes(text(option.value));
    select.dataset.v9Mode=initial.length?(initial.length===1&&initial[0]==='tesla'?'tesla':'selected'):'all';
    let controls=w.document.getElementById('v9OperatorControls');
    if(!controls){controls=w.document.createElement('div');controls.id='v9OperatorControls';controls.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;box-sizing:border-box';}
    const makeButton=(id,label,title)=>{
      let button=w.document.getElementById(id);
      if(!button){button=w.document.createElement('button');button.type='button';button.id=id;button.className='secondary';button.textContent=label;button.title=title;button.style.cssText='width:auto;margin:0;padding:10px 12px;white-space:nowrap';}
      return button;
    };
    const group=select.closest('details.v9-filter-group'),displayLabel=[...(group?.querySelectorAll('label')||[])].find(label=>text(label.textContent).startsWith('Réseaux affichés'));
    let active=w.document.getElementById('v9ActiveNetworkFilter');
    if(!active){active=w.document.createElement('span');active.id='v9ActiveNetworkFilter';}
    if(displayLabel){displayLabel.textContent='Réseaux affichés — ';displayLabel.appendChild(active);}
    const updateSummary=()=>{
      const mode=select.dataset.v9Mode||'all',names=[...select.selectedOptions].map(option=>text(option.textContent));
      active.textContent=mode==='all'?'Tous les réseaux':mode==='tesla'?'Tesla uniquement':(names.join(', ')||'Tous les réseaux');select._v9Redraw?.();
    };
    const choose=mode=>{
      select.dataset.v9Mode=mode;
      for(const option of [...select.options])option.selected=mode==='tesla'&&text(option.value)==='tesla';
      select.dispatchEvent(new w.Event('change',{bubbles:true}));
    };
    if(!select.dataset.v9SummaryBound){
      select.addEventListener('change',()=>{
        const values=[...select.selectedOptions].map(option=>text(option.value));
        select.dataset.v9Mode=values.length?(values.length===1&&values[0]==='tesla'?'tesla':'selected'):'all';
        updateSummary();
      });
      select.dataset.v9SummaryBound='true';
    }
    const tesla=makeButton('v9TeslaOnly','Tesla uniquement','Afficher uniquement le réseau Tesla');
    const all=makeButton('v9AllNetworks','Tous les réseaux','Afficher tous les réseaux');
    if(!tesla.dataset.v9Bound){tesla.addEventListener('click',()=>choose('tesla'));tesla.dataset.v9Bound='true';}
    if(!all.dataset.v9Bound){all.addEventListener('click',()=>choose('all'));all.dataset.v9Bound='true';}
    const dropdown=mountOperatorPicker(w,select);
    controls.append(tesla,all,dropdown);
    if(controls.parentElement!==field)field?.insertBefore(controls,field.firstChild);
    select.style.cssText='display:none';
    updateSummary();
    if(w.__TCCV9OperatorSelect!==select){
      w.__TCCV9OperatorSelect=select;
      const observer=new w.MutationObserver(()=>{
        const current=w.document.getElementById('simOperatorFilter');
        if(current&&current!==w.__TCCV9OperatorSelect)installOperatorMultiSelect(w);
        else if(current&&!current.multiple){current.multiple=true;current.setAttribute('multiple','');}
      });
      observer.observe(w.document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['multiple']});
      w.__TCCV9OperatorObserver=observer;
    }
  }

  const OPERATOR_CATALOG_KEY='tccV9OperatorCatalogsV1';
  function operatorCatalogKey(area){
    const origin=area?.query?.origin||{};
    const filters=area?.query?.filters||{};
    const key={country:text(area?.query?.countryCode).toUpperCase(),lat:Number(origin.lat).toFixed(3),lon:Number(origin.lon).toFixed(3),radius:Number(area?.query?.radiusKm)||0,connectorKinds:(filters.connectorKinds||[]).slice().sort(),minPowerKw:num(filters.minPowerKw),maxPowerKw:num(filters.maxPowerKw)};
    return JSON.stringify(key);
  }
  function operatorRows(area){
    const operators=new Map([['tesla','Tesla']]);
    for(const operator of area?.operators||[]){const id=text(operator?.id||'').toLowerCase(),label=text(operator?.name||'');if(id&&label&&id!=='tesla')operators.set(id,label);}
    for(const station of area?.stations||[]){
      const op=station.physicalOperator||station.operator||{};
      const id=text(op.id||station.operatorId||'').toLowerCase();
      const label=text(op.name||station.operatorName||'');
      if(id&&label&&id!=='tesla')operators.set(id,label);
    }
    return operators;
  }
  function refreshOperatorOptions(w,area){
    const select=w.document.getElementById('simOperatorFilter');if(!select)return;
    const current=select.multiple?[...select.selectedOptions].map(option=>text(option.value)).filter(Boolean):(text(select.value)?[text(select.value)]:[]);
    const mode=select.dataset.v9Mode||'all',key=operatorCatalogKey(area),cacheKey=OPERATOR_CATALOG_KEY;
    let catalogs={};try{catalogs=JSON.parse(w.sessionStorage.getItem(cacheKey)||'{}');}catch(_){}
    const incoming=operatorRows(area),operators=new Map([['tesla','Tesla']]);
    const cached=catalogs[key];
    if(cached&&Array.isArray(cached)&&mode!=='all')for(const row of cached){if(Array.isArray(row)&&row.length===2)operators.set(text(row[0]),text(row[1]));}
    for(const [id,label] of incoming)operators.set(id,label);
    catalogs[key]=[...operators.entries()];
    try{w.sessionStorage.setItem(cacheKey,JSON.stringify(catalogs));}catch(_){}
    select.innerHTML=[...operators.entries()].map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
    const keep=mode==='all'?[]:mode==='tesla'?['tesla']:current;
    for(const option of [...select.options])option.selected=keep.includes(text(option.value));
    select.dataset.v9Mode=keep.length?(keep.length===1&&keep[0]==='tesla'?'tesla':'selected'):'all';
    select._v9Redraw?.();
    select.dispatchEvent(new w.Event('change',{bubbles:true}));
  }

  function installPowerTypeFilter(w){
    const operator=w.document.getElementById('simOperatorFilter');if(!operator||w.document.getElementById('simPowerType'))return;
    const host=w.document.createElement('div');host.className='full';
    host.innerHTML='<div><b>Type et puissance de recharge</b><div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-top:6px"><div role="group" aria-label="Type de recharge" style="display:flex;align-items:center;gap:10px;padding-top:21px"><label style="display:flex;align-items:center;gap:5px;margin:0"><input id="simPowerAc" type="checkbox" style="width:auto;margin:0">AC</label><label style="display:flex;align-items:center;gap:5px;margin:0"><input id="simPowerDc" type="checkbox" style="width:auto;margin:0">DC</label></div><div style="flex:1 1 220px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><label>Minimum (kW)<input id="simMinPowerKw" type="number" min="1" step="1" inputmode="numeric" placeholder="1" aria-label="Puissance minimale en kW" style="width:100%;margin-top:3px"></label><label>Maximum (kW)<input id="simMaxPowerKw" type="number" min="1" step="1" inputmode="numeric" placeholder="250+" aria-label="Puissance maximale en kW" style="width:100%;margin-top:3px"></label></div></div></div><select id="simPowerType" multiple aria-hidden="true" tabindex="-1" style="display:none"><option value="AC">AC</option><option value="DC">DC</option></select><span class="small" style="display:block;margin-top:4px">Aucune case cochée : AC et DC. Laisse les champs vides pour ne pas limiter la puissance.</span></div>';
    const parent=operator.closest('label')||operator.parentElement;parent?.parentElement?.insertBefore(host,parent.nextSibling);
    const select=host.querySelector('#simPowerType'),ac=host.querySelector('#simPowerAc'),dc=host.querySelector('#simPowerDc');
    const sync=()=>{for(const option of [...select.options])option.selected=option.value==='AC'?ac.checked:dc.checked;select.dispatchEvent(new w.Event('change',{bubbles:true}));};
    ac.addEventListener('change',sync);dc.addEventListener('change',sync);
  }

  function installRankingOption(w){
    const select=w.document.getElementById('simRanking');if(!select||[...select.options].some(option=>option.value==='costPerKm'))return;
    const option=w.document.createElement('option');option.value='costPerKm';option.textContent='Coût au km récupéré';select.appendChild(option);
  }

  function installProgressiveSearchForm(w){
    const grid=w.document.querySelector('#compare .card .grid');
    if(!grid||grid.dataset.v9Progressive==='true')return;
    const field=id=>w.document.getElementById(id)?.parentElement||null;
    const origin=field('simOrigin');if(!origin)return;
    const groups=[
      {title:'Date et horaires',ids:['simDate','simTime','simUnplugTime']},
      {title:'Batterie et objectif',ids:['simNow','simTarget','simCondition','simProfile']},
      {title:'Réseaux affichés',ids:['simOperatorFilter']},
      {title:'Type de recharge',ids:['simPowerType']},
      {title:'Distance maximale',ids:['simMaxDistance']},
      {title:'Priorité de classement',ids:['simRanking']}
    ];
    const captured=groups.map(group=>({group,nodes:group.ids.map(field).filter(Boolean)}));
    grid.innerHTML='';origin.classList.add('full');grid.appendChild(origin);
    for(const {group,nodes} of captured){
      const details=w.document.createElement('details');details.className='full box v9-filter-group';
      const summary=w.document.createElement('summary');summary.textContent=group.title;
      details.appendChild(summary);
      const body=w.document.createElement('div');body.className='grid';body.style.marginTop='10px';
      for(const node of nodes){
        body.appendChild(node);
        if(group.title==='Date et horaires'){
          const input=node.querySelector('input');
          if(input&&['simDate','simTime','simUnplugTime'].includes(input.id)){
            node.style.width='100%';node.style.maxWidth='260px';node.style.minWidth='0';node.style.boxSizing='border-box';
            input.style.setProperty('width','100%','important');
            input.style.setProperty('max-width','260px','important');
            input.style.setProperty('min-width','0','important');
            input.style.setProperty('box-sizing','border-box','important');
          }
        }
      }
      details.appendChild(body);grid.appendChild(details);
    }
    grid.dataset.v9Progressive='true';
  }

  async function waitForStableShell(w,timeoutMs=30000){
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      if(w.__TCC_V9_SHELL_CONFIG__&&typeof w.compare==='function'&&w.document.readyState!=='loading'&&w.document.getElementById('results')&&w.document.getElementById('simOperatorFilter'))return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!w.__TCC_V9_SHELL_CONFIG__)throw new Error('shell config unavailable');
    if(typeof w.compare!=='function')throw new Error('stable compare unavailable');
  }
  async function install(w){
    if(w.__TCC_V9_SHELL__?.ready)return w.__TCC_V9_SHELL__;
    if(w.__TCC_V9_SHELL__?.pending)return w.__TCC_V9_SHELL__;
    const cfg=w.__TCC_V9_SHELL_CONFIG__;
    if(!cfg||!['shadow','candidate'].includes(cfg.mode))throw new Error('shell config unavailable');
    const marker={mode:cfg.mode,candidateSha:cfg.observedCandidateSha,engineScopeCountries:(cfg.engineScopeCountries||[]).slice(),fallback:cfg.fallback||'legacy-compare',pending:true};
    w.__TCC_V9_SHELL__=marker;
    await waitForStableShell(w);
    normalizeLegacyChrome(w);
    installV9MobileLayout(w);
    const legacyCompare=w.compare;
    const enginePromise=createEngine(w,cfg);
    installCurrentPositionButton(w);
    installUsageHelpTab(w);
    installBaseUpdatesFooter(w,cfg);
    installPowerTypeFilter(w);
    installRankingOption(w);
    installProgressiveSearchForm(w);
    installOperatorMultiSelect(w);
    w.compare=async function(){const input=readInputs(w);if(cfg.mode==='shadow'){
      const stable=await legacyCompare.apply(this,arguments);enginePromise.then(engine=>executeV9(w,engine,cfg,input)).then(run=>diagnosticStore(w,{mode:'shadow',outcome:'v9-ok',countryCode:run.countryCode,stationCount:run.area?.stations?.length||0,rankedCount:run.rows.length,sourceErrors:run.area?.diagnostics?.errors?.length||0,routingErrors:run.area?.diagnostics?.routingErrorCount||0,partialRadius:run.partialRadius})).catch(err=>diagnosticStore(w,{mode:'shadow',outcome:'v9-fallback',reason:err.message}));return stable;
    }
      try{const engine=await enginePromise,run=await executeV9(w,engine,cfg,input);refreshOperatorOptions(w,run.area);renderSubscriptionSelector(w,subscriptionOptionsForArea(run.area,run.countryCode),run.countryCode,run.area?.stations||[]);renderCandidate(w,run.area,run.rows,run.origin.label||input.originText);diagnosticStore(w,{mode:'candidate',outcome:'v9-ok',countryCode:run.countryCode,stationCount:run.area?.stations?.length||0,rankedCount:run.rows.length,selectedSubscriptionCount:run.selectedSubscriptions.length,sourceErrors:run.area?.diagnostics?.errors?.length||0,routingErrors:run.area?.diagnostics?.routingErrorCount||0});return run.area;}catch(err){
        diagnosticStore(w,{mode:'candidate',outcome:'v9-error',reason:err.message,operatorIds:input.operatorIds||[]});
        if(input.operatorIds?.length){
          const status=w.document.getElementById('routeStatus'),results=w.document.getElementById('results');
          if(status)status.innerHTML='<span class="warn">Le calcul V9 a échoué pour le filtre opérateur sélectionné.</span>';
          if(results)results.innerHTML='<div class="warn">Les résultats filtrés n’ont pas pu être recalculés : '+esc(err.message||'erreur inconnue')+'. Relance la simulation après vérification de la source.</div>';
          return null;
        }
        return legacyCompare.apply(this,arguments);
      }
    };
    marker.pending=false;marker.ready=true;
    return marker;
  }
  return{rankingWeights,rankRows,combineDateTime,dcCurve,readInputs,buildSession,rowsFromArea,groupRows,powerLines,formatMinutes,tariffRateLabels,baseTariffsForPower,renderPowerLines,renderTariffs,formatCurrencyAmount,stationBaseSource,variantsByPower,offerAppliesToEvseGroup,selectedSubscriptions,saveSelectedSubscriptions,subscriptionLabel,subscriptionOptionsForArea,renderSubscriptionSelector,renderMapSummary,areaFiltersFromInputs,variantMatchesFilters,installCurrentPositionButton,installOperatorMultiSelect,installPowerTypeFilter,installProgressiveSearchForm,refreshOperatorOptions,executeV9,install};
});
