/* Local color grading and non-destructive video geometry. GPU first, CPU fallback. */
(function(root){
'use strict';
const C=(v,a,b)=>Math.max(a,Math.min(b,v));
const controls=[
 ['exposure','Экспозиция / EV',-3,3,.1],['brightness','Яркость',-100,100,1],['contrast','Контраст',-100,100,1],
 ['highlights','Света',-100,100,1],['shadows','Тени',-100,100,1],['whites','Белые',-100,100,1],['blacks','Чёрные',-100,100,1],
 ['temperature','Температура',-100,100,1],['tint','Оттенок',-100,100,1],['saturation','Насыщенность',-100,100,1],['vibrance','Красочность',-100,100,1],
 ['gamma','Средние тона',-100,100,1],['fade','Выцветание',0,100,1],['vignette','Виньетка',-100,100,1],['sharpness','Резкость',0,100,1]
];
const defaults=()=>({...Object.fromEntries(controls.map(([id])=>[id,0])),rotate:0,angle:0,flipX:false,flipY:false,aspect:'original',left:0,right:0,top:0,bottom:0});
function normalize(value){const s={...defaults(),...value};for(const [id,,min,max] of controls)s[id]=C(Number(s[id])||0,min,max);
 s.rotate=((Math.round((Number(s.rotate)||0)/90)*90)%360+360)%360;s.angle=C(Number(s.angle)||0,-45,45);
 for(const id of ['left','right','top','bottom'])s[id]=C(Number(s[id])||0,0,45);
 s.flipX=!!s.flipX;s.flipY=!!s.flipY;if(!['original','9:16','16:9','1:1','4:3','3:4','4:5','2.35:1'].includes(s.aspect))s.aspect='original';return s;}
const colorActive=s=>controls.some(([id])=>Number(s?.[id])!==0&&!!Number(s?.[id]));
const geometryActive=s=>!!(s&&(s.rotate||s.angle||s.flipX||s.flipY||s.left||s.right||s.top||s.bottom||s.aspect&&s.aspect!=='original'));
const active=s=>colorActive(s)||geometryActive(s);
function geometry(w,h,value,cap=1920){
 const s=normalize(value),x=w*s.left/100,y=h*s.top/100,cw=w*(1-(s.left+s.right)/100),ch=h*(1-(s.top+s.bottom)/100);
 const r=(s.rotate+s.angle)*Math.PI/180,co=Math.abs(Math.cos(r)),si=Math.abs(Math.sin(r));
 let bw=cw*co+ch*si,bh=cw*si+ch*co;
 if(s.aspect!=='original'){const [a,b]=s.aspect.split(':').map(Number),ratio=a/b;if(bw/bh>ratio)bw=bh*ratio;else bh=bw/ratio;}
 const scale=Math.min(1,cap/Math.max(bw,bh)),even=n=>Math.max(2,Math.round(n/2)*2);
 return {x,y,cw,ch,r,bw,bh,width:even(bw*scale),height:even(bh*scale),flipX:s.flipX,flipY:s.flipY};
}
function bounds(duration,trim){const d=Number(duration)||0;if(d<=0)return{start:0,end:0,length:0};const min=Math.min(.1,d);const start=C(Number(trim?.start)||0,0,d-min),end=C(trim?.end==null?d:Number(trim.end)||d,start+min,d);return{start,end,length:end-start};}
function trimmed(duration,trim){const b=bounds(duration,trim);return b.start>.001||b.end<duration-.001;}
function curve(x,s){
 const l=C(x,0,1),hi=l*l,lo=(1-l)*(1-l),mid=4*l*(1-l);
 let v=l*Math.pow(2,s.exposure)+s.brightness*.0035;
 v=(v-.5)*(1+s.contrast*.009)+.5;
 v+=s.highlights*.003*hi+s.shadows*.003*lo+s.whites*.003*Math.pow(l,4)+s.blacks*.003*Math.pow(1-l,4);
 v=Math.pow(C(v,0,1),Math.pow(2,-s.gamma/100));v=v*(1-s.fade*.004)+s.fade*.0018;
 return C(v,0,1);
}
function grade(r,g,b,s,table){
 let R=table[r],G=table[g],B=table[b];
 R+=s.temperature*.0018+s.tint*.0007;G-=s.tint*.0017;B-=s.temperature*.0018-s.tint*.0007;
 const y=R*.2126+G*.7152+B*.0722,delta=Math.max(R,G,B)-Math.min(R,G,B),sat=Math.max(0,1+s.saturation/100+s.vibrance/100*(1-C(delta,0,1)));
 return [C(y+(R-y)*sat,0,1),C(y+(G-y)*sat,0,1),C(y+(B-y)*sat,0,1)];
}
function cpu(ctx,w,h,s){
 const img=ctx.getImageData(0,0,w,h),d=img.data,table=Array.from({length:256},(_,i)=>curve(i/255,s));
 const old=s.sharpness?new Uint8ClampedArray(d):null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;let r=d[i],g=d[i+1],b=d[i+2];
  if(old&&x>0&&x<w-1&&y>0&&y<h-1){const k=s.sharpness*.003;const sharpen=j=>C(Math.round(old[i+j]+k*(4*old[i+j]-old[i+j-4]-old[i+j+4]-old[i+j-w*4]-old[i+j+w*4])),0,255);r=sharpen(0);g=sharpen(1);b=sharpen(2);}
  const out=grade(r,g,b,s,table),v=C(((2*x/w-1)**2+(2*y/h-1)**2)*.5,0,1),gain=1-s.vignette*.008*v*v;
  d[i]=out[0]*255*gain;d[i+1]=out[1]*255*gain;d[i+2]=out[2]*255*gain;
 }ctx.putImageData(img,0,0);
}
function create(){
 const work=document.createElement('canvas'),ctx=work.getContext('2d',{alpha:false}),gpu=document.createElement('canvas');
 let gl=null,program=null,tex=null,uniforms={},failed=false;
 function setup(){
  gl=gpu.getContext('webgl',{alpha:false,preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
  const shader=(type,src)=>{const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;};
  const vs=shader(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 uv; void main(){gl_Position=vec4(p,0.,1.);uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);}');
  const fs=shader(gl.FRAGMENT_SHADER,`precision highp float; varying vec2 uv; uniform sampler2D image;uniform vec2 px;uniform float exposure,brightness,contrast,highlights,shadows,whites,blacks,temperature,tint,saturation,vibrance,gamma,fade,vignette,sharpness;
   vec3 tone(vec3 l){vec3 v=l*exp2(exposure)+brightness*.0035;v=(v-.5)*(1.+contrast*.009)+.5;v+=highlights*.003*l*l+shadows*.003*(1.-l)*(1.-l)+whites*.003*pow(l,vec3(4.))+blacks*.003*pow(1.-l,vec3(4.));return clamp(pow(clamp(v,0.,1.),vec3(exp2(-gamma/100.)))*(1.-fade*.004)+fade*.0018,0.,1.);}
   void main(){vec3 c=texture2D(image,uv).rgb;if(sharpness>0.)c=clamp(c+sharpness*.003*(4.*c-texture2D(image,uv+vec2(px.x,0.)).rgb-texture2D(image,uv-vec2(px.x,0.)).rgb-texture2D(image,uv+vec2(0.,px.y)).rgb-texture2D(image,uv-vec2(0.,px.y)).rgb),0.,1.);
   c=tone(c)+vec3(temperature*.0018+tint*.0007,-tint*.0017,-temperature*.0018+tint*.0007);float y=dot(c,vec3(.2126,.7152,.0722));float delta=max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b);c=clamp(vec3(y)+(c-y)*max(0.,1.+saturation/100.+vibrance/100.*(1.-clamp(delta,0.,1.))),0.,1.);vec2 q=uv*2.-1.;float v=clamp(dot(q,q)*.5,0.,1.);gl_FragColor=vec4(clamp(c*(1.-vignette*.008*v*v),0.,1.),1.);}`);
  program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);for(const [key,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);
  for(const [id] of controls)uniforms[id]=gl.getUniformLocation(program,id);uniforms.px=gl.getUniformLocation(program,'px');gl.uniform1i(gl.getUniformLocation(program,'image'),0);
 }
 function render(source,w,h,value){
  const s=normalize(value),g=geometry(source.videoWidth||source.width,source.videoHeight||source.height,s,Math.max(w,h));
  if(work.width!==w)work.width=w;if(work.height!==h)work.height=h;
  ctx.save();ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);const scale=Math.min(w/g.bw,h/g.bh);ctx.scale((g.flipX?-1:1)*scale,(g.flipY?-1:1)*scale);ctx.rotate(g.r);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,g.x,g.y,g.cw,g.ch,-g.cw/2,-g.ch/2,g.cw,g.ch);ctx.restore();
  if(!colorActive(s))return work;
  if(!failed){try{
   if(!gl)setup();if(gl.isContextLost())throw Error('Context lost');if(gpu.width!==w)gpu.width=w;if(gpu.height!==h)gpu.height=h;
   gl.viewport(0,0,w,h);gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,work);gl.uniform2f(uniforms.px,1/w,1/h);for(const [id] of controls)gl.uniform1f(uniforms[id],s[id]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);return gpu;
  }catch(err){failed=true;console.warn('Correction GPU fallback',err);}}
  cpu(ctx,w,h,s);return work;
 }
 return {render};
}
root.VHSVideoCorrection=Object.freeze({controls,defaults,normalize,active,geometryActive,colorActive,geometry,bounds,trimmed,curve,grade,create});
})(window);
