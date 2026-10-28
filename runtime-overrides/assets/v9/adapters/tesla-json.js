(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.teslaJson=api;}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=v=>String(v==null?'':v).trim();
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));

  function normalizedPricing(pricing,powerKw){
    const out=clone(pricing);if(!out||!Array.isArray(out.rules))return out;
    out.rules=out.rules.map(rule=>{
      const next={...rule};
      if(next.pricePerMinute==null&&Array.isArray(next.powerBands)){
        const bands=next.powerBands;
        const ceiling=Math.max(...bands.map(b=>Number(b?.maxKw)));
        const band=bands.find(b=>Number.isFinite(Number(b?.minKw))&&Number.isFinite(Number(b?.maxKw))&&
          powerKw>=Number(b.minKw)&&(powerKw<Number(b.maxKw)||powerKw===ceiling&&Number(b.maxKw)===ceiling));
        if(band&&Number.isFinite(Number(band.ratePerMinute)))next.pricePerMinute=Number(band.ratePerMinute);
      }
      return next;
    });
    return out;
  }
  function provedMoroccoPowerMinute(raw,station){
    if(text(raw?.countryCode).toUpperCase()!=='MA'||station?.countryCode!=='MA')return[];
    const configs=configRows(raw);
    return (station.offers||[]).filter(offer=>{
      const cfg=configs.find(row=>text(row?.id)===offer.evseIds?.[0]);
      const pricing=cfg?.pricing||raw?.pricing;
      if(!cfg||!pricing||pricing.type!=='rules'||!Array.isArray(pricing.rules)||!pricing.rules.length||
         offer.evseIds?.length!==1||!station.evses?.some(evse=>evse.id===offer.evseIds[0])||
         offer.currency!=='MAD')return false;
      return pricing.rules.every(rule=>rule.billing==='powerMinute'&&rule.currency==='MAD'&&
        Array.isArray(rule.powerBands)&&rule.powerBands.length>0&&
        rule.powerBands.every(b=>Number.isFinite(Number(b.minKw))&&Number.isFinite(Number(b.maxKw))&&
          Number(b.maxKw)>Number(b.minKw)&&Number.isFinite(Number(b.ratePerMinute))&&Number(b.ratePerMinute)>=0));
    });
  }

  function configRows(raw){
    if(Array.isArray(raw?.chargingConfigurations)&&raw.chargingConfigurations.length)return raw.chargingConfigurations;
    return [{id:`${raw?.id||'tesla'}:default`,label:'Tesla',kind:raw?.kind||'DC',powerKw:Number(raw?.powerKw||0),stalls:Number(raw?.stalls||0),pricing:raw?.pricing||null}];
  }
  function pricingCurrency(pricing){
    const currencies=[...new Set((pricing?.rules||[]).map(rule=>text(rule?.currency).toUpperCase()).filter(Boolean))];
    return currencies.length===1?currencies[0]:null;
  }
  function potentialCongestionFee(raw,currency){
    const amount=Number(raw?.teslaCongestionFeePerMinute);
    if(!Number.isFinite(amount)||amount<=0)return null;
    // A site-level amount does not prove that the site is busy for a session.
    // Keep the evidence separate from the billable pricing rules.
    return {amountPerMinute:amount,currency:currency||null,
      condition:'busy_site_and_soc_threshold_or_session_ended',conditionVerified:false,
      sourceField:'teslaCongestionFeePerMinute'};
  }

  function normalizeStation(raw){
    if(!raw||!text(raw.id))return null;
    const configs=configRows(raw),evses=[],offers=[];
    for(const [index,cfg] of configs.entries()){
      const evseId=text(cfg?.id)||`${raw.id}:cfg:${index}`;
      evses.push({
        id:evseId,
        label:text(cfg?.label)||'Tesla',
        stalls:Number(cfg?.stalls||raw?.stalls||0),
        connectors:[{id:`${evseId}:connector`,kind:text(cfg?.kind||raw?.kind||'DC').toUpperCase(),powerKw:Number(cfg?.powerKw||raw?.powerKw||0)}]
      });
      if(cfg?.pricing||raw?.pricing){
        const pricing=cfg?.pricing||raw?.pricing,currency=pricingCurrency(pricing),potentialFee=potentialCongestionFee(raw,currency);
        offers.push({
        id:`tesla-direct:${evseId}`,
        provider:'Tesla',kind:'direct',subscriptionId:null,countries:[text(raw?.countryCode).toUpperCase()||'*'],currency:currency||'EUR',
        evseIds:[evseId],pricing:normalizedPricing(pricing,Number(cfg?.powerKw||raw?.powerKw)),priority:100,
        metadata:{source:'Tesla canonical catalogue',sourceUpdatedAt:raw.lastUpdated||null,
          ...(text(raw.countryCode).toUpperCase()==='MA'?{timeZone:'Africa/Casablanca'}:{}),
          ...(potentialFee?{potentialCongestionFee:potentialFee}:{}),
          ...(currency?{}:{incompletePricingReason:'tesla_source_currency_ambiguous'})}
      });
      }
    }
    return{
      canonicalId:text(raw.id),
      aliases:[`tesla:${text(raw.id)}`],
      sourceStationId:text(raw.id),
      countryCode:text(raw.countryCode).toUpperCase(),
      name:text(raw.name)||'Tesla Supercharger',address:text(raw.address),
      latitude:Number(raw.latitude),longitude:Number(raw.longitude),
      physicalOperator:{id:'tesla',name:'Tesla'},networkBrand:'Tesla Supercharger',
      evses,access:clone(raw.access)||null,
      status:{state:raw.temporarilyUnavailable===true?'out_of_service':'available',updatedAt:raw.lastUpdated||null,sourceId:'tesla-global'},
      offers,updatedAt:raw.lastUpdated||null,
      mapsUrl:text(raw.mapsUrl)||null,teslaUrl:text(raw.teslaUrl)||null,
      legacy:{source:raw.source||'teslaSupercharger'}
    };
  }

  function normalizePayload(payload){return (Array.isArray(payload)?payload:payload?.stations||[]).map(normalizeStation).filter(Boolean);}

  function createLoader({url='data/tesla_stations.json',fetchImpl}={}){
    const f=fetchImpl||(typeof fetch==='function'?fetch.bind(globalThis):null);let promise=null;
    if(!f)throw new Error('fetch unavailable for Tesla adapter');
    return async function(){
      if(!promise)promise=f(url,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error(`Tesla catalogue unavailable (${r.status})`);return r.json();}).then(normalizePayload).catch(err=>{promise=null;throw err;});
      return promise;
    };
  }

  return{normalizeStation,normalizePayload,createLoader,pricingCurrency,potentialCongestionFee,normalizedPricing,provedMoroccoPowerMinute};
});
