import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import path from 'node:path';

const require=createRequire(import.meta.url);
const pricing=require(process.argv[2]
  ?path.resolve(process.argv[2],'runtime/assets/v9/pricing-engine.js')
  :'../runtime-overrides/assets/v9/pricing-engine.js');
const fixture=new URL('./fixtures/v9-tariff-133/midhope-source.json.gz',import.meta.url);
const bytes=fs.readFileSync(fixture);
const source=JSON.parse(zlib.gunzipSync(bytes));
const scenarios=JSON.parse(fs.readFileSync(new URL('./fixtures/v9-tariff-133/midhope-scenarios.json',import.meta.url)));
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-133/midhope-source.json',import.meta.url)));
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),golden.sourceSha256,
  'the archived PR #143 source bytes must match the independent oracle');
const connectors=source.sources[0].locations[0].evses.flatMap(evse=>evse.connectors);
assert.equal(connectors.length,golden.expectedConnectors);
assert.equal(scenarios.scenarios.length,golden.scenarios);
let evaluations=0;
for(const connector of connectors){
  const offer=connector.validatedV9Offer;
  assert.deepEqual(offer.connectorIds,[connector.id]);
  for(const spec of scenarios.scenarios){
    const branch=spec.key.slice('GB-Midhope-P7-'.length);
    const expected=golden.branchExpected[branch];
    assert.ok(expected,branch);
    const actual=pricing.evaluateOffer(offer,{...scenarios.session,...spec.session});
    if(expected.status==='priced'){
      assert.equal(actual.complete,true,`${branch}: ${actual.reason||'incomplete'}`);
      assert.equal(actual.totalEur,expected.total,`${branch}: total`);
      assert.deepEqual({energy:actual.components.energy,
        parkingTime:actual.components.parkingTime.costGbp,
        idleSupplement:actual.components.idleSupplement.costGbp},expected.components,
      `${branch}: component oracle`);
    }else{
      assert.equal(actual.complete,false,`${branch}: must remain incalculable`);
      assert.equal(actual.reason,'midhope_before_observed_tariff');
    }
    evaluations++;
  }
}
assert.equal(evaluations,golden.evaluations);
const ambiguous=pricing.evaluateOffer(connectors[0].validatedV9Offer,{
  ...scenarios.session,durationMinutes:50,chargingMinutes:30,postChargeMinutes:10,
});
assert.equal(ambiguous.complete,false);
assert.equal(ambiguous.reason,'midhope_ambiguous_session_duration');
console.log(`Historical Midhope source oracle: ${evaluations} identical-input evaluations pass`);
