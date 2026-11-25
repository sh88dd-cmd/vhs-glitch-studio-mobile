import * as T from 'three';
// Reference-based reconstruction, NOT an elevation survey. The amphitheater
// direction is taken from the actual mapped stair centerline OSM 514468066.
// Heights and individual seat dimensions remain estimated from public images.
export function createParkTopography(city){
 const [S,W,N,E]=city.bbox,[sw,se,,nw]=city.bounds;
 function geo(lat,lon){const u=(lon-W)/(E-W),v=(lat-S)/(N-S);return new T.Vector3(sw[0]+(se[0]-sw[0])*u+(nw[0]-sw[0])*v,0,sw[1]+(se[1]-sw[1])*u+(nw[1]-sw[1])*v)}
 const stairs=city.roads.find(r=>r.id===514468066);
 const a=stairs?.points[0],b=stairs?.points.at(-1);
 const origin=a?new T.Vector3(a[0],0,a[1]):geo(55.7512569,37.630412);
 const top=b?new T.Vector3(b[0],0,b[1]):geo(55.7511669,37.6309924);
 const axis=top.clone().sub(origin),length=axis.length();axis.normalize();
 const side=new T.Vector3(-axis.z,0,axis.x);
 const hall=geo(55.751210,37.631326),hp=hall.clone().sub(origin),hallU=hp.dot(axis),hallV=hp.dot(side);
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
 const local=(x,z)=>[(x-origin.x)*axis.x+(z-origin.z)*axis.z,(x-origin.x)*side.x+(z-origin.z)*side.z];
 const point=(u,v,h=0)=>new T.Vector3(origin.x+axis.x*u+side.x*v,h,origin.z+axis.z*u+side.z*v);
 const rings=(city.parks||[]).filter(p=>/зарядье/i.test(p.name||''));
 function inRing(x,z,r){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
 function inPark(x,z){return rings.some(p=>inRing(x,z,p.points)&&!(p.holes||[]).some(r=>inRing(x,z,r)))}
 // The real amphitheater rises eastward from its plaza. Local ground slopes
 // taper at the sides and at the back to meet the existing flat city geometry.
 const rise=7.4,halfWidth=25,bankWidth=46,back=length+29;
 function heightAt(x,z){
   const [u,v]=local(x,z);
   if(u<=0||u>=back||Math.abs(v)>=bankWidth||!inPark(x,z))return 0;
   const vertical=u<=length?rise*u/length:rise*(1-smooth((u-length)/(back-length)));
   const lateral=1-smooth((Math.abs(v)-halfWidth)/(bankWidth-halfWidth));
   return vertical*lateral;
 }
 function affects(x,z){const [u,v]=local(x,z);return u>-5&&u<back+5&&Math.abs(v)<bankWidth+5}
 function buildGround(scene){
   const nx=Math.ceil(back/1.5),nz=Math.ceil(bankWidth*2/1.5),positions=[],colors=[],indices=[];
   const dark=new T.Color(0x52693d),light=new T.Color(0x879557),c=new T.Color();
   let max=0;
   for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
     const u=i/nx*back,v=(j/nz*2-1)*bankWidth,p=point(u,v),h=heightAt(p.x,p.z);max=Math.max(max,h);positions.push(p.x,h+.024,p.z);
     const grain=.5+.22*Math.sin(u*.53+v*.3)+.19*Math.sin(u*1.2-v*.64);c.copy(dark).lerp(light,Math.max(0,Math.min(1,grain)));colors.push(c.r,c.g,c.b);
   }
   for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;
     if(Math.max(positions[a*3+1],positions[b*3+1],positions[c*3+1],positions[d*3+1])>.04)indices.push(a,b,c,b,d,c);
   }
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
   const m=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});const o=new T.Mesh(g,m);o.receiveShadow=true;scene.add(o);
   return {triangles:indices.length/3,height:max};
 }
 return {geo,local,point,heightAt,affects,buildGround,origin,axis,side,length,rise,hallU,hallV,halfWidth,bankWidth,back};
}
export function buildZaryadyeHall({scene,terrain,mat,shapeMesh,addBuildingCollider}){
 const {point,heightAt,length,rise,hallU,hallV,axis,side}=terrain;
 const yaw=Math.atan2(-axis.z,axis.x),wood=mat(0xa06d3a,.89),woodDark=mat(0x725032,.91),stone=mat(0xc5beb1,.92),cream=mat(0xd6d0c0,.84),glass=mat(0x708f9d,.24,.34),darkGlass=mat(0x3f626f,.28,.32),metal=mat(0x757f81,.48,.45);
 const dummy=new T.Object3D(),cube=new T.BoxGeometry(1,1,1),sets=new Map();
 function block(u,v,y,w,h,d,m){const p=point(u,v,y);if(!sets.has(m))sets.set(m,[]);dummy.position.copy(p);dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();sets.get(m).push(dummy.matrix.clone())}
 const rows=18,rowDepth=length/rows,stepH=rise/rows;
 // Individual long wooden bench tiers broken by four pale stone stair aisles.
 // The stepped seating is bounded by the hillside instead of a solid blue box.
 for(let i=0;i<rows;i++){
   const u=(i+.5)*rowDepth,half=21.5+i*.18,top=(i+1)*stepH;
   const aisles=[-half+1.2,-half*.34,half*.34,half-1.2],cuts=[-half,...aisles.flatMap(x=>[x-.66,x+.66]),half].sort((a,b)=>a-b);
   for(let j=0;j<cuts.length-1;j++){
     const l=cuts[j],r=cuts[j+1],v=(l+r)/2,w=r-l;if(w<.04)continue;
     const isAisle=aisles.some(x=>Math.abs(x-v)<.66);
     if(isAisle){for(let k=0;k<3;k++)block(i*rowDepth+(k+.5)*rowDepth/3,v,i*stepH+(k+1)*stepH/3-.065,rowDepth/3+.015,.13,w,stone);}
     else{
       block(u,v,top-.19,rowDepth-.018,.38,w,stone);
       block(i*rowDepth+rowDepth*.73,v,top+.10,rowDepth*.44,.18,w-.07,wood);
       block(i*rowDepth+rowDepth*.94,v,top+.25,.08,.34,w-.07,woodDark);
     }
   }
 }
 // A paved forecourt and a narrow upper walkway, blended with the OSM paths.
 block(-5.2,0,.055,10,.10,48,stone);
 block(length+1.7,0,rise-.08,3.1,.16,51,stone);
 // The concert hall's east elevation is a transparent curtain wall with
 // slender vertical mullions and an ivory stone surround. Park side is embedded.
 const u0=Math.max(length+9,hallU-14),u1=hallU+25,v0=hallV-36,v1=hallV+36;
 const fp=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>{const p=point(u,v);return[p.x,p.z]});
 const building=shapeMesh(fp,[cream,darkGlass],10.8);
 addBuildingCollider?.(building);
 const width=v1-v0,span=u1-u0;
 for(let j=0;j<Math.ceil(width/2.15);j++){
   const v=v0+(j+.5)*width/Math.ceil(width/2.15);
   block(u1+.055,v,6.3,.08,7.9,1.95,glass);
   block(u1+.15,v-1.02,6.3,.15,9.6,.075,metal);
 }
 for(const y of [2.25,5.5,9.9])block(u1+.18,(v0+v1)/2,y,.22,.16,width,metal);
 block(u1+.52,(v0+v1)/2,2.18,1.1,.36,width,cream);
 for(let v of [v0+1,v1-1])block(u1+.33,v,5.5,.7,11,1.7,cream);
 // Lit recessed entrance doors under the horizontal pale fascia.
 for(let j=-4;j<=4;j++){const v=hallV+j*2.05;block(u1+.12,v,1.04,.15,1.96,1.84,glass);block(u1+.28,v-.92,1.05,.21,2.1,.08,metal)}
 // Asymmetric translucent glass shell; triangular structure visible through it.
 const nx=26,nz=24,U0=4,U1=u1+7,half=43,vertices=[],indices=[],grid=[];
 function roofPoint(i,j){const s=i/nx,t=j/nz*2-1,u=U0+(U1-U0)*s;
   const span=half*(.75+.25*Math.sin(Math.PI*s));const v=hallV*.32+t*span;
   const h=5.0+15.0*Math.pow(Math.sin(Math.PI*s*.82),.91)*Math.sqrt(Math.max(.16,1-t*t*.72))+1.1*t;
   const p=point(u,v);p.y=Math.max(h,heightAt(p.x,p.z)+3.8);return p}
 for(let j=0;j<=nz;j++){const row=[];for(let i=0;i<=nx;i++){const p=roofPoint(i,j);vertices.push(...p.toArray());row.push(p)}grid.push(row)}
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if((i+j)%2)indices.push(a,c,d,a,d,b);else indices.push(a,c,b,b,c,d)}
 const shellG=new T.BufferGeometry();shellG.setAttribute('position',new T.Float32BufferAttribute(vertices,3));shellG.setIndex(indices);shellG.computeVertexNormals();
 const shellM=new T.MeshPhysicalMaterial({color:0x92b7c6,metalness:.15,roughness:.19,transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide,clearcoat:.45});
 const shell=new T.Mesh(shellG,shellM);shell.renderOrder=4;scene.add(shell);
 const rods=[],rodG=new T.CylinderGeometry(.05,.05,1,6),rodM=mat(0x78898d,.45,.48);
 function rod(a,b,scale=1){const d=b.clone().sub(a),l=d.length();if(l<.03)return;dummy.position.copy(a).addScaledVector(d,.5);dummy.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());dummy.scale.set(scale,l,scale);dummy.updateMatrix();rods.push(dummy.matrix.clone())}
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
   const p=grid[j][i];if(i<nx)rod(p,grid[j][i+1],j===0||j===nz?2.4:1);
   if(j<nz)rod(p,grid[j+1][i],i===0||i===nx?2.4:1);
   if(i<nx&&j<nz){if((i+j)%2)rod(p,grid[j+1][i+1]);else rod(grid[j][i+1],grid[j+1][i]);}
 }
 for(let i of [3,8,14,21,25])for(let j of [1,nz-1]){
   const t=grid[j][i],base=t.clone();base.y=heightAt(base.x,base.z)+.04;
   const u=point(U0+(U1-U0)*i/nx,(j===1?-1:1)*35+hallV*.32);u.y=heightAt(u.x,u.z)+.06;
   rod(base,t,4.1);rod(u,t,2.7);
 }
 const steel=new T.InstancedMesh(rodG,rodM,rods.length);rods.forEach((m,i)=>steel.setMatrixAt(i,m));steel.instanceMatrix.needsUpdate=true;steel.computeBoundingSphere();steel.receiveShadow=true;scene.add(steel);
 for(const [m,list] of sets){const o=new T.InstancedMesh(cube,m,list.length);list.forEach((p,i)=>o.setMatrixAt(i,p));o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();o.receiveShadow=true;o.castShadow=true;scene.add(o)}
 return {amphitheaterRows:rows,canopyTriangles:indices.length/3,canopyRods:rods.length,canopyTransparent:true,hallFootprint:fp};
}
