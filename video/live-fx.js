/* VHS Video Lab 0.9.1 — LIVE CAMERA: EXACT editor film, VHS, GLITCH,
 * film-damage and analog tape processing engines, not decorative stripes.
 * Rendered once into a shared output canvas used by both preview and
 * MediaRecorder, so what the user sees is what the camera actually saves.
 * Intermediate signal size is bounded to protect iPhone Safari from stalls.
 */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
function signalDimensions(outW,outH,state={},opts={}){
 const active=!state.masterBypass;
 const vhs=active&&!!state.vhsEnabled&&Number(state.master)>0;
 const temporal=active&&!!state.glitchEnabled&&Number(state.glitchStrength)>0&&
  !!root.VHSVideoGlitchFX?.hasActiveSettings(state.glitches,state.eventDensity);
 const mode=active&&String(state.mode||'vhs')!=='vhs'&&
  Number(state.modeStrength)>0;
 const hold=!!opts.holding;
 const reduce=vhs||mode||hold;
 const chosen=state.signalWidth==='auto'?240:Number(state.signalWidth);
 // Only intentionally VHS/analogue-low-bandwidth paths reduce resolution.
 // GLITCH-only and FILM retain full output frame dimensions.
 const longest=reduce?
  vhs?clamp(chosen||240,128,320):
  clamp(Math.max(480,chosen||480),360,640):
  Math.max(outW,outH);
 const factor=Math.min(1,longest/Math.max(outW,outH));
 return{
  w:Math.max(2,Math.round(outW*factor/2)*2),
  h:Math.max(2,Math.round(outH*factor/2)*2),
  reduced:reduce,
  reason:vhs?'VHS':hold?'ЗАЖМИ':mode?'MODE':temporal?'GLITCH full resolution':'native'
 };
}
function create(){
 const pixel=document.createElement('canvas');
 const px=pixel.getContext('2d',{willReadFrequently:true});
 const glitch=root.VHSVideoGlitchFX.createProcessor();
 const holdFX=root.VHSVideoGlitchFX.createProcessor();
 let width=0,height=0,renderCount=0,previousSeed=null;
 function reset(){
  glitch.reset();holdFX.reset();previousSeed=null;
 }
 function render(source,target,state,options={}){
  const outW=target.width,outH=target.height;
  if(!source.videoWidth||!source.videoHeight||outW<2||outH<2)
   throw Error('Кадр камеры пока недоступен');
  const start=performance.now();
  const seed=(options.seed>>>0)||1,time=Math.max(0,Number(options.time)||0);
  const filmSeed=(options.filmSeed>>>0)||seed,hold=!!options.holding;
  const active=!state.masterBypass;
  const film=active&&state.filmEnabled&&Number(state.filmStrength)>0;
  const vhs=active&&state.vhsEnabled&&Number(state.master)>0;
  const damaged=active&&state.filmDamage?.enabled;
  // A checked but zero-strength GLITCH switch is not a video effect.
  // Do not force a CPU-heavy temporal processor on a FILM-only capture.
  const extra=active&&(
   (state.glitchEnabled&&Number(state.glitchStrength)>0&&
    !!root.VHSVideoGlitchFX?.hasActiveSettings(state.glitches,state.eventDensity))||
   (String(state.mode||'vhs')!=='vhs'&&Number(state.modeStrength)>0)
  );
  const transferred=active&&state.creative?.look?.enabled&&state.creative.look.target;
  // Film/color/XMP, grain, scratches and palette transfer do not
  // reduce optical resolution. The old condition included "film" here,
  // degrading a 720x1280 phone stream to about 135x240 pixels (!).
  // Only genuine VHS signal loss and heavy temporal glitches use a lower
  // resolution. FILM-only is pixel-for-pixel native at 480p or 720p.
  const {w,h}=signalDimensions(outW,outH,state,{holding:hold});
  if(width!==w||height!==h){
   width=w;height=h;pixel.width=w;pixel.height=h;reset();
  }
  if(previousSeed!==seed){glitch.reset();holdFX.reset();previousSeed=seed;}
  px.clearRect(0,0,w,h);
  px.save();
  if(options.mirrored){px.translate(w,0);px.scale(-1,1);}
  px.drawImage(source,0,0,w,h);
  px.restore();
  const filmProfile=options.filmProfile||null;
  const needsPixels=film||vhs||damaged||extra||transferred||hold||
   active&&state.creative?.aging?.enabled;
  if(needsPixels){
   const image=px.getImageData(0,0,w,h),p=image.data;
   if(transferred&&root.VHSVideoCreative?.transfer)
    root.VHSVideoCreative.transfer(p,w,h,
     state.creative.look.target,state.creative.look.strength);
   if(film&&root.VideoFilmCore){
    const strength=clamp(state.filmStrength,0,100)/100;
    if(filmProfile?.type==='builtin'&&filmProfile.recipe)
     root.VideoFilmCore.filmBuiltin(p,filmProfile.recipe,strength);
    else if(filmProfile?.fields)
     root.VideoFilmCore.filmXMP(p,filmProfile,strength);
   }
   if(damaged&&root.VHSVideoFilmDamage)
    root.VHSVideoFilmDamage.apply(p,w,h,{
     ...state.filmDamage,time,seed:filmSeed});
   if(vhs&&root.VHSPhotoEngine){
    const tape=root.VHSVideoGlitchFX.TAPES.find(x=>x.id===state.tape)||
     root.VHSVideoGlitchFX.TAPES[1];
    const preset=state.preset==='damaged'?1.25:
     state.preset==='camcorder'?.75:1;
    const inputSeed=(seed^Math.imul(Math.floor(time*15)+1,0x9e3779b9))>>>0;
    root.VHSPhotoEngine.apply(p,w,h,{
     master:clamp(state.master/100*preset*tape.level,0,1.4),
     seed:inputSeed,signal:{
      ...state.signal,
      noise:Math.min(100,(state.signal?.noise||0)*tape.noise),
      tracking:Math.min(100,(state.signal?.tracking||0)*tape.head),
      tapeSpeed:state.speed||'SP'
     }
    });
   }
   if(extra&&root.VHSVideoGlitchFX){
    glitch.apply(p,w,h,{
     time,seed,mode:state.mode||'vhs',
     modeStrength:state.modeStrength||0,
     tape:state.tape,density:state.eventDensity,
     strength:state.glitchEnabled?clamp(state.glitchStrength,0,100)/100:0,
     effects:state.glitchEnabled?state.glitches:{}
    });
   }
   if(hold&&root.VHSVideoGlitchFX)
    holdFX.apply(p,w,h,{
     time,seed,mode:'vhs',tape:state.tape,
     strength:1,density:0,
     manualEffects:{tapeChew:1,vhold:.85,dropouts:.96,
      colorBurst:.89,rf:.9,headClog:.8,ghost:.53}
    });
   if(active&&state.creative?.aging?.enabled&&root.VHSVideoCreative){
    const age=root.VHSVideoCreative.agingAt(state.creative.aging,time,
     Number(options.agingDuration)||60);
    if(age>.002)root.VHSVideoCreative.damageTape(p,w,h,age,time,filmSeed);
   }
   px.putImageData(image,0,0);
  }
  const ctx=target.getContext('2d',{alpha:false});
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(pixel,0,0,outW,outH);
  // Draw indicators in ORIGINAL VIDEO coordinates; separate canvas means
  // the date & corner markers cannot stretch beyond the camera image.
  if(active&&root.VHSVideoCameraOSD?.draw&&state.camera){
   root.VHSVideoCameraOSD.draw(ctx,outW,outH,state.camera,
    state.speed||'SP',Number(options.elapsed)||0);
  }
  renderCount++;
  return{duration:performance.now()-start,
   width:w,height:h,outputWidth:outW,outputHeight:outH,
   engine:'VHSPhotoEngine + VideoFilmCore + VHSVideoGlitchFX',
   renderCount,filmApplied:film&&!!filmProfile,
   vhsApplied:!!vhs,glitchApplied:!!extra,holdApplied:hold};
 }
 return Object.freeze({render,reset,stats:()=>({width,height,renderCount})});
}
root.VHSVideoLiveFX=Object.freeze({create,signalDimensions});
})(window);
