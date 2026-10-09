() => {
  // exact duplicates: triangles in a piece's drawn lists (A and S) that have the same three corners (to 1e-5), the same facing and the same attributes as another one. Counted per piece over a sample of pieces.
  const every = (window.__D || {}).every || 10, q = v => Math.round(v*1e5);
  let pieces = 0, tris = 0, dup = 0, dupHidden = 0, inverseTwin = 0; const byShape = {};
  let i = 0;
  for (const c of cells.values()){
    if (!c.data) continue; const g = c.data.geo.get(ATLAS); if (!g || !g.userData.cut) continue; if (i++ % every) continue;
    const u = g.userData.cut, I = g.index.array, P = g.attributes.position.array, Cc = g.attributes.color.array, E = g.attributes.aEm.array, n = u.A + u.H + u.S;
    const seen = new Map(), twin = new Map(); pieces++;
    for (let k = 0; k < n; k += 3){
      const h = k >= u.A && k < u.A + u.H; if (h) continue; tris++;
      const a = I[k], b = I[k + 1], d = I[k + 2], pts = [a, b, d].map(v => [q(P[v*3]), q(P[v*3 + 1]), q(P[v*3 + 2])].join(','));
      const attr = [Cc[a*3], Cc[a*3 + 1], Cc[a*3 + 2], E[a*4], E[a*4 + 1], E[a*4 + 2], E[a*4 + 3]].join(',');
      // facing: the cyclic order of the corners matters: the same triangle wound the other way is a different face (a back face)
      const m = pts.indexOf([...pts].sort()[0]); const cyc = [pts[m], pts[(m + 1)%3], pts[(m + 2)%3]].join('|'), flip = [pts[m], pts[(m + 2)%3], pts[(m + 1)%3]].join('|');
      if (seen.has(cyc + '#' + attr)) dup++; else seen.set(cyc + '#' + attr, 1);
      if (twin.has(flip)) inverseTwin++; twin.set(cyc, 1);
    }
  }
  return { pieces, drawnTriangles: tris, exactDuplicates: dup, pctDup: +(100*dup/tris).toFixed(2), backToBackPairs: inverseTwin, pctBackToBack: +(100*inverseTwin/tris).toFixed(2) };
}
