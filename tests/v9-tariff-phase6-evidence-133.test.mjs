import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;
const report=JSON.parse(fs.readFileSync(path.join(root,'reports/v9-tariff-133/phase6-matrix-pin-2026-10-15.json')));
const golden=JSON.parse(fs.readFileSync(path.join(root,'tests/golden/v9-tariff-phase6-133.json')));
test('Phase 6 matrix is regenerated from the same 721 exact tuples',()=>{
  const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tcc133-p6-')),'matrix.json');
  execFileSync('python3',[path.join(root,'scripts/v9_tariff_phase6_matrix_133.py'),
    path.join(root,'reports/v9-tariff-133/dualrun-phase5-pin-2026-10-15.json'),
    path.join(root,'reports/v9-tariff-133/dualrun-phase6-pin-2026-10-15.json'),out],{stdio:'pipe'});
  assert.deepEqual(JSON.parse(fs.readFileSync(out)),report);
  assert.deepEqual(report.counts,golden.counts);
  assert.equal(report.manifestSha256,golden.manifestSha256);
  assert.equal(report.matrix.length,181);
  assert.equal(report.rowGates.length,721);
  assert.equal(new Set(report.rowGates.map(x=>x.id)).size,721);
  assert.deepEqual(Object.fromEntries(Object.entries(report.residual62).map(([k,v])=>[k,v.length])),golden.residualByCountry);
  assert.equal(report.matrix.filter(x=>x.areaSampleComplete&&x.sampleAllGatesProved).length,golden.fullySampledAndProvedQueryAreaCohorts);
  assert.ok(report.matrix.every(x=>!x.promotionEligible&&!x.pinWideTupleCensusComplete&&!x.ruleBranchAndSessionCoverageComplete));
  assert.equal(report.runtimeChanged,false);
  assert.equal(report.classificationChanged,false);
});
