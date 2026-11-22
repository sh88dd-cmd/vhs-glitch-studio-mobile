/* Real Chromium fake-camera E2E: no server APIs, no external CDN.
   Exercises actual MediaDevices.getUserMedia, real live effects, shutter,
   processed instant-film output, iOS-style save/download, lens switch,
   and releasing the camera when closed. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'
]});
const context=await browser.newContext({
 acceptDownloads:true,permissions:['camera'],viewport:{width:390,height:844},
 isMobile:true,hasTouch:true
});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',e=>pageErrors.push('JS: '+e.message));
await page.route('**/*',route=>{
 const url=route.request().url();
 if(url.startsWith('http://127.0.0.1:8765/'))return route.continue();
 route.abort();
});
await page.addInitScript(()=>{
 // Constrain only this synthetic GitHub CI camera to 640×480 so actual
 // processing and full image export can be smoke-tested in a few seconds.
 const original=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
 if(original)navigator.mediaDevices.getUserMedia=(opts)=>
  original({audio:false,video:{width:{ideal:640},height:{ideal:480},
   facingMode:opts?.video?.facingMode||{ideal:'environment'}}});
});
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>document.querySelector('#filmGrid')?.children.length>0,null,{timeout:12000});
 // Confirm the actual VHS photo engine processes live frames before shutter.
 await page.evaluate(()=>{
  window.__capturedVhsSeeds=[];
  // The engine API is Object.freeze()'d; instrument its global binding,
  // not a readonly method property.
  const engine=window.VHSPhotoEngine;
  window.VHSPhotoEngine=Object.freeze({...engine,apply(...args){
   window.__capturedVhsSeeds.push(args[3].seed);
   return engine.apply(...args);
  }});
 });
 // An instant-film preset should appear in BOTH the live view and captured photo.
 await page.locator('button[data-tab="polaroid"]').click();
 await page.locator('#polaroidEnabled').check();
 await page.locator('#polaroidNote').fill('Снято на iPhone');
 await page.locator('#liveCameraOpenTop').click();
 await page.waitForFunction(()=>{
  const s=document.getElementById('liveCameraStatus').textContent;
  return s.includes('Плавный предпросмотр')||s.includes('Камера готова');
 },null,{timeout:20000});
 const started=await page.evaluate(()=>{
  const v=document.getElementById('liveCameraVideo');
  return{open:document.getElementById('liveCameraDialog').open,
   videoWidth:v.videoWidth,videoHeight:v.videoHeight,
   source:!!v.srcObject,trackState:v.srcObject?.getVideoTracks()[0]?.readyState};
 });
 console.log('Camera opened:',started);
 assert.ok(started.open&&started.videoWidth>20&&started.videoHeight>20);
 assert.equal(started.trackState,'live');

 await page.waitForFunction(()=>{
  const cv=document.getElementById('liveCameraFx');
  return cv.width>20&&cv.height>20&&!cv.hidden&&
   window.__capturedVhsSeeds.length>0;
 },null,{timeout:30000});
 const preview=await page.evaluate(()=>{
  const e=document.getElementById('liveCameraFx');
  return{width:e.width,height:e.height,visible:!e.hidden};
 });
 assert.ok(preview.visible,'The actual VHS/FILM preview must cover the live camera stream');
 assert.ok(preview.width>0&&preview.height>0);
 const fast=await page.evaluate(()=>({
  appliedStills:window.__capturedVhsSeeds.length,
  videoFilter:document.getElementById('liveCameraVideo').style.filter,
  cameraStillVisible:!document.getElementById('liveCameraVideo').hidden,
  newButtonVisible:!document.getElementById('liveCameraNew').hidden
 }));
 assert.ok(fast.appliedStills>0,
  'The real VHS photo processor must run in LIVE before shutter');
 assert.equal(fast.videoFilter,'none',
  'No approximate CSS-only treatment must replace the actual FILM/VHS engine');
 const previewSeed=await page.evaluate(()=>window.__capturedVhsSeeds.at(-1));
 assert.ok(Number.isFinite(previewSeed));
 const geometry=await page.evaluate(()=>{
  const st=document.getElementById('liveCameraStage');
  const fx=document.getElementById('liveCameraFx');
  return{stage:st.clientWidth/st.clientHeight,frame:fx.width/fx.height};
 });
 assert.ok(Math.abs(geometry.stage-geometry.frame)<0.02,
  'Viewfinder stage must match processed Polaroid frame aspect ratio');
 // Camera is a fixed single screen: no scrolling, and the shutter stays
 // within the viewport on compact and regular iPhone-sized displays.
 for(const [width,height] of [[390,844],[375,667],[320,568]]){
  await page.setViewportSize({width,height});
  await page.waitForTimeout(120);
  const fitted=await page.evaluate(()=>{
   const dialog=document.getElementById('liveCameraDialog');
   const viewport=document.getElementById('liveCameraViewport');
   const stage=document.getElementById('liveCameraStage');
   const shutter=document.getElementById('liveCameraShot');
   const actions=document.querySelector('.liveCameraActions');
   const rect=e=>e.getBoundingClientRect();
   const d=rect(dialog),v=rect(viewport),s=rect(stage),b=rect(shutter),a=rect(actions);
   dialog.scrollTop=500;
   return {
    scrollTop:dialog.scrollTop,
    scrollHeight:dialog.scrollHeight,clientHeight:dialog.clientHeight,
    dialogBottom:d.bottom,shutterBottom:b.bottom,shutterTop:b.top,
    actionsBottom:a.bottom,stageBottom:s.bottom,stageTop:s.top,
    viewportTop:v.top,viewportBottom:v.bottom
   };
  });
  assert.equal(fitted.scrollTop,0,
   `Photo camera must not scroll at ${width}x${height}`);
  assert.ok(fitted.scrollHeight<=fitted.clientHeight+2,
   `All UI must fit the fixed photo camera at ${width}x${height}: ${JSON.stringify(fitted)}`);
  assert.ok(fitted.shutterTop>=0&&fitted.shutterBottom<=fitted.dialogBottom+1,
   `Shutter must remain on-screen at ${width}x${height}: ${JSON.stringify(fitted)}`);
  assert.ok(fitted.stageTop>=fitted.viewportTop-1&&
   fitted.stageBottom<=fitted.viewportBottom+1,
   `Preview may not push lower controls off-screen at ${width}x${height}`);
 }
 await page.setViewportSize({width:390,height:844});
 assert.equal(fast.cameraStillVisible,true);
 assert.equal(fast.newButtonVisible,true);
 await page.locator('#liveCameraNew').click();
 const newStatus=await page.locator('#liveCameraStatus').textContent();
 assert.match(newStatus,/NEW · новые помехи созданы/);
 await page.waitForFunction(old=>window.__capturedVhsSeeds.some(seed=>seed!==old),
  previewSeed,{timeout:15000});
 console.log('Selected VHS + Polaroid LIVE, REAL NEW seed:',preview,fast);

 await page.locator('#liveCameraShot').click();
 await page.waitForFunction(()=>{
  const status=document.getElementById('liveCameraStatus').textContent;
  return !document.getElementById('liveCameraReviewActions').hidden||
    status.startsWith('Ошибка снимка:');
 },null,{timeout:20000});
 const shotStatus1=await page.locator('#liveCameraStatus').textContent();
 if(shotStatus1.startsWith('Ошибка снимка:'))
  throw Error('Real shutter processing failed: '+shotStatus1+
   ' | pageErrors='+pageErrors.join('; '));
 const taken=await page.evaluate(()=>{
  const e=document.getElementById('liveCameraStill'),
   v=document.getElementById('liveCameraVideo');
  return{
   outputWidth:e.width,outputHeight:e.height,
   previewHidden:document.getElementById('liveCameraFx').hidden,
   rawWidth:v.videoWidth,rawHeight:v.videoHeight,
   photoLabel:document.getElementById('photoLabel').textContent,
   mainPreviewWidth:document.getElementById('previewCanvas').width,
   resolution:document.getElementById('liveCameraResolution').textContent
  };
 });
 console.log('Processed camera still:',taken);
 assert.ok(taken.outputWidth>30&&taken.outputHeight>30);
 assert.match(taken.photoLabel,/CAM_/);
 assert.ok(taken.mainPreviewWidth>30,'Captured photo must exist in main editor');
 const seed1=await page.evaluate(()=>window.__capturedVhsSeeds.at(-1));
 assert.ok(Number.isFinite(seed1),
  'Photo shutter must pass NEW seed to actual VHS pixel engine');
 assert.notEqual(seed1,previewSeed,
  'NEW must change the real analog seed used by the saved photo');
 // Polaroid border expands saved resolution relative to the raw camera stream.
 assert.ok(taken.outputWidth>taken.rawWidth||taken.outputHeight>taken.rawHeight,
  'Captured real photo must include adaptive Polaroid paper border');

 const [download]=await Promise.all([
  page.waitForEvent('download',{timeout:30000}),
  page.locator('#liveCameraSave').click()
 ]);
 assert.match(download.suggestedFilename(),/^CAM_\d{8}_\d{6}_VHS_FILM\.jpg$/);
 console.log('Saved processed still:',download.suggestedFilename());

 await page.locator('#liveCameraAgain').click();
 await page.waitForFunction(()=>document.getElementById('liveCameraShot').disabled===false,
  null,{timeout:15000});
 await page.locator('#liveCameraNew').click();
 await page.locator('#liveCameraShot').click();
 await page.waitForFunction(()=>{
  const status=document.getElementById('liveCameraStatus').textContent;
  return !document.getElementById('liveCameraReviewActions').hidden||
    status.startsWith('Ошибка снимка:');
 },null,{timeout:20000});
 const shotStatus2=await page.locator('#liveCameraStatus').textContent();
 if(shotStatus2.startsWith('Ошибка снимка:'))
  throw Error('Real shutter processing failed: '+shotStatus2+
   ' | pageErrors='+pageErrors.join('; '));
 const seed2=await page.evaluate(()=>window.__capturedVhsSeeds.at(-1));
 assert.notEqual(seed1,seed2,
  'NEW must actually change the VHS seed stored in the subsequent captured photo');
 console.log('NEW generated different actual captured VHS seed:',seed1,seed2);
 await page.locator('#liveCameraAgain').click();
 await page.waitForFunction(()=>!document.getElementById('liveCameraShot').disabled,
  null,{timeout:15000});
 await page.locator('#liveCameraFlip').click();
 await page.waitForFunction(()=>document.getElementById('liveCameraShot').disabled===false,
  null,{timeout:15000});
 await page.locator('#liveCameraClose').click();
 const stopped=await page.evaluate(()=>{
  const v=document.getElementById('liveCameraVideo');
  return{dialogOpen:document.getElementById('liveCameraDialog').open,
   streamLeft:!!v.srcObject,
   editorLabel:document.getElementById('photoLabel').textContent};
 });
 assert.equal(stopped.dialogOpen,false);
 assert.equal(stopped.streamLeft,false,'Closing camera must stop and release MediaStream');
 assert.ok(stopped.editorLabel.includes('CAM_'),'Photo remains editable after camera closes');
 assert.equal(pageErrors.length,0,'Camera page must not throw unhandled JS exceptions: '+pageErrors.join('; '));
 console.log('PASS: exact photo effects visible live, correct frame ratio, NEW reroll, saved shot, front/back and release');
}finally{
 await context.close();
 await browser.close();
}
