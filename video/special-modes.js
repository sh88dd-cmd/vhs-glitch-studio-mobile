/* VHS Video Lab 0.4.0: exclusive AUDIO-REACTIVE or MANUAL TIMELINE dispatch.
 * Independent, original code; neither mode calls the random-glitch scheduler.
 */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const valid=new Set(['tapeChew','pause','rewind','vhold','ghost','colorBurst','headClog','dropouts','agc','tapeSplice','frameEcho','interlace','datamosh','pixelSort','rf']);
const labelIds=['tapeChew','pause','rewind','vhold','ghost','colorBurst','headClog','dropouts','agc','tapeSplice','frameEcho','interlace','datamosh','pixelSort','rf'];
const labels=['Зажёванная кассета','Остановка ленты','Перемотка','Вертикальный срыв','Двойной сигнал','Срыв цветности','Засорение головки','Выпадение строк','Плавающая яркость','Повреждённый стык','Шлейф кадров','Чересстрочность','Datamosh','Pixel Sorting','Эфирные помехи'];
function safeEffect(id,fallback='tapeChew'){return valid.has(id)?id:fallback;}
function cleanEvent(e){
 if(!e||!valid.has(e.effect))return null;
 const time=Number(e.time),duration=Number(e.duration),strength=Number(e.strength),clip=Number(e.clip);
 if(!Number.isFinite(time)||!Number.isFinite(duration)||!Number.isFinite(strength)||!Number.isInteger(clip))return null;
 return{id:String(e.id||''),clip:clamp(clip,0,9),time:clamp(time,0,7200),duration:clamp(duration,.08,30),strength:clamp(strength,0,100),effect:e.effect};
}
function manualEnvelope(time,event){
 if(time<event.time||time>event.time+event.duration)return 0;
 const phase=(time-event.time)/event.duration;
 const fade=Math.min(1,phase/.09,(1-phase)/.12);
 return Math.max(0,fade)*event.strength/100;
}
function eventsAt(time,clip,events){
 const values={};
 for(const raw of (events||[]).slice(0,250)){
  const e=cleanEvent(raw);
  if(!e||e.clip!==clip)continue;
  const amount=manualEnvelope(time,e);
  if(amount>0)values[e.effect]=Math.max(values[e.effect]||0,amount);
 }
 return values;
}
function musicAt(levels,settings,prior,dt=.08){
 const l=levels||{bass:0,mid:0,high:0,rms:0};
 const bass=clamp(Number(l.bass)||0,0,1),high=clamp(Number(l.high)||0,0,1);
 const cfg=settings||{};
 const sensitivity=clamp(Number(cfg.sensitivity??60)/100,0,1);
 const threshold=clamp(Number(cfg.threshold??25)/100,0,1);
 const weight=clamp(Number(cfg.strength??85)/100,0,1);
 // Compress low levels while preventing constant noise from triggering effects.
 function activation(level,previous){
  const scaled=clamp((level-threshold*(1-.45*sensitivity))* (1.5+sensitivity*2.6),0,1);
  const release=Math.exp(-Math.max(0,dt)/(0.12+clamp(Number(cfg.release??35)/100,0,1)*1.0));
  return Math.max(scaled,previous*release);
 }
 const previous=prior||{bass:0,high:0};
 const now={bass:activation(bass,Number(previous.bass)||0),high:activation(high,Number(previous.high)||0)};
 const values={};
 const lowFx=safeEffect(cfg.bassEffect,'vhold'),highFx=safeEffect(cfg.highEffect,'dropouts');
 if(now.bass>.015)values[lowFx]=now.bass*weight;
 if(now.high>.015)values[highFx]=Math.max(values[highFx]||0,now.high*weight);
 return{values,levels:now,raw:{bass,high,mid:clamp(Number(l.mid)||0,0,1)}};
}
root.VHSVideoSpecialModes=Object.freeze({EFFECT_IDS:labelIds,LABELS:labels,cleanEvent,eventsAt,musicAt});
})(window);