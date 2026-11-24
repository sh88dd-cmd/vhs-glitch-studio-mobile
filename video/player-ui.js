/* VHS Video Lab 0.7.8 — Safari-stable sticky monitor + enlarged processed canvas player.
 * A pure UI adapter: playback and decoding remain in app.js, and only the
 * already-processed preview is mirrored. No additional effects/render passes.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fmt=s=>{if(!Number.isFinite(s)||s<0)return'00:00';const n=Math.floor(s);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')};
// Watch the VIDEO FRAME, not its surrounding stage (which includes upload,
// transport and status controls). On short iPhone tabs the stage footer may
// remain on screen even at maximum scroll, and a whole-stage threshold would
// show the dock only during elastic overscroll before hiding it again.
function shouldDock({hasVideo,frameBottom,viewportTop=0,viewerOpen=false}){
 const visibleTop=Math.max(0,Number(viewportTop)||0);
 return !!hasVideo&&!viewerOpen&&Number.isFinite(frameBottom)&&frameBottom<=visibleTop+12;
}
function create(config){
 const {source,preview,getState,onPlay,onReroll,onUndo,onPrev,onNext,onSeek}=config;
 const dock=$('monitorDock'),viewer=$('videoViewer'),body=document.body;
 const frame=$('videoStage').querySelector('.stageCanvas');
 let previousReady=false;
 function state(){return getState()||{}}
 function updateVisibility(){
  const s=state();
  const frameBottom=frame.getBoundingClientRect().bottom;
  // Safari's visual viewport can have a top offset when the browser chrome
  // expands/collapses. The dock's visibility follows what is actually visible.
  const viewportTop=window.visualViewport?.offsetTop||0;
  const visible=shouldDock({
   hasVideo:!!s.file&&source.readyState>=2,frameBottom,
   viewportTop,viewerOpen:viewer.open
  });
  const wasHidden=dock.hidden;
  dock.hidden=!visible;
  body.classList.toggle('dock-visible',visible);
  if(visible){
   const height=Math.ceil(dock.getBoundingClientRect().height||0);
   if(height>0&&body.style?.setProperty)body.style.setProperty('--dock-height',height+'px');
   if(wasHidden)mirror();
  }
 }
 function mirror(){
  if(!state().file)return;
  for(const [id,visible] of [['dockCanvas',!dock.hidden],['viewerCanvas',viewer.open]]){
   if(!visible)continue;
   const canvas=$(id);
   if(canvas.width!==preview.width)canvas.width=preview.width;
   if(canvas.height!==preview.height)canvas.height=preview.height;
   const ctx=canvas.getContext('2d');
   if(frame.classList.contains('native-clean'))root.VHSVideoCleanPath.drawClean(source,canvas);
   else ctx.drawImage(preview,0,0);
  }
 }
 function sync(){
  const s=state(),hasVideo=!!s.file&&source.readyState>=2,usable=hasVideo&&!s.recording;
  const duration=source.duration||0,position=source.currentTime||0;
  const fraction=Number.isFinite(duration)&&duration>0?clamp(position/duration,0,1):0;
  const playText=!source.paused&&!source.ended?'Ⅱ':'▶';
  for(const id of ['dockTimeCurrent','viewerCurrent'])$(id).textContent=fmt(position);
  for(const id of ['dockTimeTotal','viewerTotal'])$(id).textContent=fmt(duration);
  for(const id of ['dockSeek','viewerSeek']){
   const input=$(id);
   input.disabled=!usable||!Number.isFinite(duration)||duration<=0;
   if(!input.matches(':active'))input.value=Math.round(fraction*1000);
  }
  $('dockPlay').disabled=!usable;$('viewerPlay').disabled=!usable;
  $('dockPlay').textContent=playText;$('viewerPlay').textContent=playText;
  $('dockUndo').disabled=!usable||!s.hasUndo;
  $('dockReroll').disabled=!usable;
  $('openViewer').disabled=!hasVideo;
  $('dockExpand').disabled=!hasVideo;
  for(const id of ['viewerBack','viewerForward'])$(id).disabled=!usable;
  $('viewerPrev').disabled=!usable||!s.hasPrevious;
  $('viewerNext').disabled=!usable||!s.hasNext;
  $('dockFileName').textContent=s.file?.name||'Видеомонитор';
  $('viewerName').textContent=s.file?.name||'Просмотр видео';
  if(hasVideo!==previousReady){
   previousReady=hasVideo;
   updateVisibility();
  }
 }
 function open(){
  if(!state().file||source.readyState<2||viewer.open)return;
  viewer.showModal();
  body.classList.add('viewer-open');
  updateVisibility();sync();mirror();
 }
 function close(){if(viewer.open)viewer.close()}
 function seek(value){
  const s=state(),duration=source.duration;
  if(!s.file||s.recording||!Number.isFinite(duration)||duration<=0)return;
  onSeek(clamp(value,0,duration));
  sync();
 }
 function scrub(id){seek(Number($(id).value)/1000*(source.duration||0))}
 function skip(seconds){seek((source.currentTime||0)+seconds)}
 $('dockPlay').addEventListener('click',onPlay);
 $('viewerPlay').addEventListener('click',onPlay);
 $('dockReroll').addEventListener('click',onReroll);
 $('dockUndo').addEventListener('click',onUndo);
 $('dockExpand').addEventListener('click',open);
 $('openViewer').addEventListener('click',open);
 $('closeViewer').addEventListener('click',close);
 $('viewerBack').addEventListener('click',()=>skip(-10));
 $('viewerForward').addEventListener('click',()=>skip(10));
 $('viewerPrev').addEventListener('click',onPrev);
 $('viewerNext').addEventListener('click',onNext);
 $('dockSeek').addEventListener('input',()=>scrub('dockSeek'));
 $('viewerSeek').addEventListener('input',()=>scrub('viewerSeek'));
 viewer.addEventListener('close',()=>{body.classList.remove('viewer-open');updateVisibility()});
 for(const event of ['play','pause','timeupdate','seeked','loadedmetadata','loadeddata','ended'])source.addEventListener(event,sync);
 window.addEventListener('scroll',updateVisibility,{passive:true});
 window.addEventListener('resize',updateVisibility);
 window.visualViewport?.addEventListener('scroll',updateVisibility,{passive:true});
 window.visualViewport?.addEventListener('resize',updateVisibility,{passive:true});
 window.addEventListener('pageshow',updateVisibility);
 sync();updateVisibility();
 return Object.freeze({render:mirror,sync,updateVisibility,open,close});
}
root.VHSVideoPlayerUI=Object.freeze({create,shouldDock});
})(window);