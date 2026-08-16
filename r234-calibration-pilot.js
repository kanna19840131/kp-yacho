'use strict';
const fs=require('fs');
const assert=require('assert');
const engine=require('./route-engine.js');
const anchorQuality=require('./reference-anchor-quality.js');

const CENTERLINE=process.argv[2]||'/tmp/r234-centerline.geojson';
const BASE='https://www.road-refpoint.go.jp/kijunten/';
const ROUTE='0234';
const Z=14;

function csvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function cp932(buf){for(const enc of ['shift_jis','windows-31j']){try{return new TextDecoder(enc).decode(buf);}catch(e){}}throw new Error('cp932 unsupported');}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function kpNumber(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function tileXY(lat,lon,z=Z){const n=2**z,x=Math.floor((lon+180)/360*n),r=lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n);return{x,y};}
function revisionRank(row){const update=Number(String(row.updateno_str??'').replace(/[^0-9.-]/g,'')),date=Date.parse(String(row.fdate_str??''));return[Number.isFinite(update)?update:-1,Number.isFinite(date)?date:-1];}
function compareRevision(a,b){const ar=revisionRank(a),br=revisionRank(b);if(ar[0]!==br[0])return br[0]-ar[0];return br[1]-ar[1];}
function stats(rows){const e=rows.map(x=>Math.abs(x.errorM));const mean=e.reduce((a,b)=>a+b,0)/(e.length||1);const sorted=e.slice().sort((a,b)=>a-b);const p95=sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]:null;return{count:rows.length,meanAbsM:+mean.toFixed(2),medianAbsM:sorted.length?+sorted[Math.floor(sorted.length/2)].toFixed(2):null,p95AbsM:p95===null?null:+p95.toFixed(2),maxAbsM:sorted.length?+sorted[sorted.length-1].toFixed(2):null};}

