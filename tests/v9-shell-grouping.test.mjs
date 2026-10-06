import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupRows, rowsFromArea } = require('../v9-production-shell/bridge.js');

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

const dole = Array.from({ length: 10 }, (_, i) => row(i, 22));
const grouped = groupRows(dole);
assert.equal(grouped.length, 1, 'Intermarché Dole should have one 22 kW result row');
assert.equal(grouped[0].pointCount, 10, 'two connector types must not double-count a charge point');

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
assert.equal(mixedPowers.find(x => x.displayPowerKw === 7.4).pointCount, 3);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 22.1).pointCount, 1);
assert.equal(mixedPowers.find(x => x.displayPowerKw === 7.4).total, null, 'price for 22.1 kW must not appear on 7.4 kW row');

const unpriced = rowsFromArea({ stations: [row('unpriced', 22).station] });
assert.equal(unpriced[0].total, null, 'missing price must not become zero');

console.log('V9 shell grouping OK');
