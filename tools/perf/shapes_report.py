#!/usr/bin/env python3
"""Which shapes the buildings are made of: for every primitive put into a piece while the scene's city is generated, its shape (kit: box, cyl, sph, blob, or
which other builder) and its triangle count, summed. Run on the harness scenes. (A patched copy of core.js counts the calls; nothing in the game changes.)
   python3 tools/perf/shapes_report.py maxcity [--top 25]"""
import argparse, collections, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
INIT = r"""
window.__PS_STATS = { n: {}, tris: {}, verts: {}, lab: new Map() };
window.__PS = function(geo, mat, m){
  const st = window.__PS_STATS; let lab = st.lab.get(geo);
  if (!lab){
    const kit = ['box', 'cyl', 'sph', 'blob'].find(k => window.U && U[k] === geo);
    const p = geo.parameters || {};
    lab = kit ? 'kit ' + kit : (geo.type && geo.type !== 'BufferGeometry' ? geo.type : 'custom') + ' ' + (p.radialSegments || p.radius || p.curveSegments || '') + '/' + (geo.index ? geo.index.count : geo.attributes.position.count)/3;
    for (const k of Object.keys(window.U || {})) if (U[k] === geo){ lab = 'U.' + k + ' (' + geo.type + ')'; break; }
    st.lab.set(geo, lab);
  }
  const t = (geo.index ? geo.index.count : geo.attributes.position.count)/3;
  st.n[lab] = (st.n[lab] || 0) + 1; st.tris[lab] = (st.tris[lab] || 0) + t;
};
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--top', type=int, default=28); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('shapes', None)
    f = os.path.join(H.CACHE, 'sites', 'shapes', 'js', 'core.js'); s = open(f).read()
    assert 'function put(geo, mat, m){\n' in s
    open(f, 'w').write(s.replace('function put(geo, mat, m){\n', 'function put(geo, mat, m){\n  if (window.__PS) window.__PS(geo, mat, m);\n', 1))
    sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=INIT)
        pg.evaluate('() => __perf.cap(5, 1)')
        r = pg.evaluate('() => ({ n: __PS_STATS.n, tris: __PS_STATS.tris })')
        tot = sum(r['tris'].values()); n = sum(r['n'].values())
        kit = sum(v for k, v in r['tris'].items() if k.startswith('kit ')); rnd = sum(v for k, v in r['tris'].items() if any(w in k for w in ('cyl', 'Cylinder', 'Sphere', 'blob', 'Icosa', 'Torus', 'Lathe', 'Cone', 'sph')))
        print('%s: %d primitives, %d triangles put; the kit (box, cyl, sph, blob) %.1f%%, everything else %.1f%%; round-ish shapes (cylinders, spheres, blobs, tori, domes, cones) %.1f%%' % (a.scene, n, tot, 100*kit/tot, 100*(tot - kit)/tot, 100*rnd/tot))
        for k, v in sorted(r['tris'].items(), key=lambda kv: -kv[1])[:a.top]: print('  %-52s %9d tris  %5.1f%%   %7d uses  %5.1f tris each' % (k, v, 100*v/tot, r['n'][k], v/r['n'][k]))
        print(errs[:2]); br.close()
    srv.shutdown()
