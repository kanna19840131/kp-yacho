'use strict';
const fs=require('fs');
const engine=require('./route-engine.js');
const BASE='https://www.road-refpoint.go.jp/kijunten/';

function loadByRoute(){
  const html=fs.readFileSync('./index.html','utf8'),marker='const byRoute = ',start=html.indexOf(marker),end=html.indexOf(';\n\nlet items=',start);
  if(start<0||end<0)throw new Error('byRoute not found');
  return JSON.parse(html.slice(start+marker.length,end));
}
function parseCsvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function dms(d,m,s){const sign=Number(d)<0?-1:1;return sign*(Math.abs(Number(d))+Number(m)/60+Number(s)/3600);}
async function fetchCsv(route,start,end){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${route}&hm2_a=${start.toFixed(1)}&hm3_a=${end.toFixed(1)}`;
  let res=await fetch(BASE+`precsv.php?${q}`,{headers:{'user-agent':'kp-yacho-route-pilot/0.9','referer':BASE}});await res.arrayBuffer();if(!res.ok)throw new Error(`precsv ${res.status}`);
  res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-route-pilot/0.9','referer':BASE}});if(!res.ok)throw new Error(`csv ${res.status}`);
  const text=new TextDecoder('shift_jis').decode(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const rows=text.split(/\r?\n/).filter(Boolean).map(parseCsvLine).slice(1);
  return rows.map(r=>({office:r[1],gks:r[4],branch:r[5],kp:Number(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12])})).filter(r=>Number.isFinite(r.kp));
}
function stats(vals){if(!vals.length)return{count:0};const sorted=vals.slice().sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];return{count:vals.length,mean:+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3),median:+q(.5).toFixed(3),p95:+q(.95).toFixed(3),max:+Math.max(...vals).toFixed(3)};}

(async()=>{
  const byRoute=loadByRoute();
  for(const t of [{key:'国道230号',short:'R230',route:'0230',start:0,end:10},{key:'国道453号',short:'R453',route:'0453',start:0,end:10}]){
    const official=await fetchCsv(t.route,t.start,t.end),legacy=byRoute[t.key],cfg={id:t.short,label:t.key,shortName:t.short,points:legacy};
    const grouped=new Map();for(const p of official){const k=p.kp.toFixed(1);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(p);}
    const rows=[];
    for(const [kp,list] of grouped){
      const actual=Number(kp),cands=list.map(p=>{const r=engine.nearestOnRoute(p.lat,p.lon,cfg);return{p,r,kpErrorM:Math.abs(r.kp-actual)*1000,routeOffsetM:r.distM};}).sort((a,b)=>a.kpErrorM-b.kpErrorM||a.routeOffsetM-b.routeOffsetM);
      const b=cands[0];rows.push({kp:actual,kpErrorM:b.kpErrorM,routeOffsetM:b.routeOffsetM,predictedKp:b.r.kp,candidateCount:list.length});
    }
    rows.sort((a,b)=>a.kp-b.kp);
    const kpStats=stats(rows.map(r=>r.kpErrorM)),offsetStats=stats(rows.map(r=>r.routeOffsetM));
    const worst=rows.slice().sort((a,b)=>b.kpErrorM-a.kpErrorM).slice(0,10).map(r=>({kp:r.kp,kpErrorM:+r.kpErrorM.toFixed(2),routeOffsetM:+r.routeOffsetM.toFixed(2),predictedKp:+r.predictedKp.toFixed(4),candidateCount:r.candidateCount}));
    console.log(JSON.stringify({route:t.key,officialUniqueKp:rows.length,kpStationAlignmentErrorM:kpStats,officialPointLateralOffsetToLegacyRouteM:offsetStats,worst},null,2));
  }
})().catch(e=>{console.error(e);process.exit(1);});
