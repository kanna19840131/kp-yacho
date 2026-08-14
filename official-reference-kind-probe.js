'use strict';

const BASE='https://www.road-refpoint.go.jp/kijunten/';
const tests=[
  {name:'R230',route:'0230',start:0,end:10},
  {name:'R453',route:'0453',start:0,end:10},
  {name:'R5',route:'0005',start:197,end:203}
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
function decodeCp932(buf){return new TextDecoder('shift_jis').decode(buf).replace(/^\uFEFF/,'');}
async function get(rel){
  const r=await fetch(BASE+rel,{headers:{'user-agent':'kp-yacho-kind-probe/0.1','referer':BASE}});
  const b=Buffer.from(await r.arrayBuffer());
  return {ok:r.ok,status:r.status,type:r.headers.get('content-type'),buf:b};
}

(async()=>{
  for(const t of tests){
    console.log(`\n===== ${t.name} =====`);
    for(const type of ['1','2','3']){
      const q=`type=${type}&mode=3&jimu1=&jimu2=&rosen=${t.route}&hm2_a=${t.start.toFixed(1)}&hm3_a=${t.end.toFixed(1)}`;
      const pre=await get(`precsv.php?${q}`);
      const preText=pre.buf.toString('utf8').trim();
      let rowCount=null,header=null,first3=null,last3=null,error=null;
      try{
        const csv=await get(`csv.php?${q}`);
        const text=decodeCp932(csv.buf);
        const lines=text.split(/\r?\n/).filter(Boolean);
        const rows=lines.map(parseCsvLine);
        header=rows[0]||null; const data=rows.slice(1);
        rowCount=data.length; first3=data.slice(0,3); last3=data.slice(-3);
      }catch(e){error=String(e&&e.message||e);}
      console.log(JSON.stringify({type,preStatus:pre.status,preText,rowCount,header,first3,last3,error},null,2));
    }
  }
})().catch(e=>{console.error(e);process.exit(1);});
