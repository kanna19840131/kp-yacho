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
  const headers={'user-agent':'kp-yacho-r234-delivery-rehearsal/0.1','referer':BASE};
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

(async()=>{
  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=${START.toFixed(1)}&hm3_a=${END.toFixed(1)}`;
  const pre=await fetchBytes(`precsv.php?${q}`),cookie=cookiePair(pre.setCookie);
  const csv=await fetchBytes(`csv.php?${q}`,cookie);
  const text=decodeCp932(csv.buf).replace(/^\uFEFF/,'');
  const lines=text.split(/\r?\n/).filter(Boolean),rows=lines.map(parseCsvLine),header=rows[0]||[],data=rows.slice(1);
  console.log('R234 preCSV',pre.buf.toString('utf8'),'cookieSet',!!cookie);
  console.log('R234 CSV meta',JSON.stringify({contentType:csv.type,bytes:csv.buf.length,rowCount:data.length}));
  console.log('header',JSON.stringify(header));
  console.log('first5',JSON.stringify(data.slice(0,5)));
  console.log('last5',JSON.stringify(data.slice(-5)));

  const kpIdx=findColumn(header,['百米標','距離標','KP','ｋｐ','kp']);
  const latIdx=findColumn(header,['緯度']);
  const lonIdx=findColumn(header,['経度']);
  const officeIdx=findColumn(header,['事務所']);
  const routeIdx=findColumn(header,['路線']);
  console.log('detectedColumns',JSON.stringify({kpIdx,latIdx,lonIdx,officeIdx,routeIdx}));
  console.log('uniqueColumns',JSON.stringify(header.map((h,i)=>({i,name:h,unique:uniq(data.map(r=>r[i])).slice(0,15),count:uniq(data.map(r=>r[i])).length})),null,2));

  if(!data.length)throw new Error('R234 official CSV returned no rows');
  if(kpIdx>=0){
    const kps=data.map(r=>n(r[kpIdx])).filter(Number.isFinite).sort((a,b)=>a-b);
    if(kps.length){
      console.log('kpRange',JSON.stringify({min:kps[0],max:kps[kps.length-1],count:kps.length}));
      const byTenth=new Map();
      for(const row of data){const kp=n(row[kpIdx]);if(!Number.isFinite(kp))continue;const key=kp.toFixed(1);if(!byTenth.has(key))byTenth.set(key,[]);byTenth.get(key).push(row);}
      const duplicates=[...byTenth.entries()].filter(([,list])=>list.length>1).map(([kp,list])=>({kp,count:list.length}));
      console.log('duplicateKp',JSON.stringify(duplicates.slice(0,50)),'count',duplicates.length);
    }
  }
  if(officeIdx>=0)console.log('offices',JSON.stringify(uniq(data.map(r=>r[officeIdx]))));
})().catch(e=>{console.error(e);process.exit(1);});
