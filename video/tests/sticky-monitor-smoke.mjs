/* Safari regression: mini-monitor must stay visible at page bottom without overscroll. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync('video/player-ui.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const styles=fs.readFileSync('video/styles.css','utf8');
const app=fs.readFileSync('video/app.js','utf8');
const sw=fs.readFileSync('video/sw.js','utf8');
const root={visualViewport:{offsetTop:0,addEventListener(){}},addEventListener(){}};
const registry=new Map();
const handlerMap=new Map();
const element=id=>{
 if(registry.has(id))return registry.get(id);
 const node={
  id,hidden:id==='monitorDock',open:false,disabled:false,
  textContent:'',value:'',width:480,height:270,
  classList:{toggle(){},add(){},remove(){}},
  style:{setProperty(){}},dataset:{},getBoundingClientRect(){return {bottom:210,height:170}},
  matches(){return false},addEventListener(event,fn){
   handlerMap.set(id+':'+event,fn);
  },getContext(){return {clearRect(){},drawImage(){}}},
  showModal(){this.open=true},close(){this.open=false}
 };
 registry.set(id,node);return node;
};
let frameBottom=140;
const stage=element('videoStage');
stage.querySelector=selector=>selector==='.stageCanvas'?{
 getBoundingClientRect(){return {bottom:frameBottom,height:440}}
}:null;
const document={
 body:{classList:{toggle(){},add(){},remove(){}},style:{setProperty(){}}},
 getElementById:element
};
vm.runInNewContext(script,{window:root,document,Math,Number,Object,Array,console});
const api=root.VHSVideoPlayerUI;
assert.ok(api&&typeof api.shouldDock==='function');
const test=api.shouldDock;
assert.equal(test({hasVideo:true,frameBottom:-80,viewportTop:0,viewerOpen:false}),true,
 'The actual video frame has left the viewport although the stage controls remain');
assert.equal(test({hasVideo:true,frameBottom:120,viewportTop:0,viewerOpen:false}),false);
assert.equal(test({hasVideo:true,frameBottom:55,viewportTop:45,viewerOpen:false}),true,
 'Safari expanded chrome should use the visual viewport top');
assert.equal(test({hasVideo:true,frameBottom:200,viewportTop:45,viewerOpen:false}),false);
assert.equal(test({hasVideo:true,frameBottom:-80,viewerOpen:true}),false);
assert.equal(test({hasVideo:false,frameBottom:-80}),false);
assert.equal(test({hasVideo:true,frameBottom:Infinity}),false);
assert.ok(script.includes("frame=$('videoStage').querySelector('.stageCanvas')"));
assert.ok(!script.includes("rect.bottom<=0"),'Whole-stage threshold must not return');

const media=element('source');
Object.assign(media,{readyState:3,duration:15,currentTime:14.3,paused:true,ended:false});
const frame=element('preview');
frame.width=480;frame.height=270;
let scrollListener=null;
root.addEventListener=(event,fn)=>{
 if(event==='scroll')scrollListener=fn;
};
const player=api.create({
 source:media,preview:frame,
 getState:()=>({file:{name:'clip.mp4'},recording:null,hasUndo:false,hasPrevious:false,hasNext:false}),
 onPlay(){},onReroll(){},onUndo(){},onPrev(){},onNext(){},onSeek(){}
});
assert.ok(player);
assert.equal(element('monitorDock').hidden,true,'Dock hidden while the video is on screen');
assert.equal(typeof scrollListener,'function');
frameBottom=-35;
scrollListener();
assert.equal(element('monitorDock').hidden,false,
 'Dock must appear when video exits screen even though stage.bottom stays at +210px');
frameBottom=-12;
scrollListener(); // iPhone elastic scroll release, back to normal scroll limit
assert.equal(element('monitorDock').hidden,false,
 'Dock must not disappear when user releases elastic overscroll at bottom');
frameBottom=190;scrollListener();
assert.equal(element('monitorDock').hidden,true,'Dock hides when actual video is visible');
assert.ok(app.includes('requestAnimationFrame(()=>videoUI?.updateVisibility())'),
 'Switching to short tabs must recompute dock after Safari clamps scrollY');
assert.ok(styles.includes('.monitorDock{position:fixed'));
assert.ok(html.includes('player-ui.js?v=0.7.8'));
assert.match(html,/БЕТА \d+\.\d+\.\d+/,'App version label must be present');
assert.match(sw,/vhs-video-lab-\d+\.\d+\.\d+/,'Offline cache version must be present');
console.log('PASS: dock follows actual video frame, remains fixed at page bottom, reacts to Safari viewport and tab resize');
