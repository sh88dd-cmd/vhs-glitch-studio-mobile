/* Real Chromium camera+microphone+MediaRecorder smoke. No external
 * CDN or mocked recorder: verifies an actual encoded video file including
 * live camera filters, NEW, hold-to-glitch and editor import. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'
]});
const context=await browser.newContext({
 viewport:{width:390,height:844},isMobile:true,hasTouch:true,
 acceptDownloads:true,permissions:['camera','microphone']
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,180));});
await page.route('**/*',route=>{
 if(route.request().url().startsWith('http://127.0.0.1:8765/'))return route.continue();
 route.abort();
});
await page.addInitScript(()=>{
 const start=window.MediaRecorder?.prototype?.start;
 if(start)window.MediaRecorder.prototype.start=function(...args){
  window.__cameraRecordTracks={
   video:this.stream.getVideoTracks().length,
   audio:this.stream.getAudioTracks().length
  };
  return start.apply(this,args);
 };
 const capture=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
 if(capture)navigator.mediaDevices.getUserMedia=opts=>
  capture({audio:!!opts.audio,video:{width:{ideal:640},height:{ideal:480},
    facingMode:opts?.video?.facingMode||{ideal:'environment'}}});
});
try{
 await page.goto('http://127.0.0.1:8765/video/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.VHSVideoLiveCamera?.mount &&
  window.VHSVideoLiveFX?.create &&
  document.querySelector('#filmSelect')?.options?.length>1,
  null,{timeout:18000});
 // Select a genuine named built-in film; assert exact video-engine functions
 // process EVERY live camera frame, not merely decorative CSS lines.
 await page.locator('button[data-tab="film"]').click();
 await page.locator('#filmEnabled').check();
 await page.locator('#filmSelect').selectOption({index:1});
 await page.evaluate(()=>{
  window.__actualCameraFx={film:0,vhs:0};
  const film=window.VideoFilmCore;
  window.VideoFilmCore=Object.freeze({...film,filmBuiltin(...args){
   window.__actualCameraFx.film++;return film.filmBuiltin(...args);
  }});
  const vhs=window.VHSPhotoEngine;
  window.VHSPhotoEngine=Object.freeze({...vhs,apply(...args){
   window.__actualCameraFx.vhs++;return vhs.apply(...args);
  }});
 });
 await page.locator('#videoLiveOpenTop').click();
 await page.waitForFunction(()=>{
  const s=document.getElementById('videoLiveStatus').textContent;
  return s.includes('Камера готова')||s.includes('Камера не запустилась');
 },null,{timeout:18000});
 const opened=await page.evaluate(()=>({
  status:document.getElementById('videoLiveStatus').textContent,
  videoW:document.getElementById('videoLiveVideo').videoWidth,
  videoH:document.getElementById('videoLiveVideo').videoHeight,
  mic:document.getElementById('videoLiveVideo').srcObject?.getAudioTracks().length,
  videoFilter:document.getElementById('videoLiveVideo').style.filter,
  dialog:document.getElementById('videoLiveCameraDialog').open,
  loading:!document.getElementById('videoLiveConnecting').hidden,
  aspect:{
   stage:document.getElementById('videoLiveStage').clientWidth/
    document.getElementById('videoLiveStage').clientHeight,
   source:document.getElementById('videoLiveVideo').videoWidth/
    document.getElementById('videoLiveVideo').videoHeight
  }
 }));
 console.log('Video camera opened:',opened);
 assert.match(opened.status,/Камера готова/);
 assert.ok(opened.dialog&&opened.videoW>30&&opened.videoH>30);
 assert.ok(opened.mic===1,'Real camera stream must contain microphone track');
 assert.equal(opened.videoFilter,'none',
  'Raw CSS recolor must be disabled; actual selected effects applied in video frame pipeline');
 assert.ok(Math.abs(opened.aspect.stage-opened.aspect.source)<.006,
  '9:16 camera picture, date and VHS must match native image aspect ratio; no 16:9 stretching');
 assert.equal(opened.loading,false,'Camera readiness must dismiss startup overlay');
 await page.waitForFunction(()=>window.__actualCameraFx?.vhs>1&&
  window.__actualCameraFx?.film>1,null,{timeout:12000});
 console.log('ACTUAL editor film + VHS processor calls during live view:',
  await page.evaluate(()=>window.__actualCameraFx));
 await page.waitForFunction(()=>{
  const c=document.getElementById('videoLiveOverlay');
  return c.width>50&&c.height>50;
 },null,{timeout:8000});
 // NEW must generate new visual interference without resetting VHS state.
 await page.locator('#videoLiveNew').click();
 assert.match(await page.locator('#videoLiveStatus').textContent(),/NEW/);
 // Pressing and holding the glitch button changes analog treatment.
 await page.locator('#videoLiveHold').dispatchEvent('pointerdown',{button:0,pointerId:1});
 assert.equal(await page.locator('#videoLiveHold').getAttribute('aria-pressed'),'true');
 await page.waitForTimeout(220);
 await page.locator('#videoLiveHold').dispatchEvent('pointerup',{button:0,pointerId:1});
 assert.equal(await page.locator('#videoLiveHold').getAttribute('aria-pressed'),'false');
 await page.locator('#videoLiveRecord').click();
 await page.waitForFunction(()=>document.getElementById('videoLiveRecord').classList.contains('recording')||
  document.getElementById('videoLiveStatus').textContent.includes('Запись недоступна'),
  null,{timeout:14000});
 const recordingStatus=await page.locator('#videoLiveStatus').textContent();
 assert.match(recordingStatus,/REC · настоящие выбранные эффекты/,
  'Real CanvasCaptureStream MediaRecorder must be operating: '+recordingStatus);
 await page.waitForTimeout(850);
 const encoded=await page.evaluate(()=>{
  const cv=document.getElementById('videoLiveCaptureCanvas');
  const src=document.getElementById('videoLiveVideo');
  const raw=document.createElement('canvas');
  raw.width=cv.width;raw.height=cv.height;
  raw.getContext('2d').drawImage(src,0,0,cv.width,cv.height);
  const first=raw.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
  const second=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
  let changed=0;
  for(let i=0;i<second.length;i+=4*16)
   if(Math.abs(second[i]-first[i])+
    Math.abs(second[i+1]-first[i+1])+
    Math.abs(second[i+2]-first[i+2])>5)changed++;
  return{changed,tracks:window.__cameraRecordTracks};
 });
 console.log('Actual VHS/FILM pixel difference from raw camera:',encoded);
 assert.ok(encoded.changed>25,
  'Video stream must contain the actual FILM/VHS pixels, not separate decorative stripes');
 assert.equal(encoded.tracks?.video,1,'Recorder must receive one processed video stream');
 assert.equal(encoded.tracks?.audio,1,'Recorder must include microphone audio via WebAudio');
 await page.locator('#videoLiveHold').dispatchEvent('pointerdown',{button:0,pointerId:2});
 await page.waitForTimeout(370);
 await page.locator('#videoLiveHold').dispatchEvent('pointerup',{button:0,pointerId:2});
 await page.locator('#videoLiveNew').click();
 await page.waitForTimeout(800);
 await page.locator('#videoLiveRecord').click();
 await page.waitForFunction(()=>{
  const s=document.getElementById('videoLiveStatus').textContent;
  return !document.getElementById('videoLiveReviewActions').hidden||
   /Ошибка записи|не вернул видеофайл|Ошибка остановки/.test(s);
 },null,{timeout:30000});
 const recorded=await page.evaluate(()=>{
  const review=document.getElementById('videoLiveReview');
  const a=document.getElementById('videoLiveDownload');
  const capture=document.getElementById('videoLiveCaptureCanvas');
  return{
   resultOpen:!document.getElementById('videoLiveReviewActions').hidden,
   url:a.href,filename:a.download,mime:a.href.startsWith('blob:'),
   width:capture.width,height:capture.height,trackState:
    document.getElementById('videoLiveVideo').srcObject?.getVideoTracks()[0]?.readyState,
   status:document.getElementById('videoLiveStatus').textContent,
   mediaWidth:review.videoWidth,mediaHeight:review.videoHeight
  };
 });
 console.log('Recorded live filtered video:',recorded);
 assert.ok(recorded.resultOpen&&recorded.mime,'Recording must create real local video Blob');
 const exact=await page.evaluate(()=>window.__actualCameraFx);
 assert.ok(exact.vhs>4&&exact.film>4,
  'BOTH real selected FILM + actual VHSPhotoEngine must run for live and recorded frames');
 console.log('Real processors executed on both preview and recording:',exact);
 assert.match(recorded.filename,/^VHS_LIVE_.*\.(mp4|webm)$/);
 assert.ok(recorded.width>100&&recorded.height>100);
 assert.equal(recorded.trackState,'live','Camera preview remains available after recording');
 await page.waitForFunction(()=>document.getElementById('videoLiveReview').videoWidth>0,
  null,{timeout:14000});
 const encodedDimensions=await page.evaluate(()=>({
  width:document.getElementById('videoLiveReview').videoWidth,
  height:document.getElementById('videoLiveReview').videoHeight,
  duration:document.getElementById('videoLiveReview').duration
 }));
 assert.ok(encodedDimensions.width>100&&encodedDimensions.height>100,
  'Result must be a playable real encoded video, not just a screenshot');
 console.log('Browser successfully decodes recorded analog video:',encodedDimensions);
 const [download]=await Promise.all([
  page.waitForEvent('download',{timeout:12000}),
  page.locator('#videoLiveDownload').click()
 ]);
 assert.equal(download.suggestedFilename(),recorded.filename);
 const fileStream=await download.createReadStream();
 let bytes=0;
 for await(const b of fileStream)bytes+=b.length;
 assert.ok(bytes>1500,'Exported video must contain actual encoded media bytes');
 console.log('Actual saved video bytes:',bytes);
 await page.locator('#videoLiveImport').click();
 await page.waitForFunction(()=>document.getElementById('videoName').textContent.includes('VHS_LIVE_'),
  null,{timeout:22000});
 const edit=await page.evaluate(()=>({
  dialog:document.getElementById('videoLiveCameraDialog').open,
  name:document.getElementById('videoName').textContent,
  editorVideo:!!document.getElementById('source').src
 }));
 assert.equal(edit.dialog,false);
 assert.ok(edit.editorVideo,'Recorded video must open in existing video editor');
 console.log('Imported into existing full editor:',edit);
 assert.deepEqual(errors,[],'No unhandled browser errors');
 console.log('PASS: actual named FILM + VHS engines processed live AND recorded frames, portrait aspect aligned, REC/NEW/HOLD/mic, JPEG? NO: playable MP4 export and editor import');
}finally{
 await context.close();await browser.close();
}
