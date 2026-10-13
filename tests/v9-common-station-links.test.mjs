import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const tesla=require('../runtime-overrides/assets/v9/adapters/tesla-json.js');
const data=require('../runtime-overrides/assets/v9/data-engine.js');
const shell=require('../v9-production-shell/bridge.js');

const raw={id:'tesla-matosinhos-portugal',name:'Tesla Matosinhos, Portugal',countryCode:'PT',latitude:41.20845,longitude:-8.688498,
  kind:'DC',powerKw:250,stalls:20,lastUpdated:'2026-07-22',mapsUrl:'https://maps.google.com/maps?daddr=41.20845,-8.688498',
  teslaUrl:'https://www.tesla.com/fr_FR/findus/location/supercharger/14182',pricing:{type:'kwh',pricePerKwh:0.32}};
const fragment=tesla.normalizeStation(raw);
const [station]=data.resolveEntities([{fragment,source:{id:'tesla-global',priority:{identity:100}}}]);
assert.equal(station.teslaUrl,raw.teslaUrl);
assert.equal(station.mapsUrl,raw.mapsUrl);
const links=shell.renderStationLinks(station);
assert.match(links,/MAJ 2026-07-22/);
assert.match(links,/Itinéraire Google Maps/);
assert.match(links,/Fiche Tesla/);
assert.match(links,/rel="noopener noreferrer"/);
assert.doesNotMatch(shell.renderStationLinks({...station,teslaUrl:'javascript:alert(1)'}),/Fiche Tesla/);
assert.doesNotMatch(shell.renderStationLinks({...station,teslaUrl:'https://evil.example/tesla'}),/Fiche Tesla/);
assert.match(shell.renderStationLinks({...station,teslaUrl:null}),/Itinéraire Google Maps/,'all CPOs have the same navigation slot');
console.log(JSON.stringify({ok:true,station:station.id,links:['maps','officialTesla'],date:'2026-07-22'}));
