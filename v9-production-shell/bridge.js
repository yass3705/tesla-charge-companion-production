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
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
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
      if(!options.has(id))options.set(id,{id,label,provider:text(offer?.provider)||label,countries:[country]});
    }
    return [...options.values()].sort((a,b)=>subscriptionLabel(a).localeCompare(subscriptionLabel(b),'fr'));
  }
  function renderSubscriptionSelector(w,options,countryCode,stations=[]){
    const compare=w.document.getElementById('compare'),card=compare?.querySelector('.card');if(!card)return;
    let box=w.document.getElementById('v9SubscriptionSelector');
    if(!box){box=w.document.createElement('details');box.id='v9SubscriptionSelector';box.className='box v9-filter-group';box.style.marginTop='10px';const primary=card.querySelector('button.primary');if(primary)card.insertBefore(box,primary);else card.appendChild(box);}
    const selected=new Set(selectedSubscriptions(w)),rows=(options||[]).slice();
    const emspProviders=[...new Set((stations||[]).flatMap(st=>st?.offers||[])
      .filter(offer=>/^(emsp|roaming)$/i.test(text(offer?.kind))||/electra|electroverse/i.test(text(offer?.provider)))
      .map(offer=>text(offer?.provider)).filter(name=>/electra|electroverse/i.test(name)))];
    const noPlanMessage='Aucun tarif d’abonnement vérifié pour les bornes de cette zone.';
    const emspMessage=emspProviders.length?' Les tarifs '+emspProviders.join(', ')+' affichés dans les résultats sont des prix eMSP, distincts d’un abonnement.':'';
    const optionsHtml=rows.map(row=>{const id=text(row.id),countries=(row.countries||[]).join(', ');return '<option value="'+esc(id)+'"'+(selected.has(id)?' selected':'')+'>'+esc(subscriptionLabel(row))+(countries?' · '+esc(countries):'')+'</option>';}).join('');
    box.innerHTML='<summary><b>Abonnements recharge</b> <span class="small">('+rows.length+' compatible(s) en '+esc(countryCode)+')</span></summary>'+
      '<div class="small" style="margin-top:8px">Sélection multiple. Les abonnements sélectionnés peuvent être retenus dans le classement quand leur compatibilité est vérifiée.</div>'+
      (rows.length?'<select id="v9SubscriptionChoices" multiple size="5" aria-label="Abonnements recharge, sélection multiple" style="margin-top:8px;width:100%;min-height:96px">'+optionsHtml+'</select>'+
        '<div class="row" style="margin-top:8px"><button type="button" class="secondary v9-sub-none" style="width:auto">Aucun abonnement</button><button type="button" class="secondary v9-sub-all" style="width:auto">Tous compatibles</button></div>':
        '<div class="small" style="margin-top:8px">'+esc(noPlanMessage+emspMessage)+'</div>');
    const select=box.querySelector('#v9SubscriptionChoices');
    mountCheckboxDropdown(w,select,'v9SubscriptionDropdown',{title:'Abonnements recharge'});
    const persist=()=>{if(!select)return;saveSelectedSubscriptions(w,[...select.selectedOptions].map(option=>text(option.value)));w.compare();};
    select?.addEventListener('change',persist);
    box.querySelector('.v9-sub-none')?.addEventListener('click',()=>{[...select.options].forEach(option=>{option.selected=false;});persist();});
    box.querySelector('.v9-sub-all')?.addEventListener('click',()=>{[...select.options].forEach(option=>{option.selected=true;});persist();});
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
    const operatorSelect=get('simOperatorFilter'),selectedOperators=operatorSelect?.multiple?[...operatorSelect.selectedOptions].map(option=>text(option.value)).filter(Boolean):[text(operatorSelect?.value||'tesla')],operatorIds=selectedOperators.filter(id=>id!=='all');
    const powerSelect=get('simPowerType'),connectorKinds=powerSelect?.multiple?[...powerSelect.selectedOptions].map(option=>text(option.value)).filter(v=>v==='AC'||v==='DC'):(text(powerSelect?.value)&&text(powerSelect?.value)!=='all'?[text(powerSelect.value)]:[]);
    const minPowerInput=num(get('simMinPowerKw')?.value),maxPowerInput=num(get('simMaxPowerKw')?.value);
    const minPowerKw=minPowerInput!=null?Math.max(1,minPowerInput):null,maxPowerKw=maxPowerInput!=null?Math.max(1,maxPowerInput):null;
    return{startSoc:num(get('simNow')?.value),targetSoc:num(get('simTarget')?.value),date,time,startAt,disconnectAt,condition:get('simCondition')?.value||'normal',profile:get('simProfile')?.value||'realistic',operatorMode:selectedOperators.includes('all')||!selectedOperators.length?'all':operatorIds.length===1&&operatorIds[0]==='tesla'?'tesla':'selected',operatorIds,connectorKinds,minPowerKw,maxPowerKw,rankingMode:get('simRanking')?.value||'balanced',radiusKm:radius,originText:text(get('simOrigin')?.value)};
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
    return'<div class="v9-power-lines" style="margin-top:8px">'+lines.map(line=>{
      const evaluated=evaluatedBaseTariffs(row),fallback=baseTariffsForPower(row,line),tariffs=[...new Set(evaluated.length?evaluated:fallback)];
      const baseLine=tariffs.length
        ?'<div class="small" style="color:#c7d0d9">Base utilisée: '+tariffs.map(esc).join(' · ')+'</div>'
        :row?.evaluation?.best
          ?'<div class="small" style="color:#c7d0d9">Tarif unitaire non détaillé · prix final calculé ci-dessous</div>'
          :'<div class="small" style="color:#c7d0d9">Tarif de base non disponible</div>';
      return '<div class="small" style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><span>'+esc(line.kind)+' · <b>'+line.powerKw+' kW</b>'+baseLine+'</span><span>'+line.count+' point(s)</span></div>';
    }).join('')+'</div>';
  }
  function renderMapSummary(w,area,rows){
    const engine=w.TCCV9MapPriceEngine;if(!engine)return;
    const host=w.document.getElementById('v9MapSummary')||w.document.createElement('section');
    host.id='v9MapSummary';host.className='box';host.style.cssText='margin:10px 0;background:#11151a;border:1px solid #28323d';
    const bestByStation=new Map();for(const row of rows||[]){const id=text(row?.station?.id||row?.station?.canonicalId||row?.station?.stationId);if(!id)continue;const current=bestByStation.get(id),cost=num(row?.costPerKm);if(!current||(cost!=null&&(num(current.costPerKm)==null||cost<num(current.costPerKm))))bestByStation.set(id,row);}const zoneRows=engine.summarizeZones([...bestByStation.values()],{precision:1}),visible=zoneRows.slice(0,12);
    host.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Résultats V9</b><div role="group" aria-label="Mode d’affichage"><button type="button" class="secondary v9-view-list" style="width:auto;padding:6px 10px">☷ Liste</button><button type="button" class="secondary v9-view-map" style="width:auto;padding:6px 10px">⌖ Carte</button></div></div>'+
      '<div class="small" style="margin-top:6px">La liste reste la vue principale. La carte agrège le meilleur €/km par zone au dézoom et détaille les stations disponibles.</div>'+
      '<div id="v9MapZones" style="display:none;margin-top:8px">'+(visible.length?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">'+visible.map(z=>'<div style="padding:8px;border-radius:8px;background:#1a222b"><b>'+engine.formatPricePerKm(z.bestPricePerKm)+'</b><div class="small">'+esc(z.bestStation?.name||'Zone')+' · '+z.pricedStationCount+'/'+z.stationCount+' tarifée(s)</div></div>').join('')+'</div>':'<div class="small">Aucun prix/km vérifiable dans cette zone.</div>')+'</div>';
    const results=w.document.getElementById('results');if(results&&host.parentNode!==results.parentNode)results.parentNode.insertBefore(host,results);
    const listButton=host.querySelector('.v9-view-list'),mapButton=host.querySelector('.v9-view-map'),zones=host.querySelector('#v9MapZones');
    const setMode=mode=>{const map=mode==='map';if(zones)zones.style.display=map?'block':'none';if(results)results.style.display=map?'none':'';listButton?.classList.toggle('primary',!map);mapButton?.classList.toggle('primary',map);host.dataset.v9View=mode;};
    listButton?.addEventListener('click',()=>setMode('list'));mapButton?.addEventListener('click',()=>setMode('map'));setMode('list');
  }


  function formatCurrencyAmount(value,currency){
    const amount=num(value);if(amount==null)return null;
    const code=text(currency||'EUR').toUpperCase();
    const formatted=amount.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
    return code==='EUR'?formatted+' €':formatted+' '+code;
  }
  function offerPriceCategory(item){
    const provider=text(item?.provider).toLowerCase(),offerId=text(item?.offerId).toLowerCase(),kind=text(item?.kind).toLowerCase();
    if(provider.includes('electroverse')||offerId.includes('electroverse'))return'electroverse';
    if(provider.includes('electra')||offerId.includes('electra'))return'electra';
    if(kind==='emsp'||kind==='roaming')return text(item?.subscriptionId)?'direct':null;
    return'direct';
  }
  function renderTariffs(evaluation){
    const offers=[evaluation?.best,...(evaluation?.alternatives||[]),...(evaluation?.incomplete||[])].filter(Boolean);
    const categories=[
      {id:'direct',label:offers.some(item=>offerPriceCategory(item)==='direct'&&text(item.subscriptionId))?'Direct / abonnement sélectionné':'Direct',color:'#f4a64a'},
      {id:'electra',label:'Electra',color:'#a8e8d4'},
      {id:'electroverse',label:'Electroverse',color:'#c9b3f4'}
    ];
    const picked=Object.fromEntries(categories.map(category=>[category.id,offers.filter(item=>offerPriceCategory(item)===category.id&&num(item.total)!=null).sort((a,b)=>num(a.total)-num(b.total))[0]||null]));
    const bestId=categories.map(category=>({id:category.id,total:num(picked[category.id]?.total)})).filter(item=>item.total!=null).sort((a,b)=>a.total-b.total)[0]?.id||null;
    return'<div class="v9-tariffs" aria-label="Comparaison des trois catégories de prix" style="display:grid;gap:6px;margin-top:8px">'+categories.map(category=>{
      const item=picked[category.id],best=category.id===bestId;
      let amount='Prix non disponible',provider='';
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
        (provider?'<span style="grid-column:1/-1;font-size:12px;line-height:1.3;opacity:.8;overflow-wrap:anywhere">'+esc(provider)+(text(item.subscriptionId)?' · abonnement':'')+'</span>':'')+
      '</div>';
    }).join('')+'</div>';
  }
  function stationBaseSource(station){
    const operator=text(station?.physicalOperator?.name||station?.operator?.name||station?.operatorName).toLowerCase();
    const provenance=(station?.provenance||station?.sources||[]).map(item=>text(item?.sourceId||item?.id||item)).filter(Boolean);
    if(operator.includes('tesla')||provenance.some(id=>/tesla|suc-tracker/i.test(id)))return'TESLA · SuC Tracker';
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

  function variantsByPower(w,rows,session,selectedSubscriptions=[]){
    const planner=w.TCCV9SessionPlannerEngine,sessionEngine=w.TCCV9SessionEngine,scoreEngine=w.TCCV9StationScoreEngine;
    if(!planner?.planStation||!sessionEngine?.evaluateStation||!sessionEngine?.offerMatchesChargingKind||!scoreEngine?.scoreStation)throw new Error('per-power pricing engines unavailable');
    const variants=[];
    for(const row of rows||[]){
      const station=row?.station||{},groups=new Map();
      for(const [evseIndex,evse] of (station.evses||[]).entries())for(const [connectorIndex,raw] of (evse.connectors||[]).entries()){
        const power=num(raw.powerKw??raw.power??evse.powerKw);if(power==null||power<=0)continue;
        const connector={...raw,powerKw:power},kind=connectorKind(connector),connectorId=text(connector.id||connector.connectorId)||null,plug=text(connector.plugName||connector.type)||null;
        const matching=(station.offers||[]).filter(offer=>sessionEngine.offerMatchesChargingKind(offer,kind,power,plug,connectorId)).map(offer=>text(offer.id||offer.offerId)||JSON.stringify(offer)).sort();
        const key=[kind,power,matching.join(',')].join('|');
        const group=groups.get(key)||{kind,powerKw:power,offerIds:matching,evseConnectors:new Map(),evseKeys:new Set()};
        const evseKey=text(evse.id||evse.evseId)||'evse-'+evseIndex;
        const connectors=group.evseConnectors.get(evseIndex)||[];
        connectors.push({connectorIndex,connector});group.evseConnectors.set(evseIndex,connectors);group.evseKeys.add(evseKey);groups.set(key,group);
      }
      for(const group of groups.values()){
        const evses=[];
        for(const [evseIndex,connectors] of group.evseConnectors){
          const original=station.evses[evseIndex];
          evses.push({...original,connectors:connectors.map(item=>item.connector)});
        }
        const variant={...station,evses,offers:station.offers||[]},routeMap={[text(station.id||station.canonicalId||station.stationId)]:row.route||{}};
        const plan=planner.planStation(variant,session,{route:{byStationId:routeMap}});
        const evaluation=sessionEngine.evaluateStation(variant,plan.effectiveSession,{selectedSubscriptions,targetCurrency:session.targetCurrency||'EUR',fxRates:session.fxRates||{}});
        const score=scoreEngine.scoreStation(variant,evaluation,plan.effectiveSession,{route:{byStationId:routeMap},plan});
        const line={kind:group.kind,powerKw:group.powerKw,count:group.evseKeys.size};
        variants.push({...row,station:variant,powerLine:line,evaluation,score,total:num(evaluation?.best?.total),costPerKm:num(evaluation?.best?.costPerRecoveredKm),recoveredKm:num(evaluation?.recoveredKm),displayKey:[text(station.name),line.kind,line.powerKw,group.offerIds.join(',')].join('|')});
      }
    }
    return variants;
  }

  function renderCandidate(w,area,rows,originLabel){
    const results=w.document.getElementById('results'),routeStatus=w.document.getElementById('routeStatus');if(!results)throw new Error('stable results container missing');
    if(routeStatus)routeStatus.innerHTML='<span class="good">Moteur V9 canary · '+rows.length+' borne(s) classée(s) depuis '+esc(originLabel)+'.</span>';
    if(!rows.length){renderMapSummary(w,area,rows);results.innerHTML='<div class="warn">Aucune borne V9 exploitable pour cette recherche. Retour au moteur stable recommandé.</div>';return;}
    results.innerHTML='<div class="small box"><b>Moteur V9</b> · une ligne par puissance et tarif calculé.</div>'+rows.map((row,i)=>{const st=row.station,best=row.evaluation?.best,score=row.score,route=row.route;return '<div class="box" style="margin-top:10px"><b>'+(i+1)+'. '+esc(st.name||'Borne')+'</b><div class="small">'+esc(st.physicalOperator?.name||'Opérateur inconnu')+'</div><div class="small" style="color:#9fa9b5">Base source : '+esc(stationBaseSource(st))+'</div>'+renderPowerLines(row)+'<div style="margin-top:6px">'+renderTariffs(row.evaluation)+(Number.isFinite(row.distanceKm)?' · '+row.distanceKm.toFixed(1)+' km':'')+'</div>'+renderCostPerKm(row)+(score?'<div class="small">Charge '+formatMinutes(score.chargingMinutes)+' · trajet '+formatMinutes(score.driveMinutes)+' · total '+formatMinutes(score.totalTimeMinutes)+(score.chargeModel?.averagePowerKw!=null?' · moyenne '+Number(score.chargeModel.averagePowerKw).toFixed(1)+' kW':'')+'</div>':'')+(route?.provider?'<div class="small">Routage '+esc(route.provider)+'</div>':'')+'</div>';}).join('');
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
  async function executeV9(w,engine,cfg,input){
    if(!(input.targetSoc>input.startSoc))throw new Error('invalid SOC target');if(!input.originText)throw new Error('origin required');
    if(cfg.mode==='candidate'&&!(input.radiusKm>0))throw new Error('unbounded radius not production-equivalent');
    if(typeof w.resolveOrigin!=='function')throw new Error('stable origin resolver unavailable');const origin=await w.resolveOrigin(input.originText),countryCode=await countryCodeForOrigin(w,origin),scope=cfg.engineScopeCountries||[];
    if(scope.length&&!scope.includes(countryCode))throw new Error(`country outside V9 shell scope: ${countryCode}`);
    const queryRadius=input.radiusKm>0?input.radiusKm:20,filters=areaFiltersFromInputs(input),session=buildSession(input);session.fxRates=engine.__tccFxRates||{};
    const selected=selectedSubscriptions(w);
    const area=await engine.queryArea({countryCode,origin:{lat:Number(origin.lat),lon:Number(origin.lon)},radiusKm:queryRadius,filters,session,vehicleProfileId:'generic-ev-preview',selectedSubscriptions:selected,subscriptionFilters:{countryCodes:[countryCode],coverageMode:'any'},routingBudget:80,perOperatorFloor:2,sortBy:'finalCost'});
    const baseSession=area.effectiveSession||session,expanded=variantsByPower(w,rowsFromArea(area),baseSession,selected),rows=rankRows(expanded,input.rankingMode,20);return{area,rows,origin,countryCode,queryRadius,partialRadius:!(input.radiusKm>0),selectedSubscriptions:selected};
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
    const refreshButtons=[...d.querySelectorAll('button')].filter(btn=>/recharger les données|recharger.*pays[-\s]?bas/i.test(text(btn.textContent)));
    refreshButtons.forEach(btn=>{
      const obsoleteCard=btn.closest('.card')||btn.parentElement;
      if(obsoleteCard){obsoleteCard.hidden=true;obsoleteCard.style.display='none';}
      else{btn.hidden=true;btn.style.display='none';}
    });
    [...d.querySelectorAll('.small,p,small')].filter(el=>/snapshot DOT[-\s]?NL|données Pays[-\s]?Bas|données des Pays[-\s]?Bas/i.test(text(el.textContent))).forEach(el=>{
      const obsoleteCard=el.closest('.card')||el;
      obsoleteCard.hidden=true;obsoleteCard.style.display='none';
    });
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
    style.textContent='html,body{width:100%!important;max-width:none!important;overflow-x:hidden!important}body{zoom:1!important}#compare,#compare .card,#compare .grid,#results{width:100%!important;max-width:720px!important;box-sizing:border-box!important;margin-left:auto!important;margin-right:auto!important}#v9OperatorControls{align-items:center!important}#v9OperatorDropdown{min-width:200px}#v9UsageHelp{max-width:720px;margin:0 auto}#v9UsageHelp .card{line-height:1.55}#v9UsageHelp h2{margin-top:0}#v9BaseUpdates{width:calc(100% - 20px)}@media(max-width:600px){body{font-size:16px!important}#compare{padding-left:10px!important;padding-right:10px!important}#v9OperatorControls{display:grid!important;grid-template-columns:1fr 1fr}.v9-select-dropdown{grid-column:1/-1;width:100%;box-sizing:border-box}.v9-select-dropdown select{max-height:230px;overflow:auto}.v9-dropdown-panel{max-height:240px;overflow:auto}.v9-dropdown-value{float:right;color:#aaa;font-weight:400;max-width:58%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}';
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
      if(summary)summary.textContent=allValue&&selected.some(o=>text(o.value)===allValue)?'Tous les réseaux':(labels.length?labels.join(', '):'Aucun');
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

  function installOperatorMultiSelect(w){
    const select=w.document.getElementById('simOperatorFilter');
    if(!select||select.dataset.v9Multi==='true')return;
    select.multiple=true;select.dataset.v9Multi='true';
    const field=select.parentElement;
    field?.querySelector('label')?.remove();
    select.setAttribute('aria-label','Opérateurs, sélection multiple');
    select.innerHTML='<option value="tesla">Tesla</option><option value="all">Tous les réseaux</option>';
    select.options[1].selected=true;
    const dropdown=mountCheckboxDropdown(w,select,'v9OperatorDropdown',{title:'Opérateurs',allValue:'all'});
    const controls=w.document.createElement('div');controls.id='v9OperatorControls';
    controls.style.cssText='display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;width:100%;box-sizing:border-box';
    const makeButton=(id,label,title)=>{
      const button=w.document.createElement('button');button.type='button';button.id=id;
      button.className='secondary';button.textContent=label;button.title=title;
      button.style.cssText='width:auto;margin:0;padding:10px 12px;white-space:nowrap';
      return button;
    };
    const choose=(value)=>{
      [...select.options].forEach(option=>{option.selected=option.value===value;});
      select.dispatchEvent(new w.Event('change',{bubbles:true}));
    };
    const tesla=makeButton('v9TeslaOnly','Tesla uniquement','Afficher uniquement le réseau Tesla');
    const all=makeButton('v9AllNetworks','Tous les réseaux','Afficher tous les réseaux');
    tesla.addEventListener('click',()=>choose('tesla'));
    all.addEventListener('click',()=>choose('all'));
    const host=dropdown?.parentElement||field;
    if(host&&field){
      controls.append(tesla,all);
      if(dropdown)controls.appendChild(dropdown);
      field.insertBefore(controls,field.firstChild);
    }
    if(dropdown){
      dropdown.style.flex='1 1 220px';dropdown.style.minWidth='180px';dropdown.style.margin='0';
    }
  }

  function refreshOperatorOptions(w,area){
    const select=w.document.getElementById('simOperatorFilter');if(!select?.multiple)return;
    const current=new Set([...select.selectedOptions].map(option=>option.value));
    const currentLabels=new Map([...select.options].map(option=>[option.value,option.textContent]));
    const operators=new Map([['tesla','Tesla']]);
    for(const operator of area?.operators||[]){const id=text(operator?.id||'').toLowerCase(),label=text(operator?.name||'');if(id&&label&&id!=='tesla')operators.set(id,label);}
    for(const station of area?.stations||[]){
      const op=station.physicalOperator||station.operator||{};
      const id=text(op.id||station.operatorId||'').toLowerCase();
      const label=text(op.name||station.operatorName||'');
      if(id&&label&&id!=='tesla')operators.set(id,label);
    }
    for(const [id,label] of currentLabels){if(id&&id!=='all'&&!operators.has(id))operators.set(id,label);}
    const selected=current.size?current:new Set(['all']);
    select.innerHTML=[...operators.entries()].map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('')+
      '<option value="all" hidden>Tous les réseaux</option>';
    [...select.options].forEach(option=>{option.selected=selected.has(option.value);});
    // Le menu visible est un miroir personnalisé du select natif : après le
    // rafraîchissement des opérateurs, il doit être redessiné immédiatement.
    if(typeof select._v9Redraw==='function')select._v9Redraw();
  }

  function installPowerTypeFilter(w){
    const operator=w.document.getElementById('simOperatorFilter');if(!operator||w.document.getElementById('simPowerType'))return;
    const host=w.document.createElement('div');host.className='full';host.innerHTML='<label for="simPowerType"><b>Type de recharge</b><select id="simPowerType" multiple size="2" aria-label="Type de recharge, sélection multiple" style="margin-top:6px;width:100%"><option value="AC">AC</option><option value="DC">DC</option></select><span class="small" style="display:block;margin-top:4px">Laisser vide pour AC et DC.</span><div style="margin-top:8px"><b>Plage de puissance (kW)</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px"><label class="small">Minimum<input id="simMinPowerKw" type="number" min="1" max="250" step="1" inputmode="numeric" placeholder="1" aria-label="Puissance minimale en kW" style="width:100%;margin-top:3px"></label><label class="small">Maximum<input id="simMaxPowerKw" type="number" min="1" max="250" step="1" inputmode="numeric" placeholder="250+" aria-label="Puissance maximale en kW" style="width:100%;margin-top:3px"></label></div><span class="small" style="display:block;margin-top:4px">Laisser les deux champs vides pour 1–250+ kW. Laisser le maximum vide pour inclure 250 kW et plus.</span></div></label>';
    const parent=operator.closest('label')||operator.parentElement;parent?.parentElement?.insertBefore(host,parent.nextSibling);
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
      {title:'Batterie et objectif',ids:['simNow','simTarget','simCondition']},
      {title:'Profil de calcul',ids:['simProfile']},
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
      for(const node of nodes){body.appendChild(node);}
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
    installOperatorMultiSelect(w);
    installPowerTypeFilter(w);
    installRankingOption(w);
    installProgressiveSearchForm(w);
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
  return{rankingWeights,rankRows,combineDateTime,dcCurve,readInputs,buildSession,rowsFromArea,powerLines,formatMinutes,tariffRateLabels,baseTariffsForPower,renderPowerLines,renderTariffs,formatCurrencyAmount,stationBaseSource,variantsByPower,selectedSubscriptions,saveSelectedSubscriptions,subscriptionLabel,subscriptionOptionsForArea,renderSubscriptionSelector,renderMapSummary,areaFiltersFromInputs,installCurrentPositionButton,installOperatorMultiSelect,installPowerTypeFilter,installProgressiveSearchForm,refreshOperatorOptions,executeV9,install};
});
