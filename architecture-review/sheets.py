from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import json, collections
root=Path('/tmp/nf-architecture-individual')
rows=json.loads((root/'audit-results.json').read_text())
groups=collections.defaultdict(list)
for row in rows:groups[row['street']].append(row)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
for k,(street,items) in enumerate(groups.items(),1):
    for page in range(0,len(items),18):
        items2=items[page:page+18]
        im=Image.new('RGB',(1200,44+255*((len(items2)+2)//3)),(246,246,246))
        draw=ImageDraw.Draw(im)
        draw.text((12,10),f'{street} / {page//18+1} — НЕ ПРОВЕРЕНО',fill=(20,20,20),font=font)
        for i,item in enumerate(items2):
            x=(i%3)*400+5;y=(i//3)*255+44
            if item.get('file'):
                q=Image.open(root/item['file']).convert('RGB')
                q.thumbnail((390,220));im.paste(q,(x,y))
            else:draw.text((x+8,y+80),'Нет открытого ракурса',font=font,fill=(150,50,40))
            text=f"{item.get('number') or 'без номера'} | OSM {item['osmId']} | {item.get('visibleSamples',0)}/{item.get('totalSamples',7)}"
            draw.text((x,y+223),text,font=font,fill=(20,20,20))
        im.save(root/f'sheet-{k:02d}-{page//18+1:02d}.jpg',quality=85)
