import * as T from 'three';

const normalize=s=>String(s||'').toLowerCase().replace(/строение|стр\.?|[cс]/g,'с').replace(/[\s.,]/g,'');
const addr=b=>normalize(b.number);
const street=b=>String(b.street||'').toLowerCase();
export function architectureProfile(b){
  const s=street(b),n=addr(b),name=String(b.name||'').toLowerCase();
  if(s.includes('солянка')){
    if(n==='4с4')return 'piggy';
    if(/^6(?:с1)?$/.test(n))return 'sol6';
    if(/^1\/2(?:с[12])?$/.test(n)||name.includes('купеческого общества'))return 'salt';
    if(/^7(?:с1)?$/.test(n)||name.includes('атлант'))return 'atlantes';
    if(/^2\/6(?:с1)?$/.test(n))return 'sol2';
    if(n==='8')return 'sol8';
  }
  if(Number(b.id)===39690567)return 'sol8';
  if(s.includes('маросейка')){
    if(/^4(?:\/2)?(?:с1)?$/.test(n))return 'mar4';
    if(/^2(?:\/15)?(?:с1)?$/.test(n))return 'mar2';
  }
  if(s.includes('лубянский')&&/^23(?:с1)?$/.test(n))return 'lub23';
  return null;
}
const definitions={
 piggy:{wall:0xd2c19c,trim:0xe3d9c1,base:0x77716a,frame:0x695849,roof:0x5c605e,floors:1,style:'piggy',pitch:0},
 sol6:{wall:0xc2ac83,trim:0xe6ded1,base:0x8e8273,frame:0x504137,roof:0x696962,floors:3,style:'classical',pitch:1.2,bays:6},
 salt:{wall:0xc7bfb0,trim:0xe3dace,base:0x91887e,frame:0x57483d,roof:0x55575a,floors:6,style:'classical',pitch:1.8},
 atlantes:{wall:0xd6c8b6,trim:0xe8e0d3,base:0xa19a8d,frame:0x58483c,roof:0x41474b,floors:3,style:'ornate',pitch:2.4},
 sol2:{wall:0xc8b59b,trim:0xe4d8c3,base:0x938779,frame:0x51483f,roof:0x68635e,style:'classical',pitch:1.3},
 sol8:{wall:0xb9b8b0,trim:0xcac9c1,base:0x8e8d89,frame:0x555b60,roof:0x66696b,style:'modern',pitch:0},
 mar4:{wall:0xbda18b,trim:0xe4d4be,base:0x8a7b70,frame:0x533f32,roof:0x575657,style:'shop',pitch:1.6},
 mar2:{wall:0xd6c5a7,trim:0xece1cf,base:0x978c7d,frame:0x5d4c3c,roof:0x585c5b,style:'classical',pitch:1.5},
 lub23:{wall:0xc7b0a3,trim:0xe4d9cb,base:0x91847a,frame:0x564b44,roof:0x57595b,style:'ornate',pitch:1.2}
};

// Address-specific massing and colour palettes; these are modeled approximations,
// not surveys or photographic textures. Unknown courtyards keep their OSM height.
const house=(wall,trim,style,pitch,extra={})=>({wall,trim,style,pitch,base:0x948b80,frame:0x554a40,roof:0x555c59,...extra});
const addressStyles={
 sol1:house(0xc3b6a2,0xe1d6c3,'ornate',1.1),
 sol3:house(0xd6c8aa,0xf0e8d7,'classical',1.25),
 sol4:house(0xd9c6a5,0xe6dac5,'shop',1.1),
 sol9:house(0xe0c4a1,0xf1e5ce,'classical',1.25),
 sol11:house(0xcab696,0xe8ddca,'ornate',1.25),
 sol12:house(0xd1b9a9,0xe5d9c9,'classical',1.2),
 sol13:house(0xd6c4a5,0xe6dbc8,'classical',1.25),
 sol14:house(0xe0c2ad,0xefe6d9,'classical',1.1,{roof:0x64635d}),
 sol15:house(0xd8c7a8,0xece0cb,'classical',1.3),
 sol16:house(0xa8a7a3,0xd2d1cb,'modern',0),
 mar3:house(0xd7c5a4,0xe8dec9,'ornate',1.3),
 mar5:house(0xd9ccad,0xe8dfce,'classical',1.0),
 mar6:house(0xcbbb9d,0xe7dfce,'shop',1.25),
 mar7:house(0xc4b5a0,0xe0d7c8,'ornate',1.0),
 mar9:house(0xd5c7ae,0xe6dfd1,'ornate',1.3),
 mar10:house(0xc4b5a2,0xdfd7c8,'classical',1.15),
 mar11:house(0xe0cc9e,0xf0e8d6,'classical',1.35,{roof:0x5a7264}),
 mar12:house(0xa9a49b,0xd0ccc4,'modern',0),
 mar13:house(0xc5b3a0,0xe2d4c3,'ornate',1.4),
 mar15:house(0xd8bfa6,0xf0e3d4,'classical',1.25),
 mar17:house(0xdac5a6,0xf0e5d1,'classical',1.5,{roof:0x626a5a}),
 lub3:house(0xcbbbaa,0xe7dfd1,'ornate',1.25),
 lub5:house(0xd7c9ae,0xe9dfce,'classical',1.2),
 lub7:house(0xd0b79c,0xe7d9c5,'ornate',1.2),
 lub9:house(0xc6c0b3,0xdcd9d2,'ornate',1.0),
 lub11:house(0xb9b2a8,0xe3dace,'modern',0),
 lub13:house(0xc5c2b9,0xe2e0d7,'modern',0),
 lub15:house(0xd2c0a7,0xe5dfcf,'classical',1.2),
 lub17:house(0xc4bfb3,0xdcd5c6,'ornate',.8),
 lub19:house(0xc5b29a,0xe6d9c8,'ornate',1.2),
 lub21:house(0xd8c9b1,0xe7dfd0,'classical',1.2),
 lub25:house(0xd3c0a4,0xe8ddcb,'classical',1.2),
 lub27:house(0xd0b994,0xe8ddcb,'ornate',1.2),
 slavModern:house(0xaaa8a2,0xe5e3da,'modern',0),
 slavMetall:house(0xc5b8a5,0xe2dbcd,'ornate',1.25,{roof:0x535d5d}),
 slavBusiness:house(0xcac0ab,0xe9e2d3,'ornate',1.2),
 koteln:house(0xd6cbb4,0xeee5d5,'ornate',0),
 yauza:house(0xc8b9a0,0xe6ddce,'classical',1.2),
 var:house(0xd4c6ae,0xe8dfcf,'classical',1.2),
 museum:house(0xd7c8ad,0xf0e6d3,'ornate',1.8),
 english:house(0xe6e2d7,0xf0ece0,'classical',2.1,{roof:0x547064}),
 romanov:house(0xd0b390,0xf3e7d1,'ornate',2.1,{roof:0x50725a}),
 churchKulishki:house(0xa42e29,0xf3efe0,'church',0,{roof:0xc6a03b,frame:0x5c4436}),
 churchRed:house(0xc87959,0xf1e7d6,'church',0,{roof:0x41634c}),
 churchWhite:house(0xe1ddd0,0xf1ece2,'church',0,{roof:0x626b64}),
 churchGreen:house(0xb2c4b5,0xeee8d6,'church',0,{roof:0x535b60}),
 churchPink:house(0xcda39a,0xf0e5d9,'church',0,{roof:0x656f65}),
 media:house(0xe4e2dc,0xf3f1e8,'modern',0),
 foodhall:house(0xc6c7bf,0xe2e3dc,'modern',0)
};
Object.assign(definitions,addressStyles);
function extraProfile(b){
 const s=street(b),n=addr(b),num=parseInt(n,10),name=String(b.name||'').toLowerCase(),id=Number(b.id);
 // Same footprint as Yandex's 4с4 centroid, OSM currently labels it 4с1.
 if(id===52404043)return 'piggy';
 if(id===-888887500||name.includes('политехнический музей'))return 'museum';
 if(id===-756769200||name==='медиацентр')return 'media';
 if(id===513659941)return 'foodhall';
 if(name.includes('английский двор'))return 'english';
 if(name.includes('палаты бояр романов'))return 'romanov';
 if(name.includes('всех святых на кулишках'))return 'churchKulishki';
 if(name.includes('церковь космы'))return 'churchGreen';
 if(name.includes('николая чудотворца в кленниках')||name.includes('знамение'))return 'churchRed';
 if(name.includes('храм')||name.includes('церковь')||name.includes('собор')){
   if(name.includes('георгия')||name.includes('рождества богоматери'))return 'churchPink';
   return 'churchWhite';
 }
 if(s.includes('солянка')&&Number.isFinite(num))return addressStyles['sol'+num]?'sol'+num:null;
 if(s.includes('маросейка')&&Number.isFinite(num))return addressStyles['mar'+num]?'mar'+num:null;
 if(s.includes('лубянский')&&Number.isFinite(num))return addressStyles['lub'+num]?'lub'+num:null;
 if(s.includes('варварка'))return 'var';
 if(s.includes('славянская'))return name.includes('lumin')?'slavModern':name.includes('металлург')?'slavMetall':'slavBusiness';
 if(s.includes('котельническая'))return 'koteln';
 if(s.includes('яузская'))return 'yauza';
 return null;
}


