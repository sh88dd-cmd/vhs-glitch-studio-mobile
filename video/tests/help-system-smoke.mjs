/* 0.7.9: contextual cards, 10 genuine GIF walkthroughs and offline cache. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root={};
const toBase64=input=>Buffer.from(input,'binary').toString('base64');
for(const file of ['video/help-content.js','video/help-illustrations.js']){
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{window:root,Math,Number,Date,Object,String,Map,Set,Uint8Array,btoa:toBase64,encodeURIComponent});
}
const content=root.VHSVideoHelpContent,ill=root.VHSVideoHelpIllustrations;
assert.ok(content.entries.size>=250,'Too few documented elements');
for(const id of ['vhs','glitch','timeline','keyframes','frameTools','film','filmDamage','audio','camera','cassettes','export']){
 const h=content.resolve('tab-'+id,id);
 assert.ok(h.what.length>16&&h.why.length>16&&h.how.length>16&&h.note.length>16,'Incomplete section '+id);
}
for(const id of ['tracks','trim','beat','tape'])
 assert.equal(content.resolve('audio-'+id,id).media,'gif','Audio requires animated explanation');
const engine=fs.readFileSync('video/glitch-engine.js','utf8');
const sliders=['Общая сила VHS','Растекание цвета','Артефакты композитного сигнала',
 'Нестабильность видеострок','Помехи видеоголовки (1–4 полосы)','Шум и снег',
 'Выпадения цвета','Контурное эхо','Сила плёнки','Сила засветов','Пыль',
 'Зерно','Царапины','Мерцание экспозиции','Свечение света (halation)',
 'Чувствительность к музыке','Порог срабатывания','Сила музыкальных повреждений',
 'Длительность затухания эффекта','Частота случайных сбоев',
 'Громкость добавленной музыки','Громкость оригинального звука видео',
 'Сила деградации аудио','Шипение ленты','Плавание звука / Wow',
 'Дрожание звука / Flutter','Выпадения звука','Перегрузка и насыщение'];
for(const name of sliders){
 const h=content.resolve('',name,'range');
 assert.ok(h.what.length>30,'Missing slider '+name);
 assert.equal(h.media,'compare','Slider needs before/after: '+name);
}
for(const [,name] of engine.matchAll(/name:'([^']+)',group:/g))
 assert.ok(content.resolve('',name,'range').what.length>30,'Missing glitch '+name);
for(const key of ['holdGlitch','holdBlendMain','keyframeAdd','frameSavePng','frameStepFps',
 'musicTrimStartRange','cameraFrameSize','musicVideoInput','cassetteSave',
 'cassetteDeselect','cassetteExport','allEffectsToggle']){
 const h=content.resolve(key,key,'number');
 assert.ok(h.what.length>20&&h.how.length>20,'Missing help '+key);
}
const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const sw=fs.readFileSync('video/sw.js','utf8');
const css=fs.readFileSync('video/styles.css','utf8');
const ui=fs.readFileSync('video/help-ui.js','utf8');
for(const script of ['help-content.js','help-illustrations.js','help-ui.js']){
 assert.ok(html.includes(script+'?v='+(script==='help-ui.js'?'0.7.10':script==='help-content.js'?'0.8.4':'0.7.9')),'Not linked: '+script);
 assert.ok(sw.includes("'./"+script+"'"),'Not cached: '+script);
}
assert.ok(html.includes('id="videoHelpModal"')&&html.includes('id="helpClose"'));
assert.ok(css.includes('.helpIcon')&&css.includes('.videoHelpModal'));
assert.ok(app.includes('window.VHSVideoHelpUI.mount()'));
assert.ok(ui.includes('new MutationObserver('),'Dynamic controls need badges');
assert.ok(ui.includes('e.stopPropagation()'),'Help must not operate underlying controls');
assert.ok(ui.includes('parent.insertBefore(wrap,node);wrap.append(node,iconFor('),'Badge must be a sibling');
assert.ok(ui.includes("querySelectorAll('main input:not([type=hidden])"),'Fallback coverage is missing');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vhs-help-'));
try{
 for(const variant of ['workflow','keyframes','audio','trim','cassette','camera','compare','frame','timeline','export']){
  const uri=ill.gifSource(variant);
  assert.ok(uri.startsWith('data:image/gif;base64,R0lGODlh'));
  const bytes=Buffer.from(uri.split(',')[1],'base64');
  assert.equal(bytes.subarray(0,6).toString('ascii'),'GIF89a');
  assert.equal(bytes.readUInt16LE(6),160);
  assert.equal(bytes.readUInt16LE(8),92);
  assert.equal(bytes.at(-1),0x3b);
  assert.ok(bytes.length<16*1024,'Large GIF '+variant);
  const gif=path.join(tmp,variant+'.gif');
  fs.writeFileSync(gif,bytes);
  const raw=execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0',
   '-show_entries','stream=width,height,nb_read_frames','-of','json',gif],{encoding:'utf8'});
  assert.equal(Number(JSON.parse(raw).streams[0].nb_read_frames),6,'GIF does not decode 6 frames: '+variant);
 }
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
assert.ok(ill.compareSvg('vhs').startsWith('data:image/svg+xml'));

const fields=new Map();
function el(id){
 if(fields.has(id))return fields.get(id);
 const item={id,open:false,hidden:false,textContent:'',src:'',dataset:{},
  classList:{add(){},remove(){}},addEventListener(){},removeAttribute(n){if(n==='src')this.src='';},
  showModal(){this.open=true;},close(){this.open=false;},focus(){},setAttribute(){},getAttribute(){return null;}};
 fields.set(id,item);return item;
}
const doc={getElementById:el,body:el('body')};
vm.runInNewContext(ui,{window:root,document:doc,console,requestAnimationFrame:callback=>callback(),MutationObserver:class{}});
const help=root.VHSVideoHelpUI;
assert.ok(html.includes('id="toggleHelpIcons"'), 'Footer visibility button missing');
assert.equal((html.match(/id="toggleHelpIcons"/g)||[]).length,1,'Only one footer toggle allowed');
assert.match(html,/<footer[\s\S]*?id="toggleHelpIcons"[\s\S]*?<\/footer>/,'Toggle belongs at bottom');
assert.ok(css.includes('body:not(.help-visible) .helpIcon{display:none!important}'),
 'All tiny question marks must start hidden, including before JS loads');
assert.ok(css.includes('.helpVisibilityToggle'),'Dedicated footer button style required');
assert.match(sw,/vhs-video-lab-\d+\.\d+\.\d+/,'Offline cache version present');
const visibleClasses=new Set();
doc.body.classList={
 add(c){visibleClasses.add(c);},remove(c){visibleClasses.delete(c);},
 contains(c){return visibleClasses.has(c);},
 toggle(c,on){if(on)visibleClasses.add(c);else visibleClasses.delete(c);return !!on;}
};
const toggle=el('toggleHelpIcons');
toggle.attrs={};
toggle.setAttribute=(k,v)=>{toggle.attrs[k]=v;};
help.setVisible(true,false);
assert.equal(visibleClasses.has('help-visible'),true);
assert.equal(toggle.attrs['aria-pressed'],'true');
assert.equal(el('helpToggleText').textContent,'Скрыть подсказки');
help.setVisible(false,false);
assert.equal(visibleClasses.has('help-visible'),false);
assert.equal(toggle.attrs['aria-pressed'],'false');
assert.equal(el('helpToggleText').textContent,'Показать подсказки');
assert.ok(ui.includes("localStorage.setItem(HELP_VISIBILITY_KEY"),
 'Visible preference must persist across reloads');
assert.ok(ui.includes("saved==='1'"),'Visible preference must be loaded');
help.open('tab-keyframes','КЛЮЧЕВЫЕ КАДРЫ','section',el('dummy'));
assert.equal(el('videoHelpModal').open,true);
assert.ok(el('helpIllustration').src.startsWith('data:image/gif;base64,'));
assert.ok(el('helpWhat').textContent.length>20);
assert.ok(el('helpMediaLabel').textContent.includes('GIF'));
help.close();
assert.equal(el('videoHelpModal').open,false);
help.open('vhsEnabled','ВКЛЮЧИТЬ VHS','checkbox',el('dummy'));
assert.ok(el('helpIllustration').src.startsWith('data:image/svg+xml'));
assert.ok(el('helpMediaLabel').textContent.includes('ДО / ПОСЛЕ'));
console.log('PASS: help modal, GIFs, single footer switch, default hidden, on/off states, preference persistence and offline precache');
