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
 const capture=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
 if(capture)navigator.mediaDevices.getUserMedia=opts=>
  capture({audio:!!opts.audio,video:{width:{ideal:640},height:{ideal:480},
    facingMode:opts?.video?.facingMode||{ideal:'environment'}}});
});
try{
 await page.goto('http://127.0.0.1:8765/video/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>window.VHSVideoLiveCamera?.mount
  && document.querySelector('#videoLiveOpenTop'),null,{timeout:18000});
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
  dialog:document.getElementById('videoLiveCameraDialog').open
 }));
 console.log('Video camera opened:',opened);
 assert.match(opened.status,/Камера готова/);
 assert.ok(opened.dialog&&opened.videoW>30&&opened.videoH>30);
 assert.ok(opened.mic===1,'Real camera stream must contain microphone track');
 assert.match(opened.videoFilter,/contrast\(/,'Live camera color treatment should be visible');
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
 assert.match(recordingStatus,/Запись запущена/,
  'Real CanvasCaptureStream MediaRecorder must be operating: '+recordingStatus);
 await page.waitForTimeout(850);
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
 console.log('PASS: real low-latency live iPhone camera, NEW, press-and-hold glitches, mic, recorded video with visual FX, save, decode and editor import');
}finally{
 await context.close();await browser.close();
}
