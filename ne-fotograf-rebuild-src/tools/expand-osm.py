"""Bake an actual OSM footprint/road subset, never substitute synthetic map data."""
import json, math, pathlib, urllib.request, urllib.parse, xml.etree.ElementTree as ET
S,W,N,E=55.7475,37.6210,55.7605,37.6440
old=json.loads(pathlib.Path('../ne-fotograf-next/assets/kitay-gorod.json').read_text())
target=(55.75428,37.6296)
headers={'User-Agent':'NE-FOTOGRAF/0.3 (small open-data game map; GitHub sh88dd-cmd/vhs-glitch-studio-mobile)'}
bbox=f'{S},{W},{N},{E}'
def request(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=85) as r:
        return r.read()
ways_by_id={}
for iy in range(3):
    for ix in range(3):
        s,n=S+(N-S)*iy/3,S+(N-S)*(iy+1)/3
        w,e=W+(E-W)*ix/3,W+(E-W)*(ix+1)/3
        for attempt in range(3):
            try:
                xml=ET.fromstring(request(f'https://api.openstreetmap.org/api/0.6/map?bbox={w},{s},{e},{n}'))
                break
            except Exception:
                if attempt==2:raise
        nodes={n.attrib['id']:(float(n.attrib['lat']),float(n.attrib['lon'])) for n in xml.findall('node')}
        for a in xml.findall('way'):
            tags={t.attrib['k']:t.attrib['v'] for t in a.findall('tag')}
            if 'building' not in tags and 'highway' not in tags and tags.get('leisure') not in ('park','garden') and tags.get('landuse') not in ('grass','forest') and tags.get('natural')!='wood':continue
            refs=[n.attrib['ref'] for n in a.findall('nd')]
            if len(refs)>=2 and all(r in nodes for r in refs):ways_by_id[int(a.attrib['id'])]={'id':int(a.attrib['id']),'tags':tags,'coords':[nodes[r] for r in refs]}
        print('Tile',iy,ix,len(ways_by_id),flush=True)
ways=list(ways_by_id.values())
def meters(c):
    return ((c[1]-target[1])*111320*math.cos(math.radians(target[0])),(c[0]-target[0])*111320)
def distance(p):return math.hypot(*p)
allowed={'primary','secondary','tertiary','residential','unclassified','living_street','pedestrian','service','footway','path','cycleway','steps'}
roads=[]
for w in ways:
    t=w['tags']; typ=t.get('highway')
    if typ not in allowed or t.get('area')=='yes' or t.get('tunnel')=='yes':continue
    pts=[meters(c) for c in w['coords']]
    if len(pts)<2:continue
    try:width=float(t.get('width','').replace(' m',''))
    except:width={'primary':12,'secondary':10,'tertiary':8,'pedestrian':7,'residential':6,'unclassified':6,'living_street':5,'service':4,'footway':1.6,'path':1.5,'cycleway':2,'steps':1.7}[typ]
    width=max(1.2,min(width,25))
    roads.append({'id':w['id'],'name':t.get('name:ru',t.get('name','')),'type':typ,'width':width,'points':pts})
candidates=[]
for r in roads:
    if r['id']!=84653689:continue
    for a,b in zip(r['points'],r['points'][1:]):
        dx,dz=b[0]-a[0],b[1]-a[1];l=math.hypot(dx,dz)
        if abs(l-old['spawn']['length'])>.06:continue
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        score=distance(mid)+(0 if 'Ильинка' in r['name'] or 'Ипатьевский' in r['name'] else 15)-min(l,50)*.3
        if distance(mid)<135:candidates.append((score,r,mid,(dx/l,dz/l),l))
if not candidates:raise RuntimeError('No named street segment in map')
_,spawn,origin,forward,seglen=min(candidates,key=lambda x:x[0])
fx,fz=forward
def local(p):
    dx,dz=p[0]-origin[0],p[1]-origin[1]
    return [round(dx*fz-dz*fx,3),round(dx*fx+dz*fz-14,3)]
