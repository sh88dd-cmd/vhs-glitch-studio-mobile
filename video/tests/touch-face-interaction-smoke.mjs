/* Real UI event-path regression: touch paint, manual box and auto face result. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements=new Map();
function element(id=''){
 const handlers={};
 const classNames=new Set();
 const canvas={
  lineWidth:1,strokeStyle:'',fillStyle:'',imageSmoothingEnabled:false,
  clearRect(){},drawImage(){},save(){},restore(){},setLineDash(){},
  beginPath(){},moveTo(){},lineTo(){},arc(){},fill(){},stroke(){},strokeRect(){},
  putImageData(){},getImageData(){return{data:new Uint8ClampedArray(4)}}
 };
 return {
  id,handlers,hidden:id==='touchEditStage'||id==='touchOverlay',disabled:false,
  width:480,height:270,value:'',checked:false,style:{},dataset:{},
  textContent:'',selectedIndex:0,selectedOptions:[{text:'Original'}],
  classList:{
   add(name){classNames.add(name);},remove(name){classNames.delete(name);},
   toggle(name,enabled){if(enabled)classNames.add(name);else classNames.delete(name);return enabled;},
   contains(name){return classNames.has(name);}
  },
  getContext(){canvas.canvas=this;return canvas;},
  addEventListener(name,fn){(handlers[name]??=[]).push(fn);},
  dispatch(name,event){for(const fn of handlers[name]||[])fn(event);},
  getBoundingClientRect(){return{left:10,top:20,width:200,height:300};},
  setPointerCapture(pointerId){this.captured=pointerId;},
  hasPointerCapture(pointerId){return this.captured===pointerId;},
  releasePointerCapture(){this.captured=null;},
  replaceChildren(){},append(){},add(){},scrollIntoView(){this.didScroll=true;},
  setAttribute(){},removeAttribute(){},matches(){return false;}
 };
}
function $(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id);}
const document={getElementById:$,
 createElement:tag=>element(tag),
 createElementNS:(ns,tag)=>element(tag),
 querySelectorAll:()=>[]};
$('panel-touch').classList.add('active');
const root={FaceDetector:class{async detect(){return[{boundingBox:{x:120,y:180,width:120,height:130}}]}}};
const touched=[];
const E={
 defaults:()=>({}),forwardFactor:()=>1,speedAt:()=>1,agingAt:()=>0,
 drawStrokes(ctx,creative,clip,time){touched.push(['stroke',clip,time]);},
 drawFaces(ctx,boxes){touched.push(['face',boxes.length]);},
 gray(ctx){return{data:new Uint8Array(160*90),w:160,h:90};},
 trackBoxes(previous,current,w,h,boxes){return boxes;}
};
root.VHSVideoCreative=E;
const source={readyState:3,videoWidth:720,videoHeight:1280,
 duration:12,currentTime:2,paused:false,seeking:false,playbackRate:1,
 pause(){this.paused=true;}};
const creative={
 touch:{enabled:false,brush:'pixel',radius:24,strength:85,duration:3,
  strokes:[],facesEnabled:false,faceStyle:'pixel',faceSize:18,faceBlur:13,
  manualFaces:[],faceAutodetect:false},
 aging:{enabled:false,start:0,end:100,amount:85},
 look:{enabled:false,strength:70,target:null},
 speed:{enabled:false,reverse:false,rate:1,curveEnabled:false,points:[]},
 live:{events:[]},audioDevice:'off'
};
const state={creative};
let saved=0,rendered=0;
vm.runInNewContext(fs.readFileSync('video/creative-ui.js','utf8'),{
 window:root,document,setTimeout,Math,Number,Object,Array,Date,
 performance:{now:()=>1000},console
});
const ui=root.VHSVideoCreativeUI.create({
 state,source,preview:element('preview'),
 hasVideo:()=>true,isRecording:()=>false,getClip:()=>0,
 getAudioBuffer:()=>null,getOriginalAudioBuffer:()=>null,getCassettes:()=>[],
 callbacks:{save:()=>saved++,render:()=>rendered++,audio:()=>{},speed:()=>{}},
 onBeat:()=>{},onLive:()=>{},onLiveStart:()=>{},onMorph:()=>{}
});
ui.mount();
assert.equal($('touchEditStage').hidden,false,'Touch editor must appear inside the tab');
assert.equal($('touchOverlay').hidden,false,'Drawing canvas must be visible when the video is ready');
$('touchStartDrawing').onclick();
assert.equal(source.paused,true,'Touch editing must freeze the selected frame');
assert.equal($('touchOverlay').classList.contains('is-drawing'),true,
 'Overlay must accept finger movement after clicking Draw');
const ev=(x,y)=>({
 clientX:x,clientY:y,pointerId:1,preventDefault(){},stopPropagation(){}
});
$('touchOverlay').dispatch('pointerdown',ev(50,110));
$('touchOverlay').dispatch('pointermove',ev(140,200));
$('touchOverlay').dispatch('pointerup',ev(140,200));
assert.equal(creative.touch.strokes.length,1,'A real finger stroke must be saved');
assert.ok(creative.touch.strokes[0].points.length>=2,'A drag should preserve intermediate positions');
assert.equal(creative.touch.enabled,true);
assert.ok(touched.some(item=>item[0]==='stroke'),'Saved strokes must be drawn on the local editor');
assert.ok(saved>0&&rendered>0,'Touch action must persist and repaint the real video');
$('touchFaceTab').onclick();
$('faceMark').onclick();
$('touchOverlay').dispatch('pointerdown',ev(60,70));
$('touchOverlay').dispatch('pointermove',ev(130,210));
$('touchOverlay').dispatch('pointerup',ev(130,210));
assert.equal(creative.touch.manualFaces.length,1,'Manual face rectangle must save');
assert.equal(creative.touch.facesEnabled,true,'Face mask must enable face processing');
await Promise.resolve();
await $('faceAuto').onclick();
assert.match($('touchStatus').textContent,/Найдено лиц: 1/,'Auto detection result must be visible');
assert.equal($('faceAuto').disabled,false,'Face button should unlock after detection');
assert.ok(touched.some(item=>item[0]==='face'&&item[1]>=1),
 'Auto-detected face must be forwarded to the visible mask renderer');
console.log('PASS: visible inline touch editor, finger stroke, manual rectangle, native face detection and live repaint');
