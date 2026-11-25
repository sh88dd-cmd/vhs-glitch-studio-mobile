"""Bake manually selected licensed photo regions, retaining source credits."""
import json,pathlib,urllib.request,urllib.parse,hashlib,time,shutil
import numpy as np
import cv2
from PIL import Image,ImageOps
root=pathlib.Path('public/assets/facades');root.mkdir(parents=True,exist_ok=True)
entries=json.load(open('facade-photo-sources.json')); images={};masks={}
headers={'User-Agent':'NE-FOTOGRAF architecture/0.8 (https://github.com/sh88dd-cmd/vhs-glitch-studio-mobile; licensed Commons photos)'}
for e in entries:
    key=e['key'];title=e['title'].replace(' ','_');digest=hashlib.md5(title.encode()).hexdigest()
    url='https://upload.wikimedia.org/wikipedia/commons/'+digest[0]+'/'+digest[:2]+'/'+urllib.parse.quote(title)
    raw=pathlib.Path('/tmp')/('nf-photo-'+key+'.jpg')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as f,raw.open('wb') as dst:shutil.copyfileobj(f,dst)
            break
        except Exception:
            if attempt==2:raise
            time.sleep(3+attempt*2)
    with Image.open(raw) as im:
        im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((2600,2600),Image.Resampling.LANCZOS);arr=np.array(im)
    H,W=arr.shape[:2];ow,oh=e['size'];outw,outh=e['output']
    def scaled(p):return np.array([(x*W/ow,y*H/oh) for x,y in p],np.float32)
    mat=cv2.getPerspectiveTransform(scaled(e['quad']),np.array([[0,0],[outw-1,0],[outw-1,outh-1],[0,outh-1]],np.float32))
    images[key]=cv2.warpPerspective(arr,mat,(outw,outh),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
    mask=np.zeros((H,W),np.uint8)
    for p in e.get('mask',[]):cv2.fillPoly(mask,[np.round(scaled(p)).astype(np.int32)],255)
    masks[key]=cv2.dilate(cv2.warpPerspective(mask,mat,(outw,outh),flags=cv2.INTER_NEAREST),np.ones((5,5),np.uint8))
    raw.unlink(missing_ok=True);print('Rectified',key,images[key].shape,flush=True)
# Alternate viewpoint supplies the missing pixels behind poles and signs.
p=images['piggy'];alt=images['piggy-alt'];m=masks['piggy'];am=masks['piggy-alt']
valid=(m>0)&(am==0);p[valid]=alt[valid];m[valid]=0
manifest=[]
for e in entries:
    key=e['key']
    if e['mode']=='alternate':continue
    im=images[key];mask=masks[key]
    if np.any(mask):im=cv2.inpaint(im,mask,5,cv2.INPAINT_TELEA)
    im=np.clip(im.astype(np.float32)*.94+7,0,255).astype(np.uint8)
    out=root/(key+'.webp');Image.fromarray(im).save(out,'WEBP',quality=89,method=6)
    e['file']=key+'.webp';e['source']='https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(e['title'].replace(' ','_'));manifest.append(e)
    print('Texture',key,out.stat().st_size,flush=True)
(root/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False))
(root/'CREDITS.txt').write_text('\n'.join(e['title']+' — '+e['author']+' — '+e['license']+'; https://commons.wikimedia.org/wiki/File:'+urllib.parse.quote(e['title'].replace(' ','_'))+'; changes: perspective rectification, cropping, occlusion repair, color normalization. Texture retains source license.' for e in entries)+'\nhttps://creativecommons.org/publicdomain/zero/1.0/\nhttps://creativecommons.org/licenses/by-sa/3.0/\nhttps://creativecommons.org/licenses/by-sa/4.0/\n')
assert len(manifest)==7
