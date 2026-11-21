/* VHS Video Lab 0.7 — editing waveforms + two optional local audio tracks.
 * Requires only the existing Web Audio mixer; no secondary video elements.
 */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function drawWave(canvas,buffer,start=0,end=Infinity){
 if(!canvas)return;
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#151515';ctx.fillRect(0,0,w,h);
 if(!buffer?.length)return;
 const samples=buffer.getChannelData(0),duration=buffer.duration;
 const first=clamp(start/duration,0,1)*w,last=clamp(end/duration,0,1)*w;
 for(let x=0;x<w;x++){
  let peak=0;
  const base=Math.floor(samples.length*x/w),stride=Math.max(1,Math.round(samples.length/w/40));
  const limit=Math.min(samples.length,Math.floor(samples.length*(x+1)/w));
  for(let i=base;i<limit;i+=stride)peak=Math.max(peak,Math.abs(samples[i]));
  const amp=Math.max(1,Math.round(peak*h*.44));
  ctx.fillStyle=x>=first&&x<=last?'#edc376':'#727272';
  ctx.fillRect(x,h/2-amp,1,amp*2);
 }
 ctx.strokeStyle='#fff2d4';ctx.lineWidth=2;
 for(const x of [first,last]){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
}
function bindWave(canvas,get,change){
 let edge=null;
 function locate(e){
  const rect=canvas.getBoundingClientRect();
  return clamp((e.clientX-rect.left)/Math.max(1,rect.width),0,1)*get().duration;
 }
 canvas.addEventListener('pointerdown',e=>{
  const t=get();if(!t.duration)return;
  const sec=locate(e);edge=Math.abs(sec-t.start)<Math.abs(sec-t.end)?'start':'end';
  try{canvas.setPointerCapture(e.pointerId)}catch{}
  change(edge,sec);
 });
 canvas.addEventListener('pointermove',e=>{if(edge)change(edge,locate(e));});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>edge=null);
}
function create({engine,mix,sync,status,isRecording,onChange}){
 const $=id=>document.getElementById(id);
 let tracks=[],seq=0,busy=false;
 const view=()=>{const d=engine.musicBuffer?.duration||0,from=clamp(Number(mix.musicOffset)||0,0,Math.max(0,d-.1));
  const to=mix.musicTrimEnd>0?clamp(Number(mix.musicTrimEnd),from+.05,d):d;
  return{duration:d,start:from,end:to};
 };
 function redrawMain(){
  const v=view();drawWave($('musicWaveform'),engine.musicBuffer,v.start,v.end);
  $('waveformInfo').textContent=v.duration?v.start.toFixed(1)+'–'+v.end.toFixed(1)+' с · '+v.duration.toFixed(1)+' с':'Выбери дорожку';
 }
 bindWave($('musicWaveform'),view,(edge,sec)=>{
  if(isRecording())return;
  const v=view();if(!v.duration)return;
  if(edge==='start')mix.musicOffset=clamp(sec,0,Math.max(0,v.end-.1));
  else mix.musicTrimEnd=clamp(sec,v.start+.1,v.duration);
  engine.setMix(mix);sync();redrawMain();onChange();
  for(const [id,value] of [['musicTrimStartRange',mix.musicOffset],['musicTrimStartInput',mix.musicOffset],['musicTrimEndRange',mix.musicTrimEnd],['musicTrimEndInput',mix.musicTrimEnd]])$(id).value=String(Number(value.toFixed(2)));
  $('musicTrimStartLabel').textContent=new Date(mix.musicOffset*1000).toISOString().slice(14,19);
  $('musicTrimEndLabel').textContent=new Date(mix.musicTrimEnd*1000).toISOString().slice(14,19);
  $('musicTrimDuration').textContent='Длительность выбранного отрывка: '+(mix.musicTrimEnd-mix.musicOffset).toFixed(1)+' сек.';
 });
 function refresh(){
  engine.setExtraTracks(tracks.map(t=>({...t})));
  sync();onChange();
 }
 function render(){
  const list=$('extraTrackList');list.replaceChildren();
  if(!tracks.length){const hint=document.createElement('p');hint.className='hint';hint.textContent='Дополнительных дорожек пока нет.';list.append(hint);}
  for(const track of tracks){
   const card=document.createElement('article');card.className='extraAudioCard';
   const head=document.createElement('div');head.className='extraAudioHeading';
   const label=document.createElement('strong');label.textContent=track.name;
   const del=document.createElement('button');del.type='button';del.className='button';del.textContent='✕ Удалить';
   del.onclick=()=>{if(isRecording())return;tracks=tracks.filter(t=>t.id!==track.id);refresh();render();};
   head.append(label,del);card.append(head);
   const wave=document.createElement('canvas');wave.className='trackWave';wave.width=500;wave.height=75;
   card.append(wave);
   const fields=document.createElement('div');fields.className='extraAudioFields';
   const params=[
    ['at','Начало в видео, сек',0,7200],
    ['trimStart','Начало отрывка, сек',0,track.buffer.duration],
    ['trimEnd','Конец отрывка, сек',0,track.buffer.duration],
    ['volume','Громкость, %',0,100],
    ['fadeIn','Появление, сек',0,30],
    ['fadeOut','Затухание, сек',0,30]
   ];
   const inputs={};
   function validate(){
    const d=track.buffer.duration;
    track.trimStart=clamp(Number(track.trimStart)||0,0,Math.max(0,d-.1));
    track.trimEnd=clamp(Number(track.trimEnd)||d,track.trimStart+.1,d);
    track.at=clamp(Number(track.at)||0,0,7200);
    track.volume=clamp(Number(track.volume)||0,0,100);
    track.fadeIn=clamp(Number(track.fadeIn)||0,0,30);
    track.fadeOut=clamp(Number(track.fadeOut)||0,0,30);
    for(const [k] of params)inputs[k].value=String(Number(track[k].toFixed(2)));
    drawWave(wave,track.buffer,track.trimStart,track.trimEnd);
   }
   for(const [key,name,min,max] of params){
    const label=document.createElement('label');label.textContent=name;
    const input=document.createElement('input');input.type='number';input.step=key==='volume'?'1':'.1';
    input.min=String(min);input.max=String(max);input.value=String(track[key]);
    input.onchange=()=>{if(isRecording())return;track[key]=Number(input.value);validate();refresh();};
    inputs[key]=input;label.append(input);fields.append(label);
   }
   card.append(fields);
   const loopLabel=document.createElement('label');loopLabel.className='extraAudioLoop';
   const check=document.createElement('input');check.type='checkbox';check.checked=track.loop;
   check.onchange=()=>{track.loop=check.checked;refresh();};
   loopLabel.append(check,document.createTextNode(' Повторять выбранный отрывок'));card.append(loopLabel);
   list.append(card);
   bindWave(wave,()=>({duration:track.buffer.duration,start:track.trimStart,end:track.trimEnd}),(edge,sec)=>{
    if(isRecording())return;
    if(edge==='start')track.trimStart=clamp(sec,0,Math.max(0,track.trimEnd-.1));
    else track.trimEnd=clamp(sec,track.trimStart+.1,track.buffer.duration);
    validate();refresh();
   });
   validate();
  }
  const disabled=tracks.length>=2;
  for(const id of ['extraMusicFile','extraMusicVideo']){
   $(id).disabled=disabled;$(id).parentElement.classList.toggle('is-disabled',disabled);
  }
 }
 async function importFile(file,kind){
  if(isRecording()){status('Останови экспорт перед импортом.');return;}
  if(tracks.length>=2){status('Можно добавить максимум две дополнительные дорожки.');return;}
  const ticket=++seq;status('Загружаю дополнительную аудиодорожку…');busy=true;
  try{
   await engine.start();
   const bytes=kind==='video'?await window.VHSVideoAudioExtract.extract(file):
    (file.size<=100*1024*1024?await file.arrayBuffer():Promise.reject(Error('Слишком большой аудиофайл.')));
   if(ticket!==seq)return;
   const buffer=await engine.ctx.decodeAudioData(bytes);
   if(ticket!==seq)return;
   if(!buffer?.duration)throw Error('Неизвестный аудиоформат.');
   const mb=(buffer.length*buffer.numberOfChannels*4+tracks.reduce((s,t)=>s+t.buffer.length*t.buffer.numberOfChannels*4,0)+(engine.musicBuffer?.length||0)*(engine.musicBuffer?.numberOfChannels||0)*4)/1048576;
   if(mb>160)throw Error('Суммарная память аудиодорожек превышает 160 МБ.');
   tracks.push({id:'layer'+Date.now()+'-'+Math.round(Math.random()*1000),name:file.name,
    buffer,at:0,trimStart:0,trimEnd:buffer.duration,volume:75,loop:false,fadeIn:0,fadeOut:0});
   refresh();render();status('Дополнительная дорожка '+file.name+' подключена.');
  }catch(e){if(ticket===seq)status('Не удалось добавить дорожку: '+e.message);}
  finally{if(ticket===seq)busy=false;}
 }
 for(const [id,kind] of [['extraMusicFile','file'],['extraMusicVideo','video']]){
  $(id).onchange=e=>{const f=e.target.files?.[0];if(f)importFile(f,kind);e.target.value='';};
 }
 render();redrawMain();
 return Object.freeze({redrawMain,count:()=>tracks.length,clear(){
   seq++;tracks=[];refresh();render();
 },get busy(){return busy;}});
}
root.VHSVideoAudioStudio=Object.freeze({create});
})(window);
