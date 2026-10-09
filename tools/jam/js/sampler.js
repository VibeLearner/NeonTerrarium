/* Sampler: plays notes on recorded single-note and single-hit samples (CC0, see samples/CREDITS.md).
   The composer still decides every note and every pattern. The sampler only changes what they are played on.

   - Loads lazily (only the instruments the current settings use) and never makes playback wait: a hit whose samples have not
     arrived yet is declined (the methods below return false) and the engine plays the synth voice instead.
   - Nearest sample by pitch, shifted with playbackRate; velocity layers; round robins that never repeat the one before
     and are picked from a seeded hash, so the same seed always sounds the same.
   - Seeded tiny level variation per hit. (The engine already adds seeded timing variation.)
   - Note ends follow round 2's rules: a note that must stop gets a short linear release; sampled twinkle notes never ring longer
     than J.RING.newMax; chord changes damp the notes that do not belong to the new chord (damp()).
   - Voice caps per layer; the oldest voice is stolen with a short fade. */
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  const CAPS = { drums: 28, bass: 2, keys: 14, twinkle: 14 };
  // default instrument per layer. 'synth' = keep the oscillator voice.
  const DEFAULT_CHOICE = { drums: 'auto', bass: 'auto', keys: 'fmpiano', twinkle: 'gtr_green' };
  const CHOICES = {
    drums:   [['auto', 'Auto (tight kit, jazz kit in jazz parts)'], ['kit_tight', 'Tight kit'], ['kit_jazz', 'Jazz kit'], ['synth', 'Synth drums']],
    bass:    [['auto', 'Auto (synth sub and reese, bass guitar in choruses, double bass in jazz)'], ['bass_fashion', 'Bass guitar'], ['bass_double', 'Double bass'], ['synth', 'Synth bass']],
    keys:    [['fmpiano', 'FM electric piano (sampled)'], ['upright', 'Upright piano'], ['synth', 'FM piano (synth)']],
    twinkle: [['gtr_green', 'Electric guitar'], ['vibes', 'Vibraphone'], ['kalimba', 'Kalimba'], ['glock', 'Glockenspiel'], ['marimba', 'Marimba'], ['synth', 'Plucked string (synth)']],
  };
  // gain trim per instrument so sampled layers sit near the synth voices they replace (set from offline measurements, see NOTES5.md)
  const GAIN = { kit_tight: 1.0, kit_jazz: 1.0, gtr_green: 1.0, vibes: 1.0, kalimba: 1.0, glock: 1.0, marimba: 1.0, fmpiano: 1.0, upright: 1.0, bass_fashion: 1.0, bass_double: 1.0, sub: 0.34 };
  // note release (seconds) when a note ends before the sample does
  const REL = { gtr_green: 0.10, vibes: 0.35, kalimba: 0.2, glock: 0.3, marimba: 0.2, fmpiano: 0.18, upright: 0.2, bass_fashion: 0.07, bass_double: 0.09 };
  J.SAMPLER_CHOICES = CHOICES; J.SAMPLER_DEFAULTS = DEFAULT_CHOICE;

  J.Sampler = function (ctx, synth, opts) {
    opts = opts || {};
    const self = this;
    const base = opts.base || 'samples/';
    this.on = false;                         // 'sampled sounds' switch
    this.choice = Object.assign({}, DEFAULT_CHOICE);
    this.status = { state: 'idle', loaded: 0, total: 0, failed: 0, message: '' };
    this.seed = '0';
    let manifest = null, manifestP = null;
    const buffers = new Map();               // file -> AudioBuffer
    const loading = new Map();               // group -> Promise
    const ready = new Set();                 // groups whose files are all decoded
    const rrLast = new Map();
    let hitCount = 0;
    const voices = { drums: [], bass: [], keys: [], twinkle: [] };

    // ---------------------------------------------------------------- loading
    function getManifest() {
      if (!manifestP) manifestP = fetch(base + 'manifest.json').then(r => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }).then(m => { manifest = m; return m; });
      return manifestP;
    }
    function filesOf(group) {
      const out = [];
      (function walk(o) {
        if (Array.isArray(o)) { if (o.length >= 2 && typeof o[0] === 'string' && /\.opus$/.test(o[0])) out.push(o[0]); else o.forEach(walk); }
        else if (o && typeof o === 'object') Object.values(o).forEach(walk);
      })(manifest.instruments[group]);
      return out;
    }
    async function loadGroup(group) {
      await getManifest();
      if (!manifest.instruments[group]) throw new Error('no such group ' + group);
      const files = filesOf(group).filter(f => !buffers.has(f));
      self.status.total += files.length;
      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const f = files[next++];
          try {
            const r = await fetch(base + 'pack/' + f);
            if (!r.ok) throw new Error(String(r.status));
            const ab = await r.arrayBuffer();
            buffers.set(f, await ctx.decodeAudioData(ab));
          } catch (e) { self.status.failed++; }
          self.status.loaded++;
          if (self.onstatus) self.onstatus(self.status);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
      if (!filesOf(group).every(f => buffers.has(f))) throw new Error('some files of ' + group + ' failed to load');
      ready.add(group);
    }
    // which groups the current settings need
    this.wanted = function () {
      const w = [], c = this.choice;
      if (c.drums === 'auto') w.push('kit_tight', 'kit_jazz'); else if (c.drums !== 'synth') w.push(c.drums);
      if (c.keys !== 'synth') w.push(c.keys);
      if (c.twinkle !== 'synth') w.push(c.twinkle);
      if (c.bass === 'auto') w.push('bass_fashion', 'bass_double'); else if (c.bass !== 'synth') w.push(c.bass);
      return w;
    };
    // start loading what is wanted. Resolves when everything is ready; playback never waits for it.
    this.sync = function () {
      if (!this.on) return Promise.resolve();
      const todo = this.wanted().filter(g => !ready.has(g));
      if (!todo.length) { this.status.state = 'ready'; if (this.onstatus) this.onstatus(this.status); return Promise.resolve(); }
      this.status.state = 'loading'; if (this.onstatus) this.onstatus(this.status);
      const ps = todo.map(g => {
        if (!loading.has(g)) loading.set(g, loadGroup(g).catch(e => { loading.delete(g); throw e; }));
        return loading.get(g);
      });
      return Promise.all(ps).then(() => { this.status.state = this.wanted().every(g => ready.has(g)) ? 'ready' : 'loading'; if (this.onstatus) this.onstatus(this.status); })
        .catch(e => { this.status.state = 'error'; this.status.message = String(e.message || e); if (this.onstatus) this.onstatus(this.status); });
    };
    this.isReady = g => ready.has(g);
    this.sizeInfo = () => manifest && manifest.totals;
    this.setSeed = s => { this.seed = String(s); rrLast.clear(); hitCount = 0; };
    this.setChoice = function (layer, v) { this.choice[layer] = v; this.sync(); };
    this.setOn = function (on) { this.on = !!on; if (on) this.sync(); };

    // ---------------------------------------------------------------- shared helpers
    function pickLayer(layers, v) { for (let i = 0; i < layers.length; i++) if (v <= layers[i].max + 1e-9) return i; return layers.length - 1; }
    // a seeded round robin that never plays the same one twice in a row
    function pickRR(key, n, tag) {
      if (n <= 1) return 0;
      const last = rrLast.get(key);
      let k = Math.floor(J.u(self.seed, 'rr', key, tag) * (n - 1));
      if (last !== undefined && k >= last) k++;
      rrLast.set(key, k);
      return k;
    }
    const levelVar = tag => 1 + (J.u(self.seed, 'lv', tag) - 0.5) * 0.12;             // about +/-0.5 dB, seeded
    function claim(layer, t, end, gainNode) {
      const list = voices[layer];
      for (let i = list.length - 1; i >= 0; i--) if (list[i].end < t) list.splice(i, 1);
      if (list.length >= CAPS[layer]) {
        let k = 0; for (let i = 1; i < list.length; i++) if (list[i].end < list[k].end) k = i;
        const v = list.splice(k, 1)[0];
        try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + 0.012); } catch (e) { }
      }
      const h = { end, gain: gainNode };
      list.push(h);
      return h;
    }
    function dropOnEnd(src, node) { src.onended = () => { try { node.disconnect(); } catch (e) { } }; }

    // ---------------------------------------------------------------- drum bus: EQ per hit, a compressor with a slowish attack (it lets the
    // transient through, which is the punch), and a little parallel saturation. Everything but the kick is high-passed.
    const dl = synth.layers.drums.input;
    const drumIn = ctx.createGain();
    const drumComp = ctx.createDynamicsCompressor();
    drumComp.threshold.value = -20; drumComp.knee.value = 6; drumComp.ratio.value = 4; drumComp.attack.value = 0.012; drumComp.release.value = 0.09;
    const satIn = ctx.createGain(); satIn.gain.value = 1.6;
    const sat = ctx.createWaveShaper(); { const c = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; c[i] = Math.tanh(1.8 * x) / Math.tanh(1.8); } sat.curve = c; sat.oversample = '2x'; }
    const satOut = ctx.createGain(); satOut.gain.value = 0.22;
    const satHP = ctx.createBiquadFilter(); satHP.type = 'highpass'; satHP.frequency.value = 180;
    drumIn.connect(drumComp); drumComp.connect(dl);
    drumComp.connect(satHP); satHP.connect(satIn); satIn.connect(sat); sat.connect(satOut); satOut.connect(dl);
    function filt(type, f, gain, q) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (gain !== undefined) n.gain.value = gain; if (q) n.Q.value = q; return n; }
    const HIT_BUS = {};
    function hitBus(kind) {
      if (HIT_BUS[kind]) return HIT_BUS[kind];
      let head, tail;
      switch (kind) {
        case 'kick': head = tail = ctx.createGain(); break;
        case 'snare': case 'rim': { head = filt('highpass', 85); const sh = filt('highshelf', 5200, 3.5); const pk = filt('peaking', 2300, 2, 0.9); head.connect(pk); pk.connect(sh); tail = sh; break; }
        case 'hat': case 'hatOpen': head = tail = filt('highpass', 420); break;
        case 'ride': case 'crash': head = tail = filt('highpass', 260); break;
        default: head = tail = filt('highpass', 70);                       // toms
      }
      tail.connect(drumIn);
      return (HIT_BUS[kind] = head);
    }
    let openHat = null;
    function tonicSub(tonic) { let m = 28 + ((tonic - 28) % 12 + 12) % 12; return m; }   // 28..39: a tone you can hear on small speakers, in the song's key

    const jazzBar = bar => !!bar && (bar.mode === 'jazz' || bar.style === 'jazz' || (bar.kind === 'bridge' && bar.bridgeKind === 'jazz'));
    // ev: the composer's drum event; returns true when the hit was played from samples
    this.drum = function (t, ev, bar) {
      if (!this.on || !manifest) return false;
      const c = this.choice.drums;
      if (c === 'synth') return false;
      const kitName = c === 'auto' ? (jazzBar(bar) ? 'kit_jazz' : 'kit_tight') : c;
      if (!ready.has(kitName)) return false;
      const kit = manifest.instruments[kitName].hits;
      let kind = ev.k, v = clamp(ev.v, 0.02, 1);
      if (kind === 'snare') { if (ev.rim) kind = 'rim'; else if (ev.ghost) v = Math.min(v, 0.32); }
      else if (kind === 'hat') kind = ev.open ? 'hatOpen' : 'hat';
      else if (kind === 'tom') kind = ev.f > 150 ? 'tomHi' : ev.f > 100 ? 'tomMid' : 'tomLo';
      const hit = kit[kind];
      if (!hit) return false;
      hitCount++;
      const li = pickLayer(hit.layers, v), layer = hit.layers[li];
      const ri = pickRR(kitName + kind + li, layer.rr.length, hitCount);
      const buf = buffers.get(layer.rr[ri][0]);
      if (!buf) return false;
      const src = ctx.createBufferSource(); src.buffer = buf;
      // the tight kit is tuned up a little (shorter, tighter); the sample is shifted, never stretched
      const tune = kitName === 'kit_tight' ? (kind === 'snare' || kind === 'rim' ? 1.035 : kind === 'kick' ? 1.02 : 1) : 1;
      src.playbackRate.value = tune;
      const g = ctx.createGain();
      const gain = GAIN[kitName] * Math.pow(clamp(v / layer.center, 0.55, 1.6), 0.6) * levelVar(hitCount) * (kind === 'kick' ? 1 : 0.95);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.0012);   // 1.2 ms fade-in: some trimmed hits start mid-wave
      const end = t + buf.duration / tune;
      claim('drums', t, end, g);
      src.connect(g); g.connect(hitBus(kind));
      if (kind === 'hat' && openHat && openHat.end > t) {              // a closed hat chokes an open one
        try { openHat.gain.gain.cancelScheduledValues(t); openHat.gain.gain.setValueAtTime(openHat.gain.gain.value, t); openHat.gain.gain.linearRampToValueAtTime(0, t + 0.012); } catch (e) { }
        openHat = null;
      }
      if (kind === 'hatOpen') openHat = { end, gain: g };
      src.start(t); dropOnEnd(src, g);
      if (kind === 'kick' && bar) {                                    // a short sine under the sample, tuned to the key
        const f = J.mtof(tonicSub(bar.tonic === undefined ? 0 : bar.tonic));
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
        const sv = GAIN.sub * clamp(v, 0.3, 1);
        og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(sv, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        o.connect(og); og.connect(hitBus('kick')); o.start(t); o.stop(t + 0.26); dropOnEnd(o, og);
      }
      return true;
    };

    // ---------------------------------------------------------------- pitched instruments
    const instBus = {};
    function busFor(inst, layerName) {
      if (instBus[inst]) return instBus[inst];
      const input = ctx.createGain();
      let tail = input;
      if (inst === 'fmpiano') {                   // electric piano feel: a gentle tremolo and a slow chorus
        const trem = ctx.createGain(); trem.gain.value = 0.9;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 4.6; lg.gain.value = 0.07; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
        const ch = ctx.createDelay(0.05); ch.delayTime.value = 0.018;
        const cl = ctx.createOscillator(), cg = ctx.createGain(); cl.frequency.value = 0.8; cg.gain.value = 0.0016; cl.connect(cg); cg.connect(ch.delayTime); cl.start();
        const mix = ctx.createGain(); input.connect(trem); trem.connect(mix); trem.connect(ch); ch.connect(mix); tail = mix;
      }
      if (layerName === 'twinkle' || layerName === 'keys') { const hp = filt('highpass', layerName === 'keys' ? 90 : 150); tail.connect(hp); tail = hp; }
      if (inst === 'bass_fashion' || inst === 'bass_double') { const lp = filt('lowpass', 5200); tail.connect(lp); tail = lp; }
      tail.connect(synth.layers[layerName].input);
      return (instBus[inst] = input);
    }
    function nearest(notes, midi) {
      // a note outside the sampled range is moved by octaves into it, so a sample is never pitched further than a tritone
      const lo = notes[0].midi, hi = notes[notes.length - 1].midi;
      let m = midi;
      while (m < lo - 6) m += 12;
      while (m > hi + 6) m -= 12;
      let best = notes[0], bd = 1e9;
      for (const n of notes) { const d = Math.abs(n.midi - m); if (d < bd) { bd = d; best = n; } }
      return { note: best, midi: m };
    }
    // play one pitched note. o: {pan, maxRing, art, gain}. Returns a handle (for damping) or null.
    function playNote(layerName, inst, art, midi, t, dur, vel, o) {
      o = o || {};
      if (!ready.has(inst)) return null;
      const A = manifest.instruments[inst].arts[art];
      if (!A) return null;
      const nn = nearest(A.notes, midi);
      const n = nn.note;
      const li = pickLayer(n.layers, vel), layer = n.layers[li];
      hitCount++;
      const ri = pickRR(inst + art + n.midi + li, layer.rr.length, hitCount);
      const f = layer.rr[ri];
      const buf = buffers.get(f[0]);
      if (!buf) return null;
      const src = ctx.createBufferSource(); src.buffer = buf;
      const rate = Math.pow(2, (nn.midi - n.midi - (f[2] || 0) / 100) / 12);
      src.playbackRate.value = rate;
      const natural = buf.duration / rate;
      const rel = o.rel !== undefined ? o.rel : (REL[inst] || 0.12);
      let off = t + Math.max(0.03, dur);
      if (o.maxRing) off = Math.min(off, t + o.maxRing);
      const g = ctx.createGain();
      const lay = n.layers.length > 1 ? Math.pow(clamp(vel / layer.center, 0.6, 1.5), 0.5) : Math.pow(clamp(vel, 0.05, 1), 0.85);
      const peak = GAIN[inst] * (o.gain || 1) * lay * levelVar(hitCount);
      const end = Math.min(t + natural, off + rel);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.0012);   // 1.2 ms fade-in
      if (off < t + natural - 0.02) { g.gain.setValueAtTime(peak, off); g.gain.linearRampToValueAtTime(0, off + rel); }
      const damper = ctx.createGain();
      const pan = ctx.createStereoPanner(); pan.pan.value = o.pan || 0;
      src.connect(g); g.connect(damper); damper.connect(pan); pan.connect(busFor(inst, layerName));
      const h = claim(layerName, t, end, g);
      src.start(t); src.stop(end + 0.03); dropOnEnd(src, pan);
      return { pc: ((midi % 12) + 12) % 12, t0: t, end, damper, damped: false, h };
    }

    // ---------------------------------------------------------------- twinkle (and the tapped riffs)
    let plucks = [];
    this.pluck = function (t, ev, notes) {
      if (!this.on || !manifest) return false;
      const inst = this.choice.twinkle;
      if (inst === 'synth' || !ready.has(inst)) return false;
      const list = notes || [ev.n];
      let ok = false;
      list.forEach((m, i) => {
        // tapped riffs: the first note of each group is picked (staccato), the rest are hammered on; ordinary arpeggios use the sustained twang
        const art = inst !== 'gtr_green' ? 'main' : ev.riff ? (ev.acc ? 'stac' : 'hammer') : 'twang';
        const tt = t + (notes ? i * (ev.strum || 0.014) : 0);
        const v = notes ? ev.v * (0.85 + 0.05 * i) : ev.v;
        const h = playNote('twinkle', inst, art, m, tt, 1.6, clamp(v / 0.62, 0.05, 1), { pan: notes ? (i - 1.5) * 0.25 : (ev.pan || 0), maxRing: J.RING.newMax, gain: 1.15 });
        if (h) { ok = true; plucks = plucks.filter(x => x.end > t - 0.5); plucks.push(h); }
      });
      return ok;
    };
    // chord change at t: sampled twinkle notes that do not belong to the new chord fade out
    this.damp = function (t, pcs, rel) {
      rel = rel || J.RING.dampRel;
      plucks.forEach(x => {
        if (x.t0 < t - 0.03 && x.end > t + 0.02 && pcs.indexOf(x.pc) < 0 && !x.damped) {
          x.damped = true;
          try { x.damper.gain.setValueAtTime(1, t); x.damper.gain.linearRampToValueAtTime(0, t + rel); } catch (e) { }
        }
      });
    };

    // ---------------------------------------------------------------- keys
    this.keys = function (t, ev, dur) {
      if (!this.on || !manifest) return false;
      const inst = this.choice.keys;
      if (inst === 'synth' || !ready.has(inst)) return false;
      const notes = ev.notes, strum = ev.strum || 0.012;
      const per = ev.v / Math.sqrt(Math.max(notes.length, 1));
      let ok = false;
      notes.forEach((m, i) => {
        const tt = t + i * strum * (0.6 + 0.4 * ((i * 7) % 3));
        if (playNote('keys', inst, 'main', m, tt, dur, clamp(ev.v * 1.1, 0.05, 1), { rel: 0.18, gain: 0.9 * Math.sqrt(per / Math.max(ev.v, 0.05)) * 1.6 })) ok = true;
      });
      return ok;
    };

    // ---------------------------------------------------------------- bass
    // 'sub' and 'reese' stay synthesized (synth bass is what synthesis does best). 'pluck' notes are a bass guitar in choruses and a double bass in the jazz parts.
    this.bass = function (t, ev, dur, bar) {
      if (!this.on || !manifest || ev.mode !== 'pluck') return false;
      const c = this.choice.bass;
      if (c === 'synth') return false;
      const inst = c === 'auto' ? (jazzBar(bar) || (bar && bar.kind !== 'chorus') ? 'bass_double' : 'bass_fashion') : c;
      if (!ready.has(inst)) return false;
      // monophonic: the note before is cut quickly
      const list = voices.bass;
      list.forEach(v => { if (v.end > t) { try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + 0.012); } catch (e) { } v.end = t + 0.012; } });
      return !!playNote('bass', inst, 'main', ev.n, t, dur, clamp(ev.v / 0.7, 0.05, 1), { gain: 1.0 });
    };

    this.releaseAll = function (t, tc) {
      Object.keys(voices).forEach(n => {
        voices[n].forEach(v => { try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, tc || 0.04); } catch (e) { } });
        voices[n].length = 0;
      });
      plucks = []; openHat = null;
    };
    this.handles = layer => this.on && manifest && ((layer === 'drums' && this.choice.drums !== 'synth') || (layer === 'twinkle' && this.choice.twinkle !== 'synth') || (layer === 'keys' && this.choice.keys !== 'synth'));
  };
})(typeof window !== 'undefined' ? window : globalThis);
