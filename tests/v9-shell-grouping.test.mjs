import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupRows } = require('../v9-production-shell/bridge.js');

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

const mixed = groupRows([...dole, row('fast', 50), row('other-cpo', 22, 'Other CPO'), row('other-site', 22, 'IZIVIA', 'OTHER SITE')]);
assert.equal(mixed.length, 4, 'power, operator, and station identity must stay separate');
assert.equal(mixed.find(x => x.station.id === 'fast').pointCount, 1);

console.log('V9 shell grouping OK');
