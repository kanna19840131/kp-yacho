'use strict';
const assert=require('assert');
const engine=require('./route-engine.js');
const loader=require('./kml-route-loader.js');

const ROUTE_NO='0005';
const SEED={lat:43.01305227777778,lon:140.66583036111112};
const Z=14;

function tileXY(lat,lon,z){
  const n=2**z,x=Math.floor((lon+180)/360*n),latRad=lat*Math.PI/180;
  return{x,y:Math.floor((1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n)};
}
function kpNumber(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function updateNo(v){const s=String(v??'');if(s.includes('初回'))return 0;const m=s.match(/\d+/);return m?Number(m[0]):-1;}
function dateRank(v){const t=Date.parse(String(v??''));return Number.isFinite(t)?t:-1;}
function newestFirst(a,b){const u=updateNo(b.updateno_str)-updateNo(a.updateno_str);if(u)return u;return dateRank(b.fdate_str)-dateRank(a.fdate_str);}

async function fetchOfficialPoints(){
  const tile=tileXY(SEED.lat,SEED.lon,Z),features=[];
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
    const url=`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${tile.x+dx}/${tile.y+dy}.geojson`;
    const res=await fetch(url,{headers:{'user-agent':'kp-yacho-route-pilot/0.3'}});
    if(!res.ok)continue;
    const json=await res.json();features.push(...(json.features||[]));
  }
  const rows=[];
  for(const f of features){
    const p=f.properties||{};if(String(p.drcd)!==ROUTE_NO)continue;
    const c=f.geometry?.coordinates||[],lat=Number(p.ido??c[1]),lon=Number(p.keido??c[0]),kp=kpNumber(p.pk);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(kp))continue;
    rows.push({kp,lat,lon,id:p.id,updateno_str:p.updateno_str,fdate_str:p.fdate_str,tncdn:p.tncdn,gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno});
  }
  const byKp=new Map();
  for(const row of rows){if(!byKp.has(row.kp))byKp.set(row.kp,[]);byKp.get(row.kp).push(row);}
  return [...byKp.values()].map(list=>list.sort(newestFirst)[0]).sort((a,b)=>a.kp-b.kp);
}
function toKml(points){
  const coordinates=points.map(p=>`${p.lon},${p.lat},0`).join(' ');
  return `<?xml version="1.0"?><kml><Document><Placemark><name>Route 5 official-point proxy</name><LineString><coordinates>${coordinates}</coordinates></LineString></Placemark></Document></kml>`;
}
function build(points,anchors){
  return loader.buildRouteConfigFromKml(toKml(points),{id:'R5-PILOT',label:'国道5号 pilot',shortName:'R5P',anchors,maxAnchorDistanceM:5,source:{type:'official-reference-point-proxy'}});
}
function predict(route,p){const r=engine.nearestOnRoute(p.lat,p.lon,route);assert.ok(r,'prediction missing');return r;}
function stats(rows){
  const errs=rows.map(x=>x.errorM),sum=errs.reduce((a,b)=>a+b,0);
  return{count:errs.length,meanErrorM:sum/errs.length,maxErrorM:Math.max(...errs)};
}

(async()=>{
  const all=await fetchOfficialPoints();
  const points=all.filter(p=>p.kp>=197&&p.kp<=203);
  assert.deepStrictEqual(points.map(p=>p.kp),[197,198,199,200,201,202,203],'expected consecutive current R5 KP points');
  const p200=points.find(p=>p.kp===200);assert.strictEqual(updateNo(p200.updateno_str),1,'latest 200kp revision was not selected');

  const sparseAnchors=[points[0],points[points.length-1]].map(p=>({kp:p.kp,lat:p.lat,lon:p.lon}));
  const sparseRoute=build(points,sparseAnchors);
  const sparse=points.slice(1,-1).map(p=>{
    const r=predict(sparseRoute,p),errorM=Math.abs(r.kp-p.kp)*1000;
    return{actualKp:p.kp,predictedKp:Number(r.kp.toFixed(6)),errorM:Number(errorM.toFixed(2))};
  });

  const leaveOneOut=[];
  for(let i=1;i<points.length-1;i++){
    const target=points[i];
    const anchors=points.filter((_,j)=>j!==i).map(p=>({kp:p.kp,lat:p.lat,lon:p.lon}));
    const route=build(points,anchors),r=predict(route,target),errorM=Math.abs(r.kp-target.kp)*1000;
    leaveOneOut.push({actualKp:target.kp,predictedKp:Number(r.kp.toFixed(6)),errorM:Number(errorM.toFixed(2)),leftAnchorKp:points[i-1].kp,rightAnchorKp:points[i+1].kp});
  }

  const output={
    source:'MLIT road reference point GeoJSON vector tiles; geometry proxy connects selected 1km reference points',
    currentPoints:points.map(p=>({kp:p.kp,lat:p.lat,lon:p.lon,revision:p.updateno_str,date:p.fdate_str})),
    sparse197to203:{anchors:[197,203],rows:sparse,stats:stats(sparse)},
    leaveOneOut2km:{rows:leaveOneOut,stats:stats(leaveOneOut)},
    caveat:'This proves the official-data -> KML -> route-config -> KP engine pipeline. It does not prove field accuracy because the KML geometry here is only a polyline through 1km official reference points, not a high-resolution road centerline.'
  };
  console.log(JSON.stringify(output,null,2));
  assert.ok(output.leaveOneOut2km.stats.maxErrorM<250,'2km-anchor proxy error unexpectedly large');
  assert.ok(output.sparse197to203.stats.maxErrorM<500,'6km-anchor proxy error unexpectedly large');
})().catch(e=>{console.error(e);process.exit(1);});
