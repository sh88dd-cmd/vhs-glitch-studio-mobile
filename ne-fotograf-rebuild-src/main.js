import * as T from 'three';
import {createArchitecture} from './architecture.js';
import {loadPhotoFacades} from './photo-facades.js';
import {addMappedDetails} from './mapped-details.js';
import {installDistrict} from './district.js';
import {createNavigation} from './navigation.js';
import RAPIER from '@dimforge/rapier3d-compat';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EffectComposer,RenderPass,EffectPass,ToneMappingEffect,ToneMappingMode} from 'postprocessing';
import {N8AOPostPass} from 'n8ao';
const $=id=>document.getElementById(id),cv=$('world'),mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||navigator.maxTouchPoints>1;
const base=import.meta.env.BASE_URL+'assets/';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,1,.12,650);
scene.background=new T.Color(0x979aa3);scene.fog=new T.FogExp2(0x99979b,.0018);
const renderer=new T.WebGLRenderer({canvas:cv,antialias:!mobile,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
let renderScale=1,drawCalls=0,staticBefore=0,staticAfter=0,shadowClock=0,quality=1,composer=null,ao=null,frames=0,fps=0,started=false,view=3,sprint=false,yaw=0,pitch=-.10;
function resize(){let w=cv.clientWidth||innerWidth,h=cv.clientHeight||innerHeight;renderer.setPixelRatio(Math.min(devicePixelRatio||1,mobile?1.1:1.5)*renderScale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();composer?.setSize(w,h);camera.updateMatrixWorld(true)}
function applyQuality(){composer?.dispose();composer=null;ao=null;renderer.toneMapping=T.ACESFilmicToneMapping;if(quality===1){try{composer=new EffectComposer(renderer,{frameBufferType:T.HalfFloatType});renderer.toneMapping=T.NoToneMapping;composer.addPass(new RenderPass(scene,camera));ao=new N8AOPostPass(scene,camera,cv.clientWidth||390,cv.clientHeight||844);ao.configuration.aoRadius=1.3;ao.configuration.intensity=2.0;ao.configuration.halfRes=true;ao.configuration.aoSamples=mobile?8:16;ao.configuration.denoiseSamples=mobile?4:8;composer.addPass(ao);composer.addPass(new EffectPass(camera,new ToneMappingEffect({mode:ToneMappingMode.ACES_FILMIC})));}catch(e){console.warn(e);composer?.dispose();composer=null;renderer.toneMapping=T.ACESFilmicToneMapping;quality=0}}resize();$('info').textContent=quality?'HD':'HD: без AO (ошибка графики)'}
addEventListener('resize',resize);applyQuality();
const ambient=new T.HemisphereLight(0xdde9ff,0x8b887d,.9);scene.add(ambient);
const sun=new T.DirectionalLight(0xffeee0,2.3);sun.position.set(-14,22,-11);scene.add(sun,sun.target);sun.castShadow=true;sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);Object.assign(sun.shadow.camera,{left:-19,right:19,top:19,bottom:-19,near:.5,far:65});sun.shadow.normalBias=.055;sun.shadow.bias=-.00025;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;
await RAPIER.init();
const draco=new DRACOLoader().setDecoderPath(base+'decoders/draco/').setWorkerLimit(1),ktx=new KTX2Loader().setTranscoderPath(base+'decoders/basis/').setWorkerLimit(1).detectSupport(renderer);
const loader=new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder),tex=new T.TextureLoader(),world=new RAPIER.World({x:0,y:-9.81,z:0}); // initialized before this module via top-level await below

const controller=world.createCharacterController(.035);controller.enableAutostep(.23,.18,true);controller.enableSnapToGround(.24);controller.setMaxSlopeClimbAngle(Math.PI/4);
const mat=(color,roughness=.9,metalness=0)=>new T.MeshStandardMaterial({color,roughness,metalness});
const asphalt=mat(0x454749,.86),paving=mat(0xb7b2a7),brick=mat(0xad8c7f),plaster=mat(0xbeb7ab),concrete=mat(0xaaa8a0),metal=mat(0x363a3b,.55,.55),glass=mat(0x405367,.16,.25),wood=mat(0x5b4436,.7);
const geo=new T.BoxGeometry(1,1,1),staticMeshes=[],lampSites=[],lamps=[],decor=[],roadBatches=new Map();
const wallStyles=[{m:plaster.clone(),base:plaster,c:0xe0d4bb},{m:plaster.clone(),base:plaster,c:0xc6b6a1},{m:brick.clone(),base:brick,c:0xd6a991},{m:plaster.clone(),base:plaster,c:0xc1c7b8},{m:brick.clone(),base:brick,c:0xe6c8b3}];
const landmarkStone=mat(0xb6b4ae,.88),landmarkCream=mat(0xe2ddc8,.88),landmarkBrick=mat(0x795d49,.9),landmarkRoof=mat(0x373b40,.9),landmarkGold=mat(0xc4aa62,.72),landmarkRose=mat(0xc2a19a,.85);
const curbMat=mat(0xb7b2a8),doorMat=mat(0x463b32,.6),trimMat=mat(0xe2d7c6,.82),signMetal=mat(0x363d42,.7);
const mapResponse=await fetch(base+'kitay-gorod.json');if(!mapResponse.ok)throw Error('Карта OSM недоступна');const cityMap=await mapResponse.json();if(cityMap.source!=='OpenStreetMap'||cityMap.buildings.length<10||cityMap.roads.length<5)throw Error('Неполные данные OSM');

/* OSM bake uses east/north in a positive determinant basis. Three.js uses x/z
   with geographic north opposite to screen-up handedness. Mirror exactly once
   before any mesh, road, navigation, collision or minimap is created. */
const [sw0,se0,,nw0]=cityMap.bounds;
const mapDet=(se0[0]-sw0[0])*(nw0[1]-sw0[1])-(se0[1]-sw0[1])*(nw0[0]-sw0[0]);
if(mapDet>0){
 const flip=p=>{p[0]=-p[0]};
 for(const b of [...cityMap.buildings,...(cityMap.parks||[]),...(cityMap.water||[])]){b.points.forEach(flip);for(const h of b.holes||[])h.forEach(flip)}
 for(const r of cityMap.roads)r.points.forEach(flip);
 for(const p of cityMap.places){flip(p.position);p.yaw=-(p.yaw||0)}
 for(const p of [...(cityMap.buildingParts||[]),...(cityMap.mappedSurfaces||[]),...(cityMap.mappedBarriers||[])])p.points.forEach(flip);
 for(const t of [...(cityMap.mappedTrees||[]),...(cityMap.mappedEntrances||[])])flip(t.position);
 cityMap.bounds.forEach(flip);if(cityMap.spawn.position)flip(cityMap.spawn.position);
}
const [sw1,se1,,nw1]=cityMap.bounds;
const correctedMapDet=(se1[0]-sw1[0])*(nw1[1]-sw1[1])-(se1[1]-sw1[1])*(nw1[0]-sw1[0]);
if(correctedMapDet>=0)throw Error('Map handedness still mirrored');

function box(m,x,y,z,w,h,d,collision=false){const g=geo.clone(),uv=g.attributes.uv;for(let i=0;i<uv.count;i++){const f=Math.floor(i/4),u=f<2?d:w,v=f>=2&&f<4?d:h;uv.setXY(i,uv.getX(i)*u*.45,uv.getY(i)*v*.45)}const o=new T.Mesh(g,m);o.position.set(x,y,z);o.scale.set(w,h,d);o.castShadow=true;o.receiveShadow=true;scene.add(o);staticMeshes.push(o);if(collision)world.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z));return o}
function label(s){const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='#252c2a';x.fillRect(0,0,512,128);x.font='bold 57px Arial';x.textAlign='center';x.textBaseline='middle';x.fillStyle='#ead4a9';x.fillText(s,256,64);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return new T.MeshStandardMaterial({map:t,roughness:.8})}

