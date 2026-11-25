import * as T from 'three';
// Street environment and geometric approximations of documented park landmarks.
// Every road, park boundary and bridge centerline used here is from the baked OSM map.
export function installDistrict({scene,cityMap,mat,ribbon,shapeMesh,roadPaths,nearPath,atPath,clearPoint,offRoad,addObstacle,box,staticMeshes}){
 const report={streets:[],parkTrees:0,streetLamps:0,bridge:false,hall:false,terraceTables:0,parkPaths:0};
 const [south,west,north,east]=cityMap.bbox,[sw,se,,nw]=cityMap.bounds;
 const geo=(lat,lon)=>{const u=(lon-west)/(east-west),v=(lat-south)/(north-south);return new T.Vector3(sw[0]+(se[0]-sw[0])*u+(nw[0]-sw[0])*v,0,sw[1]+(se[1]-sw[1])*u+(nw[1]-sw[1])*v)};
 const names=['Солянка','Маросейка','Лубянский проезд','Варварка','Китайгородский проезд'];
 const isStreet=r=>names.some(s=>String(r.name||'').toLowerCase().includes(s.toLowerCase()));
 const roads=roadPaths.filter(({r})=>isStreet(r)&&!['footway','steps','path','cycleway'].includes(r.type));
 const curb=mat(0xa49d91),paint=mat(0xd6d3c8,.9),iron=mat(0x3a3b38,.6,.4),bronze=mat(0x8c7750,.65,.35),lamp=mat(0xe9dfbb,.45),stone=mat(0xd0c7b8,.9);
 const grass=mat(0x7c895e,.98),grassDark=mat(0x697d4c,.98),treeTrunk=mat(0x746452,.96),leaf=mat(0x536a3e,.96),leaf2=mat(0x748650,.96);
 const glass=mat(0x789eae,.24,.25),glassDark=mat(0x496b7c,.25,.26),cream=mat(0xe1dfd5,.88),steel=mat(0x929fa2,.57,.35);
 let seed=78931;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const parts=new Map(),dummy=new T.Object3D();
 function inst(key,g,m,x,y,z,sx,sy,sz,rot=0){let p=parts.get(key);if(!p){p={g,m,list:[]};parts.set(key,p)}else if(g!==p.g)g.dispose();
  dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,rot,0);dummy.updateMatrix();p.list.push(dummy.matrix.clone())}
 const cube=new T.BoxGeometry(1,1,1),trunkG=new T.CylinderGeometry(.13,.20,1,7),crownG=new T.IcosahedronGeometry(1,1),poleG=new T.CylinderGeometry(.045,.08,1,8),lampG=new T.SphereGeometry(1,8,5);
 function repeat(key,g,m,x,y,z,sx,sy,sz,rot=0){let p=parts.get(key);if(!p){p={g,m,list:[]};parts.set(key,p)}dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,rot,0);dummy.updateMatrix();p.list.push(dummy.matrix.clone())}
 function tree(x,z,h=5){repeat('trunk',trunkG,treeTrunk,x,h*.32,z,1,h*.64,1);repeat('foliageA',crownG,leaf,x,h*.73,z,h*.31,h*.39,h*.29,rand()*6.28);repeat('foliageB',crownG,leaf2,x+.43,h*.87,z-.22,h*.24,h*.26,h*.23,rand()*6.28)}
 const lampSites=[];
 for(const {r,path} of roads){if(!report.streets.includes(r.name))report.streets.push(r.name);
   const w=r.width;
   // Fine kerbs on both sides of the named roads; separate pavement and carriageway.
   for(const side of [-1,1])ribbon(r.points,.16,side*(w/2+.06),.079,curb);
   if(w>=7&&!['service','pedestrian','living_street'].includes(r.type)){
    for(let t=3;t<path.length-4;t+=8){const a=atPath(path,t),b=atPath(path,Math.min(t+3.0,path.length));ribbon([[a.x,a.z],[b.x,b.z]],.095,0,.024,paint)}
   }
   for(const side of [-1,1])for(let t=7;t<path.length-7;t+=23){
     const p=atPath(path,t,side*(w/2+.95));
     if(!clearPoint(p.x,p.z,.45)||!offRoad(p.x,p.z,.35)||lampSites.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<12))continue;
     lampSites.push(p);report.streetLamps++;
     repeat('pole',poleG,iron,p.x,1.8,p.z,1,3.6,1);repeat('lampBase',cube,iron,p.x,.16,p.z,.28,.32,.28);
     repeat('lampCap',lampG,iron,p.x,3.73,p.z,.21,.14,.21);repeat('lampGlass',lampG,lamp,p.x,3.52,p.z,.15,.21,.15);
   }
 }
 function inside(x,z,ring){let v=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])v=!v}return v}
 const parks=(cityMap.parks||[]).filter(p=>/зарядье|ильинский сквер/i.test(p.name||''));
 const treeSites=[];
 for(const p of parks){
   const xs=p.points.map(q=>q[0]),zs=p.points.map(q=>q[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
   for(let x=minX+4;x<maxX-3;x+=9)for(let z=minZ+4;z<maxZ-3;z+=9){
     const xx=x+(rand()-.5)*5,zz=z+(rand()-.5)*5;if(report.parkTrees>=165||rand()<.47||!inside(xx,zz,p.points)||(p.holes||[]).some(r=>inside(xx,zz,r))||!clearPoint(xx,zz,2)||!offRoad(xx,zz,2)||treeSites.some(q=>Math.hypot(q[0]-xx,q[1]-zz)<5.5))continue;
     // Preserve the open lawn and the concert hall envelope.
     const hall=geo(55.75121,37.631326);if(Math.hypot(hall.x-xx,hall.z-zz)<58)continue;
     treeSites.push([xx,zz]);tree(xx,zz,4.2+rand()*3.6);report.parkTrees++;
     if(rand()<.22){repeat('shrub',crownG,grassDark,xx+2,.48,zz+1,1.15,.60,.9,rand()*6.28)}
   }
 }
 // Park footways remain the original mapped routes; only report coverage.
 report.parkPaths=cityMap.roads.filter(r=>['footway','path','steps'].includes(r.type)&&r.points.some(([x,z])=>parks.some(p=>inside(x,z,p.points)))).length;
 function mesh(g,m,x=0,y=0,z=0){const o=new T.Mesh(g,m);o.position.set(x,y,z);o.receiveShadow=true;o.castShadow=true;scene.add(o);return o}
 function bar(a,b,width,m){const d=new T.Vector3().subVectors(b,a),o=mesh(new T.CylinderGeometry(width,width,d.length(),6),m);o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());return o}
 function roofGrid(center,rx,rz,base,peak,rotate,material){
   const g=new T.BufferGeometry(),pts=[],indices=[],grid=[],nx=20,nz=15;
   const c=Math.cos(rotate),s=Math.sin(rotate);
   for(let j=0;j<=nz;j++){let row=[];for(let i=0;i<=nx;i++){const u=i/nx*2-1,v=j/nz*2-1;
     const x=u*rx*Math.sqrt(1-.25*v*v),z=v*rz*Math.sqrt(1-.18*u*u),h=base+peak*Math.max(0,1-u*u*.78-v*v*.72)+1.25*Math.sin(u*2.3+v*.8);
     const p=new T.Vector3(center.x+x*c-z*s,h,center.z+x*s+z*c);row.push(p);pts.push(...p.toArray());
   }grid.push(row)}
   for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d)}
   g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.setIndex(indices);g.computeVertexNormals();material.side=T.DoubleSide;mesh(g,material);
   // Triangulated structural lattice, merged via instances for mobile.
   const lines=[];for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){if(i<nx)lines.push(...grid[j][i].toArray(),...grid[j][i+1].toArray());if(j<nz)lines.push(...grid[j][i].toArray(),...grid[j+1][i].toArray());if(i<nx&&j<nz)lines.push(...grid[j][i].toArray(),...grid[j+1][i+1].toArray())}
   const lg=new T.BufferGeometry();lg.setAttribute('position',new T.Float32BufferAttribute(lines,3));scene.add(new T.LineSegments(lg,new T.LineBasicMaterial({color:0x586d76,transparent:true,opacity:.9})));
 }
 // Actual venue centroid, approximate exterior dimensions based on park aerial photos.
 const hall=geo(55.751210,37.631326),parkDirection=geo(55.751210,37.6302).sub(hall).normalize(),angle=Math.atan2(parkDirection.z,parkDirection.x);
 const hallPoints=[[-35,-40],[35,-40],[43,24],[28,38],[-35,30]].map(([x,z])=>[hall.x+x*Math.cos(angle)-z*Math.sin(angle),hall.z+x*Math.sin(angle)+z*Math.cos(angle)]);
 const h=shapeMesh(hallPoints,[cream,glassDark],8.0);
 // This is exterior scenery, no invented walkable interior or bridge physics.
 roofGrid(hall,48,39,8.2,11.3,angle,glass);
 report.hall=true;
 // Media center already has an OSM footprint. Give it a curved, triangulated canopy.
 const media=cityMap.buildings.find(b=>b.id===-756769200);
 if(media){const cx=media.points.reduce((s,p)=>s+p[0],0)/media.points.length,cz=media.points.reduce((s,p)=>s+p[1],0)/media.points.length;roofGrid(new T.Vector3(cx,0,cz),17,12,media.height+.05,2.6,0,glass);}
 // Exact OSM centerline of the V-shaped viewing bridge; the deck rises above the ground.
 const bridge=cityMap.roads.find(r=>r.id===480821442);
 if(bridge){
   const pts=bridge.points,dist=[0];for(let i=1;i<pts.length;i++)dist.push(dist.at(-1)+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
   const total=dist.at(-1),deck=[],left=[],right=[];
   for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l,y=2.0+Math.min(7.5,Math.min(dist[i],total-dist[i])*.075);left.push(new T.Vector3(pts[i][0]+nx*3.1,y,pts[i][1]+nz*3.1));right.push(new T.Vector3(pts[i][0]-nx*3.1,y,pts[i][1]-nz*3.1))}
   const v=[],ix=[];for(let i=0;i<pts.length;i++){v.push(...left[i].toArray(),...right[i].toArray());if(i){const j=i*2;ix.push(j-2,j,j-1,j-1,j,j+1)}}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();stone.side=T.DoubleSide;mesh(g,stone);
   for(const line of [left,right]){const rails=[],panels=[],idx=[];for(let i=0;i<line.length;i++){const p=line[i];panels.push(p.x,p.y,p.z,p.x,p.y+1.15,p.z);if(i){const j=i*2;idx.push(j-2,j-1,j,j,j-1,j+1);const a=line[i-1].clone().add(new T.Vector3(0,1.15,0)),b=p.clone().add(new T.Vector3(0,1.15,0));bar(a,b,.047,steel)}}
     const q=new T.BufferGeometry();q.setAttribute('position',new T.Float32BufferAttribute(panels,3));q.setIndex(idx);q.computeVertexNormals();const clear=new T.MeshStandardMaterial({color:0xa5c9cf,transparent:true,opacity:.38,side:T.DoubleSide,roughness:.23,depthWrite:false});mesh(q,clear);
     for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],len=a.distanceTo(b);for(let f=0;f<len;f+=3){const p=a.clone().lerp(b,f/len);repeat('railPost',poleG,steel,p.x,p.y+.57,p.z,.65,1.14,.65)}}
   }report.bridge=true;
 }
 // The Piggy courtyard is documented behind the pub; the actual terrace layout
 // is not surveyed. Place a small exterior approximation only where it fits.
 const pig=cityMap.buildings.find(b=>Number(b.id)===52404043);
 if(pig){const cx=pig.points.reduce((s,p)=>s+p[0],0)/pig.points.length,cz=pig.points.reduce((s,p)=>s+p[1],0)/pig.points.length;
   const roadsSol=roadPaths.filter(o=>/солянка/i.test(o.r.name||'')&&!['footway','path','steps'].includes(o.r.type));
   let closest=null;for(const {path} of roadsSol){const n=nearPath(path,cx,cz);if(!closest||n.distance<closest.d)closest={d:n.distance,p:atPath(path,n.along)}}
   if(closest){const back=new T.Vector3(cx-closest.p.x,0,cz-closest.p.z).normalize(),side=new T.Vector3(-back.z,0,back.x);
     const tables=[];for(const f of [7,10,13,16,19])for(const s of [-5,-2,2,5]){
       const x=cx+back.x*f+side.x*s,z=cz+back.z*f+side.z*s;if(tables.length>=8||!clearPoint(x,z,1.15)||!offRoad(x,z,1.3))continue;tables.push([x,z]);report.terraceTables++;
       repeat('tabletop',cube,bronze,x,.77,z,.84,.09,.84);repeat('tableleg',poleG,iron,x,.35,z,1.5,.7,1.5);
       for(const [dx,dz] of [[-.74,0],[.74,0],[0,.74],[0,-.74]]){repeat('chairSeat',cube,iron,x+dx,.43,z+dz,.37,.07,.37);repeat('chairBack',cube,iron,x+dx*1.21,.65,z+dz*1.21,Math.abs(dx)>.1?.06:.37,.42,Math.abs(dx)>.1?.37:.06)}
       if(tables.length%3===1){repeat('umbrellaPole',poleG,iron,x,1.2,z,1,2.4,1);repeat('umbrella',crownG,cream,x,2.45,z,1.35,.23,1.35)}
     }
   }
 }
 for(const [key,p] of parts){const o=new T.InstancedMesh(p.g,p.m,p.list.length);for(let i=0;i<p.list.length;i++)o.setMatrixAt(i,p.list[i]);o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();o.receiveShadow=true;o.castShadow=['trunk','foliageA','foliageB','pole'].includes(key);scene.add(o)}
 return report;
}
