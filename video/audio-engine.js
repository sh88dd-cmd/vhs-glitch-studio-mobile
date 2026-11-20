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
  this.mix={videoVolume:100,musicVolume:75,musicStart:0,musicOffset:0,musicLoop:true};
  this.musicBuffer=null;this.musicSource=null;this.musicPlayAt=-1;this.musicCtxStart=0;
 }
 async start(){
  if(this.connected){if(this.ctx.state==='suspended')await this.ctx.resume();return;}
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw Error('Web Audio недоступен в этом браузере.');
  this.ctx=new Context();
  const ctx=this.ctx;
  this.source=ctx.createMediaElementSource(this.element);
  this.analyser=ctx.createAnalyser();this.analyser.fftSize=1024;this.analyser.smoothingTimeConstant=.65;
  this.spectrum=new Uint8Array(this.analyser.frequencyBinCount);
  // Listen to original soundtrack before tape degradation; this branch is silent.
  this.source.connect(this.analyser);
  this.analysisSink=ctx.createGain();this.analysisSink.gain.value=0;
  this.analyser.connect(this.analysisSink);this.analysisSink.connect(ctx.destination);
  // Two independent volume controls; both feed the SAME VHS damage pipeline.
  this.videoGain=ctx.createGain();this.videoGain.gain.value=1;
  this.musicGain=ctx.createGain();this.musicGain.gain.value=.75;
  this.mixer=ctx.createGain();this.mixer.gain.value=1;
  this.source.connect(this.videoGain);this.videoGain.connect(this.mixer);
  this.musicGain.connect(this.mixer);
  this.musicAnalyser=ctx.createAnalyser();this.musicAnalyser.fftSize=1024;this.musicAnalyser.smoothingTimeConstant=.65;
  this.musicAnalyser.connect(this.analysisSink);
  this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';
  this.delay=ctx.createDelay(.25);this.delay.delayTime.value=.015;
  this.saturator=ctx.createWaveShaper();this.saturator.oversample='none';
  this.gain=ctx.createGain();
  this.monitor=ctx.createMediaStreamDestination();
  // Dry bypass preserves the unchanged original when VHS AUDIO is switched off.
  this.dry=ctx.createGain();this.dry.gain.value=1;
  this.wet=ctx.createGain();this.wet.gain.value=0;
  this.mixer.connect(this.dry);this.dry.connect(ctx.destination);this.dry.connect(this.monitor);
  // The combined music + camera-audio signal passes through VHS damage together.
  this.mixer.connect(this.filter);
  this.filter.connect(this.saturator);this.saturator.connect(this.delay);this.delay.connect(this.gain);
  this.gain.connect(this.wet);this.wet.connect(ctx.destination);this.wet.connect(this.monitor);
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
  this.setMix(this.mix);
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
  this.dry.gain.setTargetAtTime(enabled?0:1,now,.015);
  this.wet.gain.setTargetAtTime(enabled?1:0,now,.015);
  this.filter.frequency.setTargetAtTime(C(hz,1100,19500),now,.028);
  this.filter.Q.setTargetAtTime(.5,now,.025);
  const distort=enabled?strength*C((s.saturation||0)/100,0,1):0;
  // AudioTape effect uses one simple, deterministic analog-like smooth saturation curve.
  if(distort>.002){
   const curve=new Float32Array(257);
   const drive=1+distort*5,denom=Math.tanh(drive);
   for(let i=0;i<curve.length;i++)curve[i]=Math.tanh(((i/128)-1)*drive)/denom;
   this.saturator.curve=curve;
  }else this.saturator.curve=null;
  const wobble=enabled?(s.wow||0)/100*strength:0;
  const flutter=enabled?(s.flutter||0)/100*strength:0;
  const delaySeconds=enabled?.012+wobble*.006*Math.sin(time*2.3)+flutter*.0016*Math.sin(time*26.4):0;
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
 setMix(settings){
  const prev=this.mix;
  const next={...prev,...(settings||{})};
  next.videoVolume=C(Number(next.videoVolume)||0,0,100);
  next.musicVolume=C(Number(next.musicVolume)||0,0,100);
  next.musicStart=C(Number(next.musicStart)||0,0,7200);
  next.musicOffset=C(Number(next.musicOffset)||0,0,7200);
  next.musicLoop=!!next.musicLoop;
  const shift=next.musicStart!==prev.musicStart||next.musicOffset!==prev.musicOffset||next.musicLoop!==prev.musicLoop;
  this.mix=next;
  if(this.connected){
   const now=this.ctx.currentTime;
   this.videoGain.gain.setTargetAtTime(next.videoVolume/100,now,.014);
   this.musicGain.gain.setTargetAtTime(next.musicVolume/100,now,.014);
   if(shift)this.stopMusic();
  }
 }
 setMusicBuffer(buffer){
  this.stopMusic();
  this.musicBuffer=buffer||null;
 }
 stopMusic(){
  if(this.musicSource){
   const old=this.musicSource;this.musicSource=null;
   old.onended=null;
   try{old.stop()}catch{}
   try{old.disconnect()}catch{}
   // Release the source's strong reference to the decoded audio buffer.
   try{old.buffer=null}catch{}
  }
  this.musicPlayAt=-1;
 }
 async decodeMusic(bytes){
  await this.start();
  if(!bytes?.byteLength)throw Error('Аудиоданные пустые.');
  // Safari might detach source ArrayBuffer when decoding; caller never reuses it.
  const buffer=await this.ctx.decodeAudioData(bytes.slice(0));
  if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Не удалось декодировать музыкальный файл.');
  this.setMusicBuffer(buffer);
  return buffer;
 }
 syncMusic(videoTime,playing){
  if(!this.connected||!this.musicBuffer||!playing){this.stopMusic();return;}
  const duration=this.musicBuffer.duration;
  const local=Number(videoTime)-this.mix.musicStart;
  if(!Number.isFinite(local)||local<0||duration<=0){this.stopMusic();return;}
  const absolute=local+this.mix.musicOffset;
  if(!this.mix.musicLoop&&absolute>=duration){this.stopMusic();return;}
  // A BufferSource cannot pause/seek. Recreate only on a seek or clock drift.
  const drift=this.musicSource?
   Math.abs(this.musicPlayAt+(this.ctx.currentTime-this.musicCtxStart)-Number(videoTime)):Infinity;
  if(this.musicSource&&drift<.40)return;
  this.stopMusic();
  const offset=this.mix.musicLoop?((absolute%duration)+duration)%duration:Math.min(duration-.002,absolute);
  const node=this.ctx.createBufferSource();node.buffer=this.musicBuffer;node.loop=this.mix.musicLoop;
  node.connect(this.musicGain);
  // The analyser reads the selected MUSIC track before its volume control.
  node.connect(this.musicAnalyser);
  this.musicSource=node;
  this.musicPlayAt=Number(videoTime);
  this.musicCtxStart=this.ctx.currentTime;
  node.onended=()=>{if(this.musicSource===node){this.musicSource=null;this.musicPlayAt=-1;}};
  try{node.start(0,offset);}
  catch(err){this.musicSource=null;this.musicPlayAt=-1;throw err;}
 }
 getLevels(){
  if(!this.connected||!this.analyser||!this.spectrum||this.ctx?.state==='suspended')return{bass:0,mid:0,high:0,rms:0,available:false};
  const active=this.musicBuffer?this.musicAnalyser:this.analyser;
  active.getByteFrequencyData(this.spectrum);
  const nyquist=this.ctx.sampleRate/2,bins=this.spectrum.length;
  function band(lo,hi){
   const a=Math.max(0,Math.ceil(lo/nyquist*bins)),b=Math.min(bins,Math.max(a+1,Math.ceil(hi/nyquist*bins)));
   let sum=0;for(let i=a;i<b;i++)sum+=this.spectrum[i];
   return sum/Math.max(1,b-a)/255;
  }
  const bass=band.call(this,45,200),mid=band.call(this,200,2200),high=band.call(this,2200,9000);
  return{bass,mid,high,rms:(bass+mid+high)/3,available:true};
 }
 getMusicMemoryMB(){
  if(!this.musicBuffer)return 0;
  return Math.round((Number(this.musicBuffer.length)||0)*(Number(this.musicBuffer.numberOfChannels)||2)*4/1048576*10)/10;
 }
 // Called during real navigation/close; garbage collection timing is browser-controlled.
 release(){
  this.stopMusic();this.musicBuffer=null;
  this.suspendNoise();
  if(this.noise){try{this.noise.stop()}catch{}try{this.noise.disconnect()}catch{}this.noise=null;}
  const ctx=this.ctx;
  if(ctx){try{ctx.close()}catch{}}
  this.connected=false;this.stream=null;this.spectrum=null;
 }
 getTracks(){return this.stream?.getAudioTracks()||[];}
 suspendNoise(){if(this.noiseGain&&this.ctx)this.noiseGain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}
}
root.VHSVideoTapeAudio=Object.freeze({create:el=>new TapeAudio(el)});
})(window);
