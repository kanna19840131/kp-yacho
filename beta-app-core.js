(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.KPBetaCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SCHEMA_VERSION=1;
  const MAX_ARCHIVES=60;
  const SIDES=['R','L','中央','-'];
  const SESSIONS=['午前','午後'];

  const num=v=>{
    const n=Number(v);
    return Number.isFinite(n)?n:0;
  };
  const finite=v=>Number.isFinite(Number(v));
  const clean=v=>String(v??'').trim();
  const round2=v=>Math.round(Number(v)*100)/100;
  const clone=v=>JSON.parse(JSON.stringify(v));

  function todayLocal(date=new Date()){
    const d=new Date(date);
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function createDefaultState(opts={}){
    return {
      schemaVersion:SCHEMA_VERSION,
      date:clean(opts.date)||todayLocal(),
      routeId:clean(opts.routeId),
      rate:finite(opts.rate)&&Number(opts.rate)>0?Number(opts.rate):45,
      inTon:'',
      leftTon:'',
      regPhoto:false,
      nextNo:1,
      items:[],
      archives:[]
    };
  }

  function maxNoFromItems(items){
    let max=0;
    (Array.isArray(items)?items:[]).forEach(it=>{
      const n=Number(it&&it.no);
      if(Number.isFinite(n)&&n>max)max=n;
    });
    return max;
  }

  function normalizeState(raw,defaults={}){
    const base=createDefaultState(defaults);
    if(!raw||typeof raw!=='object')return base;
    const state={
      schemaVersion:SCHEMA_VERSION,
      date:clean(raw.date)||base.date,
      routeId:clean(raw.routeId)||base.routeId,
      rate:finite(raw.rate)&&Number(raw.rate)>0?Number(raw.rate):base.rate,
      inTon:finite(raw.inTon)&&Number(raw.inTon)>=0?String(raw.inTon):'',
      leftTon:finite(raw.leftTon)&&Number(raw.leftTon)>=0?String(raw.leftTon):'',
      regPhoto:!!raw.regPhoto,
      nextNo:finite(raw.nextNo)&&Number(raw.nextNo)>=1?Math.floor(Number(raw.nextNo)):1,
      items:Array.isArray(raw.items)?clone(raw.items):[],
      archives:Array.isArray(raw.archives)?clone(raw.archives).slice(-MAX_ARCHIVES):[]
    };
    const maxNo=maxNoFromItems(state.items);
    if(state.nextNo<=maxNo)state.nextNo=maxNo+1;
    return state;
  }

  function calcArea(shape,input={}){
    const w=Math.max(0,num(input.w));
    const l1=Math.max(0,num(input.l1));
    const l2=Math.max(0,num(input.l2));
    let area=0,formula='--';
    if(shape==='rect'){
      area=w*l1;
      formula=`${w} × ${l1}`;
    }else if(shape==='tri'){
      area=w*l1/2;
      formula=`${w} × ${l1} ÷ 2`;
    }else if(shape==='trap'){
      area=w*(l1+l2)/2;
      formula=`${w} × (${l1} + ${l2}) ÷ 2`;
    }else if(shape==='manual'){
      area=Math.max(0,num(input.manualArea));
      formula=`直接入力 ${round2(area)}`;
    }else{
      throw new Error('unknown shape');
    }
    return {area:round2(area),formula};
  }

  function estimateTon(area,rate){
    const r=Number(rate);
    return r>0?Number(area||0)/r:0;
  }

  function gpsDecision(result,accuracy,warnDistanceM=30,maxDistanceM=200){
    const acc=Math.max(0,num(accuracy));
    if(!result||!finite(result.kp)||!finite(result.distM)){
      return {status:'unavailable',estimated:null,accuracyM:acc,message:'KP算出不可'};
    }
    const dist=Math.max(0,Number(result.distM));
    if(result.extrapolated){
      return {
        status:'extrapolated',estimated:null,accuracyM:acc,distM:dist,
        routeId:clean(result.routeId),routeLabel:clean(result.routeLabel||result.shortName||result.routeId),
        message:'KPアンカー範囲外：自動KPを採用しません'
      };
    }
    if(dist>Number(maxDistanceM)){
      return {
        status:'out',estimated:null,accuracyM:acc,distM:dist,
        routeId:clean(result.routeId),routeLabel:clean(result.routeLabel||result.shortName||result.routeId),
        message:`対象路線外：登録路線まで約${Math.round(dist)}m`
      };
    }
    const estimated={
      routeId:clean(result.routeId),
      routeLabel:clean(result.routeLabel||result.shortName||result.routeId),
      shortName:clean(result.shortName||result.routeId),
      kp:Number(result.kp),
      distM:dist,
      accuracyM:acc,
      extrapolated:!!result.extrapolated,
      sectionId:clean(result.sectionId)
    };
    if(dist>Number(warnDistanceM)){
      return {status:'warn',estimated,accuracyM:acc,distM:dist,message:`注意：登録路線まで約${Math.round(dist)}m`};
    }
    return {status:'ok',estimated,accuracyM:acc,distM:dist,message:'推定KP取得'};
  }

  function normalizeSide(side){
    return SIDES.includes(side)?side:'-';
  }

  function normalizeSession(session){
    return SESSIONS.includes(session)?session:'午前';
  }

  function selectEstimatedKp(decision,side){
    if(!decision||!decision.estimated||!['ok','warn'].includes(decision.status))throw new Error('usable estimated KP is required');
    const e=decision.estimated;
    return {
      kp:Number(e.kp),
      side:normalizeSide(side),
      routeId:clean(e.routeId),
      routeLabel:clean(e.routeLabel||e.shortName||e.routeId),
      source:'estimated',
      gpsDistM:Number(e.distM)||0,
      gpsAccuracyM:Number(e.accuracyM)||0,
      capturedAt:new Date().toISOString()
    };
  }

  function selectManualKp(kp,side,routeId='',routeLabel=''){
    if(!finite(kp)||Number(kp)<0)throw new Error('manual KP must be a non-negative number');
    return {
      kp:Number(kp),
      side:normalizeSide(side),
      routeId:clean(routeId),
      routeLabel:clean(routeLabel||routeId),
      source:'manual',
      capturedAt:new Date().toISOString()
    };
  }

  function nextNo(state,requested){
    if(finite(requested)&&Number(requested)>=1)return Math.floor(Number(requested));
    return Math.max(1,Math.floor(Number(state&&state.nextNo)||1));
  }

  function normalizeRecord(record){
    const out=Object.assign({},record||{});
    out.no=nextNo({nextNo:1},out.no);
    out.branch=clean(out.branch);
    out.kp=finite(out.kp)?Number(out.kp):null;
    out.side=normalizeSide(out.side);
    out.session=normalizeSession(out.session);
    out.area=round2(Math.max(0,num(out.area)));
    out.date=clean(out.date)||todayLocal();
    out.routeId=clean(out.routeId);
    out.routeLabel=clean(out.routeLabel||out.routeId);
    out.memo=clean(out.memo);
    out.photoBefore=!!out.photoBefore;
    out.photoAfter=!!out.photoAfter;
    out.started=!!out.started;
    out.source=clean(out.source)||'manual';
    out.order=finite(out.order)?Number(out.order):Date.now()+Math.random();
    return out;
  }

  function createStartedRecord(args={}){
    const selection=args.selection;
    if(!selection||!finite(selection.kp))throw new Error('KP selection is required');
    const no=nextNo(args.state,args.no);
    const record=normalizeRecord({
      date:args.date,
      routeId:selection.routeId||args.routeId,
      routeLabel:selection.routeLabel||args.routeLabel,
      session:args.session,
      no,
      branch:args.branch,
      kp:selection.kp,
      side:selection.side,
      shape:'manual',
      formula:'未計測',
      area:0,
      memo:clean(args.memo)||'施工前登録',
      photoBefore:true,
      photoAfter:false,
      started:true,
      source:selection.source,
      gpsDistM:selection.gpsDistM,
      gpsAccuracyM:selection.gpsAccuracyM,
      selectedAt:selection.capturedAt,
      order:Date.now()+Math.random()
    });
    return {record,nextNo:Math.max(Number(args.state&&args.state.nextNo)||1,no+1)};
  }

  function createCompletedRecord(args={}){
    const kp=Number(args.kp);
    if(!Number.isFinite(kp)||kp<0)throw new Error('KP is required');
    const area=Number(args.area);
    if(!(area>0))throw new Error('area must be greater than 0');
    const no=nextNo(args.state,args.no);
    const record=normalizeRecord({
      date:args.date,
      routeId:args.routeId,
      routeLabel:args.routeLabel,
      session:args.session,
      no,
      branch:args.branch,
      kp,
      side:args.side,
      shape:args.shape,
      w:clean(args.w),
      l1:clean(args.l1),
      l2:clean(args.l2),
      manualArea:clean(args.manualArea),
      formula:args.formula,
      area,
      memo:args.memo,
      photoBefore:args.photoBefore,
      photoAfter:args.photoAfter,
      started:false,
      source:args.source||'manual',
      gpsDistM:args.gpsDistM,
      gpsAccuracyM:args.gpsAccuracyM,
      selectedAt:args.selectedAt,
      order:args.order
    });
    return {record,nextNo:Math.max(Number(args.state&&args.state.nextNo)||1,no+1)};
  }

  function upsertRecord(state,record,index=null){
    const next=normalizeState(state);
    const rec=normalizeRecord(record);
    if(index===null||index===undefined){
      next.items.push(rec);
    }else{
      const i=Number(index);
      if(!Number.isInteger(i)||i<0||i>=next.items.length)throw new Error('invalid edit index');
      if(!finite(rec.order))rec.order=next.items[i].order;
      next.items[i]=rec;
    }
    next.nextNo=Math.max(next.nextNo,rec.no+1,maxNoFromItems(next.items)+1);
    return next;
  }

  function deleteRecord(state,index){
    const next=normalizeState(state);
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>=next.items.length)throw new Error('invalid delete index');
    next.items.splice(i,1);
    return next;
  }

  function dailyTotals(state){
    const items=Array.isArray(state&&state.items)?state.items:[];
    let am=0,pm=0;
    items.forEach(it=>{
      const a=Math.max(0,num(it.area));
      if(it.session==='午後')pm+=a; else am+=a;
    });
    am=round2(am); pm=round2(pm);
    const total=round2(am+pm);
    const rate=Number(state&&state.rate)>0?Number(state.rate):45;
    const inTon=Math.max(0,num(state&&state.inTon));
    const leftTon=Math.max(0,num(state&&state.leftTon));
    const usedTon=inTon>0?Math.max(0,inTon-leftTon):0;
    return {
      am,pm,total,
      estimatedTon:estimateTon(total,rate),
      inTon,leftTon,usedTon,
      m2perTon:usedTon>0?total/usedTon:null,
      remainArea:leftTon>0?leftTon*rate:null,
      photoOk:items.filter(x=>x.photoBefore&&x.photoAfter).length,
      photoPending:items.filter(x=>!(x.photoBefore&&x.photoAfter)).length,
      count:items.length
    };
  }

  function archiveCurrentDay(state){
    const current=normalizeState(state);
    if(!current.items.length&&!current.inTon&&!current.leftTon&&!current.regPhoto)return current;
    const archive={
      archivedAt:new Date().toISOString(),
      date:current.date,
      routeId:current.routeId,
      rate:current.rate,
      inTon:current.inTon,
      leftTon:current.leftTon,
      regPhoto:current.regPhoto,
      items:clone(current.items),
      totals:dailyTotals(current)
    };
    current.archives=(current.archives||[]).concat([archive]).slice(-MAX_ARCHIVES);
    return current;
  }

  function startNewDay(state,nextDate){
    const next=archiveCurrentDay(state);
    next.date=clean(nextDate)||todayLocal();
    next.inTon='';
    next.leftTon='';
    next.regPhoto=false;
    next.items=[];
    next.nextNo=Math.max(next.nextNo,maxNoFromItems(state&&state.items)+1);
    return normalizeState(next,{date:next.date,routeId:next.routeId,rate:next.rate});
  }

  function validateRoutePackage(pkg){
    if(!pkg||pkg.type!=='kp-yacho-route-package')throw new Error('KP野帳βの路線パッケージではありません');
    if(Number(pkg.schemaVersion)!==SCHEMA_VERSION)throw new Error('未対応の路線パッケージ形式です');
    const packageId=clean(pkg.packageId);
    if(!packageId)throw new Error('route packageId is required');
    if(!Array.isArray(pkg.routes)||!pkg.routes.length)throw new Error('route package requires routes[]');
    return {
      type:'kp-yacho-route-package',
      schemaVersion:SCHEMA_VERSION,
      packageId,
      label:clean(pkg.label)||packageId,
      issuedAt:clean(pkg.issuedAt),
      rights:pkg.rights&&typeof pkg.rights==='object'?clone(pkg.rights):{},
      metadata:pkg.metadata&&typeof pkg.metadata==='object'?clone(pkg.metadata):{},
      routes:clone(pkg.routes)
    };
  }

  function makeBackupEnvelope(state,productId){
    return {
      type:'kp-yacho-beta-backup',
      schemaVersion:SCHEMA_VERSION,
      productId:clean(productId),
      exportedAt:new Date().toISOString(),
      state:normalizeState(state)
    };
  }

  function restoreBackupEnvelope(envelope,expectedProductId=''){
    if(!envelope||envelope.type!=='kp-yacho-beta-backup')throw new Error('KP野帳βのバックアップではありません');
    if(Number(envelope.schemaVersion)!==SCHEMA_VERSION)throw new Error('未対応のバックアップ形式です');
    const expected=clean(expectedProductId);
    const actual=clean(envelope.productId);
    if(expected&&actual&&expected!==actual)throw new Error('別の担当路線用バックアップです');
    return normalizeState(envelope.state);
  }

  function makeSummary(state,routeLabel=''){
    const s=normalizeState(state);
    const t=dailyTotals(s);
    const lines=[
      'KP野帳 β 施工サマリー',
      `日付：${s.date}`,
      `路線：${clean(routeLabel)||s.routeId||'--'}`,
      `午前：${t.am.toFixed(2)}㎡`,
      `午後：${t.pm.toFixed(2)}㎡`,
      `合計：${t.total.toFixed(2)}㎡`,
      `推定使用合材：${t.estimatedTon.toFixed(2)}t（${Number(s.rate).toFixed(1)}㎡/t）`
    ];
    if(t.inTon>0){
      lines.push(`搬入量：${t.inTon.toFixed(2)}t`);
      lines.push(`残量：${t.leftTon.toFixed(2)}t`);
      lines.push(`使用合材：${t.usedTon.toFixed(2)}t`);
      lines.push(`㎡/t：${t.m2perTon===null?'--':t.m2perTon.toFixed(1)}`);
      lines.push(`残り施工可能：${t.remainArea===null?'--':t.remainArea.toFixed(0)}㎡（推定）`);
    }
    lines.push(`規制状況撮影：${s.regPhoto?'済':'未確認'}`);
    lines.push(`施工箇所：${t.count}件`);
    lines.push(`写真確認：OK ${t.photoOk}件 / 未確認 ${t.photoPending}件`);
    return lines.join('\n');
  }

  return {
    SCHEMA_VERSION,MAX_ARCHIVES,SIDES,SESSIONS,
    todayLocal,createDefaultState,normalizeState,maxNoFromItems,
    calcArea,estimateTon,gpsDecision,selectEstimatedKp,selectManualKp,
    normalizeRecord,createStartedRecord,createCompletedRecord,upsertRecord,deleteRecord,
    dailyTotals,archiveCurrentDay,startNewDay,validateRoutePackage,makeBackupEnvelope,restoreBackupEnvelope,makeSummary
  };
});
