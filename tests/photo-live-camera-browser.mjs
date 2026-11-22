/* Real Chromium fake-camera E2E: no server APIs, no external CDN.
   Exercises actual MediaDevices.getUserMedia, live filters, shutter,
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
 // An instant-film preset should appear in BOTH the live view and captured photo.
 await page.locator('button[data-tab="polaroid"]').click();
 await page.locator('#polaroidEnabled').check();
 await page.locator('#polaroidNote').fill('Снято на iPhone');
 await page.locator('#liveCameraOpenTop').click();
 await page.waitForFunction(()=>{
  const s=document.getElementById('liveCameraStatus').textContent;
  return s.includes('Камера готова')||s.includes('Живые эффекты работают');
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
  return cv.width>20&&cv.height>20&&!cv.hidden;
 },null,{timeout:25000});
 const preview=await page.evaluate(()=>{
  const e=document.getElementById('liveCameraFx');
  return{width:e.width,height:e.height,visible:!e.hidden};
 });
 assert.ok(preview.visible,'Live selected photo filters must visibly render over camera stream');
 assert.ok(preview.width>0&&preview.height>0);
 console.log('Selected VHS + Polaroid LIVE:',preview);

 await page.locator('#liveCameraShot').click();
 await page.waitForFunction(()=>
  !document.getElementById('liveCameraReviewActions').hidden,null,{timeout:60000});
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
 console.log('PASS: real getUserMedia live filter, real captured Polaroid still, save JPG, new shot, front/back camera and track release');
}finally{
 await context.close();
 await browser.close();
}
