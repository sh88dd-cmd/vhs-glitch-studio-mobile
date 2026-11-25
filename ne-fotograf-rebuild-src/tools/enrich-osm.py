"""Enrich the existing exact city map with actual OSM building parts, trees and paved areas.
No guessed geometry is inserted into this file. Unmapped details remain explicitly unknown.
"""
import json, pathlib, math, urllib.request, xml.etree.ElementTree as ET, time, re
from shapely.geometry import Polygon, Point
from shapely.strtree import STRtree
p=pathlib.Path('public/assets/kitay-gorod.json')
j=json.loads(p.read_text())
S,W,N,E=j['bbox'];sw,se,ne,nw=j['bounds']
def local(lat,lon):
    u=(lon-W)/(E-W);v=(lat-S)/(N-S)
    return [round(sw[0]+(se[0]-sw[0])*u+(nw[0]-sw[0])*v,3),round(sw[1]+(se[1]-sw[1])*u+(nw[1]-sw[1])*v,3)]
def number(v):
    try:return float(str(v).replace(' m','').replace(',','.'))
    except:return None
headers={'User-Agent':'NE-FOTOGRAF/0.8 (OSM open map data; github.com/sh88dd-cmd/vhs-glitch-studio-mobile)'}
nodes={};ways={};rels={}
for iy in range(3):
    for ix in range(3):
        s,n=S+(N-S)*iy/3,S+(N-S)*(iy+1)/3
        w,e=W+(E-W)*ix/3,W+(E-W)*(ix+1)/3
        url=f'https://api.openstreetmap.org/api/0.6/map?bbox={w},{s},{e},{n}'
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=90) as f: doc=ET.fromstring(f.read())
                break
            except Exception:
                if attempt==2:raise
                time.sleep(3*(attempt+1))
        for node in doc.findall('node'):
            nodes[node.attrib['id']]=(float(node.attrib['lat']),float(node.attrib['lon']),{t.attrib['k']:t.attrib['v'] for t in node.findall('tag')})
        for way in doc.findall('way'):
            ways[int(way.attrib['id'])]=([n.attrib['ref'] for n in way.findall('nd')],{t.attrib['k']:t.attrib['v'] for t in way.findall('tag')})
        print('OSM detail tile',iy,ix,flush=True)
parents=[];polygons=[]
for b in j['buildings']:
    poly=Polygon(b['points'],b.get('holes',[]))
    if not poly.is_valid:poly=poly.buffer(0)
    if poly.is_empty:continue
    parents.append(b);polygons.append(poly)
tree=STRtree(polygons)
parts=[]; surfaces=[]; fences=[]; trees=[]; entrances=[]
for wid,(refs,t) in ways.items():
    if len(refs)<2 or not all(r in nodes for r in refs):continue
    pts=[local(*nodes[r][:2]) for r in refs]
    if 'building:part' in t and t['building:part']!='no' and len(pts)>=4 and refs[0]==refs[-1]:
        poly=Polygon(pts[:-1])
        if not poly.is_valid:poly=poly.buffer(0)
        if poly.is_empty or poly.area<.4:continue
        candidates=[]
        for k in tree.query(poly):
            k=int(k);area=poly.intersection(polygons[k]).area
            if area>poly.area*.6:candidates.append((area/poly.area,-polygons[k].area,k))
        if not candidates:continue
        par=parents[max(candidates)[2]]
        height=number(t.get('height'))
        if height is None and number(t.get('building:levels')) is not None:height=number(t['building:levels'])*3.25
        if height is None:continue
        bottom=number(t.get('min_height'))
        if bottom is None:bottom=(number(t.get('building:min_level')) or 0)*3.25
        if not 0<=bottom<height<=210:continue
        roof=t.get('roof:shape','flat');rh=number(t.get('roof:height')) or 0
        parts.append({'id':wid,'parent':par['id'],'points':pts[:-1],'height':height,'minHeight':bottom,'roof':roof,'roofHeight':max(0,min(rh,height-bottom)),'colour':t.get('building:colour',''),'roofColour':t.get('roof:colour',''),'material':t.get('building:material',''),'levels':number(t.get('building:levels'))})
    if refs[0]==refs[-1] and len(pts)>=4 and (t.get('highway')=='pedestrian' and t.get('area')=='yes' or t.get('landuse') in ('grass','flowerbed','recreation_ground') or t.get('natural') in ('grassland','scrub') or t.get('leisure') in ('garden','pitch') or t.get('amenity')=='parking'):
        kind='paving' if t.get('highway')=='pedestrian' else 'parking' if t.get('amenity')=='parking' else 'green'
        surfaces.append({'id':wid,'kind':kind,'surface':t.get('surface',''),'points':pts[:-1]})
    if t.get('barrier') in ('fence','wall','retaining_wall','hedge'):
        fences.append({'id':wid,'kind':t['barrier'],'height':number(t.get('height')),'points':pts})
for nid,(lat,lon,t) in nodes.items():
    if t.get('natural')=='tree':
        trees.append({'id':int(nid),'position':local(lat,lon),'height':number(t.get('height')),'species':t.get('species',''),'leafType':t.get('leaf_type','')})
    if t.get('entrance') not in (None,'no','emergency','service'):
        entrances.append({'id':int(nid),'position':local(lat,lon),'type':t.get('entrance')})
# Record real part coverage. A full parent is replaced by its parts only when
# they cover at least 92% of the footprint at ground level.
from shapely.ops import unary_union
groups={}
for a in parts:groups.setdefault(a['parent'],[]).append(a)
for b,poly in zip(parents,polygons):
    group=groups.get(b['id'],[])
    if not group:continue
    ground=[Polygon(a['points']).buffer(0) for a in group if a['minHeight']<.5]
    coverage=unary_union(ground).intersection(poly).area/poly.area if ground and poly.area else 0
    b['partCoverage']=round(coverage,4)
    if coverage>=.92:b['replaceWithParts']=True
j.update({'buildingParts':parts,'mappedSurfaces':surfaces,'mappedBarriers':fences,'mappedTrees':trees,'mappedEntrances':entrances,'detailDataVersion':1})
p.write_text(json.dumps(j,ensure_ascii=False,separators=(',',':')))
print('Mapped details',len(parts),len(groups),len(surfaces),len(fences),len(trees),len(entrances),'full part coverage',sum(bool(b.get('replaceWithParts')) for b in parents),flush=True)
assert len(parts)>50 and len(trees)>10 and len(surfaces)>10
