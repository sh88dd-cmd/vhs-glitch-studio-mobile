/* Real reset-and-undo functions extracted from app.js and executed with
 * hydrated state. Prevents recurrence of the old permanent all-effects bypass.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app=fs.readFileSync('app.js','utf8');
const begin=app.indexOf('  function syncLegacyControls(){');
const end=app.indexOf('  async function init(){',begin);
assert.ok(begin>=0&&end>begin,'Actual reset functions must be in app.js');
const window={VHSPhotoPolaroid:{defaults:()=>({
 enabled:false,style:'classic',look:'soft',strength:55,paperWear:22,
 surface:'matte',frameSize:100,bottomHeight:100,note:'',background:'studio'}),
 hydrate:cfg=>({...window.VHSPhotoPolaroid.defaults(),...cfg})}};
const doc={createElement:()=>({})};
const c={window,document:doc,Math,Number,Object,Array,Date,Uint8ClampedArray};
vm.runInNewContext(fs.readFileSync('photo-extras-core.js','utf8'),c);
const X=window.VHSPhotoExtras;
const defaults={
 vhsEnabled:true,filmEnabled:false,preset:'VHS 90s',master:65,
 fx:{hiss:74},signal:{tapeSpeed:'SP'},film:{name:'Default'},
 camera:{date:{on:false},rec:{on:false},play:{on:false},battery:{on:false}},
 edgeBurn:{enabled:false,side:'random',strength:90,width:35,roughness:75,scratches:38,seed:2},
 extraCamera:{counter:false,modeInfo:false,focus:false,frame:false,positions:{},sizes:{}},
 extras:X.defaults(),legacyVhs:false,allFxOff:false
};
const clone=v=>JSON.parse(JSON.stringify(v));
const state=clone(defaults);
const polaroid=state.extras.polaroid,extras=state.extras,camera=state.extraCamera,edge=state.edgeBurn;
state.allFxOff=true; // A user still has the poisoned v1.2 saved setting.
state.vhsEnabled=true;state.filmEnabled=true;
state.extras.polaroid.enabled=true;state.extras.polaroid.style='aged';
state.extras.glitch.enabled=true;state.extras.glitch.effects.tapeChew=90;
state.extras.cassettes=[{id:'custom-1',name:'Моя кассета',settings:{}}];
state.extras.selectedCassetteId='custom-1';
state.extras.masks.faces=[{x:.1,y:.1,w:.15,h:.2}];
const elems=new Map();
const $=id=>{
 if(!elems.has(id))elems.set(id,{
  disabled:false,value:'',checked:false,
  replaceChildren(){},querySelectorAll(){return[];}
 });
 return elems.get(id);
};
let saved=0,drawn=0;
const mocks={
 window,state,defaults,clone,$,resetUndo:null,xmpProfiles:[],
 mountControls(){},renderFilmPage(){},renderFavoritesPage(){},
 photoExtrasUI:{refresh(){}},photoPolaroidUI:{refresh(){}},
 persist(){saved++;},schedulePreview(){drawn++;},notify(){},
 activeLook:null
};
const block=app.slice(begin,end);
const evaluate=vm.runInNewContext(block+
 '\n;globalThis.runActual={resetAllPhotoEffects,undoAllPhotoReset,applySessionSettings};',
 mocks);
const {resetAllPhotoEffects,undoAllPhotoReset,applySessionSettings}=mocks.runActual;
resetAllPhotoEffects();
assert.equal(state.allFxOff,false,'Reset must permanently disable old bypass');
assert.equal(state.vhsEnabled,false,'Reset must disable VHS settings');
assert.equal(state.filmEnabled,false,'Reset must disable FILM settings');
assert.equal(state.extras.glitch.enabled,false);
assert.equal(state.extras.polaroid.enabled,false,'Reset must remove instant film frame');
assert.equal(state.extras.masks.faces.length,0,'Reset must clear photo face masks');
assert.equal(state.extras.selectedCassetteId,null);
assert.equal(state.extras.cassettes.length,1,'User cassette library must survive');
assert.equal(state.extras,extras,'Reset must preserve the UI state object identity');
assert.equal(state.extras.polaroid,polaroid,'Polaroid UI reference must survive reset');
assert.equal(state.extraCamera,camera,'Camera UI reference must survive reset');
assert.equal(state.edgeBurn,edge,'Film edge burn UI reference must survive reset');
assert.equal($('undoPhotoFxReset').disabled,false);
assert.ok(saved>0&&drawn>0,'Reset should persist and update the photo immediately');

// Simulate selecting a fresh cassette AFTER clearing all effects.
const cassette=clone(defaults);
cassette.vhsEnabled=true;cassette.master=81;
cassette.extras.glitch.enabled=true;
cassette.extras.glitch.effects.dropouts=67;
cassette.extras.polaroid.enabled=true;
applySessionSettings(cassette);
assert.equal(state.vhsEnabled,true,'Fresh cassette must work after reset');
assert.equal(state.extras.glitch.effects.dropouts,67);
assert.equal(state.extras.polaroid.enabled,true);
assert.equal(state.allFxOff,false,'A fresh cassette cannot become bypassed again');
assert.equal(state.extras.cassettes.length,1,'New cassette must not erase stored library');
undoAllPhotoReset();
assert.equal(state.allFxOff,false,'Undo must not revive old persistent bypass');
assert.equal(state.extras.polaroid.enabled,true,'Undo restores the previous Polaroid style');
assert.equal(state.extras.selectedCassetteId,'custom-1');
assert.equal($('undoPhotoFxReset').disabled,true);
console.log('PASS: real app reset clears active effects but keeps library, new cassettes work, undo restores values without bypass');
