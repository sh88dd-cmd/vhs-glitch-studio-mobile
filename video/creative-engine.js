/* VHS Video Lab 0.8.0 — independent offline creative operations.
 * All transforms use local pixel/audio buffers and deterministic time values.
 * No external services, no hidden second video, no generated faces.
 */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
const defaultCreative=()=>({
 touch:{enabled:false,brush:'pixel',radius:24,strength:85,duration:3,
  strokes:[],facesEnabled:false,faceStyle:'pixel',faceSize:18,faceBlur:13,
  manualFaces:[],faceAutodetect:false},
 aging:{enabled:false,start:0,end:100,amount:85},
 look:{enabled:false,strength:70,target:null},
 speed:{enabled:false,reverse:false,rate:1,curveEnabled:false,points:[]},
 live:{events:[]},
 audioDevice:'off'
});
const deep=value=>JSON.parse(JSON.stringify(value));
const defaults=defaultCreative();
function hydrate(raw){
 const input=raw&&typeof raw==='object'?raw:{};
 const result=defaultCreative();
 for(const k of Object.keys(result))if(k!=='audioDevice'){
  if(input[k]&&typeof input[k]==='object'&&!Array.isArray(input[k]))
   result[k]={...result[k],...input[k]};
 }else if(['off','camcorder','walkman','radio','phone','cctv','broken'].includes(input[k]))result[k]=input[k];
 result.touch.strokes=(Array.isArray(result.touch.strokes)?result.touch.strokes:[]).slice(0,140);
 result.touch.manualFaces=(Array.isArray(result.touch.manualFaces)?result.touch.manualFaces:[]).slice(0,10);
 result.speed.points=(Array.isArray(result.speed.points)?result.speed.points:[]).slice(0,70);
 result.live.events=(Array.isArray(result.live.events)?result.live.events:[]).slice(0,140);
 const rate=Number(result.speed.rate);
  result.speed.rate=Number.isFinite(rate)&&Math.abs(rate)>=1?(rate<0?-1:1)*clamp(Math.abs(rate),1,10):1;
  result.speed.points=result.speed.points.filter(p=>p&&Number.isFinite(Number(p.time))&&Number.isFinite(Number(p.rate))&&Math.abs(Number(p.rate))>=1).map(p=>({...p,time:Math.max(0,Number(p.time)),rate:(Number(p.rate)<0?-1:1)*clamp(Math.abs(p.rate),1,10)}));
 return result;
}
function active(state){
 const c=state.creative||state||{};
 return !!(
  c.touch?.enabled&&(c.touch.strokes?.length>0||c.touch.facesEnabled)||
  c.aging?.enabled&&Number(c.aging.amount)>0||
  c.look?.enabled&&!!c.look.target&&Number(c.look.strength)>0||
  c.speed?.enabled&&(c.speed.reverse||Number(c.speed.rate)!==1||c.speed.curveEnabled&&c.speed.points?.length>0)||
  c.live?.events?.length
 );
}
function agingAt(conf,time,duration){
 if(!conf?.enabled||!Number.isFinite(duration)||duration<=0)return 0;
 const p=clamp(time/duration*100,0,100);
 const start=clamp(conf.start,0,99.9),end=Math.max(start+.1,clamp(conf.end,0,100));
 return clamp((p-start)/(end-start),0,1)*clamp(conf.amount,0,100)/100;
}
function aged(state,time,duration){
 const amount=agingAt(state.creative?.aging,time,duration);
 if(!amount)return state;
 const s={...state,signal:{...state.signal},filmDamage:{...state.filmDamage}};
 s.vhsEnabled=true;
 s.master=clamp((Number(state.master)||0)+amount*58,0,100);
 s.signal.noise=clamp((Number(s.signal.noise)||0)+amount*62,0,100);
 s.signal.tracking=clamp((Number(s.signal.tracking)||0)+amount*60,0,100);
 s.signal.chromaLoss=clamp((Number(s.signal.chromaLoss)||0)+amount*42,0,100);
 s.filmDamage.enabled=true;
 s.filmDamage.flicker=clamp((Number(s.filmDamage.flicker)||0)+amount*55,0,100);
  s.filmDamage.grain=clamp((Number(s.filmDamage.grain)||0)+amount*48,0,100);
  s.filmDamage.scratches=clamp((Number(s.filmDamage.scratches)||0)+amount*55,0,100);
 return s;
}
function colorSample(data,width,height,step=4){
 let n=0,mean=[0,0,0],variance=[0,0,0];
 const total=width*height;
 for(let i=0;i<total;i+=Math.max(1,step)){
  const o=i*4;if(data[o+3]<128)continue;n++;
  for(let k=0;k<3;k++){
   const x=data[o+k],delta=x-mean[k];mean[k]+=delta/n;
   variance[k]+=delta*(x-mean[k]);
  }
 }
 return {mean,spread:variance.map(v=>Math.sqrt(Math.max(1,v/Math.max(1,n-1))))};
}
function transfer(data,width,height,target,strength=70){
 if(!target?.mean||!target.spread||!ArrayBuffer.isView(data))return;
 const blend=clamp(strength,0,100)/100;
 if(blend<=0)return;
 const source=colorSample(data,width,height,8);
 const transform=target.mean.map((v,k)=>({
  gain:clamp(target.spread[k]/Math.max(5,source.spread[k]),.35,2.5),
  src:source.mean[k],dst:clamp(v,0,255)
 }));
 for(let i=0;i<data.length;i+=4){
  if(data[i+3]<10)continue;
  for(let k=0;k<3;k++){
   const cfg=transform[k];
   const wanted=clamp((data[i+k]-cfg.src)*cfg.gain+cfg.dst,0,255);
   data[i+k]=Math.round(data[i+k]*(1-blend)+wanted*blend);
  }
 }
}
// UI convention: +N means Nx faster, -N means Nx slower (never backwards).
// Only the independent reverse switch controls playback direction.
function forwardFactor(value){
 const v=Number(value);
 if(!Number.isFinite(v)||Math.abs(v)<1)return 1;
 return v<0?1/clamp(Math.abs(v),1,10):clamp(v,1,10);
}
function speedAt(speed,time,duration){
 if(!speed?.enabled)return 1;
 const direction=speed.reverse?-1:1,base=forwardFactor(speed.rate);
 if(!speed.curveEnabled||!Array.isArray(speed.points)||!speed.points.length)return direction*base;
 const points=speed.points.filter(p=>Number.isFinite(Number(p.time))&&Math.abs(Number(p.rate))>=1)
  .sort((a,b)=>a.time-b.time);
 if(!points.length)return direction*base;
 const p=clamp(time,0,Math.max(duration||time,0));
 if(p<=points[0].time)return direction*forwardFactor(points[0].rate);
 for(let j=1;j<points.length;j++){
  const x=points[j-1],y=points[j];
  if(p<=y.time){
   const fraction=clamp((p-x.time)/Math.max(.001,y.time-x.time),0,1);
   // Logarithmic interpolation feels natural across 0.1x → 1x → 10x.
   const f1=forwardFactor(x.rate),f2=forwardFactor(y.rate);
   return direction*Math.exp(Math.log(f1)*(1-fraction)+Math.log(f2)*fraction);
  }
 }
 return direction*forwardFactor(points[points.length-1].rate);
}
// Additional independent mechanical aging pass, applied even in timeline/music mode.
// Deterministic per frame; offline and available in both preview and export.
function damageTape(p,w,h,amount,time,seed=0){
 const age=clamp(amount,0,1);
 if(age<=.002||!p||p.length!==w*h*4)return;
 const frame=Math.floor(Math.max(0,time)*15);
 const noise=(n)=>{let q=(Math.imul((n|0)^(seed|0),0x45d9f3b))>>>0;
  q^=q>>>16;q=Math.imul(q,0x45d9f3b);q^=q>>>16;return(q>>>0)/4294967295;};
 const saturated=1-age*.9;
 const flicker=1-age*(.055+.12*(noise(frame*79+71)-.5))*(.4+.6*Math.sin(frame*.73)**2);
 const bands=Math.round(age*9);
 const bandList=[];
 for(let i=0;i<bands;i++){
  const y=Math.floor(noise(frame*113+i*53+7)*h);
  const thick=1+Math.floor(noise(frame*59+i*37+9)*Math.max(1,h*.045*age));
  bandList.push({y,thick,shift:Math.round((noise(frame*67+i*41+19)-.5)*w*.18*age),
   tone:noise(frame*23+i*47+3)>.5?1:-1});
 }
 const dropout=age>.58&&noise(frame*17+99)<(age-.52)*.045;
 const original=p.slice();
 for(let y=0;y<h;y++){
  let shift=0,bandTone=0;
  for(const band of bandList)if(y>=band.y&&y<band.y+band.thick){shift=band.shift;bandTone=band.tone;}
  const horizontal=(noise(Math.floor(y/2)+frame*43+123)-.5)*age*24;
  for(let x=0;x<w;x++){
   const from=(y*w+Math.max(0,Math.min(w-1,x+shift)))*4;
   const dest=(y*w+x)*4;
   const r=original[from],g=original[from+1],b=original[from+2];
   const luma=r*.299+g*.587+b*.114;
   const grain=(noise(x*15427+y*821+frame*76543)-.5)*age*110;
   const scratch=(noise(x+frame*97+775)<age*.002?age*135:0);
   const stripe=bandTone*age*65;
   const fade=dropout?.37:1;
   p[dest]=clamp((luma+(r-luma)*saturated)*flicker*fade+grain+horizontal+stripe+scratch,0,255);
   p[dest+1]=clamp((luma+(g-luma)*saturated)*flicker*fade+grain+horizontal+stripe+scratch,0,255);
   p[dest+2]=clamp((luma+(b-luma)*saturated)*flicker*fade+grain+horizontal+stripe+scratch,0,255);
  }
 }
}
function beatEvents(buffer,{sensitivity=55,limit=90,duration=30,clip=0,effect='tapeChew'}={}){
 if(!buffer||!buffer.numberOfChannels||!buffer.sampleRate)return[];
 const pcm=buffer.getChannelData(0);
 const rate=buffer.sampleRate,hop=Math.max(512,Math.floor(rate*.045));
 const end=Math.min(pcm.length,Math.floor(Math.max(.1,duration)*rate));
 const energy=[];
 for(let i=0;i<end;i+=hop){
  let sum=0,n=0;
  for(let j=i;j<Math.min(end,i+hop);j+=4){const v=pcm[j];sum+=v*v;n++;}
  energy.push(Math.sqrt(sum/Math.max(1,n)));
 }
 if(energy.length<6)return[];
 const novelty=[];
 for(let i=0;i<energy.length;i++){
  let mean=0,n=0;
  for(let j=Math.max(0,i-12);j<i;j++){mean+=energy[j];n++;}
  const prior=n?mean/n:energy[0];
  novelty.push(Math.max(0,energy[i]-prior*.78));
 }
 const positives=novelty.filter(v=>v>0).sort((a,b)=>a-b);
 const reference=positives[Math.floor(positives.length*.70)]||.015;
 const threshold=reference*(1.8-clamp(sensitivity,0,100)*.014);
 const minGap=Math.ceil(.22*rate/hop),events=[];
 let last=-minGap;
 for(let i=2;i<novelty.length-2;i++){
  const v=novelty[i];if(v<=.0001||v<threshold||i-last<minGap)continue;
  if(v<novelty[i-1]||v<novelty[i+1])continue;
  events.push({
   id:'auto-'+clip+'-'+i,clip,time:Math.round(i*hop/rate*1000)/1000,
   duration:.15,strength:clamp(48+v/Math.max(reference,.005)*13,45,100),effect
  });
  last=i;if(events.length>=Math.min(120,Math.max(1,limit)))break;
 }
 return events;
}
const brushArray=(strokes,clip,time)=>Array.isArray(strokes)?strokes.filter(s=>
 s.clip===clip&&time>=Number(s.start||0)&&time<=Number(s.end||Infinity)):[];

