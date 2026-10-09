#!/usr/bin/env python3
"""Round 9, item 5: graphics bytes and JS heap of a scene with the tiers on against off, after the city has had the time to change tier (frames simulated, a drawn frame at the end so
everything on screen is on the card). The worker makes the stand-ins.
   python3 tools/perf/tiers_gfx.py maxcity [--frames 6000] [--zoom 30]"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import memcheck as M
RUN = r"""
async ([frames, zoom, maxMs]) => {
  S.cycle = false; S.hour = 12; PH.tests.noStatic = true; zoomT = zoom; zoom = zoom; __perf.skip = true;
  const t0 = Date.now(); let f = 0; for (; f < frames && Date.now() - t0 < maxMs; f++){ __step(1); if (f % 10 === 9) await new Promise(r => setTimeout(r, 20)); if (f > 600 && !solidDirty.size && !SOLID_JOB && !STAGE_Q.length && !RW.jobs.size && f % 200 === 0){ if (window.__tl === TIER.line() + PM.line()) break; window.__tl = TIER.line() + PM.line(); } }
  __perf.skip = false; renderer.info.reset(); __step(2); const tris = renderer.info.render.triangles, calls = renderer.info.render.calls; __perf.skip = true;
  return { frames: f, tier: TIER.line(), pm: PM.line(), rw: RW.line(), tris, calls, dirty: solidDirty.size };
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--frames', type=int, default=6000); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--off', action='store_true'); ap.add_argument('--max-min', type=float, default=20)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('tg', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true; window.__GEN_WORKER = true;' + (' window.__TIER_OFF = true;' if a.off else '') + M.GL)
        cdp = ctx.new_cdp_session(pg); pg.wait_for_function('() => RW.state === "ready" || RW.state === "failed"', timeout=120000)
        r0 = M.read(pg, cdp)
        r = pg.evaluate(RUN, [a.frames, a.zoom, a.max_min*60000]); r1 = M.read(pg, cdp)
        print('%s zoom %g tiers %s: %d frames; %s | %s | %s' % (a.scene, a.zoom, 'OFF' if a.off else 'on', r['frames'], r['tier'], r['pm'], r['rw']))
        print('   JS heap %.0f -> %.0f MB; graphics %.0f -> %.0f MB (buffers %.0f -> %.0f); %d draws, %d triangles; blocks still to merge %d' % (r0['js'], r1['js'], r0['gfx'], r1['gfx'], r0['buf'], r1['buf'], r['calls'], r['tris'], r['dirty']))
        print('page errors', errs[:3]); br.close()
    srv.shutdown()
