/* Regression tests for 0.7.4: true zero reset and last-settings restoration. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const css=fs.readFileSync('video/styles.css','utf8');
const pure=fs.readFileSync('video/effects-reset.js','utf8');
const exports={};
vm.runInNewContext(pure,{window:exports,JSON,Object,Array,Number,Math});
const fx=exports.VHSVideoEffectsReset;
assert.ok(fx);
const state={
 masterBypass:false,vhsEnabled:true,filmEnabled:true,glitchEnabled:true,master:80,
 preset:'damaged',mode:'crt',modeStrength:75,eventDensity:48,glitchStrength:65,fxMode:'music',
 music:{bassEffect:'vhold',highEffect:'rf',sensitivity:66,threshold:25,strength:75,release:35},
 timelineEvents:[{clip:0,time:1,effect:'rf',strength:95}],timelineStrength:70,
 holdEvents:[{clip:0,start:1,end:2,blend:75}],holdBalance:45,
 filmStrength:60,signal:{chromaBleed:60,tracking:55,noise:80},
 glitches:{tapeChew:85,rf:43},
 audio:{enabled:true,mode:'hifi',strength:65,hiss:50,wow:20,flutter:20,drop:40,saturation:80},
 camera:{date:true,rec:true,battery:true,positions:{date:'left-top'},sizes:{rec:125}},
 filmDamage:{enabled:true,type:'both',leak:90,dust:15,scratches:25,grain:40,flicker:12,halation:20},
 selectedCassetteId:'builtin-chewed',mix:{videoVolume:60,musicVolume:90,musicStart:0,musicOffset:4,musicTrimEnd:8,musicLoop:true,fadeIn:2,fadeOut:2},
 selectedTrack:{kind:'video',title:'song.mov'},cassettes:[{name:'My tape',id:'a'}],
 size:'480',fps:15,exportScope:'30',keepAudio:true
};
const raw=JSON.stringify(state),mix=state.mix;
const backup=fx.snapshot(state);
fx.zero(state);
assert.equal(fx.isZero(state),true,'Effect parameters must be genuinely zero');
assert.equal(state.masterBypass,false,'Hard bypass must remain off');
assert.equal(state.master,0);assert.equal(state.filmStrength,0);assert.equal(state.glitchStrength,0);
assert.deepEqual(Object.values(state.glitches),[0,0]);
assert.ok(!state.filmDamage.enabled&&state.filmDamage.leak===0);
assert.ok(state.holdEvents.length===0&&state.timelineEvents.length===0);
assert.ok(!state.camera.date&&!state.camera.rec);
assert.equal(state.mix.videoVolume,100,'Native video audio must survive');
assert.equal(state.mix.musicVolume,0,'Imported music must be muted, not removed');
assert.equal(state.selectedTrack.title,'song.mov');
assert.equal(state.cassettes[0].name,'My tape');
assert.equal(state.fps,15);assert.equal(state.keepAudio,true);
assert.equal(state.mix,mix,'Mixer reference must remain stable');
fx.restore(state,backup);
assert.equal(JSON.stringify(state),raw,'All saved processing settings must be restored exactly');
assert.equal(state.mix,mix,'Restore must preserve the mixer reference');

const element=()=>{
 const classes=new Set();
 return{classList:{contains:k=>classes.has(k),toggle:(k,on)=>{if(on)classes.add(k);else classes.delete(k);},remove:k=>classes.delete(k)},
  dataset:{},textContent:'',value:'',disabled:false,setAttribute(k,v){this[k]=v;},querySelectorAll:()=>[],querySelector:()=>null,closest:()=>null};
};
const map=new Map(),$=id=>{if(!map.has(id))map.set(id,element());return map.get(id);};
const tabs=['vhs','glitch','audio','timeline','film','filmDamage','camera','cassettes'].map(key=>{const e=element();e.dataset.tab=key;return e;});
const subtabs=['tracks','trim','beat','tape'].map(key=>{const e=element();e.dataset.audioSection=key;return e;});
const doc={body:element(),querySelectorAll:q=>q==='.tabs [data-tab]'?tabs:q==='[data-audio-section]'?subtabs:[]};
const begin=app.indexOf(' function setIndicator(');
const end=app.indexOf(' function resyncAfterEffectReset(',begin);
assert.ok(begin>0&&end>begin,'Cannot find indicator section');
const lighting=app.slice(begin,end);
const run=new Function('state','audioEngine','audioStudio','document','$','holdActive','clipIndex','recording','lastFxSnapshot',
 lighting+'return syncSectionLights;');
const engine={musicBuffer:{duration:10},extraAudio:[{volume:75,buffer:{duration:10}}],
 getMusicDuration:()=>10};
const lights=run(state,engine,{count:()=>1},doc,$,null,0,false,null);
lights();
assert.ok(subtabs[0].classList.contains('is-lit'));
assert.ok(tabs[5].classList.contains('is-lit'));
fx.zero(state);engine.extraAudio[0].volume=0;lights();
assert.ok([...tabs,...subtabs].every(el=>!el.classList.contains('is-lit')),'Zero reset must extinguish all effects lamps');
assert.equal($('allEffectsLabel').textContent,'ВЫКЛЮЧИТЬ ВСЁ');
assert.equal($('restoreEffects').disabled,true);
fx.restore(state,backup);engine.extraAudio[0].volume=75;lights();
assert.ok(tabs[5].classList.contains('is-lit'),'Restoring settings lights the enabled effects again');
assert.ok(html.includes('id="restoreEffects"')&&html.includes('id="allEffectsToggle"'));
assert.ok(html.includes('effects-reset.js?v=0.7.4'));
assert.ok(css.includes('.restoreEffects'));
assert.ok(!app.includes('toggleAllEffects()'),'Obsolete hard bypass action must be removed');
assert.ok(!app.includes('extraTracks.length'),'Old undefined variable must not return');

/* Test the actual editor button handlers: second zero-click must keep backup. */
const resetStart=app.indexOf(' function resetAllEffects(){');
const resetStop=app.indexOf(' function showAudioSection(',resetStart);
assert.ok(resetStart>0&&resetStop>resetStart,'Reset button functions missing.');
const handlers=app.slice(resetStart,resetStop);
const savedData=new Map();let updated=0,repainter=0;
const storage={
 getItem:k=>savedData.get(k)||null,
 setItem:(k,v)=>savedData.set(k,v),
 removeItem:k=>savedData.delete(k)
};
const reference={...JSON.parse(raw),masterBypass:false};
const studioLayer={id:'extra-one',volume:75};
const studio={
 isMuted:()=>studioLayer.volume===0,
 snapshotTracks:()=>[{id:studioLayer.id,volume:studioLayer.volume}],
 resetTrackSettings:()=>{studioLayer.volume=0;},
 restoreTrackSettings:rows=>{studioLayer.volume=rows[0].volume;}
};
const editor=new Function('state','window','audioStudio','localStorage','LAST_FX_KEY',
 'recording','holdActive','finishHold','textStatus','resyncAfterEffectReset','persist',
 'console','Date','let lastFxSnapshot=null;\n'+handlers+
 'return {resetAllEffects,restoreLastEffects,getBackup:()=>lastFxSnapshot};')
 (reference,{VHSVideoEffectsReset:fx},studio,storage,'test.backup',false,null,
 ()=>{},()=>{},()=>{repainter++;},()=>{updated++;},console,Date);
editor.resetAllEffects();
assert.ok(fx.isZero(reference));
assert.equal(studioLayer.volume,0);
assert.ok(editor.getBackup()?.settings);
const originalBackup=savedData.get('test.backup');
editor.resetAllEffects();
assert.equal(savedData.get('test.backup'),originalBackup,'Repeated reset erased original settings');
reference.filmEnabled=true;reference.filmStrength=18;
editor.restoreLastEffects();
assert.equal(reference.filmStrength,60,'Restore ignored prior FILM settings');
assert.equal(studioLayer.volume,75,'Restore ignored extra audio layer volume');
assert.equal(editor.getBackup(),null);
assert.ok(!savedData.has('test.backup'),'Restore must clear one-time backup');
assert.ok(repainter>=2&&updated>=2);
console.log('PASS: button handlers keep latest backup, allow new effects and restore audio tracks');

console.log('PASS: actual zero reset, reversible full settings backup, original media preserved, LEDs update');
