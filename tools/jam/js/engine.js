// Neon Terrarium jam room: the scheduler. Reads bars from the composer one bar ahead of the music and schedules
// every note on the audio clock (the timer only wakes it up; it never decides when a note sounds).
(function (G) {
  'use strict';
  const J = G.Jam = G.Jam || {};

  J.Engine = function (ctx, synth, opts) {
    opts = opts || {};
    const self = this;
    this.ctx = ctx; this.synth = synth;
    this.P = J.defaultParams();
    this.G = { tod: 'day', rain: false, view: 'street' };
    this.textures = { vinyl: true, hum: true, radio: true };
    this.mods = J.applyGame(this.P, this.G);
    this.lookahead = opts.lookahead || 0.35;
    this.running = false;
    this.seed = '1';
    this.startParams = null;
    this.current = null;            // what is audible right now (for the display)
    this.stats = { bars: 0, late: 0, maxLate: 0 };
    let comp = null, queue = [], cur = null, stepIdx = 0, tNext = 0, barT0 = 0, stepDur = 0.086, ui = [], timer = null, worker = null;
    let epoch = 0;

    // ---------------------------------------------------------------- settings
    function pushMix() {
      const m = self.mods, s = self.synth;
      J.LAYERS.forEach(n => s.setStateScale(n, m.layerScale[n] === undefined ? 1 : m.layerScale[n]));
      s.setSpace(m.space);
      s.setWeatherCutoff(m.weatherHz);
      s.setTexture({ vinyl: self.textures.vinyl ? m.vinyl : 0, rain: m.rain, hum: self.textures.hum ? m.hum : 0 });
    }
    this.setParams = function (P) { this.P = Object.assign({}, this.P, P); this.mods = J.applyGame(this.P, this.G); pushMix(); };
    this.setGame = function (g) { this.G = Object.assign({}, this.G, g); this.mods = J.applyGame(this.P, this.G); pushMix(); };
    this.setTexture = function (o) { Object.assign(this.textures, o); pushMix(); };
    this.setGated = function (on) { synth.setGated(on); synth.setSnareReverb(on ? 0.5 : 0); this.gated = on; };
    pushMix();

    // ---------------------------------------------------------------- composing ahead
    function modsForCompose() {
      const m = self.mods;
      return { hatScale: m.hatScale, forceFull: m.forceFull, radio: self.textures.radio ? m.radio : 0 };
    }
    function composeNext() {
      const bar = comp.next(self.mods.eff, modsForCompose());
      // pre-render plucked strings a bar before they are needed
      bar.ev.forEach(e => {
        if (e.l !== 'twinkle') return;
        if (e.k === 'pluck') synth.prepare(e.n, e.variant || 0); else if (e.k === 'strum') e.notes.forEach(n => synth.prepare(n, 0));
      });
      queue.push(bar);
    }

    this.start = function (seed, atTime) {
      this.seed = String(seed);
      epoch++;
      synth.releaseAll(ctx.currentTime, 0.04);
      this.startParams = Object.assign({}, this.P);
      this.startGame = Object.assign({}, this.G);
      comp = new J.Composer(this.seed, this.mods.eff);
      this.song = comp.song;
      queue = []; cur = null; stepIdx = 0; ui = [];
      this.running = true;
      this.stats = { bars: 0, late: 0, maxLate: 0 };
      composeNext();                               // (this also pre-renders the first plucked strings, so take the time first)
      tNext = atTime !== undefined ? atTime : ctx.currentTime + 0.15;
      if (opts.manual) return;
      startTimer();
    };
    this.stop = function () {
      this.running = false; stopTimer();
      synth.releaseAll(ctx.currentTime, 0.05);
    };

    // ---------------------------------------------------------------- scheduling
    function dispatch(ev, t, sd, bar) {
      const dur = Math.max(0.04, (ev.d || 1) * sd);
      switch (ev.l) {
        case 'drums':
          switch (ev.k) {
            case 'kick': synth.kick(t, ev.v, { sub: ev.sub }); break;
            case 'snare': synth.snare(t, ev.v, { ghost: ev.ghost, rim: ev.rim }); break;
            case 'hat': synth.hat(t, ev.v, ev.open); break;
            case 'ride': synth.ride(t, ev.v); break;
            case 'crash': synth.crash(t, ev.v); break;
            case 'tom': synth.tom(t, ev.v, ev.f); break;
          } break;
        case 'bass': synth.bass(t, ev.n, dur, ev.v, ev.mode, ev); break;
        case 'keys': synth.keys(t, ev.notes, dur, ev.v, ev); break;
        case 'twinkle':
          if (ev.k === 'pluck') synth.pluck(t, ev.n, ev.v, ev);
          else ev.notes.forEach((n, i) => synth.pluck(t + i * 0.014, n, ev.v * (0.85 + 0.05 * i), { variant: 0, pan: (i - 1.5) * 0.25 }));
          break;
        case 'pads': synth.pad(t, ev.notes, dur, ev.v, ev); break;
        case 'lead': synth.lead(t, ev.n, dur, ev.v, ev); break;
        case 'texture':
          if (ev.k === 'riser') synth.riser(t, dur, ev.v);
          else if (ev.k === 'impact') synth.impact(t, ev.v);
          else if (ev.k === 'radio') synth.radio(t, dur, ev.v);
          break;
        case 'fx':
          if (ev.k === 'duck') synth.duck(t, ev.depth, ev.rel);
          else if (ev.k === 'padcut') synth.setPadCutoff(ev.hz, t, 0.6);
          break;
      }
    }
    const SWUNG = { drums: 1, bass: 1, keys: 1, twinkle: 1, lead: 1 };

    function scheduleStep(bar, si, t, sd) {
      const now = ctx.currentTime;
      const list = bar.byStep[si];
      for (let i = 0; i < list.length; i++) {
        const ev = list[i];
        let tt = t + (ev.s - si) * sd;
        if (bar.swing > 0 && SWUNG[ev.l] && Math.abs((ev.s % 4) - 2) < 0.01) tt += bar.swing * 0.667 * sd;
        const amp = ev.l === 'drums' ? 0.003 : 0.008;
        tt += (J.u(bar.secId, bar.barNo, ev.l, ev.k, ev.s, i) - 0.5) * amp;
        if (tt < t - 0.01) tt = t;
        if (!opts.manual && tt < now - 0.005) { self.stats.late++; continue; }
        if (!opts.manual) self.stats.maxLate = Math.max(self.stats.maxLate, now - tt);
        dispatch(ev, tt, sd, bar);
      }
    }

    this.pump = function (until) {
      while (this.running && tNext < until) {
        if (!cur) {
          cur = queue.shift();
          if (!cur) { composeNext(); cur = queue.shift(); }
          stepIdx = 0; barT0 = tNext;
          stepDur = 60 / cur.bpm / 4 / cur.clock;
          this.stats.bars++;
          composeNext();                       // compose the following bar now so its notes can be prepared early
          synth.setDelayTime(3 * stepDur, tNext);
          ui.push({ t: tNext, bar: cur, stepDur });
        }
        if (stepIdx % 4 === 0 && this.gated) synth.gateBeat(tNext, stepDur * 4);
        scheduleStep(cur, stepIdx, tNext, stepDur);
        if (stepIdx % 2 === 0) ui.push({ t: tNext, step: stepIdx, bar: cur, stepDur, tick: true });
        tNext += stepDur; stepIdx++;
        if (stepIdx >= cur.steps) cur = null;
      }
    };
    // seconds of music scheduled ahead of the audio clock (a health figure for the display)
    this.slack = () => tNext - ctx.currentTime;

    // ---------------------------------------------------------------- timer (a worker, so a busy or hidden tab still wakes up)
    function tick() {
      if (!self.running) return;
      const now = ctx.currentTime;
      if (tNext < now - 0.5) { // we fell far behind (the tab was frozen): fast-forward without sounding
        const save = opts.manual; opts.manual = false;
        self.pump(now - 0.2);
        opts.manual = save;
      }
      self.pump(now + self.lookahead);
    }
    function startTimer() {
      stopTimer();
      try {
        const blob = new Blob(['let id=null;onmessage=e=>{if(e.data==="start"){clearInterval(id);id=setInterval(()=>postMessage(1),30)}else{clearInterval(id)}}'], { type: 'text/javascript' });
        worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = tick; worker.postMessage('start');
      } catch (e) { worker = null; timer = setInterval(tick, 30); }
    }
    function stopTimer() { if (worker) { try { worker.postMessage('stop'); worker.terminate(); } catch (e) { } worker = null; } if (timer) { clearInterval(timer); timer = null; } }

    // ---------------------------------------------------------------- display clock (call from requestAnimationFrame)
    this.poll = function (now) {
      let changed = false;
      while (ui.length && ui[0].t <= now) {
        const u = ui.shift();
        const b = u.bar;
        if (!u.tick) {
          this.current = { bar: b, startT: u.t, stepDur: u.stepDur, step: 0 };
          changed = true;
        } else if (this.current && this.current.bar === b) { this.current.step = u.step; this.current.lastTickT = u.t; changed = true; }
      }
      return changed;
    };
    this.chordNow = function () {
      const c = this.current; if (!c) return null;
      let name = c.bar.segs[0].name;
      for (const sg of c.bar.segs) if (c.step >= sg.s0 && c.step < sg.s1) name = sg.name;
      return name;
    };

    // ---------------------------------------------------------------- NPC motif test
    this.playMotif = function (npcSeed) {
      const song = (comp && comp.song) || J.makeSong('npc-preview', this.mods.eff);
      const m = J.npcMotif(npcSeed, song, this.mods.eff);
      const unit = 60 / song.bpm;                 // an eighth of the motif grid = one beat of the base tempo
      const t0 = ctx.currentTime + 0.06;
      m.notes.forEach(n => synth.bell(t0 + n.t * unit * 0.5, n.midi, 0.7, n.d * unit * 0.5));
      return Object.assign({ names: m.notes.map(n => J.noteName(n.midi)), seconds: m.length * unit * 0.5, keyName: J.NOTE_NAMES[song.tonic] + ' ' + m.scale }, m);
    };

    // ---------------------------------------------------------------- snapshot for ratings
    this.snapshot = function () {
      const c = this.current;
      return {
        seed: this.seed, params: Object.assign({}, this.P), startParams: this.startParams, game: Object.assign({}, this.G),
        song: this.song ? { key: J.NOTE_NAMES[this.song.tonic] + ' ' + this.song.mode, bpm: this.song.bpm, home: this.song.home.id, alt: this.song.alt.id, alt2: this.song.alt2.id, scale: this.song.scaleName } : null,
        at: c ? { section: c.bar.kind + ' ' + (c.bar.barNo + 1) + '/' + c.bar.bars, meter: c.bar.meter.id, bar: c.bar.barCount } : null,
      };
    };
  };

  // ------------------------------------------------------------------------------------------
  // offline render (used for testing: renders a seed without a speaker)
  // ------------------------------------------------------------------------------------------
  J.renderOffline = async function (o) {
    const sr = o.sampleRate || 44100, secs = o.seconds || 60;
    const ctx = new OfflineAudioContext(2, Math.floor(sr * secs), sr);
    const synth = new J.Synth(ctx);
    const eng = new J.Engine(ctx, synth, { manual: true });
    if (o.params) eng.setParams(o.params);
    if (o.game) eng.setGame(o.game);
    if (o.mix) Object.keys(o.mix).forEach(k => { if (o.mix[k].mute) synth.setMute(k, true); if (o.mix[k].solo) synth.setSolo(k, true); });
    eng.start(o.seed, 0.05);
    const log = [];
    eng.onBar = null;
    eng.pump(secs);
    const buf = await ctx.startRendering();
    return buf;
  };
})(typeof window !== 'undefined' ? window : globalThis);
