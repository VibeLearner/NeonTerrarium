async () => { __perf.skip = true; for (let g = 0; g < 100; g++) __step(1);
  const c = cells.get(ckey(5, 4)); const info = bkProto(c); const at = c.baked.at; const out = { W: at.W, H: at.H, faces: c.baked.sh.faces.length, boxes: c.baked.sh.boxes.map(b => b.b.map(v => +v.toFixed(2))) };
  for (let p = 0; p < 3; p++){ const buf = new Uint8Array(at.W*at.H*4); renderer.readRenderTargetPixels(at.rts[p], 0, 0, at.W, at.H, buf); out['p'+p] = (() => { let t = ''; for (let q = 0; q < buf.length; q += 8192) t += String.fromCharCode.apply(null, buf.subarray(q, q + 8192)); return btoa(t); })(); }
  return out; }
