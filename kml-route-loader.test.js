'use strict';
const assert=require('assert');
const e=require('./route-engine.js');
const k=require('./kml-route-loader.js');
let n=0;const ok=()=>n++;

const coords=k.parseCoordinateText('141.0000,43.0000,0 141.0010,43.0005,0\n141.0020,43.0010');
assert.strictEqual(coords.length,3);assert.deepStrictEqual(coords[0],{lat:43,lon:141});ok();

const kml=`<?xml version="1.0"?><kml><Document><Placemark><name>sample road</name><LineString><coordinates>
141.0000,43.0000,0 141.0010,43.0005,0 141.0020,43.0010,0
</coordinates></LineString></Placemark></Document></kml>`;
const lines=k.parseLineStrings(kml);assert.strictEqual(lines.length,1);assert.strictEqual(lines[0].name,'sample road');assert.strictEqual(lines[0].polyline.length,3);ok();

const route=k.buildRouteConfigFromKml(kml,{id:'TEST',label:'Test Road',shortName:'T',anchors:[{kp:10,lat:43,lon:141},{kp:10.2,lat:43.001,lon:141.002}]});
const mid=e.nearestOnRoute(43.0005,141.001,route);assert.ok(Math.abs(mid.kp-10.1)<0.003);assert.ok(mid.distM<1);ok();

const multi=`<kml><Document>
<Placemark><name>A</name><LineString><coordinates>141,43 141.001,43</coordinates></LineString></Placemark>
<Placemark><name>B</name><LineString><coordinates>141,43.01 141.001,43.01</coordinates></LineString></Placemark>
</Document></kml>`;
const mroute=k.buildRouteConfigFromKml(multi,{id:'MULTI',anchors:[
{kp:1,lat:43,lon:141},{kp:1.1,lat:43,lon:141.001},
{kp:9,lat:43.01,lon:141},{kp:9.1,lat:43.01,lon:141.001}
]});
assert.strictEqual(mroute.sections.length,2);let r=e.nearestOnRoute(43.01,141.0005,mroute);assert.strictEqual(r.sectionId,'MULTI-2');assert.ok(Math.abs(r.kp-9.05)<0.003);ok();

assert.throws(()=>k.buildRouteConfigFromKml(kml,{id:'BAD',anchors:[{kp:1,lat:43,lon:141}]}),/2点以上/);ok();
assert.throws(()=>k.buildRouteConfigFromKml(kml,{id:'FAR',anchors:[{kp:1,lat:44,lon:142},{kp:2,lat:44.1,lon:142.1}],maxAnchorDistanceM:20}),/from KML/);ok();
assert.throws(()=>k.parseLineStrings('<kml></kml>'),/LineString/);ok();
console.log(`kml-route-loader tests: ${n}/${n} passed`);
