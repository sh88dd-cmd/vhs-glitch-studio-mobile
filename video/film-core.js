/* VHS Video Lab: shares the EXACT built-in and XMP grading algorithms of the
 * existing photo editor, not an independently approximated replacement.
 * Source: app.js (VHS Glitch Studio Mobile), reused without modifying photo app.
 */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function filmBuiltin(p,recipe,strength){
    if(!recipe||strength<=0)return;
    const [gamma,contr,sat,gain,lift,shadows,highlights]=recipe;
    for(let i=0;i<p.length;i+=4){
      const r0=p[i],g0=p[i+1],b0=p[i+2];let r=r0/255,g=g0/255,b=b0/255;
      r=Math.pow(r,1/gamma);g=Math.pow(g,1/gamma);b=Math.pow(b,1/gamma);
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
      let a=[o0/255,o1/255,o2/255].map(v=>(v*exp-.5)*contrast+.5);
      const l=.299*a[0]+.587*a[1]+.114*a[2];
      const delta=shadows*(1-clamp(l,0,1))**2+high*clamp(l,0,1)**2+whites*clamp(l,0,1)+blacks*(1-clamp(l,0,1));
      a=a.map(v=>l+(v-l)*sat+delta);
      if(mono){const g=.299*a[0]+.587*a[1]+.114*a[2];a=[g,g,g];}
      if(curve&&curve.length>1){a=a.map(v=>curveAt(curve,clamp(v*255,0,255))/255);}
      for(let c=0;c<3;c++)p[i+c]=clamp([o0,o1,o2][c]*(1-strength)+255*a[c]*strength,0,255);
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

root.VideoFilmCore=Object.freeze({filmBuiltin,filmXMP,parseXMP,applyCube,curveAt});
})(window);
