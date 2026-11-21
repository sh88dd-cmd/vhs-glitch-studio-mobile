/* Node smoke tests for Film Damage + 3-track Web Audio mixing. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root={};
const run=file=>vm.runInNewContext(fs.readFileSync(file,'utf8'),{window:root,console,Uint8ClampedArray,Uint8Array,Float32Array,Math,Number,Array,Date});
run('video/film-damage.js');
run('video/audio-engine.js');
const frame=()=>Uint8ClampedArray.from({length:32*18*4},(_,i)=>i%4===3?255:(i*9)%256);
const a=frame(),b=frame(),c=frame();
const settings={enabled:true,seed:14,time:2.6,type:'first',leak:65,dust:35,grain:44,scratches:31,halation:42,flicker:36};
root.VHSVideoFilmDamage.apply(a,32,18,settings);
root.VHSVideoFilmDamage.apply(b,32,18,settings);
root.VHSVideoFilmDamage.apply(c,32,18,{...settings,time:3.9});
assert.deepEqual(Array.from(a),Array.from(b),'film effect changed between identical runs');
assert.ok(Array.from(a).some((x,i)=>x!==c[i]),'film effect must animate with time');
assert.ok(Array.from(a).filter((x,i)=>i%4===3).every(x=>x===255),'alpha must stay opaque');
const changes=[];
const gain=()=>({gain:{value:0,setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){}});
let time=0;
const tape=root.VHSVideoTapeAudio.create({});
tape.connected=true;tape.mixer={};tape.musicAnalyser={};tape.musicGain=gain();
tape.ctx={get currentTime(){return time},createGain:gain,createBufferSource(){
 const node={connect(){},disconnect(){},stop(){this.stopped=true},start(...args){this.started=args}};
 changes.push(node);return node;
}};
const sample={duration:10,length:480000,numberOfChannels:2};
tape.setMusicBuffer(sample);
tape.mix={videoVolume:100,musicVolume:80,musicStart:0,musicOffset:2,musicTrimEnd:5,musicLoop:true,fadeIn:.5,fadeOut:.5};
tape.setExtraTracks([
 {id:'1',buffer:sample,at:1,trimStart:0,trimEnd:6,loop:false,volume:60,fadeIn:1,fadeOut:1},
 {id:'2',buffer:sample,at:0,trimStart:1,trimEnd:4,loop:true,volume:30,fadeIn:0,fadeOut:0}
]);
tape.syncMusic(3,true);
assert.equal(changes.length,3);
assert.equal(changes[0].loopStart,2);assert.equal(changes[0].loopEnd,5);
assert.equal(changes[2].loop,true);
time=.1;tape.syncMusic(3.1,true);assert.equal(changes.length,3,'stable playback should not restart sources');
tape.syncMusic(3.2,false);assert.ok(changes.every(x=>x.stopped),'pause must stop all audio sources');
console.log('PASS: deterministic Film Damage and three independent audio sources');
