import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const [, , candidatePath, sitePath] = process.argv;
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const candidate = read(candidatePath);
const adapter = require(sitePath
  ? path.resolve(sitePath, 'runtime/assets/v9/adapters/canonical-v9.js')
  : '../runtime-owned/assets/v9/adapters/canonical-v9.js');
const pricing = require(sitePath
  ? path.resolve(sitePath, 'runtime/assets/v9/pricing-engine.js')
  : '../runtime-overrides/assets/v9/pricing-engine.js');

const offers = adapter.toFragments(candidate).flatMap(station => station.offers.map(offer => ({station, offer})));
assert.equal(offers.length, candidate.offers.length, 'every selected profile must be calculable');
const projected = new Map(candidate.offers.map(offer => [offer.id, offer.rawOffer]));
const profiles = new Map();
for (const {station, offer} of offers) {
  const raw = projected.get(offer.id);
  assert.equal(offer.evseIds.length, 1);
  assert.equal(station.evses.find(evse => evse.id === offer.evseIds[0]).officialEvseId, raw.sourceEvseId);
  assert.deepEqual(offer.connectorIds, raw.nationalConnectorIds);
  assert.equal(offer.metadata.taxIncluded, true);
  if (!profiles.has(raw.profile.profileId)) profiles.set(raw.profile.profileId, {station, offer, raw});
}

const pins = new Map([
  ['584ac48145a63ad4', [0.0384, 0.0276]],
  ['653f339c973546a8', [0.084, 0.0624]],
  ['6d70ec4d6d770429', [0.0564, 0.0336]],
  ['a3446acf389257db', [0.576, 0.0996]],
  ['d3000d2fd1974267', [0.0252, 0.0204]]
]);
assert.equal(profiles.size, pins.size);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const browserCases = [];
for (const [profile, {station, offer, raw}] of profiles) {
  const hash = profile.split('-').at(-1);
  const [day, night] = pins.get(hash);
  const isEnergy = hash === 'a3446acf389257db';
  for (const [startAt, active, idle, expected] of [
    ['2026-11-27T21:45:00Z', 30, 15, isEnergy ? 0.60 + 10*day + 15*night : 0.60 + 15*day + 30*night],
    ['2026-11-27T19:00:00Z', 30, 60, isEnergy ? 0.60 + 10*day + 60*night : 0.60 + 90*day],
    ['2026-11-27T22:00:00Z', 30, 0, isEnergy ? 0.60 + 10*day : 0.60 + 30*night]
  ]) {
    const session = {startAt, durationMinutes:active+idle, chargingMinutes:active, postChargeMinutes:idle, energyKwh:10};
    const result = pricing.evaluateOffer(offer, session);
    assert.equal(result.complete, true, JSON.stringify(result));
    close(result.totalEur, expected);
    assert.equal(pricing.evaluateOffer(offer, {...session, postChargeMinutes:null}).complete, false);
    if (isEnergy) assert.equal(pricing.evaluateOffer(offer, {...session, energyKwh:null}).complete, false);
  }
  browserCases.push({
    profile, isEnergy, day, night,
    stationId: station.canonicalId, offerId: offer.id,
    evseId: raw.sourceEvseId, connectorIds: raw.nationalConnectorIds,
    name: station.name, latitude: station.latitude, longitude: station.longitude
  });
}
const damaged = structuredClone(candidate);
damaged.offers[0].rawOffer.profile.rules[0].stepSizeByDimension = {flat:1};
assert(!adapter.toFragments(damaged).some(station => station.offers.some(offer => offer.id === damaged.offers[0].id)));
console.log(JSON.stringify({matchedOffers:offers.length, browserCases}));
