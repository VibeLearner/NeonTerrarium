#!/usr/bin/env python3
"""In-game comparison sheets for the generated people, old (Craftpix) against new, captured in ONE page: the view is captured with the generated people, then window.__OLD_PEOPLE is set and the sheet swapped
(PG.apply: what the overlay test "old people (as before)" does) and the same frame captured again. One image per stop, zoom and hour: old on the left, new on the right.
  python3 tools/peoplegen/sheet.py [--scene city] [--stops crowd] [--zooms 8,15,30] [--hours 12,22] [--out tools/peoplegen/sheets] [--settle 12]
Stops: crowd (the busiest street view: the camera on the densest cluster of people on screen), more are added by later steps (club, chase, square, rain).
Needs playwright, pillow, numpy (the perf harness's own setup)."""
import argparse, base64, io, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'perf'))
HOURS = {'12': 'S.cycle = false; S.rain = false; S.hour = 12', '22': 'S.cycle = false; S.rain = false; S.hour = 22', '17': 'S.cycle = false; S.rain = false; S.hour = 17.5'}
FIND = {
 # the centre of the biggest cluster of people (within 3 world units of each other) that are outside
 'crowd': """() => { const L = pplList.filter(p => p.x !== undefined && !p.ride && !p.metro && !(p.walk === null && !p.spot)); let best = null, bn = -1;
    for (const p of L){ let n = 0; for (const q of L) if (Math.hypot(p.x - q.x, p.z - q.z) < 3) n++; if (n > bn){ bn = n; best = p; } } return best ? { x: best.x, z: best.z, n: bn } : null; }""",
}
def toimg(durl):
    from PIL import Image
    return Image.open(io.BytesIO(base64.b64decode(durl.split(',', 1)[1]))).convert('RGB')
def game(a):
    import harness as H
    from PIL import Image, ImageDraw
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('peoplegen_sheet', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        for _ in range(a.settle): pg.evaluate('() => { __perf.skip = true; __step(30); __perf.skip = false; }'); pg.wait_for_timeout(250)
        for hour in a.hours.split(','):
            pg.evaluate('() => { ' + HOURS[hour] + ' }')
            for stop in a.stops.split(','):
                pos = pg.evaluate(FIND[stop])
                if not pos: print('skip %s: nobody out in scene %s at %s:00' % (stop, a.scene, hour)); continue
                for z in [int(v) for v in a.zooms.split(',')]:
                    pg.evaluate('([p, z]) => { camGoal.set(p.x, camGoal.y, p.z); camT.copy(camGoal); zoom = zoomT = z; }', [pos, z])
                    pg.evaluate('() => { __perf.skip = true; __step(3); __perf.skip = false; }')
                    pair = []
                    for old in (True, False):
                        pg.evaluate('o => { window.__OLD_PEOPLE = o; PG.apply(); }', old); pg.wait_for_timeout(600)
                        pair.append(toimg(pg.evaluate('() => __perf.cap(3, 1)')['png']))
                    Wd, Hh = pair[0].size; cw, ch = Wd//2, Hh//2; box = (Wd//4, Hh//4, Wd//4 + cw, Hh//4 + ch)
                    t = Image.new('RGB', (cw*2 + 8, ch + 18), (30, 30, 30)); d = ImageDraw.Draw(t)
                    t.paste(pair[0].crop(box), (0, 18)); t.paste(pair[1].crop(box), (cw + 8, 18)); d.text((4, 3), 'old people (Craftpix)', fill=(255, 255, 255)); d.text((cw + 12, 3), 'new, drawn in code  (%s, zoom %d, %s:00)' % (stop, z, hour), fill=(255, 255, 255))
                    path = os.path.join(a.out, 'game_%s_%s_z%d_h%s.png' % (a.scene, stop, z, hour)); t.save(path); print(path)
        if errs: print('PAGE ERRORS', errs[:5])
        br.close()
    srv.shutdown(); srv.server_close()
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--scene', default='city'); ap.add_argument('--stops', default='crowd'); ap.add_argument('--zooms', default='8,15,30'); ap.add_argument('--hours', default='12,22')
    ap.add_argument('--out', default=os.path.join(HERE, 'sheets')); ap.add_argument('--settle', type=int, default=12); a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); game(a)
main()
