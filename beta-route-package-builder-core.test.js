'use strict';
const assert=require('assert');
const Builder=require('./beta-route-package-builder-core.js');
let count=0;const ok=()=>count++;
const kml=`<?xml version="1.0"?><kml><Placemark><name>main</name><LineString><coordinates>135.0000,35.0000,0 135.0010,35.0000,0 135.0020,35.0000,0</coordinates></LineString></Placemark></kml>`;
const captures={schema:'kp-yacho-calibration-capture-set/v1',captures:[
  {route:'TEST',kp:10.0,lat:35.0000,lon:135.0000,source:'physical-marker'},
  {route:'TEST',kp:10.1,lat:35.0000,lon:135.0010,source:'physical-marker'},
  {route:'TEST',kp:10.2,lat:35.0000,lon:135.0020,source:'physical-marker'}
]};
const pkg=Builder.buildRoutePackage(kml,captures,{packageId:'customer-test',routeId:'TEST',label:'テスト路線',shortName:'TEST',captureRoute:'TEST',rightsConfirmed:true,rightsBasis:'synthetic-test',fieldVerified:false});
assert.strictEqual(pkg.packageId,'customer-test');assert.strictEqual(pkg.routes.length,1);ok();
const audit=Builder.packageAudit(pkg);
assert.strictEqual(audit.rightsConfirmed,true);assert.strictEqual(audit.routes[0].anchorCounts[0],3);assert.strictEqual(audit.routes[0].kpMin,10);assert.strictEqual(audit.routes[0].kpMax,10.2);ok();
assert.throws(()=>Builder.buildRoutePackage(kml,captures,{packageId:'x',routeId:'TEST',rightsConfirmed:false,rightsBasis:'x'}),/利用権/);ok();
assert.throws(()=>Builder.buildRoutePackage(kml,{captures:[captures.captures[0]]},{packageId:'x',routeId:'TEST',rightsConfirmed:true,rightsBasis:'x'}),/2点以上/);ok();
console.log(`beta route package builder tests: ${count}/${count} passed`);
