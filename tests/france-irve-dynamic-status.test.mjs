import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const engine=require('../runtime-overrides/assets/v9/data-engine.js');
const adapter=require('../runtime-overrides/assets/v9/adapters/france-irve-status.js');
const now=Date.parse('2026-10-07T02:00:00Z');
const payload={generatedAt:'2026-10-07T01:00:00Z',records:[
  {id_station_itinerance:'FRTEST1',id_pdc_itinerance:'FRTESTE1',etat_pdc:'en_service',horodatage:'2026-10-07T00:00:00Z'},
  {id_station_itinerance:'FRTEST1',id_pdc_itinerance:'FRTESTE2',etat_pdc:'hors_service',horodatage:'2026-10-06T00:00:00Z'},
  {id_station_itinerance:'FRTEST1',id_pdc_itinerance:'FRTESTE3',etat_pdc:'inconnu',horodatage:'2026-10-06T00:00:00Z'}
]};
const fragments=adapter.normalizePayload(payload,{now,maxAgeMinutes:2880}).stationFragments;
assert.equal(fragments.length,1,'daily source groups PDC status by IRVE station');
assert.deepEqual(fragments[0].status.pdcs.map(row=>row.state),['available','out_of_service','unknown']);
const station={id:'FR:national:FRTEST1',countryCode:'FR',status:fragments[0].status,
  aliases:['irve-pdc:FRTESTE1','irve-pdc:FRTESTE2','irve-pdc:FRTESTE3'],
  evses:[{id:'ac',pdcIds:['FRTESTE1','FRTESTE2','FRTESTE3'],stalls:3,connectors:[{kind:'AC',powerKw:22}]}],
  offers:[{id:'dead-offer',evseIds:['FRTESTE2']},{id:'live-offer',evseIds:['FRTESTE1']}]};
const visible=engine.hideUnavailableIrvePdcs(station);
assert.deepEqual(visible.evses[0].pdcIds,['FRTESTE1']);
assert.equal(visible.evses[0].stalls,1);
assert.deepEqual(visible.offers.map(offer=>offer.id),['live-offer']);
assert.ok(!visible.aliases.includes('irve-pdc:FRTESTE2'));
assert.equal(engine.hideUnavailableIrvePdcs({...station,evses:[{...station.evses[0],pdcIds:['FRTESTE2','FRTESTE3']}] }),null);
assert.equal(adapter.normalizePayload(payload,{now:now+72*3600000,maxAgeMinutes:2880}).stationFragments.length,0,
  'a stale daily snapshot must not hide stations');
console.log('Daily IRVE states hide only unavailable PDCs and preserve the static station inventory');
