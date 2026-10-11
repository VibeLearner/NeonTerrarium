// Page side of tools/procfol/measure_foliage.py: counts only (never time anything in the software renderer).
// Loaded into the harness page with add_script_tag; defines window.__fol. Plain script, uses the game's globals
// (scene, cam, superRegions, FOL_SHADER, FOL_RECT, LOD, LOT, PH, __perf, __step).
window.__fol = (() => {
  const F = {};
  // ---- families (plan item 6): signs are listed apart because they are not foliage
  const GROUND = new Set(['g_clover', 'g_cover', 'g_spread1', 'g_spread2', 'g_moss2', 'moss', 'g_flowers']);
  const FERNBUSH = new Set(['fern', 'g_fern2', 'g_fern3', 'bush', 'bushFlower', 'bonsai', 'bamboo', 'succulent']);
  const HANGING = new Set(['vines', 'pothos', 'w_tangle', 'l_mossroots']);
  F.FAMILIES = ['grass', 'ground cover', 'ferns and bushes', 'hanging greenery', 'laundry', 'signs (not foliage)', 'other'];
  F.family = k => /^(sign_|glyph_|graf_)/.test(k) ? 'signs (not foliage)' : /^gt\d/.test(k) ? 'grass' : GROUND.has(k) ? 'ground cover' : FERNBUSH.has(k) ? 'ferns and bushes'
    : (/^h_/.test(k) || HANGING.has(k)) ? 'hanging greenery' : /^l_/.test(k) ? 'laundry' : 'other';
  // ---- the foliage meshes: one InstancedMesh per super-region (FOL_SHADER)
  F.meshes = () => {
    const out = [], seen = new Set();
    for (const [sk, g] of superRegions) g.traverse(o => { if (o.isInstancedMesh && o.material === FOL_SHADER){ out.push({ o, sk }); seen.add(o); } });
    scene.traverse(o => { if (o.isInstancedMesh && o.material === FOL_SHADER && !seen.has(o)) out.push({ o, sk: '(not in a super-region)' }); });
    return out;
  };
  F.setVisible = v => { for (const { o } of F.meshes()) o.visible = v; return F.meshes().length; };
  // rect -> kind (a kind may have several rects if the atlas holds variants: FOL_RECT[kind] = [x,y,w,h] or a list of those)
  const rectKinds = () => {
    const m = new Map(), dup = [];
    const put = (r, k) => { const key = r[0] + ',' + r[1] + ',' + r[2] + ',' + r[3]; if (m.has(key) && m.get(key) !== k) dup.push(key + ' ' + m.get(key) + '/' + k); m.set(key, k); };
    for (const k in FOL_RECT){ const r = FOL_RECT[k]; if (Array.isArray(r[0])) r.forEach(x => put(x, k)); else put(r, k); }
    return { m, dup };
  };
  const fr = Math.fround, F517 = fr(5.17);
  const fract = x => x - Math.floor(x);
  // The settled state: nothing left to load, build or merge
  F.settled = () => ({ loading: LOADP.on, cool: LOADP.cool, superDirty: superDirty.size, dirtyRegions: dirtyRegions.size,
    inflight: LOADP.inflight ? LOADP.inflight.size : 0, instances: F.meshes().reduce((s, x) => s + x.o.count, 0) });
  // ---- one pass over every instance. opts: { frustum: bool, lod: [values to count thinning for] }
  F.scan = (opts = {}) => {
    const { m: rk, dup } = rectKinds();
    const ms = F.meshes();
    let fr_ = null;
    if (opts.frustum){ cam.updateMatrixWorld(); const pm = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr_ = new THREE.Frustum().setFromProjectionMatrix(pm); }
    const pl = fr_ ? fr_.planes.map(p => [p.normal.x, p.normal.y, p.normal.z, p.constant]) : null;
    const lods = opts.lod || [], lodNow = LOD.plants.value;
    const kinds = {}, regions = {}, plots = {}, unknown = {};
    const kd = k => kinds[k] || (kinds[k] = { family: F.family(k), instances: 0, inView: 0, inViewPoint: 0, thinNow: 0, thinNowInView: 0, thinAt: lods.map(() => 0) });
    const placedSet = {};
    let total = 0;
    for (const { o, sk } of ms){
      const n = o.count, g = o.geometry.attributes;
      if (!g.aRect || !g.aRect.array || !g.aRect.array.length){ throw new Error('geometry arrays are gone (run with window.__KEEP_CPU = true)'); }
      const R = g.aRect.array, V = g.aVar.array, K = g.aKind.array, M = o.instanceMatrix.array, MW = o.matrixWorld.elements;
      const reg = regions[sk] || (regions[sk] = { instances: 0, inView: 0, byFamily: {} });
      let last = '', kobj = null, kname = '';
      for (let i = 0; i < n; i++){
        const rkey = R[i*4] + ',' + R[i*4+1] + ',' + R[i*4+2] + ',' + R[i*4+3];
        if (rkey !== last){ last = rkey; kname = rk.get(rkey); if (!kname){ unknown[rkey] = (unknown[rkey] || 0) + 1; kname = '?' + rkey; } kobj = kd(kname); }
        kobj.instances++; reg.instances++; total++;
        const fam = kobj.family; const rf = reg.byFamily[fam] || (reg.byFamily[fam] = { instances: 0, inView: 0 }); rf.instances++;
        const b = i*16, tx = M[b+12], ty = M[b+13], tz = M[b+14];
        const wx = MW[0]*tx + MW[4]*ty + MW[8]*tz + MW[12], wy = MW[1]*tx + MW[5]*ty + MW[9]*tz + MW[13], wz = MW[2]*tx + MW[6]*ty + MW[10]*tz + MW[14];
        let inV = true, inP = true;
        if (pl){
          const rad = Math.hypot(Math.hypot(M[b], M[b+1], M[b+2]), Math.hypot(M[b+4], M[b+5], M[b+6]));   // quad diagonal (sx, sy): the whole quad, wherever the anchor puts it
          for (let q = 0; q < 6; q++){ const d = pl[q][0]*wx + pl[q][1]*wy + pl[q][2]*wz + pl[q][3]; if (d < -rad) inV = false; if (d < 0) inP = false; }
          if (inV){ kobj.inView++; reg.inView++; rf.inView++; }
          if (inP) kobj.inViewPoint++;
        }
        // the vertex shader's thinning (sprites.js FOL_SHADER): lit signs (aKind.y > 0.5) are never thinned
        if (K[i*2+1] < 0.5){
          const w = R[i*4+2], x = fract(fr(V[i*4+3]*F517)), base = w < 24 ? 0.85 : 0.5;
          if (x < fr(lodNow*base)){ kobj.thinNow++; if (inV) kobj.thinNowInView++; }
          for (let q = 0; q < lods.length; q++) if (x < fr(lods[q]*base)) kobj.thinAt[q]++;
        }
        // plots and distinct placements (a free-standing plant is two instances at one point)
        const pk = Math.round(wx/LOT) + ',' + Math.round(wz/LOT);
        const pp = plots[pk] || (plots[pk] = {}); pp[kname] = (pp[kname] || 0) + 1;
        if (/^gt\d/.test(kname)){ const key = (Math.round(wx*1000)*73856093) ^ (Math.round(wy*1000)*19349663) ^ (Math.round(wz*1000)*83492791); const s = placedSet[pk + '|' + kname] || (placedSet[pk + '|' + kname] = new Set()); s.add(key); }
      }
    }
    // grass per plot: tufts = distinct points (a free-standing tuft is two crossed instances at one point)
    const grassPlots = [];
    for (const pk in plots){ const pp = plots[pk]; let inst = 0, tufts = 0, nk = 0; for (const k in pp) if (/^gt\d/.test(k)){ inst += pp[k]; tufts += placedSet[pk + '|' + k].size; nk++; } if (inst) grassPlots.push({ plot: pk, instances: inst, tufts, kinds: nk }); }
    return { total, kinds, regions, plots, grassPlots, unknownRects: unknown, dupRects: dup, lodNow, lodAt: lods, meshes: ms.length };
  };
  // ---- the frame's triangles (renderer.info, one whole frame): call with the static cache off (PH.tests.noStatic = true)
  F.frame = () => {
    if (__perf.shadowOwed){ shadowDirty = true; __perf.shadowOwed = false; }
    __perf.skip = false;
    renderer.info.reset(); __step(1);
    return { tris: renderer.info.render.triangles, calls: renderer.info.render.calls };
  };
  // Counts do not need pixels: renderer.info counts a draw when three issues it. With the graphics calls that draw turned into no-ops, a
  // whole frame of millions of triangles costs only the page's own work (software rasterizing it took minutes a frame).
  F.noDraw = () => {
    let n = 0;
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) if (C) for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[f]) { C.prototype[f] = function () {}; n++; }
    return n;
  };
  F.view = z => {   // one zoom: settle with whole frames drawn, then report the camera and the render state
    zoom = zoomT = z;
    PH.tests.noStatic = true;
    __perf.skip = true; __step(30); __perf.skip = false;
    if (__perf.shadowOwed){ shadowDirty = true; __perf.shadowOwed = false; }
    __step(3);
    return { zoom: z, lodPlants: LOD.plants.value, renderW: W, renderH: H, yaw, pitch: typeof PITCH !== 'undefined' ? PITCH : null, target: [camT.x, camT.y, camT.z], ortho: !!cam.isOrthographicCamera };
  };
  // Frame triangles with the foliage drawn and hidden. The people and cars move between frames, so a frame's count drifts by a few
  // hundred triangles: shown, hidden, shown, hidden, shown; the foliage's share is its exact drawn count (2 per instance, no culling
  // and no draw skipped) over the mean shown frame, and the hidden-layer difference is reported as a cross-check with the drift.
  F.share = () => {
    const shown = [], hid = [];
    F.setVisible(true); F.frame();
    for (let i = 0; i < 2; i++){ shown.push(F.frame().tris); F.setVisible(false); hid.push(F.frame().tris); F.setVisible(true); }
    shown.push(F.frame().tris);
    const mean = a => a.reduce((s, v) => s + v, 0)/a.length;
    const drawn = F.meshes().reduce((s, x) => s + (x.o.visible ? x.o.count : 0), 0)*2;
    return { frameTris: mean(shown), frameTrisNoFoliage: mean(hid), foliageTrisByDifference: mean(shown) - mean(hid), foliageTrisDrawn: drawn, shownFrames: shown, hiddenFrames: hid };
  };
  return F;
})();
