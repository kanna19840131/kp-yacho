(function(root,factory){
  const api=factory(
    typeof module==='object'&&module.exports?require('./route-engine.js'):root.KPRouteEngine
  );
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPRouteCalibration=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(engine){
  'use strict';
  if(!engine)throw new Error('KPRouteEngine is required');

  const finite=v=>Number.isFinite(Number(v));
  const round=(v,d=6)=>Number(Number(v).toFixed(d));

  function baseKpAt(section,alongM){
    const r=engine.kpAtAlongM(Number(alongM),section.anchors);
    return r&&finite(r.kp)?Number(r.kp):NaN;
  }

  function nearestSection(lat,lon,route){
    let best=null;
    for(const section of route.sections){
      const p=engine.projectPointToPolyline(lat,lon,section.polyline);
      if(!p)continue;
      if(!best||p.distM<best.distM)best={section,projection:p,distM:p.distM};
    }
    return best;
  }

  function normalizeFieldAnchors(routeConfig,fieldAnchors,opts={}){
    const route=engine.normalizeRoute(routeConfig);
    const maxDistanceM=finite(opts.maxDistanceM)?Number(opts.maxDistanceM):50;
    const assigned=[],rejected=[];
    for(let i=0;i<(fieldAnchors||[]).length;i++){
      const a=fieldAnchors[i]||{};
      if(!finite(a.kp)||!finite(a.lat)||!finite(a.lon)){
        rejected.push({index:i,reason:'invalid-field-anchor',anchor:a});continue;
      }
      const n=nearestSection(Number(a.lat),Number(a.lon),route);
      if(!n){rejected.push({index:i,reason:'no-route-section',anchor:a});continue;}
      if(n.distM>maxDistanceM){
        rejected.push({index:i,reason:'too-far-from-route',distanceM:round(n.distM,2),anchor:a});continue;
      }
      const baseKp=baseKpAt(n.section,n.projection.alongM);
      if(!finite(baseKp)){rejected.push({index:i,reason:'base-kp-unavailable',anchor:a});continue;}
      assigned.push({
        index:i,
        sectionId:n.section.id,
        kp:Number(a.kp),
        lat:Number(a.lat),lon:Number(a.lon),
        alongM:n.projection.alongM,
        distanceM:n.distM,
        baseKp,
        deltaKp:Number(a.kp)-baseKp,
        label:String(a.label||''),
        source:String(a.source||'field-known-kp')
      });
    }
    assigned.sort((a,b)=>a.sectionId.localeCompare(b.sectionId)||a.alongM-b.alongM);
    return{route,assigned,rejected,maxDistanceM};
  }

  function auditAssigned(assigned,opts={}){
    const samePositionM=finite(opts.samePositionM)?Number(opts.samePositionM):1;
    const kpTolerance=finite(opts.kpTolerance)?Number(opts.kpTolerance):0.001;
    const conflicts=[],nonMonotonic=[];
    const bySection=new Map();
    for(const a of assigned){if(!bySection.has(a.sectionId))bySection.set(a.sectionId,[]);bySection.get(a.sectionId).push(a);}
    for(const [sectionId,list] of bySection){
      list.sort((a,b)=>a.alongM-b.alongM);
      for(let i=1;i<list.length;i++){
        const prev=list[i-1],cur=list[i];
        if(Math.abs(cur.alongM-prev.alongM)<=samePositionM&&Math.abs(cur.kp-prev.kp)>kpTolerance){
          conflicts.push({sectionId,first:prev.index,second:cur.index,reason:'same-position-different-kp'});
        }
        if(cur.kp<prev.kp-kpTolerance){
          nonMonotonic.push({sectionId,first:prev.index,second:cur.index,firstKp:prev.kp,secondKp:cur.kp});
        }
      }
    }
    return{conflicts,nonMonotonic,safe:conflicts.length===0&&nonMonotonic.length===0};
  }

  function correctionAt(alongM,anchors){
    if(!anchors||!anchors.length)return 0;
    const list=anchors.slice().sort((a,b)=>a.alongM-b.alongM);
    if(list.length===1)return list[0].deltaKp;
    if(alongM<=list[0].alongM)return list[0].deltaKp;
    if(alongM>=list[list.length-1].alongM)return list[list.length-1].deltaKp;
    for(let i=0;i<list.length-1;i++){
      const a=list[i],b=list[i+1];
      if(alongM<a.alongM||alongM>b.alongM)continue;
      const span=b.alongM-a.alongM;if(!(span>0))return a.deltaKp;
      const t=(alongM-a.alongM)/span;
      return a.deltaKp+t*(b.deltaKp-a.deltaKp);
    }
    return 0;
  }

  function calibratedSection(section,fieldForSection){
    if(!fieldForSection.length)return{
      id:section.id,
      polyline:section.polyline.map(p=>({lat:p.lat,lon:p.lon,addr:p.addr||''})),
      anchors:section.anchors.map(a=>({kp:a.kp,lat:a.lat,lon:a.lon,alongM:a.alongM,addr:a.addr||''})),
      metadata:Object.assign({},section.metadata||{},{fieldCalibration:{applied:false,anchorCount:0}})
    };
    const positions=new Set(section.anchors.map(a=>round(a.alongM,3)));
    for(const a of fieldForSection)positions.add(round(a.alongM,3));
    const anchors=[...positions].sort((a,b)=>a-b).map(alongM=>{
      const base=baseKpAt(section,alongM),delta=correctionAt(alongM,fieldForSection);
      const sourceField=fieldForSection.find(f=>Math.abs(f.alongM-alongM)<=0.01);
      let lat,lon,addr='';
      if(sourceField){lat=sourceField.lat;lon=sourceField.lon;}
      else{
        const ref=section.anchors.reduce((best,a)=>!best||Math.abs(a.alongM-alongM)<Math.abs(best.alongM-alongM)?a:best,null);
        lat=ref.lat;lon=ref.lon;addr=ref.addr||'';
      }
      return{kp:base+delta,lat,lon,alongM,addr};
    });
    return{
      id:section.id,
      polyline:section.polyline.map(p=>({lat:p.lat,lon:p.lon,addr:p.addr||''})),
      anchors,
      metadata:Object.assign({},section.metadata||{}, {
        fieldCalibration:{
          applied:true,
          anchorCount:fieldForSection.length,
          mode:fieldForSection.length===1?'constant-offset':'piecewise-offset',
          anchors:fieldForSection.map(a=>({kp:a.kp,baseKp:round(a.baseKp),deltaKp:round(a.deltaKp),alongM:round(a.alongM,2),distanceM:round(a.distanceM,2),label:a.label,source:a.source}))
        }
      })
    };
  }

  function calibrateRoute(routeConfig,fieldAnchors,opts={}){
    const normalized=normalizeFieldAnchors(routeConfig,fieldAnchors,opts);
    const audit=auditAssigned(normalized.assigned,opts);
    if(opts.strict!==false&&normalized.rejected.length){
      const e=new Error('field calibration rejected anchors');e.rejected=normalized.rejected;throw e;
    }
    if(opts.strict!==false&&!audit.safe){const e=new Error('field calibration anchors are inconsistent');e.audit=audit;throw e;}
    const bySection=new Map();
    for(const a of normalized.assigned){if(!bySection.has(a.sectionId))bySection.set(a.sectionId,[]);bySection.get(a.sectionId).push(a);}
    const sections=normalized.route.sections.map(s=>calibratedSection(s,bySection.get(s.id)||[]));
    return{
      id:normalized.route.id,
      label:normalized.route.label,
      shortName:normalized.route.shortName,
      sections,
      metadata:Object.assign({},normalized.route.metadata||{}, {
        fieldCalibration:{
          applied:normalized.assigned.length>0,
          acceptedCount:normalized.assigned.length,
          rejectedCount:normalized.rejected.length,
          maxDistanceM:normalized.maxDistanceM,
          method:'base-kp + interpolated field delta; constant delta outside calibrated span',
          originalSource:normalized.route.source||routeConfig.source||null,
          audit
        }
      }),
      source:normalized.route.source||routeConfig.source||null,
      calibrationAudit:{assigned:normalized.assigned,rejected:normalized.rejected,audit}
    };
  }

  return{normalizeFieldAnchors,auditAssigned,correctionAt,calibrateRoute};
});
