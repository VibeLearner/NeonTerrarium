// Does building slow the city down on your computer? Paste this whole file into the browser console (F12, Console) while a city is open and
// the tab is in front. Start with the F3 overlay closed, and don't touch the mouse or keys while it runs (about 2 minutes a phase).
//
// It CHANGES your saved city (150 edits are saved so that a reload shows the same city), so it first keeps a copy of your save in
// localStorage 'editleakBackup' and puts it back at the end of phase 2. If you would rather not risk it, run it in a spare browser profile.
//
// Phase 1 (just paste the file):
//   15 seconds standing still at zoom 30: frames a second, worst frame, draw calls, what three holds on the card (geometries, textures,
//   programs), Chrome's JS heap if it reports it. Then 150 edits by script (platforms, sections in every zone, demolitions, greenery, a
//   megastructure down and up) at about 4 a second, the same edits on every run (no random numbers). Then the same 15 seconds again.
//   It saves the city and the rows, and tells you to RELOAD the page.
// Phase 2 (after the reload): type  window.__EDITLEAK_PHASE = 'fresh'  in the console, paste the file again. It measures the same view
//   on the reloaded city, prints all three rows, and puts your own save back (reload once more to get your city).
// Run both phases on main and on the branch. Done when the branch's "after edits" frames a second are within 5% of its "after a reload".
(async () => {
  const PHASE = window.__EDITLEAK_PHASE || 'edit', OPT = Object.assign({ seconds: 15, edits: 150, perSecond: 4, zoom: 30 }, window.__OWNER_OPTS || {});
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (PH.on) { console.log('Close the F3 overlay first (F3).'); return; }
  const frames = ms => new Promise(resolve => { const t0 = performance.now(); let last = 0, n = 0, worst = 0; const dts = [];
    const tick = now => { if (last) { const d = now - last; dts.push(d); if (d > worst) worst = d; } last = now; n++; if (now - t0 < ms) requestAnimationFrame(tick); else { dts.sort((a, b) => a - b); resolve({ fps: n / ((now - t0) / 1000), worst, p95: dts[Math.min(dts.length - 1, Math.floor(dts.length * .95))] }); } };
    requestAnimationFrame(tick); });
  const sample = async label => {
    zoom = zoomT = OPT.zoom; await sleep(1500);
    const f = await frames(OPT.seconds * 1000);
    renderer.info.autoReset = false; renderer.info.reset(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const m = renderer.info.memory, mem = performance.memory;
    renderer.info.autoReset = true;
    return { label, fps: +f.fps.toFixed(1), worstMs: +f.worst.toFixed(1), p95Ms: +f.p95.toFixed(1), drawCalls: renderer.info.render.calls, geometries: m.geometries, textures: m.textures, programs: renderer.info.programs ? renderer.info.programs.length : null, jsHeapMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(0) : null, cells: cells.size };
  };
  window.__EL = (() => {
    const E = {}; E.log = [];
    const ZS = ['low', 'mid', 'high', 'ind'];
    const built = () => [...cells.values()].filter(c => !c.mega && c.sections.length && !c.lift).sort((a, b) => a.i - b.i || a.j - b.j);
    const empties = () => [...cells.values()].filter(c => !c.mega && !c.sections.length && !c.lift).sort((a, b) => a.i - b.i || a.j - b.j);
    const pick = (list, k) => list.length ? list[(k * 7919 + 13) % list.length] : null;
    E.edit = k => {
      const r = k % 8; let what = '';
      try {
        if (r === 0 || r === 4){   // a new platform beside a plot
          const b = pick([...cells.values()].filter(c => !c.mega), k); let done = null;
          if (b) for (const [a, d] of [[1, 0], [0, 1], [-1, 0], [0, -1]]){ const i = b.i + a, j = b.j + d; if (Math.abs(i) <= 7 && Math.abs(j) <= 7 && !cells.has(ckey(i, j))){ done = addPlatform(i, j, null); break; } }
          what = done ? 'platform' : 'platform (none free)';
        } else if (r === 1 || r === 5){ const c = pick(empties(), k) || pick(built(), k); if (c){ addSection(c, ZS[(k >> 1) % 4]); what = 'section ' + ZS[(k >> 1) % 4]; } }
        else if (r === 2){ const c = pick(built(), k); if (c){ addSection(c, ZS[(k + 1) % 4]); what = 'tower section'; } }
        else if (r === 3){ const bl = built(); if (bl.length > 14){ removeAt({ kind: 'bld', c: pick(bl, k) }); what = 'demolish'; } else { const c = pick(bl, k); if (c){ addSection(c, 'mid'); what = 'section (kept: few plots)'; } } }
        else if (r === 6){ const c = pick(built(), k); if (c){ cycleGreen(c); what = 'greenery'; } }
        else if (r === 7){
          if (k % 16 === 7){   // a megastructure down, and on the next round up out of the way again
            const f = [...cells.values()].filter(c => !c.mega); let ok = null;
            for (let q = 0; q < 40 && !ok; q++){ const c = pick(f, k + q); if (c && !c.sections.length){ const m = placeMega('foundry', c.i, c.j, 77 + k); if (m) ok = m; } }
            E.mega = ok ? ok.id : null; what = ok ? 'mega placed' : 'mega (no room)';
          } else if (E.mega && megas.get(E.mega)){ removeMega(megas.get(E.mega)); E.mega = null; what = 'mega removed'; }
          else { const c = pick(empties(), k); if (c){ removePlatform(c); what = 'platform removed'; } }
        }
      } catch (e) { what = 'ERROR ' + e; }
      E.log.push(what); return what;
    };
    return E;
  })();
  const KEYS = ['neonIsland.v2', 'neonIsland.megas', 'neonIsland.highways', 'neonIsland.metros'];
  const rows = PHASE === 'fresh' ? JSON.parse(localStorage.getItem('editleakRows') || '[]') : [];
  if (PHASE === 'fresh') {
    rows.push(await sample('after a reload'));
    const bk = JSON.parse(localStorage.getItem('editleakBackup') || 'null');
    if (bk) { for (const k of KEYS) { if (bk[k] === null) localStorage.removeItem(k); else localStorage.setItem(k, bk[k]); } localStorage.removeItem('editleakBackup'); console.log('Your own save is back. Reload once more to see your city.'); }
  }
  else {
    if (!localStorage.getItem('editleakBackup')) { const bk = {}; for (const k of KEYS) bk[k] = localStorage.getItem(k); localStorage.setItem('editleakBackup', JSON.stringify(bk)); }
    rows.push(await sample('before the edits'));
    const t0 = performance.now(); let k = 0;
    while (k < OPT.edits) { __EL.edit(k++); await sleep(1000 / OPT.perSecond); }
    let g = 0; while (anims.length && g++ < 600) await sleep(100);
    await sleep(3000);
    rows.push(await sample('after ' + OPT.edits + ' edits'));
    save(); localStorage.setItem('editleakRows', JSON.stringify(rows));
    console.log('Saved. Now RELOAD the page, then in the console: window.__EDITLEAK_PHASE = "fresh", and paste this file again.');
  }
  console.table(rows); window.__editleakRows = rows; return rows;
})();
