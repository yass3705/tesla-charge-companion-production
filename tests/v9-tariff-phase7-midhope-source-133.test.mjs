import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {midhopeSourceOracle} from '../scripts/v9_tariff_phase7_source_oracle_133.mjs';
const dist=process.env.TCC_V9_DIST;
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-phase7-midhope-source-133.json',import.meta.url)));
const config=JSON.parse(fs.readFileSync(new URL('../config/v9-tariff-phase7-midhope-133-scenarios.json',import.meta.url)));
const dualrun=JSON.parse(fs.readFileSync(new URL('../reports/v9-tariff-133/phase7-midhope-branches-pin-2026-10-15.json',import.meta.url)));
const manifest=dist?JSON.parse(fs.readFileSync(path.join(dist,'manifest.json'))):null;
const fx=dist?JSON.parse(fs.readFileSync(path.join(dist,'data/exchange_rates.json'))):golden.fxEvidence;
test('all four Midhope connectors: year-round local hours, DST, and pinned price freshness',()=>{
  if(manifest)assert.equal(golden.snapshotId,manifest.snapshotId);
  const bytes=fs.readFileSync(dist?path.join(dist,golden.sourcePath):
    new URL('./fixtures/v9-tariff-phase7-midhope-source-133.json.gz',import.meta.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),golden.sourceSha256);
  if(manifest)assert.equal(manifest.files.find(x=>x.path===golden.sourcePath)?.sha256,golden.sourceSha256);
  const source=JSON.parse(zlib.gunzipSync(bytes));
  const connectors=source.sources[0].locations[0].evses.flatMap(e=>e.connectors);
  assert.equal(connectors.length,golden.expectedConnectors);
  assert.equal(new Set(connectors.map(c=>c.id)).size,4);
  assert.equal(config.scenarios.length,golden.scenarios);
  assert.equal(dualrun.rows.length,golden.evaluations);
  const scheduleCases={
    'summer-saturday':['2026-10-17T07:30:00Z',1.60008],
    'sunday-free':['2026-10-18T12:00:00Z',0],
    'dst-fall-sunday':['2026-10-25T00:30:00Z',0],
    'dst-winter-monday':['2026-10-26T08:30:00Z',1.60008],
    'winter-before-open-exact':['2026-10-26T08:29:00Z',0],
    'winter-open-exact':['2026-10-26T08:30:00Z',0.80004],
    'winter-before-close-exact':['2026-10-26T17:59:00Z',0.80004],
    'winter-close-exact':['2026-10-26T18:00:00Z',0],
    'dst-spring-sunday':['2027-03-28T00:30:00Z',0],
    'dst-spring-summer-monday':['2027-03-29T07:30:00Z',1.60008],
  };
  for(const [branch,[start,parking]] of Object.entries(scheduleCases)){
    assert.equal(config.scenarios.find(s=>s.key===`GB-Midhope-P7-${branch}`)?.session.startAt,start);
    assert.equal(golden.branchExpected[branch].components.parkingTime,parking);
  }
  for(const c of connectors){
    const offer=c.validatedV9Offer;
    assert.equal(offer.connectorIds?.length,1);
    assert.equal(offer.connectorIds[0],c.id);
    assert.equal(offer.pricing.verifiedSourceVersion,'2026-10-10-midhope-exact-4');
    assert.equal(offer.metadata.guestPreAuthorisationGbpNotCost,25);
    assert.equal(offer.metadata.winterEvidence,'not_confirmed_not_activated');
    assert.equal(offer.metadata.winterEvidence,golden.historicalWinterAnnotation);
    assert.equal(offer.validFrom,golden.priceFreshness.validFrom);
    assert.equal(offer.metadata.tariffObservedAt,golden.priceFreshness.observedAt);
    assert.equal(offer.validTo,undefined);
    assert.equal(offer.metadata.pricingTimeZone,'Europe/London');
    assert.match(offer.metadata.refreshPolicy,/DST alone does not expire the price/);
    assert.deepEqual([offer.pricing.energyPerKwhGbp,offer.pricing.parkingPerStarted30minGbp,
      offer.pricing.idleSupplementPerMinuteGbp],[0.39996,0.80004,0.01]);
    assert.equal(midhopeSourceOracle(offer,'not-this-connector',config.scenarios[0].session,fx).status,'uncomputable');
    for(const spec of config.scenarios){
      const branch=spec.key.slice('GB-Midhope-P7-'.length);
      const session={...config.session,...spec.session};
      const oracle=midhopeSourceOracle(offer,c.id,session,fx);
      const expected=golden.branchExpected[branch];
      assert.ok(expected,branch);
      assert.equal(oracle.status,expected.status,`${branch} ${c.id}`);
      if(expected.status==='priced'){
        assert.equal(oracle.total,expected.total,`${branch} total`);
        assert.deepEqual(oracle.components,expected.components,`${branch} components`);
      }else assert.equal(oracle.reason,expected.reason,branch);
      const row=dualrun.rows.find(r=>r.key===spec.key&&r.connectorId===c.id);
      assert.ok(row,`${branch} ${c.id}`);
      assert.equal(row.catalogueProof.state,'exact_catalogue_link');
      assert.equal(row.catalogueProof.sourcePath,golden.sourcePath);
      assert.equal(row.catalogueProof.sourceSha256,golden.sourceSha256);
      assert.equal(row.catalogueProof.exactAssertions.length,1);
      assert.equal(row.catalogueProof.exactAssertions[0].scopeKind,'Connector');
      assert.equal(row.new.status,expected.status,`${branch} engine status`);
      if(expected.status==='priced'){
        assert.equal(row.new.total,oracle.total,`${branch} engine total`);
        assert.equal(row.new.currency,oracle.currency,`${branch} currency`);
        assert.equal(row.new.targetTotal,oracle.targetTotal,`${branch} FX`);
        assert.equal(row.new.fxStatus,oracle.fxStatus,`${branch} FX status`);
        assert.deepEqual({energy:row.new.componentValues.energy,
          parkingTime:row.new.componentValues.parkingTime.costGbp,
          idleSupplement:row.new.componentValues.idleSupplement.costGbp},oracle.components,`${branch} engine components`);
      }
      assert.deepEqual(row.legacy.differences,[],`${branch} dual-run differences`);
    }
  }
  assert.equal(golden.yearRoundLocalScheduleProven,true);
  assert.equal(golden.priceFreshness.scope,'immutable_pin_only');
});
