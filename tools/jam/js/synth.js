// Neon Terrarium jam room: the synthesizers, effects and mixer. Everything is generated here in the browser.
// No samples, no recordings. Plain Web Audio.
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};
  const LAYERS = ['drums', 'bass', 'keys', 'twinkle', 'pads', 'lead', 'texture'];
  J.LAYERS = LAYERS;

  // voice caps per layer (polyphony budget). Drums are capped by dropping the quietest extras.
  const CAPS = { drums: 28, bass: 3, keys: 14, twinkle: 14, pads: 26, lead: 5, texture: 12 };
  // per-layer defaults: fader, reverb send, delay send
  const LAYER_CFG = {
    drums:   { fader: 0.88, rev: 0.07, dly: 0.00 },
    bass:    { fader: 0.80, rev: 0.00, dly: 0.00 },
    keys:    { fader: 0.95, rev: 0.26, dly: 0.14 },
    twinkle: { fader: 0.90, rev: 0.30, dly: 0.30 },
    pads:    { fader: 0.62, rev: 0.42, dly: 0.00 },
    lead:    { fader: 0.80, rev: 0.22, dly: 0.32 },
    texture: { fader: 0.60, rev: 0.10, dly: 0.00 },
  };

  const EPS = 1e-4;

  // exponential decay envelope helper: 0 -> peak (attack) -> sustain level (decay) -> hold -> release to ~0
  function adsr(param, t, a, peak, d, s, hold, r) {
    hold = Math.max(hold, a + 0.002);
    param.setValueAtTime(EPS, t);
    param.linearRampToValueAtTime(peak, t + a);
    const sl = Math.max(peak * s, EPS), rel = t + hold;
    if (rel > t + a + d) {
      param.exponentialRampToValueAtTime(sl, t + a + d);
      param.setValueAtTime(sl, rel);
      param.exponentialRampToValueAtTime(EPS, rel + r);
    } else {
      const v = Math.max(peak * Math.pow(Math.max(s, 1e-3), (rel - (t + a)) / d), EPS);
      param.exponentialRampToValueAtTime(v, rel);
      param.exponentialRampToValueAtTime(EPS, rel + r);
    }
    return rel + r;
  }
  function clipCurve(drive, n = 2048) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(drive * x) / Math.tanh(drive); }
    return c;
  }

  J.Synth = function (ctx, opts) {
    opts = opts || {};
    const self = this;
    this.ctx = ctx;
    const sr = ctx.sampleRate;
    const rngN = J.rng('noise-buffer');

    // ---------------------------------------------------------------- buffers
    const noiseBuf = ctx.createBuffer(1, Math.floor(sr * 2.5), sr);
    { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rngN.next() * 2 - 1; }
    this.noiseBuf = noiseBuf;
    function noiseSrc(loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = !!loop; return s; }

    // ---------------------------------------------------------------- master chain
    const mix = ctx.createGain();
    const soft = ctx.createWaveShaper(); soft.curve = clipCurve(1.1); soft.oversample = '2x';
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -5; comp.knee.value = 3; comp.ratio.value = 20; comp.attack.value = 0.002; comp.release.value = 0.12;
    const vol = ctx.createGain(); vol.gain.value = 0.8;
    const guard = ctx.createWaveShaper();
    { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.max(-0.97, Math.min(0.97, x)); } guard.curve = c; }
    mix.connect(soft); soft.connect(comp); comp.connect(vol); vol.connect(guard); guard.connect(ctx.destination);
    const analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.7; vol.connect(analyser);
    this.master = { mix, comp, vol, analyser, guard };

    // bus before the "weather" filter, which dulls everything when it rains
    const bus = ctx.createGain();
    const weather = ctx.createBiquadFilter(); weather.type = 'lowpass'; weather.frequency.value = 19000; weather.Q.value = 0.5;
    bus.connect(weather); weather.connect(mix);
    this.weather = weather;

    // ---------------------------------------------------------------- reverb (generated impulse) with optional gate
    function makeIR(seconds, decay, dark) {
      const len = Math.floor(sr * seconds), ir = ctx.createBuffer(2, len, sr), r = J.rng('ir', seconds);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / len, env = Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
          lp += (r.next() * 2 - 1 - lp) * (dark * (1 - 0.8 * t) + 0.04);
          d[i] = lp * env * 2.2;
        }
      }
      return ir;
    }
    const revIn = ctx.createGain();
    const preDly = ctx.createDelay(0.2); preDly.delayTime.value = 0.022;
    const conv = ctx.createConvolver(); conv.buffer = makeIR(2.8, 2.6, 0.55);
    const revHP = ctx.createBiquadFilter(); revHP.type = 'highpass'; revHP.frequency.value = 220;
    const revGate = ctx.createGain(); revGate.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.9;
    revIn.connect(preDly); preDly.connect(conv); conv.connect(revHP); revHP.connect(revGate); revGate.connect(revOut); revOut.connect(bus);
    this.reverb = { input: revIn, gate: revGate, out: revOut };
    this.gated = false;

    // ---------------------------------------------------------------- tempo-synced ping-pong delay
    const dlyIn = ctx.createGain();
    const dL = ctx.createDelay(2), dR = ctx.createDelay(2);
    const fbL = ctx.createGain(), fbR = ctx.createGain(); fbL.gain.value = fbR.gain.value = 0.38;
    const dTone = ctx.createBiquadFilter(); dTone.type = 'lowpass'; dTone.frequency.value = 3600;
    const pL = ctx.createStereoPanner(), pR = ctx.createStereoPanner(); pL.pan.value = -0.55; pR.pan.value = 0.55;
    const dlyOut = ctx.createGain(); dlyOut.gain.value = 0.8;
    dlyIn.connect(dTone); dTone.connect(dL); dL.connect(fbL); fbL.connect(dR); dR.connect(fbR); fbR.connect(dL);
    dL.connect(pL); dR.connect(pR); pL.connect(dlyOut); pR.connect(dlyOut); dlyOut.connect(bus);
    dL.delayTime.value = 0.25; dR.delayTime.value = 0.25;
    this.delay = { input: dlyIn, dL, dR };
    this.setDelayTime = function (sec, t) {
      const tt = t === undefined ? ctx.currentTime : t;
      dL.delayTime.setTargetAtTime(sec, tt, 0.05); dR.delayTime.setTargetAtTime(sec, tt, 0.05);
    };

    // ---------------------------------------------------------------- chorus helper (two modulated delays)
    function makeChorus(r1, r2, depth) {
      const input = ctx.createGain(), out = ctx.createGain();
      const d1 = ctx.createDelay(0.05), d2 = ctx.createDelay(0.05);
      d1.delayTime.value = 0.017; d2.delayTime.value = 0.025;
      const l1 = ctx.createOscillator(), l2 = ctx.createOscillator();
      l1.frequency.value = r1; l2.frequency.value = r2;
      const g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = depth; g2.gain.value = depth * 1.2;
      l1.connect(g1); g1.connect(d1.delayTime); l2.connect(g2); g2.connect(d2.delayTime);
      const p1 = ctx.createStereoPanner(), p2 = ctx.createStereoPanner(); p1.pan.value = -0.7; p2.pan.value = 0.7;
      const dry = ctx.createGain(); dry.gain.value = 0.7;
      const wet = ctx.createGain(); wet.gain.value = 0.55;
      input.connect(dry); dry.connect(out);
      input.connect(d1); d1.connect(p1); p1.connect(wet); input.connect(d2); d2.connect(p2); p2.connect(wet); wet.connect(out);
      l1.start(); l2.start();
      return { input, output: out };
    }

    // ---------------------------------------------------------------- layers + mixer
    this.layers = {};
    this.mixState = {};
    this.space = 1;       // scales reverb sends (rain / zoomed-out make it bigger)
    LAYERS.forEach(name => {
      const cfg = LAYER_CFG[name];
      const input = ctx.createGain();
      const duck = ctx.createGain();
      const fader = ctx.createGain(); fader.gain.value = cfg.fader;
      const out = ctx.createGain();
      const meter = ctx.createAnalyser(); meter.fftSize = 256;
      const rev = ctx.createGain(), dly = ctx.createGain();
      rev.gain.value = cfg.rev; dly.gain.value = cfg.dly;
      let head = input;
      if (name === 'twinkle') { const ch = makeChorus(0.31, 0.47, 0.0022); input.connect(ch.input); head = ch.output; }
      if (name === 'pads') { const ch = makeChorus(0.11, 0.17, 0.0035); input.connect(ch.input); head = ch.output; }
      if (name === 'keys') { // slow auto-pan, Rhodes style
        const pan = ctx.createStereoPanner(); const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 0.42; lg.gain.value = 0.28; lfo.connect(lg); lg.connect(pan.pan); lfo.start();
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.5; // blocks FM's DC
        input.connect(hp); hp.connect(pan); head = pan;
      }
      if (head !== input) head.connect(duck); else input.connect(duck);
      duck.connect(fader); fader.connect(out); out.connect(meter);
      if (name === 'texture') out.connect(mix); else out.connect(bus);
      out.connect(rev); rev.connect(revIn);
      out.connect(dly); dly.connect(dlyIn);
      this.layers[name] = { input, duck, fader, out, meter, rev, dly, cfg };
      this.mixState[name] = { fader: cfg.fader, mute: false, solo: false, state: 1 };
    });
    this.applyMix = function () {
      const anySolo = LAYERS.some(n => this.mixState[n].solo);
      const t = ctx.currentTime;
      LAYERS.forEach(n => {
        const m = this.mixState[n];
        const audible = anySolo ? m.solo : !m.mute;
        this.layers[n].fader.gain.setTargetAtTime(audible ? m.fader * m.state : 0, t, 0.04);
        const L = this.layers[n];
        L.rev.gain.setTargetAtTime(L.cfg.rev * this.space, t, 0.1);
      });
    };
    this.setFader = (n, v) => { this.mixState[n].fader = v; this.applyMix(); };
    this.setMute = (n, v) => { this.mixState[n].mute = v; this.applyMix(); };
    this.setSolo = (n, v) => { this.mixState[n].solo = v; this.applyMix(); };
    this.setStateScale = (n, v) => { this.mixState[n].state = v; this.applyMix(); };
    this.setMaster = v => vol.gain.setTargetAtTime(v, ctx.currentTime, 0.04);
    this.setSpace = v => { this.space = v; this.applyMix(); };
    this.setWeatherCutoff = hz => weather.frequency.setTargetAtTime(hz, ctx.currentTime, 0.4);
    this.setGated = function (on) { this.gated = on; if (!on) { revGate.gain.cancelScheduledValues(ctx.currentTime); revGate.gain.setTargetAtTime(1, ctx.currentTime, 0.05); } };
    this.gateBeat = function (t, beatDur) {      // call once per beat while gated reverb is on
      if (!this.gated) return;
      revGate.gain.setValueAtTime(1, t);
      revGate.gain.setTargetAtTime(0.03, t + beatDur * 0.5, 0.012);
    };
    this.applyMix();

    // ---------------------------------------------------------------- voice bookkeeping
    const voices = {}; LAYERS.forEach(n => voices[n] = []);
    this.activeVoices = () => LAYERS.reduce((a, n) => a + voices[n].length, 0);
    // returns a handle, or null when the layer is full and the new note is not worth stealing for
    function alloc(layer, t, end, gainNode, essential) {
      const list = voices[layer];
      for (let i = list.length - 1; i >= 0; i--) if (list[i].end < t) list.splice(i, 1);
      if (list.length >= CAPS[layer]) {
        if (!essential) return null;
        let k = 0; for (let i = 1; i < list.length; i++) if (list[i].end < list[k].end) k = i;
        const v = list.splice(k, 1)[0];
        try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, 0.006); } catch (e) { }
      }
      const h = { end, gain: gainNode };
      list.push(h);
      return h;
    }
    function dropOnEnd(osc, node) { osc.onended = () => { try { node.disconnect(); } catch (e) { } }; }

    // shared filters for drum noise
    const hatHP = ctx.createBiquadFilter(); hatHP.type = 'highpass'; hatHP.frequency.value = 7200; hatHP.Q.value = 0.6;
    const hatPk = ctx.createBiquadFilter(); hatPk.type = 'peaking'; hatPk.frequency.value = 10500; hatPk.gain.value = 5; hatPk.Q.value = 1;
    const hatBus = ctx.createGain(); hatBus.gain.value = 1;
    hatHP.connect(hatPk); hatPk.connect(hatBus); hatBus.connect(this.layers.drums.input);
    const snHP = ctx.createBiquadFilter(); snHP.type = 'highpass'; snHP.frequency.value = 700;
    const snBP = ctx.createBiquadFilter(); snBP.type = 'peaking'; snBP.frequency.value = 2400; snBP.gain.value = 6; snBP.Q.value = 0.8;
    const snBus = ctx.createGain(); snBus.gain.value = 1;
    snHP.connect(snBP); snBP.connect(snBus); snBus.connect(this.layers.drums.input);
    const snRev = ctx.createGain(); snRev.gain.value = 0; snBus.connect(snRev); snRev.connect(revIn);
    this.setSnareReverb = v => snRev.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    const kickShaper = ctx.createWaveShaper(); kickShaper.curve = clipCurve(2.2); kickShaper.connect(this.layers.drums.input);
    const clickHP = ctx.createBiquadFilter(); clickHP.type = 'highpass'; clickHP.frequency.value = 2200; clickHP.connect(this.layers.drums.input);
    const rideBP = ctx.createBiquadFilter(); rideBP.type = 'bandpass'; rideBP.frequency.value = 6800; rideBP.Q.value = 1.6; rideBP.connect(this.layers.drums.input);
    const crashHP = ctx.createBiquadFilter(); crashHP.type = 'highpass'; crashHP.frequency.value = 5200; crashHP.connect(this.layers.drums.input);
    const BASS_CURVE = clipCurve(2.8);
    const subDirect = ctx.createGain(); subDirect.connect(this.layers.bass.input);
    const padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 1800; padFilter.Q.value = 1.4;
    padFilter.connect(this.layers.pads.input);
    { // slow shimmer movement on the pad filter
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 650;
      lfo.connect(lg); lg.connect(padFilter.detune); lfo.start();
    }
    this.padFilter = padFilter;
    this.setPadCutoff = (hz, t, tc) => padFilter.frequency.setTargetAtTime(hz, t === undefined ? ctx.currentTime : t, tc || 0.4);

    // ================================================================ DRUMS
    this.kick = function (t, vel, o) {
      o = o || {};
      const sub = !!o.sub;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      const end = t + (sub ? 0.5 : 0.3);
      if (!alloc('drums', t, end, g, true)) return;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(sub ? 120 : 165, t);
      osc.frequency.exponentialRampToValueAtTime(sub ? 40 : 47, t + (sub ? 0.11 : 0.065));
      g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * 0.95, t + 0.002);
      g.gain.exponentialRampToValueAtTime(EPS, end);
      osc.connect(g); g.connect(kickShaper); osc.start(t); osc.stop(end + 0.02); dropOnEnd(osc, g);
      if (!sub) { // short click
        const c = noiseSrc(), cg = ctx.createGain();
        cg.gain.setValueAtTime(vel * 0.28, t); cg.gain.exponentialRampToValueAtTime(EPS, t + 0.012);
        c.connect(cg); cg.connect(clickHP); c.start(t, rngOffset()); c.stop(t + 0.02); dropOnEnd(c, cg);
      }
    };
    let noff = 0;
    function rngOffset() { noff = (noff + 0.371) % 2.0; return noff; }
    this.snare = function (t, vel, o) {
      o = o || {};
      const ghost = !!o.ghost, rim = !!o.rim;
      const dur = rim ? 0.05 : ghost ? 0.07 : 0.2;
      const g = ctx.createGain();
      if (!alloc('drums', t, t + dur + 0.05, g, !ghost)) return;
      const n = noiseSrc();
      if (rim) {
        g.gain.setValueAtTime(vel * 0.45, t); g.gain.exponentialRampToValueAtTime(EPS, t + 0.04);
        n.connect(g); g.connect(snHP);
        const o1 = ctx.createOscillator(), og = ctx.createGain(); o1.type = 'triangle'; o1.frequency.setValueAtTime(520, t);
        og.gain.setValueAtTime(vel * 0.4, t); og.gain.exponentialRampToValueAtTime(EPS, t + 0.04);
        o1.connect(og); og.connect(snBus); o1.start(t); o1.stop(t + 0.06); dropOnEnd(o1, og);
      } else {
        g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * (ghost ? 0.5 : 0.72), t + 0.001);
        g.gain.exponentialRampToValueAtTime(EPS, t + dur);
        n.connect(g); g.connect(snHP);
        const o1 = ctx.createOscillator(), og = ctx.createGain(); o1.type = 'triangle';
        o1.frequency.setValueAtTime(ghost ? 230 : 205, t); o1.frequency.exponentialRampToValueAtTime(130, t + 0.07);
        og.gain.setValueAtTime(vel * (ghost ? 0.22 : 0.5), t); og.gain.exponentialRampToValueAtTime(EPS, t + (ghost ? 0.05 : 0.11));
        o1.connect(og); og.connect(snBus); o1.start(t); o1.stop(t + 0.14); dropOnEnd(o1, og);
      }
      n.start(t, rngOffset()); n.stop(t + dur + 0.04); dropOnEnd(n, g);
    };
    this.hat = function (t, vel, open) {
      const dur = open ? 0.24 : 0.04;
      const g = ctx.createGain();
      if (!alloc('drums', t, t + dur + 0.02, g, false)) return;
      const n = noiseSrc();
      g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * 0.42, t + 0.0012);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
      n.connect(g); g.connect(hatHP); n.start(t, rngOffset()); n.stop(t + dur + 0.02); dropOnEnd(n, g);
    };
    this.ride = function (t, vel) {
      const g = ctx.createGain();
      if (!alloc('drums', t, t + 0.5, g, false)) return;
      const n = noiseSrc();
      g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.001);
      g.gain.exponentialRampToValueAtTime(EPS, t + 0.4);
      n.connect(g); g.connect(rideBP); n.start(t, rngOffset()); n.stop(t + 0.45); dropOnEnd(n, g);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = 3150;
      og.gain.setValueAtTime(vel * 0.1, t); og.gain.exponentialRampToValueAtTime(EPS, t + 0.2);
      o.connect(og); og.connect(rideBP); o.start(t); o.stop(t + 0.25); dropOnEnd(o, og);
    };
    const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
    this.crash = function (t, vel) {
      const g = ctx.createGain();
      if (!alloc('drums', t, t + 1.8, g, true)) return;
      g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.002);
      g.gain.exponentialRampToValueAtTime(EPS, t + 1.7);
      g.connect(crashHP);
      METAL.forEach(f => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * 2.6; o.connect(g); o.start(t); o.stop(t + 1.75); });
      const n = noiseSrc(), ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * 0.25, t); ng.gain.exponentialRampToValueAtTime(EPS, t + 1.2);
      n.connect(ng); ng.connect(crashHP); n.start(t, rngOffset()); n.stop(t + 1.3); dropOnEnd(n, ng);
    };
    this.tom = function (t, vel, f) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      if (!alloc('drums', t, t + 0.35, g, true)) return;
      o.type = 'sine'; o.frequency.setValueAtTime(f * 1.7, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.002); g.gain.exponentialRampToValueAtTime(EPS, t + 0.3);
      o.connect(g); g.connect(kickShaper); o.start(t); o.stop(t + 0.34); dropOnEnd(o, g);
    };

    // ================================================================ BASS (mono)
    let lastBass = null;
    this.bass = function (t, midi, dur, vel, mode, o) {
      o = o || {};
      const f = J.mtof(midi);
      const end = t + dur;
      const g = ctx.createGain();
      const h = alloc('bass', t, end + 0.08, g, true);
      if (!h) return;
      if (lastBass && lastBass.end > t) { // monophonic: cut the previous note quickly
        try { lastBass.gain.gain.cancelScheduledValues(t); lastBass.gain.gain.setTargetAtTime(0, t, 0.004); } catch (e) { }
      }
      lastBass = h;
      const rel = 0.05;
      const stop = adsr(g.gain, t, 0.004, vel * 0.24, 0.12, 0.85, dur, rel);
      if (mode === 'reese') {
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5 + (o.res || 0);
        const lo = o.lo || 170, hi = o.hi || 1100, wob = Math.max(0.06, o.wob || 0.3);
        lp.frequency.setValueAtTime(lo, t);
        let tt = t, up = true;
        while (tt < end) { tt = Math.min(end, tt + wob); lp.frequency.exponentialRampToValueAtTime(up ? hi : lo * 1.2, tt); up = !up; }
        [-10, 9, 0].forEach((cents, i) => {
          const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f * (i === 2 ? 0.5 : 1); os.detune.value = cents;
          const og = ctx.createGain(); og.gain.value = i === 2 ? 0.28 : 0.4;
          os.connect(og); og.connect(lp); os.start(t); os.stop(stop + 0.02); if (i === 0) dropOnEnd(os, g);
        });
        const ws = ctx.createWaveShaper(); ws.curve = BASS_CURVE;   // grit, per note so the envelope comes after it
        lp.connect(ws); ws.connect(g); g.connect(this.layers.bass.input);
        const sub = ctx.createOscillator(), sg = ctx.createGain(); sub.type = 'sine'; sub.frequency.value = f;
        sg.gain.value = 0.55; sub.connect(sg); sg.connect(g); sub.start(t); sub.stop(stop + 0.02);
      } else if (mode === 'pluck') { // upright-ish walking bass
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1;
        lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.4, dur));
        const os = ctx.createOscillator(); os.type = 'triangle'; os.frequency.value = f;
        const os2 = ctx.createOscillator(); os2.type = 'sawtooth'; os2.frequency.value = f; const g2 = ctx.createGain(); g2.gain.value = 0.25;
        os.connect(lp); os2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(subDirect);
        os.start(t); os.stop(stop + 0.02); os2.start(t); os2.stop(stop + 0.02); dropOnEnd(os, g);
      } else { // deep sine sub with a little second harmonic so small speakers can hear it
        const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const g2 = ctx.createGain(); g2.gain.value = 0.34;
        os.connect(g); o2.connect(g2); g2.connect(g);
        if (o.glideFrom) { os.frequency.setValueAtTime(J.mtof(o.glideFrom), t); os.frequency.exponentialRampToValueAtTime(f, t + 0.05); }
        g.connect(subDirect);
        os.start(t); os.stop(stop + 0.02); o2.start(t); o2.stop(stop + 0.02); dropOnEnd(os, g);
      }
    };

    // ================================================================ KEYS (FM electric piano)
    this.keys = function (t, notes, dur, vel, o) {
      o = o || {};
      const strum = o.strum || 0.012;
      const per = vel / Math.sqrt(Math.max(notes.length, 1));
      notes.forEach((m, i) => {
        const tt = t + i * strum * (0.6 + 0.4 * ((i * 7) % 3));
        const f = J.mtof(m);
        const end = tt + dur;
        const g = ctx.createGain();
        if (!alloc('keys', tt, end + 0.6, g, true)) return;
        const car = ctx.createOscillator(), mod = ctx.createOscillator(), tine = ctx.createOscillator();
        car.type = 'sine'; mod.type = 'sine'; tine.type = 'sine';
        car.frequency.value = f; mod.frequency.value = f; tine.frequency.value = f * 14;
        const mg = ctx.createGain(), tg = ctx.createGain();
        const idx = (0.55 + 1.3 * vel) * f * (o.bright || 1);
        mg.gain.setValueAtTime(idx, tt); mg.gain.exponentialRampToValueAtTime(Math.max(idx * 0.18, EPS), tt + 0.9);
        tg.gain.setValueAtTime(f * 1.5 * vel, tt); tg.gain.exponentialRampToValueAtTime(EPS, tt + 0.07);
        mod.connect(mg); mg.connect(car.frequency); tine.connect(tg); tg.connect(car.frequency);
        const decay = 1.6 * Math.pow(600 / f, 0.35);
        const stop = adsr(g.gain, tt, 0.003, per * 0.72, decay, 0.02, dur, 0.18);
        car.connect(g); g.connect(this.layers.keys.input);
        // the modulators start a quarter cycle early (cosine phase at the note start), which keeps FM free of DC offset
        car.start(tt); mod.start(Math.max(0, tt - 0.25 / f)); tine.start(Math.max(0, tt - 0.25 / (14 * f)));
        car.stop(stop + 0.02); mod.stop(stop + 0.02); tine.stop(Math.min(stop, tt + 0.1) + 0.02);
        dropOnEnd(car, g);
      });
    };

    // ================================================================ TWINKLE (Karplus-Strong)
    const ksCache = new Map();
    function renderKS(midi, variant) {
      const f = J.mtof(midi), L = sr / f;
      const t60 = Math.max(0.9, Math.min(3.4, 3.0 * Math.pow(220 / f, 0.35)));
      const len = Math.floor(sr * Math.min(2.4, t60 + 0.3));
      const M = Math.ceil(L) + 4, buf = new Float32Array(M);
      const r = J.rng('ks', midi, variant);
      // excitation: noise, darkened a little, with a pluck-position comb
      let lp = 0;
      const exc = new Float32Array(M);
      for (let i = 0; i < Math.ceil(L); i++) { lp += (r.next() * 2 - 1 - lp) * 0.75; exc[i] = lp; }
      const pp = Math.floor(L * (0.18 + 0.03 * variant));
      for (let i = 0; i < Math.ceil(L); i++) buf[i] = exc[i] - (i >= pp ? exc[i - pp] * 0.8 : 0);
      let mean = 0; const nL = Math.ceil(L); for (let i = 0; i < nL; i++) mean += buf[i]; mean /= nL;
      for (let i = 0; i < nL; i++) buf[i] -= mean;                 // a string that starts with DC keeps it forever
      const rho = Math.pow(10, -3 / (t60 * f)), s = 0.8;
      const out = new Float32Array(len); let w = 0;
      for (let n = 0; n < len; n++) {
        // read L samples back, linear interpolation
        let rp = w - L; if (rp < 0) rp += M;
        const i0 = Math.floor(rp), fr = rp - i0, i1 = (i0 + 1) % M, i2 = (i0 + 2) % M;
        const x0 = buf[i0] * (1 - fr) + buf[i1] * fr, x1 = buf[i1] * (1 - fr) + buf[i2] * fr;
        const y = rho * (s * x0 + (1 - s) * x1);
        out[n] = x0; buf[w] = y; w = (w + 1) % M;
      }
      let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(out[i]));
      const k = 0.9 / (pk || 1), fin = Math.floor(sr * 0.0012), fout = Math.floor(sr * 0.09);
      for (let i = 0; i < len; i++) {
        let a = k; if (i < fin) a *= i / fin; if (i > len - fout) a *= (len - i) / fout; out[i] *= a;
      }
      const ab = ctx.createBuffer(1, len, sr); ab.getChannelData(0).set(out);
      return ab;
    }
    this.prepare = function (midi, variant) {          // pre-render (called a bar ahead of time)
      const key = midi + '|' + variant;
      if (!ksCache.has(key)) {
        if (ksCache.size > 120) ksCache.delete(ksCache.keys().next().value);
        ksCache.set(key, renderKS(midi, variant));
      }
      return ksCache.get(key);
    };
    // plucks that are still ringing, so a chord change can damp the ones that do not belong to the new chord
    let plucks = [];
    this.pluck = function (t, midi, vel, o) {
      o = o || {};
      const g = ctx.createGain();
      const buf = this.prepare(midi, o.variant || 0);
      const capped = !!o.cap;                                    // the second composer: no string rings longer than J.RING.newMax
      const ringEnd = t + (capped ? Math.min(buf.duration, J.RING.newMax) : buf.duration);
      if (!alloc('twinkle', t, ringEnd, g, vel > 0.35)) return;
      const src = ctx.createBufferSource(); src.buffer = buf;
      g.gain.value = vel * 0.8;
      if (capped && buf.duration > J.RING.newMax) { g.gain.setValueAtTime(vel * 0.8, ringEnd - 0.14); g.gain.linearRampToValueAtTime(0, ringEnd); }
      const damper = ctx.createGain();                           // nothing else touches this gain, so damping needs no cancel
      const pan = ctx.createStereoPanner(); pan.pan.value = o.pan || 0;
      src.connect(g); g.connect(damper); damper.connect(pan); pan.connect(this.layers.twinkle.input);
      src.start(t); if (capped) src.stop(ringEnd + 0.02);
      dropOnEnd(src, pan);
      plucks = plucks.filter(x => x.end > t - 0.5);
      plucks.push({ pc: ((midi % 12) + 12) % 12, t0: t, end: ringEnd, damper });
    };
    // chord change at time t: plucks whose pitch class is not in pcs fade out over `rel` seconds
    this.damp = function (t, pcs, rel) {
      rel = rel || J.RING.dampRel;
      plucks.forEach(x => {
        if (x.t0 < t - 0.03 && x.end > t + 0.02 && pcs.indexOf(x.pc) < 0 && !x.damped) {
          x.damped = true;
          try { x.damper.gain.setValueAtTime(1, t); x.damper.gain.linearRampToValueAtTime(0, t + rel); } catch (e) { }
        }
      });
    };

    // ================================================================ PADS (detuned saws)
    this.pad = function (t, notes, dur, vel, o) {
      o = o || {};
      const att = o.attack || 0.5, rel = o.release || 0.9;
      notes.forEach((m, i) => {
        const f = J.mtof(m);
        const g = ctx.createGain();
        if (!alloc('pads', t, t + dur + rel, g, true)) return;
        const per = vel / Math.sqrt(notes.length);
        const stop = adsr(g.gain, t, att, per * 0.26, 0.6, 0.8, dur, rel);
        [-12, 0, 12].forEach((c, k) => {
          const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = c + (i * 1.7 % 5);
          os.connect(g); os.start(t); os.stop(stop + 0.02); if (k === 0) dropOnEnd(os, g);
        });
        if ((o.shimmer || 0) > 0.05 && i >= notes.length - 2) { // neon shimmer on the top voices
          const sh = ctx.createOscillator(), sg = ctx.createGain(); sh.type = 'triangle'; sh.frequency.value = f * 2; sh.detune.value = 4;
          sg.gain.value = 0.35 * o.shimmer; sh.connect(sg); sg.connect(g); sh.start(t); sh.stop(stop + 0.02);
        }
        g.connect(padFilter);
      });
    };

    // ================================================================ LEAD (mono, portamento)
    let lastLead = null;
    this.lead = function (t, midi, dur, vel, o) {
      o = o || {};
      const f = J.mtof(midi), end = t + dur;
      const g = ctx.createGain();
      const h = alloc('lead', t, end + 0.12, g, true);
      if (!h) return;
      let startF = f, gliding = false;
      if (!o.hv && lastLead && lastLead.end > t - 0.04 && o.glide) { startF = lastLead.f; gliding = true; }
      if (!o.hv && lastLead && lastLead.end > t) { try { lastLead.gain.gain.cancelScheduledValues(t); lastLead.gain.gain.setTargetAtTime(0, t, 0.006); } catch (e) { } }
      if (!o.hv) lastLead = { end: end + 0.1, gain: g, f };
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3.5;
      const peakC = (o.bright || 1) * 4200;
      lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(peakC, t + 0.03); lp.frequency.exponentialRampToValueAtTime(1500 * (o.bright || 1), t + 0.35);
      const stop = adsr(g.gain, t, 0.008, vel * 0.5, 0.16, 0.65, dur, 0.1);
      const waves = o.wave === 'square' ? ['square', 'sawtooth'] : ['sawtooth', 'square'];
      waves.forEach((w, i) => {
        const os = ctx.createOscillator(); os.type = w; os.detune.value = i ? 8 : -5;
        if (gliding) { os.frequency.setValueAtTime(startF, t); os.frequency.exponentialRampToValueAtTime(f, t + (o.glideTime || 0.05)); } else os.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = i ? 0.35 : 0.65; os.connect(og); og.connect(lp);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.4;
        lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(11, t + 0.25); lfo.connect(lg); lg.connect(os.detune);
        os.start(t); lfo.start(t); os.stop(stop + 0.02); lfo.stop(stop + 0.02); if (i === 0) dropOnEnd(os, g);
      });
      lp.connect(g); g.connect(this.layers.lead.input);
    };
    // glassy FM bell, used by the NPC motif test
    this.bell = function (t, midi, vel, dur) {
      const f = J.mtof(midi), g = ctx.createGain();
      if (!alloc('lead', t, t + 1.6, g, true)) return;
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.6);
      mod.connect(mg); mg.connect(car.frequency);
      const stop = adsr(g.gain, t, 0.004, vel * 0.32, 0.5, 0.1, dur || 0.4, 0.9);
      car.connect(g); g.connect(this.layers.lead.input); car.start(t); mod.start(t); car.stop(stop + 0.02); mod.stop(stop + 0.02); dropOnEnd(car, g);
    };

    // ================================================================ TEXTURE
    const texIn = this.layers.texture.input;
    { // vinyl: sparse clicks and a faint hiss, a 7 second loop
      const len = Math.floor(sr * 7), b = ctx.createBuffer(2, len, sr), r = J.rng('vinyl');
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) { lp += (r.next() * 2 - 1 - lp) * 0.35; d[i] = lp * 0.012; }
        for (let k = 0; k < 7 * 9; k++) {
          const p = Math.floor(r.next() * (len - 400)), a = (0.1 + 0.5 * r.next() * r.next()) * (r.chance(0.12) ? 1 : 0.4);
          for (let j = 0; j < 90; j++) d[p + j] += (r.next() * 2 - 1) * a * Math.exp(-j / (6 + 20 * r.next()));
        }
        for (let i = 0; i < len; i++) if (i % 24000 === 0) d[i] += 0.02;
      }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      this.vinylGain = ctx.createGain(); this.vinylGain.gain.value = 0.5;
      s.connect(this.vinylGain); this.vinylGain.connect(texIn); s.start();
    }
    { // rain: bright noise bed plus droplets
      const len = Math.floor(sr * 6), b = ctx.createBuffer(2, len, sr), r = J.rng('rain');
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch); let lp = 0, hp = 0;
        for (let i = 0; i < len; i++) { const x = r.next() * 2 - 1; lp += (x - lp) * 0.5; hp += (lp - hp) * 0.04; d[i] = (lp - hp) * 0.16; }
        for (let k = 0; k < 6 * 55; k++) {
          const p = Math.floor(r.next() * (len - 300)), a = 0.05 + 0.25 * r.next();
          for (let j = 0; j < 40; j++) d[p + j] += (r.next() * 2 - 1) * a * Math.exp(-j / 4);
        }
      }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 11000;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      s.connect(hp); hp.connect(lpf); lpf.connect(this.rainGain); this.rainGain.connect(texIn); s.start();
    }
    { // city hum: mains-ish drones and distant traffic
      this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
      [[50, 'sine', 0.5], [100.6, 'sine', 0.3], [151.2, 'triangle', 0.12], [201, 'sine', 0.05]].forEach(([fr, ty, gv]) => {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.type = ty; o.frequency.value = fr; g.gain.value = gv * 0.16; o.connect(g); g.connect(this.humGain); o.start();
      });
      const n = noiseSrc(true), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 170; bp.Q.value = 0.9;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.06; lg.gain.value = 0.2; lfo.connect(lg); lg.connect(ng.gain); lfo.start();
      n.connect(bp); bp.connect(ng); ng.connect(this.humGain); n.start();
      this.humGain.connect(texIn);
    }
    this.setTexture = function (o) {
      const t = ctx.currentTime;
      if (o.vinyl !== undefined) this.vinylGain.gain.setTargetAtTime(o.vinyl, t, 0.3);
      if (o.rain !== undefined) this.rainGain.gain.setTargetAtTime(o.rain, t, 0.8);
      if (o.hum !== undefined) this.humGain.gain.setTargetAtTime(o.hum, t, 0.8);
    };
    this.radio = function (t, dur, vel) {
      const g = ctx.createGain();
      if (!alloc('texture', t, t + dur + 0.1, g, false)) return;
      const n = noiseSrc(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(1100, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur);
      g.gain.setValueAtTime(EPS, t);
      let tt = t; const r = J.rng('radio', Math.floor(t * 1000));
      while (tt < t + dur) { const seg = 0.01 + r.next() * 0.05; g.gain.linearRampToValueAtTime(vel * (0.2 + r.next() * 0.8), tt + 0.004); tt += seg; }
      g.gain.linearRampToValueAtTime(EPS, t + dur + 0.05);
      n.connect(bp); bp.connect(g); g.connect(texIn); n.start(t, rngOffset()); n.stop(t + dur + 0.08); dropOnEnd(n, g);
    };
    this.riser = function (t, dur, vel) {
      const n = noiseSrc(true), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5;
      bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(EPS, t); g.gain.exponentialRampToValueAtTime(vel * 0.5, t + dur * 0.97); g.gain.linearRampToValueAtTime(EPS, t + dur + 0.02);
      n.connect(bp); bp.connect(g); g.connect(texIn); n.start(t, 0.2); n.stop(t + dur + 0.05); dropOnEnd(n, g);
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1800, t + dur);
      og.gain.setValueAtTime(EPS, t); og.gain.exponentialRampToValueAtTime(vel * 0.06, t + dur * 0.97); og.gain.linearRampToValueAtTime(EPS, t + dur + 0.02);
      const lpo = ctx.createBiquadFilter(); lpo.type = 'lowpass'; lpo.frequency.value = 2500;
      o.connect(lpo); lpo.connect(og); og.connect(texIn); o.start(t); o.stop(t + dur + 0.05); dropOnEnd(o, og);
    };
    this.impact = function (t, vel) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
      g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.004); g.gain.exponentialRampToValueAtTime(EPS, t + 1.4);
      o.connect(g); g.connect(kickShaper); o.start(t); o.stop(t + 1.45); dropOnEnd(o, g);
      const n = noiseSrc(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.4, t); ng.gain.exponentialRampToValueAtTime(EPS, t + 0.9);
      n.connect(lp); lp.connect(ng); ng.connect(texIn); n.start(t, rngOffset()); n.stop(t + 1); dropOnEnd(n, ng);
    };

    // fade out everything that is still sounding (used when a new piece starts or playback stops)
    this.releaseAll = function (t, tc) {
      LAYERS.forEach(n => {
        voices[n].forEach(v => { try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, tc || 0.04); } catch (e) { } });
        voices[n].length = 0;
      });
      lastBass = null; lastLead = null;
    };

    // ---------------------------------------------------------------- sidechain-style pump
    this.duck = function (t, depth, rel) {
      ['pads', 'keys', 'twinkle', 'lead'].forEach((n, i) => {
        const d = depth * (n === 'pads' ? 1 : n === 'keys' ? 0.55 : n === 'twinkle' ? 0.35 : 0.5);
        const p = this.layers[n].duck.gain;
        p.setValueAtTime(1 - d, t);
        p.setTargetAtTime(1, t + 0.012, rel / 3);
      });
    };

    // ---------------------------------------------------------------- meters
    this.levels = function () {
      const out = {};
      const buf = this._mb || (this._mb = new Float32Array(256));
      LAYERS.forEach(n => {
        this.layers[n].meter.getFloatTimeDomainData(buf);
        let pk = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > pk) pk = a; }
        out[n] = pk;
      });
      return out;
    };
    this.reductionDb = () => comp.reduction;
  };
})(typeof window !== 'undefined' ? window : globalThis);
