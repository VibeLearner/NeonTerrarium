#!/usr/bin/env python3
"""Round 9, item 5: before, after and difference crops of the tiers for the owner. Two pages from the same save run the same frames, one with the tiers off ("full detail everywhere (as before)"),
one with them on; at each zoom, hour and motion (still, mid-turn) both are captured and compared. Also a "show tiers" picture (stand-ins tinted). The worker is off (the stand-ins are made on the page,
the same bytes), so the two pages' simulations stay the same.
   python3 tools/perf/tiers_crops.py dense --out tools/perf/overnight4 [--zooms 15 22 30] [--hours 12 23]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from PIL import Image, ImageChops
RUN = r"""
async ([zoom, hour, turn, settleFrames]) => {
  S.cycle = false; S.hour = hour; S.rain = false; PH.tests.noStatic = false; zoomT = zoom; zoom = zoom;
  const step = async n => { for (let g = 0; g < n; g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } };
  __perf.skip = true; let used = 0;
  if (settleFrames > 0){ await step(settleFrames); used = settleFrames; }   // (the run without tiers: the same number of frames as the one with them took)
  else { await step(700); used = 700; for (let g = 0; g < 8000 && (solidDirty.size || SOLID_JOB || TIER.markedAt.size); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } }   // (until every block has the tier it should)
  let c;
  if (turn){ yawT = yaw + 1.1; await step(14); __perf.skip = false; c = __perf.cap(3, 3); __perf.skip = true; }
  else { __perf.skip = false; c = __perf.cap(6, 6); __perf.skip = true; }
  return { used, png: c.png, tris: c.info.tris, calls: c.info.calls, tier: TIER.line(), pm: PM.line() };
}
"""
def run_one(pw_browser, url, scene, init, zoom, hour, turn, frames):
    ctx, pg, errs = H.open_game(pw_browser, url, scene, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true;' + init)
    r = pg.evaluate(RUN, [zoom, hour, turn, frames]); ctx.close(); return r, errs
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--out', default='tools/perf/overnight4'); ap.add_argument('--zooms', type=float, nargs='+', default=[15, 22, 30]); ap.add_argument('--hours', type=float, nargs='+', default=[12, 23])
    ap.add_argument('--frames', type=int, default=700); ap.add_argument('--turn', action='store_true', help='also mid-turn'); ap.add_argument('--show', action='store_true')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(a.out, exist_ok=True)
    srv = H.serve(); url = H.make_site('tc', None); sc = H.load_scenes([a.scene])[0]; rows = []
    with sync_playwright() as pw:
        br = H.launch(pw)
        for z in a.zooms:
            for hr in a.hours:
                for turn in ([0, 1] if a.turn else [0]):
                    B, eb = run_one(br, url, sc, '', z, hr, turn, 0)
                    A, ea = run_one(br, url, sc, 'window.__TIER_OFF = true;', z, hr, turn, B['used'])
                    tag = '%s_z%g_h%g_%s' % (a.scene, z, hr, 'turn' if turn else 'still')
                    ia = Image.open(__import__('io').BytesIO(H.png_bytes(A['png']))).convert('RGB'); ib = Image.open(__import__('io').BytesIO(H.png_bytes(B['png']))).convert('RGB')
                    d = ImageChops.difference(ia, ib); n = sum(1 for p in d.getdata() if p != (0, 0, 0))
                    # the three pictures side by side, the difference x4, cropped to the middle of the view
                    W_, H_ = ia.size; box = (W_//4, H_//5, W_*3//4, H_*4//5)
                    dd = d.point(lambda v: min(255, v*4)); strip = Image.new('RGB', ((box[2]-box[0])*3 + 20, box[3]-box[1]), (255, 255, 255))
                    for k, im in enumerate((ia, ib, dd)): strip.paste(im.crop(box), (k*((box[2]-box[0]) + 10), 0))
                    strip.save(os.path.join(a.out, 'tiers_' + tag + '.png'))
                    rows.append({ 'tag': tag, 'pixels_differ': n, 'of': W_*H_, 'tris_off': A['tris'], 'tris_on': B['tris'], 'calls_off': A['calls'], 'calls_on': B['calls'], 'tier': B['tier'], 'errs': (ea + eb)[:2] })
                    print(json.dumps(rows[-1]), flush=True)
        if a.show:
            B, eb = run_one(br, url, sc, 'window.__TIER_SHOW = true;', a.zooms[0], 12, 0, 0)
            open(os.path.join(a.out, 'tiers_%s_show.png' % a.scene), 'wb').write(H.png_bytes(B['png'])); print('show tiers:', B['tier'])
        br.close()
    json.dump(rows, open(os.path.join(a.out, 'tiers_%s.json' % a.scene), 'w'), indent=1); srv.shutdown()
