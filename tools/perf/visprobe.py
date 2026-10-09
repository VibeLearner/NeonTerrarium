#!/usr/bin/env python3
"""Which of the buildings' triangles show from any allowed view? Renders triangle ids (no lighting) from 12 turns x 3 tilts at one zoom,
around the camera's target, and counts the triangles whose centre lies within the disc that stays on screen for every angle:
seen at least once, or never (and how many of those are already in the hidden segment H), by segment and by area.
A sampled test (a triangle under a pixel can be missed, so small ones are reported apart): used to find what is left to hide, not to prove it.
   python3 tools/perf/visprobe.py city --zoom 30 [--radius 6]"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import harness as H
JS = r"""async ([zoomV, R, nyaw, pitches, at]) => {
  SC.mode = 'off'; if (at){ camGoal.set(at[0], 0, at[1]); camT.copy(camGoal); __perf.cap(3, 0); }
  const tris = [];   // {g, seg, ...} per triangle in the pieces' lists: A, H, S (D is a repeat)
  const pos = [], col = []; let total = 0;
  const info = [];   // per triangle: seg (0 A, 1 H, 2 S), area, cx, cz, cy, mat name, piece index
  const S = new THREE.Scene(); const pieces = [];
  world.updateMatrixWorld(true);
  world.traverse(m => { const g = m.isMesh && m.geometry; if (!g || !g.userData.cut || m.userData.sideOf) return; pieces.push(m); });
  const e0 = camT.clone();
  const cx0 = camT.x, cz0 = camT.z;
  const P3 = [], ID = [];
  for (let pi = 0; pi < pieces.length; pi++){
    const m = pieces[pi], g = m.geometry, u = g.userData.cut, P = g.attributes.position.array, I = g.index.array, M = m.matrixWorld.elements;
    const n = u.A + u.H + u.S;
    for (let q = 0; q < n; q += 3){
      const seg = q < u.A ? 0 : q < u.A + u.H ? 1 : 2;
      const v = [I[q]*3, I[q + 1]*3, I[q + 2]*3].map(o => { const x = P[o], y = P[o + 1], z = P[o + 2]; return [M[0]*x + M[4]*y + M[8]*z + M[12], M[1]*x + M[5]*y + M[9]*z + M[13], M[2]*x + M[6]*y + M[10]*z + M[14]]; });
      const cx = (v[0][0] + v[1][0] + v[2][0])/3, cz = (v[0][2] + v[1][2] + v[2][2])/3;
      if (Math.hypot(cx - cx0, cz - cz0) > R) continue;
      const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
      const nx = uy*wz - uz*wy, ny = uz*wx - ux*wz, nz = ux*wy - uy*wx, area = Math.hypot(nx, ny, nz)/2;
      const id = info.length; info.push([seg, area, piece(m), ny/(2*area || 1), nx/(2*area || 1), nz/(2*area || 1), (v[0][1] + v[1][1] + v[2][1])/3]);
      for (const p of v) P3.push(p[0], p[1], p[2]);
      const r = (id & 255)/255, gg = ((id >> 8) & 255)/255, b = ((id >> 16) & 255)/255; for (let k = 0; k < 3; k++) col.push(r, gg, b);
    }
  }
  function piece(m){ return m.parent && m.parent.userData && m.parent.userData.plot ? 1 : 0; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({ vertexShader: 'attribute vec3 color; varying vec3 vc; void main(){ vc = color; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'precision highp float; varying vec3 vc; void main(){ gl_FragColor = vec4(vc, 1.0); }', side: THREE.FrontSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; S.add(mesh);
  const w = renderer.domElement.width, h = renderer.domElement.height, rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true }); rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
  const seen = new Uint8Array(info.length), buf = new Uint8Array(w*h*4);
  SC.mode = 'off'; const saved = renderer.getRenderTarget();
  const out = { zoom: zoomV, n: info.length, views: 0 };
  for (const pd of pitches) for (let k = 0; k < nyaw; k++){
    zoom = zoomT = zoomV; PITCH = pitchT = pd*Math.PI/180; yaw = yawT = k*2*Math.PI/nyaw + .07;
    __perf.cap(2, 0);
    cam.updateMatrixWorld();
    renderer.setRenderTarget(rt); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.render(S, cam); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf); renderer.setRenderTarget(saved);
    for (let i = 0; i < w*h; i++){ const o = i*4; if (buf[o + 3] !== 255) continue; const id = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16); if (id < info.length) seen[id] = 1; }
    out.views++;
  }
  // only triangles whose centre is inside the disc that is on screen in every view
  const pxPerUnit = (w/ (cam.right - cam.left)); out.pxPerUnit = pxPerUnit;
  const r = { A: { n: 0, seen: 0, small: 0 }, H: { n: 0, seen: 0, small: 0 }, S: { n: 0, seen: 0, small: 0 } };
  const never = [];
  for (let id = 0; id < info.length; id++){ const [seg, area] = info[id], k = 'AHS'[seg], px = area*pxPerUnit*pxPerUnit; r[k].n++; if (seen[id]) r[k].seen++; else if (px < 1) r[k].small++; else never.push(id); }
  out.seg = r; out.neverBig = never.length;
  const cls = {}; for (const id of never){ const [seg, area, , ny, nx, nz, cy] = info[id]; const dir = Math.abs(ny) > .9 ? (ny > 0 ? 'up' : 'down') : 'side'; const k = 'AHS'[seg] + ' ' + dir; cls[k] = (cls[k] || 0) + 1; }
  out.cls = cls;
  // what the triangles in the disc are, by height and facing: street level (paving, curbs) is flat and low; buildings are above it
  const pop = { 'ground level, facing up (y < .6)': 0, 'low (y < 2), other facing': 0, 'above 2 units, facing up': 0, 'above 2 units, sideways or down': 0 }; for (let id = 0; id < info.length; id++){ const cy = info[id][6], up = info[id][3] > .7; const k = cy < .6 && up ? 'ground level, facing up (y < .6)' : cy < 2 ? 'low (y < 2), other facing' : up ? 'above 2 units, facing up' : 'above 2 units, sideways or down'; pop[k]++; }
  out.population = pop; out.neverBigByPopulation = {}; for (const id of never){ const cy = info[id][6], up = info[id][3] > .7; const k = cy < .6 && up ? 'ground level, facing up (y < .6)' : cy < 2 ? 'low (y < 2), other facing' : up ? 'above 2 units, facing up' : 'above 2 units, sideways or down'; out.neverBigByPopulation[k] = (out.neverBigByPopulation[k] || 0) + 1; }
  return out;
}"""
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('scene'); ap.add_argument('--zoom', type=float, default=30); ap.add_argument('--radius', type=float, default=5); ap.add_argument('--yaws', type=int, default=12); ap.add_argument('--at', type=float, nargs=2, default=None)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    srv = H.serve(); url = H.make_site('vp', None); sc = H.load_scenes([a.scene])[0]
    with sync_playwright() as pw:
        br = H.launch(pw); ctx, pg, errs = H.open_game(br, url, sc, H.VIEWPORTS[1], 'off', extra_init='window.__KEEP_CPU = true;')
        print(json.dumps(pg.evaluate(JS, [a.zoom, a.radius, a.yaws, [12, 45, 82], a.at]), indent=1)); print(errs[:2]); br.close()
    srv.shutdown()
