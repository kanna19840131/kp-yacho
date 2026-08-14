'use strict';
const assert=require('assert');
const a=require('./official-route-adapter.js');

function csv(rows){
  return ['地方整備局,事務所,道路種別,路線,現旧新区分,補助番号,地点標名称,緯度（度）,緯度（分）,緯度（秒）,経度（度）,経度（分）,経度（秒）',...rows].join('\n');
}
const def={route:'0005',startKp:1,endKp:1.2,office:'小樽開発建設部',currentOldNew:'現道',supplement:'0',label:'国道5号',shortName:'R5'};
const clean=csv([
'北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.0,43,0,0,140,0,0',
'北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.1,43,0,3.2,140,0,1.2',
'北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.2,43,0,6.4,140,0,2.4'
]);
let parsed=a.parseOfficialCsv(clean,def),audit=a.auditRows(parsed.rows,def);assert.strictEqual(audit.strictReady,true);assert.strictEqual(audit.expectedCount,3);assert.strictEqual(audit.uniqueStationCount,3);
let pkg=a.makePackage(parsed);assert.strictEqual(pkg.route.points.length,3);assert.strictEqual(pkg.route.points[1].kp,1.1);assert.strictEqual(pkg.schema,'kp-yacho-route-package/v1');
assert.strictEqual(pkg.source.kind,'official-network-100m-csv');
assert.strictEqual(pkg.source.referenceClass,'road-network-derived');
assert.strictEqual(pkg.source.positioningBasis,'DRM road geometry');
assert.strictEqual(pkg.source.fieldMarkerEquivalent,false);
assert.strictEqual(pkg.source.fieldVerified,false);
assert.strictEqual(pkg.source.qualityGate,'strict-v1');

const identicalDup=clean+'\n北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.1,43,0,3.2,140,0,1.2';
parsed=a.parseOfficialCsv(identicalDup,def);audit=a.auditRows(parsed.rows,def);assert.strictEqual(audit.strictReady,true);assert.strictEqual(audit.collapsibleDuplicates.length,1);pkg=a.makePackage(parsed);assert.strictEqual(pkg.route.points.length,3);

const ambiguous=clean+'\n北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.1,43,0,13.2,140,0,11.2';
parsed=a.parseOfficialCsv(ambiguous,def);audit=a.auditRows(parsed.rows,def);assert.strictEqual(audit.strictReady,false);assert.strictEqual(audit.ambiguousDuplicates.length,1);assert.throws(()=>a.makePackage(parsed),/not safe to package/);

const missing=csv([
'北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.0,43,0,0,140,0,0',
'北海道開発局,小樽開発建設部,一般国道（直轄）,0005,現道,0,1.2,43,0,6.4,140,0,2.4'
]);
parsed=a.parseOfficialCsv(missing,def);audit=a.auditRows(parsed.rows,def);assert.deepStrictEqual(audit.missing,['1.1']);assert.strictEqual(audit.strictReady,false);assert.throws(()=>a.makePackage(parsed),/missing=1.1/);

assert.deepStrictEqual(a.expectedStations(2,2.3),[20,21,22,23]);assert.strictEqual(a.stationText(2.04),'2.0');assert.strictEqual(a.stationText(2.06),'2.1');
console.log('official-route-adapter unit tests: passed');
