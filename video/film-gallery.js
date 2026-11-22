/* VHS Video Lab 0.9.2 — visual 3-column film library.
 * Uses the EXACT shared FilmCore recipes used by the photo and video editor.
 * Thumbnails are drawn from the user's current video frame when available,
 * otherwise a stable colorful demo scene. 24 thumbnails per page; asynchronous
 * batches prevent the UI from freezing when 1,200 XMP profiles are imported.
 * No external images, servers or dependencies.
 */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const PAGE_SIZE=24;
const tidy=v=>String(v||'').trim();
function family(profile){
 if(profile.type==='xmp'){
  const raw=tidy(profile.category);
  if(!raw||/^(emulsionpresets|imported|default|user|xmp)$/i.test(raw))
   return 'Мои XMP';
  return 'XMP · '+raw.slice(0,42);
 }
 const first=tidy(profile.name).split(/[\s—–:/]+/)[0];
 const lower=first.toLocaleLowerCase('ru');
 if(/^(fuji|fujifilm|superia|provia|velvia)$/.test(lower))return 'Fujifilm';
 if(/^(kodak|portra|ektar|gold|vision3)$/.test(lower))return 'Kodak';
 if(/^(ilford|delta|hp5|fp4)$/.test(lower))return 'Ilford';
 if(/^(agfa|agfacolor)$/.test(lower))return 'Agfa';
 if(/^(polaroid|instax)$/.test(lower))return 'Моментальная плёнка';
 return first||'Другие плёнки';
}
function makeSample(video){
 const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
 const cx=canvas.getContext('2d',{willReadFrequently:true});
 if(video&&video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0){
  try{
   const w=video.videoWidth,h=video.videoHeight,side=Math.min(w,h);
   cx.drawImage(video,(w-side)/2,(h-side)/2,side,side,0,0,96,96);
   return canvas;
  }catch(err){console.warn('Film thumbnail fallback:',err);}
 }
 // Same reference scene logic as Photo Film gallery. Neutral test colors
 // reveal whether a film is warm, cold, faded, vivid or monochrome.
 const gradient=cx.createLinearGradient(0,0,96,96);
 gradient.addColorStop(0,'#cf896d');gradient.addColorStop(.35,'#6c9c8d');
 gradient.addColorStop(.75,'#455e79');gradient.addColorStop(1,'#a8b97f');
 cx.fillStyle=gradient;cx.fillRect(0,0,96,96);
 cx.fillStyle='rgba(245,214,178,.74)';
 cx.beginPath();cx.arc(47,33,15,0,Math.PI*2);cx.fill();
 cx.fillStyle='rgba(42,46,40,.62)';cx.fillRect(15,56,65,29);
 return canvas;
}
function drawThumb(canvas,profile,sample,getRecipe){
 const cx=canvas.getContext('2d',{willReadFrequently:true});
 canvas.width=96;canvas.height=96;
 cx.drawImage(sample,0,0,96,96);
 const image=cx.getImageData(0,0,96,96);
 if(profile.type==='builtin'){
  const recipe=getRecipe(profile);
  if(recipe)root.VideoFilmCore.filmBuiltin(image.data,recipe,.95);
 }else if(profile.fields){
  root.VideoFilmCore.filmXMP(image.data,profile,.95);
 }
 cx.putImageData(image,0,0);
}
function mount({getProfiles,getSelected,getVideo,getRecipe,onSelect,getFavorites,onFavorite}){
 const grid=$('filmGallery'),categories=$('filmCategory'),
  chips=$('filmFamilyChips'),counter=$('filmGalleryCount'),
  prev=$('filmGalleryPrev'),next=$('filmGalleryNext'),
  label=$('filmGalleryPage'),search=$('filmSearch');
 let page=0,category='Все',serial=0;
 const visible=()=>document.getElementById('panel-film')?.classList.contains('active');
 function list(){
  const q=tidy(search.value).toLocaleLowerCase('ru');
  const favorites=getFavorites();
  return getProfiles().filter(p=>
   (category==='Все'||category==='Избранные'?(
    category!=='Избранные'||favorites.includes(p.id)):
    family(p)===category)&&
   (!q||p.name.toLocaleLowerCase('ru').includes(q)||
    family(p).toLocaleLowerCase('ru').includes(q)));
 }
 function setCategory(value){
  category=value;page=0;
  renderCategories();
  render();
 }
 function renderCategories(){
  const catalog=getProfiles(),count=new Map();
  for(const p of catalog)count.set(family(p),(count.get(family(p))||0)+1);
  const groups=[...count.entries()].sort((a,b)=>
   a[0].localeCompare(b[0],'ru'));
  // Keep category selectors stable while typing, otherwise iPhone Safari
  // closes the native select or loses the user's selected category.
  categories.replaceChildren();
  for(const [name,count] of [['Все',catalog.length],
   ['Избранные',getFavorites().length],...groups]){
   const opt=new Option(name==='Все'?'Все категории ('+count+')':
    name+' ('+count+')',name);
   categories.add(opt);
  }
  if(![...categories.options].some(x=>x.value===category))category='Все';
  categories.value=category;
  chips.replaceChildren();
  for(const [name,n] of [['Все',catalog.length],
   ['Избранные',getFavorites().length],...groups]){
   const button=document.createElement('button');
   button.type='button';button.className='filmFamilyChip';
   if(name===category)button.classList.add('active');
   button.textContent=name==='Все'?'Все':name==='Избранные'?'★ Избранные':name;
   button.title=name+' · '+n+' профилей';
   button.setAttribute('aria-pressed',String(name===category));
   button.addEventListener('click',()=>setCategory(name));
   chips.append(button);
  }
 }
 function markSelection(){
  const selected=getSelected();
  for(const button of grid.querySelectorAll('button[data-film-id]')){
   const on=button.dataset.filmId===selected;
   button.classList.toggle('selected',on);
   button.setAttribute('aria-pressed',String(on));
  }
 }
 function render(){
  if(!visible())return;
  serial++;const current=serial;
  grid.replaceChildren();
  const all=list(),pages=Math.max(1,Math.ceil(all.length/PAGE_SIZE));
  page=Math.min(page,pages-1);
  const items=all.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const favorites=getFavorites();
  counter.textContent=all.length+' профилей · '+pages+' страниц · '+getProfiles().length+' всего';
  label.textContent=(page+1)+' / '+pages;
  prev.disabled=page===0;next.disabled=page>=pages-1;
  if(items.length===0){
   const empty=document.createElement('p');empty.className='hint';
   empty.textContent='Ничего не найдено. Попробуй другую категорию или поисковый запрос.';
   grid.append(empty);return;
  }
  const sample=makeSample(getVideo());
  const drawList=[];
  let lastGroup=null;
  for(const profile of items){
   const group=family(profile);
   if(group!==lastGroup){
    const heading=document.createElement('h3');
    heading.className='filmGalleryGroup';
    heading.textContent=group;grid.append(heading);
    lastGroup=group;
   }
   const wrap=document.createElement('div');wrap.className='filmGalleryCard';
   const select=document.createElement('button');
   select.type='button';select.className='filmGalleryPick';
   select.dataset.filmId=profile.id;
   select.setAttribute('aria-pressed',String(profile.id===getSelected()));
   if(profile.id===getSelected())select.classList.add('selected');
   select.title=profile.name;
   const canvas=document.createElement('canvas');canvas.width=96;canvas.height=96;
   canvas.className='filmGalleryThumb';
   const name=document.createElement('span');name.textContent=profile.name.replace(/ — стиль$/,'');
   select.append(canvas,name);
   select.addEventListener('click',()=>{
    onSelect(profile.id);
    markSelection();
   });
   const star=document.createElement('button');
   star.type='button';star.className='filmGalleryStar';
   star.textContent=favorites.includes(profile.id)?'★':'☆';
   star.setAttribute('aria-label',star.textContent==='★'?'Убрать из избранного':'В избранное');
   star.setAttribute('aria-pressed',String(favorites.includes(profile.id)));
   star.title=star.textContent==='★'?'Убрать из избранного':'Добавить в избранное';
   star.addEventListener('click',()=>{
    onFavorite(profile.id);
    if(category==='Избранные')render();
    else{
     const isFavorite=getFavorites().includes(profile.id);
     star.textContent=isFavorite?'★':'☆';
     star.setAttribute('aria-pressed',String(isFavorite));
     renderCategories();
    }
   });
   wrap.append(select,star);grid.append(wrap);
   drawList.push([canvas,profile]);
  }
  // Yield between 3 thumbnails: tapping a selected film stays responsive.
  let index=0;
  function drawBatch(){
   if(serial!==current||!visible())return;
   for(let i=0;i<3&&index<drawList.length;i++,index++){
    const [canvas,profile]=drawList[index];
    try{drawThumb(canvas,profile,sample,getRecipe);}
    catch(error){console.warn('Film thumbnail '+profile.id,error);}
   }
   if(index<drawList.length)setTimeout(drawBatch,0);
  }
  drawBatch();
 }
 prev.addEventListener('click',()=>{if(page>0){page--;render();}});
 next.addEventListener('click',()=>{page++;render();});
 categories.addEventListener('change',()=>setCategory(categories.value));
 renderCategories();
 return Object.freeze({
  refresh:()=>{renderCategories();render();},
  rerender:render,
  refreshSelection:markSelection,
  resetPage:()=>{page=0;render();},
  getState:()=>({category,page,size:list().length,rendered:grid.querySelectorAll('canvas').length})
 });
}
root.VHSVideoFilmGallery=Object.freeze({mount,family,makeSample,drawThumb,PAGE_SIZE});
})(window);
