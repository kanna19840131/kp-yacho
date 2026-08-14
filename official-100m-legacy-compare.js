'use strict';
const fs=require('fs');
const engine=require('./route-engine.js');
const BASE='https://www.road-refpoint.go.jp/kijunten/';

function loadByRoute(){
  const html=fs.readFileSync('./index.html','utf8'),marker='const byRoute = ',start=html.indexOf(marker),end=html.indexOf(';\n\nlet items=',start);
  if(start<0||end<0)throw new Error('byRoute not found');
  return JSON.parse(html.slice(start+marker.length,end));
}
async function fetchRange(route,start,end){
  const rel=`areapoints.php?mode=3&rosen=${route}&jimu1=&jimu2=&hm2_a=${start.toFixed(1)}&hm3_a=${end.toFixed(1)}`;
  const res=await fetch(BASE+rel,{headers:{'user-agent':'kp-yacho-route-pilot/0.6','referer':BASE}}),text=await res.text();
  if(!res.ok)throw new Error(`${route} HTTP ${res.status}`);
  const json=JSON.parse(text);if(json.errmsg)throw new Error(`${route}: ${json.errmsg}`);
  return (json.result||[]).map((p,i)=>({kp:+(start+i/10).toFixed(1),lat:Number(p.lat),lon:Number(p.lon)}));
}
function stats(vals){return{count:vals.length,mean:+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(4),max:+Math.max(...vals).toFixed(4)};}
(async()=>{
  const byRoute=loadByRoute();
  const tests=[
    {key:'国道230号',route:'0230',start:0,end:10},
    {key:'国道453号',route:'0453',start:0,end:10}
  ];
  for(const t of tests){
    const official=await fetchRange(t.route,t.start,t.end),legacy=byRoute[t.key]||[];
    const map=new Map(legacy.map(p=>[Number(p.kp).toFixed(1),p])),rows=[];
    for(const p of official){
      const q=map.get(p.kp.toFixed(1));if(!q)continue;
      rows.push({kp:p.kp,offsetM:engine.haversineM(p,q),official:{lat:p.lat,lon:p.lon},legacy:{lat:q.lat,lon:q.lon}});
    }
    if(!rows.length)throw new Error(`${t.key}: no overlapping KPs`);
    const offsets=rows.map(r=>r.offsetM),s=stats(offsets),worst=rows.slice().sort((a,b)=>b.offsetM-a.offsetM).slice(0,5);
    console.log(JSON.stringify({route:t.key,officialCount:official.length,legacyCountInRange:legacy.filter(p=>p.kp>=t.start&&p.kp<=t.end).length,compared:rows.length,offsetM:s,worst:worst.map(r=>({kp:r.kp,offsetM:+r.offsetM.toFixed(3)}))},null,2));
  }
})().catch(e=>{console.error(e);process.exit(1);});
