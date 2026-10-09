#!/usr/bin/env python3
"""Round 9, item 6: how big the never-seen job is for a whole scene, from counts (no drawing, no timing). For every plot the job would work on (nvNeeds: not a megastructure, not a pod, has geometry) the picture
each of the production views would make is worked out the way the job does it (the camera of nvCam: a pixel of .0045 world units, the plot's box seen from the view, 4 pixels more, the whole picture at most
NV.maxPx on a side) and summed: pixels the old job draws and scatters (every view, the whole box) for the plot and for all plots, views, plots, triangles. Prints a table by zone and the totals as JSON for the estimate in OVERNIGHT4B.md.
   python3 tools/perf/nv_estimate.py maxcity"""
import argparse, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
RUN = r"""
async () => {
  const views = nvViews(NV), rows = [];   // (the production set: NV.yaws x NV.np)
  const hbb = new THREE.Box3(), sph = new THREE.Sphere(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000), v = new THREE.Vector3(), ctr = new THREE.Vector3();
  for (const c of cells.values()){
    if (c.mega || !c.data || c.lift) continue; const g = c.data.geo.get(ATLAS); if (!g || !g.userData.cut) continue;
    const bb = g.boundingBox; if (!bb) continue;
    const tri = nvTriangles(g).length, rad = bb.getBoundingSphere(sph).radius; bb.getCenter(ctr);
    const side = Math.min(NV.maxPx, Math.ceil(2*rad/NV.px) + 8); let px = 0, wsum = 0;
    for (const [yaw, pit, jit] of views){
      cam.position.set(ctr.x + Math.sin(yaw)*Math.cos(pit)*300, ctr.y + Math.sin(pit)*300, ctr.z + Math.cos(yaw)*Math.cos(pit)*300); cam.lookAt(ctr); cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let q = 0; q < 8; q++){ v.set(q & 1 ? bb.max.x : bb.min.x, q & 2 ? bb.max.y : bb.min.y, q & 4 ? bb.max.z : bb.min.z).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      let P = NV.px; if (Math.max(x1 - x0, y1 - y0)/P + 4 > side) P = Math.max(x1 - x0, y1 - y0)/(side - 4);
      const w0 = Math.min(side, Math.ceil((x1 - x0)/P) + 4), h0 = Math.min(side, Math.ceil((y1 - y0)/P) + 4); px += w0*h0;
    }
    rows.push({ zone: c.sections.length ? c.sections[0].zone : 'empty', T: tri, side, px, views: views.length });
  }
  return rows;
}
"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene')
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('nvest', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init='window.__KEEP_GEO = true; window.__NV_OFF = true;')
        pg.evaluate('() => { __perf.skip = true; }')
        rows = pg.evaluate(RUN); br.close()
    srv.shutdown()
    by = {}
    for r in rows: z = by.setdefault(r['zone'], [0, 0, 0, 0]); z[0] += 1; z[1] += r['T']; z[2] += r['px']; z[3] = max(z[3], r['side'])
    print('%s: %d plots the job would work on, %d views each' % (a.scene, len(rows), rows[0]['views'] if rows else 0))
    for z, (n, T, px, side) in sorted(by.items()): print('  %-6s %5d plots, %9d triangles, %.2f Gpx in the old job (%.1f Mpx a plot, widest picture %d px)' % (z, n, T, px/1e9, px/n/1e6, side))
    tot = sum(r['px'] for r in rows); print('total: %.1f Gpx drawn and as many scattered by the old job; views %d' % (tot/1e9, sum(r['views'] for r in rows)))
    json.dump({ 'scene': a.scene, 'plots': len(rows), 'views': rows[0]['views'], 'px': tot, 'byZone': by, 'rows': rows }, open(os.path.join('/tmp/claude-0', 'nv_estimate_%s.json' % a.scene), 'w'))
    print('page errors', errs[:3])
