/* Event-path tests with a minimal DOM, no external browsers or packages. */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const nodes=new Map();
function make(tag='div'){
 const handlers={};
 const classes=new Set();
 let nodeId='';
 const node={
  tagName:tag.toUpperCase(),type:'',value:'',checked:false,disabled:false,
  hidden:false,textContent:'',className:'',dataset:{},style:{},children:[],
  width:480,height:270,naturalWidth:480,naturalHeight:270,
  get id(){return nodeId;},
  set id(x){nodeId=x;if(x)nodes.set(x,node);},
  classList:{
   add(x){classes.add(x);},remove(x){classes.delete(x);},
   contains(x){return classes.has(x);},
   toggle(x,on){if(on)classes.add(x);else classes.delete(x);}
  },
  addEventListener(name,fn){(handlers[name]??=[]).push(fn);},
  fire(name,event={}){for(const fn of handlers[name]||[])fn(event);},
  async click(){
   for(const fn of handlers.click||[])await fn({preventDefault(){},stopPropagation(){}});
   if(typeof this.onclick==='function')await this.onclick();
  },
  append(...items){this.children.push(...items);},
  replaceChildren(...items){this.children=[...items];},
  setAttribute(){},scrollIntoView(){},
  getBoundingClientRect(){return{left:10,top:20,width:240,height:320};},
  getContext(){
   const c=this;
   return {canvas:c,drawImage(){},fillRect(){},clearRect(){},strokeRect(){},
    save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    setLineDash(){},arc(){},fill(){},putImageData(){},
    getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(4,(w||c.width)*(h||c.height)*4))})};
  }
 };
 return node;
}
function $(id){if(!nodes.has(id)){const e=make('section');e.id=id;}return nodes.get(id);}
for(const id of ['panel-correction','panel-glitch','panel-film','panel-cassettes',
 'panel-masks','panel-camera','panel-batch','extrasStatus','photoHelpToggle'])$(id);
$('panel-masks').classList.add('active');
const root={};
const document={createElement:tag=>make(tag),getElementById:$,body:{classList:make().classList}};
const ctx={window:root,document,Date,Math,Number,Array,Object,Map,
 Uint8Array,Uint8ClampedArray,crypto:{getRandomValues(a){a[0]=1234;return a;}},
 setTimeout,URL:{createObjectURL:()=>'',revokeObjectURL(){}},Image:class{},console};
vm.runInNewContext(fs.readFileSync('photo-extras-core.js','utf8'),ctx);
vm.runInNewContext(fs.readFileSync('photo-extras-ui.js','utf8'),ctx);
root.VHSVideoFaceAI={async create(){return {async detect(){return[
 {boundingBox:{x:10,y:15,width:35,height:40}},
 {boundingBox:{x:65,y:33,width:30,height:41}},
 {boundingBox:{x:120,y:58,width:28,height:35}}
];}}}};
const state={
 extras:root.VHSPhotoExtras.defaults(),
 extraCamera:{counter:false,modeInfo:false,focus:false,frame:false},
 camera:{},vhsEnabled:true,filmEnabled:false,master:65,preset:'VHS 90s',
 signal:{tapeSpeed:'SP'},film:{},edgeBurn:{}
};
let original={naturalWidth:200,naturalHeight:160},changes=0;
const editor=root.VHSPhotoExtrasUI.mount({
 state,onChange:()=>changes++,getOriginal:()=>original,
 onMaskChange:()=>changes++,saveFile:()=>{},
 onSetSnapshot(snapshot){Object.assign(state,snapshot);}
});
assert.ok($('correction-brightness'),'Must render brightness slider');
assert.ok($('correction-dehaze'),'Must render dehaze slider');
assert.ok($('extraGlitch-datamosh'),'Must render digital breakdown');
assert.ok($('extraCameraMode'),'Must render camera mode selection');
assert.ok($('photoCamera-counter'),'Must render new camera counter');
assert.equal(nodes.has('photoCamera-zoom'),false,'No zoom button in camera panel');
$('correction-brightness').value='35';
$('correction-brightness').fire('input');
assert.equal(state.extras.correction.brightness,35);
assert.ok(changes>0,'Sliders must propagate to the real photo render callback');
$('extraGlitch-rf').value='80';$('extraGlitch-rf').fire('input');
assert.equal(state.extras.glitch.effects.rf,80);
assert.equal(state.extras.glitch.enabled,true);
function findByText(node,text){
 if(node.textContent===text)return node;
 for(const child of node.children||[]){const found=findByText(child,text);if(found)return found;}
 return null;
}
await findByText($('panel-masks'),'✎ Рисовать').click();
const stage=$('photoMaskStage');
const touch=(x,y)=>({clientX:x,clientY:y});
const event=(x,y,done=false)=>({touches:done?[]:[touch(x,y)],changedTouches:[touch(x,y)],
 preventDefault(){this.prevented=true;},stopPropagation(){}});
stage.fire('touchstart',event(32,59));
stage.fire('touchmove',event(132,194));
stage.fire('touchend',event(150,222,true));
assert.equal(state.extras.masks.strokes.length,1,'iPhone finger gesture must save a stroke');
assert.ok(state.extras.masks.strokes[0].points.length>=2);
await findByText($('panel-masks'),'▤ Обвести лицо').click();
stage.fire('touchstart',event(40,60));
stage.fire('touchmove',event(120,178));
stage.fire('touchend',event(120,178,true));
assert.equal(state.extras.masks.faces.length,1,'Manual face box must save');
await findByText($('panel-masks'),'◎ Найти все лица на фото').click();
assert.equal(state.extras.masks.faces.filter(x=>x.auto).length,3,
 'Face engine must keep all three people, not only the first');
assert.equal(state.extras.masks.faces.length,4,
 'Automatic search must keep manually selected faces');
assert.match($('photoMaskStatus').textContent,/Найдено лиц: 3/);
await $('photoHelpToggle').click();
assert.equal(state.extras.showHelp,true);
assert.ok(editor.refresh&&editor.markDirty);
console.log('PASS: UI mounts, sliders change settings, native finger stroke, manual box, three-face search, camera without ZOOM');
