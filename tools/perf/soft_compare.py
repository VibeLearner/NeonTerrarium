#!/usr/bin/env python3
"""Soft effects at half resolution against full resolution, same build, same moment: night rain (wet-ground reflections), mist at a steam vent, light
shafts at morning. For each: pixels that differ, and a before / after crop (full resolution left, half resolution right) of where they differ most.
   python3 tools/perf/soft_compare.py city [--out DIR]"""
import argparse, base64, io, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
STATES = [
    ('rain_night', 'S.cycle = false; S.rain = true; S.hour = 23; zoomT = 12; yawT = 0.7', None),
    ('rain_night_far', 'S.cycle = false; S.rain = true; S.hour = 23; zoomT = 30', None),
    ('mist_vent_night', "S.cycle = false; S.rain = false; S.hour = 22; zoomT = 8; const v = VENTS[0]; camGoal.set(v.x, 0, v.z); camT.copy(camGoal)", None),
    ('mist_vent_day', "S.cycle = false; S.rain = false; S.hour = 12; zoomT = 8; const v = VENTS[0]; camGoal.set(v.x, 0, v.z); camT.copy(camGoal)", None),
    ('rays_morning', "S.cycle = false; S.rain = false; S.hour = 8.5; S.vclouds = false; zoomT = 12; camGoal.set(0, 0, 0); camT.copy(camGoal)", None),
    ('rays_evening', "S.cycle = false; S.rain = false; S.hour = 17.5; S.vclouds = false; zoomT = 12", None),
]
GRAB = '''full => {   // the composite of the frame just drawn, again, with the soft effects at full or half resolution (same frame: nothing else moves)
  window.__SOFT_FULL = full; compVariant(); softEffects(Math.round(camPix.x), Math.round(camPix.y));
  renderer.setRenderTarget(rtOut); renderer.render(compScene, compCam); renderer.setRenderTarget(null);
  const w = rtOut.width, h = rtOut.height, buf = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(rtOut, 0, 0, w, h, buf);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) im.data.set(buf.subarray((h - 1 - y)*w*4, (h - y)*w*4), y*w*4);
  g.putImageData(im, 0, 0); return cv.toDataURL('image/png'); }'''
def grab(pg, full):
    r = pg.evaluate(GRAB, full)
    return np.array(Image.open(io.BytesIO(base64.b64decode(r.split(',')[1]))).convert('RGB')).astype(int)
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')); ap.add_argument('--only', nargs='*')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('sc', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        for name, js, _ in STATES:
            if a.only and name not in a.only: continue
            pg.evaluate('() => { ' + js + ' }')
            pg.evaluate('() => __perf.cap(40, 3)')
            A = grab(pg, True); B = grab(pg, False)
            d = np.abs(A - B).max(2); ys, xs = np.nonzero(d)
            print('%-18s %6d px differ (%.2f%%)  >8: %6d  >32: %5d  max %3d   soft on: %s' % (name, len(ys), 100*len(ys)/d.size, (d > 8).sum(), (d > 32).sum(), d.max(), pg.evaluate('() => SOFT_ON')), flush=True)
            if len(ys):
                # the 200 x 120 window with the most differing pixels
                best, bx, by = -1, 0, 0
                for y0 in range(0, d.shape[0] - 120, 40):
                    for x0 in range(0, d.shape[1] - 200, 40):
                        c = (d[y0:y0 + 120, x0:x0 + 200] > 0).sum()
                        if c > best: best, bx, by = c, x0, y0
                box = (bx, by, bx + 200, by + 120); sc_ = 4
                ia, ib = Image.fromarray(A.astype('uint8')).crop(box).resize((200*sc_, 120*sc_), Image.NEAREST), Image.fromarray(B.astype('uint8')).crop(box).resize((200*sc_, 120*sc_), Image.NEAREST)
                t = Image.new('RGB', (200*sc_*2 + 8, 120*sc_), (30, 30, 30)); t.paste(ia, (0, 0)); t.paste(ib, (200*sc_ + 8, 0)); t.save(os.path.join(a.out, 'soft_%s_%s.png' % (a.scene, name)))
                Image.fromarray(A.astype('uint8')).save(os.path.join(a.out, 'soft_%s_%s_full.png' % (a.scene, name))); Image.fromarray(B.astype('uint8')).save(os.path.join(a.out, 'soft_%s_%s_half.png' % (a.scene, name)))
        print(errs[:2]); br.close()
    srv.shutdown()
