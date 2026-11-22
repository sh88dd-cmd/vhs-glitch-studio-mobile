/* VHS Video Lab 0.8.0 — offline creative controls, no paid APIs.
 * Mounts once; editor owns all source files, audio graph and export.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const E=root.VHSVideoCreative,clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
function create(opts){
 const {state,source,preview,callbacks}=opts;
 const c=state.creative;
 let tool='',drawing=null,tracked=[],trackedClip=-1,lastTrackTime=-1,prevGray=null;
 let faceDetector=null,faceBusy=false,faceLast=-1,autoBoxes=[],autoClip=-1;
 let lastReverseFrame=0,reversePlaying=false;
 const overlay=$('touchOverlay'),editStage=$('touchEditStage'),
  editPreview=$('touchEditPreview'),editLabel=$('touchEditLabel');
 let editorTime=-1,editorDirty=true,editorClip=-1;
 const redrawEditor=()=>{editorDirty=true;updateOverlay();};
 function save(){callbacks.save();callbacks.render();}
 function updateInput(id,v){if($(id))$(id).value=String(v);}
 function pulse(message){$('touchStatus').textContent=message;}
 function showSubnav(ids,selected){
  for(const [button,page] of ids){
   const active=button===selected;
   $(button).classList.toggle('active',active);
   $(page).hidden=!active;
  }
 }
 function range(id,obj,key,label){
  const node=$(id);node.value=String(obj[key]);
  function update(){
   obj[key]=Number(node.value);
   if(label)$(label).textContent=Math.round(obj[key])+(id==='touchRadius'||id==='facePixelSize'||id==='faceBlurSize'?'':'%');
   save();
  }
  node.addEventListener('input',update);
  updateInput(id,obj[key]);if(label)$(label).textContent=Math.round(obj[key])+(id==='touchRadius'||id==='facePixelSize'||id==='faceBlurSize'?'':'%');
 }
 function updateOverlay(){
  const can=!!opts.hasVideo()&&!opts.isRecording();
  editStage.hidden=!can;
  const active=!!tool&&can;
  editStage.classList.toggle('is-active',active);
  overlay.classList.toggle('is-drawing',active);
  overlay.hidden=!can;
  editLabel.textContent=tool==='brush'?'РИСУЙ ПАЛЬЦЕМ ПО КАДРУ · мазок сохранится после отпускания':
   tool==='face'?'ОБВЕДИ ЛИЦО ПАЛЬЦЕМ · прямоугольник сохранится':
   'Нажми «Рисовать» или «Обвести лицо», затем проведи пальцем по этому кадру';
  if(!can)return;
  // The editing surface follows the SOURCE aspect ratio without video
  // letterboxing or offsets. No overlay over the sticky/hidden main monitor.
  const vw=Math.max(2,source.videoWidth||preview.width||480);
  const vh=Math.max(2,source.videoHeight||preview.height||270);
  const w=Math.max(2,Math.min(720,vw)),h=Math.max(2,Math.round(w*vh/vw));
  const resized=editPreview.width!==w||editPreview.height!==h;
  if(resized){editPreview.width=w;editPreview.height=h;editorDirty=true;}
  if(overlay.width!==w)overlay.width=w;
  if(overlay.height!==h)overlay.height=h;
  const t=Number(source.currentTime)||0,clip=opts.getClip();
  // Reuse the frame while the video is paused or a finger is moving; avoid
  // decoding/redrawing a large canvas on every pointer movement.
  if(editorDirty||editorClip!==clip||Math.abs(t-editorTime)>.025){
   const frame=editPreview.getContext('2d');
   frame.clearRect(0,0,w,h);
   frame.drawImage(source,0,0,w,h);
   if(c.touch.enabled)E.drawStrokes(frame,c,clip,t);
   if(c.touch.facesEnabled){
    const boxes=faceBoxes(frame,t,clip);
    E.drawFaces(frame,boxes,c);
   }
   editorTime=t;editorClip=clip;editorDirty=false;
  }
  const ctx=overlay.getContext('2d');
  ctx.clearRect(0,0,w,h);
  ctx.save();
  ctx.lineWidth=Math.max(2,w/200);ctx.strokeStyle='#ffb75c';
  ctx.fillStyle='#ffb75c';ctx.setLineDash([7,4]);
  if(drawing&&tool==='face'){
   const r=drawing;ctx.strokeRect(r.x*w,r.y*h,r.w*w,r.h*h);
  }
  if(drawing&&tool==='brush'){
   const pts=drawing.points;ctx.beginPath();
   for(let i=0;i<pts.length;i++){
    const [x,y]=pts[i];if(i===0)ctx.moveTo(x*w,y*h);else ctx.lineTo(x*w,y*h);
   }
   if(pts.length===1){
    ctx.beginPath();ctx.arc(pts[0][0]*w,pts[0][1]*h,Math.max(7,w/130),0,Math.PI*2);ctx.fill();
   }else ctx.stroke();
  }
  if(!drawing&&c.touch.facesEnabled){
   ctx.setLineDash([]);
   const boxes=faceBoxes(editPreview.getContext('2d'),t,clip);
   for(const r of boxes){
    ctx.strokeStyle='#88e9b1';ctx.lineWidth=Math.max(2,w/250);
    ctx.strokeRect(r.x*w,r.y*h,r.w*w,r.h*h);
   }
  }
  ctx.restore();
 }
 function position(event){
  const rect=overlay.getBoundingClientRect();
  return [clamp((event.clientX-rect.left)/Math.max(1,rect.width),0,1),
   clamp((event.clientY-rect.top)/Math.max(1,rect.height),0,1)];
 }
 function finishDrawing(){
  if(!drawing)return;
  if(tool==='brush'){
   if(drawing.points.length){
    c.touch.strokes.push(drawing);if(c.touch.strokes.length>120)c.touch.strokes.shift();
    pulse('Касание записано на '+drawing.duration.toFixed(1)+' секунды. Можно продолжать рисовать.');
   }
  }else if(tool==='face'){
   if(drawing.w>.025&&drawing.h>.025){
    c.touch.manualFaces.push({...drawing,id:'face-'+Date.now().toString(36),clip:opts.getClip(),start:Number(source.currentTime)||0});
    c.touch.manualFaces=c.touch.manualFaces.slice(-6);
    c.touch.facesEnabled=true;$('faceEnabled').checked=true;
    resetTracking();
    pulse('Лицо выделено. Маска будет двигаться при воспроизведении благодаря локальному отслеживанию кадров.');
   }
  }
  drawing=null;editorDirty=true;save();updateOverlay();
 }
 function startOverlay(){
  // iOS Safari can cancel Pointer Events when it tries to scroll/zoom.
  // Handle real Touch Events (non-passive) as the primary finger channel;
  // Pointer Events remain for mouse/stylus and desktop browsers.
  let activePointer=null;
  const begin=point=>{
   if(!tool||opts.isRecording()||!opts.hasVideo()||drawing)return;
   const [x,y]=position(point);
   if(tool==='brush'){
    c.touch.enabled=true;$('touchEnabled').checked=true;
    const start=Number(source.currentTime)||0,duration=clamp(c.touch.duration,.2,120);
    drawing={id:'touch-'+Date.now().toString(36),clip:opts.getClip(),
     start,end:start+duration,duration,mode:c.touch.brush,
     radius:Number(c.touch.radius),strength:Number(c.touch.strength),points:[[x,y]]};
    pulse('Рисую… отпусти палец для сохранения.');
   }else{
    drawing={x,y,w:0,h:0,anchorX:x,anchorY:y};
    pulse('Выделяю лицо… протяни прямоугольник и отпусти палец.');
   }
   editorDirty=false;
   updateOverlay();
  };
  const move=point=>{
   if(!drawing)return;
   const [x,y]=position(point);
   if(tool==='brush'){
    const pts=drawing.points,last=pts[pts.length-1];
    if(Math.hypot(last[0]-x,last[1]-y)>.0035&&pts.length<400)pts.push([x,y]);
   }else{
    const ax=drawing.anchorX,ay=drawing.anchorY;
    drawing.x=Math.min(ax,x);drawing.y=Math.min(ay,y);
    drawing.w=Math.abs(ax-x);drawing.h=Math.abs(ay-y);
   }
   updateOverlay();
  };
  const prevent=e=>{if(tool){e.preventDefault();e.stopPropagation();}};
  // Attach to the whole stage, not just the overlay canvas, so mobile
  // WebKit hit-testing quirks cannot silently disable drawing.
  editStage.addEventListener('touchstart',e=>{
   if(!tool||!e.touches||e.touches.length!==1)return;
   prevent(e);
   activePointer='touch';
   begin(e.changedTouches[0]);
  },{passive:false});
  editStage.addEventListener('touchmove',e=>{
   if(activePointer!=='touch'||!drawing)return;
   prevent(e);move(e.changedTouches[0]);
  },{passive:false});
  editStage.addEventListener('touchend',e=>{
   if(activePointer!=='touch')return;
   prevent(e);
   if(e.changedTouches?.length)move(e.changedTouches[0]);
   activePointer=null;finishDrawing();
  },{passive:false});
  editStage.addEventListener('touchcancel',e=>{
   if(activePointer!=='touch')return;
   prevent(e);activePointer=null;finishDrawing();
  },{passive:false});
  editStage.addEventListener('pointerdown',e=>{
   if(e.pointerType==='touch'||!tool||e.button>0)return;
   prevent(e);activePointer=e.pointerId;
   begin(e);
   try{editStage.setPointerCapture(e.pointerId);}catch{}
  });
  editStage.addEventListener('pointermove',e=>{
   if(activePointer!==e.pointerId||!drawing)return;
   prevent(e);move(e);
  });
  const finishPointer=e=>{
   if(e.pointerType==='touch'||activePointer!==e.pointerId)return;
   prevent(e);if(drawing)move(e);
   activePointer=null;finishDrawing();
  };
  editStage.addEventListener('pointerup',finishPointer);
  editStage.addEventListener('pointercancel',finishPointer);
  editStage.addEventListener('lostpointercapture',e=>{
   if(activePointer===e.pointerId){activePointer=null;finishDrawing();}
  });
 }
 function resetTracking(){
  prevGray=null;tracked=[];trackedClip=-1;lastTrackTime=-1;
 }
 const rawTrackCanvas=document.createElement('canvas');
 const rawTrackCtx=rawTrackCanvas.getContext('2d',{willReadFrequently:true});
 let lastAutoScanWall=-1000,faceIdSerial=0,modelStatus='';
 function overlap(a,b){
  const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y);
  const x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h);
  const area=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  return area/(a.w*a.h+b.w*b.h-area+1e-8);
 }
 function distinctFaces(boxes,limit=10){
  const unique=[];
  for(const candidate of boxes){
   if(!candidate||candidate.w<.016||candidate.h<.016)continue;
   if(unique.some(box=>overlap(box,candidate)>.42))continue;
   unique.push(candidate);
   if(unique.length>=limit)break;
  }
  return unique;
 }
 async function initFaceDetector(){
  if('FaceDetector' in root){
   try{
    const native=new root.FaceDetector({fastMode:false,maxDetectedFaces:10});
    faceDetector={kind:'native',detect:video=>native.detect(video)};
    return true;
   }catch{}
  }
  const vision=root.tracking?.ViolaJones;
  if(!vision?.classifiers?.face)return false;
  const work=document.createElement('canvas');
  const context=work.getContext('2d',{willReadFrequently:true});
  faceDetector={
   kind:'haar',
   async detect(video){
    const candidates=[];
    // Do not stop after the FIRST found face: group portraits often have
    // other, smaller faces that require a different image scale.
    for(const maxSide of [260,400]){
     const scale=Math.min(1,maxSide/Math.max(video.videoWidth||1,video.videoHeight||1));
     const w=Math.max(24,Math.round(video.videoWidth*scale));
     const h=Math.max(24,Math.round(video.videoHeight*scale));
     if(work.width!==w)work.width=w;
     if(work.height!==h)work.height=h;
     context.drawImage(video,0,0,w,h);
     const pixels=context.getImageData(0,0,w,h).data;
     const found=vision.detect(pixels,w,h,1.1,1.22,2,.105,vision.classifiers.face)||[];
     const sx=video.videoWidth/w,sy=video.videoHeight/h;
     for(const r of found){
      if(r.width<17||r.height<17||r.width>w*.85||r.height>h*.85)continue;
      candidates.push({boundingBox:{x:r.x*sx,y:r.y*sy,
       width:r.width*sx,height:r.height*sy}});
     }
     await new Promise(resolve=>setTimeout(resolve,0));
    }
    return candidates;
   }
  };
  return true;
 }
 async function upgradeDetector(){
  if(faceDetector?.kind==='mediapipe')return true;
  if(!root.VHSVideoFaceAI?.create)return false;
  try{
   faceDetector=await root.VHSVideoFaceAI.create();
   modelStatus='MediaPipe';
   return true;
  }catch(err){
   modelStatus='Офлайн-резерв: '+(err?.message||'модель недоступна');
   console.warn('Optional multi-face detector not loaded',err);
   return false;
  }
 }
 function normalizedFaces(found,w,h){
  const candidates=(found||[]).map(item=>{
   const r=item.boundingBox||item;
   const x=clamp((r.x??r.originX)/w,0,1),y=clamp((r.y??r.originY)/h,0,1);
   return{x,y,w:clamp((r.width||0)/w,0,1-x),h:clamp((r.height||0)/h,0,1-y),
    confidence:Number(item.confidence||1)};
  }).filter(box=>box.w>.016&&box.h>.016);
  candidates.sort((a,b)=>b.confidence-a.confidence);
  return distinctFaces(candidates);
 }
 function reconcileDetections(faces,time,clip){
  const previous=autoClip===clip?autoBoxes:[];
  const used=new Set();
  const next=faces.map(face=>{
   let best=null,bestScore=-Infinity;
   for(const old of previous){
    if(used.has(old.id))continue;
    const dist=Math.hypot(
     (face.x+face.w*.5)-(old.x+old.w*.5),
     (face.y+face.h*.5)-(old.y+old.h*.5));
    const score=overlap(face,old)*2-dist/(Math.max(face.w,old.w,face.h,old.h)+.05);
    if(score>bestScore&&dist<Math.max(.18,(face.w+old.w)*.8)){
     best=old;bestScore=score;
    }
   }
   const id=best?best.id:'auto-'+(++faceIdSerial);
   if(best)used.add(best.id);
   return {...face,id,clip,start:time};
  });
  autoBoxes=next;autoClip=clip;faceLast=time;
  // Re-anchor the optical tracker to actual detector locations. This prevents
  // accumulated drift after a turn, a camera pan or a partially hidden face.
  if(trackedClip===clip){
   for(const face of next){
    const old=tracked.find(box=>box.id===face.id);
    if(!old){tracked.push({...face});continue;}
    const fresh=.80;
    old.x=old.x*(1-fresh)+face.x*fresh;
    old.y=old.y*(1-fresh)+face.y*fresh;
    old.w=old.w*(1-fresh)+face.w*fresh;
    old.h=old.h*(1-fresh)+face.h*fresh;
   }
   tracked=tracked.filter(box=>!box.id?.startsWith('auto-')||
    next.some(face=>face.id===box.id));
  }
  prevGray=null;lastTrackTime=time;
 }
 async function detectFace(live=false){
  if(!faceDetector||faceBusy||!opts.hasVideo()||source.readyState<2)return autoBoxes.length;
  faceBusy=true;
  try{
   if(!live)await new Promise(resolve=>setTimeout(resolve,0));
   const t=Number(source.currentTime)||0,clip=opts.getClip();
   const found=await faceDetector.detect(source);
   if(clip!==opts.getClip()||Math.abs(t-(Number(source.currentTime)||0))>.8)
    return autoBoxes.length;
   const boxes=normalizedFaces(found,source.videoWidth,source.videoHeight);
   if(boxes.length)reconcileDetections(boxes,t,clip);
   else if(!live){autoBoxes=[];autoClip=clip;faceLast=t;resetTracking();}
   else if(t-faceLast>1.7){autoBoxes=[];resetTracking();}
   if(!live)callbacks.render();
   return boxes.length;
  }catch(err){
   if(!live)pulse('Ошибка поиска лиц: '+err.message+'. Можно выделить лицо пальцем.');
   return autoBoxes.length;
  }finally{faceBusy=false;}
 }
 function frameGray(){
  const w=240,h=Math.max(16,Math.round(w*source.videoHeight/Math.max(1,source.videoWidth)));
  if(rawTrackCanvas.width!==w)rawTrackCanvas.width=w;
  if(rawTrackCanvas.height!==h)rawTrackCanvas.height=h;
  rawTrackCtx.drawImage(source,0,0,w,h);
  return E.gray(rawTrackCtx,240);
 }
 function faceBoxes(ctx,time,clip){
  const cfg=c.touch;
  if(!cfg.facesEnabled)return[];
  const manual=cfg.manualFaces.filter(face=>face.clip===clip&&time>=Number(face.start||0)).slice(-10);
  // On-device MediaPipe (or native FaceDetector) refreshes the detected faces
  // throughout playback. Haar still runs only on demand (slow on iPhone).
  const liveModel=faceDetector?.kind==='mediapipe'||faceDetector?.kind==='native';
  const fresh=time>=faceLast-.25&&(!liveModel||time-faceLast<1.8);
  const auto=cfg.faceAutodetect&&faceDetector&&autoClip===clip&&fresh?
   autoBoxes.map(face=>({...face,clip})):[];
  const anchors=[...manual,...auto].slice(-10);
  if(anchors.length){
   const clipChanged=trackedClip!==clip;
   const changed=tracked.length!==anchors.length||
    tracked.some((x,i)=>x.id!==anchors[i].id);
   const discontinuity=time<lastTrackTime-.12||time-lastTrackTime>.7;
   if(clipChanged||changed||discontinuity){
    tracked=anchors.map(box=>({...box}));prevGray=null;
    lastTrackTime=time;trackedClip=clip;
   }
   if(time>lastTrackTime+.045&&time-lastTrackTime<.7&&source.readyState>=2){
    const gray=frameGray();
    if(prevGray&&prevGray.w===gray.w&&prevGray.h===gray.h)
     tracked=E.trackBoxes(prevGray.data,gray.data,gray.w,gray.h,tracked);
    prevGray=gray;lastTrackTime=time;
   }else if(!prevGray&&source.readyState>=2){
    prevGray=frameGray();lastTrackTime=time;
   }
  }else{
   tracked=[];prevGray=null;trackedClip=clip;lastTrackTime=time;
  }
  // A live scan is independent of drawing and uses the original decoded
  // video frame, never the pixelated preview.
  if(cfg.faceAutodetect&&liveModel&&!source.paused&&!source.seeking&&
   opts.hasVideo()&&!faceBusy&&
   performance.now()-lastAutoScanWall>=520&&time>=0){
   lastAutoScanWall=performance.now();
   setTimeout(()=>{
    if(!opts.hasVideo()||!c.touch.facesEnabled||!c.touch.faceAutodetect)return;
    detectFace(true).then(count=>{
     if(count&&$('panel-touch').classList.contains('active')){
      editorDirty=true;updateOverlay();
     }
    }).catch(err=>console.warn('Live face refresh failed',err));
   },0);
  }
  return tracked.slice(0,10);
 }
 function drawTouch(ctx,time,clip){
  if(c.touch.enabled)E.drawStrokes(ctx,c,clip,time);
  if(c.touch.facesEnabled){
   const boxes=faceBoxes(ctx,time,clip);
   E.drawFaces(ctx,boxes,c);
  }
 }
 const speedFactor=v=>E.forwardFactor(v);
 function speedLabel(v){return v<0?'−'+Math.abs(v).toFixed(1)+' (×'+speedFactor(v).toFixed(2)+')':'+'+v.toFixed(1)+' (×'+speedFactor(v).toFixed(1)+')';}
 function speedGraphY(v){return clamp(50-Math.log10(speedFactor(v))*43,7,93);}
 function speedValueForY(y){const f=10**((50-clamp(y,7,93))/43),r=f<1?-1/f:f;return Math.sign(r)*Math.round(clamp(Math.abs(r),1,10)*10)/10;}
 let draggingSpeedId=null;
 function renderSpeedPoints(){
  const list=$('speedPointsList'),graph=$('speedCurveGraph');
  list.replaceChildren();graph.replaceChildren();
  const duration=Math.max(.01,Number(source.duration)||1);
  const pts=(c.speed.points||[]).slice().sort((a,b)=>a.time-b.time);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('speedCurveLines');svg.setAttribute('viewBox','0 0 1000 200');
  svg.setAttribute('preserveAspectRatio','none');
  const interpolated=pts.length?[{time:0,rate:pts[0].rate},...pts,{time:duration,rate:pts.at(-1).rate}]:
   [{time:0,rate:c.speed.rate},{time:duration,rate:c.speed.rate}];
  const path=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  path.setAttribute('points',interpolated.map(p=>clamp(p.time/duration,0,1)*1000+','+speedGraphY(p.rate)*2).join(' '));
  path.setAttribute('fill','none');path.setAttribute('stroke','#ffc18e');path.setAttribute('stroke-width','5');
  svg.append(path);graph.append(svg);
  for(const [label,y] of [['10×',7],['1×',50],['0.1×',93]]){
   const span=document.createElement('span');span.className='speedGraphLabel';span.style.top=y+'%';span.textContent=label;graph.append(span);
  }
  for(const point of pts){
   const marker=document.createElement('button');marker.className='speedPointMarker';marker.type='button';
   marker.dataset.pointId=point.id;marker.style.left=(clamp(point.time/duration,0,1)*100)+'%';
   marker.style.top=speedGraphY(point.rate)+'%';marker.title=point.time.toFixed(2)+' с · '+speedLabel(point.rate);
   graph.append(marker);
   const row=document.createElement('div');row.className='creativePointRow';
   row.textContent=point.time.toFixed(2)+' с · '+speedLabel(point.rate);
   const del=document.createElement('button');del.className='button';del.textContent='✕';del.type='button';
   del.onclick=()=>{if(opts.isRecording())return;c.speed.points=c.speed.points.filter(x=>x.id!==point.id);
    save();renderSpeedPoints();callbacks.speed();};
   row.append(del);list.append(row);
  }
  if(!pts.length)list.textContent='Коснись графика, чтобы создать точку. Перетаскивай её пальцем.';
 }
 function mountSpeed(){
  const speed=c.speed,graph=$('speedCurveGraph');
  $('speedEnabled').onchange=()=>{speed.enabled=$('speedEnabled').checked;save();callbacks.speed();};
  $('speedRate').oninput=()=>{
   speed.rate=(speed.rate<0?-1:1)*clamp($('speedRate').value,1,10);speed.enabled=true;
   refreshSpeed();save();callbacks.speed();
  };
  for(const [id,sign] of [['speedForward',1],['speedReverse',-1]]){
   $(id).onclick=()=>{speed.rate=sign*Math.abs(speed.rate||1);speed.enabled=true;refreshSpeed();save();callbacks.speed();};
  }
  $('speedReverseToggle').onchange=()=>{speed.reverse=$('speedReverseToggle').checked;
   speed.enabled=true;refreshSpeed();save();callbacks.speed();};
  $('speedCurveEnabled').onchange=()=>{speed.curveEnabled=$('speedCurveEnabled').checked;
   speed.enabled=true;refreshSpeed();save();callbacks.speed();};
  $('speedAddPoint').onclick=()=>{
   if(!opts.hasVideo()||opts.isRecording())return;
   const time=Number($('speedPointTime').value),rate=Number($('speedPointRate').value);
   if(!Number.isFinite(time)||time<0||time>source.duration||!Number.isFinite(rate)||Math.abs(rate)<1||Math.abs(rate)>10)return;
   speed.points=speed.points.filter(x=>Math.abs(x.time-time)>=.01);
   if(speed.points.length>=70)return;
   speed.points.push({id:'speed-'+Date.now().toString(36),time,rate});
   speed.curveEnabled=true;speed.enabled=true;refreshSpeed();save();callbacks.speed();
  };
  function xy(e){const r=graph.getBoundingClientRect();
   return {x:clamp((e.clientX-r.left)/Math.max(1,r.width),0,1),
    y:clamp((e.clientY-r.top)/Math.max(1,r.height),0,1)};}
  graph.addEventListener('pointerdown',e=>{
   if(!opts.hasVideo()||opts.isRecording()||e.button>0)return;
   e.preventDefault();
   const pos=xy(e),dur=Math.max(.01,Number(source.duration)||1);
   const id=e.target.closest?.('.speedPointMarker')?.dataset.pointId;
   let point=speed.points.find(p=>p.id===id)||
    speed.points.find(p=>Math.hypot(p.time/dur-pos.x,speedGraphY(p.rate)/100-pos.y)<.055);
   if(!point){if(speed.points.length>=70)return;
    point={id:'speed-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6),
     time:Math.round(pos.x*dur*100)/100,rate:speedValueForY(pos.y*100)};
    speed.points.push(point);
   }
   draggingSpeedId=point.id;speed.enabled=true;speed.curveEnabled=true;
   $('speedPointTime').value=String(point.time);$('speedPointRate').value=String(point.rate);
   graph.setPointerCapture(e.pointerId);refreshSpeed();
  });
  graph.addEventListener('pointermove',e=>{
   if(!draggingSpeedId||!graph.hasPointerCapture(e.pointerId))return;
   const point=speed.points.find(p=>p.id===draggingSpeedId);if(!point)return;
   const pos=xy(e),dur=Math.max(.01,Number(source.duration)||1);
   point.time=Math.round(pos.x*dur*100)/100;point.rate=speedValueForY(pos.y*100);
   $('speedPointTime').value=String(point.time);$('speedPointRate').value=String(point.rate);
   renderSpeedPoints();
  });
  const finish=e=>{
   if(!draggingSpeedId)return;
   if(graph.hasPointerCapture(e.pointerId))graph.releasePointerCapture(e.pointerId);
   draggingSpeedId=null;
   speed.points.sort((a,b)=>a.time-b.time);
   for(let i=speed.points.length-1;i>0;i--)if(Math.abs(speed.points[i].time-speed.points[i-1].time)<.01)speed.points.splice(i-1,1);
   refreshSpeed();save();callbacks.speed();
  };
  graph.addEventListener('pointerup',finish);graph.addEventListener('pointercancel',finish);
  refreshSpeed();
 }
 function refreshSpeed(){
  $('speedRateText').textContent=speedLabel(c.speed.rate);
  $('speedForward').classList.toggle('active',c.speed.rate>=0);
  $('speedReverse').classList.toggle('active',c.speed.rate<0);
  $('speedReverseToggle').checked=!!c.speed.reverse;
  $('speedRate').value=String(Math.abs(c.speed.rate));
  $('speedEnabled').checked=!!c.speed.enabled;
  $('speedCurveEnabled').checked=!!c.speed.curveEnabled;
  $('speedStatus').textContent=c.speed.reverse?'Реверс работает как отдельный просмотр назад без звука; экспорт реверса пока недоступен.':
   'Минус = замедление, плюс = ускорение. Нажми на график и перетаскивай точки. Верх = быстрее, низ = медленнее.';
  renderSpeedPoints();
 }
 function speedRate(time){
  return E.speedAt(c.speed,time,Number(source.duration)||0);
 }
 function isReverse(){return reversePlaying;}
 function startReverse(){
  if(!opts.hasVideo()||opts.isRecording())return false;
  if(speedRate(source.currentTime)>=0)return false;
  source.pause();reversePlaying=true;lastReverseFrame=performance.now();return true;
 }
 function stopReverse(){reversePlaying=false;lastReverseFrame=0;}
 function updateSpeed(now=performance.now()){
  const rate=speedRate(source.currentTime||0);
  if(opts.isRecording()){
   // Native source.playbackRate works with positive rates; negative playback
   // uses manual frame stepping in preview only (no reverse audio claim).
   if(rate>0&&source.playbackRate!==rate)try{source.playbackRate=rate;}catch{}
   return;
  }
  if(rate<0){
   if(!source.paused&&!reversePlaying){
    source.pause();reversePlaying=true;lastReverseFrame=now;
   }
   if(reversePlaying&&lastReverseFrame&&now-lastReverseFrame>=70&&source.readyState>=2&&!source.seeking){
    const dt=Math.min(.2,(now-lastReverseFrame)/1000);
    lastReverseFrame=now;
    source.currentTime=clamp(source.currentTime+rate*dt,0,Math.max(0,source.duration-.001));
    if(source.currentTime<=.015)stopReverse();
   }
  }else{
   if(reversePlaying)stopReverse();
   if(source.playbackRate!==Math.max(.1,rate))try{source.playbackRate=Math.max(.1,rate);}catch{}
  }
 }
 function mountAging(){
  const a=c.aging,tabs=[['cassetteLibraryTab','cassetteLibraryPage'],['cassetteAgingTab','cassetteAgingPage']];
  tabs.forEach(([id])=>$(id).onclick=()=>showSubnav(tabs,id));
  $('agingEnabled').onchange=()=>{a.enabled=$('agingEnabled').checked;refreshAging();save();};
  for(const [id,key] of [['agingAmount','amount'],['agingStart','start'],['agingEnd','end']]){
   $(id).value=String(a[key]);$(id).oninput=()=>{a[key]=Number($(id).value);refreshAging();save();};
  }
  $('agingPreviewLate').onclick=()=>{
   if(!opts.hasVideo()||opts.isRecording())return;
   source.pause();
   source.currentTime=Math.max(0,(Number(source.duration)||0)*.85-.02);
   refreshAging();callbacks.render();
  };
  refreshAging();
 }
 function refreshAging(){
  $('agingEnabled').checked=!!c.aging.enabled;
  for(const [id,key] of [['agingAmount','amount'],['agingStart','start'],['agingEnd','end']])
   $(id).value=String(c.aging[key]);
  $('agingAmountText').textContent=Math.round(c.aging.amount)+'%';
  const current=Math.round(E.agingAt(c.aging,source.currentTime||0,source.duration||0)*100);
  $('agingStatus').textContent=c.aging.enabled?
   'Старение включено. На текущем кадре разрушение: '+current+'%. От начала ('+c.aging.start+'%) до конца ('+c.aging.end+'%) оно нарастает. Чтобы увидеть сильный эффект сразу, нажми кнопку выше.':
   'Старение выключено. Включи и проверь ближе к концу ролика.';
 }
 function mountLook(){
  const l=c.look;
  $('lookEnabled').checked=!!l.enabled;$('lookStrength').value=String(l.strength);
  $('lookStrengthText').textContent=Math.round(l.strength)+'%';
  $('lookEnabled').onchange=()=>{l.enabled=$('lookEnabled').checked;save();};
  $('lookStrength').oninput=()=>{l.strength=Number($('lookStrength').value);
   $('lookStrengthText').textContent=Math.round(l.strength)+'%';save();};
  $('lookFile').onchange=async event=>{
   const f=event.target.files?.[0];event.target.value='';
   if(!f||opts.isRecording())return;
   if(f.size>20*1024*1024){$('lookStatus').textContent='Файл больше 20 МБ. Выбери меньше.';return;}
   const url=URL.createObjectURL(f);
   try{
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Не удалось прочитать фото.'));image.src=url;});
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(2,Math.round(image.naturalWidth*scale));
    canvas.height=Math.max(2,Math.round(image.naturalHeight*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const data=ctx.getImageData(0,0,canvas.width,canvas.height);
    l.target=E.colorSample(data.data,canvas.width,canvas.height,3);
    l.enabled=true;$('lookEnabled').checked=true;
    $('lookStatus').textContent='Цветовая палитра скопирована из «'+f.name+'». Результат виден на видео.';
    save();
   }catch(err){$('lookStatus').textContent=err.message;}
   finally{URL.revokeObjectURL(url);}
  };
  if(l.target)$('lookStatus').textContent='Локальная палитра сохранена; можно изменить силу.';
 }
 function mountBeat(){
  $('autoBeatSensitivity').oninput=()=>{
   $('autoBeatSensitivityText').textContent=$('autoBeatSensitivity').value+'%';
  };
  $('autoBeatGenerate').onclick=async()=>{
   if(!opts.hasVideo()||opts.isRecording()){
    $('autoBeatStatus').textContent='Сначала загрузи видео и останови экспорт.';return;
   }
   const btn=$('autoBeatGenerate');btn.disabled=true;
   try{
    const selected=$('autoBeatSource').value;
    $('autoBeatStatus').textContent=selected==='video'?'Читаю звуковую дорожку исходного видео…':'Анализирую добавленную дорожку…';
    const buffer=selected==='video'?await opts.getOriginalAudioBuffer():opts.getAudioBuffer();
    if(!buffer){
     $('autoBeatStatus').textContent='Добавь локальное аудио во вкладке «ТРЕКИ» или выбери «Звук из видео».';return;
    }
    if(opts.isRecording())return;
    const sensitivity=Number($('autoBeatSensitivity').value),effect=$('autoBeatEffect').value;
    const events=E.beatEvents(buffer,{
     sensitivity,duration:Math.min(buffer.duration,source.duration||buffer.duration),
     clip:opts.getClip(),limit:85,effect:effect==='mix'?'tapeChew':effect
    });
    if(effect==='mix')events.forEach((ev,i)=>{ev.effect=['tapeChew','vhold','rf','colorBurst'][i%4];});
    if(!events.length){$('autoBeatStatus').textContent='Не найдены отчётливые удары. Попробуй другую чувствительность или фрагмент.';return;}
    opts.onBeat(events);
    $('autoBeatStatus').textContent='Найдено '+events.length+' ударов из '+(selected==='video'?'звука самого видео':'добавленной музыки')+'. События появились во вкладке «СЦЕНЫ».';
   }catch(error){
    $('autoBeatStatus').textContent='Не удалось проанализировать дорожку: '+(error?.message||String(error));
   }finally{btn.disabled=false;}
  };
 }
 function mountLive(){
  let active=null;
  const finish=()=>{
   if(!active)return;
   const ev=active;active=null;
   const duration=Math.max(.12,(Number(source.currentTime)||0)-ev.time);
   ev.duration=Math.min(30,duration);
   opts.onLive(ev);
   document.querySelectorAll('[data-live-effect]').forEach(b=>b.classList.remove('is-pressed'));
   $('liveStatus').textContent='Записано: '+ev.effect+' · '+ev.duration.toFixed(2)+' c. Можно редактировать в разделе «СЦЕНЫ».';
  };
  for(const b of document.querySelectorAll('[data-live-effect]')){
   const begin=e=>{
    if(!opts.hasVideo()||opts.isRecording()||active)return;
    e.preventDefault();
    active={id:'live-'+Date.now().toString(36),clip:opts.getClip(),time:Number(source.currentTime)||0,
     duration:.25,strength:95,effect:b.dataset.liveEffect};
    b.classList.add('is-pressed');
    opts.onLiveStart(active);
    try{b.setPointerCapture(e.pointerId);}catch{}
   };
   b.addEventListener('pointerdown',begin);
   b.addEventListener('pointerup',finish);
   b.addEventListener('pointercancel',finish);
   b.addEventListener('lostpointercapture',finish);
  }
  const refs=['morphA','morphB'];
  for(const id of refs)$(id).onchange=()=>{};
  $('morphSlider').oninput=()=>{
   if(opts.isRecording())return;
   const a=opts.getCassettes().find(x=>x.id===$('morphA').value);
   const b=opts.getCassettes().find(x=>x.id===$('morphB').value);
   if(!a||!b)return;
   const v=Number($('morphSlider').value)/100;
   $('morphValueText').textContent=Math.round(v*100)+'%';
   opts.onMorph(a.settings,b.settings,v);
  };
  refreshCassettes();
 }
 function refreshCassettes(){
  const all=opts.getCassettes(),els=['morphA','morphB'];
  for(const id of els){
   const el=$(id),old=el.value;el.replaceChildren();
   for(const item of all){const opt=document.createElement('option');
    opt.value=item.id;opt.textContent=item.name;el.append(opt);
   }
   if(all.some(x=>x.id===old))el.value=old;
  }
  if(all.length>1&&$('morphB').selectedIndex<=0)$('morphB').selectedIndex=1;
 }
 function mountTouch(){
  $('touchBrushTab').onclick=()=>{showSubnav([['touchBrushTab','touchBrushPage'],['touchFaceTab','touchFacePage']],'touchBrushTab');tool='';editorDirty=true;updateOverlay();};
  $('touchFaceTab').onclick=()=>{showSubnav([['touchBrushTab','touchBrushPage'],['touchFaceTab','touchFacePage']],'touchFaceTab');tool='';editorDirty=true;updateOverlay();};
  $('touchEnabled').checked=!!c.touch.enabled;
  $('touchEnabled').onchange=()=>{c.touch.enabled=$('touchEnabled').checked;editorDirty=true;save();updateOverlay();};
  $('touchBrush').value=c.touch.brush;
  $('touchBrush').onchange=()=>{c.touch.brush=$('touchBrush').value;save();};
  for(const [id,key,label] of [
   ['touchRadius','radius','touchRadiusText'],['touchStrength','strength','touchStrengthText'],
   ['facePixelSize','faceSize','facePixelText'],['faceBlurSize','faceBlur','faceBlurText']])
   range(id,c.touch,key,label);
  $('touchDuration').value=String(c.touch.duration);
  $('touchDuration').onchange=()=>{c.touch.duration=clamp($('touchDuration').value,.2,120);save();};
  $('touchStartDrawing').onclick=()=>{
   if(tool!=='brush'&&!source.paused)source.pause();
   tool=tool==='brush'?'':'brush';
   $('touchStartDrawing').textContent=tool==='brush'?'✓ Закончить рисование':'✎ Начать рисовать на кадре ниже';
   $('faceMark').textContent='＋ Обвести лицо на кадре выше';
   editorDirty=true;updateOverlay();
   pulse(tool?'Проводи пальцем по кадру прямо в этом разделе. Мазок сохраняется при отпускании.':'Рисование выключено.');
   if(tool)editStage.scrollIntoView({behavior:'smooth',block:'center'});
  };
  $('touchUndo').onclick=()=>{c.touch.strokes.pop();editorDirty=true;save();updateOverlay();pulse('Последнее касание удалено.');};
  $('touchClear').onclick=()=>{c.touch.strokes=[];editorDirty=true;save();updateOverlay();pulse('Все нарисованные помехи очищены.');};
  $('faceEnabled').checked=!!c.touch.facesEnabled;
  $('faceEnabled').onchange=()=>{c.touch.facesEnabled=$('faceEnabled').checked;editorDirty=true;save();updateOverlay();};
  $('faceStyle').value=c.touch.faceStyle;
  $('faceStyle').onchange=()=>{c.touch.faceStyle=$('faceStyle').value;save();};
  $('faceAuto').onclick=async()=>{
   if(!faceDetector){pulse('Детектор недоступен. Можно обвести лицо пальцем прямо на кадре ниже.');return;}
   if(faceBusy)return;
   if(!source.paused)source.pause();
   tool=''; // Search results should not be hidden by an active brush mode.
   c.touch.facesEnabled=true;c.touch.faceAutodetect=true;
   $('faceEnabled').checked=true;
   autoBoxes=[];autoClip=-1;faceLast=-1;resetTracking();editorDirty=true;
   $('faceAuto').disabled=true;
   pulse('Ищу лица на остановленном кадре…');
   editStage.scrollIntoView({behavior:'smooth',block:'center'});
   try{
    const count=await detectFace();
    if(!count){
     // A failed scan must not leave face autodetect switched on with no
     // usable mask. Offer direct finger selection on this same visible frame.
     c.touch.faceAutodetect=false;
     tool='face';
     $('faceMark').textContent='✓ Закончить выделение';
    }
    editorDirty=true;save();updateOverlay();
    pulse(count?'Найдено лиц: '+count+'. Зелёные рамки показывают области обработки; для другой сцены повтори поиск.':
     'Модель не распознала лицо. Ручное выделение уже включено: обведи лицо пальцем по кадру выше.');
   }finally{$('faceAuto').disabled=false;}
  };
  $('faceMark').onclick=()=>{
   if(tool!=='face'&&!source.paused)source.pause();
   tool=tool==='face'?'':'face';
   $('faceMark').textContent=tool==='face'?'✓ Закончить выделение':'＋ Обвести лицо на кадре выше';
   $('touchStartDrawing').textContent='✎ Начать рисовать на кадре ниже';
   editorDirty=true;updateOverlay();
   pulse(tool?'Обведи лицо прямоугольником прямо на кадре в этом разделе.':'Выделение выключено.');
   if(tool)editStage.scrollIntoView({behavior:'smooth',block:'center'});
  };
  $('faceClear').onclick=()=>{
   c.touch.manualFaces=[];c.touch.faceAutodetect=false;autoBoxes=[];autoClip=-1;faceLast=-1;resetTracking();editorDirty=true;save();updateOverlay();
   pulse('Все маски лиц убраны.');
  };
  startOverlay();initFaceDetector().then(ok=>{
   pulse(ok?'Видео можно рисовать и обрабатывать здесь. Поиск лиц доступен локально; при ошибке обведи лицо пальцем.':
    'Рисование доступно, но автопоиск лиц не загружен. Можно обвести лицо пальцем.');
  });
 }
 function syncButtons(){
  const can=!!opts.hasVideo()&&!opts.isRecording();
  for(const id of ['touchStartDrawing','faceAuto','faceMark'])$(id).disabled=!can;
  if(!can&&tool){tool='';drawing=null;}
  if(!can&&!editStage.hidden){editStage.hidden=true;editorTime=-1;editorDirty=true;}
  // Entering the Touch tab reveals the editor even before the first stroke.
  if($('panel-touch').classList.contains('active')||tool||!editStage.hidden)updateOverlay();
 }
 function refresh(){
  refreshSpeed();refreshAging();refreshCassettes();
  $('lookEnabled').checked=!!c.look.enabled;
  $('lookStrength').value=String(c.look.strength);
  $('lookStrengthText').textContent=Math.round(c.look.strength)+'%';
  $('audioDevice').value=c.audioDevice;
  $('touchEnabled').checked=!!c.touch.enabled;
  $('faceEnabled').checked=!!c.touch.facesEnabled;
  syncButtons();
 }
 function mount(){
  mountTouch();mountSpeed();mountAging();mountLook();mountBeat();mountLive();
  $('audioDevice').value=c.audioDevice;
  $('audioDevice').onchange=()=>{
   c.audioDevice=$('audioDevice').value;
   $('audioDeviceStatus').textContent=c.audioDevice==='off'?
    'Звук чистый.':'Выбран звуковой профиль: '+$('audioDevice').selectedOptions[0].text+'.';
   save();callbacks.audio();
  };
  refresh();
 }
 return Object.freeze({
  mount,refresh,syncButtons,drawTouch,resetTracking,refreshCassettes,
  speedRate,updateSpeed,startReverse,stopReverse,isReverse,get tool(){return tool;}
 });
}
root.VHSVideoCreativeUI=Object.freeze({create});
})(window);
