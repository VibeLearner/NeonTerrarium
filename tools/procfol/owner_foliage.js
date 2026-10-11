// Plant cost on your own computer: paste this whole file into the browser console (F12, Console) while the city is open, then wait about
// 3 minutes and keep the tab in front (a hidden tab stops drawing). Start with the F3 overlay closed and no overlay tests on, and don't
// touch the mouse or keys while it runs.
//
// What it does, for each of 4 settings: (old sprites, new sprites) x (foliage level of detail off, on), at zoom 30, standing still
// and in a slow turn:
//   1. 10 seconds with no overlay: frames a second (counted from requestAnimationFrame) and the worst frame.
//   2. The plants' pass time, with F3 "exact timing" on (every pass waits for the graphics card, so the numbers are real times, but the
//      frame rate in that mode is lower and is not reported). The plants are drawn inside the "color" pass (main.js; there is no pass of
//      their own), so the plants' time is the color pass with the plant layer shown minus the color pass with it hidden, each
//      over a few seconds. If a pass with "plant" in its name ever exists, its own time is reported too.
// It then puts everything back (zoom, turn, overlay, switches, plants shown) and prints a table and returns the rows
// (also in window.__ownerFoliageRows; copy them with  copy(JSON.stringify(window.__ownerFoliageRows))  and send them over).
//
// The switches it uses (PH.tests.oldSprites, PH.tests.foliageLodOff) are added by the foliage work. A setting whose switch is not in this
// build is skipped, with a note. Tunables (all optional, set before pasting): window.__OWNER_OPTS = { seconds: 10, exactSeconds: 4, turnRadPerSec: .25 }.
(async () => {
  if (PH.on || Object.keys(PH.tests).some(k => PH.tests[k] && k !== 'oldSprites' && k !== 'foliageLodOff')) { console.log('Close the F3 overlay and switch its tests off first (F3, then each test button), then paste this again.'); return null; }
  const OPT = Object.assign({ seconds: 10, exactSeconds: 4, turnRadPerSec: 0.25, settleMs: 1500, zoom: 30 }, window.__OWNER_OPTS || {});
  const notes = [], rows = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = PH.tests;
  const has = k => k in T;
  const CONFIGS = [];
  for (const old of [true, false]) for (const lodOff of [true, false]) {
    const need = [].concat(old ? ['oldSprites'] : [], lodOff ? ['foliageLodOff'] : []);
    const missing = need.filter(k => !has(k));
    const label = (old ? 'old sprites' : 'new sprites') + ', LOD ' + (lodOff ? 'off' : 'on');
    if (missing.length) { notes.push('skipped "' + label + '": no PH.tests.' + missing.join(', PH.tests.') + ' in this build'); continue; }
    CONFIGS.push({ label, old, lodOff });
  }
  if (!has('oldSprites')) notes.push('no PH.tests.oldSprites here: only the sprites this build draws are measured (the "new sprites" rows)');
  // --- the plants: everything on layer 2 or drawn with the foliage shader
  const plantObjects = () => { const out = []; scene.traverse(o => { if ((o.isMesh || o.isPoints) && ((o.layers.mask & 4) || (typeof FOL_SHADER !== 'undefined' && o.material === FOL_SHADER))) out.push(o); }); return out; };
  const plantInstances = () => plantObjects().reduce((s, o) => s + (o.isInstancedMesh ? o.count : 0), 0);
  let hidden = [];
  const showPlants = v => { if (v) { for (const o of hidden) o.visible = true; hidden = []; } else { hidden = plantObjects().filter(o => o.visible); for (const o of hidden) o.visible = false; } };
  // --- what we change, saved to put back
  const saved = { zoom, zoomT, yaw, yawT, on: PH.on, exact: PH.exact, tests: {} };
  for (const k of ['oldSprites', 'foliageLodOff']) if (has(k)) saved.tests[k] = T[k];
  const restore = () => {
    showPlants(true);
    try { if (PH.on) PH.toggle(); } catch (e) { notes.push('restoring the overlay: ' + e); }   // (turning the overlay's exact mode off clears its tests, so the switches are put back after it)
    for (const k in saved.tests) T[k] = saved.tests[k];
    zoom = saved.zoom; zoomT = saved.zoomT; yaw = saved.yaw; yawT = saved.yawT;
  };
  // --- a window of frames: counts them, and turns the view if asked
  const drive = (ms, turning) => new Promise(resolve => {
    const t0 = performance.now(), yaw0 = yawT; let last = 0, frames = 0, worst = 0; const dts = [];
    const tick = now => {
      if (last) { const d = now - last; dts.push(d); if (d > worst) worst = d; }
      last = now; frames++;
      if (turning) yawT = yaw0 + OPT.turnRadPerSec * (now - t0) / 1000;
      if (now - t0 < ms) requestAnimationFrame(tick);
      else { dts.sort((a, b) => a - b); resolve({ frames, ms: now - t0, fps: frames / ((now - t0) / 1000), worst, p95: dts.length ? dts[Math.min(dts.length - 1, Math.floor(dts.length * .95))] : NaN }); }
    };
    requestAnimationFrame(tick);
  });
  // --- the overlay's text (F3): the exact pass rows
  const row = re => { const m = PH.text().split('\n').find(l => re.test(l)); if (!m) return null; const f = m.slice(30).trim().split(/\s+/); const num = s => /^-?[\d.]+$/.test(s) ? parseFloat(s) : NaN; return { cpu: num(f[0]), exact: num(f[1]), draws: f[2], tris: f[3], text: m.trim() }; };
  const colorMs = async (turning, plantsShown) => {
    showPlants(plantsShown);
    PH.setExact(true);   // (already on: this only clears the history, so each window is measured on its own)
    await drive(OPT.exactSeconds * 1000, turning);
    const c = row(/^color\s{2,}/), p = row(/^\S*plant/i);
    return { color: c ? c.exact : NaN, tris: c ? c.tris : null, plantsPass: p ? p.exact : null };
  };
  try {
    zoom = zoomT = OPT.zoom;
    for (const cfg of CONFIGS) for (const turning of [false, true]) {
      if (has('oldSprites')) T.oldSprites = cfg.old;
      if (has('foliageLodOff')) T.foliageLodOff = cfg.lodOff;
      showPlants(true);
      yawT = saved.yawT; await sleep(OPT.settleMs);
      const f = await drive(OPT.seconds * 1000, turning);
      PH.toggle(); PH.setExact(true); const shown = await colorMs(turning, true), hid = await colorMs(turning, false);
      showPlants(true); PH.toggle();   // (off again: that also clears the overlay's tests, hence the switches are set at the top of each round)
      rows.push({ setting: cfg.label, view: turning ? 'slow turn' : 'still', zoom: OPT.zoom, fps: +f.fps.toFixed(1), worstFrameMs: +f.worst.toFixed(1), p95FrameMs: +f.p95.toFixed(1), frames: f.frames,
        colorMsPlantsShown: +shown.color.toFixed(2), colorMsPlantsHidden: +hid.color.toFixed(2), plantsMs: +(shown.color - hid.color).toFixed(2),
        plantsPassMs: shown.plantsPass, plantInstances: plantInstances(), lodPlants: +LOD.plants.value.toFixed(3), render: W + 'x' + H, colorTrisShown: shown.tris, colorTrisHidden: hid.tris });
    }
  } catch (e) { notes.push('stopped by an error: ' + (e && e.stack || e)); }
  finally { restore(); }
  if (notes.length) console.log('notes:\n  ' + notes.join('\n  '));
  console.table(rows);
  window.__ownerFoliageRows = rows;
  return rows;
})();