async function networkPoints(){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=0.0&hm3_a=100.0`;
  const res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-r234-calibration/0.2','referer':BASE}});
  if(!res.ok)throw new Error('R234 CSV HTTP '+res.status);
  const text=cp932(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const rows=text.split(/\r?\n/).filter(Boolean).map(csvLine).slice(1);
  return rows.map(r=>({kp:kpNumber(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12]),office:r[1]})).filter(x=>Number.isFinite(x.kp)&&Number.isFinite(x.lat)&&Number.isFinite(x.lon));
}
function networkMap(points){const by=new Map();for(const p of points){const k=p.kp.toFixed(1);if(!by.has(k))by.set(k,[]);by.get(k).push(p);}return by;}
function networkSeeds(points){const by=networkMap(points),seeds=[];for(let k=0;k<=65;k+=5){const v=by.get(k.toFixed(1));if(v?.length)seeds.push(v[0]);}return seeds;}

async function measuredPoints(seeds){
  const urls=new Set();
  for(const s of seeds){const t=tileXY(s.lat,s.lon);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)urls.add(`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${t.x+dx}/${t.y+dy}.geojson`);}
  const rows=[];
  for(const url of urls){
    const res=await fetch(url,{headers:{'user-agent':'kp-yacho-r234-calibration/0.2'}});if(!res.ok)continue;
    const json=await res.json();
    for(const f of json.features||[]){
      const p=f.properties||{};if(String(p.drcd)!==ROUTE)continue;
      const c=f.geometry?.coordinates||[],lon=Number(p.keido??c[0]),lat=Number(p.ido??c[1]),kp=kpNumber(p.pk);
      if(Number.isFinite(lat)&&Number.isFinite(lon)&&Number.isFinite(kp))rows.push({kp,lat,lon,updateno_str:p.updateno_str,fdate_str:p.fdate_str,id:p.id,pk:p.pk,gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno,tncdn:p.tncdn,riyuucdn:p.riyuucdn});
    }
  }
  const by=new Map();
  for(const r of rows){const sig=`${r.id}|${r.lat}|${r.lon}|${r.kp}|${r.updateno_str}|${r.fdate_str}`;if(!by.has(r.kp))by.set(r.kp,new Map());by.get(r.kp).set(sig,r);}
  return [...by.entries()].map(([kp,map])=>[...map.values()].sort(compareRevision)[0]).sort((a,b)=>a.kp-b.kp);
}

function routeFrom(polyline,anchors){return{id:'R234-CAL',label:'R234 calibration pilot',shortName:'R234',polyline,anchors:anchors.map(a=>({kp:a.kp,lat:a.lat,lon:a.lon}))};}
function evaluate(polyline,calibration,holdouts,label){
  const route=routeFrom(polyline,calibration),rows=[];
  for(const h of holdouts){
    const r=engine.nearestOnRoute(h.lat,h.lon,route);if(!r||r.extrapolated)continue;
    rows.push({kp:h.kp,predictedKp:+r.kp.toFixed(5),errorM:+((r.kp-h.kp)*1000).toFixed(2),routeOffsetM:+r.distM.toFixed(2)});
  }
  return{label,calibrationKp:calibration.map(x=>x.kp),holdoutKp:rows.map(x=>x.kp),stats:stats(rows),rows};
}
function chooseTrusted(trusted,preferred){return preferred.map(k=>trusted.find(x=>Math.abs(x.kp-k)<1e-9)).filter(Boolean);}

(async()=>{
  const geo=JSON.parse(fs.readFileSync(CENTERLINE,'utf8')),coords=geo.geometry?.coordinates||geo.coordinates||[];
  assert.ok(coords.length>10,'R234 centerline missing');
  const polyline=coords.map(c=>({lat:Number(c[1]),lon:Number(c[0])}));
  const network=await networkPoints(),networkBy=networkMap(network),measured=await measuredPoints(networkSeeds(network));
  assert.ok(measured.length>=10,'not enough measured R234 points');

  const qa=anchorQuality.auditReferenceAnchors(measured,{polyline,networkByKp:networkBy,warningM:50,severeM:100});
  const trusted=qa.accepted;
  console.log('R234AnchorQuality',JSON.stringify({measuredCount:measured.length,acceptedCount:qa.accepted.length,verifyCount:qa.verify.length,rejectedCount:qa.rejected.length,rejected:qa.rejected.map(x=>({kp:x.kp,centerlineOffsetM:+x.centerlineOffsetM.toFixed(2),sameKpNetworkDistanceM:Number.isFinite(x.sameKpNetworkDistanceM)?+x.sameKpNetworkDistanceM.toFixed(2):null,neighborResidualM:Number.isFinite(x.neighborResidualM)?+x.neighborResidualM.toFixed(2):null,reasons:x.reasons})),verify:qa.verify.map(x=>({kp:x.kp,centerlineOffsetM:+x.centerlineOffsetM.toFixed(2),sameKpNetworkDistanceM:Number.isFinite(x.sameKpNetworkDistanceM)?+x.sameKpNetworkDistanceM.toFixed(2):null,neighborResidualM:Number.isFinite(x.neighborResidualM)?+x.neighborResidualM.toFixed(2):null,reasons:x.reasons}))},null,2));
  assert.ok(trusted.length>=10,'not enough trusted R234 references after quality gate');

  // Leave-one-out uses only references that independently passed the quality gate.
  const loo=[];
  for(let i=1;i<trusted.length-1;i++){
    const hold=trusted[i],cal=trusted.filter((_,j)=>j!==i),result=evaluate(polyline,cal,[hold],`loo-${hold.kp}`);
    if(result.rows.length)loo.push(result.rows[0]);
  }
  const looResult={label:'leave-one-out trusted measured KP',stats:stats(loo),rows:loo};

  const sparsePreferred=[3,10,20,40,50],sparse=chooseTrusted(trusted,sparsePreferred);
  assert.strictEqual(sparse.length,sparsePreferred.length,'one or more sparse preferred anchors failed quality gate');
  const sparseHold=trusted.filter(x=>x.kp>sparse[0].kp&&x.kp<sparse[sparse.length-1].kp&&!sparsePreferred.includes(x.kp));
  const sparseResult=evaluate(polyline,sparse,sparseHold,'trusted sparse anchors 3/10/20/40/50');

  const threePreferred=[3,20,50],three=chooseTrusted(trusted,threePreferred);
  assert.strictEqual(three.length,threePreferred.length,'one or more three-anchor references failed quality gate');
  const threeHold=trusted.filter(x=>x.kp>three[0].kp&&x.kp<three[three.length-1].kp&&!threePreferred.includes(x.kp));
  const threeResult=evaluate(polyline,three,threeHold,'trusted three anchors 3/20/50');

  const output={measuredCount:measured.length,trustedCount:trusted.length,verifyCount:qa.verify.length,rejectedCount:qa.rejected.length,trustedRange:[trusted[0].kp,trusted[trusted.length-1].kp],leaveOneOut:looResult,sparse:sparseResult,threeAnchor:threeResult};
  console.log('R234TrustedCalibrationAudit',JSON.stringify(output,null,2));

  // Still fail closed. Filtering source anomalies is not permission to loosen the calibration gate.
  assert.ok(looResult.stats.maxAbsM!==null&&looResult.stats.maxAbsM<100,'trusted leave-one-out KP error exceeds 100m');
  assert.ok(sparseResult.stats.maxAbsM!==null&&sparseResult.stats.maxAbsM<100,'trusted sparse KP error exceeds 100m');
  assert.ok(threeResult.stats.maxAbsM!==null&&threeResult.stats.maxAbsM<150,'trusted three-anchor KP error exceeds 150m');
  console.log('R234 trusted calibration pilot passed engineering sanity gates');
})().catch(e=>{console.error(e);process.exit(1);});
