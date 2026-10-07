import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const runtime=path.resolve(process.argv[2]||'dist/v9-explicit-candidate/runtime');
const payload=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/aldi-guyancourt-direct.json'),'utf8'));
const offers=require(path.join(runtime,'assets/v9/adapters/direct-offers.js')).normalizePayload(payload).offerRules;
const session=require(path.join(runtime,'assets/v9/session-engine.js'));
assert.equal(offers.length,1);
assert.deepEqual(offers[0].stationIds,['FRALNP25007130']);
assert.deepEqual(offers[0].connectorKinds,['AC']);
const station={id:'FR:national:FRALNP25007130',countryCode:'FR',physicalOperator:{name:'ALDI SARL'},evses:[{id:'aldi-ac',connectors:[{id:'type2',kind:'AC',powerKw:22}]}],offers:[{...offers[0],kind:'direct'}]};
const result=session.evaluateStation(station,{startAt:'2026-10-06T12:00:00Z',energyKwh:10,durationMinutes:60});
assert.equal(result.best?.total,1.9,'official ALDI slow AC price must apply at Guyancourt');
console.log('ALDI Guyancourt exact slow AC direct tariff OK');
