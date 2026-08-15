(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./kml-route-loader.js'):root.KPKmlRouteLoader,
    typeof module==='object'&&module.exports?require('./beta-app-core.js'):root.KPBetaCore
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPBetaRoutePackageBuilder=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(loader,core){
  'use strict';
  if(!loader)throw new Error('KPKmlRouteLoader is required');
  if(!core)throw new Error('KPBetaCore is required');
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
      return {kp,lat,lon,addr:clean(x.addr),source:clean(x.source),note:clean(x.note)};
    });
    if(anchors.length<2)throw new Error('既知KPアンカーが2点以上必要です');
    return anchors;
  }

  function buildRoutePackage(kmlText,captureInput,opts={}){
    const packageId=clean(opts.packageId);
    const routeId=clean(opts.routeId||opts.shortName);
    const label=clean(opts.label||routeId);
    const shortName=clean(opts.shortName||routeId);
    const rightsBasis=clean(opts.rightsBasis);
    if(!packageId)throw new Error('packageId is required');
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

  return{captureRows,normalizeAnchors,buildRoutePackage,packageAudit};
});
