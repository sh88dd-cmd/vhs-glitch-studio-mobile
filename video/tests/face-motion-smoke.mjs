/* Confidence-gated independent movement: faces may not slide onto scenery. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root={};
const scratch={width:1,height:1,getContext(){return{}}};
vm.runInNewContext(fs.readFileSync('video/creative-engine.js','utf8'),{
 window:root,document:{createElement:()=>scratch},
 Uint8Array,Math,Number,Object,Array,Date
});
const {trackBoxes}=root.VHSVideoCreative;
const w=240,h=160;
function image(boxes){
 const d=new Uint8Array(w*h);d.fill(22);
 for(const f of boxes){
  for(let y=f.y;y<f.y+f.h;y++)for(let x=f.x;x<f.x+f.w;x++){
   const u=x-f.x,v=y-f.y;
   d[y*w+x]=70+(u*17+v*23+(u*v)%29)%168;
  }
 }
 return d;
}
const start=[
 {x:36,y:25,w:46,h:50},
 {x:145,y:82,w:41,h:42}
];
const next=[
 {...start[0],x:start[0].x+6,y:start[0].y+4},
 {...start[1],x:start[1].x-5,y:start[1].y-5}
];
const normalized=start.map((b,i)=>({
 id:'face-'+i,x:b.x/w,y:b.y/h,w:b.w/w,h:b.h/h
}));
const estimated=trackBoxes(image(start),image(next),w,h,normalized);
assert.equal(estimated.length,2);
assert.ok(Math.abs(estimated[0].x-next[0].x/w)<.018,'Face A must follow its own texture');
assert.ok(Math.abs(estimated[0].y-next[0].y/h)<.028,'Face A must follow vertically');
assert.ok(Math.abs(estimated[1].x-next[1].x/w)<.018,'Face B must track independently');
assert.ok(Math.abs(estimated[1].y-next[1].y/h)<.028,'Face B must track independently vertically');
const same=image(start);
const stable=trackBoxes(same,same,w,h,normalized);
assert.ok(stable.every((v,i)=>Math.abs(v.x-normalized[i].x)<1e-8&&
 Math.abs(v.y-normalized[i].y)<1e-8),
 'An unchanged or ambiguous frame must NEVER randomly drift');
console.log('PASS: two independently moving faces and zero random drift on unchanged frames');
