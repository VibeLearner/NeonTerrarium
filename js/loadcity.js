// Neon Terrarium: loading a saved city from its recipes (round 9, item 7).
// A saved city used to be made in one go on the page: every plot generated and put in the world before the first frame. Now, when the plot worker is there, the plots are asked for from it,
// nearest the camera first, and put in the world as they come, a few milliseconds a frame, so the first frame shows the nearest part of the city and the rest fills in. The order
// is the one the old load built in: plots that read nothing of their neighbors first, then the pods (they read their neighbors' heights), then the towers that may throw the air
// hologram (they pick their face from the heights round them, pods included), then the megastructures, then everything that wants the whole city (the plants and lights of each region as
// soon as its plots are in; the walking network and the people at the end). Until it is done a click edits nothing. The old load stays behind the test "load on the main thread (as before)",
// and is what runs when there is no worker, or it does not come up in 20 seconds, or it fails. The plots made this way are the same plots (recipe_proof.py), but their random detail and
// flicker ids are the worker's own draws, so a loaded city differs from an old load in which small pieces and lights flicker.
const LOADP = { on: false, phase: 0, q: [], inflight: new Map(), wait: 0, placed: 0, total: 0, rem: new Map(), ready: [], megaQ: [], t0: 0, firstAt: null, doneAt: null, maxIn: 16, fell: 0, cool: 0 };
const loadWanted = () => typeof Worker !== 'undefined' && !(PH.tests.loadMain || window.__LOAD_MAIN) && !genMain() && !(window.__realNow && !window.__GEN_WORKER) && RW.state !== 'failed';
LOADP.line = () => LOADP.on ? 'loading from recipes: phase ' + (LOADP.phase + 1) + ' of 4, ' + LOADP.placed + ' of ' + LOADP.total + ' plots' : LOADP.doneAt ? 'loaded from recipes in ' + ((LOADP.doneAt - LOADP.t0)/1000).toFixed(1) + ' s' + (LOADP.firstAt ? ' (first plot after ' + ((LOADP.firstAt - LOADP.t0)/1000).toFixed(1) + ' s)' : '') : 'load: the old way';
function loadStart(){
  centerView(true);
  const todo = refreshTodo([...cells.values()]);   // (the parks' flags set, pods last)
  const plain = [], pods = [], air = [];
  for (const c of todo){ if (c.lift) pods.push(c); else if (recipeIsAir(c)) air.push(c); else plain.push(c); }
  const near = (a, b) => Math.hypot(a.x - camGoal.x, a.z - camGoal.z) - Math.hypot(b.x - camGoal.x, b.z - camGoal.z);
  if (!window.__LOAD_OLD_ORDER){ plain.sort(near); pods.sort(near); air.sort(near); }   // (the test: the order the old load made them in, which makes every shape the same: see recipe.js, the rounded boxes)
  Object.assign(LOADP, { on: true, phase: 0, phases: [plain, pods, air], q: plain.slice(), inflight: new Map(), wait: 0, placed: 0, total: todo.length, rem: new Map(), ready: [], megaQ: [...megas.values()], t0: performance.now(), firstAt: null, doneAt: null, fell: 0 });
  for (const c of cells.values()){ const k = regKey(c.i, c.j); LOADP.rem.set(k, (LOADP.rem.get(k) || 0) + 1); }
}
// the old load, from where it stands (nothing made yet)
function loadFallback(){
  for (const [c, job] of LOADP.inflight) RW.cancel(job);
  LOADP.on = false; LOADP.inflight.clear(); rebuildAll();
}
function loadPlace(c, job){
  const done = job.rw.done && !job.rw.fail;
  if (done){ stageTake(job); c.data = job.data; c.dark = job.dark; rebuildCellPost(c); }
  else { RW.cancel(job); LOADP.fell++; rebuildCell(c); }
  if (LOADP.firstAt === null) LOADP.firstAt = performance.now();
  LOADP.placed++;
  const k = regKey(c.i, c.j), n = LOADP.rem.get(k) - 1; LOADP.rem.set(k, n); if (n === 0) LOADP.ready.push(k);
}
function loadTick(){
  if (!LOADP.on){ if (LOADP.cool > 0) LOADP.cool--; return; }   // (cool: for a while after the load the blocks still to merge are merged in steps, not at once as in the first second of the old load)
  if (RW.state !== 'ready'){ if (RW.state === 'failed' || ++LOADP.wait > 60*20) loadFallback(); return; }   // (the worker is still loading the game's scripts: the page waits for it, up to 20 s)
  if (LOADP.phase === 0 && !LOADP.sent){ RW.sendWorld(); LOADP.sent = true; }
  const t0 = stageNow();
  // what has come, in the order it was asked for (the nearest first), a few milliseconds of it a frame
  for (const [c, job] of LOADP.inflight){
    if (!job.rw.done) break;   // (the worker answers in order)
    LOADP.inflight.delete(c); loadPlace(c, job);
    if (stageNow() - t0 >= 5) break;
  }
  // a region whose plots are all in gets its plants and lights now (one a frame)
  if (LOADP.ready.length && stageNow() - t0 < 5){ const k = LOADP.ready.shift(); rebuildRegion(k); dirtyRegions.delete(k); }   // (no markSolidRegion: each plot marked its own block as it came)
  // more to ask for
  while (LOADP.inflight.size < LOADP.maxIn && LOADP.q.length){ const c = LOADP.q.shift(), job = { c, r: null }; RW.request(job, true); LOADP.inflight.set(c, job); }
  if (LOADP.q.length || LOADP.inflight.size) return;
  // this phase is in: the next
  if (LOADP.phase < 2){ LOADP.phase++; LOADP.q = LOADP.phases[LOADP.phase].slice(); return; }
  if (LOADP.ready.length) return;
  if (LOADP.megaQ.length){ rebuildMega(LOADP.megaQ.shift()); return; }   // (a megastructure a frame)
  for (const k of dirtyRegions) rebuildRegion(k); dirtyRegions.clear();
  rebuildConnections(); syncAgents();
  LOADP.on = false; LOADP.doneAt = performance.now(); LOADP.phase = 3; LOADP.cool = 240;
}
