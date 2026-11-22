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
 const group=await page.evaluate(async()=>{
  const original=new Image();
  original.src='/tests/fixtures/portrait.jpg';
  await original.decode();
  const triptych=document.createElement('canvas');
  triptych.width=original.naturalWidth*3;
  triptych.height=original.naturalHeight;
  const ctx=triptych.getContext('2d');
  for(let i=0;i<3;i++)ctx.drawImage(original,original.naturalWidth*i,0);
  const details=await window.VHSPhotoFaceDetect.detect(triptych,()=>{});
  return {count:details.faces.length,faces:details.faces,engine:details.engine};
 });
 console.log('Real multi-face panorama:',JSON.stringify(group));
 assert.equal(group.count,3,
  'Detector must find ALL three real faces, without false extra masks from the fallback');
 const handwriting=await page.evaluate(async()=>{
  const P=window.VHSPhotoPolaroid;
  const source=document.createElement('canvas');
  source.width=600;source.height=450;
  const ctx=source.getContext('2d');
  ctx.fillStyle='#477a6c';ctx.fillRect(0,0,600,450);
  const caption=['Привет из лета','1997 год','На берегу моря','Всегда рядом','До скорой встречи'].join('\n');
  const cfg={...P.defaults(),enabled:true,note:caption,
   noteFont:'badscript',noteInk:'red-marker',notePlacementSeed:61932};
  await P.ensureHandFont(cfg);
  const signed=P.render(source,cfg),clear=P.render(source,{...cfg,note:''});
  const g=P.geometry(source.width,source.height,cfg);
  const y=g.imageY+g.imageH+2;
  const height=Math.min(g.bottom-3,signed.height-y);
  const ink=signed.getContext('2d').getImageData(0,y,signed.width,height).data;
  const clean=clear.getContext('2d').getImageData(0,y,signed.width,height).data;
  let changes=0;
  for(let i=0;i<ink.length;i+=4)
   if(Math.abs(ink[i]-clean[i])+Math.abs(ink[i+1]-clean[i+1])+
      Math.abs(ink[i+2]-clean[i+2])>40)changes++;
  return {lines:P.noteLines(cfg).length,inkPixels:changes,
   fontLoaded:document.fonts.check('22px "PhotoBadScript"','Привет'),
   width:signed.width,height:signed.height};
 });
 console.log('Real Polaroid handwriting:',JSON.stringify(handwriting));
 assert.equal(handwriting.lines,5,'Caption keeps all five handwritten lines');
 assert.ok(handwriting.inkPixels>80,
  'Five-line marker inscription must actually change pixels on paper');
 assert.equal(handwriting.fontLoaded,true,'Real Cyrillic font must load without CDN');
 console.log('PASS: local browser model finds real faces including 3-photo group; Cyrillic handwriting ink changes paper pixels');
}finally{
 await browser.close();
}
