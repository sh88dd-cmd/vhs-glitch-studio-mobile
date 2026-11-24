/* Private VHS STATS drawer for both PWAs.
 * Hold ▥ for 1.6 seconds (or use five taps as a fallback). This is
 * discoverability only: security comes from the Google "Only myself" deployment.
 * Google may refuse third-party iframes or a sign-in inside iOS standalone PWA;
 * in that case the owner may open the same PRIVATE dashboard directly.
 * Does not grant data access, send analytics or touch media.
 */
(function(){
 'use strict';
 const PRIVATE_DASHBOARD='https://script.google.com/macros/s/AKfycbxCnYXuy6sRfF3epinfEH4C1b7eKRpLsT0bcdvEgFwfGL2NRHn2Dhc6V_4pH2C9fz5d/exec';
 const video=/\/video\/(?:index\.html)?$/.test(location.pathname);
 function mount(){
  const title=document.querySelector(video?'.top .logo':'.top .brand');
  if(!title)return;
  let taps=0,lastTap=0;
  let overlay=null,frame=null,previousFocus=null;
  function close(){
   if(!overlay)return;
   overlay.remove();
   overlay=null;frame=null;
   document.documentElement.style.overflow='';
   if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
  }
  function open(){
   if(overlay)return;
   previousFocus=document.activeElement;
   overlay=document.createElement('div');
   overlay.id='vhsStatsOwnerView';
   overlay.setAttribute('role','dialog');
   overlay.setAttribute('aria-modal','true');
   overlay.setAttribute('aria-label','VHS STATS — вход владельца');
   overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#080808;color:#fff;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
   const head=document.createElement('div');
   head.style.cssText='padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #393939;';
   const heading=document.createElement('strong');
   heading.textContent='VHS STATS  ·  ЛИЧНАЯ';
   heading.style.cssText='color:#ff9818;font-size:16px;';
   const back=document.createElement('button');
   back.type='button';back.textContent='✕ Закрыть';
   back.style.cssText='color:white;background:#303030;border:1px solid #5b5b5b;border-radius:10px;min-height:42px;padding:9px 14px;font-weight:700;';
   back.addEventListener('click',close);
   head.append(heading,back);
   const info=document.createElement('p');
   info.textContent='Доступ только через твой Google-аккаунт. Если Google не открывается внутри приложения, используй кнопку ниже.';
   info.style.cssText='color:#bbb;font-size:12px;line-height:1.35;margin:9px 14px;';
   const visit=document.createElement('a');
   visit.href=PRIVATE_DASHBOARD;visit.target='_blank';visit.rel='noopener noreferrer';
   visit.textContent='↗ Открыть защищённую панель';
   visit.style.cssText='display:block;padding:12px;margin:0 14px 8px;text-align:center;font-size:13px;font-weight:800;background:#ff9818;color:#101010;border-radius:10px;text-decoration:none;';
   frame=document.createElement('iframe');
   frame.title='Закрытая статистика VHS STATS';
   frame.src=PRIVATE_DASHBOARD;
   frame.referrerPolicy='no-referrer';
   frame.style.cssText='display:block;border:0;background:#fff;flex:1;min-height:150px;width:100%;';
   overlay.append(head,info,visit,frame);
   document.body.appendChild(overlay);
   document.documentElement.style.overflow='hidden';
   back.focus({preventScroll:true});
  }
  // Main iPhone gesture: touch and HOLD the visible ▥ logo for 1.6 seconds.
  // A simple tap never opens the private screen, avoiding accidental entry.
  const mark=title.querySelector('.mark');
  if(mark){
   mark.style.touchAction='none';
   mark.style.webkitUserSelect='none';
   mark.style.userSelect='none';
   mark.style.webkitTouchCallout='none';
   mark.style.cursor='pointer';
   mark.style.transition='transform .15s ease,filter .15s ease';
   let holdJob=null,startX=0,startY=0;
   function resetHold(){
    if(holdJob!==null){clearTimeout(holdJob);holdJob=null;}
    mark.style.transform='';
    mark.style.filter='';
   }
   function beginHold(event){
    if(event.isPrimary===false || (event.button!==undefined&&event.button!==0))return;
    resetHold();
    startX=event.clientX;startY=event.clientY;
    mark.style.transform='scale(1.12)';
    mark.style.filter='brightness(1.5)';
    holdJob=setTimeout(function(){
     resetHold();taps=0;open();
    },1600);
   }
   if(window.PointerEvent){
    mark.addEventListener('pointerdown',beginHold);
    mark.addEventListener('pointermove',function(e){
     if(holdJob!==null&&Math.hypot(e.clientX-startX,e.clientY-startY)>16)resetHold();
    });
    for(const name of ['pointerup','pointercancel','pointerleave']){
     mark.addEventListener(name,resetHold);
    }
   }else{
    // Older Safari fallback (touch events only).
    mark.addEventListener('touchstart',function(){resetHold();holdJob=setTimeout(function(){
     resetHold();taps=0;open();
    },1600);},{passive:true});
    mark.addEventListener('touchend',resetHold);
    mark.addEventListener('touchcancel',resetHold);
   }
   mark.addEventListener('contextmenu',function(event){event.preventDefault();});
  }
  // Keep the older header gesture as a backup, but not the only way in.
  title.addEventListener('click',function(e){
   // The version text has a DIFFERENT six-tap owner-exclusion mechanism.
   if(e.target.closest('small'))return;
   const t=Date.now();
   if(t-lastTap>3000)taps=0;
   lastTap=t;
   if(++taps>=5){taps=0;open();}
  });
  document.addEventListener('keydown',function(e){
   if(e.key==='Escape'&&overlay){e.preventDefault();close();}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
