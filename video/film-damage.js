/* VHS Video Lab 0.7 — original deterministic moving film damage.
 * Runs on the small intermediate signal buffer, no image assets/network.
 */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const rand=(seed,a,b=0)=>{
 let n=((seed|0)^Math.imul(a+1,0x9e3779b1)^Math.imul(b+9,0x85ebca6b))>>>0;
 n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;n=Math.imul(n,0x846ca68b);
 return((n^(n>>>16))>>>0)/4294967296;
};
function apply(p,w,h,cfg={}){
 if(!p||p.length!==w*h*4||!cfg.enabled)return p;
 const strength=v=>clamp(Number(v)||0,0,100)/100;
 const leak=strength(cfg.leak),dust=strength(cfg.dust),grain=strength(cfg.grain);
 const scratches=strength(cfg.scratches),flicker=strength(cfg.flicker),halation=strength(cfg.halation);
 if(!Math.max(leak,dust,grain,scratches,flicker,halation))return p;
 const time=Math.max(0,Number(cfg.time)||0),seed=(Number(cfg.seed)||0)>>>0;
 const ft=Math.floor(time*12),slow=Math.floor(time*.75),ty=Math.floor(time*3);
 const globalGain=1+flicker*(.12*Math.sin(time*11)+.075*(rand(seed,ty,99)*2-1));
 const type=['edge-left','edge-right','both','first','random'].includes(cfg.type)?cfg.type:'edge-left';
 const family=type==='random'?Math.floor(rand(seed,slow,3)*4):type==='first'?0:type==='edge-left'?0:type==='edge-right'?1:2;
 const firstFade=type==='first'?clamp(1-time/1.4,0,1):1;
 const motion=Math.sin(time*1.7+seed*.000001)*.025;
 const leakWidth=.045+rand(seed,slow,5)*.07;
 const scratchNumber=Math.round(scratches*7);
 const lines=[];
 for(let i=0;i<scratchNumber;i++){
  const ix=Math.floor(time*.8)+(i*7),x=rand(seed,ix,i)*w;
  lines.push({x,light:rand(seed,ix,i+80)>.62,width:.24+rand(seed,ix,i+25)*1.4});
 }
 const spots=Math.round(dust*35);
 const flecks=[];
 for(let i=0;i<spots;i++)flecks.push({
  x:Math.floor(rand(seed,Math.floor(time*.43)+i*7,109)*w),
  y:Math.floor(rand(seed,Math.floor(time*.43)+i*7,211)*h),
  rad:Math.max(1,Math.floor((.3+rand(seed,i,317)*1.6)*Math.min(w,h)/220)),
  bright:rand(seed,i,519)>.65
 });
 for(let y=0;y<h;y++){
  const ny=y/Math.max(1,h),wave=Math.sin(ny*13+time*2.2)*.014+motion;
  for(let x=0;x<w;x++){
   const i=(y*w+x)*4,xx=x/Math.max(1,w);
   let r=p[i],g=p[i+1],b=p[i+2];
   const lum=.299*r+.587*g+.114*b;
   const amp=halation*clamp((lum-145)/110,0,1);
   if(amp){r+=amp*32;g+=amp*12;b+=amp*3;}
   if(leak&&firstFade){
    const edgeL=Math.exp(-Math.pow(Math.max(0,xx-wave)/leakWidth,1.3));
    const edgeR=Math.exp(-Math.pow(Math.max(0,1-xx+wave)/leakWidth,1.3));
    const shape=(family===0?edgeL:family===1?edgeR:family===2?Math.max(edgeL,edgeR):.7*(edgeL+edgeR));
    const variations=.7+.3*Math.sin(ny*8.5+time*2)+.12*Math.sin(ny*27-time*1.7);
    const t=clamp(shape*variations*leak*firstFade,0,1.1);
    r+=t*168;g+=t*(family===1?41:68);b+=t*(family===2?44:7);
   }
   const n=grain?(rand(seed,ft,x+y*w)-.5)*grain*64:0;
   p[i]=clamp(r*globalGain+n,0,255);
   p[i+1]=clamp(g*globalGain+n,0,255);
   p[i+2]=clamp(b*globalGain+n,0,255);
  }
 }
 for(const s of lines){
  const shift=Math.sin(time*3+s.x*.12)*.9;
  for(let y=0;y<h;y++){
   if(rand(seed,ft+Math.floor(y/15),Math.floor(s.x))<.08)continue;
   const cx=Math.round(s.x+shift+Math.sin(y*.07+time)*.35),start=Math.max(0,cx-Math.floor(s.width));
   for(let x=start;x<=Math.min(w-1,cx+Math.ceil(s.width));x++){
    const k=(y*w+x)*4,adj=s.light?150:-135;
    p[k]=clamp(p[k]+adj*scratches,0,255);
    p[k+1]=clamp(p[k+1]+adj*scratches,0,255);
    p[k+2]=clamp(p[k+2]+adj*scratches,0,255);
   }
  }
 }
 for(const dot of flecks){
  for(let y=Math.max(0,dot.y-dot.rad);y<=Math.min(h-1,dot.y+dot.rad);y++)
  for(let x=Math.max(0,dot.x-dot.rad);x<=Math.min(w-1,dot.x+dot.rad);x++){
   if((x-dot.x)**2+(y-dot.y)**2>dot.rad**2)continue;
   const j=(y*w+x)*4;
   const v=dot.bright?220:13;
   for(let k=0;k<3;k++)p[j+k]=p[j+k]*(1-dust*.85)+v*dust*.85;
  }
 }
 return p;
}
root.VHSVideoFilmDamage=Object.freeze({apply});
})(window);
