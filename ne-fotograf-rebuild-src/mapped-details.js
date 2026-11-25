import * as T from 'three';
// Only the locations and tagged dimensions in this module come from OSM.
// Shapes without enough height/roof information are never represented as surveyed.
export function addMappedDetails({scene,cityMap,mat,shapeMesh,ribbon,clearPoint,roadPaths,nearPath,architecture,groundAt=()=>0}){
 const report={parts:0,parents:0,taggedTrees:0,surfaces:0,barriers:0,completeParts:0};
 const m=new Map(),parents=new Map(cityMap.buildings.map(b=>[b.id,b]));
 const palette={brick:0xa36c55,stone:0xc3baaa,wood:0x877358,concrete:0xa4a39e,plaster:0xd0c1a5,glass:0x67828c};
 function color(v,fallback){try{if(v&&(/^#?[0-9a-f]{6}$/i.test(v)||Object.hasOwn(T.Color.NAMES,v.toLowerCase())))return new T.Color(v.startsWith('#')||!(/^[0-9a-f]{6}$/i.test(v))?v:'#'+v).getHex()}catch{}return fallback}
 function material(c,r=.9){const key=c+':'+r;if(!m.has(key))m.set(key,mat(c,r));return m.get(key)}
 const visited=new Set();
 for(const p of cityMap.buildingParts||[]){
   const b=parents.get(p.parent);if(!b)continue;
   // All ground-level walls retain the real parent collision footprint.
   // Where mapped parts cover the entire footprint, render all documented volumes.
   const base=b.replaceWithParts?p.minHeight:Math.max(p.minHeight,b.height);
   if(p.height-base<.15)continue;
   const wall=color(p.colour,palette[p.material]||0xc4b6a2),roof=color(p.roofColour,0x61645e);
   const roofH=Math.min(p.roofHeight,p.height-base),bodyH=p.height-base-roofH;
   const fp={...p,height:Math.max(.15,bodyH),name:b.name,street:b.street,number:b.number};
   const wallMat=p.material==='glass'?material(wall,.27):architecture.facadeMaterial(fp);
   if(bodyH>.1){const o=shapeMesh(p.points,[material(roof),wallMat],bodyH);o.position.y=base;if(p.material!=='glass')architecture.mapWalls(fp,o.geometry,false);}
   if(roofH>.1){
     const cx=p.points.reduce((s,q)=>s+q[0],0)/p.points.length,cz=p.points.reduce((s,q)=>s+q[1],0)/p.points.length;
     const y=base+bodyH,rx=(Math.max(...p.points.map(q=>q[0]))-Math.min(...p.points.map(q=>q[0])))/2,rz=(Math.max(...p.points.map(q=>q[1]))-Math.min(...p.points.map(q=>q[1])))/2;
     if(['dome','onion','cone'].includes(p.roof)){
       const profile=p.roof==='onion'?[[0,0],[.78,0],[1,.26],[.91,.48],[.48,.75],[.13,.94],[0,1]]:p.roof==='cone'?[[1,0],[0,1]]:[[1,0],[.93,.38],[.72,.72],[.36,.94],[0,1]];
       const g=new T.LatheGeometry(profile.map(([r,h])=>new T.Vector2(r,h)),24),o=new T.Mesh(g,material(roof,.55));o.scale.set(rx,roofH,rz);o.position.set(cx,y,cz);o.castShadow=true;scene.add(o)
     }else if(['pyramidal','hipped','gabled'].includes(p.roof)){
       // Triangulate the original mapped perimeter to an interior ridge (approximate).
       const points=[];for(let i=0;i<p.points.length;i++){const a=p.points[i],z=p.points[(i+1)%p.points.length];points.push(a[0],y,a[1],z[0],y,z[1],cx,y+roofH,cz)}
       const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.computeVertexNormals();const mm=material(roof);mm.side=T.DoubleSide;const o=new T.Mesh(g,mm);o.castShadow=true;scene.add(o)
     }else{const o=shapeMesh(p.points,[material(roof),material(wall)],roofH);o.position.y=y}
   }
   report.parts++;visited.add(b.id);
 }
 report.parents=visited.size;report.completeParts=cityMap.buildings.filter(b=>b.replaceWithParts).length;
 const green=material(0x66794d),paved=material(0x99968b),parking=material(0x656765);
 for(const p of cityMap.mappedSurfaces||[]){if(p.points.length<3)continue;const o=shapeMesh(p.points,p.kind==='green'?green:p.kind==='parking'?parking:paved);o.position.y=.017;report.surfaces++}
 // Real tagged tree locations are retained. Height is taken from OSM where available.
 const trunkG=new T.CylinderGeometry(.16,.24,1,8),crownG=new T.IcosahedronGeometry(1,2),trunk=material(0x6b5a44),crown=material(0x536e3e),dummy=new T.Object3D();
 const trees=(cityMap.mappedTrees||[]).filter(t=>clearPoint(...t.position,.3));const tr=new T.InstancedMesh(trunkG,trunk,trees.length),le=new T.InstancedMesh(crownG,crown,trees.length);
 for(let i=0;i<trees.length;i++){const t=trees[i],[x,z]=t.position,h=Math.min(19,Math.max(3,t.height||7));const y=groundAt(x,z);dummy.position.set(x,y+h*.28,z);dummy.scale.set(1,h*.56,1);dummy.updateMatrix();tr.setMatrixAt(i,dummy.matrix);dummy.position.set(x,y+h*.76,z);dummy.scale.set(h*.30,h*.33,h*.30);dummy.updateMatrix();le.setMatrixAt(i,dummy.matrix)}
 for(const o of [tr,le]){o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();o.castShadow=true;o.receiveShadow=true;scene.add(o)}report.taggedTrees=trees.length;
 // Fences/walls along the precise mapped lines, not across the courtyard entrance.
 const wallG=new T.BoxGeometry(1,1,1),wallMat=material(0x8b8175),iron=material(0x343b3c,.65),hedge=material(0x53643b);const instances=new Map();
 function instance(m,x,y,z,w,h,d,yaw){if(!instances.has(m))instances.set(m,[]);dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.rotation.set(0,yaw,0);dummy.updateMatrix();instances.get(m).push(dummy.matrix.clone())}
 for(const f of cityMap.mappedBarriers||[]){const h=Math.max(.25,Math.min(4,f.height||(f.kind==='hedge'?1.0:1.4)));for(let i=1;i<f.points.length;i++){const a=f.points[i-1],b=f.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.2)continue;const yaw=Math.atan2(-dz,dx),x=(a[0]+b[0])/2,z=(a[1]+b[1])/2;
   if(f.kind==='fence'){instance(iron,x,h*.92,z,l,.055,.055,yaw);instance(iron,x,h*.18,z,l,.04,.04,yaw);for(let k=.12;k<l;k+=.24)instance(iron,a[0]+dx*k/l,h/2,a[1]+dz*k/l,.035,h,.035,yaw)}
   else instance(f.kind==='hedge'?hedge:wallMat,x,h/2,z,l,h,f.kind==='hedge'?.65:.30,yaw)
 }report.barriers++}
 for(const [m,list] of instances){const o=new T.InstancedMesh(wallG,m,list.length);list.forEach((x,i)=>o.setMatrixAt(i,x));o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();o.receiveShadow=true;scene.add(o)}
 return report;
}
