/* Photo-to-video: local, sequential decoding, no artificial photo-count limit.
 * Silent source clip opens in the normal VHS editor. No photos are uploaded. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const MIN=.1,MAX=86400,PAGE=12;
const clampDuration=(value,fallback=3)=>{const n=Number(value);return Number.isFinite(n)&&n>=MIN?Math.min(MAX,n):fallback;};
const total=items=>items.reduce((a,b)=>a+b.duration,0);
function dimensions(w,h,format,limit=1920){
 let ratio=format==='9:16'?9/16:format==='16:9'?16/9:format==='1:1'?1:w/h;
 const even=n=>Math.max(2,Math.round(n/2)*2);
 return ratio>=1?[even(limit),even(limit/ratio)]:[even(limit*ratio),even(limit)];
}
function fit(w,h,W,H,mode){
 const scale=(mode==='cover'?Math.max:Math.min)(W/w,H/h);
 return [(W-w*scale)/2,(H-h*scale)/2,w*scale,h*scale];
}
function distribute(items,seconds){
 if(!items.length)return;
 if(!Number.isFinite(seconds)||seconds<MIN*items.length||seconds>MAX*items.length)throw Error('Общая длительность должна быть от '+(MIN*items.length).toFixed(1)+' секунд.');
 const each=seconds/items.length;for(const item of items)item.duration=each;
}
async function decode(file){
 const url=URL.createObjectURL(file),img=new Image();
 try{await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Фото не открылось: '+file.name)),20000);
  img.onload=()=>{clearTimeout(timer);resolve();};
  img.onerror=()=>{clearTimeout(timer);reject(Error('Не удалось прочитать '+file.name+'. Для HEIC попробуй JPEG из галереи.'));};
  img.src=url;
 });
 if(!img.naturalWidth||!img.naturalHeight)throw Error('Некорректный размер фото');
 return {img,close:()=>{img.src='';URL.revokeObjectURL(url);}};
 }catch(e){URL.revokeObjectURL(url);throw e;}
}
function mount({onImport,canOpen,onOpen}){
 const dialog=$('photoVideoDialog'),canvas=$('photoVideoCanvas'),ctx=canvas.getContext('2d',{alpha:false});
 const T=root.VHSTransitions,from=document.createElement('canvas'),to=document.createElement('canvas');
 let items=[],page=0,running=false,cancelled=false,rec=null,stream=null,current=null;
 const status=(msg)=>{$('photoVideoStatus').textContent=msg;};
 const busy=value=>{
  running=value;for(const id of ['photoVideoAdd','photoVideoDefault','photoVideoApply','photoVideoTotal','photoVideoApplyTotal','photoVideoAspect','photoVideoFit','photoVideoResolution','photoVideoFps','photoVideoClear','photoVideoPrev','photoVideoNext','photoVideoBuild','photoTransitionType','photoTransitionSeconds','photoTransitionApply'])$(id).disabled=value;
  $('photoVideoCancel').hidden=!value;
  $('photoVideoClose').disabled=value;
  $('photoVideoProgress').hidden=!value;
  render();
 };
 function refreshTotal(){
  const sum=total(items);
  $('photoVideoSummary').textContent=items.length+' фото · '+(sum<60?Number(sum.toFixed(2))+' сек':Math.floor(sum/60)+' мин '+Number((sum%60).toFixed(2))+' сек');
  $('photoVideoTotal').value=items.length?Number(sum.toFixed(3)):'';
 }
 function render(){
  const pages=Math.max(1,Math.ceil(items.length/PAGE));page=Math.min(page,pages-1);
  $('photoVideoPage').textContent=(page+1)+' / '+pages;
  $('photoVideoPrev').disabled=running||page===0;
  $('photoVideoNext').disabled=running||page>=pages-1;
  $('photoVideoBuild').disabled=running||!items.length;
  $('photoVideoClear').disabled=running||!items.length;
  $('photoVideoList').replaceChildren();
  for(let i=page*PAGE;i<Math.min(items.length,(page+1)*PAGE);i++){
   const item=items[i],row=document.createElement('div');row.className='photoVideoItem';
   const name=document.createElement('span');name.textContent=(i+1)+'. '+item.file.name;name.title=item.file.name;
   const time=document.createElement('input');time.type='number';time.min=String(MIN);time.max=String(MAX);time.step='any';time.value=Number(item.duration.toFixed(4));time.disabled=running;time.setAttribute('aria-label','Длительность фото '+(i+1)+' в секундах');
   time.addEventListener('change',()=>{item.duration=clampDuration(time.value,item.duration);time.value=item.duration;refreshTotal();});
   const button=(label,title,action,disabled=false)=>{const b=document.createElement('button');b.type='button';b.className='button mini';b.textContent=label;b.setAttribute('aria-label',title);b.disabled=running||disabled;b.onclick=action;return b;};
   const move=delta=>{const j=i+delta;[items[i],items[j]]=[items[j],items[i]];page=Math.floor(j/PAGE);render();};
   row.append(name,time,button('↑','Выше',()=>move(-1),i===0),button('↓','Ниже',()=>move(1),i===items.length-1),button('✕','Удалить фото',()=>{items.splice(i,1);render();}));
   $('photoVideoList').append(row);
   if(i<items.length-1)T.row($('photoVideoList'),'Переход '+(i+1)+' → '+(i+2),item.transition||T.spec('none',.5),value=>{item.transition=value;},running);
  }
  refreshTotal();
 }
 function draw(photo,mode){
  const img=photo.img,W=canvas.width,H=canvas.height;
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,...fit(img.naturalWidth,img.naturalHeight,W,H,mode));
 }
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function transition(photo,next,seconds,mode,type,progress){
  for(const [buffer,item] of [[from,photo],[to,next]]){buffer.width=canvas.width;buffer.height=canvas.height;T.fitted(buffer.getContext('2d'),item.img,buffer.width,buffer.height,mode);}
  const start=performance.now();while(!cancelled){const t=Math.min(seconds,(performance.now()-start)/1000);T.render(ctx,from,to,t/seconds,type);progress(t);if(t>=seconds)return;await wait(Math.min(1000/Number($('photoVideoFps').value),Math.max(1,(seconds-t)*1000)));}
  throw Error('Создание отменено.');
 }
 async function hold(photo,seconds,mode,progress){
  const end=performance.now()+seconds*1000,start=performance.now();
  // Request frames even when the photo itself is static, so the encoded
  // timeline contains the selected duration. No full list of decoded images.
  while(!cancelled){
   draw(photo,mode);
   const now=performance.now();progress(Math.min(seconds,(now-start)/1000));
   if(now>=end)return;
   await wait(Math.min(1000/Number($('photoVideoFps').value),Math.max(1,end-now)));
  }
  throw Error('Создание отменено.');
 }
 async function build(){
  if(running||!items.length)return;
  if(!canOpen())return status('Сначала закончи текущий экспорт или импорт.');
  if(typeof MediaRecorder!=='function'||!canvas.captureStream)return status('Этот браузер не поддерживает создание видео из фото. Открой приложение в Safari.');
  const list=items.slice(),duration=total(list),mode=$('photoVideoFit').value,fps=Number($('photoVideoFps').value)||30,limit=Number($('photoVideoResolution').value)||1920;
  cancelled=false;busy(true);$('photoVideoProgress').value=0;
  status('Подготавливаю первую фотографию…');
  let chunks=[],failed='',finished=null,next=null,preload=null;
  try{
   current=await decode(list[0].file);
   if(cancelled)throw Error('Создание отменено.');
   const [W,H]=dimensions(current.img.naturalWidth,current.img.naturalHeight,$('photoVideoAspect').value,limit);
   canvas.width=W;canvas.height=H;canvas.hidden=false;draw(current,mode);
   stream=canvas.captureStream(fps);
   if(!stream.getVideoTracks().length)throw Error('Safari не передал видеопоток с холста.');
   const types=['video/mp4;codecs=avc1.420028','video/mp4','video/webm;codecs=vp8','video/webm'];
   for(const mimeType of types){
    if(MediaRecorder.isTypeSupported&&!MediaRecorder.isTypeSupported(mimeType))continue;
    try{rec=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:limit>=1920?14000000:8000000});break;}catch(_){}
   }
   if(!rec)throw Error('Не удалось открыть видеокодировщик Safari.');
   finished=new Promise(resolve=>{
    rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
    rec.onerror=e=>{failed=e.error?.message||'Ошибка кодировщика';cancelled=true;};
    rec.onstop=()=>resolve();
   });
   rec.start(1000);
   let elapsed=0;
   for(let i=0;i<list.length;i++){
    if(cancelled)throw Error(failed||'Создание отменено.');
    // Decode only the following image while showing the current one.
    let ready=false;
    if(i+1<list.length)preload=decode(list[i+1].file).then(p=>{next=p;ready=true;return p;},e=>{failed=e.message;return null;});
    status('Создаю видео · фото '+(i+1)+' / '+list.length+' · '+W+' × '+H+' · '+fps+' FPS');
    const tr=list[i].transition,seconds=i+1<list.length?T.duration(tr,list[i].duration):0;
    const still=list[i].duration-seconds;
    if(still>0)await hold(current,still,mode,t=>{$('photoVideoProgress').value=100*(elapsed+t)/duration;});
    if(i+1<list.length){
     if(!ready&&rec.state==='recording')rec.pause();
     const decoded=await preload;preload=null;
     if(!decoded||cancelled)throw Error(failed||'Создание отменено.');
     if(rec.state==='paused')rec.resume();
     if(seconds>0)await transition(current,decoded,seconds,mode,tr.type,t=>{$('photoVideoProgress').value=100*(elapsed+still+t)/duration;});
     current.close();current=decoded;next=null;
     draw(current,mode);
    }
    elapsed+=list[i].duration;
   }
   if(cancelled)throw Error(failed||'Создание отменено.');
   const mime=rec.mimeType||'video/mp4';
   if(rec.state!=='inactive')rec.stop();
   let finishTimer;try{await Promise.race([finished,new Promise((_,reject)=>{finishTimer=setTimeout(()=>reject(Error('Кодировщик не завершился.')),10000);})]);}finally{clearTimeout(finishTimer);}
   if(failed||cancelled)throw Error(failed||'Создание отменено.');
   const blob=new Blob(chunks,{type:mime});
   if(!blob.size)throw Error('Кодировщик вернул пустой файл.');
   const ext=mime.includes('mp4')?'mp4':'webm';
   $('photoVideoCancel').hidden=true;
   status('Открываю созданный ролик в редакторе…');
   await onImport(new File([blob],'Фото_видео.'+ext,{type:ext==='mp4'?'video/mp4':'video/webm'}),{limit,fps,duration});
   if(dialog.open)dialog.close();
   status('Видео создано. Можно изменить длительность и собрать заново.');
  }catch(e){status(failed||e.message||'Не удалось создать видео.');}
  finally{
   if(rec&&rec.state!=='inactive')try{rec.stop();}catch(_){}
   for(const track of stream?.getTracks()||[])track.stop();
   if(preload)await preload.catch(()=>{});
   current?.close();next?.close();current=next=null;stream=rec=null;
   canvas.hidden=true;canvas.width=2;canvas.height=2;from.width=to.width=2;from.height=to.height=2;busy(false);
  }
 }
 $('photoVideoOpen').onclick=()=>{if(!canOpen())return;onOpen?.();render();dialog.showModal();};
 $('photoVideoClose').onclick=()=>{if(!running)dialog.close();};
 dialog.addEventListener('cancel',e=>{if(running)e.preventDefault();});
 $('photoVideoAdd').addEventListener('change',e=>{
  if(running)return;const files=Array.from(e.target.files||[]);e.target.value='';
  const seconds=clampDuration($('photoVideoDefault').value);
  let added=0;for(const file of files){if(!file.size||file.type&&!file.type.startsWith('image/'))continue;items.push({file,duration:seconds,transition:T.spec($('photoTransitionType').value,$('photoTransitionSeconds').value)});added++;}
  page=Math.floor(Math.max(0,items.length-1)/PAGE);render();status('Добавлено: '+added+'. Можно добавлять ещё.');
 });
 T.options($('photoTransitionType'));
 $('photoTransitionApply').onclick=()=>{const t=T.spec($('photoTransitionType').value,$('photoTransitionSeconds').value);items.forEach(item=>item.transition={...t});render();};
 $('photoVideoApply').onclick=()=>{const seconds=clampDuration($('photoVideoDefault').value);$('photoVideoDefault').value=seconds;items.forEach(x=>x.duration=seconds);render();};
 $('photoVideoApplyTotal').onclick=()=>{try{distribute(items,Number($('photoVideoTotal').value));render();}catch(e){status(e.message);}};
 $('photoVideoClear').onclick=()=>{if(!running){items=[];page=0;render();status('Список очищен.');}};
 $('photoVideoPrev').onclick=()=>{page--;render();};$('photoVideoNext').onclick=()=>{page++;render();};
 $('photoVideoCancel').onclick=()=>{cancelled=true;status('Останавливаю создание…');};
 $('photoVideoBuild').onclick=()=>void build();
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!$('photoVideoCancel').hidden){cancelled=true;status('Создание остановлено: приложение было свёрнуто.');}});
 render();
}
root.VHSPhotoVideo=Object.freeze({mount,dimensions,fit,distribute,total});
})(window);
