(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root){root.TCCV9Adapters=root.TCCV9Adapters||{};root.TCCV9Adapters.netherlandsDotnl=api;}})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
const text=v=>String(v==null?'':v).trim();const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
function normalizeRow(row,{sourceId='netherlands-dotnl'}={}){
 if(!Array.isArray(row)||row.length<9)return null;const[id,name,address,lat,lon,operator]=row,points=Array.isArray(row[8])?row[8]:[],evses=[],offers=[];
 for(const p of points){if(!Array.isArray(p))continue;const pid=text(p[0]);if(!pid)continue;const kind=text(p[2]).toUpperCase()==='DC'?'DC':'AC',power=num(p[3]),count=Math.max(1,Number(p[4])||1),evseId=pid;
  evses.push({id:evseId,aliases:[evseId],connectors:[{id:evseId+':connector',kind,powerKw:power}]});
  const rules=Array.isArray(p[5])?p[5]:[];const parsed=rules.map(r=>({scope:r[0]==='timeWindow'?'timeWindow':'allDay',start:text(r[1]||'00:00'),end:text(r[2]||'24:00'),billing:'kwh',currency:text(r[4]||'EUR').toUpperCase(),pricePerKwh:num(r[5]),chargePerMinute:num(r[6])||0,connectionFee:num(r[7])||0,idlePerMinute:num(r[8])||0,afterMinutesRate:num(r[9])||0,afterMinutesThreshold:num(r[10])||0,days:Array.isArray(r[11])?r[11]:null,ocpiDurationBands:Array.isArray(r[12])?r[12]:[]}));
  const valid=parsed.filter(r=>r.pricePerKwh!=null||r.chargePerMinute||r.connectionFee||r.idlePerMinute);if(valid.length)offers.push({id:sourceId+':'+id+':'+pid,provider:text(operator)||'DOT-NL',kind:'direct',subscriptionId:null,countries:['NL'],currency:valid[0].currency||'EUR',evseIds:[evseId],connectorKinds:[kind],pricing:{type:'rules',rules:valid},priority:125,metadata:{source:'DOT-NL compiled runtime',configurationId:pid}});
 }
 return{canonicalId:'NL:national:'+text(id),aliases:[text(id)],sourceStationId:text(id),countryCode:'NL',name:text(name)||text(operator)||'Station '+text(id),address:text(address),latitude:num(lat),longitude:num(lon),physicalOperator:{name:text(operator)||'Unknown'},networkBrand:text(operator),evses,access:{kind:'unknown',limited:false},status:{state:text(row[10]).toUpperCase()==='IN_SERVICE'?'available':'unknown',sourceId,updatedAt:text(row[9])},offers,updatedAt:text(row[9])};
}
return{normalizeRow};});
