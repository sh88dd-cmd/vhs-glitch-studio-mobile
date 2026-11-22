/* Instant-print photo module — tactile paper, adaptive crop-free frames.
   Geometry is based on the recognizable broad lower border of integral film;
   photos of any aspect ratio are contained in full, never stretched or cropped.
   All surfaces and edge wear are generated with offline canvas drawing.
*/
(function(root){
'use strict';
const C=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const styles=Object.freeze([
 {id:'classic',name:'Классика · белая',paper:'#f8f8f5',top:'#fffefd',edge:'#b5b3af',side:.068,bottom:.235},
 {id:'ivory',name:'SX-70 · слоновая кость',paper:'#ede6d7',top:'#fff9ee',edge:'#afaa9e',side:.068,bottom:.24},
 {id:'aged',name:'1970-е · состаренная',paper:'#e2d3b6',top:'#f2e6cb',edge:'#98876f',side:.075,bottom:.26},
 {id:'black',name:'Black Frame · матовая',paper:'#171716',top:'#3f403f',edge:'#050505',side:.065,bottom:.23},
 {id:'rainbow',name:'Радужная полоска',paper:'#f6f6f2',top:'#ffffff',edge:'#aaa9a4',side:.068,bottom:.25},
 {id:'color',name:'Цветная рамка · ретро',paper:'#e7a1a1',top:'#f1c6ba',edge:'#ac6a6c',side:.070,bottom:.235},
 {id:'silver',name:'Серебристая · металлик',paper:'#bfc1c3',top:'#f0f0f0',edge:'#6b7076',side:.067,bottom:.24},
 {id:'mini',name:'Instant Mini · компактная',paper:'#f8f6ef',top:'#ffffff',edge:'#b8b1a6',side:.082,bottom:.255}
]);
const looks=[
 {id:'original',name:'Без дополнительного эффекта'},
 {id:'soft',name:'Мягкая моментальная плёнка'},
 {id:'warm',name:'Тёплая 1970-х'},
 {id:'fade',name:'Выцветшая эмульсия'},
 {id:'cold',name:'Холодная синеватая'},
 {id:'mono',name:'Монохромная'},
 {id:'expired',name:'Просроченная плёнка'}
];
const defaults=()=>({
 enabled:false,style:'classic',look:'soft',strength:55,paperWear:22,
 surface:'matte',frameSize:100,bottomHeight:100,
 note:'',noteColor:'#55514b',background:'studio',
 seed:518712,grain:14
});
function hydrate(input={}){
 const v={...defaults(),...(input&&typeof input==='object'?input:{})};
 if(!styles.some(s=>s.id===v.style))v.style='classic';
 if(!looks.some(s=>s.id===v.look))v.look='soft';
 v.note=String(v.note||'').slice(0,90);
 return v;
}
function hash(seed,x,y){
 let n=((seed>>>0)^Math.imul(x+1,0x9e3779b1)^Math.imul(y+1,0x85ebca6b))>>>0;
 n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;
 return((n^(n>>>16))>>>0)/4294967296;
}
function look(canvas,cfg){
 if(!cfg?.enabled||cfg.look==='original'||Number(cfg.strength)<=0)return canvas;
 const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;
 const image=ctx.getImageData(0,0,w,h),p=image.data;
 const power=C(cfg.strength,0,100)/100,grain=C(cfg.grain,0,100)/100;
 const faded=cfg.look==='fade'||cfg.look==='expired';
 const seed=(Number(cfg.seed)||0)>>>0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  let r=p[i],g=p[i+1],b=p[i+2];if(p[i+3]<10)continue;
  const l=r*.299+g*.587+b*.114;
  if(cfg.look==='mono'){
   r=l;g=l;b=l;
  }else if(cfg.look==='warm'){
   r=r*1.055+12;g=g*1.005+4;b=b*.91-8;
  }else if(cfg.look==='cold'){
   r=r*.94-3;g=g*1.01+3;b=b*1.065+10;
  }else if(cfg.look==='expired'){
   r=r*1.05+10;g=g*.98+4;b=b*.87-10;
   const shade=(x/w-.5)*18*Math.sin(y/h*10+seed*.000001);
   r+=shade;g+=shade*.35;b+=shade*.15;
  }else if(cfg.look==='fade'){
   r=r*.94+15;g=g*.94+12;b=b*.93+11;
  }else{
   r=r*.98+5;g=g*.99+3;b=b*.985+5;
  }
  const l2=.299*r+.587*g+.114*b;
  const sat=cfg.look==='mono'?0:faded?.83:.94;
  r=l2+(r-l2)*sat;g=l2+(g-l2)*sat;b=l2+(b-l2)*sat;
  const n=(hash(seed,x,y)-.5)*grain*17;
  p[i]=C(p[i]*(1-power)+(r+n)*power,0,255);
  p[i+1]=C(p[i+1]*(1-power)+(g+n)*power,0,255);
  p[i+2]=C(p[i+2]*(1-power)+(b+n)*power,0,255);
 }
 ctx.putImageData(image,0,0);return canvas;
}
function geometry(w,h,cfg={}){
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2)
  throw Error('Неверные размеры фотографии');
 const style=styles.find(s=>s.id===cfg.style)||styles[0];
 const scale=C(cfg.frameSize??100,45,165)/100;
 const m=Math.min(w,h);
 // Long, landscape photos keep their original wide image window; tall
 // portraits remain tall. Frame proportion is never imposed by cropping.
 const side=Math.max(3,Math.round(m*style.side*scale));
 const top=Math.max(3,Math.round(m*style.side*1.02*scale));
 const bottom=Math.max(top+4,Math.round(m*style.bottom*scale*C(cfg.bottomHeight??100,60,160)/100));
 const pad=Math.max(4,Math.round(m*.025*scale));
 return {side,top,bottom,pad,
  outerW:w+2*side,outerH:h+top+bottom,
  width:w+2*(side+pad),height:h+top+bottom+2*pad,
  imageX:pad+side,imageY:pad+top,imageW:w,imageH:h,
  style};
}
const grainTile=document.createElement('canvas');grainTile.width=192;grainTile.height=192;
function paperTexture(ctx,geo,cfg){
 const style=geo.style,seed=(Number(cfg.seed)||0)>>>0;
 const tile=grainTile,tex=tile.getContext('2d',{willReadFrequently:true});
 const image=tex.createImageData(tile.width,tile.height),d=image.data;
 const wear=C(cfg.paperWear,0,100)/100;
 for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++){
  const p=(y*tile.width+x)*4;
  const rough=(hash(seed,x,y)-.5)*16;
  const fiber=hash(seed,x>>>2,y*7)>.987?16:0;
  const n=rough+fiber;
  d[p]=n>0?255:12;d[p+1]=n>0?255:9;d[p+2]=n>0?255:6;
  d[p+3]=Math.round(Math.min(26,Math.abs(n)*(1.1+wear)));
 }
 tex.putImageData(image,0,0);
 ctx.save();
 const x=geo.pad,y=geo.pad;
 ctx.beginPath();ctx.rect(x,y,geo.outerW,geo.outerH);ctx.clip();
 ctx.globalAlpha=.65+wear*.35;
 ctx.fillStyle=ctx.createPattern(tile,'repeat');
 ctx.fillRect(x,y,geo.outerW,geo.outerH);
 ctx.restore();
}
function paperWear(ctx,g,cfg){
 const wear=C(cfg.paperWear,0,100)/100,seed=(Number(cfg.seed)||0)>>>0;
 if(wear<.01)return;
 const x=g.pad,y=g.pad,w=g.outerW,h=g.outerH;
 ctx.save();
 const vignette=ctx.createLinearGradient(x,y,x+w,y+h);
 vignette.addColorStop(0,'rgba(164,126,70,'+(.03+wear*.10)+')');
 vignette.addColorStop(.42,'rgba(255,255,244,0)');
 vignette.addColorStop(1,'rgba(129,94,44,'+(.025+wear*.12)+')');
 ctx.fillStyle=vignette;ctx.fillRect(x,y,w,h);
 for(let i=0;i<Math.round(45*wear);i++){
  const rx=x+hash(seed,i,91)*w,ry=y+hash(seed,i,83)*h;
  // Restrict wear scratches and spots to the paper border.
  if(rx>g.imageX-1&&rx<g.imageX+g.imageW+1&&
   ry>g.imageY-1&&ry<g.imageY+g.imageH+1)continue;
  ctx.fillStyle='rgba(110,93,68,'+(wear*.025)+')';
  ctx.beginPath();ctx.arc(rx,ry,1+hash(seed,i,73)*Math.max(1,g.side*.27),0,Math.PI*2);ctx.fill();
 }
 ctx.restore();
}
function render(source,cfg={},maxPixels=56000000){
 if(!cfg?.enabled)return source;
 const w=source.width,h=source.height;
 const g=geometry(w,h,cfg);
 if(g.width*g.height>maxPixels)
  throw Error('Polaroid со всеми полями превышает память iPhone. В сохранении выбери размер 3200 или 2000 пикселей.');
 const out=document.createElement('canvas');out.width=g.width;out.height=g.height;
 const ctx=out.getContext('2d');
 const x=g.pad,y=g.pad,ow=g.outerW,oh=g.outerH;
 const backdrop=cfg.background||'studio';
 if(backdrop!=='transparent'){
  if(backdrop==='white'){ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);}
  else if(backdrop==='dark'){ctx.fillStyle='#282827';ctx.fillRect(0,0,out.width,out.height);}
  else{
   const surface=ctx.createLinearGradient(0,0,out.width,out.height);
   surface.addColorStop(0,'#d6d0c7');surface.addColorStop(.47,'#c7c1b7');
   surface.addColorStop(1,'#d9d3ca');
   ctx.fillStyle=surface;ctx.fillRect(0,0,out.width,out.height);
  }
 }
 ctx.save();
 ctx.shadowColor='rgba(31,26,23,.41)';
 ctx.shadowBlur=Math.max(6,g.pad*1.20);
 ctx.shadowOffsetX=g.pad*.17;ctx.shadowOffsetY=g.pad*.40;
 ctx.fillStyle=g.style.paper;ctx.fillRect(x,y,ow,oh);ctx.restore();
 ctx.strokeStyle='rgba(27,23,18,.18)';ctx.lineWidth=Math.max(1,Math.floor(w/1200));
 ctx.strokeRect(x+.5,y+.5,ow-1,oh-1);
 const surface=ctx.createLinearGradient(x,y,x+ow,y+oh);
 surface.addColorStop(0,g.style.top);
 surface.addColorStop(.36,g.style.paper);
 surface.addColorStop(1,g.style.paper);
 ctx.fillStyle=surface;ctx.fillRect(x+1,y+1,ow-2,oh-2);
 if(g.style.id==='silver'){
  const metallic=ctx.createLinearGradient(x,0,x+ow,0);
  metallic.addColorStop(0,'rgba(255,255,255,.34)');
  metallic.addColorStop(.34,'rgba(25,27,32,.10)');
  metallic.addColorStop(.70,'rgba(255,255,255,.32)');
  metallic.addColorStop(1,'rgba(25,27,32,.11)');
  ctx.fillStyle=metallic;ctx.fillRect(x,y,ow,oh);
 }
 paperTexture(ctx,g,cfg);
 // The film window has a physically raised inner rim, not a generic CSS border.
 const ix=g.imageX,iy=g.imageY;
 ctx.fillStyle='rgba(15,13,10,.24)';
 ctx.fillRect(ix-2,iy-2,w+4,h+4);
 ctx.drawImage(source,ix,iy,w,h);
 if(cfg.surface==='glossy'){
  const glare=ctx.createLinearGradient(ix,iy,ix+w,iy+h*.36);
  glare.addColorStop(0,'rgba(255,255,255,.075)');
  glare.addColorStop(.55,'rgba(255,255,255,.013)');
  glare.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=glare;ctx.fillRect(ix,iy,w,h);
 }
 ctx.strokeStyle='rgba(19,14,11,.26)';ctx.lineWidth=Math.max(1,w*.0013);
 ctx.strokeRect(ix-.5,iy-.5,w+1,h+1);
 // Very narrow, imperfect emulsion strip near the developed picture edge.
 ctx.strokeStyle='rgba(255,253,230,.14)';ctx.strokeRect(ix+1.5,iy+1.5,w-3,h-3);
 if(g.style.id==='rainbow'){
  const cols=['#db554c','#e9b654','#7baf71','#77b4cb','#a091c6'];
  const barW=ow*.22,barH=Math.max(3,g.side*.12);
  for(let k=0;k<cols.length;k++){
   ctx.fillStyle=cols[k];ctx.fillRect(x+ow*.5-barW*.5,y+oh-g.bottom*.57+k*barH,
    barW,barH+1);
  }
 }
 paperWear(ctx,g,cfg);
 // Handwritten annotation sits on the lower paper border, never on the photo.
 const note=String(cfg.note||'').replace(/\s+/g,' ').trim().slice(0,90);
 if(note){
  ctx.save();ctx.fillStyle=cfg.noteColor||'#4b4640';
  ctx.globalAlpha=.85;
  const font=Math.max(10,Math.min(g.bottom*.28,ow*.045));
  ctx.font='italic '+font+'px "Marker Felt","Bradley Hand","Segoe Print",cursive';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.translate(x+ow/2,iy+h+g.bottom*.53);
  ctx.rotate((hash(Number(cfg.seed)||0,89,47)-.5)*.032);
  ctx.fillText(note,0,0,ow*.87);ctx.restore();
 }
 return out;
}
root.VHSPhotoPolaroid=Object.freeze({styles,looks,defaults,hydrate,geometry,look,render});
})(window);
