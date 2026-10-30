// Neon Terrarium: the touch tutorial (claude/mobile-ui-plan.md, "Feeding the tutorial"). Phones and tablets only.
// The first time a touch player is in a city, a few guided beats teach the gestures by doing them: each beat lights up where to act, says what to do
// in a few words styled as an operator's note (never mistaken for a button), and waits for the game to report that it was done (input.js and
// touchui.js send nt:pan, nt:zoom, nt:build, nt:trim, nt:resize, nt:remove, nt:restore, nt:tilt). It can be skipped at any beat, replayed from Settings,
// Interface, and each beat's shown and done counts are kept in this browser (touch:nt.tut), to see where players drop off.
// Later, one-line tips appear the first time something new turns up (a megastructure's holo-tag, the music player, Scan), while Tips is on.
'use strict';
const TUT = (() => {
  const U = { replay(){}, tips(){} };
  if (typeof TOUCH === 'undefined' || !TOUCH.on) return U;
  const KEY = 'touch:nt.tut', TIPKEY = 'touch:nt.tipsSeen';
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const tipsOn = () => { try { return localStorage.getItem('touch:nt.tips') !== '0'; } catch (e) { return true; } };
  const st = load(KEY, { done: false, beats: {} });
  const mark = (id, what) => { const b = st.beats[id] || (st.beats[id] = { shown: 0, done: 0 }); b[what]++; save(KEY, st); };

  // the beats: what to do, where to look, the gesture's ghost, and the event that says it's done
  const zoneCard = () => document.querySelector('.zones > .tcur, .zones > .zcol.tcur, .zones .zone.on') || document.querySelector('.zones');
  const center = () => ({ x: innerWidth/2, y: innerHeight*.45, r: 70 });
  const atFresh = () => { const f = typeof FRESH !== 'undefined' && FRESH; if (!f) return center(); const v = new THREE.Vector3(f.c.x, f.c.height || 2, f.c.z).project(cam), r = document.getElementById('view').getBoundingClientRect();
    return { x: r.left + (v.x*.5 + .5)*r.width, y: r.top + (1 - (v.y*.5 + .5))*r.height, r: 56 }; };
  const BEATS = [
    { id: 'pan', say: 'Drag to look around', at: center, ghost: 'drag', ev: 'pan' },
    { id: 'zoom', say: 'Pinch to zoom', at: center, ghost: 'pinch', ev: 'zoom' },
    { id: 'zone', say: 'Swipe the zone card, or tap it', at: () => rectOf(zoneCard()), ghost: 'swipe', test: () => !!S.zone },
    { id: 'build', say: 'Tap anywhere on the platform to build', at: center, ghost: 'tap', ev: 'build', need: () => !!S.zone, pre: 'Pick a zone first' },
    { id: 'trim', say: 'Build, then tap it again, quickly: one floor', at: atFresh, ghost: 'tap2', ev: 'trim' },
    { id: 'resize', say: 'Build, tap it again and drag up: its height', at: atFresh, ghost: 'up', ev: 'resize' },
    { id: 'remove', say: 'Hold a building to remove it', at: center, ghost: 'hold', ev: 'remove' },
    { id: 'restore', say: 'Tap Restore to bring it back', at: () => rectOf(document.querySelector('.trestore:not([hidden])')) || center(), ghost: 'tap', ev: 'restore', skipIf: () => !document.querySelector('.trestore:not([hidden])') },
    { id: 'tilt', say: 'Two fingers up or down: tilt', at: center, ghost: 'two', ev: 'tilt' },
  ];
  function rectOf(e){ if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width/2, y: r.top + r.height/2, r: Math.max(r.width, r.height)/2 + 10 }; }

  // the overlay: a dim with a hole where to act (no pointer events: the game underneath takes every touch), the note, and Skip
  const ov = document.createElement('div'); ov.className = 'ttut'; ov.hidden = true;
  // (no dimming and no spotlight (owner, Oct 30): the player does each gesture wherever they like; the note shows a small ghost of it)
  ov.innerHTML = '<div class="tt-note"><div class="tt-demo"><div class="tt-ghost"><i></i><i></i></div></div><div class="tt-txt"><small></small><b></b></div><button type="button">Skip tutorial</button></div>';
  document.body.appendChild(ov);
  const ghost = ov.querySelector('.tt-ghost'), note = ov.querySelector('.tt-note'), say = note.querySelector('b'), step = note.querySelector('small');
  note.querySelector('button').addEventListener('click', () => finish(true));
  let k = -1, on = false, raf = 0, waitEv = null;
  function place(){
    if (!on) return; raf = requestAnimationFrame(place);
    const b = BEATS[k];
    if (b && b.test && b.test()) next();
    if (b && b.skipIf && b.skipIf()) next();
  }
  function show(){
    const b = BEATS[k]; if (!b){ finish(false); return; }
    mark(b.id, 'shown');
    const blocked = b.need && !b.need();
    say.textContent = blocked ? b.pre : b.say; step.textContent = '// OPERATOR NOTE ' + (k + 1) + ' / ' + BEATS.length;
    ghost.className = 'tt-ghost g-' + (blocked ? 'tap' : b.ghost);
    if (waitEv) removeEventListener('nt:' + waitEv, onEv); waitEv = b.ev || null; if (waitEv) addEventListener('nt:' + waitEv, onEv);
    if (blocked){ const iv = setInterval(() => { if (!on || BEATS[k] !== b){ clearInterval(iv); return; } if (b.need()){ clearInterval(iv); show(); } }, 300); }
  }
  function onEv(){ next(); }
  function next(){ const b = BEATS[k]; if (b) mark(b.id, 'done'); k++; if (k >= BEATS.length) finish(false); else show(); }
  function start(){ if (on) return; on = true; k = 0; ov.hidden = false; show(); place(); }
  function finish(skipped){
    on = false; cancelAnimationFrame(raf); ov.hidden = true; if (waitEv) removeEventListener('nt:' + waitEv, onEv); waitEv = null;
    st.done = true; st.skipped = !!skipped; save(KEY, st);
    if (!skipped) tip('Done. Settings, Controls has every gesture.', null, 4200);
  }
  U.replay = () => { st.done = false; save(KEY, st); setTimeout(start, 400); };

  // starts once the player is in a city (past the title, the city loaded), the first time only
  const ready = () => !(typeof TITLE !== 'undefined' && TITLE.on) && !(typeof LOADP !== 'undefined' && LOADP.on) && document.getElementById('view') &&
    !(typeof OVERSEER !== 'undefined' && OVERSEER.hold) && !(typeof PRECINCT !== 'undefined' && PRECINCT.hold) && !(typeof FURN !== 'undefined' && FURN.hold) && !document.documentElement.classList.contains('gp-open');
  const iv = setInterval(() => { if (st.done){ clearInterval(iv); return; } if (ready()){ clearInterval(iv); setTimeout(() => { if (ready() && !st.done) start(); }, 1200); } }, 700);

  // just-in-time tips: one line, the first time each thing turns up, near it
  const seen = load(TIPKEY, {});
  const tipEl = document.createElement('div'); tipEl.className = 'ttip'; tipEl.hidden = true; document.body.appendChild(tipEl);
  let tipT = 0;
  function tip(text, target, ms = 5000){
    tipEl.textContent = text; tipEl.hidden = false;
    const r = target && target.getBoundingClientRect(), w = Math.min(300, innerWidth - 24);
    tipEl.style.maxWidth = w + 'px';
    const tr = tipEl.getBoundingClientRect();
    const x = r ? Math.max(12, Math.min(innerWidth - tr.width - 12, r.left + r.width/2 - tr.width/2)) : (innerWidth - tr.width)/2;
    const y = r ? (r.top - tr.height - 12 > 12 ? r.top - tr.height - 12 : r.bottom + 12) : innerHeight*.3;
    tipEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    clearTimeout(tipT); tipT = setTimeout(() => { tipEl.hidden = true; }, ms);
  }
  const TIPS = [
    { id: 'tag', find: () => [...document.querySelectorAll('.tholo.ton')].find(e => e.getBoundingClientRect().width), say: 'Tap the button to open its screen' },
    { id: 'music', find: () => { const g = document.getElementById('gridDeck'); return g && !g.hidden && g.getBoundingClientRect().width ? g : null; }, say: 'The Grid is broadcasting. Tap the player for more' },
    { id: 'scan', find: () => { const b = document.getElementById('furnBtn'); return b && !b.hidden && b.getBoundingClientRect().width ? b : null; }, say: 'Scan reads a pod: tap it, then a home' },
    { id: 'people', find: () => typeof megasOfKind === 'function' && megasOfKind('police').length ? document.getElementById('view') : null, say: 'Tap someone in the street to watch them' },
  ];
  setInterval(() => {
    if (!tipsOn() || on || !st.done || !ready() || !tipEl.hidden) return;
    for (const t of TIPS){ if (seen[t.id]) continue; const e = t.find(); if (!e) continue; seen[t.id] = 1; save(TIPKEY, seen); tip(t.say, e === document.getElementById('view') ? null : e); break; }
  }, 2500);
  U.tips = v => { if (!v) tipEl.hidden = true; };
  return U;
})();
