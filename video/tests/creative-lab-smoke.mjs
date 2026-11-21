/* 0.8.0: verify that the new creative studio performs actual effects, not inert UI. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root={};
const fakeContext={
 canvas:{width:160,height:90},drawImage(){},
 getImageData(){return{data:new Uint8ClampedArray(160*90*4)}},
 putImageData(){},clearRect(){},save(){},restore(){},
 fillRect(){},set filter(value){this._filter=value;},get filter(){return this._filter||'none';},
 set imageSmoothingEnabled(v){this._smooth=v;}
};
const document={createElement(tag){if(tag==='canvas')return{
 width:160,height:90,getContext:()=>fakeContext
};return{};}};
const code=fs.readFileSync('video/creative-engine.js','utf8');
vm.runInNewContext(code,{window:root,document,Math,Number,Object,Array,JSON,Uint8Array,Uint8ClampedArray,ArrayBuffer});
const fx=root.VHSVideoCreative;
assert.ok(fx);
const original=fx.defaults();
assert.equal(original.audioDevice,'off');
assert.equal(original.aging.enabled,false);
assert.equal(fx.active({creative:original}),false);
const hydrated=fx.hydrate({aging:{enabled:true,amount:95},speed:{enabled:true,rate:50},audioDevice:'radio'});
assert.equal(hydrated.aging.amount,95);assert.equal(hydrated.speed.rate,10);
assert.equal(hydrated.audioDevice,'radio');
assert.equal(fx.active({creative:hydrated}),true);
assert.equal(fx.agingAt({enabled:true,start:10,end:90,amount:80},0,20),0);
assert.equal(fx.agingAt({enabled:true,start:10,end:90,amount:80},10,20),.4);
assert.equal(fx.agingAt({enabled:true,start:10,end:90,amount:80},20,20),.8);

const st={vhsEnabled:false,master:0,signal:{noise:0,tracking:0,chromaLoss:0},filmDamage:{enabled:false,flicker:0},
 creative:{aging:{enabled:true,start:0,end:100,amount:100}}};
const aged=fx.aged(st,10,20);
assert.equal(aged.vhsEnabled,true);
assert.equal(aged.master,29);
assert.equal(aged.signal.noise,31);
assert.equal(st.master,0,'Tape aging must never overwrite user sliders');
assert.equal(st.filmDamage.enabled,false,'The original settings must remain unchanged');

const sample=new Uint8ClampedArray([
 10,20,30,255, 20,30,40,255, 50,60,70,255, 70,80,90,255
]);
const before=Array.from(sample);
const target={mean:[220,150,90],spread:[20,20,20]};
fx.transfer(sample,2,2,target,100);
assert.ok(sample[0]>before[0],'Color transfer must actually change pixels');
assert.equal(sample[3],255,'Opacity must be preserved');

const speed={enabled:true,reverse:false,rate:3,curveEnabled:false,points:[]};
assert.equal(fx.speedAt(speed,2,10),3);
speed.reverse=true;assert.equal(fx.speedAt(speed,2,10),-3);
speed.curveEnabled=true;speed.points=[{time:0,rate:-1},{time:5,rate:-5},{time:10,rate:-10}];
assert.equal(fx.speedAt(speed,0,10),-1);
assert.equal(fx.speedAt(speed,2.5,10),-3);
assert.equal(fx.speedAt(speed,10,10),-10);
speed.points=[{time:0,rate:1},{time:10,rate:-1}];
assert.ok(Math.abs(fx.speedAt(speed,6,10))>=1,'Direction switches must not stick at zero playback');

const wavLength=48000*8,pcm=new Float32Array(wavLength);
for(const t of [1,2,3,4,5,6])for(let i=Math.round(t*48000);i<Math.round(t*48000)+2400;i++)pcm[i]=Math.sin(i*.15)*.85;
const buffer={getChannelData:()=>pcm,numberOfChannels:1,sampleRate:48000};
const beats=fx.beatEvents(buffer,{sensitivity:80,duration:8,clip:0,limit:30});
assert.ok(beats.length>=4&&beats.length<=30,'Detected audio transients must yield editable beat events');
assert.ok(beats.every(x=>x.effect==='tapeChew'&&x.duration===.15));
const silence={...buffer,getChannelData:()=>new Float32Array(48000)};
assert.equal(fx.beatEvents(silence,{duration:1}).length,0,'Silence must not generate imaginary beats');

const strokes=[{clip:0,start:1,end:4,points:[[.1,.1]],mode:'pixel',radius:10,strength:80}];
assert.equal(fx.brushArray(strokes,0,2).length,1);
assert.equal(fx.brushArray(strokes,0,5).length,0);
assert.equal(fx.brushArray(strokes,1,2).length,0);

// Motion tracker: sample patch drifts six right/three down in neighboring frame.
const w=160,h=90,first=new Uint8Array(w*h),next=new Uint8Array(w*h);
const cx=80,cy=40;
for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){
 const intensity=(x*71+y*29+380)%230+12;
 first[(cy+y)*w+cx+x]=intensity;
 next[(cy+y+3)*w+cx+x+6]=intensity;
}
const faces=[{id:'person',x:(cx-16)/w,y:(cy-16)/h,w:32/w,h:32/h}];
const tracked=fx.trackBoxes(first,next,w,h,faces);
assert.equal(tracked.length,1);
assert.ok(tracked[0].x>faces[0].x,'Face rectangle should follow rightward motion');
assert.ok(tracked[0].y>faces[0].y,'Face rectangle should follow downward motion');

// The real BSD tracking.js detector and trained classifier are self-hosted.
const visionContext={console,Float64Array,Float32Array,Int32Array,Uint8Array,Uint8ClampedArray,
 Float64Array,ArrayBuffer,Math,Number,Object,Array,String,Date,setTimeout,clearTimeout};
visionContext.window=visionContext;
vm.runInNewContext(fs.readFileSync('video/vendor/tracking-min.js','utf8'),visionContext);
vm.runInNewContext(fs.readFileSync('video/vendor/tracking-face-min.js','utf8'),visionContext);
assert.ok(visionContext.tracking?.ViolaJones?.classifiers?.face);
assert.ok(visionContext.tracking.ViolaJones.classifiers.face.length>1000,
 'The actual trained face cascade must be included, not only a button');
const dark=new Uint8ClampedArray(100*100*4);
const faceRects=visionContext.tracking.ViolaJones.detect(
 dark,100,100,1.1,1.28,2,.13,visionContext.tracking.ViolaJones.classifiers.face);
assert.ok(Array.isArray(faceRects),'The bundled offline cascade must process pixels');
// Native FaceDetector is optional; actual Safari uses local Haar face cascade.

const html=fs.readFileSync('video/index.html','utf8'),app=fs.readFileSync('video/app.js','utf8');
const ui=fs.readFileSync('video/creative-ui.js','utf8'),sw=fs.readFileSync('video/sw.js','utf8');
for(const id of [
 'panel-touch','touchOverlay','faceAuto','faceMark','faceEnabled','faceStyle',
 'panel-speed','speedRate','speedReverse','speedCurveEnabled','speedAddPoint',
 'panel-live','morphA','morphB','morphSlider','agingEnabled','agingAmount',
 'cassetteAgingPage','cassetteLibraryPage','audioArea-devices','audioDevice',
 'autoBeatGenerate','lookFile','lookStrength','liveStatus']){
 assert.ok(html.includes('id="'+id+'"'),'Missing UI '+id);
}
for(const script of ['creative-engine.js','creative-ui.js']){
 assert.ok(html.includes(script+'?v=0.8.0'),'Missing browser JS '+script);
 assert.ok(sw.includes("'./"+script+"'"),'Missing offline precache '+script);
}
assert.ok(app.includes('window.VHSVideoCreative.transfer(image.data,iw,ih'),
 'Palette copy must be applied to actual video pixels');
assert.ok(app.includes('creativeUI?.drawTouch(ctx,atTime,clipIndex)'),
 'Finger/face masks must be applied to video frames and export');
assert.ok(app.includes('window.VHSVideoCreative.aged('),'Age ramp must affect actual frames');
assert.ok(app.includes('creativeUI?.updateSpeed(now)'),'Speed controls must drive playback');
assert.ok(app.includes('creativeUI.mount()'),'New UI must be mounted');
assert.ok(ui.includes('trackBoxes('),'Manual face tracking must execute');
assert.ok(ui.includes('vision.detect(pixels,w,h,1.1,1.28,2,.13,vision.classifiers.face)'), 'Autodetection must run the locally bundled cascade');
assert.ok(ui.includes("source.currentTime=clamp(source.currentTime+rate*dt"),'Negative speed must seek real video frames');
assert.ok(ui.includes('opts.onBeat(events)'),'Beat output must be committed to timeline');
assert.ok(ui.includes('opts.onLive(ev)'),'Live pads must record timeline events');
assert.ok(html.includes('БЕТА 0.8.0'));
console.log('PASS: eight creative studio workflows, actual pixel change, face motion tracking, beat onsets, signed speed, UI and offline cache');
