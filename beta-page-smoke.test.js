'use strict';
const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('beta.html','utf8');
let count=0;const ok=()=>count++;

for(const marker of ['推定KP','施工前登録（面積は後で）','週間Noを1に戻す','バックアップJSON','担当路線パッケージ読込','対象路線外やKPアンカー範囲外']){
  assert.ok(html.includes(marker),`missing marker: ${marker}`);ok();
}
for(const forbidden of ['株式会社RYUTEC','open-meteo.com','overpass-api.de','nominatim.openstreetmap.org','近くのコンビニ','交通量確認']){
  assert.ok(!html.includes(forbidden),`beta page must not include: ${forbidden}`);ok();
}
for(const src of ['./route-engine.js','./beta-app-core.js','./beta-route-config.js']){
  assert.ok(html.includes(`src="${src}"`),`missing script: ${src}`);ok();
}
const ids=new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]));
const used=[...html.matchAll(/byId\('([^']+)'\)/g)].map(m=>m[1]);
for(const id of used)assert.ok(ids.has(id),`byId references missing element: ${id}`);
ok();

console.log(`beta page smoke tests: ${count}/${count} passed; ${ids.size} ids checked`);
