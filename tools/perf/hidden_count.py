#!/usr/bin/env python3
"""Triangles in the buildings' lists, by segment (A drawn always, H hidden from the camera, S walls), and how many the hide rules move to H:
   python3 tools/perf/hidden_count.py city dense island maxcity megas
For the build in this tree. (tools/perf/patches/hide_flat_faces.patch adds the "face pressed against a block's face" rule; with it applied
window.__NO_HIDE_FLAT = true turns it off, and this script then compares the two in one build.)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """() => { const o = { A: 0, H: 0, S: 0, meshes: 0, tris: 0 }; const seen = new Set();
  world.traverse(m => { const g = m.isMesh && m.geometry; if (!g || !g.userData.cut || seen.has(g)) return; seen.add(g); const u = g.userData.cut; o.A += u.A/3; o.H += u.H/3; o.S += u.S/3; o.meshes++; });
  o.tris = o.A + o.H + o.S; return o; }"""
if __name__ == '__main__':
    names = sys.argv[1:] or ['city']
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('hc', None)
    with sync_playwright() as pw:
        br = H.launch(pw)
        for sc in H.load_scenes(names):
            res = {}
            for tag, init in (('old', 'window.__NO_HIDE_FLAT = true;'), ('new', None)):
                ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=init)
                res[tag] = pg.evaluate(JS); ctx.close()
            o, n = res['old'], res['new']
            print('%-8s pieces %5d   A drawn %9d -> %9d   hidden H %9d -> %9d   walls S %9d -> %9d   moved to H %8d (%.1f%% of A+S)' % (sc['name'], n['meshes'], o['A'], n['A'], o['H'], n['H'], o['S'], n['S'], n['H'] - o['H'], 100*(n['H'] - o['H'])/max(1, o['A'] + o['S'])), flush=True)
        br.close()
    srv.shutdown()
