/* VHS Video Lab — degraded VHS audio via Web Audio, reused for listening & export.
 * Source: user's video element. No microphone, network, third-party code.
 */
(function(root){
'use strict';
const C=(v,a,b)=>Math.max(a,Math.min(b,v));
function rand(seed,index){
 let h=(seed^Math.imul(index+1,0x85ebca6b))>>>0;
 h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);return((h^(h>>>16))>>>0)/4294967296;
}
class TapeAudio{
 constructor(element){
  this.element=element;this.ctx=null;this.stream=null;this.filter=null;this.delay=null;this.saturator=null;this.gain=null;this.noiseGain=null;this.noise=null;this.bypass=false;this.connected=false;
  this.state={enabled:false,mode:'linear',strength:55,hiss:45,wow:40,flutter:30,drop:25,saturation:20,seed:0};
 }
 async start(){
  if(this.connected){if(this.ctx.state==='suspended')await this.ctx.resume();return;}
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw Error('Web Audio недоступен в этом браузере.');
  this.ctx=new Context();
  const ctx=this.ctx;
  this.source=ctx.createMediaElementSource(this.element);
  this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';
  this.delay=ctx.createDelay(.25);this.delay.delayTime.value=.015;
  this.saturator=ctx.createWaveShaper();this.saturator.oversample='none';
  this.gain=ctx.createGain();
  this.monitor=ctx.createMediaStreamDestination();
  // Same processed graph serves local speakers and the exported audio track.
  this.source.connect(this.filter);
  this.filter.connect(this.saturator);this.saturator.connect(this.delay);this.delay.connect(this.gain);
  this.gain.connect(ctx.destination);this.gain.connect(this.monitor);
  const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*2),ctx.sampleRate);
  const samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++){samples[i]=(rand(73811,i)-.5)*2;}
  this.noise=ctx.createBufferSource();this.noise.buffer=buffer;this.noise.loop=true;
  const hissFilter=ctx.createBiquadFilter();hissFilter.type='highpass';hissFilter.frequency.value=670;
  this.noiseGain=ctx.createGain();this.noiseGain.gain.value=0;
  this.noise.connect(hissFilter);hissFilter.connect(this.noiseGain);
  this.noiseGain.connect(ctx.destination);this.noiseGain.connect(this.monitor);
  this.noise.start();
  this.stream=this.monitor.stream;
  this.connected=true;
  this.update(this.state,0,false);
  if(ctx.state==='suspended')await ctx.resume();
 }
 update(settings,time,playing=true){
  this.state={...this.state,...settings};
  if(!this.connected)return;
  const s=this.state,ctx=this.ctx,now=ctx.currentTime;
  const strength=C(Number(s.strength??50)/100,0,1);
  const enabled=!!s.enabled&&strength>0;
  const type=s.mode==='hifi'?'hifi':'linear';
  const hz=enabled?(type==='hifi'?14800-(s.strength||0)*42:4900-(s.strength||0)*27):19500;
  this.filter.frequency.setTargetAtTime(C(hz,1100,19500),now,.028);
  this.filter.Q.setTargetAtTime(.5,now,.025);
  const distort=enabled?strength*C((s.saturation||0)/100,0,1):0;
  // AudioTape effect uses one simple, deterministic analog-like smooth saturation curve.
  const curve=new Float32Array(257);
  const drive=1+distort*5;
  const denom=Math.tanh(drive);
  for(let i=0;i<curve.length;i++)curve[i]=Math.tanh(((i/128)-1)*drive)/denom;
  this.saturator.curve=curve;
  const wobble=enabled?(s.wow||0)/100*strength:0;
  const flutter=enabled?(s.flutter||0)/100*strength:0;
  const delaySeconds=.012+wobble*.006*Math.sin(time*2.3)+flutter*.0016*Math.sin(time*26.4);
  this.delay.delayTime.setTargetAtTime(C(delaySeconds,0,.065),now,.018);
  let dropout=1;
  if(enabled&&(s.drop||0)>0){
   const slot=Math.floor(time*2.4),u=rand(s.seed||1,slot);
   const fade=(time*2.4)%1;
   if(u<.12+(s.drop||0)/100*.43&&fade<.20)dropout=C(.08+fade*3.7,0,1);
  }
  this.gain.gain.setTargetAtTime(dropout*(enabled?(1-.16*strength):1),now,.018);
  const noise=enabled&&playing?C((s.hiss||0)/100,0,1)*strength*(type==='hifi'?.006:.025):0;
  this.noiseGain.gain.setTargetAtTime(noise,now,.035);
 }
 getTracks(){return this.stream?.getAudioTracks()||[];}
 suspendNoise(){if(this.noiseGain&&this.ctx)this.noiseGain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}
}
root.VHSVideoTapeAudio=Object.freeze({create:el=>new TapeAudio(el)});
})(window);
