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
    // ---- examples: drawn triangles never seen, shown in place (red) on the plot in grey, from the allowed view that faces them best ----
    { const cand = []; for (let t = 0; t < T; t++) if (!inH[t] && !vis[t + 1]) cand.push(t);
      const want = (window.__GP || {}).examples || 0; window.__EX = window.__EX || [];
      const per = Math.min(cand.length, Math.ceil(want/Math.max(1, (window.__EXPLOTS || 20))));
      for (let q = 0; q < per && window.__EX.length < want; q++){
        const t = cand[Math.floor((q + .5)*cand.length/per)], tg = pcs[tag[tris[t][0]]];
        const a = new THREE.Vector3().fromArray(pos, t*9), b = new THREE.Vector3().fromArray(pos, t*9 + 3), d = new THREE.Vector3().fromArray(pos, t*9 + 6);
        const n = new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize(), cen = a.clone().add(b).add(d).divideScalar(3);
        const hn = Math.hypot(n.x, n.z), yaw = Math.atan2(n.x, n.z), pit = Math.min(82, Math.max(12, Math.atan2(n.y, hn)*180/Math.PI))*Math.PI/180;
        const dir = new THREE.Vector3(Math.sin(yaw)*Math.cos(pit), Math.sin(pit), Math.cos(yaw)*Math.cos(pit));
        const R = (window.__GP || {}).exR || .4, SZ = 160, c3 = new THREE.OrthographicCamera(-R, R, R, -R, .1, 1000); c3.position.copy(cen).addScaledVector(dir, 100); c3.lookAt(cen); c3.updateMatrixWorld();
        // what is in front of it: the id at the middle of the same view (the id mesh, a small window)
        const r3 = new THREE.WebGLRenderTarget(9, 9, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat }), c4 = new THREE.OrthographicCamera(-.004, .004, .004, -.004, .1, 1000);
        c4.position.copy(c3.position); c4.quaternion.copy(c3.quaternion); c4.updateMatrixWorld(); renderer.setRenderTarget(r3); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(scn, c4);
        const ib = new Uint8Array(9*9*4); renderer.readRenderTargetPixels(r3, 0, 0, 9, 9, ib); renderer.setRenderTarget(null); r3.dispose();
        const o4 = (4*9 + 4)*4, hid = (ib[o4] | (ib[o4 + 1] << 8) | (ib[o4 + 2] << 16)) - 1; let hider = null; var hidIdx = hid;
        if (hid >= 0 && hid < T){ const ha = new THREE.Vector3().fromArray(pos, hid*9), hb = new THREE.Vector3().fromArray(pos, hid*9 + 3), hc = new THREE.Vector3().fromArray(pos, hid*9 + 6), hn = new THREE.Vector3().crossVectors(hb.clone().sub(ha), hc.clone().sub(ha)).normalize();
          hider = { cls: classOf(pcs[tag[tris[hid][0]]]), parallelDot: +hn.dot(n).toFixed(2), gapAlongView: +(cen.clone().sub(ha).dot(hn)/Math.max(1e-6, Math.abs(hn.dot(dir)))*Math.sign(hn.dot(dir))).toFixed(3), inH: inH[hid] }; }
        window.__HID = window.__HID || {}; { const hk = hider ? (hider.cls.split(' (')[0] + (Math.abs(hider.parallelDot) > .99 ? (hider.parallelDot > 0 ? ', parallel same way' : ', parallel opposite') : ', not parallel')) : 'nothing found'; window.__HID[hk] = (window.__HID[hk] || 0) + 1; }
        window.__HIDX = window.__HIDX || []; if (window.__HIDX.length < 40) window.__HIDX.push(hider);
        let pb = new Uint8Array(SZ*SZ*4);
        if (!(window.__GP || {}).noCrop){
        // grey shading by face normal, the chosen triangle red
        const c2 = new Uint8Array(T*9); for (let u = 0; u < T; u++){ const p0 = new THREE.Vector3().fromArray(pos, u*9), p1 = new THREE.Vector3().fromArray(pos, u*9 + 3), p2 = new THREE.Vector3().fromArray(pos, u*9 + 6);
          const nn = new THREE.Vector3().crossVectors(p1.sub(p0), p2.sub(p0)).normalize(), sh = 90 + 120*Math.max(0, nn.dot(new THREE.Vector3(.4, .8, .45).normalize()));
          const isH = u === hidIdx; for (let k = 0; k < 3; k++){ c2[u*9 + k*3] = isH ? 40 : sh; c2[u*9 + k*3 + 1] = isH ? 90 : sh; c2[u*9 + k*3 + 2] = isH ? 255 : sh; } }
        const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g2.setAttribute('color', new THREE.BufferAttribute(c2, 3, true));
        const m2 = new THREE.Mesh(g2, mat); m2.frustumCulled = false; const s2 = new THREE.Scene(); s2.add(m2);
        // (the triangle's own face is front-facing from here: so what covers it is in front of it, in grey)
        const r2 = new THREE.WebGLRenderTarget(SZ, SZ); renderer.setRenderTarget(r2); renderer.setClearColor(0x203040, 1); renderer.clear(); renderer.render(s2, c3);
          { const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.BufferAttribute(pos.slice(t*9, t*9 + 9), 3));
            const om = new THREE.MeshBasicMaterial({ color: 0xff2020, depthTest: false, transparent: true, opacity: .55, side: THREE.DoubleSide }), lm = new THREE.LineLoop(og, new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false }));
            const so = new THREE.Scene(); const mo = new THREE.Mesh(og, om); mo.frustumCulled = false; lm.frustumCulled = false; so.add(mo); so.add(lm); renderer.autoClear = false; renderer.render(so, c3); renderer.autoClear = true; og.dispose(); }
        renderer.readRenderTargetPixels(r2, 0, 0, SZ, SZ, pb); renderer.setRenderTarget(null); r2.dispose(); g2.dispose();
        }
        let red = 0; for (let i = 0; i < pb.length; i += 4) if (pb[i] > 200 && pb[i + 1] < 40) red++;
        window.__EX.push({ hider: window.__HIDX[window.__HIDX.length - 1], zone: c.sections[0].zone, cls: classOf(tg), shape: tg && tg[2], dims: tg && tg[3].map(v => +v.toFixed(3)), glow: tg && tg[4], normal: n.toArray().map(v => +v.toFixed(2)), at: cen.toArray().map(v => +v.toFixed(2)), area: +(new THREE.Triangle(a, b, d).getArea()).toFixed(5), redPixelsInBestView: red, yawDeg: +(yaw*180/Math.PI).toFixed(0), pitchDeg: +(pit*180/Math.PI).toFixed(0), px: (window.__GP || {}).noCrop ? null : Array.from(pb) });
      } }
    scn.remove(mesh); ig.dispose(); renderer.setRenderTarget(null);
    // by the triangle's longest edge (world units): drawn today, and never seen. SMALL_E (the size classes of W2a) drops the smaller ones at a distance.
    window.__BINS = window.__BINS || {}; { const edges = [.0125, .025, .05, .1, .2, .4, 1e9]; for (let t = 0; t < T; t++){ if (inH[t]) continue;
        const a = new THREE.Vector3().fromArray(pos, t*9), b = new THREE.Vector3().fromArray(pos, t*9 + 3), d = new THREE.Vector3().fromArray(pos, t*9 + 6), L = Math.max(a.distanceTo(b), b.distanceTo(d), d.distanceTo(a));
        let k = 0; while (L >= edges[k]) k++; const key = k === 0 ? '<.0125' : k === 7 ? '>=.4' : '.' + String(edges[k - 1]).slice(2) + ' to ' + edges[k]; const e = window.__BINS[key] || (window.__BINS[key] = [0, 0]); e[0]++; if (!vis[t + 1]) e[1]++; } }
    // why: of the drawn triangles never seen, how many lie in the same plane as a drawn triangle facing the same way that holds their middle (a tie in depth: whichever is drawn last wins, and the probe's order isn't the game's)
    { window.__WHY = window.__WHY || { never: 0, coplanarTie: 0, coplanarTieSameColor: 0, byClass: {} };
      const cen = [], nor = []; for (let t = 0; t < T; t++){ const a = new THREE.Vector3().fromArray(pos, t*9), b = new THREE.Vector3().fromArray(pos, t*9 + 3), d = new THREE.Vector3().fromArray(pos, t*9 + 6);
        cen.push(a.clone().add(b).add(d).divideScalar(3)); nor.push(new THREE.Vector3().crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize()); }
      const grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z; for (let t = 0; t < T; t++){ if (inH[t]) continue; const k = key(Math.floor(cen[t].x*2), Math.floor(cen[t].y*2), Math.floor(cen[t].z*2)); (grid.get(k) || grid.set(k, []).get(k)).push(t); }
      const inside = (u, p) => { const a = new THREE.Vector3().fromArray(pos, u*9), b = new THREE.Vector3().fromArray(pos, u*9 + 3), d = new THREE.Vector3().fromArray(pos, u*9 + 6), n = nor[u];
        const s1 = new THREE.Vector3().crossVectors(b.clone().sub(a), p.clone().sub(a)).dot(n), s2 = new THREE.Vector3().crossVectors(d.clone().sub(b), p.clone().sub(b)).dot(n), s3 = new THREE.Vector3().crossVectors(a.clone().sub(d), p.clone().sub(d)).dot(n); return s1 > -1e-6 && s2 > -1e-6 && s3 > -1e-6; };
      for (let t = 0; t < T; t++){ if (inH[t] || vis[t + 1]) continue; const W = window.__WHY; W.never++; const cl = classOf(pcs[tag[tris[t][0]]]); const e = W.byClass[cl] || (W.byClass[cl] = [0, 0]); e[0]++;
        const cx = Math.floor(cen[t].x*2), cy = Math.floor(cen[t].y*2), cz = Math.floor(cen[t].z*2); let tie = false;
        for (let dx = -1; dx <= 1 && !tie; dx++) for (let dy = -1; dy <= 1 && !tie; dy++) for (let dz = -1; dz <= 1 && !tie; dz++){ const l = grid.get(key(cx + dx, cy + dy, cz + dz)); if (!l) continue;
          for (const u of l){ if (u === t || nor[u].dot(nor[t]) < .9999 || Math.abs(nor[t].dot(cen[u].clone().sub(cen[t]))) > 2e-4) continue; if (inside(u, cen[t])){ tie = true; break; } } }
        if (tie){ W.coplanarTie++; e[1]++; } } }
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
  rt.dispose(); return { results, totals: tot, examples: window.__EX || [], bins: window.__BINS, why: window.__WHY, hiders: window.__HID };
}

