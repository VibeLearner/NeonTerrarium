// Neon Terrarium: the shared bottom sheet, on a touch screen (phones and tablets; a mouse and keyboard never see it).
// The things you glance at while still playing (the person cam, the transmission log, the music player) open here, from the
// bottom edge, one at a time, and the city above stays live: drag, pinch and tap on it go on as before (a nonmodal sheet).
//  - it rests at a few heights (detents): peek, half, full, or fit (as tall as what's in it). Drag the 48 px handle to move it,
//    tap the handle to go up a step (from the top one, back down); drag it down past the lowest to put it away
//  - there is always a visible close (the sheet's own ✕, or the owner's, when it brings one), and Android's Back closes it too:
//    one history entry while a sheet is up, taken back when it closes (popstate, the browser's Back event)
//  - opening another puts the open one away. An owner can ask to be parked instead (parkOnReplace): it folds to a chip of its
//    own (the person cam's follow chip) that steps aside while another sheet is up and comes back when that one closes
//  - its own height, the dock's and the safe areas go on the page as CSS variables, so chips and strips can sit just above:
//    --tdock-h (from the bottom of the screen to the top of the dock), --tsheet-h (0 when no sheet is up)
// The API, small on purpose:
//   TSHEET.open(el, { detent, detents, peek, half, title, closeBtn, scroll, parkOnReplace, onClose, onDetent, onCover })
//     el is moved into the sheet and put back where it was when the sheet lets it go. peek / half: the body's height in px
//     at that detent (a number or a function), instead of the defaults (a third, half of the screen).
//   TSHEET.close(el)   (el left out: whatever is open)   TSHEET.park(el)   TSHEET.setDetent(d)
//   TSHEET.isOpen(el)  TSHEET.isParked(el)  TSHEET.covered()  TSHEET.room()  TSHEET.detent  TSHEET.on (false on a desktop: nothing should call it there)
// Loaded in the head, right after touch.js (it needs TOUCH.on).
'use strict';
const TSHEET = (() => {
  const S = { on: typeof TOUCH !== 'undefined' && TOUCH.on, detent: null };
  const BAR = 48;   // the handle's row: Material's 48 dp
  let root = null, bar = null, ttl = null, xb = null, body = null, probe = null;
  let cur = null, parked = null, closing = false;
  let histOn = false, skipPop = 0;

  /* ---------- the sheet itself, made the first time it's needed ---------- */
  function make(){
    if (root) return;
    root = document.createElement('section'); root.id = 'tsheet'; root.className = 'tsheet'; root.hidden = true;
    root.setAttribute('role', 'region');
    root.innerHTML = '<div class="ts-bar"><span class="ts-t"></span><span class="ts-grip" aria-hidden="true"></span>' +
      '<button class="ts-x" type="button" aria-label="Close">✕</button></div><div class="ts-body"></div>';
    document.body.appendChild(root);
    bar = root.querySelector('.ts-bar'); ttl = root.querySelector('.ts-t'); xb = root.querySelector('.ts-x'); body = root.querySelector('.ts-body');
    xb.addEventListener('click', e => { e.stopPropagation(); S.close(); });
    // (how tall the notch and the home bar are: env() only resolves inside a style, so a hidden probe is measured)
    probe = document.createElement('div'); probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    drag();
  }
  const vh = () => (window.visualViewport && visualViewport.height) || innerHeight;
  const safe = () => { if (!probe) return { t: 0, b: 0 }; const cs = getComputedStyle(probe); return { t: parseFloat(cs.height) || 0, b: parseFloat(cs.paddingBottom) || 0 }; };
  // the body's height at each detent (the handle's row and the home bar's strip come on top)
  const val = v => typeof v === 'function' ? v() : v;
  // the most the body can be (at full): the screen less the top bar's room, the handle and the safe areas
  const room = () => { const s = safe(); return Math.max(120, vh() - s.t - 56 - BAR - s.b); };
  function bodyH(d){
    const max = room();
    let h;
    if (d === 'full') h = max;
    else if (d === 'fit') h = body.firstElementChild ? body.firstElementChild.scrollHeight : max/2;
    else if (d === 'peek') h = cur && cur.o.peek != null ? val(cur.o.peek) : vh()*.3 - BAR;
    else h = cur && cur.o.half != null ? val(cur.o.half) : vh()*.5 - BAR;
    return Math.round(Math.max(40, Math.min(max, h || 0)));
  }
  const order = () => (cur ? cur.o.detents : ['half']).map(d => [d, bodyH(d)]).sort((a, b) => a[1] - b[1]);

  let shownH = 0;
  function setH(h, anim){
    root.classList.toggle('ts-anim', !!anim);
    shownH = h; body.style.height = h + 'px';
    document.documentElement.style.setProperty('--tsheet-h', root.hidden ? '0px' : (h + BAR + safe().b) + 'px');
  }
  S.setDetent = d => { if (!cur) return; if (!cur.o.detents.includes(d)) d = cur.o.detents[0]; cur.d = S.detent = d; root.dataset.detent = d; setH(bodyH(d), true); if (cur.o.onDetent) cur.o.onDetent(d); };

  /* ---------- the handle: drag it, flick it, tap it ---------- */
  function drag(){
    let g = null;
    bar.addEventListener('pointerdown', e => {
      if (!cur || e.target.closest('button')) return;
      bar.setPointerCapture(e.pointerId);
      g = { id: e.pointerId, y: e.clientY, h: shownH, t: performance.now(), vy: 0, ly: e.clientY, lt: performance.now(), moved: false };
    });
    bar.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y; if (Math.abs(dy) > 6) g.moved = true; if (!g.moved) return;
      const now = performance.now(); g.vy = (e.clientY - g.ly)/Math.max(1, now - g.lt); g.ly = e.clientY; g.lt = now;
      setH(Math.max(0, Math.min(bodyH('full'), g.h - dy)), false);
    });
    const up = e => {
      if (!g || e.pointerId !== g.id) return; const was = g; g = null;
      if (!cur) return;
      const ds = order();
      if (!was.moved){   // a tap: one step up, and from the top one back to the lowest
        const k = ds.findIndex(([d]) => d === cur.d); S.setDetent((ds[k + 1] || ds[0])[0]); return; }
      // a flick carries on a little way; let go below the lowest by a good margin (or flicked down from it), it closes
      const aim = shownH - was.vy*160;
      if (aim < ds[0][1] - 70 || (was.vy > .9 && shownH < ds[0][1] + 10)){ S.close(); return; }
      let best = ds[0]; for (const x of ds) if (Math.abs(x[1] - aim) < Math.abs(best[1] - aim)) best = x;
      S.setDetent(best[0]);
    };
    bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  }

  /* ---------- Back closes it ---------- */
  function histPush(){ if (histOn) return; try { history.pushState({ tsheet: 1 }, ''); histOn = true; } catch (e){} }
  function histDrop(){ if (!histOn) return; histOn = false; skipPop++; try { history.back(); } catch (e){ skipPop--; } }
  addEventListener('popstate', () => {
    if (skipPop){ skipPop--; if (cur && !histOn) histPush(); return; }   // (our own step back; a sheet opened meanwhile gets its entry again)
    if (cur){ histOn = false; S.close(); }
  });

  /* ---------- putting things in and taking them out ---------- */
  function home(el){ return { parent: el.parentNode, next: el.nextSibling }; }
  function putBack(e){ const h = e.home; if (!h.parent) { e.el.remove(); return; } if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(e.el, h.next); else h.parent.appendChild(e.el); }
  function hide(){
    root.hidden = true; root.classList.remove('ts-anim'); delete root.dataset.key;
    document.documentElement.classList.remove('tsheet-on'); document.documentElement.style.setProperty('--tsheet-h', '0px'); S.detent = null;
  }
  // the one that's up goes: closed, or parked if it asked to be
  function release(why){
    const e = cur; if (!e) return; cur = null;
    putBack(e);
    if (why === 'replaced' && e.o.parkOnReplace){
      if (parked && parked !== e){ const p = parked; parked = null; if (p.o.onClose) p.o.onClose('replaced'); }
      parked = e; if (e.o.onCover) e.o.onCover(true); return;
    }
    if (e.o.onClose){ closing = true; try { e.o.onClose(why); } finally { closing = false; } }
  }
  S.open = (el, o = {}) => {
    if (!S.on || !el) return;
    make();
    if (cur && cur.el === el){ Object.assign(cur.o, o, { detents: o.detents || cur.o.detents }); if (o.detent) S.setDetent(o.detent); return; }
    if (cur) release('replaced');
    if (parked && parked.el === el) parked = null;   // (the parked one coming back up)
    else if (parked && parked.o.onCover) parked.o.onCover(true);
    const detents = o.detents && o.detents.length ? o.detents : ['half'];
    cur = { el, o: Object.assign({}, o, { detents }), home: home(el), d: null };
    body.appendChild(el);
    root.dataset.key = o.key || '';
    root.setAttribute('aria-label', o.title || 'Panel');
    ttl.textContent = o.title || '';
    xb.hidden = o.closeBtn === false;
    root.classList.toggle('ts-scroll', o.scroll !== false);
    const fresh = root.hidden;
    root.hidden = false; document.documentElement.classList.add('tsheet-on');
    if (fresh){ root.classList.remove('ts-in'); void root.offsetWidth; root.classList.add('ts-in'); }   // (it slides up from the edge)
    S.setDetent(detents.includes(o.detent) ? o.detent : detents[0]);
    histPush();
    if (typeof PERF !== 'undefined' && PERF.quiet) PERF.quiet(800);
  };
  S.close = el => {
    if (closing) return;
    if (el && parked && parked.el === el && (!cur || cur.el !== el)){ parked = null; return; }
    if (!cur || (el && cur.el !== el)) return;
    release('closed'); hide(); histDrop();
    if (parked && parked.o.onCover) parked.o.onCover(false);   // (the parked one's chip comes back)
  };
  // fold the open one down to its owner's chip: the sheet goes, the owner keeps its subject and shows its chip
  S.park = el => {
    if (!cur || (el && cur.el !== el)) return false;
    const e = cur; cur = null; putBack(e);
    if (parked && parked !== e){ const p = parked; parked = null; if (p.o.onClose) p.o.onClose('replaced'); }
    parked = e; hide(); histDrop(); return true;
  };
  S.isOpen = el => !!cur && (!el || cur.el === el);
  S.isParked = el => !!parked && (!el || parked.el === el);
  S.covered = () => !!cur;
  S.room = room;   // (an owner sizing what it puts in, so it fits at a detent: the person cam's feed and log)

  /* ---------- the dock's height, for the chips and strips that sit just above it ---------- */
  function dockH(){
    const z = document.querySelector('.zonebar'); if (!z) return;
    const r = z.getBoundingClientRect(); if (!r.height) return;
    document.documentElement.style.setProperty('--tdock-h', Math.max(0, Math.round(innerHeight - r.top)) + 'px');
  }
  function refit(){ dockH(); if (cur) setH(bodyH(cur.d), false); }
  if (S.on){
    const boot = () => {
      document.documentElement.style.setProperty('--tsheet-h', '0px');
      dockH(); const z = document.querySelector('.zonebar');
      if (z && typeof ResizeObserver !== 'undefined') new ResizeObserver(dockH).observe(z);
      addEventListener('resize', refit); if (window.visualViewport) visualViewport.addEventListener('resize', refit);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  }
  return S;
})();
