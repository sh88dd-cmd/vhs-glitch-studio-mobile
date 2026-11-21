/* VHS Video Lab 0.7.6 — offline camcorder viewfinder overlay.
 * All camera badges are allocated inside a collision-free safe area.
 * No DOM, remote assets or extra video decoder.
 */
(function(root){
'use strict';
const POSITIONS=['left-top','center-top','right-top','left-bottom','center-bottom','right-bottom'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const pad=n=>String(n).padStart(2,'0');
const enabledKeys=['date','counter','zoom','modeInfo','focus','play','rec','battery'];
const overlaps=(a,b,g=2)=>a.x<b.x+b.w+g && a.x+a.w+g>b.x &&
 a.y<b.y+b.h+g && a.y+a.h+g>b.y;
function timestamp(clockStart,elapsed){
 const parsed=new Date(clockStart||'1995-06-16T22:28:00');
 const start=Number.isFinite(parsed.getTime())?parsed:new Date(1995,5,16,22,28);
 const d=new Date(start.getTime()+Math.floor(Math.max(0,Number(elapsed)||0))*1000);
 return [pad(d.getDate())+'.'+pad(d.getMonth()+1)+'.'+d.getFullYear(),
  pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds())];
}
function layout(ctx,w,h,c={},speed='SP',elapsed=0){
 const width=Math.max(2,Number(w)||2),height=Math.max(2,Number(h)||2),base=Math.min(width,height);
 const frame=!!c.frame;
 const frameSize=clamp(Number(c.frameSize)||100,60,160)/100;
 const insetX=Math.max(5,width*.042),insetY=Math.max(5,height*.042);
 const cornerLen=clamp(base*.105*frameSize,8,base*.24);
 const space=Math.max(3,base*.022);
 const safe={
  left:frame?insetX+cornerLen+space:Math.max(7,width*.045),
  right:frame?width-insetX-cornerLen-space:width-Math.max(7,width*.045),
  top:frame?insetY+cornerLen+space:Math.max(7,height*.045),
  bottom:frame?height-insetY-cornerLen-space:height-Math.max(7,height*.045)
 };
 // Constrain pathological tiny canvases without ever drawing over the frame.
 safe.left=Math.min(safe.left,width/2-2);
 safe.right=Math.max(safe.right,width/2+2);
 safe.top=Math.min(safe.top,height/2-2);
 safe.bottom=Math.max(safe.bottom,height/2+2);
 const frameRect={left:insetX,right:width-insetX,top:insetY,bottom:height-insetY,len:cornerLen};
 const items=[];
 const positions=c.positions||{},sizes=c.sizes||{};
 function measure(lines,size,type='text'){
  ctx.font='700 '+size+'px ui-monospace, Menlo, Courier New, monospace';
  if(type==='battery')return {w:size*2.65,h:size*.91};
  const strWidth=Math.max(...lines.map(line=>ctx.measureText(line).width),0);
  return {w:strWidth+(type==='rec'?size*.65:0),h:size*1.25*lines.length};
 }
 function candidateSlots(preferred){
  const p=POSITIONS.includes(preferred)?preferred:'left-top';
  const vertical=p.endsWith('bottom')?'bottom':'top',horizontal=p.split('-')[0];
  const opposite=vertical==='top'?'bottom':'top';
  const otherHoriz=['left','center','right'].filter(x=>x!==horizontal);
  return [p,...otherHoriz.map(x=>x+'-'+vertical),horizontal+'-'+opposite,...otherHoriz.map(x=>x+'-'+opposite)];
 }
 function place(key,lines,factor,type='text'){
  const preferred=positions[key]||'left-top';
  const baseSize=Math.max(5.8,base*factor*clamp((Number(sizes[key])||125)/100,.45,2.8));
  const maxW=safe.right-safe.left,maxH=safe.bottom-safe.top;
  for(const scale of [1,.89,.78,.68,.58,.49,.39,.31]){
   const size=Math.max(4,baseSize*scale);
   const shape=measure(lines,size,type);
   if(shape.w>maxW||shape.h>maxH)continue;
   for(const slot of candidateSlots(preferred)){
    const side=slot.split('-')[0],bottom=slot.endsWith('bottom');
    const x=side==='left'?safe.left:side==='right'?safe.right-shape.w:
     (safe.left+safe.right-shape.w)/2;
    const step=Math.max(2,size*.48);
    const count=Math.max(0,Math.ceil((maxH-shape.h)/step));
    for(let i=0;i<=count+1;i++){
     const y=bottom?safe.bottom-shape.h-Math.min(maxH-shape.h,i*step):
      safe.top+Math.min(maxH-shape.h,i*step);
     const box={x,y,w:shape.w,h:shape.h};
     if(items.some(it=>overlaps(it.rect,box,Math.max(2,base*.012))))continue;
     const item={key,lines,type,size,slot,rect:box};
     items.push(item);return item;
    }
   }
  }
  // On an impossibly small video, dropping a badge is safer than drawing on
  // top of the corner lines or over another badge.
  return null;
 }
 const [date,time]=timestamp(c.clockStart,elapsed);
 const caption=c.text&&c.text!=='PM 10:28 | JUN 16 1995'?String(c.text).slice(0,64):'';
 const specs={
  date:{lines:[date,time,...(caption?caption.replace(/\r\n?/g,'\n').split('\n').slice(0,1):[])],size:.068},
  counter:{lines:['TAPE '+pad(Math.floor(elapsed/3600))+':'+pad(Math.floor(elapsed/60)%60)+':'+pad(Math.floor(elapsed)%60)],size:.058},
  zoom:{lines:['ZOOM '+Number(c.zoomValue||3).toFixed(1)+'x'],size:.067},
  modeInfo:{lines:[String(speed||'SP')+' / TAPE'],size:.064},
  focus:{lines:[Math.floor(elapsed*1.2)%9===0?'AF ●':'AF'],size:.065},
  play:{lines:['PLAY'],size:.07},
  rec:{lines:['REC'],size:.07,type:'rec'},
  battery:{lines:[],size:.068,type:'battery'}
 };
 for(const key of enabledKeys)if(c[key]){
  const spec=specs[key];place(key,spec.lines,spec.size,spec.type);
 }
 return {items,safe,frame,frameRect,base};
}
function draw(ctx,w,h,c={},speed='SP',elapsed=0){
 const scene=layout(ctx,w,h,c,speed,elapsed),{items,base}=scene;
 ctx.save();
 ctx.shadowColor='rgba(0,0,0,.7)';
 ctx.shadowBlur=Math.max(1,base*.004);
 ctx.textBaseline='top';
 for(const item of items){
  const {key,rect,size,lines,type}=item;
  if(type==='battery'){
   const x=rect.x,y=rect.y,ww=size*2.20,hh=size*.75;
   ctx.strokeStyle='#f5f5f5';ctx.lineWidth=Math.max(1,size*.07);ctx.strokeRect(x,y,ww,hh);
   ctx.fillStyle='#f5f5f5';ctx.fillRect(x+ww,y+hh*.3,size*.15,hh*.4);
   const count={FULL:4,'75%':3,'50%':2,'25%':1,LOW:1,EMPTY:0}[c.batteryLevel]??1;
   for(let i=0;i<count;i++)ctx.fillRect(x+size*.12+i*ww*.225,y+size*.12,ww*.17,Math.max(1,hh-size*.24));
   continue;
  }
  ctx.font='700 '+size+'px ui-monospace, Menlo, Courier New, monospace';
  const color=key==='rec'?'#ef5555':key==='focus'?'#d8e9d8':'#f5f5f5';
  if(type==='rec'){
   ctx.fillStyle=color;ctx.beginPath();
   ctx.arc(rect.x+size*.17,rect.y+size*.53,Math.max(1.5,size*.14),0,Math.PI*2);
   ctx.fill();
  }
  for(let i=0;i<lines.length;i++){
   const x=rect.x+(type==='rec'?size*.57:0),y=rect.y+i*size*1.25;
   ctx.fillStyle='rgba(0,0,0,.7)';ctx.fillText(lines[i],x+1,y+1);
   ctx.fillStyle=color;ctx.fillText(lines[i],x,y);
  }
 }
 if(scene.frame){
  const f=scene.frameRect,th=Math.max(1,base*.008),color=
   c.frameColor==='green'?'#a9f3b6':c.frameColor==='red'?'#f6a3a3':'#f5f5f5';
  ctx.strokeStyle=color;ctx.lineWidth=th;ctx.lineCap='square';ctx.beginPath();
  for(const [x,y,dx,dy] of [
   [f.left,f.top,1,1],[f.right,f.top,-1,1],
   [f.left,f.bottom,1,-1],[f.right,f.bottom,-1,-1]
  ]){
   ctx.moveTo(x,y+dy*f.len);ctx.lineTo(x,y);ctx.lineTo(x+dx*f.len,y);
  }
  ctx.stroke();
 }
 ctx.restore();
 return scene;
}
root.VHSVideoCameraOSD=Object.freeze({draw,layout,timestamp,POSITIONS});
})(window);