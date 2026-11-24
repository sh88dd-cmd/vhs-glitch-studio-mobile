/* Private VHS STATS drawer for both PWAs.
 * Hold ▥ for 1.6 seconds (or use five taps as a fallback). This is
 * discoverability only: security comes from the Google "Only myself" deployment.
 * Owner-only Google Apps Script cannot reliably authenticate in a third-party iframe;
 * open the private dashboard in the user's normal signed-in browser instead.
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
  let overlay=null,previousFocus=null;
  function close(){
   if(!overlay)return;
   overlay.remove();
   overlay=null;
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
   info.textContent='Google не разрешает вход в закрытую статистику внутри окна приложения. Открой панель с помощью кнопки ниже — данные останутся доступны только твоему Google-аккаунту.';
   info.style.cssText='color:#bbb;font-size:14px;line-height:1.55;margin:18px 16px;';
   const visit=document.createElement('a');
   visit.href=PRIVATE_DASHBOARD;visit.target='_blank';visit.rel='noopener noreferrer';
   visit.textContent='↗ ОТКРЫТЬ VHS STATS';
   visit.style.cssText='display:block;padding:17px;margin:0 16px 14px;text-align:center;font-size:15px;font-weight:900;background:#ff9818;color:#101010;border-radius:12px;text-decoration:none;';
   const content=document.createElement('div');
   content.style.cssText='flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:26px 22px 44px;text-align:center;background:#080808;';
   const lock=document.createElement('div');
   lock.textContent='◉';
   lock.setAttribute('aria-hidden','true');
   lock.style.cssText='display:grid;place-items:center;border-radius:24px;width:78px;height:78px;background:#1d1d1d;border:1px solid #414141;color:#ff9818;font-size:48px;';
   const name=document.createElement('strong');
   name.textContent='ТВОЯ ЛИЧНАЯ СТАТИСТИКА';
   name.style.cssText='font-size:17px;letter-spacing:.4px;color:#fff;';
   const note=document.createElement('p');
   note.textContent='Фото · Видео · Разделы · Функции · Графики';
   note.style.cssText='font-size:13px;color:#aaa;line-height:1.6;margin:0;';
   const security=document.createElement('p');
   security.textContent='Друзьям статистика недоступна. Вход контролирует Google.';
   security.style.cssText='font-size:12px;line-height:1.6;color:#9a9a9a;max-width:300px;';
   content.append(lock,name,note,security);
   overlay.append(head,info,visit,content);
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
