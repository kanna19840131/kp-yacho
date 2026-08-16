'use strict';

const BASE='https://www.road-refpoint.go.jp/kijunten/';
const ROUTE='0234';
const START=0;
const END=100;

function parseCsvLine(line){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(q&&line[i+1]==='"'){cur+='"';i++;}
      else q=!q;
    }else if(c===','&&!q){out.push(cur);cur='';}
    else cur+=c;
  }
  out.push(cur);return out;
}
function cookiePair(setCookie){return String(setCookie||'').split(';')[0].trim();}
async function fetchBytes(rel,cookie=''){
  const headers={'user-agent':'kp-yacho-r234-delivery-rehearsal/0.2','referer':BASE};
  if(cookie)headers.cookie=cookie;
  const res=await fetch(BASE+rel,{headers});
  const buf=Buffer.from(await res.arrayBuffer());
  if(!res.ok)throw new Error(`${rel}: HTTP ${res.status}`);
  return{buf,type:res.headers.get('content-type'),setCookie:res.headers.get('set-cookie')};
}
function decodeCp932(buf){
  for(const label of ['shift_jis','windows-31j']){
    try{return new TextDecoder(label).decode(buf);}catch(e){}
  }
  throw new Error('TextDecoder does not support Shift_JIS/Windows-31J');
}
function n(v){const m=String(v??'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):NaN;}
function uniq(values){return [...new Set(values.filter(v=>v!==undefined&&v!==''))];}
function findColumn(header,candidates){
  const normalized=header.map(h=>String(h).replace(/[\s　]/g,''));
  for(const c of candidates){
    const i=normalized.findIndex(h=>h.includes(c));
    if(i>=0)return i;
  }
  return -1;
}
function dms(d,m,s){return Number(d)+Number(m)/60+Number(s)/3600;}
function pointFromRow(r){return {lat:dms(r[7],r[8],r[9]),lon:dms(r[10],r[11],r[12])};}

(async()=>{
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=${START.toFixed(1)}&hm3_a=${END.toFixed(1)}`;
  const pre=await fetchBytes(`precsv.php?${q}`),cookie=cookiePair(pre.setCookie);
  const csv=await fetchBytes(`csv.php?${q}`,cookie);
  const text=decodeCp932(csv.buf).replace(/^\uFEFF/,'');
  const lines=text.split(/\r?\n/).filter(Boolean),rows=lines.map(parseCsvLine),header=rows[0]||[],data=rows.slice(1);
  console.log('R234 preCSV',pre.buf.toString('utf8'),'cookieSet',!!cookie);
  console.log('R234 CSV meta',JSON.stringify({contentType:csv.type,bytes:csv.buf.length,rowCount:data.length}));
  console.log('header',JSON.stringify(header));

  const kpIdx=findColumn(header,['地点標名称','百米標','距離標','KP','ｋｐ','kp']);
  const officeIdx=findColumn(header,['事務所']);
  const routeIdx=findColumn(header,['路線']);
  console.log('detectedColumns',JSON.stringify({kpIdx,officeIdx,routeIdx}));
  if(!data.length||kpIdx<0)throw new Error('R234 KP rows/column not found');

  const parsed=data.map(r=>({kp:n(r[kpIdx]),office:r[officeIdx],route:r[routeIdx],...pointFromRow(r),raw:r})).filter(x=>Number.isFinite(x.kp)&&Number.isFinite(x.lat)&&Number.isFinite(x.lon));
  const kps=parsed.map(x=>x.kp).sort((a,b)=>a-b);
  const min=Math.min(...kps),max=Math.max(...kps);
  const byTenth=new Map();
  for(const x of parsed){const key=x.kp.toFixed(1);if(!byTenth.has(key))byTenth.set(key,[]);byTenth.get(key).push(x);}
  const expected=[];for(let v=Math.round(min*10);v<=Math.round(max*10);v++)expected.push((v/10).toFixed(1));
  const missing=expected.filter(k=>!byTenth.has(k));
  const duplicates=[...byTenth.entries()].filter(([,list])=>list.length>1).map(([kp,list])=>({kp,count:list.length,offices:uniq(list.map(x=>x.office))}));
  const unique=[...byTenth.entries()].map(([kp,list])=>list[0]).sort((a,b)=>a.kp-b.kp);
  const transitions=[];
  for(let i=1;i<unique.length;i++)if(unique[i].office!==unique[i-1].office)transitions.push({fromKp:unique[i-1].kp,toKp:unique[i].kp,from:unique[i-1].office,to:unique[i].office});
  const samples=[];
  for(const target of [0,5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100]){
    const best=unique.reduce((a,b)=>Math.abs(b.kp-target)<Math.abs(a.kp-target)?b:a,unique[0]);
    if(best&&Math.abs(best.kp-target)<=0.11)samples.push({kp:best.kp,lat:+best.lat.toFixed(7),lon:+best.lon.toFixed(7),office:best.office});
  }
  console.log('audit',JSON.stringify({rowCount:parsed.length,uniqueKp:byTenth.size,min,max,expectedCount:expected.length,missingCount:missing.length,missing:missing.slice(0,100),duplicateCount:duplicates.length,duplicates:duplicates.slice(0,100),offices:uniq(parsed.map(x=>x.office)),transitions,samples},null,2));
})().catch(e=>{console.error(e);process.exit(1);});
