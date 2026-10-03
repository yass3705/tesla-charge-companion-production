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
  function renderSubscriptionSelector(w,options,countryCode){
    const compare=w.document.getElementById('compare'),card=compare?.querySelector('.card');if(!card)return;
    let box=w.document.getElementById('v9SubscriptionSelector');
    if(!box){box=w.document.createElement('details');box.id='v9SubscriptionSelector';box.className='box v9-filter-group';box.style.marginTop='10px';const primary=card.querySelector('button.primary');if(primary)card.insertBefore(box,primary);else card.appendChild(box);}
    const selected=new Set(selectedSubscriptions(w)),rows=(options||[]).slice();
    const optionsHtml=rows.map(row=>{const id=text(row.id),countries=(row.countries||[]).join(', ');return '<option value="'+esc(id)+'"'+(selected.has(id)?' selected':'')+'>'+esc(subscriptionLabel(row))+(countries?' · '+esc(countries):'')+'</option>';}).join('');
    box.innerHTML='<summary><b>Abonnements recharge</b> <span class="small">('+rows.length+' compatible(s) en '+esc(countryCode)+')</span></summary>'+
      '<div class="small" style="margin-top:8px">Sélection multiple. Les abonnements sélectionnés peuvent être retenus dans le classement quand leur compatibilité est vérifiée.</div>'+
      (rows.length?'<select id="v9SubscriptionChoices" multiple size="5" aria-label="Abonnements recharge, sélection multiple" style="margin-top:8px;width:100%;min-height:96px">'+optionsHtml+'</select>'+
        '<div class="row" style="margin-top:8px"><button type="button" class="secondary v9-sub-none" style="width:auto">Aucun abonnement</button><button type="button" class="secondary v9-sub-all" style="width:auto">Tous compatibles</button></div>':
        '<div class="small" style="margin-top:8px">Aucun abonnement tarifaire vérifié pour cette zone.</div>');
    const select=box.querySelector('#v9SubscriptionChoices');
    const persist=()=>{if(!select)return;saveSelectedSubscriptions(w,[...select.selectedOptions].map(option=>text(option.value)));w.compare();};
    select?.addEventListener('change',persist);
    box.querySelector('.v9-sub-none')?.addEventListener('click',()=>{[...select.options].forEach(option=>{option.selected=false;});persist();});
    box.querySelector('.v9-sub-all')?.addEventListener('click',()=>{[...select.options].forEach(option=>{option.selected=true;});persist();});
  }

  function rankingWeights(mode){if(mode==='price')return{price:.7,distance:.3};if(mode==='distance')return{price:.3,distance:.7};return{price:.5,distance:.5};}
  function rankRows(rows,mode='balanced',limit=20){
    const available=(rows||[]).filter(x=>Number.isFinite(x.total)&&Number.isFinite(x.distanceKm));
    const unknown=(rows||[]).filter(x=>!Number.isFinite(x.total)&&Number.isFinite(x.distanceKm)).sort((a,b)=>a.distanceKm-b.distanceKm);
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
    return{startSoc:num(get('simNow')?.value),targetSoc:num(get('simTarget')?.value),date,time,startAt,disconnectAt,condition:get('simCondition')?.value||'normal',profile:get('simProfile')?.value||'realistic',operatorMode:selectedOperators.includes('all')||!selectedOperators.length?'all':operatorIds.length===1&&operatorIds[0]==='tesla'?'tesla':'selected',operatorIds,connectorKinds,rankingMode:get('simRanking')?.value||'balanced',radiusKm:radius,originText:text(get('simOrigin')?.value)};
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
    const loaders=w.TCCV9BrowserLoaders.createRegistryLoaders({registry,basePath:base,adapters:adapters(w)}),routeProvider=w.TCCV9BrowserRouting.osrmProvider();
    return w.TCCV9RuntimeEngine.createEngine({registry,loaders,routeProvider,vehicleProfiles});
  }
  function rowsFromArea(area){return(area.rankedStations||area.stations||[]).map(st=>{const evaluation=area.sessionEvaluations?.[st.id],score=area.stationScores?.[st.id],route=area.routes?.byStationId?.[st.id];return{station:st,evaluation,score,route,total:num(evaluation?.best?.total),distanceKm:num(score?.distanceKm??route?.distanceKm)};});}
  function maxPower(st){let max=0;for(const evse of st?.evses||[])for(const c of evse?.connectors||[])max=Math.max(max,num(c?.powerKw)||0);return max;}
  function connectorKind(c={}){const raw=text(c.kind||c.currentType||c.powerType||c.plugName).toUpperCase();if(raw.includes('DC')||raw.includes('CCS')||raw.includes('CHADEMO'))return'DC';if(raw.includes('AC')||raw.includes('TYPE2')||raw.includes('TYPE 2'))return'AC';const power=num(c.powerKw);return power!=null&&power>22?'DC':'AC';}
  function powerLines(row){
    const map=new Map(),station=row?.station||{};
    for(const evse of station.evses||[])for(const connector of evse.connectors||[]){
      const power=num(connector.powerKw??connector.power??evse.powerKw);if(power==null||power<=0)continue;
      const kind=connectorKind(connector),key=kind+':'+power,current=map.get(key)||{kind,powerKw:power,count:0};current.count++;map.set(key,current);
    }
    return [...map.values()].sort((a,b)=>a.kind.localeCompare(b.kind)||b.powerKw-a.powerKw);
  }
  function formatMinutes(value){const n=num(value);if(n==null)return'—';const total=Math.max(0,Math.round(n)),h=Math.floor(total/60),m=total%60;return h?h+' h '+String(m).padStart(2,'0')+' min':m+' min';}
  function renderPowerLines(row){
    const lines=powerLines(row);if(!lines.length)return'<div class="small">Puissance non renseignée</div>';
    return'<div class="v9-power-lines" style="margin-top:8px">'+lines.map(line=>'<div class="small" style="display:flex;justify-content:space-between;gap:8px"><span>'+esc(line.kind)+' · <b>'+line.powerKw+' kW</b></span><span>'+line.count+' point(s)</span></div>').join('')+'</div>';
  }
  function renderMapSummary(w,area,rows){
    const engine=w.TCCV9MapPriceEngine;if(!engine)return;
    const host=w.document.getElementById('v9MapSummary')||w.document.createElement('section');
    host.id='v9MapSummary';host.className='box';host.style.cssText='margin:10px 0;background:#11151a;border:1px solid #28323d';
    const zoneRows=engine.summarizeZones(rows||[],{precision:1}),visible=zoneRows.slice(0,12);
    host.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>Résultats V9</b><div role="group" aria-label="Mode d’affichage"><button type="button" class="secondary v9-view-list" style="width:auto;padding:6px 10px">☷ Liste</button><button type="button" class="secondary v9-view-map" style="width:auto;padding:6px 10px">⌖ Carte</button></div></div>'+
      '<div class="small" style="margin-top:6px">La liste reste la vue principale. La carte agrège le meilleur €/km par zone au dézoom et détaille les stations disponibles.</div>'+
      '<div id="v9MapZones" style="display:none;margin-top:8px">'+(visible.length?'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">'+visible.map(z=>'<div style="padding:8px;border-radius:8px;background:#1a222b"><b>'+engine.formatPricePerKm(z.bestPricePerKm)+'</b><div class="small">'+esc(z.bestStation?.name||'Zone')+' · '+z.pricedStationCount+'/'+z.stationCount+' tarifée(s)</div></div>').join('')+'</div>':'<div class="small">Aucun prix/km vérifiable dans cette zone.</div>')+'</div>';
    const results=w.document.getElementById('results');if(results&&host.parentNode!==results.parentNode)results.parentNode.insertBefore(host,results);
    const listButton=host.querySelector('.v9-view-list'),mapButton=host.querySelector('.v9-view-map'),zones=host.querySelector('#v9MapZones');
    const setMode=mode=>{const map=mode==='map';if(zones)zones.style.display=map?'block':'none';if(results)results.style.display=map?'none':'';listButton?.classList.toggle('primary',!map);mapButton?.classList.toggle('primary',map);host.dataset.v9View=mode;};
    listButton?.addEventListener('click',()=>setMode('list'));mapButton?.addEventListener('click',()=>setMode('map'));setMode('list');
  }


  function renderCandidate(w,area,rows,originLabel){
    const results=w.document.getElementById('results'),routeStatus=w.document.getElementById('routeStatus');if(!results)throw new Error('stable results container missing');
    if(routeStatus)routeStatus.innerHTML='<span class="good">Moteur V9 canary · '+rows.length+' borne(s) classée(s) depuis '+esc(originLabel)+'.</span>';
    if(!rows.length){renderMapSummary(w,area,rows);results.innerHTML='<div class="warn">Aucune borne V9 exploitable pour cette recherche. Retour au moteur stable recommandé.</div>';return;}
    results.innerHTML='<div class="small box"><b>Moteur V9</b> · liste par défaut · puissances réellement proposées par EVSE.</div>'+rows.map((row,i)=>{const st=row.station,best=row.evaluation?.best,score=row.score,route=row.route;return '<div class="box" style="margin-top:10px"><b>'+(i+1)+'. '+esc(st.name||'Borne')+'</b><div class="small">'+esc(st.physicalOperator?.name||'Opérateur inconnu')+'</div>'+renderPowerLines(row)+'<div style="margin-top:6px">'+(best?'<b>'+Number(best.total).toFixed(2)+' '+esc(best.targetCurrency||'EUR')+'</b> · '+esc(best.provider||'tarif'):'<span class="warn">Tarif non comparable</span>')+(Number.isFinite(row.distanceKm)?' · '+row.distanceKm.toFixed(1)+' km':'')+'</div>'+(score?'<div class="small">Charge '+formatMinutes(score.chargingMinutes)+' · trajet '+formatMinutes(score.driveMinutes)+' · total '+formatMinutes(score.totalTimeMinutes)+(score.chargeModel?.averagePowerKw!=null?' · moyenne '+Number(score.chargeModel.averagePowerKw).toFixed(1)+' kW':'')+'</div>':'')+(route?.provider?'<div class="small">Routage '+esc(route.provider)+'</div>':'')+'</div>';}).join('');
    renderMapSummary(w,area,rows);
  }


  async function executeV9(w,engine,cfg,input){
    if(!(input.targetSoc>input.startSoc))throw new Error('invalid SOC target');if(!input.originText)throw new Error('origin required');
    if(cfg.mode==='candidate'&&!(input.radiusKm>0))throw new Error('unbounded radius not production-equivalent');
    if(typeof w.resolveOrigin!=='function')throw new Error('stable origin resolver unavailable');const origin=await w.resolveOrigin(input.originText),countryCode=await countryCodeForOrigin(w,origin),scope=cfg.engineScopeCountries||[];
    if(scope.length&&!scope.includes(countryCode))throw new Error(`country outside V9 shell scope: ${countryCode}`);
    const queryRadius=input.radiusKm>0?input.radiusKm:20,filters={...(input.operatorIds?.length?{operatorIds:input.operatorIds}:{}),...(input.connectorKinds?.length?{connectorKinds:input.connectorKinds}:{})},session=buildSession(input);
    const selected=selectedSubscriptions(w);
    const area=await engine.queryArea({countryCode,origin:{lat:Number(origin.lat),lon:Number(origin.lon)},radiusKm:queryRadius,filters,session,vehicleProfileId:'generic-ev-preview',selectedSubscriptions:selected,subscriptionFilters:{countryCodes:[countryCode],coverageMode:'any'},routingBudget:80,perOperatorFloor:2,sortBy:'finalCost'});
    const rows=rankRows(rowsFromArea(area),input.rankingMode,20);return{area,rows,origin,countryCode,queryRadius,partialRadius:!(input.radiusKm>0),selectedSubscriptions:selected};
  }
  function normalizeLegacyChrome(w){
    const d=w.document;
    d.documentElement.dataset.tccVersion='v9';
    d.title='Tesla Charge Companion V9';
    const heading=d.querySelector('header h1,h1');
    if(heading)heading.textContent='⚡ Tesla Charge Companion V9';
    const versionNodes=[...d.querySelectorAll('header *,body *')].filter(el=>el.children.length===0);
    const version=versionNodes.find(el=>/Version 7\\.3 Stable/i.test(text(el.textContent)));
    if(version)version.textContent='Version V9 · snapshot figé · comparaison de prix';
    const nl=d.getElementById('netherlandsRefreshButton');
    if(nl){
      nl.hidden=true;
      nl.style.display='none';
      const explanation=nl.parentElement?.querySelector(':scope > p, :scope > .small');
      if(explanation && /snapshot DOT-NL|Pays-Bas/i.test(text(explanation.textContent))){
        explanation.hidden=true;
        explanation.style.display='none';
      }
    }
    const legacyTabs=[...d.querySelectorAll('button')].filter(btn=>/^(Bornes|Ajouter \\/ modifier|Devises|Synchronisation)$/i.test(text(btn.textContent)));
    legacyTabs.forEach(btn=>{btn.hidden=true;btn.style.display='none';});
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

  function installOperatorMultiSelect(w){
    const select=w.document.getElementById('simOperatorFilter');
    if(!select||select.dataset.v9Multi==='true')return;
    select.multiple=true;select.size=4;select.dataset.v9Multi='true';
    select.setAttribute('aria-label','Réseaux affichés, sélection multiple');
    const options=[['tesla','Tesla'],['all','Tous les réseaux']];
    select.innerHTML=options.map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('');
    select.options[0].selected=true;
    const quick=w.document.createElement('button');quick.type='button';quick.id='v9TeslaOnly';
    quick.className='secondary';quick.textContent='Tesla uniquement';quick.title='Afficher uniquement le réseau Tesla';
    quick.style.cssText='width:auto;margin-top:6px;padding:8px 12px';
    quick.addEventListener('click',()=>{
      [...select.options].forEach(option=>{option.selected=option.value==='tesla';});
      select.dispatchEvent(new w.Event('change',{bubbles:true}));
    });
    (select.parentElement||select).appendChild(quick);
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
    const selected=current.size?current:new Set(['tesla']);
    select.innerHTML=[...operators.entries()].map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('')+
      '<option value="all">Tous les réseaux</option>';
    [...select.options].forEach(option=>{option.selected=selected.has(option.value);});
  }

  function installPowerTypeFilter(w){
    const operator=w.document.getElementById('simOperatorFilter');if(!operator||w.document.getElementById('simPowerType'))return;
    const host=w.document.createElement('div');host.className='full';host.innerHTML='<label for="simPowerType"><b>Type de recharge</b><select id="simPowerType" multiple size="2" aria-label="Type de recharge, sélection multiple" style="margin-top:6px;width:100%"><option value="AC">AC</option><option value="DC">DC</option></select><span class="small" style="display:block;margin-top:4px">Laisser vide pour AC et DC.</span></label>';
    const parent=operator.closest('label')||operator.parentElement;parent?.parentElement?.insertBefore(host,parent.nextSibling);
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
    const legacyCompare=w.compare;
    const enginePromise=createEngine(w,cfg);
    installCurrentPositionButton(w);
    installOperatorMultiSelect(w);
    installPowerTypeFilter(w);
    installProgressiveSearchForm(w);
    w.compare=async function(){const input=readInputs(w);if(cfg.mode==='shadow'){
      const stable=await legacyCompare.apply(this,arguments);enginePromise.then(engine=>executeV9(w,engine,cfg,input)).then(run=>diagnosticStore(w,{mode:'shadow',outcome:'v9-ok',countryCode:run.countryCode,stationCount:run.area?.stations?.length||0,rankedCount:run.rows.length,sourceErrors:run.area?.diagnostics?.errors?.length||0,routingErrors:run.area?.diagnostics?.routingErrorCount||0,partialRadius:run.partialRadius})).catch(err=>diagnosticStore(w,{mode:'shadow',outcome:'v9-fallback',reason:err.message}));return stable;
    }
      try{const engine=await enginePromise,run=await executeV9(w,engine,cfg,input);renderSubscriptionSelector(w,run.area?.subscriptions||[],run.countryCode);renderCandidate(w,run.area,run.rows,run.origin.label||input.originText);diagnosticStore(w,{mode:'candidate',outcome:'v9-ok',countryCode:run.countryCode,stationCount:run.area?.stations?.length||0,rankedCount:run.rows.length,selectedSubscriptionCount:run.selectedSubscriptions.length,sourceErrors:run.area?.diagnostics?.errors?.length||0,routingErrors:run.area?.diagnostics?.routingErrorCount||0});return run.area;}catch(err){diagnosticStore(w,{mode:'candidate',outcome:'legacy-fallback',reason:err.message});return legacyCompare.apply(this,arguments);}
    };
    marker.pending=false;marker.ready=true;
    return marker;
  }
  return{rankingWeights,rankRows,combineDateTime,dcCurve,readInputs,buildSession,rowsFromArea,powerLines,formatMinutes,renderPowerLines,selectedSubscriptions,saveSelectedSubscriptions,subscriptionLabel,renderSubscriptionSelector,renderMapSummary,installCurrentPositionButton,installOperatorMultiSelect,installPowerTypeFilter,installProgressiveSearchForm,refreshOperatorOptions,executeV9,install};
});
