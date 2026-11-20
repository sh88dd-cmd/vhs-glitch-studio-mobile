/* VHS Glitch Studio Mobile — photo editing entirely within the device.
 * No network calls except static app files through the service worker.
 * Source imagery is never uploaded. Film-named recipes are original approximations.
 */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const clone=o=>JSON.parse(JSON.stringify(o));
  const ui={};
  const defaults={
    vhsEnabled:true,filmEnabled:false,preset:'VHS 90s',master:65,seed:123456789,
    fx:{hiss:74,wobble:42,tear:28,chroma:40,rgb:35,grain:35,streaks:0},
    film:{name:'Kodak Gold 200 — стиль',strength:80,grain:22,halation:13,leaks:0,dust:0,vignette:8,whiteBorder:false,caption:false,captionText:'',captionSize:100,customLut:false},
    edgeBurn:{"enabled":false,"mode":"auto","side":"random","strength":90,"width":35,"roughness":75,"scratches":38,"seed":238711811,"shape":"random","warmEnabled":true,"warmPattern":"random","warmStrength":90,"warmWidth":55,"warmSeed":170730923},
    camera:{date:{on:false,text:'PM 10:28 | JUN 16 1995',position:'right-bottom',size:125},rec:{on:false,position:'left-top',size:125},play:{on:false,position:'left-top',size:125},battery:{on:false,position:'right-top',size:125,level:'LOW'}},
    singleSize:'3200',batchSize:'2000',exportFormat:'image/jpeg',favoriteFilms:[],previewDock:{enabled:true,collapsed:false}
  };
  let state=clone(defaults);
  try{
    const saved=JSON.parse(localStorage.getItem('vhs.mobile.settings')||'null');
    if(saved){state={...state,...saved,fx:{...state.fx,...saved.fx},film:{...state.film,...saved.film},camera:{...state.camera,...saved.camera},edgeBurn:{...state.edgeBurn,...saved.edgeBurn},previewDock:{...state.previewDock,...saved.previewDock}};}
  }catch(e){console.warn('Settings unavailable',e);}
  if(!Array.isArray(state.favoriteFilms))state.favoriteFilms=[];
  state.previewDock={...defaults.previewDock,...(state.previewDock||{})};
  state.seed=crypto.getRandomValues(new Uint32Array(1))[0];
  const effectDefs=[
    ['hiss','Белые шипящие полосы',74],['wobble','Волны / дрожание строк',42],
    ['tear','Сдвинутые участки',28],['chroma','Широкие цветные VHS-волны',40],
    ['rgb','RGB / расслоение цвета',35],['grain','Зерно / scanlines',35],
    ['streaks','Тонкие цветные штрихи',0]
  ];
  const positions=[['left-top','Слева сверху'],['right-top','Справа сверху'],['left-bottom','Слева снизу'],['right-bottom','Справа снизу']];
  const looks={}; let xmpProfiles=[];let activeLook=null;let cubeLut=null;let filmPage=0;let favoritesPage=0;let batchFiles=[];let batchPage=0;let dialogFileIndex=-1;let busy=false;
  let original=null, photoName='photo',showingOriginal=false; let latestPreview=null, rendering=false, rerender=false, renderTimer=0, pageToken=0;
  let mainViewerToken=0; const mainViewerView={zoom:1,x:0,y:0,gesture:null};
  const PREVIEW_MAX=1040, DETAIL_PREVIEW_MAX=1800, BATCH_PREVIEW=440, FILM_PAGE_SIZE=24;
  const power={"VHS 90s":1,"Camcorder 90s":.75,"VHS — мягкий":.4,"VHS — повреждённая кассета":1.25,"Dirty VHS Extreme":1.4,"Tracking Error":1.2,"Аналоговый шум":.8,"Цветные помехи":1.15,"RGB Split":1.0};

  function notify(message, alertToo=false){$('notice').textContent=message;if(alertToo)alert(message);}
  function persist(){try{localStorage.setItem('vhs.mobile.settings',JSON.stringify(state));}catch(e){notify('Мало места для сохранения настроек: сделай резервную копию.');}}
  function rngFrom(seed,stage){let x=(seed^Math.imul(stage,0x9e3779b9))>>>0;return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  const ri=(r,a,b)=>Math.floor(r()*(b-a+1))+a;
  function randomSeed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
  function newCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function toImageData(img,w,h){const c=newCanvas(w,h);const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,w,h);return cx.getImageData(0,0,w,h);}
  function setCanvas(dest,src){dest.width=src.width;dest.height=src.height;dest.getContext('2d').drawImage(src,0,0);}
  function openDB(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('vhs-studio-mobile',1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('xmp'))req.result.createObjectStore('xmp',{keyPath:'id'});if(!req.result.objectStoreNames.contains('assets'))req.result.createObjectStore('assets',{keyPath:'id'});};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });}
  let dbPromise=openDB().catch(e=>{console.warn(e);return null;});
  async function dbAll(store){const db=await dbPromise;if(!db)return[];return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
  async function dbPutMany(store,records){const db=await dbPromise;if(!db)throw Error('Хранилище браузера недоступно');return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');for(const rec of records)tx.objectStore(store).put(rec);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function dbClear(store){const db=await dbPromise;if(!db)return;return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  function decodeImage(file){return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const im=new Image();im.onload=()=>{URL.revokeObjectURL(url);resolve(im);};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Не удалось открыть изображение '+file.name));};im.src=url;});}
  function renderSize(w,h,size){if(size==='full')return[w,h];let scale=Math.min(1,Number(size)/Math.max(w,h));return[Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))];}
  function formatBytes(n){return n>1024*1024?(n/1048576).toFixed(1)+' МБ':Math.round(n/1024)+' КБ';}
  function addControl(parent,name,value,onChange,min=0,max=100){const wrap=document.createElement('div');wrap.className='control';const row=document.createElement('div');row.className='r';const title=document.createElement('b');title.textContent=name;const val=document.createElement('em');val.textContent=value+'%';const inp=document.createElement('input');inp.type='range';inp.min=min;inp.max=max;inp.step=1;inp.value=value;row.append(title,val);wrap.append(row,inp);inp.addEventListener('input',()=>{val.textContent=inp.value+'%';onChange(Number(inp.value));schedulePreview();});parent.appendChild(wrap);return inp;}
  function addToggle(parent,label,initial,onChange){const row=document.createElement('div');row.className='row';const text=document.createElement('span');text.textContent=label;const chk=document.createElement('input');chk.type='checkbox';chk.checked=initial;chk.addEventListener('change',()=>{onChange(chk.checked);schedulePreview();});row.append(text,chk);parent.appendChild(row);return chk;}
  function addSelect(parent,label,opts,value,onChange){const wrap=document.createElement('label');wrap.textContent=label;const sel=document.createElement('select');for(const [v,title] of opts){const op=document.createElement('option');op.value=v;op.textContent=title;sel.append(op);}sel.value=value;sel.addEventListener('change',()=>{onChange(sel.value);schedulePreview();});wrap.append(sel);parent.appendChild(wrap);return sel;}
  function mountControls(){
    addControl($('masterControl'),'Общая сила VHS',state.master,v=>{state.master=v;persist();});
    for(const [key,label] of effectDefs){addControl($('effectsControls'),label,state.fx[key],v=>{state.fx[key]=v;persist();});}
    const film=$('filmControls');addControl(film,'Сила плёнки',state.film.strength,v=>{state.film.strength=v;persist();});
    for(const [key,label] of [['grain','Плёночное зерно'],['halation','Halation / засветка света'],['leaks','Light leaks / световые протечки'],['dust','Пыль и царапины'],['vignette','Виньетка']]){
      addControl(film,label,state.film[key],v=>{state.film[key]=v;persist();});
    }
    addToggle(film,'Белая рамка · по 30% со всех сторон',state.film.whiteBorder,v=>{state.film.whiteBorder=v;persist();});
    addToggle(film,'Тонкая подпись под фотографией',state.film.caption,v=>{state.film.caption=v;persist();});
    const line=document.createElement('label');line.textContent='Текст подписи';const f=document.createElement('input');f.value=state.film.captionText;f.maxLength=100;f.placeholder='Например: SUMMER 1997';f.addEventListener('input',()=>{state.film.captionText=f.value;persist();schedulePreview();});line.append(f);film.append(line);
    addControl(film,'Размер подписи',state.film.captionSize,v=>{state.film.captionSize=v;persist();},50,220);
    for(const [key,title] of [['date','Дата / время'],['rec','REC + красная точка'],['play','PLAY'],['battery','Батарейка']]){
      const block=document.createElement('div');block.className='cameraSetting';const heading=document.createElement('h3');heading.textContent=title;block.append(heading);
      addToggle(block,'Включить',state.camera[key].on,v=>{state.camera[key].on=v;persist();});
      if(key==='date'){const label=document.createElement('label');label.textContent='Дата и время';const inp=document.createElement('input');inp.value=state.camera.date.text;inp.maxLength=62;inp.addEventListener('input',()=>{state.camera.date.text=inp.value;persist();schedulePreview();});label.append(inp);block.append(label);}
      addSelect(block,'Положение',positions,state.camera[key].position,v=>{state.camera[key].position=v;persist();});
      if(key==='battery')addSelect(block,'Уровень заряда',[['FULL','Полная'],['75%','75%'],['50%','50%'],['25%','25%'],['LOW','Мало — красная'],['EMPTY','Разряжена']],state.camera.battery.level,v=>{state.camera.battery.level=v;persist();});
      addControl(block,'Размер',state.camera[key].size,v=>{state.camera[key].size=v;persist();},60,400);
      $('cameraControls').append(block);
    }
  }

