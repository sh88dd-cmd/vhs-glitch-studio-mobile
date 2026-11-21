/* Regression coverage for 0.7.1 live LEDs and non-destructive effects bypass.
 * Runs with Node only, no browser or remote server needed.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const css=fs.readFileSync('video/styles.css','utf8');
const start=app.indexOf(' function setIndicator(');
const end=app.indexOf(' function showAudioSection(',start);
assert.ok(start>0&&end>start,'Cannot locate master indicator logic');
const lighting=app.slice(start,end);
function el(){
 const statuses=new Set();
 return {
  classList:{
   contains:k=>statuses.has(k),
   toggle:(k,v)=>{if(v)statuses.add(k);else statuses.delete(k);}
  },
  setAttribute(k,v){this[k]=v;},
  dataset:{},textContent:'',value:'',disabled:false,
  querySelectorAll(){return[];},querySelector(){return null;}
 };
}
const elements=new Map();
const $=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
const tabs=['vhs','glitch','audio','timeline','film','filmDamage','camera','cassettes'].map(name=>{
 const e=el();e.dataset.tab=name;return e;
});
const subs=['tracks','trim','beat','tape'].map(name=>{
 const e=el();e.dataset.audioSection=name;return e;
});
const doc={body:el(),querySelectorAll(selector){
 if(selector==='.tabs [data-tab]')return tabs;
 if(selector==='[data-audio-section]')return subs;
 return [];
}};
const state={
 masterBypass:false,fxMode:'music',vhsEnabled:true,master:80,mode:'vhs',
 modeStrength:75,glitchEnabled:true,glitchStrength:80,
 filmEnabled:true,filmStrength:80,
 filmDamage:{enabled:true,leak:75,dust:15,scratches:25,grain:40,flicker:12,halation:20},
 camera:{date:true,rec:true},audio:{enabled:true,strength:65},
 music:{strength:75},selectedCassetteId:null,keepAudio:true,
 mix:{musicOffset:0,musicTrimEnd:10,musicStart:0,fadeIn:0,fadeOut:0,musicLoop:true},
 holdEvents:[],timelineEvents:[]
};
const original=JSON.stringify({...state,masterBypass:false});
const buffer={duration:10},engine={musicBuffer:buffer,extraAudio:[],getMusicDuration:()=>10};
let saved=0,drawn=0,synced=0;
const factory=new Function('state','audioEngine','audioStudio','document','$','holdActive',
 'clipIndex','recording','finishHold','resetFrameHistory','syncModeUI','syncAudio',
 'syncHoldControls','persist','renderCurrentFrame',
 lighting+'return {syncSectionLights,toggleAllEffects};');
const ctx=factory(state,engine,{count:()=>1},doc,$,null,0,false,
 ()=>{},()=>{},()=>{},()=>{synced++;},()=>{},()=>{saved++;},()=>{drawn++;});
ctx.syncSectionLights();
assert.ok(tabs[2].classList.contains('is-lit'),'Audio tab must be lit with imported tracks');
assert.ok(subs[0].classList.contains('is-lit'),'Audio/Tracks must be lit with imported file');
assert.ok(subs[2].classList.contains('is-lit'),'Audio/Beat must be lit in music mode');
assert.ok(tabs[5].classList.contains('is-lit'),'Film Damage must be lit when enabled');
assert.equal($('allEffectsLabel').textContent,'ВЫКЛЮЧИТЬ ВСЁ');
ctx.toggleAllEffects();ctx.syncSectionLights();
assert.equal(state.masterBypass,true);
assert.ok([...tabs,...subs].every(b=>!b.classList.contains('is-lit')),
 'Master bypass must extinguish all active section LEDs');
assert.equal($('allEffectsLabel').textContent,'ВЕРНУТЬ ЭФФЕКТЫ');
assert.equal($('allEffectsToggle')['aria-pressed'],'true');
assert.ok(doc.body.classList.contains('effects-bypassed'));
ctx.toggleAllEffects();ctx.syncSectionLights();
assert.equal(state.masterBypass,false);
assert.ok(tabs[2].classList.contains('is-lit'),'Active indicator must restore');
assert.equal(JSON.stringify({...state,masterBypass:false}),original,
 'Global bypass must not reset existing effect settings');
assert.equal(saved,2);
assert.equal(drawn,2);
assert.equal(synced,2);
const locked=factory(state,engine,{count:()=>1},doc,$,null,0,true,
 ()=>{},()=>{},()=>{},()=>{},()=>{},()=>{},()=>{});
locked.toggleAllEffects();
assert.equal(state.masterBypass,false,'Export must lock out the global bypass action');

for(const gate of [
 '!state.masterBypass&&state.filmEnabled',
 '!state.masterBypass&&state.filmDamage.enabled',
 'if(!state.masterBypass)drawOsd',
 '!state.masterBypass&&state.fxMode',
 '!state.masterBypass&&(state.fxMode',
 '!state.masterBypass&&intensity>0',
 'audioEngine.syncMusic(globalVideoTime(),active&&!state.masterBypass)',
 'enabled:!state.masterBypass&&state.audio.enabled',
 'videoVolume:100,musicVolume:0'
])assert.ok(app.includes(gate),'Missing rendering/audio bypass: '+gate);
assert.ok(html.includes('id="allEffectsToggle"')&&html.includes('id="masterFxStatus"'));
assert.ok(css.includes('.allEffectsCross')&&css.includes('.control.is-lit'));
assert.ok(!app.includes('extraTracks.length'),'Regression: undefined extraTracks causes LED failure');
console.log('PASS: individual LED state, audio sub-tabs, global bypass and restore.');
