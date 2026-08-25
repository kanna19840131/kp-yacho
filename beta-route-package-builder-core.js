(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./kml-route-loader.js'):root.KPKmlRouteLoader,
    typeof module==='object'&&module.exports?require('./beta-app-core.js'):root.KPBetaCore,
    typeof module==='object'&&module.exports?require('./route-engine.js'):root.KPRouteEngine
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPBetaRoutePackageBuilder=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(loader,core,engine){
  'use strict';
  if(!loader)throw new Error('KPKmlRouteLoader is required');
  if(!core)throw new Error('KPBetaCore is required');
  if(!engine)throw new Error('KPRouteEngine is required');
  const clean=v=>String(v??'').trim();

  function captureRows(input){
    if(Array.isArray(input))return input;
    if(input&&input.schema==='kp-yacho-calibration-capture-set/v1'&&Array.isArray(input.captures))return input.captures;
    if(input&&Array.isArray(input.captures))return input.captures;
    throw new Error('既知KPのJSON形式を確認してください');
  }

  function normalizeAnchors(input,captureRoute=''){
    const wanted=clean(captureRoute);
    let rows=captureRows(input);
    if(wanted)rows=rows.filter(x=>clean(x.route)===wanted);
    const anchors=rows.map((x,i)=>{
      const kp=Number(x.kp),lat=Number(x.lat),lon=Number(x.lon);
      if(!Number.isFinite(kp)||!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error(`capture ${i+1} requires kp/lat/lon`);
      const accuracyM=Number(x.accuracyM);
      if((Number.isFinite(accuracyM)&&accuracyM>50)||clean(x.quality)==='poor')throw new Error(`capture ${i+1} はGPS精度不足のためアンカーに使えません`);
      return {kp,lat,lon,addr:clean(x.addr),source:clean(x.source),note:clean(x.note),accuracyM:Number.isFinite(accuracyM)?accuracyM:null};
    });
    if(anchors.length<2)throw new Error('既知KPアンカーが2点以上必要です');
    return anchors;
  }

  function validateMonotonicRoute(route){
    const normalized=engine.normalizeRoute(route);
    normalized.sections.forEach(section=>{
      const anchors=section.anchors||[];
      let direction=0;
      for(let i=1;i<anchors.length;i++){
        const delta=Number(anchors[i].kp)-Number(anchors[i-1].kp);
        if(Math.abs(delta)<=1e-9)throw new Error(`section ${section.id} に同じKPのアンカーが複数あります`);
        const sign=Math.sign(delta);
        if(direction===0)direction=sign;
        else if(sign!==direction)throw new Error(`section ${section.id} でKPアンカーが途中反転しています`);
      }
    });
    return normalized;
  }

  function buildRoutePackage(kmlText,captureInput,opts={}){
    const packageId=clean(opts.packageId);
    const routeId=clean(opts.routeId||opts.shortName);
    const label=clean(opts.label||routeId);
    const shortName=clean(opts.shortName||routeId);
    const rightsBasis=clean(opts.rightsBasis);
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(packageId))throw new Error('packageIdは英数字・._-のみ80文字以内で指定してください');
    if(!routeId)throw new Error('routeId is required');
    if(opts.rightsConfirmed!==true)throw new Error('路線データの利用権確認が必要です');
    if(!rightsBasis)throw new Error('利用権確認の根拠を入力してください');
    const anchors=normalizeAnchors(captureInput,opts.captureRoute);
    const route=loader.buildRouteConfigFromKml(kmlText,{
      id:routeId,label,shortName,anchors,
      maxAnchorDistanceM:Number.isFinite(Number(opts.maxAnchorDistanceM))?Number(opts.maxAnchorDistanceM):100,
      metadata:{
        sourceType:clean(opts.sourceType)||'customer-kml+known-kp',
        fieldVerified:opts.fieldVerified===true,
        anchorCount:anchors.length
      },
      source:{type:'kml',rightsBasis}
    });
    validateMonotonicRoute(route);
    const pkg={
      type:'kp-yacho-route-package',
      schemaVersion:1,
      packageId,
      label,
      issuedAt:new Date().toISOString(),
      rights:{confirmed:true,basis:rightsBasis,note:clean(opts.rightsNote)},
      metadata:{
        fieldVerified:opts.fieldVerified===true,
        sourceType:clean(opts.sourceType)||'customer-kml+known-kp',
        captureRoute:clean(opts.captureRoute),
        anchorCount:anchors.length
      },
      routes:[route]
    };
    return core.validateRoutePackage(pkg);
  }

  function packageAudit(pkg){
    const p=core.validateRoutePackage(pkg);
    if(p.routes.length!==1)throw new Error('有料βは1パッケージにつき1担当路線です');
    if(!p.rights||p.rights.confirmed!==true||!clean(p.rights.basis))throw new Error('利用権確認済みの路線パッケージだけ監査できます');
    validateMonotonicRoute(p.routes[0]);
    const routeSummaries=p.routes.map(r=>{
      const sections=Array.isArray(r.sections)?r.sections:[];
      const anchorCounts=sections.length?sections.map(s=>(s.anchors||[]).length):[(r.anchors||[]).length];
      const anchors=sections.length?sections.flatMap(s=>s.anchors||[]):r.anchors||[];
      const kps=anchors.map(a=>Number(a.kp)).filter(Number.isFinite);
      return {
        id:r.id,
        label:r.label||r.id,
        sectionCount:sections.length||1,
        anchorCounts,
        kpMin:kps.length?Math.min(...kps):null,
        kpMax:kps.length?Math.max(...kps):null
      };
    });
    return {packageId:p.packageId,label:p.label,rightsConfirmed:p.rights.confirmed===true,fieldVerified:p.metadata.fieldVerified===true,routes:routeSummaries};
  }

  return{captureRows,normalizeAnchors,validateMonotonicRoute,buildRoutePackage,packageAudit};
});
