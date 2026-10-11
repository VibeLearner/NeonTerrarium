#!/usr/bin/env python3
"""Counts, not timings: what the looks add to one frame. The base commit and the working tree draw the same view (night, rain, zoom 30, the city
scene); for each, the number of render calls (full-screen passes included), draw calls, triangles and textures of one frame, and the
number of shader programs the composite and the grade have been compiled into. Uses the perf harness's rig.

  PERF_PORT=9640 python3 tools/looks/pass_counts.py [base-ref]      (default 6da3dbf)
"""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H

COUNT = '''() => {
  let n = 0; const rr = renderer.render; renderer.render = function(...a){ n++; return rr.apply(this, a); };
  renderer.info.reset(); __step(1);
  renderer.render = rr;
  const i = renderer.info;
  return { render_calls: n, draw_calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, programs: i.programs ? i.programs.length : null };
}'''


def run(pw, url, sc, setup, label):
    br = H.launch(pw)
    ctx, pg, errs = H.open_game(br, url, sc, (1280, 720))
    pg.evaluate('() => { S.cycle = false; ' + setup + ' }')
    pg.evaluate('() => __perf.cap(200, 3)')
    r = pg.evaluate(COUNT); r['errors'] = errs[:3]
    print(label, json.dumps(r), flush=True)
    ctx.close(); br.close()
    return r


def main(base):
    from playwright.sync_api import sync_playwright
    srv = H.serve(); ub = H.make_site('pc_base', base); un = H.make_site('pc_new'); sc = H.load_scenes(['city'])[0]
    night = 'S.hour = 23; S.rain = true; zoom = zoomT = 30; '
    day = 'S.hour = 13.5; zoom = zoomT = 30; '
    out = {}
    with sync_playwright() as pw:
        out['day: base'] = run(pw, ub, sc, day, 'day, base ' + base)
        out['day: looks (Auto, Mid afternoon), every effect on'] = run(pw, un, sc, day, 'day, looks')
        out['night rain: base'] = run(pw, ub, sc, night, 'night rain, base ' + base)
        out['night rain: old path (LK.old)'] = run(pw, un, sc, night + 'LK.old = true', 'working tree, old grades')
        out['night rain: looks (Rainy night), every effect off'] = run(pw, un, sc, night + 'LK.setPick("rainyNight", true); for (const k in LK.fx) LK.fx[k] = false', 'looks, effects off')
        out['night rain: looks (Rainy night), every effect on'] = run(pw, un, sc, night + 'LK.setPick("rainyNight", true)', 'looks, effects on')
        out['morning rain: base'] = run(pw, ub, sc, 'S.hour = 8; S.rain = true; zoom = zoomT = 30', 'morning rain, base')
        out['morning rain: looks (Rainy morning, sparkle on)'] = run(pw, un, sc, 'S.hour = 8; S.rain = true; zoom = zoomT = 30; LK.setPick("rainyMorning", true)', 'rainy morning, effects on')
    srv.shutdown()
    os.makedirs(os.path.join(HERE, 'results'), exist_ok=True)
    json.dump(out, open(os.path.join(HERE, 'results', 'pass_counts.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '6da3dbf')
