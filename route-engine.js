(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPRouteEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const R=6371000;
  const finite=v=>Number.isFinite(Number(v));
  function haversine(a,b){
    const p=Math.PI/180,lat1=Number(a.lat)*p,lat2=Number(b.lat)*p;
    const dlat=(Number(b.lat)-Number(a.lat))*p,dlon=(Number(b.lon)-Number(a.lon))*p;
    const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function xy(lat,lon,lat0){const p=Math.PI/180;return{x:R*Number(lon)*p*Math.cos(Number(lat0)*p),y:R*Number(lat)*p};}
  function validPoint(p,label){if(!p||!finite(p.lat)||!finite(p.lon))throw new Error((label||'point')+' requires finite lat/lon');}
  function project(lat,lon,line){
    if(!Array.isArray(line)||line.length<2)return null;
    const q={lat:Number(lat),lon:Number(lon)};validPoint(q,'query');const P=xy(q.lat,q.lon,q.lat);
    let cum=0,best=null;
    for(let i=0;i<line.length-1;i++){
      const a=line[i],b=line[i+1];validPoint(a,'line['+i+']');validPoint(b,'line['+(i+1)+']');
      const seg=haversine(a,b);if(!(seg>0))continue;
      const A=xy(a.lat,a.lon,q.lat),B=xy(b.lat,b.lon,q.lat),vx=B.x-A.x,vy=B.y-A.y,wx=P.x-A.x,wy=P.y-A.y;
      const len2=vx*vx+vy*vy;if(!(len2>0)){cum+=seg;continue;}
      let t=(wx*vx+wy*vy)/len2;t=Math.max(0,Math.min(1,t));
      const dx=P.x-(A.x+t*vx),dy=P.y-(A.y+t*vy),distM=Math.hypot(dx,dy),alongM=cum+seg*t;
      if(!best||distM<best.distM)best={distM,alongM,segmentIndex:i,t,projectedLat:Number(a.lat)+t*(Number(b.lat)-Number(a.lat)),projectedLon:Number(a.lon)+t*(Number(b.lon)-Number(a.lon))};
      cum+=seg;
    }
    if(best)best.routeLengthM=cum;return best;
  }
  function normalize(route){
    if(!route||typeof route!=='object')throw new Error('route config is required');
    if(route.__kpRouteNormalized)return route;
    const id=String(route.id||route.shortName||route.label||'').trim();if(!id)throw new Error('route.id is required');
    let line=[],anchors=[];
    if(Array.isArray(route.polyline)&&route.polyline.length>=2){
      line=route.polyline.map((p,i)=>{validPoint(p,'polyline['+i+']');return{lat:Number(p.lat),lon:Number(p.lon),addr:p.addr||''};});
      anchors=Array.isArray(route.anchors)?route.anchors.slice():[];
    }else if(Array.isArray(route.points)&&route.points.length>=2){
      line=route.points.map((p,i)=>{validPoint(p,'points['+i+']');return{lat:Number(p.lat),lon:Number(p.lon),addr:p.addr||''};});
      anchors=route.points.filter(p=>finite(p.kp)).map(p=>({kp:Number(p.kp),lat:Number(p.lat),lon:Number(p.lon),addr:p.addr||''}));
    }else throw new Error('route requires polyline[] or points[] with at least 2 points');
    const as=anchors.map((a,i)=>{if(!finite(a.kp))throw new Error('anchors['+i+'].kp is required');validPoint(a,'anchors['+i+']');const p=project(a.lat,a.lon,line);return{kp:Number(a.kp),lat:Number(a.lat),lon:Number(a.lon),addr:a.addr||'',alongM:p.alongM,distToRouteM:p.distM};}).sort((a,b)=>a.alongM-b.alongM);
    const uniq=[];for(const a of as){const prev=uniq[uniq.length-1];if(prev&&Math.abs(a.alongM-prev.alongM)<0.01){if(Math.abs(a.kp-prev.kp)>1e-9)throw new Error('same route position has different KP anchors');continue;}uniq.push(a);}
    if(uniq.length<2)throw new Error('route requires at least 2 distinct KP anchors');
    return{__kpRouteNormalized:true,id,label:String(route.label||id),shortName:String(route.shortName||id),polyline:line,anchors:uniq,metadata:route.metadata||{},source:route.source||null};
  }
  function kpAt(alongM,anchors){
    if(!anchors||anchors.length<2)return null;let l=anchors[0],r=anchors[1],ex=false;
    if(alongM<=anchors[0].alongM){l=anchors[0];r=anchors[1];ex=alongM<l.alongM;}
    else if(alongM>=anchors[anchors.length-1].alongM){l=anchors[anchors.length-2];r=anchors[anchors.length-1];ex=alongM>r.alongM;}
    else for(let i=0;i<anchors.length-1;i++)if(alongM>=anchors[i].alongM&&alongM<=anchors[i+1].alongM){l=anchors[i];r=anchors[i+1];break;}
    const span=r.alongM-l.alongM;if(!(span>0))return null;const t=(alongM-l.alongM)/span;
    return{kp:l.kp+t*(r.kp-l.kp),extrapolated:ex,leftAnchor:l,rightAnchor:r,t};
  }
  function nearestOnRoute(lat,lon,config){
    const route=normalize(config),p=project(lat,lon,route.polyline);if(!p)return null;const k=kpAt(p.alongM,route.anchors);if(!k)return null;
    const a=route.polyline[p.segmentIndex],b=route.polyline[p.segmentIndex+1];
    return{routeId:route.id,routeLabel:route.label,shortName:route.shortName,kp:k.kp,distM:p.distM,alongM:p.alongM,projectedLat:p.projectedLat,projectedLon:p.projectedLon,segmentIndex:p.segmentIndex,t:p.t,extrapolated:k.extrapolated,leftAnchor:k.leftAnchor,rightAnchor:k.rightAnchor,addr:p.t<0.5?(a.addr||''):(b.addr||''),metadata:route.metadata};
  }
  function normalizeRoutes(routes){return(Array.isArray(routes)?routes:Object.values(routes||{})).map(normalize);}
  function findNearestRoute(lat,lon,routes,mode='auto'){
    const list=normalizeRoutes(routes);if(!list.length)return null;
    if(mode!=='auto'){const fixed=list.find(r=>r.id===mode||r.shortName===mode||r.label===mode);return fixed?nearestOnRoute(lat,lon,fixed):null;}
    let best=null;for(const route of list){const r=nearestOnRoute(lat,lon,route);if(r&&(!best||r.distM<best.distM))best=r;}return best;
  }
  function formatKp(v,d=2){const n=Number(v);return Number.isFinite(n)?n.toFixed(d):String(v??'');}
  return{EARTH_RADIUS_M:R,haversineM:haversine,projectPointToPolyline:project,normalizeRoute:normalize,normalizeRoutes,kpAtAlongM:kpAt,nearestOnRoute,findNearestRoute,formatKp};
});
