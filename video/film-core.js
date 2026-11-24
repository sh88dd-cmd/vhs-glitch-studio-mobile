/* VHS Video Lab: shares the EXACT built-in and XMP grading algorithms of the
 * existing photo editor, not an independently approximated replacement.
 * Source: app.js (VHS Glitch Studio Mobile), reused without modifying photo app.
 */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  // Gamma acts on the ORIGINAL 8-bit input byte, so precompute the exact
  // Math.pow(value/255, 1/gamma) curve once per film. The live 720p camera
  // no longer evaluates three expensive pow() calls PER PIXEL per frame.
  const gammaCache=new Map();
  function gammaCurve(gamma){
    if(gammaCache.has(gamma))return gammaCache.get(gamma);
    const table=new Float64Array(256);
    for(let i=0;i<256;i++)table[i]=Math.pow(i/255,1/gamma);
    gammaCache.set(gamma,table);
    return table;
  }
  function filmBuiltin(p,recipe,strength){
    if(!recipe||strength<=0)return;
    const [gamma,contr,sat,gain,lift,shadows,highlights]=recipe;
    const curve=gammaCurve(gamma);
    for(let i=0;i<p.length;i+=4){
      const r0=p[i],g0=p[i+1],b0=p[i+2];
      let r=curve[r0],g=curve[g0],b=curve[b0];
      r=(r-.5)*contr+.5;g=(g-.5)*contr+.5;b=(b-.5)*contr+.5;
      const l=.299*r+.587*g+.114*b; r=l+(r-l)*sat;g=l+(g-l)*sat;b=l+(b-l)*sat;
      const sh=(1-clamp(l,0,1))**2, hi=clamp(l,0,1)**2;
      r=r*gain[0]+lift[0]/255+sh*shadows[0]/255+hi*highlights[0]/255;
      g=g*gain[1]+lift[1]/255+sh*shadows[1]/255+hi*highlights[1]/255;
      b=b*gain[2]+lift[2]/255+sh*shadows[2]/255+hi*highlights[2]/255;
      p[i]=clamp(r0*(1-strength)+r*255*strength,0,255);
      p[i+1]=clamp(g0*(1-strength)+g*255*strength,0,255);
      p[i+2]=clamp(b0*(1-strength)+b*255*strength,0,255);
    }
  }
  function filmXMP(p,profile,strength){
    if(!profile||strength<=0)return;
    const f=profile.fields, n=k=>Number(f[k]||0)||0;
    const exp=clamp(2**clamp(n('Exposure2012'),-3,3),.125,8),contrast=1+n('Contrast2012')/100;
    const sat=1+n('Saturation')/100+n('Vibrance')*.006;
    const shadows=n('Shadows2012')*.0022,high=n('Highlights2012')*.0020;
    const whites=n('Whites2012')*.001,blacks=n('Blacks2012')*.001;
    const mono=String(f.Treatment||'').toLowerCase().includes('gray')||String(f.ConvertToGrayscale||'').toLowerCase()==='true';
    const curve=profile.curve;
    for(let i=0;i<p.length;i+=4){
      const o0=p[i],o1=p[i+1],o2=p[i+2];
      let r=(o0/255*exp-.5)*contrast+.5,g=(o1/255*exp-.5)*contrast+.5,b=(o2/255*exp-.5)*contrast+.5;
      const l=.299*r+.587*g+.114*b,lc=clamp(l,0,1),sh=1-lc;
      const delta=shadows*sh*sh+high*lc*lc+whites*lc+blacks*sh;
      r=l+(r-l)*sat+delta;g=l+(g-l)*sat+delta;b=l+(b-l)*sat+delta;
      if(mono)r=g=b=.299*r+.587*g+.114*b;
      if(curve&&curve.length>1){r=curveAt(curve,clamp(r*255,0,255))/255;g=curveAt(curve,clamp(g*255,0,255))/255;b=curveAt(curve,clamp(b*255,0,255))/255;}
      const inv=1-strength;
      p[i]=clamp(o0*inv+255*r*strength,0,255);
      p[i+1]=clamp(o1*inv+255*g*strength,0,255);
      p[i+2]=clamp(o2*inv+255*b*strength,0,255);
    }
  }
  function curveAt(curve,x){let lo=0;while(lo<curve.length-2&&curve[lo+1][0]<x)lo++;const [x0,y0]=curve[lo],[x1,y1]=curve[lo+1];return y0+(y1-y0)*(x-x0)/Math.max(1e-5,x1-x0);}
  function applyCube(p,lut,amount){if(!lut||amount<=0)return;const n=lut.size,table=lut.table;const N=n-1;
    for(let i=0;i<p.length;i+=4){const r0=p[i],g0=p[i+1],b0=p[i+2];const r=clamp(Math.round((r0/255)*N),0,N),g=clamp(Math.round((g0/255)*N),0,N),b=clamp(Math.round((b0/255)*N),0,N);
      const at=((b*n+g)*n+r)*3;for(let c=0;c<3;c++)p[i+c]=clamp(p[i+c]*(1-amount)+255*table[at+c]*amount,0,255);
    }
  }

  function parseXMP(str,filename){const xml=new DOMParser().parseFromString(str,'application/xml');if(xml.querySelector('parsererror'))return null;
    const nodes=Array.from(xml.getElementsByTagName('*'));
    const desc=nodes.find(n=>n.localName==='Description'&&Array.from(n.attributes||[]).some(a=>a.name.includes('ProcessVersion')||a.name.includes('PresetType')||a.name.includes('Name')));
    if(!desc)return null;const fields={};for(const attr of desc.attributes){if(attr.name.includes('crs:')||attr.namespaceURI==='http://ns.adobe.com/camera-raw-settings/1.0/')fields[attr.localName]=attr.value;}
    const name=(fields.Name||filename.replace(/\.xmp$/i,'')).replace(/\s+/g,' ').trim().slice(0,95);
    const group=nodes.find(n=>n.localName==='Group');let category='EmulsionPresets';if(group){const text=Array.from(group.getElementsByTagName('*')).find(n=>n.localName==='li')?.textContent?.trim();if(text)category=text.slice(0,60);}
    const tone=nodes.find(n=>n.localName==='ToneCurvePV2012'),curve=[];if(tone)for(const n of Array.from(tone.getElementsByTagName('*')).filter(n=>n.localName==='li')){const parts=(n.textContent||'').split(',').map(Number);if(parts.length===2&&parts.every(Number.isFinite))curve.push(parts);}
    const id='xmp:'+((fields.UUID||filename).replace(/[^a-z0-9_-]/gi,'_').slice(0,92));
    return{id,name,category,fields,curve:curve.length>1?curve:null};
  }

