/* VHS Video Lab 0.7.5 — detect unprocessed frames and render the actual source.
 * No filters, resizing to 240px or getImageData() on the clean path.
 */
(function(root){
'use strict';
const CAMERA=['rec','play','date','battery','counter','zoom','modeInfo','focus','frame'];
const num=value=>Number.isFinite(Number(value))?Number(value):0;
function hasVisualEffects(settings,holdVideo=0){
 const s=settings||{};
 if(num(holdVideo)>0)return true;
 const c=s.creative;
 if(c?.touch?.enabled&&c.touch.strokes?.length)return true;
 if(c?.touch?.facesEnabled&&(c.touch.manualFaces?.length||c.touch.faceAutodetect))return true;
 if(c?.aging?.enabled&&Number(c.aging.amount)>0)return true;
 if(c?.look?.enabled&&c.look.target&&Number(c.look.strength)>0)return true;
 if(s.filmEnabled&&num(s.filmStrength)>0)return true;
 if(s.filmDamage?.enabled&&['leak','dust','grain','scratches','flicker','halation'].some(k=>num(s.filmDamage[k])>0))return true;
 if(CAMERA.some(k=>s.camera?.[k]===true))return true;
 if(s.fxMode!=='classic')return true;
 if(s.vhsEnabled&&num(s.master)>0)return true;
 if(s.glitchEnabled&&num(s.glitchStrength)>0&&
    root.VHSVideoGlitchFX?.hasActiveSettings(s.glitches,s.eventDensity))return true;
 if(s.mode&&s.mode!=='vhs'&&num(s.modeStrength)>0)return true;
 return false;
}
function canCopyOriginal(s,opts={}){
 if(hasVisualEffects(s,opts.holdVideo))return false;
 if(s.creative?.speed?.enabled&&
  (s.creative.speed.reverse||Number(s.creative.speed.rate)!==1||
   s.creative.speed.curveEnabled&&s.creative.speed.points?.length))return false;
 if(s.creative?.live?.events?.length)return false;
 // One keyframe can be zero at the current playhead yet nonzero later.
 if(s.keyframesEnabled!==false&&Array.isArray(s.keyframes)&&s.keyframes.some(x=>Number(x.value)>0))return false;
 if(num(opts.clipCount)!==1)return false;
 // A "first 30 seconds" export should not silently return the entire file.
 if(s.exportScope!=='full' && !(Number.isFinite(opts.duration)&&opts.duration>0&&opts.duration<=30.02))return false;
 if(s.keepAudio!==true)return false;
 if(s.mix?.videoEnabled===false||num(s.mix?.videoVolume)!==100)return false;
 if(s.audio?.enabled&&num(s.audio.strength)>0)return false;
 if(s.creative?.audioDevice&&s.creative.audioDevice!=='off')return false;
 if(s.mix?.musicEnabled!==false&&num(s.mix?.musicVolume)>0&&(opts.musicLoaded||s.selectedTrack))return false;
 if(Array.isArray(opts.extraTracks)&&opts.extraTracks.some(t=>t.enabled!==false&&num(t.volume)>0))return false;
 if(Array.isArray(s.holdEvents)&&s.holdEvents.some(e=>num(e.blend)>0))return false;
 if(num(opts.holdAudio)>0)return false;
 return true;
}
function rawCanvasSize(width,height,limit=1920){
 const w=Math.max(2,Math.floor(num(width)||2)),h=Math.max(2,Math.floor(num(height)||2));
 const scale=Math.min(1,Math.max(1,limit)/Math.max(w,h));
 return [Math.max(2,Math.round(w*scale/2)*2),Math.max(2,Math.round(h*scale/2)*2)];
}
function drawClean(source,canvas){
 const width=canvas.width,height=canvas.height;
 const ctx=canvas.getContext('2d');
 const scale=Math.min(width/source.videoWidth,height/source.videoHeight);
 const w=Math.max(1,source.videoWidth*scale),h=Math.max(1,source.videoHeight*scale);
 ctx.imageSmoothingEnabled=true;
 ctx.fillStyle='#000';
 ctx.fillRect(0,0,width,height);
 ctx.drawImage(source,(width-w)/2,(height-h)/2,w,h);
}
root.VHSVideoCleanPath=Object.freeze({hasVisualEffects,canCopyOriginal,rawCanvasSize,drawClean});
})(window);
