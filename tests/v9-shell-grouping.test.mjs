import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupRows, rankRows, rowsFromArea, subscriptionOptionsForArea, stationDisplayName, stationBaseSource,
  variantsByPower, stationCards, renderStationCard, buildSession, executeV9 } = require('../v9-production-shell/bridge.js');

const chosenVehicle=buildSession({startSoc:20,targetSoc:80,batteryCapacityKwh:90,consumptionKwhPer100Km:18,vehicleMaxAcKw:22,vehicleMaxDcKw:180},'FR');
assert.equal(chosenVehicle.batteryCapacityKwh,90);
assert.equal(chosenVehicle.consumptionKwhPer100Km,18);
assert.equal(chosenVehicle.vehicleMaxAcKw,22);
assert.equal(chosenVehicle.vehicleMaxDcKw,180);
assert.equal(buildSession({batteryCapacityKwh:-1,vehicleMaxDcKw:999},'FR').batteryCapacityKwh,75);
assert.equal(buildSession({batteryCapacityKwh:-1,vehicleMaxDcKw:999},'FR').vehicleMaxDcKw,250);

const unknownPowerStation={id:'ozecar-fixture',countryCode:'FR',name:'OZECAR test',physicalOperator:{name:'OZECAR'},
  evses:[{id:'internal-a',officialEvseId:'FROZEE3430505',connectors:[{id:'plug-a',plugType:'Type 2',powerKw:null}]},
         {id:'internal-b',officialEvseId:'FROZEE3430506',connectors:[{id:'plug-b',plugType:'Type 2',powerKw:null}]}],
  offers:[],unparsedOffers:[{id:'raw-a',channel:'Direct',scope:{evseId:'internal-a',connectorId:null},calculationStatus:'not_evaluated'}]};
const unknownStub={TCCV9SessionPlannerEngine:{planStation(){}},TCCV9SessionEngine:{evaluateStation(){},offerMatchesChargingKind(){}},TCCV9StationScoreEngine:{scoreStation(){}}};
const unknownVariants=variantsByPower(unknownStub,[{station:unknownPowerStation,distanceKm:1}],{},[]);
assert.equal(unknownVariants.length,1,'unknown connector power must not remove a station');
assert.equal(unknownVariants[0].powerLine.powerKw,null);
assert.deepEqual(unknownVariants[0].station.unparsedOffers.map(offer=>offer.id),['raw-a']);
const unknownCards=stationCards(unknownVariants);
assert.equal(unknownCards.length,1);
assert.match(renderStationCard(unknownCards[0],0,{}),/FROZEE3430505/);
assert.match(renderStationCard(unknownCards[0],0,{}),/FROZEE3430506/);

assert.equal(stationBaseSource({countryCode:'FR',physicalOperator:{name:'IONITY'},provenance:[{sourceId:'FR:ionity_direct'}]}),'IONITY Direct · FR');
assert.equal(stationBaseSource({countryCode:'FR',physicalOperator:{name:'IONITY'},provenance:[{sourceId:'prepared:FR:ionity_direct'}]}),'IONITY Direct · FR');

assert.equal(stationDisplayName({name:'LFR3148EVCP01',address:"Rue de l'Aérostation Maritime, 78210, SAINT CYR L'ECOLE, 78545",physicalOperator:{name:'Lidl France'}}),"Lidl France · Rue de l'Aérostation Maritime");
assert.equal(stationDisplayName({name:'LFR3148EVCP01',physicalOperator:{name:'Lidl France'}}),'LFR3148EVCP01','without a verified address keep the technical name');
assert.equal(stationDisplayName({name:'Electra Vélizy',address:'1 Avenue',physicalOperator:{name:'Electra'}}),'Electra Vélizy');

const emptyFrancePlans=subscriptionOptionsForArea({stations:[]},'FR');
assert.equal(emptyFrancePlans.length,0,'no subscription can be claimed to be available without a station in radius');
const francePlans=subscriptionOptionsForArea({stations:[{physicalOperator:{id:'electra',name:'Electra'},offers:[]}]},'FR');
assert.deepEqual(francePlans.filter(row=>row.id.startsWith('electra-plus-')).map(row=>[row.id,row.monthlyFeeEur]),
  [['electra-plus-essential',1.99],['electra-plus-smart',4.99]]);
assert.equal(subscriptionOptionsForArea({stations:[]},'CH').some(row=>row.id.startsWith('electra-plus-')),false);

