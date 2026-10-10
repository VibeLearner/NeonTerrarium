// Round 10: the owner's measurement, about 5 minutes, in your own Chrome on your own card. Open the game with your city loaded, open DevTools (F12), Console, paste this whole file, press Enter,
// then leave the tab in front and the mouse alone. It prints a table and returns it (copy the table from the console).
//
// What it does, for each of three settings (tiers off, tiers on with baked off, tiers on with baked on): sets the zoom to 30, waits until the city has settled (no block being merged, and for the
// baked setting every plot baked), then counts frames over 10 seconds standing still and over 10 seconds of a slow turn (the view turns a little every frame), and reads the memory the page and the card hold.
// Frames are counted with requestAnimationFrame, so the numbers are what your screen gets (limited by its refresh rate): compare the three rows with each other, on the same run.
// It puts your settings back at the end. Baking the whole city can take a few minutes the first time (it waits up to 6 minutes); a second run finds the bakes in the browser's store.
(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const settled = (needBaked) => !solidDirty.size && !SOLID_JOB && !TIER.rush && (!needBaked || (() => { const s = BAKE.stats(); return s.plots > 0 && (s.by.ready || 0) + (s.by.failed || 0) >= s.plots && !BAKE.job && [...solidRegions.values()].some(r => r.tier === 'baked'); })());
  const frames = (ms, turn) => new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last;
    const f = now => { n++; worst = Math.max(worst, now - last); last = now; if (turn) yawT = yaw + .02; if (now - t0 < ms) requestAnimationFrame(f); else res({ fps: +(n*1000/(now - t0)).toFixed(1), worstMs: +worst.toFixed(1) }); };
    requestAnimationFrame(f); });
  const mem = () => { const i = renderer.info, pm = performance.memory;
    let vb = 0; for (const r of solidRegions.values()) for (const g of r.geoms){ const v = g.attributes.position.count; vb += v*26 + (g.index ? g.index.count*(g.userData.bpe || (v > 65535 ? 4 : 2)) : 0); }
    return { jsHeapMB: pm ? Math.round(pm.usedJSHeapSize/1048576) : null, mergedGeometryMB: Math.round(vb/1048576), bakedMapsMB: Math.round(BK.pages.length*3*BK.PAGE*BK.PAGE*4/1048576), textures: i.memory.textures, geometries: i.memory.geometries }; };
  const was = { tiers: S.tiers, baked: S.baked, zoomT, cycle: S.cycle };
  const setTiers = v => { const b = document.getElementById('tiers'); b.checked = v; b.dispatchEvent(new Event('change')); };
  const setBaked = v => { const b = document.getElementById('baked'); b.checked = v; b.dispatchEvent(new Event('change')); };
  S.cycle = false; zoomT = 30; await wait(4000);
  const rows = [];
  for (const cfg of [{ name: 'tiers off (full detail)', tiers: false, baked: false }, { name: 'tiers on, baked off (stand-ins)', tiers: true, baked: false }, { name: 'tiers on, baked on', tiers: true, baked: true }]){
    setTiers(cfg.tiers); setBaked(cfg.baked); const t0 = performance.now();
    while (!settled(cfg.baked) && performance.now() - t0 < 360000) await wait(1000);
    await wait(6000);
    const still = await frames(10000, false), turning = await frames(10000, true);
    const m = mem(); rows.push(Object.assign({ setting: cfg.name, settled: settled(cfg.baked), stillFps: still.fps, stillWorstFrameMs: still.worstMs, turnFps: turning.fps, turnWorstFrameMs: turning.worstMs }, m, { tiersLine: TIER.line(), bakeLine: BK.line() }));
  }
  setTiers(was.tiers !== false); setBaked(!!was.baked); zoomT = was.zoomT; S.cycle = was.cycle;
  console.table(rows.map(r => ({ setting: r.setting, still_fps: r.stillFps, turn_fps: r.turnFps, worst_turn_frame_ms: r.turnWorstFrameMs, js_heap_MB: r.jsHeapMB, merged_geometry_MB: r.mergedGeometryMB, baked_maps_MB: r.bakedMapsMB })));
  console.log(JSON.stringify(rows, null, 1));
  return rows;
})();
