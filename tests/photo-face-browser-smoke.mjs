/* Actual Chromium ML inference against Google's freely accessible face
 * fixture. Runs with ALL third-party requests blocked: no CDN can disguise
 * broken local MediaPipe imports/models/WASM in production. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:980,height:900}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e.message).slice(0,300)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text().slice(0,300));});
await page.route('**/*',route=>{
 const url=route.request().url();
 if(url.startsWith('http://127.0.0.1:8765/'))route.continue();
 else route.abort();
});
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
 const result=await page.evaluate(async()=>{
  if(!window.VHSPhotoLocalAI?.create)throw Error('Local model API not loaded');
  const img=new Image();
  img.src='/tests/fixtures/portrait.jpg';
  await img.decode();
  const stages=[];
  const engine=await window.VHSPhotoLocalAI.create(msg=>stages.push(msg));
  const boxes=await engine.detect(img,msg=>stages.push(msg));
  return {kind:engine.kind,models:engine.models,faces:boxes,
   width:img.naturalWidth,height:img.naturalHeight,
   stages,ready:window.VHSPhotoLocalAI.getState()};
 },{timeout:90000});
 console.log(JSON.stringify(result,null,2));
 assert.equal(result.kind,'локальные модели (MediaPipe)');
 assert.ok(result.models.length>=1,'Real locally hosted face model must initialise');
 assert.ok(result.faces.length>=1,
  'MediaPipe real inference must recognise a face in the Google portrait fixture');
 assert.ok(result.faces.some(f=>f.boundingBox.width>12&&f.boundingBox.height>12),
  'Detected real face must have usable bounding-box dimensions');
 assert.ok(result.ready.ready,'Real MediaPipe must be in ready state');
 assert.ok(!result.stages.join(' ').includes('https://cdn.jsdelivr.net'),
  'Runtime cannot fetch external CDN JS');
 console.log('PASS: real browser successfully detects an actual face using local ML, no CDN or uploaded image');
}finally{
 await browser.close();
}
