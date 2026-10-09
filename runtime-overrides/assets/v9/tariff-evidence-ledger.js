/* TCC V9.1: no-loss raw-tariff-to-EVSE/power accounting, not a price calculator. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else if(root)root.TCCV91TariffEvidenceLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const str=x=>String(x==null?'':x).trim();
  const optNum=x=>x===null||x===undefined||x===''?null:(Number.isFinite(Number(x))?Number(x):null);
  const values=x=>Array.isArray(x)?x.map(str).filter(Boolean):(str(x)?[str(x)]:[]);
  const stable=v=>{
    if(Array.isArray(v))return v.map(stable);
    if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));
    return v;
  };
  const stableJson=v=>JSON.stringify(stable(v));
  const verified=t=>t.verification?.status==='verified'&&Boolean(str(t.verification?.evidenceRef));
  const appliesKey=t=>stableJson({
    channel:t.channel??null,provider:t.provider??null,subscriptionId:t.subscriptionId??null,
    paymentMethod:t.paymentMethod??null,customerType:t.customerType??null,
    timeWindows:t.timeWindows??null,validFrom:t.validFrom??null,
    validThrough:t.validThrough??null,conditions:t.conditions??null,
    currency:t.currency??null
  });
  const priceKey=t=>stableJson({pricing:t.pricing??null,pricePerKwh:t.pricePerKwh??null,pricePerMinute:t.pricePerMinute??null,connectionFee:t.connectionFee??null});

  function buildTariffLedger({stations=[],tariffs=[]}={}){
    const points=[];
    for(const station of stations){
      const countryCode=str(station.countryCode).toUpperCase();
      const stationId=str(station.id||station.canonicalId||station.stationId);
      for(const [evseIndex,evse] of (station.evses||[]).entries()){
        const evseId=str(evse.id||evse.evseId||evse.pdcId);
        const connectors=(evse.connectors||[]).length?evse.connectors:[null];
        for(const [connectorIndex,connector] of connectors.entries()){
          points.push({pointKey:[countryCode,stationId,evseId,connectorIndex].join('|'),
            countryCode,stationId,evseId,connectorId:str(connector?.id||connector?.connectorId)||null,
            powerKw:optNum(connector?.powerKw??connector?.power),
            operatorId:str(station.physicalOperator?.id||station.physicalOperatorId),
            tariffs:[],resolutionStatus:'tarif_indisponible',conflicts:[]});
        }
      }
    }
    const unresolved=[];
    const sources=new Map();
    const sorted=new Map();
    points.forEach(point=>{
      const key=[point.countryCode,point.stationId,point.evseId].join('|');
      if(!sorted.has(key))sorted.set(key,[]);
      sorted.get(key).push(point);
    });

    for(const [observationIndex,raw] of tariffs.entries()){
      const t=raw&&typeof raw==='object'?raw:{rawValue:raw};
      const sourceId=str(t.sourceId)||'source_non_identifiee';
      const observationId=str(t.id||t.sourceTariffId)||'observation-'+(observationIndex+1);
      const ledgerId=sourceId+':'+observationIndex+':'+observationId;
      const source=sources.get(sourceId)||{sourceId,observations:0,attached:0,unresolved:0,pointLinks:0};
      source.observations++;sources.set(sourceId,source);
      const targetEvse=values(t.evseIds??t.evseId),targetConnector=values(t.connectorIds??t.connectorId);
      const targetStation=values(t.stationIds??t.stationId),country=str(t.countryCode).toUpperCase();
      const reasons=[];
      if(!targetEvse.length&&!targetConnector.length){
        reasons.push('identite_evse_ou_connecteur_absente');
      }
      // A confirmed station-wide tariff may apply to multiple EVSEs. Mere station
      // identity or an operator match is never sufficient.
      const verifiedStationWide=t.appliesToAllEvsesVerified===true&&verified(t)&&targetStation.length>0;
      let eligible=[];
      if(targetEvse.length||targetConnector.length||verifiedStationWide){
        eligible=points.filter(p=>(!country||p.countryCode===country)&&
          (!targetStation.length||targetStation.includes(p.stationId))&&
          (!targetEvse.length||targetEvse.includes(p.evseId))&&
          (!targetConnector.length||targetConnector.includes(p.connectorId)));
      }
      if(!eligible.length&&!reasons.length)reasons.push('identite_exacte_introuvable');
      const exactPower=optNum(t.powerKw),minPower=optNum(t.minPowerKw),maxPower=optNum(t.maxPowerKw);
      const prePower=eligible;
      eligible=eligible.filter(p=>p.powerKw!==null&&
        (exactPower===null||p.powerKw===exactPower)&&
        (minPower===null||p.powerKw>=minPower)&&
        (maxPower===null||p.powerKw<=maxPower));
      if(prePower.length&&!eligible.length)reasons.push('puissance_non_confirmee_ou_incompatible');
      // One EVSE can expose different powers. A rate without power restriction
      // must not be copied to all powers without source-backed verification.
      if(eligible.length&&exactPower===null&&minPower===null&&maxPower===null&&!(t.appliesToAllPowersVerified===true&&verified(t))){
        const powers=new Set(eligible.map(p=>p.powerKw));
        if(powers.size>1){reasons.push('portee_multpuissance_non_verifiee');eligible=[];}
      }
      // Matching one common ID across multiple sites is ambiguous, not permission
      // to spread the price across sites (unless station-wide is evidenced).
      if(eligible.length&&!targetStation.length&&!verifiedStationWide){
        const siteIds=new Set(eligible.map(p=>p.countryCode+'|'+p.stationId));
        if(siteIds.size>1){reasons.push('identite_evse_non_unique_entre_sites');eligible=[];}
      }
      if(!eligible.length){
        source.unresolved++;
        unresolved.push({ledgerId,sourceId,observationId,reasons:reasons.length?reasons:['portee_inconnue'],observation:t});
        continue;
      }
      source.attached++;source.pointLinks+=eligible.length;
      for(const p of eligible){
        p.tariffs.push({ledgerId,sourceId,observationId,observation:t,
          verificationStatus:verified(t)?'verifie':'verification_requise'});
      }
    }
    for(const point of points){
      if(!point.tariffs.length)continue;
      const scenarios=new Map();
      for(const t of point.tariffs){
        const key=appliesKey(t.observation);
        const cluster=scenarios.get(key)||[];
        cluster.push(t);scenarios.set(key,cluster);
      }
      for(const candidates of scenarios.values()){
        const distinctPrices=new Set(candidates.map(t=>priceKey(t.observation)));
        if(distinctPrices.size>1){
          const conflict={reason:'montants_ou_regles_concurrents_meme_scenario',ledgerIds:candidates.map(t=>t.ledgerId),
            action:'controle_site_app_officiels_puis_verification_manuelle'};
          point.conflicts.push(conflict);
        }
      }
      point.resolutionStatus=point.conflicts.length?'tarif_a_verifier_conflit':
        point.tariffs.every(t=>t.verificationStatus==='verifie')?'preuve_tarifaire_verifiee':'tarif_a_verifier';
    }
    const sourceCounts=[...sources.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
    const totals={observations:tariffs.length,attached:sourceCounts.reduce((sum,s)=>sum+s.attached,0),
      unresolved:unresolved.length,physicalRows:points.length,
      attachedPointLinks:sourceCounts.reduce((sum,s)=>sum+s.pointLinks,0)};
    if(totals.observations!==totals.attached+totals.unresolved)
      throw new Error('perte silencieuse de tarif: comptabilite impossible');
    return{schemaVersion:1,points,unresolved,sourceCounts,totals};
  }
  return{buildTariffLedger};
});
