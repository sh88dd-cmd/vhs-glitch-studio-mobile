// Route through actual shared OSM way vertices. Coordinates are projected local metres.
export function createNavigation(city,getPlayer,stopInput){
const $=id=>document.getElementById(id),panel=$('mapPanel'),canvas=$('fullMap'),ctx=canvas.getContext('2d');
const allowed=new Set(['primary','secondary','tertiary','residential','unclassified','living_street','service','pedestrian','footway','path','cycleway','steps']),carTypes=new Set(['primary','secondary','tertiary','residential','unclassified','living_street','service']);
let target=null,route=[],distance=0,mode='',lastRoute=0,lastPos=null,message='',cx=0,cz=0,zoom=.38,width=1,height=1;
const [sw,se,,nw]=city.bounds,el=Math.hypot(se[0]-sw[0],se[1]-sw[1]),nl=Math.hypot(nw[0]-sw[0],nw[1]-sw[1]),ex=(se[0]-sw[0])/el,ez=(se[1]-sw[1])/el,nx=(nw[0]-sw[0])/nl,nz=(nw[1]-sw[1])/nl;
const worldDelta=(u,v)=>[ex*u+nx*v,ez*u+nz*v];
const nodes=[],ids=new Map(),edges=[];
function node(p){const k=Math.round(p[0]*10)+','+Math.round(p[1]*10);if(ids.has(k))return ids.get(k);const i=nodes.length;ids.set(k,i);nodes.push(p);edges.push([]);return i}
for(const r of city.roads){if(!allowed.has(r.type)||r.access==='private'||r.access==='no')continue;for(let j=1;j<r.points.length;j++){const a=node(r.points[j-1]),b=node(r.points[j]),l=Math.hypot(nodes[a][0]-nodes[b][0],nodes[a][1]-nodes[b][1]);if(a===b||l<.03)continue;const car=carTypes.has(r.type);edges[a].push({b,l,car,carOK:r.oneway!=='-1'});edges[b].push({b:a,l,car,carOK:!['yes','1','true'].includes(r.oneway)})}}
// Snap to several nearby public way vertices, then choose the connected route
// with the lowest combined network and endpoint access distance. A nearby
// isolated courtyard must not prevent routing along the adjacent main street.
function candidates(x,z,driving){const found=[];for(let i=0;i<nodes.length;i++){if(!edges[i].some(e=>!driving||(e.car&&e.carOK)))continue;const p=nodes[i],d=Math.hypot(p[0]-x,p[1]-z);if(d<=85)found.push({i,d})}found.sort((a,b)=>a.d-b.d);const limit=Math.min(85,(found[0]?.d||0)+40);return found.filter(x=>x.d<=limit).slice(0,28)}
function find(starts,ends,driving){if(!starts.length||!ends.length)return null;const cost=new Float64Array(nodes.length).fill(Infinity),prev=new Int32Array(nodes.length).fill(-1),heap=[],goal=new Map(ends.map(x=>[x.i,x.d*2]));let winner=-1,best=Infinity;
function push(v){heap.push(v);let i=heap.length-1;while(i){let p=(i-1)>>1;if(heap[p][0]<=v[0])break;heap[i]=heap[p];i=p}heap[i]=v}
function pop(){const top=heap[0],v=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1][0]<heap[j][0])j++;if(heap[j][0]>=v[0])break;heap[i]=heap[j];i=j}heap[i]=v}return top}
for(const s of starts){cost[s.i]=s.d*2;push([cost[s.i],s.i])}while(heap.length){const [c,i]=pop();if(c!==cost[i])continue;if(c>best)break;if(goal.has(i)&&c+goal.get(i)<best){best=c+goal.get(i);winner=i}for(const e of edges[i]){if(driving&&(!e.car||!e.carOK))continue;const n=c+e.l;if(n<cost[e.b]){cost[e.b]=n;prev[e.b]=i;push([n,e.b])}}}
if(winner<0)return null;const path=[];for(let i=winner;i>=0;i=prev[i])path.push(nodes[i]);path.reverse();let distance=0;for(let i=1;i<path.length;i++)distance+=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]);return {path,distance}}
function calculate(){if(!target)return;const p=getPlayer(),a=candidates(p.x,p.z,p.driving),b=candidates(...target,p.driving),result=find(a,b,p.driving);lastPos=[p.x,p.z];lastRoute=performance.now();mode=p.driving?'car':'walk';route=result?.path||[];distance=result?.distance||0;message=result?'Маршрут · '+Math.round(distance)+' м · '+(p.driving?'на машине':'пешком'):'Нет связного маршрута по этой точке';$('routeInfo').textContent=message;if(!panel.hidden)draw()}
function setTarget(x,z){target=[x,z];calculate();return route.length}
function pathDraw(c,pts,project,color,w){if(pts.length<2)return;c.beginPath();pts.forEach((p,i)=>{const q=project(...p);i?c.lineTo(...q):c.moveTo(...q)});c.lineWidth=w;c.strokeStyle=color;c.lineJoin=c.lineCap='round';c.stroke()}
function marker(c,p,color,r=5){c.fillStyle=color;c.beginPath();c.arc(p[0],p[1],r,0,Math.PI*2);c.fill()}
function draw(){if(panel.hidden)return;const r=canvas.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);width=r.width;height=r.height;if(canvas.width!==Math.round(width*d)||canvas.height!==Math.round(height*d)){canvas.width=Math.round(width*d);canvas.height=Math.round(height*d)}ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#20282b';ctx.fillRect(0,0,width,height);const project=(x,z)=>[width/2+((x-cx)*ex+(z-cz)*ez)*zoom,height/2-((x-cx)*nx+(z-cz)*nz)*zoom];for(const p of city.water||[]){ctx.fillStyle='#415d6a';ctx.beginPath();for(const ring of [p.points,...(p.holes||[])]){ring.forEach(([x,z],i)=>{const q=project(x,z);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath()}ctx.fill('evenodd')}for(const p of city.parks||[]){ctx.fillStyle='#35463a';ctx.beginPath();p.points.forEach(([x,z],i)=>{const q=project(x,z);i?ctx.lineTo(...q):ctx.moveTo(...q)});ctx.closePath();ctx.fill()}
for(const b of city.buildings){ctx.fillStyle='#596064';ctx.beginPath();for(const ring of [b.points,...(b.holes||[])]){ring.forEach(([x,z],i)=>{const p=project(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p)});ctx.closePath()}ctx.fill('evenodd')}
for(const r of city.roads)if(carTypes.has(r.type)||zoom>.8)pathDraw(ctx,r.points,project,carTypes.has(r.type)?'#9ba3a5':'#59676a',Math.max(1,r.width*zoom*.7));
ctx.font='10px system-ui';ctx.fillStyle='#f0f1ec';for(const p of city.places||[]){const q=project(...p.position);ctx.fillText(p.name.split(' — ')[0],q[0]+4,q[1]-5)}
pathDraw(ctx,route,project,'#bd8cff',4);if(target)marker(ctx,project(...target),'#d4a0ff',7);const p=getPlayer();marker(ctx,project(p.x,p.z),'#ffa65a',6);ctx.fillStyle='#e2e5e2';ctx.font='bold 13px system-ui';ctx.fillText('С ↑',12,20)}
function open(){stopInput();const p=getPlayer();cx=p.x;cz=p.z;panel.hidden=false;draw()}
function close(){panel.hidden=true}
let finger=null,sx=0,sy=0,ox=0,oz=0;canvas.onpointerdown=e=>{finger=e.pointerId;canvas.setPointerCapture(finger);sx=e.clientX;sy=e.clientY;ox=cx;oz=cz};
canvas.onpointermove=e=>{if(e.pointerId!==finger)return;const [dx,dz]=worldDelta(-(e.clientX-sx)/zoom,(e.clientY-sy)/zoom);cx=ox+dx;cz=oz+dz;draw()};
canvas.onpointerup=e=>{if(e.pointerId!==finger)return;finger=null;if(Math.hypot(e.clientX-sx,e.clientY-sy)<7){const r=canvas.getBoundingClientRect();const [dx,dz]=worldDelta((e.clientX-r.left-width/2)/zoom,-(e.clientY-r.top-height/2)/zoom);setTarget(cx+dx,cz+dz)}};
canvas.onpointercancel=()=>finger=null;
$('mapClose').onclick=close;$('mapPlus').onclick=()=>{zoom=Math.min(2.5,zoom*1.4);draw()};$('mapMinus').onclick=()=>{zoom=Math.max(.17,zoom/1.4);draw()};$('mapCenter').onclick=()=>{const p=getPlayer();cx=p.x;cz=p.z;draw()};$('routeClear').onclick=()=>{target=null;route=[];distance=0;$('routeInfo').textContent='Коснись улицы, чтобы поставить точку.';draw()};addEventListener('resize',draw);
return {open,close,setTarget,drawMini(c,project){pathDraw(c,route,project,'#bd8cff',4);if(target)marker(c,project(...target),'#d4a0ff',5)},tick(){const p=getPlayer();if(target&&performance.now()-lastRoute>1200&&(mode!==(p.driving?'car':'walk')||!lastPos||Math.hypot(p.x-lastPos[0],p.z-lastPos[1])>9))calculate()},inspect(){return{nodes:nodes.length,route:route.length,distance,target,mode,message}}}
}
