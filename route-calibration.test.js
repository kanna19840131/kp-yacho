'use strict';
const assert=require('assert');
const engine=require('./route-engine.js');
const cal=require('./route-calibration.js');

const route={
  id:'TEST',label:'Test route',shortName:'T',
  polyline:[{lat:43,lon:141},{lat:43,lon:141.012}],
  anchors:[
    {kp:0,lat:43,lon:141},
    {kp:1,lat:43,lon:141.012}
  ],
  source:{kind:'synthetic-base'}
};

function resultAt(r,lon){const out=engine.nearestOnRoute(43,lon,r);assert(out);return out;}
function near(actual,expected,tol=0.002){assert(Math.abs(actual-expected)<=tol,`expected ${actual} near ${expected}`);}

// One field anchor applies a constant KP offset across the section.
let baseMid=resultAt(route,141.006);
near(baseMid.kp,0.5,0.001);
let calibrated=cal.calibrateRoute(route,[{kp:0.52,lat:43,lon:141.006,label:'known KP'}]);
let mid=resultAt(calibrated,141.006),quarter=resultAt(calibrated,141.003);
near(mid.kp,0.52,0.001);
near(quarter.kp,0.27,0.002);
assert.strictEqual(calibrated.metadata.fieldCalibration.acceptedCount,1);
assert.strictEqual(calibrated.sections[0].metadata.fieldCalibration.mode,'constant-offset');
assert.strictEqual(calibrated.source.kind,'synthetic-base');

// Two field anchors interpolate the correction, rather than replacing route geometry.
calibrated=cal.calibrateRoute(route,[
  {kp:0.26,lat:43,lon:141.003,label:'A'}, // base about 0.25, +0.01
  {kp:0.78,lat:43,lon:141.009,label:'B'}  // base about 0.75, +0.03
]);
quarter=resultAt(calibrated,141.003);
mid=resultAt(calibrated,141.006);
let threeQuarter=resultAt(calibrated,141.009);
near(quarter.kp,0.26,0.002);
near(mid.kp,0.52,0.002);
near(threeQuarter.kp,0.78,0.002);
assert.strictEqual(calibrated.sections[0].metadata.fieldCalibration.mode,'piecewise-offset');
assert.strictEqual(calibrated.metadata.fieldCalibration.acceptedCount,2);

// Original route must remain unchanged.
near(resultAt(route,141.006).kp,0.5,0.001);

// A field point too far from the route fails closed in strict mode.
assert.throws(()=>cal.calibrateRoute(route,[{kp:0.5,lat:43.01,lon:141.006}],{maxDistanceM:30}),/rejected anchors/);

// Reversed field KP order is inconsistent and fails closed.
assert.throws(()=>cal.calibrateRoute(route,[
  {kp:0.8,lat:43,lon:141.003},
  {kp:0.2,lat:43,lon:141.009}
]),/inconsistent/);

// Non-strict mode preserves a rejected-anchor audit without applying it.
const loose=cal.calibrateRoute(route,[{kp:0.5,lat:43.01,lon:141.006}],{maxDistanceM:30,strict:false});
assert.strictEqual(loose.metadata.fieldCalibration.acceptedCount,0);
assert.strictEqual(loose.metadata.fieldCalibration.rejectedCount,1);
assert.strictEqual(loose.calibrationAudit.rejected[0].reason,'too-far-from-route');

console.log('route-calibration tests: passed');
