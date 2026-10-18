import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {midhopeSourceOracle} from '../scripts/v9_tariff_phase7_source_oracle_133.mjs';
const require=createRequire(import.meta.url);
const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('TCC_V9_DIST required');
const mod=name=>require(path.join(dist,'runtime/assets/v9',name));
const adapter=mod('tariff-shadow-adapter.js');
const runtime=mod('runtime-engine.js');
const uk=mod('adapters/uk-open-feeds.js');
const qualification=JSON.parse(fs.readFileSync(new URL('../reports/v9-tariff-133/phase7-qualification-pin-2026-10-15.json',import.meta.url)));
const config=JSON.parse(fs.readFileSync(new URL('../config/v9-tariff-phase7-midhope-133-scenarios.json',import.meta.url)));
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-phase7-midhope-source-133.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.json')));
const bytes=fs.readFileSync(path.join(dist,golden.sourcePath));
const source=JSON.parse(zlib.gunzipSync(bytes));
const raw=source.sources[0].locations[0];
const station={...uk.normalizeLocation(raw,source.sources[0],new Map(),{sourceId:'uk-connected-kerb-midhope-guest-verified'})};
station.id=station.canonicalId;
const flag={enabled:true,mode:'shadow',pin:adapter.PIN,country:'GB',cpo:'Connected Kerb',channel:'Connected Kerb',
  stationId:adapter.STATION,exactTuples:adapter.tuples.map(({evseId,connectorId,offerId})=>({evseId,connectorId,offerId}))};
