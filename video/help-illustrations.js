/* VHS Video Lab 0.7.9 — generated LOCAL examples, no remote media or assets.
 * GIF89a encoder makes small animated, indexed 160x92px walkthroughs.
 * Static compare uses the user's local frame when available, else an SVG diagram.
 */
(function(root){
'use strict';
const W=160,H=92;
const palette=[[13,15,19],[33,38,45],[76,84,94],[214,218,218],[246,187,105],[229,113,91],[112,196,169],[120,147,190]];
const store=new Map();
function makeFrame(variant,t){
 const p=new Uint8Array(W*H);
 function rect(x,y,w,h,color){
  const a=Math.max(0,Math.floor(x)),b=Math.min(W,Math.ceil(x+w));
  const top=Math.max(0,Math.floor(y)),bottom=Math.min(H,Math.ceil(y+h));
  for(let yy=top;yy<bottom;yy++)p.fill(color,yy*W+a,yy*W+b);
 }
 function line(x,y,x2,y2,color,thick=1){
  const dx=x2-x,dy=y2-y,steps=Math.ceil(Math.max(Math.abs(dx),Math.abs(dy)));
  for(let i=0;i<=steps;i++){
   const a=steps?i/steps:0;
   rect(x+dx*a-thick/2,y+dy*a-thick/2,thick,thick,color);
  }
 }
 function circle(cx,cy,r,color){
  const rr=r*r;
  for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=rr)rect(cx+x,cy+y,1,1,color);
 }
 function ring(cx,cy,r,color){
  for(let i=0;i<360;i+=5){
   const a=i*Math.PI/180;rect(cx+Math.cos(a)*r,cy+Math.sin(a)*r,2,2,color);
  }
 }
 function bar(x,y,w,h,color){rect(x,y,w,h,color);rect(x,y+h,w,1,2);}
 // Muted retro-film scene, large enough for a 1x phone-width sheet.
 rect(0,0,W,H,0);rect(7,7,146,59,1);rect(11,11,138,51,2);
 rect(16,16,54,42,1);rect(24,20,34,28,3);
 rect(80,17,63,3,3);rect(80,25,52,2,3);rect(80,32,56,2,7);
 rect(80,42,52,2,3);rect(80,49,35,2,3);
 rect(8,72,144,12,1);
 rect(14,77,131,2,2);
 const progress=Math.round(t/5*128);
 if(variant==='keyframes'){
  rect(13,13,134,49,1);
  line(20,55,20,20,3);line(20,55,139,55,3);
  line(23,53,83,23,4,2);line(83,23,136,53,4,2);
  for(const [x,y] of [[23,53],[83,23],[136,53]]){circle(x,y,3,4);ring(x,y,5,5);}
  let x=24+112*t/5;
  let y=x<83?53-(x-23)*30/60:23+(x-83)*30/53;
  line(x,16,x,57,7);circle(x,y,5,6);
  rect(15,77,progress,3,4);
 }else if(variant==='audio'||variant==='trim'){
  rect(15,20,131,37,1);
  for(let x=17;x<144;x+=3){
   const amp=4+Math.abs(Math.sin(x*.36)+Math.cos(x*.13))*9;
   rect(x,39-amp*.5,2,amp,x<35+t*17?6:3);
  }
  const edgeA=32+Math.round(t*5),edgeB=140-Math.round(t*7);
  rect(edgeA,18,2,43,4);rect(edgeB,18,2,43,4);
  rect(14,77,progress,3,6);
 }else if(variant==='cassette'){
  rect(27,14,108,47,1);rect(31,18,100,39,2);
  ring(55,38,14,4);ring(107,38,14,4);
  for(let j=0;j<6;j++){
   let a=(j*60+t*23)*Math.PI/180;
   line(55,38,55+11*Math.cos(a),38+11*Math.sin(a),3,2);
   line(107,38,107+11*Math.cos(a),38+11*Math.sin(a),3,2);
  }
  rect(54,49,53,5,t<2?3:4);
  if(t>=2){rect(27,14,108,2,4);rect(27,59,108,2,4);}
  rect(15,77,progress,3,4);
 }else if(variant==='camera'){
  rect(13,13,134,48,1);
  const len=16;
  for(const [x,y,dx,dy] of [[20,19,1,1],[140,19,-1,1],[20,55,1,-1],[140,55,-1,-1]]){
   line(x,y,x+len*dx,y,4,2);line(x,y,x,y+len*dy,4,2);
  }
  const x=35+Math.round(t*12),y=28+(t%2)*12;
  rect(x,y,25,5,5);rect(35,45,60,3,3);
  rect(15,77,progress,3,6);
 }else if(variant==='compare'){
  rect(12,12,136,49,2);
  rect(19,16,40,38,3);rect(67,16,17,38,4);rect(92,16,49,38,2);
  for(let yy=18;yy<55;yy+=4)rect(90+((yy*3+t*7)%10),yy,43,1,5);
  const x=14+Math.round(t*26);
  rect(x,12,2,49,4);rect(15,77,progress,3,4);
 }else if(variant==='frame'){
  for(let j=0;j<4;j++){
   const x=16+j*33,y=21;
   rect(x,y,27,32,1);rect(x+3,y+3,21,26,j===t%4?4:2);
   rect(x+9,y+9,7+(j%2)*6,12,3);
  }
  const idx=t%4;rect(16+idx*33,57,27,3,4);
  rect(15,77,progress,3,4);
 }else if(variant==='export'){
  rect(20,17,35,43,1);rect(27,22,23,32,3);
  line(60,38,91,38,4,3);line(83,32,91,38,4,2);line(83,44,91,38,4,2);
  rect(103,19,32,39,2);rect(109,25,20,28,6);
  rect(15,77,progress,4,4);
 }else if(variant==='timeline'||variant==='workflow'){
  rect(15,20,131,31,1);
  for(const [x,w,color] of [[20,29,4],[57,32,6],[97,41,7]])rect(x,29,w,13,color);
  const px=17+t*25;
  rect(px,15,2,45,3);circle(px,16,3,4);
  rect(15,77,progress,3,4);
 }else{
  rect(15,19,131,40,1);
  rect(21,29,42,21,3);rect(73,29,66,21,t%2===0?4:6);
  rect(15,77,progress,3,4);
 }
 return p;
}
function lzw(pixels){
 const clear=8,end=9,dict=new Map(),data=[];
 let codeSize=4,next=10,bits=0,buffer=0;
 function put(code){
  buffer|=code<<bits;bits+=codeSize;
  while(bits>=8){data.push(buffer&255);buffer>>>=8;bits-=8;}
 }
 put(clear);
 let previous=pixels[0];
 for(let i=1;i<pixels.length;i++){
  const current=pixels[i],key=(previous<<3)|current;
  if(dict.has(key)){previous=dict.get(key);continue;}
  put(previous);dict.set(key,next++);
  if(next>=4096){put(clear);dict.clear();codeSize=4;next=10;}
  else if(next===(1<<codeSize)+1&&codeSize<12)codeSize++;
  previous=current;
 }
 put(previous);put(end);
 if(bits>0)data.push(buffer&255);
 return data;
}
function gif(variant){
 const bytes=[];
 const push=(...x)=>bytes.push(...x),word=x=>push(x&255,(x>>8)&255);
 for(const c of 'GIF89a')push(c.charCodeAt(0));
 word(W);word(H);push(0xf2,0,0);
 for(const item of palette)push(...item);
 push(0x21,0xff,11);
 for(const c of 'NETSCAPE2.0')push(c.charCodeAt(0));
 push(3,1,0,0,0);
 for(let step=0;step<6;step++){
  push(0x21,0xf9,4,4,20,0,0,0);
  push(0x2c);word(0);word(0);word(W);word(H);push(0,3);
  const packed=lzw(makeFrame(variant,step));
  for(let p=0;p<packed.length;p+=255){
   const block=packed.slice(p,p+255);push(block.length,...block);
  }
  push(0);
 }
 push(0x3b);
 // Call btoa in safe chunks (Safari has a finite call-argument limit).
 let encoded='';
 for(let i=0;i<bytes.length;i+=4096)encoded+=String.fromCharCode(...bytes.slice(i,i+4096));
 return 'data:image/gif;base64,'+btoa(encoded);
}
function gifSource(variant='workflow'){
 const names=new Set(['keyframes','audio','trim','cassette','camera','compare','frame','export','timeline','workflow']);
 const id=names.has(variant)?variant:'workflow';
 if(!store.has(id))store.set(id,gif(id));
 return store.get(id);
}
function compareSvg(variant='vhs'){
 const kind=['audio','camera','film','glitch','leak','vhs','plain'].includes(variant)?variant:'vhs';
 let before='',after='';
 if(kind==='audio'){
  const wave=(x,extra)=>Array.from({length:43},(_,i)=>{
   const y=52-11*Math.sin(i*.66)*(extra?1.6:.65);
   return (x+i*3)+','+y.toFixed(1);
  }).join(' ');
  before='<polyline points="'+wave(18,false)+'" fill="none" stroke="#79c3a8" stroke-width="2"/>';
  after='<polyline points="'+wave(185,true)+'" fill="none" stroke="#efb978" stroke-width="3"/>';
 }else{
  const base=x=>'<rect x="'+(x+5)+'" y="18" width="135" height="68" rx="3" fill="#475a62"/>'+
   '<path d="M'+(x+5)+' 72 l36 -31 24 17 29 -27 46 41" fill="#73888b"/>'+
   '<circle cx="'+(x+98)+'" cy="35" r="12" fill="#f4d2a7"/>';
  before=base(0);after=base(168);
  if(kind==='camera')after+='<path d="M180 33 v-10 h12 M308 33 v-10 h-12 M180 71 v10 h12 M308 71 v10 h-12" fill="none" stroke="#f1e8dc" stroke-width="2"/>';
  else if(kind==='film')after+='<rect x="173" y="18" width="135" height="68" fill="#cfaa7d" opacity=".37"/>';
  else if(kind==='leak')after+='<rect x="174" y="18" width="39" height="68" fill="#ee9c6f" opacity=".63"/>';
  else if(kind==='glitch')after+='<path d="M175 40 h130 M175 48 h112 M175 70 h125" stroke="#e57a81" stroke-width="5" opacity=".9"/>';
  else if(kind==='vhs')for(let y=23;y<85;y+=7)after+='<path d="M174 '+y+' h132" stroke="#b2b3b2" stroke-width="1" opacity=".45"/>';
 }
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="124" viewBox="0 0 320 124">'+
  '<rect width="320" height="124" rx="10" fill="#15171b"/><rect x="10" y="12" width="141" height="80" rx="4" fill="#262a31"/>'+
  '<rect x="169" y="12" width="141" height="80" rx="4" fill="#262a31"/>'+
  before+after+
  '<text x="80" y="111" fill="#d9d9d9" font-family="Arial" font-size="12" text-anchor="middle">ДО</text>'+
  '<text x="239" y="111" fill="#eeb678" font-family="Arial" font-size="12" text-anchor="middle">ПОСЛЕ</text></svg>';
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
root.VHSVideoHelpIllustrations=Object.freeze({gifSource,compareSvg});
})(window);
