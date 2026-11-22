/* Regression tests for photo v1.7.1. No external network or test packages. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),css=read('styles.css'),app=read('app.js'),sw=read('sw.js');
const core=read('photo-extras-core.js'),ui=read('photo-extras-ui.js');
const paths=['photo-extras-core.js','photo-extras-ui.js',
 'photo-polaroid.js','photo-polaroid-ui.js','photo-face-ai.js','photo-face-detect.js','photo-camera.js',
 'video/glitch-engine.js','video/film-damage.js','video/camera-osd.js','video/face-ai.js',
 'video/vendor/tracking-min.js','video/vendor/tracking-face-min.js'];
for(const p of paths){
 const version=p.startsWith('video/vendor/')?(p.endsWith('tracking-min.js')?'1.1.3':'1.0.0'):
  p.startsWith('video/')?'1.2.0':
  ['photo-extras-core.js','photo-extras-ui.js'].includes(p)?'1.3.0':
   p==='photo-camera.js'?'1.7.1':'1.4.0';
 assert.ok(html.includes('./'+p+'?v='+version),'Missing or stale script in photo HTML: '+p);
 assert.ok(sw.includes("'./"+p+"'"),'Not cached by photo service worker: '+p);
}
for(const name of ['glitch','cassettes','masks','correction','polaroid','shoot','batch','camera']){
 assert.ok(html.includes('id="panel-'+name+'"'),'Missing panel '+name);
 assert.ok(html.includes('data-tab="'+name+'"'),'Missing nav button '+name);
}
assert.ok(html.includes('STUDIO MOBILE · 1.7.1'));
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
assert.ok(!app.includes('if(state.allFxOff)return frame')&&
 app.includes('state.allFxOff=false')&&app.includes('resetAllPhotoEffects'),
 'Reset must remove the old persistent bypass and restore normal processing');
assert.ok(app.includes('X.adjustment(img,extras.correction)'),
 'Real preview and export must apply professional adjustment');
assert.ok(app.includes('X.colorMatch(p,w,h,extras.colorCopy.target'),
 'Photo reference palette must transform actual pixels');
assert.ok(app.includes('X.glitch(frame,extraGlitch,seed)'),
 'Glitch must run during preview and full export');
assert.ok(app.includes('X.masks(frame,imageMasks)'),
 'Finger paint/face masks must modify final image');
assert.ok(app.includes('opts.cameraCapture?(opts.captureMasks||null):opts.batch?null:extras.masks'),
 'Masks must not leak onto batch or live camera photos and must be applied to captured faces');
assert.ok(app.includes('window.VHSVideoFilmDamage.apply('),
 'Video film damage must be applied to photo output');
assert.ok(app.includes('batchIndex:i,batchCount:n'),
 'Progressive aging needs actual batch index during ZIP export');
assert.ok(ui.includes("maskStage.addEventListener('touchstart'"),
 'iPhone touch painting must use native touch events');
assert.ok(ui.includes("maskStage.addEventListener('touchmove'"));
assert.ok(ui.includes("maskStage.addEventListener('touchend'"));
assert.ok(ui.includes('root.VHSPhotoFaceDetect')&&
 read('photo-face-detect.js').includes('async function haar('),
 'Photo face search must have an actually bundled offline backup');
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
// Use the ACTUAL video glitch implementation on a synthetic photograph.
vm.runInNewContext(read('video/glitch-engine.js'),context);
vm.runInNewContext(read('video/film-damage.js'),context);
const w=180,h=120,source=new Uint8ClampedArray(w*h*4);
for(let i=0;i<source.length;i+=4){
 source[i]=110;source[i+1]=145;source[i+2]=190;source[i+3]=255;
}
let output=new Uint8ClampedArray(source),putCount=0;
const canvas={width:w,height:h,getContext(){return{
 getImageData:()=>({width:w,height:h,data:new Uint8ClampedArray(output)}),
 putImageData(im){output=new Uint8ClampedArray(im.data);putCount++;}
}}};
const settings=X.defaults().glitch;
settings.enabled=true;settings.mode='night';settings.modeStrength=85;
settings.effects.rf=75;settings.effects.dropouts=70;
X.glitch(canvas,settings,9217);
assert.ok(putCount>=1,'The glitch processor must commit its pixels back to the canvas');
assert.ok(output.some((v,i)=>i%4!==3&&v!==source[i]),
 'Night vision and VHS damage must change actual photographic color channels');
const damaged=new Uint8ClampedArray(source);
context.window.VHSVideoFilmDamage.apply(damaged,w,h,{
 enabled:true,type:'both',leak:95,dust:40,grain:45,
 scratches:35,flicker:20,halation:15,seed:42,time:.9
});
assert.ok(damaged.some((v,i)=>i%4!==3&&v!==source[i]),
 'Imported film damage must affect real photo pixels');
assert.ok(app.includes('VHSPhotoPolaroid.look(frame,extras.polaroid)')&&
 app.includes('VHSPhotoPolaroid.render(frame,paperCfg)'),
 'Polaroid appearance and frame must be saved by the real image export pipeline');
assert.ok(app.includes("'undoPhotoFxReset'")&&
 app.includes("state.extras.selectedCassetteId=null"),
 'Reset/undo must be wired and clear an active cassette');
assert.ok(app.includes('syncLegacyControls()'),
 'Cassette selection must synchronize legacy VHS/FILM controls');
assert.ok(css.includes('polaroidGrid'),'Polaroid must render a selectable gallery');
assert.ok(html.includes('id="liveCameraViewport"')&&
  css.includes('overflow:hidden;overscroll-behavior:none')&&
  css.includes('.liveCameraViewport{flex:1 1 0;min-height:0')&&
  app.includes('onPreview:(source,seed,filmSeed,size)=>processImage('),
  'Camera must reserve the shutter space and fit real FX to the remaining viewport');
 assert.ok(html.includes('id="liveCameraDialog"')&&html.includes('id="liveCameraShot"')&&
 html.includes('id="liveCameraFlip"')&&html.includes('id="liveCameraFaces"'),
 'App must present real shutter, front/back camera and static face masks');
assert.ok(app.includes('async function onCameraCaptured(')&&
 app.includes('{cameraCapture:true,captureMasks:selectedMasks,filmSeed:filmSeed??seed}'),
 'Camera photos must run the real editor pipeline with capture masks and chosen export size');
assert.ok(read('photo-camera.js').includes('await onPreview(video,renderingSeed,filmSeed,viewLongSide)')&&
  read('photo-camera.js').includes("previewMode:'exact-photo-pipeline'")&&
  read('photo-camera.js').includes("video.style.filter='none'")&&
  app.includes('onPreview:(source,seed,filmSeed,size)=>processImage('),
  'Live photo camera must use real selected effects and preserve full-resolution shutter');
 assert.ok(html.includes('id="liveCameraNew"')&&
 read('photo-camera.js').includes('function newInterference()')&&
 read('photo-camera.js').includes("newFx.addEventListener('click',newInterference)"),
 'NEW control must be in the camera viewfinder and reroll the current photo interference');
assert.ok(read('photo-camera.js').includes('filmSeed=liveSeed')&&
 read('photo-camera.js').includes('const oldSeed=liveSeed>>>0;')&&
 app.includes('filmSeed:filmSeed??seed'),
 'NEW must randomize VHS seed while keeping FILM grain seed stable until another photo');
assert.ok(app.includes('original=raw;photoName=filename;state.seed=seed;'),
 'Captured original source must remain editable in main editor');
assert.ok(css.includes('#liveCameraDialog')&&sw.includes("'./photo-camera.js'"),
 'Local live camera must be styled and cached offline');
assert.ok(app.includes('await window.VHSPhotoPolaroid.ensureHandFont('),
 'Actual export waits for the selected Cyrillic handwriting font');
assert.ok(html.includes('./photo-face-ai.js?v=1.4.0'),
 'Photo app loads pinned on-device face runtime');
assert.ok(sw.includes('vhs-mobile-v1.7.1')&&sw.includes('blaze_face_full_range.tflite'),
 'Offline worker must cache real face model binaries');
assert.ok(!read('photo-face-detect.js').includes('Promise.race(['),
 'Old 8.5s CDN timeout must be removed from the photo detector');

console.log('PASS: photo 1.7 real live photo effects, NEW VHS reroll, full shutter pipeline and cassette controls');