const variant=(evse,connector,offer)=>({...station,evses:[{...evse,connectors:[connector]}],offers:[offer]});
const sessionFor=spec=>{const session={...config.session,...spec.session};return {...session,durationMinutes:session.chargingMinutes};};
test('compact browser manifest is the four exact RawOffer/OfferScope tuples, pinned bytes intact',()=>{
  const shellConfig=JSON.parse(fs.readFileSync(new URL('../v9-production-shell/shell-config.json',import.meta.url)));
  assert.equal(shellConfig.tariffShadowFlag,undefined);
  if(fs.existsSync(path.join(dist,'v9-production-shell/shell-config.json')))
    assert.equal(JSON.parse(fs.readFileSync(path.join(dist,'v9-production-shell/shell-config.json'))).tariffShadowFlag,undefined);
  assert.equal(manifest.snapshotId,adapter.PIN);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),adapter.SOURCE_SHA);
  assert.equal(manifest.files.find(x=>x.path===golden.sourcePath)?.sha256,adapter.SOURCE_SHA);
  const assertions=qualification.selected[0].exactAssertions;
  assert.equal(assertions.length,4);
  assert.deepEqual(new Set(adapter.tuples.map(t=>t.rawKey)),new Set(assertions.map(a=>a.rawKey)));
  for(const t of adapter.tuples){
    const row=assertions.find(a=>a.rawKey===t.rawKey);
    assert.equal(row.offerId,t.offerId);
    assert.equal(JSON.parse(row.scopeSourceId).connectorId,t.connectorId);
    assert.equal(JSON.parse(row.scopeSourceId).evseId,t.evseId);
  }
  assert.equal(station.id,adapter.STATION);
  assert.equal(station.offers.length,4);
  assert.equal(station.evses.length,4);
  assert.ok(adapter.validFlag(flag));
  const disabled=adapter.create();
  const legacyResult=Object.freeze({status:'priced',total:1});
  assert.equal(disabled.observeStation({get evses(){throw Error('disabled candidate touched inputs');}},
    {},legacyResult),legacyResult);
  assert.equal(disabled.metrics().evaluations,0);
  for(const changed of [{...flag,pin:'new-pin'},{...flag,channel:'Electroverse'},
    {...flag,cpo:'Electra'},{...flag,exactTuples:flag.exactTuples.slice(0,3)}])assert.equal(adapter.validFlag(changed),false);
});
test('default-off and exact shadow preserve all 64 legacy results, oracle amounts and rollback',()=>{
  const off=runtime.createEngine({registry:{sources:[]}});
  const on=runtime.createEngine({registry:{sources:[]},tariffShadowFlag:flag});
  assert.equal(off.tariffShadowMetrics().evaluations,0);
  let evaluations=0;
  for(const spec of config.scenarios){
    const branch=spec.key.slice('GB-Midhope-P7-'.length),expected=golden.branchExpected[branch];
    for(const evse of station.evses){
      const connector=evse.connectors[0],offer=station.offers.find(o=>o.connectorIds?.[0]===connector.id);
      assert.ok(offer);
      const st=variant(evse,connector,offer),session=sessionFor(spec);
      const before=off.evaluateStation(st,session,{targetCurrency:'GBP'});
      const after=on.evaluateStation(st,session,{targetCurrency:'GBP'});
      assert.deepEqual(after,before);
      assert.equal(adapter.evaluateTuple(st,evse,connector,[offer],session).status,expected.status);
      const oracle=midhopeSourceOracle(raw.evses.find(e=>e.evse_id===evse.id).connectors[0].validatedV9Offer,
        connector.id,{...config.session,...spec.session},golden.fxEvidence);
      assert.equal(oracle.status,expected.status);
      if(expected.status==='priced'){
        assert.equal(after.best?.result?.totalEur,oracle.total);
        assert.equal(after.best?.result?.components?.energy,oracle.components.energy);
        assert.equal(after.best?.result?.components?.parkingTime?.costGbp,oracle.components.parkingTime);
        assert.equal(after.best?.result?.components?.idleSupplement?.costGbp,oracle.components.idleSupplement);
      }
      evaluations++;
    }
  }
  assert.equal(evaluations,64);
  assert.equal(on.tariffShadowMetrics().evaluations,64);
  assert.equal(off.tariffShadowMetrics().evaluations,0);
  const events=on.tariffShadowDiagnostics();assert.ok(events.length<=32);
  assert.equal(JSON.stringify(events).includes(adapter.tuples[0].connectorId),false);
  const original=on.tariffShadowMetrics().evaluations;
  on.rollbackTariffShadow();
  const evse=station.evses[0],connector=evse.connectors[0],offer=station.offers.find(o=>o.connectorIds?.[0]===connector.id);
  on.evaluateStation(variant(evse,connector,offer),sessionFor(config.scenarios[0]),{targetCurrency:'GBP'});
  assert.equal(on.tariffShadowMetrics().evaluations,original);
  assert.equal(on.tariffShadowDiagnostics().length,0);
});
test('missing, ambiguous, uncomputable, ineligible and unrelated channels fail closed',()=>{
  const evse=station.evses[0],connector=evse.connectors[0],offer=station.offers.find(o=>o.connectorIds?.[0]===connector.id),session=sessionFor(config.scenarios[0]);
  assert.equal(adapter.evaluateTuple(station,evse,connector,[],session).status,'missing');
  assert.equal(adapter.evaluateTuple(station,evse,connector,[offer,offer],session).status,'ambiguous');
  assert.equal(adapter.evaluateTuple(station,evse,connector,[{...offer,pricing:{type:'unknown'}}],session).status,'uncomputable');
  assert.equal(adapter.evaluateTuple({...station,id:'visual-site-key'},evse,connector,[offer],session).status,'ineligible');
  assert.equal(adapter.evaluateTuple(station,evse,{...connector,id:'other'},[offer],session).status,'ineligible');
  assert.equal(adapter.evaluateTuple(station,evse,connector,[{...offer,provider:'Electra'}],session).status,'missing');
  assert.equal(adapter.evaluateTuple(station,evse,connector,[{...offer,provider:'Electroverse'}],session).status,'missing');
  const on=runtime.createEngine({registry:{sources:[]},tariffShadowFlag:flag});
  const st={...station,id:'visual-site-key',siteKey:'Bois-d-Arcy',evses:[evse],offers:[offer]};
  on.evaluateStation(st,session,{targetCurrency:'GBP'});
  assert.equal(on.tariffShadowMetrics().evaluations,0);
});
test('area ranking and physical site presentation never expand the exact tariff scope',()=>{
  const session=sessionFor(config.scenarios[0]);
  const rows=station.evses.map(evse=>{
    const connector=evse.connectors[0],offer=station.offers.find(o=>o.connectorIds?.[0]===connector.id);
    return variant(evse,connector,offer);
  });
  const off=runtime.createEngine({registry:{sources:[]}});
  const on=runtime.createEngine({registry:{sources:[]},tariffShadowFlag:flag});
  const before=off.evaluateArea(rows,session,{targetCurrency:'GBP'});
  const after=on.evaluateArea(rows,session,{targetCurrency:'GBP'});
  assert.deepEqual(after,before);
  assert.deepEqual(after.map(x=>x.station.id),before.map(x=>x.station.id));
  assert.equal(on.tariffShadowMetrics().evaluations,4);
  const visual={...rows[0],id:'visual:bois-d-arcy',siteKey:'same-location'};
  on.evaluateStation(visual,session,{targetCurrency:'GBP'});
  assert.equal(on.tariffShadowMetrics().evaluations,4);
});
