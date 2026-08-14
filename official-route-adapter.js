(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPOfficialRouteAdapter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const BASE='https://www.road-refpoint.go.jp/kijunten/';

  function parseCsvLine(line){
    const out=[];let cur='',quoted=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'){
        if(quoted&&line[i+1]==='"'){cur+='"';i++;}
        else quoted=!quoted;
      }else if(c===','&&!quoted){out.push(cur);cur='';}
      else cur+=c;
    }
    out.push(cur);return out;
  }
  function decodeCp932(buf){
    const bytes=buf instanceof Uint8Array?buf:new Uint8Array(buf);
    for(const label of ['shift_jis','windows-31j']){
      try{return new TextDecoder(label).decode(bytes).replace(/^\uFEFF/,'');}catch(e){}
    }
    throw new Error('CP932/Shift_JIS decoder is unavailable');
  }
  function dms(d,m,s){
    const dd=Number(d),mm=Number(m),ss=Number(s);
    if(!Number.isFinite(dd)||!Number.isFinite(mm)||!Number.isFinite(ss))return NaN;
    const sign=dd<0?-1:1;return sign*(Math.abs(dd)+mm/60+ss/3600);
  }
  function station10(v){
    const n=Number(v);return Number.isFinite(n)?Math.round(n*10):NaN;
  }
  function stationText(v){const n=station10(v);return Number.isFinite(n)?(n/10).toFixed(1):String(v??'');}
  function expectedStations(start,end){
    const a=station10(start),b=station10(end);
    if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)throw new Error('invalid KP range');
    const out=[];for(let n=a;n<=b;n++)out.push(n);return out;
  }
  function routeCode(v){return String(v??'').replace(/\D/g,'').padStart(4,'0');}
  function normalizeDefinition(def){
    if(!def||typeof def!=='object')throw new Error('route definition is required');
    const route=routeCode(def.route||def.routeNumber);
    if(!route||route==='0000')throw new Error('route number is required');
    const start=Number(def.startKp),end=Number(def.endKp);
    expectedStations(start,end);
    return{
      route,startKp:start,endKp:end,
      office:def.office?String(def.office):'',
      currentOldNew:def.currentOldNew?String(def.currentOldNew):'現道',
      supplement:def.supplement===undefined||def.supplement===null?'0':String(def.supplement),
      label:String(def.label||`国道${Number(route)}号`),
      shortName:String(def.shortName||`R${Number(route)}`)
    };
  }
  function parseOfficialCsv(text,def){
    const d=normalizeDefinition(def);
    const lines=String(text||'').split(/\r?\n/).filter(Boolean);
    if(lines.length<2)throw new Error('official CSV has no data rows');
    const rows=lines.map(parseCsvLine),header=rows.shift();
    const idx={bureau:0,office:1,roadType:2,route:3,currentOldNew:4,supplement:5,kp:6,latD:7,latM:8,latS:9,lonD:10,lonM:11,lonS:12};
    const parsed=[];
    for(const r of rows){
      if(routeCode(r[idx.route])!==d.route)continue;
      if(d.office&&String(r[idx.office])!==d.office)continue;
      if(d.currentOldNew&&String(r[idx.currentOldNew])!==d.currentOldNew)continue;
      if(d.supplement!==''&&String(r[idx.supplement])!==d.supplement)continue;
      const kp=Number(r[idx.kp]),lat=dms(r[idx.latD],r[idx.latM],r[idx.latS]),lon=dms(r[idx.lonD],r[idx.lonM],r[idx.lonS]);
      if(!Number.isFinite(kp)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      parsed.push({
        kp:Number(stationText(kp)),lat,lon,
        bureau:String(r[idx.bureau]||''),office:String(r[idx.office]||''),roadType:String(r[idx.roadType]||''),
        route:d.route,currentOldNew:String(r[idx.currentOldNew]||''),supplement:String(r[idx.supplement]||'')
      });
    }
    if(!parsed.length)throw new Error('no rows matched route definition');
    return{header,definition:d,rows:parsed};
  }
  function sameCoordinate(a,b,toleranceDeg=1e-8){return Math.abs(a.lat-b.lat)<=toleranceDeg&&Math.abs(a.lon-b.lon)<=toleranceDeg;}
  function auditRows(rows,def){
    const d=normalizeDefinition(def),expected=expectedStations(d.startKp,d.endKp),byStation=new Map();
    for(const row of rows){const k=station10(row.kp);if(!byStation.has(k))byStation.set(k,[]);byStation.get(k).push(row);}
    const missing=expected.filter(k=>!byStation.has(k)).map(k=>stationText(k/10));
    const duplicate=[];
    for(const [k,list] of byStation){
      if(list.length<=1)continue;
      const identical=list.every(x=>sameCoordinate(x,list[0]));
      duplicate.push({kp:stationText(k/10),count:list.length,identicalCoordinates:identical,coordinates:list.map(x=>({lat:x.lat,lon:x.lon}))});
    }
    const outOfRange=[...byStation.keys()].filter(k=>k<expected[0]||k>expected[expected.length-1]).map(k=>stationText(k/10));
    const rawStationOrder=rows.map(r=>station10(r.kp));
    let descents=0;for(let i=1;i<rawStationOrder.length;i++)if(rawStationOrder[i]<rawStationOrder[i-1])descents++;
    const ambiguous=duplicate.filter(x=>!x.identicalCoordinates);
    const collapsible=duplicate.filter(x=>x.identicalCoordinates);
    return{
      expectedCount:expected.length,rawRowCount:rows.length,uniqueStationCount:byStation.size,
      missing,duplicates:duplicate,ambiguousDuplicates:ambiguous,collapsibleDuplicates:collapsible,outOfRange,rawOrderDescents:descents,
      strictReady:missing.length===0&&ambiguous.length===0&&outOfRange.length===0
    };
  }
  function makePackage(parsed,{strict=true}={}){
    const audit=auditRows(parsed.rows,parsed.definition);
    if(strict&&!audit.strictReady){
      const parts=[];
      if(audit.missing.length)parts.push(`missing=${audit.missing.join('/')}`);
      if(audit.ambiguousDuplicates.length)parts.push(`ambiguous=${audit.ambiguousDuplicates.map(x=>x.kp).join('/')}`);
      if(audit.outOfRange.length)parts.push(`outOfRange=${audit.outOfRange.join('/')}`);
      const err=new Error('official route data is not safe to package: '+parts.join(', '));err.audit=audit;throw err;
    }
    const byStation=new Map();
    for(const row of parsed.rows){
      const k=station10(row.kp),list=byStation.get(k)||[];list.push(row);byStation.set(k,list);
    }
    const points=[];
    for(const k of expectedStations(parsed.definition.startKp,parsed.definition.endKp)){
      const list=byStation.get(k)||[];
      if(!list.length)continue;
      if(list.length>1&&!list.every(x=>sameCoordinate(x,list[0])))continue;
      const p=list[0];points.push({kp:Number(stationText(k/10)),lat:p.lat,lon:p.lon});
    }
    return{
      schema:'kp-yacho-route-package/v1',
      route:{id:parsed.definition.shortName,label:parsed.definition.label,shortName:parsed.definition.shortName,points},
      source:{provider:'MLIT road reference point system',kind:'network-100m-csv',route:parsed.definition.route,office:parsed.definition.office,currentOldNew:parsed.definition.currentOldNew,supplement:parsed.definition.supplement,retrievedAt:new Date().toISOString()},
      audit
    };
  }
  async function fetchOfficialCsv(def,{fetchImpl=globalThis.fetch,base=BASE}={}){
    if(typeof fetchImpl!=='function')throw new Error('fetch is unavailable');
    const d=normalizeDefinition(def);
    const q=new URLSearchParams({type:'3',mode:'3',jimu1:'',jimu2:'',rosen:d.route,hm2_a:stationText(d.startKp),hm3_a:stationText(d.endKp)}).toString();
    const headers={'user-agent':'kp-yacho-route-adapter/0.1','referer':base};
    const pre=await fetchImpl(base+`precsv.php?${q}`,{headers});
    if(!pre.ok)throw new Error(`precsv HTTP ${pre.status}`);
    const preText=await pre.text();if(!/ok\s*=\s*["']?ok/i.test(preText))throw new Error('precsv did not return ok');
    const csv=await fetchImpl(base+`csv.php?${q}`,{headers});
    if(!csv.ok)throw new Error(`csv HTTP ${csv.status}`);
    const buf=new Uint8Array(await csv.arrayBuffer()),text=decodeCp932(buf);
    return parseOfficialCsv(text,d);
  }
  async function fetchRoutePackage(def,opts={}){const parsed=await fetchOfficialCsv(def,opts);return makePackage(parsed,{strict:opts.strict!==false});}

  return{BASE,parseCsvLine,decodeCp932,dms,station10,stationText,expectedStations,normalizeDefinition,parseOfficialCsv,auditRows,makePackage,fetchOfficialCsv,fetchRoutePackage};
});
