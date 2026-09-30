import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const adapter=require('../runtime-overrides/assets/v9/adapters/france-emsp-compact.js');

const row=['FRTEST1','Test','1 rue Test',48.8,2.1,'Operator',2,0,[
  ['e1','Electra · DC 300 kW','DC',300,2,[
    ['allDay','00:00','24:00','kwh','EUR',0.49,0,0,0,0,0,null,[]],
    ['timeWindow','12:00','17:00','kwh','EUR',0.61,0,0,0,0,0,null,[]]
  ],['FR*ABC*E1','FR*ABC*E2']],
  ['v1','Electroverse · DC 300 kW','DC',300,2,[
    ['allDay','00:00','24:00','kwh','EUR',0.64,0,0,0,0,0,null,[]]
  ],['FR*ABC*E1','FR*ABC*E2']]
], '2026-08-18'];

const onlyElectra=adapter.offerRulesFromRows([row],{providers:['electra'],priority:{tariff:82}});
assert.equal(onlyElectra.length,1);
assert.equal(onlyElectra[0].provider,'Electra');
assert.equal(onlyElectra[0].priority,82);
assert.deepEqual(onlyElectra[0].evseIds,['FR*ABC*E1','FR*ABC*E2']);
assert.equal(onlyElectra[0].pricing.rules.length,2);
assert.equal(onlyElectra[0].pricing.rules[1].pricePerKwh,0.61);

const both=adapter.offerRulesFromRows([row],{priority:{tariff:80}});
assert.equal(both.length,2);
assert.deepEqual(new Set(both.map(x=>x.provider)),new Set(['Electra','Electroverse']));

console.log(JSON.stringify({ok:true,electraOnly:onlyElectra.length,bothProviders:both.length,dynamicWindow:onlyElectra[0].pricing.rules[1].pricePerKwh}));