const roofMat=mat(0x656566,.92),groundMat=mat(0xa39d91,.95);
const ground=new T.Mesh(new T.PlaneGeometry(4000,4000),groundMat);ground.rotation.x=-Math.PI/2;ground.position.set(0,0,-14);ground.receiveShadow=true;ground.frustumCulled=false;scene.add(ground);
const groundCollider=world.createCollider(RAPIER.ColliderDesc.cuboid(2000,.5,2000).setTranslation(0,-.5,-14));
const FOOT=.87,GROUND_MARGIN=.035,obstacles=[];
function inMap(x,z){const ps=cityMap.bounds;if(!ps)return Math.abs(x)<175&&z>-189&&z<161;let inside=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const [ax,az]=ps[i],[bx,bz]=ps[j];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside}return inside;}
function addObstacle(x,z,r,h=1){obstacles.push({x,z,r});world.createCollider(RAPIER.ColliderDesc.cylinder(h/2,r).setTranslation(x,h/2,z));}
function shapeMesh(points,material,height=0,holes=[]){const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();for(const ring of holes){const hole=new T.Path();ring.forEach(([x,z],i)=>i?hole.lineTo(x,-z):hole.moveTo(x,-z));hole.closePath();shape.holes.push(hole)}const g=height?new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1}):new T.ShapeGeometry(shape);g.rotateX(-Math.PI/2);
const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;for(let i=0;i<p.count;i++){if(Math.abs(n.getY(i))>.8)uv.setXY(i,p.getX(i)*.4,p.getZ(i)*.4);else uv.setXY(i,(Math.abs(n.getX(i))>.7?p.getZ(i):p.getX(i))*.4,p.getY(i)*.4)}
const o=new T.Mesh(g,material);o.castShadow=!!height;o.receiveShadow=true;scene.add(o);return o}
function ribbon(points,width,offset,y,material){const left=[],right=[];for(let i=0;i<points.length;i++){const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],p=points[i];let dx=next[0]-prev[0],dz=next[1]-prev[1],l=Math.hypot(dx,dz);if(l<.001){dx=0;dz=1;l=1}const nx=dz/l,nz=-dx/l;left.push([p[0]+nx*(offset-width/2),p[1]+nz*(offset-width/2)]);right.push([p[0]+nx*(offset+width/2),p[1]+nz*(offset+width/2)])}
const v=[],uv=[],idx=[];let cumulative=0;for(let i=0;i<points.length;i++){if(i)cumulative+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);v.push(left[i][0],y,left[i][1],right[i][0],y,right[i][1]);uv.push(0,cumulative*.4,width*.4,cumulative*.4);if(i){const j=i*2;idx.push(j-2,j,j-1,j-1,j,j+1)}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.setAttribute('normal',new T.Float32BufferAttribute(Array.from({length:v.length/3},()=>[0,1,0]).flat(),3));material.side=T.DoubleSide;g.computeBoundingBox();const c=g.boundingBox.getCenter(new T.Vector3()),key=material.uuid+':'+Math.floor(c.x/45)+':'+Math.floor(c.z/45);if(!roadBatches.has(key))roadBatches.set(key,{material,geometries:[]});roadBatches.get(key).geometries.push(g)}
function batchRoads(){for(const {material,geometries} of roadBatches.values()){const g=mergeGeometries(geometries,false);if(!g)throw Error('Road batch');const o=new T.Mesh(g,material);o.receiveShadow=true;scene.add(o);for(const old of geometries)old.dispose()}roadBatches.clear()}
const riverMat=mat(0x455f67,.31,.18);for(const p of cityMap.water||[]){const o=shapeMesh(p.points,riverMat,0,p.holes||[]);o.position.y=.009}
const grass=mat(0x77855c,.95);for(const p of cityMap.parks||[]){const o=shapeMesh(p.points,grass,0,p.holes||[]);o.position.y=.004}
for(const road of cityMap.roads){if(road.points.length<2||road.id===480821442)continue;const w=road.width,foot=['footway','path','cycleway','steps','pedestrian'].includes(road.type);ribbon(road.points,w,0,foot?.035:.065,foot?paving:asphalt);if(!foot&&road.type!=='service'){ribbon(road.points,1.6,w/2+.8,.028,paving);ribbon(road.points,1.6,-w/2-.8,.028,paving)}}
const spawnWidth=cityMap.spawn.width,spawnHalf=Math.min(22,Math.max(5,cityMap.spawn.length/2-2));
// The actual named OSM polyline passing through the initial position.
const streetRoad=cityMap.roads.filter(r=>r.name===cityMap.spawn.street).sort((a,b)=>Math.min(...a.points.map(p=>Math.hypot(p[0],p[1]+14)))-Math.min(...b.points.map(p=>Math.hypot(p[0],p[1]+14))))[0];
if(!streetRoad)throw Error('Missing spawn street');
function pathOf(points){let length=0;const parts=[];for(let i=1;i<points.length;i++){const [x,z]=points[i-1],[ex,ez]=points[i],l=Math.hypot(ex-x,ez-z);if(l<.01)continue;parts.push({x,z,dx:(ex-x)/l,dz:(ez-z)/l,start:length,l});length+=l}return{parts,length}}
const streetPath=pathOf(streetRoad.points);
function atPath(path,s,offset=0){s=T.MathUtils.clamp(s,0,path.length);const p=path.parts.find(p=>s<=p.start+p.l)||path.parts.at(-1),d=s-p.start;return{x:p.x+p.dx*d+p.dz*offset,z:p.z+p.dz*d-p.dx*offset,yaw:Math.atan2(p.dx,p.dz)}}
function nearPath(path,x,z){let best=Infinity,along=0;for(const p of path.parts){const d=T.MathUtils.clamp((x-p.x)*p.dx+(z-p.z)*p.dz,0,p.l),e=Math.hypot(x-p.x-p.dx*d,z-p.z-p.dz*d);if(e<best){best=e;along=p.start+d}}return{distance:best,along}}
const spawnAlong=nearPath(streetPath,0,-14).along;
const buildingBounds=cityMap.buildings.map(b=>({...b,minX:Math.min(...b.points.map(p=>p[0])),maxX:Math.max(...b.points.map(p=>p[0])),minZ:Math.min(...b.points.map(p=>p[1])),maxZ:Math.max(...b.points.map(p=>p[1]))}));
function insideBuilding(x,z){for(const b of buildingBounds){if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;let inside=false;for(let i=0,j=b.points.length-1;i<b.points.length;j=i++){const [ax,az]=b.points[i],[bx,bz]=b.points[j];if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside}if(inside&&!(b.holes||[]).some(r=>inRing(x,z,r)))return true}return false}
function inRing(x,z,r){let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes}
function clearPoint(x,z,r=.33){return ![[0,0],[r,0],[-r,0],[0,r],[0,-r]].some(([dx,dz])=>insideBuilding(x+dx,z+dz))}
function sidewalkRoute(side){const off=side*(spawnWidth/2+.7),lo=Math.max(0,spawnAlong-28),hi=Math.min(streetPath.length,spawnAlong+28),runs=[];let run=[];for(let s=lo;s<=hi;s+=.5){const p=atPath(streetPath,s,off);if(clearPoint(p.x,p.z))run.push([p.x,p.z]);else{if(run.length>3)runs.push(run);run=[]}}if(run.length>3)runs.push(run);runs.sort((a,b)=>b.length-a.length);if(!runs.length)throw Error('No safe sidewalk');return pathOf(runs[0])}
const sidewalks=[sidewalkRoute(-1),sidewalkRoute(1)];
const roadPaths=cityMap.roads.map(r=>({r,path:pathOf(r.points)}));
function offRoad(x,z,radius){return roadPaths.every(({r,path})=>nearPath(path,x,z).distance>=r.width/2+radius)}
function carClear(p,len){const dx=Math.sin(p.yaw),dz=Math.cos(p.yaw);for(const f of [-len/2,0,len/2])for(const s of [-.95,0,.95])if(insideBuilding(p.x+dx*f+dz*s,p.z+dz*f-dx*s))return false;return true}
function safeLane(lane,len){const runs=[];let start=null;for(let s=3;s<=streetPath.length-3;s+=.5){const good=carClear(atPath(streetPath,s,lane),len);if(good&&start===null)start=s;if(!good&&start!==null){if(s-start>8)runs.push([start,s-.5]);start=null}}if(start!==null&&streetPath.length-3-start>8)runs.push([start,streetPath.length-3]);runs.sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));if(!runs.length)throw Error('No safe driving lane');return runs[0]}
const facadeQueue=[],facades=new Set(),landmarksBuilt=new Set();
const photoFacades=await loadPhotoFacades(base,tex);
const architecture=createArchitecture({scene,staticMeshes,box,mat,cityMap,roadPaths,nearPath,photoFacades});
const profile=architecture.profile;
for(const b of cityMap.buildings)if(photoFacades.has(b.id)||architecture.heritageIds.has(b.id)||architecture.elevationIds.has(b.id)||b.id===52404043||profile(b)==='piggy')b.replaceWithParts=false;
function solidBuilding(b,i){const pts=b.points,h=b.height,m=architecture.material(b);const o=shapeMesh(pts,[roofMat,architecture.facadeMaterial(b)],h,b.holes||[]);const g=o.geometry;architecture.mapWalls(b,g);if(b.replaceWithParts)o.visible=false;const p=g.attributes.position;const indices=g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i);world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(p.array),new Uint32Array(indices)));
if(!b.replaceWithParts)architecture.roof(b);
const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;facadeQueue.push({b,i,cx,cz});if(Math.hypot(cx,cz+14)<55||profile(b)==='piggy'||photoFacades.has(Number(b.id))||architecture.heritageIds.has(b.id)||architecture.elevationIds.has(b.id))detailBuilding(b,i,cx,cz);}
function detailBuilding(b,i,cx,cz){if(facades.has(b.id))return;facades.add(b.id);if(!b.replaceWithParts)architecture.detail(b);if(profile(b))landmarksBuilt.add(profile(b));}
cityMap.buildings.forEach(solidBuilding);
const mapped=addMappedDetails({scene,cityMap,mat,shapeMesh,ribbon,clearPoint,roadPaths,nearPath,architecture});
const district=installDistrict({scene,cityMap,mat,ribbon,shapeMesh,roadPaths,nearPath,atPath,clearPoint,offRoad,addObstacle,box,staticMeshes});
// Extra curb ribbons only on the known main road; all placement is approximate scenery.
for(const side of [-1,1])ribbon(streetRoad.points,.14,side*(spawnWidth/2+.08),.075,curbMat);
// An actual street name, not an invented business or address.
const signP=atPath(sidewalks[1],Math.min(4,sidewalks[1].length*.35));
box(signMetal,signP.x,1.0,signP.z,.075,2,.075);
const sign=box(label(cityMap.spawn.street),signP.x,2.02,signP.z,2.4,.46,.08);
sign.rotation.y=signP.yaw+Math.PI/2;
const signBack=box(signMetal,signP.x,2.02,signP.z,2.42,.48,.055);signBack.rotation.y=sign.rotation.y;

