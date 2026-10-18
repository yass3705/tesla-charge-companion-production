import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;
test('offline shadow replay is default-off, no-op on UI and stops after rollback',()=>{
  const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tcc133-shadow-')),'bench.json');
  execFileSync(process.execPath,[path.join(root,'scripts/v9_tariff_shadow_bench_133.mjs'),
    path.join(root,'reports/v9-tariff-133/dualrun-phase6-pin-2026-10-15.json'),out],{stdio:'pipe'});
  const report=JSON.parse(fs.readFileSync(out));
  assert.equal(report.rows,719);
  assert.equal(report.defaultDisabled.candidateCalls,0);
  assert.equal(report.defaultDisabled.logs,0);
  assert.equal(report.enabled.candidateCalls,719);
  assert.equal(report.enabled.metrics.evaluations,719);
  assert.equal(report.enabled.logs,719);
  assert.equal(report.rollback.candidateCallsAfter,0);
  assert.equal(report.rollback.logsAfter,0);
  assert.equal(report.uiResponseIdentityPreserved,true);
  assert.equal(report.rankingUnchanged,true);
  assert.equal(report.rawIdentifiersLogged,false);
  assert.deepEqual(report.enabled.unavailableFields,['legacy_components','legacy_provenance']);
  assert.ok(report.enabled.latency.p95Ms>=0);
});
