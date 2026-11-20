/* VHS Video Lab private audio bridge.
 * No DRM bypass, no site-block evasion, no public unrestricted CORS proxy.
 * Configure BRIDGE_KEY as a Cloudflare secret; keep it out of GitHub.
 */
const APP_ORIGIN = 'https://sh88dd-cmd.github.io';
const MAX_BYTES = 18 * 1024 * 1024;
const HEADERS = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function json(obj,status=200,cors={}) {
 return new Response(JSON.stringify(obj),{status,headers:{...HEADERS,...cors,'Content-Type':'application/json; charset=utf-8'}});
}
function corsFor(request) {
 const origin=request.headers.get('Origin');
 const headers={'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers':'X-VHS-Bridge-Key, Content-Type','Access-Control-Max-Age':'600'};
 if(origin===APP_ORIGIN)headers['Access-Control-Allow-Origin']=APP_ORIGIN;
 return headers;
}
function authorized(request,env){
 const expected=env.BRIDGE_KEY;
 const given=request.headers.get('X-VHS-Bridge-Key');
 if(typeof expected!=='string'||expected.length<20||typeof given!=='string'||given.length!==expected.length)return false;
 let mismatch=0;for(let i=0;i<given.length;i++)mismatch|=given.charCodeAt(i)^expected.charCodeAt(i);
 return mismatch===0;
}
function goodHost(host,entry){
 const rule=entry.trim().toLowerCase();
 if(!rule)return false;
 if(rule.startsWith('*.'))return host.endsWith(rule.slice(1))&&host!==rule.slice(2);
 return host===rule;
}
function allowedAudioURL(raw,env){
 let u;
 try{u=new URL(raw)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')return null;
 const host=u.hostname.toLowerCase();
 if(!/^[a-z0-9.-]+$/.test(host)||!host.includes('.')||host==='localhost'||host.endsWith('.local')||/^\d+(?:\.\d+){3}$/.test(host)||host.includes('..'))return null;
 // No arbitrary-host proxy; owner explicitly configures permitted public origin domains.
 const allow=(env.ALLOWED_AUDIO_HOSTS||'upload.wikimedia.org,archive.org,*.archive.org')
  .toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
 if(!allow.some(rule=>goodHost(host,rule)))return null;
 u.hash='';return u.href;
}
async function fetchAllowedAudio(url,env){
 let current=url,upstream=null;
 for(let step=0;step<4;step++){
  const safe=allowedAudioURL(current,env);
  if(!safe)return{error:'Этот аудиоисточник не разрешён в настройках личного моста.',status:403};
  try{upstream=await fetch(safe,{redirect:'manual',headers:{'Accept':'audio/*,application/octet-stream;q=.8,*/*;q=.2'}});}
  catch{return{error:'Не удалось связаться с аудиосервером.',status:502};}
  if([301,302,303,307,308].includes(upstream.status)){
   const destination=upstream.headers.get('location');
   if(!destination)return{error:'Аудиосервер вернул перенаправление без адреса.',status:502};
   current=new URL(destination,safe).href;upstream.body?.cancel?.();continue;
  }
  break;
 }
 if(!upstream)return{error:'Источник недоступен.',status:502};
 if([301,302,303,307,308].includes(upstream.status))return{error:'Слишком много перенаправлений.',status:502};
 return readAudioResponse(upstream);
}
async function readAudioResponse(upstream){
 if(!upstream.ok)return{error:'Источник аудио отказал в доступе (HTTP '+upstream.status+'). Мост не обходит запреты сайта.',status:upstream.status===403?403:502};
 const ct=(upstream.headers.get('content-type')||'').toLowerCase();
 if(/text\/html|application\/json|text\/plain|application\/xml/.test(ct))
  return{error:'Источник вернул веб-страницу или ошибку вместо аудиофайла.',status:422};
 const size=Number(upstream.headers.get('content-length'))||0;
 if(size>MAX_BYTES)return{error:'Файл больше 18 МБ.',status:413};
 if(!upstream.body)return{error:'Аудиосервер не вернул содержимое.',status:502};
 const reader=upstream.body.getReader(),chunks=[];let total=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   total+=part.value.byteLength;
   if(total>MAX_BYTES){await reader.cancel();return{error:'Файл превысил лимит 18 МБ.',status:413};}
   chunks.push(part.value);
  }
 }catch{return{error:'Ошибка чтения аудиопотока.',status:502};}
 const data=new Uint8Array(total);let pos=0;
 for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.byteLength;}
 const magic=String.fromCharCode(...data.slice(0,4));
 const mp3=magic.startsWith('ID3')||(data[0]===255&&(data[1]&0xe0)===0xe0);
 const wav=magic==='RIFF'&&String.fromCharCode(...data.slice(8,12))==='WAVE';
 const ogg=magic==='OggS',flac=magic==='fLaC',m4a=String.fromCharCode(...data.slice(4,8))==='ftyp';
 if(!(mp3||wav||ogg||flac||m4a))
  return{error:'Ответ не похож на поддерживаемый аудиофайл (возможно, сайт вернул страницу блокировки).',status:422};
 const type=mp3?'audio/mpeg':wav?'audio/wav':ogg?'audio/ogg':flac?'audio/flac':'audio/mp4';
 return{data,type};
}
async function fetchTelegramAudio(id,env){
 if(!env.TELEGRAM_BOT_TOKEN||!env.TRACKS)return{error:'Telegram не настроен в личном мосте.',status:503};
 if(!/^\d{1,20}$/.test(id))return{error:'Недопустимый номер трека.',status:400};
 const meta=await env.TRACKS.get('song:'+id,{type:'json'});
 if(!meta?.fileId)return{error:'Трек не найден в личной библиотеке.',status:404};
 const response=await fetch('https://api.telegram.org/bot'+env.TELEGRAM_BOT_TOKEN+'/getFile?file_id='+encodeURIComponent(meta.fileId));
 if(!response.ok)return{error:'Telegram не ответил на запрос файла.',status:502};
 const answer=await response.json();
 if(!answer.ok||!answer.result?.file_path)return{error:'Telegram больше не предоставляет этот файл.',status:502};
 const filename=answer.result.file_path.replace(/^\/+/,'');
 if(!/^[-\w./]+$/.test(filename)||filename.includes('..'))return{error:'Неверный путь к файлу Telegram.',status:502};
 const url='https://api.telegram.org/file/bot'+env.TELEGRAM_BOT_TOKEN+'/'+filename;
 const upstream=await fetch(url);
 return readAudioResponse(upstream);
}
async function telegramWebhook(request,env,cors){
 if(!env.TELEGRAM_BOT_TOKEN||!env.TELEGRAM_WEBHOOK_SECRET||!env.TELEGRAM_USER_ID||!env.TRACKS)
  return json({error:'Telegram не настроен'},503,cors);
 if(request.headers.get('X-Telegram-Bot-Api-Secret-Token')!==env.TELEGRAM_WEBHOOK_SECRET)
  return json({error:'Forbidden'},403,cors);
 let body;try{body=await request.json()}catch{return json({error:'Invalid JSON'},400,cors)}
 const m=body.message||body.channel_post||null;
 if(!m||String(m.from?.id)!==String(env.TELEGRAM_USER_ID))return json({ok:true,ignored:true},200,cors);
 const att=m.audio||(m.document&&/^audio\//.test(m.document.mime_type||'')?m.document:null);
 if(!att?.file_id||!Number.isFinite(Number(att.file_size))||Number(att.file_size)>MAX_BYTES)return json({ok:true,ignored:true},200,cors);
 const id=String(m.message_id);
 const title=String(att.title||att.file_name||'Музыка из Telegram').slice(0,160);
 const creator=String(att.performer||'Telegram').slice(0,100);
 const entry={id,title,creator,fileId:att.file_id,bytes:att.file_size||0,duration:att.duration||0,created:Date.now()};
 await env.TRACKS.put('song:'+id,JSON.stringify(entry),{expirationTtl:60*60*24*30});
 // Store only Telegram's file identifier and metadata. Audio bytes are not persisted here.
 return json({ok:true,added:true},200,cors);
}
export default {
 async fetch(request,env){
  const cors=corsFor(request);
  const u=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...HEADERS,...cors}});
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==APP_ORIGIN)return json({error:'Forbidden origin'},403,cors);
  if(u.pathname==='/telegram/webhook'&&request.method==='POST')return telegramWebhook(request,env,cors);
  if(request.method!=='GET')return json({error:'Method not allowed'},405,cors);
  if(u.pathname==='/health')return json({ok:true,configured:!!env.BRIDGE_KEY&&env.BRIDGE_KEY.length>=20,
   telegram:!!(env.TRACKS&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_WEBHOOK_SECRET&&env.TELEGRAM_USER_ID)},200,cors);
  if(!authorized(request,env))return json({error:'Неверный секретный ключ аудиомоста.'},401,cors);
  if(u.pathname==='/status')return json({ok:true,configured:true,authorized:true,
   telegram:!!(env.TRACKS&&env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_WEBHOOK_SECRET&&env.TELEGRAM_USER_ID)},200,cors);
  if(u.pathname==='/tracks'){
   if(!env.TRACKS||!env.TELEGRAM_BOT_TOKEN)return json({error:'Telegram библиотека не подключена.'},503,cors);
   const listing=await env.TRACKS.list({prefix:'song:',limit:80});
   const values=(await Promise.all(listing.keys.map(k=>env.TRACKS.get(k.name,{type:'json'})))).filter(Boolean);
   values.sort((a,b)=>b.created-a.created);
   return json({tracks:values.slice(0,40).map(({id,title,creator,bytes,duration})=>({id,title,creator,bytes,duration,kind:'telegram',source:'Telegram'}))},200,cors);
  }
  let loaded;
  if(u.pathname==='/audio'&&u.searchParams.has('url'))loaded=await fetchAllowedAudio(u.searchParams.get('url'),env);
  else if(u.pathname==='/telegram/audio'&&u.searchParams.has('id'))loaded=await fetchTelegramAudio(u.searchParams.get('id'),env);
  else return json({error:'Unknown endpoint'},404,cors);
  if(!loaded.data)return json({error:loaded.error||'Ошибка аудио'},loaded.status||502,cors);
  return new Response(loaded.data,{status:200,headers:{...HEADERS,...cors,'Content-Type':loaded.type,
   'Content-Length':String(loaded.data.byteLength)}});
 }
};