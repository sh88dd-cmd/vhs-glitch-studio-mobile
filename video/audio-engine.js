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
  this.mix={videoVolume:100,musicVolume:75,musicStart:0,musicOffset:0,musicTrimEnd:0,musicLoop:true,fadeIn:0,fadeOut:0};
  this.musicBuffer=null;this.musicSource=null;this.musicPlayAt=-1;this.musicCtxStart=0;this.extraAudio=[];
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
  const tapeEnabled=!!s.enabled&&strength>0;
  // A press of the ⚡ hold button temporarily corrupts the shared mixed
  // soundtrack (camera + imported music), independently from VHS AUDIO.
  // Only the time-based event envelope is stored; no extra video/audio decoder.
  const held=playing?C(Number(s.holdGlitch)||0,0,1):0;
  const device=['camcorder','walkman','radio','phone','cctv','broken'].includes(s.device)?s.device:'off';
  const devices={
   off:{hz:19500,q:.5,hiss:0,saturation:0,wow:0,drop:0,band:false},
   camcorder:{hz:6800,q:.55,hiss:.009,saturation:.12,wow:.06,drop:0,band:false},
   walkman:{hz:5600,q:.6,hiss:.014,saturation:.16,wow:.15,drop:.03,band:false},
   radio:{hz:1500,q:.72,hiss:.028,saturation:.36,wow:0,drop:.05,band:true},
   phone:{hz:1950,q:1.05,hiss:.012,saturation:.27,wow:0,drop:0,band:true},
   cctv:{hz:3200,q:.8,hiss:.025,saturation:.22,wow:0,drop:.07,band:false},
   broken:{hz:2400,q:1.0,hiss:.046,saturation:.6,wow:.32,drop:.28,band:false}
  };
  const profile=devices[device],deviceActive=device!=='off';
  const enabled=tapeEnabled||deviceActive||held>.001;
  const type=s.mode==='hifi'?'hifi':'linear';
  const baseHz=tapeEnabled?(type==='hifi'?14800-(s.strength||0)*42:4900-(s.strength||0)*27):19500;
  const tearingHz=5600-3800*held+300*Math.sin(time*13.1);
  const hz=held>0?Math.min(baseHz,tearingHz,profile.hz):Math.min(baseHz,profile.hz);
  const filterType=profile.band?'bandpass':'lowpass';
  if(this.filter.type!==filterType)this.filter.type=filterType;
  this.dry.gain.setTargetAtTime(enabled?0:1,now,.012);
  this.wet.gain.setTargetAtTime(enabled?1:0,now,.012);
  this.filter.frequency.setTargetAtTime(C(hz,1100,19500),now,.012);
  this.filter.Q.setTargetAtTime(profile.q+held*1.1,now,.02);
  const tapeDistort=tapeEnabled?strength*C((s.saturation||0)/100,0,1):0;
  const distort=Math.max(tapeDistort,held*.72,profile.saturation);
  // AudioTape effect uses one simple, deterministic analog-like smooth saturation curve.
  if(distort>.002){
   const curve=new Float32Array(257);
   const drive=1+distort*5,denom=Math.tanh(drive);
   for(let i=0;i<curve.length;i++)curve[i]=Math.tanh(((i/128)-1)*drive)/denom;
   this.saturator.curve=curve;
  }else this.saturator.curve=null;
  const wobble=tapeEnabled?(s.wow||0)/100*strength:0;
  const flutter=tapeEnabled?(s.flutter||0)/100*strength:0;
  const delaySeconds=enabled?
   .012+(wobble+profile.wow)*.006*Math.sin(time*2.3)+flutter*.0016*Math.sin(time*26.4)+
   held*(.004+Math.sin(time*33)*.0028):0;
  this.delay.delayTime.setTargetAtTime(C(delaySeconds,0,.065),now,.012);
  let dropout=1;
  if(tapeEnabled&&(s.drop||0)>0){
   const slot=Math.floor(time*2.4),u=rand(s.seed||1,slot);
   const fade=(time*2.4)%1;
   if(u<.12+(s.drop||0)/100*.43&&fade<.20)dropout=C(.08+fade*3.7,0,1);
  }
  if(deviceActive&&profile.drop>0){
   const index=Math.floor(time*3.3);
   if(rand(s.seed||1,index+22001)<profile.drop&&time%0.32<.09)dropout=Math.min(dropout,.12);
  }
  if(held>.001){
   // Short repeatable tape-head cuts, synchronized to the *video timestamp*.
   // At the same timestamp during playback and export the envelope is equal.
   const cutIndex=Math.floor(time*17);
   const randomCut=rand(s.seed||1,cutIndex+17413);
   if(randomCut<.24+.48*held){
    const phase=(time*17)%1;
    const cutShape=phase<.62?1:Math.max(0,(1-phase)/.38);
    dropout=Math.min(dropout,1-held*.94*cutShape);
   }
  }
  this.gain.gain.setTargetAtTime(dropout*(tapeEnabled?(1-.16*strength):1)*(deviceActive?.92:1),now,.009);
  const tapeNoise=tapeEnabled&&playing?C((s.hiss||0)/100,0,1)*strength*(type==='hifi'?.006:.025):0;
  const noise=tapeNoise+(playing?held*.024+profile.hiss:0);
  this.noiseGain.gain.setTargetAtTime(C(noise,0,.12),now,.018);
 }
 setMix(settings){
  const prev=this.mix;
  const next={...prev,...(settings||{})};
  next.videoVolume=C(Number(next.videoVolume)||0,0,100);
  next.musicVolume=C(Number(next.musicVolume)||0,0,100);
  next.musicStart=C(Number(next.musicStart)||0,0,7200);
  next.musicOffset=C(Number(next.musicOffset)||0,0,7200);
  next.musicTrimEnd=C(Number(next.musicTrimEnd)||0,0,7200);
  next.musicLoop=!!next.musicLoop;
  next.fadeIn=C(Number(next.fadeIn)||0,0,30);next.fadeOut=C(Number(next.fadeOut)||0,0,30);
  const shift=next.musicStart!==prev.musicStart||next.musicOffset!==prev.musicOffset||next.musicTrimEnd!==prev.musicTrimEnd||next.musicLoop!==prev.musicLoop;
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
 getMusicDuration(){return this.musicBuffer?.duration||0;}
 stopMainMusic(){
  if(this.musicSource){
   const old=this.musicSource;this.musicSource=null;old.onended=null;
   try{old.stop()}catch{}
   try{old.disconnect()}catch{}
   try{old.buffer=null}catch{}
  }
  this.musicPlayAt=-1;
 }
 stopExtras(){
  for(const track of this.extraAudio){
   if(track.node){
    const node=track.node;track.node=null;node.onended=null;
    try{node.stop()}catch{}
    try{node.disconnect()}catch{}
    try{node.buffer=null}catch{}
   }
   track.playAt=-1;
  }
 }
 stopMusic(){this.stopMainMusic();this.stopExtras();}
 setExtraTracks(tracks){
  this.stopExtras();
  for(const old of this.extraAudio){try{old.gain?.disconnect()}catch{}}
  this.extraAudio=[];
  if(!this.connected)return;
  for(const item of (tracks||[]).slice(0,2)){
   if(!item?.buffer||!item.buffer.duration)continue;
   const gain=this.ctx.createGain();gain.gain.value=0;gain.connect(this.mixer);
   this.extraAudio.push({...item,gain,node:null,playAt:-1,ctxStart:0});
  }
 }
 async decodeMusic(bytes){
  await this.start();
  if(!bytes?.byteLength)throw Error('Аудиоданные пустые.');
  const buffer=await this.ctx.decodeAudioData(bytes.slice(0));
  if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Не удалось декодировать музыкальный файл.');
  this.setMusicBuffer(buffer);
  return buffer;
 }
 syncMusic(videoTime,playing){
  if(!this.connected||!playing){this.stopMusic();return;}
  const duration=this.getMusicDuration();
  if(duration>0){
   const start=C(this.mix.musicOffset,0,Math.max(0,duration-.05));
   const end=this.mix.musicTrimEnd>0?C(this.mix.musicTrimEnd,start+.05,duration):duration;
   const length=end-start,local=Number(videoTime)-this.mix.musicStart;
   if(!Number.isFinite(local)||local<0||length<=0||(!this.mix.musicLoop&&local>=length)){
    this.stopMainMusic();
    this.musicGain.gain.setTargetAtTime(0,this.ctx.currentTime,.015);
   }else{
    const phase=this.mix.musicLoop?(local%length):local;
    const offset=start+phase;
    const drift=this.musicSource?
     Math.abs(this.musicPlayAt+(this.ctx.currentTime-this.musicCtxStart)-Number(videoTime)):Infinity;
    if(!this.musicSource||drift>=.40){
     this.stopMainMusic();
     const node=this.ctx.createBufferSource();node.buffer=this.musicBuffer;node.loop=this.mix.musicLoop;
     if(node.loop){node.loopStart=start;node.loopEnd=end;}
     node.connect(this.musicGain);node.connect(this.musicAnalyser);
     this.musicSource=node;this.musicPlayAt=Number(videoTime);this.musicCtxStart=this.ctx.currentTime;
     node.onended=()=>{if(this.musicSource===node){this.musicSource=null;this.musicPlayAt=-1;}};
     try{if(node.loop)node.start(0,offset);else node.start(0,offset,Math.max(.005,end-offset));}
     catch(err){this.musicSource=null;this.musicPlayAt=-1;throw err;}
    }
    const fi=Math.max(0,this.mix.fadeIn||0),fo=Math.max(0,this.mix.fadeOut||0);
    const envelope=Math.min(1,fi>0?phase/fi:1,fo>0?(length-phase)/fo:1);
    this.musicGain.gain.setTargetAtTime(this.mix.musicVolume/100*C(envelope,0,1),this.ctx.currentTime,.025);
   }
  }else this.stopMainMusic();
  for(const track of this.extraAudio){
   const d=track.buffer.duration,start=C(Number(track.trimStart)||0,0,Math.max(0,d-.05));
   const end=Number(track.trimEnd)>0?C(Number(track.trimEnd),start+.05,d):d;
   const length=end-start,local=Number(videoTime)-(Number(track.at)||0);
   const looping=!!track.loop;
   if(!Number.isFinite(local)||local<0||length<=0||(!looping&&local>=length)){
    if(track.node){
     const node=track.node;track.node=null;node.onended=null;
     try{node.stop()}catch{}try{node.disconnect()}catch{}
    }
    track.playAt=-1;track.gain.gain.setTargetAtTime(0,this.ctx.currentTime,.012);
    continue;
   }
   const phase=looping?(local%length):local;
   const offset=start+phase;
   const drift=track.node?
    Math.abs(track.playAt+(this.ctx.currentTime-track.ctxStart)-Number(videoTime)):Infinity;
   if(!track.node||drift>=.4){
    if(track.node){
     const old=track.node;old.onended=null;try{old.stop()}catch{}try{old.disconnect()}catch{}
    }
    const node=this.ctx.createBufferSource();
    node.buffer=track.buffer;node.loop=looping;
    if(looping){node.loopStart=start;node.loopEnd=end;}
    node.connect(track.gain);node.connect(this.musicAnalyser);
    track.node=node;track.playAt=Number(videoTime);track.ctxStart=this.ctx.currentTime;
    node.onended=()=>{if(track.node===node){track.node=null;track.playAt=-1;}};
    try{if(looping)node.start(0,offset);else node.start(0,offset,Math.max(.005,end-offset));}
    catch(e){track.node=null;track.playAt=-1;console.warn('Дополнительная дорожка',e);}
   }
   const fi=C(Number(track.fadeIn)||0,0,30),fo=C(Number(track.fadeOut)||0,0,30);
   const level=C(Math.min(1,fi>0?phase/fi:1,fo>0?(length-phase)/fo:1),0,1);
   track.gain.gain.setTargetAtTime(C(Number(track.volume)||0,0,100)/100*level,this.ctx.currentTime,.025);
  }
 }
 getLevels(){
  if(!this.connected||!this.analyser||!this.spectrum||this.ctx?.state==='suspended')return{bass:0,mid:0,high:0,rms:0,available:false};
  const active=(this.musicBuffer||this.extraAudio.length)?this.musicAnalyser:this.analyser;
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
  for(const tr of this.extraAudio){try{tr.gain.disconnect()}catch{}}this.extraAudio=[];
  this.suspendNoise();
  if(this.noise){try{this.noise.stop()}catch{}try{this.noise.disconnect()}catch{}this.noise=null;}
  const ctx=this.ctx;
  if(ctx){try{const closing=ctx.close();if(closing?.catch)closing.catch(()=>{});}catch{}}
  this.connected=false;this.stream=null;this.spectrum=null;
 }
 getTracks(){return this.stream?.getAudioTracks()||[];}
 suspendNoise(){if(this.noiseGain&&this.ctx)this.noiseGain.gain.setTargetAtTime(0,this.ctx.currentTime,.025);}
}
root.VHSVideoTapeAudio=Object.freeze({create:el=>new TapeAudio(el)});
})(window);
