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
 result.touch.manualFaces=(Array.isArray(result.touch.manualFaces)?result.touch.manualFaces:[]).slice(0,6);
 result.speed.points=(Array.isArray(result.speed.points)?result.speed.points:[]).slice(0,70);
 result.live.events=(Array.isArray(result.live.events)?result.live.events:[]).slice(0,140);
 result.speed.rate=clamp(result.speed.rate,1,10);
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
 s.filmDamage.flicker=clamp((Number(s.filmDamage.flicker)||0)+amount*38,0,100);
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
function speedAt(speed,time,duration){
 if(!speed?.enabled)return 1;
 const dir=speed.reverse?-1:1,magnitude=clamp(speed.rate||1,1,10);
 if(!speed.curveEnabled||!Array.isArray(speed.points)||!speed.points.length)return dir*magnitude;
 const points=speed.points.filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.rate))
  .sort((a,b)=>a.time-b.time);
 if(!points.length)return dir*magnitude;
 const p=clamp(time,0,Math.max(duration||time,0));
 if(p<=points[0].time)return clamp(points[0].rate,-10,10)||dir;
 for(let j=1;j<points.length;j++){
  const x=points[j-1],y=points[j];
  if(p<=y.time){
   const ratio=clamp((p-x.time)/Math.max(.001,y.time-x.time),0,1);
   const value=Number(x.rate)+(Number(y.rate)-Number(x.rate))*ratio;
   // Crossing from forward to reverse goes via a pause instead of sign jumps.
   return Math.abs(value)<.08?0:clamp(value,-10,10);
  }
 }
 return clamp(points[points.length-1].rate,-10,10);
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
  const v=novelty[i];if(v<threshold||i-last<minGap)continue;
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
 const small=Math.max(2,Math.round(Math.min(pw,ph)/Math.max(3,Number(power)||15)));
 scratch.width=Math.max(2,Math.round(pw/Math.max(2,power/2)));
 scratch.height=Math.max(2,Math.round(ph/Math.max(2,power/2)));
 const sctx=scratch.getContext('2d',{willReadFrequently:false});
 sctx.clearRect(0,0,scratch.width,scratch.height);
 if(mode==='blur'&&'filter'in sctx){
  sctx.filter='blur('+Math.max(2,Number(blur)||12)+'px)';
 }else sctx.filter='none';
 sctx.drawImage(ctx.canvas,px,py,pw,ph,0,0,scratch.width,scratch.height);
 ctx.save();ctx.imageSmoothingEnabled=mode==='blur';
 ctx.drawImage(scratch,0,0,scratch.width,scratch.height,px,py,pw,ph);
 ctx.restore();
}
function drawStrokes(ctx,creative,clip,time){
 const cfg=creative?.touch;
 if(!cfg?.enabled)return 0;
 const strokes=brushArray(cfg.strokes,clip,time);
 for(const s of strokes){
  const pts=Array.isArray(s.points)?s.points:[];
  const radius=clamp(s.radius||cfg.radius,3,120)/Math.max(ctx.canvas.width,ctx.canvas.height);
  for(const p of pts.slice(0,240)){
   const size=radius*2;
   region(ctx,clamp(p[0]-radius,0,1),clamp(p[1]-radius,0,1),size,size,
    s.mode==='blur'?'blur':'pixel',s.strength||cfg.strength,s.blur||14);
  }
 }
 return strokes.length;
}
function drawFaces(ctx,boxes,creative){
 const cfg=creative?.touch;
 if(!cfg?.facesEnabled||!Array.isArray(boxes))return;
 const style=cfg.faceStyle==='blur'?'blur':'pixel';
 for(const f of boxes.slice(0,6)){
  region(ctx,f.x,f.y,f.w,f.h,style,style==='pixel'?cfg.faceSize:cfg.faceBlur,cfg.faceBlur);
 }
}
// Block matching displacement on small luminance buffers between neighboring
// frames; manual rectangles remain usable on devices without FaceDetector.
function trackBoxes(previous,current,w,h,boxes){
 if(!previous||!current||previous.length!==current.length)return boxes;
 const result=[];
 for(const box of (boxes||[]).slice(0,6)){
  const cx=Math.round((box.x+box.w*.5)*w),cy=Math.round((box.y+box.h*.5)*h);
  let best=Infinity,bx=0,by=0;
  for(let dy=-9;dy<=9;dy+=3)for(let dx=-9;dx<=9;dx+=3){
   let error=0,samples=0;
   for(let yy=-5;yy<=5;yy+=2)for(let xx=-5;xx<=5;xx+=2){
    const sx=cx+xx,sy=cy+yy,tx=sx+dx,ty=sy+dy;
    if(sx<0||sy<0||tx<0||ty<0||sx>=w||sy>=h||tx>=w||ty>=h)continue;
    error+=Math.abs(previous[sy*w+sx]-current[ty*w+tx]);samples++;
   }
   if(samples&&error/samples<best){best=error/samples;bx=dx;by=dy;}
  }
  result.push({...box,x:clamp(box.x+bx/w,0,1-box.w),y:clamp(box.y+by/h,0,1-box.h)});
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
 defaults,hydrate,active,agingAt,aged,colorSample,transfer,speedAt,
 beatEvents,brushArray,drawStrokes,drawFaces,trackBoxes,gray
});
})(window);
