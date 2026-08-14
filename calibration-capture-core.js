(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPCalibrationCaptureCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const EARTH_RADIUS_M=6371000;
  const GOOD_ACCURACY_M=20;
  const MAX_SAVE_ACCURACY_M=50;
  const SOURCES=new Set(['physical-marker','contract-document','shared-reference','other']);
  const finite=v=>Number.isFinite(Number(v));
  const text=v=>String(v??'').trim();

  function validateLatLon(lat,lon){
    const la=Number(lat),lo=Number(lon);
    if(!Number.isFinite(la)||la<-90||la>90)throw new Error('latitude is invalid');
    if(!Number.isFinite(lo)||lo<-180||lo>180)throw new Error('longitude is invalid');
    return{lat:la,lon:lo};
  }

  function qualityForAccuracy(accuracyM){
    const n=Number(accuracyM);
    if(!Number.isFinite(n)||n<0)return{status:'invalid',usable:false,label:'GPS精度不明'};
    if(n<=GOOD_ACCURACY_M)return{status:'good',usable:true,label:'良好'};
    if(n<=MAX_SAVE_ACCURACY_M)return{status:'warning',usable:true,label:'注意'};
    return{status:'poor',usable:false,label:'精度不足'};
  }

  function normalizeSource(v){
    const s=text(v)||'other';
    return SOURCES.has(s)?s:'other';
  }

  function makeId(capturedAt,route,kp){
    const stamp=String(capturedAt).replace(/\D/g,'').slice(0,17)||String(Date.now());
    const r=text(route).replace(/[^0-9A-Za-z_-]+/g,'').slice(0,20)||'route';
    const k=Number(kp).toFixed(3).replace('.','_').replace('-','m');
    return `${stamp}-${r}-${k}`;
  }

  function createCapture(input,opts={}){
    if(!input||typeof input!=='object')throw new Error('capture input is required');
    const route=text(input.route);
    if(!route)throw new Error('route is required');
    const kp=Number(input.kp);
    if(!Number.isFinite(kp))throw new Error('known KP is required');
    const pos=validateLatLon(input.lat,input.lon);
    const accuracyM=Number(input.accuracyM);
    const q=qualityForAccuracy(accuracyM);
    if(!q.usable&&opts.allowPoorAccuracy!==true)throw new Error('GPS accuracy is too poor for calibration capture');
    const capturedAt=text(input.capturedAt)||new Date().toISOString();
    const source=normalizeSource(input.source);
    const note=text(input.note).slice(0,500);
    return{
      schema:'kp-yacho-calibration-capture/v1',
      id:text(input.id)||makeId(capturedAt,route,kp),
      route,
      kp,
      lat:pos.lat,
      lon:pos.lon,
      accuracyM:Number.isFinite(accuracyM)?accuracyM:null,
      quality:q.status,
      source,
      note,
      capturedAt
    };
  }

  function haversineM(a,b){
    const p=Math.PI/180;
    const lat1=Number(a.lat)*p,lat2=Number(b.lat)*p;
    const dlat=(Number(b.lat)-Number(a.lat))*p,dlon=(Number(b.lon)-Number(a.lon))*p;
    const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
    return 2*EARTH_RADIUS_M*Math.asin(Math.min(1,Math.sqrt(h)));
  }

  function auditCaptures(captures,opts={}){
    const list=(captures||[]).map(c=>createCapture(c,{allowPoorAccuracy:true}));
    const minRecommendedSpacingM=finite(opts.minRecommendedSpacingM)?Number(opts.minRecommendedSpacingM):300;
    const byRoute=new Map();
    for(const c of list){if(!byRoute.has(c.route))byRoute.set(c.route,[]);byRoute.get(c.route).push(c);}
    const routes=[];
    for(const [route,items] of byRoute){
      items.sort((a,b)=>a.kp-b.kp||String(a.capturedAt).localeCompare(String(b.capturedAt)));
      let minSpacingM=null;
      const pairs=[];
      for(let i=1;i<items.length;i++){
        const spacing=haversineM(items[i-1],items[i]);
        if(minSpacingM===null||spacing<minSpacingM)minSpacingM=spacing;
        pairs.push({fromId:items[i-1].id,toId:items[i].id,spacingM:spacing,kpDelta:items[i].kp-items[i-1].kp});
      }
      const good=items.filter(x=>qualityForAccuracy(x.accuracyM).status==='good').length;
      const poor=items.filter(x=>!qualityForAccuracy(x.accuracyM).usable).length;
      routes.push({
        route,
        count:items.length,
        goodAccuracyCount:good,
        poorAccuracyCount:poor,
        minSpacingM,
        recommendedForTwoPlusOneTest:items.length>=3&&poor===0,
        spacingWarning:minSpacingM!==null&&minSpacingM<minRecommendedSpacingM,
        pairs
      });
    }
    return{count:list.length,routes};
  }

  function csvEscape(v){
    const s=String(v??'');
    return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }

  function toCsv(captures){
    const header=['schema','id','route','kp','lat','lon','accuracyM','quality','source','note','capturedAt'];
    const rows=(captures||[]).map(c=>createCapture(c,{allowPoorAccuracy:true}));
    return [header.join(','),...rows.map(c=>header.map(k=>csvEscape(c[k])).join(','))].join('\n');
  }

  function toJson(captures){
    const rows=(captures||[]).map(c=>createCapture(c,{allowPoorAccuracy:true}));
    return JSON.stringify({schema:'kp-yacho-calibration-capture-set/v1',exportedAt:new Date().toISOString(),captures:rows},null,2);
  }

  return{EARTH_RADIUS_M,GOOD_ACCURACY_M,MAX_SAVE_ACCURACY_M,qualityForAccuracy,createCapture,haversineM,auditCaptures,toCsv,toJson};
});
