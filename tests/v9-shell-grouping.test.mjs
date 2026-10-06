import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupRows, rankRows, rowsFromArea } = require('../v9-production-shell/bridge.js');

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
lully.evaluation = { chargingConnectorId: 'high-connector', best: { total: 5 } };
const mixedPowers = groupRows([lully]);
assert.equal(mixedPowers.length, 2);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 7).pointCount, 3);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 22).pointCount, 1);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 7).total, null, 'price for 22 kW must not appear on 7 kW row');

const electra = row('bois-d-arcy', 600, 'ELECTRA', "Bois-d'Arcy - E.Leclerc");
electra.station.evses = [
  { id: 'ac', connectors: [{ id: 'ac', kind: 'AC', powerKw: 22 }] },
  { id: 'dc100', connectors: [{ id: 'dc100', kind: 'DC', powerKw: 100 }] },
  { id: 'dc400', connectors: [{ id: 'dc400', kind: 'DC', powerKw: 400 }] },
  { id: 'dc600', connectors: [{ id: 'dc600', kind: 'DC', powerKw: 600 }] },
];
electra.station.offers = [{ id: 'electra-direct', connectorKinds: ['DC'], metadata: { energyOnly: true } }];
electra.evaluation = { chargingConnectorId: 'dc600', best: { offerId: 'electra-direct', total: 4.9, provider: 'Electra direct' } };
const electraRows = groupRows([electra]);
assert.equal(electraRows.length, 4);
assert.ok(electraRows.filter(x => x.displayPowerKw >= 100).every(x => x.total === 4.9), 'energy-only price should cover every eligible DC power');
assert.equal(electraRows.find(x => x.displayPowerKw === 22).total, null, 'historical AC connector must remain unpriced');

const teslaTracker = row('tesla-le-chesnay-france', 250, 'Tesla', 'Tesla Le Chesnay, France');
teslaTracker.station.address = '2 Avenue Charles de Gaulle, Le Chesnay 78150, France';
teslaTracker.station.latitude = 48.828051;
teslaTracker.station.longitude = 2.11910;
teslaTracker.station.evses = Array.from({length:12}, (_,index)=>({id:'tracker-'+index,pdcIds:['tracker-'+index],connectors:[{kind:'DC',powerKw:250}]}));
teslaTracker.evaluation = {best:{offerId:'tesla-price',provider:'Tesla',kind:'direct',total:8,comparable:true,result:{totalEur:8}}};
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

console.log('V9 shell grouping OK');
