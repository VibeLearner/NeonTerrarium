#!/usr/bin/env python3
"""Round 10, item 1: real against baked against the difference, for plots of a scene. Two pages from the same save run the same frames (tiers off); in one the named plots are baked.
   python3 tools/perf/baked_proto.py dense "5,4;7,4;7,3" --zooms 24 27 30 --hours 12 19 23 [--turn] [--tpu 16] [--out tools/perf/baked]"""
import argparse, os, sys, io, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
from PIL import Image, ImageChops
RUN = r"""
async ([plots, zoom, hour, turn, bake, tpu]) => {
  S.cycle = false; S.hour = hour; S.rain = false; PH.tests.noStatic = false; BK.tpu = tpu;
  const step = async n => { for (let g = 0; g < n; g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } };
  __perf.skip = true; const info = [];
  zoomT = zoom = 24; await step(200);
  if (bake) for (const [i, j] of plots) info.push(bkProto(cells.get(ckey(i, j))));
  await step(40); for (let g = 0; g < 4000 && (solidDirty.size || SOLID_JOB); g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); }
  const [pi, pj] = plots[0]; const c0 = cells.get(ckey(pi, pj)); camGoal.set(c0.x, camGoal.y, c0.z); camT.copy(camGoal);
  zoomT = zoom = zoomOf; await step(120);
  let cap;
  if (turn){ yawT = yaw + 1.1; await step(14); __perf.skip = false; cap = __perf.cap(3, 3); }
  else { __perf.skip = false; cap = __perf.cap(6, 6); }
  __perf.skip = true; return { png: cap.png, tris: cap.info.tris, calls: cap.info.calls, info };
}
""".replace('zoomOf', 'zoom_')
def run_one(br, url, scene, plots, zoom, hour, turn, bake, tpu):
    ctx, pg, errs = H.open_game(br, url, scene, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true; window.__TIER_OFF = true; window.__BAKED_PROTO = true;' + (os.environ.get('BK_INIT') or ''))
    code = RUN.replace('zoom_', str(zoom))
    r = pg.evaluate(code, [plots, zoom, hour, turn, bake, tpu]); ctx.close(); return r, errs
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('plots'); ap.add_argument('--out', default='tools/perf/baked')
    ap.add_argument('--zooms', type=float, nargs='+', default=[24]); ap.add_argument('--hours', type=float, nargs='+', default=[12]); ap.add_argument('--turn', action='store_true'); ap.add_argument('--tpu', type=float, default=16); ap.add_argument('--tag', default='')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(a.out, exist_ok=True)
    plots = [list(map(int, p.split(','))) for p in a.plots.split(';')]
    srv = H.serve(); url = H.make_site('bp', None); sc = H.load_scenes([a.scene])[0]; rows = []
    with sync_playwright() as pw:
        br = H.launch(pw)
        for z in a.zooms:
            for hr in a.hours:
                for turn in ([0, 1] if a.turn else [0]):
                    A, ea = run_one(br, url, sc, plots, z, hr, turn, False, a.tpu)
                    B, eb = run_one(br, url, sc, plots, z, hr, turn, True, a.tpu)
                    tag = '%s%s_z%g_h%g_%s' % (a.tag, a.scene, z, hr, 'turn' if turn else 'still')
                    ia = Image.open(io.BytesIO(H.png_bytes(A['png']))).convert('RGB'); ib = Image.open(io.BytesIO(H.png_bytes(B['png']))).convert('RGB')
                    d = ImageChops.difference(ia, ib); n = sum(1 for p in d.getdata() if p != (0, 0, 0))
                    W_, H_ = ia.size; box = (W_//4, H_//5, W_*3//4, H_*4//5); bw = box[2] - box[0]
                    dd = d.point(lambda v: min(255, v*4)); strip = Image.new('RGB', (bw*3 + 20, box[3] - box[1]), (255, 255, 255))
                    for k, im in enumerate((ia, ib, dd)): strip.paste(im.crop(box), (k*(bw + 10), 0))
                    strip.save(os.path.join(a.out, tag + '.png'))
                    bb = d.convert('L').point(lambda v: 255 if v > 24 else 0).getbbox()
                    if bb:
                        pad = 12; q = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W_, bb[2] + pad), min(H_, bb[3] + pad)); k = 3 if q[2] - q[0] < 500 else 2
                        zs = Image.new('RGB', (((q[2] - q[0])*k + 8)*3, (q[3] - q[1])*k), (255, 255, 255))
                        for n_, im in enumerate((ia, ib, dd)): zs.paste(im.crop(q).resize(((q[2] - q[0])*k, (q[3] - q[1])*k), Image.NEAREST), (n_*((q[2] - q[0])*k + 8), 0))
                        zs.save(os.path.join(a.out, tag + '_zoom.png'))
                    rows.append({ 'tag': tag, 'pixels_differ': n, 'of': W_*H_, 'tris_real': A['tris'], 'tris_baked': B['tris'], 'info': B['info'], 'errs': (ea + eb)[:3] })
                    print(json.dumps(rows[-1]), flush=True)
        br.close()
    json.dump(rows, open(os.path.join(a.out, a.tag + a.scene + '.json'), 'w'), indent=1); srv.shutdown()
