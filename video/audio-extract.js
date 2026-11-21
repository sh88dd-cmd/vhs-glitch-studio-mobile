/* VHS Video Lab — offline audio-only extraction from a separate MP4/MOV.
 * No second <video> player: its hardware decode can interrupt iPhone Safari's
 * main video. Read ISO BMFF sample tables, copy only AAC audio samples to ADTS.
 * No upload, codec library or full video read into RAM.
 */
(function(root){
'use strict';
const MAX_COMPRESSED=32*1024*1024, MAX_DURATION=310, READ_WINDOW=4*1024*1024;
const FREQUENCIES=[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350];
const error=message=>new Error(message);
function four(view,at){
 let out='';for(let n=0;n<4;n++)out+=String.fromCharCode(view.getUint8(at+n));return out;
}
function u64(view,at){
 const hi=view.getUint32(at),lo=view.getUint32(at+4);
 const n=hi*4294967296+lo;
 if(!Number.isSafeInteger(n))throw error('Слишком большой MP4 для локального чтения.');
 return n;
}
function boxes(view,start,end){
 const result=[];
 for(let p=start;p+8<=end;){
  let size=view.getUint32(p),head=8;
  if(size===1){if(p+16>end)throw error('Повреждён MP4 (размер блока).');size=u64(view,p+8);head=16;}
  if(size===0)size=end-p;
  if(size<head||p+size>end)throw error('Повреждена структура MP4/MOV.');
  result.push({type:four(view,p+4),start:p,data:p+head,end:p+size});
  if(result.length>500000)throw error('Слишком много блоков MP4.');
  p+=size;
 }
 return result;
}
function one(view,area,name){
 if(!area)return null;
 return boxes(view,area.data,area.end).find(x=>x.type===name)||null;
}
function firstOf(view,area,names){
 if(!area)return null;
 return boxes(view,area.data,area.end).find(x=>names.includes(x.type))||null;
}
async function locateMoov(file){
 let offset=0;
 for(let i=0;i<10000&&offset+8<=file.size;i++){
  const bytes=await file.slice(offset,offset+16).arrayBuffer();
  const view=new DataView(bytes);
  if(view.byteLength<8)break;
  let size=view.getUint32(0),header=8;
  if(size===1){if(view.byteLength<16)throw error('Повреждён заголовок MP4.');size=u64(view,8);header=16;}
  if(size===0)size=file.size-offset;
  if(size<header||offset+size>file.size)throw error('Повреждена структура MP4.');
  if(four(view,4)==='moov'){
   if(size>48*1024*1024)throw error('Слишком большой заголовок видео.');
   const data=await file.slice(offset,offset+size).arrayBuffer();
   return {view:new DataView(data),root:{data:header,end:data.byteLength}};
  }
  offset+=size;
 }
 throw error('В файле не найдена MP4/MOV аудиодорожка.');
}
function unpackTrack(view,trak){
 const mdia=one(view,trak,'mdia'),hdlr=one(view,mdia,'hdlr');
 if(!mdia||!hdlr||hdlr.data+12>hdlr.end||four(view,hdlr.data+8)!=='soun')return null;
 const minf=one(view,mdia,'minf'),stbl=one(view,minf,'stbl');
 if(!stbl)return null;
 const stsd=one(view,stbl,'stsd'),stsz=one(view,stbl,'stsz'),
       stsc=one(view,stbl,'stsc'),stco=firstOf(view,stbl,['stco','co64']),
       mdhd=one(view,mdia,'mdhd');
 if(!stsd||!stsz||!stsc||!stco||!mdhd)throw error('Не удалось прочитать таблицы звука из видео.');
 if(stsd.data+8>stsd.end||view.getUint32(stsd.data+4)<1)throw error('В видео не найден аудиокодек.');
 const entry=boxes(view,stsd.data+8,stsd.end)[0];
 if(!entry||entry.type!=='mp4a')throw error('Звуковой кодек видео не поддерживается. Нужен AAC в MP4/MOV.');
 if(entry.data+28>entry.end)throw error('Повреждено описание звукового кодека.');
 const channels=view.getUint16(entry.data+16);
 const rateFixed=view.getUint32(entry.data+24);
 let rate=rateFixed/65536;
 if(!Number.isInteger(rate)||!FREQUENCIES.includes(rate)){
  // QuickTime v2 stores the real rate as float64.
  const version=view.getUint16(entry.data+8);
  if(version===2&&entry.data+40<=entry.end)rate=view.getFloat64(entry.data+32);
 }
 const frequencyIndex=FREQUENCIES.indexOf(rate);
 if(frequencyIndex<0||channels<1||channels>7)throw error('Частота или количество каналов AAC не поддерживаются.');
 const mdhdVersion=view.getUint8(mdhd.data);
 const timePos=mdhd.data+(mdhdVersion===1?20:12);
 if(timePos+8>mdhd.end)throw error('Повреждена длительность аудиодорожки.');
 const scale=view.getUint32(timePos),ticks=mdhdVersion===1?u64(view,timePos+4):view.getUint32(timePos+4);
 if(scale>0&&ticks/scale>MAX_DURATION)throw error('Аудио длиннее 5 минут. Для экономии памяти iPhone выбери более короткий ролик.');
 if(stsz.data+12>stsz.end||stsc.data+8>stsc.end||stco.data+8>stco.end)throw error('Повреждены таблицы аудио.');
 const sampleSize=view.getUint32(stsz.data+4),count=view.getUint32(stsz.data+8);
 if(!count||count>100000)throw error('Нет звуковых кадров или их слишком много.');
 if(!sampleSize&&stsz.data+12+count*4>stsz.end)throw error('Не хватает размеров звуковых кадров.');
 const sizes=i=>sampleSize||view.getUint32(stsz.data+12+i*4);
 const chunkCount=view.getUint32(stco.data+4),chunks=[];
 if(chunkCount<1||chunkCount>100000)throw error('Не удалось найти звуковые блоки.');
 const stride=stco.type==='co64'?8:4;
 if(stco.data+8+chunkCount*stride>stco.end)throw error('Повреждены адреса звуковых блоков.');
 for(let i=0;i<chunkCount;i++){
  const offset=stco.type==='co64'?u64(view,stco.data+8+i*8):view.getUint32(stco.data+8+i*4);
  chunks.push(offset);
 }
 const n=view.getUint32(stsc.data+4),table=[];
 if(!n||n>chunkCount||stsc.data+8+n*12>stsc.end)throw error('Повреждена раскладка AAC кадров.');
 for(let i=0;i<n;i++){
  const pos=stsc.data+8+i*12;
  table.push({from:view.getUint32(pos),per:view.getUint32(pos+4),description:view.getUint32(pos+8)});
 }
 if(table[0].from!==1)throw error('Необычная структура AAC в видео.');
 const samples=[];
 let index=0,total=0,layout=0;
 for(let i=0;i<chunks.length&&index<count;i++){
  while(layout+1<table.length&&i+1>=table[layout+1].from)layout++;
  const {per,description}=table[layout];
  if(description!==1||per<1||per>5000)throw error('Неподдерживаемая таблица звуковых дорожек.');
  let offset=chunks[i];
  for(let k=0;k<per&&index<count;k++,index++){
   const size=sizes(index);
   if(!size||size>8184)throw error('Неподдерживаемый размер AAC-кадра.');
   samples.push({offset,size});
   offset+=size;total+=size+7;
   if(total>MAX_COMPRESSED)throw error('Аудиодорожка слишком большая для памяти iPhone.');
  }
 }
 if(index!==count)throw error('Часть звуковых кадров не найдена.');
 return {samples,total,frequencyIndex,channels,rate};
}
function header(out,at,length,freq,ch){
 const size=length+7,profile=1;
 out[at]=255;out[at+1]=241;
 out[at+2]=(profile<<6)|(freq<<2)|(ch>>2);
 out[at+3]=((ch&3)<<6)|(size>>11);
 out[at+4]=(size>>3)&255;
 out[at+5]=((size&7)<<5)|31;
 out[at+6]=252;
}
async function extract(file){
 if(!file||!Number.isFinite(file.size)||file.size<16)throw error('Выбери видеофайл.');
 if(!/\.(?:mp4|mov|m4v)$/i.test(file.name||''))throw error('Сейчас извлечение поддерживает MP4 и MOV со звуком AAC.');
 const {view,root:moov}=await locateMoov(file);
 const audio=boxes(view,moov.data,moov.end).filter(b=>b.type==='trak').map(trak=>unpackTrack(view,trak)).find(Boolean);
 if(!audio)throw error('В выбранном видео отсутствует поддерживаемая звуковая дорожка AAC.');
 const {samples,total,frequencyIndex,channels}=audio;
 const out=new Uint8Array(total);
 let dest=0;
 for(let i=0;i<samples.length;){
  const first=samples[i].offset;
  let last=first+samples[i].size,j=i+1;
  if(first<0||last>file.size)throw error('Неправильный адрес звукового кадра.');
  while(j<samples.length){
   const s=samples[j],nextEnd=s.offset+s.size;
   if(s.offset<last||nextEnd-first>READ_WINDOW)break;
   if(nextEnd>file.size)throw error('Звуковой кадр вышел за пределы файла.');
   last=nextEnd;j++;
  }
  const bytes=new Uint8Array(await file.slice(first,last).arrayBuffer());
  for(let k=i;k<j;k++){
   const s=samples[k];
   header(out,dest,s.size,frequencyIndex,channels);dest+=7;
   out.set(bytes.subarray(s.offset-first,s.offset-first+s.size),dest);
   dest+=s.size;
  }
  i=j;
 }
 if(dest!==total)throw error('Не удалось собрать аудиодорожку.');
 return out.buffer;
}
root.VHSVideoAudioExtract=Object.freeze({extract});
})(window);
