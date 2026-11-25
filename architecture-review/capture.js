// Injected only into the test build by the audit runner.
function captureAuditFacade(entry){
 const b=cityMap.buildings.find(x=>x.id===entry.osmId);
 if(!b)return {error:'Footprint missing'};
 const edges=b.points.map((p,i)=>({edge:i,width:Math.hypot(b.points[(i+1)%b.points.length][0]-p[0],b.points[(i+1)%b.points.length][1]-p[1])})).sort((a,b)=>b.width-a.width);
 const f=entry.auditView==='alternate' ? edges.find(e=>e.edge!==entry.front?.edge&&e.width>=1) : (entry.front||edges[0]);
 if(!f)return {error:'No usable footprint edge'};
 const p=b.points[f.edge],q=b.points[(f.edge+1)%b.points.length];
 if(!p||!q)return {error:'Frontage missing'};
 const dx=q[0]-p[0],dz=q[1]-p[1],width=Math.hypot(dx,dz);
 if(width<1)return {error:'Frontage degenerate'};
 const tx=dx/width,tz=dz/width,sign=Math.sign(b.points.reduce((s,a,i)=>s+a[0]*b.points[(i+1)%b.points.length][1]-b.points[(i+1)%b.points.length][0]*a[1],0));
 const nx=sign*tz,nz=-sign*tx,cx=(p[0]+q[0])/2,cz=(p[1]+q[1])/2,h=b.height;
 const oldPos=pos.clone(),oldCamera=camera.position.clone(),oldQ=camera.quaternion.clone(),oldFov=camera.fov,vis=hero.root.visible,oldSun=sun.position.clone(),oldTarget=sun.target.position.clone();
 const lookY=Math.max(1.8,h*.48),samples=[[-.38,.20],[0,.20],[.38,.20],[-.38,.56],[0,.56],[.38,.56],[0,.82]];
 function score(x,z){if(!clearPoint(x,z,.25))return -1;let visible=0;
   for(const [u,v] of samples){const target=new T.Vector3(cx+tx*width*u+nx*.10,Math.max(.9,h*v),cz+tz*width*u+nz*.10),ray=target.clone().sub(new T.Vector3(x,2.45,z)),d=ray.length();
     const hit=world.castRay(new RAPIER.Ray({x,y:2.45,z},ray.normalize()),d,true);
     if(!hit||hit.timeOfImpact>=d-.25)visible++;
   }
   return visible;
 }
 let best=null;
 // Restrict candidates to open pavement in front of the exact wall. Prefer
 // the middle of the facade and sufficient distance to frame it in landscape.
 const targetD=Math.min(65,Math.max(7,h*.85,width*.55));
 for(const scale of [1,.8,1.2,.55,.35,1.5])for(const off of [0,-.20,.20,-.4,.4]){
   const x=cx+nx*targetD*scale+tx*width*off,z=cz+nz*targetD*scale+tz*width*off,v=score(x,z);
   if(v<0)continue;
   const rank=v*20-Math.abs(scale-1)*2-Math.abs(off)*4;
   if(!best||rank>best.rank)best={x,z,visible:v,rank,scale,off};
 }
 if(!best||best.visible===0)return {error:'No unobstructed public-side viewpoint',width,height:h};
 try{
   hero.root.visible=false;pos.set(best.x,0,best.z);
   const item=facadeQueue.find(f=>f.b.id===b.id);if(item)detailBuilding(item.b,item.i,item.cx,item.cz);
   // Only one neighborhood's detail is requested at a time. The runner
   // reloads between batches to bound accumulation in the live scene.
   for(let i=0;i<2;i++)detailNearby(1,true);
   camera.position.set(best.x,2.45,best.z);camera.lookAt(cx,lookY,cz);camera.fov=64;
   camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   sun.target.position.set(cx,0,cz);sun.position.set(cx-14,22,cz-11);sun.shadow.needsUpdate=true;
   render();
   return {edge:f.edge,viewKind:entry.front?.edge===f.edge?'recorded-front':'unclassified-wall',image:cv.toDataURL('image/jpeg',.86),width,height:h,visibleSamples:best.visible,totalSamples:samples.length,viewpoint:[best.x,2.45,best.z],target:[cx,lookY,cz],status:best.visible<samples.length?'partly-obstructed':'viewpoint-unobstructed'};
 }finally{
   pos.copy(oldPos);camera.position.copy(oldCamera);camera.quaternion.copy(oldQ);camera.fov=oldFov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);hero.root.visible=vis;
   sun.position.copy(oldSun);sun.target.position.copy(oldTarget);sun.shadow.needsUpdate=true;
 }
}
