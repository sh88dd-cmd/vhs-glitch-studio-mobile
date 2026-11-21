/* Regression smoke test for v0.6.1 MP4/MOV AAC-only extraction. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
globalThis.window=globalThis;
await import(pathToFileURL(resolve('video/audio-extract.js')));
assert.ok(window.VHSVideoAudioExtract, 'Extractor API missing');
const tmp=process.env.RUNNER_TEMP||'/tmp';
for(const ext of ['mp4','mov']){
 const video=join(tmp,'vhs-aac-test.'+ext),extracted=join(tmp,'vhs-aac-out-'+ext+'.aac');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
  '-f','lavfi','-i','color=c=black:s=160x120:r=15:d=2',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
  '-c:v','mpeg4','-q:v','10','-c:a','aac','-b:a','64k','-shortest',video]);
 const data=await fs.readFile(video);
 const blob=new Blob([data]);blob.name='vhs-aac-test.'+ext;
 const bytes=await window.VHSVideoAudioExtract.extract(blob);
 assert.ok(bytes.byteLength>1000,'No AAC samples extracted from '+ext);
 const out=new Uint8Array(bytes);
 assert.equal(out[0],255);assert.equal(out[1],241);
 await fs.writeFile(extracted,Buffer.from(out));
 const decoded=join(tmp,'vhs-aac-pcm-'+ext+'.wav');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-f','aac','-i',extracted,'-ac','1','-ar','48000',decoded]);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-of','json',decoded],{encoding:'utf8'}));
 const duration=Number(probe.format.duration);
 assert.ok(duration>1.85&&duration<2.3,'Bad audio duration '+duration+' in '+ext);
 const wav=await fs.stat(decoded);
 assert.ok(wav.size>100000,'Decoded audio appears empty');
 console.log(ext,'PASS',JSON.stringify({videoKB:Math.round(data.length/1024),audioKB:Math.round(bytes.byteLength/1024),duration}));
}
const data=await fs.readFile(join(tmp,'vhs-aac-test.mp4'));
const unsupported=new Blob([data]);unsupported.name='test.webm';
await assert.rejects(()=>window.VHSVideoAudioExtract.extract(unsupported),/MP4/);
console.log('AAC extraction regression smoke tests passed.');
