/* 0.7.7: animation interpolation, source comparison, frame stepping and PNG. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root={};
for(const name of ['video/keyframes.js','video/clean-path.js','video/effects-reset.js'])
 vm.runInNewContext(fs.readFileSync(name,'utf8'),{window:root,Math,Number,JSON,Object,Array,String,Date});
const k=root.VHSVideoKeyframes,clean=root.VHSVideoCleanPath,reset=root.VHSVideoEffectsReset;
assert.equal(Object.keys(k.TRACKS).length,4);
const frames=k.normalizeAll([
 {clip:0,track:'vhs',time:0,value:0},
 {clip:0,track:'vhs',time:5,value:100},
 {clip:0,track:'vhs',time:5,value:80},
 {clip:0,track:'film',time:1,value:20},
 {clip:0,track:'film',time:9,value:60},
 {clip:1,track:'vhs',time:0,value:100},
 {clip:0,track:'glitch',time:4,value:90},
 {clip:0,track:'leak',time:4,value:10},
 {clip:12,track:'vhs',time:0,value:20},
 {clip:0,track:'unknown',time:0,value:20}
]);
assert.equal(frames.length,7,'Duplicate or invalid keyframes were not normalized');
assert.equal(k.at(frames,0,2.5).vhs,40,'VHS must interpolate linearly');
assert.equal(k.at(frames,0,0).vhs,0);
assert.equal(k.at(frames,0,9).vhs,80);
assert.equal(k.at(frames,0,5).film,40);
assert.equal(k.at(frames,1,2).vhs,100,'Other clips have independent animation');
assert.equal(k.at(frames,0,2.5,false).vhs,null,'Disabled animation must not affect footage');
const state={
 masterBypass:false,fxMode:'classic',vhsEnabled:false,master:0,filmEnabled:false,
 filmStrength:0,glitchEnabled:false,glitchStrength:0,mode:'vhs',modeStrength:0,
 filmDamage:{enabled:false,type:'edge-left',leak:0,dust:0,grain:0,scratches:0,flicker:0,halation:0},
 camera:{date:false,rec:false},keyframesEnabled:true,keyframes:frames,
 holdEvents:[],timelineEvents:[],mix:{videoVolume:100,musicVolume:0},keepAudio:true,
 exportScope:'full',selectedTrack:null,audio:{enabled:false,strength:0},
 signal:{noise:30,tracking:20},glitches:{rf:75},music:{strength:0},preset:'classic'
};
let value=k.effective(state,0,2.5);
assert.equal(value.vhsEnabled,true);assert.equal(value.master,40);
assert.equal(value.filmStrength,27.5);
assert.equal(state.master,0,'Animation must not overwrite manual slider values');
assert.ok(clean.hasVisualEffects(value,0));
value=k.effective(state,0,0);
assert.equal(value.vhsEnabled,false,'Zero point must turn off VHS at the start');
assert.ok(!clean.canCopyOriginal(state,{clipCount:1,duration:15,extraTracks:[]}),
 'A clean current frame must not cause lossless export of later animated effects');
const backup=reset.snapshot(state);
reset.zero(state);
assert.equal(state.keyframes.length,0);
assert.equal(state.keyframesEnabled,false);
reset.restore(state,backup);
assert.equal(state.keyframes.length,frames.length);
assert.equal(state.keyframesEnabled,true);
assert.equal(k.effective(state,0,2.5).master,40);

const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const sw=fs.readFileSync('video/sw.js','utf8');
assert.ok(app.includes("window.VHSVideoKeyframes.effective(state,clipIndex,atTime)"),
 'Keyframe interpolation must remain in frame rendering');
assert.ok(app.includes("const clean=comparisonHeld&&canvas===preview||!window.VHSVideoCleanPath.hasVisualEffects(frameState,holdVideo)"));
assert.ok(app.includes("const f=selectedFilm(),strength=frameState.filmStrength/100"));
assert.ok(app.includes("frameState.glitchStrength/100"));
assert.ok(app.includes("...frameState.filmDamage"));
assert.ok(app.includes("frameState.master/100"));
assert.ok(app.includes("renderCurrentFrame();"));
assert.ok(html.includes('id="compareMain"')&&html.includes('id="compareViewer"'));
assert.ok(html.includes('id="panel-keyframes"')&&html.includes('id="panel-frameTools"'));
assert.ok(html.includes('id="framePngDownload"'));
assert.ok(sw.includes("'./keyframes.js'"));

const timeStart=app.indexOf(' function frameTimestamp(');
const timeEnd=app.indexOf(' function mountFrameTools()',timeStart);
assert.ok(timeStart>=0&&timeEnd>timeStart,'Frame tool implementation missing');
const body=app.slice(timeStart,timeEnd);
const field={
 frameTimeExact:{textContent:''},frameStepFps:{value:'30'},
 frameBack:{disabled:false},frameForward:{disabled:false},
 frameSavePng:{disabled:false},frameToolStatus:{textContent:''},
 frameSaveEffects:{checked:false},framePngDownload:{hidden:true,href:'',download:''}
};
const $=id=>field[id]||(field[id]={});
const src={readyState:3,currentTime:1.0,duration:4,paused:false,pause(){this.paused=true}};
let frameCount=0;
const make=new Function('file','recording','source','$','clamp','document','videoDimensions',
 'drawFrame','window','URL','renderCurrentFrame',body+
 'return {stepFrame,frameTimestamp,syncFrameTools,saveFramePng};');
const fakeUrl={createObjectURL:()=> 'blob:frame',revokeObjectURL:()=>{}};
const renderer={
 createElement(tag){
  if(tag!=='canvas')throw Error('Unexpected element: '+tag);
  return{
   width:0,height:0,
   toBlob(callback){callback(new Blob(['frame'],{type:'image/png'}));}
  };
 }
};
const methods=make({name:'clip.mov'},null,src,$,(v,a,b)=>Math.max(a,Math.min(b,v)),
 renderer,()=>[1080,1920],()=>{frameCount++},root,fakeUrl,()=>{});
methods.stepFrame(1);
assert.ok(Math.abs(src.currentTime-1.0333333)<.001);
assert.equal(src.paused,true);
methods.stepFrame(-1);
assert.ok(Math.abs(src.currentTime-1)<.001);
assert.equal(methods.frameTimestamp(65.321),'00:01:05.321');
methods.syncFrameTools();
assert.equal(field.frameTimeExact.textContent,'00:00:01.000');
assert.equal(field.frameBack.disabled,false);
assert.ok(app.includes("source.pause();\n  const capturedAt="),'PNG must pause video before sampling');
// Raw frame capture is source-only; processed PNG uses the same drawFrame as video export.
assert.ok(app.includes("else window.VHSVideoCleanPath.drawClean(source,canvas)"));
assert.ok(app.includes("drawFrame(canvas,true)"));
assert.equal(frameCount,0);
console.log('PASS: real VHS/Film/Glitch/Leak interpolation, per-clip isolation, reset/restore, source A/B, frame timing and PNG path');
