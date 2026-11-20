import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const TOKEN='example-secure-token-that-is-32-characters';
const ORIGIN='https://sh88dd-cmd.github.io';
const MP3=new Uint8Array([73,68,51,4,0,0,0,0,0,0,255,251,144,100]);
function makeRequest(path,key=TOKEN,opts={}) {
 const headers={Origin:ORIGIN,...(key?{'X-VHS-Bridge-Key':key}:{}),...(opts.headers||{})};
 return new Request('https://bridge-example.workers.dev'+path,{method:opts.method||'GET',headers,body:opts.body});
}
function env() {
 const items=new Map();
 return {BRIDGE_KEY:TOKEN,ALLOWED_AUDIO_HOSTS:'upload.wikimedia.org',
  TELEGRAM_BOT_TOKEN:'bot-example',TELEGRAM_WEBHOOK_SECRET:'webhook-secret',TELEGRAM_USER_ID:'123',
  TRACKS:{
   async get(k,{type}={}){return items.has(k)?JSON.parse(items.get(k)):null},
   async put(k,v){items.set(k,v)},
   async list({prefix}){return{keys:[...items.keys()].filter(x=>x.startsWith(prefix)).map(name=>({name}))}}
  }};
}
const savedFetch=globalThis.fetch;
function fakeFetch(fn){globalThis.fetch=fn;return()=>{globalThis.fetch=savedFetch}};
test('health and CORS are available without secret',async()=>{
 const r=await worker.fetch(makeRequest('/health',null),env());
 assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),ORIGIN);
 const preflight=await worker.fetch(makeRequest('/audio',null,{method:'OPTIONS'}),env());
 assert.equal(preflight.status,204);
});
test('requires token and prevents unapproved domains',async()=>{
 const e=env();
 assert.equal((await worker.fetch(makeRequest('/tracks','wrong'),e)).status,401);
 const bad=await worker.fetch(makeRequest('/audio?url='+encodeURIComponent('https://ru.hitmos.site/get/music/track.mp3')),e);
 assert.equal(bad.status,403);
 assert.match((await bad.json()).error,/разрешён/);
});
test('refuses non-app browser origin',async()=>{
 const e=env(),r=await worker.fetch(makeRequest('/health',null,{headers:{Origin:'https://evil.example'}}),e);
 assert.equal(r.status,403);
 assert.equal(r.headers.get('access-control-allow-origin'),null);
});
test('fetches allowed mp3, validates magic, adds CORS',async()=>{
 const restore=fakeFetch(async()=>new Response(MP3,{status:200,headers:{'Content-Type':'audio/mpeg'}}));
 try{
  const res=await worker.fetch(makeRequest('/audio?url='+encodeURIComponent('https://upload.wikimedia.org/sample.mp3')),env());
  assert.equal(res.status,200);
  assert.equal(res.headers.get('access-control-allow-origin'),ORIGIN);
  assert.equal(res.headers.get('content-type'),'audio/mpeg');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()),MP3);
 }finally{restore();}
});
test('does not conceal HTTP 403 or accept HTML as audio',async()=>{
 let restore=fakeFetch(async()=>new Response('Forbidden',{status:403}));
 try{
  const r=await worker.fetch(makeRequest('/audio?url='+encodeURIComponent('https://upload.wikimedia.org/forbidden.mp3')),env());
  assert.equal(r.status,403);assert.match((await r.json()).error,/HTTP 403/);
 }finally{restore();}
 restore=fakeFetch(async()=>new Response('<html>blocked</html>',{status:200,headers:{'Content-Type':'text/html'}}));
 try{
  const r=await worker.fetch(makeRequest('/audio?url='+encodeURIComponent('https://upload.wikimedia.org/blocked.mp3')),env());
  assert.equal(r.status,422);
 }finally{restore();}
});
test('Telegram only accepts authorized owner, lists metadata, serves audio without storing bytes',async()=>{
 const e=env();
 const body=JSON.stringify({message:{message_id:73,from:{id:123},audio:{file_id:'abc',file_size:100,title:'My authorized music',performer:'Self'}}});
 const sent=await worker.fetch(makeRequest('/telegram/webhook',null,{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'webhook-secret','Content-Type':'application/json'},body}),e);
 assert.equal(sent.status,200);assert.equal((await sent.json()).added,true);
 const list=await worker.fetch(makeRequest('/tracks'),e);
 const data=await list.json();assert.equal(data.tracks.length,1);assert.equal(data.tracks[0].title,'My authorized music');
 assert.equal('fileId' in data.tracks[0],false);
 const restore=fakeFetch(async url=>{
  if(String(url).includes('/getFile?'))return new Response(JSON.stringify({ok:true,result:{file_path:'music/audio_73.mp3'}}),{headers:{'Content-Type':'application/json'}});
  if(String(url).includes('/file/bot'))return new Response(MP3,{headers:{'Content-Type':'audio/mpeg'}});
  throw Error('Unexpected upstream');
 });
 try{
  const audio=await worker.fetch(makeRequest('/telegram/audio?id=73'),e);
  assert.equal(audio.status,200);assert.equal((await audio.arrayBuffer()).byteLength,MP3.length);
 }finally{restore();}
 const unauthorized=await worker.fetch(makeRequest('/telegram/webhook',null,{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'webhook-secret','Content-Type':'application/json'},body:JSON.stringify({message:{message_id:80,from:{id:999},audio:{file_id:'other',file_size:100}}})}),e);
 assert.equal((await unauthorized.json()).ignored,true);
});
