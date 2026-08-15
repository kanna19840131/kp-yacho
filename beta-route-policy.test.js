'use strict';
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const Core=require('./beta-app-core.js');
const Engine=require('./route-engine.js');

const sandbox={window:{KPBetaCore:Core,KPRouteEngine:Engine}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('beta-route-config.js','utf8'),sandbox);
const validate=sandbox.window.KPBetaCore.validateRoutePackage;
let count=0;const ok=()=>count++;

function route(id='TEST',anchors=[
  {kp:10.0,lat:35,lon:135},
  {kp:10.2,lat:35,lon:135.002}
]){
  return {id,label:id,shortName:id,polyline:[{lat:35,lon:135},{lat:35,lon:135.001},{lat:35,lon:135.002}],anchors};
}
function pkg(overrides={}){
  return Object.assign({
    type:'kp-yacho-route-package',schemaVersion:1,packageId:'customer-test',label:'テスト',
    rights:{confirmed:true,basis:'synthetic-test'},routes:[route()]
  },overrides);
}

assert.strictEqual(validate(pkg()).routes.length,1);ok();
assert.throws(()=>validate(pkg({packageId:'顧客A'})),/packageId/);ok();
assert.throws(()=>validate(pkg({rights:{confirmed:false,basis:'synthetic-test'}})),/利用権/);ok();
assert.throws(()=>validate(pkg({rights:{confirmed:true,basis:''}})),/利用権/);ok();
assert.throws(()=>validate(pkg({routes:[route('A'),route('B')]})),/1パッケージ/);ok();
assert.throws(()=>validate(pkg({routes:[route('TEST',[{kp:10.0,lat:35,lon:135},{kp:10.2,lat:35,lon:135.001},{kp:10.1,lat:35,lon:135.002}])]})),/途中反転/);ok();
assert.throws(()=>validate(pkg({routes:[route('TEST',[{kp:10.0,lat:35,lon:135},{kp:10.0,lat:35,lon:135.002}])]})),/同じKP/);ok();

console.log(`beta route policy tests: ${count}/${count} passed`);
