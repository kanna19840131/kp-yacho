'use strict';
const assert=require('assert');
const c=require('./calibration-capture-core.js');

const base={
  route:'R230',kp:15.84,lat:42.95,lon:141.20,accuracyM:8,
  source:'physical-marker',note:'15.840地点標',capturedAt:'2026-08-15T06:00:00+09:00'
};

let x=c.createCapture(base);
assert.strictEqual(x.schema,'kp-yacho-calibration-capture/v1');
assert.strictEqual(x.route,'R230');
assert.strictEqual(x.kp,15.84);
assert.strictEqual(x.quality,'good');
assert.strictEqual(x.source,'physical-marker');
assert.ok(x.id.includes('R230'));

assert.strictEqual(c.qualityForAccuracy(20).status,'good');
assert.strictEqual(c.qualityForAccuracy(20.1).status,'warning');
assert.strictEqual(c.qualityForAccuracy(50).usable,true);
assert.strictEqual(c.qualityForAccuracy(50.1).usable,false);
assert.throws(()=>c.createCapture({...base,accuracyM:80}),/too poor/);
assert.doesNotThrow(()=>c.createCapture({...base,accuracyM:80},{allowPoorAccuracy:true}));
assert.throws(()=>c.createCapture({...base,route:''}),/route is required/);
assert.throws(()=>c.createCapture({...base,kp:'x'}),/known KP/);
assert.throws(()=>c.createCapture({...base,lat:100}),/latitude/);

const a=c.createCapture({...base,kp:10,lat:43,lon:141,capturedAt:'2026-08-15T01:00:00Z'});
const b=c.createCapture({...base,kp:11,lat:43.004,lon:141,capturedAt:'2026-08-15T01:10:00Z'});
const d=c.createCapture({...base,kp:12,lat:43.008,lon:141,capturedAt:'2026-08-15T01:20:00Z'});
const dist=c.haversineM(a,b);
assert.ok(dist>400&&dist<500);
let audit=c.auditCaptures([a,b,d]);
assert.strictEqual(audit.count,3);
assert.strictEqual(audit.routes[0].recommendedForTwoPlusOneTest,true);
assert.strictEqual(audit.routes[0].spacingWarning,false);

audit=c.auditCaptures([a,{...b,lat:43.0005},d]);
assert.strictEqual(audit.routes[0].spacingWarning,true);

const csv=c.toCsv([x]);
assert.ok(csv.includes('route,kp,lat,lon'));
assert.ok(csv.includes('R230'));
const json=JSON.parse(c.toJson([x]));
assert.strictEqual(json.schema,'kp-yacho-calibration-capture-set/v1');
assert.strictEqual(json.captures.length,1);

console.log('calibration-capture-core tests: passed');
