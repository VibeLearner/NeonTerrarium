#!/usr/bin/env python3
"""Item 2c: which builders put the triangles: every 40th primitive put while the scene's city is generated is attributed to the building function that called the kit
(`put`, `box`, `cyl`, `sph`, `blob` and the like are skipped), with its shape. Triangles are estimated as sample x 40.
   python3 tools/perf/shapes_sites.py maxcity [--top 30] [--custom]   (--custom: only shapes outside the kit's box, cyl, sph, blob)"""
import argparse, collections, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
INIT = r"""
window.__PSITE = { n: 0, by: {}, tot: 0 };
window.__PS = function(geo, mat, m){
  const S = window.__PSITE; S.n++; const t = (geo.index ? geo.index.count : geo.attributes.position.count)/3; S.tot += t; if (S.n % 40) return;
  const KU = typeof U !== 'undefined' ? U : {}; const kit = ['box', 'cyl', 'sph', 'blob'].find(k => KU[k] === geo);
  let shape = kit ? kit : (geo.type && geo.type !== 'BufferGeometry' ? geo.type : 'custom'); if (!kit){ for (const k of Object.keys(KU)) if (KU[k] === geo){ shape = 'U.' + k; break; } }
  const lines = new Error().stack.split('\n').slice(2); let who = '?';
  for (const l of lines){ const mm = l.match(/at (?:async )?([\w$.<>]+) \(/) || l.match(/at ([\w$.<>]+)$/); const nm = mm ? mm[1] : null; if (!nm) continue; if (/^(put|box|cyl|sph|blob|under|T|roundedBox|window\.__PS|wedge|stick|rail|pipe|plate)$/.test(nm)) continue; who = nm + ' ' + (l.match(/(\w+\.js):(\d+)/) || ['', '', ''])[1]; break; }
  const k = who + ' | ' + shape; const e = S.by[k] || (S.by[k] = { n: 0, t: 0 }); e.n++; e.t += t;
};
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--top', type=int, default=30); ap.add_argument('--custom', action='store_true'); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('sites', None)
    f = os.path.join(H.CACHE, 'sites', 'sites', 'js', 'core.js'); s = open(f).read()
    assert 'function put(geo, mat, m){\n' in s
    open(f, 'w').write(s.replace('function put(geo, mat, m){\n', 'function put(geo, mat, m){\n  if (window.__PS) window.__PS(geo, mat, m);\n', 1))
    sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_CPU = true;' + (INIT or '')); pg.evaluate('() => __perf.cap(5, 1)')
        r = pg.evaluate('() => __PSITE'); tot = r['tot']; rows = [(k, v) for k, v in r['by'].items() if not a.custom or not k.split(' | ')[1] in ('box', 'cyl', 'sph', 'blob')]
        print('%s: %d primitives, %.1fM triangles put; sampled every 40th (%d samples)%s' % (a.scene, r['n'], tot/1e6, sum(v['n'] for v in r['by'].values()), ', custom shapes only' if a.custom else ''))
        for k, v in sorted(rows, key=lambda kv: -kv[1]['t'])[:a.top]: print('  %-52s %5.1f%% of all  (~%d primitives, %.0f tris each)' % (k, 100*v['t']*40/tot, v['n']*40, v['t']/v['n']))
        print(errs[:2]); br.close()
    srv.shutdown()
