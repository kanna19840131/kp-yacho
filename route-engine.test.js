'use strict';
const assert=require('assert');
const e=require('./route-engine.js');
const approx=(a,b,t,m)=>assert.ok(Math.abs(a-b)<=t,`${m}: actual=${a}, expected=${b}`);
let count=0; const ok=()=>count++;
const legacy={id:'LEGACY',shortName:'LEG',points:[{kp:5.0,lat:35,lon:135},{kp:5.1,lat:35,lon:135.001},{kp:5.2,lat:35,lon:135.002}]};
let r=e.nearestOnRoute(35,135.001,legacy);approx(r.kp,5.1,.0005,'legacy');ok();
const calibrated={id:'CAL',polyline:[{lat:35,lon:135},{lat:35,lon:135.001},{lat:35,lon:135.002}],anchors:[{kp:10,lat:35,lon:135},{kp:10.4,lat:35,lon:135.002}]};
r=e.nearestOnRoute(35,135.001,calibrated);approx(r.kp,10.2,.002,'calibration');ok();
const multi={id:'MULTI',polyline:[{lat:35,lon:135},{lat:35,lon:135.001},{lat:35,lon:135.002}],anchors:[{kp:0,lat:35,lon:135},{kp:.05,lat:35,lon:135.001},{kp:.20,lat:35,lon:135.002}]};
r=e.nearestOnRoute(35,135.0015,multi);approx(r.kp,.125,.002,'multi-anchor');ok();
const far={id:'FAR',polyline:[{lat:35.01,lon:135},{lat:35.01,lon:135.002}],anchors:[{kp:20,lat:35.01,lon:135},{kp:20.2,lat:35.01,lon:135.002}]};
r=e.findNearestRoute(35,135.001,[calibrated,far],'auto');assert.strictEqual(r.routeId,'CAL');ok();
r=e.findNearestRoute(35,135.001,[calibrated,far],'FAR');assert.strictEqual(r.routeId,'FAR');ok();
const extra={id:'EXTRA',polyline:[{lat:35,lon:135},{lat:35,lon:135.001},{lat:35,lon:135.002},{lat:35,lon:135.003}],anchors:[{kp:1,lat:35,lon:135.001},{kp:1.1,lat:35,lon:135.002}]};
r=e.nearestOnRoute(35,135.0002,extra);assert.strictEqual(r.extrapolated,true);ok();
assert.throws(()=>e.normalizeRoute({id:'BAD',polyline:[{lat:35,lon:135},{lat:35,lon:135.001}],anchors:[{kp:0,lat:35,lon:135}]}),/at least 2 distinct KP anchors/);ok();
const gap={id:'GAP',points:[{kp:22.5,lat:35,lon:135},{kp:22.6,lat:35,lon:135.001},{kp:23.0,lat:35,lon:135.003},{kp:23.1,lat:35,lon:135.004}]};
assert.strictEqual(e.normalizeRoute(gap).sections.length,2);r=e.nearestOnRoute(35,135.002,gap);assert.ok(Math.abs(r.kp-22.8)>.1);ok();
const duplicateBoundary={id:'DUP',points:[{kp:45.5,lat:35,lon:135},{kp:45.6,lat:35,lon:135.001},{kp:45.7,lat:35,lon:135.001},{kp:45.8,lat:35,lon:135.002}]};
assert.strictEqual(e.normalizeRoute(duplicateBoundary).sections.length,2);r=e.nearestOnRoute(35,135.0015,duplicateBoundary);approx(r.kp,45.75,.002,'duplicate-boundary');assert.strictEqual(r.sectionId,'DUP-2');ok();
const terminalDuplicate={id:'TERM',points:[{kp:45.5,lat:35,lon:135},{kp:45.6,lat:35,lon:135.001},{kp:45.7,lat:35,lon:135.001}]};
assert.strictEqual(e.normalizeRoute(terminalDuplicate).sections.length,1);r=e.nearestOnRoute(35,135.001,terminalDuplicate);approx(r.kp,45.6,.0005,'terminal-duplicate');ok();
const explicit={id:'SEC',sections:[{id:'a',polyline:[{lat:35,lon:135},{lat:35,lon:135.001}],anchors:[{kp:1,lat:35,lon:135},{kp:1.1,lat:35,lon:135.001}]},{id:'b',polyline:[{lat:35.01,lon:135},{lat:35.01,lon:135.001}],anchors:[{kp:9,lat:35.01,lon:135},{kp:9.1,lat:35.01,lon:135.001}]}]};
r=e.nearestOnRoute(35.01,135.0005,explicit);assert.strictEqual(r.sectionId,'b');approx(r.kp,9.05,.002,'sections');ok();

// Route applicability gate: nearest is not automatically usable.
let a=e.assessRouteMatch({distM:20});assert.strictEqual(a.status,'ok');assert.strictEqual(a.accepted,true);ok();
a=e.assessRouteMatch({distM:80});assert.strictEqual(a.status,'warning');assert.strictEqual(a.accepted,true);ok();
a=e.assessRouteMatch({distM:230445});assert.strictEqual(a.status,'outside');assert.strictEqual(a.accepted,false);assert.strictEqual(a.outside,true);ok();
a=e.assessRouteMatch(null);assert.strictEqual(a.status,'unavailable');assert.strictEqual(a.accepted,false);ok();
assert.throws(()=>e.assessRouteMatch({distM:10},{warnDistanceM:300,maxDistanceM:200}),/invalid route distance thresholds/);ok();

// Around 111m from CAL: still usable but warning. Around 333m: fail closed.
a=e.findApplicableRoute(35.001,135.001,[calibrated],'auto');assert.strictEqual(a.status,'warning');assert.strictEqual(a.accepted,true);assert.strictEqual(a.result.routeId,'CAL');ok();
a=e.findApplicableRoute(35.003,135.001,[calibrated],'auto');assert.strictEqual(a.status,'outside');assert.strictEqual(a.accepted,false);assert.ok(a.distM>300);assert.strictEqual(a.result.routeId,'CAL');ok();

assert.strictEqual(e.DEFAULT_ROUTE_WARN_DISTANCE_M,30);assert.strictEqual(e.DEFAULT_ROUTE_MAX_DISTANCE_M,200);ok();
console.log(`route-engine tests: ${count}/${count} passed`);
