import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const dist=process.env.TCC_V9_DIST;
if(!dist)throw Error('Set TCC_V9_DIST to the validated pinned dist');
{
  // The Phase 1 result is a historical pinned artifact. Phase 2 has its own
  // wider executable golden and does not rewrite this baseline.
  const actual=JSON.parse(fs.readFileSync(new URL('../reports/v9-tariff-133/dualrun-pin-2026-10-15.json',import.meta.url)));
  const golden=JSON.parse(fs.readFileSync(new URL('./golden/v9-tariff-dualrun-133.json',import.meta.url)));
  assert.equal(actual.summary.snapshotId,golden.snapshotId);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'manifest.json'))).digest('hex'),golden.manifestSha256);
  assert.deepEqual(actual.rows.map(r=>({key:r.key,stationId:r.stationId||null,evseId:r.evseId||null,
    connectorId:r.connectorId||null,offerId:r.offerId||null,status:r.new?.status||r.status,
    total:r.new?.total??null,currency:r.new?.currency??null,classification:r.classification||null})),
    golden.scenarios.map(({rawKey,sourceSha256,...expected})=>expected));
  assert(golden.scenarios.every(r=>!r.sourceSha256||/^[a-f0-9]{64}$/.test(r.sourceSha256)));
  assert.equal(new Set(actual.rows.map(r=>r.key)).size,13);
  assert(actual.rows.some(r=>r.key==='FR-bois-d-arcy'&&r.offerId?.startsWith('electra-platform:')));
}
console.log('V9 pinned dist dual-run #133 golden OK');
