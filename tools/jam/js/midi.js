/* MIDI export: the current seed, sliders and game state, 64 bars, one track per layer, drums on channel 10.
   Pure JavaScript, no audio needed. The notes are the composer's, unchanged (no swing or timing jitter, so the
   file opens cleanly in GarageBand and shows the real grid). Standard MIDI file, type 1, 480 ticks per quarter. */
(function (G) {
  'use strict';
  const J = G.Jam;
  const PPQ = 480, STEP = PPQ / 4;                      // a sixteenth is 120 ticks; the tempo changes per bar to follow half-time sections
  const GM = { kick: 36, snare: 38, rim: 37, hat: 42, hatOpen: 46, ride: 51, crash: 49, tomLo: 45, tomMid: 47, tomHi: 50 };

  function vlq(n) { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; }
  function str(s) { return Array.from(s).map(c => c.charCodeAt(0) & 0x7f); }
  function u32(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
  function u16(n) { return [(n >>> 8) & 255, n & 255]; }
  function chunk(id, bytes) { return str(id).concat(u32(bytes.length), bytes); }
  const vel = v => Math.max(1, Math.min(127, Math.round(v * 127)));

  // a track is a list of {t, bytes}; sorted by time with note-offs first at equal times
  function trackBytes(list) {
    list.sort((a, b) => (a.t - b.t) || ((a.order || 1) - (b.order || 1)));
    const out = []; let last = 0;
    list.forEach(e => { out.push.apply(out, vlq(Math.max(0, Math.round(e.t - last)))); out.push.apply(out, e.bytes); last = e.t; });
    out.push(0, 0xff, 0x2f, 0);
    return chunk('MTrk', out);
  }
  const meta = (t, type, data) => ({ t, order: 0, bytes: [0xff, type, data.length].concat(data) });
  const note = (list, t, d, n, v, ch) => {
    n = Math.max(0, Math.min(127, Math.round(n)));
    list.push({ t, order: 1, bytes: [0x90 | ch, n, vel(v)] });
    list.push({ t: t + Math.max(20, d), order: 0, bytes: [0x80 | ch, n, 0] });
  };

  // compose `bars` bars with the same settings the engine would use, and return the MIDI bytes
  J.exportMidi = function (o) {
    const bars = o.bars || 64;
    const P = Object.assign(J.defaultParams(), o.params || {});
    const g = J.applyGame(P, o.game || { tod: 'day', rain: false, view: 'street' });
    const Comp = (o.composer === 'old' || !J.Composer2) ? J.Composer : J.Composer2;
    const comp = new Comp(String(o.seed), g.eff);
    const mods = { hatScale: g.hatScale, forceFull: g.forceFull, radio: 0 };
    const T = { cond: [], bass: [], keys: [], twinkle: [], pads: [], lead: [], drums: [] };
    let t0 = 0, lastSig = '', lastTempo = 0;
    for (let i = 0; i < bars; i++) {
      const b = comp.next(g.eff, mods);
      const tempo = Math.round(60e6 / (b.bpm * b.clock));
      if (tempo !== lastTempo) { T.cond.push(meta(t0, 0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255])); lastTempo = tempo; }
      const steps = b.steps, num = steps % 4 === 0 ? steps / 4 : steps / 2, den = steps % 4 === 0 ? 4 : 8;
      const sig = num + '/' + den;
      if (sig !== lastSig) { T.cond.push(meta(t0, 0x58, [num, Math.log2(den), 24, 8])); lastSig = sig; }
      b.ev.forEach(ev => {
        const t = t0 + ev.s * STEP, d = (ev.d || 1) * STEP;
        switch (ev.l) {
          case 'bass': note(T.bass, t, d * 0.95, ev.n, ev.v, 1); break;
          case 'keys': ev.notes.forEach(n => note(T.keys, t, d * 0.95, n, ev.v, 2)); break;
          case 'twinkle':
            if (ev.k === 'pluck') note(T.twinkle, t, STEP * 3, ev.n, ev.v, 3);
            else ev.notes.forEach((n, k) => note(T.twinkle, t + k * 6, STEP * 6, n, ev.v * (0.85 + 0.05 * k), 3));
            break;
          case 'pads': (ev.notes || []).forEach(n => note(T.pads, t, d, n, ev.v, 4)); break;
          case 'lead': note(T.lead, t, d * 0.95, ev.n, ev.v, 5); break;
          case 'drums': {
            const dr = ev.k === 'kick' ? GM.kick : ev.k === 'snare' ? (ev.rim ? GM.rim : GM.snare) : ev.k === 'hat' ? (ev.open ? GM.hatOpen : GM.hat) :
              ev.k === 'ride' ? GM.ride : ev.k === 'crash' ? GM.crash : ev.k === 'tom' ? (ev.f > 150 ? GM.tomHi : ev.f > 100 ? GM.tomMid : GM.tomLo) : 0;
            if (dr) note(T.drums, t, STEP, dr, ev.v, 9);
            break;
          }
        }
      });
      t0 += steps * STEP;
    }
    const names = [['conductor', 'cond', null], ['Bass', 'bass', 33], ['Keys', 'keys', 4], ['Twinkle', 'twinkle', 27], ['Pads', 'pads', 89], ['Lead', 'lead', 81], ['Drums', 'drums', null]];
    const tracks = names.map(([name, k, prog]) => {
      const list = T[k];
      list.push(meta(0, 0x03, str(name)));
      const ch = { bass: 1, keys: 2, twinkle: 3, pads: 4, lead: 5, drums: 9 }[k];
      if (prog !== null) list.push({ t: 0, order: 0, bytes: [0xc0 | ch, prog] });
      return trackBytes(list);
    });
    const header = chunk('MThd', u16(1).concat(u16(tracks.length), u16(PPQ)));
    let all = header; tracks.forEach(tr => { all = all.concat(tr); });
    return new Uint8Array(all);
  };
  // a stored (uncompressed) zip with one file: the published page can only save a few file types, and .mid is not one of them
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const le32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255], le16 = n => [n & 255, (n >>> 8) & 255];
  J.zipStore = function (name, bytes) {
    const nm = Array.from(name).map(c => c.charCodeAt(0) & 0x7f), crc = crc32(bytes), n = bytes.length;
    const local = [0x50, 0x4b, 3, 4, 20, 0, 0, 0, 0, 0, 0, 0, 0x21, 0].concat(le32(crc), le32(n), le32(n), le16(nm.length), [0, 0], nm);
    const central = [0x50, 0x4b, 1, 2, 20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0x21, 0].concat(le32(crc), le32(n), le32(n), le16(nm.length), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], le32(0), nm);
    const end = [0x50, 0x4b, 5, 6, 0, 0, 0, 0, 1, 0, 1, 0].concat(le32(central.length), le32(local.length + n), [0, 0]);
    const out = new Uint8Array(local.length + n + central.length + end.length);
    out.set(local, 0); out.set(bytes, local.length); out.set(central, local.length + n); out.set(end, local.length + n + central.length);
    return out;
  };
  J.midiName = o => 'jam-' + String(o.seed).replace(/[^a-z0-9_-]+/gi, '_') + '-' + (o.composer === 'old' ? 'old' : 'new') + '.mid';
})(typeof window !== 'undefined' ? window : globalThis);
