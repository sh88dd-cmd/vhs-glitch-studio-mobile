import io,json,struct,pathlib
from PIL import Image
root=pathlib.Path('ne-fotograf/models')
out=root/'ara-mobile'
out.mkdir(exist_ok=True)
def resize_glb(source,target,limit):
    raw=source.read_bytes()
    magic,ver,total,n,typ=struct.unpack_from('<5I',raw)
    assert magic==0x46546c67 and ver==2 and total==len(raw) and typ==0x4e4f534a
    d=json.loads(raw[20:20+n])
    offset=20+n
    length,kind=struct.unpack_from('<2I',raw,offset)
    assert kind==0x004e4942 and len(d['buffers'])==1
    original=raw[offset+8:offset+8+length]
    assert not any('EXT_meshopt_compression' in v.get('extensions',{}) for v in d['bufferViews'])
    replacements={}
    for image in d.get('images',[]):
        if 'bufferView' not in image: continue
        idx=image['bufferView'];v=d['bufferViews'][idx]
        start=v.get('byteOffset',0);data=original[start:start+v['byteLength']]
        with Image.open(io.BytesIO(data)) as im:
            if max(im.size)<=limit: continue
            im.thumbnail((limit,limit),Image.Resampling.LANCZOS)
            f=io.BytesIO()
            if image.get('mimeType')=='image/jpeg':
                im.convert('RGB').save(f,format='JPEG',quality=88,optimize=True)
            else:
                im.save(f,format='PNG',optimize=True)
                image['mimeType']='image/png'
            replacements[idx]=f.getvalue()
    blob=bytearray()
    for i,v in enumerate(d['bufferViews']):
        start=v.get('byteOffset',0);size=v['byteLength']
        data=replacements.get(i,original[start:start+size])
        while len(blob)%4: blob.append(0)
        v['byteOffset']=len(blob);v['byteLength']=len(data)
        blob.extend(data)
    while len(blob)%4:blob.append(0)
    d['buffers'][0]['byteLength']=len(blob)
    j=json.dumps(d,separators=(',',':')).encode()
    j+=b' '*((-len(j))%4)
    result=struct.pack('<5I',magic,ver,28+len(j)+len(blob),len(j),typ)+j+struct.pack('<2I',len(blob),kind)+blob
    assert len(result)==28+len(j)+len(blob)
    target.write_bytes(result)
    print(source.name,len(raw),'->',len(result),'resized images',len(replacements),flush=True)
for p in sorted((root/'ara').glob('*.glb')):
    resize_glb(p,out/p.name,1024 if p.stem=='hero' else 512)
assert len(list(out.glob('*.glb')))==8
try:
    resize_glb(root/'Nudgirl1.glb',out/'imported.glb',512)
except Exception as e:
    print('Optional imported model:',e)
(out/'manifest.json').write_text(json.dumps({'version':1,'models':[p.name for p in out.glob('*.glb')]}))
