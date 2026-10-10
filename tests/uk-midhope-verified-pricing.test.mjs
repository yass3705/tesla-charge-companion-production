#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const e=require('../runtime-overrides/assets/v9/pricing-engine.js');
const loc='cd20ba89-4241-4b39-b738-514f49093e8d';
const evses={
 'GB*CK0*E19825':'a46c9e98-5d68-4025-989a-ab416d7ab670',
 'GB*CK0*E19865':'d19e0ae8-1424-40d8-ae9a-b13fe6704484',
 'GB*CK0*E19716':'f02dbb6d-7fcb-4dd0-8f51-1a27111ab5b0',
 'GB*CK0*E19707':'9a1d7557-d59c-4e95-a929-b667d73843f0'
};
const mk=(eid=Object.keys(evses)[0])=>({id:'ck-midhope:'+eid,currency:'GBP',kind:'direct',stationIds:[loc],evseIds:[eid],
 metadata:{connectorId:evses[eid],sourceEvidence:'midhope-guest-2026-10-10',pricingScope:'cpo_direct_guest_exact_connector'},
 pricing:{type:'connected_kerb_midhope_guest_verified',verifiedSourceVersion:'2026-10-10-midhope-exact-4',
 includesVat:true,energyPerKwhGbp:0.39996,parkingPerStarted30minGbp:0.80004,idleSupplementPerMinuteGbp:0.01}});
const n=v=>Math.round(v*1e6)/1e6;
const evalAt=(startAt,durationMinutes,chargingMinutes,energyKwh,postChargeMinutes=0,offer=mk())=>e.evaluateOffer(offer,{startAt,durationMinutes,chargingMinutes,energyKwh,postChargeMinutes});
function exact(name,expected,r) {assert.equal(r.complete,true,name+': '+JSON.stringify(r));assert.ok(Math.abs(r.totalEur-expected)<1e-6,name+' '+JSON.stringify({expected,result:r}));}
function blocked(name,r,reason){assert.equal(r.complete,false,name+': '+JSON.stringify(r));assert.equal(r.reason,reason);}
exact('entry 08:30 local',n(5*.39996+.80004),evalAt('2026-10-12T07:20:00Z',30,30,5));
exact('exit 18:00 local',n(9*.39996+.80004),evalAt('2026-10-12T16:30:00Z',90,90,9));
exact('weekday 60min paid',n(10*.39996+2*.80004),evalAt('2026-10-12T09:00:00Z',60,60,10));
exact('weekday 15min rounded',n(2*.39996+.80004),evalAt('2026-10-12T09:00:00Z',15,15,2));
exact('charging then idle: same continuous parking, separate idle supplement',
 n(5*.39996+2*.80004+30*.01),evalAt('2026-10-12T09:00:00Z',30,30,5,30));
exact('idle only',n(30*.01+.80004),evalAt('2026-10-12T09:00:00Z',0,0,0,30));
exact('Sunday free parking, idle payable',n(10*.39996+20*.01),evalAt('2026-10-11T09:00:00Z',60,40,10));
exact('Sunday charging free parking',n(10*.39996),evalAt('2026-10-11T09:00:00Z',60,60,10));
exact('outside window free parking',n(5*.39996),evalAt('2026-10-12T18:00:00Z',60,60,5));
exact('early morning before paid window',n(5*.39996),evalAt('2026-10-12T06:00:00Z',60,60,5));
exact('Mon 08:29 only 1 min inside paid window',n(5*.39996+.80004),evalAt('2026-10-12T07:29:00Z',2,2,5));
exact('last validated local summer Saturday',n(5*.39996+.80004),evalAt('2026-10-24T14:00:00Z',30,30,5));
exact('winter Monday 09:00 UK still in paid window',n(5*.39996+.80004),evalAt('2026-11-02T09:00:00Z',30,30,5));
exact('winter Monday 08:20 UK crossing 08:30',n(5*.39996+.80004),evalAt('2026-10-26T08:20:00Z',30,30,5));
exact('winter Monday 18:00 UK outside window',n(5*.39996),evalAt('2026-10-26T18:00:00Z',30,30,5));
exact('summer to winter rollover on Sunday free parking',n(5*.39996),evalAt('2026-10-24T22:50:00Z',30,30,5));
exact('DST fallback Sunday free parking across repeated local hour',n(5*.39996),evalAt('2026-10-25T00:30:00Z',120,120,5));
blocked('pre-observation price not assumed',evalAt('2026-10-09T09:00:00Z',30,30,5),'midhope_before_observed_tariff');
blocked('duration exceeding maximum',evalAt('2026-10-12T09:00:00Z',1441,1441,5),'midhope_session_exceeds_verified_max_duration');
blocked('missing absolute time',evalAt('2026-10-12T09:00:00',30,30,5),'midhope_requires_absolute_start');
blocked('non-minute aligned time',evalAt('2026-10-12T09:00:20Z',30,30,5),'midhope_requires_minute_aligned_start');
blocked('no room for unnamed EVSE',evalAt('2026-10-12T09:00:00Z',30,30,5,0,{...mk(),evseIds:['GB*CK0*EXXXX']}),'midhope_connector_provenance_missing');
blocked('unknown price metadata',evalAt('2026-10-12T09:00:00Z',30,30,5,0,{...mk(),pricing:{...mk().pricing,parkingPerStarted30minGbp:0.9}}),'midhope_unverified_tariff_values');
for(const eid of Object.keys(evses)){
 exact('scope '+eid,n(5*.39996+.80004),evalAt('2026-10-12T09:00:00Z',30,30,5,0,mk(eid)));
}
console.log(JSON.stringify({passed:true,verifiedSockets:Object.keys(evses).length,phaseRounding:'continuous_occupancy',winter:'Europe/London_DST_supported',boundaries:['08:30','18:00']}));
