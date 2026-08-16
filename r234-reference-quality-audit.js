'use strict';
const BASE='https://www.road-refpoint.go.jp/kijunten/';
const ROUTE='0234';
const Z=14;
function csvLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;}
function cp932(buf){for(const enc of ['shift_jis','windows-31j']){try{return new TextDecoder(enc).decode(buf);}catch(e){}}throw new Error('cp932 unsupported');}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function kpn(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function tileXY(lat,lon,z=Z){const n=2**z,x=Math.floor((lon+180)/360*n),r=lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n);return{x,y};}
function dist(a,b){const R=6371000,p=Math.PI/180,p1=a.lat*p,p2=b.lat*p,dp=(b.lat-a.lat)*p,dl=(b.lon-a.lon)*p,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
function revisionRank(r){const u=Number(String(r.updateno_str??'').replace(/[^0-9.-]/g,'')),d=Date.parse(String(r.fdate_str??''));return[Number.isFinite(u)?u:-1,Number.isFinite(d)?d:-1];}
function compareRevision(a,b){const ar=revisionRank(a),br=revisionRank(b);if(ar[0]!==br[0])return br[0]-ar[0];return br[1]-ar[1];}
function stats(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);const q=p=>a.length?a[Math.min(a.length-1,Math.floor((a.length-1)*p))]:null;return{count:a.length,mean:a.length?+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(2):null,p50:q(.5),p95:q(.95),p99:q(.99),max:a.length?a[a.length-1]:null};}
(async()=>{
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=0.0&hm3_a=100.0`;
  const res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-r234-quality-audit/0.1','referer':BASE}});if(!res.ok)throw new Error('CSV HTTP '+res.status);
  const text=cp932(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const network=text.split(/\r?\n/).filter(Boolean).map(csvLine).slice(1).map(r=>({kp:kpn(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12]),gks:r[4],aux:r[5]})).filter(x=>Number.isFinite(x.kp));
  const networkBy=new Map();for(const n of network){if(!networkBy.has(n.kp))networkBy.set(n.kp,[]);networkBy.get(n.kp).push(n);}
  const urls=new Set();for(let target=0;target<=65;target+=5){const n=(networkBy.get(target)||[])[0];if(!n)continue;const t=tileXY(n.lat,n.lon);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)urls.add(`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${t.x+dx}/${t.y+dy}.geojson`);}
  const raw=[];for(const url of urls){const r=await fetch(url,{headers:{'user-agent':'kp-yacho-r234-quality-audit/0.1'}});if(!r.ok)continue;const j=await r.json();for(const f of j.features||[]){const p=f.properties||{};if(String(p.drcd)!==ROUTE)continue;const c=f.geometry?.coordinates||[],lat=Number(p.ido??c[1]),lon=Number(p.keido??c[0]),kp=kpn(p.pk);if(!Number.isFinite(kp)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;raw.push({kp,lat,lon,id:p.id,gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno,tncdn:p.tncdn,riyuucdn:p.riyuucdn,updateno_str:p.updateno_str,fdate_str:p.fdate_str});}}
  const by=new Map();for(const r of raw){const sig=`${r.id}|${r.lat}|${r.lon}|${r.kp}|${r.updateno_str}|${r.fdate_str}`;if(!by.has(r.kp))by.set(r.kp,new Map());by.get(r.kp).set(sig,r);}
  const selected=[];for(const [kp,m] of by){const rows=[...m.values()].sort(compareRevision);if(rows.length)selected.push(rows[0]);}selected.sort((a,b)=>a.kp-b.kp);
  const sameKp=[];for(const m of selected){const nets=networkBy.get(m.kp)||[];if(!nets.length)continue;const min=Math.min(...nets.map(n=>dist(m,n)));sameKp.push({...m,networkDistanceM:+min.toFixed(2),networkCandidates:nets.length});}
  const continuity=[];for(let i=1;i<selected.length;i++){const a=selected[i-1],b=selected[i],dkp=(b.kp-a.kp)*1000,dgeo=dist(a,b),delta=Math.abs(dgeo-dkp);continuity.push({fromKp:a.kp,toKp:b.kp,kpDeltaM:+dkp.toFixed(2),geoDistanceM:+dgeo.toFixed(2),differenceM:+delta.toFixed(2),ratio:dkp?+(dgeo/dkp).toFixed(3):null,flag100:delta>100||dgeo>dkp*2.5});}
  const outliers50=sameKp.filter(x=>x.networkDistanceM>50),outliers100=sameKp.filter(x=>x.networkDistanceM>100),continuityBad=continuity.filter(x=>x.flag100);
  console.log('R234ReferenceQualityAudit',JSON.stringify({rawMeasured:raw.length,uniqueSelected:selected.length,selectedRange:selected.length?[selected[0].kp,selected[selected.length-1].kp]:null,sameKpDistanceStats:stats(sameKp.map(x=>x.networkDistanceM)),outliers50,outliers100,continuityStats:stats(continuity.map(x=>x.differenceM)),continuityBad},null,2));
  if(!selected.length)process.exitCode=1;
})();
