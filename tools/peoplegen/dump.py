#!/usr/bin/env python3
"""Draw the generated people on a bare page (no game) and write lineups: every shape (a look) in a palette of its own, a chosen set of frames, at a scale, on a dark street-colored background.
  python3 tools/peoplegen/dump.py [--shapes 0-15] [--frames walk,idle,gest,sit,use,angry,run] [--scale 6] [--out /tmp/pg_dump] [--bg 40,46,54] [--pal 0] [--all]
Loads js/spritegen.js, js/peoplegen.js and every js/peoplegen_*.js (or only the files after --gen, run after the core), builds the sheet, prints PAGE ERRORS and exits 1 if the page threw.
--all also writes one image per shape with all its frames (4 rows: walk/idle/gesture, sit/use/angry, run/umbrella...)."""
import argparse, glob, os, sys, io, base64
import numpy as np
from PIL import Image, ImageDraw
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FR = {'walk': (0, 6), 'idle': (6, 4), 'gest': (10, 6), 'sit': (16, 4), 'use': (20, 6), 'angry': (26, 6), 'run': (32, 6), 'uwalk': (38, 6), 'uidle': (44, 4), 'uopen': (48, 4)}
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--shapes', default='0-15'); ap.add_argument('--frames', default='walk,idle,gest,sit'); ap.add_argument('--scale', type=int, default=6)
    ap.add_argument('--out', default='/tmp/pg_dump'); ap.add_argument('--bg', default='40,46,54'); ap.add_argument('--pal', type=int, default=0, help='palette offset: shape i gets palette (i * 7 + this)'); ap.add_argument('--gen', nargs='*'); ap.add_argument('--all', action='store_true')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    from playwright.sync_api import sync_playwright
    core = [os.path.join(ROOT, 'js/spritegen.js'), os.path.join(ROOT, 'js/peoplegen.js')]
    rest = [os.path.join(ROOT, g) for g in a.gen] if a.gen is not None else sorted(f for f in glob.glob(os.path.join(ROOT, 'js/peoplegen_*.js')))
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.set_content('<html><body></body></html>')
        for f in core + rest: pg.add_script_tag(content=open(f).read() + "\n;if (typeof PG !== 'undefined') window.PG = PG; if (typeof SG !== 'undefined') window.SG = SG;")
        info = pg.evaluate('() => { PG.build(); return { rows: PG.ROWS, W: PG.W, H: PG.H, ms: PG.buildMs, names: PG.shapes.map(s => s.name) }; }')
        print('shapes', info['rows'], 'sheet', info['W'], 'x', info['H'], 'build %.1f ms' % info['ms'])
        raw = pg.evaluate('() => { const b = PG.indexBuf; let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }')
        buf = np.frombuffer(base64.b64decode(raw), dtype=np.uint8).reshape(info['H'], info['W'])
        lo, hi = (a.shapes.split('-') + [a.shapes])[:2] if '-' in a.shapes else (a.shapes, a.shapes)
        shapes = [i for i in range(int(lo), int(hi) + 1) if i < info['rows']]
        pals = {}
        for i in shapes:
            n = (i * 7 + a.pal) % 3840
            pals[i] = pg.evaluate('n => { const nb = PG.BOTC.length, na = PG.ACCC.length, nt = PG.TOPC.length, nh = PG.HAIR.length; let m = n; const bo = m % nb; m = (m - bo)/nb; const ac = m % na; m = (m - ac)/na; const to = m % nt; m = (m - to)/nt; const ha = m % nh; m = (m - ha)/nh; return PG.palColors(m, ha, to, ac, bo); }', n)
        b.close()
    if errs: print('PAGE ERRORS:', errs[:5])
    bg = tuple(int(v) for v in a.bg.split(','))
    def cellimg(i, f):
        c = buf[i*16:(i + 1)*16, f*12:(f + 1)*12]; out = np.zeros((16, 12, 4), np.uint8); out[...] = bg + (255,)
        col = pals[i]
        for v in range(1, 16):
            m = c == v; r, g, bl = (col[v] >> 16) & 255, (col[v] >> 8) & 255, col[v] & 255; out[m] = (r, g, bl, 255)
        return Image.fromarray(out, 'RGBA')
    S = a.scale; names = info['names']
    frames = []
    for name in a.frames.split(','): s0, n = FR[name]; frames += list(range(s0, s0 + n))
    gap = 6; W = len(frames)*(12*S) + 150; H = len(shapes)*(16*S + gap) + 4
    sheet = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(sheet)
    for row, i in enumerate(shapes):
        y = row*(16*S + gap) + 2; d.text((4, y + 4), '%d %s' % (i, names[i][:22]), fill=(230, 230, 230))
        for col, f in enumerate(frames): sheet.paste(cellimg(i, f).resize((12*S, 16*S), Image.NEAREST).convert('RGB'), (150 + col*12*S, y))
    path = os.path.join(a.out, 'lineup_%s_%s.png' % (a.shapes, a.frames.replace(',', '+'))); sheet.save(path); print(path)
    if a.all:
        for i in shapes:
            img = Image.new('RGB', (26*12*S, 2*16*S + 10), bg)
            for f in range(52): img.paste(cellimg(i, f).resize((12*S, 16*S), Image.NEAREST).convert('RGB'), ((f % 26)*12*S, (f // 26)*(16*S + 4)))
            pth = os.path.join(a.out, 'shape_%02d.png' % i); img.save(pth)
        print('per-shape sheets in', a.out)
    if errs: sys.exit(1)
main()
