"""Bake an actual OSM footprint/road subset, never substitute synthetic map data."""
import json, math, pathlib, urllib.request, urllib.parse, xml.etree.ElementTree as ET
S,W,N,E=55.7531,37.6270,55.7554,37.6322
target=(55.75428,37.6296)
headers={'User-Agent':'NE-FOTOGRAF/0.3 (small open-data game map; GitHub sh88dd-cmd/vhs-glitch-studio-mobile)'}
bbox=f'{S},{W},{N},{E}'
def request(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=85) as r:
        return r.read()
errors=[]
ways=[]
try:
    xml=ET.fromstring(request(f'https://api.openstreetmap.org/api/0.6/map?bbox={W},{S},{E},{N}'))
    nodes={n.attrib['id']:(float(n.attrib['lat']),float(n.attrib['lon'])) for n in xml.findall('node')}
    for w in xml.findall('way'):
        tags={t.attrib['k']:t.attrib['v'] for t in w.findall('tag')}
        if 'building' not in tags and 'highway' not in tags:continue
        refs=[n.attrib['ref'] for n in w.findall('nd')]
        if len(refs)<2 or not all(r in nodes for r in refs):continue
        ways.append({'id':int(w.attrib['id']),'tags':tags,'coords':[nodes[r] for r in refs]})
except Exception as e:errors.append(str(e))
if len(ways)<20:
    q=f'[out:json][timeout:55];(way["building"]({bbox});way["highway"]({bbox}););out geom;'
    for host in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter']:
        try:
            data=json.loads(request(host+'?'+urllib.parse.urlencode({'data':q})))
            ways=[{'id':w['id'],'tags':w.get('tags',{}),'coords':[(n['lat'],n['lon']) for n in w.get('geometry',[])]} for w in data['elements'] if w.get('type')=='way' and w.get('geometry')]
            if len(ways)>=20:break
        except Exception as e:errors.append(str(e))
if len(ways)<20:raise RuntimeError('OSM unavailable: '+str(errors))
def meters(c):
    return ((c[1]-target[1])*111320*math.cos(math.radians(target[0])),(c[0]-target[0])*111320)
def distance(p):return math.hypot(*p)
allowed={'primary','secondary','tertiary','residential','unclassified','living_street','pedestrian','service'}
roads=[]
for w in ways:
    t=w['tags']; typ=t.get('highway')
    if typ not in allowed or t.get('area')=='yes' or t.get('tunnel')=='yes':continue
    pts=[meters(c) for c in w['coords']]
    if len(pts)<2:continue
    try:width=float(t.get('width','').replace(' m',''))
    except:width={'primary':12,'secondary':10,'tertiary':8,'pedestrian':7,'residential':6,'unclassified':6,'living_street':5,'service':4}[typ]
    width=max(3,min(width,20))
    roads.append({'id':w['id'],'name':t.get('name:ru',t.get('name','')),'type':typ,'width':width,'points':pts})
candidates=[]
for r in roads:
    if not r['name'] or r['type']=='service':continue
    for a,b in zip(r['points'],r['points'][1:]):
        dx,dz=b[0]-a[0],b[1]-a[1];l=math.hypot(dx,dz)
        if l<12:continue
        mid=((a[0]+b[0])/2,(a[1]+b[1])/2)
        score=distance(mid)+(0 if 'Ильинка' in r['name'] or 'Ипатьевский' in r['name'] else 15)-min(l,50)*.3
        if distance(mid)<135:candidates.append((score,r,mid,(dx/l,dz/l),l))
if not candidates:raise RuntimeError('No named street segment in map')
_,spawn,origin,forward,seglen=min(candidates,key=lambda x:x[0])
fx,fz=forward
def local(p):
    dx,dz=p[0]-origin[0],p[1]-origin[1]
    return [round(dx*fz-dz*fx,3),round(dx*fx+dz*fz-14,3)]
def nearby(pts):return any(distance((p[0]-origin[0],p[1]-origin[1]))<175 for p in pts)
buildings=[]
for w in ways:
    t=w['tags']
    if 'building' not in t or t['building'] in ('no','roof') or len(w['coords'])<4 or w['coords'][0]!=w['coords'][-1]:continue
    pts=[meters(c) for c in w['coords'][:-1]]
    if not nearby(pts):continue
    pts=[local(p) for p in pts]
    if len(pts)<3:continue
    area=abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(pts,pts[1:]+pts[:1])))/2
    if area<8 or area>15000:continue
    try:h=float(t.get('height','').replace(' m',''));kind='height'
    except:
        try:h=float(t['building:levels'])*3.25;kind='levels'
        except:h=12;kind='estimate'
    h=max(3,min(45,h))
    buildings.append({'id':w['id'],'points':pts,'height':round(h,2),'heightSource':kind,'name':t.get('name','')})
outroads=[{**r,'points':[local(p) for p in r['points']]} for r in roads if nearby(r['points'])]
if len(buildings)<10 or len(outroads)<5:raise RuntimeError(f'Incomplete map {len(buildings)} buildings {len(outroads)} roads')
# The sampled spawn segment is straight by construction; NPCs follow real street geometry.
data={'source':'OpenStreetMap','bbox':[S,W,N,E],'spawn':{'street':spawn['name'],'width':spawn['width'],'length':round(seglen,2),'position':[0,-14]},'buildings':buildings,'roads':outroads}
p=pathlib.Path('public/assets/kitay-gorod.json');p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print('OSM:',len(buildings),'building footprints;',len(outroads),'roads; spawn:',data['spawn'],flush=True)
