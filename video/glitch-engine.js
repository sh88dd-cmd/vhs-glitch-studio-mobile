/* VHS Video Lab - temporal & signal effects v0.2.0
 * Independent creative implementations inspired by published signal phenomena.
 * No code from E240, ntsc-rs-web, BENDR, or other third-party applications.
 * Seeded events and amount knobs; frame-in-time reproducible. No network APIs.
 */
(function(root){
'use strict';
const C=(x,a,b)=>Math.max(a,Math.min(b,x));
const defs=[
 {id:'tapeChew',name:'Зажёванная кассета / Tape Chew',group:'analogue',default:28,period:3.1,duration:.65},
 {id:'pause',name:'Застывшая кассета / Pause',group:'analogue',default:17,period:4.8,duration:.50},
 {id:'rewind',name:'Перемотка / Rewind',group:'analogue',default:25,period:4.2,duration:.75},
 {id:'vhold',name:'Вертикальный срыв / V-Hold',group:'analogue',default:25,period:3.5,duration:.55},
 {id:'ghost',name:'Двойной видеосигнал / Ghosting',group:'analogue',default:33,continuous:true},
 {id:'colorBurst',name:'Срыв цветности / Color Burst',group:'analogue',default:38,period:3.4,duration:.60},
 {id:'headClog',name:'Грязная видеоголовка / Head Clog',group:'analogue',default:32,period:2.9,duration:1.25},
 {id:'dropouts',name:'Выпадения строк / Dropouts',group:'analogue',default:40,period:2.1,duration:.65},
 {id:'agc',name:'Плавающая яркость / AGC',group:'analogue',default:27,continuous:true},
 {id:'tapeSplice',name:'Повреждённый стык / Tape Splice',group:'analogue',default:30,period:5.5,duration:.32},
 {id:'frameEcho',name:'Шлейф движения / Frame Echo',group:'temporal',default:25,continuous:true},
 {id:'interlace',name:'Чересстрочная съёмка / Interlacing',group:'temporal',default:32,continuous:true},
 {id:'datamosh',name:'Цифровой распад / Datamosh',group:'digital',default:28,period:3.5,duration:.85},
 {id:'pixelSort',name:'Растянутые пиксели / Pixel Sorting',group:'digital',default:22,period:3.3,duration:.46},
 {id:'rf',name:'Эфирные помехи / RF Interference',group:'analogue',default:37,period:2.8,duration:.62}
];
const modes=[
 {id:'vhs',name:'VHS / Кассета'},
 {id:'minidv',name:'MiniDV / 2000-е'},
 {id:'crt',name:'CRT / Сломанный телевизор'},
 {id:'night',name:'Night Vision / Ночная камера'}
];
const tapes=[
 {id:'svhs',name:'S-VHS · качественная',level:.60,noise:.35,head:.45},
 {id:'fresh',name:'Новая VHS',level:.85,noise:.65,head:.60},
 {id:'used',name:'Прокатная кассета',level:1.02,noise:1,head:1},
 {id:'worn',name:'Изношенная VHS',level:1.20,noise:1.4,head:1.5},
 {id:'chewed',name:'Зажёванная кассета',level:1.30,noise:1.55,head:1.8},
 {id:'copy',name:'Третья копия',level:1.24,noise:1.1,head:1.1},
 {id:'hi8',name:'Hi8 / Video8',level:.75,noise:.55,head:.60}
];
function hash(seed,id,slot){
 let z=(seed^Math.imul(id,0x9e3779b1)^Math.imul(slot+1,0x85ebca6b))>>>0;
 z^=z>>>16;z=Math.imul(z,0x7feb352d);z^=z>>>15;z=Math.imul(z,0x846ca68b);z^=z>>>16;
 return (z>>>0)/4294967296;
}
function nameHash(s){let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0}
function envelope(time,def,seed,density,amount){
 if(!amount)return 0;
 if(def.continuous)return C(amount/100,0,1);
 const n=nameHash(def.id),interval=def.period,slot=Math.floor(Math.max(0,time)/interval);
 // Try neighboring event windows, so the interval can cross slot boundaries.
 let result=0;
 for(const ix of [slot,slot-1]){
  if(ix<0)continue;
  const prob=C((.09+density/100*.9)*(.28+amount/100*.85),0,.96);
  if(hash(seed,n,ix*7)>prob)continue;
  const duration=def.duration*(.75+.75*hash(seed,n,ix*7+1));
  const start=ix*interval+.08+(interval-duration-.2)*hash(seed,n,ix*7+2);
  const phase=(time-start)/duration;
  if(phase<0||phase>1)continue;
  const attack=C(phase/.11,0,1),release=C((1-phase)/.14,0,1);
  const shape=Math.min(attack,release);
  result=Math.max(result,shape*amount/100);
 }
 return result;
}
function seeded(seed,t,salt){return hash(seed,salt,Math.floor(Math.max(0,t)*14))}
function shiftRows(p,w,h,shifter){
 const backup=new Uint8ClampedArray(p);
 for(let y=0;y<h;y++){
  const dy=shifter(y);if(!dy)continue;
  const out=y*w*4;
  for(let x=0;x<w;x++){
   const src=(y*w+C(Math.round(x-dy),0,w-1))*4,dst=out+x*4;
   p[dst]=backup[src];p[dst+1]=backup[src+1];p[dst+2]=backup[src+2];
  }
 }
}
function rollRows(p,w,h,shift,noiseBar){
 const src=new Uint8ClampedArray(p),d=Math.round(shift);
 for(let y=0;y<h;y++){
  const sy=((y+d)%h+h)%h,so=sy*w*4,doff=y*w*4;
  p.set(src.subarray(so,so+w*4),doff);
 }
 const band=C(Math.round(noiseBar),0,h-1);
 for(let y=Math.max(0,band-3);y<Math.min(h,band+3);y++)
 for(let x=0;x<w;x++){let i=(y*w+x)*4;for(let c=0;c<3;c++)p[i+c]=y%2?24:228;}
}
function ghost(p,w,h,amt,time){
 if(!amt)return;
 const distance=Math.max(2,Math.round(w*(.012+amt*.065)));
 const opacity=amt*.38,phase=Math.sin(time*1.3)*1.5;
 for(let y=0;y<h;y++){
  const off=y*w*4;
  for(let x=w-1;x>distance;x--){
   const i=off+x*4,j=off+(x-distance)*4,k=1+phase*.1;
   p[i]=C(p[i]*(1-opacity)+p[j]*opacity*k,0,255);
   p[i+1]=C(p[i+1]*(1-opacity)+p[j+1]*opacity*k,0,255);
   p[i+2]=C(p[i+2]*(1-opacity)+p[j+2]*opacity*k,0,255);
  }
 }
}
function tapeChew(p,w,h,amt,t,seed){
 const top=Math.floor(h*(.16+.70*seeded(seed,t,131)));
 const size=Math.round(h*(.035+.16*amt));
 shiftRows(p,w,h,y=>{
  const distance=Math.abs(y-top);
  if(distance>size)return 0;
  const fall=Math.pow(1-distance/size,1.2);
  return Math.round(fall*w*.17*amt*Math.sin((y-top)*.17+t*31));
 });
}
function pauseFrame(p,w,h,amt,t,prev,seed){
 if(prev?.length===p.length){
  const mix=C(.35+amt*.57,0,.98);
  for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)p[i+c]=p[i+c]*(1-mix)+prev[i+c]*mix;
 }
 const bandY=Math.floor((t*63+seeded(seed,t,139)*h*.05)%h);
 for(let y=Math.max(0,bandY-4);y<Math.min(h,bandY+4);y++){
  const off=y*w*4;
  for(let x=0;x<w;x+=2){
   const at=off+x*4,bias=amt*145*(Math.sin(x*.18+t*11)*.5+.5);
   for(let c=0;c<3;c++)p[at+c]=C(p[at+c]+bias,0,255);
  }
 }
}
function rewind(p,w,h,amt,t,seed){
 shiftRows(p,w,h,y=>Math.round(w*amt*(.012*Math.sin(y*.04+t*24)+.12*(y%17<3?1:0))*((y+Math.floor(t*90))%29<14?1:-1)));
 const y=Math.floor((1-((t*.52)%1))*h);
 for(let j=0;j<Math.max(1,Math.round(amt*16));j++){
  const yy=(y+j*3)%h,off=yy*w*4;
  for(let x=0;x<w;x+=3){const k=off+x*4,v=(x+seed)%5?205:34;p[k]=v;p[k+1]=v;p[k+2]=v;}
 }
}
function burst(p,w,h,amt,t){
 const ct=Math.sin(t*5)*amt*2;
 for(let y=0;y<h;y++){
  const loss=Math.sin(y*.10+t*13)>.48;
  const off=y*w*4;
  for(let x=0;x<w;x++){
   const i=off+x*4,r=p[i],g=p[i+1],b=p[i+2],l=.299*r+.587*g+.114*b;
   const s=loss?1-amt*.89:1-amt*.22;
   const rr=l+(r-l)*s+(b-g)*ct*.37;
   const bb=l+(b-l)*s+(r-g)*ct*.38;
   p[i]=C(rr,0,255);p[i+1]=C(l+(g-l)*s,0,255);p[i+2]=C(bb,0,255);
  }
 }
}
function headClog(p,w,h,amt,t,seed){
 const salt=156;
 const y0=Math.floor(seeded(seed,t*.25,salt)*h*.72);
 const height=Math.max(2,Math.round(h*(.02+.25*amt)));
 const width=Math.max(10,Math.floor(w*.68));
 for(let y=y0;y<Math.min(h,y0+height);y++){
  const off=y*w*4;
  const stagger=Math.floor(seeded(seed,t+y*.03,salt+1)*Math.max(1,w-width));
  for(let x=stagger;x<Math.min(w,stagger+width);x+=2){
   const k=off+x*4,rr=seeded(seed,t+x*.1+y*.008,salt+2);
   if(rr<.45*amt){const v=rr<.24?240:13;p[k]=v;p[k+1]=v;p[k+2]=v;}
  }
 }
}
function dropouts(p,w,h,amt,t,seed){
 const lines=Math.round(2+amt*h*.045);
 for(let n=0;n<lines;n++){
  const y=Math.floor(hash(seed,490+n,Math.floor(t*11))*h);
  if(y<1||y>=h)continue;
  const off=y*w*4,prev=(y-1)*w*4;
  const start=Math.floor(hash(seed,730+n,Math.floor(t*7))*w*.65);
  const end=Math.min(w,start+Math.round(w*(.08+.63*amt)));
  const copy=hash(seed,911+n,Math.floor(t*10))>.42;
  for(let x=start;x<end;x++){const i=off+x*4,j=prev+x*4;
   const val=(n%3===0)?0:244;
   for(let c=0;c<3;c++)p[i+c]=copy?p[j+c]:val;
  }
 }
}
function agc(p,amt,t){
 if(!amt)return;
 const gain=1+amt*(.19*Math.sin(t*1.9)+.13*Math.sin(t*5.4));
 const lift=amt*Math.max(0,Math.sin(t*2.1))*8;
 for(let i=0;i<p.length;i+=4)for(let c=0;c<3;c++)p[i+c]=C(p[i+c]*gain+lift,0,255);
}
function splice(p,w,h,amt,t,seed){
 const shift=Math.round(w*.08*amt*Math.sin(t*80));
 shiftRows(p,w,h,y=>y<h*(.4+.12*Math.sin(t*4))?shift:-shift*.3);
 const step=Math.max(1,Math.round(7-amt*5));
 for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){
  if(hash(seed,x+y,Math.floor(t*24))<amt*.16){
   const k=(y*w+x)*4;const v=hash(seed,x+7*y,Math.floor(t*27))>.5?252:5;
   p[k]=v;p[k+1]=v;p[k+2]=v;
  }
 }
}
function echo(p,prev,amt){
 if(!prev||prev.length!==p.length)return;
 const retain=amt*.59;
 for(let i=0;i<p.length;i+=4){
  let d=Math.abs(prev[i]-p[i])+Math.abs(prev[i+1]-p[i+1])+Math.abs(prev[i+2]-p[i+2]);
  if(d<19)continue;
  const mix=retain*C(d/190,.15,1);
  for(let c=0;c<3;c++)p[i+c]=p[i+c]*(1-mix)+prev[i+c]*mix;
 }
}
function interlace(p,prev,w,h,amt,t){
 for(let y=1;y<h;y+=2){
  const off=y*w*4,above=(y-1)*w*4;
  for(let x=0;x<w;x++){
   const i=off+x*4,j=above+x*4;
   const from=(prev?.length===p.length?prev:p);
   for(let c=0;c<3;c++)p[i+c]=p[i+c]*(1-amt*.88)+from[j+c]*amt*.88;
  }
 }
}
function datamosh(p,prev,w,h,amt,t,seed){
 if(!prev||prev.length!==p.length)return;
 const block=Math.max(8,Math.floor(Math.min(w,h)*(.02+amt*.06)));
 const chance=.23+.56*amt;
 for(let by=0;by<h;by+=block){
  for(let bx=0;bx<w;bx+=block){
   if(hash(seed,by*277+bx,Math.floor(t*6))>chance)continue;
   const motionX=Math.round((hash(seed,by*13+bx+9,Math.floor(t*4))-.5)*block*2*amt);
   const motionY=Math.round((hash(seed,by*17+bx+2,Math.floor(t*4))-.5)*block*2*amt);
   for(let y=by;y<Math.min(h,by+block);y++)for(let x=bx;x<Math.min(w,bx+block);x++){
    const dst=(y*w+x)*4,src=(C(y+motionY,0,h-1)*w+C(x+motionX,0,w-1))*4;
    const mix=amt*.85;for(let c=0;c<3;c++)p[dst+c]=p[dst+c]*(1-mix)+prev[src+c]*mix;
   }
  }
 }
}
function pixelSort(p,w,h,amt,t,seed){
 const runs=Math.max(1,Math.floor(amt*28)),maxLen=Math.max(10,Math.round(w*.20*amt));
 for(let row=0;row<runs;row++){
  const y=Math.floor(hash(seed,row+101,Math.floor(t*8))*h);
  const x0=Math.floor(hash(seed,row+303,Math.floor(t*11))*Math.max(1,w-maxLen));
  const n=Math.min(maxLen,w-x0),buf=[];
  for(let x=0;x<n;x++){
   const k=(y*w+x0+x)*4;
   const a=p[k],b=p[k+1],c=p[k+2];buf.push([.299*a+.587*b+.114*c,a,b,c]);
  }
  buf.sort((a,b)=>a[0]-b[0]);
  for(let x=0;x<n;x++){
   const k=(y*w+x0+x)*4;const col=buf[x];
   for(let c=0;c<3;c++)p[k+c]=p[k+c]*(1-amt)+col[c+1]*amt;
  }
 }
}
function rf(p,w,h,amt,t,seed){
 const noiseBands=Math.round(1+amt*7);
 for(let j=0;j<noiseBands;j++){
  const yc=Math.floor(hash(seed,j+70,Math.floor(t*12))*h);
  const thickness=Math.floor(1+amt*15*hash(seed,j+79,Math.floor(t*7)));
  for(let y=yc;y<Math.min(h,yc+thickness);y++){
   const base=y*w*4,shift=hash(seed,j+y,Math.floor(t*7))-.5;
   for(let x=0;x<w;x++){
    const k=base+x*4,noise=amt*(shift*94+(hash(seed,x+Math.floor(t*40),y)-.5)*130);
    for(let c=0;c<3;c++)p[k+c]=C(p[k+c]+noise,0,255);
   }
  }
 }
}
function night(p,w,h,amt,t,seed){
 const xval=amt*.90;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,l=p[i]*.299+p[i+1]*.587+p[i+2]*.114;
  const noise=(hash(seed,Math.floor(x/2)+y*133,Math.floor(t*18))-.5)*amt*38;
  const value=C(Math.pow(l/255,.65)*255+noise,0,255);
  p[i]=p[i]*(1-xval)+value*.09*xval;
  p[i+1]=p[i+1]*(1-xval)+C(value*1.17,0,255)*xval;
  p[i+2]=p[i+2]*(1-xval)+value*.17*xval;
 }
}
function minidv(p,w,h,amt,t,seed){
 const size=amt>.65?12:8;
 const mask=255-(Math.floor(amt*3)*16);
 for(let by=0;by<h;by+=size)for(let bx=0;bx<w;bx+=size){
  const k=(by*w+bx)*4;
  const rr=p[k],gg=p[k+1],bb=p[k+2];
  const faded=hash(seed,by*113+bx,Math.floor(t*12))<amt*.015;
  for(let y=by;y<Math.min(h,by+size);y++)for(let x=bx;x<Math.min(w,bx+size);x++){
   const j=(y*w+x)*4;
   const blend=amt*.17+(faded?amt*.8:0);
   p[j]=((p[j]*(1-blend)+rr*blend)|0)&mask;
   p[j+1]=((p[j+1]*(1-blend)+gg*blend)|0)&mask;
   p[j+2]=((p[j+2]*(1-blend)+bb*blend)|0)&mask;
  }
 }
}
function crt(p,w,h,amt){
 const scan=amt*.20;
 for(let y=0;y<h;y++){
  const line=(y%3===1)?1-scan:1;
  const off=y*w*4;
  for(let x=0;x<w;x++){
   const edge=Math.abs(2*x/w-1);
   const v=1-amt*.22*edge*edge;
   const i=off+x*4;
   for(let c=0;c<3;c++)p[i+c]=C(p[i+c]*line*v,0,255);
  }
 }
}
class Processor{
 constructor(){this.previous=null;this.previousTime=-1;this.lastWidth=0;this.lastHeight=0;}
 reset(){this.previous=null;this.previousTime=-1;}
 apply(p,w,h,options={}){
  const t=Math.max(0,Number(options.time)||0),seed=(options.seed||0)>>>0;
  const settings=options.effects||{},density=C(Number(options.density??45),0,100),overall=C(Number(options.strength??1),0,1.5);
  if(w<1||h<1||p.length!==w*h*4)throw Error('Некорректный буфер видеоэффекта');
  if(w!==this.lastWidth||h!==this.lastHeight||t<this.previousTime-.12||t-this.previousTime>1.7){
   this.reset();this.lastWidth=w;this.lastHeight=h;
  }
  // Keep the uncorrupted incoming frame for frame-to-frame effects.
  const incoming=new Uint8ClampedArray(p);
  const prev=this.previous;
  const amt={};for(const def of defs){
   amt[def.id]=envelope(t,def,seed,density,Number(settings[def.id]??0))*overall;
  }
  const mode=options.mode||'vhs',tape=tapes.find(x=>x.id===options.tape)||tapes[1],level=tape.level;
  if(options.splicePulse>0)amt.tapeSplice=Math.max(amt.tapeSplice,C(options.splicePulse*Number(settings.tapeSplice||0)/100,0,1.3)*overall);
  // Analog faults. Tape profiles influence their amplitude, not unrelated FILM filters.
  if(amt.tapeChew)tapeChew(p,w,h,C(amt.tapeChew*level,0,1.4),t,seed);
  if(amt.pause)pauseFrame(p,w,h,C(amt.pause*level,0,1),t,prev,seed);
  if(amt.rewind)rewind(p,w,h,C(amt.rewind*level,0,1.3),t,seed);
  if(amt.vhold)rollRows(p,w,h,amt.vhold*h*.42,(t*48)%h);
  if(amt.ghost)ghost(p,w,h,amt.ghost,t);
  if(amt.colorBurst)burst(p,w,h,C(amt.colorBurst*level,0,1),t);
  if(amt.headClog)headClog(p,w,h,C(amt.headClog*tape.head,0,1.4),t,seed);
  if(amt.dropouts)dropouts(p,w,h,C(amt.dropouts*level,0,1),t,seed);
  if(amt.agc)agc(p,amt.agc,t);
  if(amt.tapeSplice)splice(p,w,h,amt.tapeSplice,t,seed);
  if(amt.frameEcho)echo(p,prev,amt.frameEcho);
  if(amt.interlace)interlace(p,prev,w,h,amt.interlace,t);
  if(amt.datamosh)datamosh(p,prev,w,h,amt.datamosh,t,seed);
  if(amt.pixelSort)pixelSort(p,w,h,amt.pixelSort,t,seed);
  if(amt.rf)rf(p,w,h,C(amt.rf*level,0,1),t,seed);
  const modeAmt=C(Number(options.modeStrength??70)/100,0,1);
  if(mode==='minidv')minidv(p,w,h,modeAmt,t,seed);
  if(mode==='crt')crt(p,w,h,modeAmt);
  if(mode==='night')night(p,w,h,modeAmt,t,seed);
  this.previous=incoming;this.previousTime=t;
  return p;
 }
}
root.VHSVideoGlitchFX=Object.freeze({EFFECTS:defs,MODES:modes,TAPES:tapes,createProcessor:()=>new Processor(),envelope,hash});
})(window);
