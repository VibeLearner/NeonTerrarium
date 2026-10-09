#!/usr/bin/env python3
"""Frame-to-frame jumps of the finished frame (rtOut), for two repros:
  place    city at night, addSection on a plot near the camera, 50 frames
  daynight at night, the hour set to midday from Settings, 60 frames
Per frame: pixels that changed from the frame before (any channel), the cache state, whether a block merge is going on.
   python3 tools/perf/flicker.py place|daynight [--scene city] [--frames N]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = r"""([mode, n]) => {
  const w = rtOut.width, h = rtOut.height, a = new Uint8Array(w*h*4), b = new Uint8Array(w*h*4); let prev = null; const out = [];
  const grab = () => { renderer.readRenderTargetPixels(rtOut, 0, 0, w, h, a); };
  S.cycle = false; S.rain = false; S.hour = 22.5; zoom = zoomT = 12; __perf.cap(200, 3); grab(); prev = a.slice();
  if (mode === 'place'){ const near = [...cells.values()].filter(c => !c.mega && !c.lift && !c.sections.length).sort((p, q) => Math.hypot(p.x - camT.x, p.z - camT.z) - Math.hypot(q.x - camT.x, q.z - camT.z)); addSection(near[0], 'mid'); }
  else if (mode === 'rain'){ S.hour = 12; S.rain = false; __perf.cap(600, 3); grab(); prev = a.slice(); S.rain = true; }
  else if (mode === 'lights'){ S.lights = false; }
  else if (mode === 'hour'){ S.hour = 12; __perf.cap(600, 3); grab(); prev = a.slice(); S.hour = 14.5; }
  else { S.hour = 12; }
  for (let f = 0; f < n; f++){ __perf.skip = false; __step(1); grab(); let d = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== prev[i] || a[i + 1] !== prev[i + 1] || a[i + 2] !== prev[i + 2]) d++;
    out.push([f, d, SC.state, !!SOLID_JOB, SOLID_JOB ? SOLID_JOB.key : '', LIGHTS_ON.value.toFixed(2), anims.length]); prev = a.slice(); }
  return out; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('mode', choices=['place', 'daynight', 'rain', 'lights', 'hour']); ap.add_argument('--scene', default='city'); ap.add_argument('--frames', type=int, default=0); ap.add_argument('--init', default=None); ap.add_argument('--ref', default=None)
    a = ap.parse_args(); n = a.frames or (50 if a.mode == 'place' else 60)
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('fl', a.ref); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=a.init); r = pg.evaluate(JS, [a.mode, n])
        base = sorted(x[1] for x in r)[len(r)//2]
        print('median %d changed pixels; frame, changed, cache state, merging, block, windows, sweeps' % base)
        for x in r: print('%3d %8d  %-10s %-5s %-6s %s %d%s' % (x[0], x[1], x[2], x[3], x[4], x[5], x[6], '   <---' if x[1] > max(12000, 2*base) else ''))
        print(errs[:2]); br.close()
    srv.shutdown()
