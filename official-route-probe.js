'use strict';

const seed={lat:43.01305227777778,lon:140.66583036111112,kp:200};
const z=14;
function tileXY(lat,lon,z){
  const n=2**z;
  const x=Math.floor((lon+180)/360*n);
  const latRad=lat*Math.PI/180;
  const y=Math.floor((1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n);
  return{x,y};
}
function kpNumber(v){
  const m=String(v??'').match(/-?\d+(?:\.\d+)?/);
  return m?Number(m[0]):NaN;
}
function distanceM(a,b){
  const R=6371000,p=Math.PI/180;
  const p1=a.lat*p,p2=b.lat*p,dp=(b.lat-a.lat)*p,dl=(b.lon-a.lon)*p;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
async function main(){
  const t=tileXY(seed.lat,seed.lon,z);
  const features=[];
  for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
    const x=t.x+dx,y=t.y+dy;
    const url=`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${z}/${x}/${y}.geojson`;
    const res=await fetch(url,{headers:{'user-agent':'kp-yacho-route-pilot/0.1'}});
    if(!res.ok){console.log('tile skip',res.status,url);continue;}
    const json=await res.json();
    for(const f of json.features||[])features.push(f);
  }
  const rows=[];
  const seen=new Set();
  for(const f of features){
    const p=f.properties||{};
    if(String(p.drcd)!=='0005')continue;
    const coord=f.geometry?.coordinates||[];
    const lon=Number(p.keido??coord[0]),lat=Number(p.ido??coord[1]);
    const kp=kpNumber(p.pk);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(kp))continue;
    const key=[p.id,kp,lat,lon].join('|');if(seen.has(key))continue;seen.add(key);
    rows.push({kp,pk:p.pk,lat,lon,distSeedM:Math.round(distanceM(seed,{lat,lon})),gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno,id:p.id});
  }
  rows.sort((a,b)=>a.kp-b.kp||a.distSeedM-b.distSeedM);
  const near=rows.filter(r=>Math.abs(r.kp-seed.kp)<=8 || r.distSeedM<12000);
  console.log(JSON.stringify({tile:t,count:rows.length,near},null,2));
  if(!near.length)process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exit(1);});
