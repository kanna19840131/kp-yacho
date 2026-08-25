'use strict';
const assert=require('assert');
const Core=require('./beta-app-core.js');
let count=0;
const ok=()=>count++;
const approx=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`actual=${a}, expected=${b}`);

let a=Core.calcArea('rect',{w:0.9,l1:36}); approx(a.area,32.4); ok();
a=Core.calcArea('trap',{w:2,l1:3,l2:5}); approx(a.area,8); ok();
a=Core.calcArea('tri',{w:2,l1:5}); approx(a.area,5); ok();
a=Core.calcArea('manual',{manualArea:12.345}); approx(a.area,12.35); ok();

let state=Core.createDefaultState({date:'2026-08-16',routeId:'TEST'});
assert.strictEqual(state.nextNo,1); ok();

const manual=Core.selectManualKp(15.84,'R','TEST','テスト路線');
assert.strictEqual(manual.kp,15.84); assert.strictEqual(manual.source,'manual'); ok();

let r={routeId:'TEST',routeLabel:'テスト路線',shortName:'T',sectionId:'TEST-1',kp:10.1,distM:8,extrapolated:false};
let gd=Core.gpsDecision(r,8,30,200);
assert.strictEqual(gd.status,'ok'); approx(gd.estimated.kp,10.1,0.002); ok();

gd=Core.gpsDecision(Object.assign({},r,{distM:31}),8,30,200);
assert.strictEqual(gd.status,'warn'); assert.ok(gd.estimated); ok();
gd=Core.gpsDecision(Object.assign({},r,{distM:201}),8,30,200);
assert.strictEqual(gd.status,'out'); assert.strictEqual(gd.estimated,null); ok();
gd=Core.gpsDecision(Object.assign({},r,{extrapolated:true}),8,30,200);
assert.strictEqual(gd.status,'extrapolated'); assert.strictEqual(gd.estimated,null); ok();

const estimated=Core.selectEstimatedKp(Core.gpsDecision(r,9),'L');
assert.strictEqual(estimated.source,'estimated'); assert.strictEqual(estimated.side,'L'); ok();

let started=Core.createStartedRecord({state,selection:manual,date:state.date,session:'午前'});
assert.strictEqual(started.record.no,1); assert.strictEqual(started.record.area,0); assert.strictEqual(started.record.photoBefore,true); ok();
state=Core.upsertRecord(state,started.record);
state.nextNo=started.nextNo;
assert.strictEqual(state.nextNo,2); ok();

const area=Core.calcArea('rect',{w:1,l1:10});
let completed=Core.createCompletedRecord({state,date:state.date,routeId:'TEST',routeLabel:'テスト路線',session:'午後',kp:16.1,side:'R',shape:'rect',w:1,l1:10,formula:area.formula,area:area.area,photoBefore:true,photoAfter:true,source:'manual'});
state=Core.upsertRecord(state,completed.record);
state.nextNo=completed.nextNo;
assert.strictEqual(state.nextNo,3); assert.strictEqual(state.items.length,2); ok();

let totals=Core.dailyTotals(Object.assign({},state,{rate:40,inTon:'1.0',leftTon:'0.25'}));
assert.strictEqual(totals.total,10); approx(totals.usedTon,0.75); approx(totals.remainArea,10); ok();

const next=Core.startNewDay(state,'2026-08-17');
assert.strictEqual(next.items.length,0); assert.strictEqual(next.archives.length,1); assert.strictEqual(next.nextNo,3); assert.strictEqual(next.date,'2026-08-17'); ok();

const serialized=JSON.parse(JSON.stringify(next));
const restoredState=Core.normalizeState(serialized);
assert.strictEqual(restoredState.nextNo,3); assert.strictEqual(restoredState.archives.length,1); ok();

const pkg=Core.validateRoutePackage({type:'kp-yacho-route-package',schemaVersion:1,packageId:'route-a',label:'路線A',routes:[{id:'A',points:[{kp:0,lat:35,lon:135},{kp:.1,lat:35,lon:135.001}]}]});
assert.strictEqual(pkg.packageId,'route-a'); assert.strictEqual(pkg.routes.length,1); ok();
assert.throws(()=>Core.validateRoutePackage({type:'kp-yacho-route-package',schemaVersion:1,packageId:'x',routes:[]}),/routes/); ok();

const backup=Core.makeBackupEnvelope(state,'route-a');
const restored=Core.restoreBackupEnvelope(JSON.parse(JSON.stringify(backup)),'route-a');
assert.strictEqual(restored.items.length,2); ok();
assert.throws(()=>Core.restoreBackupEnvelope(backup,'route-b'),/別の担当路線/); ok();

const summary=Core.makeSummary(Object.assign({},state,{rate:45}),'テスト路線');
assert.ok(summary.includes('KP野帳 β 施工サマリー')); assert.ok(summary.includes('施工箇所：2件')); ok();

console.log(`beta app core tests: ${count}/${count} passed`);
