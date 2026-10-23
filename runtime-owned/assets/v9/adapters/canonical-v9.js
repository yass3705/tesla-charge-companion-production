(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TCCV9CanonicalAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function coordinates(row){
    if(Number.isFinite(row.latitude)&&Number.isFinite(row.longitude))return[row.latitude,row.longitude];
    const raw=row.coordinates?.Google;
    if(typeof raw==='string'){
      const match=raw.match(/^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*$/);
      if(match){const lat=Number(match[1]),lon=Number(match[2]);if(Math.abs(lat)<=90&&Math.abs(lon)<=180)return[lat,lon];}
    }
    return[null,null];
  }
  function address(row){
    if(typeof row.address==='string')return row.address;
    if(row.address&&typeof row.address==='object')return Object.values(row.address).filter(value=>typeof value==='string'&&value.trim()).join(', ');
    return'';
  }
  function toFragments(data){
    if(data?.schemaVersion!==1||!Array.isArray(data?.stations)||!Array.isArray(data?.evses)||!Array.isArray(data?.connectors)||!Array.isArray(data?.offers))throw new Error('canonical schema invalid');
    const cpos=new Map((data.cpos||[]).map(row=>[row.id,row]));
    const stations=new Map(data.stations.map(row=>[row.id,{row,evses:[],offers:[]}]));
    const evses=new Map();
    for(const row of data.evses){
      const station=stations.get(row.stationId);
      if(!station)throw new Error('canonical EVSE station missing');
      const output={id:row.id,officialEvseId:row.officialEvseId||null,sourceEvseId:row.sourceEvseId||null,connectors:[]};
      station.evses.push(output);evses.set(row.id,{output,station});
    }
    for(const row of data.connectors){
      const evse=evses.get(row.evseId);
      if(!evse)throw new Error('canonical connector EVSE missing');
      evse.output.connectors.push({id:row.id,sourceConnectorId:row.sourceConnectorId||null,
        officialConnectorId:row.officialConnectorId||null,kind:row.rawSourceFields?.kind||null,
        plugType:row.plugType||null,powerKw:row.powerKw??null});
    }
    for(const offer of data.offers){
      const evse=evses.get(offer.scope?.evseId);
      if(!evse)throw new Error('canonical offer EVSE missing');
      // The tariff engine must parse rawOffer explicitly before a price can be shown.
      evse.station.offers.push({id:offer.id,channel:offer.channel,scope:offer.scope,
        rawOffer:offer.rawOffer??null,calculationStatus:'not_evaluated'});
    }
    return [...stations.values()].map(({row,evses,offers})=>{
      const cpo=cpos.get(row.cpoId);
      if(!cpo)throw new Error('canonical station CPO missing');
      const [latitude,longitude]=coordinates(row);
      return{canonicalId:row.id,sourceStationId:row.sourceStationId,countryCode:row.country,
        name:row.name||row.names?.[0]?.value||row.sourceStationId,
        address:address(row),latitude,longitude,
        networkBrand:row.networkBrand||null,
        physicalOperator:{id:cpo.sourceOperatorId,name:cpo.name||cpo.sourceOperatorId},
        evses:evses.sort((a,b)=>a.id.localeCompare(b.id)),offers:[],unparsedOffers:offers,
        provenance:[{sourceId:data.source?.id,artifactSha256:data.source?.artifactSha256,
          generatedAt:data.source?.generatedAt||null}]};
    }).sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId));
  }
  return{toFragments};
});
