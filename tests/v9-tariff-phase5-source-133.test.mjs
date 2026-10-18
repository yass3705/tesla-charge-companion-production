import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {independentOracle,independentDotnlCompactOracle,independentComponentGroupsOracle,
  independentOcpiEnergyOracle} from '../scripts/v9_tariff_oracle_133.mjs';
const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('TCC_V9_DIST required');
const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-phase5-source-133.json',import.meta.url)));
const config=JSON.parse(fs.readFileSync(new URL('../config/v9-tariff-dualrun-133-scenarios.json',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'manifest.json')));
const fx=JSON.parse(fs.readFileSync(path.join(dist,'data/exchange_rates.json')));
const fxSource=JSON.parse(fs.readFileSync(path.join(dist,'snapshot-inputs/FX/source.json')));
test('Phase 5 source golden uses the same pin and verified source bytes',()=>{
  assert.equal(golden.snapshotId,manifest.snapshotId);
  for(const c of golden.cases){
    const bytes=fs.readFileSync(path.join(dist,c.path));
    const digest=crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(digest,c.sha256,c.key);
    assert.equal(manifest.files.find(x=>x.path===c.path)?.sha256,c.sha256,c.key);
    let value=JSON.parse(c.path.endsWith('.gz')?zlib.gunzipSync(bytes):bytes);
    for(const step of c.pointer.slice(1).split('/'))value=value[step];
    const spec=config.scenarios.find(x=>x.key===c.scenario);
    assert.ok(spec,c.key);
    const session={...config.session,...spec.session,...c.sessionOverrides,
      fxEvidence:{date:fx.date,base:fx.base,rates:fx.rates,sourceSha256:fxSource.sourceSha256}};
    const result=c.kind==='component_groups'?independentComponentGroupsOracle(value,session):
      c.kind==='dotnl'?independentDotnlCompactOracle(value,session):
      c.kind==='ocpi_energy'?independentOcpiEnergyOracle(value,session):
      independentOracle(value,session);
    for(const [key,expected] of Object.entries(c.expected))assert.deepEqual(result[key],expected,`${c.key} ${key}`);
  }
});