// Selected street elevations traced by hand from the municipal reference
// photographs and drawings. Counts are for the street-facing elevations,
// not universal repeats for every side of the parcel.
const survey={
 '45107167':{"wall":15131351,"trim":15789797,"base":10656913,"style":"classical","floors":3,"bays":8,"pitch":1.2,"arches":true,"reference":"Lubyansky 19 s1 municipal elevation"},
 '45107168':{"wall":14934489,"trim":15789800,"base":10328721,"style":"classical","floors":2,"bays":16,"pitch":1.3,"reference":"Lubyansky 25 s1 municipal elevation"},
 '53156453':{"wall":14729130,"trim":15786966,"base":10325635,"style":"ornate","floors":5,"bays":10,"pitch":1.2,"pilasters":true,"reference":"Lubyansky 23 s1 municipal elevation"},
 '53156454':{"wall":14799785,"trim":15590863,"base":11379596,"style":"classical","floors":2,"bays":3,"pitch":1.2,"reference":"Lubyansky 21 s1 municipal elevation"},
 '536771197':{"wall":14202285,"trim":15655638,"base":10129031,"style":"ornate","floors":5,"bays":3,"pitch":1,"pilasters":true,"reference":"Lubyansky 21 s2 municipal elevation"},
 '-725982200':{"wall":14147284,"trim":15921382,"base":7568757,"frame":5860449,"style":"modern","floors":4,"bays":9,"pitch":0,"wideGlass":true,"reference":"Maroseika 3/13 s1 municipal elevation"},
 '-725980600':{"wall":14733488,"trim":15656920,"base":9799290,"style":"ornate","floors":4,"bays":8,"pitch":1.2,"rusticated":true,"arches":true,"reference":"Maroseika 9/2 s1 municipal elevation"},
 '-725980000':{"wall":14268078,"trim":15853279,"base":10260875,"style":"ornate","floors":3,"bays":8,"pitch":1.4,"pilasters":true,"reference":"Maroseika 15 municipal elevation"},
 '-456779400':{"wall":12434870,"trim":15197402,"base":8618622,"style":"classical","floors":3,"bays":7,"pitch":1.25,"arches":true,"columns":true,"reference":"Maroseika 2/15 municipal elevation"},
 '-53294400':{"wall":11583661,"trim":15264734,"base":9147524,"style":"classical","floors":4,"bays":17,"pitch":1.1,"pilasters":true,"reference":"Lubyansky 5 s1 municipal elevation"},
 '-864254300':{"wall":14207405,"trim":15525077,"base":10457473,"style":"classical","floors":3,"bays":11,"pitch":1.2,"arches":true,"reference":"Lubyansky 7 s1 municipal elevation"},
 '-1048556500':{"wall":11126968,"trim":14279898,"base":9148814,"style":"modern","floors":5,"bays":5,"pitch":0,"wideGlass":true,"reference":"Lubyansky 9 s1 municipal elevation"},
 '-1048556300':{"wall":14078667,"trim":15328733,"base":8549225,"style":"modern","floors":6,"bays":10,"pitch":0,"reference":"Lubyansky 11/1 municipal elevation"},
 '-846940600':{"wall":14866104,"trim":15394008,"base":11045718,"style":"classical","floors":4,"bays":8,"pitch":1.2,"arches":true,"reference":"Lubyansky 15 s2 municipal elevation"},
 '-1955883400':{wall:0xe2d5b0,trim:0xece8da,base:0x574c43,frame:0x675e55,roof:0x666762,style:'classical',floors:2,bays:9,pitch:1.5,doors:[3,6],signs:['ДЖАТИ ХНАТ','BURGER HEROES','МОРЯК И ЧАЙКА'],reference:'Maroseika 4/2, sheet 24'},
 '-762779300':{wall:0xd6c799,trim:0xece3cb,base:0x9a9082,frame:0x755c45,style:'classical',floors:2,bays:12,pitch:1.45,doors:[0,10,11],rusticated:true,reference:'Maroseika 6–8, sheet 21'},
 '-762779400':{wall:0xc4c6ad,trim:0xe3dfca,base:0x958d7b,frame:0x634e42,style:'classical',floors:2,bays:6,pitch:1.4,arches:true,doors:[],reference:'Maroseika 6–8, sheet 21'},
 '-53294600':{wall:0xa9a498,trim:0xc5c0b5,base:0x938b7f,frame:0xe2ded4,style:'modern',bays:9,pitch:0,wideGlass:true,reference:'Maroseika 7/8, sheet 5'},
 '-725980100':{wall:0xe1dccb,trim:0xede8dc,base:0xbcb4a5,frame:0x755c47,style:'classical',floors:2,bays:13,pitch:1.5,arches:true,doors:[6],rusticated:true,rosettes:true,reference:'Maroseika 11/4, sheet 9'},
 '-781210600':{wall:0xb8ada1,trim:0xc9bdb2,base:0x787775,frame:0x80624f,style:'ornate',bays:7,pitch:.7,arches:true,doors:[3],rusticated:true,columns:true,reference:'Maroseika 12, sheet 16'},
 '-725979700':{wall:0x9fbfc5,trim:0xe3dfd6,base:0x999b98,frame:0x6b453c,roof:0x78504b,style:'ornate',floors:2,bays:7,pitch:1.55,doors:[],pilasters:true,reference:'Maroseika 17/6 s4, sheet 13'},
 '-1048556600':{wall:0xab6157,trim:0xd2cbb7,base:0x9d9581,frame:0x7c4c32,roof:0x5c6a66,style:'church',floors:1,bays:3,pitch:0,arches:true,doors:[1],reference:'Lubyansky 9 s2, sheet 9'},
 '-1219882900':{wall:0xd4c3ab,trim:0xe7ddcd,base:0x9e9384,frame:0x654f3d,style:'ornate',floors:3,pitch:1.8,arches:true,columns:true,rusticated:true,reference:'Solyanka 7, 2019 heritage examination'},
 '52392182':{wall:0xe0d1ad,trim:0xece2cd,base:0x978b7b,frame:0x604d3e,style:'classical',floors:2,pitch:1.35,reference:'Solyanka 2/6, historic corner house'},
 '52387381':{wall:0xdac2ab,trim:0xeee2d2,base:0x9c8c80,style:'ornate',floors:2,pitch:1.2,rusticated:true,pilasters:true,reference:'Solyanka 11/6, municipal elevation'},
 '-1736197700':{wall:0xe2c6ae,trim:0xf0e5d6,base:0x9d8c7e,style:'classical',floors:3,pitch:1.3,rusticated:true,reference:'Solyanka 12–14, heritage examination 2024'}
};

