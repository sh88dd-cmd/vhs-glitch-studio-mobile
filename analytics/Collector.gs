/**
 * VHS STATS COLLECTOR + HMAC-SHA256 PROTECTED OWNER READ API, v3.
 * A PUBLIC write-only event endpoint and an owner-only signed GET response.
 * Paste into existing VHS STATS COLLECTOR (Code.gs), do NOT create a new project.
 * Replace only SPREADSHEET_ID when copying manually.
 * Run setupVHSStatsAdminKey() ONCE in the Apps Script editor:
 * the secret is generated in Script Properties and shown in the execution log.
 * NEVER publish or share the secret, including on GitHub or in chats.
 */
const SPREADSHEET_ID='PASTE_YOUR_PRIVATE_SHEET_ID_HERE';
const TAB_NAME='Events';
const ALLOWED_APPS=['photo','video'];
const ALLOWED_EVENTS=[
 'visit','camera_open','shutter_click','record_click',
 'export_click','camera_save_click','x50_export_click','frame_export_click'
];
const ALLOWED_SECTIONS=[
 'vhs','film','glitch','cassettes','masks','correction','polaroid',
 'shoot','photobooth','x50','camera','timeline','keyframes',
 'frametools','filmdamage','audio','touch','speed','live','export'
];
const ALLOWED_FEATURES=[
 'reroll','reset','compare','photobooth','best_shot','double_exposure',
 'film_burn','face_tools','brush_tools','brush_draw','face_auto',
 'face_mark','speed_point','speed_reverse','speed_forward','audio_beats',
 'timeline_event','keyframe_add','frame_step','film_only','film_gallery',
 'cassette_save','cassette_clear','cassette_aging','glitch_hold',
 'glitch_mild','glitch_chaos','vhs_preset','film_category','film_select',
 'film_toggle','vhs_toggle','glitch_toggle','face_style','face_pixel',
 'tape_kind','output_size','film_damage','touch_mode'
];

function allowedEvent_(action){
 if(typeof action!=='string'||action.length>64)return false;
 if(ALLOWED_EVENTS.indexOf(action)>=0)return true;
 if(action.indexOf('section_')===0)return ALLOWED_SECTIONS.indexOf(action.slice(8))>=0;
 if(action.indexOf('feature_')===0)return ALLOWED_FEATURES.indexOf(action.slice(8))>=0;
 return false;
}

// Generates a 256-bit-or-stronger owner secret, never written to source.
// Executable only by the owner in their Apps Script editor.
function setupVHSStatsAdminKey(){
 const props=PropertiesService.getScriptProperties();
 let secret=props.getProperty('VHS_STATS_OWNER_SECRET');
 if(!secret){
  secret=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'').toLowerCase();
  props.setProperty('VHS_STATS_OWNER_SECRET',secret);
 }
 Logger.log('ЛИЧНЫЙ КЛЮЧ VHS STATS (НЕ ПРИСЫЛАЙ ЕГО НИКОМУ): '+secret);
 Logger.log('Введи этот ключ внутри PHOTO VHS и VHS Video Lab. Без ключа статистика недоступна.');
}

function doGet(request){
 if(!request||!request.parameter||request.parameter.stats!=='1')
  return output_('VHS STATS collector: receiving events only');
 try{
  const p=request.parameter;
  const days=Number(p.days);
  const ts=Number(p.ts);
  const nonce=String(p.nonce||'');
  const proof=String(p.proof||'').toLowerCase();
  const secret=PropertiesService.getScriptProperties().getProperty('VHS_STATS_OWNER_SECRET')||'';
  if(!/^[a-f0-9]{64}$/.test(secret))return js_({ok:false,error:'setup_required'});
  if([1,7,30,90].indexOf(days)<0||!Number.isSafeInteger(ts)||
     Math.abs(Date.now()-ts)>90000||
     !/^[a-f0-9]{32}$/.test(nonce)||!/^[a-f0-9]{64}$/.test(proof))
     return js_({ok:false,error:'denied'});

  const keyBytes=secret.match(/.{2}/g).map(x=>parseInt(x,16));
  const message='stats|'+ts+'|'+nonce+'|'+days;
  const signed=Utilities.computeHmacSha256Signature(
    Utilities.newBlob(message).getBytes(),keyBytes);
  const expected=signed.map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');
  let mismatch=0;
  for(let i=0;i<64;i++)mismatch|=proof.charCodeAt(i)^expected.charCodeAt(i);
  if(mismatch!==0)return js_({ok:false,error:'denied'});

  const lock=LockService.getScriptLock();
  if(!lock.tryLock(2000))return js_({ok:false,error:'busy'});
  try{
   const cache=CacheService.getScriptCache();
   if(cache.get('read_'+nonce))return js_({ok:false,error:'denied'});
   cache.put('read_'+nonce,'1',180);
  }finally{lock.releaseLock();}

  return js_({ok:true,data:getVHSStats_(days)});
 }catch(error){
  console.error('VHS STATS read error: '+String(error));
  return js_({ok:false,error:'temporary'});
 }
}

