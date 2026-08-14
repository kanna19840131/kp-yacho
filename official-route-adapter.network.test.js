'use strict';
const assert=require('assert');
const a=require('./official-route-adapter.js');

async function inspect(def){
  const parsed=await a.fetchOfficialCsv(def),audit=a.auditRows(parsed.rows,def);
  console.log(JSON.stringify({definition:parsed.definition,audit},null,2));
  return{parsed,audit};
}
(async()=>{
  const r5={route:'0005',startKp:197,endKp:203,office:'小樽開発建設部',currentOldNew:'現道',supplement:'0',label:'国道5号 pilot',shortName:'R5P'};
  const x=await inspect(r5);assert.strictEqual(x.audit.strictReady,true,'neutral R5 pilot should be a clean 100m package');
  const pkg=a.makePackage(x.parsed);assert.strictEqual(pkg.route.points.length,61);assert.strictEqual(pkg.route.points[0].kp,197);assert.strictEqual(pkg.route.points.at(-1).kp,203);

  // Existing production routes are intentionally audit-only here. Public output may contain gaps/duplicates;
  // the adapter must report them and must not silently fabricate/collapse ambiguous station data.
  for(const def of [
    {route:'0230',startKp:0,endKp:10,office:'札幌開発建設部',currentOldNew:'現道',supplement:'0',label:'R230 audit',shortName:'R230A'},
    {route:'0453',startKp:0,endKp:10,office:'札幌開発建設部',currentOldNew:'現道',supplement:'0',label:'R453 audit',shortName:'R453A'}
  ]){
    const y=await inspect(def);
    if(y.audit.strictReady){const p=a.makePackage(y.parsed);assert.strictEqual(p.route.points.length,101);}
    else assert.throws(()=>a.makePackage(y.parsed),/not safe to package/);
  }
  console.log('official-route-adapter live network tests: passed');
})().catch(e=>{console.error(e);process.exit(1);});
