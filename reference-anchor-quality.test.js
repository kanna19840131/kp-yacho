'use strict';
const assert=require('assert');
const qa=require('./reference-anchor-quality.js');

let count=0;const ok=()=>count++;
const polyline=[{lat:35,lon:135},{lat:35,lon:135.001},{lat:35,lon:135.002},{lat:35,lon:135.003}];
const network=new Map([
  ['10.0',[{kp:10,lat:35,lon:135}]],
  ['10.1',[{kp:10.1,lat:35,lon:135.001}]],
  ['10.2',[{kp:10.2,lat:35,lon:135.002}]],
  ['10.3',[{kp:10.3,lat:35,lon:135.003}]]
]);

const clean=[
  {kp:10,lat:35,lon:135},
  {kp:10.1,lat:35,lon:135.001},
  {kp:10.2,lat:35,lon:135.002},
  {kp:10.3,lat:35,lon:135.003}
];
let a=qa.auditReferenceAnchors(clean,{polyline,networkByKp:network,warningM:50,severeM:100});
assert.strictEqual(a.rejected.length,0);assert.strictEqual(a.rows.every(x=>x.status==='accept'),true);ok();

const bad=clean.map(x=>({...x}));bad[1].lat=35.005;
a=qa.auditReferenceAnchors(bad,{polyline,networkByKp:network,warningM:50,severeM:100});
const badRow=a.rows.find(x=>x.kp===10.1);
assert.strictEqual(badRow.rejected,true);assert.ok(badRow.signals.centerlineSevere);assert.ok(badRow.signals.networkSevere);ok();

// One source may be wrong: a bad network reference alone must not auto-reject a good route/neighbor anchor.
const wrongNetwork=new Map(network);wrongNetwork.set('10.1',[{kp:10.1,lat:35.005,lon:135.001}]);
a=qa.auditReferenceAnchors(clean,{polyline,networkByKp:wrongNetwork,warningM:50,severeM:100});
const oneSignal=a.rows.find(x=>x.kp===10.1);
assert.strictEqual(oneSignal.rejected,false);assert.strictEqual(oneSignal.status,'verify');assert.ok(oneSignal.signals.networkSevere);assert.ok(!oneSignal.signals.centerlineSevere);ok();

// A large route offset plus local stationing residual is enough even if no network reference is available.
const noNetworkBad=clean.map(x=>({...x}));noNetworkBad[2]={kp:10.2,lat:35.004,lon:135.002};
a=qa.auditReferenceAnchors(noNetworkBad,{polyline,networkByKp:new Map(),warningM:50,severeM:100});
const nr=a.rows.find(x=>x.kp===10.2);
assert.strictEqual(nr.rejected,true);assert.ok(nr.signals.centerlineSevere);assert.ok(nr.signals.neighborSevere);ok();

console.log(`reference anchor quality tests: ${count}/${count} passed`);
