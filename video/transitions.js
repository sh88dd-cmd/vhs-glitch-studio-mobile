/* Shared canvas transitions for photographs and video joins. All local. */
(function(root){
'use strict';
const types=[['none','Без перехода'],['fade','Растворение'],['flash','Белая вспышка'],['black','Затемнение'],['pushLeft','Сдвиг влево'],['pushRight','Сдвиг вправо'],['pushUp','Сдвиг вверх'],['zoom','Зум-удар'],['spin','Вращение'],['wipe','Шторка'],['circle','Круг'],['glitch','VHS-срыв'],['split','Раздвижение'],['filmBurn','Плёночная засветка']];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function spec(type,seconds){return {type:types.some(x=>x[0]===type)?type:'none',seconds:clamp(Number(seconds)||.5,.1,5)};}
function duration(t,available){return t&&t.type!=='none'?Math.max(0,Math.min(t.seconds,Number(available)||0)):0;}
function options(select,value='none'){select.replaceChildren(...types.map(([id,label])=>new Option(label,id)));select.value=value;}
function fitted(ctx,media,w,h,mode='contain'){
 const mw=media.videoWidth||media.naturalWidth||media.width,mh=media.videoHeight||media.naturalHeight||media.height;
 if(!mw||!mh)return;
 const k=(mode==='cover'?Math.max:Math.min)(w/mw,h/mh);
 ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.drawImage(media,(w-mw*k)/2,(h-mh*k)/2,mw*k,mh*k);
}
function render(ctx,a,b,p,type,w=ctx.canvas.width,h=ctx.canvas.height){
 p=clamp(p,0,1);const q=p*p*(3-2*p);
 ctx.save();
 try{
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  const draw=(image,x=0,y=0,scale=1,angle=0,alpha=1)=>{
   ctx.save();ctx.globalAlpha=alpha;ctx.translate(w/2+x,h/2+y);ctx.rotate(angle);ctx.scale(scale,scale);
   ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();
  };
  const color=(value,alpha)=>{ctx.save();ctx.fillStyle=value;ctx.globalAlpha=alpha;ctx.fillRect(0,0,w,h);ctx.restore();};
  if(p<=0){draw(a);return;}if(p>=1||type==='none'){draw(b);return;}
  ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
  switch(type){
   case 'fade':draw(a);draw(b,0,0,1,0,q);break;
   case 'flash':case 'black':draw(p<.5?a:b);color(type==='flash'?'#fff':'#000',Math.sin(Math.PI*p));break;
   case 'pushLeft':draw(a,-w*q);draw(b,w*(1-q));break;
   case 'pushRight':draw(a,w*q);draw(b,-w*(1-q));break;
   case 'pushUp':draw(a,0,-h*q);draw(b,0,h*(1-q));break;
   case 'zoom':draw(a,0,0,1+.65*q);draw(b,0,0,1+.45*(1-q),0,q);break;
   case 'spin':draw(a,0,0,1+.6*q,q*.65);draw(b,0,0,1+.6*(1-q),-(1-q)*.65,q);break;
   case 'wipe':draw(a);ctx.save();ctx.beginPath();ctx.rect(0,0,w*q,h);ctx.clip();draw(b);ctx.restore();break;
   case 'circle':draw(a);ctx.save();ctx.beginPath();ctx.arc(w/2,h/2,Math.hypot(w,h)*.5*q,0,Math.PI*2);ctx.clip();draw(b);ctx.restore();break;
   case 'split':draw(b);ctx.save();ctx.beginPath();ctx.rect(0,0,w*(1-q)/2,h);ctx.rect(w*(1+q)/2,0,w*(1-q)/2,h);ctx.clip();draw(a);ctx.restore();break;
   case 'glitch':{
    draw(p<.5?a:b);const pulse=Math.sin(Math.PI*p),src=p<.5?b:a;
    for(let i=0;i<12;i++){const y=Math.floor((i+.2)*h/12),bh=Math.max(1,Math.floor(h/28)),shift=Math.sin(i*17.1+Math.floor(p*24)*3.4)*w*.12*pulse;
     ctx.globalAlpha=.4+pulse*.4;ctx.drawImage(src,0,y,w,Math.min(bh,h-y),shift,y,w,Math.min(bh,h-y));}
    ctx.globalAlpha=1;color('#32d8fc',pulse*.12);break;}
   case 'filmBurn':{draw(p<.5?a:b);const g=ctx.createLinearGradient(w*(p-.5),0,w*(p+.5),h);g.addColorStop(0,'rgba(255,26,0,0)');g.addColorStop(.45,'rgba(255,115,20,.85)');g.addColorStop(.55,'rgba(255,245,190,1)');g.addColorStop(1,'rgba(255,26,0,0)');color(g,Math.sin(Math.PI*p));break;}
   default:draw(a);draw(b,0,0,1,0,q);
  }
 }finally{ctx.restore();}
}
function row(container,label,current,onChange,disabled=false){
 const wrap=document.createElement('div');wrap.className='transitionRow';
 const title=document.createElement('span');title.textContent=label;
 const select=document.createElement('select');select.setAttribute('aria-label',label+' — эффект');options(select,current.type);
 const input=document.createElement('input');input.type='number';input.min='.1';input.max='5';input.step='.1';input.value=current.seconds;input.setAttribute('aria-label',label+' — длительность в секундах');
 select.disabled=disabled;input.disabled=disabled||select.value==='none';
 const update=()=>{const next=spec(select.value,input.value);input.value=next.seconds;input.disabled=disabled||next.type==='none';onChange(next);};
 select.onchange=update;input.onchange=update;
 wrap.append(title,select,input);container.append(wrap);
}
root.VHSTransitions=Object.freeze({types,spec,duration,options,fitted,render,row});
})(window);
