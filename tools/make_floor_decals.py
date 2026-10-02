# Builds assets/floor/*.png: the plant layer of the overgrown-tile sheets (sheet1.png, sheet2.png), stone keyed out, shrunk to game pixel size.
from PIL import Image
import numpy as np, json, os
from scipy import ndimage as nd
from scipy.cluster.vq import kmeans2
rng = np.random.default_rng(7)
TH, DIL = .3, 3
S1 = np.array(Image.open('sheet1.png').convert('RGB')); S2 = np.array(Image.open('sheet2.png').convert('RGB'))
def mask(a, brown=False):
    r,g,b = [a[...,i].astype(int) for i in range(3)]
    green = (g > r + 10) & (g > b + 8) & (g > 45)
    near = nd.binary_dilation(green, iterations=6)
    yellow = (r > 170) & (g > 150) & (b < 110)
    white = (r > 190) & (g > 190) & (b > 170)
    extra = yellow | white
    if brown: extra |= (r > g + 15) & (g > b) & (r > 90) & (r < 235)
    m = green | (extra & near)
    return nd.binary_opening(nd.binary_closing(m, iterations=1), iterations=1)
def blob(w, h, seed, soft=.35):
    # an organic outline: an ellipse whose radius wobbles, so a patch never reads as a square tile
    y, x = np.mgrid[0:h, 0:w]; u = (x + .5)/w*2 - 1; v = (y + .5)/h*2 - 1
    a = np.arctan2(v, u); r = np.hypot(u, v)
    rr = np.random.default_rng(seed)
    wob = 1 - soft*.5 + sum(rr.uniform(0, soft/3)*np.cos(k*a + rr.uniform(0, 6.3)) for k in (2, 3, 5))
    noise = rr.uniform(-.04, .04, (h, w))
    return r + noise < wob
def decal(src, box, ow, oh, seed, brown=False, shape='blob', sat=.7, val=.74):
    x0, y0, x1, y1 = box; t = src[y0:y1, x0:x1]; m0 = mask(t, brown); m = nd.binary_dilation(m0, iterations=DIL)
    H, W = m.shape; out = np.zeros((oh, ow, 4), np.uint8)
    pix = t[m0].astype(float)
    k = min(9, max(3, len(pix)//4000))
    cent, _ = kmeans2(pix[rng.choice(len(pix), min(len(pix), 20000), replace=False)], k, minit='++', seed=seed)
    keep = blob(ow, oh, seed) if shape == 'blob' else np.ones((oh, ow), bool)
    for j in range(oh):
        for i in range(ow):
            ya, yb = j*H//oh, (j+1)*H//oh; xa, xb = i*W//ow, (i+1)*W//ow
            mm = m[ya:yb, xa:xb]
            if mm.mean() < TH or not keep[j, i]: continue
            m0b = m0[ya:yb, xa:xb]
            if m0b.mean() < .12: continue
            c = t[ya:yb, xa:xb][m0b].astype(float)
            idx = np.argmin(((c[:, None, :] - cent[None])**2).sum(-1), 1)
            col = cent[np.bincount(idx, minlength=len(cent)).argmax()]
            if col.max() < 40: continue
            out[j, i, :3] = col; out[j, i, 3] = 255
    # sit it in the game's palette: a little less saturated and bright than the source art
    rgb = out[..., :3].astype(float); g = rgb.mean(-1, keepdims=True)
    rgb = (g + (rgb - g)*sat)*val
    out[..., :3] = np.clip(rgb, 0, 255)
    return out
X2 = [55, 400, 738, 1078, 1418]; Y2 = [52, 392, 735, 1075]
def t2(c, r, pad=8): return (X2[c] + pad, Y2[r] + pad, X2[c] + 290 - pad, Y2[r] + 290 - pad)
def sub(b, fx0, fy0, fx1, fy1):
    x0, y0, x1, y1 = b; w, h = x1 - x0, y1 - y0
    return (int(x0 + w*fx0), int(y0 + h*fy0), int(x0 + w*fx1), int(y0 + h*fy1))
# name: (sheet, box, w, h, seed, brown, shape)
D = {
  'f_moss1':   (S2, sub(t2(1,0), 0, 0, .55, .55), 15, 15, 1, False, 'blob'),     # clover-moss clumps
  'f_moss2':   (S2, sub(t2(1,0), .4, .4, 1, 1),   16, 15, 2, False, 'blob'),
  'f_weeds':   (S2, t2(2,0), 21, 20, 3, False, 'blob'),                           # weeds in the cracks, tiny white flowers
  'f_crack':   (S2, t2(0,0), 22, 22, 4, False, 'blob'),                           # thin moss lines along the cracks
  'f_vine':    (S2, t2(1,1), 24, 23, 5, False, 'blob'),                           # creeping vine with leaves
  'f_mossmat': (S2, t2(2,1), 22, 22, 6, False, 'blob'),                           # thick moss mat
  'f_sprouts': (S2, t2(4,1), 20, 19, 7, True,  'blob'),                           # sprouts and little mushrooms
  'f_seam':    (S2, t2(2,3), 22, 21, 8, False, 'blob'),                           # moss and sprouts along the paving seams
  'f_ivy':     (S2, t2(3,3), 24, 24, 9, False, 'blob'),                           # ivy and root tangle
  'f_leaves':  (S2, t2(4,2), 20, 20, 10, False, 'blob'),                          # scattered leaves
  'f_grass1':  (S1, (560, 760, 920, 880), 30, 9, 11, False, 'rect'),             # grass fringe with clover and white flowers, for kerbs
  'f_grass2':  (S1, (1490, 1110, 1860, 1240), 30, 9, 12, False, 'rect'),         # plain grass fringe
}
os.makedirs('out', exist_ok=True); sizes = {}
prev = Image.new('RGBA', (len(D)*36*5, 40*5), (110, 108, 112, 255))
for n, (name, (src, box, w, h, sd, br, sh)) in enumerate(D.items()):
    a = decal(src, box, w, h, sd, br, sh); im = Image.fromarray(a, 'RGBA'); im.save(f'out/{name}.png'); sizes[name] = [w, h]
    prev.alpha_composite(im.resize((w*5, h*5), Image.NEAREST), (n*36*5 + 5, 25))
    print(name, w, h, int((a[..., 3] > 0).mean()*100), '% filled')
prev.save('prev.png'); json.dump(sizes, open('sizes.json', 'w'))
