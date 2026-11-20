/* VHS Video Lab v0.5 - licensed online music search / RAM-only audio loading.
 * Openverse indexes sources and reports license metadata; verify every track.
 */
(function(root){
'use strict';
const MAX_BYTES=18*1024*1024;
const allowedLicenses=new Set(['cc0','pdm','by','by-sa']);
const safeURL=u=>{try{const url=new URL(String(u||''));return url.protocol==='https:'?url.href:null}catch{return null}};
function normalize(row){
 if(!row||typeof row!=='object')return null;
 const license=String(row.license||'').toLowerCase();
 if(!allowedLicenses.has(license)||row.mature)return null;
 const url=safeURL(row.url),landing=safeURL(row.foreign_landing_url),licenseURL=safeURL(row.license_url);
 if(!url)return null;
 return{id:String(row.id||url),title:String(row.title||'Без названия').slice(0,160),
  creator:String(row.creator||'Автор неизвестен').slice(0,160),url,license,licenseURL,landing,
  duration:Number(row.duration)||0,bytes:Number(row.filesize)||0,source:String(row.source||'Openverse').slice(0,60)};
}
function attribution(track){
 if(!track)return'';
 const label=track.license==='pdm'?'Public Domain':track.license==='cc0'?'CC0':track.license==='by-sa'?'CC BY-SA — условия ShareAlike':'CC BY';
 return [track.title+' — '+track.creator,label,track.licenseURL||'',track.landing||''].filter(Boolean).join('\n');
}
async function searchCommons(query,fetchFn=fetch){
 const endpoint=new URL('https://commons.wikimedia.org/w/api.php');
 const p=endpoint.searchParams;
 for(const [k,v] of Object.entries({
  action:'query',generator:'search',gsrsearch:query+' filetype:audio',
  gsrnamespace:'6',gsrlimit:'40',prop:'imageinfo',
  iiprop:'url|mime|size|extmetadata',
  iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist|Credit',
  format:'json',formatversion:'2',origin:'*'
 }))p.set(k,v);
 const res=await fetchFn(endpoint.toString(),{mode:'cors',credentials:'omit'});
 if(!res.ok)throw Error('Wikimedia Commons HTTP '+res.status);
 const json=await res.json();
 if(json.error)throw Error(String(json.error.info||json.error.code||'Ошибка Wikimedia Commons'));
 const pages=Array.isArray(json.query?.pages)?json.query.pages:Object.values(json.query?.pages||{});
 const tracks=[];
 for(const page of pages){
  const info=page.imageinfo?.[0];
  if(!info?.url)continue;
  const mime=String(info.mime||'').toLowerCase();
  if(!mime.startsWith('audio/')&&!mime.includes('ogg'))continue;
  if(info.size>MAX_BYTES||/midi|mid\b/.test(mime))continue;
  const metadata=info.extmetadata||{};
  const label=String(metadata.LicenseShortName?.value||'').trim();
  let license=null;
  if(/\bCC0\b/i.test(label))license='cc0';
  else if(/public.domain|^PD\b/i.test(label))license='pdm';
  else if(/^CC BY-SA(?:\s|$)/i.test(label))license='by-sa';
  else if(/^CC BY(?:\s|$)/i.test(label))license='by';
  else continue; // Unsupported/unknown licenses are not treated as cleared for video use.
  const url=safeURL(info.url);if(!url)continue;
  const htmlArtist=String(metadata.Artist?.value||'Автор не указан');
  const creator=htmlArtist.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
  const rawTitle=String(page.title||'Аудиофайл').replace(/^File:/i,'');
  const title=rawTitle.replace(/\.(?:mp3|ogg|oga|opus|wav|flac|webm|m4a)$/i,'').replace(/_/g,' ');
  const landing=safeURL(info.descriptionurl);
  tracks.push({id:'commons:'+page.pageid,title:title.slice(0,160),creator:creator.slice(0,160),
   url,license,licenseURL:safeURL(metadata.LicenseUrl?.value),
   landing:landing||'https://commons.wikimedia.org/wiki/'+encodeURIComponent(String(page.title||'')),
   bytes:Number(info.size)||0,duration:0,source:'Wikimedia Commons'});
 }
 // Prefer small, widely supported MP3/WAV files on iPhone over large Ogg/FLAC.
 tracks.sort((a,b)=>{
  const rank=t=>/\.(?:mp3|m4a)(?:$|\?)/i.test(t.url)?0:/\.wav(?:$|\?)/i.test(t.url)?1:/\.(?:ogg|oga|opus|webm)(?:$|\?)/i.test(t.url)?2:3;
  return rank(a)-rank(b)||a.bytes-b.bytes;
 });
 return tracks.slice(0,20);
}
async function search(query,fetchFn=fetch){
 const q=String(query||'').trim().slice(0,120);
 if(q.length<2)throw Error('Введи хотя бы два символа для поиска.');
 if(/^https?:\/\//i.test(q))throw Error('Это ссылка, а не поисковый запрос. Для поиска введи название или жанр; для добавления аудиофайла используй поле ссылки.');
 // Wikimedia Commons was verified to provide downloadable, CORS-enabled MP3 music.
 // Prefer it so a successful search has better odds of working in the VHS mixer.
 let commonsError=null;
 try{
  const tracks=await searchCommons(q,fetchFn);
  if(tracks.length)return tracks;
 }catch(e){commonsError=e.message||'ошибка каталога Wikimedia Commons';}
 try{
  const endpoint=new URL('https://api.openverse.org/v1/audio/');
  endpoint.searchParams.set('q',q);
  endpoint.searchParams.set('page_size','20'); // Anonymous searches above 20 return HTTP 401.
  endpoint.searchParams.set('category','music');
  endpoint.searchParams.set('license','cc0,pdm,by');
  const response=await fetchFn(endpoint.toString(),{mode:'cors',credentials:'omit',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Openverse HTTP '+response.status);
  const body=await response.json();
  const tracks=(Array.isArray(body.results)?body.results:[]).map(normalize).filter(Boolean);
  if(tracks.length)return tracks;
 }catch(e){
  if(commonsError)throw Error('Wikimedia Commons: '+commonsError+'; Openverse: '+e.message);
  throw new Error('Резервный Openverse недоступен: '+e.message);
 }
 if(commonsError)throw Error('Wikimedia Commons: '+commonsError+'; Openverse не нашёл подходящих треков.');
 return [];
}
function bridgeURL(config,path,params={}){
 const base=String(config?.url||'').trim().replace(/\/+$/,'');
 if(!config?.key||String(config.key).length<20)throw Error('Для личного аудиомоста требуется секретный ключ (минимум 20 символов).');
 let addr;
 try{addr=new URL(base+'/')}catch{throw Error('Проверь HTTPS-адрес личного аудиомоста.');}
 if(addr.protocol!=='https:'||!addr.hostname||addr.username||addr.password)throw Error('Личный аудиомост должен использовать HTTPS.');
 const u=new URL(path.replace(/^\//,''),addr);
 for(const [name,value] of Object.entries(params))u.searchParams.set(name,String(value));
 return u.href;
}
async function bridgeRequest(path,config,params={},fetchFn=fetch,signal){
 const url=bridgeURL(config,path,params);
 let res;
 try{res=await fetchFn(url,{mode:'cors',credentials:'omit',signal,headers:{'X-VHS-Bridge-Key':config.key}})}
 catch(e){if(signal?.aborted)throw Error('Загрузка отменена.');throw Error('Не удалось подключиться к личному аудиомосту. Проверь адрес, Cloudflare Worker и интернет.');}
 if(!res.ok){
  let detail='HTTP '+res.status;
  try{const info=await res.json();if(info?.error)detail=String(info.error).slice(0,220)}catch{}
  throw Error('Аудиомост: '+detail);
 }
 return res;
}
async function bridgeHealth(config,fetchFn=fetch){
 const res=await bridgeRequest('/status',config,{},fetchFn);
 return res.json();
}
async function bridgeSetupTelegram(config,fetchFn=fetch){
 const res=await bridgeRequest('/telegram/setup',config,{},fetchFn);
 return res.json();
}
async function bridgeTracks(config,fetchFn=fetch,signal){
 const res=await bridgeRequest('/tracks',config,{},fetchFn,signal);
 const json=await res.json();
 return (Array.isArray(json.tracks)?json.tracks:[]).filter(x=>/^\d{1,20}$/.test(String(x.id)))
  .map(x=>({id:String(x.id),title:String(x.title||'Telegram аудио').slice(0,160),
   creator:String(x.creator||'Telegram').slice(0,160),kind:'telegram',source:'Telegram',
   bytes:Number(x.bytes)||0,duration:Number(x.duration)||0,license:'user',url:null}));
}
async function readBridgeAudio(track,config,fetchFn=fetch,signal){
 if(!config?.url||!config?.key)throw Error('Личный аудиомост не подключён в настройках.');
 const route=track?.kind==='telegram'?'/telegram/audio':'/audio';
 const params=track?.kind==='telegram'?{id:track.id}:{url:track.url};
 const response=await bridgeRequest(route,config,params,fetchFn,signal);
 return readResponseAudio(response,signal);
}
async function readResponseAudio(res,signal){
 if(!res.ok)throw Error('Аудиофайл недоступен (HTTP '+res.status+').');
 const mime=String(res.headers?.get('content-type')||'').toLowerCase();
 if(/text\/html|application\/(?:json|xml)|text\/plain/.test(mime))
  throw Error('Эта ссылка ведёт на страницу сайта, а не на аудиофайл. Нужна прямая ссылка на MP3, M4A, WAV или OGG.');
 const len=Number(res.headers?.get('content-length'))||0;
 if(len>MAX_BYTES)throw Error('Этот файл слишком большой для обработки на iPhone (максимум 18 МБ).');
 if(!res.body?.getReader){
  const data=await res.arrayBuffer();
  if(data.byteLength>MAX_BYTES)throw Error('Аудиофайл превышает лимит 18 МБ.');
  return data;
 }
 const reader=res.body.getReader(),chunks=[];let total=0;
 while(true){
  const {done,value}=await reader.read();
  if(signal?.aborted){try{await reader.cancel()}catch{}throw Error('Загрузка музыки отменена.');}
  if(done)break;
  total+=value.byteLength;
  if(total>MAX_BYTES){await reader.cancel();throw Error('Файл больше 18 МБ. Выбери более короткий трек.');}
  chunks.push(value);
 }
 const all=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
 return all.buffer;
}
async function readAudio(url,fetchFn=fetch,signal,bridge=null){
 const remote=safeURL(url);
 if(!remote)throw Error('Нужна прямая HTTPS-ссылка на аудиофайл (MP3, M4A, OGG или WAV).');
 let res=null,err=null;
 try{res=await fetchFn(remote,{mode:'cors',credentials:'omit',redirect:'follow',signal});}
 catch(e){if(signal?.aborted)throw Error('Загрузка музыки отменена.');err=e;}
 if(res?.ok)return readResponseAudio(res,signal);
 // Fail over only for a configured personal bridge, never to unknown public proxies.
 if(bridge?.url&&bridge?.key){
  if(signal?.aborted)throw Error('Загрузка музыки отменена.');
  return readBridgeAudio({url:remote},bridge,fetchFn,signal);
 }
 if(res)throw Error('Аудиосервер отклонил запрос (HTTP '+res.status+'). Если это твой разрешённый аудиофайл, подключи личный аудиомост.');
 if(err)throw Error('Сайт не разрешил браузерную загрузку (CORS) или недоступен. Для разрешённого аудио можно подключить личный аудиомост.');
 throw Error('Загрузка аудио недоступна.');
}
root.VHSVideoMusicCatalog=Object.freeze({search,searchCommons,normalize,readAudio,readBridgeAudio,bridgeHealth,bridgeSetupTelegram,bridgeTracks,attribution,MAX_BYTES});
})(window);