import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const ui=require('../v9-production-shell/bridge.js');

const offer=(id,kind,provider,total,extra={})=>({
  offerId:id,kind,provider,total,currency:'EUR',targetCurrency:'EUR',comparable:total!=null,
  result:{complete:total!=null,totalEur:total,...(total==null?{reason:'unknown_component'}:{})},...extra
});
function variant(stationId,pdcId,powerKw,kind='DC',items=[],extra={}){
  const evse={id:'EVSE-'+pdcId,pdcIds:[pdcId],connectors:[{id:'CON-'+pdcId,kind,powerKw}],status:{state:'available'}};
  const station={id:stationId,countryCode:'FR',name:'Station '+stationId,address:'1 rue du test',
    physicalOperator:{name:'CPO'},latitude:48.1,longitude:2.1,evses:[evse],
    offers:items.map(item=>({id:item.offerId,pricing:{type:'simple',pricePerKwh:(item.total||0)/10},sourceId:'test-source'}))};
  const priced=items.find(item=>item.total!=null);
  return{station,powerLine:{kind,powerKw,count:1},displayPowerKw:powerKw,
    evaluation:{best:priced||null,alternatives:items.filter(item=>item!==priced&&item.total!=null),
      incomplete:items.filter(item=>item.total==null)},distanceKm:2,total:priced?.total??null,...extra};
}
const area={displayFxRates:{EUR:1},selectedSubscriptions:[]};
const direct=(id,total)=>offer(id,'direct','CPO',total);
const electra=(id,total)=>offer(id,'roaming','Electra',total);
const electroverse=(id,total)=>offer(id,'roaming','Electroverse',total);

// One station identity yields one card, regardless of the number of powers.
const single=ui.stationCards([variant('one','PDC-1',22,'AC',[direct('d1',4)])]);
assert.equal(single.length,1);
assert.equal(single[0].pointCount,1);
assert.deepEqual(single[0].powerGroups.map(group=>[group.kind,group.powerKw,group.pointCount]),[['AC',22,1]]);
const mixed=ui.stationCards([
  variant('multi','PDC-A',22,'AC',[direct('d2',5)]),
  variant('multi','PDC-B',50,'DC',[direct('d3',8)]),
  variant('multi','PDC-C',150,'DC',[direct('d4',10)])
]);
assert.equal(mixed.length,1);
assert.equal(mixed[0].pointCount,3);
assert.deepEqual(mixed[0].powerGroups.map(group=>group.powerKw),[22,50,150]);
const mixedHtml=ui.renderStationCard(mixed[0],0,area);
assert.equal((mixedHtml.match(/class="v9-power-group"/g)||[]).length,3);
assert.equal((mixedHtml.match(/class="v9-pdc-detail"/g)||[]).length,3);
for(const id of ['PDC-A','PDC-B','PDC-C'])assert.match(mixedHtml,new RegExp(id));
for(const price of ['5,00 €','8,00 €','10,00 €'])assert.match(mixedHtml,new RegExp(price));

// Equal power never makes distinct PDC offers interchangeable.
const samePower=ui.stationCards([
  variant('same','PDC-D',150,'DC',[direct('d5',5),electra('e5',7),electroverse('v5',9)]),
  variant('same','PDC-E',150,'DC',[direct('d6',6),electra('e6',8),electroverse('v6',10)])
])[0];
assert.equal(samePower.powerGroups.length,1);
assert.equal(samePower.powerGroups[0].pointCount,2);
assert.equal(samePower.bestChoice.pdc.id,'PDC-D');
assert.equal(samePower.total,5);
assert.equal(ui.powerLaneSummary(samePower.powerGroups[0],'direct',{EUR:1}),'Tarifs selon PDC · voir détails');
const sameHtml=ui.renderStationCard(samePower,0,area);
assert.equal((sameHtml.match(/class="v9-pdc-detail"/g)||[]).length,2);
for(const label of ['Direct','Electra','Electroverse'])assert.match(sameHtml,new RegExp('data-v9-lane-label="'+label+'"'));
for(const price of ['5,00 €','6,00 €','7,00 €','8,00 €','9,00 €','10,00 €'])assert.match(sameHtml,new RegExp(price));
assert.equal((sameHtml.match(/class="v9-tariff-row/g)||[]).length,6);
const dualConnector=ui.stationCards([
  variant('dual','PDC-DUAL',22,'AC',[direct('ef',4)]),
  variant('dual','PDC-DUAL',22,'AC',[direct('type2',5)])
])[0];
assert.equal(dualConnector.pointCount,1);
assert.equal(dualConnector.powerGroups[0].pointCount,1);
const dualHtml=ui.renderStationCard(dualConnector,0,area);
assert.equal((dualHtml.match(/class="v9-pdc-detail"/g)||[]).length,1);
assert.match(dualHtml,/4,00 €/);
assert.match(dualHtml,/5,00 €/);

const missing=ui.stationCards([variant('missing','PDC-M',22,'AC')])[0];
assert.equal(missing.total,null);
assert.match(ui.renderStationCard(missing,0,area),/Prix non disponible/);
const ambiguous=ui.stationCards([variant('ambiguous','PDC-X',22,'AC',[
  offer('d-unknown','direct','CPO',null,{result:{complete:false,reason:'ambiguous_tariff'}})
])])[0];
assert.equal(ambiguous.total,null);
assert.match(ui.renderStationCard(ambiguous,0,area),/Tarif incalculable/);

const cheaper=variant('cheap','PDC-cheap',150,'DC',[direct('cheap',3)]);
const dearer=variant('dear','PDC-dear',150,'DC',[direct('dear',9)]);
assert.deepEqual(ui.rankRows(ui.stationCards([dearer,cheaper]),'price').map(card=>card.station.id),['cheap','dear']);
assert.equal(ui.rankRows(ui.stationCards([dearer,cheaper,variant('free','PDC-F',150)]),'price').at(-1).station.id,'free',
  'missing is never ranked as zero');
const changedScenario=[variant('dear','PDC-dear',150,'DC',[direct('dear-next',2)]),
  variant('cheap','PDC-cheap',150,'DC',[direct('cheap-next',7)])];
assert.deepEqual(ui.rankRows(ui.stationCards(changedScenario),'price').map(card=>card.station.id),['dear','cheap']);

const tesla=variant('tesla-site','unused',250,'DC',[direct('tesla',12)]);
tesla.station.physicalOperator.name='Tesla';
tesla.station.evses=[{id:'TESLA-EVSE',stalls:8,connectors:[{kind:'DC',powerKw:250}]}];
const teslaCard=ui.stationCards([tesla])[0];
assert.equal(teslaCard.pointCount,8);
assert.equal(teslaCard.powerGroups[0].pointCount,8);
assert.match(ui.renderStationCard(teslaCard,0,area),/identifiant individuel non fourni/);

// Identical names and coordinates must never merge unrelated station identities.
const samePlace=[variant('physical-a','PDC-11',22),variant('physical-b','PDC-12',22)];
assert.equal(ui.stationCards(samePlace).length,2);
console.log('V9 station cards Lot 1 OK');
