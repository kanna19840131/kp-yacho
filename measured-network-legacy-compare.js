'use strict';
const fs=require('fs');
const engine=require('./route-engine.js');
const BASE='https://www.road-refpoint.go.jp/kijunten/';
const Z=14;

function loadByRoute(){
  const html=fs.readFileSync('./index.html','utf8'),marker='const byRoute = ',start=html.indexOf(marker),end=html.indexOf(';\n\nlet items=',start);
  if(start<0||end<0)throw new Error('byRoute not found');
  return JSON.parse(html.slice(start+marker.length,end));
}
function parseCsvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function tileXY(lat,lon,z){const n=2**z,x=Math.floor((lon+180)/360*n),latRad=lat*Math.PI/180;return{x,y:Math.floor((1-Math.asinh(Math.tan(latRad))/Math.PI)/2*n)};}
function kpNumber(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function updateNo(v){const s=String(v??'');if(s.includes('初回'))return 0;const m=s.match(/\d+/);return m?Number(m[0]):-1;}
function dateRank(v){const t=Date.parse(String(v??''));return Number.isFinite(t)?t:-1;}
function newestFirst(a,b){const u=updateNo(b.updateno_str)-updateNo(a.updateno_str);if(u)return u;return dateRank(b.fdate_str)-dateRank(a.fdate_str);}
function hav(a,b){const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lon-a.lon)*Math.PI/180,s=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
function stats(vals){if(!vals.length)return{count:0};const s=vals.slice().sort((a,b)=>a-b),q=p=>s[Math.min(s.length-1,Math.floor((s.length-1)*p))];return{count:vals.length,mean:+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(3),median:+q(.5).toFixed(3),p95:+q(.95).toFixed(3),max:+Math.max(...vals).toFixed(3)};}
async function fetchNetwork(route,start,end){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${route}&hm2_a=${start.toFixed(1)}&hm3_a=${end.toFixed(1)}`;
  let r=await fetch(BASE+`precsv.php?${q}`,{headers:{'user-agent':'kp-yacho-measured-compare/0.1','referer':BASE}});await r.arrayBuffer();if(!r.ok)throw new Error(`precsv ${r.status}`);
  r=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-measured-compare/0.1','referer':BASE}});if(!r.ok)throw new Error(`csv ${r.status}`);
  const text=new TextDecoder('shift_jis').decode(Buffer.from(await r.arrayBuffer())).replace(/^\uFEFF/,'');
  return text.split(/\r?\n/).filter(Boolean).map(parseCsvLine).slice(1).map(x=>({kp:Number(x[6]),lat:dms(x[7],x[8],x[9]),lon:dms(x[10],x[11],x[12])})).filter(x=>Number.isFinite(x.kp));
}
async function fetchTile(x,y){
  const u=`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${x}/${y}.geojson`;
  const r=await fetch(u,{headers:{'user-agent':'kp-yacho-measured-compare/0.1'}});if(!r.ok)return[];return (await r.json()).features||[];
}
async function measuredAround(route,networkRows){
  const tileKeys=new Set();
  for(const p of networkRows){
    if(Math.abs(p.kp-Math.round(p.kp))>1e-9)continue;
    const t=tileXY(p.lat,p.lon,Z);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)tileKeys.add(`${t.x+dx},${t.y+dy}`);
  }
  const features=[];for(const k of tileKeys){const [x,y]=k.split(',').map(Number);features.push(...await fetchTile(x,y));}
  const rows=[];
  for(const f of features){const p=f.properties||{};if(String(p.drcd)!==route)continue;const c=f.geometry?.coordinates||[],kp=kpNumber(p.pk),lat=Number(p.ido??c[1]),lon=Number(p.keido??c[0]);if(!Number.isFinite(kp)||!Number.isInteger(kp)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;rows.push({kp,lat,lon,id:p.id,updateno_str:p.updateno_str,fdate_str:p.fdate_str});}
  const by=new Map();for(const r of rows){if(!by.has(r.kp))by.set(r.kp,[]);by.get(r.kp).push(r);}return [...by.values()].map(v=>v.sort(newestFirst)[0]).sort((a,b)=>a.kp-b.kp);
}

(async()=>{
  const byRoute=loadByRoute();
  for(const t of [{key:'国道230号',short:'R230',route:'0230',start:0,end:10},{key:'国道453号',short:'R453',route:'0453',start:0,end:10}]){
    const network=await fetchNetwork(t.route,t.start,t.end),measured=await measuredAround(t.route,network),legacy={id:t.short,label:t.key,shortName:t.short,points:byRoute[t.key]};
    const rows=[];
    for(const m of measured.filter(x=>x.kp>=t.start&&x.kp<=t.end)){
      const nc=network.filter(x=>Math.abs(x.kp-m.kp)<1e-9).map(n=>({n,d:hav(m,n)})).sort((a,b)=>a.d-b.d);
      const lr=engine.nearestOnRoute(m.lat,m.lon,legacy);
      rows.push({kp:m.kp,revision:m.updateno_str,date:m.fdate_str,networkCandidateCount:nc.length,measuredToNearestNetworkM:nc.length?+nc[0].d.toFixed(2):null,legacyPredictedKp:lr?+lr.kp.toFixed(5):null,legacyKpErrorM:lr?+Math.abs(lr.kp-m.kp)*1000.toFixed?.(2):null,legacyRouteOffsetM:lr?+lr.distM.toFixed(2):null});
    }
    // fix numeric formatting independently of optional chaining arithmetic quirks
    for(const r of rows){if(r.legacyPredictedKp!==null)r.legacyKpErrorM=+Math.abs(r.legacyPredictedKp-r.kp)*1000; if(r.legacyKpErrorM!==null)r.legacyKpErrorM=+r.legacyKpErrorM.toFixed(2);}
    console.log(JSON.stringify({route:t.key,measuredCount:rows.length,rows,measuredToNetworkM:stats(rows.map(r=>r.measuredToNearestNetworkM).filter(Number.isFinite)),measuredPointLegacyKpErrorM:stats(rows.map(r=>r.legacyKpErrorM).filter(Number.isFinite)),measuredPointLegacyLateralOffsetM:stats(rows.map(r=>r.legacyRouteOffsetM).filter(Number.isFinite))},null,2));
  }
})().catch(e=>{console.error(e);process.exit(1);});
