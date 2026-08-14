'use strict';
const fs=require('fs');
const assert=require('assert');
const engine=require('./route-engine.js');
const loader=require('./kml-route-loader.js');

const FILE=process.argv[2]||'/tmp/n13.geojson';
const PROBES=[
  {kp:197,lat:42.98853339,lon:140.65963797},
  {kp:198,lat:42.99576928,lon:140.66675364},
  {kp:199,lat:43.00411278,lon:140.66737844},
  {kp:200,lat:43.01305228,lon:140.66583036},
  {kp:201,lat:43.02171683,lon:140.66879603},
  {kp:202,lat:43.02920928,lon:140.67402292},
  {kp:203,lat:43.03750914,lon:140.67865517}
];

function hav(a,b){return engine.haversineM({lat:a[1],lon:a[0]},{lat:b[1],lon:b[0]});}
function lineLength(line){let s=0;for(let i=0;i<line.length-1;i++)s+=hav(line[i],line[i+1]);return s;}
function linesOf(g){if(!g)return[];if(g.type==='LineString')return[g.coordinates||[]];if(g.type==='MultiLineString')return g.coordinates||[];return[];}
function asSingleLine(f){const lines=linesOf(f.geometry);if(lines.length!==1)return null;return lines[0].length>=2?lines[0]:null;}
function xy(lat,lon,lat0){const R=6371000,p=Math.PI/180;return{x:R*lon*p*Math.cos(lat0*p),y:R*lat*p};}
function pointSeg(p,a,b){
  const P=xy(p.lat,p.lon,p.lat),A=xy(a[1],a[0],p.lat),B=xy(b[1],b[0],p.lat),vx=B.x-A.x,vy=B.y-A.y,wx=P.x-A.x,wy=P.y-A.y,len2=vx*vx+vy*vy;
  let t=len2>0?(wx*vx+wy*vy)/len2:0;t=Math.max(0,Math.min(1,t));
  const qx=A.x+t*vx,qy=A.y+t*vy;
  return{distanceM:Math.hypot(P.x-qx,P.y-qy),t};
}
function pointLineDistance(p,line){let best=Infinity;for(let i=0;i<line.length-1;i++)best=Math.min(best,pointSeg(p,line[i],line[i+1]).distanceM);return best;}
function endpointKey(c){return `${Math.round(c[0]*1e5)},${Math.round(c[1]*1e5)}`;}
function neighborKeys(c){const x=Math.round(c[0]*1e5),y=Math.round(c[1]*1e5),out=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)out.push(`${x+dx},${y+dy}`);return out;}
function endpointDistance(a,b){return hav(a,b);}
function nearestFeature(probe,items){let best=null;for(const item of items){const d=pointLineDistance(probe,item.line);if(!best||d<best.distanceM)best={item,distanceM:d};}return best;}
function reverseCopy(line){return line.slice().reverse();}

const geo=JSON.parse(fs.readFileSync(FILE,'utf8'));
const items=[];
for(let sourceIndex=0;sourceIndex<(geo.features||[]).length;sourceIndex++){
  const f=geo.features[sourceIndex],p=f.properties||{},line=asSingleLine(f);
  // 国道・通常の道路中心線。橋/トンネル等の道路状態は残し、建設中だけ除外。
  if(!line||String(p.N13_003)!=='1'||String(p.N13_002)!=='1'||String(p.N13_004)==='5')continue;
  items.push({id:items.length,sourceIndex,line,props:p,lengthM:lineLength(line),a:line[0],b:line[line.length-1]});
}
assert.ok(items.length,'no national-road centerlines');

const start=nearestFeature(PROBES[0],items),goal=nearestFeature(PROBES[PROBES.length-1],items);
assert.ok(start&&goal,'route endpoints not found');
console.log('start',JSON.stringify({sourceIndex:start.item.sourceIndex,distanceM:+start.distanceM.toFixed(2),props:start.item.props}));
console.log('goal',JSON.stringify({sourceIndex:goal.item.sourceIndex,distanceM:+goal.distanceM.toFixed(2),props:goal.item.props}));
assert.ok(start.distanceM<30&&goal.distanceM<30,'endpoint centerline too far from official KP');

// Endpoint graph. N13 is split at intersections/attribute boundaries; allow <=2m join tolerance.
const buckets=new Map();
for(const item of items){
  for(const [side,c] of [['a',item.a],['b',item.b]]){
    const k=endpointKey(c);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push({id:item.id,side,c});
  }
}
const adj=items.map(()=>new Map());
for(const item of items){
  for(const [side,c] of [['a',item.a],['b',item.b]]){
    for(const k of neighborKeys(c))for(const hit of buckets.get(k)||[]){
      if(hit.id===item.id)continue;
      const gap=endpointDistance(c,hit.c);if(gap>2)continue;
      const old=adj[item.id].get(hit.id);if(old===undefined||gap<old)adj[item.id].set(hit.id,gap);
    }
  }
}

