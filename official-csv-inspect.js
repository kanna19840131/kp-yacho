'use strict';

const BASE='https://www.road-refpoint.go.jp/kijunten/';
const tests=[
  {name:'R5',route:'0005',start:197,end:203},
  {name:'R230',route:'0230',start:0,end:10},
  {name:'R453',route:'0453',start:0,end:10}
];

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
  const headers={'user-agent':'kp-yacho-route-pilot/1.0','referer':BASE};if(cookie)headers.cookie=cookie;
  const res=await fetch(BASE+rel,{headers});
  const buf=Buffer.from(await res.arrayBuffer());
  if(!res.ok)throw new Error(`${rel}: HTTP ${res.status}`);
  return{buf,type:res.headers.get('content-type'),setCookie:res.headers.get('set-cookie')};
}
function decodeCp932(buf){
  for(const label of ['shift_jis','windows-31j']){
    try{return new TextDecoder(label).decode(buf);}catch(e){}
  }
  throw new Error('runtime TextDecoder does not support Shift_JIS/Windows-31J');
}
function uniq(rows,index){return [...new Set(rows.map(r=>r[index]).filter(v=>v!==undefined&&v!==''))];}

(async()=>{
  for(const t of tests){
    const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${t.route}&hm2_a=${t.start.toFixed(1)}&hm3_a=${t.end.toFixed(1)}`;
    const pre=await fetchBytes(`precsv.php?${q}`),cookie=cookiePair(pre.setCookie);
    console.log(`\n===== ${t.name} preCSV =====`);console.log(pre.buf.toString('utf8'),'cookieSet',!!cookie);
    const csv=await fetchBytes(`csv.php?${q}`,cookie),text=decodeCp932(csv.buf).replace(/^\uFEFF/,'');
    const lines=text.split(/\r?\n/).filter(Boolean),rows=lines.map(parseCsvLine),header=rows[0],data=rows.slice(1);
    console.log(`===== ${t.name} CSV =====`);
    console.log('contentType',csv.type,'bytes',csv.buf.length,'rows',data.length);
    console.log('header',JSON.stringify(header));
    console.log('first5',JSON.stringify(data.slice(0,5)));
    console.log('last3',JSON.stringify(data.slice(-3)));
    console.log('columnUniqueSummary',JSON.stringify(header.map((h,i)=>({index:i,name:h,uniqueCount:uniq(data,i).length,values:uniq(data,i).slice(0,20)})),null,2));
  }
})().catch(e=>{console.error(e);process.exit(1);});