def nearby(pts):return any(abs(p[0]-origin[0])<1000 and abs(p[1]-origin[1])<1000 for p in pts)
buildings=[]
for w in ways:
    t=w['tags']
    if 'building' not in t or t['building'] in ('no','roof') or len(w['coords'])<4 or w['coords'][0]!=w['coords'][-1]:continue
    pts=[meters(c) for c in w['coords'][:-1]]
    if not nearby(pts):continue
    pts=[local(p) for p in pts]
    if len(pts)<3:continue
    area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(pts,pts[1:]+pts[:1])))/2
    if area<8 or area>40000:continue
    try:h=float(t.get('height','').replace(' m',''));kind='height'
    except:
        try:h=float(t['building:levels'])*3.25;kind='levels'
        except:h=12;kind='estimate'
    h=max(3,min(65,h))
    buildings.append({'id':w['id'],'points':pts,'height':round(h,2),'heightSource':kind,'name':t.get('name',''),'street':t.get('addr:street',''),'number':t.get('addr:housenumber','')})
outroads=[{**r,'points':[local(p) for p in r['points']]} for r in roads if nearby(r['points'])]
# Verify alignment before merging original tested geometry.
seed=next(r for r in outroads if r['id']==84653689)
oldseed=next(r for r in old['roads'] if r['id']==84653689)
assert all(any(math.dist(a,b)<.03 for b in seed['points']) for a in oldseed['points']), 'Coordinate alignment'
def merge(new,previous):
    d={r['id']:r for r in new}
    d.update({r['id']:r for r in previous})
    return list(d.values())
buildings=merge(buildings,old['buildings'])
outroads=merge(outroads,old['roads'])
parks=[]
for w in ways:
    t,c=w['tags'],w['coords']
    if len(c)<4 or c[0]!=c[-1]:continue
    if t.get('leisure') not in ('park','garden') and t.get('landuse') not in ('grass','forest') and t.get('natural')!='wood':continue
    pts=[local(meters(p)) for p in c[:-1]]
    area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(pts,pts[1:]+pts[:1])))/2
    if 10<area<350000:parks.append({'id':w['id'],'name':t.get('name',''),'points':pts})
places=[]
for name in ['Маросейка','Солянка','Лубянский проезд','Варварка','Китайгородский проезд']:
    matches=[r for r in outroads if name.casefold() in r['name'].casefold() and r['type'] not in ('footway','path','steps')]
    if not matches:raise RuntimeError('Missing '+name)
    r=max(matches,key=lambda r:sum(math.dist(a,b) for a,b in zip(r['points'],r['points'][1:])))
    a,b=max(zip(r['points'],r['points'][1:]),key=lambda ab:math.dist(*ab))
    places.append({'name':name,'position':[(a[0]+b[0])/2,(a[1]+b[1])/2],'yaw':math.atan2(b[0]-a[0],b[1]-a[1]),'type':'street'})
p=next((p for p in parks if 'зарядье' in p['name'].lower()),None)
if p:
    places.append({'name':'Зарядье','position':[sum(v[0] for v in p['points'])/len(p['points']),sum(v[1] for v in p['points'])/len(p['points'])],'yaw':0,'type':'park'})
else:
    places.append({**next(p for p in places if p['name']=='Варварка'),'name':'Зарядье — подход с Варварки'})
places.append({'name':'Piggy — Солянка, 4 стр. 4','position':local(meters((55.75372,37.637101))),'yaw':0,'type':'reference'})
assert len(buildings)>=150 and len(outroads)>=150,'Expanded map incomplete'
bounds=[local(meters(c)) for c in [(S,W),(S,E),(N,E),(N,W)]]
data={**old,'bbox':[S,W,N,E],'buildings':buildings,'roads':outroads,'parks':parks,'places':places,'bounds':bounds,'expanded':True}
p=pathlib.Path('public/assets/kitay-gorod.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print('EXPANDED',len(buildings),len(outroads),len(parks),places,flush=True)