// Dijkstra on road features. Cost = next feature length + tiny join gap.
const N=items.length,dist=new Float64Array(N);dist.fill(Infinity);const prev=new Int32Array(N);prev.fill(-1);const done=new Uint8Array(N);
dist[start.item.id]=0;
for(let iter=0;iter<N;iter++){
  let u=-1,best=Infinity;
  for(let i=0;i<N;i++)if(!done[i]&&dist[i]<best){best=dist[i];u=i;}
  if(u<0||u===goal.item.id)break;done[u]=1;
  for(const [v,gap] of adj[u]){
    const nd=dist[u]+items[v].lengthM+gap;
    if(nd<dist[v]){dist[v]=nd;prev[v]=u;}
  }
}
assert.ok(Number.isFinite(dist[goal.item.id]),'no connected national-road path between KP197 and KP203');
const path=[];for(let cur=goal.item.id;cur>=0;cur=prev[cur]){path.push(cur);if(cur===start.item.id)break;}path.reverse();
assert.strictEqual(path[0],start.item.id,'path did not reach start');
console.log('pathFeatures',path.map(id=>items[id].sourceIndex));
console.log('pathFeatureCount',path.length,'graphCostM',+dist[goal.item.id].toFixed(1));

// Orient and concatenate feature lines in graph path order.
const oriented=[];
for(let i=0;i<path.length;i++){
  const item=items[path[i]],line=item.line;
  if(path.length===1){oriented.push(line);continue;}
  if(i===0){
    const next=items[path[i+1]];const dA=Math.min(endpointDistance(item.a,next.a),endpointDistance(item.a,next.b)),dB=Math.min(endpointDistance(item.b,next.a),endpointDistance(item.b,next.b));
    oriented.push(dB<=dA?line:reverseCopy(line));
  }else{
    const prevEnd=oriented[i-1][oriented[i-1].length-1];
    oriented.push(endpointDistance(prevEnd,item.a)<=endpointDistance(prevEnd,item.b)?line:reverseCopy(line));
  }
}
const centerline=[];for(const line of oriented){if(!centerline.length){centerline.push(...line);continue;}const last=centerline[centerline.length-1];if(endpointDistance(last,line[0])>2)throw new Error('oriented chain gap >2m');if(endpointDistance(last,line[0])>0.01)centerline.push(line[0]);centerline.push(...line.slice(1));}
console.log('centerlineCoordinates',centerline.length,'centerlineLengthM',+lineLength(centerline).toFixed(1));

const offsets=PROBES.map(p=>({kp:p.kp,centerlineOffsetM:+pointLineDistance(p,centerline).toFixed(2)}));
console.log('officialPointToCenterline',JSON.stringify(offsets));

function kml(line){return `<?xml version="1.0"?><kml><Document><Placemark><name>R5 N13 centerline pilot</name><LineString><coordinates>${line.map(c=>`${c[0]},${c[1]},0`).join(' ')}</coordinates></LineString></Placemark></Document></kml>`;}
function makeRoute(anchorPoints){return loader.buildRouteConfigFromKml(kml(centerline),{id:'R5-N13',label:'国道5号 N13 pilot',shortName:'R5N13',anchors:anchorPoints.map(p=>({kp:p.kp,lat:p.lat,lon:p.lon})),maxAnchorDistanceM:50});}
function evaluate(route,targets){return targets.map(p=>{const r=engine.nearestOnRoute(p.lat,p.lon,route);return{actualKp:p.kp,predictedKp:+r.kp.toFixed(6),kpErrorM:+(Math.abs(r.kp-p.kp)*1000).toFixed(2),centerlineOffsetM:+r.distM.toFixed(2)};});}
function stats(rows){const vals=rows.map(r=>r.kpErrorM);return{count:vals.length,meanKpErrorM:+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2),maxKpErrorM:+Math.max(...vals).toFixed(2)};}

const sparseRoute=makeRoute([PROBES[0],PROBES[PROBES.length-1]]),sparseRows=evaluate(sparseRoute,PROBES.slice(1,-1));
const loo=[];
for(let i=1;i<PROBES.length-1;i++){
  const anchors=PROBES.filter((_,j)=>j!==i),route=makeRoute(anchors),row=evaluate(route,[PROBES[i]])[0];
  loo.push({...row,leftAnchorKp:PROBES[i-1].kp,rightAnchorKp:PROBES[i+1].kp});
}
console.log('sparse197to203',JSON.stringify({rows:sparseRows,stats:stats(sparseRows)},null,2));
console.log('leaveOneOut2km',JSON.stringify({rows:loo,stats:stats(loo)},null,2));

assert.ok(Math.max(...offsets.map(x=>x.centerlineOffsetM))<30,'N13 centerline farther than 30m from an official KP point');
assert.ok(stats(loo).maxKpErrorM<100,'centerline leave-one-out KP error >=100m');
console.log('N13 Route 5 centerline pilot passed');
