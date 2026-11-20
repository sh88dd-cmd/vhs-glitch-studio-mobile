/* VHS Video Lab – independent soundtrack overlay and deterministic edit timing.
 * File objects are used locally. URLs are revoked on removal. No upload.
 */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function plan(globalTime,duration,settings){
 const p=settings||{},t=Number(globalTime),d=Number(duration);
 const offset=Math.max(0,Number(p.offset)||0);
 const trimStart=Math.max(0,Number(p.trimStart)||0);
 const trimLength=Math.max(0,Number(p.trimLength)||0);
 if(!Number.isFinite(t)||!Number.isFinite(d)||d<=0||trimStart>=d)return{active:false,position:trimStart,duration:0};
 const length=trimLength>0?Math.min(trimLength,d-trimStart):d-trimStart;
 if(length<=0||t<offset)return{active:false,position:trimStart,duration:length};
 const relative=t-offset;
 if(!p.loop&&relative>=length)return{active:false,position:trimStart+length,duration:length};
 return{active:true,position:trimStart+(p.loop?(relative%length):relative),duration:length};
}
class MusicLayer{
 constructor(element,options){
  this.element=element;this.options=options;this.file=null;this.url='';this.pending=false;this.playError='';
 }
 async load(file){
  if(!file)throw Error('Музыкальный файл не выбран');
  const accepted=/\.(?:mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(file.name)||/^audio\//.test(file.type);
  if(!accepted)throw Error('Выбери аудио MP3, M4A, WAV или другой поддерживаемый браузером формат.');
  if(file.size>800*1024*1024)throw Error('Слишком большой музыкальный файл. Максимум 800 МБ.');
  this.remove();
  this.file=file;this.url=URL.createObjectURL(file);
  this.element.src=this.url;this.element.preload='metadata';this.element.loop=false;this.element.load();
  const duration=await new Promise((resolve,reject)=>{
   if(this.element.readyState>=1&&Number.isFinite(this.element.duration))return resolve(this.element.duration);
   const timeout=setTimeout(()=>{end();reject(Error('Не удалось прочитать музыкальный файл.'))},16000);
   const end=()=>{clearTimeout(timeout);this.element.removeEventListener('loadedmetadata',ready);this.element.removeEventListener('error',bad)};
   const ready=()=>{end();resolve(this.element.duration)};
   const bad=()=>{end();reject(Error('Safari не поддерживает этот аудиоформат. Попробуй MP3 или M4A.'))};
   this.element.addEventListener('loadedmetadata',ready,{once:true});
   this.element.addEventListener('error',bad,{once:true});
  }).catch(e=>{this.remove();throw e});
  return{fileName:file.name,duration};
 }
 remove(){
  try{this.element.pause();}catch{}
  if(this.url)URL.revokeObjectURL(this.url);
  this.file=null;this.url='';this.pending=false;this.playError='';
  this.element.removeAttribute('src');this.element.load();
 }
 get ready(){return!!this.file&&this.element.readyState>=1&&Number.isFinite(this.element.duration)&&this.element.duration>0;}
 timing(time){return plan(time,this.element.duration,this.options.getConfig());}
 sync(force=false){
  if(!this.ready)return;
  const cfg=this.options.getConfig();
  const target=this.timing(this.options.getTime());
  const active=!!cfg.enabled&&target.active;
  if(!active){
   if(!this.element.paused)this.element.pause();
   return;
  }
  const drift=Math.abs((this.element.currentTime||0)-target.position);
  if(drift>(force?.045:.42)){
   try{this.element.currentTime=clamp(target.position,0,Math.max(0,this.element.duration-.01))}catch{}
  }
  const playing=!!this.options.isPlaying();
  if(!playing){
   if(!this.element.paused)this.element.pause();
  }else if(this.element.paused&&!this.pending){
   this.pending=true;
   try{const result=this.element.play();
    Promise.resolve(result).then(()=>{this.playError='';}).catch(e=>{
     this.playError=e?.message||'Не удалось воспроизвести музыку';
     this.options.onError?.(this.playError);
    }).finally(()=>{this.pending=false;});
   }catch(e){this.pending=false;this.playError=e?.message||String(e);this.options.onError?.(this.playError);}
  }
 }
}
root.VHSVideoMusicLayer=Object.freeze({create:(element,options)=>new MusicLayer(element,options),plan});
})(window);
