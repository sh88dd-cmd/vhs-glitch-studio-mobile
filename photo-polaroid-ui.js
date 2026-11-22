/* Fully local Russian UI for physically textured instant photographs. */
(function(root){
'use strict';
const P=root.VHSPhotoPolaroid,doc=document;
const $=id=>doc.getElementById(id);
function mount({state,getOriginal,onChange}){
 const cfg=state.extras.polaroid;
 const panel=$('panel-polaroid');
 const text=(tag,content,cls)=>{const e=doc.createElement(tag);
  e.textContent=content;if(cls)e.className=cls;return e;};
 const section=(name)=>{
  const wrap=doc.createElement('div');wrap.className='photoFxGroup';
  if(name)wrap.append(text('h3',name));panel.append(wrap);return wrap;
 };
 const slider=(parent,key,label,min,max,step=1)=>{
  const wrap=doc.createElement('label');wrap.className='photoFxControl';
  const row=doc.createElement('span');row.className='photoFxHead';
  const val=text('output',String(cfg[key]));val.id='polaroid-value-'+key;
  row.append(text('span',label),val);wrap.append(row);
  const input=doc.createElement('input');input.type='range';
  input.id='polaroid-'+key;input.min=String(min);input.max=String(max);
  input.step=String(step);input.value=String(cfg[key]);
  input.oninput=()=>{cfg[key]=Number(input.value);val.textContent=input.value;onChange();};
  wrap.append(input);parent.append(wrap);
 };
 const selected=section('МОМЕНТАЛЬНАЯ ФОТОГРАФИЯ');
 const enable=doc.createElement('label');enable.className='photoFxSwitch';
 const enabled=doc.createElement('input');enabled.type='checkbox';
 enabled.id='polaroidEnabled';enabled.checked=!!cfg.enabled;
 enabled.onchange=()=>{cfg.enabled=enabled.checked;onChange();renderStyles();};
 enable.append(text('span','Включить Polaroid'),enabled);selected.append(enable);
 selected.append(text('p','Полная фотография остаётся внутри рамки. Бумага, нижнее поле и тени подстраиваются под размер и ориентацию кадра.','hint'));
 const styles=doc.createElement('div');styles.className='polaroidGrid';
 selected.append(styles);
 const styleButtons=[];
 function sample(){
  const im=getOriginal(),maxSide=108;
  const iw=im?(im.naturalWidth||im.width):110;
  const ih=im?(im.naturalHeight||im.height):90;
  const scl=Math.min(1,maxSide/Math.max(1,iw,ih));
  const w=Math.max(10,Math.round(iw*scl)),h=Math.max(10,Math.round(ih*scl));
  const c=doc.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');
  if(im){
   // Thumbnail previews must keep the original orientation too:
   // no black sidebars or 110x90 fake image windows.
   ctx.drawImage(im,0,0,w,h);
  }else{
   const gradient=ctx.createLinearGradient(0,0,w,h);
   gradient.addColorStop(0,'#b2c0b7');gradient.addColorStop(.5,'#7b948d');
   gradient.addColorStop(1,'#b19b85');
   ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
   ctx.fillStyle='#e8cdb5';ctx.beginPath();ctx.arc(w*.55,h*.42,h*.17,0,Math.PI*2);ctx.fill();
  }
  return c;
 }
 function renderStyles(){
  styles.replaceChildren();styleButtons.length=0;
  const src=sample();
  for(const style of P.styles){
   const b=doc.createElement('button');b.type='button';
   b.className='polaroidChoice'+(cfg.style===style.id?' selected':'');
   b.setAttribute('aria-pressed',String(cfg.style===style.id));
   const preview=P.render(src,{...cfg,style:style.id,enabled:true,
    note:'',frameSize:100,bottomHeight:100,background:'studio',
    paperWear:cfg.paperWear},200000);
   preview.className='polaroidThumb';b.append(preview,text('span',style.name));
   b.onclick=()=>{cfg.style=style.id;cfg.enabled=true;enabled.checked=true;
    onChange();renderStyles();};
   styles.append(b);styleButtons.push(b);
  }
 }
 renderStyles();
 const film=section('ХАРАКТЕР МОМЕНТАЛЬНОЙ ПЛЁНКИ');
 const preset=doc.createElement('select');preset.id='polaroidLook';
 for(const look of P.looks){const opt=doc.createElement('option');
  opt.value=look.id;opt.textContent=look.name;preset.append(opt);}
 preset.value=cfg.look;preset.onchange=()=>{cfg.look=preset.value;onChange();};
 film.append(text('label','Цвет и характер эмульсии'),preset);
 slider(film,'strength','Сила цветового эффекта',0,100);
 slider(film,'grain','Зернистость эмульсии',0,100);
 const paper=section('БУМАГА И ФОРМА РАМКИ');
 slider(paper,'frameSize','Толщина боковых полей',45,165);
 slider(paper,'bottomHeight','Высота нижнего поля',60,160);
 slider(paper,'paperWear','Фактура и степень состаривания бумаги',0,100);
 const surface=doc.createElement('select');surface.id='polaroidSurface';
 for(const [id,name] of [['matte','Матовая бумага'],['glossy','Глянцевая плёнка']]){
  const opt=doc.createElement('option');opt.value=id;opt.textContent=name;surface.append(opt);
 }
 surface.value=cfg.surface;surface.onchange=()=>{cfg.surface=surface.value;onChange();};
 paper.append(text('label','Поверхность'),surface);
 const background=doc.createElement('select');background.id='polaroidBackground';
 for(const [id,name] of [
  ['studio','Реалистичная поверхность с тенью'],
  ['white','Белый фон'],
  ['dark','Тёмный фон'],
  ['transparent','Прозрачный фон (для PNG)']
 ]){
  const opt=doc.createElement('option');opt.value=id;opt.textContent=name;background.append(opt);
 }
 background.value=cfg.background;
 background.onchange=()=>{cfg.background=background.value;onChange();};
 paper.append(text('label','Фон за отпечатком'),background);
 paper.append(text('p','Прозрачность сохранится только при выборе формата PNG в настройках экспорта. На JPEG фон будет белым.','hint'));
 const inscription=section('ЖИВАЯ РУКОПИСНАЯ ПОДПИСЬ');
 inscription.append(text('p','До 5 строк. Шрифт поддерживает русский текст. Нажми «↻ Новый почерк и положение», чтобы получить новую натуральную посадку надписи на нижнем поле.','hint'));
 const note=doc.createElement('textarea');note.rows=5;note.maxLength=360;
 note.id='polaroidNote';note.placeholder='Лето 1997\nНаш первый день\nУ самого моря';
 note.value=cfg.note;
 note.addEventListener('input',()=>{
  const parts=note.value.replace(/\r\n?/g,'\n').split('\n');
  if(parts.length>5){
   const cursor=note.selectionStart;
   note.value=parts.slice(0,5).join('\n');
   note.selectionStart=note.selectionEnd=Math.min(cursor,note.value.length);
  }
  cfg.note=note.value;onChange();
 });
 inscription.append(text('label','Текст подписи (Enter — новая строка)'),note);
 const fontSelect=doc.createElement('select');fontSelect.id='polaroidNoteFont';
 const randomFont=doc.createElement('option');randomFont.value='random';
 randomFont.textContent='🎲 Случайный рукописный шрифт';fontSelect.append(randomFont);
 for(const item of P.handFonts){
  const el=doc.createElement('option');el.value=item.id;el.textContent=item.name;
  fontSelect.append(el);
 }
 fontSelect.value=cfg.noteFont;
 fontSelect.addEventListener('change',()=>{cfg.noteFont=fontSelect.value;onChange();});
 inscription.append(text('label','Рукописный шрифт'),fontSelect);
 const inkSelect=doc.createElement('select');inkSelect.id='polaroidNoteInk';
 for(const item of P.inkTools){
  const el=doc.createElement('option');el.value=item.id;el.textContent=item.name;
  inkSelect.append(el);
 }
 inkSelect.value=cfg.noteInk;
 inkSelect.addEventListener('change',()=>{cfg.noteInk=inkSelect.value;onChange();});
 inscription.append(text('label','Чем написано'),inkSelect);
 slider(inscription,'noteSize','Размер почерка',40,180);
 const randomPlacement=doc.createElement('button');
 randomPlacement.type='button';randomPlacement.className='btn primary full';
 randomPlacement.id='polaroidRerollHandwriting';
 randomPlacement.textContent='↻ Новый почерк и положение';
 randomPlacement.addEventListener('click',()=>{
  cfg.notePlacementSeed=crypto.getRandomValues(new Uint32Array(1))[0];
  // In random-font mode, a fresh click selects a different handwritten font.
  // Explicitly chosen fonts stay fixed, while angle, spacing and position vary.
  onChange();
 });
 inscription.append(randomPlacement);
 inscription.append(text('p','С каждым нажатием меняются наклон, положение, межстрочные интервалы и нажим ручки. Надпись остаётся внутри нижней бумажной части, не залезая на фото.','hint'));
 const refreshButton=doc.createElement('button');refreshButton.type='button';
 refreshButton.className='btn full';refreshButton.textContent='↻ Новая фактура бумаги';
 refreshButton.onclick=()=>{cfg.seed=crypto.getRandomValues(new Uint32Array(1))[0];onChange();renderStyles();};
 inscription.append(refreshButton);
 const reset=doc.createElement('button');reset.type='button';
 reset.className='btn full';reset.textContent='✕ Сбросить Polaroid';
 reset.onclick=()=>{
  Object.assign(cfg,P.defaults());refresh();onChange();
 };
 panel.append(reset);
 function refresh(){
  enabled.checked=!!cfg.enabled;preset.value=cfg.look;
  surface.value=cfg.surface;background.value=cfg.background;note.value=cfg.note;
  fontSelect.value=cfg.noteFont;inkSelect.value=cfg.noteInk;
  for(const key of ['strength','grain','frameSize','bottomHeight','paperWear','noteSize']){
   const input=$('polaroid-'+key),out=$('polaroid-value-'+key);
   if(input)input.value=String(cfg[key]);
   if(out)out.textContent=String(cfg[key]);
  }
  renderStyles();
 }
 return Object.freeze({refresh,renderStyles});
}
root.VHSPhotoPolaroidUI=Object.freeze({mount});
})(window);
