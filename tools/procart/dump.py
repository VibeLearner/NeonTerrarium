#!/usr/bin/env python3
"""Draw code-made art on a bare page (no game) and write comparison images: the old picture above, the new one below, each at 1x and a scale, on a dark background (additive holograms: black).
  python3 tools/procart/dump.py NAME [NAME ...] [--gen js/artgen_x.js ...] [--scale 4] [--out DIR] [--bg dark|black|light]
NAME is a texture of the ART registry (js/artgen.js SIZE: holo_ads, koi, wanted, ddrone, cassette, pbike_r1c1, holo_pureair, ...) or a sprite kind of the atlas (sign_ramen_pink, sign_police).
Loads js/spritegen.js, js/artgen.js and every js/artgen_*.js (or only the files given with --gen after those two); the old pictures are read from git (HEAD~: the last commit that had them) when no longer in the tree.
Prints PAGE ERRORS and exits 1 if the page threw."""
import argparse, glob, io, json, os, re, subprocess, sys, base64
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OLD = {'koi': 'assets/sprites/koi_neon.png', 'cassette': 'assets/ui/cassette.png'}
def old_image(name):
    p = OLD.get(name) or ('assets/sprites/%s.png' % name)
    full = os.path.join(ROOT, p)
    if os.path.exists(full): return Image.open(full).convert('RGBA')
    for rev in ('origin/main', 'main', 'HEAD'):
        r = subprocess.run(['git', '-C', ROOT, 'show', '%s:%s' % (rev, p)], capture_output=True)
        if r.returncode == 0 and r.stdout: return Image.open(io.BytesIO(r.stdout)).convert('RGBA')
    return None
def kind_size(kind):
    s = open(os.path.join(ROOT, 'js/sprites.js')).read()
    d = json.loads(re.search(r'const SPR = (\{.*\});', s).group(1))['size']
    return d.get(kind)
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('names', nargs='+'); ap.add_argument('--gen', nargs='*'); ap.add_argument('--scale', type=int, default=4); ap.add_argument('--out', default='/tmp/procart_dump'); ap.add_argument('--bg', default='dark')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    from playwright.sync_api import sync_playwright
    files = [os.path.join(ROOT, 'js/spritegen.js'), os.path.join(ROOT, 'js/artgen.js')] + ([os.path.join(ROOT, g) for g in a.gen] if a.gen is not None else sorted((f for f in glob.glob(os.path.join(ROOT, 'js/artgen_*.js'))), key=lambda f: (os.path.basename(f) != 'artgen_tools.js', f)))
    bgc = {'dark': (40, 46, 54), 'black': (0, 0, 0), 'light': (200, 200, 200)}[a.bg]
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.set_content('<html><body></body></html>')
        pg.evaluate('() => { window.THREE = { Texture: function(){ this.userData = {}; }, CanvasTexture: function(c){ this.image = c; this.userData = {}; }, TextureLoader: function(){ this.load = () => ({ userData: {} }); } }; }')
        for f in files: pg.add_script_tag(content=open(f).read() + "\n;if (typeof ART !== 'undefined') window.ART = ART; if (typeof SG !== 'undefined') window.SG = SG;")
        for n in a.names:
            kind = n.startswith('sign_')
            size = kind_size(n) if kind else pg.evaluate('n => ART.SIZE[n]', n)
            if not size: print('no size for', n); continue
            has = pg.evaluate('([n, k]) => k ? SG.has(n) : ART.has(n)', [n, kind])
            new = None
            if has:
                u = pg.evaluate('''([n, k, w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
                    if (k){ const px = SG.draw(n, w, h, 0); g.putImageData(new ImageData(px.d, w, h), 0, 0); } else ART.gens[n].fn(g, w, h, ART); return c.toDataURL(); }''', [n, kind, size[0], size[1]])
                new = Image.open(io.BytesIO(base64.b64decode(u.split(',')[1]))).convert('RGBA')
            old = old_image(n); ims = [(x, l) for x, l in ((old, 'old'), (new, 'new')) if x is not None]
            for scale in (1, a.scale):
                W = max(i.size[0] for i, _ in ims) * scale + 8; H = sum(i.size[1] * scale + 6 for i, _ in ims) + 2
                sheet = Image.new('RGBA', (W, H), bgc + (255,)); y = 2
                for im, l in ims:
                    big = im.resize((im.size[0] * scale, im.size[1] * scale), Image.NEAREST); sheet.alpha_composite(big, (4, y)); y += big.size[1] + 6
                path = os.path.join(a.out, '%s_%dx.png' % (n, scale)); sheet.convert('RGB').save(path); print(path, '(old above, new below)' if len(ims) == 2 else ('(new only)' if new else '(old only: no generator yet)'))
        b.close()
    if errs: print('PAGE ERRORS:', errs[:5]); sys.exit(1)
main()
