'use strict';

const BASE='https://www.road-refpoint.go.jp/kijunten/';
const urls=[
  'areapoints.php?mode=3&rosen=0005&jimu1=&jimu2=&hm2_a=197.0&hm3_a=203.0',
  'pinpoint.php?mode=3&rosen=0005&hm=200.0',
  'pinpoint.php?mode=3&rosen=0005&hm=200.1'
];

(async()=>{
  for(const rel of urls){
    const url=BASE+rel;
    const res=await fetch(url,{headers:{'user-agent':'kp-yacho-route-pilot/0.4','referer':BASE}});
    const text=await res.text();
    console.log('\n===',rel,'===');
    console.log('status',res.status,'content-type',res.headers.get('content-type'),'bytes',Buffer.byteLength(text));
    console.log(text.slice(0,12000));
  }
})().catch(e=>{console.error(e);process.exit(1);});
