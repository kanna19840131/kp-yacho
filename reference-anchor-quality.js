(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./route-engine.js'):root.KPRouteEngine);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPReferenceAnchorQuality=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(engine){
  'use strict';
  if(!engine)throw new Error('KPRouteEngine is required');
  const finite=v=>Number.isFinite(Number(v));
  const num=v=>Number(v);

  function haversine(a,b){return engine.haversineM({lat:num(a.lat),lon:num(a.lon)},{lat:num(b.lat),lon:num(b.lon)});}
  function nearestSameKpDistance(point,networkByKp){
    if(!networkByKp)return null;
    const key=Number(point.kp).toFixed(1);
    const list=networkByKp instanceof Map?(networkByKp.get(key)||networkByKp.get(Number(point.kp))||[]):(networkByKp[key]||[]);
    const ds=(list||[]).filter(x=>finite(x.lat)&&finite(x.lon)).map(x=>haversine(point,x));
    return ds.length?Math.min(...ds):null;
  }
  function projectRows(points,polyline,networkByKp){
    return (points||[]).filter(p=>finite(p.kp)&&finite(p.lat)&&finite(p.lon)).map((p,index)=>{
      const proj=engine.projectPointToPolyline(num(p.lat),num(p.lon),polyline);
      if(!proj)throw new Error(`projection failed for anchor ${index}`);
      return Object.assign({},p,{kp:num(p.kp),lat:num(p.lat),lon:num(p.lon),centerlineOffsetM:proj.distM,alongM:proj.alongM,sameKpNetworkDistanceM:nearestSameKpDistance(p,networkByKp)});
    }).sort((a,b)=>a.kp-b.kp);
  }
  function neighborResidual(rows,index){
    if(index<=0||index>=rows.length-1)return null;
    const left=rows[index-1],cur=rows[index],right=rows[index+1];
    const span=right.kp-left.kp;
    if(!(span>0))return null;
    const t=(cur.kp-left.kp)/span;
    const expected=left.alongM+t*(right.alongM-left.alongM);
    return Math.abs(cur.alongM-expected);
  }
  function continuityAround(rows,index){
    const out=[];
    if(index>0){
      const a=rows[index-1],b=rows[index],kpM=(b.kp-a.kp)*1000,along=b.alongM-a.alongM;
      if(kpM>0)out.push({side:'prev',kpDeltaM:kpM,alongDeltaM:along,differenceM:Math.abs(along-kpM),reverse:along<=0});
    }
    if(index<rows.length-1){
      const a=rows[index],b=rows[index+1],kpM=(b.kp-a.kp)*1000,along=b.alongM-a.alongM;
      if(kpM>0)out.push({side:'next',kpDeltaM:kpM,alongDeltaM:along,differenceM:Math.abs(along-kpM),reverse:along<=0});
    }
    return out;
  }
  function auditReferenceAnchors(points,opts={}){
    const polyline=opts.polyline;
    if(!Array.isArray(polyline)||polyline.length<2)throw new Error('polyline is required');
    const warningM=finite(opts.warningM)?num(opts.warningM):50;
    const severeM=finite(opts.severeM)?num(opts.severeM):100;
    const rows=projectRows(points,polyline,opts.networkByKp);
    const audited=rows.map((row,i)=>{
      const residual=neighborResidual(rows,i);
      const continuity=continuityAround(rows,i);
      const signals={
        centerlineWarning:row.centerlineOffsetM>warningM,
        centerlineSevere:row.centerlineOffsetM>severeM,
        networkWarning:finite(row.sameKpNetworkDistanceM)&&row.sameKpNetworkDistanceM>warningM,
        networkSevere:finite(row.sameKpNetworkDistanceM)&&row.sameKpNetworkDistanceM>severeM,
        neighborWarning:finite(residual)&&residual>warningM,
        neighborSevere:finite(residual)&&residual>severeM,
        reverseContinuity:continuity.some(x=>x.reverse)
      };
      const severeCount=['centerlineSevere','networkSevere','neighborSevere'].filter(k=>signals[k]).length;
      const warningCount=['centerlineWarning','networkWarning','neighborWarning'].filter(k=>signals[k]).length;
      // Reject only when independent signals agree. One source alone is never treated as absolute truth.
      const rejected=severeCount>=2 || (signals.reverseContinuity&&severeCount>=1);
      const status=rejected?'reject':(severeCount>=1||warningCount>=2?'verify':'accept');
      const reasons=[];
      if(signals.centerlineSevere)reasons.push(`centerline>${severeM}m`);else if(signals.centerlineWarning)reasons.push(`centerline>${warningM}m`);
      if(signals.networkSevere)reasons.push(`same-kp-network>${severeM}m`);else if(signals.networkWarning)reasons.push(`same-kp-network>${warningM}m`);
      if(signals.neighborSevere)reasons.push(`neighbor-residual>${severeM}m`);else if(signals.neighborWarning)reasons.push(`neighbor-residual>${warningM}m`);
      if(signals.reverseContinuity)reasons.push('reverse-continuity');
      return Object.assign({},row,{neighborResidualM:residual,continuity,signals,severeCount,warningCount,status,rejected,reasons});
    });
    return {
      warningM,severeM,
      accepted:audited.filter(x=>x.status==='accept'),
      verify:audited.filter(x=>x.status==='verify'),
      rejected:audited.filter(x=>x.rejected),
      usable:audited.filter(x=>!x.rejected),
      rows:audited
    };
  }
  return{nearestSameKpDistance,projectRows,neighborResidual,continuityAround,auditReferenceAnchors};
});