const generic=[
 {wall:0xcdbb9c,trim:0xe5dcca,base:0x968b7d,frame:0x57473a,roof:0x5a5b58,style:'classical',pitch:1.1},
 {wall:0xc1c4b7,trim:0xe1e0d2,base:0x919287,frame:0x5b5a50,roof:0x606967,style:'classical',pitch:1.4},
 {wall:0xb9a18d,trim:0xe1d3c0,base:0x887e73,frame:0x523d32,roof:0x68625b,style:'shop',pitch:1.6},
 {wall:0xd3c7b8,trim:0xe7dfd4,base:0x96918a,frame:0x625b54,roof:0x626568,style:'ornate',pitch:1.3},
 {wall:0xa8aba8,trim:0xc9c9c3,base:0x7d8281,frame:0x475458,roof:0x6a6c6e,style:'modern',pitch:0},
 {wall:0xc8ae99,trim:0xe4d8c6,base:0x9a8778,frame:0x605045,roof:0x62615b,style:'classical',pitch:1.5}
];
function hash(b){return [...String(b.id)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);}
export function createArchitecture({scene,staticMeshes,box,mat,cityMap,roadPaths,nearPath,photoFacades=new Map()}){
  const palette=new Map(),signs=new Map(),windowMats=new Map(),facadeMats=new Map(),atlasIds=new Set(),archMats=new Map();
  
  // Shared fine plaster/stone normal map for all solid trim and wall materials.
  const grain=document.createElement('canvas');grain.width=grain.height=128;
  const gc=grain.getContext('2d'),gi=gc.createImageData(128,128);
  let gs=18687;for(let i=0;i<gi.data.length;i+=4){gs=(Math.imul(gs,1664525)+1013904223)>>>0;const n=(gs>>>24)%24-12;gi.data[i]=128+n;gi.data[i+1]=128-n;gi.data[i+2]=253;gi.data[i+3]=255}gc.putImageData(gi,0,0);
  const normal=new T.CanvasTexture(grain);normal.wrapS=normal.wrapT=T.RepeatWrapping;normal.repeat.set(3,3);
  const M=(c,rough=.85,metal=0)=>{const key=c+':'+rough+':'+metal;if(!palette.has(key)){const m=mat(c,rough,metal);if(rough>.75){m.normalMap=normal;m.normalScale.set(.38,.38)}palette.set(key,m)}return palette.get(key)};

  const dark=M(0x393c38,.8),metal=M(0x494d4b,.5,.4),gold=M(0xbca04c,.65),iron=M(0x34352e,.6,.3);
  // OSM sometimes has the footprint but not an address tag. The baked reference
  // position is the business location; choose the containing or nearest footprint.
  const reference=cityMap.places.find(p=>p.name.includes('Piggy'));
  const bounds=cityMap.bounds,bbox=cityMap.bbox;
  const ref=Array.isArray(bounds)&&bounds.length===4&&Array.isArray(bbox)&&bbox.length===4?(()=>{
    const [south,west,north,east]=bbox,lat=55.753706,lon=37.637219;
    const u=(lon-west)/(east-west),v=(lat-south)/(north-south);
    const [sw,se,,nw]=bounds;
    return [sw[0]+(se[0]-sw[0])*u+(nw[0]-sw[0])*v,sw[1]+(se[1]-sw[1])*u+(nw[1]-sw[1])*v];
  })():reference?.position;
  function contains(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
  function distance(p,ring){let best=Infinity;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz))}return best}
  function area(r){return Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2}
  // Yandex's building centroid 55.753706,37.637219 is ~7.4 m east and 1.6 m south
  // of the earlier business pin. Transform geographic displacement using the map's
  // baked local north/east basis, which can be rotated relative to the game axes.
  const candidates=ref?cityMap.buildings.map(b=>({b,d:distance(ref,b.points),inside:contains(ref,b.points)&&!(b.holes||[]).some(r=>contains(ref,r)),area:area(b.points)})).filter(x=>x.d<22||x.inside):[];
  const mainPig=cityMap.buildings.find(b=>architectureProfile(b)==='piggy'||Number(b.id)===52404043)||
    candidates.filter(x=>x.area>35&&x.area<1800&&x.b.height<16).sort((a,b)=>(a.inside?-20:a.d)+(a.b.heightSource==='estimate'?0:Math.abs(a.b.height-5.4)*.65)-(b.inside?-20:b.d)-(b.b.heightSource==='estimate'?0:Math.abs(b.b.height-5.4)*.65))[0]?.b;
  if(!mainPig)throw Error('Piggy footprint not located');
  const profile=b=>b.id===mainPig.id?'piggy':architectureProfile(b)||extraProfile(b);
  const config=b=>{const d=definitions[profile(b)]||generic[hash(b)%generic.length],s=survey[b.id];return s?{...d,...s}:d};
  // Keep surveyed OSM heights. Correct documented storeys where height was only guessed.
  for(const b of cityMap.buildings){
    const k=profile(b),d=config(b);
    if(k==='piggy')b.height=5.65;
    else if(Number(b.id)===52404042)b.height=10.6; // estimated from supplied street-level photographs
    else if(d.floors&&(!b.heightSource||b.heightSource==='estimate'||Math.abs(b.height/3.25-d.floors)>1))b.height=d.floors*3.55+.5;
  }
  
  function material(b){return M(config(b).wall,.92)}
  const color=c=>'#'+c.toString(16).padStart(6,'0');
  function floorCount(b,d){return d.floors||Math.max(1,Math.min(18,Math.round(b.height/(d.style==='modern'?3.15:3.5))))}
  // Every wall receives a façade at initial load. No blank building shell waits for streaming.
  // One shared repeated bay per palette / floor count, not 915 individual textures.
  function facadeMaterial(b){
    const d=config(b),floors=floorCount(b,d),key=[d.wall,d.trim,d.style,floors].join(':');if(d.style==='piggy')return material(b);
    if(facadeMats.has(key))return facadeMats.get(key);
    const t=texture(128,Math.min(1024,128*floors),(c,w,h)=>{
      const fh=h/floors,modern=d.style==='modern',church=d.style==='church';
      c.fillStyle=color(d.wall);c.fillRect(0,0,w,h);
      // subtle vertical plaster variation and shadowed masonry, not random brick on stucco.
      let seed=19027;for(let i=0;i<3000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%w;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed%h;c.fillStyle=i%3?'#ffffff0b':'#0000000d';c.fillRect(x,y,1+i%3,1+i%2)}
      for(let row=0;row<floors;row++){
        const y=row*fh,ground=row===floors-1,shop=ground&&!church&&!modern;
        if(ground){c.fillStyle=color(d.base);c.fillRect(0,y+fh*.80,w,fh*.20);}
        if(!modern){c.fillStyle=color(d.trim);c.fillRect(0,y+2,w,Math.max(3,fh*.035));if(row===0||ground)c.fillRect(0,y+7,w,3)}
        const ww=d.wideGlass?100:shop?82:modern?76:54,wh=fh*(shop?.66:church?.51:.59),xx=(w-ww)/2,yy=y+fh*.14;
        if(!modern){c.fillStyle=color(d.trim);c.fillRect(xx-7,yy-6,ww+14,wh+12);if(d.style==='ornate'&&!ground){c.beginPath();c.moveTo(xx-10,yy-6);c.lineTo(w/2,yy-15);c.lineTo(xx+ww+10,yy-6);c.closePath();c.fill()}}
        c.fillStyle='#4b4842';c.fillRect(xx-2,yy-2,ww+4,wh+4);
        const gr=c.createLinearGradient(xx,yy,xx+ww,yy+wh);gr.addColorStop(0,'#869aa0');gr.addColorStop(.4,'#576970');gr.addColorStop(1,'#303d42');c.fillStyle=gr;c.fillRect(xx,yy,ww,wh);
        c.fillStyle=color(d.frame);c.fillRect(xx+ww/2-2,yy,4,wh);c.fillRect(xx,yy+wh*.35,ww,3);
        c.fillStyle='#e4e6d82a';c.fillRect(xx+4,yy+5,ww*.34,wh*.68);
        if(!modern){c.fillStyle=color(d.trim);c.fillRect(xx-10,yy+wh+5,ww+20,5);c.fillStyle='#00000024';c.fillRect(xx-8,yy+wh+10,ww+16,3)}
      }
      c.fillStyle=color(d.trim);c.fillRect(0,0,w,5);
    });t.wrapS=T.RepeatWrapping;t.wrapT=T.ClampToEdgeWrapping;
    const m=new T.MeshStandardMaterial({map:t,roughness:.87});facadeMats.set(key,m);return m;
  }
  function mapWalls(b,g,record=true){
    const uv=g.attributes.uv,p=g.attributes.position,d=config(b);let mapped=0;
    // ExtrudeGeometry side walls are non-indexed quads (two triangles).
    for(const group of g.groups){if(group.materialIndex!==1)continue;
      for(let i=group.start;i+5<group.start+group.count;i+=6){
        let ax=p.getX(i),az=p.getZ(i),bx=ax,bz=az,dist=0;
        for(let j=i+1;j<i+6;j++){const x=p.getX(j),z=p.getZ(j),l=Math.hypot(x-ax,z-az);if(l>dist){dist=l;bx=x;bz=z}}
        if(dist<.001)continue;mapped++;
        const dx=(bx-ax)/dist,dz=(bz-az)/dist,bays=Math.max(1,Math.round(dist/(d.style==='modern'?2.15:2.85)));
        for(let j=i;j<i+6;j++){const u=((p.getX(j)-ax)*dx+(p.getZ(j)-az)*dz)/dist*bays;uv.setXY(j,u,Math.max(0,Math.min(1,p.getY(j)/b.height)))}
      }
    }uv.needsUpdate=true;if(mapped>0&&record)atlasIds.add(b.id);
  }

  function texture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=2;return t}
  function windowMaterial(color,variant,shop=false){
    const key=color+':'+variant+':'+shop;if(windowMats.has(key))return windowMats.get(key);
    const t=texture(128,192,(c,w,h)=>{
      const grad=c.createLinearGradient(0,0,w,h);grad.addColorStop(0,['#748a98','#87949c','#66737a'][variant%3]);grad.addColorStop(.52,'#3d4e55');grad.addColorStop(1,'#242c2d');c.fillStyle=grad;c.fillRect(0,0,w,h);
      c.fillStyle='rgba(210,224,226,.12)';c.beginPath();c.moveTo(5,8);c.lineTo(80,8);c.lineTo(125,115);c.lineTo(125,147);c.closePath();c.fill();
      if(shop){c.fillStyle='#94856b';c.fillRect(6,133,116,11);for(let i=0;i<5;i++){c.fillStyle=['#c1ae83','#70604c','#a29c83'][i%3];c.fillRect(10+i*22,144-(i%3)*5,15,30+(i%3)*5)}}
      else if(variant===2){c.fillStyle='#d0c8b09b';c.fillRect(9,8,37,160);c.fillRect(83,8,36,160)}
      c.fillStyle='#'+color.toString(16).padStart(6,'0');c.fillRect(0,0,w,6);c.fillRect(0,h-6,w,6);c.fillRect(0,0,6,h);c.fillRect(w-6,0,6,h);c.fillRect(w/2-3,0,6,h);c.fillRect(0,shop?44:65,w,5);
      c.strokeStyle='#dce1db38';c.strokeRect(7,7,w-14,h-14);
    });const m=new T.MeshStandardMaterial({map:t,roughness:.43,metalness:.1});windowMats.set(key,m);return m;
  }
  function quad(m,center,angle,w,h){const o=new T.Mesh(new T.PlaneGeometry(w,h),m);o.position.set(...center);o.rotation.y=angle;o.receiveShadow=true;scene.add(o);staticMeshes.push(o);return o}
  function signMaterial(s,bg,fg){const key=s+bg+fg;if(signs.has(key))return signs.get(key);const t=texture(512,96,(c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font='bold 39px Georgia, serif';c.fillText(s,w/2,h/2,w-18)});const m=new T.MeshStandardMaterial({map:t,roughness:.85});signs.set(key,m);return m}
  function edges(b){
    const pts=b.points;let signed=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];signed+=p[0]*q[1]-q[0]*p[1]}
    const out=[];for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length],dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz);if(l<.2)continue;const tx=dx/l,tz=dz/l,nx=(signed>0?1:-1)*tz,nz=(signed>0?-1:1)*tx;out.push({p,q,l,tx,tz,nx,nz,rot:Math.atan2(-tz,tx),angle:Math.atan2(nx,nz)})}return out;
  }
  function frontEdge(b,es){
    if(Number(b.id)===52404043){const p=b.points[0],q=b.points[1];const exact=es.find(e=>e.p===p&&e.q===q);if(exact)return exact;}
    let best=null,score=Infinity;const target=profile(b)==='piggy'?'солянка':street(b),preferred=roadPaths.filter(o=>target&&String(o.r.name||'').toLowerCase().includes(target));
    const major=preferred.filter(o=>!['path','footway','steps','service','cycleway'].includes(o.r.type));
    const roads=major.length?major:preferred.length?preferred:roadPaths.filter(o=>!['path','footway','steps','service','cycleway'].includes(o.r.type));
    for(const e of es){if(e.l<5)continue;const x=(e.p[0]+e.q[0])/2+e.nx,z=(e.p[1]+e.q[1])/2+e.nz;let d=Infinity;
      for(const {r,path} of roads){const n=nearPath(path,x,z).distance,nOutside=nearPath(path,x+e.nx*2,z+e.nz*2).distance;d=Math.min(d,n-(r.width||0)*.35+(nOutside>n+.5?14:0))}
      const v=d-e.l*.20;if(v<score){score=v;best=e}}
    return best||es.slice().sort((a,b)=>b.l-a.l)[0];
  }
  function kit(e){
    const {p,l,tx,tz,nx,nz,rot,angle}=e;
    const panel=(m,u,y,w,h,d=.12,off=.09)=>{if(w<=.015||h<=.015)return;const o=box(m,p[0]+tx*u+nx*off,y,p[1]+tz*u+nz*off,w,h,d);o.rotation.y=rot;return o};
    const face=(m,u,y,w,h,off=.17)=>quad(m,[p[0]+tx*u+nx*off,y,p[1]+tz*u+nz*off],angle,w,h);
    const line=(m,u,y,w,h,d=.12)=>panel(m,u,y,w,h,d,d*.46);
    // Translate left-to-right as viewed from the street, regardless of OSM ring order.
    const fromLeft=f=>tx*nz-tz*nx>0?l*f:l*(1-f);
    return {panel,face,line,fromLeft};
  }
  function cornice(k,e,h,trim){k.line(trim,e.l/2,h-.23,e.l+.08,.20,.22);k.line(trim,e.l/2,h-.06,e.l+.13,.12,.32);k.line(trim,e.l/2,h+.08,e.l+.15,.13,.40)}
  function window(k,u,y,w,h,trim,frame,variant,ornate=false,shop=false){
    k.panel(trim,u,y,w+.22,h+.20,.11,.06);
    k.panel(dark,u,y,w+.035,h+.035,.08,.125);
    k.face(windowMaterial(frame,variant,shop),u,y,w,h,.18);
    k.panel(trim,u,y-h/2-.075,w+.32,.12,.29,.12);
    if(ornate)k.panel(trim,u,y+h/2+.12,w+.36,.13,.24,.13);
  }
  
  function archWindow(k,u,y,w,h,trim,frame,shop=false){
    const key=frame+':'+shop;
    let am=archMats.get(key);
    if(!am){
      const t=texture(128,192,(c,W,H)=>{
        c.clearRect(0,0,W,H);const x=64,top=10,r=52,y=top+r;
        c.beginPath();c.moveTo(12,H-5);c.lineTo(12,y);c.arc(x,y,r,Math.PI,0);c.lineTo(116,H-5);c.closePath();
        c.fillStyle='#514940';c.fill();c.save();c.clip();
        const grad=c.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#9eacae');grad.addColorStop(.45,'#697a80');grad.addColorStop(1,'#343e42');c.fillStyle=grad;c.fillRect(18,16,W-36,H-26);
        c.fillStyle=color(frame);c.fillRect(61,12,6,H);c.fillRect(18,64,92,5);c.fillRect(18,121,92,5);if(shop){c.fillRect(35,70,4,116);c.fillRect(89,70,4,116)}
        c.restore();
      });am=new T.MeshStandardMaterial({map:t,transparent:true,alphaTest:.1,roughness:.44});archMats.set(key,am);
    }
    const ry=Math.min(w*.50,h*.4),bottom=y-h*.5,sy=bottom+h-ry;
    k.panel(trim,u-w*.54,(sy+bottom)/2,.17,sy-bottom,.16,.12);k.panel(trim,u+w*.54,(sy+bottom)/2,.17,sy-bottom,.16,.12);
    for(let i=0;i<11;i++){const theta=Math.PI*(i+.5)/11,ux=u+Math.cos(theta)*w*.54,hy=sy+Math.sin(theta)*ry;
      const o=k.panel(trim,ux,hy,.20,.16,.16,.13);if(o)o.rotateZ(theta-Math.PI/2)}
    k.face(am,u,y,w,h,.18);
    k.panel(trim,u,bottom-.06,w+.28,.10,.23,.13);
  }
  function door(k,u,y,w,h,trim,frame){k.panel(trim,u,y,w+.30,h+.20,.13,.07);k.panel(dark,u,y,w,h,.12,.13);k.face(windowMaterial(frame,0,true),u,y+.12,w-.13,h-.35,.20);k.panel(metal,u+.15,y-.14,.035,.25,.08,.25)}
  function gable(k,u,y,w,h,trim){
    for(const [delta,dep] of [[0,.18],[.12,.25],[.23,.32]]){
      for(const side of [-1,1]){
        const o=k.panel(trim,u+side*w*.24,y+h*.51+delta,w*.53,.115,dep,.13);
        if(o)o.rotateZ(-side*Math.atan2(h,w*.48));
      }
    }
  }
  function piggy(e,k,b,front,trim,base){
    const l=e.l,h=b.height,frame=0x534840;
    k.line(base,l/2,.44,l,.88,.19);cornice(k,e,h,trim);k.line(trim,l/2,3.18,l,.16,.24);k.line(trim,l/2,3.38,l,.12,.29);
    if(!front){const count=Math.max(1,Math.floor(l/3.7));for(let j=0;j<count;j++)window(k,(j+.5)*l/count,1.91,Math.min(1.65,l/count*.60),2.08,trim,frame,j%3,false,true);return}
    const from=k.fromLeft,sections=[{f:.27,title:'БРАТЬЯ КАРАВАЕВЫ'},{f:.68,title:'ПИГГИ · PIGGY'}];
    const gray=M(0x6f706d),plinth=M(0x77756d),flower=M(0x4d633a),red=M(0x9e4140);
    k.line(plinth,l/2,.43,l,.86,.13);k.line(trim,l/2,3.25,l,.22,.33);k.line(trim,l/2,3.52,l,.14,.42);
    for(const {f,title} of sections){
      const u=from(f),span=l*.33,w=Math.min(1.45,span*.23);
      door(k,u,1.51,w,2.51,trim,frame);
      for(const side of [-1,1]){
        const x=u+side*span*.31;window(k,x,1.89,Math.min(1.42,span*.24),2.02,trim,frame,side===1?1:2,false,true);
        k.panel(gray,x,.81,1.04,.26,.38,.31);k.panel(flower,x,1.05,.94,.30,.33,.32);
        for(let j=-2;j<=2;j++)k.panel(red,x+j*.15,1.24,.08,.085,.10,.43);
      }
      k.face(signMaterial(title,'#c8bfaa','#48433c'),u,2.98,span,.40,.25);
      for(let i=0;i<4;i++)k.panel(gray,u,.055+i*.09,w+.70,.11,.27,.85-i*.18);
      for(const s of [-1,1]){for(const y of [.32,.76])k.panel(iron,u+s*(w*.5+.22),y,.05,.67,.05,.63);k.panel(iron,u+s*(w*.5+.22),.81,.065,.07,.84,.65)}
      for(const s of [-1,1]){k.panel(iron,u+s*span*.24,3.18,.05,.05,.46,.32);k.panel(iron,u+s*span*.24,3.08,.18,.16,.17,.52)}
      gable(k,u,3.65,span*.93,.73,trim);
      const semi=texture(128,64,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#ded9cd';c.beginPath();c.arc(w/2,h,w*.42,Math.PI,Math.PI*2);c.lineTo(w/2+w*.42,h);c.fill()});
      const sm=new T.MeshStandardMaterial({map:semi,transparent:true,alphaTest:.05,roughness:.9});k.face(sm,u,3.95,span*.40,.55,.22);
    }
    for(const f of [.06,.47,.92]){const u=from(f),w=Math.min(2.65,l*.15);k.panel(trim,u,4.70,w+.18,.84,.13,.075);k.panel(gold,u,4.70,w,.69,.08,.16)}
    for(const f of [.025,.975])k.panel(trim,from(f),h/2,.20,h-.18,.20,.12);
    // The right corner is a real side entrance, not a fictitious third main door.
    k.face(signMaterial('КУЛЬТУРА','#a44e45','#f1e5d2'),from(.90),2.77,l*.12,.28,.25);
    window(k,from(.90),1.85,Math.min(1.2,l*.06),1.83,trim,frame,1,false,true);
    k.panel(metal,from(.88),h/2,.10,h,.10,.27);
    // The gold pig sign visible above the right-hand cornice in the CC0 photo.
    const u=from(.92),v=new T.Vector3(e.p[0]+e.tx*u+e.nx*.24,4.23,e.p[1]+e.tz*u+e.nz*.40),g=new T.Group(),m=M(0xc49544,.4,.58);
    function ell(x,y,z,sx,sy,sz){const o=new T.Mesh(new T.SphereGeometry(1,12,8),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);g.add(o);}
    ell(0,.25,0,.42,.28,.22);ell(-.36,.30,0,.23,.22,.18);ell(-.55,.27,0,.14,.09,.12);
    for(const x of [-.23,.24])for(const z of [-.13,.13])ell(x,.03,z,.06,.14,.065);
    ell(-.30,.50,-.11,.07,.13,.06);ell(-.30,.50,.11,.07,.13,.06);
    g.position.copy(v);g.rotation.y=e.rot+(e.tx*e.nz-e.tz*e.nx<0?Math.PI:0);scene.add(g);
  }

  const photoBuilt=new Set();
  function photoPanel(b,e,k,p,trim,base){
    const h=b.height,l=e.l,y0=h*p.range[0],y1=h*p.range[1],height=y1-y0;
    const count=p.mode==='repeat'?Math.max(1,Math.min(5,Math.round(l/(height*p.output[0]/p.output[1])))):1;
    for(let i=0;i<count;i++)k.face(p.material,l*(i+.5)/count,(y0+y1)/2,l/count-.015,height-.015,.049);
    cornice(k,e,h,trim);
    if(p.mode==='full'){
      for(const f of [.21,.69]){const u=k.fromLeft(f),w=Math.min(1.7,l*.12);
        for(let i=0;i<3;i++)k.panel(base,u,.055+i*.11,w+.46,.115,.29,.66-i*.18);
        for(const side of [-1,1]){
          k.panel(iron,u+side*(w/2+.15),.49,.045,.97,.045,.63);
          k.panel(iron,u+side*(w/2+.15),.88,.055,.055,.63,.56);
        }
      }
    }
    photoBuilt.add(b.id);
  }
  function detail(b){
    const es=edges(b),front=frontEdge(b,es),d=config(b),h=b.height,trim=M(d.trim),base=M(d.base),roof=M(d.roof),frame=d.frame;
    for(const e of es){if(e.l<2.5||e.l>140)continue;const k=kit(e),l=e.l,isFront=e===front;
      const photo=isFront?photoFacades.get(Number(b.id)):null;
      if(d.style==='piggy'){if(photo){photoPanel(b,e,k,photo,trim,base);continue}piggy(e,k,b,isFront,trim,base);continue}
      if(isFront)k.panel(M(d.wall,.92),l/2,h/2,l,h,.018,.026);
      if(photo)photoPanel(b,e,k,photo,trim,base);
      if(!isFront){cornice(k,e,h,trim);continue} // other faces retain complete lightweight atlas
      const historic=d.style!=='modern',ornate=d.style==='ornate',floors=floorCount(b,d),fh=h/floors;
      const count=isFront&&d.bays?d.bays:Math.max(1,Math.min(42,Math.round(l/(d.wideGlass?4.8:historic?2.85:2.15)))),bay=l/count;
      k.line(base,l/2,.39,l,.78,.18);cornice(k,e,h,trim);
      if(historic&&isFront){
        k.line(trim,l/2,fh-.15,l,.16,.24);
        for(const u of [.15,l-.15])k.panel(trim,u,h*.50,.25,h-.40,.23,.12);
        
        if(ornate||profile(b)==='salt')for(let j=1;j<count;j+=2)k.panel(trim,j*bay,h*.56,.24,h*.80,.20,.11);
        // Distinctive deep ground-floor rustication on the merchant society buildings.
        if(profile(b)==='salt'){for(let y=.95;y<fh*2;y+=.53)k.line(M(d.base),l/2,y,l,.035,.08);}
        // Empire portico on the documented Guardianship Council building.
        if(Number(b.id)===-1736197700&&l>18){const width=Math.min(l*.62,26),center=l/2,top=Math.min(h-1,fh*2.3);
          for(let j=0;j<8;j++){const u=center-width*.43+j*width*.86/7,rad=.32;const x=e.p[0]+e.tx*u+e.nx*.48,z=e.p[1]+e.tz*u+e.nz*.48;
            object(new T.CylinderGeometry(rad,rad*1.08,top-.7,12),trim,x,(top+.7)/2,z);k.panel(trim,u,.45,.83,.33,.92,.41);k.panel(trim,u,top,.84,.24,.88,.41)}
          k.panel(trim,center,top+.22,width,.32,.80,.43);gable(k,center,top+.37,width,Math.min(2.2,width*.1),trim);
        }

      }
      
      if(historic&&floors>2)k.line(trim,l/2,h-fh-.10,l,.14,.18);
      if(d.rusticated)for(let y=.70;y<fh-.15;y+=.38)k.line(M(d.base),l/2,y,l,.035,.07);
      if(d.pilasters||d.columns)for(let j=0;j<=count;j++){
        const u=Math.max(.10,Math.min(l-.10,j*bay));
        k.panel(trim,u,h*.63,.20,h*.66,.20,.11);
        k.panel(trim,u,h-.43,.37,.22,.24,.15);
      }
      if(d.rosettes)for(let j=0;j<count;j++){const u=(j+.5)*bay;k.panel(trim,u,h-.56,.50,.22,.12,.13);k.panel(trim,u,h-.56,.20,.28,.12,.16);}
      if(d.signs)for(let j=0;j<d.signs.length;j++){k.face(signMaterial(d.signs[j],'#cfc3a3','#493d34'),l*(j+.5)/d.signs.length,fh-.23,l*.28,.30,.22);}

      if(profile(b)==='sol6'){k.line(base,l/2,1.0,l,1.45,.18);k.line(trim,l/2,1.78,l,.20,.30);for(let j=0;j<=count;j++){const u=j*bay;k.panel(trim,u,5.95,.23,7.75,.24,.12);k.panel(trim,u,9.45,.40,.27,.31,.16)}}
      for(let row=0;row<floors;row++){
        if(photo&&(row+.35)/floors>=photo.range[0])continue;
        const ground=row===0,shop=ground&&isFront&&historic&&d.style!=='church'&&profile(b)!=='sol6',wy=profile(b)==='sol6'?(ground?1.0:row===1?3.85:7.55):ground?Math.min(fh*.56,1.85):fh*(row+.50);
        const wh=profile(b)==='sol6'?(ground?.95:2.55):Math.min(fh*.72,ground&&shop?2.35:historic?2.03:2.20);
        for(let j=0;j<count;j++){
          const u=(j+.5)*bay,w=d.wideGlass?bay*.80:Math.min(bay*.62,shop?2.10:historic?1.30:1.45);
          if(isFront&&ground&&(d.doors?d.doors.includes(j):j===Math.floor(count/2))&&historic&&profile(b)!=='sol6'){door(k,u,fh*.39,Math.min(1.65,bay*.70),Math.min(2.70,fh*.78),trim,frame);continue}
          if(d.style==='modern'){
            k.panel(trim,u,wy,Math.min(bay*.84,1.65),wh+.16,.11,.06);
            k.face(windowMaterial(frame,(j+row)%3),u,wy,w,wh,.16);
          }else{
            if(d.style==='church'||(d.arches&&(ground||d.rosettes)))archWindow(k,u,wy,w,wh,trim,frame,shop);else window(k,u,wy,w,wh,trim,frame,(j+row+hash(b))%3,ornate||row===1,shop);
            if(ornate&&isFront&&row===1)gable(k,u,wy+wh/2+.12,Math.min(bay*.80,w+.42),.20,trim);
          }
        }
      }
      // Historic street façades: projecting balcony, balustrade and downpipes.
      if(!photo&&isFront&&ornate&&floors>=3&&l>7&&profile(b)!=='atlantes'){
        const w=Math.min(l*.43,7.0),u=l/2,y=fh+.08;k.panel(trim,u,y,w,.20,.85,.40);k.panel(iron,u,y+.68,w,.10,.09,.80);
        for(let j=0;j<Math.ceil(w/.28);j++)k.panel(trim,u-w/2+j*.28,y+.34,.085,.55,.09,.78);
      }
      
      if(historic&&l>8)k.panel(metal,l-.32,h/2,.095,h-.12,.10,.26);
      if(profile(b)==='atlantes'&&isFront&&l>13){
        // Sculptural supports flanking the main central portal; modeled, not flat stickers.
        const u=l/2,y=Math.min(fh,3.8),w=Math.min(7.6,l*.47);
        k.panel(trim,u,y+.05,w,.30,1.32,.64);k.panel(trim,u,y+.85,w,.13,.20,1.15);for(let j=0;j<Math.ceil(w/.24);j++)k.panel(trim,u-w/2+j*.24,y+.44,.11,.65,.12,1.12);
        for(const off of [-w*.38,-w*.13,w*.13,w*.38]){
          const at=u+off,x=e.p[0]+e.tx*at+e.nx*.44,z=e.p[1]+e.tz*at+e.nz*.44;
          object(new T.SphereGeometry(.23,10,8),trim,x,y-.47,z);
          const torso=object(new T.CylinderGeometry(.29,.19,1.10,9),trim,x,y-1.10,z);torso.rotation.z=.08;
          for(const t of [-1,1]){const a=object(new T.CylinderGeometry(.095,.12,.75,8),trim,x+e.tx*t*.27,y-.62,z+e.tz*t*.27);a.rotation.z=t*.40;object(new T.CylinderGeometry(.12,.14,.85,8),trim,x+e.tx*t*.12,y-2.02,z+e.tz*t*.12)}
          k.panel(trim,at,.43,.75,.75,.75,.32);
        }
      }
      // Address sign is tied to actual OSM address rather than fictional business.
      if(isFront&&b.number&&b.street&&profile(b)!=='piggy'&&l>6){
        const num=String(b.number).replace(/c/g,'с');k.face(signMaterial(num,'#324e68','#f4f0e6'),l-.65,Math.min(2.65,h-.35),.85,.34,.23);
      }
    }
  }

  function object(g,m,x,y,z){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o}
  function churchRoof(b,d){
    const pts=b.points,h=b.height,cx=pts.reduce((a,p)=>a+p[0],0)/pts.length,cz=pts.reduce((a,p)=>a+p[1],0)/pts.length;
    const span=Math.min(Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1]))),r=Math.max(1.15,Math.min(4.4,span*.21));
    const dome=M(d.roof,.42,.24),gilded=M(0xb59a46,.33,.62),wall=M(d.wall),white=M(d.trim);
    function cupola(x,z,y,rad,tall,material){
      object(new T.CylinderGeometry(rad*.72,rad*.72,rad*.70,16),wall,x,y+rad*.35,z);
      object(new T.CylinderGeometry(rad*.86,rad*.82,.18,16),white,x,y+rad*.72,z);
      const line=[[0,0],[.73,0],[.99,.19],[1,.37],[.87,.61],[.58,.82],[.25,1],[.09,1.17],[0,1.21]].map(([a,b])=>new T.Vector2(a*rad,b*rad*tall));
      object(new T.LatheGeometry(line,24),material,x,y+rad*.76,z);
      const top=y+rad*.76+rad*tall*1.21;
      object(new T.CylinderGeometry(.045,.065,1.05,8),gilded,x,top+.50,z);
      object(new T.BoxGeometry(.75,.07,.07),gilded,x,top+.76,z);
    }
    cupola(cx,cz,h,r,1.05,dome);
    const name=String(b.name||'').toLowerCase();
    if(name.includes('знамение')){for(const x of [-1,1])for(const z of [-1,1])cupola(cx+x*r*1.25,cz+z*r*1.25,h,r*.48,1.2,gilded)}
    else if(name.includes('кленниках')||name.includes('георгия')||name.includes('космы')||name.includes('рождества богоматери')){
      const e=frontEdge(b,edges(b));if(e){const x=(e.p[0]+e.q[0])/2-e.nx*r,z=(e.p[1]+e.q[1])/2-e.nz*r;object(new T.CylinderGeometry(r*.52,r*.58,3.2,8),wall,x,h+1.6,z);cupola(x,z,h+3.2,r*.52,1.1,gilded)}
    }
  }
  function roof(b){
    const d=config(b);if(d.style==='church'){if(!(cityMap.buildingParts||[]).some(p=>p.parent===b.id&&p.height>b.height+.5))churchRoof(b,d);return;}if(!d.pitch||b.holes?.length||b.points.length>14)return;
    const pts=b.points.filter((p,i,a)=>Math.hypot(p[0]-a[(i+1)%a.length][0],p[1]-a[(i+1)%a.length][1])>.12);if(pts.length<3)return;
    let winding=0;for(let i=0;i<pts.length;i++){const a=pts[i],q=pts[(i+1)%pts.length],r=pts[(i+2)%pts.length],cross=(q[0]-a[0])*(r[1]-q[1])-(q[1]-a[1])*(r[0]-q[0]);if(Math.abs(cross)<.02)continue;if(winding&&Math.sign(cross)!==winding)return;winding=Math.sign(cross)}
    const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length,h=b.height,top=h+d.pitch;
    const inner=pts.map(p=>[cx+(p[0]-cx)*.48,cz+(p[1]-cz)*.48]),pos=[],uv=[];
    function tri(a,ay,b,by,c,cy){for(const [p,y] of [[a,ay],[b,by],[c,cy]]){pos.push(p[0],y,p[1]);uv.push(p[0]*.3,p[1]*.3)}}
    for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;tri(pts[i],h,pts[j],h,inner[j],top);tri(pts[i],h,inner[j],top,inner[i],top);tri(inner[i],top,inner[j],top,[cx,cz],top)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();const m=M(d.roof,.87);m.side=T.DoubleSide;const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;scene.add(o);
  }
  const pigFront=frontEdge(mainPig,edges(mainPig));
  const piggyView=pigFront?{x:(pigFront.p[0]+pigFront.q[0])/2,z:(pigFront.p[1]+pigFront.q[1])/2,nx:pigFront.nx,nz:pigFront.nz,width:pigFront.l}:null;
  return {profile,material,facadeMaterial,mapWalls,photoCount:()=>photoBuilt.size,photoAvailable:()=>photoFacades.size,frontView:b=>{const e=frontEdge(b,edges(b));return e?{x:(e.p[0]+e.q[0])/2,z:(e.p[1]+e.q[1])/2,nx:e.nx,nz:e.nz,width:e.l,height:b.height}:null},surveyCount:()=>cityMap.buildings.filter(b=>survey[b.id]).length,atlasCount:()=>atlasIds.size,detail,roof,piggyView,mainPig:!!mainPig,piggyInfo:{id:mainPig.id,street:mainPig.street,number:mainPig.number,points:mainPig.points,height:mainPig.height,reference:ref,candidates:candidates.map(x=>({id:x.b.id,d:x.d,inside:x.inside,area:x.area,height:x.b.height,street:x.b.street,number:x.b.number}))}};
}