// GPU color grading. Same pointwise equations as the CPU path; no spatial
// resize, no decorative CSS filter, no per-frame getImageData for FILM alone.
function createGPU(){
 let canvas=null,gl=null,program=null,texture=null,buffer=null,loc=null,failed=false;
 const vertex='attribute vec2 p; varying vec2 uv; void main(){gl_Position=vec4(p,0.,1.);uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);}';
 const frag=`precision highp float;
 varying vec2 uv; uniform sampler2D frame; uniform int kind; uniform float strength,gamma,contrast,saturation,exposure,mono;
 uniform vec3 gain,lift,shadowRGB,highlightRGB; uniform vec4 tone;
 uniform int count; uniform vec2 points[32];
 float curve(float x){vec2 a=points[0],b=points[1];for(int i=1;i<32;i++){if(i>=count)break;b=points[i];if(x<=b.x||i==count-1)break;a=b;}return (a.y+(b.y-a.y)*(x-a.x)/max(.00001,b.x-a.x))/255.;}
 void main(){vec4 src=texture2D(frame,uv);vec3 c=src.rgb;
 if(kind==1){c=(pow(c,vec3(1./gamma))-.5)*contrast+.5;float l=dot(c,vec3(.299,.587,.114));float q=clamp(l,0.,1.);c=vec3(l)+(c-vec3(l))*saturation;c=c*gain+lift+(1.-q)*(1.-q)*shadowRGB+q*q*highlightRGB;}
 else{c=(c*exposure-.5)*contrast+.5;float l=dot(c,vec3(.299,.587,.114));float q=clamp(l,0.,1.);float delta=tone.x*(1.-q)*(1.-q)+tone.y*q*q+tone.z*q+tone.w*(1.-q);c=vec3(l)+(c-vec3(l))*saturation+delta;if(mono>.5)c=vec3(dot(c,vec3(.299,.587,.114)));if(count>1)c=vec3(curve(clamp(c.r*255.,0.,255.)),curve(clamp(c.g*255.,0.,255.)),curve(clamp(c.b*255.,0.,255.)));}
 gl_FragColor=vec4(clamp(mix(src.rgb,c,strength),0.,1.),src.a);}`;
 function init(){
  canvas=document.createElement('canvas');gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('WebGL unavailable');
  function shader(type,code){const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
  program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
  texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  loc={};for(const n of ['kind','strength','gamma','contrast','saturation','exposure','mono','gain','lift','shadowRGB','highlightRGB','tone','count','points[0]'])loc[n]=gl.getUniformLocation(program,n);
 }
 function render(source,target,profile,strength){
  if(failed||!profile||strength<=0)return false;
  const curve=profile.curve||[];if(curve.length>32)return false;
  try{
   if(!gl)init();if(gl.isContextLost())return false;
   const w=target.width,h=target.height;if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
   gl.viewport(0,0,w,h);gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
   gl.uniform1f(loc.strength,strength);gl.uniform1i(loc.count,0);
   if(profile.type==='builtin'&&profile.recipe){
    const [gamma,contr,sat,gain,lift,shadows,highlights]=profile.recipe;
    gl.uniform1i(loc.kind,1);gl.uniform1f(loc.gamma,gamma);gl.uniform1f(loc.contrast,contr);gl.uniform1f(loc.saturation,sat);
    gl.uniform3fv(loc.gain,gain);gl.uniform3fv(loc.lift,lift.map(x=>x/255));gl.uniform3fv(loc.shadowRGB,shadows.map(x=>x/255));gl.uniform3fv(loc.highlightRGB,highlights.map(x=>x/255));
   }else if(profile.fields){
    const f=profile.fields,n=k=>Number(f[k]||0)||0;
    gl.uniform1i(loc.kind,2);gl.uniform1f(loc.exposure,clamp(2**clamp(n('Exposure2012'),-3,3),.125,8));gl.uniform1f(loc.contrast,1+n('Contrast2012')/100);gl.uniform1f(loc.saturation,1+n('Saturation')/100+n('Vibrance')*.006);
    gl.uniform1f(loc.mono,String(f.Treatment||'').toLowerCase().includes('gray')||String(f.ConvertToGrayscale||'').toLowerCase()==='true'?1:0);
    gl.uniform4f(loc.tone,n('Shadows2012')*.0022,n('Highlights2012')*.002,n('Whites2012')*.001,n('Blacks2012')*.001);
    if(curve.length>1){const points=new Float32Array(64);for(let i=0;i<curve.length;i++){points[i*2]=curve[i][0];points[i*2+1]=curve[i][1];}gl.uniform2fv(loc['points[0]'],points);gl.uniform1i(loc.count,curve.length);}
   }else return false;
   gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
   if(gl.getError()!==gl.NO_ERROR)return false;
   target.getContext('2d').drawImage(canvas,0,0,w,h);return true;
  }catch(e){failed=true;console.warn('Film GPU unavailable, using exact CPU fallback',e);return false;}
 }
 return Object.freeze({render});
}
root.VideoFilmCore=Object.freeze({filmBuiltin,filmXMP,parseXMP,applyCube,curveAt,createGPU});
})(window);
