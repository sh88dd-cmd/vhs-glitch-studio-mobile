/* VHS Video Lab v0.5 - licensed online music search / RAM-only audio loading.
 * Openverse indexes sources and reports license metadata; verify every track.
 */
(function(root){
'use strict';
const MAX_BYTES=18*1024*1024;
const allowedLicenses=new Set(['cc0','pdm','by']);
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
 const label=track.license==='pdm'?'Public Domain':track.license==='cc0'?'CC0':'CC BY';
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
  else if(/^CC BY(?:\s|$)/i.test(label))license='by';
  else continue; // Unknown and share-alike licenses must not be misrepresented.
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
 return tracks.slice(0,20);
}
async function search(query,fetchFn=fetch){
 const q=String(query||'').trim().slice(0,120);
 if(q.length<2)throw Error('Введи хотя бы два символа для поиска.');
 if(/^https?:\/\//i.test(q))throw Error('Это ссылка, а не поисковый запрос. Для поиска введи название или жанр; для добавления аудиофайла используй поле ссылки ниже.');
 let primaryError=null;
 try{
  const endpoint=new URL('https://api.openverse.org/v1/audio/');
  endpoint.searchParams.set('q',q);
  endpoint.searchParams.set('page_size','20'); // Anonymous API hard maximum: 30 returns 401.
  endpoint.searchParams.set('category','music');
  endpoint.searchParams.set('license','cc0,pdm,by');
  const res=await fetchFn(endpoint.toString(),{mode:'cors',credentials:'omit',headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('HTTP '+res.status);
  const json=await res.json();
  const tracks=(Array.isArray(json.results)?json.results:[]).map(normalize).filter(Boolean);
  if(tracks.length)return tracks;
 }catch(e){primaryError=e.message||'сетевая ошибка';}
 try{
  const others=await searchCommons(q,fetchFn);
  if(others.length)return others;
  if(primaryError)throw Error('Openverse: '+primaryError+'; Wikimedia Commons не нашёл подходящих аудиофайлов.');
  return [];
 }catch(e){
  if(primaryError&&!e.message?.includes('Openverse:'))throw Error('Openverse: '+primaryError+'; Wikimedia Commons: '+e.message);
  throw e;
 }
}
async function readAudio(url,fetchFn=fetch,signal){
 const remote=safeURL(url);
 if(!remote)throw Error('Нужна прямая HTTPS-ссылка на аудиофайл (MP3, M4A, OGG или WAV).');
 let res;
 try{res=await fetchFn(remote,{mode:'cors',credentials:'omit',redirect:'follow',signal});}
 catch(e){if(signal?.aborted)throw Error('Загрузка музыки отменена.');throw Error('Сайт не разрешил получить звук для монтажа (CORS) или нет интернета. Попробуй другой трек.');}
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
root.VHSVideoMusicCatalog=Object.freeze({search,searchCommons,normalize,readAudio,attribution,MAX_BYTES});
})(window);