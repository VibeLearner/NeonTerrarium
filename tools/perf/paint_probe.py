#!/usr/bin/env python3
"""Item 10, the measurement: what share of the buildings' triangles belong to flat detail lying against a larger wall face?
A box counts when, along some axis a, all of it lies within DEPTH (.06 units) of the plane of a larger box's face, parallel to it, and its footprint on that plane lies
inside that face's rectangle (a sill, frame, panel, window pane, window bar or rail laid on a wall). Boxes are the primitives of U.box (12 triangles each); the share is of all
triangles put into the pieces of the scene (the visible share is not known from here; see visprobe.py for what shows). Split by glowing (windows, neon) and plain materials.
   python3 tools/perf/paint_probe.py city [--depth .06]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
INIT = r"""
window.__PB = { boxes: [], pieces: 0, last: null, tris: 0, other: 0 };
window.__PS = function(geo, mat, m){
  const st = window.__PB;
  if (typeof curCover !== 'undefined' && curCover !== st.last){ st.last = curCover; st.pieces++; }
  const t = (geo.index ? geo.index.count : geo.attributes.position.count)/3;
  if (geo === U.box){ const e = m.elements; st.boxes.push([st.pieces, mat.userData && mat.userData.glow ? 1 : 0, mat.isMeshToonMaterial ? 1 : 0, e[12], e[13], e[14], e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]]); st.tris += 12; }
  else st.other += t;
};
"""
ANALYZE = r"""depth => {
  const B = __PB.boxes, n = B.length, out = { boxes: n, pieces: __PB.pieces, trisBoxes: __PB.tris, trisOther: __PB.other };
  // per box: center, three axes (columns, unit), half sizes
  const byPiece = new Map();
  for (let i = 0; i < n; i++){ const b = B[i]; let l = byPiece.get(b[0]); if (!l) byPiece.set(b[0], l = []); l.push(i); }
  const info = new Array(n);
  for (let i = 0; i < n; i++){ const b = B[i], ax = [[b[6], b[7], b[8]], [b[9], b[10], b[11]], [b[12], b[13], b[14]]], len = ax.map(a => Math.hypot(a[0], a[1], a[2]));
    info[i] = { c: [b[3], b[4], b[5]], u: ax.map((a, k) => a.map(v => v/(len[k] || 1))), h: len.map(v => v/2), glow: b[1], toon: b[2] }; }
  const flat = new Uint8Array(n);
  const G = 1.0, key = (x, y, z) => x + ',' + y + ',' + z;
  for (const [pc, idx] of byPiece){
    const grid = new Map();
    for (const i of idx){ const c = info[i].c, k = key(Math.floor(c[0]/G), Math.floor(c[1]/G), Math.floor(c[2]/G)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i); }
    for (const i of idx){
      const bi = info[i], ci = bi.c;
      // the candidate walls: boxes near it
      const cx = Math.floor(ci[0]/G), cy = Math.floor(ci[1]/G), cz = Math.floor(ci[2]/G);
      let found = false;
      for (let dx = -2; dx <= 2 && !found; dx++) for (let dy = -2; dy <= 2 && !found; dy++) for (let dz = -2; dz <= 2 && !found; dz++){
        const l = grid.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
        for (const j of l){
          if (j === i) continue; const bj = info[j];
          // a larger box: the wall; try each of its six faces
          for (let a = 0; a < 3 && !found; a++){
            const nrm = bj.u[a], d = [ci[0] - bj.c[0], ci[1] - bj.c[1], ci[2] - bj.c[2]];
            for (const sg of [-1, 1]){
              // face plane: n.x = bj.h[a] (sg*n outward)
              const fn = [nrm[0]*sg, nrm[1]*sg, nrm[2]*sg]; const off = fn[0]*bj.c[0] + fn[1]*bj.c[1] + fn[2]*bj.c[2] + bj.h[a];
              // the small box's extent along fn: center distance and half extent
              const hi = Math.abs(bi.u[0][0]*fn[0] + bi.u[0][1]*fn[1] + bi.u[0][2]*fn[2])*bi.h[0] + Math.abs(bi.u[1][0]*fn[0] + bi.u[1][1]*fn[1] + bi.u[1][2]*fn[2])*bi.h[1] + Math.abs(bi.u[2][0]*fn[0] + bi.u[2][1]*fn[1] + bi.u[2][2]*fn[2])*bi.h[2];
              const dc = fn[0]*ci[0] + fn[1]*ci[1] + fn[2]*ci[2] - off;   // signed distance of its center from the face plane (positive: outside the wall)
              const near = dc - hi, far = dc + hi;                         // its extent from the plane
              if (near < -0.012 || far > depth || far - near > depth + 1e-6) continue;   // lies on the face, at most DEPTH off it
              // parallel: its thin direction is the face normal (its smallest dimension is along fn)
              let thinAlong = 0, ext = [0, 0, 0]; for (let k = 0; k < 3; k++){ ext[k] = Math.abs(bi.u[k][0]*fn[0] + bi.u[k][1]*fn[1] + bi.u[k][2]*fn[2]); }
              // footprint inside the face's rectangle: project the small box's corners onto the face's two other axes
              const o1 = (a + 1)%3, o2 = (a + 2)%3; let ok = true;
              for (let q = 0; q < 8 && ok; q++){ const sx = q & 1 ? 1 : -1, sy = q & 2 ? 1 : -1, sz = q & 4 ? 1 : -1;
                const px = ci[0] + bi.u[0][0]*bi.h[0]*sx + bi.u[1][0]*bi.h[1]*sy + bi.u[2][0]*bi.h[2]*sz - bj.c[0], py = ci[1] + bi.u[0][1]*bi.h[0]*sx + bi.u[1][1]*bi.h[1]*sy + bi.u[2][1]*bi.h[2]*sz - bj.c[1], pz = ci[2] + bi.u[0][2]*bi.h[0]*sx + bi.u[1][2]*bi.h[1]*sy + bi.u[2][2]*bi.h[2]*sz - bj.c[2];
                const t1 = px*bj.u[o1][0] + py*bj.u[o1][1] + pz*bj.u[o1][2], t2 = px*bj.u[o2][0] + py*bj.u[o2][1] + pz*bj.u[o2][2];
                if (Math.abs(t1) > bj.h[o1] + 1e-4 || Math.abs(t2) > bj.h[o2] + 1e-4) ok = false; }
              if (!ok) continue;
              // and the wall is the larger: its face area at least twice the small box's footprint area
              const areaW = 4*bj.h[o1]*bj.h[o2], e1 = bi.h[0]*2, e2 = bi.h[1]*2, e3 = bi.h[2]*2, areaS = Math.max(e1*e2, e1*e3, e2*e3);
              if (areaW < 1.5*areaS && bj.h[a] > 0) continue;
              found = true; break;
            }
          }
          if (found) break;
        }
      }
      if (found) flat[i] = 1;
    }
  }
  let nf = 0, ng = 0, np = 0; for (let i = 0; i < n; i++) if (flat[i]){ nf++; if (info[i].glow) ng++; else np++; }
  const all = out.trisBoxes + out.trisOther;
  out.flatBoxes = nf; out.flatGlow = ng; out.flatPlain = np; out.flatTris = nf*12;
  out.shareOfAllTris = +(100*nf*12/all).toFixed(1); out.shareGlow = +(100*ng*12/all).toFixed(1); out.sharePlain = +(100*np*12/all).toFixed(1);
  out.shareOfBoxes = +(100*nf/n).toFixed(1);
  return out; }"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--depth', type=float, default=.06); a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('paint', None)
    f = os.path.join(H.CACHE, 'sites', 'paint', 'js', 'core.js'); s = open(f).read()
    assert 'function put(geo, mat, m){\n' in s
    open(f, 'w').write(s.replace('function put(geo, mat, m){\n', 'function put(geo, mat, m){\n  if (window.__PS) window.__PS(geo, mat, m);\n', 1))
    sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0], extra_init=INIT)
        pg.evaluate('() => __perf.cap(5, 1)')
        r = pg.evaluate(ANALYZE, a.depth)
        print(json.dumps(r, indent=1)); print(errs[:2]); br.close()
    srv.shutdown()
