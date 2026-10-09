const assert=require('node:assert/strict');
const {buildTariffLedger}=require('../runtime-overrides/assets/v9/tariff-evidence-ledger.js');
const proof={status:'verified',evidenceRef:'https://example.org/cpo/tarifs'};
const stations=[
  {countryCode:'FR',id:'SITE-A',physicalOperator:{id:'cpo'},evses:[
    {id:'FR*CPO*E1',connectors:[{id:'plug-22',powerKw:22},{id:'plug-50',powerKw:50}]},
    {id:'FR*CPO*E2',connectors:[{id:'plug-other-50',powerKw:50}]}]},
  {countryCode:'FR',id:'SITE-B',evses:[{id:'FR*CPO*E3',connectors:[{id:'plug-b',powerKw:150}]}]}
];
const base=(id,evseId,powerKw,pricePerKwh,extras={})=>({id,sourceId:'official-cpo',countryCode:'FR',stationId:'SITE-A',evseId,powerKw,pricePerKwh,channel:'ad_hoc',provider:'CPO',currency:'EUR',verification:proof,...extras});
const tariffs=[
  base('a','FR*CPO*E1',22,.40),
  base('b','FR*CPO*E1',22,.52),
  base('c','FR*CPO*E1',50,.56),
  base('d','FR*CPO*E2',50,.60),
  base('e','UNKNOWN',50,.33),
  {id:'f',sourceId:'second-base',countryCode:'FR',stationId:'SITE-A',pricePerKwh:.43,verification:proof},
  base('g','FR*CPO*E2',50,.65,{timeWindows:[{start:'22:00',end:'06:00'}]}),
  {id:'h',sourceId:'third-base',countryCode:'FR',stationId:'SITE-A',evseId:'FR*CPO*E1',pricePerKwh:.4},
];
const r=buildTariffLedger({stations,tariffs});
assert.equal(r.totals.observations,8);
assert.equal(r.totals.attached+r.totals.unresolved,8);
assert.equal(r.totals.physicalRows,4);
assert.equal(r.unresolved.length,3,'unknown EVSE, site-only, unverified multi-power scope retained');
const point=(id,power)=>r.points.find(p=>p.evseId===id&&p.powerKw===power);
assert.equal(point('FR*CPO*E1',22).tariffs.length,2);
assert.equal(point('FR*CPO*E1',22).conflicts.length,1,'both conflicting prices preserved');
assert.deepEqual(point('FR*CPO*E1',22).tariffs.map(t=>t.observation.pricePerKwh),[.40,.52]);
assert.equal(point('FR*CPO*E1',50).tariffs.length,1);
assert.equal(point('FR*CPO*E2',50).tariffs.length,2);
assert.equal(point('FR*CPO*E2',50).conflicts.length,0,'different time windows remain separate scenarios');
assert.equal(point('FR*CPO*E3',150).resolutionStatus,'tarif_indisponible');
assert.equal(point('FR*CPO*E2',50).resolutionStatus,'preuve_tarifaire_verifiee');
const multi=buildTariffLedger({stations,tariffs:[{id:'mv',sourceId:'official',countryCode:'FR',stationId:'SITE-A',evseId:'FR*CPO*E1',appliesToAllPowersVerified:true,pricePerKwh:.5,verification:proof}]});
assert.equal(multi.totals.attached,1);
assert.equal(multi.totals.attachedPointLinks,2);
assert.equal(multi.unresolved.length,0);
console.log('PASS: EVSE × power ledger; no silent drops; competing prices; distinct scenarios; unresolved preserved');
