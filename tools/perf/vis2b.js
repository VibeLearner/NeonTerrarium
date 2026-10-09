() => {
  // Candidate view sets for the never-seen rule against a denser reference, on some of the owner's 20 plots (same picks as geo20b.js).
  // window.__V = { every, ref: cfg, cands: [cfg...] }; cfg = { px, yaws, pitches, jits: [[x, y]...] }. Reports per candidate: triangles it would remove
  // (drawn today, never seen, not a depth tie) and how many of them the reference sees (false removals; the bar is zero).
  const V = window.__V, PIT = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a)*i/(n - 1));
  const byZone = {}; for (const c of cells.values()){ if (!c.data || !c.sections || !c.sections.length || !c.data.geo.get(ATLAS) || c.lift) continue; const z = c.sections[0].zone; (byZone[z] = byZone[z] || []).push(c); }
  let picks = []; for (const z of ['low', 'mid', 'high', 'ind']){ const L = (byZone[z] || []).sort((a, b) => a.sections[0].seed - b.sections[0].seed); for (let q = 0; q < 5 && L.length; q++) picks.push(L[Math.floor((q + .5)*L.length/5)]); }
  if (V.only) picks = V.only.map(i => picks[i]); else if (V.every) picks = picks.filter((_, i) => i % V.every === 0);
  const rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000), v = new THREE.Vector3();
  const out = { plots: [], cands: V.cands.map(() => ({ removed: 0, falseRemoved: 0 })), ref: { never: 0 }, drawn: 0, tieKept: 0 };
  for (const c of picks){
    const g = c.data.geo.get(ATLAS), I = g.index.array, P = g.attributes.position.array, cut = g.userData.cut;
    const n = cut.A + cut.H + cut.S, tris = [], inH = []; for (let k = 0; k + 2 < n; k += 3){ tris.push([I[k], I[k + 1], I[k + 2]]); inH.push(k >= cut.A && k < cut.A + cut.H); }
    const T = tris.length, M = c.view ? c.view.matrixWorld : new THREE.Matrix4(), pos = new Float32Array(T*9), col = new Uint8Array(T*9);
    for (let t = 0; t < T; t++){ const id = t + 1; for (let q = 0; q < 3; q++){ v.fromArray(P, tris[t][q]*3).applyMatrix4(M); pos[t*9 + q*3] = v.x; pos[t*9 + q*3 + 1] = v.y; pos[t*9 + q*3 + 2] = v.z; col[t*9 + q*3] = id & 255; col[t*9 + q*3 + 1] = (id >> 8) & 255; col[t*9 + q*3 + 2] = (id >> 16) & 255; } }
    const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ig.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); ig.computeBoundingBox();
    const scn = new THREE.Scene(), mesh = new THREE.Mesh(ig, mat); mesh.frustumCulled = false; scn.add(mesh);
    const bb = ig.boundingBox, ctr = bb.getCenter(new THREE.Vector3());
    const visFor = cfg => { const vis = new Uint8Array(T + 1), P_SZ = cfg.px, YAWS = cfg.yaws, PIT_ = PIT(cfg.p0, cfg.p1, cfg.np);
      for (const pd of PIT_) for (let yi = 0; yi < YAWS; yi++) for (const jit of cfg.jits){
        const yaw = (yi + (cfg.yawOff || 0))/YAWS*Math.PI*2, pit = pd*Math.PI/180;
        cam.position.set(ctr.x + Math.sin(yaw)*Math.cos(pit)*300, ctr.y + Math.sin(pit)*300, ctr.z + Math.cos(yaw)*Math.cos(pit)*300); cam.lookAt(ctr); cam.updateMatrixWorld();
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let q = 0; q < 8; q++){ v.set(q&1?bb.max.x:bb.min.x, q&2?bb.max.y:bb.min.y, q&4?bb.max.z:bb.min.z).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
        const w = Math.min(4096, Math.ceil((x1 - x0)/P_SZ) + 4), h = Math.min(4096, Math.ceil((y1 - y0)/P_SZ) + 4);
        cam.left = x0 - (2 + jit[0])*P_SZ; cam.right = cam.left + w*P_SZ; cam.bottom = y0 - (2 + jit[1])*P_SZ; cam.top = cam.bottom + h*P_SZ; cam.near = -z1 - 1; cam.far = -z0 + 1; cam.updateProjectionMatrix();
        rt.setSize(w, h); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scn, cam);
        const buf = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        for (let i = 0; i < buf.length; i += 4){ const id = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16); if (id) vis[id] = 1; } }
      renderer.setRenderTarget(null); return vis; };
    // depth ties: a drawn triangle facing the same way in the same plane holding this one's middle: never removed
    const cen = [], nor = []; for (let t = 0; t < T; t++){ const a = new THREE.Vector3().fromArray(pos, t*9), b = new THREE.Vector3().fromArray(pos, t*9 + 3), d = new THREE.Vector3().fromArray(pos, t*9 + 6); cen.push(a.clone().add(b).add(d).divideScalar(3)); nor.push(new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize()); }
    const grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z; for (let t = 0; t < T; t++){ if (inH[t]) continue; const k = key(Math.floor(cen[t].x*2), Math.floor(cen[t].y*2), Math.floor(cen[t].z*2)); (grid.get(k) || grid.set(k, []).get(k)).push(t); }
    const inside = (u, p) => { const a = new THREE.Vector3().fromArray(pos, u*9), b = new THREE.Vector3().fromArray(pos, u*9 + 3), d = new THREE.Vector3().fromArray(pos, u*9 + 6), nn = nor[u];
      return new THREE.Vector3().crossVectors(b.clone().sub(a), p.clone().sub(a)).dot(nn) > -1e-6 && new THREE.Vector3().crossVectors(d.clone().sub(b), p.clone().sub(b)).dot(nn) > -1e-6 && new THREE.Vector3().crossVectors(a.clone().sub(d), p.clone().sub(d)).dot(nn) > -1e-6; };
    const tie = new Uint8Array(T);
    for (let t = 0; t < T; t++){ if (inH[t]) continue; const cx = Math.floor(cen[t].x*2), cy = Math.floor(cen[t].y*2), cz = Math.floor(cen[t].z*2); let f = false;
      for (let dx = -1; dx <= 1 && !f; dx++) for (let dy = -1; dy <= 1 && !f; dy++) for (let dz = -1; dz <= 1 && !f; dz++){ const l = grid.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
        for (const u of l){ if (u === t || nor[u].dot(nor[t]) < .9999 || Math.abs(nor[t].dot(cen[u].clone().sub(cen[t]))) > 2e-4) continue; if (inside(u, cen[t])){ f = true; break; } } }
      tie[t] = f ? 1 : 0; }
    const ref = visFor(V.ref); const cvs = V.cands.map(visFor);
    let drawn = 0, refNever = 0, ties = 0; for (let t = 0; t < T; t++){ if (inH[t]) continue; drawn++; if (!ref[t + 1]) refNever++; }
    for (let t = 0; t < T; t++){ if (inH[t]) continue; if (tie[t]) ties++; V.cands.forEach((_, k) => { if (!cvs[k][t + 1] && !tie[t]){ out.cands[k].removed++; if (ref[t + 1]) out.cands[k].falseRemoved++; } }); }
    { const E = [.0125, .025, .05, .1, .2, .4, 1e9]; out.fbins = out.fbins || {}; const cv = cvs[cvs.length - 1];
      for (let t = 0; t < T; t++){ if (inH[t] || tie[t] || cv[t + 1] || !ref[t + 1]) continue;
        const a = new THREE.Vector3().fromArray(pos, t*9), b = new THREE.Vector3().fromArray(pos, t*9 + 3), d = new THREE.Vector3().fromArray(pos, t*9 + 6), L = Math.max(a.distanceTo(b), b.distanceTo(d), d.distanceTo(a)), ar = new THREE.Triangle(a, b, d).getArea(), Ls = Math.min(a.distanceTo(b), b.distanceTo(d), d.distanceTo(a));
        let k = 0; while (L >= E[k]) k++; const key = 'edge<' + E[k]; const e = out.fbins[key] || (out.fbins[key] = { n: 0, thin: 0 }); e.n++; if (ar/Math.max(L*L, 1e-9) < .06) e.thin++; } }
    out.drawn += drawn; out.ref.never += refNever; out.tieKept += ties; out.plots.push({ zone: c.sections[0].zone, tris: T, drawn });
    ig.dispose();
  }
  rt.dispose(); return out;
}
