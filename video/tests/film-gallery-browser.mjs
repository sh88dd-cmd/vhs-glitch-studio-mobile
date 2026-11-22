/* Photo-style video FILM gallery + full native-quality FILM-only camera.
 * Uses real Chromium rendering, real local 23-film library and real
 * FilmCore color grading. All external HTTP requests are refused.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,args:[
 '--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'
]});
const context=await browser.newContext({
 viewport:{width:390,height:844},isMobile:true,hasTouch:true,
 permissions:['camera','microphone'],acceptDownloads:true
});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{
 if(route.request().url().startsWith('http://127.0.0.1:8765/'))return route.continue();
 route.abort();
});
await page.addInitScript(()=>{
 const original=navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
 if(original)navigator.mediaDevices.getUserMedia=o=>
  original({audio:false,video:{width:{ideal:640},height:{ideal:480},
   facingMode:o?.video?.facingMode||{ideal:'environment'}}});
});
try{
 await page.goto('http://127.0.0.1:8765/video/',{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>window.VHSVideoFilmGallery?.mount&&
  document.querySelector('#filmSelect')?.options.length>=23,null,{timeout:16000});
 await page.locator('button[data-tab="film"]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.filmGalleryPick').length>=20,
  null,{timeout:10000});
 await page.waitForFunction(()=>{
  const c=document.querySelectorAll('.filmGalleryThumb');
  if(c.length<4)return false;
  const ctx=c[3].getContext('2d');
  const px=ctx.getImageData(0,0,1,1).data;
  return px[3]===255;
 },null,{timeout:14000});
 const gallery=await page.evaluate(()=>{
  const grid=document.querySelector('.filmGallery');
  const s=getComputedStyle(grid);
  const cssWidth=s.gridTemplateColumns.split(' ').map(parseFloat);
  const cards=[...grid.querySelectorAll('.filmGalleryPick')];
  const image=cards[3].querySelector('canvas');
  return{columns:cssWidth,visibleCards:cards.length,
   page:document.querySelector('#filmGalleryPage').textContent,
   groups:[...grid.querySelectorAll('.filmGalleryGroup')].map(x=>x.textContent),
   title:cards[3].title,realThumbnail:image.getContext('2d').getImageData(50,50,1,1).data.toString()};
 });
 console.log('Three-wide real film gallery:',gallery);
 assert.equal(gallery.columns.length,3,'Video gallery must show EXACTLY three films per row on iPhone');
 assert.ok(gallery.visibleCards>=20&&gallery.visibleCards<=24);
 assert.ok(gallery.groups.length>=3,'Films must be split into real named category sections');

 // Exactly the same recipe as the photo editor: a click on a film thumb
 // updates the fallback select, FILM switch and active saved preset.
 const kodak=page.locator('.filmFamilyChip',{hasText:'Kodak'}).first();
 await kodak.click();
 assert.equal(await page.locator('.filmGalleryGroup').count(),1,
  'Category chip must show only Kodak films');
 assert.ok(await page.locator('.filmGalleryPick').count()>=5);
 const card=page.locator('.filmGalleryPick').filter({hasText:'Kodak Portra 400'}).first();
 await card.click();
 assert.equal(await card.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#filmSelect').inputValue(),'builtin:Kodak Portra 400 — стиль');
 assert.equal(await page.locator('#filmEnabled').isChecked(),true);
 // Favoriting persists separately in the video app and can be filtered.
 const star=page.locator('.filmGalleryCard')
  .filter({has:page.locator('.filmGalleryPick').filter({hasText:'Kodak Portra 400'})})
  .locator('.filmGalleryStar');
 await star.click();
 assert.equal(await star.getAttribute('aria-pressed'),'true');
 await page.locator('.filmFamilyChip',{hasText:'Избранные'}).first().click();
 assert.ok(await page.locator('.filmGalleryPick').count()>=1);
 assert.ok(await page.locator('.filmGalleryPick').filter({hasText:'Kodak Portra 400'}).count()===1);
 await page.locator('.filmFamilyChip',{hasText:'Все'}).first().click();
 await page.locator('#filmSearch').fill('Ilford');
 const searchCards=await page.locator('.filmGalleryPick').count();
 assert.ok(searchCards>=2,'Search must find monochrome Ilford film previews');
 await page.locator('#filmSearch').fill('');
 console.log('Category, selection, favorites and search confirmed.');

 // The exact old bug: in 720x1280 resolution a FILM-only state got scaled
 // to 135x240. Native-quality frame must stay 720x1280, even with scratches
 // or other genuine FILM damage enabled.
 const actual=await page.evaluate(()=>{
  const f=window.VHSVideoLiveFX.signalDimensions;
  const state={masterBypass:false,filmEnabled:true,filmStrength:100,
   vhsEnabled:false,master:0,glitchEnabled:false,glitchStrength:0,
   mode:'vhs',filmDamage:{enabled:true,grain:35,scratches:20},
   signalWidth:'auto'};
  return{
   filmPortrait:f(720,1280,state),
   filmLandscape:f(1280,720,state),
   filmNoise:f(720,1280,{...state,filmDamage:{enabled:true,grain:80}}),
   vhsSignal:f(720,1280,{...state,filmEnabled:false,
    vhsEnabled:true,master:80}),
   disabledGlitch:f(720,1280,{...state,glitchEnabled:true,
    glitchStrength:0})
  };
 });
 console.log('720×1280 FILM native video signal vs VHS-specific loss:',actual);
 for(const label of ['filmPortrait','filmNoise','disabledGlitch'])
  assert.deepEqual([actual[label].w,actual[label].h],[720,1280],
   label+' must NEVER downsample film-only recording');
 assert.deepEqual([actual.filmLandscape.w,actual.filmLandscape.h],[1280,720]);
 assert.ok(actual.vhsSignal.w<300&&actual.vhsSignal.h<=320,
  'Only true VHS analog processing should intentionally soften the signal');

 // Test real camera recording in FILM-only mode, not just a pure function.
 await page.locator('button[data-tab="vhs"]').click();
 await page.locator('#vhsEnabled').uncheck();
 await page.locator('button[data-tab="glitch"]').click();
 await page.locator('#glitchEnabled').uncheck();
 await page.locator('button[data-tab="film"]').click();
 await page.locator('.filmFamilyChip',{hasText:'Kodak'}).first().click();
 await page.locator('.filmGalleryPick').filter({hasText:'Kodak Portra 400'}).first().click();
 await page.locator('#videoLiveMicrophone').uncheck();
 await page.locator('#videoLiveOpenTop').click();
 await page.waitForFunction(()=>document.querySelector('#videoLiveStatus').textContent.includes('Камера готова'),
  null,{timeout:17000});
 await page.waitForFunction(()=>document.querySelector('#videoLiveOverlay').width>=640,
  null,{timeout:12000});
 const on=await page.evaluate(()=>{
  const c=document.querySelector('#videoLiveOverlay');
  return{width:c.width,height:c.height,
   sourceWidth:document.querySelector('#videoLiveVideo').videoWidth,
   sourceHeight:document.querySelector('#videoLiveVideo').videoHeight,
   banner:document.querySelector('#videoLiveProfile').textContent,
   status:document.querySelector('#videoLiveStatus').textContent};
 });
 assert.deepEqual([on.width,on.height],[640,480],
  'Real FILM-only 640x480 live preview must not be reduced to 240 pixels');
 console.log('Unpixelated live FILM on real camera stream:',on);
 await page.locator('#videoLiveRecord').click();
 await page.waitForFunction(()=>document.querySelector('#videoLiveRecord').classList.contains('recording'),
  null,{timeout:13000});
 await page.waitForTimeout(1100);
 await page.locator('#videoLiveRecord').click();
 await page.waitForFunction(()=>!document.querySelector('#videoLiveReviewActions').hidden,
  null,{timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#videoLiveReview').videoWidth>0,
  null,{timeout:15000});
 const dimensions=await page.evaluate(()=>({
  width:document.querySelector('#videoLiveReview').videoWidth,
  height:document.querySelector('#videoLiveReview').videoHeight,
  name:document.querySelector('#videoLiveDownload').download
 }));
 assert.deepEqual([dimensions.width,dimensions.height],[640,480]);
 assert.match(dimensions.name,/\.(mp4|webm)$/);
 assert.deepEqual(errors,[],'No browser errors in film gallery or FILM-only recording');
 console.log('PASS: 3-column real film cards, categories, favorites, selected filters, full 720x1280 FILM detail and real native FILM video capture',dimensions);
}finally{
 await context.close();await browser.close();
}
