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
  const im=getOriginal(),w=110,h=90;
  const c=doc.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');
  if(im){
   const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;
   const scl=Math.min(w/iw,h/ih),sw=iw*scl,sh=ih*scl;
   ctx.fillStyle='#343f44';ctx.fillRect(0,0,w,h);
   ctx.drawImage(im,(w-sw)/2,(h-sh)/2,sw,sh);
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
 const inscription=section('ПОДПИСЬ НА НИЖНЕМ ПОЛЕ');
 const note=doc.createElement('input');note.type='text';note.maxLength=90;
 note.id='polaroidNote';note.placeholder='Лето, 1997 · любимый момент';
 note.value=cfg.note;
 note.addEventListener('input',()=>{cfg.note=note.value;onChange();});
 inscription.append(note);
 inscription.append(text('p','Подпись имитирует запись на бумаге. Сама фотография не обрезается.','hint'));
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
  for(const key of ['strength','grain','frameSize','bottomHeight','paperWear']){
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