// Apps Script ContentService redirects responses. JSONP is used ONLY for this
// HMAC-signed, nonce-bound endpoint because normal fetch is blocked by CORS.
// Fixed callback name prevents injection; raw row data is never returned.
function js_(data){
 return ContentService.createTextOutput(
  'window.__vhsStatsPrivateResponse('+JSON.stringify(data)+');')
  .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
function getVHSStats_(days){
 const now=new Date(),dateFrom=new Date(now.getTime()-days*86400000);
 const tz=Session.getScriptTimeZone();
 const sheet=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(TAB_NAME);
 const rows=sheet&&sheet.getLastRow()>1
  ?sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues():[];
 function blank(){return {visits:0,visitors:0,events:0,camera:0,capture:0,exports:0};}
 const result={
  days:days,updated:now.toISOString(),timezone:tz,
  overall:{visits:0,visitors:0,events:0},
  photo:blank(),video:blank(),chart:[],lastEvents:[],
  topSections:[],topFeatures:[],
  photoSections:[],videoSections:[],photoFeatures:[],videoFeatures:[]
 };
 const distinct={overall:new Set(),photo:new Set(),video:new Set()};
 const sections={all:{},photo:{},video:{}},features={all:{},photo:{},video:{}},daily={};
 const eventList=[];
 for(const row of rows){
  const date=row[0]instanceof Date?row[0]:new Date(row[0]);
  if(isNaN(date.getTime())||date<dateFrom||date>now)continue;
  const app=String(row[1]),action=String(row[2]),visitor=String(row[3]);
  if(ALLOWED_APPS.indexOf(app)<0||!/^[a-f0-9]{32}$/.test(visitor)||!allowedEvent_(action))continue;
  const bucket=result[app],day=Utilities.formatDate(date,tz,'yyyy-MM-dd');
  if(!daily[day])daily[day]={date:day,photo:0,video:0};
  daily[day][app]++;
  distinct.overall.add(visitor);distinct[app].add(visitor);
  result.overall.events++;bucket.events++;
  if(action==='visit'){result.overall.visits++;bucket.visits++;}
  if(action==='camera_open')bucket.camera++;
  if(action==='shutter_click'||action==='record_click')bucket.capture++;
  if(['export_click','camera_save_click','x50_export_click','frame_export_click'].indexOf(action)>=0)bucket.exports++;
  if(action.indexOf('section_')===0){
   const n=action.slice(8);
   sections.all[n]=(sections.all[n]||0)+1;
   sections[app][n]=(sections[app][n]||0)+1;
  }
  if(action.indexOf('feature_')===0){
   const n=action.slice(8);
   features.all[n]=(features.all[n]||0)+1;
   features[app][n]=(features[app][n]||0)+1;
  }
  eventList.push({time:date.getTime(),at:Utilities.formatDate(date,tz,'dd.MM HH:mm'),app:app,action:action});
 }
 function top(group){
  return Object.keys(group).map(id=>({id:id,count:group[id]}))
   .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id)).slice(0,15);
 }
 result.topSections=top(sections.all);result.topFeatures=top(features.all);
 result.photoSections=top(sections.photo);result.videoSections=top(sections.video);
 result.photoFeatures=top(features.photo);result.videoFeatures=top(features.video);
 result.overall.visitors=distinct.overall.size;
 result.photo.visitors=distinct.photo.size;result.video.visitors=distinct.video.size;
 result.lastEvents=eventList.sort((a,b)=>b.time-a.time).slice(0,12)
  .map(e=>({at:e.at,app:e.app,action:e.action}));
 for(let d=days-1;d>=0;d--){
  const date=new Date(now.getTime()-d*86400000);
  const key=Utilities.formatDate(date,tz,'yyyy-MM-dd');
  result.chart.push(daily[key]||{date:key,photo:0,video:0});
 }
 return result;
}

function doPost(request){
 try{
  if(!request||!request.postData)return output_('invalid');
  const text=String(request.postData.contents||'');
  if(!text||text.length>1100)return output_('invalid');
  const item=JSON.parse(text);
  if(!item||ALLOWED_APPS.indexOf(item.app)<0||!allowedEvent_(item.action))return output_('invalid');
  const visitor=String(item.visitor||'');
  if(!/^[a-f0-9]{32}$/.test(visitor))return output_('invalid');
  const doc=SpreadsheetApp.openById(SPREADSHEET_ID);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))return output_('busy');
  try{
   let sheet=doc.getSheetByName(TAB_NAME);
   if(!sheet){
    sheet=doc.insertSheet(TAB_NAME);
    sheet.appendRow(['Время','Приложение','Действие','Анонимный ID']);
    sheet.setFrozenRows(1);
   }
   sheet.appendRow([new Date(),item.app,item.action,visitor]);
  }finally{lock.releaseLock();}
  return output_('ok');
 }catch(error){
  console.error('Collector error: '+String(error));
  return output_('error');
 }
}
function output_(message){
 return ContentService.createTextOutput(message)
  .setMimeType(ContentService.MimeType.TEXT);
}
