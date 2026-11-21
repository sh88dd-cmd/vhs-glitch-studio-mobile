/* VHS Video Lab 0.7.4 — a genuine zero-effects editor reset.
 * Only processing settings are changed. Media, presets, file metadata,
 * export quality and native sound level are not deleted.
 */
(function(root){
'use strict';
const FIELDS=[
 'vhsEnabled','filmEnabled','glitchEnabled','master','preset','mode',
 'modeStrength','eventDensity','glitchStrength','fxMode',
 'music','timelineEvents','timelineStrength','holdEvents','holdBalance',
 'filmStrength','signal','glitches','audio','camera','filmDamage',
 'selectedCassetteId','mix'
];
const CAMERA_FLAGS=['rec','play','battery','date','counter','zoom','modeInfo','focus'];
const deep=value=>JSON.parse(JSON.stringify(value));
function snapshot(state){
 const result={};
 for(const key of FIELDS)if(Object.prototype.hasOwnProperty.call(state,key))result[key]=deep(state[key]);
 return result;
}
function zero(state){
 state.masterBypass=false; // migrate old persistent hard-bypass to usable controls
 state.vhsEnabled=false;state.filmEnabled=false;state.glitchEnabled=false;
 state.master=0;state.preset='classic';state.mode='vhs';state.modeStrength=0;
 state.eventDensity=0;state.glitchStrength=0;state.fxMode='classic';
 state.timelineStrength=0;state.timelineEvents=[];state.holdEvents=[];state.holdBalance=50;
 state.filmStrength=0;state.selectedCassetteId=null;
 for(const key of Object.keys(state.signal||{}))if(typeof state.signal[key]==='number')state.signal[key]=0;
 for(const key of Object.keys(state.glitches||{}))if(typeof state.glitches[key]==='number')state.glitches[key]=0;
 for(const key of ['sensitivity','threshold','strength','release'])
  if(state.music)state.music[key]=0;
 if(state.audio){
  state.audio.enabled=false;
  for(const key of ['strength','hiss','wow','flutter','drop','saturation'])state.audio[key]=0;
 }
 if(state.filmDamage){
  state.filmDamage.enabled=false;
  for(const key of ['leak','dust','grain','scratches','flicker','halation'])state.filmDamage[key]=0;
 }
 if(state.camera)for(const key of CAMERA_FLAGS)state.camera[key]=false;
 // Keep original video's native soundtrack, mute (not delete) imported music.
 // Preserve the mix object: Audio Studio holds a reference to it.
 if(state.mix){
  Object.assign(state.mix,{videoVolume:100,musicVolume:0,musicStart:0,
   musicOffset:0,musicTrimEnd:0,musicLoop:false,fadeIn:0,fadeOut:0});
 }
 return state;
}
function restore(state,saved){
 if(!saved||typeof saved!=='object')return false;
 for(const key of FIELDS){
  if(!Object.prototype.hasOwnProperty.call(saved,key))continue;
  const value=saved[key];
  if(value===undefined||typeof value==='function')continue;
  if(key==='mix'&&value&&typeof value==='object'&&!Array.isArray(value)){
   Object.assign(state.mix,value);continue;
  }
  if(key==='camera'&&value&&typeof value==='object'&&!Array.isArray(value)){
   Object.assign(state.camera,value);
   if(value.positions)state.camera.positions={...value.positions};
   if(value.sizes)state.camera.sizes={...value.sizes};
   continue;
  }
  state[key]=deep(value);
 }
 state.masterBypass=false;
 return true;
}
function isZero(state){
 const sample=snapshot(state);
 const test=deep(sample);
 test.masterBypass=false;
 zero(test);
 return JSON.stringify(sample)===JSON.stringify(snapshot(test));
}
root.VHSVideoEffectsReset=Object.freeze({snapshot,zero,restore,isZero});
})(window);
