// People cost on your own computer: paste this whole file into the browser console (F12, Console) while the BUSIEST street scene is open
// (the max city at night, around 23:00, the club open, zoomed to your usual 15 or 30), keep the tab in front, and don't touch the mouse or keys
// for about 2 minutes. Start with the F3 overlay closed and no overlay tests on.
//
// For old people (the Craftpix sheet: overlay test "old people (as before)") and new people (drawn in code), standing still and in a slow turn:
//   1. 10 seconds with no overlay: frames a second and the worst frame.
//   2. The people pass time with F3 "exact timing": the color pass with the people batch shown minus the color pass with it hidden (the
//      umbrellas are in the same batch). The CPU time of the people update comes with it (the "people" rows of the overlay, summed).
// It puts everything back and prints a table; the rows stay in window.__ownerPeopleRows (copy(JSON.stringify(window.__ownerPeopleRows))).
// Options before pasting: window.__OWNER_OPTS = { seconds: 10, exactSeconds: 4, turnRadPerSec: .25, zoom: 15 }.
(async () => {
  if (PH.on || Object.keys(PH.tests).some(k => PH.tests[k] && k !== 'oldPeople')) { console.log('Close the F3 overlay and switch its tests off first (F3, then each test button), then paste this again.'); return null; }
  const OPT = Object.assign({ seconds: 10, exactSeconds: 4, turnRadPerSec: 0.25, settleMs: 1500, zoom: 30 }, window.__OWNER_OPTS || {});
  const notes = [], rows = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = PH.tests;
  const has = k => k in T;
  const CONFIGS = [];
  for (const old of [true, false]) CONFIGS.push({ label: old ? 'old people' : 'new people', old });
  if (!has('oldPeople')) { notes.push('no PH.tests.oldPeople in this build'); CONFIGS.length = 0; }
  // --- the plants: everything on layer 2 or drawn with the foliage shader
  const plantObjects = () => { const out = [pplMesh]; false && scene.traverse(o => { if (false) out.push(o); }); return out; };
  const plantInstances = () => plantObjects().reduce((s, o) => s + (o.isInstancedMesh ? o.count : 0), 0);
  let hidden = [];
  const showPlants = v => { if (v) { for (const o of hidden) o.visible = true; hidden = []; } else { hidden = plantObjects().filter(o => o.visible); for (const o of hidden) o.visible = false; } };
  // --- what we change, saved to put back
  const saved = { zoom, zoomT, yaw, yawT, on: PH.on, exact: PH.exact, tests: {} };
  for (const k of ['oldPeople']) if (has(k)) saved.tests[k] = T[k];
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
    const pr = row(/^\s*people\s{2,}/), cpu = pr ? pr.cpu : NaN;   // (the simulation row "people": the CPU time of the people update, drawing batch included)
    return { color: c ? c.exact : NaN, tris: c ? c.tris : null, cpu };
  };
  try {
    zoom = zoomT = OPT.zoom;
    for (const cfg of CONFIGS) for (const turning of [false, true]) {
      T.oldPeople = cfg.old;
      showPlants(true);
      yawT = saved.yawT; await sleep(OPT.settleMs);
      const f = await drive(OPT.seconds * 1000, turning);
      PH.toggle(); PH.setExact(true); const shown = await colorMs(turning, true), hid = await colorMs(turning, false);
      showPlants(true); PH.toggle();   // (off again: that also clears the overlay's tests, hence the switches are set at the top of each round)
      rows.push({ setting: cfg.label, peopleCpuMs: shown.cpu, view: turning ? 'slow turn' : 'still', zoom: OPT.zoom, fps: +f.fps.toFixed(1), worstFrameMs: +f.worst.toFixed(1), p95FrameMs: +f.p95.toFixed(1), frames: f.frames,
        colorMsPeopleShown: +shown.color.toFixed(2), colorMsPeopleHidden: +hid.color.toFixed(2), peopleMs: +(shown.color - hid.color).toFixed(2),
        people: pplMesh.geometry.instanceCount, render: W + 'x' + H, colorTrisShown: shown.tris, colorTrisHidden: hid.tris });
    }
  } catch (e) { notes.push('stopped by an error: ' + (e && e.stack || e)); }
  finally { restore(); }
  if (notes.length) console.log('notes:\n  ' + notes.join('\n  '));
  console.table(rows);
  window.__ownerPeopleRows = rows;
  return rows;
})();
