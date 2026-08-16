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
(async()=>{
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=13.0&hm3_a=19.0`;
  const res=await fetch(BASE+`csv.php?${q}`,{headers:{'user-agent':'kp-yacho-r234-reference-diagnostic/0.1','referer':BASE}});if(!res.ok)throw new Error('CSV HTTP '+res.status);
  const text=cp932(Buffer.from(await res.arrayBuffer())).replace(/^\uFEFF/,'');
  const networkRows=text.split(/\r?\n/).filter(Boolean).map(csvLine).slice(1).map(r=>({kp:kpn(r[6]),lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12]),office:r[1],gks:r[4],aux:r[5]})).filter(x=>Number.isFinite(x.kp));
  const networkBy=new Map();for(const r of networkRows){if(!networkBy.has(r.kp))networkBy.set(r.kp,[]);networkBy.get(r.kp).push(r);}
  const urls=new Set();for(const seed of networkRows.filter(x=>Math.abs(x.kp-Math.round(x.kp))<1e-9)){const t=tileXY(seed.lat,seed.lon);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)urls.add(`https://www.road-refpoint.go.jp/kijunten/xyz/geojson/${Z}/${t.x+dx}/${t.y+dy}.geojson`);}
  const measured=[];for(const url of urls){const r=await fetch(url,{headers:{'user-agent':'kp-yacho-r234-reference-diagnostic/0.1'}});if(!r.ok)continue;const j=await r.json();for(const f of j.features||[]){const p=f.properties||{};if(String(p.drcd)!==ROUTE)continue;const c=f.geometry?.coordinates||[],lat=Number(p.ido??c[1]),lon=Number(p.keido??c[0]),kp=kpn(p.pk);if(!Number.isFinite(kp)||kp<13||kp>19||!Number.isFinite(lat)||!Number.isFinite(lon))continue;measured.push({kp,lat,lon,id:p.id,pk:p.pk,gkscdn:p.gkscdn,jgcdn:p.jgcdn,hjno:p.hjno,tncdn:p.tncdn,riyuucdn:p.riyuucdn,td_str:p.td_str,updateno_str:p.updateno_str,fdate_str:p.fdate_str});}}
  const by=new Map();for(const r of measured){const sig=`${r.id}|${r.lat}|${r.lon}|${r.kp}`;if(!by.has(r.kp))by.set(r.kp,new Map());by.get(r.kp).set(sig,r);}
  const report=[];
  for(const [kp,map] of [...by.entries()].sort((a,b)=>a[0]-b[0])){
    const nets=networkBy.get(kp)||[];
    const candidates=[...map.values()].map(c=>{const ds=nets.map(n=>dist(c,n));return{...c,minNetworkSameKpM:ds.length?+Math.min(...ds).toFixed(2):null,networkCandidateCount:nets.length};}).sort(compareRevision);
    const nearest=candidates.slice().sort((a,b)=>(a.minNetworkSameKpM??Infinity)-(b.minNetworkSameKpM??Infinity))[0];
    report.push({kp,networkCandidates:nets,candidateCount:candidates.length,selectedByRevision:candidates[0],nearestToNetwork:nearest,candidates});
  }
  console.log('R234ReferenceDiagnostic',JSON.stringify({range:[13,19],networkRowCount:networkRows.length,measuredRawCount:measured.length,rows:report},null,2));
})();
