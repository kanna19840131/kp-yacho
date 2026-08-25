'use strict';

const BASE='https://www.road-refpoint.go.jp/kijunten/';
const START=197.0,END=203.0,ROUTE='0005';
function hav(a,b){
  const R=6371000,p=Math.PI/180,p1=a.lat*p,p2=b.lat*p,dp=(b.lat-a.lat)*p,dl=(b.lon-a.lon)*p;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
async function get(rel){
  const res=await fetch(BASE+rel,{headers:{'user-agent':'kp-yacho-route-pilot/0.5','referer':BASE}});
  const text=await res.text();return{rel,status:res.status,type:res.headers.get('content-type'),text};
}
(async()=>{
  const rangeRel=`areapoints.php?mode=3&rosen=${ROUTE}&jimu1=&jimu2=&hm2_a=${START.toFixed(1)}&hm3_a=${END.toFixed(1)}`;
  const range=await get(rangeRel);
  console.log('range status',range.status,range.type,'bytes',Buffer.byteLength(range.text));
  const json=JSON.parse(range.text);
  if(json.errmsg)throw new Error(json.errmsg);
  const coords=(json.result||[]).map((p,i)=>({kp:+(START+i/10).toFixed(1),lat:Number(p.lat),lon:Number(p.lon)}));
  const expected=Math.round((END-START)*10)+1;
  if(coords.length!==expected)throw new Error(`expected ${expected} 100m points, got ${coords.length}`);
  const steps=[];for(let i=0;i<coords.length-1;i++)steps.push(hav(coords[i],coords[i+1]));
  const summary={
    count:coords.length,first:coords[0],last:coords.at(-1),
    stepM:{mean:+(steps.reduce((a,b)=>a+b,0)/steps.length).toFixed(2),min:+Math.min(...steps).toFixed(2),max:+Math.max(...steps).toFixed(2)},
    every1km:coords.filter((_,i)=>i%10===0)
  };
  console.log('100m range summary',JSON.stringify(summary,null,2));
  console.log('sample 199.8-200.2',JSON.stringify(coords.filter(p=>p.kp>=199.8&&p.kp<=200.2),null,2));

  const q=`type=3&mode=3&jimu1=&jimu2=&rosen=${ROUTE}&hm2_a=${START.toFixed(1)}&hm3_a=${END.toFixed(1)}`;
  for(const rel of [`precsv.php?${q}`,`csv.php?${q}`]){
    const r=await get(rel);
    console.log(`\n=== ${rel} ===`);
    console.log('status',r.status,'content-type',r.type,'bytes',Buffer.byteLength(r.text));
    console.log(r.text.slice(0,5000));
  }
})().catch(e=>{console.error(e);process.exit(1);});
