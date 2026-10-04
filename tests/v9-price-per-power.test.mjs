import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const shell=require('../v9-production-shell/bridge.js');
const pricing=require('../runtime-overrides/assets/v9/pricing-engine.js');

// The time-specific positive tariff must win over an all-day zero placeholder.
{
  const rules=[
    {id:'placeholder',scope:'allDay',pricePerKwh:0},
    {id:'night',scope:'timeWindow',start:'23:00',end:'07:00',chargePerMinute:0.027667},
    {id:'day',scope:'timeWindow',start:'07:00',end:'23:00',chargePerMinute:0.038333}
  ];
  const match=pricing.matchingRuleDetailed({rules},'2026-10-04T23:52:00.000Z','UTC',{});
  assert.equal(match.rule?.id,'night');
  const evaluated=pricing.evaluateRule(match.rule,{durationMinutes:10,chargingMinutes:10});
  assert.equal(evaluated.components.chargingTime,0.27667);
  assert.equal(match.rule.chargePerMinute,0.027667);
}

// One physical station with AC and DC connector groups produces independent,
// correctly priced and ranked rows. Connector restricted offers stay attached
// only to their matching power row.
{
  const station={
    id:'fastvolt-multiband',name:'Afriquia PLM Beni Melal',countryCode:'MA',
    physicalOperator:{id:'fastvolt',name:'FastVolt / Afrimobility'},
    evses:[
      {id:'evse-ac',connectors:[{id:'ac-1',kind:'AC',powerKw:50,plugName:'Type 2'}]},
      {id:'evse-dc-1',connectors:[{id:'dc-1',kind:'DC',powerKw:50,plugName:'CCS'}]},
      {id:'evse-dc-2',connectors:[{id:'dc-2',kind:'DC',powerKw:50,plugName:'CCS'}]}
    ],
    offers:[
      {id:'fastvolt-ac',provider:'FastVolt direct',kind:'cpo_direct',connectorKinds:['AC'],connectorIds:['ac-1'],minPowerKw:50,maxPowerKw:50,currency:'MAD',pricing:{rules:[{scope:'allDay',chargePerMinute:0.50}]}},
      {id:'fastvolt-dc',provider:'FastVolt direct',kind:'cpo_direct',connectorKinds:['DC'],connectorIds:['dc-1','dc-2'],minPowerKw:50,maxPowerKw:50,currency:'MAD',pricing:{rules:[{scope:'allDay',chargePerMinute:2.50}]}}
    ]
  };
  const matches=(offer,kind,power,plug,id)=>{
    if(offer.connectorKinds?.length&&!offer.connectorKinds.includes(kind))return false;
    if(offer.connectorIds?.length&&!offer.connectorIds.includes(id))return false;
    if(offer.minPowerKw!=null&&power<offer.minPowerKw)return false;
    if(offer.maxPowerKw!=null&&power>offer.maxPowerKw)return false;
    return true;
  };
  const w={
    TCCV9SessionPlannerEngine:{planStation(st,session){const c=st.evses[0].connectors[0];return{effectiveSession:{...session,energyKwh:40,chargingMinutes:c.kind==='AC'?120:45,durationMinutes:c.kind==='AC'?120:45,targetReached:true}};}},
    TCCV9SessionEngine:{
      offerMatchesChargingKind:matches,
      evaluateStation(st,session){
        const c=st.evses[0].connectors[0],offer=st.offers.find(o=>matches(o,c.kind,c.powerKw,c.plugName,c.id));
        if(!offer)return{stationId:st.id,recoveredKm:300,best:null,alternatives:[]};
        const total=c.kind==='AC'?4:6;
        return{stationId:st.id,recoveredKm:300,targetCurrency:'EUR',best:{total,costPerRecoveredKm:total/300,targetCurrency:'EUR',provider:offer.provider,kind:'cpo_direct',offerId:offer.id},alternatives:[]};
      }
    },
    TCCV9StationScoreEngine:{scoreStation(st,evaluation,session){return{stationId:st.id,distanceKm:23.1,driveMinutes:27,chargingMinutes:session.chargingMinutes,finalCost:evaluation.best?.total??null,costPerRecoveredKm:evaluation.best?.costPerRecoveredKm??null};}}
  };
  const rows=shell.variantsByPower(w,[{station,evaluation:{},distanceKm:23.1,route:{distanceKm:23.1,driveMinutes:27}}],{startAt:'2026-10-04T10:00:00.000Z',startSoc:20,targetSoc:80,targetCurrency:'EUR',batteryCapacityKwh:75,consumptionKwhPer100Km:15,chargeEfficiency:.92,fxRates:{}});
  assert.equal(rows.length,2);
  const ac=rows.find(row=>row.powerLine.kind==='AC'),dc=rows.find(row=>row.powerLine.kind==='DC');
  assert.ok(ac&&dc);
  assert.equal(ac.powerLine.powerKw,50);
  assert.equal(ac.powerLine.count,1);
  assert.equal(ac.evaluation.best.total,4);
  assert.equal(ac.costPerKm,4/300);
  assert.equal(dc.powerLine.powerKw,50);
  assert.equal(dc.powerLine.count,2);
  assert.equal(dc.evaluation.best.total,6);
  assert.equal(dc.costPerKm,6/300);
  assert.match(shell.renderPowerLines(ac),/AC · <b>50 kW<\/b>/);
  assert.match(shell.renderPowerLines(ac),/0,50 MAD\/min charge/);
  assert.match(shell.renderPowerLines(dc),/2,50 MAD\/min charge/);
  assert.doesNotMatch(shell.renderPowerLines(ac),/2,50 MAD\/min/);
}

// A placeholder is omitted from base-rate labels when priced time windows exist.
{
  const labels=shell.tariffRateLabels({currency:'EUR',pricing:{rules:[
    {scope:'allDay',pricePerKwh:0},
    {scope:'timeWindow',start:'23:00',end:'07:00',chargePerMinute:0.027667},
    {scope:'timeWindow',start:'07:00',end:'23:00',chargePerMinute:0.038333}
  ]}});
  assert.ok(labels.some(label=>label.includes('0,028 EUR/min charge (23:00–07:00)')));
  assert.ok(labels.some(label=>label.includes('0,038 EUR/min charge (07:00–23:00)')));
  assert.equal(labels.some(label=>label.includes('0,00 EUR/kWh')),false);
}

// Mobile tariff cards keep every price distinct and show the native amount
// beside its EUR equivalent only when the source tariff is in another currency.
{
  const html=shell.renderTariffs({
    best:{total:1.47,targetCurrency:'EUR',currency:'MAD',result:{totalEur:16.36},provider:'Electra',kind:'emsp'},
    alternatives:[{total:0.72,targetCurrency:'EUR',currency:'EUR',result:{totalEur:0.72},provider:'Tesla',kind:'cpo_direct'}]
  });
  assert.equal((html.match(/class="v9-tariff-row"/g)||[]).length,2);
  assert.match(html,/16,36 MAD/);
  assert.match(html,/≈ 1,47 €/);
  assert.match(html,/0,72 €/);
  assert.doesNotMatch(html,/≈ 0,72 €/);
  assert.match(html,/Electra · meilleur/);
  assert.match(html,/Tesla/);
}
assert.equal(shell.formatCurrencyAmount(1234.5,'MAD'),'1 234,50 MAD');
assert.equal(shell.formatCurrencyAmount(12.3,'EUR'),'12,30 €');

console.log('V9 power-line prices and ranking: PASS');
