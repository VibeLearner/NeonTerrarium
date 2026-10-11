#!/usr/bin/env python3
"""Draw the code-made sprites on a bare page (no game) and write a contact sheet: old picture | new variants, at 1x and 4x.
  python3 tools/procfol/sprites_dump.py [--family grass|ground|fern|shrub|hang|floor|laundry|all] [--kinds a,b,c] [--out DIR] [--scale 4]
Uses js/spritegen.js and every js/spritegen_*.js; sizes come from js/sprites.js (SPR, gt sizes, FLOOR_SPR)."""
import argparse, glob, json, os, re, sys, base64, io
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FAM = {
 'grass': [f'gt{i}' for i in range(10)],
 'ground': ['g_clover','g_cover','g_spread1','g_spread2','g_moss2','moss','g_flowers'],
 'fern': ['fern','g_fern2','g_fern3'],
 'shrub': ['bush','bushFlower','bonsai','bamboo','succulent'],
 'hang': ['vines','pothos','h_ivy','h_vine3','h_curtain1','h_curtain2','h_curtain3','h_heart','l_mossroots','w_tangle'],
 'laundry': ['l_tee_blue','l_tee_peach','l_tee_rose','l_tee_sage','l_tee_butter','l_tee_lilac','l_jeans','l_socks','l_towel_cream','l_towel_green','l_shirt_pink','l_shirt_blue'],
 'floor': ['f_moss1','f_moss2','f_weeds','f_crack','f_vine','f_mossmat','f_sprouts','f_seam','f_ivy','f_leaves','f_grass1','f_grass2'],
}
def sizes():
    s = open(os.path.join(ROOT, 'js/sprites.js')).read()
    spr = json.loads(re.search(r'const SPR = (\{.*\});', s).group(1))['size']
    for k, w, h in re.findall(r'(gt\d):\[(\d+),(\d+)\]', s): spr[k] = [int(w), int(h)]
    fl = {k: [int(w), int(h)] for k, w, h in re.findall(r'(f_\w+):\[(\d+),(\d+)\]', s)}
    return spr, fl
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--family', default='all'); ap.add_argument('--kinds'); ap.add_argument('--out', default='/tmp/procfol_dump'); ap.add_argument('--scale', type=int, default=4); ap.add_argument('--gen', help='load only this family file (js/spritegen_x.js) after the core, so a half-written file of another family does not get in the way')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    spr, fl = sizes()
    fams = list(FAM) if a.family == 'all' else a.family.split(',')
    from playwright.sync_api import sync_playwright
    files = [os.path.join(ROOT, 'js/spritegen.js')] + ([os.path.join(ROOT, a.gen)] if a.gen else sorted(glob.glob(os.path.join(ROOT, 'js/spritegen_*.js'))))
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.set_content('<html><body></body></html>')
        for f in files: pg.add_script_tag(content=open(f).read() + '\n;window.SG = SG;')
        pg.evaluate('SG.__t0 = 0')
        for fam in fams:
            kinds = a.kinds.split(',') if a.kinds else FAM[fam]
            rows = []
            for k in kinds:
                w, h = (fl if fam == 'floor' else spr)[k]
                n = pg.evaluate('k => SG.COUNT[k] || SG.FCOUNT[k] || 1', k)
                has = pg.evaluate('k => SG.has(k)', k)
                new = []
                if has:
                    res = pg.evaluate('''([k,w,h,n]) => { const o = []; for (let v = 0; v < n; v++){ const px = SG.draw(k, w, h, v); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').putImageData(new ImageData(px.d, w, h), 0, 0); o.push(c.toDataURL()); } return o; }''', [k, w, h, n])
                    new = [Image.open(io.BytesIO(base64.b64decode(r.split(',')[1]))).convert('RGBA') for r in res]
                old = os.path.join(ROOT, 'assets/floor' if fam == 'floor' else 'assets/sprites', k + '.png')
                oi = Image.open(old).convert('RGBA') if os.path.exists(old) else None
                rows.append((k, w, h, oi, new))
            # layout: per kind a row: label, old, then variants; background mid-gray-green so alpha reads
            S = a.scale; pad = 4
            for scale in (1, S):
                W = max((2 + max(len(r[4]) for r in rows)) * ((max(r[1] for r in rows)) * scale + pad) + 120, 400)
                H = sum(r[2] * scale + pad + 2 for r in rows) + 8
                sheet = Image.new('RGBA', (W, H), (58, 66, 74, 255))
                from PIL import ImageDraw
                d = ImageDraw.Draw(sheet); y = 4
                for k, w, hh, oi, new in rows:
                    d.text((4, y), k, fill=(240, 240, 240, 255)); x = 120
                    for im in ([oi] if oi else []) + new:
                        big = im.resize((w * scale, hh * scale), Image.NEAREST); sheet.alpha_composite(big, (x, y)); x += w * scale + pad
                        if im is oi and new: x += pad * 3
                    y += hh * scale + pad + 2
                path = os.path.join(a.out, f'{fam}_{scale}x.png'); sheet.convert('RGB').save(path); print(path)
        if errs: print('PAGE ERRORS:', errs[:5]); sys.exit(1)
        b.close()
main()