for(const side of [-1,1])for(const z of [-14-spawnHalf*.8,-14,-14+spawnHalf*.8])lampSites.push(new T.Vector3(side*(spawnWidth/2+.6),3.1,z));
// Merge static geometry in spatial chunks. UVs, materials and collision geometry are preserved.
function batchStatic(){const groups=new Map();staticBefore+=staticMeshes.length;for(const o of staticMeshes){const key=o.material.uuid+':'+(o.geometry.index?'i':'n')+':'+Math.floor(o.position.x/14)+':'+Math.floor(o.position.z/14);let g=groups.get(key);if(!g){g={material:o.material,meshes:[]};groups.set(key,g)}g.meshes.push(o)}
for(const g of groups.values()){if(g.meshes.length===1){staticAfter++;continue}const gs=g.meshes.map(o=>{o.updateMatrix();return o.geometry.clone().applyMatrix4(o.matrix)});const merged=mergeGeometries(gs,false);for(const b of gs)b.dispose();if(!merged){staticAfter+=g.meshes.length;continue}merged.computeBoundingBox();merged.computeBoundingSphere();const o=new T.Mesh(merged,g.material);o.castShadow=true;o.receiveShadow=true;scene.add(o);for(const old of g.meshes){scene.remove(old);old.geometry.dispose()}staticAfter++}staticMeshes.length=0}
batchStatic();batchRoads();
let detailClock=0;function detailNearby(dt,force=false){detailClock+=dt;if(!force&&detailClock<.30)return;detailClock=0;const pending=facadeQueue.filter(f=>!facades.has(f.b.id)&&Math.hypot(f.cx-pos.x,f.cz-pos.z)<65).sort((a,b)=>Math.hypot(a.cx-pos.x,a.cz-pos.z)-Math.hypot(b.cx-pos.x,b.cz-pos.z));for(const f of pending.slice(0,force?8:2))detailBuilding(f.b,f.i,f.cx,f.cz);if(staticMeshes.length){batchStatic();sun.shadow.needsUpdate=true}}
for(let i=0;i<(mobile?4:6);i++){const l=new T.PointLight(0xffb35b,12,8,2);lamps.push(l);scene.add(l)}
function updateLamps(p){const near=lampSites.slice().sort((a,b)=>a.distanceToSquared(p)-b.distanceToSquared(p));lamps.forEach((l,i)=>l.position.copy(near[i]))}
const texJobs=[['Asphalt031',asphalt],['PavingStones138',paving],['Bricks097',brick],['Concrete034',concrete],['PaintedPlaster015',plaster]];
async function materials(){for(const [name,m] of texJobs){const ts=await Promise.all(['Color','NormalGL','Roughness'].map(f=>tex.loadAsync(base+'tex/'+name+'/'+f+'.webp')));for(const t of ts){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=4;}ts[0].colorSpace=T.SRGBColorSpace;[m.map,m.normalMap,m.roughnessMap]=ts;m.color.setHex(name.toLowerCase().includes('asphalt')?0x77777a: name.toLowerCase().includes('paving')?0xa8a7a4:0xffffff);m.needsUpdate=true}for(const [m,src] of [[landmarkStone,concrete],[landmarkCream,plaster],[landmarkBrick,brick],[landmarkRose,plaster]]){m.map=src.map;m.normalMap=src.normalMap;m.roughnessMap=src.roughnessMap;m.needsUpdate=true}if(paving.map){const t=paving.map.clone();t.repeat.set(480,480);t.needsUpdate=true;groundMat.map=concrete.map||t;groundMat.color.setHex(0x777570);groundMat.needsUpdate=true}for(const style of wallStyles){style.m.map=style.base.map;style.m.normalMap=style.base.normalMap;style.m.roughnessMap=style.base.roughnessMap;style.m.color.setHex(style.c);style.m.needsUpdate=true}}
async function lighting(){const hdr=await new RGBELoader().loadAsync(base+'sky.hdr');hdr.mapping=T.EquirectangularReflectionMapping;scene.environment=hdr;scene.background=hdr;scene.backgroundBlurriness=.08;scene.backgroundIntensity=.8;scene.fog.color.set(0xb5c9d6);scene.environmentIntensity=.9;}
const people=[],animCache=new Map(),actorAssets=new Map(),cars=[];
async function character(id,gender,x,z,hero=false,register=true){let a=actorAssets.get(id);if(!a){a=await loader.loadAsync(base+'people/'+id+'.glb');actorAssets.set(id,a)}let clips=animCache.get(gender);if(!clips){clips=(await loader.loadAsync(base+'people/anims_'+gender+'.glb')).animations;animCache.set(gender,clips)}
const model=cloneSkeleton(a.scene),root=new T.Group(),fit=new T.Group();root.add(fit);fit.add(model);scene.add(root);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m?.isMeshStandardMaterial){m.roughness=Math.max(.66,m.roughness);m.metalness=0}}}});
const mixer=new T.AnimationMixer(model),names=new Set();model.traverse(o=>names.add(o.name));
const actions={};for(const [k,n] of Object.entries({idle:'idle_relaxed',walk:'walk',run:'dash',talk:'select_idle',jumpStart:'jump_start',jumpLoop:'jump_loop',jumpLand:'jump_land',crouch:'crouch',hit:'hit_body',down:'ko'})){const c=clips.find(c=>c.name===n);if(!c){if(['idle','walk','run','talk'].includes(k))throw Error('Missing '+n);continue}const tracks=c.tracks.filter(t=>names.has(t.name.split('.')[0]));if(tracks.length<12)throw Error(id+' animation binding '+n+' '+tracks.length);actions[k]=mixer.clipAction(new T.AnimationClip(k,c.duration,tracks));if(['jumpStart','jumpLand','down','hit'].includes(k)){actions[k].setLoop(T.LoopOnce,1);actions[k].clampWhenFinished=true}}
actions.idle.play();mixer.update(.01);model.updateMatrixWorld(true);const b=new T.Box3().setFromObject(model,true);const height=b.max.y-b.min.y;if(!Number.isFinite(height)||height<.01)throw Error('Invalid bounds '+id);const scale=1.78/height;fit.scale.setScalar(scale);fit.position.set(-(b.min.x+b.max.x)*scale/2,-b.min.y*scale,-(b.min.z+b.max.z)*scale/2);root.position.set(x,hero?0:.14,z);
const obj={id,root,fit,mixer,actions,state:'idle',x,z,dir:1,hero,ground:hero?0:.06};if(!hero)root.position.y=.06;if(register){people.push(obj);if(!hero)npcCollider(obj)}return obj}
function npcCollider(a){a.coll=world.createCollider(RAPIER.ColliderDesc.capsule(.53,.28).setTranslation(a.root.position.x,.87,a.root.position.z))}
function animate(a,state){if(a.state===state)return;let before=a.actions[a.state],next=a.actions[state];if(!next)return;next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();if(before)before.crossFadeTo(next,.22,false);a.state=state;}
// Custom hero: preserve authored skin, materials and native locomotion clips.
const HERO_BONES={Pelvis:'Bip01_Pelvis',Spine:'Bip01_Spine',Chest:'Bip01_Spine2',Neck:'Bip01_Neck',Head:'Bip01_Head'};
for(const side of ['L','R'])for(const [target,source] of Object.entries({Clavicle:'Clavicle',UpperArm:'UpperArm',Forearm:'Forearm',Hand:'Hand',Thigh:'Thigh',Shin:'Calf',Foot:'Foot',Toe:'Toe0'}))HERO_BONES[side+target]='Bip01_'+side+'_'+source;
function worldQ(o){return o.getWorldQuaternion(new T.Quaternion())}
function worldP(o){return o.getWorldPosition(new T.Vector3())}
function playPose(mixer,clip,t){mixer.stopAllAction();const a=mixer.clipAction(clip);a.reset().setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();mixer.update(t);}
// Map changes from Rocketbox idle world-space joint orientations to the custom hero idle pose.
// Rebuild each local rotation from its actual parent; do not copy incompatible bone translations.
function adaptJump(source,target,srcClips,native){const sm=new T.AnimationMixer(source),tm=new T.AnimationMixer(target);
const sb={},tb={};for(const [a,b] of Object.entries(HERO_BONES)){sb[a]=source.getObjectByName(b);tb[a]=target.getObjectByName(a);if(!sb[a]||!tb[a])throw Error('Missing retarget bone '+a)}
const srcIdle=srcClips.find(c=>c.name==='idle_relaxed'),dstIdle=native.find(c=>c.name==='Idle');if(!srcIdle||!dstIdle)throw Error('Retarget idle reference missing');
playPose(sm,srcIdle,0);playPose(tm,dstIdle,0);source.updateMatrixWorld(true);target.updateMatrixWorld(true);
const sq={},tq={},baseLocal={};for(const k of Object.keys(tb)){sq[k]=worldQ(sb[k]);tq[k]=worldQ(tb[k]);baseLocal[k]=tb[k].quaternion.clone()}
const axisSign=o=>Math.sign(worldP(o.LUpperArm).x-worldP(o.RUpperArm).x);
const align=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),axisSign(sb)===axisSign(tb)?0:Math.PI),unalign=align.clone().invert();
const pelvis=tb.Pelvis.position.clone(),srcPelvis=worldP(sb.Pelvis),sourceLeg=Math.max(.01,srcPelvis.distanceTo(worldP(sb.LFoot))),targetLeg=Math.max(.01,worldP(tb.Pelvis).distanceTo(worldP(tb.LFoot)));
const out={};for(const [key,name] of Object.entries({jumpStart:'jump_start',jumpLoop:'jump_loop',jumpLand:'jump_land'})){
const c=srcClips.find(c=>c.name===name);if(!c)throw Error('Missing source '+name);
const times=[],values=Object.fromEntries(Object.keys(tb).map(k=>[k,[]])),hips=[],steps=Math.max(2,Math.ceil(c.duration*30));
for(let i=0;i<=steps;i++){const t=c.duration*i/steps;times.push(t);playPose(sm,c,t);source.updateMatrixWorld(true);
for(const k of Object.keys(tb))tb[k].quaternion.copy(baseLocal[k]);tb.Pelvis.position.copy(pelvis);target.updateMatrixWorld(true);
// Parent-first order follows the actual rig hierarchy.
const keys=Object.keys(tb).sort((a,b)=>depth(tb[a])-depth(tb[b]));
for(const k of keys){const delta=worldQ(sb[k]).multiply(sq[k].clone().invert());const desired=align.clone().multiply(delta).multiply(unalign).multiply(tq[k]);const parent=tb[k].parent?worldQ(tb[k].parent):new T.Quaternion();const q=parent.invert().multiply(desired).normalize();tb[k].quaternion.copy(q);tb[k].updateWorldMatrix(false,true);values[k].push(...q.toArray())}
const dy=T.MathUtils.clamp((worldP(sb.Pelvis).y-srcPelvis.y)*targetLeg/sourceLeg,-.24,.12);hips.push(pelvis.x,pelvis.y+dy,pelvis.z);
}
const tracks=Object.keys(tb).map(k=>new T.QuaternionKeyframeTrack(tb[k].name+'.quaternion',times,values[k]));tracks.push(new T.VectorKeyframeTrack(tb.Pelvis.name+'.position',times,hips));out[key]=new T.AnimationClip(key,c.duration,tracks)
}
sm.stopAllAction();tm.stopAllAction();for(const k of Object.keys(tb))tb[k].quaternion.copy(baseLocal[k]);tb.Pelvis.position.copy(pelvis);target.updateMatrixWorld(true);return out;
}
function depth(o){let d=0;while(o.parent){d++;o=o.parent}return d}
async function customHero(){
const a=await loader.loadAsync(base+'people/Andr%203-rigged.glb'),model=a.scene;
const source=await loader.loadAsync(base+'people/anims_male.glb');
const native=a.animations,extra=adaptJump(source.scene,model,source.animations,native);
const root=new T.Group(),fit=new T.Group();root.add(fit);fit.add(model);scene.add(root);
let skinned=0,vertices=0;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;if(o.isSkinnedMesh){skinned++;vertices+=o.geometry.attributes.position.count;o.frustumCulled=false}}});
if(skinned<1)throw Error('Custom hero has no skinned mesh');
const mixer=new T.AnimationMixer(model),actions={};
for(const [k,n] of Object.entries({idle:'Idle',walk:'Walk',run:'Run'})){const c=native.find(c=>c.name===n);if(!c)throw Error('Missing hero clip '+n);actions[k]=mixer.clipAction(c)}
for(const [k,c] of Object.entries(extra)){actions[k]=mixer.clipAction(c);if(k!=='jumpLoop'){actions[k].setLoop(T.LoopOnce,1);actions[k].clampWhenFinished=true}}
actions.idle.play();mixer.update(.01);model.updateMatrixWorld(true);
const b=new T.Box3().setFromObject(model,true),height=b.max.y-b.min.y;
if(!Number.isFinite(height)||height<.8||height>3)throw Error('Custom hero bounds '+height);
const scale=1.78/height;fit.scale.setScalar(scale);fit.position.set(-(b.min.x+b.max.x)*scale/2,-b.min.y*scale,-(b.min.z+b.max.z)*scale/2);
root.position.set(0,0,-14);
const hero={id:'Andr 3-rigged',root,fit,mixer,actions,state:'idle',x:0,z:-14,dir:1,hero:true,ground:0,skinned,vertices};people.push(hero);return hero;
}

