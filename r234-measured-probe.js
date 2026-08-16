'use strict';

const BASE='https://www.road-refpoint.go.jp/kijunten/';
const ROUTE='0234';
const Z=14;

function parseCsvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function decodeCp932(buf){for(const label of ['shift_jis','windows-31j']){try{return new TextDecoder(label).decode(buf);}catch(e){}}throw new Error('cp932 decode unsupported');}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function kpNumber(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function tileXY(lat,lon,z=Z){const n=2**z,x=Math.floor((lon+180)/360*n),r=lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n);return{x,y};}
function distanceM(a,b){const R=6371000,p=Math.PI/180,p1=a.lat*p,p2=b.lat*p,dp=(b.lat-a.lat)*p,dl=(b.lon-a.lon)*p,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function revisionRank(row){const update=Number(String(row.updateno_str??'').replace(/[^0-9.-]/g,'')),date=Date.parse(String(row.fdate_str??''));return[Number.isFinite(update)?update:-1,Number.isFinite(date)?date:-1];}
function compareRevision(a,b){const ar=revisionRank(a),br=revisionRank(b);if(ar[0]!==br[0])return br[0]-ar[0];return br[1]-ar[1];}

async function networkRows(){
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=0.0&hm3_a=100.0`;
  const res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-r234-delivery-rehearsal/0.3','referer':BASE}});
  if(!res.ok)throw new Error('network CSV HTTP '+res.status);
  const text=decodeCp932(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const rows=text.split(/\r?\n/).filter(Boolean).map(parseCsvLine).slice(1);
  return rows.map(r=>({kp:kpNumber(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12]),office:r[1]})).filter(x=>Number.isFinite(x.kp));
}

(async()=>{
  const network=await networkRows();
  const seeds=[];
  for(let target=0;target<=65;target+=5){
    const list=network.filter(x=>Math.abs(x.kp-target)<0.001);
    if(list.length)seeds.push(list[0]);
  }
  console.log('seedCount',seeds.length,JSON.stringify(seeds));
  const urls=new Set();
  for(const s of seeds){const t=tileXY(s.lat,s.lon);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)urls.add(`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${t.x+dx}/${t.y+dy}.geojson`);}
  const features=[];
  for(const url of urls){
    const res=await fetch(url,{headers:{'user-agent':'kp-yacho-r234-delivery-rehearsal/0.3'}});
    if(!res.ok)continue;
    const json=await res.json();
    for(const f of json.features||[])features.push(f);
  }
  const measured=[];
  for(const f of features){
    const p=f.properties||{};if(String(p.drcd)!==ROUTE)continue;
    const coord=f.geometry?.coordinates||[],lon=Number(p.keido??coord[0]),lat=Number(p.ido??coord[1]),kp=kpNumber(p.pk);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(kp))continue;
    measured.push({kp,lat,lon,id:p.id,pk:p.pk,gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno,updateno_str:p.updateno_str,fdate_str:p.fdate_str,tncdn:p.tncdn,riyuucdn:p.riyuucdn,td_str:p.td_str});
  }
  const byKp=new Map();for(const r of measured){if(!byKp.has(r.kp))byKp.set(r.kp,[]);byKp.get(r.kp).push(r);}
  const selected=[...byKp.entries()].map(([kp,list])=>({kp,selected:list.slice().sort(compareRevision)[0],candidates:list.length})).sort((a,b)=>a.kp-b.kp);
  const comparisons=[];
  for(const row of selected){
    const candidates=network.filter(x=>Math.abs(x.kp-row.kp)<0.001);
    if(!candidates.length)continue;
    const best=candidates.map(x=>({x,d:distanceM(row.selected,x)})).sort((a,b)=>a.d-b.d)[0];
    comparisons.push({kp:row.kp,measured:{lat:row.selected.lat,lon:row.selected.lon},network:{lat:best.x.lat,lon:best.x.lon},distanceM:+best.d.toFixed(2),candidates:row.candidates});
  }
  const ds=comparisons.map(x=>x.distanceM);
  console.log('measuredAudit',JSON.stringify({tileRequests:urls.size,rawFeatures:features.length,rawR234:measured.length,uniqueMeasuredKp:selected.length,kpMin:selected.length?selected[0].kp:null,kpMax:selected.length?selected[selected.length-1].kp:null,selected,networkComparison:{count:comparisons.length,meanM:ds.length?+(ds.reduce((a,b)=>a+b,0)/ds.length).toFixed(2):null,maxM:ds.length?Math.max(...ds):null,rows:comparisons}},null,2));
  if(!selected.length)throw new Error('no R234 measured reference points found');
})().catch(e=>{console.error(e);process.exit(1);});
