/* Smoke tests for iPhone gallery/Files imports with metadata-only Safari support. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const from=app.indexOf(' async function waitVideoReady(options={}){');
const until=app.indexOf(' function importStatus(',from);
assert.ok(from>0&&until>from,'Video-ready helper missing.');
const helper=app.slice(from,until);
const create=new Function('source','setTimeout','clearTimeout',helper+'return waitVideoReady;');
const fake={
 readyState:1,videoWidth:1920,videoHeight:1080,error:null,handlers:new Map(),
 addEventListener(name,fn){
  if(!this.handlers.has(name))this.handlers.set(name,new Set());
  this.handlers.get(name).add(fn);
 },
 removeEventListener(name,fn){this.handlers.get(name)?.delete(fn);},
 emit(name){for(const fn of this.handlers.get(name)||[])fn();}
};
const wait=create(fake,setTimeout,clearTimeout);
assert.equal((await wait()).hasFrame,false,'Safari metadata must unlock playback without loadeddata');
fake.readyState=2;
assert.equal((await wait()).hasFrame,true,'First-frame-ready Safari video should be detected');
fake.readyState=0;fake.videoWidth=0;fake.videoHeight=0;
const pending=wait({subject:'sample.mov',timeoutMs:1000});
fake.readyState=1;fake.videoWidth=1920;fake.videoHeight=1080;fake.emit('loadedmetadata');
assert.equal((await pending).hasFrame,false,'Metadata event should resolve without requiring decoded frame');
fake.readyState=0;fake.videoWidth=0;fake.videoHeight=0;fake.error={code:4};
const unsupported=wait({subject:'bad.mp4',timeoutMs:1000});
fake.emit('error');
await assert.rejects(unsupported,/формат или кодек/);
assert.ok(/id="videoInput"[^>]*hidden/.test(html),'Primary input must be present');
assert.ok(!/<input id="videoInput"[^>]*multiple/.test(html),'Primary Photos selection should be single-file');
assert.ok(/id="videoClipsInput"[^>]*multiple/.test(html),'Multi-clip selection should remain available');
assert.ok(html.includes('id="videoFilesInput"'),'Files fallback missing');
assert.ok(html.includes('id="videoImportStatus"'),'Picker diagnostics missing');
assert.ok(html.includes('id="videoImportHelp"'),'iOS Files instructions missing');
const stage=app.indexOf('const videoReady=await waitVideoReady(');
const commit=app.indexOf('clips=candidate;clipIndex=0;file=first');
const revocation=app.indexOf('previous.clips.forEach(entry=>URL.revokeObjectURL');
assert.ok(stage>0&&stage<commit&&commit<revocation,'Old video URL revoked before new video validated.');
assert.ok(app.includes('source.src=previous.sourceUrl'),'Old video not recovered on import failure');
assert.ok(app.includes("if(videoImportBusy&&!videoImportCommitted") || app.includes("videoImportBusy&&!videoImportCommitted"),'Import staging not guarded');
console.log('PASS: metadata-only Safari video acceptance, codec errors, safe old-video rollback and picker UI');
