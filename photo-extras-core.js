/* VHS Photo Studio 1.2.0 — photographic adjustments, still-specific glitch
   effects, masks and preset utilities. Never uploads source pixels. */
(function(root){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const defaults=()=>({
 correction:{exposure:0,brightness:0,contrast:0,highlights:0,shadows:0,whites:0,blacks:0,
  temperature:0,tint:0,saturation:0,vibrance:0,hue:0,
  clarity:0,texture:0,dehaze:0,sharpness:0,denoise:0,fade:0,vignette:0},
 glitch:{enabled:false,mode:'vhs',modeStrength:70,seed:318719,aging:0,layers:[],
  effects:{tapeChew:0,pause:0,rewind:0,vhold:0,ghost:0,colorBurst:0,
   headClog:0,dropouts:0,agc:0,tapeSplice:0,frameEcho:0,
   interlace:0,datamosh:0,pixelSort:0,rf:0}},
 damage:{enabled:false,type:'edge-left',leak:0,dust:0,grain:0,
  scratches:0,flicker:0,halation:0,seed:483291},
 masks:{enabled:true,brush:'pixel',radius:24,strength:85,
  strokes:[],faces:[],style:'pixel',faceSize:18,faceBlur:16,mode:'all',originalId:''},
 colorCopy:{enabled:false,strength:70,target:null},
 polaroid:root.VHSPhotoPolaroid?.defaults?.()||{enabled:false},
 cassettes:[],selectedCassetteId:null,beforeCassette:null,
 batchAging:false,showHelp:false
});
function hydrate(raw){
 const d=defaults(),s=raw&&typeof raw==='object'?raw:{};
 for(const k of ['correction','glitch','damage','masks','colorCopy','polaroid'])
  if(s[k]&&typeof s[k]==='object')d[k]={...d[k],...s[k]};
 d.glitch.effects={...defaults().glitch.effects,...(s.glitch?.effects||{})};
 d.glitch.layers=Array.isArray(s.glitch?.layers)?s.glitch.layers.slice(0,25):[];
 d.masks.strokes=Array.isArray(s.masks?.strokes)?s.masks.strokes.slice(-140):[];
 d.masks.faces=Array.isArray(s.masks?.faces)?s.masks.faces.slice(0,16):[];
 d.polaroid=root.VHSPhotoPolaroid?.hydrate?.(s.polaroid)||d.polaroid;
 d.cassettes=Array.isArray(s.cassettes)?s.cassettes.slice(0,60):[];
 d.selectedCassetteId=s.selectedCassetteId||null;
 d.beforeCassette=s.beforeCassette||null;
 d.batchAging=!!s.batchAging;d.showHelp=!!s.showHelp;
 return d;
}
function activeAdjustment(settings){
 return Object.values(settings||{}).some(v=>Number(v)!==0);
}
function adjustment(image,cfg={}){
 if(!activeAdjustment(cfg))return image;
 const p=image.data,w=image.width,h=image.height;
 const exposure=2**clamp(cfg.exposure,-3,3);
 const brightness=clamp(cfg.brightness,-100,100)*.85;
 const contrast=1+clamp(cfg.contrast,-100,100)*.008;
 const shadows=clamp(cfg.shadows,-100,100)/100;
 const highlights=clamp(cfg.highlights,-100,100)/100;
 const whites=clamp(cfg.whites,-100,100)/100;
 const blacks=clamp(cfg.blacks,-100,100)/100;
 const warmth=clamp(cfg.temperature,-100,100),tint=clamp(cfg.tint,-100,100);
 const saturation=1+clamp(cfg.saturation,-100,100)/100;
 const vibrance=clamp(cfg.vibrance,-100,100)/100;
 const hue=clamp(cfg.hue,-180,180)*Math.PI/180;
 const ca=Math.cos(hue),sa=Math.sin(hue);
 const clarity=clamp(cfg.clarity,-100,100)/100;
 const texture=clamp(cfg.texture,-100,100)/100;
 const sharpness=clamp(cfg.sharpness,0,100)/100;
 const denoise=clamp(cfg.denoise,0,100)/100;
 const dehaze=clamp(cfg.dehaze,-100,100)/100;
 const fade=clamp(cfg.fade,0,100)/100;
 const vignette=clamp(cfg.vignette,-100,100)/100;
 let bw=0,bh=0,blur=null;
 if(Math.abs(clarity)+Math.abs(texture)+sharpness+denoise>.0001){
  // Small luminance reference (not an entire second full-resolution bitmap).
  const s=document.createElement('canvas');
  const sc=Math.min(1,Math.max(80,Math.min(640,Math.max(w,h)/7))/Math.max(w,h));
  s.width=bw=Math.max(1,Math.round(w*sc));
  s.height=bh=Math.max(1,Math.round(h*sc));
  const bc=s.getContext('2d',{willReadFrequently:true});
  bc.drawImage(image.canvas||image.source,0,0,w,h,0,0,bw,bh);
  blur=bc.getImageData(0,0,bw,bh).data;
 }
 // Neutral color reference: sampled bright low-saturation pixels for dehaze.
 let air=225;
 if(Math.abs(dehaze)>.0001){
  const vals=[];const step=Math.max(1,Math.floor(p.length/4/2500));
  for(let j=0;j<p.length;j+=4*step)vals.push(Math.min(p[j],p[j+1],p[j+2]));
  vals.sort((a,b)=>b-a);air=vals[Math.floor(vals.length*.12)]||225;
 }
 const rw=Math.max(1,w-1),rh=Math.max(1,h-1);
 for(let y=0;y<h;y++){
  const cy=2*y/rh-1;
  for(let x=0;x<w;x++){
   const k=(y*w+x)*4;if(p[k+3]<1)continue;
   let r=p[k],g=p[k+1],b=p[k+2];
   const oldLum=.299*r+.587*g+.114*b;
   const low=clamp((130-oldLum)/130,0,1),hi=clamp((oldLum-110)/145,0,1);
   const white=clamp((oldLum-195)/60,0,1),black=clamp((60-oldLum)/60,0,1);
   const offset=brightness+shadows*52*low+highlights*52*hi+
    whites*46*white+blacks*46*black;
   r=(r*exposure-127.5)*contrast+127.5+offset;
   g=(g*exposure-127.5)*contrast+127.5+offset;
   b=(b*exposure-127.5)*contrast+127.5+offset;
   if(dehaze){
    const transmission=clamp(1-dehaze*.26,.56,1.30);
    const veil=air*(1-transmission);
    r=(r-veil)/transmission;g=(g-veil)/transmission;b=(b-veil)/transmission;
   }
   r+=warmth*.36+tint*.17;
   g-=tint*.35;
   b-=warmth*.36+tint*.17;
   const l=.299*r+.587*g+.114*b;
   const spread=(Math.max(r,g,b)-Math.min(r,g,b))/255;
   const sat=saturation*(1+vibrance*(1-spread)*.76);
   r=l+(r-l)*sat;g=l+(g-l)*sat;b=l+(b-l)*sat;
   if(hue){
    const u=r-g,v=b-g;
    const uu=u*ca-v*sa,vv=u*sa+v*ca;
    const yy=.299*r+.587*g+.114*b;
    g=yy-.299*uu-.114*vv;
    r=g+uu;b=g+vv;
   }
   if(blur){
    const bx=Math.min(bw-1,Math.floor(x*bw/w)),by=Math.min(bh-1,Math.floor(y*bh/h));
    const j=(by*bw+bx)*4;
    const soft=.299*blur[j]+.587*blur[j+1]+.114*blur[j+2];
    const detail=oldLum-soft;
    const gain=clarity*.31+texture*.31+sharpness*.52-denoise*.36;
    r+=detail*gain;g+=detail*gain;b+=detail*gain;
   }
   if(fade){
    const amount=fade*.40;r=r*(1-amount)+128*amount;
    g=g*(1-amount)+128*amount;b=b*(1-amount)+128*amount;
   }
   if(vignette){
    const cx=2*x/rw-1,dist=Math.min(1,(cx*cx+cy*cy)*.53);
    const value=1-vignette*dist*.80;
    r*=value;g*=value;b*=value;
   }
   p[k]=clamp(r,0,255);p[k+1]=clamp(g,0,255);p[k+2]=clamp(b,0,255);
  }
 }
 return image;
}
function palette(data,w,h){
 const step=Math.max(1,Math.floor(w*h/18000));
 let mean=[0,0,0],v=[0,0,0],n=0;
 for(let i=0;i<w*h;i+=step){
  const j=i*4;if(data[j+3]<128)continue;
  n++;for(let k=0;k<3;k++){
   const diff=data[j+k]-mean[k];mean[k]+=diff/n;v[k]+=diff*(data[j+k]-mean[k]);
  }
 }
 return {mean,spread:v.map(x=>Math.sqrt(Math.max(1,x/Math.max(1,n-1))))};
}
function colorMatch(data,w,h,target,amount=70){
 if(!target?.mean||!target?.spread)return;
 const m=clamp(amount,0,100)/100;if(!m)return;
 const from=palette(data,w,h);
 const factor=target.spread.map((s,i)=>clamp(s/Math.max(8,from.spread[i]),.4,2));
 for(let i=0;i<data.length;i+=4){
  for(let k=0;k<3;k++){
   const val=(data[i+k]-from.mean[k])*factor[k]+target.mean[k];
   data[i+k]=clamp(data[i+k]*(1-m)+val*m,0,255);
  }
 }
}
const random=(seed,salt)=>{let n=(seed^Math.imul(salt+1,0x9e3779b1))>>>0;
 n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;return((n^n>>>16)>>>0)/4294967296;};
const effects=[
 ['tapeChew','Зажёванная кассета'],['pause','Застывший кадр'],['rewind','Перемотка'],
 ['vhold','Вертикальный срыв'],['ghost','Двойной сигнал'],['colorBurst','Срыв цветности'],
 ['headClog','Засорение головки'],['dropouts','Выпадение строк'],['agc','Скачок яркости'],
 ['tapeSplice','Повреждённый стык'],['frameEcho','Шлейф кадра'],['interlace','Чересстрочность'],
 ['datamosh','Цифровой распад'],['pixelSort','Pixel Sorting'],['rf','Помехи эфира']
];
// Synthesise 'frame memory' for the three temporal-only effects in a photo;
// all other signal defects delegate to the existing video algorithm.
function glitch(canvas,cfg,seed){
 if(!cfg?.enabled)return;
 const w=canvas.width,h=canvas.height;
 const fx={...cfg.effects};
 for(const layer of cfg.layers||[])if(layer?.enabled!==false&&layer?.effect)
  fx[layer.effect]=clamp((fx[layer.effect]||0)+Number(layer.strength||0),0,100);
 const aging=clamp(cfg.aging,0,100)/100;
 if(aging){
  for(const [name,coef] of [['tapeChew',55],['headClog',37],['dropouts',47],
   ['rf',35],['colorBurst',28],['agc',22]]){
   fx[name]=Math.max(fx[name]||0,aging*coef);
  }
 }
 if(!effects.some(([k])=>Number(fx[k])>0)&&(!cfg.mode||cfg.mode==='vhs'))return;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 const data=ctx.getImageData(0,0,w,h);
 const p=data.data,safeSeed=((Number(cfg.seed)||0)^seed)>>>0;
 const srcMode=['vhs','minidv','crt','night'].includes(cfg.mode)?cfg.mode:'vhs';
 // Processor works on the same still. For very large images, process in
 // 1280px space and composite only damaged rows/blocks; no whole-photo resize.
 const limit=1920,scale=Math.min(1,limit/Math.max(w,h));
 if(scale===1){
  const processor=root.VHSVideoGlitchFX?.createProcessor();
  if(processor){
   const t=.6+(safeSeed%1000)/370;
   const synthetic=(fx.frameEcho||fx.datamosh)?new Uint8ClampedArray(p):null;
   if(synthetic){
    for(let y=0;y<h;y++)for(let x=2;x<w;x++){
     const i=(y*w+x)*4,j=i-8;
     synthetic[i]=p[j];synthetic[i+1]=p[j+1];synthetic[i+2]=p[j+2];
    }
    processor.previous=synthetic;processor.lastWidth=w;processor.lastHeight=h;
    processor.previousTime=t-.08;
   }
   processor.apply(p,w,h,{time:t,seed:safeSeed,mode:srcMode,
    modeStrength:cfg.modeStrength||70,tape:'used',
    manualEffects:Object.fromEntries(effects.map(([id])=>[id,clamp(fx[id],0,100)/100]))});
  }
  ctx.putImageData(data,0,0);return;
 }
 // High-resolution: compute glitch on a small signal layer, then transfer
 // only changed pixels at sparse stripes, keeping the original high-res
 // photograph sharp everywhere else.
 const small=document.createElement('canvas');
 small.width=Math.max(2,Math.round(w*scale));
 small.height=Math.max(2,Math.round(h*scale));
 const smallctx=small.getContext('2d',{willReadFrequently:true});
 smallctx.drawImage(canvas,0,0,small.width,small.height);
 const smallData=smallctx.getImageData(0,0,small.width,small.height);
 const before=new Uint8ClampedArray(smallData.data);
 const proc=root.VHSVideoGlitchFX?.createProcessor();
 if(!proc)return;
 const time=.6+(safeSeed%1000)/370;
 if(fx.frameEcho||fx.datamosh){
  const synthetic=new Uint8ClampedArray(before);
  for(let i=12;i<synthetic.length;i+=4){
   synthetic[i]=before[i-12];synthetic[i+1]=before[i-11];synthetic[i+2]=before[i-10];
  }
  proc.previous=synthetic;proc.previousTime=time-.08;
  proc.lastWidth=small.width;proc.lastHeight=small.height;
 }
 proc.apply(smallData.data,small.width,small.height,{time,seed:safeSeed,mode:srcMode,
  modeStrength:cfg.modeStrength||70,tape:'used',
  manualEffects:Object.fromEntries(effects.map(([id])=>[id,clamp(fx[id],0,100)/100]))});
 const W=small.width,H=small.height;
 // Color modes are full-frame; those can use 4x4 pixel-mapped high-res
 // adjustments instead of replacing the entire picture with blurry output.
 if(srcMode!=='vhs'){
  const strengths=clamp(cfg.modeStrength,0,100)/100;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const k=(y*w+x)*4,si=(Math.floor(y*H/h)*W+Math.floor(x*W/w))*4;
   // Add the chromatic/brightness delta while retaining source details.
   for(let z=0;z<3;z++)p[k+z]=clamp(p[k+z]+(smallData.data[si+z]-before[si+z])*strengths,0,255);
  }
 }
 // Displaced tracking artifacts are transferred as actual selected bands,
 // avoiding a full-frame image resample for large originals.
 const major=effects.some(([id])=>Number(fx[id])>0);
 if(major){
  const threshold=18;
  for(let y=0;y<h;y++){
   const sy=Math.floor(y*H/h),srcRow=sy*W*4;
   let damaged=0;
   for(let sx=0;sx<W;sx++){
    const i=srcRow+sx*4;
    if(Math.abs(smallData.data[i]-before[i])+
     Math.abs(smallData.data[i+1]-before[i+1])+
     Math.abs(smallData.data[i+2]-before[i+2])>threshold)damaged++;
   }
   if(damaged/W<.12)continue;
   for(let x=0;x<w;x++){
    const si=srcRow+Math.floor(x*W/w)*4,di=(y*w+x)*4;
    const delta=Math.abs(smallData.data[si]-before[si])+
     Math.abs(smallData.data[si+1]-before[si+1])+
     Math.abs(smallData.data[si+2]-before[si+2]);
    if(delta<threshold)continue;
    for(let z=0;z<3;z++)p[di+z]=clamp(p[di+z]+smallData.data[si+z]-before[si+z],0,255);
   }
  }
 }
 ctx.putImageData(data,0,0);
}
const maskScratch=document.createElement('canvas');
function styleRegion(ctx,x,y,w,h,mode,power){
 const W=ctx.canvas.width,H=ctx.canvas.height;
 const sx=Math.floor(clamp(x,0,1)*W),sy=Math.floor(clamp(y,0,1)*H);
 const sw=Math.min(W-sx,Math.max(2,Math.floor(w*W))),sh=Math.min(H-sy,Math.max(2,Math.floor(h*H)));
 if(sw<=1||sh<=1)return;
 const small=maskScratch;
 const k=clamp(power,3,100);
 const dw=Math.max(2,Math.floor(sw/(mode==='blur'?Math.max(2,k/3):Math.max(3,k/5))));
 const dh=Math.max(2,Math.floor(sh/(mode==='blur'?Math.max(2,k/3):Math.max(3,k/5))));
 // Reuse the same backing store for hundreds of adjacent finger stamps.
 if(small.width!==dw)small.width=dw;
 if(small.height!==dh)small.height=dh;
 const s=small.getContext('2d');s.imageSmoothingEnabled=mode==='blur';
 s.drawImage(ctx.canvas,sx,sy,sw,sh,0,0,small.width,small.height);
 ctx.save();ctx.imageSmoothingEnabled=mode==='blur';
 if(mode==='blur'&&'filter'in ctx)ctx.filter='blur('+Math.max(2,k/4)+'px)';
 ctx.drawImage(small,sx,sy,sw,sh);ctx.restore();
}
function masks(canvas,cfg){
 if(!cfg?.enabled)return;
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 for(const stroke of (cfg.strokes||[]).slice(-140)){
  const pts=stroke.points||[];
  const radius=clamp(stroke.radius||cfg.radius,4,100)/480,ry=radius*w/h;
  let used=0,last=null;
  for(const point of pts){
   if(!Array.isArray(point))continue;
   const count=last?Math.max(1,Math.min(15,Math.ceil(Math.hypot(point[0]-last[0],(point[1]-last[1])*h/w)/(radius*.65)))):1;
   for(let j=1;j<=count;j++){
    if(used++>500)break;
    const x=last?last[0]+(point[0]-last[0])*j/count:point[0];
    const y=last?last[1]+(point[1]-last[1])*j/count:point[1];
    styleRegion(ctx,clamp(x-radius,0,1),clamp(y-ry,0,1),radius*2,ry*2,
     stroke.mode||cfg.brush,stroke.strength||cfg.strength);
   }
   last=point;
  }
 }
 for(const f of (cfg.faces||[]).slice(0,16)){
  if(cfg.mode==='manual'&&f.auto)continue;
  if(cfg.mode==='auto'&&!f.auto)continue;
  const padX=f.w*.06,padY=f.h*.08;
  styleRegion(ctx,clamp(f.x-padX,0,1),clamp(f.y-padY,0,1),
   Math.min(1,f.w+padX*2),Math.min(1,f.h+padY*2),
   cfg.style,cfg.style==='blur'?cfg.faceBlur:cfg.faceSize);
 }
}
const factory=[
 {id:'home',name:'ДОМАШНЯЯ VHS · 1997',master:62,mode:'vhs',aging:12},
 {id:'rental',name:'ПРОКАТНАЯ · СБОИ',master:88,mode:'vhs',aging:60},
 {id:'destroyed',name:'ЗАЖЁВАННАЯ КАССЕТА',master:90,mode:'vhs',aging:95},
 {id:'hi8',name:'HI8 · КАМКОРДЕР',master:36,mode:'minidv',aging:6},
 {id:'crt',name:'CRT · ЭКРАН',master:28,mode:'crt',aging:18},
 {id:'night',name:'NIGHT VISION',master:16,mode:'night',aging:3}
];
function mix(a,b,t){
 if(typeof a==='number'&&typeof b==='number')return a+(b-a)*t;
 if(a&&b&&typeof a==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
  const result={...a};
  for(const key of Object.keys(b))if(key in a)result[key]=mix(a[key],b[key],t);
  return result;
 }
 return t<.5?a:b;
}
root.VHSPhotoExtras=Object.freeze({defaults,hydrate,activeAdjustment,adjustment,
 palette,colorMatch,effects,factory,mix,glitch,masks});
})(window);
