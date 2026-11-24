/* Camera light, exposure and AE/AF controls shared by Photo and Video Lab.
 * Hardware capabilities are detected per live track. Unsupported sensor
 * controls are never presented as if they were real hardware features.
 */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,Number(x)||0));
const $=id=>document.getElementById(id);
const ratioMap={'9:16':9/16,'16:9':16/9,'3:4':3/4,'4:3':4/3,'4:5':4/5,'1:1':1,'21:9':21/9};
function requestedRatio(value,sourceW,sourceH){
 return ratioMap[value]||sourceW/sourceH;
}
function cropRect(w,h,format){
 const target=requestedRatio(format,w,h),actual=w/h;
 if(!Number.isFinite(target)||!w||!h)return{x:0,y:0,w,h};
 if(Math.abs(actual-target)<.002)return{x:0,y:0,w,h};
 if(actual>target){const width=h*target;return{x:(w-width)/2,y:0,w:width,h};}
 const height=w/target;return{x:0,y:(h-height)/2,w,h:height};
}
function croppedSize(w,h,format){
 const c=cropRect(w,h,format);
 const even=n=>Math.max(2,Math.round(n/2)*2);
 return {width:even(c.w),height:even(c.h)};
}
function drawCropped(ctx,source,sourceW,sourceH,format,outW,outH){
 const c=cropRect(sourceW,sourceH,format);
 ctx.drawImage(source,c.x,c.y,c.w,c.h,0,0,outW,outH);
}
root.VHSCameraFormats=Object.freeze({requestedRatio,cropRect,croppedSize,drawCropped});

