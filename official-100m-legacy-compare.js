'use strict';
const fs=require('fs');
const engine=require('./route-engine.js');
const BASE='https://www.road-refpoint.go.jp/kijunten/';

function loadByRoute(){
  const html=fs.readFileSync('./index.html','utf8'),marker='const byRoute = ',start=html.indexOf(marker),end=html.indexOf(';\n\nlet items=',start);
  if(start<0||end<0)throw new Error('byRoute not found');
  return JSON.parse(html.slice(start+marker.length,end));
}
function parseCsvLine(line){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}
    else if(c===','&&!q){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur);return out;
}
function dms(d,m,s){const sign=Number(d)<0?-1:1;return sign*(Math.abs(Number(d))+Number(m)/60+Number(s)/3600);}
async function fetchCsv(route,start,end){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${route}&hm2_a=${start.toFixed(1)}&hm3_a=${end.toFixed(1)}`;
  let res=await fetch(BASE+`precsv.php?${q}`,{headers:{'user-agent':'kp-yacho-route-pilot/0.8','referer':BASE}});if(!res.ok)throw new Error(`precsv ${route} ${res.status}`);await res.arrayBuffer();
  res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-route-pilot/0.8','referer':BASE}});if(!res.ok)throw new Error(`csv ${route} ${res.status}`);
  const buf=Buffer.from(await res.arrayBuffer()),text=new TextDecoder('shift_jis').decode(buf).replace(/^\uFEFF/,'');
  const rows=text.split(/\r?\n/).filter(Boolean).map(parseCsvLine),header=rows.shift();
  return{header,rows:rows.map(r=>({office:r[1],roadType:r[2],route:r[3],gks:r[4],branch:r[5],kp:Number(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12])})).filter(r=>Number.isFinite(r.kp)&&Number.isFinite(r.lat)&&Number.isFinite(r.lon))};
}
function stats(vals){return vals.length?{count:vals.length,mean:+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(4),max:+Math.max(...vals).toFixed(4),min:+Math.min(...vals).toFixed(4)}:{count:0};}
(async()=>{
  const byRoute=loadByRoute();
  const tests=[{key:'国道230号',route:'0230',start:0,end:10},{key:'国道453号',route:'0453',start:0,end:10}];
  for(const t of tests){
    const {rows:official}=await fetchCsv(t.route,t.start,t.end),legacy=(byRoute[t.key]||[]).filter(p=>p.kp>=t.start&&p.kp<=t.end);
    const candidates=new Map();
    for(const p of official){const k=p.kp.toFixed(1);if(!candidates.has(k))candidates.set(k,[]);candidates.get(k).push(p);}
    const compared=[],missing=[];
    for(const q of legacy){
      const list=candidates.get(Number(q.kp).toFixed(1))||[];
      if(!list.length){missing.push(q.kp);continue;}
      const ranked=list.map(p=>({p,offsetM:engine.haversineM(p,q)})).sort((a,b)=>a.offsetM-b.offsetM);
      compared.push({kp:q.kp,offsetM:ranked[0].offsetM,candidateCount:list.length,best:ranked[0].p,allOffsetsM:ranked.map(x=>+x.offsetM.toFixed(3))});
    }
    const duplicateKps=[...candidates.entries()].filter(([,v])=>v.length>1).map(([kp,v])=>({kp,count:v.length,coordinates:v.map(p=>({lat:p.lat,lon:p.lon}))}));
    const offsets=compared.map(r=>r.offsetM),s=stats(offsets),worst=compared.slice().sort((a,b)=>b.offsetM-a.offsetM).slice(0,10);
    console.log(JSON.stringify({route:t.key,officialRows:official.length,officialUniqueKp:candidates.size,legacyRows:legacy.length,compared:compared.length,missingLegacyKp:missing,duplicateKps,nearestCandidateOffsetM:s,worst:worst.map(r=>({kp:r.kp,offsetM:+r.offsetM.toFixed(3),candidateCount:r.candidateCount,allOffsetsM:r.allOffsetsM}))},null,2));
  }
})().catch(e=>{console.error(e);process.exit(1);});
