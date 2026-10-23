(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9PreparedCandidate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const sourcePattern=/^[A-Z]{2}:[a-z0-9_]+$/;
  const shaPattern=/^[a-f0-9]{64}$/;
  function candidateUrl(base,path){
    const anchor=String(base||'').replace(/\/$/,'')+'/';
    return new URL(path,anchor).toString();
  }
  async function sha256Hex(bytes,cryptoImpl){
    const impl=cryptoImpl||root?.crypto;
    if(!impl?.subtle?.digest)throw new Error('preproduction SHA verification unavailable');
    const hash=new Uint8Array(await impl.subtle.digest('SHA-256',bytes));
    return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function loadPrepared({baseUrl,fetchImpl,adapter,cryptoImpl,origin}={}){
    if(!adapter?.toFragments)throw new Error('canonical adapter missing');
    const base=new URL(String(baseUrl||''),origin||root?.location?.href||'http://localhost/');
    if(base.protocol!=='https:'&&base.hostname!=='localhost'&&base.hostname!=='127.0.0.1')
      throw new Error('insecure preproduction origin');
    if(origin&&base.origin!==new URL(origin).origin)throw new Error('external preproduction origin blocked');
    const fetcher=fetchImpl||root?.fetch?.bind(root);
    if(typeof fetcher!=='function')throw new Error('preview fetch unavailable');
    async function jsonAt(url,expectedSha){
      const response=await fetcher(url,{cache:'no-store'});
      if(!response?.ok)throw new Error('candidate resource unavailable');
      const raw=await response.arrayBuffer();
      if(expectedSha&&await sha256Hex(raw,cryptoImpl)!==expectedSha)throw new Error('candidate source SHA mismatch');
      return JSON.parse(new TextDecoder().decode(raw));
    }
    const index=await jsonAt(candidateUrl(base,'index.json'));
    if(index?.schemaVersion!==1||!['prepared','partial_failure'].includes(index.status)||
       !Array.isArray(index.sources)||!Array.isArray(index.rejected)||!index.sources.length)
      throw new Error('candidate index invalid');
    const sources=[],loaders={},seen=new Set();
    for(const entry of index.sources){
      const id=entry?.source,path=entry?.path,expectedPath='sources/'+String(id||'').replace(':','__')+'.json';
      if(!sourcePattern.test(id)||seen.has(id)||path!==expectedPath||!shaPattern.test(entry.sha256))
        throw new Error('candidate source descriptor invalid');
      seen.add(id);
      const registryId='prepared:'+id;
      sources.push({id:registryId,countries:[id.slice(0,2)],priority:100,active:true,optional:false});
      let pending=null;
      loaders[registryId]=async function(){
        if(!pending)pending=jsonAt(candidateUrl(base,path),entry.sha256).then(data=>{
          if(data?.schemaVersion!==1||data?.source?.id!==id||
             !Array.isArray(data.stations)||!Array.isArray(data.evses)||
             !Array.isArray(data.connectors)||!Array.isArray(data.offers))
            throw new Error('candidate source schema or identity invalid');
          const fragments=adapter.toFragments(data);
          const rawOffers=new Map(data.offers.map(row=>[row.id,row]));
          const rawEvses=new Map(data.evses.map(row=>[row.id,row]));
          const offerCounts=new Map(),connectorOfferCounts=new Map();
          if(id==='BE:nap_static')for(const row of data.offers)
            offerCounts.set(row.scope?.evseId,(offerCounts.get(row.scope?.evseId)||0)+1);
          if(id==='NL:dotnl_static')for(const row of data.offers)
            connectorOfferCounts.set(row.scope?.connectorId,(connectorOfferCounts.get(row.scope?.connectorId)||0)+1);
          const provedOffer=(fragment,offer)=>{
            if(fragment.countryCode!==id.slice(0,2)||offer?.metadata?.sourceId!==id||
               offer.metadata.verified!==true||offer.metadata.artifactSha256!==data.source.artifactSha256||
               offer.kind!=='direct'||offer.currency!=='EUR'||
               !Array.isArray(offer.evseIds)||offer.evseIds.length!==1||
               !Array.isArray(offer.connectorIds)||!offer.connectorIds.length||
               offer.pricing?.type!=='rules'||Object.keys(offer.pricing).sort().join(',')!=='rules,type'||
               offer.pricing.rules?.length!==1)return false;
            const rule=offer.pricing.rules[0],raw=rawOffers.get(offer.id);
            const ordinaryRule='afterMinutesRate,afterMinutesThreshold,billing,chargePerMinute,connectionFee,currency,end,idlePerMinute,pricePerKwh,scope,start';
            const nlRequired=['afterMinutesRate','afterMinutesThreshold','billing','chargePerMinute','connectionFee','currency','end','energyStepWh','idlePerMinute','pricePerKwh','scope','start'];
            const nlAllowed=new Set([...nlRequired,'chargingTimeStepSeconds','parkingTimeStepSeconds','validFromDate']);
            if((id==='NL:dotnl_static'?
                 nlRequired.some(key=>!Object.prototype.hasOwnProperty.call(rule,key))||
                   Object.keys(rule).some(key=>!nlAllowed.has(key)):
                 Object.keys(rule).sort().join(',')!==ordinaryRule)||
               rule.scope!=='allDay'||rule.billing!=='kwh'||rule.start!=='00:00'||rule.end!=='24:00'||
               rule.currency!=='EUR'||!Number.isFinite(rule.pricePerKwh)||rule.pricePerKwh<0||
               (id==='NL:dotnl_static'?
                 !['afterMinutesRate','afterMinutesThreshold'].every(key=>rule[key]===0):
                 !['chargePerMinute','connectionFee','idlePerMinute','afterMinutesRate','afterMinutesThreshold']
                   .every(key=>rule[key]===0))||!raw||raw.channel!=='Direct'||
               raw.scope?.evseId!==offer.evseIds[0]||raw.calculationStatus!=='not_evaluated')return false;
            const local=fragment.evses.find(evse=>evse.id===offer.evseIds[0]);
            if(!local||!offer.connectorIds.every(connectorId=>
              local.connectors.some(connector=>connector.id===connectorId&&connector.powerKw>0)))return false;
            if(id==='BE:nap_static'){
              const source=rawEvses.get(offer.evseIds[0]),price=raw.rawOffer;
              return offer.metadata.identityMode==='exact_canonical_evse_supported_connectors'&&
                raw.scope?.connectorId==null&&source?.unclassifiedPrices?.length===0&&
                offerCounts.get(offer.evseIds[0])===1&&price?.ratePolicy==='adHoc'&&
                price.priceType==='pricePerKWh'&&price.currency==='EUR'&&
                price.taxIncluded===false&&price.taxRate===21&&
                typeof price.value==='number'&&price.value>=0&&price.value<=3&&
                Math.round(price.value*1.21*1e8)/1e8===rule.pricePerKwh&&
                (source.archiveVariants||[]).every(row=>row.prices?.length===1&&
                  JSON.stringify(row.prices[0])===JSON.stringify(price));
            }
            if(id==='NL:dotnl_static'){
              const tariff=data.tariffCatalog?.[raw.sourceTariffKey];
              const element=tariff?.elements?.[0],components=element?.priceComponents;
              const restrictions=element?.restrictions;
              const activeRestrictions=restrictions?Object.entries(restrictions).filter(([,value])=>
                Array.isArray(value)?value.length:value!=null&&value!==''):[];
              const energy=Array.isArray(components)?components.filter(component=>component.type==='ENERGY'):[];
              const byType=new Map();
              if(!Array.isArray(components))return false;
              for(const component of components){
                if(!['ENERGY','TIME','FLAT','PARKING_TIME'].includes(component.type)||
                   byType.has(component.type)||!Number.isFinite(component.priceInclVat)||
                   component.priceInclVat<0||!Number.isInteger(component.stepSize)||
                   component.stepSize<0||
                   (component.priceInclVat>0&&component.type!=='FLAT'&&component.stepSize<1))return false;
                byType.set(component.type,component);
              }
              const paidTime=byType.get('TIME')?.priceInclVat||0;
              const paidParking=byType.get('PARKING_TIME')?.priceInclVat||0;
              return offer.metadata.identityMode==='exact_canonical_connector_ocpi'&&
                offer.connectorIds.length===1&&raw.scope?.connectorId===offer.connectorIds[0]&&
                connectorOfferCounts.get(offer.connectorIds[0])===1&&
                Object.keys(raw.rawOffer||{}).join(',')==='tariffKey'&&
                raw.rawOffer.tariffKey===raw.sourceTariffKey&&
                tariff?.tariffKey===raw.sourceTariffKey&&
                [null,'REGULAR','AD_HOC_PAYMENT'].includes(tariff.type)&&
                tariff.currency==='EUR'&&tariff.startDateTime==null&&tariff.endDateTime==null&&
                tariff.minPrice==null&&tariff.maxPrice==null&&tariff.elements.length===1&&
                activeRestrictions.length<=1&&
                activeRestrictions.every(([name,value])=>name==='start_date'&&
                  typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
                  !Number.isNaN(Date.parse(value+'T00:00:00Z'))&&
                  new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value)&&
                rule.validFromDate===(activeRestrictions.length?activeRestrictions[0][1]:undefined)&&
                energy.length===1&&energy[0].priceInclVat===rule.pricePerKwh&&
                energy[0].stepSize===rule.energyStepWh&&
                Number.isInteger(rule.energyStepWh)&&rule.energyStepWh>=1&&
                rule.connectionFee===(byType.get('FLAT')?.priceInclVat||0)&&
                rule.idlePerMinute===paidParking/60&&
                rule.chargePerMinute===paidTime/60&&
                (paidTime>0?
                  rule.chargingTimeStepSeconds===byType.get('TIME').stepSize:
                  rule.chargingTimeStepSeconds==null)&&
                (paidParking>0?rule.parkingTimeStepSeconds===byType.get('PARKING_TIME').stepSize:
                  rule.parkingTimeStepSeconds==null);
            }
            if(!['FR:ionity_direct','IT:atlante_direct'].includes(id)||
               offer.metadata.identityMode!=='exact_canonical_connector'||
               offer.connectorIds.length!==1||raw.scope?.connectorId!==offer.connectorIds[0]||
               rule.pricePerKwh<=0)return false;
            if(id==='FR:ionity_direct')return offer.provider==='IONITY Direct'&&
              Object.keys(raw.rawOffer||{}).length===1&&raw.rawOffer.pricePerKwhEur===rule.pricePerKwh;
            return offer.provider==='Atlante direct'&&raw.rawOffer?.priceComponents?.length===1&&
              raw.rawOffer.priceComponents[0]?.priceDimension==='ENERGY'&&
              raw.rawOffer.priceComponents[0]?.price?.incl_vat===rule.pricePerKwh;
          };
          if(fragments.some(f=>f.countryCode!==id.slice(0,2)||
             f.offers.some(offer=>!provedOffer(f,offer))))
            throw new Error('candidate pricing isolation violated');
          return fragments;
        }).catch(error=>{pending=null;throw error;});
        return pending;
      };
    }
    if(index.status==='partial_failure'&&!index.rejected.length)
      throw new Error('partial candidate missing failure report');
    return{registry:{sources,subscriptionCoverage:[]},loaders,
      candidate:{status:index.status,bundleId:index.bundleId,rejected:index.rejected.map(x=>({source:x.source,reason:x.reason}))}};
  }
  return{loadPrepared,sha256Hex};
});
