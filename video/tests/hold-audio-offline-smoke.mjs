/* Regression tests for HOLD video/audio blend and offline PWA cache. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const audio=fs.readFileSync('video/audio-engine.js','utf8');
const sw=fs.readFileSync('video/sw.js','utf8');

const first=app.indexOf(' function holdStrengthsAt(');
const last=app.indexOf(' function syncHoldControls(',first);
assert.ok(first>0&&last>first,'Hold blend methods missing');
const holdMethods=app.slice(first,last);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mk=(state,active=null)=>new Function('state','holdActive','clamp','$',holdMethods+
 'return {holdStrengthsAt,holdBalanceText};')(state,active,clamp,()=>({}));
const expected={
 0:{video:.94,audio:0},25:{video:.94,audio:.47},
 50:{video:.94,audio:.94},75:{video:.47,audio:.94},100:{video:0,audio:.94}
};
for(const [balance,snapshot] of Object.entries(expected)){
 const holder=mk({holdEvents:[{clip:0,start:1,end:3,blend:Number(balance)}]});
 const res=holder.holdStrengthsAt(2,0);
 assert.ok(Math.abs(res.video-snapshot.video)<.0001);
 assert.ok(Math.abs(res.audio-snapshot.audio)<.0001);
 assert.match(holder.holdBalanceText(Number(balance)),/(ВИДЕО|ЗВУК)/);
}
const old=mk({holdEvents:[{clip:0,start:1,end:3}]}).holdStrengthsAt(2,0);
assert.equal(old.audio,0,'Old recorded events should remain video-only');
assert.ok(old.video>0);
const active=mk({holdEvents:[]},{clip:0,start:2,blend:100}).holdStrengthsAt(2.3,0);
assert.equal(active.video,0);assert.equal(active.audio,1);

const root={};
vm.runInNewContext(audio,{window:root,Float32Array,Uint8Array,Math,Number,console});
const engine=root.VHSVideoTapeAudio.create({});
const param=()=>({value:0,setTargetAtTime(v){this.value=v;}});
engine.ctx={currentTime:7};engine.connected=true;
engine.dry={gain:param()};engine.wet={gain:param()};
engine.filter={frequency:param(),Q:param()};
engine.delay={delayTime:param()};
engine.gain={gain:param()};engine.noiseGain={gain:param()};
engine.saturator={curve:null};
engine.update({enabled:false,seed:151,holdGlitch:0},1.5,true);
assert.equal(engine.dry.gain.value,1);assert.equal(engine.wet.gain.value,0);
engine.update({enabled:false,seed:151,holdGlitch:1},1.5,true);
const snapshot={
 wet:engine.wet.gain.value,hz:engine.filter.frequency.value,
 dropout:engine.gain.gain.value,noise:engine.noiseGain.gain.value,
 delay:engine.delay.delayTime.value
};
assert.equal(snapshot.wet,1);
assert.ok(snapshot.hz<5500&&snapshot.hz>=1100);
assert.ok(snapshot.noise>0);
assert.ok(engine.saturator.curve?.length===257);
engine.update({enabled:false,seed:151,holdGlitch:1},1.5,true);
assert.deepEqual({
 wet:engine.wet.gain.value,hz:engine.filter.frequency.value,
 dropout:engine.gain.gain.value,noise:engine.noiseGain.gain.value,
 delay:engine.delay.delayTime.value
},snapshot,'Same time/seed must produce same damaged soundtrack');
engine.update({enabled:false,seed:151,holdGlitch:0},1.5,true);
assert.equal(engine.wet.gain.value,0,'Audio must recover after release');
assert.equal(engine.noiseGain.gain.value,0);
assert.ok(app.includes('holdGlitch:!state.masterBypass&&active?held.audio:0'));
assert.ok(app.includes('holdStrengthsAt(time,clipIndex).video'));
assert.ok(app.includes('blend:state.holdBalance'));
assert.ok(html.includes('id="holdBlendMain"'));
assert.ok(html.includes('id="holdBlendViewer"'));
assert.ok(html.includes('id="dockHoldGlitch"'));

const handlers={};
let files=null;
const cache={
 addAll:async items=>{files=items;},
 match:async()=>({offlineAsset:true}),
 put:async()=>{}
};
const ctx={
 self:{
  addEventListener:(name,fn)=>handlers[name]=fn,
  skipWaiting:async()=>{},clients:{claim:async()=>{}}
 },
 caches:{open:async()=>cache,keys:async()=>[]},
 fetch:async()=>{throw Error('Airplane mode')},
 location:{origin:'https://example.org'},
 URL,
 Response:{error:()=>({error:true})}
};
vm.runInNewContext(sw,ctx);
let install;
handlers.install({waitUntil:promise=>install=promise});
await install;
assert.ok(Array.isArray(files));
for(const name of ['./index.html','./app.js','./audio-engine.js',
 './audio-studio.js','./glitch-engine.js','./styles.css',
 '../looks.json','../ntsc-photo.js','../jszip.min.js']){
 assert.ok(files.includes(name),'Offline cache misses '+name);
}
let response;
handlers.fetch({
 request:{method:'GET',url:'https://example.org/video/app.js?v=0.7.3',mode:'cors'},
 respondWith:promise=>response=promise
});
assert.deepEqual(await response,{offlineAsset:true},'Offline cached assets must be served when network fails');
console.log('PASS: all 5 hold-balance positions, old events, audio glitch/recovery, offline PWA fetch fallback');
