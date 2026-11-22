/* VHS Photo Studio 1.2 — interactive Russian photo tools.
   Only the source image and exported image are used; no server API. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const X=root.VHSPhotoExtras;
const adjustGroups=[
 ['СВЕТ',[
  ['exposure','Экспозиция',-3,3,.05],
  ['brightness','Яркость',-100,100,1],
  ['contrast','Контраст',-100,100,1],
  ['highlights','Света',-100,100,1],
  ['shadows','Тени',-100,100,1],
  ['whites','Белые точки',-100,100,1],
  ['blacks','Чёрные точки',-100,100,1]]],
 ['ЦВЕТ',[
  ['temperature','Температура',-100,100,1],
  ['tint','Оттенок (зелёный / пурпурный)',-100,100,1],
  ['saturation','Насыщенность',-100,100,1],
  ['vibrance','Красочность',-100,100,1],
  ['hue','Сдвиг оттенка',-180,180,1]]],
 ['ДЕТАЛИ И АТМОСФЕРА',[
  ['clarity','Чёткость',-100,100,1],
  ['texture','Текстура',-100,100,1],
  ['dehaze','Удаление / добавление дымки',-100,100,1],
  ['sharpness','Резкость',0,100,1],
  ['denoise','Шумоподавление',0,100,1],
  ['fade','Выцветание',0,100,1],
  ['vignette','Виньетирование',-100,100,1]]]
];
const damageControls=[
 ['leak','Засветы'],['dust','Пыль'],['grain','Зерно'],
 ['scratches','Царапины'],['flicker','Изменение экспозиции'],['halation','Ореол света']
];
const camControls=[
 ['counter','Счётчик ленты'],
 ['modeInfo','SP / LP / EP'],['focus','AF / фокус'],['frame','Уголки видоискателя']
];
function control(id,title,value,min,max,step,change,tip){
 const wrap=document.createElement('label');wrap.className='photoFxControl';
 const head=document.createElement('span');head.className='photoFxHead';
 const label=document.createElement('span');label.textContent=title;
 const num=document.createElement('output');num.textContent=String(value);num.id='value-'+id;
 head.append(label,num);
 const helpButton=document.createElement('button');helpButton.type='button';
 helpButton.className='photoHelpMark';helpButton.textContent='?';
 helpButton.setAttribute('aria-label','Что делает '+title+'?');
 const note=document.createElement('small');note.className='extraHelpText';
 note.textContent=tip||('Регулирует параметр «'+title+'». При нулевом значении дополнительное влияние отключено.');
 helpButton.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();note.classList.toggle('expanded');
 });
 head.append(helpButton);wrap.append(head);
 const input=document.createElement('input');input.type='range';input.id=id;
 input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);
 input.addEventListener('input',()=>{
  const v=Number(input.value);num.textContent=String(v);change(v);
 });
 wrap.append(input,note);
 return wrap;
}
function optsHelp(name){
 const status=document.getElementById('extrasStatus');
 if(status)status.textContent='Переключатель «'+name+'» включает или выключает соответствующий эффект. Изменения не затрагивают исходное фото.';
}
function checkbox(id,name,checked,change){
 const wrap=document.createElement('label');wrap.className='photoFxSwitch';
 const span=document.createElement('span');span.textContent=name;
 const input=document.createElement('input');input.type='checkbox';input.id=id;input.checked=!!checked;
 input.addEventListener('change',()=>change(input.checked));
 const help=document.createElement('button');help.type='button';
 help.className='photoHelpMark';help.textContent='?';
 help.setAttribute('aria-label','Что делает '+name+'?');
 help.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  optsHelp(name);
 });
 wrap.append(span,help,input);return wrap;
}
function button(text,click,cls='btn mini'){
 const b=document.createElement('button');b.type='button';b.className=cls;
 b.textContent=text;b.addEventListener('click',click);return b;
}
function select(id,items,value,change){
 const s=document.createElement('select');s.id=id;
 for(const [v,title] of items){const opt=document.createElement('option');
  opt.value=v;opt.textContent=title;s.append(opt);}
 s.value=value;s.addEventListener('change',()=>change(s.value));return s;
}
function block(parent,title){
 const box=document.createElement('div');box.className='photoFxGroup';
 if(title){const heading=document.createElement('h3');heading.textContent=title;box.append(heading);}
 parent.append(box);return box;
}
function mount(opts){
 const {state,onChange,getOriginal,onSetSnapshot,onMaskChange}=opts;
 const extras=state.extras,notice=(msg)=>{if($('extrasStatus'))$('extrasStatus').textContent=msg;};
 const changed=()=>onChange();
 let currentTool='',painting=null,maskDirty=true,maskRendering=false;
 const markDirty=()=>{maskDirty=true;drawMaskEditor();};
 function reroll(){extras.glitch.seed=(crypto.getRandomValues(new Uint32Array(1))[0]);changed();}
 function cassetteSnapshot(){
  const copy=JSON.parse(JSON.stringify(state));
  return {vhsEnabled:copy.vhsEnabled,filmEnabled:copy.filmEnabled,
   master:copy.master,preset:copy.preset,fx:copy.fx,signal:copy.signal,
   film:copy.film,camera:copy.camera,edgeBurn:copy.edgeBurn,
   extras:{correction:copy.extras.correction,glitch:copy.extras.glitch,
    damage:copy.extras.damage,colorCopy:copy.extras.colorCopy}};
 }
 // Factory cassettes are stable presets, not a moving copy of whichever
 // cassette happens to be selected when the shelf redraws.
 const factoryBaseline=cassetteSnapshot();
 factoryBaseline.extras.glitch=X.defaults().glitch;
 factoryBaseline.extras.damage=X.defaults().damage;
 function applySnapshot(snapshot){
  const s=JSON.parse(JSON.stringify(snapshot));
  const current=extras.cassettes,selected=extras.selectedCassetteId,
   before=extras.beforeCassette,masks=extras.masks;
  onSetSnapshot(s);
  // Presets must not erase masks, saved cassettes or their undo snapshot.
  Object.assign(extras,X.hydrate(state.extras));
  extras.cassettes=current;extras.selectedCassetteId=selected;
  extras.beforeCassette=before;extras.masks=masks;
  changed();
 }
 // ── CORRECTION ───────────────────────────────────────────────
 const correction=$('panel-correction');
 const corrIntro=document.createElement('p');corrIntro.className='hint';
 corrIntro.textContent='Профессиональная неразрушающая коррекция: применяется до FILM и VHS. Нулевые значения оставляют изображение исходным.';
 correction.append(corrIntro);
 const corrButtons=document.createElement('div');corrButtons.className='photoFxActions';
 corrButtons.append(
  button('↻ Автокоррекция',()=>{
   const im=getOriginal();if(!im){notice('Сначала открой фотографию');return;}
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(im,0,0,128,128);const data=ctx.getImageData(0,0,128,128).data;
   const lum=[];for(let k=0;k<data.length;k+=4)lum.push(data[k]*.299+data[k+1]*.587+data[k+2]*.114);
   lum.sort((a,b)=>a-b);const mid=lum[Math.floor(lum.length*.5)];
   const low=lum[Math.floor(lum.length*.06)],high=lum[Math.floor(lum.length*.94)];
   Object.assign(extras.correction,{
    exposure:Math.round(clamp(Math.log2(124/Math.max(20,mid)),-1,1)*20)/20,
    highlights:Math.round(clamp((210-high)*.45,-30,32)),
    shadows:Math.round(clamp((53-low)*.53,-20,42)),
    contrast:Math.round(clamp((167-(high-low))*.21,-20,20))
   });refreshCorrection();changed();
  }),
  button('✕ Сбросить коррекцию',()=>{
   Object.assign(extras.correction,X.defaults().correction);refreshCorrection();changed();
  })
 );
 correction.append(corrButtons);
 const corrRanges=[];
 for(const [title,defs] of adjustGroups){
  const group=block(correction,title);
  for(const [id,label,min,max,step] of defs){
   const inputId='correction-'+id;
   const c=control(inputId,label,extras.correction[id],min,max,step,
    val=>{extras.correction[id]=val;changed();},
    id==='dehaze'?'Вправо — убрать дымку, влево — добавить туман.':
    id==='vibrance'?'В первую очередь усиливает менее насыщенные цвета.':'');
   group.append(c);corrRanges.push([id,inputId]);
  }
 }
 function refreshCorrection(){for(const [k,id] of corrRanges){
  if(!$(id))continue;$(id).value=extras.correction[k];
  $('value-'+id).textContent=extras.correction[k];
 }}
 // ── GLITCH & DIGITAL CAMERA MODES ─────────────────────────────
 const glitch=$('panel-glitch');
 glitch.append(checkbox('extraGlitchEnabled','Включить дополнительные глитчи',extras.glitch.enabled,
  v=>{extras.glitch.enabled=v;changed();}));
 const mode=block(glitch,'ТИП УСТРОЙСТВА');
 const modeItems=[['vhs','VHS / обычная кассета'],['minidv','MiniDV / камера 2000-х'],
  ['crt','CRT / старый телевизор'],['night','Night Vision / ночная камера']];
 mode.append(select('extraCameraMode',modeItems,extras.glitch.mode,
  v=>{extras.glitch.mode=v;extras.glitch.enabled=true;$('extraGlitchEnabled').checked=true;changed();}));
 mode.append(control('extraModeStrength','Сила режима камеры',extras.glitch.modeStrength,0,100,1,
  v=>{extras.glitch.modeStrength=v;extras.glitch.enabled=true;changed();}));
 const gh=block(glitch,'АНАЛОГОВЫЕ И ЦИФРОВЫЕ ПОВРЕЖДЕНИЯ');
 for(const [id,name] of X.effects){
  gh.append(control('extraGlitch-'+id,name,extras.glitch.effects[id],0,100,1,
   v=>{extras.glitch.effects[id]=v;extras.glitch.enabled=true;
    $('extraGlitchEnabled').checked=true;changed();}));
 }
 const tools=block(glitch,'СЛОИ И СЛУЧАЙНЫЕ ПОВРЕЖДЕНИЯ');
 const layerPicker=select('photoGlitchLayerKind',X.effects,'tapeChew',()=>{});
 const layerStrength=control('photoGlitchLayerStrength','Сила нового слоя',75,0,100,1,v=>{});
 const layerList=document.createElement('div');layerList.id='photoGlitchLayers';
 tools.append(layerPicker,layerStrength,
  button('＋ Добавить слой',()=>{
   extras.glitch.layers.push({id:Date.now()+'-'+Math.round(Math.random()*1000),
    effect:layerPicker.value,strength:Number($('photoGlitchLayerStrength').value),enabled:true});
   extras.glitch.enabled=true;$('extraGlitchEnabled').checked=true;renderLayers();changed();
  },'btn primary full'),
  button('🎲 Случайное повреждение',()=>{
   const defs=X.effects;
   layerPicker.value=defs[Math.floor(Math.random()*defs.length)][0];
   extras.glitch.layers.push({id:Date.now()+'-'+Math.random(),effect:layerPicker.value,
    strength:40+Math.floor(Math.random()*50),enabled:true});
   extras.glitch.enabled=true;$('extraGlitchEnabled').checked=true;renderLayers();reroll();
  },'btn full'),
  button('↻ Перемешать все помехи',reroll,'btn full'),layerList);
 function renderLayers(){
  layerList.replaceChildren();
  for(const layer of extras.glitch.layers){
   const row=document.createElement('div');row.className='photoFxLayer';
   row.append(checkbox('layer-'+layer.id,
    X.effects.find(([id])=>id===layer.effect)?.[1]||layer.effect,
    layer.enabled!==false,v=>{layer.enabled=v;changed();}));
   row.append(control('layerStrength-'+layer.id,'Сила слоя',
    clamp(layer.strength,0,100),0,100,1,v=>{
     layer.strength=v;changed();
    }));
   row.append(button('✕',()=>{
    extras.glitch.layers=extras.glitch.layers.filter(x=>x!==layer);
    renderLayers();changed();
   }));
   layerList.append(row);
  }
  if(!extras.glitch.layers.length)layerList.textContent='Слои ещё не добавлены.';
 }
 renderLayers();
 const filmFx=block(glitch,'ДЕФЕКТЫ КИНОПЛЁНКИ');
 filmFx.append(checkbox('photoDamageEnabled','Включить FILM DAMAGE',
  extras.damage.enabled,v=>{extras.damage.enabled=v;changed();}));
 filmFx.append(select('photoDamageType',[
  ['edge-left','Засвет слева'],['edge-right','Засвет справа'],
  ['both','Засвет с двух сторон'],['first','Засвет первого кадра'],
  ['random','Случайные засветы']],extras.damage.type,
  v=>{extras.damage.type=v;changed();}));
 for(const [id,title] of damageControls)
  filmFx.append(control('photoDamage-'+id,title,extras.damage[id],0,100,1,
   v=>{extras.damage[id]=v;extras.damage.enabled=true;
    $('photoDamageEnabled').checked=true;changed();}));
 filmFx.append(button('↻ Новые дефекты плёнки',()=>{
  extras.damage.seed=(crypto.getRandomValues(new Uint32Array(1))[0]);changed();
 },'btn full'));
 // ── FILM: COPY IMAGE COLORS ───────────────────────────────────
 const colorCopy=block($('panel-film'),'ПЕРЕНЕСТИ ЦВЕТ ИЗ ДРУГОГО ФОТО');
 const colorHint=document.createElement('p');colorHint.className='hint';
 colorHint.textContent='Переносит палитру и общий контраст референса, не заменяя людей и объекты.';
 colorCopy.append(colorHint);
 colorCopy.append(checkbox('photoColorCopyEnabled','Применять цветовую палитру',
  extras.colorCopy.enabled,v=>{extras.colorCopy.enabled=v;changed();}));
 const fileLabel=document.createElement('label');fileLabel.className='btn mini full';
 fileLabel.textContent='＋ Выбрать фото-референс';
 const file=document.createElement('input');file.type='file';file.accept='image/*';file.hidden=true;
 fileLabel.append(file);colorCopy.append(fileLabel);
 const matchStatus=document.createElement('p');matchStatus.className='hint';
 matchStatus.textContent=extras.colorCopy.target?'Цветовой референс загружен.':'Референс не выбран.';
 colorCopy.append(matchStatus);
 file.addEventListener('change',async()=>{
  const f=file.files?.[0];file.value='';if(!f)return;
  const url=URL.createObjectURL(f);
  try{
   const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(Error('Не удалось открыть фото'));img.src=url;});
   const can=document.createElement('canvas');const scale=Math.min(1,320/Math.max(img.naturalWidth,img.naturalHeight));
   can.width=Math.max(2,Math.floor(img.naturalWidth*scale));
   can.height=Math.max(2,Math.floor(img.naturalHeight*scale));
   const ctx=can.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,can.width,can.height);
   extras.colorCopy.target=X.palette(ctx.getImageData(0,0,can.width,can.height).data,can.width,can.height);
   extras.colorCopy.enabled=true;$('photoColorCopyEnabled').checked=true;
   matchStatus.textContent='Цвет взят из '+f.name;changed();
  }catch(e){matchStatus.textContent='Ошибка: '+e.message;}
  finally{URL.revokeObjectURL(url);}
 });
 colorCopy.append(control('photoColorCopyStrength','Сила переноса цвета',extras.colorCopy.strength,0,100,1,
  v=>{extras.colorCopy.strength=v;changed();}));
 colorCopy.append(button('✕ Отключить референс',()=>{
  extras.colorCopy.target=null;extras.colorCopy.enabled=false;
  $('photoColorCopyEnabled').checked=false;matchStatus.textContent='Референс не выбран.';changed();
 },'btn full'));
 // ── VIDEO CASSETTE LIBRARY ────────────────────────────────────
 const cassette=$('panel-cassettes');
 const shelf=document.createElement('div');shelf.className='photoCassetteShelf';cassette.append(shelf);
 const cassRow=document.createElement('div');cassRow.className='photoFxGroup';
 const cassetteInput=document.createElement('input');cassetteInput.id='photoCassetteName';
 cassetteInput.type='text';cassetteInput.maxLength=50;
 cassetteInput.placeholder='Название собственной кассеты';
 const savedStatus=document.createElement('p');savedStatus.className='hint';
 cassRow.append(cassetteInput,
  button('＋ Сохранить текущий стиль',()=>{
   const name=cassetteInput.value.trim();if(!name)return notice('Введите название кассеты.');
   if(extras.cassettes.length>=60)return notice('Можно сохранить не больше 60 кассет.');
   const item={id:'personal-'+Date.now(),name,settings:cassetteSnapshot()};
   extras.cassettes.push(item);cassetteInput.value='';renderCassetteShelf();
   changed();notice('Сохранена кассета «'+name+'».');
  },'btn primary full'),
  button('✕ Снять кассету',()=>{
   if(extras.beforeCassette)applySnapshot(extras.beforeCassette);
   extras.selectedCassetteId=null;extras.beforeCassette=null;renderCassetteShelf();changed();
   notice('Кассета снята, прежние настройки восстановлены.');
  },'btn full'));
 cassette.append(cassRow);
 const imported=document.createElement('label');imported.className='btn full';
 imported.textContent='↑ Импорт кассет JSON';
 const fileCass=document.createElement('input');fileCass.type='file';fileCass.accept='.json';fileCass.hidden=true;
 imported.append(fileCass);
 cassette.append(imported);
 fileCass.addEventListener('change',async()=>{
  const f=fileCass.files?.[0];fileCass.value='';if(!f)return;
  try{
   if(f.size>400000)throw Error('Архив слишком большой');
   const payload=JSON.parse(await f.text());
   if(payload.kind!=='VHS_PHOTO_CASSETTES'||!Array.isArray(payload.cassettes))
    throw Error('Неверный формат архива кассет');
   for(const item of payload.cassettes.slice(0,60))
    if(item?.id&&item?.name&&item?.settings&&
      !extras.cassettes.some(v=>v.id===item.id)&&extras.cassettes.length<60)
     extras.cassettes.push(item);
   renderCassetteShelf();changed();notice('Кассеты импортированы.');
  }catch(err){notice('Ошибка: '+err.message);}
 });
 cassette.append(button('↓ Экспорт кассет JSON',()=>{
  const bytes=new Blob([JSON.stringify({kind:'VHS_PHOTO_CASSETTES',version:1,cassettes:extras.cassettes})],{type:'application/json'});
  opts.saveFile(bytes,'VHS_PHOTO_CASSETTES.json');
 },'btn full'));
 const morph=block(cassette,'ПЕРЕТЕКАНИЕ МЕЖДУ КАССЕТАМИ');
 const aSelect=select('photoMorphA',[],'',()=>{}),bSelect=select('photoMorphB',[],'',()=>{});
 morph.append(aSelect,bSelect,control('photoMorphT','Смешивание кассет',0,0,100,1,()=>{}));
 morph.append(button('✓ Применить смешивание',()=>{
  const all=getCassettes();const a=all.find(x=>x.id===aSelect.value),b=all.find(x=>x.id===bSelect.value);
  if(!a||!b)return notice('Нужно выбрать две кассеты.');
  if(!extras.beforeCassette)extras.beforeCassette=cassetteSnapshot();
  applySnapshot(X.mix(a.settings,b.settings,Number($('photoMorphT').value)/100));
  extras.selectedCassetteId=null;renderCassetteShelf();
 },'btn primary full'));
 const aging=block(cassette,'СТАРЕНИЕ ВИДЕОКАССЕТЫ');
 aging.append(control('photoCassetteAging','Износ: от новой до уничтоженной',extras.glitch.aging,0,100,1,
  v=>{extras.glitch.aging=v;extras.glitch.enabled=true;changed();}));
 aging.append(checkbox('photoBatchAging','Постепенно усиливать износ в BATCH',extras.batchAging,
  v=>{extras.batchAging=v;changed();}));
 function getCassettes(){
  return [...X.factory.map(f=>({id:'factory-'+f.id,name:f.name,factory:true,
   settings:(()=>{
    const s=JSON.parse(JSON.stringify(factoryBaseline));s.vhsEnabled=true;s.master=f.master;
    s.extras.glitch.enabled=true;s.extras.glitch.mode=f.mode;
    s.extras.glitch.aging=f.aging;return s;
   })()})),...extras.cassettes];
 }
 function renderCassetteShelf(){
  shelf.replaceChildren();
  const all=getCassettes();
  for(const item of all){
   const card=document.createElement('div');card.className='photoCassetteCard';
   card.append(button('▣ '+item.name,()=>{
    if(extras.selectedCassetteId===item.id){
     if(extras.beforeCassette)applySnapshot(extras.beforeCassette);
     extras.selectedCassetteId=null;extras.beforeCassette=null;
    }else{
     if(!extras.beforeCassette)extras.beforeCassette=cassetteSnapshot();
     applySnapshot(item.settings);extras.selectedCassetteId=item.id;
    }
    renderCassetteShelf();changed();
   },'btn '+(extras.selectedCassetteId===item.id?'primary':'mini')));
   if(!item.factory)card.append(button('✕',()=>{
    extras.cassettes=extras.cassettes.filter(x=>x.id!==item.id);
    if(extras.selectedCassetteId===item.id)extras.selectedCassetteId=null;
    renderCassetteShelf();changed();
   }));
   shelf.append(card);
  }
  aSelect.replaceChildren();bSelect.replaceChildren();
  for(const item of all){
   for(const el of [aSelect,bSelect]){
    const o=document.createElement('option');o.value=item.id;o.textContent=item.name;el.append(o);
   }
  }
  if(all.length>1)bSelect.value=all[1].id;
 }
 renderCassetteShelf();
 // ── LOCAL MASKS / FINGER PAINTING ─────────────────────────────
 const maskPanel=$('panel-masks');
 const maskStage=document.createElement('div');maskStage.className='photoMaskStage';maskStage.id='photoMaskStage';
 const base=document.createElement('canvas'),overlay=document.createElement('canvas');
 base.id='photoMaskBase';overlay.id='photoMaskOverlay';
 maskStage.append(base,overlay);maskPanel.append(maskStage);
 const status=document.createElement('p');status.className='hint';status.id='photoMaskStatus';
 status.textContent='Загрузи фотографию, затем рисуй пальцем по кадру в этом разделе.';
 maskPanel.append(status);
 const maskTabs=document.createElement('div');maskTabs.className='photoFxActions';
 const brush=button('✎ Рисовать',()=>toggleTool('brush'),'btn mini');
 const mark=button('▤ Обвести лицо',()=>toggleTool('face'),'btn mini');
 maskTabs.append(brush,mark);maskPanel.append(maskTabs);
 function toggleTool(next){
  if(!getOriginal()){status.textContent='Сначала открой фотографию.';return;}
  currentTool=currentTool===next?'':next;
  maskStage.classList.toggle('drawing',!!currentTool);
  brush.classList.toggle('primary',currentTool==='brush');
  mark.classList.toggle('primary',currentTool==='face');
  status.textContent=currentTool==='brush'?'Води пальцем по фотографии — сохраняется после отпускания.':
   currentTool==='face'?'Обведи лицо прямоугольником прямо по фото.':
   'Рисование выключено.';
  markDirty();
  if(currentTool)maskStage.scrollIntoView({behavior:'smooth',block:'center'});
 }
 const maskGroup=block(maskPanel,'КИСТЬ / МАСКИ');
 maskGroup.append(checkbox('photoMaskEnabled','Применять маски',extras.masks.enabled,
  v=>{extras.masks.enabled=v;changed();markDirty();}));
 maskGroup.append(select('photoMaskBrush',[['pixel','Пикселизация'],['blur','Размытие']],
  extras.masks.brush,v=>{extras.masks.brush=v;changed();}));
 maskGroup.append(control('photoMaskRadius','Размер кисти',extras.masks.radius,4,100,1,
  v=>{extras.masks.radius=v;changed();}));
 maskGroup.append(control('photoMaskStrength','Сила кисти',extras.masks.strength,5,100,1,
  v=>{extras.masks.strength=v;changed();}));
 maskGroup.append(select('photoMaskFaceStyle',[['pixel','Пиксельные лица'],
  ['blur','Размытые лица']],extras.masks.style,v=>{extras.masks.style=v;changed();markDirty();}));
 maskGroup.append(control('photoFacePixel','Размер пикселей',extras.masks.faceSize,4,80,1,
  v=>{extras.masks.faceSize=v;changed();markDirty();}));
 maskGroup.append(control('photoFaceBlur','Сила размытия',extras.masks.faceBlur,3,60,1,
  v=>{extras.masks.faceBlur=v;changed();markDirty();}));
 maskGroup.append(select('photoMaskMode',[['all','Все обнаруженные и вручную выбранные лица'],
  ['auto','Только автоматически найденные'],['manual','Только нарисованные вручную']],
  extras.masks.mode,v=>{extras.masks.mode=v;changed();markDirty();}));
 maskPanel.append(button('◎ Найти все лица на фото',async()=>{
  const im=getOriginal();if(!im){status.textContent='Сначала открой фото.';return;}
  status.textContent='Загрузка модели распознавания лиц…';
  try{
   const engine=await root.VHSVideoFaceAI.create();
   status.textContent='Распознаю лица локально…';
   const faces=await engine.detect(im),w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;
   const manual=extras.masks.faces.filter(x=>!x.auto);
   const unique=[];
   for(const face of faces){
    const r=face.boundingBox||face;
    const x=clamp((r.x??r.originX)/w,0,1),y=clamp((r.y??r.originY)/h,0,1);
    const rect={x,y,w:clamp(r.width/w,0,1-x),h:clamp(r.height/h,0,1-y),auto:true};
    if(rect.w<.01||rect.h<.01)continue;
    if(unique.some(a=>Math.hypot(a.x-rect.x,a.y-rect.y)<.035))continue;
    unique.push(rect);
   }
   extras.masks.faces=[...manual,...unique].slice(0,16);extras.masks.enabled=true;
   $('photoMaskEnabled').checked=true;
   changed();markDirty();status.textContent='Найдено лиц: '+unique.length+'. Рамки можно дополнить вручную.';
  }catch(e){status.textContent='Автопоиск недоступен: '+e.message+'. Используй «Обвести лицо».';}
 },'btn primary full'));
 maskPanel.append(button('↶ Удалить последний мазок',()=>{
  extras.masks.strokes.pop();changed();markDirty();
 },'btn full'));
 maskPanel.append(button('✕ Очистить рисунки и лица',()=>{
  extras.masks.strokes=[];extras.masks.faces=[];
  changed();markDirty();status.textContent='Маски очищены.';
 },'btn full'));
 let trackTouch=false,activeId=null;
 function position(point){
  const r=maskStage.getBoundingClientRect();
  return [clamp((point.clientX-r.left)/Math.max(1,r.width),0,1),
   clamp((point.clientY-r.top)/Math.max(1,r.height),0,1)];
 }
 function begin(point){
  if(!currentTool||!getOriginal())return;
  const [x,y]=position(point);
  painting=currentTool==='brush'?{mode:extras.masks.brush,
   radius:extras.masks.radius,strength:extras.masks.strength,points:[[x,y]]}:
   {x,y,w:0,h:0,anchorX:x,anchorY:y};
  drawMaskEditor();
 }
 function move(point){
  if(!painting)return;const [x,y]=position(point);
  if(currentTool==='brush'){
   const prev=painting.points.at(-1);
   if(Math.hypot(prev[0]-x,prev[1]-y)>.004&&painting.points.length<400)
    painting.points.push([x,y]);
  }else{
   painting.x=Math.min(painting.anchorX,x);
   painting.y=Math.min(painting.anchorY,y);
   painting.w=Math.abs(painting.anchorX-x);
   painting.h=Math.abs(painting.anchorY-y);
  }
  drawMaskEditor();
 }
 function end(){
  if(!painting)return;
  if(currentTool==='brush'&&painting.points.length)
   extras.masks.strokes.push(painting);
  else if(currentTool==='face'&&painting.w>.016&&painting.h>.016)
   extras.masks.faces.push({...painting,auto:false});
  extras.masks.strokes=extras.masks.strokes.slice(-140);
  extras.masks.faces=extras.masks.faces.slice(-16);
  painting=null;maskDirty=true;changed();drawMaskEditor();
  status.textContent='Сохранено. Изменение видно в основном фото и экспорте.';
 }
 maskStage.addEventListener('touchstart',e=>{
  if(!currentTool||e.touches.length!==1)return;
  e.preventDefault();e.stopPropagation();trackTouch=true;begin(e.changedTouches[0]);
 },{passive:false});
 maskStage.addEventListener('touchmove',e=>{
  if(!trackTouch)return;e.preventDefault();e.stopPropagation();
  move(e.changedTouches[0]);
 },{passive:false});
 maskStage.addEventListener('touchend',e=>{
  if(!trackTouch)return;e.preventDefault();e.stopPropagation();
  if(e.changedTouches.length)move(e.changedTouches[0]);
  trackTouch=false;end();
 },{passive:false});
 maskStage.addEventListener('touchcancel',e=>{
  if(!trackTouch)return;e.preventDefault();trackTouch=false;end();
 },{passive:false});
 maskStage.addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'||e.button>0||!currentTool)return;
  e.preventDefault();activeId=e.pointerId;begin(e);
  try{maskStage.setPointerCapture(e.pointerId);}catch{}
 });
 maskStage.addEventListener('pointermove',e=>{
  if(activeId!==e.pointerId)return;e.preventDefault();move(e);
 });
 for(const type of ['pointerup','pointercancel'])
  maskStage.addEventListener(type,e=>{
   if(e.pointerType==='touch'||activeId!==e.pointerId)return;
   e.preventDefault();move(e);activeId=null;end();
  });
 maskStage.addEventListener('lostpointercapture',e=>{
  if(activeId===e.pointerId){activeId=null;end();}
 });
 function drawMaskEditor(){
  if(maskRendering||!getOriginal()||!$('panel-masks').classList.contains('active'))return;
  maskRendering=true;
  try{
   const im=getOriginal(),w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;
   const width=Math.min(660,w),height=Math.max(2,Math.round(width*h/w));
   if(base.width!==width)base.width=width;if(base.height!==height)base.height=height;
   if(overlay.width!==width)overlay.width=width;if(overlay.height!==height)overlay.height=height;
   const ctx=base.getContext('2d');
   if(maskDirty){
    ctx.clearRect(0,0,width,height);ctx.drawImage(im,0,0,width,height);
    X.masks(base,extras.masks);maskDirty=false;
   }
   const pen=overlay.getContext('2d');pen.clearRect(0,0,width,height);
   pen.strokeStyle='#ffbc70';pen.lineWidth=Math.max(2,width/250);
   pen.setLineDash([6,4]);
   if(painting){
    if(currentTool==='brush'){
     pen.beginPath();painting.points.forEach(([x,y],i)=>{
      if(i)pen.lineTo(x*width,y*height);else pen.moveTo(x*width,y*height);
     });
     pen.stroke();
     if(painting.points.length===1){
      pen.beginPath();pen.arc(painting.points[0][0]*width,painting.points[0][1]*height,5,0,Math.PI*2);pen.stroke();
     }
    }else pen.strokeRect(painting.x*width,painting.y*height,
     painting.w*width,painting.h*height);
   }
   pen.setLineDash([]);pen.strokeStyle='#76e6ac';
   for(const face of extras.masks.faces)pen.strokeRect(face.x*width,face.y*height,face.w*width,face.h*height);
  }finally{maskRendering=false;}
 }
 // ── EXPANDED CAMERA OSD (never add ZOOM) ───────────────────────
 const camera=block($('panel-camera'),'ДОПОЛНИТЕЛЬНЫЕ ИНДИКАТОРЫ');
 const cameraMore=state.extraCamera||
  (state.extraCamera={counter:false,modeInfo:false,focus:false,frame:false});
 cameraMore.positions=cameraMore.positions||{};
 cameraMore.sizes=cameraMore.sizes||{};
 const placement=[['left-top','Слева сверху'],['center-top','По центру сверху'],
  ['right-top','Справа сверху'],['left-bottom','Слева снизу'],
  ['center-bottom','По центру снизу'],['right-bottom','Справа снизу']];
 for(const [id,title] of camControls){
  const group=block(camera,title);
  group.append(checkbox('photoCamera-'+id,'Включить '+title,!!cameraMore[id],
   v=>{cameraMore[id]=v;changed();}));
  if(id!=='frame'){
   group.append(select('photoCameraPosition-'+id,placement,
    cameraMore.positions[id]||(id==='counter'?'center-bottom':id==='modeInfo'?'center-top':'right-top'),
    v=>{cameraMore.positions[id]=v;changed();}));
   group.append(control('photoCameraSize-'+id,'Размер',cameraMore.sizes[id]||100,60,240,1,
    v=>{cameraMore.sizes[id]=v;changed();}));
  }else{
   group.append(control('photoCameraFrameSize','Размер уголков',
    cameraMore.frameSize||100,60,160,1,
    v=>{cameraMore.frameSize=v;changed();}));
  }
 }
 // ── BATCH AGING AND HELP TOGGLE ───────────────────────────────
 const batch=$('panel-batch');
 batch.append(checkbox('batchProgressiveAging','Усиливать старение от первого фото к последнему',
  extras.batchAging,v=>{extras.batchAging=v;changed();}));
 const helpButton=$('photoHelpToggle');
 const syncHelp=()=>{
  document.body.classList.toggle('photoHelpVisible',extras.showHelp);
  helpButton.textContent=extras.showHelp?'? Скрыть объяснения':'? Показать объяснения';
 };
 helpButton.onclick=()=>{extras.showHelp=!extras.showHelp;syncHelp();changed();};
 syncHelp();
 function refresh(){
  refreshCorrection();renderLayers();renderCassetteShelf();
  for(const [id] of X.effects){
   const e=$('extraGlitch-'+id);
   if(e){e.value=extras.glitch.effects[id];$('value-extraGlitch-'+id).textContent=extras.glitch.effects[id];}
  }
  for(const [id] of damageControls){
   const e=$('photoDamage-'+id);
   if(e){e.value=extras.damage[id];$('value-photoDamage-'+id).textContent=extras.damage[id];}
  }
  for(const [id,value] of [
   ['extraModeStrength',extras.glitch.modeStrength],['photoCassetteAging',extras.glitch.aging],
   ['photoColorCopyStrength',extras.colorCopy.strength]]){
   if($(id)){$(id).value=value;$('value-'+id).textContent=value;}
  }
  for(const [id,value] of [
   ['extraGlitchEnabled',extras.glitch.enabled],['photoDamageEnabled',extras.damage.enabled],
   ['photoColorCopyEnabled',extras.colorCopy.enabled],
   ['photoMaskEnabled',extras.masks.enabled],['photoBatchAging',extras.batchAging],
   ['batchProgressiveAging',extras.batchAging]]){
   if($(id))$(id).checked=!!value;
  }
  if($('extraCameraMode'))$('extraCameraMode').value=extras.glitch.mode;
  for(const [id] of camControls){
   if($('photoCamera-'+id))$('photoCamera-'+id).checked=!!state.extraCamera[id];
  }
  markDirty();
 }
 return Object.freeze({refresh,drawMaskEditor,markDirty,reroll,notice});
}
root.VHSPhotoExtrasUI=Object.freeze({mount,adjustGroups});
})(window);
