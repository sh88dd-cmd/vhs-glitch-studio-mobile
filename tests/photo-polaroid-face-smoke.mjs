/* 1.3 Polaroid geometry, image output and fully offline multi-face fallback. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const views=[];
function mockCanvas(){
 const can={width:1,height:1,draws:[]};
 can.getContext=()=>({
  canvas:can,
  fillRect(){},clearRect(){},strokeRect(){},beginPath(){},rect(){},
  clip(){},save(){},restore(){},translate(){},rotate(){},
  stroke(){},arc(){},fill(){},fillText(){},createPattern(){return{}},
  createLinearGradient(){return{addColorStop(){}}},
  createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)}},
  getImageData(x,y,w,h){return{data:new Uint8ClampedArray((w||can.width)*(h||can.height)*4)}},
  putImageData(){},
  drawImage(...args){can.draws.push(args)}
 });
 views.push(can);return can;
}
const root={},doc={createElement:()=>mockCanvas()};
const context={window:root,document:doc,Math,Number,Array,Object,Date,
 Uint8Array,Uint8ClampedArray,setTimeout,console};
vm.runInNewContext(read('photo-polaroid.js'),context);
const P=root.VHSPhotoPolaroid;
assert.equal(P.styles.length,8,'Eight independent tactile paper frame designs required');
assert.equal(P.looks.length,7,'Seven instant film color looks required');
for(const [w,h] of [[800,800],[1300,650],[600,1100]]){
 const geo=P.geometry(w,h,P.defaults());
 assert.equal(geo.imageW,w);assert.equal(geo.imageH,h);
 assert.ok(geo.bottom>geo.top*2,'Instant prints must have an iconic broad bottom border');
 assert.ok(geo.width>w&&geo.height>h,'Adaptive frame must surround the whole photograph');
 const src={width:w,height:h};
 const dst=P.render(src,{...P.defaults(),enabled:true,style:'classic',note:'Лето, 1997'});
 assert.equal(dst.width,geo.width);assert.equal(dst.height,geo.height);
 const photoBlit=dst.draws.find(d=>d[0]===src);
 assert.ok(photoBlit,'The original photograph must be drawn into the instant film');
 assert.equal(photoBlit[3],w,'Original photo width may not be cropped');
 assert.equal(photoBlit[4],h,'Original photo height may not be cropped');
}
for(const style of P.styles){
 const cfg={...P.defaults(),enabled:true,style:style.id,background:'transparent'};
 const photo=P.render({width:500,height:300},cfg);
 assert.ok(photo.width>500&&photo.height>300,'No style may clip landscape photos');
}
assert.equal(P.render({width:100,height:80},{enabled:false}).width,100,
 'A disabled Polaroid frame may not resize the photo');
assert.equal(P.hydrate({style:'wrong-style'}).style,'classic');

vm.runInNewContext(read('photo-face-detect.js'),context);
root.VHSVideoFaceAI={async create(){throw Error('network blocked for example')}};
let scans=0;
root.tracking={ViolaJones:{
 classifiers:{face:{test:1}},
 detect(data,w,h){
  scans++;assert.equal(data.length,w*h*4);
  return [
   {x:w*.08,y:h*.1,width:w*.12,height:h*.18},
   {x:w*.4,y:h*.28,width:w*.11,height:h*.17},
   {x:w*.69,y:h*.42,width:w*.13,height:h*.20}
  ];
 }
}};
const statuses=[];
const found=await root.VHSPhotoFaceDetect.detect(
 {naturalWidth:2400,naturalHeight:1800},msg=>statuses.push(msg));
assert.equal(scans,3,'Offline Haar must search THREE different photo resolutions');
assert.equal(found.faces.length,3,
 'Offline mode must detect three independent people and dedupe scan scales');
assert.match(found.engine,/Офлайн/);
assert.ok(statuses.some(s=>s.includes('Офлайн'))||found.engine.includes('Офлайн'));
console.log('PASS: 8 realistic adaptive frames, zero image cropping, 7 instant film looks and 3 offline faces without internet');
