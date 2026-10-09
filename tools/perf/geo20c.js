() => {
  // ---- tag every primitive (box, cylinder, sphere...) as it is put into a bucket ----
  const SHAPE = new Map([[U.box, 'box'], [U.cyl, 'cyl'], [U.sph, 'sph'], [U.blob, 'blob']]);
  const origPut = put, origCollect = collect;
  put = function(geo, mat, m){
    const before = new Map(); for (const [, b] of buckets) before.set(b, b.p.length);
    origPut(geo, mat, m);
    let s = null; if (!geo.userData._size2){ geo.computeBoundingBox(); const bb = geo.boundingBox; geo.userData._size2 = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z]; } s = geo.userData._size2;
    const e = m.elements, d = [Math.hypot(e[0], e[1], e[2])*s[0], Math.hypot(e[4], e[5], e[6])*s[1], Math.hypot(e[8], e[9], e[10])*s[2]].sort((a, b) => a - b);
    for (const [, b] of buckets){ const s0 = before.has(b) ? before.get(b) : 0; if (b.p.length > s0){ (b._tags = b._tags || []).push([s0/3, b.p.length/3, SHAPE.get(geo) || 'other', d, mat.userData && mat.userData.glow || '']); break; } }
  };
  collect = function(fn){ let cap = null; const r = origCollect(() => { fn(); cap = buckets; });
    const g = r.geo.get(ATLAS);
    if (g && cap){ const n = g.attributes.position.count, tag = new Int32Array(n).fill(-1), list = []; let o = 0;
      for (const [mat, b] of cap){ if (!atlasable(mat)) continue; for (const t of (b._tags || [])){ const id = list.length; list.push(t); for (let v = t[0]; v < t[1]; v++) tag[o + v] = id; } o += b.p.length/3; }
      g.userData._tag = tag; g.userData._pieces = list; }
    return r; };
  // ---- pick 20 plots: 5 per zone, spread across seeds ----
  const byZone = {}; for (const c of cells.values()){ if (!c.data || !c.sections || !c.sections.length || !c.data.geo.get(ATLAS) || c.lift) continue;
    const z = c.sections[0].zone; (byZone[z] = byZone[z] || []).push(c); }
  const picks = []; for (const z of ['low', 'mid', 'high', 'ind']){ const L = (byZone[z] || []).sort((a, b) => a.sections[0].seed - b.sections[0].seed); for (let q = 0; q < 5 && L.length; q++) picks.push(L[Math.floor((q + .5)*L.length/5)]); }
  for (const c of picks) rebuildCell(c);
  if ((window.__GP || {}).every){ const e = window.__GP.every; for (let q = picks.length - 1; q >= 0; q--) if (q % e) picks.splice(q, 1); }
  put = origPut; collect = origCollect;
  const GP = window.__GP || {}, P_SZ = GP.px || 10/820, YAWS = GP.yaws || 24, PITCHES = GP.pitches || [12, 22, 32, 45, 60, 82], JITS = GP.jits || [0, .5];
  const rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat });
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false });
  const scn = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 1000), v = new THREE.Vector3();
  const classOf = t => { if (!t) return 'untagged';
    const [, , shape, d, glow] = t;
    if (glow === 'window') return 'windows (lit panes)';
    if (glow) return 'other glowing parts (neon, lamps, signs)';
    if (shape === 'cyl' || shape === 'sph' || shape === 'blob') return 'round parts (pipes, tanks, poles, domes)';
    if (shape !== 'box') return 'other shapes (custom, decals)';
    if (d[1] < .09) return 'sticks (rails, posts, bars, cables)';
    if (d[0] <= .06) return 'thin plates (frames, sills, panels, trims)';
    if (d[2] < .6) return 'small boxes (vents, AC units, fittings)';
    return 'main structure (walls, floors, roofs)'; };
  const results = [], tot = {};
  for (const c of picks){
    const g = c.data.geo.get(ATLAS); if (!g || !g.userData._tag) continue;
    const I = g.index.array, P = g.attributes.position.array, N = g.attributes.normal.array, Cc = g.attributes.color.array, E = g.attributes.aEm.array, F = g.attributes.aFlk.array, O = g.attributes.aOn.array, Fi = g.attributes.aFine.array;
    const tag = g.userData._tag, pcs = g.userData._pieces, cut = g.userData.cut;
    const nUnique = cut ? cut.A + cut.H + cut.S : I.length, hStart = cut ? cut.A : I.length, hEnd = cut ? cut.A + cut.H : I.length;
    const tris = [], inH = []; for (let k = 0; k + 2 < nUnique; k += 3){ tris.push([I[k], I[k+1], I[k+2]]); inH.push(k >= hStart && k < hEnd); }
    { const GPd = (window.__GP || {}).disc; if (GPd){   // (round 6's way: only the triangles within GPd units of the plot's middle are drawn; the rest of the plot isn't there to hide anything)
        const M0 = c.view ? c.view.matrixWorld : new THREE.Matrix4(), cs = tris.map(tr => new THREE.Vector3().fromArray(P, tr[0]*3).add(new THREE.Vector3().fromArray(P, tr[1]*3)).add(new THREE.Vector3().fromArray(P, tr[2]*3)).divideScalar(3).applyMatrix4(M0));
        const mid = new THREE.Vector3(); for (const q of cs) mid.add(q); mid.divideScalar(cs.length); let w = 0;
        for (let q = 0; q < tris.length; q++) if (Math.hypot(cs[q].x - mid.x, cs[q].z - mid.z) <= GPd){ tris[w] = tris[q]; inH[w] = inH[q]; w++; }
        tris.length = w; inH.length = w; } }
    const T = tris.length, M = c.view ? c.view.matrixWorld : new THREE.Matrix4();
    // visibility from every allowed angle at the closest zoom (the plot alone)
    const pos = new Float32Array(T*9), col = new Uint8Array(T*9);
    for (let t = 0; t < T; t++){ const id = t + 1; for (let q = 0; q < 3; q++){ v.fromArray(P, tris[t][q]*3).applyMatrix4(M); pos[t*9+q*3] = v.x; pos[t*9+q*3+1] = v.y; pos[t*9+q*3+2] = v.z; col[t*9+q*3] = id & 255; col[t*9+q*3+1] = (id >> 8) & 255; col[t*9+q*3+2] = (id >> 16) & 255; } }
    const ig = new THREE.BufferGeometry(); ig.setAttribute('position', new THREE.BufferAttribute(pos, 3)); ig.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); ig.computeBoundingBox();
    const mesh = new THREE.Mesh(ig, mat); mesh.frustumCulled = false; scn.add(mesh);
    const bb = ig.boundingBox, ctr = bb.getCenter(new THREE.Vector3()), vis = new Uint8Array(T + 1);
    for (const pd of PITCHES) for (let yi = 0; yi < YAWS; yi++) for (const jit of JITS){
      const yaw = yi/YAWS*Math.PI*2, pit = pd*Math.PI/180;
      cam.position.set(ctr.x + Math.sin(yaw)*Math.cos(pit)*300, ctr.y + Math.sin(pit)*300, ctr.z + Math.cos(yaw)*Math.cos(pit)*300); cam.lookAt(ctr); cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let q = 0; q < 8; q++){ v.set(q&1?bb.max.x:bb.min.x, q&2?bb.max.y:bb.min.y, q&4?bb.max.z:bb.min.z).applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
      const w = Math.min(4096, Math.ceil((x1 - x0)/P_SZ) + 4), h = Math.min(4096, Math.ceil((y1 - y0)/P_SZ) + 4);
      cam.left = x0 - (2 + jit)*P_SZ; cam.right = cam.left + w*P_SZ; cam.bottom = y0 - (2 + jit)*P_SZ; cam.top = cam.bottom + h*P_SZ; cam.near = -z1 - 1; cam.far = -z0 + 1; cam.updateProjectionMatrix();
      rt.setSize(w, h); renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scn, cam);
      const buf = new Uint8Array(w*h*4); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
      for (let i = 0; i < buf.length; i += 4){ const id = buf[i] | (buf[i+1] << 8) | (buf[i+2] << 16); if (id) vis[id] = 1; }
    }
    scn.remove(mesh); ig.dispose(); renderer.setRenderTarget(null);
    let V = 0, Hn = 0, wasted = 0; for (let t = 0; t < T; t++){ if (vis[t + 1]) V++; if (inH[t]) Hn++; else if (!vis[t + 1]) wasted++; }
    // classes: all, drawn today, visible
    const by = {}; for (let t = 0; t < T; t++){ const k = classOf(pcs[tag[tris[t][0]]]); const b = by[k] || (by[k] = [0, 0, 0]); b[0]++; if (!inH[t]) b[1]++; if (vis[t + 1]) b[2]++;
      const tb = tot[k] || (tot[k] = [0, 0, 0]); tb[0]++; if (!inH[t]) tb[1]++; if (vis[t + 1]) tb[2]++; }
    // merging: visible triangles, same plane and identical attributes on all corners, joined across shared edges
    const pk = vi => Math.round(P[vi*3]*2000) + ',' + Math.round(P[vi*3+1]*2000) + ',' + Math.round(P[vi*3+2]*2000);
    const ak = (vi, fine) => [Cc[vi*3], Cc[vi*3+1], Cc[vi*3+2], E[vi*4], E[vi*4+1], E[vi*4+2], E[vi*4+3], F[vi], O[vi], fine ? Fi[vi] : (Fi[vi] ? 1 : 0)].join(',');
    const mergeWith = fine => {
      const par = new Int32Array(T).map((_, i) => i), find = i => { while (par[i] !== i){ par[i] = par[par[i]]; i = par[i]; } return i; };
      const edge = new Map(), grp = new Array(T); let m = 0;
      for (let t = 0; t < T; t++){ if (!vis[t + 1]) continue; const [a, b, cc] = tris[t]; const k = ak(a, fine); if (k !== ak(b, fine) || k !== ak(cc, fine)) continue;
        const nx = N[a*4]/127, ny = N[a*4+1]/127, nz = N[a*4+2]/127, dd = P[a*3]*nx + P[a*3+1]*ny + P[a*3+2]*nz;
        grp[t] = k + '|' + Math.round(nx*100) + ',' + Math.round(ny*100) + ',' + Math.round(nz*100) + ',' + Math.round(dd*500); m++;
        for (const [p, q] of [[a, b], [b, cc], [cc, a]]){ const k1 = pk(p), k2 = pk(q), ek = (k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1) + '|' + grp[t]; const o = edge.get(ek); if (o === undefined) edge.set(ek, t); else { const x = find(o), y = find(t); if (x !== y) par[x] = y; } } }
      const reg = new Map(); for (let t = 0; t < T; t++){ if (grp[t] === undefined) continue; const r = find(t); reg.set(r, (reg.get(r) || 0) + 1); }
      let after = 0, big = 0; for (const n of reg.values()){ after += Math.min(n, 2); if (n > 2) big++; }
      return { mergeable: m, regions: reg.size, regionsOver2: big, visibleAfter: V - m + after }; };
    const mSame = mergeWith(true), mAny = mergeWith(false);
    results.push({ zone: c.sections[0].zone, height: +(c.height || 0).toFixed(1), tris: T, drawnToday: T - Hn, visibleAnyAngle: V, drawnButNeverVisible: wasted,
      byClass: by, mergeKeepFineIds: mSame, mergeIgnoreFineIds: mAny });
  }
  rt.dispose(); return { results, totals: tot };
}

