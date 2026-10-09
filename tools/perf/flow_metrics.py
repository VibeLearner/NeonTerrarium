#!/usr/bin/env python3
"""Do people look the same at the new step rate? Same build, 'people at full rate' (window.__FULL_RATE) against the default, the same scene:
density (walking, standing, in the picture), flow (arrivals, decisions, meetings and reactions a minute of simulated time), and the
largest move of any sprite from one frame to the next, in render pixels.   python3 tools/perf/flow_metrics.py maxcity --zoom 30 --frames 1800"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """([n, sample]) => {
  const cnt = { arrive: 0, decide: 0, emote: 0 };
  for (const k in cnt){ const f = window[k]; window[k] = function(...a){ cnt[k]++; return f.apply(this, a); }; }
  const px = 2*zoom/H, VP = comp.uniforms.VP.value, ve = VP.elements;
  const pick = pplList.filter((p, i) => i % Math.max(1, Math.floor(pplList.length/sample)) === 0).slice(0, sample);
  const last = new Map(); let maxMove = 0, sumMove = 0, nMove = 0, walk = 0, stand = 0, shown = 0, shownN = 0, frames = 0;
  const screen = p => [(ve[0]*p.x + ve[8]*p.z + ve[12])*W/2, (ve[1]*p.x + ve[9]*p.z + ve[13])*H/2];
  __perf.skip = true;   // (frames are simulated, not drawn)
  for (let f = 0; f < n; f++){
    __step(1); frames++;
    for (const p of pick){ if (p.gone) continue; const s = screen(p), q = last.get(p); if (q){ const d = Math.hypot(s[0] - q[0], s[1] - q[1]); if (d > maxMove && d < 40) maxMove = d; if (d < 40){ sumMove += d; nMove++; } } last.set(p, s); }
    if (f % 30 === 0){ for (const p of pplList){ if (p.walk) walk++; else stand++; if (!offScreen(p.x, p.z)) shown++; } shownN++; }
  }
  __perf.skip = false;
  const mins = n/60/60;
  return { simMinutes: mins, perMinute: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, Math.round(v/mins)])), walking: Math.round(walk/shownN), standing: Math.round(stand/shownN), notFarOffScreen: Math.round(shown/shownN), maxMovePx: +maxMove.toFixed(2), meanMovePx: +(sumMove/Math.max(1, nMove)).toFixed(3), people: pplList.length };
}"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--frames', type=int, default=1800); ap.add_argument('--warm', type=int, default=900)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('flow', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        for label, init in (('full rate', 'window.__FULL_RATE = true;'), ('size-based rate', None)):
            br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[1], extra_init=init)
            pg.evaluate('z => { zoom = zoomT = z; }', a.zoom); pg.evaluate('n => __perf.cap(n)', a.warm)
            r = pg.evaluate(JS, [a.frames, 300]); r['N'] = pg.evaluate('() => PPLRATE.n'); r['hist'] = pg.evaluate('() => PPLRATE.hist')
            print(label, json.dumps(r), errs[:2], flush=True); br.close()
    srv.shutdown()
