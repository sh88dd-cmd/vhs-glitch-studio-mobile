/* Photo Studio 1.4: real, locally bundled MediaPipe 1.2.3 face models.
   Contains NO CDN imports, paid service, account key or photo upload.
   Both close-range and long-range models run on-device, in the browser.
*/
(function(root){
'use strict';
const base=()=>new URL('./assets/face/',document.baseURI).href;
let pending=null,engine=null;
let lastError='',lastStage='Не запущен';
const explain=err=>String(err?.message||err||'неизвестная ошибка').slice(0,240);
function stage(message,report){lastStage=message;try{report?.(message);}catch{}}
async function create(report=()=>{}){
 if(engine)return engine;
 if(pending)return pending;
 pending=(async()=>{
  stage('Читаю локальную библиотеку MediaPipe 1.2.3…',report);
  const {FaceDetector,FilesetResolver}=await import(base()+'vision_bundle.mjs');
  if(!FaceDetector||!FilesetResolver)
   throw new Error('В локальной MediaPipe отсутствует FaceDetector');
  stage('Загружаю локальный модуль WebAssembly…',report);
  const files=await FilesetResolver.forVisionTasks(base()+'wasm');
  let detectors=[],errors=[];
  for(const [name,filename,threshold] of [
   ['ближние лица','blaze_face_short_range.tflite',.32],
   ['дальние лица','blaze_face_full_range.tflite',.33]
  ]){
   try{
    stage('Инициализация модели: '+name+'…',report);
    const detector=await FaceDetector.createFromOptions(files,{
     baseOptions:{modelAssetPath:base()+filename,delegate:'CPU'},
     runningMode:'IMAGE',
     minDetectionConfidence:threshold,minSuppressionThreshold:.32
    });
    detectors.push({name,detector});
   }catch(error){errors.push(name+': '+explain(error));}
  }
  if(!detectors.length)
   throw new Error('Не удалось открыть модели лиц. '+errors.join(' / '));
  engine={
   kind:'локальные модели (MediaPipe)',
   models:detectors.map(x=>x.name),
   async detect(source,notify=()=>{}){
    let found=[],failed=[];
    for(const item of detectors){
     stage('Распознаю '+item.name+' на устройстве…',notify);
     try{
      const result=item.detector.detect(source);
      const boxes=result?.detections||[];
      for(const det of boxes){
       const b=det.boundingBox||{};
       const conf=Number(det.categories?.[0]?.score||1);
       found.push({boundingBox:{
        x:Number(b.originX??b.x??0),y:Number(b.originY??b.y??0),
        width:Number(b.width||0),height:Number(b.height||0)
       },confidence:conf,model:item.name});
      }
     }catch(err){failed.push(item.name+': '+explain(err));}
    }
    if(failed.length)stage('Часть поиска завершилась с ошибкой: '+failed.join('; '),notify);
    if(!found.length&&failed.length===detectors.length)
     throw new Error('Обе модели не смогли обработать фотографию: '+failed.join('; '));
    stage('Модели MediaPipe: найдено кандидатов '+found.length,notify);
    return found.filter(f=>f.boundingBox.width>0&&f.boundingBox.height>0);
   },
   close(){
    for(const x of detectors){try{x.detector.close();}catch{}}
    engine=null;pending=null;
   }
  };
  if(errors.length)stage('Одна модель недоступна: '+errors.join(' / '),report);
  return engine;
 })();
 try{return await pending;}
 catch(error){lastError=explain(error);pending=null;throw error;}
}
root.VHSPhotoLocalAI=Object.freeze({
 create,getState:()=>({stage:lastStage,error:lastError,
  ready:!!engine,models:engine?.models||[]})
});
})(window);
