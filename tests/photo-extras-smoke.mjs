/* Regression tests for photo v1.2.0. No external network or test packages. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),css=read('styles.css'),app=read('app.js'),sw=read('sw.js');
const core=read('photo-extras-core.js'),ui=read('photo-extras-ui.js');
const paths=['photo-extras-core.js','photo-extras-ui.js',
 'video/glitch-engine.js','video/film-damage.js','video/camera-osd.js','video/face-ai.js'];
for(const p of paths){
 assert.ok(html.includes('./'+p+'?v=1.2.0'),'Missing or stale script in photo HTML: '+p);
 assert.ok(sw.includes("'./"+p+"'"),'Not cached by photo service worker: '+p);
}
for(const name of ['glitch','cassettes','masks','correction','batch','camera']){
 assert.ok(html.includes('id="panel-'+name+'"'),'Missing panel '+name);
 assert.ok(html.includes('data-tab="'+name+'"'),'Missing nav button '+name);
}
assert.ok(html.includes('STUDIO MOBILE · 1.2.0'));
assert.ok(html.includes('id="allPhotoFxToggle"'));
assert.ok(html.includes('id="photoHelpToggle"'));
assert.ok(css.includes('.tabs{overflow-x:auto'),
 'Expanded mobile tabs must scroll rather than collapse into tiny touch targets');
assert.ok(css.includes('photoHelpVisible .photoHelpMark'),
 'Global help switch should reveal per-function ? controls');
assert.ok(!ui.includes("['zoom','ZOOM']")&&
 ui.includes("['counter','Счётчик ленты']"),
 'ZOOM must be removed from photo camera settings completely');
assert.ok(app.includes('zoom:false,rec:false,play:false,date:false,battery:false'),
 'Photo camera must never draw ZOOM');
assert.ok(app.includes('if(state.allFxOff)return frame'),
 'Effect bypass must really return the untouched source pixels');
assert.ok(app.includes('X.adjustment(img,extras.correction)'),
 'Real preview and export must apply professional adjustment');
assert.ok(app.includes('X.colorMatch(p,w,h,extras.colorCopy.target'),
 'Photo reference palette must transform actual pixels');
assert.ok(app.includes('X.glitch(frame,extraGlitch,seed)'),
 'Glitch must run during preview and full export');
assert.ok(app.includes('X.masks(frame,extras.masks)'),
 'Finger paint/face masks must modify final image');
assert.ok(app.includes('X.masks(frame,extras.masks)')&&app.includes('!opts.batch'),
 'Masks must not leak onto other unrelated photos in batch');
assert.ok(app.includes('window.VHSVideoFilmDamage.apply('),
 'Video film damage must be applied to photo output');
assert.ok(app.includes('batchIndex:i,batchCount:n'),
 'Progressive aging needs actual batch index during ZIP export');
assert.ok(ui.includes("maskStage.addEventListener('touchstart'"),
 'iPhone touch painting must use native touch events');
assert.ok(ui.includes("maskStage.addEventListener('touchmove'"));
assert.ok(ui.includes("maskStage.addEventListener('touchend'"));
assert.ok(ui.includes('const engine=await root.VHSVideoFaceAI.create()'),
 'Face finder must start on explicit user request');
const context={window:{},document:{createElement:()=>({})},
 Uint8ClampedArray,Uint8Array,Math,Date,Number,Object,Array,Blob};
vm.runInNewContext(core,context);
const X=context.window.VHSPhotoExtras;
const fresh=X.defaults();
assert.equal(fresh.correction.brightness,0);
assert.equal(Object.keys(fresh.glitch.effects).length,15);
assert.equal(X.effects.length,15);
assert.equal(X.factory.length,6);
assert.equal(X.activeAdjustment(fresh.correction),false);
const same=X.hydrate({correction:{brightness:22},glitch:{effects:{rf:65}}});
assert.equal(same.correction.brightness,22);
assert.equal(same.glitch.effects.rf,65);
assert.equal(same.glitch.effects.tapeChew,0);
const image={width:4,height:4,data:new Uint8ClampedArray(4*4*4)};
for(let i=0;i<image.data.length;i+=4){
 image.data[i]=100;image.data[i+1]=120;image.data[i+2]=140;image.data[i+3]=255;
}
X.adjustment(image,{brightness:35});
assert.ok(image.data[0]>100,'Brightness slider must actually increase R');
assert.ok(image.data[1]>120,'Brightness slider must actually increase G');
const before=image.data[0];
X.adjustment(image,{exposure:-1,contrast:0});
assert.ok(image.data[0]<before,'Exposure -1 must darken actual pixels');
const warm={width:2,height:2,data:new Uint8ClampedArray([
 120,120,120,255,120,120,120,255,120,120,120,255,120,120,120,255
])};
X.adjustment(warm,{temperature:70,tint:20});
assert.ok(warm.data[0]>warm.data[2],'Warmth should increase red relative to blue');
const p=X.palette(warm.data,2,2);
assert.equal(p.mean.length,3);assert.equal(p.spread.length,3);
assert.equal(X.mix({v:0,inner:{strength:10}},{v:100,inner:{strength:70}},.5).inner.strength,40);
console.log('PASS: photo app integration, 15 glitch effects, camera without zoom, BATCH, correction pixels and help UI');
