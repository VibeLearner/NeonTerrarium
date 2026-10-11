#!/usr/bin/env python3
"""The lawn from far: every empty plot of a scene laid to lawn, one view captured with the far-lawn savings off (window.__FOL_LOD_OFF: every tuft drawn, the near tile) and on (the flat far tile plus a few tall tufts),
side by side, at the given zooms; prints the instances drawn and the zoom's `loss` (main.js: the far lawn starts above 1.35).
  python3 tools/procfol/lawn_far.py [--scene city] [--zooms 24,28,30] [--out tools/procfol/sheets]"""
import argparse, base64, io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
def img(durl): return Image.open(io.BytesIO(base64.b64decode(durl.split(',', 1)[1]))).convert('RGB')
ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='city'); ap.add_argument('--zooms', default='24,28,30'); ap.add_argument('--out', default=os.path.join(HERE, 'sheets')); ap.add_argument('--old', action='store_true', help='with the old sprites')
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
srv = H.serve(); url = H.make_site('lawnfar', None); sc = H.load_scenes([a.scene])[0]
with sync_playwright() as pw:
    br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__OLD_SPRITES = true;' if a.old else None)
    n = pg.evaluate("() => { const e = [...cells.values()].filter(c => !c.mega && !c.sections.length); for (const c of e) c.green = 'grass'; refresh(e, []); return e.length; }"); print('lawn plots', n)
    pg.evaluate('() => { S.cycle = false; S.rain = false; S.hour = 12 }')
    for _ in range(20): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }'); pg.wait_for_timeout(300)
    for z in [int(v) for v in a.zooms.split(',')]:
        pg.evaluate('z => { zoom = zoomT = z }', z); pair = []
        for off in (True, False):
            pg.evaluate('o => { window.__FOL_LOD_OFF = o; scene.traverse(m => { if (m.userData.fol) m.frustumCulled = !o; }); }', off)
            c = pg.evaluate('() => __perf.cap(6, 3)'); pair.append(img(c['png']))
            print('zoom', z, 'LOD off' if off else 'LOD on ', 'loss=%.2f' % pg.evaluate('() => (zoom/ZOOM_REF)*(BASE_H/H)'), 'far lawn', pg.evaluate('() => FOL_FAR.lawn'), 'tris', c['info']['tris'], 'calls', c['info']['calls'])
        W, Hh = pair[0].size; box = (W//4, Hh//4, W//4 + W//2, Hh//4 + Hh//2)
        t = Image.new('RGB', (W//2*2 + 8, Hh//2 + 18), (30, 30, 30)); d = ImageDraw.Draw(t); t.paste(pair[0].crop(box), (0, 18)); t.paste(pair[1].crop(box), (W//2 + 8, 18))
        d.text((4, 3), 'far-lawn savings off (every tuft)', fill=(255, 255, 255)); d.text((W//2 + 12, 3), 'on (flat far tile + tall tufts), zoom %d' % z, fill=(255, 255, 255))
        t.save(os.path.join(a.out, 'lawn_far_%s_z%d%s.png' % (a.scene, z, '_old' if a.old else ''))); print('wrote', z)
    print('errors', errs[:3]); br.close()
srv.shutdown()
