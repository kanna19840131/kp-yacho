(function(root){
  'use strict';

  root.KP_YACHO_BETA_CONFIG={
    schemaVersion:1,
    productId:'beta-template',
    productName:'KP野帳 β',
    providerLabel:'configured by 石川義晴',
    warnDistanceM:30,
    maxDistanceM:200,
    kpDecimals:2,
    defaultRate:45,
    routes:[]
  };

  // 有料βのruntimeでは「1パッケージ=1担当路線」に固定する。
  // 利用権確認のないJSONや、途中でKPが逆転する異常アンカーは読み込ませない。
  const Core=root.KPBetaCore;
  const Engine=root.KPRouteEngine;
  if(!Core||!Engine)throw new Error('KP beta runtime dependencies are required');
  const baseValidate=Core.validateRoutePackage.bind(Core);

  function validateMonotonicRoute(route){
    const normalized=Engine.normalizeRoute(route);
    normalized.sections.forEach(section=>{
      const anchors=section.anchors||[];
      let direction=0;
      for(let i=1;i<anchors.length;i++){
        const delta=Number(anchors[i].kp)-Number(anchors[i-1].kp);
        if(Math.abs(delta)<=1e-9)throw new Error('同一section内に同じKPのアンカーが複数あります');
        const sign=Math.sign(delta);
        if(direction===0)direction=sign;
        else if(sign!==direction)throw new Error('同一section内でKPアンカーが途中反転しています');
      }
    });
  }

  Core.validateRoutePackage=function(pkg){
    const p=baseValidate(pkg);
    if(!/^[A-Za-z0-9._-]{1,80}$/.test(p.packageId))throw new Error('packageIdは英数字・._-のみ80文字以内で指定してください');
    if(p.routes.length!==1)throw new Error('有料βは1パッケージにつき1担当路線です');
    if(!p.routes[0]||!String(p.routes[0].id||'').trim())throw new Error('route id is required');
    if(!p.rights||p.rights.confirmed!==true||!String(p.rights.basis||'').trim())throw new Error('利用権確認済みの路線パッケージだけ読み込めます');
    validateMonotonicRoute(p.routes[0]);
    return p;
  };
})(window);
