# Usage: put the three hologram sheets next to this as s1.png, s2.png, s3.png, then run it; writes holo_ads.png
# Builds assets/sprites/holo_ads.png: nine animated hologram ads cut from the three neon sheets, one row per ad,
# each frame in a 64x48 cell (portrait ads 40x46, landscape 64x44, top-left of the cell).
from PIL import Image
import numpy as np
from scipy import ndimage as nd
CELL = (64, 48)
def boxes(f):
    a = np.array(Image.open(f).convert('RGB')).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    orange = (r > 200) & (g > 80) & (g < 170) & (b < 80)
    lab, n = nd.label(nd.binary_opening(~orange, iterations=3))
    bx = [(s[0].start, s[0].stop, s[1].start, s[1].stop) for s in nd.find_objects(lab) if s[0].stop - s[0].start > 150 and s[1].stop - s[1].start > 150]
    bx.sort(key=lambda q: (round(q[0]/200), q[2]))
    return Image.open(f).convert('RGB'), bx
atlas = Image.new('RGBA', (CELL[0]*6, CELL[1]*9), (0, 0, 0, 255))
ad = 0
for f, per, size in [('s1.png', 6, (40, 46)), ('s2.png', 6, (40, 46)), ('s3.png', 4, (64, 44))]:
    im, bx = boxes(f)
    rows = [bx[k:k + per] for k in range(0, len(bx), per)]
    for row in rows:
        H = max(q[1] - q[0] for q in row); W = max(q[3] - q[2] for q in row)
        for fr, (y0, y1, x0, x1) in enumerate(row):
            crop = im.crop((x0 + 3, y0 + 3, x1 - 3, y1 - 3))
            pad = Image.new('RGB', (W - 6, H - 6), (0, 0, 0)); pad.paste(crop, ((W - 6 - crop.width)//2, (H - 6 - crop.height)//2))
            px = pad.resize(size, Image.LANCZOS)
            arr = np.array(px).astype(float)
            arr = np.clip((arr - 18)*1.25, 0, 255)          # clean the black, lift the neon
            atlas.paste(Image.fromarray(arr.astype(np.uint8)), (fr*CELL[0], ad*CELL[1]))
        ad += 1
atlas.save('holo_ads.png'); print(ad, atlas.size)
