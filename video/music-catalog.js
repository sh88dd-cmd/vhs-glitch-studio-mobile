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
async function search(query,fetchFn=fetch){
 const q=String(query||'').trim().slice(0,120);
 if(q.length<2)throw Error('Введи хотя бы два символа для поиска.');
 const endpoint=new URL('https://api.openverse.org/v1/audio/');
 endpoint.searchParams.set('q',q);
 endpoint.searchParams.set('page_size','30');
 endpoint.searchParams.set('category','music');
 endpoint.searchParams.set('license','cc0,pdm,by');
 const response=await fetchFn(endpoint.toString(),{mode:'cors',credentials:'omit',headers:{Accept:'application/json'}});
 if(!response.ok)throw Error(response.status===429?'Каталог временно ограничил запросы. Попробуй позже.':'Не удалось получить каталог музыки (HTTP '+response.status+').');
 const json=await response.json();
 return (Array.isArray(json.results)?json.results:[]).map(normalize).filter(Boolean);
}
async function readAudio(url,fetchFn=fetch){
 const remote=safeURL(url);
 if(!remote)throw Error('Нужна прямая HTTPS-ссылка на аудиофайл (MP3, M4A, OGG или WAV).');
 let res;
 try{res=await fetchFn(remote,{mode:'cors',credentials:'omit',redirect:'follow'});}
 catch{throw Error('Сайт не разрешил получить звук для монтажа (CORS) или нет интернета. Попробуй другой трек.');}
 if(!res.ok)throw Error('Аудиофайл недоступен (HTTP '+res.status+').');
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
  if(done)break;
  total+=value.byteLength;
  if(total>MAX_BYTES){await reader.cancel();throw Error('Файл больше 18 МБ. Выбери более короткий трек.');}
  chunks.push(value);
 }
 const all=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
 return all.buffer;
}
root.VHSVideoMusicCatalog=Object.freeze({search,normalize,readAudio,attribution,MAX_BYTES});
})(window);