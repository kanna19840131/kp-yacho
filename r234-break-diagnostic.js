'use strict';
const fs=require('fs');
const engine=require('./route-engine.js');

const CENTERLINE=process.argv[2]||'/tmp/r234-centerline.geojson';
const BASE='https://www.road-refpoint.go.jp/kijunten/';
const ROUTE='0234';
const Z=14;

function csvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function cp932(buf){for(const enc of ['shift_jis','windows-31j']){try{return new TextDecoder(enc).decode(buf);}catch(e){}}throw new Error('cp932 unsupported');}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function kpNumber(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function tileXY(lat,lon,z=Z){const n=2**z,x=Math.floor((lon+180)/360*n),r=lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n);return{x,y};}
function revisionRank(row){const update=Number(String(row.updateno_str??'').replace(/[^0-9.-]/g,'')),date=Date.parse(String(row.fdate_str??''));return[Number.isFinite(update)?update:-1,Number.isFinite(date)?date:-1];}
function compareRevision(a,b){const ar=revisionRank(a),br=revisionRank(b);if(ar[0]!==br[0])return br[0]-ar[0];return br[1]-ar[1];}

async function networkSeeds(){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=0.0&hm3_a=100.0`;
  const res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-r234-break-diagnostic/0.1','referer':BASE}});
  if(!res.ok)throw new Error('R234 CSV HTTP '+res.status);
  const text=cp932(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const rows=text.split(/\r?\n/).filter(Boolean).map(csvLine).slice(1);
  const pts=rows.map(r=>({kp:kpNumber(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12])})).filter(x=>Number.isFinite(x.kp));
  const by=new Map();for(const p of pts){const k=p.kp.toFixed(1);if(!by.has(k))by.set(k,[]);by.get(k).push(p);}
  const seeds=[];for(let k=0;k<=65;k+=5){const v=by.get(k.toFixed(1));if(v?.length)seeds.push(v[0]);}return seeds;
}
async function allMeasured(){
  const seeds=await networkSeeds(),urls=new Set();
  for(const s of seeds){const t=tileXY(s.lat,s.lon);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)urls.add(`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${t.x+dx}/${t.y+dy}.geojson`);}
  const rows=[];
  for(const url of urls){const res=await fetch(url,{headers:{'user-agent':'kp-yacho-r234-break-diagnostic/0.1'}});if(!res.ok)continue;const json=await res.json();for(const f of json.features||[]){const p=f.properties||{};if(String(p.drcd)!==ROUTE)continue;const c=f.geometry?.coordinates||[],lon=Number(p.keido??c[0]),lat=Number(p.ido??c[1]),kp=kpNumber(p.pk);if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(kp))continue;rows.push({kp,lat,lon,id:p.id,pk:p.pk,gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno,tncdn:p.tncdn,riyuucdn:p.riyuucdn,td_str:p.td_str,updateno_str:p.updateno_str,fdate_str:p.fdate_str});}}
  return rows;
}

(async()=>{
  const geo=JSON.parse(fs.readFileSync(CENTERLINE,'utf8')),coords=geo.geometry?.coordinates||geo.coordinates||[],polyline=coords.map(c=>({lat:Number(c[1]),lon:Number(c[0])}));
  const all=await allMeasured(),by=new Map();for(const r of all){if(!by.has(r.kp))by.set(r.kp,[]);by.get(r.kp).push(r);}
  const rows=[];
  for(const [kp,list] of [...by.entries()].sort((a,b)=>a[0]-b[0])){
    if(kp<13.5||kp>18.5)continue;
    const candidates=list.map(r=>{const p=engine.projectPointToPolyline(r.lat,r.lon,polyline);return{...r,alongM:p?+p.alongM.toFixed(2):null,offsetM:p?+p.distM.toFixed(2):null};}).sort(compareRevision);
    rows.push({kp,candidateCount:candidates.length,selected:candidates[0],candidates});
  }
  const selected=rows.map(x=>x.selected).filter(Boolean).sort((a,b)=>a.kp-b.kp);
  const deltas=[];
  for(let i=1;i<selected.length;i++){
    const a=selected[i-1],b=selected[i],dkpM=(b.kp-a.kp)*1000,dalong=b.alongM-a.alongM;
    deltas.push({fromKp:a.kp,toKp:b.kp,kpDeltaM:+dkpM.toFixed(2),alongDeltaM:+dalong.toFixed(2),differenceM:+(dalong-dkpM).toFixed(2),ratio:dkpM?+(dalong/dkpM).toFixed(3):null,flag:dalong<=0||Math.abs(dalong-dkpM)>100});
  }
  console.log('R234BreakDiagnostic',JSON.stringify({range:[13.5,18.5],rows,deltas,flagged:deltas.filter(x=>x.flag)},null,2));
  if(!deltas.some(x=>x.flag))console.log('No >100m or reverse stationing jump found in selected measured points');
})().catch(e=>{console.error(e);process.exit(1);});
