import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url);
const root=path.resolve(process.argv[2]||'dist/v9-explicit-candidate');
const runtime=path.join(root,'runtime');
const registry=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/source-registry.json')));
const selected=new Set(['spain-reve','spain-reve-offers','belgium-nap-national','belgium-nap-direct','tesla-global']);
const subset={...registry,sources:registry.sources.filter(source=>selected.has(source.id))};
const browserLoaders=require(path.join(runtime,'assets/v9/browser-loaders.js'));
const extension=require(path.join(runtime,'assets/v9/production-loader-extension.js'));
const adapters={
  nationalCompact:require(path.join(runtime,'assets/v9/adapters/national-compact.js')),
  directOffers:require(path.join(runtime,'assets/v9/adapters/direct-offers.js')),
  teslaJson:require(path.join(runtime,'assets/v9/adapters/tesla-json.js'))
};
extension.install({baseLoaders:browserLoaders,adapters});
const fetchImpl=async url=>{
  try{return new Response(fs.readFileSync(new URL(url)),{status:200});}
  catch{return new Response('missing',{status:404});}
};
const loaders=browserLoaders.createRegistryLoaders({registry:subset,basePath:pathToFileURL(runtime+path.sep).href,adapters,fetchImpl});
const engine=require(path.join(runtime,'assets/v9/runtime-engine.js')).createEngine({registry:subset,loaders});
const session={startAt:'2026-10-07T10:00:00Z',startSoc:20,targetSoc:80,batteryCapacityKwh:75,consumptionKwhPer100Km:15,vehicleMaxAcKw:11,vehicleMaxDcKw:250,chargeEfficiency:.92,targetCurrency:'EUR'};

const eibar=await engine.queryArea({countryCode:'ES',origin:{lat:43.184,lon:-2.475},radiusKm:10,session,stationLimit:200});
for(const [needle,provider,rate] of [['SS-Eibar-004','IBERDROLA',.47],['Eroski Eibar','REPSOL',.36]]){
  const station=eibar.stations.find(s=>s.name.includes(needle));
  assert.ok(station,`${needle} missing from REVE inventory`);
  assert.ok(station.offers.length>=station.evses.length,`${needle} lost exact-EVSE direct offers during merge`);
  assert.ok(station.offers.some(o=>o.kind==='direct'&&o.pricing?.componentGroups?.some(group=>group.kind==='ENERGY'&&group.rules?.some(rule=>rule.pricePerKwh===rate))),`${needle} REVE direct rate is incorrect`);
  const evaluation=eibar.sessionEvaluations[station.id];
  const candidates=[evaluation.best,...evaluation.alternatives].filter(Boolean);
  assert.ok(candidates.some(x=>x.kind==='direct'&&x.provider.includes(provider)),`${needle} direct price unavailable`);
}

const belgium=await engine.queryArea({countryCode:'BE',origin:{lat:51.301728,lon:4.692079},radiusKm:3,session,stationLimit:200});
assert.ok(belgium.stations.length>0,'Belgian NAP inventory is absent');
assert.ok(belgium.stations.some(st=>st.offers.some(o=>o.kind==='direct')),'Belgian exact-EVSE direct tariffs are absent');

const mac=JSON.parse(fs.readFileSync(path.join(runtime,'data/v9/tesla-morocco-mac-export.json')));
assert.equal(mac.stations.length,6,'Morocco Tesla tariff must come from six pinned Mac-export records');
for(const row of mac.stations){
  const normalized=adapters.teslaJson.normalizeStation(row);
  assert.ok(normalized.offers.length>0,`${row.id} power-band offer missing`);
  assert.ok(normalized.offers.every(o=>o.currency==='MAD'&&o.pricing.rules.some(r=>r.billing==='powerMinute')),`${row.id} lost MAD power-minute pricing`);
}
const agadir=mac.stations.find(row=>row.id==='tesla-agadir-morocco');
const morocco=await engine.queryArea({countryCode:'MA',origin:{lat:agadir.latitude,lon:agadir.longitude},radiusKm:1,session:{...session,targetCurrency:'MAD'},stationLimit:50});
const agadirStation=morocco.stations.find(st=>st.id===agadir.id);
assert.ok(agadirStation,'Agadir Tesla is absent from the Mac export runtime');
const agadirPrice=morocco.sessionEvaluations[agadirStation.id]?.best;
assert.ok(agadirPrice&&agadirPrice.total>0&&agadirPrice.currency==='MAD'&&agadirPrice.targetCurrency==='MAD',
  'Agadir power-band session must produce a comparable MAD price');
const moroccoPrices=new Map();
for(const source of mac.stations){
  const area=await engine.queryArea({countryCode:'MA',origin:{lat:source.latitude,lon:source.longitude},radiusKm:1,session:{...session,targetCurrency:'MAD'},stationLimit:50});
  const station=area.stations.find(item=>item.id===source.id);
  assert.ok(station,`${source.id} absent from the Morocco runtime`);
  const price=area.sessionEvaluations[station.id]?.best;
  assert.ok(price&&price.total>0&&price.currency==='MAD',`${source.id} must have a calculated MAD tariff`);
  moroccoPrices.set(source.id,price.total);
}
assert.equal(Math.round((moroccoPrices.get('tesla-casablanca-morocco')-moroccoPrices.get('tesla-rabat-morocco'))*100)/100,6,
  'Casablanca must include the 6 MAD connection fee from the Mac export');
const swiss=adapters.teslaJson.normalizeStation({id:'ch-currency',countryCode:'CH',pricing:{type:'kwh',currency:'CHF',pricePerKwh:.5}});
assert.equal(swiss.offers[0].currency,'CHF','Swiss Tesla tariff must retain CHF');

console.log(JSON.stringify({ok:true,eibarDirect:true,belgianStations:belgium.stations.length,moroccoTesla:mac.stations.length}));
