// Neon Terrarium: the Booth's "from your song". A player loads a song; the Booth listens to it and gives back
//  - a carrier pattern: the song's tempo, key and a chord for every bar, and the 4 or 8 bars it repeats most;
//  - a sampler: a few clean held notes found in the song (drums stripped), each looped so it can be held, so the pads play
//    the song's own sound at their own pitches (the nearest sample to each pad, as multi-sampled instruments do);
//  - chops: each bar of that section cut into beat-long slices (drums stripped), the song's real chords to play as stabs.
// Everything runs here, on the player's machine; nothing is sent anywhere. The samples are kept in IndexedDB
// ('neonIsland.boothSongs'), by the song, so a saved loop can find them again.
// How (plain signal math, no models): tempo from the pulse of the loudness; pitch classes from a bank of Goertzel filters
// (a chromagram) with the bass on its own; the key from the whole song's profile against major and minor profiles
// (Krumhansl); chords from the key's seven, best fit per beat and per bar; held notes from a YIN pitch tracker; drums
// stripped by harmonic/percussive separation (median filters across time and across frequency of a spectrogram).
'use strict';
const BOOTHSONG = (() => {
  const Q = {};
  const SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], FL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const later = () => new Promise(r => setTimeout(r, 0));
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  // ---------- small tools ----------
  function mono(buf){ const a = buf.getChannelData(0), b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null, n = a.length, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = b ? (a[i] + b[i])*.5 : a[i]; return x; }
  function down(x, f){ const n = Math.floor(x.length/f), y = new Float32Array(n); for (let i = 0; i < n; i++){ let s = 0; for (let j = 0; j < f; j++) s += x[i*f + j]; y[i] = s/f; } return y; }
  function biquad(x, sr, type, fc, q = .707){   // (RBJ cookbook, run once over an array)
    const w = 2*Math.PI*fc/sr, c = Math.cos(w), s = Math.sin(w), al = s/(2*q); let b0, b1, b2;
    if (type === 'hp'){ b0 = (1 + c)/2; b1 = -(1 + c); b2 = (1 + c)/2; } else { b0 = (1 - c)/2; b1 = 1 - c; b2 = (1 - c)/2; }
    const a0 = 1 + al, a1 = -2*c, a2 = 1 - al, y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++){ const v = (b0*x[i] + b1*x1 + b2*x2 - a1*y1 - a2*y2)/a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y;
  }
  function fft(re, im){   // in place, radix 2
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++){ let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j){ let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1){ const ang = -2*Math.PI/len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len){ let cr = 1, ci = 0; for (let k = 0; k < len/2; k++){ const a = i + k, b = a + len/2, tr = re[b]*cr - im[b]*ci, ti = re[b]*ci + im[b]*cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = nr; } } }
  }
  const med = (arr, tmp) => { for (let i = 0; i < arr.length; i++) tmp[i] = arr[i]; tmp.sort(); return tmp[tmp.length >> 1]; };

  // ---------- drums out: harmonic/percussive separation of a stretch of sound ----------
  // A drum hit is a short burst across all frequencies (a vertical line in the spectrogram); a held note is a long line
  // across time. Median filtering along time keeps the long lines, along frequency keeps the bursts; a soft mask from the
  // two keeps the held part.
  function hpss(sig, sr, f0){
    const N = 2048, H = 512, K = 17, nb = N/2 + 1, win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = .5 - .5*Math.cos(2*Math.PI*i/N);
    const pad = new Float32Array(sig.length + 2*N); pad.set(sig, N);
    const F = Math.floor((pad.length - N)/H) + 1, RE = [], IM = [], MG = [];
    for (let f = 0; f < F; f++){ const re = new Float32Array(N), im = new Float32Array(N); for (let i = 0; i < N; i++) re[i] = pad[f*H + i]*win[i]; fft(re, im);
      const mg = new Float32Array(nb); for (let k = 0; k < nb; k++) mg[k] = Math.hypot(re[k], im[k]); RE.push(re); IM.push(im); MG.push(mg); }
    const out = new Float32Array(pad.length), wsum = new Float32Array(pad.length), col = new Float32Array(K), tmp = new Float32Array(K);
    for (let f = 0; f < F; f++){
      const re = RE[f], im = IM[f], mask = new Float32Array(nb);
      for (let k = 0; k < nb; k++){
        for (let q = 0; q < K; q++){ const ff = Math.min(F - 1, Math.max(0, f + q - (K >> 1))); col[q] = MG[ff][k]; } const hh = med(col, tmp);
        for (let q = 0; q < K; q++){ const kk = Math.min(nb - 1, Math.max(0, k + q - (K >> 1))); col[q] = MG[f][kk]; } const pp = med(col, tmp);
        mask[k] = hh*hh/(hh*hh + pp*pp + 1e-12);
        if (f0){ const fq = k*sr/N, h = Math.round(fq/f0); const d = h >= 1 && h <= 18 ? Math.abs(fq - h*f0) : 1e9, wd = Math.max(1.6*sr/N, h*f0*.015); mask[k] *= Math.exp(-(d*d)/(wd*wd)); }   // (only the note's own harmonics)
      }
      for (let k = 0; k < nb; k++){ re[k] *= mask[k]; im[k] *= mask[k]; if (k > 0 && k < N/2){ re[N - k] = re[k]; im[N - k] = -im[k]; } }
      for (let i = 0; i < N; i++) im[i] = -im[i]; fft(re, im);   // (inverse: conjugate, forward, conjugate, scale)
      for (let i = 0; i < N; i++){ out[f*H + i] += re[i]/N*win[i]; wsum[f*H + i] += win[i]*win[i]; }
    }
    const y = new Float32Array(sig.length); for (let i = 0; i < y.length; i++){ const w = wsum[i + N]; y[i] = w > 1e-6 ? out[i + N]/w : 0; } return y;
  }

  // ---------- the pulse ----------
  function tempo(x, sr){
    // onsets: the rise in loudness in three bands (lows, middle, highs) added up, so a kick, a strum and a hat all count
    const hop = Math.max(64, Math.round(sr/86)), x9 = x.subarray(0, Math.min(x.length, Math.floor(sr*90))), n = Math.floor(x9.length/hop), fps = sr/hop, on = new Float32Array(n);
    const lo9 = biquad(x9, sr, 'lp', 160), hi9 = biquad(x9, sr, 'hp', 3000), mid9 = biquad(biquad(x9, sr, 'hp', 160), sr, 'lp', 3000);
    for (const band of [lo9, mid9, hi9]){
      let prev = 0; const env = new Float32Array(n);
      for (let i = 0; i < n; i++){ let s = 0; for (let j = i*hop, e = j + hop; j < e; j++) s += band[j]*band[j]; env[i] = Math.log(1 + 1000*Math.sqrt(s/hop)); }
      let mx = 0; for (let i = 1; i < n; i++){ const d = Math.max(0, env[i] - env[i - 1]); mx = Math.max(mx, d); }
      for (let i = 1; i < n; i++) on[i] += Math.max(0, env[i] - env[i - 1])/(mx || 1);
    }
    const m = new Float32Array(n); let acc = 0; for (let i = 0; i < n; i++){ acc += on[i]; if (i >= 16) acc -= on[i - 16]; m[i] = acc/Math.min(i + 1, 16); }
    for (let i = 0; i < n; i++) on[i] = Math.max(0, on[i] - m[i]);
    let best = 0, bl = 0; const lo = Math.floor(fps*60/190), hi = Math.ceil(fps*60/34), sc = [];
    for (let lag = lo; lag <= hi; lag++){ let r = 0; for (let i = 0; i + lag < n; i++) r += on[i]*on[i + lag]; const bpm = 60*fps/lag, w = Math.exp(-.5*Math.pow(Math.log2(bpm/105)/.9, 2)); sc[lag] = r; if (r*w > best){ best = r*w; bl = lag; } }
    let lag = bl; const s0 = sc[lag - 1] || 0, s1 = sc[lag], s2 = sc[lag + 1] || 0, den = s0 - 2*s1 + s2; if (den < 0) lag += .5*(s0 - s2)/den;
    let bpm = 60*fps/lag; const L2 = Math.round(bl*2); if (bpm > 135 && sc[L2] > .55*sc[bl]) bpm /= 2;
    while (bpm < 60) bpm *= 2; while (bpm > 150) bpm /= 2;
    const per = fps*60/bpm; let bp = 0, bs = -1;
    for (let p = 0; p < per; p++){ let s = 0; for (let q = p; q < n; q += per) s += on[Math.round(q)] || 0; if (s > bs){ bs = s; bp = p; } }
    return { bpm, phase: bp/fps };
  }

  // ---------- pitch classes over time ----------
  async function chroma(x, sr, prog){
    const N = 4096, hop = 2048, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5*Math.cos(2*Math.PI*i/(N - 1));
    const P = []; for (let m = 31; m <= 88; m++){ const fr = 440*Math.pow(2, (m - 69)/12); P.push({ pc: m % 12, c: 2*Math.cos(2*Math.PI*fr/sr), w: m < 52 ? .6 : 1, low: m < 55 }); }
    const total = Math.floor((x.length - N)/hop), out = [], b = new Float32Array(N);
    for (let fi = 0; fi < total; fi++){
      const st = fi*hop; for (let i = 0; i < N; i++) b[i] = x[st + i]*win[i];
      const ch = new Float32Array(12), bass = new Float32Array(12); let en = 0;
      for (const p of P){ let s0 = 0, s1 = 0, s2 = 0; const c = p.c; for (let i = 0; i < N; i++){ s0 = b[i] + c*s1 - s2; s2 = s1; s1 = s0; } const a = Math.sqrt(Math.max(0, s1*s1 + s2*s2 - c*s1*s2)); ch[p.pc] += a*p.w; if (p.low) bass[p.pc] += a; en += a; }
      out.push({ t: (st + N/2)/sr, ch, bass, en });
      if (fi % 40 === 39){ prog(fi/total); await later(); }
    }
    return out;
  }
  function keyOf(frames){
    const tot = new Float32Array(12); for (const f of frames){ const m = Math.max(...f.ch) || 1; for (let i = 0; i < 12; i++) tot[i] += f.ch[i]/m; }
    const corr = (prof, r) => { let mx = 0, mp = 0; for (let i = 0; i < 12; i++){ mx += tot[(i + r) % 12]; mp += prof[i]; } mx /= 12; mp /= 12; let a = 0, b = 0, c = 0; for (let i = 0; i < 12; i++){ const dx = tot[(i + r) % 12] - mx, dy = prof[i] - mp; a += dx*dy; b += dx*dx; c += dy*dy; } return a/Math.sqrt(b*c); };
    let best = -2, key = { root: 0, q: 'major' }; for (let r = 0; r < 12; r++) for (const [q, p] of [['major', MAJ], ['minor', MIN]]){ const c = corr(p, r); if (c > best){ best = c; key = { root: r, q }; } }
    key.flats = (key.q === 'major' ? [5, 10, 3, 8, 1] : [2, 7, 0, 5, 10]).includes(key.root); return key;
  }
  // the key's seven chords, each as the Booth wants a chord: a voicing (notes, low to high) and its sweet extra tones (motif)
  function keyChords(key){
    const NM = key.flats ? FL : SH, sc = SCALES[key.q].map(i => (i + key.root) % 12), name = (pc, oct) => NM[pc] + oct;
    const place = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12, nm = m => NM[m % 12] + (Math.floor(m/12) - 1);
    const out = [];
    for (let d = 0; d < 7; d++){
      const r = sc[d], t = sc[(d + 2) % 7], f = sc[(d + 4) % 7], sv = sc[(d + 6) % 7], third = (t - r + 12) % 12, fifth = (f - r + 12) % 12;
      const minor = third === 3, dim = minor && fifth === 6, seventhOk = !dim;
      const tones = seventhOk ? [r, t, f, sv] : [r, t, f];
      const tension = [sc[(d + 1) % 7], minor ? sc[(d + 3) % 7] : null].filter(x => x !== null && !tones.some(c => (x - c + 12) % 12 === 1));
      const r2 = place(r, 36), notes = [r2, dim ? place(f, 40) : r2 + 7, place(t, 52), seventhOk ? place(sv, 57) : null, place(f, 62)].filter(v => v !== null).map(nm);
      const motif = tension.map(x => nm(place(x, 67)));
      const sfx = dim ? 'dim' : minor ? (seventhOk ? 'm7' : 'm') : ((sv - r + 12) % 12 === 11 ? 'maj7' : (sv - r + 12) % 12 === 10 ? '7' : '');
      out.push({ name: NM[r] + sfx, notes, motif, root: r, tones: [r, t, f], seventh: seventhOk ? sv : null, deg: d });
    }
    return out;
  }
  // a chord for every beat, then for every bar (the downbeat is put where the chords change most often)
  function bars(frames, key, bpm, phase, dur){
    const cs = keyChords(key), bs = 60/bpm, beats = [];
    const score = (c, ch, bass) => c.tones.reduce((s, pc, i) => s + ch[pc]*(i === 0 ? 1.15 : 1), 0) + (c.seventh !== null ? ch[c.seventh]*.35 : 0) + bass[c.root]*1.2;
    let fi = 0;
    for (let t0 = phase; t0 + bs <= dur; t0 += bs){
      const ch = new Float32Array(12), bass = new Float32Array(12); let n = 0;
      while (fi < frames.length && frames[fi].t < t0) fi++;
      for (let k = fi; k < frames.length && frames[k].t < t0 + bs; k++){ const f = frames[k], m = Math.max(...f.ch) || 1, mb = Math.max(...f.bass) || 1; for (let i = 0; i < 12; i++){ ch[i] += f.ch[i]/m; bass[i] += f.bass[i]/mb; } n++; }
      beats.push(cs.map(c => n ? score(c, ch, bass) : 0));
    }
    const pick = arr => arr.indexOf(Math.max(...arr));
    let bestO = 0, bestN = -1; for (let o = 0; o < 4; o++){ let n = 0; for (let b = 1; b < beats.length; b++) if ((b - o) % 4 === 0 && pick(beats[b]) !== pick(beats[b - 1])) n++; if (n > bestN){ bestN = n; bestO = o; } }
    const out = []; let prev = 0;
    for (let b = bestO; b + 4 <= beats.length; b += 4){ const sum = cs.map((_, c) => beats[b][c] + beats[b + 1][c] + beats[b + 2][c] + beats[b + 3][c]); let p = pick(sum); if (sum[p] <= 0) p = prev; out.push(p); prev = p; }
    return { cs, list: out, t0: phase + bestO*bs };
  }
  // the 8 (or 4) bars the song repeats most, with at least two different chords in them
  function section(list){
    for (const len of [8, 4]){
      let best = -1, bs = 0;
      for (let s = 0; s + len <= list.length; s++){
        const seq = list.slice(s, s + len); if (new Set(seq).size < 2) continue;
        let n = 0; for (let t = 0; t + len <= list.length; t++){ let ok = true; for (let k = 0; k < len; k++) if (list[t + k] !== seq[k]){ ok = false; break; } if (ok){ n++; t += len - 1; } }
        const sc = n*10 - (s < 4 ? 1 : 0); if (sc > best){ best = sc; bs = s; }
      }
      if (best >= 20 || (len === 4 && best >= 0)) return { start: bs, len };
    }
    return { start: 0, len: Math.min(8, Math.max(4, list.length)) };
  }

  // ---------- held notes: the strongest steady note, frame by frame ----------
  // Each fifth of a second, every note from E3 to F#6 is scored by how much of the sound sits on its harmonics (the note
  // and four overtones); the best one counts when it stands out. A run of the same note for at least .4 s is a held note.
  async function heldNotes(x, sr, prog){
    const N = 2048, hop = 512, nb = N/2, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = .5 - .5*Math.cos(2*Math.PI*i/N);
    const n = Math.floor((Math.min(x.length, sr*300) - N)/hop), re = new Float32Array(N), im = new Float32Array(N), mg = new Float32Array(nb);
    const bin = f => f*N/sr, peak = b => { const k = Math.round(b); return Math.max(mg[k - 1] || 0, mg[k] || 0, mg[k + 1] || 0); };
    const W = [1, .6, .45, .3, .2], fr = [];
    for (let f = 0; f < n; f++){
      for (let i = 0; i < N; i++){ re[i] = x[f*hop + i]*win[i]; im[i] = 0; } fft(re, im);
      let tot = 0; for (let k = 0; k < nb; k++){ mg[k] = Math.hypot(re[k], im[k]); if (k > bin(150) && k < bin(5000)) tot += mg[k]; }
      let best = 0, bm = 0;
      for (let m = 52; m <= 90; m++){ const f0 = 440*Math.pow(2, (m - 69)/12); let sc = 0; for (let h = 0; h < 5; h++){ const b = bin(f0*(h + 1)); if (b >= nb - 1) break; sc += W[h]*peak(b); }
        // (an octave below can score the same harmonics: it only wins if its own fundamental is there)
        if (sc > best){ best = sc; bm = m; } }
      // the fundamental's exact place, from the strongest bin near it
      const f0 = 440*Math.pow(2, (bm - 69)/12), b0 = bin(f0); let kk = Math.round(b0); for (const d of [-1, 1]) if ((mg[Math.round(b0) + d] || 0) > mg[kk]) kk = Math.round(b0) + d;
      const a = mg[kk - 1] || 0, b = mg[kk], c = mg[kk + 1] || 0, den = a - 2*b + c, kf = den < 0 ? kk + .5*(a - c)/den : kk;
      fr.push({ t: (f*hop + N/2)/sr, m: bm, mf: 69 + 12*Math.log2((kf*sr/N)/440), ratio: tot > 0 ? best/tot : 0, e: tot });
      if (f % 300 === 299){ prog(f/n); await later(); }
    }
    const es = fr.map(v => v.e).sort((p, q) => p - q), eMed = es[es.length >> 1] || 1e-9, segs = [];
    let run = [];
    const close = () => { if (run.length*hop/sr >= .4){ const ms = run.map(v => v.mf).filter(v => isFinite(v) && Math.abs(v - run[0].m) < .7).sort((p, q) => p - q); const mm = ms.length ? ms[ms.length >> 1] : run[0].m;
      const ratio = run.reduce((s2, v) => s2 + v.ratio, 0)/run.length, loud = Math.min(2, run.reduce((s2, v) => s2 + v.e, 0)/run.length/eMed);
      segs.push({ t0: run[0].t - N/2/sr, t1: run[run.length - 1].t + N/2/sr, midi: mm, score: (run.length*hop/sr)*ratio*(.4 + loud) }); } run = []; };
    for (const v of fr){
      const ok = v.ratio > .09 && v.e > eMed*.4;
      if (ok && run.length && v.m !== run[0].m) close();
      if (ok) run.push(v); else close();
    }
    close();
    return segs;
  }
  function chooseRoots(segs){
    const c = segs.filter(s => s.midi >= 45 && s.midi <= 86).sort((a, b) => b.score - a.score), out = [];
    for (const s of c){ if (out.length >= 5) break; if (out.every(o => Math.abs(o.midi - s.midi) >= 3)) out.push(s); }
    return out.sort((a, b) => a.midi - b.midi);
  }
  // a held note made into a sample: drums out, the bass under it filtered away, a loop in its steady middle with the seam crossfaded
  function makeSample(x, sr, seg){
    const a = Math.max(0, Math.floor((seg.t0 - .03)*sr)), b = Math.min(x.length, Math.floor(Math.min(seg.t1, seg.t0 + 1.8)*sr) + Math.floor(.08*sr));
    let s = hpss(x.subarray(a, b), sr, 440*Math.pow(2, (seg.midi - 69)/12)); s = biquad(s, sr, 'hp', Math.max(80, 440*Math.pow(2, (seg.midi - 69)/12)*.6));
    let pk = 0, rms = 0; for (const v of s){ pk = Math.max(pk, Math.abs(v)); rms += v*v; } rms = Math.sqrt(rms/s.length);
    const g = Math.min(.9/(pk || 1), .25/(rms || 1)); for (let i = 0; i < s.length; i++) s[i] *= g;
    const fi = Math.floor(.004*sr); for (let i = 0; i < fi; i++) s[i] *= i/fi;
    const X = Math.floor(.06*sr); let ls = Math.max(X + 1, Math.floor(s.length*.35)), le = Math.floor(s.length*.85);
    if (le - ls < .12*sr){ ls = Math.max(X + 1, Math.floor(s.length*.2)); le = s.length - 2; }
    for (let k = 0; k < X; k++){ const w = k/X, i = le - X + k; s[i] = s[i]*Math.sqrt(1 - w) + s[ls - X + k]*Math.sqrt(w); }   // (at the loop's end the sound has become what follows its start)
    return { root: seg.midi, ls: ls/sr, le: le/sr, sr, data: s.subarray(0, le + 1) };
  }
  // chops: the section's bars cut into beats, drums stripped (a bar at a time)
  function makeChops(x, sr, startT, bs, nbars){
    const out = [];
    for (let k = 0; k < nbars; k++){
      const t0 = startT + k*4*bs, a = Math.max(0, Math.floor((t0 - .05)*sr)), b = Math.min(x.length, Math.floor((t0 + 4*bs + .3)*sr));
      if (b - a < sr*.2){ out.push([]); continue; }
      const h = hpss(x.subarray(a, b)), off = Math.floor((t0 - a/sr)*sr), beats = [];
      for (let q = 0; q < 4; q++){
        const s0 = off + Math.floor(q*bs*sr), len = Math.min(Math.floor(Math.min(bs*1.4, .9)*sr), h.length - s0); if (len < 200){ beats.push(null); continue; }
        const c = h.slice(s0, s0 + len); let pk = 0; for (const v of c) pk = Math.max(pk, Math.abs(v)); const g = .8/(pk || 1);
        const fi = Math.floor(.004*sr), fo = Math.floor(.04*sr); for (let i = 0; i < len; i++){ c[i] *= g*(i < fi ? i/fi : 1)*(i > len - fo ? (len - i)/fo : 1); }
        beats.push(c);
      }
      out.push(beats);
    }
    return out;
  }

  // ---------- keeping the samples (IndexedDB, by song) ----------
  let dbP = null;
  function db(){ if (!dbP) dbP = new Promise((res, rej) => { const r = indexedDB.open('neonIsland.boothSongs', 1); r.onupgradeneeded = () => r.result.createObjectStore('songs'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return dbP; }
  const i16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) o[i] = Math.max(-32767, Math.min(32767, Math.round(f[i]*32767))); return o; };
  const f32 = s => { const o = new Float32Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s[i]/32767; return o; };
  async function put(key, v){ try { const d = await db(); await new Promise((res, rej) => { const t = d.transaction('songs', 'readwrite'); t.objectStore('songs').put(v, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e){ return false; } }
  async function get(key){ try { const d = await db(); return await new Promise((res, rej) => { const r = d.transaction('songs').objectStore('songs').get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); }); } catch (e){ return null; } }

  // the samples as sounds the Booth can play
  function toBuffers(ctx, pack){
    const mk = (data, sr) => { const b = ctx.createBuffer(1, data.length, sr); b.getChannelData(0).set(data instanceof Float32Array ? data : f32(data)); return b; };
    return { samples: pack.samples.map(s => ({ root: s.root, ls: s.ls, le: s.le, buf: mk(s.data, s.sr) })), chops: pack.chops.map(bar => bar.map(c => c ? mk(c, pack.chopSr || pack.sr) : null)) };
  }

  // ---------- the whole listen ----------
  // returns { key (for the store), name, bpm, keyName, cs (the key's chords), list (a chord a bar, whole song), start, len, sounds }
  Q.analyze = async (file, ctx, say) => {
    say('Reading the song…', 0);
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const sr = buf.sampleRate, x = mono(buf), f = Math.max(1, Math.round(sr/11025)), xs = down(x, f), sr2 = sr/f;
    const id = 'song:' + file.name + ':' + file.size + ':' + Math.round(buf.duration);
    say('Finding the beat…', .05); await later();
    const tp = tempo(xs, sr2);
    say('Listening for the key and chords…', .1);
    const frames = await chroma(xs, sr2, p => say('Listening for the key and chords… ' + Math.round(p*100) + '%', .1 + p*.45));
    const key = keyOf(frames), bb = bars(frames, key, tp.bpm, tp.phase, buf.duration), sec = section(bb.list);
    say('Looking for clean held notes…', .55);
    const segs = await heldNotes(xs, sr2, p => say('Looking for clean held notes… ' + Math.round(p*100) + '%', .55 + p*.25));
    const roots = chooseRoots(segs);
    say('Taking the drums out of the samples…', .82); await later();
    const samples = []; for (const s of roots){ samples.push(makeSample(x, sr, s)); await later(); }
    say('Cutting the chops…', .9); await later();
    const bs = 60/tp.bpm, chops = makeChops(x, sr, bb.t0 + sec.start*4*bs, bs, sec.len);
    // (the whole song kept too, at half rate, so the chops can be cut from another section in a later visit)
    const f22 = Math.max(1, Math.round(sr/22050));
    const pack = { mono: i16(down(x, f22)), monoSr: sr/f22, bar0: bb.t0, bs, name: file.name.replace(/\.[^.]+$/, ''), sr, samples: samples.map(s => ({ root: s.root, ls: s.ls, le: s.le, sr: s.sr, data: i16(s.data) })), chops: chops.map(b => b.map(c => c ? i16(c) : null)) };
    await put(id, pack); idxAdd(id, pack.name, samples.length);
    say('Done', 1);
    const NM = key.flats ? FL : SH;
    // moving the section later or earlier: the chops are cut again from the song (while it's still loaded)
    const recut = async (start, len) => { const c = makeChops(x, sr, bb.t0 + start*4*bs, bs, len); pack.chops = c.map(b => b.map(v => v ? i16(v) : null)); pack.chopSr = sr; await put(id, pack); return toBuffers(ctx, pack).chops; };
    return { recut, key: id, name: pack.name, bpm: tp.bpm, keyName: NM[key.root] + ' ' + key.q, cs: bb.cs.map(c => ({ name: c.name, notes: c.notes, motif: c.motif })), list: bb.list, start: sec.start, len: sec.len, sounds: toBuffers(ctx, pack), nSamples: samples.length };
  };
  // the songs kept on this computer, as { key, name, n (its held notes) }: a small index beside the store (built from the
  // store itself the first time, for songs listened to before there was one)
  const IDX = 'neonIsland.boothSongIndex';
  const idxGet = () => { try { return JSON.parse(localStorage.getItem(IDX) || 'null'); } catch (e){ return null; } };
  const idxSet = a => { try { localStorage.setItem(IDX, JSON.stringify(a)); } catch (e){} };
  function idxAdd(key, name, n){ const a = idxGet() || [], i = a.findIndex(x => x.key === key), e = { key, name, n }; if (i >= 0) a[i] = e; else a.push(e); idxSet(a); }
  Q.list = async () => {
    let a = idxGet(); if (a) return a;
    a = [];
    try { const d = await db(); await new Promise(res => { const r = d.transaction('songs').objectStore('songs').openCursor();
      r.onsuccess = () => { const c = r.result; if (!c) return res(); a.push({ key: c.key, name: c.value.name, n: (c.value.samples || []).length }); c.continue(); }; r.onerror = () => res(); }); } catch (e){}
    idxSet(a); return a;
  };
  // a song listened to before: its samples back from the store (null if they're gone)
  Q.sounds = async (ctx, key) => { const p = await get(key); return p ? toBuffers(ctx, p) : null; };
  // cut the chops again from another section of a song listened to before (from the copy kept with its samples)
  Q.recutFor = async (ctx, key, start, len) => {
    const p = await get(key); if (!p || !p.mono) return null;
    const x = f32(p.mono), c = makeChops(x, p.monoSr, p.bar0 + start*4*p.bs, p.bs, len);
    p.chops = c.map(b => b.map(v => v ? i16(v) : null)); p.chopSr = p.monoSr; await put(key, p); return toBuffers(ctx, p).chops;
  };
  Q.hpss = hpss; Q.tempo = tempo; Q._held = heldNotes; Q._sample = makeSample;   // (for checking)
  return Q;
})();
