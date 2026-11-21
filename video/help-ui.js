/* VHS Video Lab 0.7.9 — accessible, touch-safe contextual help on every control.
 * The tiny ? is a SIBLING of interactive controls, never a nested button or label.
 * MutationObserver also covers controls added by renderers (camera/audio/cassettes).
 */
(function(root){
'use strict';
const content=root.VHSVideoHelpContent,art=root.VHSVideoHelpIllustrations;
const $=id=>document.getElementById(id);
let mounted=false,scheduled=false,lastTrigger=null,frameImageUrl=null;
const HELP_VISIBILITY_KEY='vhs.video.help-visible.v1';
function setVisible(visible,save=true){
 const enabled=!!visible;
 document.body.classList.toggle('help-visible',enabled);
 const toggle=$('toggleHelpIcons'),label=$('helpToggleText');
 if(toggle){
  toggle.setAttribute('aria-pressed',String(enabled));
  toggle.setAttribute('aria-label',enabled?'Скрыть подсказки для всех функций':'Показать подсказки для всех функций');
 }
 if(label)label.textContent=enabled?'Скрыть подсказки':'Показать подсказки';
 if(save)try{localStorage.setItem(HELP_VISIBILITY_KEY,enabled?'1':'0');}catch{}
 // Keep the original interactive controls intact; just conceal their small ?
 // companions. The help window itself never changes the editor settings.
 if(!enabled&&$('videoHelpModal')?.open)close();
}
function loadVisibility(){
 let saved='0';
 try{saved=localStorage.getItem(HELP_VISIBILITY_KEY)||'0';}catch{}
 setVisible(saved==='1',false);
}

const hide=id=>$(id).hidden=id==='helpAnimated';
function iconFor(key,title,type){
 const btn=document.createElement('button');
 btn.type='button';btn.className='helpIcon';
 btn.textContent='?';btn.setAttribute('aria-label','Справка: '+title);
 btn.setAttribute('title','Объяснить: '+title);
 btn.dataset.helpKey=key;btn.dataset.helpTitle=title;
 btn.dataset.helpType=type||'button';
 // Prevent pressed effects, camera checkboxes, file choosers, etc. from firing.
 for(const event of ['pointerdown','pointerup','touchstart','touchend','mousedown','mouseup','dblclick']){
  btn.addEventListener(event,e=>{e.stopPropagation();});
 }
 btn.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  open(key,title,type,btn);
 });
 return btn;
}
function cleanTitle(node){
 const clone=node.cloneNode(true);
 clone.querySelectorAll('input,select,textarea,button,.helpIcon,.helpHint,.hint,progress,canvas,svg').forEach(x=>x.remove());
 return (clone.textContent||node.getAttribute('aria-label')||node.title||node.placeholder||'Настройка')
  .replace(/\s+/g,' ').replace(/^\W+/,'').replace(/\s+вкл\.?$/i,'').slice(0,115).trim();
}
function targetType(node){
 if(node.matches('input,select,textarea'))return node.type||node.tagName.toLowerCase();
 const input=node.querySelector('input,select,textarea');
 return input?.type||input?.tagName.toLowerCase()||'button';
}
function findKey(node){
 if(node.dataset.tab)return 'tab-'+node.dataset.tab;
 if(node.dataset.audioSection)return 'audio-'+node.dataset.audioSection;
 if(node.id)return node.id;
 const control=node.querySelector('input,select,textarea,button');
 if(control?.id)return control.id;
 const parent=node.closest('[id^="audioArea-"],[id^="panel-"],.cameraCard,.extraAudioCard');
 const title=cleanTitle(node);
 if(parent?.id)return parent.id+':'+title;
 return 'name:'+title;
}
function decorateButton(node){
 if(!node.isConnected||node.classList.contains('helpIcon')||node.closest('#videoHelpModal'))return;
 if(node.dataset.helpDecorated==='yes'||node.closest('.helpButtonSlot'))return;
 if(node.closest('.cassetteFace')&&node!==node.closest('.cassetteFace'))return;
 const parent=node.parentNode;
 if(!parent||parent.nodeType!==1)return;
 const title=cleanTitle(node),key=findKey(node);
 const wrap=document.createElement('span');wrap.className='helpButtonSlot';
 if(node.matches('.modeChoice,[data-audio-section],[data-tab]'))wrap.classList.add('helpNavSlot');
 if(node.matches('label.button'))wrap.classList.add('helpFileSlot');
 parent.insertBefore(wrap,node);wrap.append(node,iconFor(key,title,targetType(node)));
 node.dataset.helpDecorated='yes';
}
function decorateBlock(node,type='block'){
 if(!node.isConnected||node.closest('#videoHelpModal'))return;
 if(node.dataset.helpDecorated==='yes')return;
 let title='';
 if(node.matches('.control'))title=node.querySelector('.controlHead strong')?.textContent||'Ползунок';
 else if(node.matches('.switch'))title=node.querySelector('span')?.textContent||'Переключатель';
 else if(node.matches('.cameraCard'))title=node.querySelector('.cameraCardTitle strong')?.textContent||'Камера';
 else if(node.matches('.extraAudioCard'))title=node.querySelector('.extraAudioHeading strong')?.textContent||'Аудиодорожка';
 else title=cleanTitle(node);
 const key=findKey(node);
 node.classList.add('helpBlock');
 node.append(iconFor(key,title,node.matches('.control')?'range':type));
 node.dataset.helpDecorated='yes';
}
function decorateLabel(node){
 if(!node.isConnected||node.dataset.helpDecorated==='yes'||node.closest('#videoHelpModal'))return;
 if(node.matches('.button')){decorateButton(node);return;}
 if(node.closest('.helpField')||node.closest('.helpButtonSlot'))return;
 // A label wrapping controls MUST NOT also wrap a help button:
 // touching the badge would toggle the checkbox or reopen the file picker.
 const parent=node.parentNode;
 if(!parent||parent.nodeType!==1)return;
 const key=findKey(node),title=cleanTitle(node);
 const wrap=document.createElement('div');
 wrap.className='helpField';
 if(node.classList.contains('fullRow')){wrap.classList.add('fullRow');node.classList.remove('fullRow');}
 parent.insertBefore(wrap,node);wrap.append(node,iconFor(key,title,targetType(node)));
 node.dataset.helpDecorated='yes';
}
function decorateHeading(node){
 if(!node.isConnected||node.dataset.helpDecorated==='yes'||node.closest('#videoHelpModal'))return;
 if(node.closest('.helpHeading'))return;
 const parent=node.parentNode;
 if(!parent||parent.nodeType!==1)return;
 const title=cleanTitle(node);
 const id=node.closest('.audioArea[id]')?.id||node.closest('section[id^="panel-"]')?.id;
 const key=id?.startsWith('panel-')?'tab-'+id.substring(6):
  id?.startsWith('audioArea-')?'audio-'+id.substring(10):'name:'+title;
 const wrap=document.createElement('div');wrap.className='helpHeading';
 parent.insertBefore(wrap,node);wrap.append(node,iconFor(key,title,'section'));
 node.dataset.helpDecorated='yes';
}
function decorateStandalone(node){
 if(!node.isConnected||node.dataset.helpDecorated==='yes'||node.closest('#videoHelpModal'))return;
 if(node.closest('.helpBlock,.helpField,.helpButtonSlot,.helpStandalone'))return;
 const parent=node.parentNode;
 if(!parent||parent.nodeType!==1)return;
 const wrap=document.createElement('div');wrap.className='helpStandalone';
 const title=node.getAttribute('aria-label')||node.id||'Настройка';
 parent.insertBefore(wrap,node);wrap.append(node,iconFor(findKey(node),title,targetType(node)));
 node.dataset.helpDecorated='yes';
}
function scan(){
 if(!document.body)return;
 // Wrap higher-level controls first, then add per-field badges.
 document.querySelectorAll('main .tabs button[data-tab],main .audioSubtabs button[data-audio-section],'+
  '.specialModeButtons .modeChoice,main label.button,'+
  'main .stageButtons button,main .videoImportOptions label.button,'+
  'main .holdActionRow button,main .playlistRow button,'+
  'main .presetButtons button,main .keyframeActions button,'+
  'main .frameActions button,main .keyframeItem button,'+
  'main .cassetteTools button,main .cassetteSaveRow button,'+
  'main .cassetteFace,main .cassetteDeselect,'+
  'main .extraAudioHeading button,main .musicSelectedActions button,'+
  'main #export,main #cancel,main #share,main #download,'+
  'main #musicActivate,main #timelineActivate,main #addTimelineEvent,'+
  'main #keyframeAdd,main #keyframeUseTime,main #frameSavePng,'+
  'main #framePngDownload,main #musicTrimReset,'+
  'main #allEffectsToggle,main #restoreEffects,main #holdClear,'+
  'main #cassetteSave,main #cassetteExport,main #cassetteDeselect,'+
  'main #frameBack,main #frameForward,main #frameSavePng,'+
  '#monitorDock .dockBottom button,#monitorDock .dockExpand,'+
  '#videoViewer .viewerButtons button,#videoViewer .viewerHead button,'+
  '#videoViewer .viewerHold button'
 ).forEach(decorateButton);
 document.querySelectorAll('main .panel h2,main .audioArea h2,main .additionalTrackSection h2')
  .forEach(decorateHeading);
 document.querySelectorAll('main .control,main .switch,main .cameraCard,main .extraAudioCard')
  .forEach(node=>decorateBlock(node,'group'));
 document.querySelectorAll('main label:not(.button):not(.holdBlendHeading):not(.cassetteFace),'+
  '#videoViewer label:not(.holdBlendHeading)')
  .forEach(node=>{
   // Labels inside a switch or a camera header already have a container badge.
   if(node.closest('.cameraCardTitle,.switch'))return;
   if(!node.querySelector('input,select,textarea'))return;
   decorateLabel(node);
  });
 // Specific widgets whose inputs do not sit inside standard labels.
 for(const id of ['seek','holdBlendMain','keyframeValueRange','musicTrimStartRange',
  'musicTrimEndRange','dockSeek','viewerSeek','holdBlendViewer']){
  const input=$(id);
  if(!input||input.dataset.helpDecorated==='yes')continue;
  if(id==='dockSeek'||id==='viewerSeek'){
   // Mini-player controls are space-constrained. Put a single help badge on
   // the enclosing visible bar instead of shrinking 33px transport buttons.
   const bar=input.closest('.dockTimeline,.viewerSeekRow');
   if(bar)decorateBlock(bar,'range');
  }else if(id==='holdBlendMain'||id==='holdBlendViewer'){
   const block=input.closest('.holdBlend');
   if(block)decorateBlock(block,'range');
  }else if(id==='seek'){
   const block=input.closest('.seekRow');
   if(block)decorateBlock(block,'range');
  }else if(id==='musicTrimStartRange'||id==='musicTrimEndRange'){
   decorateStandalone(input);
  }else decorateStandalone(input);
  input.dataset.helpDecorated='yes';
 }
 for(const id of ['musicWaveform','keyframeTimeline','timelineTrack']){
  const node=$(id)||document.querySelector('.'+id);
  if(node&&node.dataset.helpDecorated!=='yes'){
   // Canvas children are fallback content and are NOT rendered in Safari.
   // Put the badge in a real sibling wrapper instead.
   if(node.tagName==='CANVAS')decorateStandalone(node);
   else decorateBlock(node,'visualization');
  }
 }
 // Catch any controls added by future editor versions: every slider, checkbox,
 // select, input, file picker, native button and details should still get ?.
 document.querySelectorAll('main button:not(.helpIcon):not(#toggleHelpIcons),main a.button:not(.helpIcon),'+
  '#videoViewer button:not(.helpIcon),#monitorDock button:not(.helpIcon)')
  .forEach(node=>{
   if(node.dataset.helpDecorated==='yes'||node.closest('.helpButtonSlot,.helpField,.helpBlock'))return;
   decorateButton(node);
  });
 document.querySelectorAll('main input:not([type=hidden]),main select,main textarea,'+
  '#videoViewer input:not([type=hidden]),#videoViewer select,'+
  '#monitorDock input:not([type=hidden])').forEach(node=>{
   if(node.dataset.helpDecorated==='yes'||node.closest('.helpBlock,.helpField,.helpButtonSlot,.helpStandalone'))return;
   const label=node.closest('label');
   if(label){decorateLabel(label);return;}
   decorateStandalone(node);
  });
 document.querySelectorAll('main details').forEach(node=>{
  if(node.dataset.helpDecorated!=='yes')decorateBlock(node,'group');
 });
 // Enclosing player badges summarize the whole playback workflow.
 for(const [selector,key,title] of [
  ['#monitorDock .dockScreen','dockPlayer','ЗАКРЕПЛЁННЫЙ МОНИТОР'],
  ['#videoViewer .viewerHead','viewerPlayer','УВЕЛИЧЕННЫЙ ПРОСМОТР']
 ]){
  const node=document.querySelector(selector);
  if(!node||node.dataset.helpDecorated==='yes')continue;
  node.classList.add('helpBlock');node.append(iconFor(key,title,'group'));node.dataset.helpDecorated='yes';
 }
}
function schedule(){
 if(scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;scan();});
}
function restoreActualFrames(){
 const source=$('source'),processed=$('preview');
 if(!source||!processed||source.readyState<2||!source.videoWidth||!source.videoHeight)return null;
 try{
  const pair=document.createElement('canvas'),ctx=pair.getContext('2d');
  pair.width=320;pair.height=124;
  ctx.fillStyle='#15171b';ctx.fillRect(0,0,320,124);
  for(const [x,media] of [[7,source],[168,processed]]){
   const iw=x+4,iy=14,w=137,h=78;
   ctx.fillStyle='#07090c';ctx.fillRect(iw,iy,w,h);
   const ratio=Math.min(w/(media.videoWidth||media.width),h/(media.videoHeight||media.height));
   const mw=(media.videoWidth||media.width)*ratio,mh=(media.videoHeight||media.height)*ratio;
   ctx.drawImage(media,iw+(w-mw)/2,iy+(h-mh)/2,mw,mh);
  }
  ctx.font='bold 12px sans-serif';ctx.textAlign='center';
  ctx.fillStyle='#f2f1ef';ctx.fillText('ДО',80,111);
  ctx.fillStyle='#ecb376';ctx.fillText('ПОСЛЕ',239,111);
  return pair.toDataURL('image/png');
 }catch{return null;}
}
function open(key,title,type,trigger){
 const modal=$('videoHelpModal');
 if(!modal||!content||!art)return;
 if(modal.open)modal.close();
 const info=content.resolve(key,title,type);
 lastTrigger=trigger;
 $('helpTitle').textContent=info.title;
 $('helpWhat').textContent=info.what;
 $('helpWhy').textContent=info.why;
 $('helpHow').textContent=info.how;
 $('helpNote').textContent=info.note;
 const image=$('helpIllustration');
 // Reset old image, so switching tips never shows the previous animation.
 image.removeAttribute('src');
 const animated=info.media==='gif';
 $('helpMediaLabel').textContent=animated?'GIF · КАК ЭТО РАБОТАЕТ':'ДО / ПОСЛЕ · ПРИМЕР';
 $('helpMediaCaption').textContent=animated?
  'Локальная зацикленная схема последовательности действий.':
  'Схематическое сравнение; если загружено видео — пример на текущем кадре.';
 $('helpImageError').hidden=true;
 let src='';
 try{src=animated?art.gifSource(info.variant):restoreActualFrames()||art.compareSvg(info.variant);}
 catch(err){src=art.compareSvg(info.variant);$('helpMediaCaption').textContent='Пример в виде схемы. GIF не удалось сформировать на этом устройстве.';}
 image.onerror=()=>{
  image.onerror=null;
  $('helpImageError').hidden=false;
  image.src=art.compareSvg(info.variant);
 };
 image.src=src;
 image.alt=animated?'Анимированная GIF-схема: '+info.title:'Сравнение исходного и обработанного кадра: '+info.title;
 document.body.classList.add('helpDialogOpen');
 try{modal.showModal();}catch{modal.setAttribute('open','');}
 $('helpClose').focus({preventScroll:true});
}
function close(){
 const modal=$('videoHelpModal');
 if(modal?.open)modal.close();
 document.body.classList.remove('helpDialogOpen');
 lastTrigger?.focus?.({preventScroll:true});
}
function mount(){
 if(mounted)return;mounted=true;
 const modal=$('videoHelpModal');
 if(!modal)throw Error('Help dialog missing from page.');
 loadVisibility(); // New installs start with a clean, question-mark-free UI.
 const switcher=$('toggleHelpIcons');
 if(!switcher)throw Error('Footer help visibility toggle is missing.');
 switcher.addEventListener('click',()=>setVisible(!document.body.classList.contains('help-visible')));
 $('helpClose').addEventListener('click',close);
 modal.addEventListener('click',e=>{if(e.target===modal)close();});
 modal.addEventListener('close',()=>{
  document.body.classList.remove('helpDialogOpen');
  $('helpIllustration').removeAttribute('src');
  lastTrigger?.focus?.({preventScroll:true});
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.open){e.preventDefault();close();}});
 scan();
 const observer=new MutationObserver(mutations=>{
  if(mutations.some(m=>!m.target.closest?.('#videoHelpModal')&&
   (m.addedNodes.length||m.removedNodes.length)))schedule();
 });
 observer.observe(document.body,{childList:true,subtree:true});
 root.addEventListener('pageshow',schedule);
}
root.VHSVideoHelpUI=Object.freeze({mount,open,close,scan,setVisible,resolve:content.resolve});
})(window);