function row(id, powerKw, cpo = 'IZIVIA', name = 'INTERMARCHE - DOLE') {
  const point = `FROTHEOTHR686${id}`;
  return {
    station: {
      id, countryCode: 'FR', name, address: '9 RUE LEON BEL 39100 DOLE',
      latitude: 47.10925, longitude: 5.51026, physicalOperator: { name: cpo },
      evses: [
        { id: `ef-${id}`, pdcIds: [point], connectors: [{ powerKw }] },
        { id: `type2-${id}`, pdcIds: [point], connectors: [{ powerKw }] },
      ],
    },
    total: 5, distanceKm: 2,
  };
}

// IDs, location, operator and dual EF/Type 2 sockets from the pinned national tile.
const doleIds = ['FROTHPOTHR686101', ...Array.from({ length: 9 }, (_, i) => `FROTHPOTHR686${i + 1}1`)];
const dole = doleIds.map(id => {
  const entry = row(id, 22);
  for (const evse of entry.station.evses) evse.pdcIds = [id.replace('FROTHP', 'FROTHE')];
  return entry;
});
const grouped = groupRows(dole);
assert.equal(grouped.length, 1, 'Intermarché Dole should have one 22 kW result row');
assert.equal(grouped[0].pointCount, 10, 'two connector types must not double-count a charge point');
assert.equal(rankRows(grouped, 'balanced', 20).length, 1, 'the rendered result list must retain one Dole row');

const otherSite = row('other-site', 22, 'IZIVIA', 'OTHER SITE');
otherSite.station.address = 'OTHER ADDRESS';
const mixed = groupRows([...dole, row('fast', 50), row('other-cpo', 22, 'Other CPO'), otherSite]);
assert.equal(mixed.length, 4, 'power, operator, and station identity must stay separate');
assert.equal(mixed.find(x => x.station.id === 'fast').pointCount, 1);

const lully = row('lully', 22.1, 'Electric 55 Charging', 'PLACE LULLY');
lully.station.address = '12 PLACE JEAN BAPTISTE LULLY';
lully.station.evses = [
  { id: 'low', pdcIds: ['p1', 'p2', 'p3'], connectors: [{ id: 'low-connector', powerKw: 7.4 }] },
  { id: 'high', pdcIds: ['p4'], connectors: [{ id: 'high-connector', powerKw: 22.1 }] },
];
lully.evaluation = { chargingConnectorId: 'high-connector', best: { total: 5, result:{complete:true} } };
const mixedPowers = groupRows([lully]);
assert.equal(mixedPowers.length, 2);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 7.4).pointCount, 3);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 22.1).pointCount, 1);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 7.4).total, null, 'price for 22.1 kW must not appear on 7.4 kW row');

const electra = row('bois-d-arcy', 600, 'ELECTRA', "Bois-d'Arcy - E.Leclerc");
electra.station.evses = [
  { id: 'ac', connectors: [{ id: 'ac', kind: 'AC', powerKw: 22 }] },
  { id: 'dc100', connectors: [{ id: 'dc100', kind: 'DC', powerKw: 100 }] },
  { id: 'dc400', connectors: [{ id: 'dc400', kind: 'DC', powerKw: 400 }] },
  { id: 'dc600', connectors: [{ id: 'dc600', kind: 'DC', powerKw: 600 }] },
];
electra.station.offers = [{ id: 'electra-direct', connectorKinds: ['DC'], metadata: { energyOnly: true } }];
electra.evaluation = { chargingConnectorId: 'dc600', best: { offerId: 'electra-direct', total: 4.9, provider: 'Electra direct', result:{complete:true} } };
const electraRows = groupRows([electra]);
assert.equal(electraRows.length, 4);
assert.ok(electraRows.filter(x => x.displayPowerKw >= 100).every(x => x.total === 4.9), 'energy-only price should cover every eligible DC power');
assert.equal(electraRows.find(x => x.displayPowerKw === 22).total, null, 'historical AC connector must remain unpriced');

const teslaTracker = row('tesla-le-chesnay-france', 250, 'Tesla', 'Tesla Le Chesnay, France');
teslaTracker.station.address = '2 Avenue Charles de Gaulle, Le Chesnay 78150, France';
teslaTracker.station.latitude = 48.828051;
teslaTracker.station.longitude = 2.11910;
teslaTracker.station.evses = Array.from({length:12}, (_,index)=>({id:'tracker-'+index,pdcIds:['tracker-'+index],connectors:[{kind:'DC',powerKw:250}]}));
teslaTracker.evaluation = {best:{offerId:'tesla-price',provider:'Tesla',kind:'direct',total:8,comparable:true,result:{complete:true,totalEur:8}}};
const teslaIrve = row('FRTSLP11192', 250, 'Tesla', 'Le Chesnay, France');
teslaIrve.station.address = '2, Avenue Charles de Gaulle, 78158';
teslaIrve.station.latitude = 48.82805;
teslaIrve.station.longitude = 2.11910;
teslaIrve.station.evses = Array.from({length:12}, (_,index)=>({id:'irve-'+index,pdcIds:['irve-'+index],connectors:[{kind:'DC',powerKw:250}]}));
teslaIrve.evaluation = null;
teslaIrve.total = null;
const mergedTesla=groupRows([teslaTracker,teslaIrve]);
assert.equal(mergedTesla.length,1,'tracker and national IRVE aliases for Tesla Le Chesnay must form one site');
assert.equal(mergedTesla[0].pointCount,12,'mirrored Tesla sources must not double-count stalls');
assert.equal(mergedTesla[0].evaluation.best.total,8,'the priced Tesla source must win over an unpriced mirror');

