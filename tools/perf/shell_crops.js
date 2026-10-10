// In-page half of tools/perf/shell_crops.py: draws one plot's real geometry, the shell's boxes and the triangles kept as real geometry, on a canvas of its own
// (a second renderer, flat shading, orthographic): the game's own frame is not touched. Needs shell_probe.js (__sp) and js/shell.js.
window.__sc = (() => {
  const S = {};
  let R = null;
  S.renderer = size => { if (!R){ R = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), antialias: true, preserveDrawingBuffer: true }); R.setPixelRatio(1); } R.setSize(size, size, false); return R; };
  const geoOf = (p, idx, list) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (list){ const ix = new Uint32Array(list.length*3); for (let k = 0; k < list.length; k++){ ix[k*3] = idx[list[k]*3]; ix[k*3 + 1] = idx[list[k]*3 + 1]; ix[k*3 + 2] = idx[list[k]*3 + 2]; } g.setIndex(new THREE.BufferAttribute(ix, 1)); }
    else g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); return g;
  };
  // mode: 'real' (all grey, kept ones orange, boxes as red wire), 'shell' (boxes solid, kept ones orange), 'both' (real faint + boxes)
  S.draw = (rec, mode, yaw, pitch, size) => {
    const r = S.renderer(size), sc = new THREE.Scene(); sc.background = new THREE.Color(0x1b1f27);
    const p = Float32Array.from(rec.p), idx = Uint32Array.from(rec.i), keep = rec.keep, boxes = rec.boxes;
    const nT = idx.length/3, isKept = new Uint8Array(nT); for (const t of keep) isKept[t] = 1;
    const rest = [], kp = keep; for (let t = 0; t < nT; t++) if (!isKept[t]) rest.push(t);
    const flat = (color, opacity) => new THREE.ShaderMaterial({ uniforms: { col: { value: new THREE.Color(color) }, op: { value: opacity } }, transparent: opacity < 1, depthWrite: opacity >= 1, side: THREE.DoubleSide, extensions: { derivatives: true },
      vertexShader: 'varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vP = mv.xyz; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 col; uniform float op; varying vec3 vP; void main(){ vec3 n = normalize(cross(dFdx(vP), dFdy(vP))); float l = .42 + .58*max(dot(n, normalize(vec3(-.35,.8,.5))), 0.) ; gl_FragColor = vec4(col*l, op); }' });
    const grey = flat(0xb8c0cc, 1), org = flat(0xff8a2a, 1);
    if (mode === 'real' || mode === 'both'){
      if (mode === 'both'){ sc.add(new THREE.Mesh(geoOf(p, idx, rest), flat(0xb8c0cc, .45))); }
      else sc.add(new THREE.Mesh(geoOf(p, idx, rest), grey));
    }
    if (kp.length) sc.add(new THREE.Mesh(geoOf(p, idx, kp), org));
    const faceMat = mode === 'both' ? flat(0x4f9dff, .3) : flat(0x9fb4d0, 1);
    for (const b of boxes){
      const bg = new THREE.BoxGeometry(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0), m = new THREE.Mesh(bg, faceMat); m.visible = mode !== 'real'; m.position.set((b.x0 + b.x1)/2, (b.y0 + b.y1)/2, (b.z0 + b.z1)/2); sc.add(m);
      if (mode !== 'shell'){ const e = new THREE.LineSegments(new THREE.EdgesGeometry(bg), new THREE.LineBasicMaterial({ color: 0xff3030 })); e.position.copy(m.position); sc.add(e); }
    }
    // fit
    const bb = new THREE.Box3(); for (let k = 0; k < p.length; k += 3) bb.expandByPoint(new THREE.Vector3(p[k], p[k + 1], p[k + 2]));
    for (const b of boxes){ bb.expandByPoint(new THREE.Vector3(b.x0, b.y0, b.z0)); bb.expandByPoint(new THREE.Vector3(b.x1, b.y1, b.z1)); }
    const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), rad = Math.max(sz.x, sz.z, sz.y*.9, 4)*.62;
    const cam = new THREE.OrthographicCamera(-rad, rad, rad, -rad, .1, 400);
    const d = 60, cp = Math.cos(pitch), x = c.x + Math.sin(yaw)*cp*d, z = c.z + Math.cos(yaw)*cp*d, y = c.y + Math.sin(pitch)*d;
    cam.position.set(x, y, z); cam.lookAt(c); cam.updateMatrixWorld();
    R.render(sc, cam); const url = R.domElement.toDataURL('image/png');
    sc.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    return url;
  };
  // the data one plot needs: its triangles, boxes, the kept list
  S.rec = (it, seed, opts) => {
    const c = cells.get(ckey(it.i, it.j)); if (it.air) window.AIR_FORCE = it.i + ',' + it.j;
    const sc = __sp.make(c, seed + it.i*7 + it.j*13, it.over); window.AIR_FORCE = undefined;
    const { parts } = __sp.partsOf(sc.data), pt = parts[0];
    const res = Shell.build([pt], opts);
    const rec = { p: Array.from(pt.p), i: Array.from(pt.i), boxes: res.boxes, keep: Array.from(res.keep[0]), stats: res.stats, builders: __sp.builders() };
    for (const g of sc.data.geo.values()) g.dispose(); if (sc.data.sgeo) sc.data.sgeo.dispose();
    return rec;
  };
  S.megaRec = (m, opts) => { const { parts } = __sp.partsOf(m.data), pt = parts[0], res = Shell.build([pt], opts); return { p: Array.from(pt.p), i: Array.from(pt.i), boxes: res.boxes, keep: Array.from(res.keep[0]), stats: res.stats }; };
  return S;
})();
