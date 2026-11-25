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
const generic=[
 {wall:0xcdbb9c,trim:0xe5dcca,base:0x968b7d,frame:0x57473a,roof:0x5a5b58,style:'classical',pitch:1.1},
 {wall:0xc1c4b7,trim:0xe1e0d2,base:0x919287,frame:0x5b5a50,roof:0x606967,style:'classical',pitch:1.4},
 {wall:0xb9a18d,trim:0xe1d3c0,base:0x887e73,frame:0x523d32,roof:0x68625b,style:'shop',pitch:1.6},
 {wall:0xd3c7b8,trim:0xe7dfd4,base:0x96918a,frame:0x625b54,roof:0x626568,style:'ornate',pitch:1.3},
 {wall:0xa8aba8,trim:0xc9c9c3,base:0x7d8281,frame:0x475458,roof:0x6a6c6e,style:'modern',pitch:0},
 {wall:0xc8ae99,trim:0xe4d8c6,base:0x9a8778,frame:0x605045,roof:0x62615b,style:'classical',pitch:1.5}
];
function hash(b){return [...String(b.id)].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);}
export function createArchitecture({scene,staticMeshes,box,mat,cityMap,roadPaths,nearPath}){
  const palette=new Map(),signs=new Map(),windowMats=new Map();
  const M=(c,rough=.85,metal=0)=>{const key=c+':'+rough+':'+metal;if(!palette.has(key))palette.set(key,mat(c,rough,metal));return palette.get(key)};
  const dark=M(0x393c38,.8),metal=M(0x494d4b,.5,.4),gold=M(0xbca04c,.65),iron=M(0x34352e,.6,.3);
  const mainPig=cityMap.buildings.find(b=>architectureProfile(b)==='piggy');
  const profile=architectureProfile;
  const config=b=>definitions[profile(b)]||generic[hash(b)%generic.length];
  // Keep surveyed OSM heights. Correct documented storeys where height was only guessed.
  for(const b of cityMap.buildings){
    const k=profile(b),d=config(b);
    if(k==='piggy')b.height=5.35; // estimated from supplied street-level photographs
    else if(d.floors&&(!b.heightSource||b.heightSource==='estimate'||Math.abs(b.height/3.25-d.floors)>1))b.height=d.floors*3.55+.5;
  }
  function material(b){return M(config(b).wall,.92)}
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
    let best=null,score=Infinity;const target=street(b),preferred=roadPaths.filter(o=>target&&String(o.r.name||'').toLowerCase().includes(target));
    const roads=preferred.length?preferred:roadPaths.filter(o=>!['path','footway','steps','service','cycleway'].includes(o.r.type));
    for(const e of es){if(e.l<5)continue;const x=(e.p[0]+e.q[0])/2+e.nx,z=(e.p[1]+e.q[1])/2+e.nz;let d=Infinity;
      for(const {r,path} of roads){const n=nearPath(path,x,z).distance;d=Math.min(d,n-(r.width||0)*.35)}
      const v=d-e.l*.11;if(v<score){score=v;best=e}}
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
    const l=e.l,h=b.height,frame=0x5d5044;
    k.line(base,l/2,.44,l,.88,.19);cornice(k,e,h,trim);k.line(trim,l/2,3.18,l,.16,.24);k.line(trim,l/2,3.38,l,.12,.29);
    if(!front){const count=Math.max(1,Math.floor(l/3.7));for(let j=0;j<count;j++)window(k,(j+.5)*l/count,1.91,Math.min(1.65,l/count*.60),2.08,trim,frame,j%3,false,true);return}
    const from=k.fromLeft,sections=[{f:.20,title:'БРАТЬЯ КАРАВАЕВЫ'},{f:.52,title:'ПИГГИ · PIGGY'},{f:.83,title:'КУЛЬТУРА'}];
    for(const {f,title} of sections){
      const u=from(f),span=Math.min(l*.24,5.0),w=Math.min(1.35,span*.35);
      door(k,u,1.52,w,2.55,trim,frame);
      for(const side of [-1,1])window(k,u+side*span*.33,1.92,Math.min(1.12,span*.26),1.85,trim,frame,side===1?1:2,false,true);
      k.face(signMaterial(title,'#c9bca1','#53483a'),u,2.98,span,.43,.20);
      // Stone entrance stairs and dark handrails, without altering road colliders.
      if(f===.52){for(let i=0;i<3;i++)k.panel(base,u,.055+i*.09,w+.60,.11,.26,.58-i*.18);k.panel(iron,u-w*.59,.55,.065,.9,.08,.46);k.panel(iron,u+w*.59,.55,.065,.9,.08,.46)}
    }
    for(const f of [.30,.65]){const u=from(f);gable(k,u,3.53,Math.min(4.0,l*.24),.72,trim);k.panel(trim,u,3.56,Math.min(1.65,l*.12),.42,.13,.13)}
    for(const f of [.09,.46,.88]){const u=from(f),w=Math.min(2.6,l*.16);k.panel(trim,u,4.56,w+.18,.87,.13,.075);k.panel(gold,u,4.56,w,.70,.08,.16)}
    for(const f of [.04,.95])k.panel(trim,from(f),h/2,.28,h-.16,.24,.13);
    k.panel(metal,from(.91),h/2,.10,h,.10,.30);
  }
  function detail(b){
    const es=edges(b),front=frontEdge(b,es),d=config(b),h=b.height,trim=M(d.trim),base=M(d.base),roof=M(d.roof),frame=d.frame;
    for(const e of es){if(e.l<2.5||e.l>140)continue;const k=kit(e),l=e.l,isFront=e===front;
      if(d.style==='piggy'){piggy(e,k,b,isFront,trim,base);continue}
      const historic=d.style!=='modern',ornate=d.style==='ornate',floors=d.floors||Math.max(1,Math.min(15,Math.round(h/(historic?3.5:3.15)))),fh=h/floors;
      const count=isFront&&d.bays?d.bays:Math.max(1,Math.min(32,Math.round(l/(historic?2.85:2.15)))),bay=l/count;
      k.line(base,l/2,.39,l,.78,.18);cornice(k,e,h,trim);
      if(historic&&isFront){
        k.line(trim,l/2,fh-.15,l,.16,.24);
        for(const u of [.15,l-.15])k.panel(trim,u,h*.50,.25,h-.40,.23,.12);
        if(ornate||profile(b)==='salt')for(let j=1;j<count;j+=2)k.panel(trim,j*bay,h*.56,.24,h*.80,.20,.11);
      }
      if(historic&&floors>2)k.line(trim,l/2,h-fh-.10,l,.14,.18);
      for(let row=0;row<floors;row++){
        const ground=row===0,shop=ground&&isFront&&historic,wy=ground?Math.min(fh*.56,1.85):fh*(row+.50);
        const wh=Math.min(fh*.72,ground&&shop?2.35:historic?2.03:2.20);
        for(let j=0;j<count;j++){
          const u=(j+.5)*bay,w=Math.min(bay*.62,shop?2.10:historic?1.30:1.45);
          if(isFront&&ground&&j===Math.floor(count/2)&&historic){door(k,u,fh*.39,Math.min(1.65,bay*.70),Math.min(2.70,fh*.78),trim,frame);continue}
          if(d.style==='modern'){
            k.panel(trim,u,wy,Math.min(bay*.84,1.65),wh+.16,.11,.06);
            k.face(windowMaterial(frame,(j+row)%3),u,wy,w,wh,.16);
          }else{
            window(k,u,wy,w,wh,trim,frame,(j+row+hash(b))%3,ornate||row===1,shop);
            if(ornate&&isFront&&row===1)gable(k,u,wy+wh/2+.12,Math.min(bay*.80,w+.42),.20,trim);
          }
        }
      }
      // Historic street façades: projecting balcony, balustrade and downpipes.
      if(isFront&&ornate&&floors>=3&&l>7){
        const w=Math.min(l*.43,7.0),u=l/2,y=fh+.08;k.panel(trim,u,y,w,.20,.85,.40);k.panel(iron,u,y+.68,w,.10,.09,.80);
        for(let j=0;j<Math.ceil(w/.28);j++)k.panel(trim,u-w/2+j*.28,y+.34,.085,.55,.09,.78);
      }
      if(historic&&l>8)k.panel(metal,l-.32,h/2,.095,h-.12,.10,.26);
    }
  }
  function roof(b){
    const d=config(b);if(!d.pitch||b.holes?.length||b.points.length>14)return;
    const pts=b.points.filter((p,i,a)=>Math.hypot(p[0]-a[(i+1)%a.length][0],p[1]-a[(i+1)%a.length][1])>.12);if(pts.length<3)return;
    let winding=0;for(let i=0;i<pts.length;i++){const a=pts[i],q=pts[(i+1)%pts.length],r=pts[(i+2)%pts.length],cross=(q[0]-a[0])*(r[1]-q[1])-(q[1]-a[1])*(r[0]-q[0]);if(Math.abs(cross)<.02)continue;if(winding&&Math.sign(cross)!==winding)return;winding=Math.sign(cross)}
    const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length,h=b.height,top=h+d.pitch;
    const inner=pts.map(p=>[cx+(p[0]-cx)*.48,cz+(p[1]-cz)*.48]),pos=[],uv=[];
    function tri(a,ay,b,by,c,cy){for(const [p,y] of [[a,ay],[b,by],[c,cy]]){pos.push(p[0],y,p[1]);uv.push(p[0]*.3,p[1]*.3)}}
    for(let i=0;i<pts.length;i++){const j=(i+1)%pts.length;tri(pts[i],h,pts[j],h,inner[j],top);tri(pts[i],h,inner[j],top,inner[i],top);tri(inner[i],top,inner[j],top,[cx,cz],top)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();const m=M(d.roof,.87);m.side=T.DoubleSide;const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;scene.add(o);
  }
  return {profile,material,detail,roof,mainPig:!!mainPig};
}
