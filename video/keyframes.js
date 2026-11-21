/* VHS Video Lab 0.7.7: keyframed processing envelopes.
 * Pure, deterministic and safe for preview, seek and MediaRecorder export.
 */
(function(root){
'use strict';
const TRACKS=Object.freeze({
 vhs:'Сила VHS',
 film:'Сила FILM',
 glitch:'Сила глитчей',
 leak:'Сила засветов'
});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function normalize(event){
 if(!event||!Object.hasOwn(TRACKS,event.track))return null;
 const clip=Number(event.clip),time=Number(event.time),value=Number(event.value);
 if(!Number.isInteger(clip)||clip<0||clip>9||!Number.isFinite(time)||time<0||
  time>86400||!Number.isFinite(value))return null;
 return {
  id:String(event.id||'kf-'+clip+'-'+event.track+'-'+time).slice(0,90),
  clip,track:event.track,time:Math.round(time*1000)/1000,
  value:Math.round(clamp(value,0,100))
 };
}
function normalizeAll(events){
 if(!Array.isArray(events))return [];
 const seen=new Map();
 for(const ev of events.slice(0,400)){
  const valid=normalize(ev);
  if(valid)seen.set(valid.clip+':'+valid.track+':'+valid.time.toFixed(3),valid);
 }
 return [...seen.values()].sort((a,b)=>a.clip-b.clip||a.track.localeCompare(b.track)||a.time-b.time).slice(0,120);
}
function at(events,clip,time,enabled=true){
 const result={vhs:null,film:null,glitch:null,leak:null};
 if(!enabled||!Array.isArray(events)||!Number.isFinite(time))return result;
 for(const key of Object.keys(TRACKS)){
  const frames=events.filter(x=>x.clip===clip&&x.track===key&&Number.isFinite(x.time))
   .sort((a,b)=>a.time-b.time);
  if(!frames.length)continue;
  if(time<=frames[0].time){result[key]=frames[0].value;continue;}
  const last=frames[frames.length-1];
  if(time>=last.time){result[key]=last.value;continue;}
  for(let i=1;i<frames.length;i++){
   if(time>frames[i].time)continue;
   const prev=frames[i-1],next=frames[i],delta=next.time-prev.time;
   const factor=delta>0?clamp((time-prev.time)/delta,0,1):1;
   result[key]=Math.round((prev.value+(next.value-prev.value)*factor)*100)/100;
   break;
  }
 }
 return result;
}
function effective(state,clip,time){
 const frames=at(state.keyframes||[],clip,time,state.keyframesEnabled!==false);
 const result={...state,filmDamage:{...state.filmDamage}};
 if(frames.vhs!==null){
  result.master=frames.vhs;result.vhsEnabled=frames.vhs>0;
 }
 if(frames.film!==null){
  result.filmStrength=frames.film;result.filmEnabled=frames.film>0;
 }
 if(frames.glitch!==null){
  result.glitchStrength=frames.glitch;result.glitchEnabled=frames.glitch>0;
 }
 if(frames.leak!==null){
  result.filmDamage.leak=frames.leak;
  const others=['dust','grain','scratches','flicker','halation']
   .some(k=>result.filmDamage.enabled&&Number(result.filmDamage[k])>0);
  result.filmDamage.enabled=frames.leak>0||others;
 }
 return result;
}
root.VHSVideoKeyframes=Object.freeze({TRACKS,normalize,normalizeAll,at,effective});
})(window);
