/* 0.7.6 regression: cassette toggle/restore and collision-free camera viewfinder. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync('video/app.js','utf8');
const html=fs.readFileSync('video/index.html','utf8');
const reset=fs.readFileSync('video/effects-reset.js','utf8');
const clean=fs.readFileSync('video/clean-path.js','utf8');
const camera=fs.readFileSync('video/camera-osd.js','utf8');
const root={};
for(const script of [reset,clean,camera])vm.runInNewContext(script,{window:root,Math,Number,Date,JSON,Object,Array,String});
assert.ok(root.VHSVideoCameraOSD&&root.VHSVideoEffectsReset);
assert.ok(html.includes('id="cassetteDeselect"'));
assert.ok(html.includes('camera-osd.js?v=0.7.6'));
assert.ok(app.includes("['center-top','По центру сверху']")&&app.includes("['center-bottom','По центру снизу']"));
assert.ok(app.includes('function cancelCassette()'));
assert.ok(app.includes("face.onclick=()=>selectCassette(cassette)"));
assert.ok(app.includes("face.setAttribute('aria-pressed'"));
assert.ok(!root.VHSVideoCleanPath.hasVisualEffects({
 camera:{frame:false},fxMode:'classic',mode:'vhs',vhsEnabled:false,
 filmEnabled:false,filmDamage:{enabled:false},glitchEnabled:false
},0));
assert.ok(root.VHSVideoCleanPath.hasVisualEffects({
 camera:{frame:true},fxMode:'classic',mode:'vhs',vhsEnabled:false,
 filmEnabled:false,filmDamage:{enabled:false},glitchEnabled:false
},0),'Viewfinder must trigger actual rendering');

const ctx={
 font:'',save(){},restore(){},beginPath(){},arc(){},fill(){},stroke(){},
 moveTo(){},lineTo(){},strokeRect(){},fillRect(){},fillText(){},
 measureText(t){
  const size=Number(this.font.match(/([0-9.]+)px/)?.[1]||12);
  return {width:Array.from(t).reduce((w,ch)=>w+(ch==='.'?0.40:ch===' '?0.34:0.62),0)*size};
 }
};
const keys=['date','counter','zoom','modeInfo','focus','play','rec','battery'];
const options={frame:true,frameSize:100,frameColor:'white',clockStart:'1995-06-16T22:28:08',
 positions:Object.fromEntries(keys.map(k=>[k,'left-top'])),
 sizes:Object.fromEntries(keys.map(k=>[k,125]))};
for(const k of keys)options[k]=true;
function overlaps(a,b,g=1){
 return a.x < b.x+b.w+g&&a.x+a.w+g>b.x&&a.y<b.y+b.h+g&&a.y+a.h+g>b.y;
}
for(const [width,height] of [[240,135],[135,240],[480,270],[270,480],[720,1280]]){
 const result=root.VHSVideoCameraOSD.draw(ctx,width,height,options,'SP',5);
 assert.equal(result.items.length,8,'All camera badges should fit '+width+'x'+height);
 for(const x of result.items){
  assert.ok(x.rect.x>=result.safe.left-.01&&x.rect.y>=result.safe.top-.01);
  assert.ok(x.rect.x+x.rect.w<=result.safe.right+.01);
  assert.ok(x.rect.y+x.rect.h<=result.safe.bottom+.01);
  for(const y of result.items)if(x!==y)assert.ok(!overlaps(x.rect,y.rect),
   x.key+' overlaps '+y.key+' on '+width+'x'+height);
 }
 assert.deepEqual(Array.from(result.items.find(x=>x.key==='date').lines).slice(0,2),
  ['16.06.1995','22:28:13'],'Date and running seconds must be separate lines');
}
options.positions.date='center-top';options.positions.rec='center-bottom';
const centered=root.VHSVideoCameraOSD.layout(ctx,1280,720,options,'SP',6);
assert.equal(centered.items.find(x=>x.key==='date').slot,'center-top');
assert.equal(centered.items.find(x=>x.key==='rec').slot,'center-bottom');
assert.equal(root.VHSVideoCameraOSD.timestamp('1995-06-16T22:28:08',60)[1],'22:29:08');
const isolatedDate={date:true,frame:true,clockStart:'1995-06-16T22:28:08',
 positions:{date:'right-bottom'},sizes:{date:20}};
const tinyDate=root.VHSVideoCameraOSD.layout(ctx,720,1280,isolatedDate,'SP',8);
const normalDate=root.VHSVideoCameraOSD.layout(ctx,720,1280,
 {...isolatedDate,sizes:{date:125}},'SP',8);
const small=tinyDate.items.find(v=>v.key==='date'),
 large=normalDate.items.find(v=>v.key==='date');
assert.ok(small&&large,'20% and 125% dates must both fit in portrait camera');
assert.ok(small.size<large.size*.35,
 '20% date must be meaningfully smaller than 125%, not clamped by an old minimum');
assert.ok(small.rect.x>=tinyDate.safe.left&&small.rect.y>=tinyDate.safe.top,
 'Tiny date must remain inside portrait viewfinder frame');

const start=app.indexOf(' const CASSETTE_FIELDS=');
const end=app.indexOf(' function setControlByTitle(',start);
assert.ok(start>0&&end>start,'Cassette functions not found');
const cassetteFunctions=app.slice(start,end);
const initial={vhsEnabled:false,filmEnabled:false,glitchEnabled:false,preset:'classic',
 master:0,mode:'vhs',modeStrength:0,tape:'used',signalWidth:'auto',
 eventDensity:0,glitchStrength:0,fxMode:'classic',music:{strength:0},speed:'SP',
 filmId:'builtin:neutral',filmStrength:0,signal:{tracking:0},glitches:{rf:0},
 audio:{enabled:false,strength:0},
 camera:{rec:true,date:true,frame:false,frameSize:100,frameColor:'white',
 positions:{date:'right-bottom'},sizes:{date:125}},
 filmDamage:{enabled:false,leak:0},selectedCassetteId:null};
const state=JSON.parse(JSON.stringify(initial)),defaults=JSON.parse(JSON.stringify(initial));
const stored=new Map(),storage={
 setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)
};
const elements={cassetteStatus:{textContent:''}};
const factory=new Function('state','defaults','recording','localStorage','CASSETTE_BACKUP_KEY',
 'window','syncCassetteUI','persist','resetFrameHistory','syncAudio','source','renderCurrentFrame','renderCassetteShelf','$',
 'let cassetteBefore=null;\n'+cassetteFunctions+
 'return{selectCassette,cancelCassette,get:()=>cassetteBefore};');
const actions=factory(state,defaults,false,storage,'vhs.cassette.backup.test',
 root,()=>{},()=>{},()=>{},()=>{},{paused:true},()=>{},()=>{},id=>elements[id]);
const tapeA={id:'one',name:'HI8',settings:{vhsEnabled:true,master:90,camera:{frame:true,date:false}}};
const tapeB={id:'two',name:'Film',settings:{vhsEnabled:false,filmEnabled:true,filmStrength:88}};
actions.selectCassette(tapeA);
assert.equal(state.selectedCassetteId,'one');
assert.equal(state.master,90);
assert.equal(state.camera.frame,true);
actions.selectCassette(tapeB);
assert.equal(state.selectedCassetteId,'two');
assert.equal(state.filmStrength,88);
actions.selectCassette(tapeB);
assert.equal(state.selectedCassetteId,null,'Tapping selected cassette must cancel');
assert.equal(state.master,0,'Deselect must restore previous VHS level');
assert.equal(state.camera.frame,false,'Deselect must restore camera frame state');
assert.equal(state.camera.date,true,'Deselect must restore prior camera OSD state');
assert.equal(state.filmEnabled,false,'Deselect must restore previous Film settings');
assert.equal(actions.get(),null,'Deselect must clear snapshot');
assert.equal(stored.size,0);
console.log('PASS: six positions, two-line clock, viewfinder safe area, no overlap, cassette toggle/undo');
