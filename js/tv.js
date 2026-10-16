// Neon Terrarium: the old-television switch between the sky city and the coast (both pages load this, in the head).
// TV.off(then): the picture collapses to a bright line, the line to a dot, the dot goes out; then `then` (going to the
// other page). A page opened with ?tv=1 starts dark, showing static while it loads, and once TV.ready() says it's drawn
// the picture switches on: a dot, a line, then the whole screen opening out of it, the static fading.
'use strict';
const TV = (() => {
  const T = {};
  const arriving = /[?&]tv=1\b/.test(location.search);
  const css = `
    html.tv-wait, html.tv-anim { background: #000; }
    html.tv-wait body { visibility: hidden; }
    #tvStatic { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; background: #000; image-rendering: pixelated; }
    #tvStatic canvas { width: 100%; height: 100%; display: block; image-rendering: pixelated; opacity: .55; }
    #tvStatic .tv-msg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font: 12px/1 'JetBrains Mono', ui-monospace, monospace;
      letter-spacing: .35em; color: #cfd8d2; text-shadow: 2px 0 #ff2a5a, -2px 0 #2affe0; opacity: .8; animation: tvBlink 1.1s steps(2) infinite; }
    @keyframes tvBlink { 50% { opacity: .25; } }
    #tvFlash { position: fixed; inset: 0; z-index: 2147483001; pointer-events: none; display: flex; align-items: center; justify-content: center; }
    #tvFlash i { display: block; width: 100%; height: 2px; background: #fff; box-shadow: 0 0 18px 6px rgba(200,240,255,.9), 0 0 60px 20px rgba(140,200,255,.45); transform-origin: center; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  if (arriving) document.documentElement.classList.add('tv-wait');
  // static: a small canvas of noise, scaled up, redrawn twenty times a second
  let stat = null, statT = 0;
  function staticOn(msg){
    if (stat) return stat;
    const w = document.createElement('div'); w.id = 'tvStatic'; const c = document.createElement('canvas'); c.width = 160; c.height = 96; w.appendChild(c);
    if (msg){ const m = document.createElement('div'); m.className = 'tv-msg'; m.textContent = msg; w.appendChild(m); }
    document.documentElement.appendChild(w);   // (outside the body: the body is hidden while it waits)
    const g = c.getContext('2d'), img = g.createImageData(c.width, c.height);
    const draw = () => { if (!stat) return; const d = img.data; for (let i = 0; i < d.length; i += 4){ const v = Math.random()*255*(.55 + .45*Math.random()); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x++){ const k = (y*c.width + x)*4; d[k] *= .7; d[k + 1] *= .7; d[k + 2] *= .7; }   // (scanlines)
      g.putImageData(img, 0, 0); statT = setTimeout(draw, 50); };
    stat = w; draw(); return w;
  }
  function staticOff(ms = 0){ const w = stat; if (!w) return; stat = null; clearTimeout(statT);
    if (!ms){ w.remove(); return; } w.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' }).onfinish = () => w.remove(); }
  // switching off: the whole page, collapsing
  T.off = (then) => {
    document.documentElement.classList.add('tv-anim');
    const b = document.body; b.style.transformOrigin = '50% 50%';
    const a = b.animate([
      { transform: 'scale(1, 1)', filter: 'brightness(1)', offset: 0 },
      { transform: 'scale(1.02, .92)', filter: 'brightness(1.6) contrast(1.2)', offset: .12 },
      { transform: 'scale(1, .006)', filter: 'brightness(5) contrast(1.4)', offset: .42 },
      { transform: 'scale(.004, .006)', filter: 'brightness(8)', offset: .7 },
      { transform: 'scale(0, 0)', filter: 'brightness(8)', opacity: 0, offset: 1 },
    ], { duration: 900, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
    // the afterglow: a dot of light that lingers a moment on the black
    const f = document.createElement('div'); f.id = 'tvFlash'; f.innerHTML = '<i></i>'; document.documentElement.appendChild(f); const line = f.firstChild;
    line.animate([{ transform: 'scale(0, 0)', opacity: 0, offset: 0 }, { transform: 'scale(0, 0)', opacity: 0, offset: .38 }, { transform: 'scale(1, 1)', opacity: 1, offset: .44 },
      { transform: 'scale(.004, 1.6)', opacity: 1, offset: .72 }, { transform: 'scale(0, 0)', opacity: 0, offset: 1 }], { duration: 1150, easing: 'ease-in-out', fill: 'forwards' });
    a.onfinish = () => setTimeout(() => { if (then) then(); }, 320);
  };
  // switching on
  T.on = () => {
    document.documentElement.classList.remove('tv-wait'); document.documentElement.classList.add('tv-anim');
    const b = document.body; b.style.transformOrigin = '50% 50%';
    const f = document.createElement('div'); f.id = 'tvFlash'; f.innerHTML = '<i></i>'; document.documentElement.appendChild(f);
    f.firstChild.animate([{ transform: 'scale(0, 0)', opacity: 1 }, { transform: 'scale(1, 1)', opacity: 1, offset: .35 }, { transform: 'scale(1, 60)', opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' }).onfinish = () => f.remove();
    b.animate([
      { transform: 'scale(.003, .004)', filter: 'brightness(8)', offset: 0 },
      { transform: 'scale(1, .006)', filter: 'brightness(5)', offset: .3 },
      { transform: 'scale(1.03, 1.06)', filter: 'brightness(1.8) contrast(1.3) saturate(1.4)', offset: .62 },
      { transform: 'translateX(-4px) scale(1, 1)', filter: 'brightness(1.2) hue-rotate(-12deg)', offset: .78 },
      { transform: 'translateX(3px) scale(1, 1)', filter: 'brightness(1.05) hue-rotate(8deg)', offset: .88 },
      { transform: 'none', filter: 'none', offset: 1 },
    ], { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => { b.style.transform = ''; b.style.filter = ''; document.documentElement.classList.remove('tv-anim'); };
    staticOff(700);
  };
  // arriving: static until the page is drawn, then on (ready: a test the page gives; at most 25 s)
  T.ready = null;
  if (arriving){
    const go = () => {
      staticOn('RECEIVING');
      const t0 = performance.now();
      const poll = () => { let ok = false; try { ok = !!(T.ready && T.ready()); } catch (e){}
        if ((ok && performance.now() - t0 > 600) || performance.now() - t0 > 25000){ setTimeout(T.on, 150); try { if (typeof PERF !== 'undefined' && PERF.quiet) PERF.quiet(5000); } catch (e){} } else setTimeout(poll, 120); };
      poll();
      if (history.replaceState) history.replaceState(null, '', location.pathname + location.hash);   // (a reload is an ordinary one)
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  // Leaving: let go of the WebGL contexts first. Otherwise the browser may keep this page frozen in memory (its back-forward
  // cache) with all its graphics memory still held, while the next page builds its own: the sky city after a trip to the
  // coast would share the graphics card with a frozen copy of itself and the coast.
  function release(){ // (only the game's own view: asking an unused canvas for a context would make it a new one)
    for (const c of document.querySelectorAll('canvas#view')){ let gl = null; try { gl = c.getContext('webgl2') || c.getContext('webgl'); } catch (e){}
    const x = gl && gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (x) try { x.loseContext(); } catch (e){} } }
  T.go = (url) => T.off(() => { release(); location.href = url + (url.includes('?') ? '&' : '?') + 'tv=1'; });
  // a page restored from that cache (the back button) has no graphics left: load it fresh
  addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
  return T;
})();
