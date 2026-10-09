// Neon Terrarium jam room: the page. Controls, mixer, ratings, display.
(function () {
  'use strict';
  const J = window.Jam;
  const $ = (s, el) => (el || document).querySelector(s);
  const KEY = 'neon-terrarium-jam-v1';

  // ---------------------------------------------------------------- storage (never required; every access is guarded)
  let memory = {};
  const store = {
    load() { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : {}; } catch (e) { return memory; } },
    save(o) { memory = o; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } },
  };
  const saved = store.load() || {};
  const S = {
    params: Object.assign(J.defaultParams(), saved.params || {}),
    game: Object.assign({ tod: 'day', rain: false, view: 'street' }, saved.game || {}),
    tex: Object.assign({ gate: false, vinyl: true, hum: true, radio: true }, saved.tex || {}),
    faders: saved.faders || {},
    master: saved.master === undefined ? 80 : saved.master,
    history: saved.history && saved.history.length ? saved.history : [String(100000 + Math.floor(Math.random() * 900000))],
    hIdx: saved.hIdx === undefined ? 0 : saved.hIdx,
    ratings: saved.ratings || [],
    composer: saved.composer === 'old' ? 'old' : 'new',
  };
  if (S.hIdx >= S.history.length) S.hIdx = S.history.length - 1;
  let saveT = null;
  function persist() { clearTimeout(saveT); saveT = setTimeout(() => store.save(S), 250); }

  // ---------------------------------------------------------------- audio objects (created on the first click)
  let ctx = null, synth = null, engine = null;
  function ensureAudio() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    synth = new J.Synth(ctx);
    engine = new J.Engine(ctx, synth);
    window.__jam = { ctx, synth, engine };            // handy for debugging in the console
    engine.setParams(S.params); engine.setGame(S.game); engine.composerKind = S.composer;
    engine.setTexture({ vinyl: S.tex.vinyl, hum: S.tex.hum, radio: S.tex.radio });
    engine.setGated(S.tex.gate);
    J.LAYERS.forEach(n => { if (S.faders[n] !== undefined) synth.setFader(n, S.faders[n]); });
    mixerSync();
    synth.setMaster(Math.pow(S.master / 100, 1.6));
  }

  // ---------------------------------------------------------------- seed + transport
  const seedEl = $('#seed'), playBtn = $('#play');
  const curSeed = () => S.history[S.hIdx];
  function showSeed() { seedEl.value = curSeed(); }
  function pushSeed(s) {
    s = String(s).trim() || String(100000 + Math.floor(Math.random() * 900000));
    if (S.history[S.hIdx] !== s) { S.history = S.history.slice(0, S.hIdx + 1); S.history.push(s); if (S.history.length > 200) S.history.shift(); S.hIdx = S.history.length - 1; }
    showSeed(); persist();
  }
  function isPlaying() { return !!(engine && engine.running); }
  async function startPlay() {
    ensureAudio();
    try { await ctx.resume(); } catch (e) { }
    engine.setParams(S.params); engine.composerKind = S.composer;
    engine.start(curSeed());
    sections = []; lastSecId = null;
    playBtn.textContent = 'Stop'; playBtn.setAttribute('aria-pressed', 'true');
  }
  function stopPlay() {
    if (engine) engine.stop();
    playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false');
  }
  playBtn.addEventListener('click', () => { if (isPlaying()) stopPlay(); else startPlay(); });
  $('#restart').addEventListener('click', () => { startPlay(); });
  function applySeedAndMaybePlay(s) { pushSeed(s); if (isPlaying()) startPlay(); }
  $('#newseed').addEventListener('click', () => applySeedAndMaybePlay(String(100000 + Math.floor(Math.random() * 900000))));
  $('#load').addEventListener('click', () => applySeedAndMaybePlay(seedEl.value));
  seedEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applySeedAndMaybePlay(seedEl.value); } e.stopPropagation(); });
  $('#prev').addEventListener('click', () => { if (S.hIdx > 0) { S.hIdx--; showSeed(); persist(); if (isPlaying()) startPlay(); } });
  $('#next').addEventListener('click', () => {
    if (S.hIdx < S.history.length - 1) { S.hIdx++; showSeed(); persist(); if (isPlaying()) startPlay(); }
    else applySeedAndMaybePlay(String(100000 + Math.floor(Math.random() * 900000)));
  });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !/^(INPUT|TEXTAREA|BUTTON|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); playBtn.click(); }
  });

  // ---------------------------------------------------------------- sliders
  const GENRE = [
    ['dnb', 'Drum and bass', 'Chopped breakbeats, reese bass, a fast pulse. Higher also pulls the tempo toward the top of the range.'],
    ['jazz', 'Jazz', 'Sevenths, ninths, elevenths, ii-V and passing chords, swing in the quiet parts.'],
    ['math', 'Math rock', 'Odd-meter bridges (7/8, 5/4, 9/8), 3+3+2 twinkle patterns, tight accents.'],
    ['emo', 'Midwest emo', 'Open add9 and sus chords, strummed chords, long crescendo builds.'],
    ['punk', 'Pop punk', 'Driving eighths, big major-key choruses, power-bass.'],
    ['riff', 'Tapping riffs', 'New composer only. Some phrases hand the tune to a fast, syncopated two-hand tapping figure (anchor, hammer, tap) in the twinkle, and the lead answers on the cadence bar. More math and synth makes them likelier.'],
    ['synth', 'Synth flavor', 'Reese basses, detuned saw shimmer, arpeggiated leads.'],
  ];
  const FEEL = [
    ['energy', 'Energy', 'How full the arrangement is. Low energy drops layers out.'],
    ['dark', 'Darkness / mood', 'Minor and phrygian color against major and lydian brightness. Applies at the start of a piece.'],
    ['density', 'Density', 'How many optional notes happen: ghost notes, hat 16ths, twinkle pickups, comping hits.'],
    ['tempoFeel', 'Tempo feel', 'Full time on the left, half-time (about 85) on the right. Changes how often sections drop to half-time.'],
  ];
  const sliderEls = {};
  function buildSliders(host, defs) {
    defs.forEach(([k, name, tip]) => {
      const wrap = document.createElement('div'); wrap.className = 'slider';
      const id = 'sl_' + k;
      wrap.innerHTML = '<div class="top"><label class="name" for="' + id + '">' + name + '</label><span class="val" id="v_' + k + '"></span></div>' +
        '<input id="' + id + '" type="range" min="0" max="100" step="1"><div class="tip">' + tip + '</div>';
      host.appendChild(wrap);
      const inp = $('input', wrap), val = $('.val', wrap);
      sliderEls[k] = { inp, val };
      const paint = () => { val.textContent = inp.value; inp.style.setProperty('--fill', inp.value + '%'); };
      inp.value = Math.round(S.params[k] * 100); paint();
      inp.addEventListener('input', () => {
        S.params[k] = inp.value / 100; paint(); persist();
        if (engine) engine.setParams({ [k]: S.params[k] });
        updateGameNote();
      });
    });
  }
  buildSliders($('#genreSliders'), GENRE);
  buildSliders($('#feelSliders'), FEEL);
  // Tempo: the far left is Auto (the drum and bass slider picks it); otherwise a set BPM from 60 to 200.
  // Every slider keeps working at the tempo you set: optional notes, strums, slow attacks, swing and half-time all follow it.
  (function () {
    const wrap = document.createElement('div'); wrap.className = 'slider';
    wrap.innerHTML = '<div class="top"><label class="name" for="sl_bpm">Tempo (BPM)</label><span class="val" id="v_bpm"></span></div>' +
      '<input id="sl_bpm" type="range" min="59" max="200" step="1"><div class="tip">Far left is Auto. Otherwise sets the base tempo. Slower tempos get busier optional notes and longer strums, faster ones get fewer, and half-time only happens when it would still feel like a pulse.</div>';
    $('#feelSliders').appendChild(wrap);
    const inp = $('input', wrap), val = $('.val', wrap);
    const paint = () => { val.textContent = +inp.value < 60 ? 'Auto' : inp.value; inp.style.setProperty('--fill', ((inp.value - 59) / 1.41) + '%'); };
    sliderEls.bpm = { inp, val, paint };
    inp.value = S.params.bpm > 0 ? Math.round(S.params.bpm) : 59; paint();
    inp.addEventListener('input', () => {
      S.params.bpm = +inp.value < 60 ? 0 : +inp.value; paint(); persist();
      if (engine) engine.setParams({ bpm: S.params.bpm });
    });
  })();

  // ---------------------------------------------------------------- game state
  function buildSeg(host, opts, get, set) {
    const btns = [];
    opts.forEach(([val, label]) => {
      const b = document.createElement('button'); b.textContent = label; b.type = 'button';
      b.addEventListener('click', () => { set(val); paint(); });
      host.appendChild(b); btns.push([val, b]);
    });
    function paint() { btns.forEach(([val, b]) => b.setAttribute('aria-pressed', String(get() === val))); }
    paint();
  }
  const GN = {
    tod: { day: 'Day: a little brighter and more energetic, less jazz.', dusk: 'Dusk: more emo open chords, a hint of radio.', night: 'Night: jazzier, leaning to half-time, less dense, more space.' },
  };
  const CN = { new: 'New composer: harmony planned per phrase, cadences, a returning hook, plucks damped at chord changes.', old: 'Old composer: the first version, kept for comparing. Same seed, same sliders.' };
  buildSeg($('#segComposer'), [['old', 'Old composer'], ['new', 'New composer']], () => S.composer, v => {
    if (S.composer === v) return;
    S.composer = v; persist(); $('#composerNote').textContent = CN[v];
    if (engine) engine.composerKind = v;
    if (isPlaying()) startPlay();
  });
  $('#composerNote').textContent = CN[S.composer];
  function updateGameNote() {
    const g = S.game, bits = [GN.tod[g.tod]];
    if (g.rain) bits.push('Rain: music filtered and spacious, softer hats, rain on the mix.');
    if (g.view === 'zoomed') bits.push('Zoomed out: mostly the pad wash, other layers pulled right back.');
    if (g.view === 'busy') bits.push('Busy district: breakbeats forced on, denser, city hum and radio up.');
    $('#gameNote').textContent = bits.join(' ');
  }
  function setGame(patch) { Object.assign(S.game, patch); persist(); if (engine) engine.setGame(S.game); updateGameNote(); }
  buildSeg($('#segTod'), [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], () => S.game.tod, v => setGame({ tod: v }));
  buildSeg($('#segRain'), [[false, 'Clear'], [true, 'Rain']], () => S.game.rain, v => setGame({ rain: v }));
  buildSeg($('#segView'), [['street', 'Street'], ['zoomed', 'Zoomed out'], ['busy', 'Busy district']], () => S.game.view, v => setGame({ view: v }));
  updateGameNote();
  [['tGate', 'gate'], ['tVinyl', 'vinyl'], ['tHum', 'hum'], ['tRadio', 'radio']].forEach(([id, k]) => {
    const el = $('#' + id); el.checked = !!S.tex[k];
    el.addEventListener('change', () => {
      S.tex[k] = el.checked; persist();
      if (engine) { if (k === 'gate') engine.setGated(el.checked); else engine.setTexture({ [k]: el.checked }); }
    });
  });

  // ---------------------------------------------------------------- master + mixer
  const masterEl = $('#master');
  masterEl.value = S.master; masterEl.style.setProperty('--fill', S.master + '%');
  masterEl.addEventListener('input', () => {
    S.master = +masterEl.value; masterEl.style.setProperty('--fill', S.master + '%'); persist();
    if (synth) synth.setMaster(Math.pow(S.master / 100, 1.6));
  });
  const strips = {};
  const DEFAULT_FADER = { drums: 0.88, bass: 0.92, keys: 0.8, twinkle: 0.78, pads: 0.62, lead: 0.66, texture: 0.6 };
  J.LAYERS.forEach(n => {
    const el = document.createElement('div'); el.className = 'strip';
    el.innerHTML = '<div class="nm"><span>' + n + '</span><span class="lv" style="font-family:var(--mono);color:var(--dim);font-size:12px"></span></div>' +
      '<div class="meter"><i></i></div>' +
      '<input type="range" min="0" max="120" aria-label="' + n + ' level">' +
      '<div class="ms"><button type="button" class="m" aria-pressed="false" title="Mute">M</button><button type="button" class="s" aria-pressed="false" title="Solo">S</button></div>';
    $('#mixer').appendChild(el);
    const fad = $('input', el), mBtn = $('.m', el), sBtn = $('.s', el);
    const f0 = S.faders[n] === undefined ? DEFAULT_FADER[n] : S.faders[n];
    fad.value = Math.round(f0 * 100); fad.style.setProperty('--fill', (fad.value / 1.2) + '%');
    $('.lv', el).textContent = fad.value;
    strips[n] = { el, fad, mBtn, sBtn, meter: $('.meter i', el), mute: false, solo: false, level: 0 };
    fad.addEventListener('input', () => {
      const v = fad.value / 100; S.faders[n] = v; persist(); fad.style.setProperty('--fill', (fad.value / 1.2) + '%'); $('.lv', el).textContent = fad.value;
      if (synth) synth.setFader(n, v);
    });
    mBtn.addEventListener('click', () => { strips[n].mute = !strips[n].mute; mBtn.setAttribute('aria-pressed', String(strips[n].mute)); el.classList.toggle('muted', strips[n].mute); if (synth) synth.setMute(n, strips[n].mute); });
    sBtn.addEventListener('click', () => { strips[n].solo = !strips[n].solo; sBtn.setAttribute('aria-pressed', String(strips[n].solo)); if (synth) synth.setSolo(n, strips[n].solo); });
  });
  function mixerSync() { J.LAYERS.forEach(n => { const st = strips[n]; if (st.mute) synth.setMute(n, true); if (st.solo) synth.setSolo(n, true); }); }

  // ---------------------------------------------------------------- ratings
  function fmtParams(p) { return J.PARAM_KEYS.map(k => k + ' ' + Math.round(p[k] * 100)).join(', ') + (p.bpm > 0 ? ', bpm ' + Math.round(p.bpm) : '') + (p.riff > 0 ? ', riff ' + Math.round(p.riff * 100) : ''); }
  function renderRatings() {
    const ul = $('#ratings'); ul.innerHTML = '';
    S.ratings.slice().reverse().forEach(r => {
      const li = document.createElement('li');
      const meta = document.createElement('div'); meta.className = 'meta';
      const g = r.game || {};
      meta.innerHTML = '<b>seed ' + escapeHtml(r.seed) + '</b> ' + escapeHtml((r.song && r.song.key) || '') + (r.song ? ' ' + r.song.bpm + ' BPM' : '') + ' &middot; ' + escapeHtml((r.composer || 'old') + ' composer') +
        ' &middot; ' + escapeHtml([g.tod, g.rain ? 'rain' : null, g.view !== 'street' ? g.view : null].filter(Boolean).join(', ')) +
        (r.at ? '<br>at ' + escapeHtml(r.at.section + ' ' + r.at.meter) : '') + (r.note ? '<br>&ldquo;' + escapeHtml(r.note) + '&rdquo;' : '');
      const tag = document.createElement('span'); tag.className = 'tag ' + r.verdict; tag.textContent = r.verdict === 'keep' ? 'KEEP' : 'NO';
      const acts = document.createElement('div'); acts.className = 'acts';
      const play = document.createElement('button'); play.textContent = 'Load'; play.title = 'Load this seed with its slider settings';
      play.addEventListener('click', () => loadRating(r));
      const del = document.createElement('button'); del.textContent = 'x'; del.title = 'Remove from the list'; del.setAttribute('aria-label', 'Remove');
      del.addEventListener('click', () => { S.ratings = S.ratings.filter(x => x.id !== r.id); persist(); renderRatings(); });
      acts.appendChild(play); acts.appendChild(del);
      li.appendChild(tag); li.appendChild(meta); li.appendChild(acts);
      ul.appendChild(li);
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function loadRating(r) {
    const p = r.startParams || r.params;
    Object.assign(S.params, p); S.params.bpm = (p && p.bpm > 0) ? p.bpm : 0; S.params.riff = (p && p.riff > 0) ? p.riff : 0;
    sliderEls.riff.inp.value = Math.round(S.params.riff * 100); sliderEls.riff.val.textContent = sliderEls.riff.inp.value; sliderEls.riff.inp.style.setProperty('--fill', sliderEls.riff.inp.value + '%');
    sliderEls.bpm.inp.value = S.params.bpm > 0 ? Math.round(S.params.bpm) : 59; sliderEls.bpm.paint();
    J.PARAM_KEYS.forEach(k => { const e = sliderEls[k]; e.inp.value = Math.round(S.params[k] * 100); e.val.textContent = e.inp.value; e.inp.style.setProperty('--fill', e.inp.value + '%'); });
    if (r.game) { Object.assign(S.game, r.game); refreshSegs(); if (engine) engine.setGame(S.game); updateGameNote(); }
    if (engine) engine.setParams(S.params);
    pushSeed(r.seed); persist(); startPlay();
  }
  function refreshSegs() {
    const vals = { segTod: S.game.tod, segRain: S.game.rain, segView: S.game.view };
    const opts = { segTod: ['day', 'dusk', 'night'], segRain: [false, true], segView: ['street', 'zoomed', 'busy'] };
    Object.keys(vals).forEach(id => $('#' + id).querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(opts[id][i] === vals[id]))));
  }
  function rate(verdict) {
    const snap = engine ? engine.snapshot() : { seed: curSeed(), params: Object.assign({}, S.params), startParams: Object.assign({}, S.params), game: Object.assign({}, S.game), song: null, at: null };
    const rec = Object.assign({ id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), time: new Date().toISOString(), verdict, note: $('#note').value.trim() }, snap);
    S.ratings.push(rec); persist(); renderRatings();
    $('#note').value = '';
    $('#rateMsg').textContent = (verdict === 'keep' ? 'Kept' : 'Marked as not working') + ': seed ' + rec.seed + '. ' + S.ratings.length + ' in the list. Use Export JSON to hand the file back.';
  }
  $('#keep').addEventListener('click', () => rate('keep'));
  $('#reject').addEventListener('click', () => rate('reject'));
  $('#note').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#keep').click(); });
  function exportObject() {
    return {
      app: 'neon-terrarium-jam-room', version: 1, exported: new Date().toISOString(),
      note: 'Each rating holds the seed and the slider settings that were active, so loading both replays the same piece.',
      currentSettings: { seed: curSeed(), params: S.params, game: S.game },
      ratings: S.ratings,
    };
  }
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportObject(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); const d = new Date(); const pad = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(blob); a.download = 'jam-ratings-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    // Some hosts (including the hosted artifact view) block downloads, so the text is also shown to select and copy.
    const box = $('#exportBox'); box.hidden = false; box.value = JSON.stringify(exportObject(), null, 2); box.focus(); box.select();
    $('#rateMsg').textContent = 'Exported ' + S.ratings.length + ' ratings. If no file appeared in Downloads, copy the text in the box below and send that.';
  });
  $('#copyjson').addEventListener('click', async () => {
    const text = JSON.stringify(exportObject(), null, 2);
    try { await navigator.clipboard.writeText(text); $('#rateMsg').textContent = 'Copied the JSON to the clipboard.'; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); $('#rateMsg').textContent = 'Copied the JSON to the clipboard.'; } catch (e2) { $('#rateMsg').textContent = 'Could not copy. Use Export JSON instead.'; }
      ta.remove();
    }
  });
  $('#clearr').addEventListener('click', () => {
    if (!S.ratings.length) return;
    const b = $('#clearr');
    if (!b.dataset.armed) { // two clicks instead of a confirm dialog (dialogs are blocked in some hosts)
      b.dataset.armed = '1'; b.textContent = 'Click again to clear'; $('#rateMsg').textContent = 'This removes all ' + S.ratings.length + ' ratings. Export first if you want to keep them.';
      setTimeout(() => { delete b.dataset.armed; b.textContent = 'Clear list'; }, 4000); return;
    }
    delete b.dataset.armed; b.textContent = 'Clear list';
    S.ratings = []; persist(); renderRatings(); $('#rateMsg').textContent = 'List cleared.';
  });

  // ---------------------------------------------------------------- NPC motif
  $('#npcPlay').addEventListener('click', async () => {
    ensureAudio(); try { await ctx.resume(); } catch (e) { }
    const m = engine.playMotif($('#npc').value || '0');
    $('#npcOut').textContent = m.keyName + ' | ' + m.names.join(' ') + ' | ' + m.seconds.toFixed(1) + 's';
  });
  $('#npc').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#npcPlay').click(); });
  $('#npcRand').addEventListener('click', () => { $('#npc').value = Math.floor(Math.random() * 100000); $('#npcPlay').click(); });

  // ---------------------------------------------------------------- display
  const beatC = $('#beats'), tlC = $('#timeline'), spC = $('#spectrum');
  const COLORS = { intro: '#4a6cff', build: '#ffb83c', swell: '#ff8a3c', drop: '#ff3fa4', chorus: '#ff5d7a', breakdown: '#29f2ff', bridge: '#8a6bff', outro: '#5b6a90' };
  let sections = [], lastSecId = null, lastBar = null;
  function fitCanvas(c) { const r = c.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2); const w = Math.max(10, Math.round(r.width * d)), h = Math.max(10, Math.round(r.height * d)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return d; }
  function drawBeats() {
    const c = beatC, d = fitCanvas(c), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    const cur = engine && engine.current; if (!cur) return;
    const m = cur.bar.meter, cells = m.steps / 2, gapW = 10 * d;
    const total = c.width - gapW * (m.groups.length - 1) - 8 * d;
    const cw = total / cells; let x = 4 * d; const y = 5 * d, h = c.height - 10 * d;
    for (let gi = 0; gi < m.groups.length; gi++) {
      const n = m.groups[gi] / 2;
      for (let k = 0; k < n; k++) {
        const stepIdx = m.starts[gi] + k * 2, on = cur.step >= stepIdx && cur.step < stepIdx + 2;
        g.fillStyle = on ? '#29f2ff' : (k === 0 ? 'rgba(138,107,255,.55)' : 'rgba(138,107,255,.22)');
        if (on) { g.shadowColor = '#29f2ff'; g.shadowBlur = 12 * d; } else g.shadowBlur = 0;
        g.fillRect(x, y, cw - 3 * d, h); x += cw;
      }
      g.shadowBlur = 0; x += gapW;
    }
  }
  function drawTimeline() {
    const c = tlC, d = fitCanvas(c), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    if (!sections.length) return;
    const list = sections.slice(-9);
    const totalBars = list.reduce((a, s) => a + s.bars, 0);
    let x = 0; const w = c.width, y = 6 * d, h = c.height - 22 * d;
    list.forEach((s, i) => {
      const sw = w * s.bars / totalBars;
      g.fillStyle = COLORS[s.kind] || '#666'; g.globalAlpha = i === list.length - 1 ? 0.95 : 0.5;
      g.fillRect(x + 1, y, sw - 2, h); g.globalAlpha = 1;
      g.fillStyle = '#fff'; g.font = (11 * d) + 'px ui-monospace, Menlo, monospace'; g.textBaseline = 'top';
      if (sw > 40 * d) g.fillText(s.kind + (s.clock === 0.5 ? ' (slow)' : ''), x + 6 * d, y + 5 * d);
      if (i === list.length - 1 && lastBar) {
        const px = x + sw * (lastBar.barNo + lastBar.step / lastBar.steps) / s.bars;
        g.fillStyle = '#fff'; g.fillRect(px - d, y - 3 * d, 2 * d, h + 6 * d);
      }
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(s.bars + ' bars', x + 6 * d, y + h + 3 * d);
      x += sw;
    });
  }
  const freq = new Uint8Array(512);
  function drawSpectrum() {
    const c = spC, d = fitCanvas(c), g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
    if (!synth) return;
    synth.master.analyser.getByteFrequencyData(freq);
    const bars = 64, bw = c.width / bars;
    const grad = g.createLinearGradient(0, c.height, 0, 0); grad.addColorStop(0, '#8a6bff'); grad.addColorStop(0.6, '#29f2ff'); grad.addColorStop(1, '#ff3fa4');
    g.fillStyle = grad;
    for (let i = 0; i < bars; i++) {
      const lo = Math.floor(Math.pow(i / bars, 2.1) * 400) + 1, hi = Math.floor(Math.pow((i + 1) / bars, 2.1) * 400) + 2;
      let mx = 0; for (let k = lo; k < hi && k < freq.length; k++) mx = Math.max(mx, freq[k]);
      const h = (mx / 255) * c.height * 0.95;
      g.fillRect(i * bw + 1, c.height - h, bw - 2, h);
    }
  }
  function describeRules(bar, m) {
    const b = [];
    const drum = { full: 'chopped breakbeat', half: 'half-time drums', sparse: 'sparse drums', jazz: 'swung ride', punk: 'driving punk beat', math: 'accented groups', none: 'no drums' }[bar.mode] || bar.mode;
    b.push('drums: ' + drum);
    const L = bar.layers; const on = J.LAYERS.filter(n => L[n]).join(' ');
    b.push('layers: ' + on);
    if (bar.swing > 0.2) b.push('swing ' + Math.round(bar.swing * 100) + '%');
    if (bar.clock === 0.5) b.push('slow clock (half-time)');
    if (bar.bridgeKind) b.push('bridge: ' + bar.bridgeKind);
    return b.join('\n');
  }
  let lastShown = '';
  function updateNow() {
    const cur = engine && engine.current; if (!cur) return;
    const b = cur.bar; lastBar = { barNo: b.barNo, steps: b.steps, step: cur.step };
    if (b.secId !== lastSecId) { lastSecId = b.secId; sections.push({ id: b.secId, kind: b.kind, bars: b.bars, clock: b.clock }); if (sections.length > 40) sections.shift(); }
    const key = b.barCount + ':' + engine.chordNow();
    $('#nowChord').textContent = engine.chordNow() || '-';
    if (key === lastShown) return; lastShown = key;
    $('#nowSection').textContent = b.kind;
    $('#nowBar').textContent = 'bar ' + (b.barNo + 1) + ' of ' + b.bars + (b.first ? ' (start)' : '');
    $('#nowKey').textContent = 'key ' + J.NOTE_NAMES[engine.song.tonic] + ' ' + engine.song.mode + ' / ' + engine.song.scaleName;
    $('#nowMeter').textContent = b.meter.id;
    $('#nowTempo').textContent = (engine.song.bpm * b.clock).toFixed(1) + ' BPM' + (b.clock === 0.5 ? ' (half of ' + engine.song.bpm + ')' : '');
    $('#nowRules').textContent = describeRules(b);
  }
  function updateLead() {
    const cur = engine && engine.current; if (!cur) return;
    const b = cur.bar; let sg = b.segs[0]; for (const x of b.segs) if (cur.step >= x.s0 && cur.step < x.s1) sg = x;
    let txt;
    if (b.composer === 'new') {
      txt = (b.leadInfo || '-') + (sg.scale ? '   |   scale over ' + sg.name + ': ' + sg.scale : '');
      if (b.phrase && b.layers && b.layers.lead) txt += '   |   phrase bar ' + (b.phrase.pos + 1) + ' of 4, ' + b.phrase.type;
    } else txt = 'old composer: its own motif, no chord scales';
    if ($('#nowLead').textContent !== txt) $('#nowLead').textContent = txt;
  }
  let lastHealth = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (engine) {
      const lat = ctx.outputLatency || ctx.baseLatency || 0;
      engine.poll(ctx.currentTime - lat);
      updateNow(); updateLead(); drawBeats(); drawTimeline(); drawSpectrum();
      const lv = synth.levels();
      J.LAYERS.forEach(n => { const st = strips[n]; st.level = Math.max(lv[n], st.level * 0.9); st.meter.style.width = Math.min(100, Math.pow(st.level, 0.6) * 100) + '%'; });
      const now = performance.now();
      if (now - lastHealth > 400) {
        lastHealth = now;
        $('#health').textContent = 'voices ' + synth.activeVoices() + ' · ahead ' + Math.max(0, engine.slack()).toFixed(2) + 's · late ' + engine.stats.late + ' · limiter ' + synth.reductionDb().toFixed(1) + ' dB';
      }
    }
  }

  // ---------------------------------------------------------------- go
  showSeed(); renderRatings();
  requestAnimationFrame(frame);
})();
