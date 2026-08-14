'use strict';
const fs=require('fs');
const assert=require('assert');
const e=require('./route-engine.js');

function loadByRoute(){
  const html=fs.readFileSync('./index.html','utf8');
  const marker='const byRoute = ';
  const start=html.indexOf(marker);
  assert.ok(start>=0,'byRoute start not found');
  const end=html.indexOf(';\n\nlet items=',start);
  assert.ok(end>start,'byRoute end not found');
  return JSON.parse(html.slice(start+marker.length,end));
}
function toXY(lat,lon,lat0){const R=6371000,rad=Math.PI/180;return{x:R*lon*rad*Math.cos(lat0*rad),y:R*lat*rad};}
function oldNearest(lat,lon,pts,route){
  if(!pts||pts.length<2)return null;
  const P=toXY(lat,lon,lat);let best=null;
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1];
    if(Math.abs(b.kp-a.kp)>0.11)continue;
    const A=toXY(a.lat,a.lon,lat),B=toXY(b.lat,b.lon,lat);
    const vx=B.x-A.x,vy=B.y-A.y,wx=P.x-A.x,wy=P.y-A.y,len2=vx*vx+vy*vy;
    if(len2===0)continue;
    let t=(wx*vx+wy*vy)/len2;t=Math.max(0,Math.min(1,t));
    const qx=A.x+t*vx,qy=A.y+t*vy,dx=P.x-qx,dy=P.y-qy,d=Math.hypot(dx,dy);
    const kp=a.kp+t*(b.kp-a.kp),addr=t<0.5?(a.addr||''):(b.addr||'');
    if(!best||d<best.dist)best={route,kp,dist:d,addr,a,b,t};
  }
  return best;
}
function config(key,short,pts){return{id:short,label:key,shortName:short,points:pts};}
function near(a,b,tol,msg){assert.ok(Math.abs(a-b)<=tol,`${msg}: old=${a} new=${b} diff=${Math.abs(a-b)}`);}

const byRoute=loadByRoute();
const defs=[['国道230号','R230'],['国道453号','R453']];
const configs=defs.map(([key,short])=>config(key,short,byRoute[key]));
let pointSamples=0,midSamples=0,autoSamples=0,maxKpDiff=0,maxDistDiff=0;

for(const [key,short] of defs){
  const pts=byRoute[key];
  assert.ok(Array.isArray(pts)&&pts.length>2,key+' data missing');
  const cfg=config(key,short,pts);
  const normalized=e.normalizeRoute(cfg);
  console.log(`${short}: points=${pts.length}, sections=${normalized.sections.length}`);

  for(let i=0;i<pts.length;i++){
    const p=pts[i],old=oldNearest(p.lat,p.lon,pts,key),neu=e.nearestOnRoute(p.lat,p.lon,cfg);
    assert.ok(old&&neu,`${short} point ${i}: result missing`);
    const kd=Math.abs(old.kp-neu.kp),dd=Math.abs(old.dist-neu.distM);maxKpDiff=Math.max(maxKpDiff,kd);maxDistDiff=Math.max(maxDistDiff,dd);
    near(old.kp,neu.kp,1e-6,`${short} point ${i} KP`);
    near(old.dist,neu.distM,0.05,`${short} point ${i} distance`);
    pointSamples++;
  }

  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1];
    if(Math.abs(b.kp-a.kp)>0.11)continue;
    if(e.haversineM(a,b)<0.5)continue;
    const lat=(a.lat+b.lat)/2,lon=(a.lon+b.lon)/2,old=oldNearest(lat,lon,pts,key),neu=e.nearestOnRoute(lat,lon,cfg);
    assert.ok(old&&neu,`${short} midpoint ${i}: result missing`);
    const kd=Math.abs(old.kp-neu.kp),dd=Math.abs(old.dist-neu.distM);maxKpDiff=Math.max(maxKpDiff,kd);maxDistDiff=Math.max(maxDistDiff,dd);
    near(old.kp,neu.kp,2e-6,`${short} midpoint ${i} KP`);
    near(old.dist,neu.distM,0.1,`${short} midpoint ${i} distance`);
    midSamples++;
  }
}

for(const [key] of defs){
  const pts=byRoute[key];
  for(let i=0;i<pts.length;i+=10){
    const p=pts[i];
    const olds=defs.map(([k])=>oldNearest(p.lat,p.lon,byRoute[k],k)).filter(Boolean).sort((a,b)=>a.dist-b.dist);
    if(olds.length<2||Math.abs(olds[0].dist-olds[1].dist)<0.5)continue;
    const neu=e.findNearestRoute(p.lat,p.lon,configs,'auto');
    assert.ok(neu,`auto ${key} ${i}: missing`);
    assert.strictEqual(neu.routeLabel,olds[0].route,`auto ${key} ${i}: route mismatch`);
    near(olds[0].kp,neu.kp,2e-6,`auto ${key} ${i} KP`);
    autoSamples++;
  }
}

const r230=byRoute['国道230号'];
const gap=r230.findIndex((p,i)=>i<r230.length-1&&Math.abs(r230[i+1].kp-p.kp)>0.11);
assert.ok(gap>=0,'R230 KP gap not found');
const ga=r230[gap],gb=r230[gap+1],glat=(ga.lat+gb.lat)/2,glon=(ga.lon+gb.lon)/2;
const gold=oldNearest(glat,glon,r230,'国道230号'),gnew=e.nearestOnRoute(glat,glon,config('国道230号','R230',r230));
near(gold.kp,gnew.kp,2e-6,'R230 gap behavior KP');
assert.ok(!(gnew.kp>ga.kp+0.05&&gnew.kp<gb.kp-0.05),`gap fabricated KP ${gnew.kp}`);

console.log(`route regression passed: points=${pointSamples}, midpoints=${midSamples}, auto=${autoSamples}`);
console.log(`max KP diff=${maxKpDiff}, max distance diff=${maxDistDiff}m`);
