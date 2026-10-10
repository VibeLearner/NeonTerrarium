#!/usr/bin/env python3
"""Round 10: real against stand-in against baked, for a scene at the far zooms, through the game's own machinery (the tier 'baked' of world.js). Three pages from the same save run the same frames:
real (Detail tiers off), stand-in (tiers on, baked off), baked (both on). Crops: real | stand-in | baked | difference real/baked (x4) and real/stand-in. Counts: triangles, calls, geometries, textures; the baked line.
   python3 tools/perf/baked_crops.py dense --zooms 24 30 --hours 12 23 [--turn] [--out tools/perf/baked] [--wide]"""
import argparse, os, sys, io, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from PIL import Image, ImageChops
RUN = r"""
async ([zoom, hour, turn, mode, zl, settle]) => {
  S.cycle = false; S.hour = hour; S.rain = false; PH.tests.noStatic = NOSTATIC;
  const step = async n => { for (let g = 0; g < n; g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } };
  __perf.skip = true; zoomT = zoom = zl; let used = 0;
  if (settle > 0){ await step(settle); used = settle; }   // (the other two pages: the same number of frames the baked one took, so the clock, the clouds and the shadows are the same)
  else {
  await step(300); used += 300;
  let g = 0; const idle = () => !(solidDirty.size || SOLID_JOB || TIER.markedAt.size) && (mode !== 'baked' || (BAKE.stats().by.ready || 0) + (BAKE.stats().by.failed || 0) >= BAKE.stats().plots && !BAKE.job);
  for (; g < 20000 && !(idle() && g > 60); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); }
  await step(240); used += 240; for (g = 0; g < 3000 && (solidDirty.size || SOLID_JOB || TIER.markedAt.size); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } }
  let c;
  if (turn){ yawT = yaw + 1.1; await step(14); __perf.skip = false; c = __perf.cap(3, 3); __perf.skip = true; }
  else { __perf.skip = false; c = __perf.cap(6, 6); __perf.skip = true; }
  return { used, png: c.png, tris: c.info.tris, calls: c.info.calls, geos: c.info.geos, tex: c.info.tex, tier: TIER.line(), bk: BK.line(), bkstats: BK.stats, pm: PM.line() };
}
"""
INITS = {'real': 'window.__TIER_OFF = true;', 'stand': '', 'baked': 'window.__BAKED_ON = true; window.__BAKED_PAGES = 1000;'}
def run_one(br, url, scene, mode, zoom, hour, turn, settle, keep=None):
    ctx, pg, errs = H.open_game(br, url, scene, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true;' + INITS[mode], ctx=keep)   # (keep: the baked pages share one browser context, so the bakes of the first are in the store for the rest)
    r = pg.evaluate(RUN.replace('NOSTATIC', 'true' if os.environ.get('NOSTATIC') else 'false'), [zoom, hour, turn, mode, zoom, settle]); (pg.close() if keep else ctx.close()); return r, errs
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--out', default='tools/perf/baked'); ap.add_argument('--zooms', type=float, nargs='+', default=[24, 30]); ap.add_argument('--hours', type=float, nargs='+', default=[12, 23])
    ap.add_argument('--turn', action='store_true'); ap.add_argument('--turn-only', action='store_true'); ap.add_argument('--tag', default='')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(a.out, exist_ok=True); srv = H.serve(); url = H.make_site('bc', None); sc = H.load_scenes([a.scene])[0]; rows = []
    with sync_playwright() as pw:
        br = H.launch(pw); keep = br.new_context(viewport={'width': H.VIEWPORTS[0][0], 'height': H.VIEWPORTS[0][1]}, device_scale_factor=1)
        for z in a.zooms:
            for hr in a.hours:
                for turn in ([1] if a.turn_only else [0, 1] if a.turn else [0]):
                    R = {}; E = []
                    R['baked'], e = run_one(br, url, sc, 'baked', z, hr, turn, 0, keep); E += e
                    for mode in ('real', 'stand'):
                        R[mode], e = run_one(br, url, sc, mode, z, hr, turn, R['baked']['used']); E += e
                    im = {m: Image.open(io.BytesIO(H.png_bytes(R[m]['png']))).convert('RGB') for m in R}
                    d1 = ImageChops.difference(im['real'], im['baked']); d2 = ImageChops.difference(im['real'], im['stand'])
                    n1 = sum(1 for p in d1.getdata() if p != (0, 0, 0)); n2 = sum(1 for p in d2.getdata() if p != (0, 0, 0))
                    W_, H_ = im['real'].size; box = (W_//4, H_//5, W_*3//4, H_*4//5); bw = box[2] - box[0]
                    strip = Image.new('RGB', ((bw + 10)*5, box[3] - box[1]), (255, 255, 255))
                    for k, x in enumerate((im['real'], im['stand'], im['baked'], d1.point(lambda v: min(255, v*4)), d2.point(lambda v: min(255, v*4)))): strip.paste(x.crop(box), (k*(bw + 10), 0))
                    tag = '%s%s_z%g_h%g_%s' % (a.tag, a.scene, z, hr, 'turn' if turn else 'still'); strip.save(os.path.join(a.out, 'far_' + tag + '.png'))
                    row = { 'tag': tag, 'differ_real_baked': n1, 'differ_real_stand': n2, 'errs': E[:3] }
                    for m in R: row[m] = { k: R[m][k] for k in ('tris', 'calls', 'geos', 'tex', 'tier', 'bk') }
                    row['bkstats'] = R['baked']['bkstats']; rows.append(row); print(json.dumps(row), flush=True)
        br.close()
    json.dump(rows, open(os.path.join(a.out, 'far_%s%s.json' % (a.tag, a.scene)), 'w'), indent=1); srv.shutdown()