// Pixel-based displacement and blur are applied only inside the selected
// normalized points/face boxes. Processed frame is never uploaded.
const scratch=document.createElement('canvas');
function region(ctx,x,y,w,h,mode='pixel',power=20,blur=12){
 const W=ctx.canvas.width,H=ctx.canvas.height;
 const px=Math.round(clamp(x,0,1)*W),py=Math.round(clamp(y,0,1)*H);
 const pw=Math.min(W-px,Math.max(2,Math.round(w*W)));
 const ph=Math.min(H-py,Math.max(2,Math.round(h*H)));
 if(pw<2||ph<2)return;
 // Pixel mosaics use visible square blocks; blur uses smooth resampling.
 // Both paths work without ctx.filter, which is unreliable in old Safari.
 const block=mode==='blur'?Math.max(2,Number(blur)||12)/3:
  Math.max(3,(Number(power)||20)/4.5);
 const sw=Math.max(2,Math.round(pw/Math.max(2,block)));
 const sh=Math.max(2,Math.round(ph/Math.max(2,block)));
 // Resizing canvas on every stamp reallocates its backing store on iOS.
 if(scratch.width!==sw)scratch.width=sw;
 if(scratch.height!==sh)scratch.height=sh;
 const sctx=scratch.getContext('2d',{willReadFrequently:false});
 sctx.imageSmoothingEnabled=mode==='blur';
 sctx.clearRect(0,0,scratch.width,scratch.height);
 sctx.drawImage(ctx.canvas,px,py,pw,ph,0,0,scratch.width,scratch.height);
 ctx.save();ctx.imageSmoothingEnabled=mode==='blur';
 if(mode==='blur'&&'filter'in ctx)ctx.filter='blur('+Math.max(2,Number(blur)||12)*.4+'px)';
 ctx.drawImage(scratch,0,0,scratch.width,scratch.height,px,py,pw,ph);
 ctx.restore();
}
function drawStrokes(ctx,creative,clip,time){
 const cfg=creative?.touch;
 if(!cfg?.enabled)return 0;
 const strokes=brushArray(cfg.strokes,clip,time);
 const W=ctx.canvas.width,H=ctx.canvas.height;
 for(const s of strokes){
  const points=Array.isArray(s.points)?s.points:[];
  // Brush width follows the visible canvas width and remains strong on
  // portrait iPhone videos (the old max(width,height) made it too tiny).
  const rx=clamp(s.radius||cfg.radius,4,100)/480;
  const ry=rx*W/H;
  const step=Math.max(.003,rx*.60),mode=s.mode==='blur'?'blur':'pixel';
  let stamps=0,previous=null;
  const stamp=(x,y)=>{
   if(stamps++>=320)return;
   region(ctx,clamp(x-rx,0,1),clamp(y-ry,0,1),rx*2,ry*2,
    mode,s.strength||cfg.strength,3+(Number(s.strength||cfg.strength)||80)*.28);
  };
  for(const p of points.slice(0,400)){
   if(!Array.isArray(p)||p.length<2)continue;
   if(previous){
    const dx=p[0]-previous[0],dy=(p[1]-previous[1])*H/W;
    const segments=Math.max(1,Math.min(16,Math.ceil(Math.hypot(dx,dy)/step)));
    for(let i=1;i<=segments&&stamps<320;i++)
     stamp(previous[0]+(p[0]-previous[0])*i/segments,
       previous[1]+(p[1]-previous[1])*i/segments);
   }else stamp(p[0],p[1]);
   previous=p;if(stamps>=320)break;
  }
 }
 return strokes.length;
}
function drawFaces(ctx,boxes,creative){
 const cfg=creative?.touch;
 if(!cfg?.facesEnabled||!Array.isArray(boxes))return;
 const style=cfg.faceStyle==='blur'?'blur':'pixel';
 for(const f of boxes.slice(0,10)){
  if(!f||!(f.w>0&&f.h>0))continue;
  // Add a small privacy margin so masks cover forehead and chin as faces turn.
  const padX=f.w*.08,padY=f.h*.10;
  region(ctx,clamp(f.x-padX,0,1),clamp(f.y-padY,0,1),
   Math.min(1-f.x+padX,f.w+padX*2),Math.min(1-f.y+padY,f.h+padY*2),
   style,style==='pixel'?cfg.faceSize:cfg.faceBlur,cfg.faceBlur);
 }
}
// Block matching displacement on small luminance buffers between neighboring
// frames; manual rectangles remain usable on devices without FaceDetector.
function trackBoxes(previous,current,w,h,boxes){
 if(!previous||!current||previous.length!==current.length||w<16||h<16)return boxes;
 const result=[];
 for(const face of (boxes||[]).slice(0,10)){
  if(!face||!(face.w>0&&face.h>0)){result.push(face);continue;}
  const cx=(face.x+face.w*.5)*w,cy=(face.y+face.h*.5)*h;
  // Match a textured grid across the *inside* of each face, not a single
  // 11px center patch. A tiny center patch easily snaps to the background.
  const samples=[];
  for(let iy=-3;iy<=3;iy++)for(let ix=-3;ix<=3;ix++){
   const x=Math.round(cx+ix*Math.max(2,face.w*w*.18));
   const y=Math.round(cy+iy*Math.max(2,face.h*h*.18));
   if(x>1&&y>1&&x<w-2&&y<h-2)
    samples.push([x,y,previous[y*w+x]]);
  }
  if(samples.length<20){result.push({...face});continue;}
  const radius=Math.min(13,Math.max(3,Math.round(Math.max(face.w*w,face.h*h)*.30)));
  let bestError=Infinity,bestX=0,bestY=0,stationary=Infinity;
  // Dense ±radius search: separate face masks have independent movement.
  for(let dy=-radius;dy<=radius;dy+=2)for(let dx=-radius;dx<=radius;dx+=2){
   let error=0,n=0;
   for(const [x,y,reference] of samples){
    const tx=x+dx,ty=y+dy;
    if(tx<0||ty<0||tx>=w||ty>=h)continue;
    error+=Math.abs(reference-current[ty*w+tx]);n++;
   }
   if(n<samples.length*.8)continue;
   const avg=error/n;
   if(dx===0&&dy===0)stationary=avg;
   // Small motion bias prevents arbitrary jumps between similar textures.
   const score=avg+Math.hypot(dx,dy)*.16;
   if(score<bestError){bestError=score;bestX=dx;bestY=dy;}
  }
  if(!Number.isFinite(stationary)){
   let error=0;for(const [x,y,val] of samples)error+=Math.abs(val-current[y*w+x]);
   stationary=error/samples.length;
  }
  // If matching is ambiguous, KEEP the last known position instead of
  // randomly shifting the mask to unrelated scenery.
  const improvement=stationary-bestError;
  const confident=bestError<30&&improvement>Math.max(1.5,stationary*.10);
  const dx=confident?bestX:0,dy=confident?bestY:0;
  result.push({...face,
   x:clamp(face.x+dx/w,0,Math.max(0,1-face.w)),
   y:clamp(face.y+dy/h,0,Math.max(0,1-face.h))});
 }
 return result;
}
function gray(ctx,width=160){
 const ratio=width/Math.max(1,ctx.canvas.width);
 const h=Math.max(2,Math.round(ctx.canvas.height*ratio));
 scratch.width=width;scratch.height=h;
 const s=scratch.getContext('2d',{willReadFrequently:true});
 s.drawImage(ctx.canvas,0,0,width,h);
 const rgba=s.getImageData(0,0,width,h).data;
 const data=new Uint8Array(width*h);
 for(let i=0;i<data.length;i++){
  const p=i*4;data[i]=Math.round(rgba[p]*.3+rgba[p+1]*.59+rgba[p+2]*.11);
 }
 return {data,w:width,h};
}
root.VHSVideoCreative=Object.freeze({
 defaults:defaultCreative,hydrate,active,agingAt,aged,colorSample,transfer,speedAt,
 beatEvents,damageTape,forwardFactor,brushArray,drawStrokes,drawFaces,trackBoxes,gray
});
})(window);
