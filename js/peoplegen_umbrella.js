/* The umbrella: four canopies (round, flat, clear with lit trim, a dark pointed one) in five states each (0 furled and hanging from the hand,
   1 to 3 opening, 4 open), a sprite of its own in the people sheet, drawn as a second instance at the person's hand (see people.js).
   Every umbrella cell is 12 x 16. The shaft is the column UC; the grip is the row ATT[state], which people.js puts at the hand pixel of the
   frame (PG.umbHand). The open canopy sits above the head, over the top of the figure's own cell; it is 12 px wide, centred 3.5 px behind the shaft. */
(() => {
  // (PG: peoplegen.js)
  const IX = PG.IX, UC = 9;
  PG.umbAtt = [8, 9, 11, 12, 13];
  const spans = {   // open canopy, top to bottom, ending in the rim: [x0, x1] per row (rows A-7 .. A-4)
    round: [[4, 7], [2, 9], [1, 10], [0, 11]],
    flat: [[3, 8], [1, 10], [0, 11], [0, 11]],
    clear: [[4, 7], [2, 9], [1, 10], [0, 11]],
    blade: [[5, 6], [3, 8], [1, 10], [0, 11]],
  };
  const look = { round: { fill: IX.ACC, rim: IX.LIT, ferrule: IX.SHOE }, flat: { fill: IX.TOP, rim: IX.ACC, ferrule: IX.SHOE },
                 clear: { fill: 0, rim: IX.LIT, ferrule: IX.WHITE }, blade: { fill: IX.TOP2, rim: IX.LIT, ferrule: IX.LIT } };
  const names = ['round', 'flat', 'clear', 'blade'];
  const draw = (g, kind, f) => {
    if (f > 4) return;
    const A = PG.umbAtt[f], L = look[kind], sp = spans[kind];
    const row = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) g.set(x, y, c); };
    if (f === 0){   // furled, hanging: the handle at the hand, the cloth below it
      g.set(UC, A, IX.SHOE); g.set(UC, A + 1, IX.SHOE);
      for (let y = A + 2; y <= 14; y++){ g.set(UC, y, L.fill || IX.WHITE); g.set(UC + 1, y, kind === 'clear' ? IX.WHITE : kind === 'flat' ? IX.TOP3 : L.fill); }
      g.set(UC, 15, IX.OUT); g.set(UC + 1, A + 2, L.rim);
      g.outline('all', IX.OUT); return;
    }
    // the shaft, and the ferrule below the grip
    for (let y = A - (f === 4 ? 3 : 6); y <= 15; y++) g.set(UC, y, y > A + 0 ? L.ferrule : IX.SHOE);
    if (f === 1){ for (let y = A - 6; y <= A - 2; y++){ g.set(UC - 1, y, L.fill || IX.WHITE); g.set(UC, y, L.fill || IX.WHITE); } g.set(UC - 1, A - 7, L.rim); g.outline('all', IX.OUT); return; }
    let rows;   // [y, x0, x1]
    if (f === 2) rows = [[A - 6, 5, 8], [A - 5, 3, 9], [A - 4, 2, 10]];
    else if (f === 3) rows = [[A - 6, 3, 8], [A - 5, 1, 10], [A - 4, 0, 11]];
    else rows = sp.map((s, k) => [A - 7 + k, s[0], s[1]]);
    rows.forEach(([y, x0, x1], k) => {
      const rim = k === rows.length - 1;
      if (kind === 'clear'){ g.set(x0, y, rim ? L.rim : IX.OUT); g.set(x1, y, rim ? L.rim : IX.OUT); if (rim || k === 0) row(y, x0, x1, rim ? L.rim : IX.OUT); }
      else row(y, x0, x1, rim ? L.rim : (k === 1 && kind !== 'flat' ? IX.TOP3 : L.fill));
    });
    if (kind === 'clear' && f === 4){ g.set(4, A - 6, IX.WHITE); g.set(6, A - 5, IX.WHITE); }
    if (kind === 'blade' && f === 4) g.set(5, A - 8, IX.OUT);
    g.outline('all', IX.OUT);
  };
  PG.umbBase = PG.shapes.length;
  names.forEach(n => PG.addShape({ name: 'umbrella ' + n, body: { H: 14, bw: 4 }, custom: (g, f) => draw(g, n, f) }));
  PG.umbShape = v => PG.umbBase + (v & 3);
  const cache = [];
  // the near hand of frame f in the figure's cell (a typical body): [dx from the umbrella's shaft column, row]
  PG.umbHand = f => cache[f] || (cache[f] = (() => { const k = PG.skeleton({ H: 14, bw: 4 }, PG.poses[f]); return [Math.round(k.nearHand[0]) - UC, Math.round(k.nearHand[1])]; })());
})();
