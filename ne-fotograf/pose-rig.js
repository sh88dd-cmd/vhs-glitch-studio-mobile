import * as T from 'three';
const H=1.75, vec=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const sideNames=['Clavicle','UpperArm','Forearm','Hand','Thigh','Shin','Foot','Toe'];
const labels={Pelvis:'Таз',Spine:'Поясница',Chest:'Грудь',Neck:'Шея',Head:'Голова',Clavicle:'Ключица',UpperArm:'Плечевой сустав',Forearm:'Локоть',Hand:'Запястье',Thigh:'Тазобедренный сустав',Shin:'Колено',Foot:'Голеностоп',Toe:'Носок'};
export function jointLabel(n){return n[0]==='L'||n[0]==='R'?(labels[n.slice(1)]+' — '+(n[0]==='L'?'слева':'справа')):labels[n]}
export function prepare(source){
 source.updateMatrixWorld(true);const box=new T.Box3().setFromObject(source),s=box.getSize(vec()),c=box.getCenter(vec());
 if(!Number.isFinite(s.y)||s.y<.001)throw Error('Не удалось определить размеры модели');
 const scale=H/s.y, norm=new T.Matrix4().makeScale(scale,scale,scale).multiply(new T.Matrix4().makeTranslation(-c.x,-box.min.y,-c.z));
 const group=new T.Group(),parts=[],samples=[];let verts=0;
 source.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone();g.applyMatrix4(norm.clone().multiply(o.matrixWorld));const p=g.getAttribute('position');if(!p)return;
 const m=new T.Mesh(g,o.material);group.add(m);parts.push(m);verts+=p.count;const step=Math.max(1,Math.ceil(p.count/18000));for(let i=0;i<p.count;i+=step)samples.push(vec(p.getX(i),p.getY(i),p.getZ(i)));});
 if(!parts.length)throw Error('Нет геометрии');group.updateMatrixWorld(true);return {group,parts,samples,verts,box:new T.Box3().setFromObject(group)};
}
function median(a){if(!a.length)return 0;a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]}
export function estimate(pre,defs,pose='auto'){
 const j=Object.fromEntries(defs.map(([n,p,v])=>[n,v.clone()])), pts=pre.samples, width=pre.box.max.x-pre.box.min.x;
 const central=pts.filter(p=>Math.abs(p.x)<.11*H&&p.y>.5*H&&p.y<.8*H);
 const z=median(central.map(p=>p.z));for(const n of Object.keys(j))j[n].z+=z;
 for(const s of [-1,1]){
 const p=s<0?'L':'R', band=pts.filter(v=>v.x*s>.15*H&&v.y>.62*H&&v.y<.87*H);
 let mode=pose;if(mode==='auto')mode=band.some(v=>v.x*s>.32*H)?'T':width>H*.55?'A':'down';
 if(mode!=='T'){
 const arm=j[p+'UpperArm'];const dir=mode==='A'?vec(s*.66,-.75,0):vec(s*.11,-.994,0);
 j[p+'Forearm']=arm.clone().addScaledVector(dir,.15*H);j[p+'Hand']=j[p+'Forearm'].clone().addScaledVector(dir,.135*H);
 }
 }
 return j;
}
export function depthAt(pre,x,y,fallback){let best=[];for(const p of pre.samples){const d=(p.x-x)**2+(p.y-y)**2;if(d<(.035*H)**2)best.push(p.z)}return best.length>2?median(best):fallback}
let detectorPromise;
async function detector(){
 if(!detectorPromise)detectorPromise=(async()=>{const base='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';const {FilesetResolver,PoseLandmarker}=await import(base+'/vision_bundle.mjs');const fs=await FilesetResolver.forVisionTasks(base+'/wasm');return PoseLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:1,minPoseDetectionConfidence:.3,minPosePresenceConfidence:.3})})();
 try{return await detectorPromise}catch(e){detectorPromise=null;throw e}
}
export async function detectPose(pre,defs,canvas,camera){
 const d=await detector(), lm=d.detect(canvas).landmarks?.[0];if(!lm)throw Error('Поза не распознана. Выбери суставы вручную.');
 const j=estimate(pre,defs), get=i=>{const p=lm[i];if(!p||(p.visibility??1)<.25)return null;const v=vec(p.x*2-1,1-p.y*2,0).unproject(camera);v.z=depthAt(pre,v.x,v.y,0);return v};
 const ls=get(11),rs=get(12),lh=get(23),rh=get(24);
 if(!ls||!rs||!lh||!rh)throw Error('Не видны плечи или таз. Попробуй другой ракурс или ручную настройку.');
 const mid=(a,b)=>a.clone().lerp(b,.5);j.Pelvis=mid(lh,rh);const shoulder=mid(ls,rs);j.Spine=j.Pelvis.clone().lerp(shoulder,.38);j.Chest=j.Pelvis.clone().lerp(shoulder,.79);j.Neck=shoulder.clone().add(vec(0,.035*H,0));const nose=get(0);j.Head=nose?j.Neck.clone().lerp(nose,.60):j.Neck.clone().add(vec(0,.065*H,0));
 for(const [p,i] of [[ls.x<rs.x?'L':'R',0],[ls.x<rs.x?'R':'L',1]]){
 const shoulderPoint=get(11+i),hip=get(23+i);j[p+'Clavicle']=j.Chest.clone().lerp(shoulderPoint,.5);j[p+'UpperArm']=shoulderPoint;j[p+'Thigh']=hip;
 for(const [n,k] of [['Forearm',13],['Hand',15],['Shin',25],['Foot',27],['Toe',31]]){const v=get(k+i);if(v)j[p+n]=v}
 }
 return j;
}
function endpoint(n,j){
 let p=n[0],k=n.slice(1);if(n==='Pelvis')return j.Spine;if(n==='Spine')return j.Chest;if(n==='Chest')return j.Neck;if(n==='Neck')return j.Head;if(n==='Head')return j.Head.clone().add(j.Head.clone().sub(j.Neck).normalize().multiplyScalar(.10*H));
 if(k==='Clavicle')return j[p+'UpperArm'];if(k==='UpperArm')return j[p+'Forearm'];if(k==='Forearm')return j[p+'Hand'];if(k==='Hand')return j[n].clone().add(j[n].clone().sub(j[p+'Forearm']).multiplyScalar(.35));if(k==='Thigh')return j[p+'Shin'];if(k==='Shin')return j[p+'Foot'];if(k==='Foot')return j[p+'Toe'];return j[n].clone().add(j[n].clone().sub(j[p+'Foot']).multiplyScalar(.35));
}
export function buildRig(pre,defs,j){
 const target={},template=Object.fromEntries(defs.map(([n,p,v])=>[n,v]));const parent=Object.fromEntries(defs.map(([n,p])=>[n,p]));
 for(const [n,p,v] of defs){if(!j[n]||!Number.isFinite(j[n].lengthSq()))throw Error('Некорректный сустав: '+n);if(!p){target[n]=v.clone();continue}const d=v.clone().sub(template[p]),length=j[n].distanceTo(j[p]);if(length<.004)throw Error('Совпадают суставы: '+jointLabel(n)+' и '+jointLabel(p));target[n]=target[p].clone().add(d.normalize().multiplyScalar(length));}
 const rotations=defs.map(([n])=>{const a=endpoint(n,j).clone().sub(j[n]).normalize(),b=endpoint(n,target).clone().sub(target[n]).normalize();return new T.Quaternion().setFromUnitVectors(a,b)});
 const segments=defs.map(([n,p],i)=>{const d=endpoint(n,j).clone().sub(j[n]);return {n,p,i,a:j[n],d,len:Math.max(d.lengthSq(),1e-9)}});
 const tmp=vec(),v=vec(),out=vec(),work=vec(),normal=vec(),normalOut=vec(), all=[], bounds=new T.Box3();
 for(const part of pre.parts){const g=part.geometry.clone(),p=g.getAttribute('position'),norm=g.getAttribute('normal'),si=new Uint16Array(p.count*4),sw=new Float32Array(p.count*4);
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);let first=null,second=null,best=Infinity;
 for(const seg of segments){tmp.copy(v).sub(seg.a);const u=T.MathUtils.clamp(tmp.dot(seg.d)/seg.len,0,1);const dist=tmp.addScaledVector(seg.d,-u).lengthSq();const cost=dist+(seg.n==='Head'?-.000001:0);if(cost<best){best=cost;first=seg}}
 let next=Infinity;for(const seg of segments){if(seg===first||!(seg.p===first.n||first.p===seg.n))continue;tmp.copy(v).sub(seg.a);const u=T.MathUtils.clamp(tmp.dot(seg.d)/seg.len,0,1);const cost=tmp.addScaledVector(seg.d,-u).lengthSq();if(cost<next){next=cost;second=seg}}
 const blend=second? .5*(1-T.MathUtils.smoothstep(Math.sqrt(Math.max(0,next))-Math.sqrt(Math.max(0,best)),0,.055*H)):0;
 const ids=[first.i,second?.i??first.i],ws=[1-blend,blend];out.set(0,0,0);normalOut.set(0,0,0);if(norm)normal.fromBufferAttribute(norm,i);
 for(let k=0;k<2;k++){const idx=ids[k],n=segments[idx].n,w=ws[k];si[i*4+k]=idx;sw[i*4+k]=w;if(w<=0)continue;work.copy(v).sub(j[n]).applyQuaternion(rotations[idx]).add(target[n]);out.addScaledVector(work,w);if(norm)normalOut.addScaledVector(work.copy(normal).applyQuaternion(rotations[idx]),w)}
 p.setXYZ(i,out.x,out.y,out.z);bounds.expandByPoint(out);if(norm){normalOut.normalize();norm.setXYZ(i,normalOut.x,normalOut.y,normalOut.z)}
 }g.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));g.deleteAttribute('tangent');g.morphAttributes={};all.push({g,material:part.material})}
 const c=bounds.getCenter(vec()),size=bounds.getSize(vec()),s=H/size.y;if(!Number.isFinite(s)||s<=0)throw Error('Ошибка нормализации');const mat=new T.Matrix4().makeScale(s,s,s).multiply(new T.Matrix4().makeTranslation(-c.x,-bounds.min.y,-c.z));
 const restDefs=defs.map(([n,p])=>[n,p,target[n].clone().applyMatrix4(mat)]),map=new Map(),root=new T.Group(),bones=[];root.name='Character';
 for(const [n,p,pos] of restDefs){const b=new T.Bone();b.name=n;b.position.copy(pos);if(p){b.position.sub(restDefs.find(d=>d[0]===p)[2]);map.get(p).add(b)}else root.add(b);bones.push(b);map.set(n,b)}
 root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();for(const [i,{g,material}] of all.entries()){g.applyMatrix4(mat);g.computeBoundingBox();g.computeBoundingSphere();const m=new T.SkinnedMesh(g,material);m.name='BodyPart'+i;m.frustumCulled=false;root.add(m);root.updateMatrixWorld(true);m.bind(skeleton,new T.Matrix4());m.normalizeSkinWeights()}
 return {root,bones,restDefs,verts:pre.verts,meshes:all.length}
}
