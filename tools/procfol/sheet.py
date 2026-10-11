#!/usr/bin/env python3
"""Comparison sheets, old against new (procedural foliage plan, item 5).
  python3 tools/procfol/sheet.py [--scene city] [--zooms 8,15,30] [--looks day,night,rain] [--out tools/procfol/sheets] [--no-game] [--no-families]
1. one page per family (grass, ground, fern, shrub, hang, laundry, floor): the old picture and every new variant, at 1x and 4x (tools/procfol/sprites_dump.py);
2. in-game crops of the same view, old pictures against new, in ONE page: each view is captured with the code-drawn sprites, then the old pictures are switched in
   (window.__OLD_SPRITES, the atlas repainted) and the same frame captured again. One image per zoom and look: old on the left, new on the right, plus the whole frame once.
Needs playwright, pillow, numpy (the perf harness's own setup)."""
import argparse, base64, io, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
LOOKS = {'day': 'S.cycle = false; S.rain = false; S.hour = 12', 'night': 'S.cycle = false; S.rain = false; S.hour = 23', 'rain': 'S.cycle = false; S.rain = true; S.hour = 16'}
def toimg(durl):
    from PIL import Image
    return Image.open(io.BytesIO(base64.b64decode(durl.split(',', 1)[1]))).convert('RGB')
def game(a):
    import harness as H
    from PIL import Image, ImageDraw
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('sheet', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        for look in a.looks.split(','):
            pg.evaluate('() => { ' + LOOKS[look] + ' }')
            for z in [int(v) for v in a.zooms.split(',')]:
                pg.evaluate('() => { zoom = zoomT = %d }' % z)
                pg.evaluate('() => { window.__OLD_SPRITES = false; FOL_ATLAS.repaint(); FLOOR_ATLAS.repaint(); }')
                new = toimg(pg.evaluate('() => __perf.cap(12, 4)')['png'])
                pg.evaluate('() => { window.__OLD_SPRITES = true; FOL_ATLAS.repaint(); FLOOR_ATLAS.repaint(); }'); pg.wait_for_timeout(800)
                old = toimg(pg.evaluate('() => __perf.cap(2, 2)')['png'])
                W, Hh = new.size; cw, ch = W // 2, Hh // 2; box = ((W - cw) // 2, (Hh - ch) // 2 + Hh // 8, (W + cw) // 2, (Hh + ch) // 2 + Hh // 8)
                tile = Image.new('RGB', (cw * 2 + 8, ch + 18), (30, 30, 30)); d = ImageDraw.Draw(tile)
                tile.paste(old.crop(box), (0, 18)); tile.paste(new.crop(box), (cw + 8, 18)); d.text((4, 3), 'old sprites', fill=(255, 255, 255)); d.text((cw + 12, 3), 'new, drawn in code  (%s, zoom %d, %s)' % (a.scene, z, look), fill=(255, 255, 255))
                p = os.path.join(a.out, 'game_%s_z%d_%s.png' % (a.scene, z, look)); tile.save(p); print(p)
                if z == 15 and look == 'day': 
                    full = Image.new('RGB', (W * 2 + 8, Hh), (30, 30, 30)); full.paste(old, (0, 0)); full.paste(new, (W + 8, 0)); full.save(os.path.join(a.out, 'full_%s_z15_day.png' % a.scene))
        if errs: print('PAGE ERRORS', errs[:5])
        br.close()
    srv.shutdown()
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='city'); ap.add_argument('--zooms', default='8,15,30'); ap.add_argument('--looks', default='day,night,rain')
    ap.add_argument('--out', default=os.path.join(HERE, 'sheets')); ap.add_argument('--no-game', action='store_true'); ap.add_argument('--no-families', action='store_true'); a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    if not a.no_families: subprocess.check_call([sys.executable, os.path.join(HERE, 'sprites_dump.py'), '--family', 'all', '--out', a.out, '--scale', '4'])
    if not a.no_game: game(a)
main()
