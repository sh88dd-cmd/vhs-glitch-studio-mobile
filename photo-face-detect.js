/* Multi-face photo detector. First tries MediaPipe; native browser detector
   if supported; always has bundled offline Haar fallback. Never uploads photos. */
(function(root){
'use strict';
const C=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
function normalize(detected,w,h){
 const out=[];
 for(const item of detected||[]){
  const b=item.boundingBox||item;
  const x=C((b.x??b.originX)/w,0,1),y=C((b.y??b.originY)/h,0,1);
  const width=C(Number(b.width)/w,0,1-x),height=C(Number(b.height)/h,0,1-y);
  if(width<.015||height<.015||width>.88||height>.88)continue;
  out.push({x,y,w:width,h:height,auto:true,
   confidence:Number(item.confidence??item.score??1)});
 }
 return out;
}
function intersection(a,b){
 const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
 const y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 const overlap=x*y;
 const areaA=a.w*a.h,areaB=b.w*b.h;
 const iou=overlap/(areaA+areaB-overlap+1e-8);
 const contained=overlap/(Math.min(areaA,areaB)+1e-8);
 // Cropped searches often detect the SAME face with a larger bounding box.
 // Containment is more robust than IoU alone for this specific situation.
 return Math.max(iou,contained*.70);
}
function dedupe(raw,limit=16){
 const sorted=[...raw].sort((a,b)=>b.confidence-a.confidence);
 const found=[];
 for(const r of sorted){
  if(found.some(f=>intersection(f,r)>.42))continue;
  found.push(r);if(found.length>=limit)break;
 }
 return found.map(({confidence,...f})=>f);
}
function canvasFrame(source,side){
 const w=Number(source.naturalWidth||source.videoWidth||source.width)||0;
 const h=Number(source.naturalHeight||source.videoHeight||source.height)||0;
 if(!w||!h)throw Error('Невозможно прочитать размер фотографии');
 const factor=Math.min(1,side/Math.max(w,h));
 const frame=document.createElement('canvas');
 frame.width=Math.max(24,Math.round(w*factor));
 frame.height=Math.max(24,Math.round(h*factor));
 frame.getContext('2d',{willReadFrequently:true}).drawImage(
  source,0,0,frame.width,frame.height);
 return frame;
}
async function haar(source,onStatus=()=>{}){
 const vision=root.tracking?.ViolaJones;
 if(!vision?.classifiers?.face)
  throw Error('Офлайн-детектор ещё не загружен. Обнови страницу с интернетом.');
 const results=[];
 const max=[280,420,600];
 for(const limit of max){
  onStatus('Встроенный поиск лиц · качество '+limit+' px…');
  await wait();
  const can=canvasFrame(source,limit),w=can.width,h=can.height;
  if(w<24||h<24)continue;
  const ctx=can.getContext('2d',{willReadFrequently:true});
  const pixels=ctx.getImageData(0,0,w,h).data;
  // Run three separate sizes. One scan at one size misses smaller group faces.
  const boxes=vision.detect(pixels,w,h,1.12,1.22,2,.11,
   vision.classifiers.face)||[];
  for(const b of boxes){
   const score=Number(b.confidence??b.score??1);
   results.push(...normalize([{boundingBox:{
    x:b.x,y:b.y,width:b.width,height:b.height},confidence:score}],w,h));
  }
 }
 return dedupe(results,16);
}
async function native(source,onStatus=()=>{}){
 if(!root.FaceDetector)return [];
 try{
  onStatus('Системное распознавание нескольких лиц…');
  const detector=new root.FaceDetector({fastMode:false,maxDetectedFaces:16});
  const frame=canvasFrame(source,1260);
  const faces=await detector.detect(frame);
  return dedupe(normalize(faces,frame.width,frame.height));
 }catch{return [];}
}
// Photo-only model is bundled in this GitHub Pages project. We never load
// the nonexistent old @mediapipe/tasks-vision@0.10.22 CDN version.
async function mediapipe(source,onStatus=()=>{}){
 if(!root.VHSPhotoLocalAI?.create)throw Error('Локальный MediaPipe не загружен');
 onStatus('Читаю локальные модели ближних и дальних лиц…');
 const detector=await root.VHSPhotoLocalAI.create(onStatus);
 const found=[];
 const photoW=Number(source.naturalWidth||source.width);
 const photoH=Number(source.naturalHeight||source.height);
 const areas=[{x:0,y:0,w:1,h:1,limit:900},
              {x:0,y:0,w:1,h:1,limit:1500}];
 // Tiled searches keep tiny group faces recognizable: the 192px detector
 // receives a significantly larger face instead of the entire huge photo.
 if(Math.max(photoW,photoH)>1000){
  const halves=[
   {x:0,y:0,w:.57,h:.57},
   {x:.43,y:0,w:.57,h:.57},
   {x:0,y:.43,w:.57,h:.57},
   {x:.43,y:.43,w:.57,h:.57}
  ];
  areas.push(...halves.map(v=>({...v,limit:950})));
 }
 for(const area of areas){
  const srcX=Math.round(photoW*area.x);
  const srcY=Math.round(photoH*area.y);
  const srcW=Math.max(1,Math.round(photoW*area.w));
  const srcH=Math.max(1,Math.round(photoH*area.h));
  const f=Math.min(1,area.limit/Math.max(srcW,srcH));
  const w=Math.max(24,Math.round(srcW*f));
  const h=Math.max(24,Math.round(srcH*f));
  const can=document.createElement('canvas');can.width=w;can.height=h;
  can.getContext('2d',{willReadFrequently:true})
   .drawImage(source,srcX,srcY,srcW,srcH,0,0,w,h);
  onStatus('Проверяю лица: область '+(areas.indexOf(area)+1)+'/'+areas.length+
   ' · '+w+'×'+h+'…');
  await wait();
  const detected=await detector.detect(can,onStatus);
  for(const face of normalize(detected,w,h)){
   const rect={x:area.x+face.x*area.w,y:area.y+face.y*area.h,
    w:face.w*area.w,h:face.h*area.h,auto:true,
    confidence:Number(face.confidence||1)};
   found.push(rect);
  }
  // An image with many clear faces does not need every heavy crop.
  if(found.length>=14)break;
 }
 return dedupe(found,16);
}
async function detect(source,onStatus=()=>{}){
 const diagnostics=[],report=(msg)=>{
  diagnostics.push(String(msg).slice(0,210));
  onStatus(msg);
 };
 const methods=[];
 let faces=[],error='';
 try{
  faces=await mediapipe(source,report);
  methods.push('Локальный MediaPipe');
  report('MediaPipe: найдено лиц '+faces.length);
 }catch(err){
  error=String(err?.message||err);
  report('MediaPipe не смог запуститься: '+error.slice(0,145));
 }
 // Native Safari FaceDetector is not consistently available on iOS, but
 // use it as a second route where supported.
 if(!faces.length){
  try{
   const found=await native(source,report);
   report('Системный детектор: найдено лиц '+found.length);
   if(found.length){
    faces=dedupe([...faces,...found]);
    methods.push('Системный');
   }
  }catch(err){report('Системный поиск: '+err.message);}
 }
 // Third route: truly offline 3-scale Haar with checked bundled classifiers.
 // Its results are also normalized to the original photo.
 if(!faces.length){
  try{
   const found=await haar(source,report);
   report('Резервный Haar: найдено лиц '+found.length);
   if(found.length){
    faces=dedupe([...faces,...found]);methods.push('Резервный Haar');
   }
  }catch(err){report('Резервный поиск: '+err.message);}
 }
 faces=dedupe(faces,16);
 const engine=methods.join(' + ')||'Не запустился ни один детектор';
 report(faces.length?'ИТОГ: найдено лиц '+faces.length:
  'ИТОГ: 0 лиц. '+(error?
   'Ошибка основной модели: '+error.slice(0,100):
   'Проверь фото в хорошем освещении или выдели лица вручную.'));
 return {faces,engine,diagnostics,error};
}
root.VHSPhotoFaceDetect=Object.freeze({detect,normalize,dedupe,haar,mediapipe,canvasFrame});
})(window);
