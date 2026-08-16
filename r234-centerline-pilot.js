'use strict';
const fs=require('fs');
const assert=require('assert');
const engine=require('./route-engine.js');

const FILE=process.argv[2]||'/tmp/n13-r234.geojson';
const BASE='https://www.road-refpoint.go.jp/kijunten/';
const ROUTE='0234';

function csvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function cp932(buf){for(const enc of ['shift_jis','windows-31j']){try{return new TextDecoder(enc).decode(buf);}catch(e){}}throw new Error('cp932 decode unsupported');}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function kp(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
async function probes(){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=0.0&hm3_a=100.0`;
  const res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-r234-centerline/0.1','referer':BASE}});
  if(!res.ok)throw new Error('R234 CSV HTTP '+res.status);
  const text=cp932(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const rows=text.split(/\r?\n/).filter(Boolean).map(csvLine).slice(1);
  const pts=rows.map(r=>({kp:kp(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12])})).filter(x=>Number.isFinite(x.kp));
  const by=new Map();for(const p of pts){const k=p.kp.toFixed(1);if(!by.has(k))by.set(k,[]);by.get(k).push(p);}
  const unique=[...by.values()].map(v=>v[0]).sort((a,b)=>a.kp-b.kp);
  const out=[];for(let k=0;k<=65;k+=5){const v=by.get(k.toFixed(1));if(v?.length===1)out.push(v[0]);}
  out.push(unique[unique.length-1]);return out;
}
function lines(g){if(!g)return[];if(g.type==='LineString')return[g.coordinates||[]];if(g.type==='MultiLineString')return g.coordinates||[];return[];}
function hav(a,b){return engine.haversineM({lat:a[1],lon:a[0]},{lat:b[1],lon:b[0]});}
function length(line){let s=0;for(let i=1;i<line.length;i++)s+=hav(line[i-1],line[i]);return s;}
function xy(lat,lon,lat0){const R=6371000,p=Math.PI/180;return{x:R*lon*p*Math.cos(lat0*p),y:R*lat*p};}
function pointLine(p,line){const P=xy(p.lat,p.lon,p.lat);let best=Infinity;for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1],A=xy(a[1],a[0],p.lat),B=xy(b[1],b[0],p.lat),vx=B.x-A.x,vy=B.y-A.y,wx=P.x-A.x,wy=P.y-A.y,l2=vx*vx+vy*vy;let t=l2?(wx*vx+wy*vy)/l2:0;t=Math.max(0,Math.min(1,t));best=Math.min(best,Math.hypot(P.x-(A.x+t*vx),P.y-(A.y+t*vy)));}return best;}
function nearest(p,items){let best=null;for(const it of items){const d=pointLine(p,it.line);if(!best||d<best.d)best={it,d};}return best;}
function key(c){return `${Math.round(c[0]*1e5)},${Math.round(c[1]*1e5)}`;}
function around(c){const x=Math.round(c[0]*1e5),y=Math.round(c[1]*1e5),o=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)o.push(`${x+dx},${y+dy}`);return o;}

(async()=>{
  const P=await probes();assert.ok(P.length>=10,'not enough R234 probes');
  const geo=JSON.parse(fs.readFileSync(FILE,'utf8')),items=[];
  for(const f of geo.features||[]){const pr=f.properties||{};if(String(pr.N13_003)!=='1'||String(pr.N13_002)!=='1'||String(pr.N13_004)==='5')continue;for(const line of lines(f.geometry)){if(line.length<2)continue;items.push({id:items.length,line,a:line[0],b:line[line.length-1],len:length(line),props:pr});}}
  assert.ok(items.length,'no N13 national-road centerlines');
  const start=nearest(P[0],items),goal=nearest(P[P.length-1],items);assert.ok(start&&goal,'R234 endpoint features missing');
  console.log('endpointOffsets',JSON.stringify({startKp:P[0].kp,startM:+start.d.toFixed(2),goalKp:P[P.length-1].kp,goalM:+goal.d.toFixed(2)}));
  assert.ok(start.d<60&&goal.d<60,'N13 endpoint too far from R234 probes');
  const buckets=new Map();for(const it of items)for(const c of [it.a,it.b]){const k=key(c);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push({id:it.id,c});}
  const adj=items.map(()=>new Map());for(const it of items)for(const c of [it.a,it.b])for(const k of around(c))for(const h of buckets.get(k)||[]){if(h.id===it.id)continue;const gap=hav(c,h.c);if(gap<=2)adj[it.id].set(h.id,Math.min(adj[it.id].get(h.id)??Infinity,gap));}
  const N=items.length,dist=Array(N).fill(Infinity),prev=Array(N).fill(-1),done=Array(N).fill(false);dist[start.it.id]=0;
  for(let z=0;z<N;z++){let u=-1,b=Infinity;for(let i=0;i<N;i++)if(!done[i]&&dist[i]<b){u=i;b=dist[i];}if(u<0||u===goal.it.id)break;done[u]=true;for(const [v,g] of adj[u]){const nd=dist[u]+items[v].len+g;if(nd<dist[v]){dist[v]=nd;prev[v]=u;}}}
  assert.ok(Number.isFinite(dist[goal.it.id]),'no connected N13 path for R234');
  const path=[];for(let u=goal.it.id;u>=0;u=prev[u]){path.push(u);if(u===start.it.id)break;}path.reverse();assert.strictEqual(path[0],start.it.id);
  const oriented=[];for(let i=0;i<path.length;i++){const it=items[path[i]],line=it.line;if(i===0){if(path.length===1){oriented.push(line);continue;}const n=items[path[1]],da=Math.min(hav(it.a,n.a),hav(it.a,n.b)),db=Math.min(hav(it.b,n.a),hav(it.b,n.b));oriented.push(db<=da?line:line.slice().reverse());}else{const e=oriented[i-1][oriented[i-1].length-1];oriented.push(hav(e,it.a)<=hav(e,it.b)?line:line.slice().reverse());}}
  const center=[];for(const line of oriented){if(!center.length){center.push(...line);continue;}const gap=hav(center[center.length-1],line[0]);if(gap>2)throw new Error('R234 N13 chain gap >2m');if(gap>0.01)center.push(line[0]);center.push(...line.slice(1));}
  const offsets=P.map(p=>({kp:p.kp,offsetM:+pointLine(p,center).toFixed(2)})),max=Math.max(...offsets.map(x=>x.offsetM));
  console.log('R234CenterlineAudit',JSON.stringify({probeCount:P.length,nationalSegments:items.length,pathSegments:path.length,coordinates:center.length,lengthKm:+(length(center)/1000).toFixed(2),maxProbeOffsetM:max,offsets},null,2));
  assert.ok(max<60,'R234 N13 path leaves official probe corridor');
  fs.writeFileSync('/tmp/r234-centerline.geojson',JSON.stringify({type:'Feature',properties:{route:'R234',source:'N13-2024'},geometry:{type:'LineString',coordinates:center}}));
  console.log('R234 N13 centerline pilot passed');
})().catch(e=>{console.error(e);process.exit(1);});