let hero=null,body=null,collider=null,driving=null,jumpH=0,jumpV=0,jumpTime=0,jumpPeak=0,landTime=0,jumpQueued=false,impacts=0,ejections=0;const carController=world.createCharacterController(.04);const pos=new T.Vector3(0,0,-14),velocity=new T.Vector2(),look=new T.Vector3(),desired=new T.Vector3();
const input={x:0,y:0},keys={};let last=performance.now(),fpsLast=last,low=0;
function move(dt){if(driving){driveStep(dt);return}if(jumpQueued&&jumpH===0){jumpV=4.8;jumpTime=0;landTime=0;controller.disableSnapToGround?.();}jumpQueued=false;const wasAir=jumpH>0||jumpV>0;if(wasAir){jumpV-=9.81*dt;jumpTime+=dt}landTime=Math.max(0,landTime-dt);let x=input.x+(keys.KeyD?1:0)-(keys.KeyA?1:0),z=-input.y+(keys.KeyW?1:0)-(keys.KeyS?1:0),l=Math.max(1,Math.hypot(x,z));const speed=sprint||keys.ShiftLeft?3.8:1.45;let vx=(-Math.cos(yaw)*x+Math.sin(yaw)*z)*speed/l,vz=(Math.sin(yaw)*x+Math.cos(yaw)*z)*speed/l;const a=1-Math.exp(-dt*12);velocity.x+=(vx-velocity.x)*a;velocity.y+=(vz-velocity.y)*a;controller.computeColliderMovement(collider,{x:velocity.x*dt,y:wasAir?jumpV*dt:0,z:velocity.y*dt});const d=controller.computedMovement(),p=body.translation();let nx=p.x+d.x,nz=p.z+d.z;if(!inMap(nx,nz)){nx=p.x;nz=p.z}if(wasAir){if(jumpV>0&&d.y<jumpV*dt-.005)jumpV=0;jumpH=Math.max(0,jumpH+d.y);if(jumpH<.001&&jumpV<=0){jumpH=0;jumpV=0;landTime=.18;controller.enableSnapToGround(.24)}jumpPeak=Math.max(jumpPeak,jumpH)}const targetY=FOOT+GROUND_MARGIN+jumpH;body.setNextKinematicTranslation({x:nx,y:targetY,z:nz});world.timestep=dt;world.step();const q=body.translation();if(!Number.isFinite(q.x)||!Number.isFinite(q.z)||Math.abs(q.y-targetY)>.005){body.setTranslation({x:Number.isFinite(q.x)?nx:0,y:targetY,z:Number.isFinite(q.z)?nz:-14},true)}pos.set(nx,jumpH,nz);hero.root.position.copy(pos);const v=Math.hypot(d.x,d.z)/dt;if(v>.12){const target=Math.atan2(d.x,d.z);let diff=Math.atan2(Math.sin(target-hero.root.rotation.y),Math.cos(target-hero.root.rotation.y));hero.root.rotation.y+=diff*(1-Math.exp(-dt*10))}const walkState=v>.12?(speed>2?'run':'walk'):'idle';animate(hero,jumpH>0?(jumpTime<.18?'jumpStart':'jumpLoop'):landTime>0?'jumpLand':walkState);if(['run','walk'].includes(hero.state)&&v>.12)hero.actions[hero.state].setEffectiveTimeScale(T.MathUtils.clamp(v/speed,.65,1.3));hero.mixer.update(dt)}
function updateCamera(dt,instant=false){let forward=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw)),anchor=pos.clone().add(new T.Vector3(0,view===3?1.52:1.65,0));desired.copy(anchor);if(driving&&view===1){desired.addScaledVector(forward,.9);desired.y=1.55}if(view===3){desired.addScaledVector(forward,driving?-6.2:-3.25);desired.y+=driving?1.3:.62;const delta=desired.clone().sub(anchor),dist=delta.length();const hit=world.castRay(new RAPIER.Ray(anchor,delta.normalize()),dist,true,undefined,undefined,driving?driving.coll:collider);if(hit&&Number.isFinite(hit.timeOfImpact))desired.copy(anchor).addScaledVector(delta,T.MathUtils.clamp(hit.timeOfImpact-.15,.35,dist))}desired.y=Math.max(1.45,desired.y);if(instant||view===1||!Number.isFinite(camera.position.y)||camera.position.y<1.2)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-dt*12));camera.position.y=Math.max(1.45,camera.position.y);look.copy(camera.position).addScaledVector(forward,10);look.y+=Math.tan(pitch)*10;camera.lookAt(look);if(hero)hero.root.visible=view===3&&!driving;}
const npcFrustum=new T.Frustum(),npcVP=new T.Matrix4(),npcSphere=new T.Sphere(new T.Vector3(),1.25);
function overlapsCar(x,z,c,margin=.32){const dx=x-c.root.position.x,dz=z-c.root.position.z,h=c.heading;return Math.abs(dx*Math.sin(h)+dz*Math.cos(h))<c.length/2+margin&&Math.abs(dx*Math.cos(h)-dz*Math.sin(h))<.95+margin}
function npcFree(a,x,z,exceptCar=null){return inMap(x,z)&&clearPoint(x,z,.34)&&!obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<o.r+.34)&&!cars.some(c=>c!==exceptCar&&overlapsCar(x,z,c))&&!people.some(o=>o!==a&&Math.hypot(x-o.root.position.x,z-o.root.position.z)<.68)}
function setNPC(a,x,z){a.x=x;a.z=z;a.root.position.set(x,.06,z);a.coll?.setTranslation({x,y:.87,z})}
function downNPC(a,c){if(a.downUntil)return;impacts++;a.downUntil=simSteps+210;a.coll?.setEnabled(false);animate(a,a.actions.down?'down':'hit');let dx=a.x-c.root.position.x,dz=a.z-c.root.position.z,n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;for(const l of [2.0,1.4,.8])if(npcFree(a,a.x+dx*l,a.z+dz*l,c)){setNPC(a,a.x+dx*l,a.z+dz*l);break}a.detached=true}
function npcStep(dt,time){camera.updateMatrixWorld(true);npcVP.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);npcFrustum.setFromProjectionMatrix(npcVP);
for(const a of people){if(a.hero)continue;const dist=a.root.position.distanceTo(pos);npcSphere.center.copy(a.root.position);npcSphere.center.y+=.9;a.root.visible=dist<42&&npcFrustum.intersectsSphere(npcSphere);
if(a.downUntil){if(simSteps>=a.downUntil&&npcFree(a,a.x,a.z)){a.downUntil=0;a.coll?.setEnabled(true);animate(a,'idle')}else{if(a.root.visible)a.mixer.update(dt);continue}}
if(!a.route||a.detached){animate(a,'idle');if(a.root.visible)a.mixer.update(dt);continue}
let ns=a.s+dt*a.dir*a.speed;if(ns>a.route.length||ns<0){ns=T.MathUtils.clamp(ns,0,a.route.length);a.dir*=-1}
const p=atPath(a.route,ns),target=p.yaw+(a.dir<0?Math.PI:0);if(npcFree(a,p.x,p.z)){a.s=ns;setNPC(a,p.x,p.z);let diff=Math.atan2(Math.sin(target-a.root.rotation.y),Math.cos(target-a.root.rotation.y));a.root.rotation.y+=diff*(1-Math.exp(-dt*9));animate(a,'walk');a.actions.walk.setEffectiveTimeScale(a.speed/1.3)}else{animate(a,'idle');if(time>(a.turnUntil||0)&&dist>1.2){a.dir*=-1;a.turnUntil=time+1.3}}
if(a.root.visible)a.mixer.update(dt)}}
function render(dt=0){renderer.info.autoReset=false;renderer.info.reset();camera.updateMatrixWorld(true);if(composer)composer.render(dt);else renderer.render(scene,camera);drawCalls=renderer.info.render.calls;}
let physicsCarry=0,lightClock=0,high=0,simSteps=0,streetClock=0;
const namedStreetPaths=roadPaths.filter(({r})=>r.name&&!['footway','steps','path','cycleway'].includes(r.type));
function updateStreetName(){let best=null,d=Infinity;for(const {r,path} of namedStreetPaths){const q=nearPath(path,pos.x,pos.z).distance;if(q<d){d=q;best=r.name}}if(best&&d<60)$('where').textContent=best;}const physicsStep=1/60;
function tick(t){requestAnimationFrame(tick);if(!started)return;if(!$('mapPanel').hidden||!$('placesPanel').hidden||!$('settingsPanel').hidden){last=t;return}if(mobile&&t-last<30)return;const dt=Math.min(.15,Math.max(.001,(t-last)/1000));last=t;physicsCarry+=dt;while(physicsCarry>=physicsStep){trafficStep(physicsStep);move(physicsStep);simSteps++;physicsCarry-=physicsStep}updateCamera(dt);npcStep(dt,t/1000);detailNearby(dt);navigation.tick();updateMiniMap();updateInteraction();streetClock+=dt;if(streetClock>.7){streetClock=0;updateStreetName()}shadowClock+=dt;lightClock+=dt;if(shadowClock>.065){sun.target.position.set(pos.x,0,pos.z);sun.position.set(pos.x-14,22,pos.z-11);sun.shadow.needsUpdate=true;shadowClock=0}if(lightClock>.4){updateLamps(pos);lightClock=0}render(dt);frames++;
if(t-fpsLast>2000){fps=frames*1000/(t-fpsLast);frames=0;fpsLast=t;$('info').textContent=Math.round(fps)+' FPS · '+Math.round(renderScale*100)+'% · '+people.length+' чел.';if(fps<25){high=0;if(++low>=2&&renderScale>.66){renderScale=Math.max(.66,renderScale-.10);resize();low=0}}else{low=0;if(fps>29&&++high>=5&&renderScale<1){renderScale=Math.min(1,renderScale+.05);resize();high=0}}}}
const audio=new Audio(base+'city.mp3');audio.loop=true;audio.volume=.35;$('audio').onclick=()=>{if(audio.paused)audio.play().then(()=>$('audio').classList.add('active')).catch(console.warn);else{audio.pause();$('audio').classList.remove('active')}};
$('run').onclick=()=>{sprint=!sprint;$('run').classList.toggle('active',sprint)};$('view').onclick=()=>{view=view===3?1:3;$('view').textContent='ВИД: '+view;updateCamera(.016,true)};$('update').onclick=updateGame;$('updateMenu').onclick=updateGame;
async function updateGame(){const u=new URL(location.href);u.searchParams.set('refresh',String(Date.now()));try{const r=await fetch(new URL('./version.json?refresh='+Date.now(),location.href),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const v=await r.json();u.searchParams.set('v',v.version);const reg=await navigator.serviceWorker?.getRegistration();await reg?.update().catch(()=>{});location.replace(u.href)}catch(e){$('info').textContent='Не удалось проверить обновление';$('status').textContent='Не удалось проверить обновление. Проверь интернет.'}}
$('jump').onclick=()=>{if(!driving)jumpQueued=true};addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='Space'&&!e.repeat&&!driving){e.preventDefault();jumpQueued=true}});addEventListener('keyup',e=>keys[e.code]=false);
let jid=null,lid=null,px=0,py=0,pedal=0;for(const [id,v] of [['gas',1],['brake',-1]]){const e=$(id);e.onpointerdown=ev=>{e.setPointerCapture(ev.pointerId);pedal=v;e.classList.add('active')};e.onpointerup=e.onpointercancel=e.onlostpointercapture=()=>{pedal=0;e.classList.remove('active')}}
$('joy').onpointerdown=e=>{jid=e.pointerId;$('joy').setPointerCapture(jid);joy(e)};function joy(e){const r=$('joy').getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,d=Math.max(r.width*.32,Math.hypot(x,y));input.x=x/d;input.y=y/d;$('knob').style.transform='translate('+input.x*29+'px,'+input.y*29+'px)'}$('joy').onpointermove=e=>{if(e.pointerId===jid)joy(e)};$('joy').onpointerup=$('joy').onpointercancel=()=>{jid=null;input.x=input.y=0;$('knob').style.transform='none'};
cv.onpointerdown=e=>{lid=e.pointerId;px=e.clientX;py=e.clientY;cv.setPointerCapture(lid)};cv.onpointermove=e=>{if(lid!==e.pointerId)return;yaw-=(e.clientX-px)*.007;pitch=T.MathUtils.clamp(pitch-(e.clientY-py)*.005,-.85,.65);px=e.clientX;py=e.clientY};cv.onpointerup=cv.onpointercancel=()=>lid=null;
$('shot').onclick=()=>{render();const data=cv.toDataURL('image/jpeg',.9);$('image').src=data;$('save').href=data;$('photo').style.display='flex'};$('close').onclick=()=>$('photo').style.display='none';
// Vehicles follow the actual street centreline with lane offsets. No fake road graph.
async function trafficInit(){const ids=['real-sedan','real-suv','real-hatchback','real-sedan'],lengths=[4.91,4.65,4.1,4.91],dirs=[1,-1,1,-1],starts=[spawnAlong-25,spawnAlong+26,spawnAlong-52,spawnAlong+2.6],models=new Map();
for(let i=0;i<ids.length;i++){let a=models.get(ids[i]);if(!a){a=await loader.loadAsync(base+'cars/'+ids[i]+'.glb');models.set(ids[i],a)}const model=a.scene.clone(true),root=new T.Group();root.add(model);model.updateMatrixWorld(true);let b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3());if(size.x>size.z){model.rotation.y+=Math.PI/2;model.updateMatrixWorld(true);b.setFromObject(model);b.getSize(size)}const k=lengths[i]/size.z;model.scale.multiplyScalar(k);model.updateMatrixWorld(true);b.setFromObject(model);const center=b.getCenter(new T.Vector3());model.position.sub(new T.Vector3(center.x,b.min.y,center.z));const wheels=[];model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}if(/^wheel_(fl|fr|rl|rr)$/i.test(o.name))wheels.push({node:o,base:o.rotation.x})});scene.add(root);const parked=i===3,dir=dirs[i],lane=parked?1.8:-dir*1.45,range=safeLane(lane,lengths[i]),s=T.MathUtils.clamp(starts[i],range[0],range[1]),p=atPath(streetPath,s,lane),heading=p.yaw+(dir<0?Math.PI:0);
root.position.set(p.x,.025,p.z);root.rotation.y=heading;
const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x,.72,p.z).setRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)}));
const coll=world.createCollider(RAPIER.ColliderDesc.cuboid(.9,.70,lengths[i]/2),body);const c={id:parked?'parked-sedan':ids[i],root,body,coll,wheels,length:lengths[i],s,dir,lane,range,speed:0,roll:0,heading,travel:0,parked};cars.push(c);if(!parked){const driver=await character('agent','male',0,0,false,false);driver.root.scale.setScalar(.83);root.add(driver.root);driver.root.position.set(.42,.18,.15);if(driver.actions.crouch){animate(driver,'crouch');driver.mixer.update(.25)}c.driver=driver}}}
function trafficStep(dt){for(const c of cars){if(c.parked||c===driving)continue;if(c.driver)c.driver.root.visible=c.root.position.distanceTo(pos)<18;const p=atPath(streetPath,c.s,c.lane),h=p.yaw+(c.dir<0?Math.PI:0),fx=Math.sin(h),fz=Math.cos(h);
let stop=false;for(const other of [{root:{position:pos},length:.7},...cars.filter(o=>o!==c),...people.filter(o=>!o.hero)]){const q=other.root.position,dx=q.x-p.x,dz=q.z-p.z,ahead=dx*fx+dz*fz,across=Math.abs(dx*fz-dz*fx);if(ahead>0&&ahead<c.length/2+(other.length||.6)/2+2.8&&across<1.45){stop=true;break}}
let speedGoal=stop?0:5.5;c.speed=T.MathUtils.lerp(c.speed,speedGoal,1-Math.exp(-dt*(stop?9:2)));let next=c.s+c.dir*c.speed*dt;
if(next<c.range[0]||next>c.range[1]){const reset=c.dir>0?c.range[0]:c.range[1],q=atPath(streetPath,reset,c.lane);const far=pos.distanceTo(c.root.position)>40&&Math.hypot(pos.x-q.x,pos.z-q.z)>40;if(far&&!cars.some(o=>o!==c&&Math.hypot(o.root.position.x-q.x,o.root.position.z-q.z)<7)){next=reset}else{next=T.MathUtils.clamp(next,...c.range);c.speed=0}}
const q=atPath(streetPath,next,c.lane);if(!carClear(q,c.length)){next=c.s;c.speed=0}
const moved=Math.abs(next-c.s);if(moved<1)c.travel+=moved;c.s=next;const n=atPath(streetPath,c.s,c.lane),target=n.yaw+(c.dir<0?Math.PI:0);c.heading+=Math.atan2(Math.sin(target-c.heading),Math.cos(target-c.heading))*Math.min(1,dt*8);c.root.position.set(n.x,.025,n.z);c.root.rotation.y=c.heading;c.body.setNextKinematicTranslation({x:n.x,y:.72,z:n.z});c.body.setNextKinematicRotation({x:0,y:Math.sin(c.heading/2),z:0,w:Math.cos(c.heading/2)});c.roll+=c.speed*dt/.32;for(const w of c.wheels)w.node.rotation.x=w.base+c.roll}}
// Player-controlled vehicle: a kinematic arcade controller with actual Rapier collision queries.
const action=$('carAction'),driveHint=$('driveHint');
function doorDistance(c){const h=c.heading,dx=Math.cos(h)*1.02,dz=-Math.sin(h)*1.02,x=c.root.position.x,z=c.root.position.z;return Math.min(Math.hypot(pos.x-x-dx,pos.z-z-dz),Math.hypot(pos.x-x+dx,pos.z-z+dz))}
function nearbyCar(){return cars.filter(c=>c.root.position.distanceTo(pos)<4.25&&c!==driving).sort((a,b)=>doorDistance(a)-doorDistance(b))[0]}
function updateInteraction(){const c=driving||nearbyCar();action.hidden=!c;action.textContent=driving?'ВЫЙТИ':c?.driver?'ЗАБРАТЬ '+({ 'real-sedan':'СЕДАН','real-suv':'ВНЕДОРОЖНИК','real-hatchback':'ХЕТЧБЭК'}[c.id]||'МАШИНУ'):'СЕСТЬ В МАШИНУ';action.disabled=!!driving&&Math.abs(driving.speed)>.4;$('pedals').hidden=!driving;driveHint.hidden=!driving;driveHint.textContent=driving?Math.round(Math.abs(driving.speed)*3.6)+' км/ч':''}
function syncHero(x,z){jumpH=jumpV=landTime=0;jumpQueued=false;controller.enableSnapToGround(.24);pos.set(x,0,z);body.setTranslation({x,y:FOOT+GROUND_MARGIN,z},true);hero.root.position.copy(pos);velocity.set(0,0)}
function enterCar(c){if(!c||driving)return;if(c.driver){const a=c.driver;let spot=null;for(const l of [2.0,2.8,3.4])for(const sign of [1,-1]){const x=c.root.position.x+Math.cos(c.heading)*sign*l,z=c.root.position.z-Math.sin(c.heading)*sign*l;if(!spot&&npcFree(a,x,z,c))spot={x,z}}if(!spot)return;c.driver=null;scene.add(a.root);a.root.scale.setScalar(1);a.root.rotation.set(0,c.heading,0);a.root.visible=true;setNPC(a,spot.x,spot.z);a.detached=true;people.push(a);npcCollider(a);animate(a,a.actions.hit?'hit':'idle');a.downUntil=simSteps+85;a.coll.setEnabled(false);ejections++}driving=c;c.parked=true;c.speed=0;sprint=false;$('run').classList.remove('active');$('run').hidden=true;$('jump').hidden=true;collider.setEnabled(false);syncHero(c.root.position.x,c.root.position.z);yaw=c.heading;view=3;pitch=-.12;$('view').textContent='ВИД: 3';updateCamera(.016,true);updateInteraction()}
function exitCar(){if(!driving||Math.abs(driving.speed)>.4)return;const c=driving,h=c.heading;for(const sign of [1,-1]){const x=c.root.position.x+Math.cos(h)*sign*1.6,z=c.root.position.z-Math.sin(h)*sign*1.6;if(!clearPoint(x,z,.4)||cars.some(o=>o!==c&&Math.hypot(o.root.position.x-x,o.root.position.z-z)<2)||people.some(o=>!o.hero&&Math.hypot(o.x-x,o.z-z)<.7))continue;driving=null;pedal=0;c.speed=0;syncHero(x,z);collider.setEnabled(true);$('run').hidden=false;$('jump').hidden=false;view=3;pitch=-.1;yaw=h;hero.root.rotation.y=h;$('view').textContent='ВИД: 3';updateCamera(.016,true);updateInteraction();return}}
action.onclick=()=>driving?exitCar():enterCar(nearbyCar());
function driveStep(dt){const c=driving,gas=T.MathUtils.clamp(pedal||(-input.y+(keys.KeyW?1:0)-(keys.KeyS?1:0)),-1,1),steer=T.MathUtils.clamp(input.x+(keys.KeyD?1:0)-(keys.KeyA?1:0),-1,1);const target=gas>=0?gas*14:gas*4.0;c.speed=T.MathUtils.lerp(c.speed,target,1-Math.exp(-dt*(Math.abs(gas)>.05?2.3:5)));if(Math.abs(c.speed)<.015)c.speed=0;
const oldH=c.heading,h=oldH-steer*Math.min(1.0,Math.abs(c.speed)*.28)*Math.sign(c.speed)*dt;
const x=c.root.position.x,z=c.root.position.z,dx=Math.sin(h)*c.speed*dt,dz=Math.cos(h)*c.speed*dt;
if(Math.abs(c.speed)>2){for(const a of people){if(a.hero||a.downUntil)continue;const px=a.x-(x+dx),pz=a.z-(z+dz);if(Math.abs(px*Math.sin(h)+pz*Math.cos(h))<c.length/2+.34&&Math.abs(px*Math.cos(h)-pz*Math.sin(h))<1.27)downNPC(a,c)}}carController.computeColliderMovement(c.coll,{x:dx,y:0,z:dz},undefined,undefined,col=>col.handle!==groundCollider.handle&&col.handle!==collider.handle);const m=carController.computedMovement();let nx=x+m.x,nz=z+m.z;const wanted=Math.hypot(dx,dz),actual=Math.hypot(m.x,m.z);let heading=h;
if(!carClear({x:nx,z:nz,yaw:h},c.length)){heading=oldH;if(!carClear({x:nx,z:nz,yaw:oldH},c.length)){nx=x;nz=z}}if(!inMap(nx,nz)){nx=x;nz=z;heading=oldH}
const moved=Math.hypot(nx-x,nz-z);if(wanted>.001&&moved<wanted*.20)c.speed*=Math.exp(-dt*5);else if(wanted>.001&&moved<wanted*.72)c.speed*=Math.exp(-dt*.75);c.heading=heading;c.root.position.set(nx,.025,nz);c.root.rotation.y=heading;c.body.setNextKinematicTranslation({x:nx,y:.72,z:nz});c.body.setNextKinematicRotation({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)});c.travel+=moved;
c.roll+=c.speed*dt/.32;for(const w of c.wheels)w.node.rotation.x=w.base+c.roll;syncHero(c.root.position.x,c.root.position.z);yaw=c.heading;world.timestep=dt;world.step()}
const mm=$('minimap'),mc=mm.getContext('2d');let miniTime=0;
function updateMiniMap(force=false){const t=performance.now();if(!force&&t-miniTime<125)return;miniTime=t;const n=mm.width,scale=2.0;mc.clearRect(0,0,n,n);mc.fillStyle='#192125';mc.fillRect(0,0,n,n);mc.save();mc.translate(n/2,n/2);mc.rotate(yaw);const point=(x,z)=>[-(x-pos.x)*scale,-(z-pos.z)*scale];
for(const p of cityMap.water||[]){mc.fillStyle='#415d6a';mc.beginPath();for(const ring of [p.points,...(p.holes||[])]){ring.forEach(([x,z],i)=>{const q=point(x,z);i?mc.lineTo(...q):mc.moveTo(...q)});mc.closePath()}mc.fill('evenodd')}
mc.fillStyle='#555e63';for(const b of buildingBounds){if(b.minX>pos.x+80||b.maxX<pos.x-80||b.minZ>pos.z+80||b.maxZ<pos.z-80)continue;mc.beginPath();b.points.forEach(([x,z],i)=>{const p=point(x,z);i?mc.lineTo(...p):mc.moveTo(...p)});mc.closePath();mc.fill()}
mc.strokeStyle='#a9abad';mc.lineCap='round';for(const r of cityMap.roads){if(!r.points.some(([x,z])=>Math.abs(x-pos.x)<150&&Math.abs(z-pos.z)<150))continue;mc.lineWidth=Math.max(1,r.width*scale*.55);mc.beginPath();r.points.forEach(([x,z],i)=>{const p=point(x,z);i?mc.lineTo(...p):mc.moveTo(...p)});mc.stroke()}
navigation.drawMini(mc,point);for(const c of cars){mc.fillStyle='#b5d8ee';mc.beginPath();mc.arc(...point(c.root.position.x,c.root.position.z),3,0,Math.PI*2);mc.fill()}mc.restore();mc.fillStyle='#e9a568';mc.beginPath();mc.moveTo(n/2,n/2-7);mc.lineTo(n/2-5,n/2+5);mc.lineTo(n/2+5,n/2+5);mc.closePath();mc.fill()}
const placePanel=$('placesPanel');const navigation=createNavigation(cityMap,()=>({x:pos.x,z:pos.z,yaw,driving:!!driving}),()=>{input.x=input.y=pedal=0;Object.keys(keys).forEach(k=>keys[k]=false)});$('places').onclick=()=>navigation.open();mm.onclick=()=>navigation.open();$('placesClose').onclick=()=>placePanel.hidden=true;$('teleports').onclick=()=>{navigation.close();placePanel.hidden=false};$('settings').onclick=()=>{$('settingsPanel').hidden=false};$('settingsClose').onclick=()=>{$('settingsPanel').hidden=true};
function goPlace(p){if(driving)return;let best=null;const [x,z]=p.position;for(const {r,path} of roadPaths){if(['steps'].includes(r.type))continue;const near=nearPath(path,x,z);for(const d of [0,-2,2,-6,6]){const q=atPath(path,near.along+d);const dist=Math.hypot(x-q.x,z-q.z);if((!best||dist<best.dist)&&inMap(q.x,q.z)&&clearPoint(q.x,q.z,.55)&&!cars.some(c=>overlapsCar(q.x,q.z,c,.6)))best={...q,dist}}}if(!best)return;syncHero(best.x,best.z);yaw=best.yaw;updateCamera(.016,true);detailNearby(1,true);updateMiniMap(true);placePanel.hidden=true;$('where').textContent=p.name;}
for(const p of [{name:cityMap.spawn.street,position:[0,-14]},...(cityMap.places||[])]){const b=document.createElement('button');b.textContent=p.name;b.onclick=()=>goPlace(p);$('placeList').append(b)}
async function prop(n,x,z,scale=1,y=0,rot=0){const a=await loader.loadAsync(base+'props/'+n+'.glb');const o=a.scene;o.scale.setScalar(scale);o.position.set(x,y,z);o.rotation.y=rot;o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true}});scene.add(o);decor.push(o);if(n!=='water_manhole_cover')addObstacle(x,z,n.includes('trash')?.32:.19,n.includes('lamp')?3:1);sun.shadow.needsUpdate=true}
async function vegetation(){const asset=await loader.loadAsync(base+'props/plane-tree.glb'),sites=[];for(const side of [-1,1])for(let s=spawnAlong-30;s<spawnAlong+30;s+=7){const p=atPath(streetPath,s,side*(spawnWidth/2+3.1));if(clearPoint(p.x,p.z,1.3)&&offRoad(p.x,p.z,1.4)&&sites.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>6))sites.push(p)}for(const p of sites.slice(0,4)){const o=asset.scene.clone(true);o.updateMatrixWorld(true);const b=new T.Box3().setFromObject(o),size=b.getSize(new T.Vector3());const k=5.8/size.y;o.scale.multiplyScalar(k);o.updateMatrixWorld(true);b.setFromObject(o);const mid=b.getCenter(new T.Vector3());o.position.add(new T.Vector3(p.x-mid.x,-b.min.y,p.z-mid.z));o.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=true}});scene.add(o);decor.push(o);addObstacle(p.x,p.z,.27,2)}}
try{$('status').textContent='Физика и материалы';await materials();await lighting();$('status').textContent='Загрузка твоего персонажа';hero=await customHero();body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,FOOT+GROUND_MARGIN,-14));collider=world.createCollider(RAPIER.ColliderDesc.capsule(.55,.32),body);world.step();$('status').textContent='Rocketbox: прохожие';for(const [i,[id,g]] of [['heroine','female'],['agent','male'],['brawler','male'],['bruiser','male']].entries()){const route=sidewalks[i%2],s=route.length*(i<2?.35:.75),p=atPath(route,s),a=await character(id,g,p.x,p.z);Object.assign(a,{route,s,dir:i<2?1:-1,speed:1.1+i*.09});a.root.rotation.y=p.yaw+(a.dir<0?Math.PI:0)}$('status').textContent='Транспорт на карте';await trafficInit();world.step();updateMiniMap(true);
$('status').textContent='Китай-город: '+cityMap.spawn.street+' · '+cityMap.buildings.length+' контуров зданий. Адресные фасады и приближённая архитектура остальных зданий.';updateLamps(pos);updateCamera(.016,true);renderer.compile(scene,camera);sun.shadow.needsUpdate=true;render();$('start').textContent='ИГРАТЬ';$('start').disabled=false;$('start').onclick=()=>{$('menu').style.display='none';started=true;last=performance.now();fpsLast=last;updateCamera(.016,true);sun.shadow.needsUpdate=true;requestAnimationFrame(tick);(async()=>{for(const [n,x,z,s,y,r] of [['street_lamp_01',spawnWidth/2+.7,-14-spawnHalf*.7,1,.06,0],['street_lamp_01',-spawnWidth/2-.7,-14+spawnHalf*.7,1,.06,0],['metal_trash_can',spawnWidth/2+1.2,-14,1,.06,0],['water_manhole_cover',0,-14+spawnHalf*.5,1,.02,0]])try{if(clearPoint(x,z,.15))await prop(n,x,z,s,y,r)}catch(e){console.warn(n,e)}try{await vegetation()}catch(e){console.warn(e)}})()};
window.NF_NEW={ready:true,...(new URLSearchParams(location.search).has('test')?{test:{captureStreet:name=>{
 const extra={'Старый Английский двор':-1907567000,'Палаты бояр Романовых':-1907785200};
 const b0=cityMap.buildings.find(b=>b.id===extra[name]);const p=cityMap.places.find(p=>p.name===name)||(b0?{position:[b0.points.reduce((s,q)=>s+q[0],0)/b0.points.length,b0.points.reduce((s,q)=>s+q[1],0)/b0.points.length]}:null);if(!p)throw Error('Location missing '+name);
 const subjects={'Старый Английский двор':-1907567000,'Палаты бояр Романовых':-1907785200,'Солянка':-1219882900,'Маросейка':-456779400,'Лубянский проезд':53156456,'Славянская площадь':-985494900};
 const saved=pos.clone(),old=camera.position.clone(),q=camera.quaternion.clone(),vis=hero.root.visible,oldFov=camera.fov;
 try{
   hero.root.visible=false;camera.fov=65;camera.updateProjectionMatrix();
   const b=cityMap.buildings.find(b=>b.id===subjects[name]),v=b&&architecture.frontView(b);
   const [x,z]=p.position;
   if(v){
     
     const d=Math.max(10,Math.min(44,v.width*.58+v.height*.6));let candidate=null;
     for(const f of [1,.75,.55,.40])for(const side of [0,-.25,.25,-.5,.5]){
       const x=v.x+v.nx*d*f-v.nz*v.width*side,z=v.z+v.nz*d*f+v.nx*v.width*side;
       if(!clearPoint(x,z,.25))continue;
       const ray=new T.Vector3(v.x-x,Math.min(v.height*.43,10)-2.4,v.z-z),length=ray.length();
       const hit=world.castRay(new RAPIER.Ray({x,y:2.4,z},ray.normalize()),length,true);
       if(!hit||hit.timeOfImpact>length-.65){candidate={x,z};break}
     }
     const q=candidate||{x:v.x+v.nx*d*.45,z:v.z+v.nz*d*.45};
     pos.set(q.x,0,q.z);for(let i=0;i<3;i++)detailNearby(1,true);camera.position.set(q.x,2.4,q.z);camera.lookAt(v.x,Math.min(v.height*.43,10),v.z);
   }else if(name==='Высотка на Котельнической'){
     const river=cityMap.places.find(p=>p.name==='Котельническая набережная'),dx=river.position[0]-x,dz=river.position[1]-z,len=Math.hypot(dx,dz)||1;
     camera.position.set(x+dx/len*155,2.8,z+dz/len*155);camera.lookAt(x,62,z);
   }else if(name==='Ильинский сквер'){
     const monument=cityMap.places.find(p=>p.name==='Героям Плевны');camera.position.set(monument.position[0]+14,2.1,monument.position[1]+13);camera.lookAt(monument.position[0],3.6,monument.position[1]);
   }else if(name==='Зарядье'){
     const [sw,se,,nw]=cityMap.bounds,[S,W,N,E]=cityMap.bbox;
     const geo=(lat,lon)=>{const u=(lon-W)/(E-W),v=(lat-S)/(N-S);return [sw[0]+(se[0]-sw[0])*u+(nw[0]-sw[0])*v,sw[1]+(se[1]-sw[1])*u+(nw[1]-sw[1])*v]};
     const hall=geo(55.751210,37.631326),lookFrom=geo(55.75100,37.63025);camera.position.set(lookFrom[0],2.8,lookFrom[1]);camera.lookAt(hall[0],8,hall[1]);
   }else{camera.position.set(x,2.4,z);const dir=new T.Vector3(Math.sin(p.yaw||0),0,Math.cos(p.yaw||0));camera.lookAt(camera.position.clone().addScaledVector(dir,20))}
   camera.updateMatrixWorld(true);render();return cv.toDataURL('image/png');
 }finally{pos.copy(saved);camera.position.copy(old);camera.quaternion.copy(q);hero.root.visible=vis;camera.fov=oldFov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true)}
},capturePiggy:()=>{const p=architecture.piggyView;if(!p)throw Error('Piggy front not found');const old=camera.position.clone(),q=camera.quaternion.clone(),vis=hero.root.visible;try{hero.root.visible=false;const dist=Math.max(12,Math.min(28,p.width*.85));camera.position.set(p.x+p.nx*dist,2.0,p.z+p.nz*dist);camera.lookAt(p.x,2.7,p.z);camera.updateMatrixWorld(true);render();return cv.toDataURL('image/png')}finally{camera.position.copy(old);camera.quaternion.copy(q);hero.root.visible=vis;camera.updateMatrixWorld(true)}},route:()=>{const p=cityMap.places.find(p=>p.name==='Маросейка');return navigation.setTarget(...p.position)},nearCar:id=>{const c=cars.find(c=>c.id===id);if(!c)return false;for(const d of [1.55,1.9,2.3,2.7])for(const side of [1,-1]){const x=c.root.position.x+Math.cos(c.heading)*side*d,z=c.root.position.z-Math.sin(c.heading)*side*d;if(clearPoint(x,z,.4)&&!cars.some(o=>o!==c&&overlapsCar(x,z,o,.4))){syncHero(x,z);if(nearbyCar()===c){updateInteraction();return true}}}return false},jump:()=>{jumpQueued=true}}}:{}),capture:()=>{render();return cv.toDataURL('image/png')},inspect:()=>({people:people.length,view,started,hero:hero.id,heroVertices:hero.vertices,heroSkinned:hero.skinned,heroState:hero.state,position:pos.toArray(),quality,actions:Object.keys(hero.actions),physics:true,renderScale,drawCalls,staticBefore,staticAfter,fps,mapSource:cityMap.source,relationBuildings:cityMap.relationBuildings||0,landmarks:[...landmarksBuilt],architecture:'street-facades-v8',heritageFacades:architecture.heritageCount(),lubyanskyElevations:architecture.elevationCount(),mapped,photoFacades:architecture.photoCount(),photoAvailable:architecture.photoAvailable(),surveyedFacades:architecture.surveyCount(),mapHandedness:correctedMapDet,waterPolygons:(cityMap.water||[]).length,district,baseFacades:architecture.atlasCount(),addressProfiles:cityMap.buildings.filter(b=>architecture.profile(b)).length,profileTypes:[...new Set(cityMap.buildings.map(b=>architecture.profile(b)).filter(Boolean))],piggyAddressMatched:architecture.mainPig,piggyInfo:architecture.piggyInfo,navigation:navigation.inspect(),buildings:cityMap.buildings.length,roads:cityMap.roads.length,street:cityMap.spawn.street,simSteps,bodyY:body.translation().y,cameraY:camera.position.y,groundY:ground.position.y,jumpPeak,jumpH,impacts,ejections,locations:(cityMap.places||[]).map(p=>p.name),facades:facades.size,driving:driving?.id||null,driveSpeed:driving?.speed||0,decor:decor.length,cars:cars.map(c=>({id:c.id,position:c.root.position.toArray(),travel:c.travel,speed:c.speed,clear:carClear({x:c.root.position.x,z:c.root.position.z,yaw:c.heading},c.length),lane:c.lane,dir:c.dir,parked:c.parked,driver:!!c.driver})),pedestrians:people.filter(a=>!a.hero).map(a=>({id:a.id,position:a.root.position.toArray(),path:a.route?.length||0,clear:clearPoint(a.x,a.z),down:!!a.downUntil}))})};
}catch(e){console.error(e);$('status').textContent='Ошибка: '+e.message;window.NF_NEW={ready:false,error:e.message};}
cv.addEventListener('webglcontextlost',e=>{e.preventDefault();started=false;$('menu').style.display='flex';$('status').textContent='Графический контекст потерян. Перезагрузите страницу.'});
