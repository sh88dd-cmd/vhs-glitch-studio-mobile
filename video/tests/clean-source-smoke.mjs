/* Original-quality zero-effects preview and lossless export regression tests. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root={};
for(const path of ['video/effects-reset.js','video/clean-path.js'])
 vm.runInNewContext(fs.readFileSync(path,'utf8'),{window:root,Math,Number,Object,JSON,Array});
const reset=root.VHSVideoEffectsReset;
const clean=root.VHSVideoCleanPath;
assert.ok(clean&&reset,'Missing clean source or zero-reset module');

const settings={
 masterBypass:false,vhsEnabled:true,master:65,fxMode:'classic',
 filmEnabled:true,filmStrength:85,
 filmDamage:{enabled:true,leak:20,dust:30,grain:35,scratches:10,flicker:14,halation:20},
 glitchEnabled:true,glitchStrength:75,mode:'vhs',modeStrength:75,
 camera:{rec:true,date:true,battery:false},
 signal:{tracking:65},glitches:{rf:55},
 audio:{enabled:true,strength:55},music:{strength:85},holdEvents:[{clip:0,blend:50,start:1,end:3}],
 timelineEvents:[{clip:0,time:1}],mix:{videoVolume:75,musicVolume:70},
 keepAudio:true,exportScope:'full',selectedTrack:{kind:'file',title:'a.mp3'},
 fps:15,size:'480'
};
assert.equal(clean.hasVisualEffects(settings,0),true);
reset.zero(settings);
assert.equal(clean.hasVisualEffects(settings,0),false,
 'Reset must remove every visual effect and activate the clean renderer');
assert.equal(clean.canCopyOriginal(settings,{clipCount:1,duration:65,extraTracks:[]}),true,
 'Untouched full-length clip should preserve actual original file bytes');
assert.equal(clean.canCopyOriginal(settings,{clipCount:1,duration:15,extraTracks:[]}),true);

const [wideW,wideH]=clean.rawCanvasSize(3840,2160,1920);
assert.equal(wideW,1920);assert.equal(wideH,1080);
const [tallW,tallH]=clean.rawCanvasSize(1080,1920,1920);
assert.equal(tallW,1080);assert.equal(tallH,1920);
const [lowW,lowH]=clean.rawCanvasSize(320,240,1920);
assert.equal(lowW,320);assert.equal(lowH,240);

const ops=[];
const ctx={
 fillStyle:'',imageSmoothingEnabled:false,
 fillRect(...args){ops.push(['fillRect',...args]);},
 drawImage(...args){ops.push(['drawImage',...args]);},
 getImageData(){throw Error('Clean frame must not read/modify video pixels');},
 putImageData(){throw Error('Clean frame must not apply video filters');}
};
const canvas={width:1080,height:1920,getContext:()=>ctx};
const source={videoWidth:1080,videoHeight:1920};
clean.drawClean(source,canvas);
assert.equal(ops.length,2);
assert.deepEqual(ops[1],['drawImage',source,0,0,1080,1920]);
assert.equal(ctx.imageSmoothingEnabled,true);
const letterbox=[];
const otherCanvas={width:1920,height:1080,getContext:()=>({
 fillStyle:'',set imageSmoothingEnabled(v){},
 fillRect(...args){letterbox.push(['fillRect',...args])},
 drawImage(...args){letterbox.push(['drawImage',...args])}
})};
clean.drawClean(source,otherCanvas);
assert.equal(letterbox[1][0],'drawImage');
assert.ok(letterbox[1][2]>0,'Portrait source must be centered, not stretched, in landscape canvas');

// Original-byte export is never used when the edit actually changes footage,
// trims long media to first 30 seconds, changes native audio or has extra sound.
const opts={clipCount:1,duration:65,extraTracks:[]};
settings.exportScope='30';
assert.equal(clean.canCopyOriginal(settings,opts),false);
settings.exportScope='full';
settings.filmEnabled=true;settings.filmStrength=12;
assert.equal(clean.canCopyOriginal(settings,opts),false);
settings.filmEnabled=false;
settings.mix.videoVolume=50;
assert.equal(clean.canCopyOriginal(settings,opts),false);
settings.mix.videoVolume=100;
settings.keepAudio=false;
assert.equal(clean.canCopyOriginal(settings,opts),false);
settings.keepAudio=true;
assert.equal(clean.canCopyOriginal(settings,{...opts,extraTracks:[{volume:50}]}),false);
assert.equal(clean.canCopyOriginal(settings,{...opts,clipCount:2}),false);
assert.equal(clean.canCopyOriginal(settings,{...opts,holdVideo:.8}),false);
assert.equal(clean.canCopyOriginal(settings,{...opts,holdAudio:.8}),false);
settings.audio.enabled=true;settings.audio.strength=50;
assert.equal(clean.canCopyOriginal(settings,opts),false);
settings.audio.enabled=false;
settings.holdEvents=[{clip:0,blend:50,start:3,end:5}];
assert.equal(clean.canCopyOriginal(settings,opts),false);

// Verify actual editor routing, not just the pure rendering module.
const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const sw=fs.readFileSync('video/sw.js','utf8');
assert.ok(app.includes('if(clean){\n   window.VHSVideoCleanPath.drawClean(source,canvas);\n   return;'));
assert.ok(app.includes('videoDimensions(clean?1920:520)'));
assert.ok(app.includes('const videoReady=await waitVideoReady('),'Video picker must remain unchanged');
assert.ok(app.includes("exportBlob=file;exportMime=file.type||'application/octet-stream'"));
assert.ok(app.includes("link.download=file.name||'original_video'"));
assert.ok(app.includes("if(window.VHSVideoCleanPath.canCopyOriginal(state,"));
assert.ok(html.includes('clean-path.js?v=0.7.5'));
assert.ok(sw.includes("'./clean-path.js'"));
console.log('PASS: clean frames avoid 240px buffer, aspect ratio preserved, raw file copied only when untouched');
