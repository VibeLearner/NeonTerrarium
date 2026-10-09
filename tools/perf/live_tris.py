#!/usr/bin/env python3
"""What the cache frame's live pass draws: triangles by kind of object (instanced meshes by their instance count), and how many draw calls, for the objects that are visible
and on the live layers (everything the static cache doesn't hold). Triangles are counted as submitted (before the card's culling).
   python3 tools/perf/live_tris.py maxcity [--zoom 30]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = """() => { const mask = SC_LIVE_MASK, by = {}; let total = 0, calls = 0; cam.updateMatrixWorld(); const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  scene.traverse(o => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible) return; for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    if (!(o.layers.mask & mask) || (o.layers.mask & 64)) return;
    const g = o.geometry; if (!g) return; let t;
    if (o.frustumCulled && !o.isInstancedMesh && g.boundingSphere !== undefined){ if (!g.boundingSphere) g.computeBoundingSphere(); if (!fr.intersectsObject(o)) return; }
    if (o.isPoints) t = (g.drawRange.count !== Infinity ? g.drawRange.count : g.attributes.position.count)*2; else if (o.isLine) t = 0;
    else { const per = (g.index ? g.index.count : g.attributes.position.count)/3; t = per*(o.isInstancedMesh ? o.count : 1); }
    const k = (o.isInstancedMesh ? 'instanced ' : o.isPoints ? 'points ' : 'mesh ') + (o.material && o.material.type) + (o.layers.mask === 1 ? '' : ' layers ' + o.layers.mask);
    const e = by[k] || (by[k] = { tris: 0, objs: 0, inst: 0, ex: [] }); e.tris += t; e.objs++; if (e.ex.length < 3) e.ex.push([o.material && (o.material.name || (o.material.userData && Object.keys(o.material.userData).join('+')) || o.material.uuid.slice(0, 6)), o.parent && o.parent.type, o.userData && Object.keys(o.userData).slice(0, 4).join('+'), Math.round(t)].join(' / ')); if (o.isInstancedMesh) e.inst += o.count; total += t; calls++;
  });
  const rows = Object.entries(by).sort((a, b) => b[1].tris - a[1].tris).slice(0, 14).map(([k, v]) => k + ': ' + Math.round(v.tris/1000) + 'k triangles, ' + v.objs + ' objects' + (v.inst ? ', ' + v.inst + ' instances' : '') + '   e.g. ' + v.ex.join(' | '));
  return { totalK: Math.round(total/1000), objects: calls, rows }; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('lt', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_CPU = true;')
        pg.evaluate('z => { zoom = zoomT = z; S.cycle = false; S.hour = 12; }', a.zoom); pg.evaluate('() => __perf.cap(60, 6)')
        r = pg.evaluate(JS); print('zoom %g: %dk triangles in %d live objects' % (a.zoom, r['totalK'], r['objects']))
        for x in r['rows']: print('  ' + x)
        print(errs[:2]); br.close()
    srv.shutdown()
