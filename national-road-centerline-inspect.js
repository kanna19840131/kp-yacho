'use strict';
const fs=require('fs');

const FILE=process.argv[2]||'/tmp/n13.geojson';
const probes=[
  {kp:197,lat:42.98853339,lon:140.65963797},
  {kp:198,lat:42.99576928,lon:140.66675364},
  {kp:199,lat:43.00411278,lon:140.66737844},
  {kp:200,lat:43.01305228,lon:140.66583036},
  {kp:201,lat:43.02171683,lon:140.66879603},
  {kp:202,lat:43.02920928,lon:140.67402292},
  {kp:203,lat:43.03750914,lon:140.67865517}
];

function xy(lat,lon,lat0){const R=6371000,p=Math.PI/180;return{x:R*lon*p*Math.cos(lat0*p),y:R*lat*p};}
function pointSegDistM(p,a,b){
  const P=xy(p.lat,p.lon,p.lat),A=xy(a[1],a[0],p.lat),B=xy(b[1],b[0],p.lat);
  const vx=B.x-A.x,vy=B.y-A.y,wx=P.x-A.x,wy=P.y-A.y,len2=vx*vx+vy*vy;
  if(!(len2>0))return Math.hypot(P.x-A.x,P.y-A.y);
  let t=(wx*vx+wy*vy)/len2;t=Math.max(0,Math.min(1,t));
  return Math.hypot(P.x-(A.x+t*vx),P.y-(A.y+t*vy));
}
function linesOf(g){
  if(!g)return[];
  if(g.type==='LineString')return[g.coordinates||[]];
  if(g.type==='MultiLineString')return g.coordinates||[];
  return[];
}
function featureDistance(p,f){
  let best=Infinity,seg=null;
  for(const line of linesOf(f.geometry))for(let i=0;i<line.length-1;i++){
    const d=pointSegDistM(p,line[i],line[i+1]);
    if(d<best){best=d;seg={a:line[i],b:line[i+1],index:i};}
  }
  return{distanceM:best,seg};
}
function coordCount(f){return linesOf(f.geometry).reduce((n,l)=>n+l.length,0);}

const data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const features=(data.features||[]).filter(f=>linesOf(f.geometry).length);
console.log('featureCount',features.length);
console.log('propertyKeys',Object.keys(features[0]?.properties||{}));

for(const probe of probes){
  const ranked=[];
  features.forEach((f,index)=>{
    const x=featureDistance(probe,f);
    if(x.distanceM<150)ranked.push({index,distanceM:x.distanceM,properties:f.properties||{},coordCount:coordCount(f),geometryType:f.geometry.type,nearSegment:x.seg});
  });
  ranked.sort((a,b)=>a.distanceM-b.distanceM);
  console.log(`\n=== KP${probe.kp} nearest road features (<=150m) ===`);
  console.log(JSON.stringify(ranked.slice(0,12).map(r=>({...r,distanceM:Number(r.distanceM.toFixed(2))})),null,2));
}

const candidateHitCount=new Map();
for(const probe of probes){
  features.forEach((f,index)=>{
    const d=featureDistance(probe,f).distanceM;
    if(d<=40)candidateHitCount.set(index,(candidateHitCount.get(index)||0)+1);
  });
}
const multi=[...candidateHitCount.entries()].filter(([,hits])=>hits>=2).sort((a,b)=>b[1]-a[1]);
console.log('\n=== features within 40m of >=2 KP probes ===');
console.log(JSON.stringify(multi.slice(0,30).map(([index,hits])=>({index,hits,properties:features[index].properties||{},coordCount:coordCount(features[index]),geometryType:features[index].geometry.type})),null,2));
