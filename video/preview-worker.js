/* Full-resolution background renderer. The editor sends only one frame at
 * a time. All processing is local; no network or uploads of source media. */
'use strict';
self.window=self;
importScripts('../ntsc-photo.js','./film-core.js','./glitch-engine.js','./film-damage.js','./creative-engine.js');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const glitch=VHSVideoGlitchFX.createProcessor(),hold=VHSVideoGlitchFX.createProcessor();
let generation=-1;
self.onmessage=({data:d})=>{
 try{
  if(generation!==d.generation){generation=d.generation;glitch.reset();hold.reset();}
  const p=new Uint8ClampedArray(d.buffer),w=d.w,h=d.h,s=d.state,f=d.film;
  if(s.creative?.look?.enabled&&s.creative.look.target&&s.creative.look.strength>0)
   VHSVideoCreative.transfer(p,w,h,s.creative.look.target,s.creative.look.strength);
  if(!s.masterBypass&&s.filmEnabled&&f){
   if(f.type==='builtin')VideoFilmCore.filmBuiltin(p,f.recipe,s.filmStrength/100);
   else if(f.fields)VideoFilmCore.filmXMP(p,f,s.filmStrength/100);
  }
  if(!s.masterBypass&&s.filmDamage.enabled)VHSVideoFilmDamage.apply(p,w,h,{...s.filmDamage,time:d.globalTime,seed:d.clipSeed});
  if(!s.masterBypass&&s.fxMode==='classic'&&s.vhsEnabled&&s.master>0){
   const tape=VHSVideoGlitchFX.TAPES.find(t=>t.id===s.tape)||VHSVideoGlitchFX.TAPES[1],preset=s.preset==='damaged'?1.25:s.preset==='camcorder'?.75:1;
   VHSPhotoEngine.apply(p,w,h,{master:clamp(s.master/100*preset*tape.level,0,1.4),seed:d.seed,
    signal:{...s.signal,noise:Math.min(100,s.signal.noise*tape.noise),tracking:Math.min(100,s.signal.tracking*tape.head),tapeSpeed:s.speed}});
  }
  const running=s.glitchEnabled&&s.glitchStrength>0&&VHSVideoGlitchFX.hasActiveSettings(s.glitches,s.eventDensity);
  if(!s.masterBypass&&(s.fxMode!=='classic'||running||(s.mode!=='vhs'&&s.modeStrength>0)))
   glitch.apply(p,w,h,{time:d.time,seed:d.clipSeed,mode:s.fxMode==='classic'?s.mode:'vhs',modeStrength:s.modeStrength,
    splicePulse:s.fxMode==='classic'?d.splicePulse:0,tape:s.tape,density:s.eventDensity,manualEffects:s.fxMode==='classic'?null:d.special,
    strength:s.fxMode==='classic'?(running?s.glitchStrength/100:0):1,effects:s.fxMode==='classic'&&running?s.glitches:{}});
  if(!s.masterBypass&&d.intensity>0){const i=d.intensity;hold.apply(p,w,h,{time:d.time,seed:d.clipSeed,mode:'vhs',tape:s.tape,strength:1,density:0,
   manualEffects:{tapeChew:i,vhold:i*.77,dropouts:i*.85,colorBurst:i*.77,rf:i*.8,headClog:i*.45}});}
  const age=VHSVideoCreative.agingAt(s.creative?.aging,d.time,d.duration);
  if(!s.masterBypass&&age>.002)VHSVideoCreative.damageTape(p,w,h,age,d.time,d.clipSeed);
  self.postMessage({generation:d.generation,w,h,buffer:p.buffer},[p.buffer]);
 }catch(e){self.postMessage({generation:d.generation,error:String(e.message||e)});}
};