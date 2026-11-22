/* VHS Video Lab 0.8.6 — no-key, on-device multi-face detection.
 * MediaPipe runtime/model are downloaded on the FIRST face-search request.
 * Input frames are processed locally; no video is uploaded.
 * Offline tracking.js/Haar remains available if network/model load fails.
 */
(function(root){
'use strict';
const VERSION='0.10.22';
const LIB='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/vision_bundle.mjs';
const WASM='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION+'/wasm';
const MODEL='https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
let pending=null,instance=null;
async function create(){
 if(instance)return instance;
 if(pending)return pending;
 pending=(async()=>{
  const {FilesetResolver,FaceDetector}=await import(LIB);
  const files=await FilesetResolver.forVisionTasks(WASM);
  // CPU avoids repeated large GPU canvases and WebGL context loss on Safari.
  const detector=await FaceDetector.createFromOptions(files,{
   baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
   runningMode:'IMAGE',minDetectionConfidence:.42,minSuppressionThreshold:.35
  });
  instance={
   kind:'mediapipe',
   async detect(source){
    const result=detector.detect(source);
    return (result?.detections||[]).map(d=>{
     const b=d.boundingBox||{};
     return {boundingBox:{
      x:Number(b.originX??b.x??0),y:Number(b.originY??b.y??0),
      width:Number(b.width??0),height:Number(b.height??0)
     },confidence:Number(d.categories?.[0]?.score??1)};
    }).filter(d=>d.boundingBox.width>0&&d.boundingBox.height>0);
   },
   close(){detector.close();instance=null;pending=null;}
  };
  return instance;
 })();
 try{return await pending;}
 catch(error){pending=null;throw error;}
}
root.VHSVideoFaceAI=Object.freeze({create});
})(window);
