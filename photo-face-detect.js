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
 return x*y/(a.w*a.h+b.w*b.h-x*y+1e-8);
}
function dedupe(raw,limit=16){
 const sorted=[...raw].sort((a,b)=>b.confidence-a.confidence);
 const found=[];
 for(const r of sorted){
  if(found.some(f=>intersection(f,r)>.36))continue;
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
let mediaPromise=null;
async function mediaEngine(){
 if(!root.VHSVideoFaceAI?.create)return null;
 if(!mediaPromise)mediaPromise=root.VHSVideoFaceAI.create().catch(e=>{
  mediaPromise=null;throw e;
 });
 return await mediaPromise;
}
async function mediapipe(source,onStatus=()=>{}){
 onStatus('Загружаю точную модель распознавания лиц…');
 const model=await Promise.race([
  mediaEngine(),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('Загрузка модели заняла слишком долго')),8500))
 ]);
 if(!model)return[];
 // Huge original iPhone JPEGs are scaled down for the detector only.
 // All masks are mapped back to relative original-photo coordinates.
 const limits=[950,1280],found=[];
 for(const side of limits){
  const frame=canvasFrame(source,side);
  onStatus('Ищу несколько лиц · '+frame.width+'×'+frame.height+'…');
  await wait();
  const boxes=await model.detect(frame);
  found.push(...normalize(boxes,frame.width,frame.height));
  if(found.length>=10)break;
 }
 return dedupe(found,16);
}
async function detect(source,onStatus=()=>{}){
 const methods=[];
 let faces=[];
 try{
  faces=await mediapipe(source,onStatus);
  if(faces.length)methods.push('MediaPipe');
 }catch(err){
  onStatus('Точная модель недоступна: '+String(err?.message||err).slice(0,90)+'. Проверяю запасной поиск…');
 }
 if(!faces.length){
  const found=await native(source,onStatus);
  if(found.length){faces=found;methods.push('Системный детектор');}
 }
 // Haar also augments a partial MediaPipe result, but discard highly
 // overlapping low-confidence detections to avoid duplicated masks.
 if(faces.length<10){
  try{
   const other=await haar(source,onStatus);
   if(other.length){
    faces=dedupe([...faces,...other]);
    methods.push('Офлайн-поиск');
   }
  }catch(err){
   if(!faces.length)throw new Error('Не удалось распознать лица: '+err.message);
  }
 }
 onStatus(faces.length?
  'Найдено лиц: '+faces.length+' · '+methods.join(' + '):
  'Автоматически лица не обнаружены. Можно выделить каждое лицо вручную.');
 return {faces,engine:methods.join(' + ')||'Нет распознавания'};
}
root.VHSPhotoFaceDetect=Object.freeze({detect,normalize,dedupe,haar,mediapipe,canvasFrame});
})(window);