const EDGE_SHAPES=['torn','bloom','blister','streaks','double'];
  const EDGE_SHAPE_NAMES={torn:'Рваная эмульсия',bloom:'Мягкий размытый',blister:'Островки прожога',streaks:'Разрывы и языки',double:'Двойная кромка'};
  const WARM_PATTERNS=['amber','flame','red','split'];
  const WARM_NAMES={amber:'Янтарное свечение',flame:'Огненные пятна',red:'Красные прожилки',split:'Двухцветный ореол'};
  function edgeSides(settings){
    if(settings.side==='both')return ['left','right'];
    if(settings.side==='left'||settings.side==='right')return [settings.side];
    return [rngFrom(settings.seed>>>0,719)()<.5?'left':'right'];
  }
  function edgeShapeFor(settings,side){
    if(EDGE_SHAPES.includes(settings.shape))return settings.shape;
    return EDGE_SHAPES[Math.floor(rngFrom(settings.seed>>>0,side==='left'?704:705)()*EDGE_SHAPES.length)];
  }
  function warmPatternFor(settings,side){
    if(WARM_PATTERNS.includes(settings.warmPattern))return settings.warmPattern;
    return WARM_PATTERNS[Math.floor(rngFrom(settings.warmSeed>>>0,side==='left'?706:707)()*WARM_PATTERNS.length)];
  }
  function paintEdgeBurns(canvas,settings,autoMonochrome){
    if(!settings||!settings.enabled)return;
    const w=canvas.width,h=canvas.height;
    if(w<8||h<8)return;
    const amount=clamp(Number(settings.strength)/100||0,0,1);
    if(!amount)return;
    const mono=settings.mode==='mono'||(settings.mode==='auto'&&autoMonochrome);
    const rough=clamp(Number(settings.roughness)/100||0,0,1);
    const scratches=clamp(Number(settings.scratches)/100||0,0,1);
    const width=clamp(Number(settings.width)/100||0,0,1);
    const warmOn=settings.warmEnabled!==false&&!mono;
    const warmAmount=clamp(Number(settings.warmStrength)/100||0,0,1);
    const warmWidth=clamp(Number(settings.warmWidth)/100||0,0,1);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(const side of edgeSides(settings)){
      const r=rngFrom(settings.seed>>>0,side==='left'?721:723);
      const rw=rngFrom(settings.warmSeed>>>0,side==='left'?805:807);
      const shape=edgeShapeFor(settings,side),warmType=warmPatternFor(settings,side);
      const base=w*(.009+width*.086)*(.82+r()*.34);
      const reach=Math.min(w*.29,base*(3.2+warmWidth*.45));
      const strip=Math.min(w,Math.max(2,Math.ceil(reach)));
      const x0=side==='left'?0:w-strip;
      const buf=ctx.getImageData(x0,0,strip,h),p=buf.data;
      const knots=Array.from({length:35},()=>r()*2-1);
      const steps=Array.from({length:19},()=>r());
      const blisters=Array.from({length:6},()=>({at:r(),rad:.025+r()*.095,pow:.48+r()*.8}));
      const warmSpots=Array.from({length:6},()=>({at:rw(),rad:.035+rw()*.13,pow:.4+rw()*.6}));
      const phase=r()*Math.PI*2,phase2=r()*Math.PI*2;
      const warmPhase=rw()*Math.PI*2,warmPhase2=rw()*Math.PI*2;
      const noiseSeed=((settings.seed>>>0)^(side==='left'?0x4a7f12ad:0x67e13c94))>>>0;
      const bandSize=base*(.52+warmWidth*1.35);
      const scratchRandom=rngFrom(settings.seed>>>0,side==='left'?837:839);
      for(let y=0;y<h;y++){
        const u=y/Math.max(1,h-1);
        const k=u*(knots.length-1),ki=Math.min(knots.length-2,Math.floor(k)),f=k-ki;
        const smooth=f*f*(3-2*f);
        const bend=knots[ki]*(1-smooth)+knots[ki+1]*smooth;
        const wavy=Math.sin(u*17+phase)*.10+Math.sin(u*59+phase2)*.045;
        let front;
        if(shape==='bloom'){
          front=base*(.64+.12*Math.sin(u*8+phase)+.06*bend);
        }else if(shape==='blister'){
          let bubbles=0;
          for(const b of blisters){const t=(u-b.at)/b.rad;bubbles=Math.max(bubbles,Math.exp(-t*t)*b.pow);}
          front=base*(.24+1.33*bubbles+.09*rough*bend);
        }else if(shape==='streaks'){
          const block=Math.min(steps.length-1,Math.floor(u*steps.length));
          const jag=(steps[block]-.5)*(.75+rough*.7);
          front=base*(.50+jag+.09*Math.sin(u*73+phase));
        }else if(shape==='double'){
          front=base*(.40+.14*Math.sin(u*12+phase)+.14*rough*bend);
        }else{
          front=base*(.72+wavy+.33*rough*bend+.06*rough*Math.sin(u*279+phase));
        }
        front=Math.max(base*.12,front);
        let heatSpots=0;
        for(const b of warmSpots){const t=(u-b.at)/b.rad;heatSpots=Math.max(heatSpots,Math.exp(-t*t)*b.pow);}
        const heatStripes=.54+.46*Math.pow(Math.abs(Math.sin(u*49+warmPhase)),5);
        const heatWaves=.76+.24*Math.sin(u*14+warmPhase2);
        const secondaryStart=front+base*.21;
        const outerFront=shape==='double'?secondaryStart+base*.18:front;
        const feather=Math.max(.8,base*(shape==='bloom'?.46:shape==='streaks'?.075:.14));
        for(let x=0;x<strip;x++){
          const dist=side==='left'?x:strip-1-x;
          const hash=(Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^noiseSeed)>>>0;
          const grain=((hash&1023)/1023-.5)*base*.14*rough;
          let white=clamp((front+grain-dist)/feather,0,1);
          if(shape==='streaks'){
            const finger=front+base*(.13+.13*Math.sin(u*31+phase2));
            const narrow=Math.max(.9,base*.035);
            const streak=clamp(1-Math.abs(dist-finger)/narrow,0,1);
            white=Math.max(white,streak*.78*(.6+.4*Math.abs(Math.sin(u*28+phase))));
          }else if(shape==='double'){
            const thin=Math.max(.9,base*.07);
            const second=clamp(Math.min((dist-secondaryStart)/thin,(secondaryStart+base*.19-dist)/thin),0,1);
            white=Math.max(white,second*.79);
          }
          white=clamp(white*amount,0,1);
          const silver=clamp(1-dist/Math.max(1,outerFront+base*.42),0,1)*.10*amount*(1-white);
          const i=(y*strip+x)*4;
          const orig0=p[i],orig1=p[i+1],orig2=p[i+2];
          const lift=clamp(white+silver,0,1);
          let red=orig0+(255-orig0)*lift;
          let green=orig1+(255-orig1)*lift;
          let blue=orig2+(255-orig2)*lift;
          if(warmOn&&warmAmount>0){
            const start=outerFront+base*.015,span=bandSize;
            const t=(dist-start)/Math.max(1,span);
            const near=clamp(1-Math.abs(t-.28)/.73,0,1);
            let wave=1;
            if(warmType==='flame')wave=.23+1.35*heatSpots;
            else if(warmType==='red')wave=heatStripes;
            else if(warmType==='split')wave=.65+.4*heatWaves;
            else wave=.85+.18*heatWaves;
            const strength=clamp(warmAmount*wave*near*near*Math.pow(1-white,2)*1.35,0,.96);
            if(strength>0){
              let palette;
              if(warmType==='amber')palette=[255,201,65];
              else if(warmType==='flame')palette=[255,114+Math.round(66*heatSpots),29];
              else if(warmType==='red')palette=[255,72,48];
              else palette=t<.43?[255,179,54]:[255,55,46];
              red+=(palette[0]-red)*strength;
              green+=(palette[1]-green)*strength;
              blue+=(palette[2]-blue)*strength;
            }
          }
          if(dist<front&&rough>0&&((hash>>>12)&4095)<rough*48){
            const small=.56+((hash>>>22)&255)/1024;
            red*=small;green*=small;blue*=small;
          }
          p[i]=red;p[i+1]=green;p[i+2]=blue;
        }
      }
      ctx.putImageData(buf,x0,0);
      if(scratches>0){
        ctx.save();
        for(let j=0,n=Math.round(scratches*(10+h/40));j<n;j++){
          const yy=scratchRandom()*h;
          const dd=base*(.12+scratchRandom()*1.1);
          const xx=side==='left'?dd:w-dd;
          ctx.strokeStyle=mono?'rgba(255,255,255,.24)':
            (scratchRandom()<.5?'rgba(255,236,190,.27)':'rgba(255,127,71,.22)');
          ctx.lineWidth=Math.max(.6,w*(.0001+scratchRandom()*.00025));
          ctx.beginPath();ctx.moveTo(xx,yy);
          ctx.lineTo(xx+(scratchRandom()-.5)*base*.25,Math.min(h,yy+h*(.002+scratchRandom()*.039)));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }
  function selectedFilmIsMonochrome(){
  if(!state.filmEnabled)return false;
  if(activeLook&&activeLook.fields){
    const f=activeLook.fields;
    if(String(f.ConvertToGrayscale||'').toLowerCase()==='true')return true;
    if(/gray|black.?white|mono/i.test(String(f.Treatment||'')))return true;
  }
  return /(?:black.?white|\bb&w\b|ilford|tri.?x|t.?max|verichrome|ortho|delta\s?\d+)/i.test(state.film.name||'');
}
function mountEdgeBurnControls(){
    const s=state.edgeBurn;
    $('edgeBurnEnabled').checked=!!s.enabled;
    $('edgeBurnEnabled').addEventListener('change',e=>{s.enabled=e.target.checked;schedulePreview();});
    const selects=[['mode','edgeBurnMode'],['side','edgeBurnSide'],['shape','edgeBurnShape'],['warmPattern','edgeBurnWarmPattern']];
    for(const [key,id] of selects){
      const el=$(id);el.value=s[key];
      el.addEventListener('change',()=>{s[key]=el.value;updateEdgeBurnLabels();schedulePreview();});
    }
    $('edgeBurnWarmEnabled').checked=!!s.warmEnabled;
    $('edgeBurnWarmEnabled').addEventListener('change',e=>{s.warmEnabled=e.target.checked;updateEdgeBurnLabels();schedulePreview();});
    const parent=$('edgeBurnControls');
    for(const [key,label] of [
      ['strength','Яркость белой кромки'],
      ['width','Ширина белой кромки'],
      ['roughness','Рваность края'],
      ['scratches','Пыль и царапины']
    ])addControl(parent,label,s[key],v=>{s[key]=v;},0,100);
    const warmParent=$('edgeBurnWarmControls');
    for(const [key,label] of [
      ['warmStrength','Яркость тёплого свечения'],
      ['warmWidth','Ширина цветного ореола']
    ])addControl(warmParent,label,s[key],v=>{s[key]=v;},0,100);
    $('edgeBurnReroll').addEventListener('click',()=>{
      const side=edgeSides(s)[0],old=edgeShapeFor(s,side);
      let next=randomSeed();
      if(s.shape==='random')for(let i=0;i<10;i++){
        const probe={...s,seed:next},candidate=edgeSides(probe)[0];
        if(edgeShapeFor(probe,candidate)!==old)break;
        next=randomSeed();
      }
      s.seed=next;updateEdgeBurnLabels();schedulePreview();
    });
    $('edgeBurnWarmReroll').addEventListener('click',()=>{
      const side=edgeSides(s)[0],old=warmPatternFor(s,side);
      let next=randomSeed();
      if(s.warmPattern==='random')for(let i=0;i<10;i++){
        if(warmPatternFor({...s,warmSeed:next},side)!==old)break;
        next=randomSeed();
      }
      s.warmSeed=next;updateEdgeBurnLabels();schedulePreview();
    });
    updateEdgeBurnLabels();
  }
  function updateEdgeBurnLabels(){
    const s=state.edgeBurn,sides=edgeSides(s);
    $('edgeBurnCurrentShape').textContent='Сейчас: '+sides.map(side=>(sides.length===2?(side==='left'?'слева ':'справа '):'')+EDGE_SHAPE_NAMES[edgeShapeFor(s,side)]).join(' · ');
    $('edgeBurnCurrentWarm').textContent='Ореол: '+sides.map(side=>(sides.length===2?(side==='left'?'слева ':'справа '):'')+WARM_NAMES[warmPatternFor(s,side)]).join(' · ');
    $('edgeBurnWarmSettings').classList.toggle('warmBurnDisabled',!s.warmEnabled);
  }
  function imagePixels(src){return src.data;}
  function filmBuiltin(p,recipe,strength){
    if(!recipe||strength<=0)return;
    const [gamma,contr,sat,gain,lift,shadows,highlights]=recipe;
    for(let i=0;i<p.length;i+=4){
      const r0=p[i],g0=p[i+1],b0=p[i+2];let r=r0/255,g=g0/255,b=b0/255;
      r=Math.pow(r,1/gamma);g=Math.pow(g,1/gamma);b=Math.pow(b,1/gamma);
      r=(r-.5)*contr+.5;g=(g-.5)*contr+.5;b=(b-.5)*contr+.5;
      const l=.299*r+.587*g+.114*b; r=l+(r-l)*sat;g=l+(g-l)*sat;b=l+(b-l)*sat;
      const sh=(1-clamp(l,0,1))**2, hi=clamp(l,0,1)**2;
      r=r*gain[0]+lift[0]/255+sh*shadows[0]/255+hi*highlights[0]/255;
      g=g*gain[1]+lift[1]/255+sh*shadows[1]/255+hi*highlights[1]/255;
      b=b*gain[2]+lift[2]/255+sh*shadows[2]/255+hi*highlights[2]/255;
      p[i]=clamp(r0*(1-strength)+r*255*strength,0,255);
      p[i+1]=clamp(g0*(1-strength)+g*255*strength,0,255);
      p[i+2]=clamp(b0*(1-strength)+b*255*strength,0,255);
    }
  }
  function filmXMP(p,profile,strength){
    if(!profile||strength<=0)return;
    const f=profile.fields, n=k=>Number(f[k]||0)||0;
    const exp=clamp(2**clamp(n('Exposure2012'),-3,3),.125,8),contrast=1+n('Contrast2012')/100;
    const sat=1+n('Saturation')/100+n('Vibrance')*.006;
    const shadows=n('Shadows2012')*.0022,high=n('Highlights2012')*.0020;
    const whites=n('Whites2012')*.001,blacks=n('Blacks2012')*.001;
    const mono=String(f.Treatment||'').toLowerCase().includes('gray')||String(f.ConvertToGrayscale||'').toLowerCase()==='true';
    const curve=profile.curve;
    for(let i=0;i<p.length;i+=4){
      const o0=p[i],o1=p[i+1],o2=p[i+2];
      let a=[o0/255,o1/255,o2/255].map(v=>(v*exp-.5)*contrast+.5);
      const l=.299*a[0]+.587*a[1]+.114*a[2];
      const delta=shadows*(1-clamp(l,0,1))**2+high*clamp(l,0,1)**2+whites*clamp(l,0,1)+blacks*(1-clamp(l,0,1));
      a=a.map(v=>l+(v-l)*sat+delta);
      if(mono){const g=.299*a[0]+.587*a[1]+.114*a[2];a=[g,g,g];}
      if(curve&&curve.length>1){a=a.map(v=>curveAt(curve,clamp(v*255,0,255))/255);}
      for(let c=0;c<3;c++)p[i+c]=clamp([o0,o1,o2][c]*(1-strength)+255*a[c]*strength,0,255);
    }
  }
  function curveAt(curve,x){let lo=0;while(lo<curve.length-2&&curve[lo+1][0]<x)lo++;const [x0,y0]=curve[lo],[x1,y1]=curve[lo+1];return y0+(y1-y0)*(x-x0)/Math.max(1e-5,x1-x0);}
  function applyCube(p,lut,amount){if(!lut||amount<=0)return;const n=lut.size,table=lut.table;const N=n-1;
    for(let i=0;i<p.length;i+=4){const r0=p[i],g0=p[i+1],b0=p[i+2];const r=clamp(Math.round((r0/255)*N),0,N),g=clamp(Math.round((g0/255)*N),0,N),b=clamp(Math.round((b0/255)*N),0,N);
      const at=((b*n+g)*n+r)*3;for(let c=0;c<3;c++)p[i+c]=clamp(p[i+c]*(1-amount)+255*table[at+c]*amount,0,255);
    }
  }
  function filmGrain(p,w,h,amount,seed){if(amount<=0)return;const r=rngFrom(seed,81),amp=amount*36;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;const z=(r()-.5)*amp*2;for(let c=0;c<3;c++)p[i+c]=clamp(p[i+c]+z,0,255);}}
  function filmVignette(p,w,h,amount){if(!amount)return;const amt=amount*.85;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let dx=(x-w*.5)/(w*.5),dy=(y-h*.5)/(h*.5);const d=clamp(dx*dx+dy*dy,0,2)/2;let m=1-d*d*amt;const i=(y*w+x)*4;p[i]*=m;p[i+1]*=m;p[i+2]*=m;}}
  function paintFilmExtras(canvas,w,h,settings,seed){const ctx=canvas.getContext('2d');const r=rngFrom(seed,303);
    if(settings.leaks>0){ctx.save();ctx.globalCompositeOperation='screen';const cx=(r()<.5?0:w),cy=r()*h;const grd=ctx.createRadialGradient(cx,cy,0,cx,cy,w*.9);grd.addColorStop(0,`rgba(255,153,56,${settings.leaks/180})`);grd.addColorStop(.35,`rgba(246,56,90,${settings.leaks/280})`);grd.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grd;ctx.fillRect(0,0,w,h);ctx.restore();}
    if(settings.halation>0){const off=newCanvas(w,h),c=off.getContext('2d');const pix=c.getImageData(0,0,w,h);const src=ctx.getImageData(0,0,w,h);for(let i=0;i<src.data.length;i+=4){const l=(src.data[i]+src.data[i+1]+src.data[i+2])/3;const a=clamp((l-185)/70,0,1);pix.data[i]=255;pix.data[i+1]=67;pix.data[i+2]=32;pix.data[i+3]=Math.round(a*255);}c.putImageData(pix,0,0);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=settings.halation/240;ctx.filter=`blur(${Math.max(2,Math.round(w/120))}px)`;ctx.drawImage(off,0,0);ctx.restore();}
    if(settings.dust>0){ctx.save();for(let j=0;j<Math.ceil(settings.dust*.9);j++){let x=r()*w,y=r()*h;ctx.strokeStyle=`rgba(${r()<.6?'20,19,17':'250,247,243'},${.12+settings.dust/190})`;ctx.lineWidth=Math.max(.6,w/1600);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(r()-.5)*w*.03,y+r()*h*.08);ctx.stroke();}ctx.restore();}
  }
  // Each effect uses independently seeded geometry. Strength never changes that geometry.
  function vhsWobble(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,101),orig=p.slice();const center=r()*h,sigma=h*(.08+r()*.25),freq1=7+r()*19,freq2=27+r()*38,phase=r()*6.28;
    for(let y=0;y<h;y++){const envelope=.12+.88*Math.exp(-(((y-center)/Math.max(1,sigma))**2));const dx=Math.round(w*.025*amt*envelope*(.73*Math.sin(y/h*freq1+phase)+.27*Math.sin(y/h*freq2+phase)));if(!dx)continue;for(let x=0;x<w;x++){const sx=clamp(x-dx,0,w-1);let a=(y*w+x)*4,b=(y*w+sx)*4;p[a]=orig[b];p[a+1]=orig[b+1];p[a+2]=orig[b+2];}}
  }
  function vhsTear(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,102);const orig=p.slice(),bands=[];for(let j=0;j<9;j++)bands.push({y:r()*h,thick:h*(.003+r()*.04),shift:(r()-.5)*w*.21, x0:Math.floor(r()*w*.15),x1:w-Math.floor(r()*w*.08)});
    for(const band of bands){const dx=Math.round(band.shift*amt),y0=Math.round(band.y),y1=Math.min(h,Math.ceil(band.y+band.thick));if(!dx)continue;for(let y=Math.max(0,y0);y<y1;y++)for(let x=band.x0;x<band.x1;x++){const sx=clamp(x-dx,band.x0,band.x1-1);const a=(y*w+x)*4,b=(y*w+sx)*4;p[a]=orig[b];p[a+1]=orig[b+1];p[a+2]=orig[b+2];}}
  }
  function vhsHiss(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,103),count=ri(r,2,4),knots=[];
    for(let b=0;b<count;b++){
      const center=h*(.07+(b+r()*.75)/count*.87),halo=Math.max(3,Math.round(h*(.007+r()*.022)));
      const lineWidth=Math.max(1,Math.round(h*(.001+r()*.0028)));
      knots.length=0;for(let j=0;j<=9;j++)knots.push((r()-.5)*h*.007);
      const y0=Math.max(0,Math.floor(center-halo-h*.008)),y1=Math.min(h,Math.ceil(center+halo+h*.008));
      const extras=Array.from({length:ri(r,2,4)},()=>({d:(r()-.5)*halo*1.8,weight:.2+r()*.5,thick:Math.max(1,Math.round(lineWidth*(.3+r()*.8)))}));
      for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
        const pos=x/(Math.max(1,w-1))*9, k=Math.min(8,Math.floor(pos)),t=pos-k;
        const drift=knots[k]*(1-t)+knots[k+1]*t;
        const dist=Math.abs(y-center-drift);const envelope=clamp((halo-dist)/Math.max(1,halo),0,1);
        let core=clamp((lineWidth+.45-dist)/Math.max(1,lineWidth),0,1)*.64;
        for(const ex of extras)core=Math.max(core,clamp((ex.thick+.4-Math.abs(y-center-drift-ex.d))/ex.thick,0,1)*ex.weight);
        const snow=((r()>.83||r()<.12)?r():0)*envelope*.46;
        const alpha=clamp((core+snow)*amt,0,.92);
        if(alpha<.012)continue;
        const luma=(r()<.14?26:(r()<.76?245:ri(r,100,255)));
        const at=(y*w+x)*4;
        for(let c=0;c<3;c++)p[at+c]=p[at+c]*(1-alpha)+luma*alpha;
      }
    }
  }
  function vhsChroma(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,104),palettes=[[239,44,182],[28,218,99],[46,72,245],[53,203,231],[240,91,52],[235,191,44]];
    for(let k=0;k<5;k++){
      const center=h*(.06+r()*.87),radius=Math.max(2,h*(.035+r()*.13)),waves=3+r()*17,phase=r()*6.28,pal=palettes[ri(r,0,palettes.length-1)],bands=[];
      const y0=Math.max(0,Math.floor(center-radius*1.5)),y1=Math.min(h,Math.ceil(center+radius*1.5));
      for(let y=y0;y<y1;y++)for(let x=0;x<w;x++){
        const drift=Math.sin((x/w)*waves+phase)*radius*.32;const env=clamp(1-Math.abs(y-center-drift)/radius,0,1);
        const modulation=.68+.32*Math.sin(x/w*12+phase);const alpha=env*modulation*.85*amt;
        if(alpha<=.012)continue;const at=(y*w+x)*4;
        p[at]=p[at]*(1-alpha)+pal[0]*alpha;p[at+1]=p[at+1]*(1-alpha)+pal[1]*alpha;p[at+2]=p[at+2]*(1-alpha)+pal[2]*alpha;
      }
    }
  }
  function vhsRGB(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,105),orig=p.slice();const dr=Math.round((.3+r()*.7)*w*.04*amt),db=-Math.round((.3+r()*.7)*w*.045*amt);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let at=(y*w+x)*4;const sxr=clamp(x-dr,0,w-1),sxb=clamp(x-db,0,w-1);p[at]=orig[(y*w+sxr)*4];p[at+2]=orig[(y*w+sxb)*4+2];}
    for(let k=0;k<5;k++){const center=Math.floor(r()*h),hh=Math.max(1,Math.floor(h*(.004+r()*.035))),off=Math.round((r()-.5)*w*.18*amt);for(let y=center;y<Math.min(h,center+hh);y++)for(let x=0;x<w;x++){let at=(y*w+x)*4,from=(y*w+clamp(x-off,0,w-1))*4;p[at]=orig[from];}}
  }
  function vhsGrain(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,106),amp=amt*47;
    for(let y=0;y<h;y++){const scan=(y%3===1)?(1-amt*.13):1;for(let x=0;x<w;x++){const at=(y*w+x)*4,delta=(r()-.5)*amp*2;for(let c=0;c<3;c++)p[at+c]=clamp((p[at+c]+delta)*scan,0,255);}}
  }
  function vhsStreaks(p,w,h,amt,seed){if(amt<=0)return;const r=rngFrom(seed,107);const colors=[[250,36,197],[49,225,78],[15,84,252],[255,250,250]];for(let k=0;k<140;k++){const y=ri(r,0,h-1),x0=ri(r,0,w-1),len=Math.round(w*(.004+r()*.16)),color=colors[ri(r,0,3)];for(let x=x0;x<Math.min(w,x0+len);x++){const at=(y*w+x)*4,alpha=amt*(.25+r()*.75);for(let c=0;c<3;c++)p[at+c]=p[at+c]*(1-alpha)+color[c]*alpha;}}}
  function drawCamera(c,stateCamera){const ctx=c.getContext('2d'),w=c.width,h=c.height,base=Math.min(w,h);
    function fontSize(item,ratio){return Math.max(9,base*ratio*(item.size/100));}
    function xy(position,width,height){const gapX=Math.max(8,w*.04),gapY=Math.max(8,h*.04);return[position.includes('left')?gapX:w-gapX-width,position.includes('top')?gapY:h-gapY-height];}
    function drawText(str,rec,color,ratio){const sz=fontSize(rec,ratio);ctx.font=`700 ${sz}px ui-monospace, Menlo, 'Courier New', monospace`;ctx.textBaseline='top';const lines=str.split('|').map(x=>x.trim()).slice(0,2);const textW=Math.max(...lines.map(line=>ctx.measureText(line).width)),lineH=sz*1.23,hh=lineH*lines.length;const [x,y]=xy(rec.position,textW,hh);
      lines.forEach((line,j)=>{ctx.fillStyle='rgba(0,0,0,.8)';ctx.fillText(line,x+Math.max(1,sz*.06),y+j*lineH+Math.max(1,sz*.06));ctx.fillStyle=color;ctx.fillText(line,x,y+j*lineH);});}
    if(stateCamera.date.on)drawText(stateCamera.date.text,stateCamera.date,'#eff3ee',.05);
    if(stateCamera.play.on)drawText('PLAY',stateCamera.play,'#f6f4ed',.038);
    if(stateCamera.rec.on){const item=stateCamera.rec,sz=fontSize(item,.038);ctx.font=`700 ${sz}px ui-monospace, Menlo, monospace`;const ww=ctx.measureText('REC').width+sz*.85,hh=sz*1.2,[x,y]=xy(item.position,ww,hh);ctx.fillStyle='#fa3f43';ctx.beginPath();ctx.arc(x+sz*.20,y+sz*.55,Math.max(2,sz*.15),0,Math.PI*2);ctx.fill();ctx.fillStyle='#ef5150';ctx.textBaseline='top';ctx.fillText('REC',x+sz*.48,y);}
    if(stateCamera.battery.on){const item=stateCamera.battery,sz=fontSize(item,.034),ww=sz*2.15,hh=sz*.75,[x,y]=xy(item.position,ww+sz*.25,hh);ctx.strokeStyle='#f5f4e9';ctx.lineWidth=Math.max(1,sz*.07);ctx.strokeRect(x,y,ww,hh);ctx.fillStyle='#f4f3e9';ctx.fillRect(x+ww,y+hh*.29,sz*.15,hh*.42);const count={FULL:4,'75%':3,'50%':2,'25%':1,LOW:1,EMPTY:0}[item.level];ctx.fillStyle=(["25%","LOW","EMPTY"].includes(item.level))?'#ff4c55':'#e9f6f1';for(let i=0;i<count;i++)ctx.fillRect(x+sz*.12+i*ww*.225,y+sz*.12,ww*.17,hh-sz*.24);}
  }
  function drawBorder(canvas,settings){if(!settings.whiteBorder)return canvas;const w=canvas.width,h=canvas.height;
    const mX=Math.round(w*.3),mY=Math.round(h*.3),out=newCanvas(w+2*mX,h+2*mY),ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(canvas,mX,mY);
    if(settings.caption&&settings.captionText){const size=Math.max(8,Math.round(Math.min(w,h)*.021*(settings.captionSize/100)));ctx.fillStyle='#2a2a2a';ctx.font=`300 ${size}px -apple-system, Helvetica, Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';const str=settings.captionText.slice(0,100),y=mY+h+h*.1;ctx.fillText(str,out.width/2,y,out.width*.90);}
    return out;
  }
  async function processImage(im,seed,opts={},sizeLimit=PREVIEW_MAX){
    const [w,h]=renderSize(im.naturalWidth||im.width, im.naturalHeight||im.height, sizeLimit==='full'?'full':String(sizeLimit));
    if(w*h>54e6)throw Error('Изображение слишком большое для мобильной памяти. Выбери экспорт до 3200 px.');
    const frame=newCanvas(w,h),ctx=frame.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0,w,h);
    let img=ctx.getImageData(0,0,w,h),p=img.data;const fac=power[state.preset]||1;
    if(state.filmEnabled){const s=clamp(state.film.strength/100,0,1);
      if(activeLook&&activeLook.fields)filmXMP(p,activeLook,s);
      else filmBuiltin(p,looks[state.film.name],s);
      if(state.film.customLut&&cubeLut)applyCube(p,cubeLut,s);
      filmGrain(p,w,h,state.film.grain/100,seed);
      filmVignette(p,w,h,state.film.vignette/100);
    }
    if(state.vhsEnabled && state.master>0){const m=clamp(state.master/100*fac,0,1.6),fx=state.fx;
      vhsWobble(p,w,h,clamp(fx.wobble/100*m,0,1.3),seed);
      vhsTear(p,w,h,clamp(fx.tear/100*m,0,1.3),seed);
      vhsChroma(p,w,h,clamp(fx.chroma/100*m,0,1.3),seed);
      vhsRGB(p,w,h,clamp(fx.rgb/100*m,0,1.3),seed);
      vhsHiss(p,w,h,clamp(fx.hiss/100*m,0,1.3),seed);
      vhsStreaks(p,w,h,clamp(fx.streaks/100*m,0,1.3),seed);
      vhsGrain(p,w,h,clamp(fx.grain/100*m,0,1.3),seed);
    }
    ctx.putImageData(img,0,0);
    if(state.filmEnabled)paintFilmExtras(frame,w,h,state.film,seed);
    paintEdgeBurns(frame,state.edgeBurn,selectedFilmIsMonochrome());
    drawCamera(frame,state.camera);
    return state.filmEnabled ? drawBorder(frame,state.film) : frame;
  }
  // Catalogue: local recipes plus XMP imports persisted in IndexedDB.
  function catalog(){return Object.keys(looks).map(name=>({id:'builtin:'+name,name,category:name.split(' ')[0],type:'builtin'}))
    .concat(xmpProfiles.map(p=>({id:p.id,name:p.name,category:p.category||'XMP',type:'xmp'})));}
  function shownFilms(){const q=$('filmSearch').value.trim().toLocaleLowerCase('ru'),cat=$('filmCategory').value;
    return catalog().filter(it=>(cat==='Все'||it.category===cat)&&(!q||it.name.toLocaleLowerCase('ru').includes(q)));
  }
  function refreshCategories(){const old=$('filmCategory').value;const arr=[...new Set(catalog().map(p=>p.category))].sort((a,b)=>a.localeCompare(b));$('filmCategory').replaceChildren();let opt=new Option('Все категории','Все');$('filmCategory').add(opt);for(const x of arr)$('filmCategory').add(new Option(x,x));$('filmCategory').value=arr.includes(old)?old:'Все';}
  function getSampleImage(){if(original){const c=newCanvas(90,90),cx=c.getContext('2d');const sw=original.naturalWidth||original.width,sh=original.naturalHeight||original.height;const side=Math.min(sw,sh),x=(sw-side)/2,y=(sh-side)/2;cx.drawImage(original,x,y,side,side,0,0,90,90);return c;}
    const c=newCanvas(90,90),cx=c.getContext('2d');let grd=cx.createLinearGradient(0,0,90,90);grd.addColorStop(0,'#cf896d');grd.addColorStop(.35,'#6c9c8d');grd.addColorStop(.75,'#455e79');grd.addColorStop(1,'#a8b97f');cx.fillStyle=grd;cx.fillRect(0,0,90,90);cx.fillStyle='rgba(245,214,178,.74)';cx.beginPath();cx.arc(44,32,14,0,Math.PI*2);cx.fill();cx.fillStyle='rgba(42,46,40,.62)';cx.fillRect(14,52,61,27);return c;
  }
  function paintFilmThumb(canvas,item,sample){const ctx=canvas.getContext('2d',{willReadFrequently:true});canvas.width=90;canvas.height=90;ctx.drawImage(sample,0,0,90,90);const img=ctx.getImageData(0,0,90,90);
    if(item.type==='builtin')filmBuiltin(img.data,looks[item.name],.95);
    else filmXMP(img.data,xmpProfiles.find(p=>p.id===item.id),.95);
    ctx.putImageData(img,0,0);
  }
  function showFilmGrid(){refreshCategories();renderFilmPage();renderFavoritesPage();}
  function favoriteItems(){return catalog().filter(item=>state.favoriteFilms.includes(item.id));}
  function renderFilmCards(grid,items){
    grid.replaceChildren();const sample=getSampleImage();
    for(const item of items){
      const wrap=document.createElement('div');wrap.className='filmcardWrap';
      const btn=document.createElement('button');btn.type='button';btn.className='filmcard';
      if(state.film.profileId===item.id||(!state.film.profileId&&item.type==='builtin'&&state.film.name===item.name))btn.classList.add('selected');
      const cv=document.createElement('canvas');cv.className='thumb';paintFilmThumb(cv,item,sample);
      const txt=document.createElement('span');txt.textContent=item.name.replace(' — стиль','');btn.title=item.name;btn.append(cv,txt);
      btn.addEventListener('click',()=>{
        if(item.type==='xmp'){state.film.profileId=item.id;activeLook=xmpProfiles.find(x=>x.id===item.id);}
        else{state.film.name=item.name;state.film.profileId='';activeLook=null;}
        state.filmEnabled=true;$('filmEnabled').checked=true;persist();
        document.querySelectorAll('.filmcard.selected').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');schedulePreview();
      });
      const star=document.createElement('button');star.type='button';star.className='favoriteToggle';
      const marked=state.favoriteFilms.includes(item.id);star.textContent=marked?'★':'☆';
      star.setAttribute('aria-pressed',String(marked));star.title=marked?'Убрать из избранного':'Добавить в избранное';star.setAttribute('aria-label',star.title+': '+item.name);
      star.addEventListener('click',()=>{
        if(state.favoriteFilms.includes(item.id))state.favoriteFilms=state.favoriteFilms.filter(id=>id!==item.id);
        else state.favoriteFilms.push(item.id);
        persist();renderFilmPage();renderFavoritesPage();
      });
      wrap.append(btn,star);grid.append(wrap);
    }
  }
  function renderFilmPage(){
    const items=shownFilms(),pages=Math.max(1,Math.ceil(items.length/FILM_PAGE_SIZE));filmPage=clamp(filmPage,0,pages-1);
    $('filmCount').textContent=`${items.length} профилей · ${Object.keys(looks).length} встроено · ${xmpProfiles.length} XMP · ★ ${state.favoriteFilms.length}`;
    $('filmPageLabel').textContent=`${filmPage+1} / ${pages}`;
    $('prevFilmPage').disabled=filmPage===0;$('nextFilmPage').disabled=filmPage>=pages-1;
    renderFilmCards($('filmGrid'),items.slice(filmPage*FILM_PAGE_SIZE,(filmPage+1)*FILM_PAGE_SIZE));
  }
  function renderFavoritesPage(){
    const items=favoriteItems(),pages=Math.max(1,Math.ceil(items.length/FILM_PAGE_SIZE));favoritesPage=clamp(favoritesPage,0,pages-1);
    $('favoritesCount').textContent=items.length?`${items.length} плёнок в избранном`:
      (state.favoriteFilms.length?'Избранные плёнки сейчас недоступны. Проверь импорт XMP.':'Пока пусто — нажми ☆ на понравившихся плёнках в FILM.');
    $('favoritesPageLabel').textContent=items.length?`${favoritesPage+1} / ${pages}`:'';
    $('prevFavoritesPage').disabled=favoritesPage===0;$('nextFavoritesPage').disabled=favoritesPage>=pages-1;
    renderFilmCards($('favoritesGrid'),items.slice(favoritesPage*FILM_PAGE_SIZE,(favoritesPage+1)*FILM_PAGE_SIZE));
  }
  function parseXMP(str,filename){const xml=new DOMParser().parseFromString(str,'application/xml');if(xml.querySelector('parsererror'))return null;
    const nodes=Array.from(xml.getElementsByTagName('*'));
    const desc=nodes.find(n=>n.localName==='Description'&&Array.from(n.attributes||[]).some(a=>a.name.includes('ProcessVersion')||a.name.includes('PresetType')||a.name.includes('Name')));
    if(!desc)return null;const fields={};for(const attr of desc.attributes){if(attr.name.includes('crs:')||attr.namespaceURI==='http://ns.adobe.com/camera-raw-settings/1.0/')fields[attr.localName]=attr.value;}
    const name=(fields.Name||filename.replace(/\.xmp$/i,'')).replace(/\s+/g,' ').trim().slice(0,95);
    const group=nodes.find(n=>n.localName==='Group');let category='EmulsionPresets';if(group){const text=Array.from(group.getElementsByTagName('*')).find(n=>n.localName==='li')?.textContent?.trim();if(text)category=text.slice(0,60);}
    const tone=nodes.find(n=>n.localName==='ToneCurvePV2012'),curve=[];if(tone)for(const n of Array.from(tone.getElementsByTagName('*')).filter(n=>n.localName==='li')){const parts=(n.textContent||'').split(',').map(Number);if(parts.length===2&&parts.every(Number.isFinite))curve.push(parts);}
    const id='xmp:'+((fields.UUID||filename).replace(/[^a-z0-9_-]/gi,'_').slice(0,92));
    return{id,name,category,fields,curve:curve.length>1?curve:null};
  }
  async function importXMP(file){if(!file) return; if(file.size>40*1024*1024)throw Error('Архив больше 40 МБ — слишком много для мобильного импорта');
    const found=[];
    if(file.name.toLowerCase().endsWith('.xmp')){const rec=parseXMP(await file.text(),file.name);if(rec)found.push(rec);}
    else if(file.name.toLowerCase().endsWith('.zip')){
      const zip=await JSZip.loadAsync(file);let count=0;
      for(const [name,ent] of Object.entries(zip.files)){
        if(ent.dir||!name.toLowerCase().endsWith('.xmp'))continue;if(++count>1200)throw Error('В архиве слишком много файлов XMP');
        const text=await ent.async('string');if(text.length>512000)continue;const rec=parseXMP(text,name.split('/').pop());if(rec)found.push(rec);
      }
    }else throw Error('Выбери файл .xmp или .zip с XMP-профилями');
    if(!found.length)throw Error('Не удалось прочитать ни одного Lightroom XMP-пресета');
    await dbPutMany('xmp',found);
    xmpProfiles=await dbAll('xmp');showFilmGrid();
    $('importStatus').textContent=`Импортировано ${found.length} · всего в памяти телефона ${xmpProfiles.length} XMP`;
    notify(`Установлено ${found.length} XMP-пресетов. Теперь они доступны офлайн. Рекомендую сразу сохранить резервную копию.`);
  }
  function parseCube(text,name){let n=0,data=[];
    for(const line0 of text.split(/\r?\n/)){const line=line0.split('#')[0].trim();if(!line||line.startsWith('TITLE'))continue;
      let a=line.split(/\s+/);if(a[0]==='LUT_3D_SIZE'){n=Number(a[1]);if(!Number.isInteger(n)||n<2||n>33)throw Error('На iPhone поддерживаются LUT 2–33');}
      else if(a[0]==='LUT_1D_SIZE')throw Error('LUT 1D не поддерживается');
      else if(a.length===3&&a.every(x=>Number.isFinite(Number(x))))data.push(...a.map(Number));
    }
    if(!n||data.length!==n*n*n*3)throw Error('Некорректный .cube LUT');
    return{id:'custom',name,size:n,table:data};
  }
  async function importLUT(file){if(!file)return;if(file.size>7e6)throw Error('LUT слишком большой — предел 7 МБ');const record=parseCube(await file.text(),file.name);
    await dbPutMany('assets',[record]);cubeLut=record;state.film.customLut=true;state.filmEnabled=true;$('filmEnabled').checked=true;persist();
    $('importStatus').textContent='Загружен LUT: '+file.name+' · сохранён локально';schedulePreview();notify('LUT сохранён на телефоне для офлайн-работы.');
  }


  // One lightweight copy of the current canvas serves every editing tab.
  function syncDockCanvas(source=$('previewCanvas')){
    if(!source||source.width<2||source.height<2)return;
    const dock=$('dockCanvas'),ratio=Math.min(1,640/Math.max(source.width,source.height));
    dock.width=Math.max(1,Math.round(source.width*ratio));
    dock.height=Math.max(1,Math.round(source.height*ratio));
    dock.getContext('2d').drawImage(source,0,0,dock.width,dock.height);
  }
  function refreshDockUi(){
    const enabled=!!state.previewDock.enabled,collapsed=!!state.previewDock.collapsed;
    $('dockEnable').textContent=enabled?'▣ Превью: вкл':'▣ Превью: выкл';
    $('dockEnable').setAttribute('aria-pressed',String(enabled));
    $('floatingPreview').classList.toggle('is-collapsed',collapsed);
    $('dockExpand').textContent=collapsed?'Развернуть':'Свернуть';
    $('dockExpand').setAttribute('aria-expanded',String(!collapsed));
    $('dockExpand').setAttribute('aria-label',collapsed?'Развернуть закреплённый просмотр':'Свернуть закреплённый просмотр');
  }
  function refreshDockVisibility(){
    const dock=$('floatingPreview'),header=document.querySelector('.top');
    if(!dock||!header)return;
    const headerBottom=Math.max(0,header.getBoundingClientRect().bottom);
    dock.style.top=Math.ceil(headerBottom)+'px';
    const isEnabled=!!state.previewDock.enabled;
    const dockHeight=state.previewDock.collapsed?48:(Math.min(220,Math.max(126,window.innerHeight*.24))+50);
    document.documentElement.style.setProperty('--dock-scroll-offset',Math.ceil(headerBottom+(isEnabled?dockHeight:12)+14)+'px');
    const r=$('mainPreviewTap').getBoundingClientRect();
    const mainImageVisible=r.bottom>headerBottom+12&&r.top<window.innerHeight-80;
    dock.hidden=!isEnabled||!original||mainImageVisible;
  }
  function initDockPreview(){
    refreshDockUi();
    $('dockEnable').addEventListener('click',()=>{
      state.previewDock.enabled=!state.previewDock.enabled;
      persist();refreshDockUi();refreshDockVisibility();
    });
    $('dockExpand').addEventListener('click',()=>{
      state.previewDock.collapsed=!state.previewDock.collapsed;
      persist();refreshDockUi();refreshDockVisibility();
    });
    $('dockOpenFull').addEventListener('click',openMainViewer);
    $('dockPhoto').addEventListener('click',openMainViewer);
    let queued=false;
    function scheduleDockPosition(){
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;refreshDockVisibility();});
    }
    window.addEventListener('scroll',scheduleDockPosition,{passive:true});
    window.addEventListener('resize',scheduleDockPosition,{passive:true});
    window.visualViewport?.addEventListener('resize',scheduleDockPosition,{passive:true});
    scheduleDockPosition();
  }
  function schedulePreview(){clearTimeout(renderTimer);persist();renderTimer=setTimeout(()=>renderPreview().catch(e=>notify(e.message,true)),120);}
  async function renderPreview(){if(!original)return;if(rendering){rerender=true;return;}rendering=true;const begin=performance.now();$('renderStatus').textContent='Создаю предпросмотр…';try{
    // A short yield lets the UI update before running CPU-bound pixel processing.
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const cv=await processImage(original,state.seed,{},PREVIEW_MAX);latestPreview=cv;showingOriginal=false;setCanvas($('previewCanvas'),cv);syncDockCanvas();refreshDockVisibility();$('emptyMsg').style.display='none';
    $('renderStatus').textContent='Готово · всё обработано на iPhone';$('renderTime').textContent=Math.round(performance.now()-begin)+' мс';
  }catch(err){$('renderStatus').textContent='Ошибка: '+err.message;console.error(err);}finally{rendering=false;if(rerender){rerender=false;schedulePreview();}}}
  async function openSingle(file){if(!file)return;original=await decodeImage(file);latestPreview=null;photoName=file.name.replace(/\.[^.]+$/,'');$('photoLabel').textContent=file.name;refreshDockVisibility();
    $('sizeLabel').textContent=`${original.naturalWidth} × ${original.naturalHeight}`;state.seed=randomSeed();renderFilmPage();renderFavoritesPage();schedulePreview();$('fileSingle').value='';}

  // Main-photo viewer uses its own dialog; it must not interfere with the batch viewer.
  function clampMainViewerPan(){
    const stage=$('mainViewerStage'),canvas=$('mainViewerCanvas'),z=mainViewerView.zoom;
    const limitX=Math.max(0,(canvas.clientWidth*z-stage.clientWidth)/2);
    const limitY=Math.max(0,(canvas.clientHeight*z-stage.clientHeight)/2);
    mainViewerView.x=clamp(mainViewerView.x,-limitX,limitX);
    mainViewerView.y=clamp(mainViewerView.y,-limitY,limitY);
  }
  function paintMainViewerTransform(){
    clampMainViewerPan();
    $('mainViewerCanvas').style.transform=`translate3d(${mainViewerView.x}px,${mainViewerView.y}px,0) scale(${mainViewerView.zoom})`;
  }
  function resetMainViewerZoom(){
    mainViewerView.zoom=1;mainViewerView.x=0;mainViewerView.y=0;mainViewerView.gesture=null;
    paintMainViewerTransform();
  }
  function mainViewerZoomAt(nextZoom,clientX,clientY){
    const stage=$('mainViewerStage'),r=stage.getBoundingClientRect(),old=mainViewerView.zoom;
    const px=(clientX===undefined?r.left+r.width/2:clientX)-r.left-r.width/2;
    const py=(clientY===undefined?r.top+r.height/2:clientY)-r.top-r.height/2;
    const scale=clamp(nextZoom,1,6);
    mainViewerView.x=px-(px-mainViewerView.x)*scale/old;
    mainViewerView.y=py-(py-mainViewerView.y)*scale/old;
    mainViewerView.zoom=scale;paintMainViewerTransform();
  }
  function mainTouchPoint(t){return{x:t.clientX,y:t.clientY};}
  function mainTouchDistance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);}
  function startMainViewerGesture(ev){
    if(ev.touches.length>=2){
      const a=ev.touches[0],b=ev.touches[1];
      mainViewerView.gesture={mode:'pinch',distance:Math.max(1,mainTouchDistance(a,b)),zoom:mainViewerView.zoom,x:mainViewerView.x,y:mainViewerView.y,cx:(a.clientX+b.clientX)/2,cy:(a.clientY+b.clientY)/2};
    }else if(ev.touches.length===1){
      const p=mainTouchPoint(ev.touches[0]);
      mainViewerView.gesture={mode:'pan',x:p.x,y:p.y,fromX:mainViewerView.x,fromY:mainViewerView.y};
    }
    if(ev.cancelable)ev.preventDefault();
  }
  function moveMainViewerGesture(ev){
    const g=mainViewerView.gesture;
    if(!g)return;
    if(ev.touches.length>=2){
      if(g.mode!=='pinch'){startMainViewerGesture(ev);return;}
      const a=ev.touches[0],b=ev.touches[1],scale=clamp(g.zoom*mainTouchDistance(a,b)/g.distance,1,6);
      const stage=$('mainViewerStage').getBoundingClientRect();
      const startX=g.cx-stage.left-stage.width/2,startY=g.cy-stage.top-stage.height/2;
      const midX=(a.clientX+b.clientX)/2-stage.left-stage.width/2;
      const midY=(a.clientY+b.clientY)/2-stage.top-stage.height/2;
      mainViewerView.zoom=scale;
      mainViewerView.x=midX-(startX-g.x)*scale/g.zoom;
      mainViewerView.y=midY-(startY-g.y)*scale/g.zoom;
      paintMainViewerTransform();
    }else if(ev.touches.length===1){
      if(g.mode!=='pan'){startMainViewerGesture(ev);return;}
      const p=mainTouchPoint(ev.touches[0]);
      mainViewerView.x=g.fromX+p.x-g.x;mainViewerView.y=g.fromY+p.y-g.y;
      paintMainViewerTransform();
    }
    if(ev.cancelable)ev.preventDefault();
  }
  function endMainViewerGesture(ev){
    if(ev.touches.length)startMainViewerGesture(ev);
    else mainViewerView.gesture=null;
    if(ev.cancelable)ev.preventDefault();
  }
  function openMainViewer(){
    if(!original){notify('Сначала выбери фотографию.');return;}
    const dialog=$('mainPreviewDialog');if(dialog.open)return;
    const token=++mainViewerToken,source=original,seed=state.seed;
    $('mainViewerTitle').textContent=photoName;
    $('mainViewerStatus').textContent=latestPreview?'Увеличенный предпросмотр загружается…':'Подготавливаю фотографию…';
    if(latestPreview)setCanvas($('mainViewerCanvas'),latestPreview);
    else{const c=$('mainViewerCanvas');c.width=1;c.height=1;c.getContext('2d').clearRect(0,0,1,1);}
    dialog.showModal();resetMainViewerZoom();
    // Let the dialog paint before processing a higher-resolution view on the device.
    requestAnimationFrame(()=>setTimeout(async()=>{
      if(token!==mainViewerToken||!dialog.open)return;
      try{
        const img=await processImage(source,seed,{},DETAIL_PREVIEW_MAX);
        if(token!==mainViewerToken||!dialog.open)return;
        setCanvas($('mainViewerCanvas'),img);resetMainViewerZoom();
        $('mainViewerStatus').textContent='Разведи два пальца для приближения; двигай кадр одним пальцем.';
      }catch(e){
        if(token===mainViewerToken&&dialog.open)$('mainViewerStatus').textContent='Крупный предпросмотр недоступен: '+e.message;
      }
    },30));
  }
  function closeMainViewer(){
    ++mainViewerToken;
    if($('mainPreviewDialog').open)$('mainPreviewDialog').close();
  }
  function initMainViewerEvents(){
    $('openMainPreview').addEventListener('click',openMainViewer);
    $('mainPreviewTap').addEventListener('click',openMainViewer);
    $('mainPreviewTap').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openMainViewer();}});
    $('closeMainPreview').addEventListener('click',closeMainViewer);
    $('mainPreviewDialog').addEventListener('close',()=>{++mainViewerToken;mainViewerView.gesture=null;});
    $('mainZoomOut').addEventListener('click',()=>mainViewerZoomAt(mainViewerView.zoom/1.5));
    $('mainZoomIn').addEventListener('click',()=>mainViewerZoomAt(mainViewerView.zoom*1.5));
    $('mainZoomReset').addEventListener('click',resetMainViewerZoom);
    const stage=$('mainViewerStage');
    stage.addEventListener('touchstart',startMainViewerGesture,{passive:false});
    stage.addEventListener('touchmove',moveMainViewerGesture,{passive:false});
    stage.addEventListener('touchend',endMainViewerGesture,{passive:false});
    stage.addEventListener('touchcancel',endMainViewerGesture,{passive:false});
    stage.addEventListener('wheel',e=>{e.preventDefault();mainViewerZoomAt(mainViewerView.zoom*(e.deltaY<0?1.15:1/1.15),e.clientX,e.clientY);},{passive:false});
    window.addEventListener('resize',()=>{if($('mainPreviewDialog').open)paintMainViewerTransform();});
  }
  function toggleCompare(){if(!original||!latestPreview)return;showingOriginal=!showingOriginal;if(showingOriginal){const [w,h]=renderSize(original.naturalWidth,original.naturalHeight,String(PREVIEW_MAX));const c=newCanvas(w,h);c.getContext('2d').drawImage(original,0,0,w,h);setCanvas($('previewCanvas'),c);}else setCanvas($('previewCanvas'),latestPreview);syncDockCanvas();}
  function saveBlob(blob,filename){const a=document.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),90_000);}
  function canvasBlob(cv,type='image/jpeg',quality=.94){return new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error('Не удалось создать изображение — возможно, не хватает памяти.')),type,quality));}
  async function saveSingle(fileIm=original,filename=photoName,seed=state.seed,size=state.singleSize){if(!fileIm)throw Error('Сначала открой фотографию');
    const cv=await processImage(fileIm,seed,{},size);const type=state.exportFormat||'image/jpeg';const blob=await canvasBlob(cv,type);const ext=type==='image/png'?'png':'jpg';
    const outName=`${filename}_VHS_FILM.${ext}`;let shared=false;
    try{const file=new File([blob],outName,{type});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'VHS Glitch Studio'});shared=true;}}catch(e){if(e.name==='AbortError'){return;}console.warn('Share unavailable',e);}
    if(!shared)saveBlob(blob,outName);notify(shared?'Открылось меню отправки. Выбери «Сохранить изображение» или «Сохранить в Файлы».':`Файл ${outName} (${formatBytes(blob.size)}) сохранён в «Загрузки» Safari или «Файлы».`);
  }
  async function openBatch(files){if(!files||!files.length)return;if(files.length>50){notify('Можно выбрать не больше 50 фотографий.',true);return;}
    batchFiles=Array.from(files).map((file,index)=>({file,index,seed:randomSeed()}));batchPage=0;showTab('batch');$('batchStatus').textContent=`Выбрано ${batchFiles.length} фото`;
    $('batchFiles').value='';await renderBatchPage();}
  async function renderBatchPage(){const token=++pageToken,grid=$('batchGrid');grid.replaceChildren();if(!batchFiles.length){$('pageCount').textContent='—';return;}
    const pages=Math.ceil(batchFiles.length/6);batchPage=clamp(batchPage,0,pages-1);$('pageCount').textContent=`${batchPage+1} / ${pages} · ${batchFiles.length} фото`;
    $('prevPage').disabled=batchPage===0;$('nextPage').disabled=batchPage>=pages-1;
    const files=batchFiles.slice(batchPage*6,batchPage*6+6);for(const item of files){if(token!==pageToken)break;
      const box=document.createElement('div');box.className='batchItem';const cv=document.createElement('canvas');cv.width=440;cv.height=340;
      const name=document.createElement('div');name.textContent=item.file.name;const zoom=document.createElement('button');zoom.className='btn mini';zoom.textContent='Увеличить кадр';zoom.addEventListener('click',()=>openBatchZoom(item.index));box.append(cv,name,zoom);grid.append(box);
      try{const im=await decodeImage(item.file);const result=await processImage(im,item.seed,{},BATCH_PREVIEW);if(token!==pageToken)break;setCanvas(cv,result);}catch(e){name.textContent=item.file.name+' · ошибка: '+e.message;}
      await new Promise(r=>setTimeout(r,0));
    }
  }
  async function openBatchZoom(index){const item=batchFiles[index];if(!item)return;dialogFileIndex=index;$('dialogTitle').textContent=item.file.name;
    const im=await decodeImage(item.file),cv=await processImage(im,item.seed,{},1200);setCanvas($('largeCanvas'),cv);$('photoDialog').showModal();}
  async function saveZoom(){if(dialogFileIndex<0)return;const item=batchFiles[dialogFileIndex];const im=await decodeImage(item.file);await saveSingle(im,item.file.name.replace(/\.[^.]+$/,''),item.seed,state.singleSize);}
  async function exportBatch(){if(!batchFiles.length){notify('Сначала выбери фотографии',true);return;}if(busy)return;busy=true;$('exportBatch').disabled=true;
    const zip=new JSZip(),n=batchFiles.length,start=Date.now();try{
      // Same settings across all: UI is locked for the duration of the export.
      document.querySelectorAll('.tabs button, .panel input, .panel select, .panel .btn').forEach(el=>{if(el!==$('exportBatch'))el.disabled=true;});
      for(let i=0;i<n;i++){
        const item=batchFiles[i];$('progressText').textContent=`Обработка ${i+1} / ${n}: ${item.file.name}`;
        await new Promise(r=>setTimeout(r,0));const im=await decodeImage(item.file);
        const cv=await processImage(im,item.seed,{},state.batchSize),blob=await canvasBlob(cv,'image/jpeg',.91);
        let name=item.file.name.replace(/\.[^.]+$/,'').slice(0,90).replace(/[\\/:*?"<>|]/g,'_');zip.file(`${String(i+1).padStart(2,'0')}_${name}_VHS.jpg`,blob,{binary:true,compression:'STORE'});
      }
      $('progressText').textContent=`Упаковываю ${n} фото в ZIP…`;
      const result=await zip.generateAsync({type:'blob',compression:'STORE',streamFiles:true},meta=>{$('progressText').textContent=`Создаю ZIP: ${Math.round(meta.percent)}%`;});
      saveBlob(result,`VHS_Studio_${n}_photos.zip`);$('progressText').textContent=`Готово: ${n} фото · ZIP ${formatBytes(result.size)} · ${Math.round((Date.now()-start)/1000)} с`;
      notify('ZIP создан. Открой «Загрузки» или приложение «Файлы» на iPhone.');
    }catch(e){notify('Ошибка Batch: '+e.message,true);$('progressText').textContent=e.message;}
    finally{busy=false;$('exportBatch').disabled=false;document.querySelectorAll('.tabs button, .panel input, .panel select, .panel .btn').forEach(el=>el.disabled=false);}
  }

  function showTab(id){if(id==='settings'){$('panel-settings').classList.add('active');document.querySelectorAll('.panel').forEach(p=>{if(p.id!=='panel-settings')p.classList.remove('active');});document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('active'));}
    else{document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='panel-'+id));document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));}
    if(id==='film')renderFilmPage();if(id==='favorites')renderFavoritesPage();const destination=document.getElementById('panel-'+id);if(destination)destination.scrollIntoView({block:'start',behavior:'smooth'});
  }
  async function exportBackup(){const payload={kind:'VHS_STUDIO_MOBILE_BACKUP',version:1,created:new Date().toISOString(),settings:state,xmpProfiles:await dbAll('xmp'),lut:await dbAll('assets')};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});saveBlob(blob,'VHS_Studio_BACKUP_'+new Date().toISOString().slice(0,10)+'.json');notify('Резервная копия создана. Сохрани файл в «Файлы» и по возможности на другое устройство.');}
  async function importBackup(file){if(!file)return;if(file.size>25e6)throw Error('Резервная копия слишком большая');const record=JSON.parse(await file.text());
    if(record.kind!=='VHS_STUDIO_MOBILE_BACKUP'||record.version!==1||!record.settings)throw Error('Файл не является резервной копией VHS Studio');
    if(Array.isArray(record.xmpProfiles)&&record.xmpProfiles.length<=1200){await dbClear('xmp');await dbPutMany('xmp',record.xmpProfiles);xmpProfiles=await dbAll('xmp');}
    if(Array.isArray(record.lut)&&record.lut.length<=5){await dbClear('assets');await dbPutMany('assets',record.lut);cubeLut=record.lut.find(r=>r.id==='custom')||null;}
    state={...clone(defaults),...record.settings};persist();location.reload();
  }
  async function checkOffline(){let ready=false;try{
    if(('serviceWorker' in navigator) && (location.protocol==='https:'||location.hostname==='localhost')){
      await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      await navigator.serviceWorker.ready;
      const cache=await caches.open('vhs-mobile-v1.0.6');const files=['./index.html','./styles.css','./app.js','./looks.json','./jszip.min.js'];
      ready=(await Promise.all(files.map(p=>cache.match(p)))).every(Boolean);
    }
  }catch(e){console.warn('Service worker status',e);}
    $('onlineState').textContent=ready?'ГОТОВО ОФЛАЙН':'НУЖЕН HTTPS';
    $('offlineDetail').textContent=ready?'Основные файлы закэшированы. Теперь отключи интернет и открой иконку приложения для настоящей проверки.':'Для установки и офлайн-работы нужно сначала открыть приложение по адресу HTTPS (например, GitHub Pages) через Safari. Если это первый запуск по HTTPS, обнови страницу после завершения установки.';
  }
  function bindEvents(){
    document.querySelectorAll('.tabs button').forEach(btn=>btn.addEventListener('click',()=>showTab(btn.dataset.tab)));
    $('openSettings').addEventListener('click',()=>showTab('settings'));
    $('fileSingle').addEventListener('change',async e=>{try{await openSingle(e.target.files[0]);}catch(err){notify(err.message,true);}});
    $('reroll').addEventListener('click',()=>{state.seed=randomSeed();schedulePreview();});
    $('compare').addEventListener('click',toggleCompare);
    $('saveOne').addEventListener('click',async()=>{try{await saveSingle();}catch(e){notify(e.message,true);}});
    $('vhsEnabled').checked=state.vhsEnabled;$('vhsEnabled').addEventListener('change',e=>{state.vhsEnabled=e.target.checked;schedulePreview();});
    $('filmEnabled').checked=state.filmEnabled;$('filmEnabled').addEventListener('change',e=>{state.filmEnabled=e.target.checked;schedulePreview();});
    $('vhsPreset').value=state.preset;$('vhsPreset').addEventListener('change',e=>{state.preset=e.target.value;schedulePreview();});
    $('filmSearch').addEventListener('input',()=>{filmPage=0;renderFilmPage();});
    $('filmCategory').addEventListener('change',()=>{filmPage=0;renderFilmPage();});
    $('prevFilmPage').addEventListener('click',()=>{filmPage--;renderFilmPage();});
    $('nextFilmPage').addEventListener('click',()=>{filmPage++;renderFilmPage();});
    $('prevFavoritesPage').addEventListener('click',()=>{favoritesPage--;renderFavoritesPage();});
    $('nextFavoritesPage').addEventListener('click',()=>{favoritesPage++;renderFavoritesPage();});
    $('xmpFile').addEventListener('change',async e=>{try{for(const file of e.target.files)await importXMP(file);}catch(err){$('importStatus').textContent=err.message;notify(err.message,true);}e.target.value='';});
    $('lutFile').addEventListener('change',async e=>{try{await importLUT(e.target.files[0]);}catch(err){notify(err.message,true);}e.target.value='';});
    $('clearLut').addEventListener('click',()=>{state.film.customLut=false;persist();schedulePreview();notify('LUT отключён. Сохранённый файл остаётся в памяти для восстановления.');});
    $('batchFiles').addEventListener('change',e=>openBatch(e.target.files).catch(err=>notify(err.message,true)));
    $('prevPage').addEventListener('click',()=>{batchPage--;renderBatchPage().catch(err=>notify(err.message,true));});
    $('nextPage').addEventListener('click',()=>{batchPage++;renderBatchPage().catch(err=>notify(err.message,true));});
    $('batchRegen').addEventListener('click',()=>{for(const f of batchFiles)f.seed=randomSeed();renderBatchPage().catch(err=>notify(err.message,true));});
    $('exportBatch').addEventListener('click',()=>exportBatch());
    $('batchSize').value=state.batchSize;$('batchSize').addEventListener('change',e=>{state.batchSize=e.target.value;persist();});
    $('singleSize').value=state.singleSize;$('singleSize').addEventListener('change',e=>{state.singleSize=e.target.value;persist();});
    $('exportFormat').value=state.exportFormat;$('exportFormat').addEventListener('change',e=>{state.exportFormat=e.target.value;persist();});
    $('protectStorage').addEventListener('click',async()=>{try{const ok=await navigator.storage?.persist?.();notify(ok?'Система разрешила постоянное хранение данных.':'iOS не подтвердила постоянное хранение. Сохрани резервную копию в «Файлы».');}catch(e){notify('Постоянное хранение не поддерживается. Сделай резервную копию.',true);}});
    $('closeDialog').addEventListener('click',()=>$('photoDialog').close());
    $('saveDialog').addEventListener('click',()=>saveZoom().catch(err=>notify(err.message,true)));
    $('backupExport').addEventListener('click',()=>exportBackup().catch(err=>notify(err.message,true)));
    $('backupImport').addEventListener('change',async e=>{try{await importBackup(e.target.files[0]);}catch(err){notify(err.message,true);}e.target.value='';});
    $('installHelp').addEventListener('click',()=>$('helpDialog').showModal());
    $('closeHelp').addEventListener('click',()=>$('helpDialog').close());
  }
  async function init(){
    mountControls();bindEvents();initMainViewerEvents();mountEdgeBurnControls();initDockPreview();
    try{Object.assign(looks,await (await fetch('./looks.json')).json());}catch(err){notify('Каталог плёнок не загрузился. Открой программу через HTTPS или локальный сервер.');}
    xmpProfiles=await dbAll('xmp');cubeLut=(await dbAll('assets')).find(x=>x.id==='custom')||null;
    if(state.film.profileId)activeLook=xmpProfiles.find(p=>p.id===state.film.profileId)||null;
    showFilmGrid();checkOffline();
  }
  init().catch(err=>{console.error(err);notify('Ошибка инициализации: '+err.message,true);});
})();