const unpriced = rowsFromArea({ stations: [row('unpriced', 22).station] });
assert.equal(unpriced[0].total, null, 'missing price must not become zero');
const unroutedTesla=row('tangier',250,'Tesla','Tangier');unroutedTesla.station.countryCode='MA';unroutedTesla.station.latitude=35.76;unroutedTesla.station.longitude=-5.80;
const noRoute=rowsFromArea({stations:[unroutedTesla.station],sessionEvaluations:{tangier:{best:{total:76.63}}}}, {lat:35.75,lon:-5.79});
assert.equal(noRoute[0].distanceEstimated,true);
assert.equal(rankRows(noRoute,'balanced',20).length,1,'a priced Tesla station must remain visible when routing fails');
assert.equal(noRoute[0].total,null,'a numeric total without a complete result cannot enter ranking');
const incompleteNumeric={...teslaTracker.station,id:'incomplete-numeric'};
const unsafe=rowsFromArea({stations:[incompleteNumeric],sessionEvaluations:{'incomplete-numeric':{best:{total:1,costPerRecoveredKm:.01,comparable:true,result:{complete:false,totalEur:1,reason:'missing_component'}}}}});
assert.equal(unsafe[0].total,null);
assert.equal(unsafe[0].costPerKm,null);
assert.equal(groupRows(unsafe)[0].total,null);
assert.equal(rankRows([{...unsafe[0],total:1,distanceKm:1}, {...teslaTracker,total:8,distanceKm:2}], 'price')[0].station.id,'tesla-le-chesnay-france','a numeric incomplete row must not outrank a complete offer');

const growingArea=Array.from({length:501},(_,i)=>({id:`station-${i}`,countryCode:'FR',
  name:`Fixture ${i}`,latitude:48+i*.00001,longitude:2,physicalOperator:{id:'fixture',name:'Fixture'},
  evses:[{id:`evse-${i}`,connectors:[{id:`plug-${i}`,powerKw:null}]}],offers:[],unparsedOffers:[]}));
let capturedQuery;
const growingEngine={queryArea:async query=>{
  capturedQuery=query;
  return{stations:query.stationLimit?growingArea.slice(query.stationOffset||0,(query.stationOffset||0)+query.stationLimit):growingArea,
    query,sessionEvaluations:{},diagnostics:{sourceStationCount:growingArea.length,
      stationLimitApplied:growingArea.length>query.stationLimit}};
},__tccFxRates:{}};
const growingWindow={resolveOrigin:async()=>({lat:48,lon:2,label:'Fixture origin'}),
  sessionStorage:{getItem:()=> 'FR'},localStorage:{getItem:()=>null},
  TCCV9SessionPlannerEngine:{planStation(){}},
  TCCV9SessionEngine:{evaluateStation(){},offerMatchesChargingKind(){}},
  TCCV9StationScoreEngine:{scoreStation(){}}};
const growingResult=await executeV9(growingWindow,growingEngine,
  {mode:'candidate',engineScopeCountries:['FR']},
  {originText:'Fixture origin',radiusKm:20,startSoc:20,targetSoc:80});
assert.equal(capturedQuery.stationLimit,160,'one bounded result page stays separate from routing');
assert.equal(growingResult.area.diagnostics.sourceStationCount,growingArea.length,
  'the full result count must remain available to disclose omitted stations');
assert.equal(growingResult.rows.length,160,'first page retains unknown-power details');
assert.ok(growingResult.rows.every(row=>row.total==null),'unknown prices must not become zero');
const nextPage=await executeV9(growingWindow,growingEngine,{mode:'candidate',engineScopeCountries:['FR']},{originText:'Fixture origin',radiusKm:20,startSoc:20,targetSoc:80,stationOffset:160});
assert.equal(nextPage.rows.length,160);
assert.equal(nextPage.rows[0].station.id,'station-160','the next page must advance without repeating stations');
await assert.rejects(executeV9(growingWindow,growingEngine,{mode:'candidate',engineScopeCountries:['FR']},{originText:'Fixture origin',radiusKm:101,startSoc:20,targetSoc:80}),/100 km/);

console.log('V9 shell grouping OK');
