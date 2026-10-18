// Neon Terrarium: the Booth, the Acoustic Panel's second mode. A resident plays into the Grid: pick a carrier pattern
// and a voice, play the magic keys over the loop, record takes as layers, let the autopilot answer, keep loops on a shelf.
//  - Magic keys: twelve pads, low to high, each always a note that fits the chord sounding now (the chord's own voicing
//    and its motif tones, which the patterns were written to sound sweet together). When the chord changes the pads
//    retune, and a held note moves to its pad's new note, so nothing can clash.
//  - A take is stored as pads, not pitches (pad 5 at beat 3.5 for 1.5 beats), so it plays back on whatever chord is
//    under it: the same tune fits a different pattern too.
//  - The autopilot treats the layers as its theme: it answers in the gaps you leave (echoes, sequences, turned-over
//    and fragment versions of your phrases, in a register just above or below yours) and lays a soft harmony under your
//    long notes. It never sounds in your gaps-free spots except as that harmony, never on your pitch, and never over
//    its own notes; it builds up over several passes and settles back.
//  - Loops are kept in the city's save (localStorage 'neonIsland.booth'), with the pattern, voice, clock and layers.
// While the Booth is open the broadcast steps aside (grid.js setBooth, grid_engine.js boothHold) and the city is paused
// (the panel holds it). Loaded after grid.js.
'use strict';
const BOOTH = (() => {
  const B = {}, E = GRID_ENGINE, root = GRIDPANEL.el, $ = id => document.getElementById(id);
  const KEY = 'neonIsland.booth';
  const NP = 12, AP = 16;   // pads you play; the autopilot may reach four above them
  const KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];
  const KLAB = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']'];
  const VOICES = [
    { id: 'glass', name: 'Night glass', sub: 'soft electric piano' },
    { id: 'pluck', name: 'Gutter pluck', sub: 'plucked string' },
    { id: 'bell', name: 'Lamp-post bell', sub: 'ringing chime' },
    { id: 'lead', name: 'Neuro lead', sub: 'smooth held synth' },
    { id: 'choir', name: 'Rooftop choir', sub: 'breathy sung pad' },
    { id: 'sampler', name: 'Song sampler', sub: 'held notes from your song', song: true },
    { id: 'chops', name: 'Song chops', sub: "your song's own chords, as stabs", song: true },
  ];
  const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const parse = n => { const m = /^([A-G])([b#]?)(-?\d+)$/.exec(n || ''); if (!m) return null; const pc = (PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; return { pc, midi: (parseInt(m[3], 10) + 1)*12 + PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) }; };
  const SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], FL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const mf = m => 440*Math.pow(2, (m - 69)/12);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- what's set, and the shelf (both kept with the city) ----------
  const S = { padLvl: 1, chopLvl: 1, song: null, prog: 0, len: 8, voice: 'glass', bpm: 84, tidy: .5, click: 'count', ap: false, apAmt: .55, layers: [] };
  let loops = [], loadedId = null, mode = 'console';
  try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o){ if (o.set) Object.assign(S, o.set); if (Array.isArray(o.loops)) loops = o.loops; } } catch (e){}
  S.layers = Array.isArray(S.layers) ? S.layers : [];
  let saveT = 0;
  let bc = null;   // a shelf loop on the broadcast (the Console): { id, mode: 'logged' | 'rewire', stash: the Booth's own setup, base bpm }
  const store = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify({ set: bc ? bc.stash : S, loops })); } catch (e){} }, 300); };

  // ---------- the chords and their pads ----------
  const PROGS = E.progressions;
  const chordOf = bar => { const k = ((bar % S.len) + S.len) % S.len; return (bc && driftSeq && driftSeq[k]) || baseChord(k); };
  const baseChord = bar => {
    const k = ((bar % S.len) + S.len) % S.len;
    if (S.prog === 'song' && S.song){ const L0 = S.song.list; return S.song.cs[L0[Math.min(L0.length - 1, S.song.start + k)]] || S.song.cs[0]; }
    const p = PROGS[S.prog] || PROGS[0]; return p.chords[k % p.chords.length];
  };
  // a song's sounds (booth_song.js): the sampler's held notes and the bars' chops; kept in IndexedDB, back when needed
  let songSounds = null, songKey = null, songRecut = null;
  async function ensureSong(){
    if (!S.song || songKey === S.song.key) return !!songSounds;
    songKey = S.song.key; songSounds = null; songRecut = null; audio();
    songSounds = await BOOTHSONG.sounds(ctx, S.song.key);
    if (!songSounds){ flash("This song's samples aren't on this computer: load the song again for its sound"); if (VOICES.find(v => v.id === S.voice).song) setVoice('glass'); }
    voiceAvail(); return !!songSounds;
  }
  const padCache = new Map();
  function padsFor(ch){
    let v = padCache.get(ch); if (v) return v;
    const notes = ch.notes.map(parse).filter(Boolean), motif = (ch.motif || []).map(parse).filter(Boolean);
    const safe = new Set([...notes, ...motif].map(n => n.pc)), core = new Set(notes.map(n => n.pc)), rootPc = notes[0] ? notes[0].pc : 0;
    const list = []; for (let m = 55; m <= 100; m++) if (safe.has(m % 12)) list.push(m);
    let s0 = list.findIndex(m => m >= 60); if (s0 < 0) s0 = 0; s0 = Math.min(s0, Math.max(0, list.length - AP));
    const flats = ch.notes.some(n => n.includes('b')) || ch.name.includes('b');
    v = { m: list.slice(s0, s0 + AP), core, rootPc, names: flats ? FL : SH };
    padCache.set(ch, v); return v;
  }
  const padMidi = (ch, i) => { const p = padsFor(ch).m; return p[clamp(i, 0, p.length - 1)]; };

  // ---------- sounds: five voices, each a note that starts now and stops when let go ----------
  let ctx = null, bus = null;
  function audio(){ if (!E.ctx) E.initAudio(); ctx = E.ctx; if (!bus) bus = E.boothBuses(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  function env(t, peak, att){ const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); return g; }
  function release(g, t, rel, nodes){
    const p = g.gain; if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
    p.setTargetAtTime(0.0001, t, rel/3); nodes.forEach(o => { try { o.stop(t + rel*2 + .05); } catch (e){} });
  }
  function voiceOn(voice, midi, t, vel, pan, dest, pad = 5, bar = 0){
    audio(); t = Math.max(ctx.currentTime, t); dest = dest || bus.lead;
    if (voice === 'sampler' && songSounds && songSounds.samples.length){   // the nearest held note from the song, played at this pitch and looped while held
      let s = songSounds.samples[0]; for (const x of songSounds.samples) if (Math.abs(x.root - midi) < Math.abs(s.root - midi)) s = x;
      const src = ctx.createBufferSource(), g = env(t, .55*vel*(S.chopLvl ?? 1), .008), pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan || 0, -.9, .9);
      src.buffer = s.buf; src.playbackRate.value = Math.pow(2, (midi - s.root)/12); src.loop = true; src.loopStart = s.ls; src.loopEnd = s.le;
      src.connect(g); g.connect(pn); pn.connect(dest); src.start(t);
      return { off(t2){ release(g, Math.max(t2, t + .03), .3, [src]); } };
    }
    if (voice === 'chops' && songSounds && songSounds.chops.length){   // the song's own chord at this bar: a beat of it, pads in four columns of beats and three octaves
      const bc = songSounds.chops[((bar % songSounds.chops.length) + songSounds.chops.length) % songSounds.chops.length] || [], c = bc[pad % 4] || bc.find(Boolean);
      if (c){ const src = ctx.createBufferSource(), g = env(t, .7*vel*(S.chopLvl ?? 1), .004), pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan || 0, -.9, .9);
        src.buffer = c; src.playbackRate.value = [.5, 1, 2, 2][Math.min(3, Math.floor(pad/4))]; src.connect(g); g.connect(pn); pn.connect(dest); src.start(t);
        return { off(t2){ release(g, Math.max(t2, t + .12), .12, [src]); } }; }
    }
    if (voice === 'sampler' || voice === 'chops') voice = 'glass';   // (no song sounds: a stand-in)
    const f = mf(midi), pn = ctx.createStereoPanner(); pn.pan.value = clamp(pan || 0, -.9, .9); pn.connect(dest);
    if (voice === 'pluck'){ E.pluck(f, t, 1.2, .55*vel, pan || 0, dest); return { off(){} }; }
    if (voice === 'glass'){   // FM electric piano: a sine carrier, a modulator at the same pitch whose depth falls away, a quick tine on top
      const c = ctx.createOscillator(), mo = ctx.createOscillator(), mg = ctx.createGain(), ti = ctx.createOscillator(), tg = ctx.createGain(), g = env(t, .2*vel, .006);
      c.frequency.value = f; mo.frequency.value = f; ti.frequency.value = f*4.01;
      mg.gain.setValueAtTime(f*2.2, t); mg.gain.setTargetAtTime(f*.35, t, .35); mo.connect(mg); mg.connect(c.frequency);
      tg.gain.setValueAtTime(.05*vel, t); tg.gain.setTargetAtTime(0.0001, t, .05); ti.connect(tg); tg.connect(g);
      g.gain.setTargetAtTime(.07*vel, t + .01, .9); c.connect(g); g.connect(pn);
      [c, mo, ti].forEach(o => { o.start(t); o.stop(t + 8); });
      return { off(t2){ release(g, Math.max(t2, t + .02), .35, [c, mo, ti]); } };
    }
    if (voice === 'bell'){   // a struck chime: a sine with its octave and a slightly sharp twelfth, ringing down
      const g = env(t, .17*vel, .004), os = [[1, 1], [2, .4], [3.01, .16]].map(([r, a]) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f*r; og.gain.setValueAtTime(a, t); og.gain.setTargetAtTime(0.0001, t, r > 1 ? .4 : 1.1); o.connect(og); og.connect(g); o.start(t); o.stop(t + 6); return o; });
      g.gain.setTargetAtTime(0.0001, t + .01, 1.2); g.connect(pn);
      return { off(t2){ release(g, Math.max(t2, t + .25), .6, os); } };
    }
    if (voice === 'lead'){   // a held synth: triangle and a quiet saw through a soft filter, a slow vibrato once it's held
      const a = ctx.createOscillator(), b = ctx.createOscillator(), bg = ctx.createGain(), lp = ctx.createBiquadFilter(), g = env(t, .11*vel, .03);
      a.type = 'triangle'; b.type = 'sawtooth'; a.frequency.value = f; b.frequency.value = f; b.detune.value = 4; bg.gain.value = .25;
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = .6;
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(5, t + .6); lfo.connect(lg); lg.connect(a.detune); lg.connect(b.detune);
      a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(pn);
      [a, b, lfo].forEach(o => { o.start(t); o.stop(t + 30); });
      return { off(t2){ release(g, Math.max(t2, t + .04), .25, [a, b, lfo]); } };
    }
    // choir: two detuned saws through two vowel formants, a slow breath in and out
    const a = ctx.createOscillator(), b = ctx.createOscillator(), g = env(t, .1*vel, .18), mix = ctx.createGain(); mix.gain.value = .5;
    a.type = b.type = 'sawtooth'; a.frequency.value = b.frequency.value = f; a.detune.value = -9; b.detune.value = 9;
    a.connect(mix); b.connect(mix);
    [[700, 6, 1], [1150, 7, .7], [2500, 8, .25]].forEach(([fr, q, l]) => { const bp = ctx.createBiquadFilter(), lg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q; lg.gain.value = l*1.6; mix.connect(bp); bp.connect(lg); lg.connect(g); });
    g.connect(pn); [a, b].forEach(o => { o.start(t); o.stop(t + 30); });
    return { off(t2){ release(g, Math.max(t2, t + .1), .6, [a, b]); } };
  }
  // the carrier under the loop: the chord's own voicing as a soft pad with its root underneath
  let padV = null, padCh = null;
  function padTo(ch, t){
    audio();
    if (padV){ const old = padV; old.g.gain.cancelScheduledValues(t); old.g.gain.setTargetAtTime(0.0001, t, .25); old.o.forEach(o => { try { o.stop(t + 2); } catch (e){} }); }
    padV = null; padCh = ch; if (!ch) return;
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(), o = []; lp.type = 'lowpass'; lp.frequency.value = 1050; lp.Q.value = .5;
    g.gain.setValueAtTime(0.0001, t); g.gain.setTargetAtTime(S.padLvl ?? 1, t, .2); lp.connect(g); g.connect(bus.pad);
    ch.notes.forEach((n, k) => { const pm = parse(n); if (!pm) return; [-6, 6].forEach(dt => { const os = ctx.createOscillator(), og = ctx.createGain(); os.type = k % 2 ? 'triangle' : 'sawtooth'; os.frequency.value = mf(pm.midi); os.detune.value = dt; og.gain.value = .018; os.connect(og); og.connect(lp); os.start(t); o.push(os); }); });
    const r = parse(ch.notes[0]); if (r){ const s = ctx.createOscillator(), sg = ctx.createGain(); let fr = mf(r.midi); if (fr > 95) fr /= 2; s.frequency.value = fr; sg.gain.value = .14; s.connect(sg); sg.connect(g); s.start(t); o.push(s); }
    padV = { g, o };
  }
  function click(t, accent){
    audio(); if (!E.out) return;
    const n = ctx.createBufferSource(), len = Math.floor(ctx.sampleRate*.03), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2 - 1)*Math.exp(-i/(len*.18));
    const hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = accent ? 2400 : 4200; g.gain.value = accent ? .5 : .28;
    n.buffer = b; n.connect(hp); hp.connect(g); g.connect(E.out); n.start(t);
  }

  // ---------- the loop's clock: beats counted from t0 (bar 0 of the first pass); the count-in is beats -4 to -1 ----------
  let playing = false, t0 = 0, schedTo = 0, lastBar = null, apCache = new Map();
  const beatSec = () => 60/S.bpm, L = () => S.len*4;
  const nowBeat = () => playing ? (ctx.currentTime - t0)/beatSec() : 0;
  const tOf = beat => t0 + beat*beatSec();
  const scheduled = [];   // { t, fn } run when their time comes (pad lights, retuning)
  function at(t, fn){ scheduled.push({ t, fn }); }
  function start(countIn){
    audio(); if (playing) return;
    playing = true; t0 = ctx.currentTime + .08 + (countIn ? 4*beatSec() : 0); schedTo = countIn ? -4 : 0; lastBar = null; apCache.clear();
    $('bPlay').textContent = 'Stop'; $('bPlay').classList.add('on');
  }
  function stop(){
    if (!playing) return; playing = false;
    if (rec) endRec(true);
    for (const k of [...held.keys()]) noteUp(k);
    padTo(null, ctx.currentTime); scheduled.length = 0; lastBar = null;
    root.querySelectorAll('.bkey.pl, .bkey.ap').forEach(k => k.classList.remove('pl', 'ap'));
    $('bPlay').textContent = 'Play'; $('bPlay').classList.remove('on'); status();
  }
  function setBpm(v){ if (playing){ const b = nowBeat(); S.bpm = v; t0 = ctx.currentTime - b*beatSec(); } else S.bpm = v; }
  function tick(){
    if (!playing || !ctx) return;
    const now = ctx.currentTime, until = (now + .14 - t0)/beatSec();
    for (let i = scheduled.length - 1; i >= 0; i--) if (scheduled[i].t <= now + .01){ const s = scheduled[i]; scheduled.splice(i, 1); try { s.fn(); } catch (e){} }
    if (bc){ S.ap = layerOn('g-leadLoopBtn'); const v = +($('g-bpmSlider') || { value: S.bpm }).value; if (v && v !== S.bpm) setBpm(v); }
    while (schedTo < until){
      const b = schedTo, t = tOf(b), Lb = L();
      if (b < 0){ click(t, b === -4); schedTo++; continue; }
      const cyc = Math.floor(b/Lb), lb = b - cyc*Lb;
      if (S.click === 'all' || (S.click === 'count' && rec && rec.armed && b >= rec.from - 4 && b < rec.from)) click(t, lb % 4 === 0);
      if (bc && lb === 0) prepDrift(cyc);
      if (lb % 4 === 0){ const ch = chordOf(lb/4); if (ch !== padCh || lastBar === null) padTo(ch, t); lastBar = lb/4; at(t, () => retune(ch, t, lb/4));
        if (bc && S.song && songSounds && songSounds.chops.length) voiceOn('chops', 60, t, .32*(S.padLvl ?? 1), 0, bus.pad, 4, lb/4).off(t + 4*beatSec());   // (the song's own chord under the bar)
        if (bc && lb === 0) at(t, () => bcPass(cyc)); }
      // the layers and the autopilot's part, for the notes that start in this beat
      for (const layer of S.layers) for (const n of layer) if (n.b >= lb && n.b < lb + 1) playNote(n, cyc*Lb + n.b, false);
      if (S.ap && S.layers.length){ let part = apCache.get(cyc); if (!part){ part = improvise(cyc); apCache.set(cyc, part); if (apCache.size > 3) apCache.delete(Math.min(...apCache.keys())); }
        for (const n of part) if (n.b >= lb && n.b < lb + 1) playNote(n, cyc*Lb + n.b, true); }
      schedTo++;
    }
    if (rec){
      const nb = nowBeat();
      if (rec.armed && nb >= rec.from - .25){ rec.armed = false; rec.live = true; status(); }
      if (rec.live && nb >= rec.from + L()) endRec(false);
    }
  }
  setInterval(tick, 25);
  const songVoice = () => songSounds && songSounds.samples.length ? 'sampler' : 'chops';
  function voiceFor(n, isAp){
    if (!(bc && S.prog === 'song' && songSounds)) return S.voice;
    if (!isAp) return (VOICES.find(v => v.id === S.voice) || {}).song ? S.voice : songVoice();
    return songSounds.chops.length && Math.abs(n.b - Math.round(n.b)) < .01 && n.b % 2 < .01 ? 'chops' : songVoice();   // (the autopilot: chops on the strong beats, held notes between)
  }
  function playNote(n, absBeat, isAp){
    const bar = Math.floor((absBeat % L())/4), ch = chordOf(bar), m = padMidi(ch, n.i), t = tOf(absBeat), vo = voiceFor(n, isAp);
    const h = voiceOn(vo, m, t, (n.v || .8)*(isAp ? .72 : 1), isAp ? .35 : -.1, null, n.i, bar);
    h.off(t + Math.max(.12, n.d*beatSec()));
    if (bc) echo(n, absBeat, vo, ch, bar);
    if (bc && bus){ const ml = +(($('g-motifLevelSlider') || {}).value || .68), dl = +(($('g-droneLevelSlider') || {}).value || .8); bus.lead.gain.setTargetAtTime(ml/.68, t, .2); bus.pad.gain.setTargetAtTime(dl/.8, t, .2); }
    if (n.i < NP){ at(t, () => light(n.i, isAp, true)); at(t + Math.max(.12, n.d*beatSec()), () => light(n.i, isAp, false)); }
  }
  // the broadcast's dispersion on the loop's notes: Mosaic echoes an octave up on the off-beat, Haze lets a soft long copy
  // bloom after, Glitch stutters strong-beat notes; how often, by the Console's density
  function echo(n, absBeat, vo, ch, bar){
    const den = +(($('g-granularMixSlider') || {}).value || .5), mode = E.mode, t = tOf(absBeat), bs = beatSec(), m = padMidi(ch, n.i), barEnd = tOf(Math.floor(absBeat/4)*4 + 4) - .03;
    if (mode === 'MOSAIC' && Math.random() < den*.6){ const t2 = t + bs*({ '1/4': 1, '1/8.': .75, '1/8': .5, '1/8T': 1/3, '1/16': .25 }[E.subdiv] || .5); if (t2 < barEnd) voiceOn(vo, m + 12, t2, .22, .5, null, Math.min(AP - 1, n.i + 4), bar).off(Math.min(barEnd, t2 + bs*.4)); }
    else if (mode === 'HAZE' && Math.random() < den*.5){ const t2 = t + bs*.5; if (t2 < barEnd) voiceOn(vo, m, t2, .16, -.5, null, n.i, bar).off(Math.min(barEnd, t2 + Math.max(1, n.d*2)*bs)); }
    else if (mode === 'ARP' && Math.abs(n.b - Math.round(n.b)) < .01 && Math.random() < den*.55){ for (let k = 1; k <= 3; k++){ const t2 = t + k*bs/8; if (t2 < barEnd) voiceOn(vo, m, t2, .3*(1 - k/4), (k % 2 ? .4 : -.4), null, n.i, bar).off(t2 + bs/10); } }
  }
  function light(i, isAp, on){ const k = keysEl[i]; if (k) k.classList.toggle(isAp ? 'ap' : 'pl', on); }

  // ---------- playing the pads ----------
  const held = new Map();   // pad -> { h, m, from (beat), note (in the take, if recording) }
  const curBar = () => playing && nowBeat() >= 0 ? Math.floor((nowBeat() % L())/4) : 0;
  function noteDown(i, vel = .85){
    audio(); if (held.has(i)) return;
    const ch = chordOf(curBar()), m = padMidi(ch, i), h = voiceOn(S.voice, m, ctx.currentTime, vel, -.1, null, i, curBar());
    const e = { h, m, vel, note: null }; held.set(i, e);
    if (rec && rec.live){ e.note = { b: recPos(), d: 0, i, v: vel }; e.from = Math.max(nowBeat(), rec.from); rec.take.push(e.note); }
    keysEl[i] && keysEl[i].classList.add('down');
  }
  function noteUp(i){
    const e = held.get(i); if (!e) return; held.delete(i);
    e.h.off(ctx.currentTime);
    if (e.note) e.note.d = Math.max(.1, Math.min(L() - e.note.b, nowBeat() - e.from));
    keysEl[i] && keysEl[i].classList.remove('down');
  }
  // a chord change: the pads take the new chord's notes; a held note moves to its pad's new note (and a take records the move)
  function retune(ch, t, bar = 0){
    drawKeys(ch);
    for (const [i, e] of held){
      const m = padMidi(ch, i); if (m === e.m) continue;
      e.h.off(t); e.h = voiceOn(S.voice, m, t, e.vel*.75, -.1, null, i, bar); e.m = m;
      if (e.note){ e.note.d = Math.max(.1, nowBeat() - e.from); if (rec && rec.live && nowBeat() < rec.from + L() - .1){ e.note = { b: recPos(), d: 0, i, v: e.vel*.75 }; e.from = nowBeat(); rec.take.push(e.note); } else e.note = null; }
    }
  }

  // ---------- recording: one pass of the loop; each take becomes a layer ----------
  let rec = null;   // { from (beat the take starts), armed, live, take: [] }
  const recPos = () => { const nb = Math.max(nowBeat(), rec.from); return ((nb % L()) + L()) % L(); };   // (a press a hair early counts from the bar line)
  function record(){
    audio();
    if (rec){ endRec(true); return; }   // pressed again: cancel
    if (!playing){ start(true); rec = { from: 0, armed: true, live: false, take: [] }; }
    else { const nb = nowBeat(); rec = { from: Math.max(0, Math.ceil((nb + .5)/4)*4), armed: true, live: false, take: [] }; }   // (from the next bar line, for one full pass)
    status();
  }
  function endRec(cancel){
    const r = rec; rec = null;
    if (!cancel && r){
      for (const e of held.values()) if (e.note){ e.note.d = Math.max(.1, Math.min(L() - e.note.b, nowBeat() - e.from)); e.note = null; }
      const take = r.take.filter(n => n.d > 0).map(n => tidy(n)).filter(n => n.b < L());
      if (take.length){ S.layers.push(take); apCache.clear(); loadedId = null; store(); }
    }
    status(); renderShelf();
  }
  function tidy(n){
    const g = .25, k = S.tidy, b = n.b + (Math.round(n.b/g)*g - n.b)*k;
    let d = n.d; if (k >= 1) d = Math.max(g, Math.round(d/g)*g); else d = Math.max(.12, d);
    return { b: Math.max(0, +b.toFixed(3)), d: +d.toFixed(3), i: n.i, v: +(n.v || .8).toFixed(2) };
  }

  // ---------- the autopilot: your layers are its theme ----------
  function rng(seed){ let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s/4294967296; }; }
  function improvise(cyc){
    const Lb = L(), core = S.layers.flat().slice().sort((a, b) => a.b - b.b); if (!core.length) return [];
    const R = rng(cyc*7919 + core.length*104729 + Math.round(core[0].b*97) + (typeof S.prog === 'number' ? S.prog : 97)*31);
    const shape = [.55, .8, 1, .9, .7, .5][cyc % 6], e = clamp(S.apAmt*shape*1.25, 0, 1.2);
    const busy = (b0, b1) => core.some(n => n.b < b1 - .02 && n.b + n.d > b0 + .02);
    // the gaps you leave (half a beat or more)
    const gaps = []; let end = 0;
    for (const n of core){ if (n.b - end >= .5) gaps.push([end, n.b]); end = Math.max(end, n.b + n.d); }
    if (Lb - end >= .5) gaps.push([end, Lb]);
    // your phrases (notes with less than a beat between them)
    const phrases = []; let cur = [];
    for (const n of core){ if (cur.length && n.b - (cur[cur.length - 1].b + cur[cur.length - 1].d) >= 1){ phrases.push(cur); cur = []; } cur.push(n); }
    if (cur.length) phrases.push(cur);
    const mu = core.reduce((s, n) => s + n.i, 0)/core.length, reg = mu + 3 > AP - 3 ? Math.round(mu - 3) : Math.round(mu + 3);
    const out = [];
    const kinds = ['echo', 'sequence', 'turn', 'fragment'];
    let filled = 0;
    gaps.forEach(([g0, g1], gi) => {
      if (filled && R() > .4 + .55*e) return;   // (some gaps are left as rests: space is part of an answer)
      const src = phrases.filter(p => p[0].b <= g0).pop() || phrases[(gi + cyc) % phrases.length];
      let tStart = g0 + .5, rep = 0, shift = 0;
      const room = g1 - g0, budget = Math.max(1, Math.round(room/(Math.min(8, src[src.length - 1].b + src[src.length - 1].d - src[0].b) + 2)*(.35 + .55*e)));
      while (tStart < g1 - .5 && rep < budget){
        const kind = kinds[(cyc + gi + rep) % 4];
        const cell = src.slice(0, kind === 'fragment' ? Math.min(3, src.length) : Math.min(6, src.length));
        const base = cell[0].b, iv = cell.map(n => n.i - cell[0].i), rh = cell.map(n => n.b - base);
        const span = rh[rh.length - 1] + cell[cell.length - 1].d;
        const times = kind === 'fragment' ? 2 : 1;
        for (let r2 = 0; r2 < times; r2++){
          const t1 = tStart + r2*(Math.ceil(span*2)/2 + .5);
          cell.forEach((n, k) => {
            const b = t1 + rh[k]; if (b >= g1 - .2) return;
            if (R() > .6 + .4*e) return;
            let i = reg + (kind === 'turn' ? -iv[k] : iv[k]) + shift + (kind === 'fragment' ? r2 : 0); i = clamp(i, 0, AP - 1);
            out.push({ b: +b.toFixed(3), d: Math.min(n.d, g1 - b - .05), i, v: .7 }); filled++;
          });
        }
        rep++; tStart += times*(Math.ceil(span*2)/2 + .5) + (R() < .5 ? 1 : 2);
        shift += kind === 'sequence' ? (R() < .5 ? 1 : -1) : 0;
      }
    });
    // one line at a time: each note ends before the next starts; and a note never runs into the next chord
    out.sort((a, b) => a.b - b.b);
    for (let k = 0; k < out.length; k++){ const n = out[k], nx = out[k + 1]; if (nx) n.d = Math.min(n.d, nx.b - n.b - .05); n.d = Math.min(n.d, Math.ceil((n.b + .001)/4)*4 - n.b - .04); }
    const line = out.filter(n => n.d >= .1 && !busy(n.b, n.b + n.d));
    // a soft harmony under your long notes (the one place it sounds with you: a different pad, so never your pitch)
    for (const n of core) if (n.d >= 1 && R() < .25 + .5*e){
      const i = n.i >= 2 ? n.i - 2 : n.i + 2, d = Math.min(n.d*.9, Math.ceil((n.b + .001)/4)*4 - n.b - .04);
      if (d >= .25 && !line.some(x => x.b < n.b + d && x.b + x.d > n.b)) line.push({ b: n.b + .02, d, i, v: .45 });
    }
    return line.sort((a, b) => a.b - b.b);
  }

  // ---------- the panel: tabs, setup, keys, the loop picture, the shelf ----------
  const keysEl = [];
  function buildUI(){
    const sel = $('g-boothProg'), src = $('g-progressionSelect');
    const n = Math.min(PROGS.length, src ? src.options.length : PROGS.length);
    for (let i = 0; i < n; i++){ const o = document.createElement('option'); o.value = String(i); o.textContent = src && src.options[i] ? src.options[i].textContent : 'Pattern ' + (i + 1); sel.appendChild(o); }
    songOption(); sel.value = String(S.prog);
    sel.addEventListener('change', () => { S.prog = sel.value === 'song' ? 'song' : +sel.value; if (S.prog === 'song') ensureSong(); apCache.clear(); if (playing){ lastBar = null; padCh = null; } drawKeys(chordOf(curBar())); store(); });
    const vb = $('bVoices');
    VOICES.forEach(v => { const b = document.createElement('button'); b.className = 'gb' + (v.id === S.voice ? ' on' : '') + (v.song ? ' bsongv' : ''); b.dataset.v = v.id; b.innerHTML = v.name + '<small>' + v.sub + '</small>';
      b.addEventListener('click', () => { if (v.song && !songSounds){ flash('Load a song first (above) for this voice'); return; } setVoice(v.id); noteDown(5, .7); setTimeout(() => noteUp(5), 350); }); vb.appendChild(b); });
    voiceAvail();
    $('bSongBtn').addEventListener('click', () => { if (unsaved()) askClear(null); else $('bSongFile').click(); });
    $('bSongClear').addEventListener('click', () => { const f = pendingFile; $('bDlg').hidden = true; pendingFile = null; if (f) loadSong(f); else $('bSongFile').click(); });
    $('bSongKeep').addEventListener('click', () => { $('bDlg').hidden = true; pendingFile = null; });
    $('bDlg').addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); $('bDlg').hidden = true; pendingFile = null; } });
    $('bSongBack').addEventListener('click', () => { if (S.song && S.song.start0 !== undefined) nudge(S.song.start0 - S.song.start); });
    const pk = $('g-boothPadSlider'); if (pk){ pk.value = String(S.padLvl ?? 1); pk.dataset.def = '1';
      pk.addEventListener('input', () => { S.padLvl = +pk.value; const o = $('g-boothPadVal'); if (o) o.textContent = Math.round(S.padLvl*100) + '%'; if (padV && ctx) padV.g.gain.setTargetAtTime(Math.max(.0001, S.padLvl), ctx.currentTime, .08); store(); }); pk.dispatchEvent(new Event('input')); }
    const ck = $('g-boothChopSlider'); if (ck){ ck.value = String(S.chopLvl ?? 1); ck.dataset.def = '1'; ck.addEventListener('input', () => { S.chopLvl = +ck.value; const o = $('g-boothChopVal'); if (o) o.textContent = Math.round(S.chopLvl*100) + '%'; store(); }); ck.dispatchEvent(new Event('input')); }
    $('bSongFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) loadSong(f); });
    $('gBooth').addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
    $('gBooth').addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^audio\//.test(f.type || 'audio/')){ e.preventDefault(); if (unsaved()) askClear(f); else loadSong(f); } });
    $('bSongNudge').querySelectorAll('.gb[data-d]').forEach(b => b.addEventListener('click', () => nudge(+b.dataset.d)));
    songInfo();
    const row = (id, attr, val, fn) => { const r = $(id); r.querySelectorAll('.gb').forEach(b => { b.classList.toggle('on', String(b.dataset[attr]) === String(val)); b.addEventListener('click', () => { r.querySelectorAll('.gb').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset[attr]); store(); }); }); };
    row('bLen', 'len', S.len, v => { S.len = +v; apCache.clear(); });
    row('bTidy', 'tidy', S.tidy, v => { S.tidy = +v; });
    row('bClick', 'click', S.click, v => { S.click = v; });
    const bpm = $('g-boothBpmSlider'), apk = $('g-boothApSlider');
    bpm.value = String(S.bpm); apk.value = String(S.apAmt); bpm.dataset.def = '84'; apk.dataset.def = '0.55';
    bpm.addEventListener('input', () => { setBpm(+bpm.value); const o = $('g-boothBpmVal'); if (o) o.textContent = bpm.value; store(); });
    apk.addEventListener('input', () => { S.apAmt = +apk.value; apCache.clear(); const o = $('g-boothApVal'); if (o) o.textContent = Math.round(S.apAmt*100) + '%'; store(); });
    bpm.dispatchEvent(new Event('input')); apk.dispatchEvent(new Event('input'));
    // the pads
    const kb = $('bKeys');
    for (let i = 0; i < NP; i++){
      const k = document.createElement('button'); k.className = 'bkey'; k.innerHTML = '<b></b><small>' + KLAB[i] + '</small>'; k.setAttribute('aria-label', 'Pad ' + (i + 1));
      k.addEventListener('pointerdown', e => { e.preventDefault(); k.setPointerCapture(e.pointerId); noteDown(i); });
      const up = () => noteUp(i); k.addEventListener('pointerup', up); k.addEventListener('pointercancel', up); k.addEventListener('lostpointercapture', up);
      kb.appendChild(k); keysEl.push(k);
    }
    // right-click a note on the loop picture to delete it (from whichever layer it's in)
    $('bRoll').addEventListener('contextmenu', e => {
      e.preventDefault(); const c = $('bRoll'), r = c.getBoundingClientRect(), H = r.height, rowH = (H - 24 - 10)/AP;
      const b = (e.clientX - r.left)/r.width*L(), i = Math.floor((H - 6 - (e.clientY - r.top))/rowH);
      for (let li = S.layers.length - 1; li >= 0; li--){ const lay = S.layers[li], k = lay.findIndex(n => n.i === i && b >= n.b - .05 && b <= n.b + n.d + .05);
        if (k >= 0){ lay.splice(k, 1); if (!lay.length) S.layers.splice(li, 1); apCache.clear(); store(); status(); return; } }
    });
    $('bPlay').addEventListener('click', () => playing ? stop() : start(false));
    $('bRec').addEventListener('click', record);
    $('bUndo').addEventListener('click', () => { if (S.layers.length){ S.layers.pop(); apCache.clear(); store(); status(); } });
    let clearArm = 0;
    $('bClear').addEventListener('click', () => { const b = $('bClear'); if (!S.layers.length) return;
      if (Date.now() - clearArm > 2500){ clearArm = Date.now(); b.textContent = 'Clear all?'; setTimeout(() => { b.textContent = 'Clear'; }, 2500); return; }
      S.layers = []; apCache.clear(); b.textContent = 'Clear'; clearArm = 0; store(); status(); });
    $('bAuto').classList.toggle('on', S.ap);
    $('bAuto').addEventListener('click', () => { S.ap = !S.ap; $('bAuto').classList.toggle('on', S.ap); apCache.clear(); store(); status(); });
    $('bSave').addEventListener('click', saveLoop);
    $('bName').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); saveLoop(); } });
    root.querySelectorAll('.gtab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
    { let seen = false; try { seen = localStorage.getItem('neonIsland.boothSeen') === '1'; } catch (e){}   // (the Booth tab flashes green until the player has been in once)
      if (!seen){ const bt = root.querySelector('.gtab[data-mode="booth"]'); if (bt) bt.classList.add('beckon'); } }
    drawKeys(chordOf(0)); renderShelf(); status();
  }
  function setVoice(id){ S.voice = id; $('bVoices').querySelectorAll('.gb').forEach(x => x.classList.toggle('on', x.dataset.v === id)); store(); }
  function voiceAvail(){ $('bVoices').querySelectorAll('.bsongv').forEach(b => { b.classList.toggle('dis', !songSounds); b.title = songSounds ? '' : 'Load a song first'; }); }
  function songOption(){
    const sel = $('g-boothProg'); let o = sel.querySelector('option[value="song"]');
    if (!S.song){ if (o) o.remove(); return; }
    if (!o){ o = document.createElement('option'); o.value = 'song'; sel.insertBefore(o, sel.firstChild); }
    o.textContent = 'From your song: ' + S.song.name;
  }
  // takes on the loop deck that aren't on the shelf as they are now
  let pendingFile = null;
  function unsaved(){ if (!S.layers.length) return false; const l = loadedId && loops.find(x => x.id === loadedId); return !(l && JSON.stringify(l.layers) === JSON.stringify(S.layers)); }
  function askClear(f){ pendingFile = f; $('bDlg').hidden = false; $('bSongKeep').focus({ preventScroll: true }); }
  function songInfo(){
    const box = $('bSongInfo'), nd = $('bSongNudge'), msg = $('bSongSt'); if (!box) return;
    if (!S.song){ box.hidden = true; nd.hidden = true; msg.hidden = false; msg.textContent = 'Use your own song: its chords become the pattern and its sound plays on the pads.'; return; }
    msg.hidden = true; box.hidden = false; nd.hidden = false;
    const rows = [['Song', S.song.name], ['Key', S.song.keyName], ['Tempo', Math.round(S.song.bpm) + ' BPM'], ['Section', `bars ${S.song.start + 1} to ${S.song.start + S.len} of ${S.song.list.length}`],
      ['Samples', S.song.nSamples ? S.song.nSamples + ' held note' + (S.song.nSamples > 1 ? 's' : '') + ' · chops' : 'chops only (no clean held notes)']];
    box.textContent = ''; for (const [k, v] of rows){ const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; box.append(dt, dd); }
    $('bSongBack').disabled = S.song.start0 === undefined || S.song.start === S.song.start0;
  }
  let songBusy = false;
  async function loadSong(f){
    if (songBusy) return; songBusy = true; audio(); const btn = $('bSongBtn'); btn.disabled = true;
    const say = t => { const m = $('bSongSt'); m.hidden = false; m.textContent = t; $('bSongInfo').hidden = true; };
    try {
      const r = await BOOTHSONG.analyze(f, ctx, say);
      stop(); S.layers = []; apCache.clear();   // (a new song starts a clean loop deck)
      S.song = { key: r.key, name: r.name, bpm: r.bpm, keyName: r.keyName, cs: r.cs, list: r.list, start: r.start, start0: r.start, nSamples: r.nSamples };
      songKey = r.key; songSounds = r.sounds; songRecut = r.recut;
      S.prog = 'song'; S.len = r.len; let bpm = Math.round(r.bpm); while (bpm > 132) bpm = Math.round(bpm/2); while (bpm < 60) bpm *= 2;
      const bk = $('g-boothBpmSlider'); bk.value = String(bpm); bk.dispatchEvent(new Event('input'));
      $('bLen').querySelectorAll('.gb').forEach(b => b.classList.toggle('on', +b.dataset.len === S.len));
      songOption(); $('g-boothProg').value = 'song'; padCache.clear(); apCache.clear(); voiceAvail(); setVoice(r.nSamples ? 'sampler' : 'chops');
      loadedId = null; drawKeys(chordOf(0)); songInfo(); store(); renderShelf();
    } catch (e){ say("Couldn't read that file as a song. Try an MP3, WAV, M4A or OGG."); console.warn(e); }
    status();
    btn.disabled = false; songBusy = false;
  }
  async function nudge(d){
    if (!S.song) return; const ns = clamp(S.song.start + d, 0, Math.max(0, S.song.list.length - S.len)); if (ns === S.song.start) return;
    S.song.start = ns; apCache.clear(); if (playing){ lastBar = null; padCh = null; } drawKeys(chordOf(curBar())); songInfo(); store();
    if (songRecut && songSounds && songKey === S.song.key) songSounds.chops = await songRecut(ns, S.len);
  }
  function drawKeys(ch){
    const P = padsFor(ch);
    keysEl.forEach((k, i) => {
      const m = P.m[i]; if (m === undefined) return; const nm = P.names[m % 12] + (Math.floor(m/12) - 1);
      const b = k.querySelector('b'); if (b.textContent !== nm){ b.textContent = nm; k.classList.remove('retune'); void k.offsetWidth; k.classList.add('retune'); }
      k.classList.toggle('core', P.core.has(m % 12)); k.classList.toggle('root', m % 12 === P.rootPc);
    });
    const tag = $('bChordTag'); if (tag){ const nx = playing ? chordOf(curBar() + 1) : null; tag.textContent = 'NOW ' + ch.name + (nx && nx !== ch ? ' · NEXT ' + nx.name : ''); }
  }
  function status(){
    const s = $('bStatus'), r = $('bRec'); if (!s) return;
    r.classList.toggle('armed', !!(rec && rec.armed)); r.classList.toggle('live', !!(rec && rec.live)); r.textContent = rec ? (rec.live ? 'Recording' : 'Cancel') : 'Record';
    const nl = S.layers.length;
    s.textContent = rec ? (rec.live ? 'RECORDING ONE PASS · LAYER ' + (nl + 1) : (playing ? 'RECORDING FROM THE NEXT BAR' : 'RECORDING AFTER THE COUNT-IN')) :
      !playing ? (nl ? nl + (nl > 1 ? ' LAYERS' : ' LAYER') + ' · PRESS PLAY' : 'PRESS PLAY, THEN PLAY THE PADS') :
      (nl ? nl + (nl > 1 ? ' LAYERS LOOPING' : ' LAYER LOOPING') + (S.ap ? ' · AUTOPILOT ANSWERING' : '') : 'PLAYING · PRESS RECORD TO KEEP A TAKE');
  }

  // the loop picture: bars and chords along the top, the layers, the autopilot, the take being recorded, the playhead
  function drawRoll(c = $('bRoll'), sel = null){
    if (!c || !c.clientWidth) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(c.clientWidth*dpr), h = Math.round(c.clientHeight*dpr);
    if (c.width !== w || c.height !== h){ c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); const W = w/dpr, H = h/dpr; g.clearRect(0, 0, W, H);
    const Lb = L(), top = 24, X = b => b/Lb*W, Y = i => H - 6 - (i + 1)*(H - top - 10)/AP, rowH = (H - top - 10)/AP;
    const nb = nowBeat(), lb = playing && nb >= 0 ? nb % Lb : -1, bar = lb >= 0 ? Math.floor(lb/4) : -1;
    g.font = '11.5px "JetBrains Mono", monospace'; g.textBaseline = 'middle';
    for (let k = 0; k < S.len; k++){
      const x0 = X(k*4), x1 = X(k*4 + 4);
      g.fillStyle = k === bar ? 'rgba(232,213,83,.16)' : k % 2 ? 'rgba(95,216,222,.05)' : 'rgba(95,216,222,.09)'; g.fillRect(x0, 0, x1 - x0, H);
      g.fillStyle = k === bar ? '#e8d553' : '#a6eef0'; g.fillText(chordOf(k).name, x0 + 6, 12);
      g.fillStyle = 'rgba(23,65,74,.9)'; for (let q = 1; q < 4; q++) g.fillRect(X(k*4 + q), top, 1, H - top);
      g.fillStyle = '#2c8b92'; g.fillRect(x0, 0, 1, H);
    }
    g.fillStyle = 'rgba(23,65,74,.6)'; g.fillRect(0, Y(NP - 1) - 1, W, 1);   // (above this line: only the autopilot reaches)
    const box = (n, col, a) => { g.fillStyle = col.replace('A', a); g.fillRect(X(n.b) + 1, Y(n.i) + Math.min(1, rowH*.15), Math.max(2, X(n.d) - 2), Math.max(3, rowH - 1)); };
    S.layers.forEach((layer, li) => { const a = .55 + .4*(li === S.layers.length - 1 ? 1 : .5); for (const n of layer) box(n, n === sel ? 'rgba(232,213,83,A)' : (bc && bc.mode === 'rewire' && !n.o) ? 'rgba(150,240,190,A)' : 'rgba(95,216,222,A)', a); });
    if (S.ap && S.layers.length && playing && nb >= 0){ const part = apCache.get(Math.floor(nb/Lb)); if (part) for (const n of part) box(n, 'rgba(229,55,159,A)', .8); }
    if (rec && rec.live){ g.fillStyle = 'rgba(229,55,159,.1)'; g.fillRect(0, top, W, H - top);
      for (const n of rec.take){ const d = n.d || Math.max(.1, ((nb % Lb) - n.b + Lb) % Lb); box({ b: n.b, d, i: n.i }, 'rgba(255,120,150,A)', .95); } }
    if (lb >= 0){ g.fillStyle = '#e8d553'; g.fillRect(X(lb) - 1, 0, 2, H); }
    if (playing && nb < 0){ g.fillStyle = 'rgba(3,12,16,.6)'; g.fillRect(0, 0, W, H); g.fillStyle = '#e8d553'; g.font = '600 46px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.ceil(-nb)), W/2, H/2); g.textAlign = 'left'; }
    else if (rec && rec.armed && playing){ const left = rec.from - nb; g.fillStyle = '#e5379f'; g.font = '600 20px "Chakra Petch", sans-serif'; g.textAlign = 'right'; g.fillText('REC IN ' + Math.ceil(left), W - 10, H - 18); g.textAlign = 'left'; }
    if (!S.layers.length && !rec && !playing){ g.fillStyle = '#4f8c94'; g.font = '13px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText('Press Play and try the pads, then Record to keep a take.', W/2, (H + top)/2); g.textAlign = 'left'; }
  }
  let raf = 0, lastKeyBar = -2;
  function frame(){
    raf = 0; if (mode !== 'booth' || !GRIDPANEL.open) return;
    drawRoll();
    const b = curBar(); if (b !== lastKeyBar && !playing){ lastKeyBar = b; drawKeys(chordOf(b)); }
    if (playing){ const tag = $('bChordTag'), ch = chordOf(b), nx = chordOf(b + 1); const t = 'NOW ' + ch.name + (nx !== ch ? ' · NEXT ' + nx.name : ''); if (tag.textContent !== t) tag.textContent = t; }
    if (rec) status();
    raf = requestAnimationFrame(frame);
  }

  // ---------- the shelf ----------
  const progName = i => { if (i === 'song') return 'Your song'; const o = $('g-boothProg') && $('g-boothProg').options[i]; return o ? o.textContent.split('//').pop().trim() : 'Pattern ' + (i + 1); };
  function saveLoop(){
    if (!S.layers.length){ flash('Record a take first'); return; }
    const inp = $('bName'), nm = (inp.value || '').trim() || 'Loop ' + (loops.length + 1);
    const data = { song: S.prog === 'song' && S.song ? JSON.parse(JSON.stringify(S.song)) : null, name: nm, prog: S.prog, len: S.len, voice: S.voice, bpm: S.bpm, ap: S.ap, apAmt: S.apAmt, layers: JSON.parse(JSON.stringify(S.layers)), at: Date.now() };
    const same = loadedId && loops.find(l => l.id === loadedId && l.name === nm);
    if (same) Object.assign(same, data); else { const id = 'L' + Date.now().toString(36); loops.unshift({ id, ...data }); loadedId = id; }
    inp.value = ''; store(); renderShelf(); flash('Saved "' + nm + '"');
  }
  function flash(t){ const s = $('bStatus'); if (!s) return; s.textContent = t.toUpperCase(); setTimeout(status, 1800); }
  function loadLoop(l){
    stop(); if (l.song){ S.song = JSON.parse(JSON.stringify(l.song)); songOption(); padCache.clear(); ensureSong().then(() => songInfo()); }
    Object.assign(S, { prog: l.prog, len: l.len, voice: l.voice, bpm: l.bpm, ap: !!l.ap, apAmt: l.apAmt ?? .55, layers: JSON.parse(JSON.stringify(l.layers)) });
    loadedId = l.id; $('g-boothProg').value = String(S.prog);
    const sync = (id, attr, v) => $(id).querySelectorAll('.gb').forEach(b => b.classList.toggle('on', String(b.dataset[attr]) === String(v)));
    sync('bLen', 'len', S.len); $('bVoices').querySelectorAll('.gb').forEach(b => b.classList.toggle('on', b.dataset.v === S.voice));
    const bpm = $('g-boothBpmSlider'); bpm.value = String(S.bpm); bpm.dispatchEvent(new Event('input'));
    const apk = $('g-boothApSlider'); apk.value = String(S.apAmt); apk.dispatchEvent(new Event('input'));
    $('bAuto').classList.toggle('on', S.ap); apCache.clear(); drawKeys(chordOf(0)); store(); renderShelf(); start(false); status();
  }
  function renderShelf(){
    syncConsole();
    const box = $('bList'); if (!box) return; box.textContent = '';
    if (!loops.length){ const p = document.createElement('div'); p.className = 'bempty'; p.textContent = 'Nothing kept yet. Record a take, name it above and press Save. Loops stay with this city.'; box.appendChild(p); return; }
    for (const l of loops){
      const it = document.createElement('div'); it.className = 'bitem' + (l.id === loadedId ? ' on' : '');
      const vn = (VOICES.find(v => v.id === l.voice) || VOICES[0]).name, nl = l.layers.length;
      it.innerHTML = `<div class="bt"></div><div class="bm"></div><div class="br"><button class="gb" data-a="play">Load</button><button class="gb" data-a="ren">Rename</button><button class="gb" data-a="dup">Copy</button><button class="gb" data-a="del">Delete</button></div>`;
      it.querySelector('.bt').textContent = l.name; it.querySelector('.bm').textContent = `${progName(l.prog)} · ${vn} · ${l.bpm} BPM · ${l.len} bars · ${nl} layer${nl > 1 ? 's' : ''}${l.ap ? ' · autopilot' : ''}`;
      let delArm = 0;
      it.addEventListener('click', e => {
        const a = e.target.dataset && e.target.dataset.a; if (!a) return;
        if (a === 'play') loadLoop(l);
        if (a === 'dup'){ loops.splice(loops.indexOf(l) + 1, 0, { ...JSON.parse(JSON.stringify(l)), id: 'L' + Date.now().toString(36), name: l.name + ' (copy)' }); store(); renderShelf(); }
        if (a === 'del'){ if (Date.now() - delArm > 2500){ delArm = Date.now(); e.target.textContent = 'Sure?'; setTimeout(() => { e.target.textContent = 'Delete'; }, 2500); return; }
          loops.splice(loops.indexOf(l), 1); if (loadedId === l.id) loadedId = null; store(); renderShelf(); }
        if (a === 'ren'){ const t = it.querySelector('.bt'), inp = document.createElement('input'); inp.value = l.name; inp.maxLength = 40; t.replaceWith(inp); inp.focus(); inp.select();
          const done = ok => { if (ok && inp.value.trim()) l.name = inp.value.trim(); store(); renderShelf(); };
          inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') done(true); if (ev.key === 'Escape'){ ev.preventDefault(); done(false); } }); inp.addEventListener('blur', () => done(true)); }
      });
      box.appendChild(it);
    }
  }

  // ---------- shelf loops on the broadcast (the Console) ----------
  const setSlider = (id, v) => { const r = $(id); if (!r) return; const lo = +r.min, hi = +r.max, st = +r.step || 1; v = clamp(Math.round((v - lo)/st)*st + lo, lo, hi); if (Math.abs(+r.value - v) < st/2) return;
    r.value = String(+v.toFixed(4)); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); };
  B.broadcast = async (id, how) => {
    const l = loops.find(x => x.id === id); if (!l) return false;
    if (playing) stop();
    if (!bc) bc = { stash: JSON.parse(JSON.stringify(S)) };
    Object.assign(bc, { id, mode: how, base: l.bpm, name: l.name, sel: null });
    const cp = JSON.parse(JSON.stringify(l));
    Object.assign(S, { prog: cp.prog, len: cp.len, voice: cp.voice, bpm: cp.bpm, ap: !!cp.ap, apAmt: cp.apAmt ?? .55, song: cp.song || S.song,
      layers: how === 'rewire' ? [cp.layers.flat().map(n => ({ ...n, o: 1 }))] : cp.layers });
    if (cp.song){ S.song = cp.song; await ensureSong(); }
    apCache.clear(); padCh = null; lastBar = null;
    music.setBooth(true); setSlider('g-bpmSlider', S.bpm);
    start(false); stripShow(true);
    const dp = $('gdProg'); if (dp){ dp.textContent = 'Booth: ' + l.name; dp.title = how === 'rewire' ? 'A rewired copy of a Booth loop' : 'A Booth loop, as logged'; }
    return true;
  };
  B.endBroadcast = () => {
    if (!bc) return;
    const here = playing ? chordOf(curBar()) : null; if (here && E.handOff) E.handOff(here);   // (the planners' pattern bridges over from the chord playing now)
    stop();
    const st = bc.stash; bc = null; driftSeq = null; if (bus && ctx){ bus.lead.gain.setTargetAtTime(1, ctx.currentTime, .2); bus.pad.gain.setTargetAtTime(1, ctx.currentTime, .2); } Object.keys(S).forEach(k => { if (!(k in st)) delete S[k]; }); Object.assign(S, st);
    if (S.song) ensureSong(); padCache.clear(); apCache.clear(); stripShow(false);
    if (mode !== 'booth') music.setBooth(false);
  };
  B.broadcasting = () => !!bc; B._evolve = (lay, part) => evolve(lay, part); B._chords = () => [...Array(S.len)].map((_, k) => chordOf(k).name).join(" ");
  const layerOn = id => { const b = $(id); return !!(b && b.classList.contains('on')); };   // (the Console's layer buttons: what the player asked for, whether or not the engine has started)
  // once a pass (from the second): the governor drifts the Console's own settings, as the auto-governor does for the
  // planners' patterns; a rewired copy also takes a little of the autopilot's answer into itself and moves a note
  const gR = rng(Date.now() & 0xffff);
  // The governor on a shelf loop drifts what the auto-governor drifts for the planners' patterns: the clock (with the same
  // hovering: it settles on a tempo for one to two minutes before it's free to move, and Lock tempo keeps it still), the
  // footfall cadence, the dispersion mode, and the panel's knobs (shimmer, expression, output, resonance, smog, static, hum),
  // each easing a little a pass toward a target it picks every few passes.
  const GOV = [['g-granularMixSlider', .3, .8, .06], ['g-motifLevelSlider', .45, .9, .04], ['g-droneLevelSlider', .6, .95, .03], ['g-spaceReverbSlider', .45, .92, .03],
    ['g-warmthFilterSlider', 1600, 4800, 250], ['g-lofiTextureSlider', .2, .5, .03], ['g-subAnchorSlider', .5, .85, .04]];
  function bcPass(cyc){
    if (!bc || cyc < 1) return;
    if (layerOn('g-autopilotBtn')){
      const gv = bc.gov || (bc.gov = {}), now = performance.now();
      for (const [id, lo, hi, st] of GOV){
        const r = $(id); if (!r) continue;
        if (cyc % 4 === 1 || gv[id] === undefined) gv[id] = lo + gR()*(hi - lo);
        setSlider(id, +r.value + clamp(gv[id] - +r.value, -st, st));
      }
      if (cyc % 4 === 2){ const modes = ['MOSAIC', 'HAZE', 'ARP'].filter(x => x !== E.mode), b = root.querySelector(`.micro-mode-btn[data-mode="${modes[Math.floor(gR()*modes.length)]}"]`); if (b) b.click(); }
      if (cyc % 4 === 0){ const subs = ['1/8.', '1/8', '1/8', '1/8T', '1/16'].filter(x => x !== E.subdiv), b = root.querySelector(`.subdiv-btn[data-subdiv="${subs[Math.floor(gR()*subs.length)]}"]`); if (b) b.click(); }
      const lk = $('g-tempoLock');
      if (!(lk && lk.checked)){
        const T = bc.tempo || (bc.tempo = { target: S.bpm, until: now + 60000 + gR()*60000 });
        if (now > T.until){ T.target = clamp(Math.round(bc.base*(1 + [-.06, -.03, 0, 0, .03, .06][Math.floor(gR()*6)])), 60, 132); T.until = now + 60000 + gR()*60000; }
        const hover = T.target + Math.round(Math.sin(now/23000)*1.2), cur = +($('g-bpmSlider') || { value: S.bpm }).value;
        setSlider('g-bpmSlider', cur + clamp(hover - cur, -2, 2));
      }
    }
    if (bc.mode === 'rewire' && S.ap) evolve(S.layers[0], apCache.get(cyc - 1) || []);
  }
  // Drift (the Console's Drift switch) on a shelf loop: each pass, the chords may wander from the loop's order, taking the
  // steps the music itself takes. For a song, the chord changes the song makes (how often each chord follows each other one,
  // counted over the whole song, with now and then a step to another chord the song uses); for a pattern, its own order with a step to a neighbor. Bar one stays home; the notes
  // follow, since they're stored as pads.
  let driftSeq = null;
  function prepDrift(cyc){
    driftSeq = null;
    if (!bc || !layerOn('g-markovToggleBtn') || cyc < 1) return;
    const n = S.len, home = [...Array(n)].map((_, k) => baseChord(k));
    let pool, next;
    if (S.prog === 'song' && S.song){
      const L0 = S.song.list, T = new Map();
      for (let k = 1; k < L0.length; k++){ if (L0[k] === L0[k - 1]) continue; const m = T.get(L0[k - 1]) || new Map(); m.set(L0[k], (m.get(L0[k]) || 0) + 1); T.set(L0[k - 1], m); }
      const used = [...new Set(L0)].map(k => S.song.cs[k]);   // (a song that only ever takes one road still drifts: now and then to another chord it uses)
      pool = S.song.cs; next = c => { const m = T.get(pool.indexOf(c)); if (!m || !m.size || gR() < .3){ const o = used.filter(x => x !== c); return o.length ? o[Math.floor(gR()*o.length)] : null; } let t = gR()*[...m.values()].reduce((a, b) => a + b, 0); for (const [k, w] of m){ t -= w; if (t <= 0) return pool[k]; } return null; };
    } else {
      pool = (PROGS[S.prog] || PROGS[0]).chords; next = c => { const k = pool.indexOf(c); return pool[(k + (gR() < .7 ? 1 : gR() < .5 ? -1 : 2) + pool.length) % pool.length]; };
    }
    const seq = [home[0]];
    for (let k = 1; k < n; k++) seq.push(gR() < .55 ? home[k] : (next(seq[k - 1]) || home[k]));
    driftSeq = seq;
  }
  // A rewired copy drifts: most passes the autopilot makes one or two changes to it, the player's own notes included. It takes
  // in a note of its own answer, deletes a note (the player's first, more often than not), moves one, retunes one, stretches
  // or shortens one, or splits one in two. Over enough passes none of the original notes may be left: they were where it started.
  // A note stays inside its bar (its pitch is the bar's chord) and the line never piles notes on one another.
  function evolve(lay, part){
    if (!lay) return;
    const Lb = L(), bar = b => Math.floor(b/4);
    const free = (b, d, skip) => b >= 0 && b + d <= Lb + .001 && bar(b) === bar(b + d - .01) && !lay.some(x => x !== skip && x.b < b + d - .02 && x.b + x.d > b + .02);
    const pickNote = () => { const orig = lay.filter(n => n.o); return orig.length && gR() < .4 ? orig[Math.floor(gR()*orig.length)] : lay[Math.floor(gR()*lay.length)]; };
    if (gR() < .3) return;   // (some passes it leaves alone)
    const ops = gR() < .6 ? 1 : 2;
    for (let k = 0; k < ops; k++){
      const r = gR();
      if (r < .22 || !lay.length){   // take in a note of the autopilot's answer
        const c = part.filter(n => n.v >= .5 && free(Math.round(n.b*4)/4, Math.max(.25, Math.round(n.d*4)/4)));
        if (c.length && lay.length < 40){ const n = c[Math.floor(gR()*c.length)]; lay.push({ b: Math.round(n.b*4)/4, d: Math.max(.25, Math.round(n.d*4)/4), i: clamp(n.i, 0, AP - 1), v: .78 }); }
      } else if (r < .42){ if (lay.length > 4){ const n = pickNote(); lay.splice(lay.indexOf(n), 1); } }   // delete one
      else if (r < .62){ const n = pickNote(), nb = n.b + (gR() < .5 ? -1 : 1)*(gR() < .6 ? .5 : 1); if (free(nb, n.d, n)){ n.b = nb; delete n.o; } }   // move one
      else if (r < .78){ const n = pickNote(); n.i = clamp(n.i + (gR() < .5 ? -1 : 1)*(gR() < .7 ? 1 : 2), 0, AP - 1); delete n.o; }   // retune one
      else if (r < .9){ const n = pickNote(), nd = Math.max(.25, Math.round(n.d*(gR() < .5 ? .5 : 1.5)*4)/4); if (free(n.b, nd, n)){ n.d = nd; delete n.o; } }   // stretch or shorten one
      else { const n = pickNote(); if (n.d >= 1 && lay.length < 40){ const h = Math.round(n.d*2)/4; n.d = h; delete n.o; lay.push({ b: n.b + h, d: h, i: clamp(n.i + (gR() < .5 ? -1 : 1), 0, AP - 1), v: n.v || .78 }); } }   // split one
    }
    lay.sort((a, b) => a.b - b.b); apCache.clear();
  }
  // the Console's carrier pattern list carries the shelf too
  function syncConsole(){
    const sel = $('g-progressionSelect'); if (!sel) return; const was = sel.value;
    sel.querySelectorAll('optgroup.bshelf').forEach(o => o.remove());
    if (loops.length){ const og = document.createElement('optgroup'); og.className = 'bshelf'; og.label = 'Booth shelf';
      for (const l of loops){ const o = document.createElement('option'); o.value = 'loop:' + l.id; o.textContent = 'Booth // ' + l.name + (l.song ? ' (song)' : ''); og.appendChild(o); }
      sel.appendChild(og); }
    if ([...sel.options].some(o => o.value === was)) sel.value = was;
  }
  let lastPattern = '0', askFor = null;
  root.addEventListener('change', e => {
    const sel = e.target; if (!sel || sel.id !== 'g-progressionSelect') return;
    if (sel.value.startsWith('loop:')){
      e.stopPropagation();   // (the engine knows only its own patterns)
      const id = sel.value.slice(5);
      if (GRIDPANEL.open && mode === 'console') ask(id); else B.broadcast(id, 'logged');   // (stepped to from the deck: as logged)
    } else { lastPattern = sel.value; if (bc) B.endBroadcast(); }
  }, true);
  function ask(id){
    const l = loops.find(x => x.id === id); if (!l) return; askFor = id;
    $('gDlgName').textContent = l.name; $('gDlg').hidden = false; $('gDlgLogged').focus({ preventScroll: true });
  }
  function closeAsk(choice){
    $('gDlg').hidden = true; const id = askFor; askFor = null;
    if (choice) B.broadcast(id, choice);
    else { const sel = $('g-progressionSelect'); sel.value = bc ? 'loop:' + bc.id : lastPattern; }
  }
  // the note strip on the Console's carrier chart, while a shelf loop is on the broadcast; a rewired copy can be reshaped on it
  function stripShow(on){
    const st = $('gStrip'); if (!st) return; st.hidden = !on;
    root.querySelectorAll('.a-chart .gchord, .a-chart .gpads, .a-chart .gpills').forEach(e => { e.hidden = on; });
    if (on){ const rw = bc && bc.mode === 'rewire';
      $('gStripMode').textContent = (rw ? 'REWIRED // ' : 'AS LOGGED // ') + (bc ? bc.name : '');
      $('gStripSave').hidden = !rw;
      $('gStripHint').textContent = rw ? 'Cyan: your notes · green: changed by you or the Grid · drag, stretch, click to add, double-click to remove' : 'As recorded · Neuro-phrase on: the Grid answers · Auto-governor on: the settings drift';
      $('gStripCv').title = rw ? 'Drag a note to move it, drag its right end to stretch it, click an empty spot to add one, double-click (or Delete) to remove it. With the Neuro-phrase on, the Grid drifts it somewhere new. The shelf copy stays as it was.'
        : 'Your notes as recorded. Turn on the Neuro-phrase layer and the Grid answers them; with the auto-governor on, the settings drift as it plays.';
      if (!stripRaf) stripRaf = requestAnimationFrame(stripFrame); }
  }
  let stripRaf = 0;
  function stripFrame(){ stripRaf = 0; if (!bc) return; if (GRIDPANEL.open && mode === 'console') drawRoll($('gStripCv'), bc.sel); stripRaf = requestAnimationFrame(stripFrame); }
  { // editing
    const cv = $('gStripCv'); let drag = null;
    const at2 = e => { const r = cv.getBoundingClientRect(), top = 24, H = r.height, rowH = (H - top - 10)/AP;
      return { b: clamp((e.clientX - r.left)/r.width*L(), 0, L() - .01), i: clamp(Math.floor((H - 6 - (e.clientY - r.top))/rowH), 0, AP - 1), px: e.clientX - r.left, W: r.width }; };
    const hit = p => { const lay = S.layers[0] || []; for (let k = lay.length - 1; k >= 0; k--){ const n = lay[k]; if (n.i === p.i && p.b >= n.b && p.b <= n.b + n.d) return n; } return null; };
    const fit = n => { n.b = clamp(Math.round(n.b*4)/4, 0, L() - .25); const barEnd = Math.floor(n.b/4)*4 + 4; n.d = clamp(Math.round(n.d*4)/4, .25, barEnd - n.b); };
    cv.addEventListener('pointerdown', e => {
      if (!bc || bc.mode !== 'rewire') return; e.preventDefault(); cv.setPointerCapture(e.pointerId);
      if (!S.layers.length) S.layers.push([]);
      const p = at2(e), n = hit(p);
      if (n){ const edge = (n.b + n.d)/L()*p.W - p.px < 7; drag = { n, kind: edge ? 'size' : 'move', db: p.b - n.b, di: p.i - n.i }; bc.sel = n; }
      else { const nn = { b: Math.floor(p.b*4)/4, d: 1, i: p.i, v: .8 }; fit(nn); S.layers[0].push(nn); drag = { n: nn, kind: 'size' }; bc.sel = nn; }
      apCache.clear();
    });
    cv.addEventListener('pointermove', e => { if (!drag) return; const p = at2(e), n = drag.n;
      if (drag.kind === 'move'){ n.b = p.b - drag.db; n.i = clamp(p.i - drag.di, 0, AP - 1); } else n.d = Math.max(.25, p.b - n.b);
      delete n.o;
      fit(n); });
    const end = () => { if (!drag) return; drag = null; S.layers[0].sort((a, b) => a.b - b.b); apCache.clear(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const del = n => { const lay = S.layers[0] || [], k = lay.indexOf(n); if (k >= 0){ lay.splice(k, 1); apCache.clear(); } if (bc) bc.sel = null; };
    cv.addEventListener('dblclick', e => { if (!bc || bc.mode !== 'rewire') return; const n = hit(at2(e)); if (n) del(n); });
    cv.addEventListener('contextmenu', e => { if (!bc || bc.mode !== 'rewire') return; e.preventDefault(); const n = hit(at2(e)); if (n) del(n); });
    addEventListener('keydown', e => { if (bc && bc.mode === 'rewire' && bc.sel && GRIDPANEL.open && mode === 'console' && (e.key === 'Delete' || e.key === 'Backspace') && !(e.target && e.target.tagName === 'INPUT')){ e.preventDefault(); del(bc.sel); } }, true);
    $('gStripEnd').addEventListener('click', () => { const sel = $('g-progressionSelect'); sel.value = lastPattern; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    $('gStripSave').addEventListener('click', () => {
      if (!bc) return; const src = loops.find(x => x.id === bc.id); if (!src) return;
      const nl = { ...JSON.parse(JSON.stringify(src)), id: 'L' + Date.now().toString(36), name: src.name + ' (rewired)', layers: JSON.parse(JSON.stringify(S.layers)), bpm: S.bpm, at: Date.now() };
      loops.splice(loops.indexOf(src) + 1, 0, nl); store(); renderShelf(); const b = $('gStripSave'); b.textContent = 'Kept on the shelf'; setTimeout(() => { b.textContent = 'Keep as a new loop'; }, 1800);
    });
    $('gDlgLogged').addEventListener('click', () => closeAsk('logged'));
    $('gDlgRewire').addEventListener('click', () => closeAsk('rewire'));
    $('gDlgCancel').addEventListener('click', () => closeAsk(null));
    $('gDlg').addEventListener('keydown', e => { if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); closeAsk(null); } });
  }

  // ---------- modes: the Console (the broadcast) or the Booth ----------
  function setMode(m){
    mode = m; root.querySelectorAll('.gtab').forEach(t => { const on = t.dataset.mode === m; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    const main = root.querySelector('.gmain'), bo = $('gBooth');
    main.hidden = m === 'booth'; bo.hidden = m !== 'booth';
    if (m === 'booth'){ const bt = root.querySelector('.gtab.beckon'); if (bt){ bt.classList.remove('beckon'); try { localStorage.setItem('neonIsland.boothSeen', '1'); } catch (e){} }
      if (bc){ const sel = $('g-progressionSelect'); sel.value = lastPattern; sel.dispatchEvent(new Event('change', { bubbles: true })); } music.setBooth(true); audio(); if (S.song) ensureSong(); drawKeys(chordOf(curBar())); if (!raf) raf = requestAnimationFrame(frame); }
    else { stop(); music.setBooth(false); }
  }
  B.panelOpened = () => { if (mode === 'booth') setMode('booth'); };
  B.panelClosed = () => { if (mode === 'booth'){ stop(); music.setBooth(false); } };
  // the computer keys: Q to ] are the pads, Space plays and stops, Enter records (not while typing a name)
  addEventListener('keydown', e => {
    if (mode !== 'booth' || !GRIDPANEL.open) return;
    if (e.target && (e.target.tagName === 'INPUT' && e.target.type !== 'range' || e.target.tagName === 'SELECT')) return;
    const i = KEYS.indexOf(e.code);
    if (i >= 0){ e.preventDefault(); if (!e.repeat) noteDown(i); return; }
    if (e.code === 'Space'){ e.preventDefault(); if (!e.repeat) (playing ? stop() : start(false)); return; }
    if (e.code === 'Enter' && !e.repeat){ e.preventDefault(); record(); }
  }, true);
  addEventListener('keyup', e => { const i = KEYS.indexOf(e.code); if (i >= 0 && held.has(i)) noteUp(i); }, true);
  addEventListener('blur', () => { for (const k of [...held.keys()]) noteUp(k); });

  buildUI();
  B.state = S; B.improvise = improvise; B.padsFor = padsFor; B.chordOf = chordOf;   // (for checking)
  return B;
})();