function mount({prefix,video,stage,onStatus,onChange,canInteract}){
 const flash=$(prefix+'Flash'),ev=$(prefix+'Exposure'),value=$(prefix+'ExposureValue');
 const reset=$(prefix+'ExposureReset'),lock=$(prefix+'AELock');
 const marker=$(prefix+'FocusMarker');
 if(!flash||!ev||!value||!reset||!lock||!marker)throw Error('Camera exposure UI not mounted: '+prefix);
 let track=null,caps={},torchOn=false,brightness=0,hardwareEV=false,locked=false;
 let active=false,serial=0,evSerial=0,pointTimer=0,pressPoint=null,scratch=null;
 let lockParts=[],lockBusy=false,lockRejected=false,pointRejected=false,priorModes={};
 const usable=()=>!!track&&track.readyState==='live'&&canInteract();
 const notify=text=>{if(active)onStatus?.(text);};
 const modes=(name)=>Array.isArray(caps[name])?caps[name]:[];
 const torchSupported=()=>{
  const v=caps.torch;
  return v===true||(Array.isArray(v)&&v.includes(true))||
   !!navigator.mediaDevices?.getSupportedConstraints?.().torch;
 };
 const lockable=()=>['focusMode','exposureMode'].filter(name=>modes(name).includes('manual')&&(modes(name).includes('continuous')||modes(name).includes('single-shot')||modes(name).includes('auto')));
 const canLock=()=>!lockRejected&&lockable().length>0&&typeof track?.applyConstraints==='function';
 const lockName=parts=>parts.length===2?'AE/AF':parts.includes('focusMode')?'AF':'AE';
 const cssFilter=()=>!hardwareEV&&brightness!==0?
  'brightness('+Math.pow(2,brightness).toFixed(5)+')':'none';
 const render=()=>{
  value.textContent=(brightness>0?'+':'')+brightness.toFixed(1);
  ev.value=String(brightness);
  flash.textContent=torchOn?'⚡ ВКЛ':'⚡ ВЫКЛ';
  flash.setAttribute('aria-pressed',String(torchOn));
  flash.disabled=!usable()||!torchSupported();
  flash.title=!torchSupported()?'Устройство не предоставляет фонарик браузеру':
   'Аппаратный фонарик. В фото он подсвечивает кадр до нажатия без задержки затвора';
  lock.textContent=locked?'🔒 '+lockName(lockParts):canLock()?'◎ '+lockName(lockable()):'◎ AUTO';
  lock.setAttribute('aria-pressed',String(locked));
  lock.disabled=!usable()||lockBusy||(!locked&&!canLock());
  lock.title=!canLock()&&!locked?'Автофокус и автоэкспозиция: ручная блокировка недоступна в этом браузере':
   locked?'Снять фиксацию '+lockName(lockParts):'Удерживай кадр для фиксации '+lockName(lockable());
  lock.setAttribute('aria-label',lock.title);
  stage.classList.toggle('camera-ae-locked',locked);
  onChange?.();
 };
 function setMarker(x,y){
  marker.style.left=(clamp(x,0,1)*100)+'%';
  marker.style.top=(clamp(y,0,1)*100)+'%';
  marker.hidden=false;
  marker.classList.toggle('locked',locked);
 }
 async function applyHardwareEV(n){
  if(!usable()||!caps.exposureCompensation||typeof track.applyConstraints!=='function'){
   hardwareEV=false;render();return;
  }
  const range=caps.exposureCompensation;
  if(!Number.isFinite(range.min)||!Number.isFinite(range.max)){
   hardwareEV=false;render();return;
  }
  const current=++evSerial,device=track;
  try{
   await device.applyConstraints({advanced:[{exposureCompensation:clamp(n,range.min,range.max)}]});
   if(current!==evSerial||device!==track)return;
   hardwareEV=true;
  }catch(err){
   if(current!==evSerial||device!==track)return;
   hardwareEV=false;
  }
  render();
 }
 function setExposure(n){
  brightness=Math.round(clamp(n,-2,2)*10)/10;
  // An explicit EV adjustment cancels the previously held auto-exposure.
  if(locked)void unlock();
  const range=caps.exposureCompensation;
  hardwareEV=false;render();
  if(range&&Number.isFinite(range.min)&&Number.isFinite(range.max)&&usable())
   void applyHardwareEV(brightness);
 }
 async function setFlash(on){
  if(!usable()||!torchSupported()){
   torchOn=false;render();notify('Вспышка недоступна для этой камеры в Safari.');return;
  }
  const device=track,requested=!!on,operation=++serial;
  flash.disabled=true;
  try{
   await device.applyConstraints({advanced:[{torch:requested}]});
   if(operation!==serial||device!==track)return;
   torchOn=requested;
   notify(requested?'⚡ Фонарик камеры включён. Свет уже освещает кадр — мгновенный спуск сохранён.':
    '⚡ Фонарик выключен.');
  }catch(err){
   if(operation!==serial||device!==track)return;
   torchOn=false;
   notify('Safari не разрешил управлять вспышкой этой камеры.');
  }finally{
   if(operation===serial&&device===track)render();
  }
 }
 async function restoreModes(device,parts,previous){
  const restore={};
  for(const name of parts){
   const available=modes(name);
   const original=previous[name];
   const mode=original&&original!=='manual'&&available.includes(original)?original:available.find(x=>x==='continuous')||available.find(x=>x==='auto')||available.find(x=>x==='single-shot');
   if(mode)restore[name]={exact:mode};
  }
  if(Object.keys(restore).length)await device.applyConstraints(restore);
 }
 async function unlock(){
  if(lockBusy||!locked)return;
  if(!usable()){locked=false;lockParts=[];render();return;}
  const device=track;lockBusy=true;render();
  try{
   await restoreModes(device,lockParts,priorModes);
   if(device!==track)return;
   const actual=device.getSettings?.()||{};
   if(lockParts.some(name=>actual[name]==='manual'))throw Error('Camera still manual');
   locked=false;lockParts=[];marker.hidden=true;
  }catch(err){if(device===track)notify('Не удалось снять фиксацию. Переключи камеру.');}
  finally{if(device===track){lockBusy=false;render();}}
 }
 async function toggleLock(x=.5,y=.5){
  if(!usable()||lockBusy)return;
  if(locked){await unlock();return;}
  // Unsupported hardware is left in automatic mode. Do not simulate a lock.
  if(!canLock())return;
  const device=track,settings=device.getSettings?.()||{},parts=lockable();
  const requested=Object.fromEntries(parts.map(name=>[name,{exact:'manual'}]));
  for(const name of ['focusDistance','exposureTime','iso']){
   const relevant=name==='focusDistance'?parts.includes('focusMode'):parts.includes('exposureMode');
   if(relevant&&Number.isFinite(settings[name])&&caps[name]&&settings[name]>=caps[name].min&&settings[name]<=caps[name].max)
    requested[name]={exact:settings[name]};
  }
  lockBusy=true;render();
  try{
   await device.applyConstraints(requested);
   if(device!==track)return;
   const actual=device.getSettings?.()||{};
   const confirmed=parts.filter(name=>actual[name]==='manual');
   if(confirmed.length!==parts.length)throw Error('Lock not confirmed by camera');
   priorModes=settings;lockParts=confirmed;locked=true;setMarker(x,y);
  }catch(err){
   if(device!==track)return;
   try{await restoreModes(device,parts,settings);}catch(_){}
   if(device!==track)return;
   locked=false;lockParts=[];lockRejected=true;marker.hidden=true;
  }finally{if(device===track){lockBusy=false;render();}}
 }
 async function focusAt(x,y){
  if(!usable()||locked||lockBusy||pointRejected||!caps.pointsOfInterest||typeof track.applyConstraints!=='function')return;
  const device=track;
  try{
   await device.applyConstraints({advanced:[{pointsOfInterest:[{x:clamp(x,0,1),y:clamp(y,0,1)}]}]});
   if(device!==track)return;
   // Only show a marker when the browser reports a point actually applied.
   const actual=device.getSettings?.()?.pointsOfInterest;
   if(Array.isArray(actual)&&actual.some(p=>Math.abs(p.x-x)<.05&&Math.abs(p.y-y)<.05)){setMarker(x,y);setTimeout(()=>{if(device===track&&!locked)marker.hidden=true;},1000);}
  }catch(err){if(device===track)pointRejected=true;}
 }
 function bind(device){
  serial++;evSerial++;torchOn=false;locked=false;lockParts=[];lockBusy=false;lockRejected=false;pointRejected=false;priorModes={};marker.hidden=true;
  track=device?.readyState==='live'?device:null;
  try{caps=track?.getCapabilities?.()||{};}catch(err){caps={};}
  active=!!track;hardwareEV=false;render();
  if(active)setExposure(brightness);
 }
 function unbind(){
  serial++;evSerial++;
  const old=track;track=null;caps={};active=false;torchOn=false;hardwareEV=false;locked=false;lockParts=[];lockBusy=false;lockRejected=false;pointRejected=false;priorModes={};
  marker.hidden=true;clearTimeout(pointTimer);pressPoint=null;
  if(old?.readyState==='live'&&old.applyConstraints)
   void old.applyConstraints({advanced:[{torch:false}]}).catch(()=>{});
  render();
 }
 // Safari versions without CanvasRenderingContext2D.filter need a real
 // pixel fallback: a CSS preview-only brightness does NOT affect exports.
 function softwarePixels(ctx,w,h){
  if(brightness===0||hardwareEV)return;
  const image=ctx.getImageData(0,0,w,h),data=image.data;
  const factor=Math.pow(2,brightness);
  for(let i=0;i<data.length;i+=4){
   data[i]=Math.min(255,Math.round(data[i]*factor));
   data[i+1]=Math.min(255,Math.round(data[i+1]*factor));
   data[i+2]=Math.min(255,Math.round(data[i+2]*factor));
  }
  ctx.putImageData(image,0,0);
 }
 function canvasFilterAvailable(ctx){
  return 'filter' in ctx;
 }
 function bakeCanvas(canvas){
  const filter=cssFilter();
  if(filter==='none')return;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!canvasFilterAvailable(ctx)){
   softwarePixels(ctx,canvas.width,canvas.height);return;
  }
  if(!scratch)scratch=document.createElement('canvas');
  if(scratch.width!==canvas.width)scratch.width=canvas.width;
  if(scratch.height!==canvas.height)scratch.height=canvas.height;
  const dst=scratch.getContext('2d',{alpha:false});
  dst.clearRect(0,0,scratch.width,scratch.height);
  dst.filter=filter;dst.drawImage(canvas,0,0);dst.filter='none';
  ctx.filter='none';ctx.drawImage(scratch,0,0);
 }
 function filterDraw(ctx,source,w,h){
  ctx.save();
  if(canvasFilterAvailable(ctx))ctx.filter=cssFilter();
  ctx.drawImage(source,0,0,w,h);
  if(!canvasFilterAvailable(ctx))softwarePixels(ctx,w,h);
  ctx.restore();
 }
 flash.addEventListener('click',()=>void setFlash(!torchOn));
 ev.addEventListener('input',()=>setExposure(ev.value));
 reset.addEventListener('click',()=>setExposure(0));
 lock.addEventListener('click',()=>void toggleLock());
 const point=event=>{
  const rect=stage.getBoundingClientRect();
  return{x:clamp((event.clientX-rect.left)/Math.max(rect.width,1),0,1),
   y:clamp((event.clientY-rect.top)/Math.max(rect.height,1),0,1)};
 };
 // iOS touch-and-hold selection and callout otherwise steal the 650ms gesture.
 // Ignore actual UI controls; never block the range input or buttons.
 const controlTarget=target=>!!target?.closest?.('button,input,label,select,option,output,.captureCameraToolbar');
 stage.addEventListener('touchstart',event=>{
  if(usable()&&!controlTarget(event.target)&&event.cancelable)event.preventDefault();
 },{passive:false});
 stage.addEventListener('touchmove',event=>{
  if(usable()&&!controlTarget(event.target)&&event.cancelable)event.preventDefault();
 },{passive:false});
 stage.addEventListener('contextmenu',event=>{
  if(!controlTarget(event.target))event.preventDefault();
 });
 stage.addEventListener('selectstart',event=>{
  if(!controlTarget(event.target))event.preventDefault();
 });
 stage.addEventListener('pointerdown',event=>{
  if(controlTarget(event.target)||!usable()||event.button>0)return;
  if(event.cancelable)event.preventDefault();
  try{stage.setPointerCapture?.(event.pointerId);}catch{}
  const p=point(event);
  pressPoint={...p,x0:event.clientX,y0:event.clientY,startEV:brightness,
   fired:false,dragging:false};
  clearTimeout(pointTimer);
  pointTimer=setTimeout(()=>{
   pointTimer=0;
   if(!pressPoint||!usable())return;
   pressPoint.fired=true;
   void toggleLock(p.x,p.y);
  },650);
 });
 stage.addEventListener('pointermove',event=>{
  if(!pressPoint||!usable()||pressPoint.fired)return;
  const dx=event.clientX-pressPoint.x0,dy=event.clientY-pressPoint.y0;
  if(!pressPoint.dragging&&Math.hypot(dx,dy)>12){
   clearTimeout(pointTimer);pointTimer=0;
   if(Math.abs(dy)>=Math.abs(dx)*.8)pressPoint.dragging=true;
   else{pressPoint=null;return;}
  }
  if(pressPoint?.dragging){
   event.preventDefault();
   // Vertical iPhone-style exposure gesture: up = brighter, down = darker.
   const h=Math.max(100,stage.getBoundingClientRect().height);
   setExposure(pressPoint.startEV-dy/(h*.25));
  }
 });
 stage.addEventListener('pointerup',event=>{
  clearTimeout(pointTimer);pointTimer=0;
  if(pressPoint&&!pressPoint.fired&&!pressPoint.dragging)
   void focusAt(pressPoint.x,pressPoint.y);
  try{stage.releasePointerCapture?.(event.pointerId);}catch{}
  pressPoint=null;
 });
 for(const type of ['pointercancel','pointerleave']){
  stage.addEventListener(type,()=>{clearTimeout(pointTimer);pointTimer=0;pressPoint=null;});
 }
 render();
 return Object.freeze({bind,unbind,cssFilter,filterDraw,bakeCanvas,
  getEV:()=>brightness,isHardwareEV:()=>hardwareEV,isLocked:()=>locked,
  flashOn:()=>torchOn});
}
root.VHSCameraControls=Object.freeze({mount});
})(window);
