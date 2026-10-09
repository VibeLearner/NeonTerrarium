#!/usr/bin/env python3
"""Round 9, item 5: what the stand-in tier is worth. Per plot: triangles and bytes of the full geometry and of the stand-in. Per scene: the triangles one frame draws and the graphics bytes the
page holds, all plots full and all plots stand-in, at zoom 30 and 15 (the static cache off, the view still); crops of both.
   python3 tools/perf/tiers_measure.py dense [--zooms 30 22 15] [--crops DIR]"""
import argparse, base64, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
import memcheck as M
RUN_PLOTS = r"""
async () => {
  const bytes = g => { let n = 0; for (const k in g.attributes){ const a = g.attributes[k].array; if (a) n += a.byteLength; } if (g.index && g.index.array) n += g.index.array.byteLength; return n; };
  const tris = g => { const u = g.userData.cut; return u ? (u.A + u.S)/3 : g.index.count/3; };
  const rows = []; let n = 0;
  for (const c of cells.values()){
    if (!c.data || !c.data.rec || c.mega) continue;
    const f = c.data.geo.get(ATLAS); if (!f) continue;
    const sg = standEnsure(c); if (!sg) continue;
    rows.push({ z: c.sections.length ? c.sections[0].zone : 'empty', fb: bytes(f), sb: bytes(sg), ft: tris(f), st: tris(sg), fa: f.userData.cut ? f.userData.cut.A/3 : 0, sa: sg.userData.cut ? sg.userData.cut.A/3 : 0 });
  }
  const by = {}; for (const r of rows){ const e = by[r.z] || (by[r.z] = { n: 0, fb: 0, sb: 0, ft: 0, st: 0 }); e.n++; e.fb += r.fb; e.sb += r.sb; e.ft += r.ft; e.st += r.st; }
  const tot = { n: rows.length, fb: 0, sb: 0, ft: 0, st: 0 }; for (const r of rows){ tot.fb += r.fb; tot.sb += r.sb; tot.ft += r.ft; tot.st += r.st; }
  return { tot, by };
}
"""
SETTLE = r"""
async (n) => { for (let g = 0; g < n; g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 2)); if (g > 60 && !solidDirty.size && !SOLID_JOB && !STAGE_Q.length) break; } return [solidDirty.size, !!SOLID_JOB]; }
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zooms', type=float, nargs='+', default=[30, 15]); ap.add_argument('--crops', default=None)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('tm', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--enable-precise-memory-info', '--js-flags=--expose-gc'])
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__NV_OFF = true; window.__KEEP_CPU = true;' + M.GL)
        cdp = ctx.new_cdp_session(pg)
        if a.crops: os.makedirs(a.crops, exist_ok=True)
        r = pg.evaluate(RUN_PLOTS)
        t = r['tot']
        print('plots %d: full %.0f triangles %.2f MB a plot; stand-in %.0f triangles (%.0f%%) %.2f MB a plot (%.0f%%)' % (t['n'], t['ft']/t['n'], t['fb']/t['n']/1048576, t['st']/t['n'], 100*t['st']/t['ft'], t['sb']/t['n']/1048576, 100*t['sb']/t['fb']))
        for z, e in sorted(r['by'].items()): print('   %-6s %4d plots: triangles %6.0f -> %6.0f (%.0f%%), bytes %.2f -> %.2f MB' % (z, e['n'], e['ft']/e['n'], e['st']/e['n'], 100*e['st']/e['ft'], e['fb']/e['n']/1048576, e['sb']/e['n']/1048576))
        pg.evaluate('() => { __perf.skip = true; PH.tests.noStatic = true; S.cycle = false; S.hour = 12; }')
        for mode in ('full', 'stand'):
            if mode == 'stand': pg.evaluate('() => { window.__TIER_ALL = true; tierApply(); }'); print('settle', pg.evaluate(SETTLE, 4000))
            else: print('settle', pg.evaluate(SETTLE, 600))
            for z in a.zooms:
                pg.evaluate('z => { zoom = zoomT = z; }', z)
                c = pg.evaluate('() => __perf.cap(12, 2)')
                print('   zoom %-4g draws %5d calls, %8d triangles' % (z, c['info']['calls'], c['info']['tris']))
                if a.crops: open(os.path.join(a.crops, '%s_%s_z%g.png' % (a.scene, mode, z)), 'wb').write(H.png_bytes(c['png']))
            rr = M.read(pg, cdp)
            print('%-6s (after drawing at each zoom) JS heap %.0f MB, graphics %.0f MB (buffers %.0f MB)' % (mode, rr['js'], rr['gfx'], rr['buf']))
        print('page errors', errs[:3]); br.close()
    srv.shutdown()
