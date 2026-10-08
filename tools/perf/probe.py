#!/usr/bin/env python3
"""Read-only probes of what the color pass submits (triangle counts by kind) in a scene at a camera, no pixels compared.

  python3 tools/perf/probe.py maxcity --zoom 30 --yaw 0.6
  python3 tools/perf/probe.py maxcity --zoom 30 --yaw 0.6 --pitch 0.6

Counts, for the merged building meshes as they would be drawn this frame (after per-plot culling): triangles drawn,
those facing away from the camera, split by where the index order put them (A: always drawn, S: wall slices), and how
many of the A ones that face away tilt up by under 8 degrees. Used to decide whether a facing order for the non-wall
triangles (plan W1b) is worth building.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H

PROBE = r"""
() => {
  cullFrame(); sideArc();
  const e = cam.matrixWorld.elements, t = [e[8], e[9], e[10]];
  const out = { A: 0, Aback: 0, Aback_lt8: 0, Abuckets: {}, S: 0, Sback: 0, pieces: 0, tris_total_in_meshes: 0 };
  const lt = Math.tan(8*Math.PI/180);
  world.traverse(o => {
    const g = o.isMesh && o.geometry; if (!g || !g.userData.cut) return;
    const P = g.attributes.position.array, I = g.index.array, u = g.userData.cut, pc = g.userData.pcs;
    if (o.userData.sideOf) return;   // the walls' mesh shares the geometry: counted below through its owner
    const seen = pc ? pieceVis(pc) : 1;
    const range = (a, b, isA) => {
      for (let q = a; q < b; q += 3){
        const a3 = I[q]*3, b3 = I[q+1]*3, c3 = I[q+2]*3;
        const ux = P[b3]-P[a3], uy = P[b3+1]-P[a3+1], uz = P[b3+2]-P[a3+2], vx = P[c3]-P[a3], vy = P[c3+1]-P[a3+1], vz = P[c3+2]-P[a3+2];
        const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx, l = Math.hypot(nx, ny, nz);
        const back = l > 0 && (nx*t[0] + ny*t[1] + nz*t[2]) < 0;
        if (isA){ out.A++; if (back){ out.Aback++; const el = ny/l, h = Math.hypot(nx, nz)/l; if (el > 0 && h < lt*el*0 + 1e9 && Math.abs(el/ h) < lt) out.Aback_lt8++; const k = el > .99 ? 'flat' : el > 0 ? 'tilted' : el === 0 ? 'vertical' : 'down'; out.Abuckets[k] = (out.Abuckets[k] || 0) + 1; } }
        else { out.S++; if (back) out.Sback++; }
      }
    };
    const n = pc ? pc.n : 1;
    for (let i = 0; i < n; i++){
      if (pc && !pc.vis[i]) continue;
      out.pieces++;
      if (pc){ range(pc.rowS[i], pc.rowS[i] + pc.rowN[i], true);
        const s0 = SIDE_ARC.all ? 0 : SIDE_ARC.s, L = SIDE_ARC.all ? SIDE_K : SIDE_ARC.L;
        for (let r = 1 + s0; r <= s0 + L; r++) range(pc.rowS[r*n + i], pc.rowS[r*n + i] + pc.rowN[r*n + i], false); }
    }
  });
  out.zoom = zoom; out.yaw = yaw; out.pitch = PITCH;
  return out;
}
"""

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--yaw', type=float, default=None); ap.add_argument('--pitch', type=float, default=None)
    ap.add_argument('--frames', type=int, default=40)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('probe', None)
    sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw)
        ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[0])
        js = 'zoomT = %s;' % a.zoom
        if a.yaw is not None: js += ' yawT = %s;' % a.yaw
        if a.pitch is not None: js += ' pitchT = %s; PITCH = pitchT;' % a.pitch
        pg.evaluate('() => { ' + js + ' }')
        pg.evaluate('n => __perf.cap(n)', a.frames)
        print(json.dumps(pg.evaluate(PROBE), indent=1)); print(errs[:2])
        br.close()
    srv.shutdown()
