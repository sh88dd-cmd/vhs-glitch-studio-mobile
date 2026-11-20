/* VHS Photo Signal v1.1 — original browser implementation based on analog
 * luminance/chrominance signal principles documented by ntsc-rs.
 * This is not the ntsc-rs Rust/WebAssembly engine.
 * Self-contained, seeded, offline, RGBA image data is edited in place.
 * License of this independent implementation: MIT.
 */
(function(root){
"use strict";
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const power=v=>clamp(Number(v||0)/100,0,1);
function random(seed,stage){
  let x=(seed^Math.imul(stage,0x9e3779b9))>>>0;
  return ()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function avgColorBlur(data,w,h,conf,master,seed){
  const speed=(conf.tapeSpeed||"SP").toUpperCase(),bc=power(conf.chromaBleed)*master;
  const cp=power(conf.composite)*master,rp=power(conf.ringing)*master;
  const strength=clamp(master,0,1.35);
  if(strength<=0)return;
  const lumaAlpha=clamp((speed==="EP"?.20:speed==="LP"?.37:.78)/(Math.max(.7,strength)),.14,.97);
  const chromaAlpha=clamp((speed==="EP"?.085:speed==="LP"?.14:.32)*(1-bc*.78),.028,.65);
  const delay=Math.min(9,Math.round(1+bc*4+(speed==="EP"?3:speed==="LP"?2:0)));
  const luma=new Float32Array(w),u=new Float32Array(w),v=new Float32Array(w);
  const fy=new Float32Array(w),fu=new Float32Array(w),fv=new Float32Array(w);
  const rnd=random(seed,201),phase=rnd()*6.283;
  for(let y=0;y<h;y++){
    const off=y*w*4;
    for(let x=0;x<w;x++){
      const i=off+x*4,r=data[i],g=data[i+1],b=data[i+2];
      const l=.299*r+.587*g+.114*b;
      luma[x]=l;u[x]=(b-l)*.565;v[x]=(r-l)*.713;
    }
    let lastY=luma[0],lastU=u[0],lastV=v[0];
    for(let x=0;x<w;x++){
      lastY+=lumaAlpha*(luma[x]-lastY);
      lastU+=chromaAlpha*(u[x]-lastU);
      lastV+=chromaAlpha*(v[x]-lastV);
      fy[x]=lastY;fu[x]=lastU;fv[x]=lastV;
    }
    // The backwards pass limits the artificial one-sided "airbrush" look.
    lastY=fy[w-1];lastU=fu[w-1];lastV=fv[w-1];
    for(let x=w-1;x>=0;x--){
      lastY+=lumaAlpha*(fy[x]-lastY);
      lastU+=chromaAlpha*(fu[x]-lastU);
      lastV+=chromaAlpha*(fv[x]-lastV);
      fy[x]=lastY;fu[x]=lastU;fv[x]=lastV;
    }
    const chromaMix=clamp((speed==="EP"?.82:speed==="LP"?.66:.45)+bc*.48,0,.99);
    const lumaMix=clamp((speed==="EP"?.78:speed==="LP"?.60:.36)*strength,0,1);
    for(let x=0;x<w;x++){
      const at=off+x*4,cx=Math.max(0,x-delay);
      let yy=luma[x]*(1-lumaMix)+fy[x]*lumaMix;
      let uu=u[x]*(1-chromaMix)+fu[cx]*chromaMix;
      let vv=v[x]*(1-chromaMix)+fv[cx]*chromaMix;
      if(cp){
        // Composite cross-color: fine luminance edges leak into quadrature chroma.
        const left=luma[Math.max(0,x-1)],right=luma[Math.min(w-1,x+1)];
        const edge=clamp((right-left)/125,-1,1),carrier=Math.sin(x*Math.PI*.5+(y&1)*Math.PI*.72+phase);
        const c=cp*carrier*edge*23;
        uu+=c*.67;vv+=c*.45;
        // Dot crawl is concentrated around real contrasting contours, not drawn across the frame.
        yy+=cp*edge*carrier*3.2;
      }
      if(rp){
        const d=Math.max(2,Math.round(w*.0015)),x1=Math.max(0,x-d),x2=Math.max(0,x-d*2);
        const echo=(fy[x1]-fy[x2])*rp*.40;
        yy+=echo;
      }
      const outR=yy+1.403*vv,outB=yy+1.773*uu,outG=(yy-.299*outR-.114*outB)/.587;
      data[at]=clamp(outR,0,255);
      data[at+1]=clamp(outG,0,255);
      data[at+2]=clamp(outB,0,255);
    }
  }
}
function edgeWave(data,w,h,intensity,seed){
  if(intensity<=0)return;
  const rand=random(seed,211),knots=Array.from({length:Math.max(8,Math.ceil(h/52))},()=>rand()*2-1);
  const phase=rand()*Math.PI*2;
  const row=new Uint8ClampedArray(w*4);
  for(let y=0;y<h;y++){
    const a=(y/(Math.max(1,h-1)))*(knots.length-1),k=Math.min(knots.length-2,Math.floor(a)),f=a-k,t=f*f*(3-2*f);
    const wave=knots[k]*(1-t)+knots[k+1]*t+Math.sin(y/h*25+phase)*.17;
    const dx=Math.round(w*.014*intensity*wave);
    if(!dx)continue;
    const off=y*w*4;row.set(data.subarray(off,off+w*4));
    for(let x=0;x<w;x++){
      const src=clamp(x-dx,0,w-1)*4,dst=off+x*4;
      data[dst]=row[src];data[dst+1]=row[src+1];data[dst+2]=row[src+2];
    }
  }
}
function trackingGeometry(seed,w,h,intensity){
  if(intensity<=0)return [];
  const r=random(seed,223),num=1+Math.floor(r()*4);
  const list=[];
  for(let j=0;j<num;j++){
    const variety=r();
    const bandH=Math.max(1,Math.round(h*(variety<.44?.002+r()*.011:variety<.77?.013+r()*.026:.04+r()*.07)));
    const y0=Math.floor(r()*Math.max(1,h-bandH));
    const x0=r()<.50?0:Math.floor(r()*w*.30);
    const x1=r()<.78?w:Math.ceil(w*(.68+r()*.32));
    const shift=(r()<.5?-1:1)*(w*(.008+r()*.085));
    list.push({y0,y1:Math.min(h,y0+bandH),x0,x1:Math.max(x0+1,x1),shift,seed:r(),glitch:r()<.7});
  }
  return list;
}
function tracking(data,w,h,amt,seed){
  if(!amt)return;
  const bands=trackingGeometry(seed,w,h,amt),row=new Uint8ClampedArray(w*4);
  const rand=random(seed,227);
  for(const band of bands){
    const ys=band.y0,ye=band.y1,center=(ys+ye)/2;
    for(let y=ys;y<ye;y++){
      const off=y*w*4;row.set(data.subarray(off,off+w*4));
      const rel=(y-ys)/Math.max(1,ye-ys);
      const dx=Math.round(band.shift*amt*(.7+.3*Math.sin(rel*5.5)));
      const scan=(rand()-.5)*amt*17;
      for(let x=band.x0;x<band.x1;x++){
        const ix=clamp(x-dx,0,w-1),at=off+x*4,src=ix*4;
        const noise=rand();
        const line=rndBias(y,center,ye-ys);
        const snow=band.glitch&&noise<.003+amt*.015&&x%3===0?100*amt:0;
        data[at]=clamp(row[src]+scan+snow+line*amt,0,255);
        data[at+1]=clamp(row[src+1]+scan+snow+line*amt,0,255);
        data[at+2]=clamp(row[src+2]+scan+snow+line*amt,0,255);
      }
    }
  }
}
function rndBias(y,center,height){return height<3?0:Math.sin((y-center)*Math.PI/Math.max(1,height))*13;}
function chromaLoss(data,w,h,amt,seed){
  if(!amt)return;
  const r=random(seed,233),prob=.0015+amt*.052;
  for(let y=0;y<h;y++){
    if(r()>prob)continue;
    const whiten=.60+.4*r(),off=y*w*4;
    for(let x=0;x<w;x++){
      const i=off+x*4,l=.299*data[i]+.587*data[i+1]+.114*data[i+2];
      data[i]=data[i]*(1-whiten)+l*whiten;
      data[i+1]=data[i+1]*(1-whiten)+l*whiten;
      data[i+2]=data[i+2]*(1-whiten)+l*whiten;
    }
  }
}
function videoNoise(data,w,h,amt,seed){
  if(!amt)return;
  const r=random(seed,241);
  const amplitude=amt*23;
  const snowProb=.00004+amt*.0013;
  for(let y=0;y<h;y++){
    const rowNoise=(r()-.5)*amt*11,scan=y%3===1?1-amt*.035:1;
    const off=y*w*4;
    let snowRemain=0,snowShade=0;
    for(let x=0;x<w;x++){
      const at=off+x*4,noise=(r()+r()+r()-1.5)*amplitude+rowNoise;
      if(snowRemain<=0&&r()<snowProb){snowRemain=2+Math.floor(r()*Math.min(26,3+amt*24));snowShade=r()<.85?242:19;}
      const s=snowRemain-->0?amt*.65:0;
      for(let c=0;c<3;c++){
        const val=(data[at+c]+noise)*scan;
        data[at+c]=clamp(val*(1-s)+snowShade*s,0,255);
      }
    }
  }
}
function apply(data,w,h,params={}){
  if(!data||!w||!h||data.length!==w*h*4)throw Error("Неверный буфер фотографии для VHS");
  const signal=params.signal||{},master=clamp(Number(params.master??1),0,1.4);
  if(master<=0)return data;
  const seed=(params.seed||0)>>>0;
  const waves=power(signal.edgeWave)*master;
  const track=power(signal.tracking)*master;
  // Geometry is seeded: strengths change amplitude but not positions.
  edgeWave(data,w,h,waves,seed);
  avgColorBlur(data,w,h,signal,master,seed);
  tracking(data,w,h,track,seed);
  chromaLoss(data,w,h,power(signal.chromaLoss)*master,seed);
  videoNoise(data,w,h,power(signal.noise)*master,seed);
  return data;
}
root.VHSPhotoEngine=Object.freeze({apply,trackingGeometry});
})(typeof window!=='undefined'?window:globalThis);
