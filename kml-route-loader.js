(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./route-engine.js'):root.KPRouteEngine);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPKmlRouteLoader=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(engine){
  'use strict';
  if(!engine)throw new Error('KPRouteEngine is required');

  function decodeXml(s){return String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'");}
  function parseCoordinateText(text){
    const out=[];
    for(const token of String(text||'').trim().split(/\s+/)){
      if(!token)continue;
      const parts=token.split(',');
      const lon=Number(parts[0]),lat=Number(parts[1]);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      out.push({lat,lon});
    }
    return out;
  }
  function placemarkName(block,index){
    const m=String(block).match(/<name(?:\s[^>]*)?>([\s\S]*?)<\/name>/i);
    return m?decodeXml(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').trim()):`section-${index+1}`;
  }
  function parseLineStrings(kmlText){
    const kml=String(kmlText||'');
    const sections=[];
    const placemarks=[...kml.matchAll(/<Placemark(?:\s[^>]*)?>([\s\S]*?)<\/Placemark>/gi)];
    if(placemarks.length){
      placemarks.forEach((pm,pi)=>{
        const body=pm[1],name=placemarkName(body,pi);
        const lines=[...body.matchAll(/<LineString(?:\s[^>]*)?>([\s\S]*?)<\/LineString>/gi)];
        lines.forEach((lm,li)=>{
          const cm=lm[1].match(/<coordinates(?:\s[^>]*)?>([\s\S]*?)<\/coordinates>/i);
          const polyline=cm?parseCoordinateText(cm[1]):[];
          if(polyline.length>=2)sections.push({id:lines.length>1?`${name}-${li+1}`:name,name,polyline});
        });
      });
    }else{
      const lines=[...kml.matchAll(/<LineString(?:\s[^>]*)?>([\s\S]*?)<\/LineString>/gi)];
      lines.forEach((lm,li)=>{
        const cm=lm[1].match(/<coordinates(?:\s[^>]*)?>([\s\S]*?)<\/coordinates>/i);
        const polyline=cm?parseCoordinateText(cm[1]):[];
        if(polyline.length>=2)sections.push({id:`section-${li+1}`,name:`section-${li+1}`,polyline});
      });
    }
    if(!sections.length)throw new Error('KMLに利用可能なLineStringがありません');
    return sections;
  }
  function assignAnchors(sections,anchors,maxAnchorDistanceM=100){
    const groups=sections.map(()=>[]);
    for(const a of anchors||[]){
      if(!Number.isFinite(Number(a.kp))||!Number.isFinite(Number(a.lat))||!Number.isFinite(Number(a.lon)))throw new Error('anchor requires kp/lat/lon');
      let best=null;
      sections.forEach((s,i)=>{
        const p=engine.projectPointToPolyline(Number(a.lat),Number(a.lon),s.polyline);
        if(p&&(!best||p.distM<best.distM))best={index:i,distM:p.distM};
      });
      if(!best||best.distM>maxAnchorDistanceM)throw new Error(`KP${a.kp} anchor is ${best?best.distM.toFixed(1):'--'}m from KML`);
      groups[best.index].push({kp:Number(a.kp),lat:Number(a.lat),lon:Number(a.lon),addr:a.addr||''});
    }
    return groups;
  }
  function buildRouteConfigFromKml(kmlText,opts={}){
    const id=String(opts.id||opts.shortName||opts.label||'').trim();
    if(!id)throw new Error('route id is required');
    const parsed=parseLineStrings(kmlText);
    const groups=assignAnchors(parsed,opts.anchors||[],Number.isFinite(Number(opts.maxAnchorDistanceM))?Number(opts.maxAnchorDistanceM):100);
    const sections=parsed.map((s,i)=>({id:`${id}-${i+1}`,polyline:s.polyline,anchors:groups[i],metadata:{kmlName:s.name}}));
    const unusable=sections.filter(s=>s.anchors.length<2);
    if(unusable.length)throw new Error(`各sectionに2点以上のKPアンカーが必要です: ${unusable.map(s=>s.metadata.kmlName).join(', ')}`);
    const route={id,label:String(opts.label||id),shortName:String(opts.shortName||id),sections,metadata:opts.metadata||{},source:opts.source||{type:'kml'}};
    engine.normalizeRoute(route);
    return route;
  }
  return{parseCoordinateText,parseLineStrings,assignAnchors,buildRouteConfigFromKml};
});
