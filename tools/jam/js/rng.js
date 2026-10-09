// Neon Terrarium jam room: seeded random numbers.
// Everything the composer decides comes from these, so a seed always plays the same piece.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};

  // 32-bit string hash (xmur3-style), returns an unsigned int.
  J.hash = function (str) {
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  };

  // mulberry32
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A named random stream: rng(seed, 'drums', 3) always gives the same sequence.
  J.rng = function (...parts) {
    const f = mulberry32(J.hash(parts.join('|')));
    const r = {
      next: f,
      range: (a, b) => a + (b - a) * f(),
      int: (a, b) => a + Math.floor(f() * (b - a + 1)),          // inclusive
      pick: arr => arr[Math.floor(f() * arr.length)],
      chance: p => f() < p,
      shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
      weighted: (items, wfn) => {                                  // pick from items using a weight function
        let tot = 0; const ws = items.map(it => { const w = Math.max(0, wfn(it)); tot += w; return w; });
        if (tot <= 0) return items[Math.floor(f() * items.length)];
        let x = f() * tot;
        for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; }
        return items[items.length - 1];
      },
      gauss: () => { let u = 0, v = 0; while (u === 0) u = f(); while (v === 0) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
    };
    return r;
  };

  // One fixed random number for a context. Used as a "gate": a feature is on when u(ctx) < slider-derived level,
  // so moving a slider adds or removes features smoothly instead of reshuffling the whole piece.
  J.u = function (...parts) { return mulberry32(J.hash(parts.join('|')))(); };

  J.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  J.lerp = (a, b, t) => a + (b - a) * t;
})(typeof window !== 'undefined' ? window : globalThis);
