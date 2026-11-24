/* VHS STATS owner popup v4 — native in-app interface (NO iframe or browser link).
 * Private stats data comes from an HMAC-signed JSONP endpoint on the
 * existing Google Apps Script collector. No credentials embedded in GitHub.
 * The owner enters the secret only inside the installed application.
 * Signature: HMAC-SHA256(secret bytes, 'stats|ts|nonce|days').
 */
(function(){
 'use strict';
 const COLLECTOR='https://script.google.com/macros/s/AKfycbwzqZVuoD9KYylSDWshtNeIm75XjgGoYCjQqXwfyTsxMUVr9SfHvfLOoFkBDuCo9UI/exec';
 const KEY_NAME='vhs.stats.owner-secret.v1';
 const OWNER_EXCLUSION='vhs.analytics.exclude-owner.v1';
 const IS_VIDEO=/\/video\/(?:index\.html)?$/.test(location.pathname);
 const sections={
  vhs:'VHS',film:'FILM',glitch:'GLITCH',cassettes:'КАССЕТЫ',masks:'МАСКИ',
  correction:'КОРРЕКЦИЯ',polaroid:'POLAROID',shoot:'СЪЁМКА',
  photobooth:'ФОТОБУДКА',x50:'X50',camera:'КАМЕРА',timeline:'ТАЙМЛАЙН',
  keyframes:'КЛЮЧЕВЫЕ КАДРЫ',frametools:'ПОКАДРОВО',
  filmdamage:'ПОВРЕЖДЕНИЯ ПЛЁНКИ',audio:'АУДИО',touch:'КАСАНИЯ',
  speed:'СКОРОСТЬ',live:'ЖИВЫЕ ПОМЕХИ',export:'ЭКСПОРТ'
 };
 const features={
  reroll:'Новые помехи',reset:'Сброс эффектов',compare:'До / После',
  photobooth:'Фотобудка',best_shot:'Лучший кадр',double_exposure:'Двойная экспозиция',
  film_burn:'Засветы плёнки',face_tools:'Инструменты лица',brush_tools:'Кисть',
  brush_draw:'Рисование',face_auto:'Поиск лиц',face_mark:'Разметка лица',
  speed_point:'Точка скорости',speed_reverse:'Обратная скорость',
  speed_forward:'Ускорение',audio_beats:'Авто по биту',
  timeline_event:'Событие на таймлайне',keyframe_add:'Ключевой кадр',
  frame_step:'Покадрово',film_only:'Только плёнка',
  film_gallery:'Каталог плёнок',cassette_save:'Сохранение кассеты',
  cassette_clear:'Очистка кассеты',cassette_aging:'Старение кассеты',
  glitch_hold:'Помехи удержанием',glitch_mild:'Мягкий глитч',
  glitch_chaos:'Сильный глитч',vhs_preset:'Профиль VHS',
  film_category:'Категория плёнок',film_select:'Выбор плёнки',
  film_toggle:'Вкл. плёнку',vhs_toggle:'Вкл. VHS',
  glitch_toggle:'Вкл. глитч',face_style:'Стиль лица',
  face_pixel:'Пикселизация лица',tape_kind:'Тип кассеты',
  output_size:'Разрешение',film_damage:'Повреждения плёнки',
  touch_mode:'Касания'
 };
 const actionNames={
  visit:'Открытие приложения',camera_open:'Открытие камеры',
  shutter_click:'Затвор',record_click:'Запись REC',
  export_click:'Нажат экспорт',camera_save_click:'Сохранение фото',
  x50_export_click:'Экспорт X50',frame_export_click:'Сохранение кадра'
 };
 const number=new Intl.NumberFormat('ru-RU');
 let overlay=null,priorFocus=null,busy=false,lastReport=null,days=7,scope='all';
 function $(id){return overlay&&overlay.querySelector('#'+id);}
 function safeReadKey(){try{return localStorage.getItem(KEY_NAME)||'';}catch(_){return '';}}
 function validKey(key){return /^[a-f0-9]{64}$/.test(key);}
 function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
 function button(el,text){el.textContent=text;el.type='button';}
 function notify(text,error){
  const target=$('vhsAdminStatus');if(!target)return;
  target.textContent=text;
  target.style.color=error?'#ff9393':'#c5c5c5';
 }
 function show(id,visible){const element=$(id);if(element)element.hidden=!visible;}
 function changeView(authorized){
  show('vhsAdminLogin',!authorized);
  show('vhsAdminReport',authorized);
 }
 function setKey(key){
  try{
   localStorage.setItem(KEY_NAME,key);
   // The owner does not count as a visitor on this installed PWA.
   localStorage.setItem(OWNER_EXCLUSION,'1');
  }catch(_){notify('Хранилище недоступно: ключ нужно будет вводить заново.',true);}
 }
 function forgetKey(){try{localStorage.removeItem(KEY_NAME);}catch(_){}
  lastReport=null;changeView(false);const input=$('vhsAdminKey');
  if(input)input.value='';notify('Ключ сброшен на этом устройстве.');
 }
 function close(){
  if(!overlay)return;
  const old=overlay;overlay=null;lastReport=null;
  old.remove();document.documentElement.style.overflow='';
  if(priorFocus&&priorFocus.isConnected)try{priorFocus.focus({preventScroll:true});}catch(_){}
 }
 function build(){
  const screen=document.createElement('div');
  screen.id='vhsStatsOwnerView';
  screen.setAttribute('role','dialog');
  screen.setAttribute('aria-modal','true');
  screen.setAttribute('aria-label','VHS STATS — личная статистика');
  screen.innerHTML=`
   <style>
   #vhsStatsOwnerView{position:fixed;inset:0;z-index:2147483646;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#080808;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:400;font-size:14px;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom);box-sizing:border-box}
   #vhsStatsOwnerView *{box-sizing:border-box}
   #vhsStatsOwnerView [hidden]{display:none!important}
   #vhsStatsOwnerView button,#vhsStatsOwnerView input{font:inherit}
   #vhsStatsOwnerView button{cursor:pointer;-webkit-tap-highlight-color:transparent}
   #vhsStatsOwnerView .adminHead{position:sticky;top:0;z-index:2;background:#0a0a0a;padding:12px 17px;display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid #343434}
   #vhsStatsOwnerView .adminHead strong{font-size:19px;letter-spacing:-.4px}
   #vhsStatsOwnerView .adminHead strong em{font-style:normal;color:#ff9818}
   #vhsStatsOwnerView .adminHead small{display:block;color:#aaa;font-size:9px;letter-spacing:1.4px;font-weight:500;margin-top:2px}
   #vhsStatsOwnerView .adminClose{background:#292929;color:#fff;border:1px solid #505050;border-radius:9px;padding:11px 12px;min-height:44px;font-size:12px;font-weight:800}
   #vhsStatsOwnerView .adminBody{max-width:850px;margin:auto;padding:17px 14px 32px}
   #vhsStatsOwnerView .adminSub{color:#aaa;font-size:11px;line-height:1.5}
   #vhsStatsOwnerView h2{font-size:16px;letter-spacing:0;margin:22px 0 12px;font-weight:850;color:#fff}
   #vhsStatsOwnerView .adminCard{background:#1c1c1c;border:1px solid #373737;border-radius:14px;padding:16px 13px}
   #vhsStatsOwnerView .adminLogin{max-width:490px;margin:12vh auto 0}
   #vhsStatsOwnerView .adminLogin h2{margin:0 0 14px;font-size:20px}
   #vhsStatsOwnerView .adminLogin p{font-size:13px;line-height:1.6;color:#b9b9b9}
   #vhsStatsOwnerView input{display:block;width:100%;min-height:50px;background:#111;color:#fff;border:1px solid #686868;border-radius:10px;padding:12px;font-size:15px;margin:15px 0}
   #vhsStatsOwnerView .orangeBtn{display:block;width:100%;border:0;border-radius:11px;padding:15px;background:#ff9818;color:#151515;font-size:14px;font-weight:900;min-height:48px;margin:12px 0}
   #vhsStatsOwnerView .orangeBtn:disabled{opacity:.5}
   #vhsStatsOwnerView .adminPeriods,#vhsStatsOwnerView .adminScopes{display:flex;gap:6px;margin:10px 0 15px}
   #vhsStatsOwnerView .adminPeriods button,#vhsStatsOwnerView .adminScopes button{min-width:0;flex:1;min-height:40px;border:1px solid #484848;border-radius:9px;background:#282828;color:#fff;font-size:12px;font-weight:750;padding:10px 3px}
   #vhsStatsOwnerView .adminPeriods [aria-pressed=true],#vhsStatsOwnerView .adminScopes [aria-pressed=true]{background:#ff9818;color:#161616;border-color:#ff9818}
   #vhsStatsOwnerView .adminGrid,#vhsStatsOwnerView .adminApps,#vhsStatsOwnerView .adminRanks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
   #vhsStatsOwnerView .adminMetric{min-height:140px}
   #vhsStatsOwnerView .adminMetric label{display:block;color:#aaa;font-size:12px;line-height:1.3}
   #vhsStatsOwnerView .adminMetric strong{display:block;font-size:34px;margin:10px 0 4px;font-variant-numeric:tabular-nums}
   #vhsStatsOwnerView .adminMetric small{font-size:10px;color:#999;line-height:1.35}
   #vhsStatsOwnerView .adminPlot{padding:11px}
   #vhsStatsOwnerView svg{display:block;width:100%;height:180px;max-height:180px}
   #vhsStatsOwnerView .adminApp h3{color:#ff9818;font-size:13px;margin:0 0 10px}
   #vhsStatsOwnerView .adminApp.video h3{color:white}
   #vhsStatsOwnerView .adminLine{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #353535;padding:10px 0;color:#bbb;font-size:11px}
   #vhsStatsOwnerView .adminLine b{color:#fff;font-size:12px;font-variant-numeric:tabular-nums}
   #vhsStatsOwnerView .adminRank h3{font-size:13px;margin:0 0 12px}
   #vhsStatsOwnerView .adminRankRow{display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:7px;margin:10px 0}
   #vhsStatsOwnerView .adminRankRow span{font-size:10px;color:#ddd;overflow-wrap:anywhere}
   #vhsStatsOwnerView .adminRankRow b{font-size:11px;text-align:right}
   #vhsStatsOwnerView .adminTrack{grid-column:1/-1;height:5px;border-radius:4px;background:#383838;overflow:hidden}
   #vhsStatsOwnerView .adminTrack i{display:block;height:100%;background:#ff9818;border-radius:4px}
   #vhsStatsOwnerView .adminEmpty{font-size:12px;color:#999}
   #vhsStatsOwnerView .adminLog{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #333;font-size:11px}
   #vhsStatsOwnerView .adminLog:last-child{border:0}
   #vhsStatsOwnerView .adminLog time{color:#999;font-size:10px}
   #vhsStatsOwnerView .adminLog strong{font-size:11px}
   #vhsStatsOwnerView #vhsAdminStatus{min-height:27px;padding:10px 1px;font-size:12px;line-height:1.5}
   #vhsStatsOwnerView .adminBottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px}
   #vhsStatsOwnerView .adminBottom button{border:1px solid #444;background:#191919;color:#a5a5a5;border-radius:9px;padding:9px;font-size:11px}
   @media(max-width:360px){#vhsStatsOwnerView .adminApps,#vhsStatsOwnerView .adminRanks{grid-template-columns:1fr}#vhsStatsOwnerView .adminMetric strong{font-size:29px}}
   </style>
   <header class="adminHead"><div><strong>VHS <em>STATS</em></strong><small>ЛИЧНАЯ АНАЛИТИКА</small></div><button class="adminClose" id="vhsAdminClose" type="button">✕ Закрыть</button></header>
   <div class="adminBody">
    <section class="adminCard adminLogin" id="vhsAdminLogin">
     <h2>🔒 Доступ владельца</h2>
     <p>Введи личный ключ, созданный в проекте Google Apps Script. Он не хранится в исходниках приложений и не отправляется на сервер.</p>
     <label for="vhsAdminKey">Твой личный ключ VHS STATS</label>
     <input id="vhsAdminKey" type="password" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Вставь личный ключ">
     <button type="button" class="orangeBtn" id="vhsAdminConnect">ПОКАЗАТЬ СТАТИСТИКУ</button>
     <p class="adminSub">После успешного входа этот iPhone будет исключён из подсчёта посещений данного приложения.</p>
    </section>
    <section id="vhsAdminReport" hidden>
     <div class="adminPeriods" role="group" aria-label="Период">
      <button data-admin-days="1" aria-pressed="false">24 часа</button>
      <button data-admin-days="7" aria-pressed="true">7 дней</button>
      <button data-admin-days="30" aria-pressed="false">30 дней</button>
      <button data-admin-days="90" aria-pressed="false">90 дней</button>
     </div>
     <div class="adminGrid">
      <div class="adminCard adminMetric"><label>Уникальные устройства</label><strong id="vhsMVisitors">—</strong><small>Приблизительно</small></div>
      <div class="adminCard adminMetric"><label>Открытия приложений</label><strong id="vhsMVisits">—</strong><small>Фото + видео</small></div>
      <div class="adminCard adminMetric"><label>Всего действий</label><strong id="vhsMEvents">—</strong><small>Разделы и функции</small></div>
      <div class="adminCard adminMetric"><label>Нажатия экспорта</label><strong id="vhsMExports">—</strong><small>Не подтверждённые сохранения</small></div>
     </div>
     <h2>Активность по дням</h2>
     <div class="adminCard adminPlot"><p class="adminSub">🟠 PHOTO VHS　⚪ VHS Video Lab</p><svg id="vhsMChart" role="img" aria-label="Активность по дням" viewBox="0 0 600 180"></svg></div>
     <h2>По приложениям</h2>
     <div class="adminApps">
      <div class="adminCard adminApp"><h3>PHOTO VHS</h3><div id="vhsPhotoNumbers"></div></div>
      <div class="adminCard adminApp video"><h3>VHS Video Lab</h3><div id="vhsVideoNumbers"></div></div>
     </div>
     <h2>Самые популярные</h2>
     <div class="adminScopes" role="group" aria-label="Приложение">
      <button data-admin-scope="all" aria-pressed="true">ВСЕ</button>
      <button data-admin-scope="photo" aria-pressed="false">ФОТО</button>
      <button data-admin-scope="video" aria-pressed="false">ВИДЕО</button>
     </div>
     <div class="adminRanks">
      <div class="adminCard adminRank"><h3>★ Разделы</h3><div id="vhsSections"></div></div>
      <div class="adminCard adminRank"><h3>⚡ Функции</h3><div id="vhsFeatures"></div></div>
     </div>
     <h2>Последние события</h2>
     <div class="adminCard" id="vhsRecent"></div>
     <button type="button" class="orangeBtn" id="vhsAdminRefresh">↻ ОБНОВИТЬ СТАТИСТИКУ</button>
     <div class="adminBottom"><span class="adminSub">Личная панель · без передачи медиа</span><button type="button" id="vhsAdminForget">Сменить ключ</button></div>
     <p class="adminSub">Статистика учитывает нажатия, а не успешное сохранение. Уникальные устройства — приблизительная оценка.</p>
    </section>
    <p id="vhsAdminStatus" role="status"></p>
   </div>`;
  return screen;
 }
 async function getSignedStats(key,period){
  if(!validKey(key))throw Error('Нужен личный ключ из 64 символов.');
  if(!crypto||!crypto.subtle||!crypto.getRandomValues)throw Error('Безопасные запросы не поддерживаются.');
  const bytes=Uint8Array.from(key.match(/../g),x=>parseInt(x,16));
  const hmacKey=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const ts=Date.now();
  const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
  const signed=await crypto.subtle.sign('HMAC',hmacKey,new TextEncoder().encode('stats|'+ts+'|'+nonce+'|'+period));
  const proof=hex(new Uint8Array(signed));
  const url=new URL(COLLECTOR);
  url.searchParams.set('stats','1');url.searchParams.set('days',String(period));
  url.searchParams.set('ts',String(ts));url.searchParams.set('nonce',nonce);
  url.searchParams.set('proof',proof);
  // JSONP is required by Apps Script's ContentService CORS behaviour.
  // Only fresh, signed, nonce-limited aggregate statistics are returned.
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.async=true;
   script.referrerPolicy='no-referrer';
   script.src=url.toString();
   let finished=false;
   const callback='__vhsStatsPrivateResponse';
   const timeout=setTimeout(()=>finish(null,new Error('Нет ответа Google. Проверь интернет и версию сборщика.')),16000);
   function finish(result,error){
    if(finished)return;
    finished=true;clearTimeout(timeout);script.remove();
    try{delete window[callback];}catch(_){window[callback]=undefined;}
    if(error)reject(error);else resolve(result);
   }
   window[callback]=data=>finish(data,null);
   script.onerror=()=>finish(null,new Error('Google не загрузил статистику. Проверь обновление сборщика.'));
   document.head.appendChild(script);
  });
 }
 function setNum(id,value){const node=$(id);if(node)node.textContent=number.format(Number(value)||0);}
 function makeLine(label,value){
  const row=document.createElement('div');row.className='adminLine';
  const left=document.createElement('span');left.textContent=label;
  const right=document.createElement('b');right.textContent=number.format(value||0);
  row.append(left,right);return row;
 }
 function appNumbers(id,data){
  const node=$(id);if(!node)return;
  node.replaceChildren();
  [['Устройства',data.visitors],['Открытия',data.visits],['Камера',data.camera],['Съёмка / REC',data.capture],['Экспорт',data.exports]]
   .forEach(item=>node.appendChild(makeLine(item[0],item[1])));
 }
 function chart(rows){
  const svg=$('vhsMChart');if(!svg)return;
  svg.replaceChildren();
  if(!Array.isArray(rows)||!rows.length)return;
  const NS='http://www.w3.org/2000/svg';
  function line(attrs){const el=document.createElementNS(NS,'line');for(const k in attrs)el.setAttribute(k,attrs[k]);svg.appendChild(el);}
  for(let i=0;i<4;i++){const y=20+i*43;line({x1:20,y1:y,x2:580,y2:y,stroke:'#3a3a3a'});}
  const max=Math.max(1,...rows.map(x=>Number(x.photo)||0),...rows.map(x=>Number(x.video)||0));
  for(const [key,color] of [['photo','#ff9818'],['video','#f3f3f3']]){
   const pts=rows.map((r,i)=>{
    const x=20+(rows.length===1?280:i*560/(rows.length-1));
    const y=159-137*(Number(r[key])||0)/max;
    return x.toFixed(1)+','+y.toFixed(1);
   }).join(' ');
   const el=document.createElementNS(NS,'polyline');
   el.setAttribute('points',pts);el.setAttribute('stroke',color);el.setAttribute('fill','none');
   el.setAttribute('stroke-width','3.5');el.setAttribute('stroke-linejoin','round');
   el.setAttribute('stroke-linecap','round');svg.appendChild(el);
  }
 }
 function rankItems(id,rows,names){
  const node=$(id);if(!node)return;
  node.replaceChildren();
  if(!Array.isArray(rows)||!rows.length){
   const empty=document.createElement('p');empty.className='adminEmpty';
   empty.textContent='Пока нет событий';node.appendChild(empty);return;
  }
  const max=rows[0].count||1;
  rows.slice(0,10).forEach((item,i)=>{
   const line=document.createElement('div');line.className='adminRankRow';
   const label=document.createElement('span');label.textContent=(i+1)+'. '+(names[item.id]||item.id);
   const count=document.createElement('b');count.textContent=number.format(item.count||0);
   const track=document.createElement('div');track.className='adminTrack';
   const fill=document.createElement('i');fill.style.width=Math.max(2,Math.round(100*(item.count||0)/max))+'%';
   track.appendChild(fill);line.append(label,count,track);node.appendChild(line);
  });
 }
 function ranks(){
  const d=lastReport;if(!d)return;
  rankItems('vhsSections',scope==='photo'?d.photoSections:scope==='video'?d.videoSections:d.topSections,sections);
  rankItems('vhsFeatures',scope==='photo'?d.photoFeatures:scope==='video'?d.videoFeatures:d.topFeatures,features);
 }
 function display(data){
  if(!overlay||!data||!data.overall||!data.photo||!data.video)throw Error('Неправильный ответ сервера.');
  lastReport=data;
  changeView(true);
  setNum('vhsMVisitors',data.overall.visitors);
  setNum('vhsMVisits',data.overall.visits);
  setNum('vhsMEvents',data.overall.events);
  setNum('vhsMExports',(data.photo.exports||0)+(data.video.exports||0));
  appNumbers('vhsPhotoNumbers',data.photo);
  appNumbers('vhsVideoNumbers',data.video);
  chart(data.chart);ranks();
  const events=$('vhsRecent');events.replaceChildren();
  const list=Array.isArray(data.lastEvents)?data.lastEvents:[];
  if(!list.length){
   const empty=document.createElement('p');empty.className='adminEmpty';
   empty.textContent='Пока нет событий';events.appendChild(empty);
  }
  for(const item of list){
   const row=document.createElement('div');row.className='adminLog';
   const name=document.createElement('strong');
   name.textContent=item.action.startsWith('section_')?'Раздел: '+(sections[item.action.slice(8)]||item.action.slice(8))
    :item.action.startsWith('feature_')?'Функция: '+(features[item.action.slice(8)]||item.action.slice(8))
    :(actionNames[item.action]||item.action);
   const time=document.createElement('time');time.textContent=(item.app==='video'?'Видео':'Фото')+' · '+item.at;
   row.append(name,time);events.appendChild(row);
  }
  notify('Обновлено: '+new Date(data.updated).toLocaleString('ru-RU'));
 }
 async function refresh(entered){
  if(busy||!overlay)return;
  const key=(entered||safeReadKey()).trim().toLowerCase();
  const button=$('vhsAdminConnect');
  if(!validKey(key)){notify('Вставь личный ключ из 64 символов.',true);return;}
  busy=true;if(button)button.disabled=true;notify('Загружаю закрытую статистику…');
  try{
   const result=await getSignedStats(key,days);
   if(!overlay)return;
   if(!result||result.ok!==true){
    const msg=result&&result.error==='setup_required'?'Сначала создай личный ключ в Google Apps Script.'
     :result&&result.error==='denied'?'Ключ не подошёл. Проверь его и время iPhone.'
     :'Сборщик ещё не обновлён или временно недоступен.';
    notify(msg,true);return;
   }
   setKey(key);
   display(result.data);
  }catch(e){if(overlay)notify(e.message||'Ошибка подключения',true);}
  finally{busy=false;if(button&&button.isConnected)button.disabled=false;}
 }
 function open(){
  if(overlay)return;
  priorFocus=document.activeElement;
  overlay=build();document.body.appendChild(overlay);
  document.documentElement.style.overflow='hidden';
  $('vhsAdminClose').addEventListener('click',close);
  $('vhsAdminConnect').addEventListener('click',()=>refresh($('vhsAdminKey').value));
  $('vhsAdminKey').addEventListener('keydown',e=>{if(e.key==='Enter')refresh(e.target.value);});
  $('vhsAdminRefresh').addEventListener('click',()=>refresh());
  $('vhsAdminForget').addEventListener('click',forgetKey);
  overlay.querySelectorAll('[data-admin-days]').forEach(button=>button.addEventListener('click',()=>{
   days=Number(button.dataset.adminDays);
   overlay.querySelectorAll('[data-admin-days]').forEach(x=>x.setAttribute('aria-pressed',x===button?'true':'false'));
   if(lastReport)refresh();
  }));
  overlay.querySelectorAll('[data-admin-scope]').forEach(button=>button.addEventListener('click',()=>{
   scope=button.dataset.adminScope;
   overlay.querySelectorAll('[data-admin-scope]').forEach(x=>x.setAttribute('aria-pressed',x===button?'true':'false'));
   ranks();
  }));
  $('vhsAdminClose').focus({preventScroll:true});
  const key=safeReadKey();
  if(validKey(key))refresh(key);
  else notify('Нужен личный ключ, созданный в Google Apps Script.');
 }
 function mount(){
  const title=document.querySelector(IS_VIDEO?'.top .logo':'.top .brand');
  if(!title)return;
  let taps=0,lastTap=0;
  const mark=title.querySelector('.mark');
  if(mark){
   mark.style.touchAction='none';mark.style.webkitUserSelect='none';
   mark.style.userSelect='none';mark.style.webkitTouchCallout='none';
   mark.style.cursor='pointer';
   mark.style.transition='transform .15s ease,filter .15s ease';
   let job=null,startX=0,startY=0;
   function reset(){if(job!==null){clearTimeout(job);job=null;}mark.style.transform='';mark.style.filter='';}
   function start(e){
    if(e.isPrimary===false||(e.button!==undefined&&e.button!==0))return;
    reset();startX=e.clientX;startY=e.clientY;
    mark.style.transform='scale(1.12)';mark.style.filter='brightness(1.5)';
    job=setTimeout(()=>{reset();taps=0;open();},1600);
   }
   if(window.PointerEvent){
    mark.addEventListener('pointerdown',start);
    mark.addEventListener('pointermove',e=>{if(job!==null&&Math.hypot(e.clientX-startX,e.clientY-startY)>16)reset();});
    for(const event of ['pointerup','pointercancel','pointerleave'])mark.addEventListener(event,reset);
   }else{
    mark.addEventListener('touchstart',()=>{reset();job=setTimeout(()=>{reset();taps=0;open();},1600);},{passive:true});
    mark.addEventListener('touchend',reset);mark.addEventListener('touchcancel',reset);
   }
   mark.addEventListener('contextmenu',e=>e.preventDefault());
  }
  title.addEventListener('click',e=>{
   if(e.target.closest('small'))return;
   const time=Date.now();
   if(time-lastTap>3000)taps=0;
   lastTap=time;
   if(++taps>=5){taps=0;open();}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay){e.preventDefault();close();}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
 else mount();
})();
