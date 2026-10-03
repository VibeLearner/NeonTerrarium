// Neon Terrarium: megastructures, landmarks that take over a 2x2 block of plots once the city is big enough.
// All game scripts share one scope and load in order (see index.html).
'use strict';
// Each kind first arrives on its own: when its requirement is met (enough buildings of the zones it names), each new
// build has a chance of bringing it in. It takes a block of free plots (w x h, either way round) near that build,
// growing the platform where needed; it never replaces a building. Once a kind has arrived it's unlocked for good:
// the Buildings menu then places as many more as you like (see placeFromMenu). Every one is built from its own seed,
// which also picks its variant (layout, centrepiece, colours), so a row of them doesn't repeat. Some can be stacked: clicking the roof with a zone picked adds a
// tier, up to maxLevels. Right-click takes the top tier off, or removes it when only one is left; it can come back
// once the requirement is met again.
const MEGA_TYPES = {
  radio: { name: 'Radio station', need: { any: 20 }, odds: 1, w: 2, h: 2, maxLevels: 1,   // arrives with the 20th building, of any zone
           colour: '#ff5a4a', sound: 'radioOn', build: buildRadioStation },
  mall:  { name: 'Sky mall', need: { high: 50, ind: 30 }, odds: 50, w: 3, h: 2, maxLevels: 3,
           colour: '#ffcf7a', build: buildSkyMall },
  square: { name: 'Town square', need: { lowPlots: 50 }, odds: 1, w: 5, h: 5, maxLevels: 1,   // arrives with the 50th residential building
           colour: '#9dff6a', build: buildTownSquare, fx: koiFx },
  police: { name: 'Police station', need: { low: 15, mid: 15 }, odds: 20, w: 3, h: 3, maxLevels: 1,
           colour: '#4fb8ff', build: buildPoliceStation, fx: policeFx },
  foundry: { name: 'Foundry', need: { ind: 60 }, odds: 50, w: 6, h: 4, maxLevels: 1,
           colour: '#ff8a2a', build: buildFoundry },
  market: { name: 'Rainbow Plaza market mall', need: { midPlots: 30 }, odds: 1, w: 4, h: 4, maxLevels: 1,   // arrives with the 30th commercial building
           colour: '#ff7ab8', build: buildMarketMall },
  pagoda: { name: 'Cloud Pagoda', need: { highPlots: 60 }, odds: 1, w: 5, h: 4, maxLevels: 1,   // arrives with the 60th luxury building
           colour: '#8ff0ff', build: buildCloudPagoda },
  club: { name: 'Neon Dome', need: { highPlots: 30, midPlots: 30, lowPlots: 30 }, odds: 1, w: 4, h: 4, maxLevels: 1,   // arrives once there are 30 each of luxury, commercial and residential buildings
           colour: '#c070ff', build: buildNeonDome, fx: clubFx },
};
const megas = new Map();   // id -> { id, kind, i, j, w, h, levels, seed, x, z, data, view, roofH, top, cells }; a plot's .mega is the id
const megaOf = c => c && c.mega ? megas.get(c.mega) || null : null;
const megaKindOf = c => { const m = megaOf(c); return m ? m.kind : null; };
const megasOfKind = kind => [...megas.values()].filter(m => m.kind === kind);
let megaIdN = 0;
const newMegaId = kind => { let id; do id = kind + '#' + (++megaIdN); while (megas.has(id)); return id; };
// which kinds have arrived at least once (they stay in the Buildings menu even if every copy is taken down)
const MEGA_UNLOCK_KEY = 'neonIsland.megaUnlocked';
const megaUnlockedKinds = new Set((() => { try { return JSON.parse(localStorage.getItem(MEGA_UNLOCK_KEY) || '[]'); } catch (e) { return []; } })().filter(k => MEGA_TYPES[k]));
function unlockMegaKind(kind){
  if (megaUnlockedKinds.has(kind)) return;
  megaUnlockedKinds.add(kind);
  try { localStorage.setItem(MEGA_UNLOCK_KEY, JSON.stringify([...megaUnlockedKinds])); } catch (e) {}
  if (typeof onMegaUnlock === 'function') onMegaUnlock(kind);
}

// how many building sections of each zone stand in the city
function zoneCounts(){
  // per zone: building sections; any: buildings of any zone; lowPlots, midPlots, highPlots: residential, commercial
  // and luxury buildings (each built plot counts once)
  const n = { low: 0, mid: 0, high: 0, ind: 0, any: 0, lowPlots: 0, midPlots: 0, highPlots: 0 };
  for (const c of cells.values()){
    if (c.sections.length) n.any++;
    if (c.sections.some(s => s.zone === 'low')) n.lowPlots++;
    if (c.sections.some(s => s.zone === 'mid')) n.midPlots++;
    if (c.sections.some(s => s.zone === 'high')) n.highPlots++;
    for (const s of c.sections) if (n[s.zone] !== undefined) n[s.zone]++;
  }
  return n;
}
function megaUnlocked(kind){
  const need = MEGA_TYPES[kind].need, n = zoneCounts();
  return Object.keys(need).every(z => n[z] >= need[z]);
}
// called after every build: roll for each megastructure that isn't standing yet and whose requirement is met
function maybeSpawnMegas(c){
  for (const kind in MEGA_TYPES){
    if (megaUnlockedKinds.has(kind) || megasOfKind(kind).length || !megaUnlocked(kind)) continue;   // each kind arrives on its own only once
    if (Math.random() < 1/MEGA_TYPES[kind].odds) spawnMega(kind, c);
  }
}
// can a w x h block go at (i, j)? Every plot free ground or open sky, inside the world, touching the platform
function megaBlockOk(i, j, w, h){
  if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX || Math.abs(i + w - 1) > GRID_MAX || Math.abs(j + h - 1) > GRID_MAX) return false;
  let missing = 0;
  for (let a = 0; a < w; a++) for (let b = 0; b < h; b++){ const c = cells.get(ckey(i + a, j + b)); if (!c){ missing++; continue; } if (c.mega || c.sections.length) return false; }
  if (missing < w*h) return true;
  for (let a = -1; a <= w; a++) for (let q = -1; q <= h; q++){
    if (a >= 0 && a < w && q >= 0 && q < h) continue;
    if ((a === -1 || a === w) && (q === -1 || q === h)) continue;
    if (cells.has(ckey(i + a, j + q))) return true;
  }
  return false;
}
// the Buildings menu: the block for a kind centred on plot (ci, cj), turned if asked
function megaBlockAt(kind, ci, cj, turned){
  const t = MEGA_TYPES[kind]; const [w, h] = turned ? [t.h, t.w] : [t.w, t.h];
  const i = ci - Math.floor((w - 1)/2), j = cj - Math.floor((h - 1)/2);
  return { i, j, w, h, ok: megaBlockOk(i, j, w, h) };
}
function placeFromMenu(kind, ci, cj, turned){
  const blk = megaBlockAt(kind, ci, cj, turned); if (!blk.ok) return null;
  const m = spawnMegaAt(kind, blk); if (m){ save(); }
  return m;
}
// what a kind needs before it first arrives, in words (for the menu)
const NEED_WORDS = { any: ['building', 'buildings'], low: ['residential floor', 'residential floors'], mid: ['commercial floor', 'commercial floors'],
  high: ['luxury floor', 'luxury floors'], ind: ['industrial floor', 'industrial floors'], lowPlots: ['residential building', 'residential buildings'],
  midPlots: ['commercial building', 'commercial buildings'], highPlots: ['luxury building', 'luxury buildings'] };
const megaNeedText = kind => Object.entries(MEGA_TYPES[kind].need).map(([z, n]) => n + ' ' + NEED_WORDS[z][n === 1 ? 0 : 1]).join(' and ');
const blockCells = (i, j, w, h) => { const out = []; for (let a=0;a<w;a++) for (let b=0;b<h;b++) out.push(cells.get(ckey(i+a, j+b))); return out; };
// The block for a megastructure: free ground near the build that brought it in, either way round. It never
// replaces anything: every plot in the block is either open platform with nothing built on it, or not there yet
// (the platform grows to fit). The block must touch the existing platform, so the city stays in one piece.
// Preferred: close to the build, and using platform that's already there rather than growing new.
function findMegaBlock(kind, c){
  const t = MEGA_TYPES[kind];
  const shapes = t.w === t.h ? [[t.w, t.h]] : [[t.w, t.h], [t.h, t.w]];
  const R = 16;
  let best = null;
  for (const [w, h] of shapes) for (let i = c.i - w - R; i <= c.i + R; i++) for (let j = c.j - h - R; j <= c.j + R; j++){
    if (Math.abs(i) > GRID_MAX || Math.abs(j) > GRID_MAX || Math.abs(i + w - 1) > GRID_MAX || Math.abs(j + h - 1) > GRID_MAX) continue;
    const d = Math.hypot(i + (w-1)/2 - c.i, j + (h-1)/2 - c.j);
    if (best && d*4 > best.score) continue;   // can't beat what we have
    const blk = blockCells(i, j, w, h);
    if (blk.some(b => b && (b.mega || b.sections.length))) continue;   // something stands there
    const missing = blk.filter(b => !b).length;
    let touches = missing < blk.length;
    for (let a = -1; a <= w && !touches; a++) for (let q = -1; q <= h && !touches; q++){
      if (a >= 0 && a < w && q >= 0 && q < h) continue;
      if ((a === -1 || a === w) && (q === -1 || q === h)) continue;   // corners don't join
      if (cells.has(ckey(i + a, j + q))) touches = true;
    }
    if (!touches) continue;
    const score = d*4 + missing*1.5 + Math.random()*.5;
    if (!best || score < best.score) best = { score, i, j, w, h };
  }
  return best;
}
// put a megastructure's record in place on its plots (no drawing)
function placeMega(kind, i, j, seed, w, h, levels = 1, id = null){
  const t = MEGA_TYPES[kind];
  if (!t || (id && megas.has(id))) return null;
  w = w || t.w; h = h || t.h;
  const blk = blockCells(i, j, w, h);
  if (blk.some(b => !b || b.mega)) return null;
  id = id || newMegaId(kind);
  const m = { id, kind, i, j, w, h, levels: Math.max(1, Math.min(t.maxLevels, levels)), seed, x: (i + (w-1)/2)*LOT, z: (j + (h-1)/2)*LOT,
              data: null, view: null, roofH: CURB, top: CURB, cells: blk };
  for (const b of blk){ b.mega = id; b.sections = []; }
  megas.set(id, m);
  unlockMegaKind(kind);
  return m;
}
const megaSize = m => [m.w*LOT, m.h*LOT];
function spawnMega(kind, near){
  const blk = findMegaBlock(kind, near); if (!blk) return null;
  return spawnMegaAt(kind, blk);
}
// bring one in on a given block { i, j, w, h } (free ground or open sky, touching the platform)
function spawnMegaAt(kind, blk){
  const grown = [];
  for (let a=0; a<blk.w; a++) for (let b=0; b<blk.h; b++){   // grow any missing platform under the block
    const i = blk.i + a, j = blk.j + b;
    if (!cells.has(ckey(i, j))){ const c = newCell(i, j); c.style = styleNow(); cells.set(ckey(i, j), c); grown.push(c); }
  }
  const covered = blockCells(blk.i, blk.j, blk.w, blk.h);
  // neighbours of new plots lose their railings on the joining side
  for (const c of grown) for (const [a, b] of SIDES4){ const nb = cells.get(ckey(c.i + a, c.j + b)); if (nb && !nb.mega && !covered.includes(nb)) covered.push(nb); }
  for (const b of covered){ finishAnimsOn(b); if (b.view){ world.remove(b.view); b.view = null; } disposeData(b.data); b.data = null; }
  const m = placeMega(kind, blk.i, blk.j, (Math.random()*1e9)|0, blk.w, blk.h); if (!m) return null;
  if (kind === 'square') m.centre = nextSquareCentre(m);
  holdRegion(m);
  refresh(covered.filter(b => !b.mega || b.mega === m.id), [m]);
  // the slow arrival: the platform grown for it scans in alongside, and its live parts (koi, drone, screens) switch
  // on once it's fully there
  for (const c of grown){ holdRegion(c); startAnim(c, 'build', PLAT_BOTTOM, CURB + .3, MEGA_TYPES[kind].colour, LOT, null, null, { slow: true, quiet: true, bare: true }); }
  if (m.fx){ m.fx.dispose(); m.fx = null; }
  // The radio clicks on with its own sound. Every other megastructure plays the arrival sound, a 4.6 s piece made to
  // run the length of the animation, starting with it.
  const t = MEGA_TYPES[kind];
  startAnim(m, 'build', CURB - .05, m.top + 1, t.colour, megaSize(m), null, t.sound || 'megaArrive', { slow: true,
    onEnd: () => { if (megas.get(m.id) === m && !m.fx) megaFx(m); } });
  if (typeof renderBmenu === 'function') renderBmenu();
  return m;
}
// stacking: another tier on top
function addMegaTier(m){
  if (!m || m.levels >= MEGA_TYPES[m.kind].maxLevels) return;
  finishAnimsOn(m);
  holdRegion(m);
  const y0 = m.roofH, old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  m.levels++;
  refresh([], [m]);
  dropView(old);
  startAnim(m, 'build', y0 - .3, m.top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), null);
}
// right-click: the top tier comes off, or the whole thing when it's down to one
function removeMegaTier(m){
  if (!m) return;
  if (m.levels <= 1) return removeMega(m);
  finishAnimsOn(m);
  const top = m.top, old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  m.levels--;
  refresh([], [m]);
  startAnim(m, 'remove', m.roofH - .3, top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), old);
}
function removeMega(m){
  if (!m) return;
  finishAnimsOn(m);
  if (m.fx){ m.fx.dispose(); m.fx = null; }
  const old = { view: m.view, data: m.data }; m.view = null; m.data = null;
  megas.delete(m.id);
  for (const b of m.cells) b.mega = null;
  dirtyRegions.add(regKey(m.i, m.j));
  refresh(m.cells.filter(b => cells.get(ckey(b.i, b.j)) === b));
  startAnim(m, 'remove', CURB - .05, m.top + 1, MEGA_TYPES[m.kind].colour, megaSize(m), old);
  if (typeof renderBmenu === 'function') renderBmenu();
}
// moving parts (like the square's holographic koi) live outside the batched geometry and are updated every frame
function megaFx(m){
  if (m.fx){ m.fx.dispose(); m.fx = null; }
  const t = MEGA_TYPES[m.kind]; if (t.fx) m.fx = t.fx(m) || null;
}
function updateMegaFx(dt, time){ for (const m of megas.values()) if (m.fx) m.fx.update(dt, time); }
function rebuildMega(m){
  finishAnimsOn(m);
  disposeData(m.data);
  m.data = collect(() => withSkin(megaSkinOf(m), () => MEGA_TYPES[m.kind].build(m)));
  cellView(m);
  megaFx(m);
  for (const b of m.cells) b.height = m.roofH;
  dirtyRegions.add(regKey(m.i, m.j));
}

/* ---------- kit: struts and dishes ---------- */
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sm = new THREE.Matrix4(), _sUp = new THREE.Vector3(0,1,0);
// a square bar from point a to point b (in P's space)
function strut(mat, P, ax, ay, az, bx, by, bz, t){
  _sa.set(ax, ay, az); _sb.set(bx - ax, by - ay, bz - az);
  const len = _sb.length(); if (len < 1e-4) return;
  _sq.setFromUnitVectors(_sUp, _sb.clone().divideScalar(len));
  _sm.compose(_sa.addScaledVector(_sb, .5), _sq, new THREE.Vector3(t, len, t));
  put(U.box, mat, under(P, _sm.clone()));
}
// a satellite dish: a shallow bowl with a concave face, a feed horn on three struts, on a post with a pivot
U.dish = (() => {
  const pts = [[.02,0],[.2,.03],[.4,.12],[.5,.2],[.47,.215],[.36,.15],[.18,.08],[.02,.06]].map(([x,y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 16).toNonIndexed(); g.computeVertexNormals(); return g;
})();
function dish(P, x, y, z, r, yaw, tilt, light){
  const ph = .12 + r*.45;
  cyl(M.metalDark, P, x, y + ph/2, z, .045 + r*.03, ph);
  const Q = under(P, T(x, y + ph, z, yaw)), D = under(Q, T(0, 0, 0, 0, 1, 1, 1, tilt));
  box(M.frame, D, 0, 0, 0, r*.5, .06, .1);                       // the pivot yoke
  put(U.dish, M.white2, under(D, T(0, .02, 0, 0, 2*r, 2*r, 2*r)));
  const f = r*.85;                                               // the feed sits out at the focus
  for (const a of [0, 2.1, 4.2]) strut(M.frame, D, Math.cos(a)*r*.9, .4*r, Math.sin(a)*r*.9, 0, f, 0, .02);
  box(M.metal, D, 0, f, 0, .07, .08, .07);
  if (light){ box(M.blink, D, 0, f + .07, 0, .05, .05, .05); glow(D, 0, f + .08, 0, 'blink', .7); }
}
function beaconLight(P, x, y, z, s = .07, g = .8){ box(M.blink, P, x, y, z, s, s, s); glow(P, x, y, z, 'blink', g); }
M.blink = toon(0x3a0c0c, { em:0xff2020, kind:'blink' });

/* ---------- live screens: waveforms, oscilloscopes, spectra, scrolling data, a radar sweep, status LEDs ---------- */
// Each screen is a quad in the ordinary geometry buckets carrying uvs: u's whole part picks the screen's program
// (and a seed), the fraction is the position across it. One material animates every screen in the city from the
// shared clock, drawn on a coarse pixel grid with scanlines so it reads as a little CRT.
const SCREEN_MAT = new THREE.ShaderMaterial({
  uniforms: { time: FOL_UNI.time },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float time; varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    void main(){
      float id = floor(vUv.x + 1e-4), kind = mod(id, 6.0), seed = floor(id/6.0);
      vec2 uv = vec2(vUv.x - id, vUv.y), res = vec2(30.0, 20.0), q = (floor(uv*res) + .5)/res;
      float t = time + seed*7.31;
      vec3 ink = mod(seed, 3.0) < 1.0 ? vec3(.35, 1.0, .55) : mod(seed, 3.0) < 2.0 ? vec3(.3, .9, 1.0) : vec3(1.0, .72, .3);
      vec3 c = vec3(.015, .04, .03);
      if (mod(floor(uv.x*res.x), 6.0) < 1.0 || mod(floor(uv.y*res.y), 5.0) < 1.0) c += ink*.06;   // graticule
      if (kind < .5){          // incoming signal: a travelling wave that swells in bursts, with noise riding on it
        float amp = .08 + .3*smoothstep(.2, .9, abs(sin(t*.45)))*(.6 + .4*sin(q.x*2.0 - t));
        float y = .5 + amp*sin(q.x*19.0 - t*7.0)*sin(q.x*3.3 + t*1.4) + .09*(h21(vec2(floor(q.x*res.x - t*24.0), seed)) - .5)*amp*3.0;
        if (abs(q.y - y) < 1.1/res.y) c = ink;
      } else if (kind < 1.5){  // oscilloscope: a slowly turning Lissajous figure
        float d = 9.0;
        for (int i=0; i<48; i++){ float s = float(i)/48.0*6.2832; vec2 p = .5 + vec2(.4*sin(3.0*s + t*.9), .4*sin(2.0*s + t*.6 + seed));
          d = min(d, length((q - p)*res)); }
        if (d < 1.0) c = ink; else if (abs(q.x - .5) < .5/res.x || abs(q.y - .5) < .5/res.y) c += ink*.15;
      } else if (kind < 2.5){  // spectrum bars bouncing
        float bi = floor(q.x*10.0), hgt = .12 + .8*abs(sin(t*2.1 + bi*1.7 + seed))*(.45 + .55*h21(vec2(bi, floor(t*7.0))));
        if (q.y < hgt && fract(q.x*10.0) < .7) c = q.y > .78 ? vec3(1.0, .35, .3) : ink;
      } else if (kind < 3.5){  // packets arriving: rows of data scrolling up, the newest line flashing
        float rows = 7.0, row = floor(q.y*rows + t*2.5), col = floor(q.x*12.0);
        if (h21(vec2(col, row + seed*13.0)) > .42 && fract(q.x*12.0) > .25) c = ink*(row == floor(t*2.5) ? 1.0 : .7);
      } else if (kind < 4.5){  // a radar sweep with blips that fade behind it
        vec2 p = (q - .5)*vec2(res.x/res.y, 1.0); float r = length(p), a = atan(p.y, p.x) + 3.1416, sw = mod(t*1.8, 6.2832), da = mod(sw - a, 6.2832);
        if (r < .46) c += ink*.7*exp(-da*2.2);
        if (abs(r - .46) < .03 || abs(r - .25) < .02) c = max(c, ink*.45);
        vec2 cell = floor(p*6.0); if (h21(cell + seed) > .93 && r < .45) c = max(c, ink*exp(-da*.8));
      } else {                 // status panel: LEDs ticking over at their own rates
        vec2 g = floor(uv*vec2(8.0, 4.0)), f = fract(uv*vec2(8.0, 4.0));
        float on = step(.45, h21(g + floor(t*(1.5 + h21(g)*7.0))));
        if (length(f - .5) < .3) c = on > .5 ? (h21(g + 3.0) < .2 ? vec3(1.0, .3, .2) : vec3(.3, 1.0, .45)) : vec3(.04, .1, .06);
      }
      c *= .82 + .18*step(.5, fract(uv.y*res.y*.5));   // scanlines
      gl_FragColor = vec4(c, 1.0);
    }`,
});
let SCREEN_SEQ = 0;
// a live screen on a face: F's local z points out of the face; kind 0-5 picks the program
const _scA = new THREE.Vector3(), _scB = new THREE.Vector3(), _scN = new THREE.Vector3();
function screenQuad(F, x, y, z, w, h, kind){
  const id = (kind % 6) + 6*(SCREEN_SEQ++ % 97);
  let b = buckets.get(SCREEN_MAT); if (!b){ b = { p: [], n: [], d: [], f: null, u: [] }; buckets.set(SCREEN_MAT, b); }
  const C = [[-w/2, -h/2, 0, 0], [w/2, -h/2, 1, 0], [w/2, h/2, 1, 1], [-w/2, h/2, 0, 1]];
  _scN.set(0, 0, 1).transformDirection(F);
  for (const k of [0, 1, 2, 0, 2, 3]){
    const [cx, cy, u, v] = C[k]; _scA.set(x + cx, y + cy, z).applyMatrix4(F);
    b.p.push(_scA.x, _scA.y, _scA.z); b.n.push(_scN.x, _scN.y, _scN.z); b.u.push(id + Math.min(u, .999), v); b.d.push(0);
  }
}
// a monitor: a dark bezel box with a live screen on its front (F: z out of the front)
function monitor(F, x, y, z, w, h, kind, crt){
  box(M.metalDark, F, x, y, z - (crt ? .12 : .03), w + .06, h + .06, crt ? .26 : .06);
  if (crt) box(M.metalDark, F, x, y - .02, z - .26, w*.6, h*.6, .14);
  screenQuad(F, x, y, z + .005, w, h, kind);
}
M.coax = toon(0x141519);
// a bundle of thick black coax: a few cables side by side along the same path, offset sideways
function coaxBundle(P, pts, n = 3, r = .03){
  for (let k=0; k<n; k++){
    const o = (k - (n - 1)/2)*r*2.3;
    const shifted = pts.map(([x, y, z], i) => {
      const [nx, , nz] = pts[Math.min(i + 1, pts.length - 1)], [px, , pz] = pts[Math.max(i - 1, 0)];
      const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz) || 1;
      return [x - dz/L*o, y + (k % 2)*r*.6, z + dx/L*o];
    });
    pipeRun(M.coax, P, shifted, r, false);
  }
}
// a rusted lattice comms tower: four tapering legs with X bracing and rings, a platform, Yagi-Uda arrays at the top,
// cellular panels round the upper section and microwave horns lower down
M.towerRust = toon(0x7a3e26); M.towerRust2 = toon(0x5a2e1e);
function yagi(P, x, y, z, yaw, len = .9){
  const Q = under(P, T(x, y, z, yaw));
  box(M.metal, Q, 0, 0, len/2, .03, .03, len);
  for (let k=0; k<7; k++){ const e = k === 1 ? .42 : .34 - k*.025; box(M.white2, Q, 0, 0, .08 + k*(len - .1)/6, e, .018, .018); }
}
function hornAntenna(P, x, y, z, yaw){
  const Q = under(P, T(x, y, z, yaw));
  put(U.cone, M.white2, under(Q, T(0, 0, .18, 0, .26, .32, .26, -PI/2)));   // the flared horn, mouth out
  put(U.cyl16, M.metal, under(Q, T(0, 0, -.04, 0, .1, .18, .1, PI/2)));      // the feed
  box(M.frame, Q, 0, -.13, .05, .04, .12, .3);
}
function latticeTower(P, x, y0, z, h, b0, b1){
  const legs = [[1,1],[1,-1],[-1,-1],[-1,1]], half = y => b0 + (b1 - b0)*(y/h);
  for (const [sx, sz] of legs) strut(M.towerRust, P, x + sx*b0, y0, z + sz*b0, x + sx*b1, y0 + h, z + sz*b1, .05);
  for (let y = 0, lvl = 0; y < h - .01; y += .45, lvl++){
    const y2 = Math.min(h, y + .45), w1 = half(y), w2 = half(y2);
    for (let k=0; k<4; k++){
      const [ax, az] = legs[k], [cx, cz] = legs[(k + 1)%4];
      strut(M.towerRust2, P, x + ax*w2, y0 + y2, z + az*w2, x + cx*w2, y0 + y2, z + cz*w2, .025);
      strut(M.towerRust2, P, x + ax*w1, y0 + y, z + az*w1, x + cx*w2, y0 + y2, z + cz*w2, .015);
      strut(M.towerRust2, P, x + cx*w1, y0 + y, z + cz*w1, x + ax*w2, y0 + y2, z + az*w2, .015);
    }
  }
  const pt = y0 + h*.62, pw = half(h*.62) + .18;   // a small platform with a rail
  box(M.metalDark, P, x, pt, z, 2*pw, .04, 2*pw);
  for (const [sx, sz] of legs) box(M.towerRust, P, x + sx*pw, pt + .14, z + sz*pw, .02, .28, .02);
  for (let k=0; k<4; k++){ const [ax, az] = legs[k], [cx, cz] = legs[(k + 1)%4]; strut(M.towerRust, P, x + ax*pw, pt + .28, z + az*pw, x + cx*pw, pt + .28, z + cz*pw, .015); }
  const top = y0 + h;
  cyl(M.metal, P, x, top + .5, z, .025, 1.0);
  for (let k=0; k<3; k++){ const a = rnd(0, TAU); yagi(P, x + Math.sin(a)*b1, top - .1 - k*.28, z + Math.cos(a)*b1, a, rnd(.7, 1.0)); }
  for (let k=0; k<3; k++){ const a = k*TAU/3 + rnd(-.2, .2), r = half(h*.8) + .07, F = under(P, T(x + Math.sin(a)*r, y0 + h*.8, z + Math.cos(a)*r, a));
    box(M.white2, F, 0, 0, .03, .14, .55, .05); box(M.frame, F, 0, 0, -.02, .04, .4, .05); }   // cellular panels
  beaconLight(P, x, top + 1.02, z, .07, .8);
  return { pt, pw };
}

M.solarCell = toon(0x1f3260); M.solarCell2 = toon(0x2a4278);
// a row of solar panels tilted up toward +z on a low frame, centred at (x, z), len along x, depth front to back
function solarRow(P, x, z, len, depth, y = 0){
  const n = Math.max(1, Math.round(len/.48)), pw = len/n, tilt = .38, rise = Math.sin(tilt)*depth;
  for (let k=0; k<n; k++){ const px = x - len/2 + (k + .5)*pw;
    box(k % 2 ? M.solarCell : M.solarCell2, P, px, y + .25 + rise/2, z, pw - .04, .03, depth, 0, tilt);
    box(M.metal, P, px, y + .25 + rise/2 + .02, z, .015, .015, depth, 0, tilt);   // the cell lines
    for (const u of [-.25, .25]) box(M.metal, P, px, y + .25 + rise/2 - u*rise*2*.5 + .02, z + u*depth*Math.cos(tilt), pw - .06, .012, .012); }
  for (const s of [-1, 1]){ box(M.frame, P, x + s*(len/2 - .05), y + .12 + rise*.0, z + depth*.42, .04, .24, .04); box(M.frame, P, x + s*(len/2 - .05), y + (.25 + rise)/2 + .05, z - depth*.42, .04, .25 + rise, .04); }
}
// The radio station's relay, filling the main roof (R0: the roof's centre, y = the roof deck): the SATCOM 12-A
// dish on its plinth, a frame of three MLINK 5GHz dishes, two rusted lattice towers with Yagis, cellular panels and
// MW 5GHz horns, and in the middle the server racks, their screens alive with incoming data, under a solar canopy;
// thick black coax runs from the racks to everything
function buildRelay(R0, bw, bd){
  const y = .03;
  // the big dish: a concrete plinth, a turntable, the dish pointed up toward the back-left sky
  const sx = -1.2, sz = -1.05;
  box(M.concD, R0, sx, y + .15, sz, .8, .3, .8); cyl(M.metalDark, R0, sx, y + .34, sz, .3, .08);
  dish(R0, sx, y + .38, sz, 1.0, -2.4 + rnd(-.2, .2), .75, true);
  { const F = under(R0, T(-bw/2 - .07, 0, sz, -PI/2)); for (const t of [-.8, .8]) box(M.frame, F, t, .35, -.02, .05, .7, .05); wordSign(F, 'sign_w_satcom', 0, .6, .05, .9, 'amber', .8); }
  box(M.white2, R0, sx + .41, y + .17, sz, MIN_T, .14, .5); plant('sign_w_satcom', under(R0, T(sx + .43, y + .17, sz, PI/2)), 0, 0, 0, .45, 'c', true);   // its plate on the plinth
  // the MLINK frame: two posts, three arms, three small dishes aimed out over the edge
  const mx = 1.8, mz0 = -1.75, mz1 = -.45;
  for (const z of [mz0, mz1]) box(M.metal, R0, mx, y + .85, z, .06, 1.7, .06);
  box(M.metal, R0, mx, y + 1.68, (mz0 + mz1)/2, .05, .05, mz1 - mz0 + .06); box(M.metal, R0, mx, y + .2, (mz0 + mz1)/2, .05, .05, mz1 - mz0 + .06);
  [[.55, -1.55], [.95, -1.1], [1.35, -.65]].forEach(([hy, z], k) => { box(M.metal, R0, mx - .02, y + hy, z, .05, .05, .05); dish(R0, mx + .02, y + hy - .2, z, .3, PI/2 + rnd(-.6, .6), rnd(1.1, 1.4), k === 2); });
  { const F = under(R0, T(mx + .04, 0, (mz0 + mz1)/2, PI/2)); wordSign(F, 'sign_w_mlink', 0, .32, .02, .7, 'cyan', .6); }
  // the two lattice towers, each with a pair of MW horns and their plate
  for (const [tx, tz, h, b0] of [[.55, -1.6, rnd(3.0, 3.4), .32], [-1.75, 1.45, rnd(2.5, 2.8), .3]]){
    const { pt, pw } = latticeTower(R0, tx, y, tz, h, b0, .1);
    for (const a of [rnd(0, TAU), rnd(0, TAU)]) hornAntenna(R0, tx + Math.sin(a)*pw*.7, pt + .2, tz + Math.cos(a)*pw*.7, a);
    const F = under(R0, T(tx, 0, tz + pw + .02, 0)); wordSign(F, 'sign_w_mw', 0, pt - .2, 0, .7, 'orange', .6);
    coaxBundle(R0, [[tx + b0 - .05, y + .05, tz + b0 + .05], [tx + .2, pt - .05, tz + .2]], 2, .022);   // up a leg to the horns
  }
  // the server island: two rows of cabinets back to back, every face full of live screens and LEDs
  const ix = .05, iz = .45, cw = .43, ch = 1.15;
  for (const [face, zc] of [[0, iz + .24], [PI, iz - .24]]){
    for (let k=0; k<3; k++){
      const x = ix + (k - 1)*(cw + .02);
      box(M.metalDark, R0, x, y + ch/2, zc, cw, ch, .46);
      const F = under(R0, T(x, y, zc + (face ? -.23 : .23), face));
      box(M.frame, F, 0, ch/2, .005, cw - .04, ch - .06, MIN_T);
      screenQuad(F, 0, .92, .035, cw - .1, .22, irand(0, 4));
      screenQuad(F, 0, .66, .035, cw - .1, .2, irand(0, 4));
      screenQuad(F, 0, .41, .035, cw - .1, .16, 5);
      for (let t = .1; t < .28; t += .05) box(M.metal, F, 0, t, .03, cw - .12, .015, MIN_T);   // vents
    }
    for (let k=0; k<(face ? 2 : 3); k++){ const Fm = under(R0, T(ix + (k - (face ? .5 : 1))*.42, y + ch, zc + (face ? -.08 : .08), face)); monitor(Fm, 0, .15, .15, .26, .2, k === 1 ? 1 : irand(0, 4), true); }
  }
  // a big waveform display on legs in front, and an oscilloscope bench to the side
  { const Fb = under(R0, T(ix, y, iz + .95, 0)); for (const s of [-1, 1]) box(M.frame, Fb, s*.38, .3, -.02, .04, .6, .04); monitor(Fb, 0, .78, 0, .85, .45, 0, false); }
  { const bx2 = -.95, bz2 = .95; box(M.inWood2, R0, bx2, y + .42, bz2, .7, .04, .4); for (const s of [-1, 1]) box(M.frame, R0, bx2 + s*.3, y + .2, bz2, .03, .4, .35);
    for (const s of [-1, 1]) monitor(under(R0, T(bx2 + s*.17, y + .44, bz2 - .02, 0)), 0, .14, .1, .22, .17, 1, true);
    box(M.metalDark, R0, bx2, y + .1, bz2, .5, .2, .3); }
  // the solar canopy over the racks, with the charge controller and battery bank beside them
  const cy = 1.85;
  for (const [x, z] of [[ix - .78, iz - .6], [ix + .78, iz - .6], [ix - .78, iz + .62], [ix + .78, iz + .62]]) box(M.frame, R0, x, y + cy/2, z, .05, cy, .05);
  box(M.frame, R0, ix, y + cy, iz, 1.65, .04, 1.3);
  solarRow(R0, ix, iz, 1.6, 1.25, y + cy - .2);
  box(M.white2, R0, ix + .98, y + .55, iz + .2, .3, .4, .2); box(M.neonAmber, R0, ix + .98, y + .65, iz + .31, .05, .05, MIN_T); screenQuad(under(R0, T(ix + .98, y, iz + .305, 0)), 0, .5, 0, .18, .08, 5);
  for (let k=0; k<3; k++) box(M.metalDark, R0, ix + .98, y + .1 + k*.11, iz - .25, .32, .1, .3);   // the battery bank
  coaxBundle(R0, [[ix + .98, y + cy - .1, iz + .55], [ix + .98, y + .8, iz + .55], [ix + .98, y + .76, iz + .3]], 2, .02);
  // the coax: thick black bundles from the racks out across the roof to every dish and tower
  coaxBundle(R0, [[ix - .3, y + .05, iz - .5], [ix - .3, y + .05, -.55], [sx + .55, y + .05, -.85], [sx + .45, y + .3, sz + .05]], 4);
  coaxBundle(R0, [[ix + .3, y + .05, iz - .5], [ix + .3, y + .05, -1.05], [.55 - .35, y + .05, -1.3], [.55 - .3, y + .3, -1.55]], 3);
  coaxBundle(R0, [[ix + .7, y + .05, iz - .1], [1.35, y + .05, iz - .1], [1.55, y + .05, -.6], [mx - .1, y + .25, -.75]], 3);
  coaxBundle(R0, [[ix - .7, y + .05, iz + .55], [-1.2, y + .05, 1.05], [-1.5, y + .05, 1.35], [-1.6, y + .35, 1.4]], 3);
  coaxBundle(R0, [[ix, y + .05, iz + .5], [ix, y + .05, iz + .9]], 2, .025);
}

/* ---------- the radio station ---------- */
// A three-storey broadcast house with a dish farm on its roof, a lower wing carrying the two big dishes, and a
// lattice radio mast at the far corner, linked by a catwalk. Red lights blink all over it, chasing up the mast.
function buildRadioStation(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), S2 = 2*LOT;
  // ground: one paved compound across all four plots, with a darker service apron round the mast
  box(G.asph, P, 0, .012, 0, S2, .025, S2);
  const n = 14, st = S2/n;
  for (let a=0;a<n;a++) for (let b=0;b<n;b++) if (!chance(.035)) box(pick(TILES.ind), P, (a-(n-1)/2)*st, .03, (b-(n-1)/2)*st, st - .05, .045, st - .05);
  box(M.hazard, P, 2.2, .058, 2.2, 2.9, .012, 2.9); box(M.concDD, P, 2.2, .062, 2.2, 2.7, .014, 2.7);

  // ---- main building
  const bx = -1.05, bz = -.55, bw = 4.6, bd = 4.2, floors = 3 + hash('floors', m.seed) % 3, h = floors*FH + .25, y0 = CURB, roof = y0 + h;   // three to five storeys
  box(M.concM, P, bx, y0 + h/2, bz, bw, h, bd);
  for (let f=0; f<=floors; f++) box(M.concD, P, bx, y0 + f*FH + .02, bz, bw + .1, .09, bd + .1);          // floor ledges
  for (let f=0; f<floors; f++){
    const wy = y0 + f*FH + .52;
    for (const [fx, fz, len, ry] of [[0, bd/2, bw, 0], [0, -bd/2, bw, PI], [bw/2, 0, bd, PI/2], [-bw/2, 0, bd, -PI/2]]){
      const F = under(P, T(bx + fx, 0, bz + fz, ry));
      box(f % 2 ? M.interiorCool : M.winLit, F, 0, wy, .02, len - .5, .34, .04);                        // a band of lit studio windows
      for (let t = -len/2 + .45; t < len/2 - .3; t += .42) box(M.frame, F, t, wy, .05, .04, .36, .03);    // mullions
    }
  }
  box(M.concDD, P, bx, roof + .01, bz, bw - .1, .04, bd - .1);                                          // roof deck
  for (const [fx, fz, w, d] of [[0, bd/2, bw + .14, .05], [0, -bd/2, bw + .14, .05], [bw/2, 0, .05, bd + .14], [-bw/2, 0, .05, bd + .14]])
    box(M.trimCyan, P, bx + fx, roof - .06, bz + fz, w, .05, d);                                       // cyan trim round the roof edge
  for (const [fx, fz, w, d] of [[0, bd/2, bw, .12], [0, -bd/2, bw, .12], [bw/2, 0, .12, bd], [-bw/2, 0, .12, bd]])
    box(M.concD, P, bx + fx, roof + .14, bz + fz, w, .28, d);                                            // parapet
  // entrance: glass doors, an awning, and the ON AIR sign
  const E = under(P, T(bx, 0, bz + bd/2, 0));
  box(M.glassDark, E, -.6, y0 + .38, .03, .9, .7, .05); box(M.frame, E, -.6, y0 + .38, .06, .04, .7, .02);
  box(M.awn1, E, -.6, y0 + .82, .3, 1.2, .05, .6);
  plant('sign_onair', E, .55, y0 + .62, .08, 1.0, 'c', true); glow(E, .55, y0 + .62, .35, 'red', 1.8);
  plant('sign_onair', under(P, T(bx - bw/2, 0, bz, -PI/2)), .5, roof - .45, .06, 1.0, 'c', true);
  // a vertical neon strip down one corner
  box(M.neonPink, P, bx + bw/2 + .05, y0 + h/2, bz + bd/2 + .05, .05, h - .2, .05);
  for (const [cx, cz] of [[-1,-1],[1,-1],[-1,1],[1,1]]) beaconLight(P, bx + cx*(bw/2 - .06), roof + .33, bz + cz*(bd/2 - .06));
  for (let t = -bw/2 + 1.15; t < bw/2 - .8; t += 1.15){ beaconLight(P, bx + t, roof + .32, bz + bd/2, .06, .6); beaconLight(P, bx + t, roof + .32, bz - bd/2, .06, .6); }
  buildRelay(under(P, T(bx, roof, bz)), bw, bd);

  // ---- the wing: one storey, two big dishes on top
  const wx = 2.15, wz = -1.55, ww = 2.9, wd = 3.6, wh = FH + .35, wroof = y0 + wh;
  box(M.concL, P, wx, y0 + wh/2, wz, ww, wh, wd);
  box(M.shutter, P, wx + ww/2 + .01, y0 + .42, wz, .03, .8, 1.4);
  box(M.hazard, P, wx + ww/2 + .02, y0 + .86, wz, .03, .06, 1.5);
  box(M.concDD, P, wx, wroof + .01, wz, ww - .08, .04, wd - .08);                                      // roof deck
  for (const [fx, fz, w, d] of [[0, wd/2, ww + .08, .05], [0, -wd/2, ww + .08, .05], [ww/2, 0, .05, wd + .08], [-ww/2, 0, .05, wd + .08]])
    box(M.trimCyan, P, wx + fx, wroof - .05, wz + fz, w, .05, d);                                       // cyan trim round the wing's roof
  // the wing's roof: the relay's solar trickle-charge field, in two tilted rows, and the battery cabinets
  { const W = under(P, T(wx, wroof, wz)); for (const z of [-1.05, .15]) solarRow(W, 0, z, ww - .5, 1.0);
    for (let k=0; k<3; k++){ box(M.white2, W, -ww/2 + .45 + k*.42, .3, wd/2 - .45, .36, .6, .3); box(M.neonAmber, W, -ww/2 + .45 + k*.42, .5, wd/2 - .29, .05, .05, MIN_T); }
    coaxBundle(W, [[-ww/2 + .9, .03, wd/2 - .45], [-ww/2 + .15, .03, wd/2 - .45], [-ww/2 + .15, .03, -wd/2 + .2], [-ww/2 - .02, .03, -wd/2 + .2]], 2, .025); }
  for (const [cx, cz] of [[-1,-1],[1,-1],[1,1]]) beaconLight(P, wx + cx*(ww/2 - .05), wroof + .06, wz + cz*(wd/2 - .05));

  // ---- the mast: a square lattice tower, tapering, with platforms, panel antennas and a whip on top
  const tx = 2.2, tz = 2.2, Ht = rnd(17, 20.5), b0 = .85, b1 = .2, seg = 1.25;
  const half = y => b0 + (b1 - b0)*(y/Ht);
  const legs = [[1,1],[1,-1],[-1,-1],[-1,1]];
  for (const [sx, sz] of legs) strut(M.red2, P, tx + sx*b0, y0, tz + sz*b0, tx + sx*b1, y0 + Ht, tz + sz*b1, .1);
  box(M.concD, P, tx, y0 + .12, tz, 2*b0 + .5, .24, 2*b0 + .5);                                          // footing
  let lvl = 0;
  for (let y = 0; y < Ht - .01; y += seg, lvl++){
    const y2 = Math.min(Ht, y + seg), w1 = half(y), w2 = half(y2), mat = lvl % 2 ? M.white2 : M.red2;   // painted in red and white bands
    for (let k=0; k<4; k++){
      const [ax, az] = legs[k], [cx2, cz2] = legs[(k+1)%4];
      strut(mat, P, tx + ax*w2, y0 + y2, tz + az*w2, tx + cx2*w2, y0 + y2, tz + cz2*w2, .05);                // ring
      strut(M.frame, P, tx + ax*w1, y0 + y, tz + az*w1, tx + cx2*w2, y0 + y2, tz + cz2*w2, .03);           // X bracing
      strut(M.frame, P, tx + cx2*w1, y0 + y, tz + cz2*w1, tx + ax*w2, y0 + y2, tz + az*w2, .03);
    }
    if (lvl % 2 === 1) for (const [sx, sz] of legs) if (chance(.6)) beaconLight(P, tx + sx*(w2 + .04), y0 + y2, tz + sz*(w2 + .04), .07, .7);
  }
  for (const f of [.38, .7]){
    const py = y0 + Ht*f, pw = half(Ht*f) + .35;
    box(M.metalDark, P, tx, py, tz, 2*pw, .06, 2*pw);
    for (const [sx, sz] of legs) cyl(M.frame, P, tx + sx*pw, py + .18, tz + sz*pw, .02, .36);
    for (let k=0; k<4; k++){                                                                              // panel antennas round the deck
      const a = k*PI/2 + rnd(-.2, .2), F = under(P, T(tx + Math.sin(a)*(pw - .08), py, tz + Math.cos(a)*(pw - .08), a));
      box(M.white2, F, 0, .45, 0, .22, .8, .08);
    }
    for (let k=0; k<3; k++){ const a = k*TAU/3 + rnd(0, 1), F = under(P, T(tx + Math.sin(a)*(pw - .2), py, tz + Math.cos(a)*(pw - .2), a)); dish(F, 0, .03, .15, rnd(.22, .32), rnd(-.6, .6), rnd(.6, 1.3), chance(.5)); }
    if (chance(.8)){ const a = rnd(0, TAU), F = under(P, T(tx + Math.sin(a)*pw, py, tz + Math.cos(a)*pw, a));   // a microwave drum
      put(U.cyl16, M.white2, under(F, T(0, .45, .12, 0, .6, .22, .6, PI/2))); box(M.frame, F, 0, .45, -.02, .08, .5, .05); }
    beaconLight(P, tx + pw, py + .1, tz + pw, .08, .9); beaconLight(P, tx - pw, py + .1, tz - pw, .08, .9);
  }
  const top = y0 + Ht;
  cyl(M.white2, P, tx, top + 1.3, tz, .05, 2.6); cyl(M.red2, P, tx, top + 2.0, tz, .07, .2);           // the whip
  for (const a of [0, PI/2, PI, -PI/2]) strut(M.frame, P, tx, top + .9, tz, tx + Math.sin(a)*.45, top + .5, tz + Math.cos(a)*.45, .02);
  beaconLight(P, tx, top + 2.7, tz, .12, 1.6);                                                               // the beacon
  beaconLight(P, tx + b1, top + .06, tz + b1, .08, .9); beaconLight(P, tx - b1, top + .06, tz - b1, .08, .9);
  // guy wires out to anchor blocks
  for (const [gx, gz] of [[3.5, .2], [.2, 3.55], [3.55, 3.55]]){
    box(M.concD, P, gx, y0 + .08, gz, .3, .16, .3);
    strut(M.frame, P, gx, y0 + .16, gz, tx, y0 + Ht*.62, tz, .015);
  }
  // a catwalk from the main roof across to the mast
  const cy = roof + .05, ex = tx - half(roof - y0) - .05;
  strut(M.metalDark, P, bx + bw/2 - .1, cy, bz + bd/2 - .5, ex, cy, tz, .32);
  strut(M.frame, P, bx + bw/2 - .1, cy + .3, bz + bd/2 - .65, ex, cy + .3, tz - .15, .03);
  // ground: equipment cabinets by the mast, a fence round the footing, planters, a lamp
  for (let k=0; k<3; k++) box(pick([M.metal, M.white2, M.metalDark]), P, 3.3 - k*.45, y0 + .25, .9, .35, .5, .3);
  for (const [sx, sz] of legs){ cyl(M.frame, P, tx + sx*1.3, y0 + .3, tz + sz*1.3, .025, .6); }
  for (const [ax, az, bxx, bzz] of [[1,1,1,-1],[1,-1,-1,-1],[-1,-1,-1,1],[-1,1,1,1]]) strut(M.frame, P, tx + ax*1.3, y0 + .55, tz + az*1.3, tx + bxx*1.3, y0 + .55, tz + bzz*1.3, .025);
  for (let k=0; k<5; k++) plant(pick(['bush','bushFlower','bonsai','g_spread1','g_fern3']), P, rnd(-3.4, -.2), .05, rnd(2.0, 3.4), rnd(.7, .95));
  for (let k=0; k<3; k++) plant(hangKind(), under(P, T(bx, 0, bz - bd/2, PI)), rnd(-1.8, 1.8), roof + .2, .1, rnd(.8, 1.1), 't', true);
  cyl(M.metalDark, P, -3.3, .65, 3.3, .03, 1.3); box(M.bulb, P, -3.18, 1.26, 3.3, .12, .05, .1); glow(P, -3.18, 1.2, 3.3, 'warm', 1.4);

  m.roofH = roof + .3;
  m.top = top + 2.8;
}

// for trying things out: open the game with #dev in the address, point at a plot and press M for the radio
// station, N the sky mall, B the town square, V the foundry, C the police station, K the market mall, P the cloud
// pagoda, J the Neon Dome club (each key
// brings one in, with Shift it takes one away; ignores the requirement and the odds)
if (location.hash.includes('dev')){
  let lastPointer = null;
  addEventListener('pointermove', e => { lastPointer = { x: e.clientX, y: e.clientY }; });
  addEventListener('keydown', e => {
    const kind = { m: 'radio', n: 'mall', b: 'square', v: 'foundry', c: 'police', k: 'market', p: 'pagoda', j: 'club' }[e.key.toLowerCase()]; if (!kind) return;
    const pk = lastPointer ? pickAt(lastPointer.x, lastPointer.y) : null;
    const c = pk && pk.c ? pk.c : pk && pk.kind === 'sky' ? { i: pk.i, j: pk.j } : cells.values().next().value;
    if (e.shiftKey && megasOfKind(kind).length) removeMega(megasOfKind(kind)[0]);
    else if (c) spawnMega(kind, c);
  });
}

/* ---------- the sky mall ---------- */
// An octagonal glass mall in white and gold. It stands on white columns with gold collars above a marble court,
// and each side is a single sheet of glass, framed only in gold at the corners and floor lines. Inside is an open
// atrium: upper floors are walkway rings round a central core of boutiques (varied widths, neon signs over the
// doors), with glass balustrades, so you see down through the void to every floor. Fountains sit in the atrium; the walkways carry futuristic luxury furnishings. The roof is mostly pool, ringed by a white canopy
// on gold posts. Two floors per tier; warm lighting, with neon only on the shop signs.
M.lux = toon(0xf4f1ea);               // white stone
M.lux2 = toon(0xe7e0d2);              // warm off-white
M.marble = toon(0xefe8da, { em:0x4a3a26, kind:'window' }); M.marble2 = toon(0xdcd2bf, { em:0x3e3020, kind:'window' });   // floors pick up the warm interior light at night
M.marbleOut = toon(0xefe8da);
// real see-through glass: drawn in the colour pass only (it never hides the interior from the outline pass)
M.mallGlass = new THREE.MeshBasicMaterial({ color: 0xd8eef4, transparent: true, opacity: .1, depthWrite: false }); M.mallGlass.userData.colorOnly = true;
M.mallGlint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .32, depthWrite: false }); M.mallGlint.userData.colorOnly = true;
M.gold = toon(0xd6a944);
M.goldLit = toon(0xb98a2e, { em:0xffcf6a, kind:'trim' });   // gold trim that catches the light at night
M.mallPool = toon(0x2a6070, { em:0x1f4a55, kind:'trim' });  // pale water, softer than the neon pools elsewhere
M.shop1 = toon(0x5a4a34, { em:0xffe6b8, kind:'lamp' }); M.shop2 = toon(0x5a4630, { em:0xffcf86, kind:'lamp' }); M.shop3 = toon(0x5c4c3a, { em:0xfff0d4, kind:'lamp' });
M.canvas = toon(0xf7f3ea);
const MALL_FLOOR = 1.45, MALL_PER_TIER = 2;   // tall floors, so you can see deep enough inside to reach the shops
// The mall is an octagon: a rectangle with its corners cut at 45 degrees, which fills its block and lines up with
// the streets. MALL_HX/HZ are the half-widths at scale 1 and MALL_C the corner cut; every ring of the building
// (core, walkway, glass, canopy) is the same octagon scaled about the centre.
const MALL_HX = 5.2, MALL_HZ = 3.35, MALL_C = 1.3;
function octVerts(sx, sz){   // sx, sz: half-widths of this ring
  const c = MALL_C*Math.min(sx/MALL_HX, sz/MALL_HZ);
  return [[sx - c, -sz], [sx, -sz + c], [sx, sz - c], [sx - c, sz], [-sx + c, sz], [-sx, sz - c], [-sx, -sz + c], [-sx + c, -sz]];
}
function octEdges(sx, sz){
  const v = octVerts(sx, sz), out = [];
  for (let k=0; k<v.length; k++){
    const [x0, z0] = v[k], [x1, z1] = v[(k+1)%v.length], mx = (x0 + x1)/2, mz = (z0 + z1)/2;
    let ry = Math.atan2(-(z1 - z0), x1 - x0);
    if (Math.sin(ry)*mx + Math.cos(ry)*mz < 0) ry += PI;   // local +z faces out
    out.push({ mx, mz, len: Math.hypot(x1 - x0, z1 - z0), ry });
  }
  return out;
}
// a flat octagonal slab, optionally with an octagonal hole (a ring), cached by size
const octGeoCache = new Map();
function octSlab(mat, P, y, sx, sz, h, hx = 0, hz = 0){
  const key = [sx, sz, hx, hz].map(v => v.toFixed(3)).join(',');
  let g = octGeoCache.get(key);
  if (!g){
    const shape = new THREE.Shape(), v = octVerts(sx, sz);
    v.forEach(([x, z], k) => k ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    if (hx > 0){ const hole = new THREE.Path(), w = octVerts(hx, hz).reverse(); w.forEach(([x, z], k) => k ? hole.lineTo(x, -z) : hole.moveTo(x, -z)); shape.holes.push(hole); }
    g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); g.rotateX(-PI/2); g = g.toNonIndexed();
    octGeoCache.set(key, g);
  }
  put(g, mat, under(P, T(0, y, 0, 0, 1, h, 1)));
}
function buildSkyMall(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h, L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;
  const Pc = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2]));   // the block, long side on local x
  const SX = MALL_HX, SZ = MALL_HZ, P = Pc;

  // ---- the court: cream and white marble in a check, a gold octagon inlaid round the building, planters, lamps
  const nx = 18, nz = 12, cx = L/nx, cz = D/nz;
  for (let a=0;a<nx;a++) for (let b=0;b<nz;b++) box((a + b) % 2 ? M.lux : M.lux2, Pc, (a-(nx-1)/2)*cx, .03, (b-(nz-1)/2)*cz, cx - .02, .045, cz - .02);
  for (const e of octEdges(SX + .35, SZ + .35)) box(M.gold, under(P, T(e.mx, 0, e.mz, e.ry)), 0, .058, 0, e.len, .012, .06);
  for (const [px, pz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    const Q = T(px*(L/2 - .45), 0, pz*(D/2 - .45));
    box(M.lux, under(Pc, Q), 0, .2, 0, .5, .34, .5); box(M.gold, under(Pc, Q), 0, .38, 0, .54, .03, .54);
    plant(pick(['bonsai','bamboo']), under(Pc, Q), 0, .39, 0, rnd(.85, 1.05));
  }
  for (const [px, pz] of [[1,0],[-1,0]]){
    const Q = under(Pc, T(px*(L/2 - .3), 0, pz));
    cyl(M.gold, Q, 0, .7, 0, .03, 1.4); box(M.goldLit, Q, 0, 1.42, 0, .14, .08, .14); glow(Q, 0, 1.4, 0, 'warm', 1.4);
  }

  // ---- white columns with gold collars lift the mall; a white deck with a gold lip and a ring of warm bulbs
  const colH = 2.0, y0 = CURB, deckY = y0 + colH, deckT = .38;
  for (const [vx, vz] of [...octVerts(SX*.78, SZ*.78), [0, 0]]){
    cyl(M.lux, P, vx, y0 + colH/2, vz, .26, colH);
    for (const yy of [y0 + .08, y0 + colH - .1]) put(U.cyl16, M.gold, under(P, T(vx, yy, vz, 0, .64, .07, .64)));
    put(U.cyl16, M.lux2, under(P, T(vx, y0 + .02, vz, 0, .8, .06, .8)));
  }
  octSlab(M.lux, P, deckY, SX*1.05, SZ*1.05, deckT);
  for (const e of octEdges(SX*1.05, SZ*1.05)){
    const F = under(P, T(e.mx, 0, e.mz, e.ry));
    box(M.goldLit, F, 0, deckY + deckT - .03, .01, e.len, .05, .04);
    for (let t = -e.len/2 + .3; t < e.len/2 - .2; t += .55){ box(M.bulb, F, t, deckY + .1, .01, .06, .06, .05); if (chance(.5)) glow(F, t, deckY + .08, .12, 'warm', .8); }
  }

  // ---- the glass mall, floor by floor
  const floors = m.levels*MALL_PER_TIER, base = deckY + deckT, CORE = .45;
  const outer = octEdges(SX, SZ), core = octEdges(SX*CORE, SZ*CORE), mid = octEdges(SX*.82, SZ*.82), voidMid = octEdges(SX*.84, SZ*.84);
  const escSide = pick([0, 2, 4, 6]);   // which straight sides the atrium fountains sit on
  const WALK = .68, walk = octEdges(SX*((CORE + WALK)/2), SZ*((CORE + WALK)/2)), rail = octEdges(SX*WALK, SZ*WALK);
  for (let f=0; f<floors; f++){
    const fy = base + f*MALL_FLOOR, tierStart = f % MALL_PER_TIER === 0;
    // An atrium: only the ground floor reaches the glass. Upper floors are a walkway ring round the core with a
    // glass balustrade, so from outside you look down through the void to the shops on every floor.
    if (f === 0){
      octSlab(M.marble, P, fy, SX, SZ, .08);
      octSlab(M.marble2, P, fy + .002, SX*.9, SZ*.9, .08, SX*.8, SZ*.8);       // a darker inlay band round the atrium floor
    } else {
      octSlab(M.marble, P, fy, SX*WALK, SZ*WALK, .08, SX*CORE, SZ*CORE);
      octSlab(M.lux, P, fy - .12, SX*WALK, SZ*WALK, .12, SX*(WALK - .04), SZ*(WALK - .04));   // the white slab edge
      for (const e of rail){
        const F = under(P, T(e.mx, 0, e.mz, e.ry));
        box(M.goldLit, F, 0, fy - .1, .01, e.len, .05, .03);                     // a gold line under the edge, lit at night
        box(M.mallGlass, F, 0, fy + .26, -.03, e.len, .34, .02);                 // glass balustrade
        box(M.gold, F, 0, fy + .44, -.03, e.len, .03, .04);                      // gold handrail
        for (let t = -e.len/2 + .4; t < e.len/2 - .2; t += .8) glow(F, t, fy - .14, .1, 'warm', .45);   // downlights
      }
      // slim gold columns carry the walkway down to the floor below
      for (const [vx, vz] of octVerts(SX*(WALK - .03), SZ*(WALK - .03))) cyl(M.gold, P, vx, fy - MALL_FLOOR/2, vz, .04, MALL_FLOOR);
    }
    for (const e of outer){                                                       // gold floor line on the glass
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      box(tierStart ? M.goldLit : M.gold, F, 0, fy + .04, .02, e.len, tierStart ? .1 : .06, .05);
    }
    // the core, lined with boutiques of different widths: glass fronts with a lit interior behind, a neon sign
    // over each, and a sliver of shelving and goods. (One-off landmark, so it can afford the extra detail.)
    octSlab(M.lux2, P, fy + .08, SX*CORE, SZ*CORE, MALL_FLOOR - .08);
    for (const e of core){
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      let x = -e.len/2 + .05;
      while (x < e.len/2 - .4){
        let w = Math.min(rnd(.6, 1.7), e.len/2 - .05 - x); if (e.len/2 - .05 - (x + w) < .45) w = e.len/2 - .05 - x;
        const cx = x + w/2, shop = pick([M.shop1, M.shop1, M.shop2, M.shop3]), tall = chance(.35);
        const sh = tall ? 1.0 : .85;   // signs above must stay under the ceiling, or they poke up through the floor above (and the pool)
        box(shop, F, cx, fy + .08 + sh/2, -.08, w - .12, sh, .04);                              // the lit back wall
        box(M.lux, F, cx, fy + .1, .02, w - .1, .04, .2);                                       // threshold
        for (let s2 = cx - (w - .3)/2; s2 <= cx + (w - .3)/2 + .01; s2 += Math.max(.25, (w - .3)/Math.max(1, Math.round(w/.4)))){
          const r = R();
          if (r < .4) box(pick([M.gold, M.lux, M.concDD]), F, s2, fy + .4, -.03, .14, .5, .06);    // shelving
          else if (r < .7){ box(M.lux, F, s2, fy + .18, .06, .16, .2, .12); box(pick([M.cloth1, M.cloth3, M.cloth4, M.awn2, M.gold]), F, s2, fy + .33, .06, .06, .1, .06); }   // a display plinth
          else box(pick([M.cloth1, M.cloth3, M.cloth4, M.awn1, M.awn2]), F, s2, fy + .34, -.02, .1, .44, .05);   // a mannequin / hanging rail
        }
        box(M.goldLit, F, cx, fy + .09 + sh, .1, w - .06, .05, .04);                            // gold lintel
        // the sign: a neon tube outline or a lit glyph sign above the door
        if (chance(.55)){
          const nm = pick([M.neonPink, M.neonCyan, M.neonAmber, M4.neonPurple]), nw = Math.min(w - .2, rnd(.35, .8));
          box(nm, F, cx, fy + .18 + sh, .13, nw, .03, .03); box(nm, F, cx, fy + .34 + sh, .13, nw, .03, .03);
          box(nm, F, cx - nw/2, fy + .26 + sh, .13, .03, .19, .03); box(nm, F, cx + nw/2, fy + .26 + sh, .13, .03, .19, .03);
          for (let q = cx - nw/2 + .08; q < cx + nw/2 - .05; q += .09) box(nm, F, q, fy + .26 + sh + rnd(-.04, .04), .13, .025, rnd(.05, .1), .02);   // lettering, implied
          glow(F, cx, fy + .26 + sh, .3, NEON_NAME.get(nm) || 'pink', .9);
        } else {
          const kind = pick(GLYPH_H); plant(kind, F, cx, fy + .26 + sh, .13, .7, 'c', true); glow(F, cx, fy + .26 + sh, .3, GLYPH_GLOW[kind], .8);
        }
        box(M.lux, F, x + w, fy + .7, .1, .08, 1.28, .14);                                      // white pilaster
        x += w;
      }
      box(M.lux, F, -e.len/2 + .05, fy + .7, .1, .08, 1.28, .14);
    }
    // the concourse: futuristic luxury furnishings (no two neighbours alike), shoppers, pendant lights
    const FURN = [
      (F, t) => { put(U.cyl16, M.lux, under(F, T(t, fy + .14, 0, 0, .7, .1, .36))); put(U.cyl16, M.gold, under(F, T(t, fy + .1, 0, 0, .5, .02, .26))); glow(F, t, fy + .1, 0, 'warm', .5); },   // a floating oval bench, lit underneath
      (F, t) => { cyl(M.gold, F, t, fy + .14, 0, .03, .12); put(U.torus, M.goldLit, under(F, T(t, fy + .55, 0, 0, .55, .55, .55, PI/2))); put(U.sph, M.lux, under(F, T(t, fy + .55, 0, 0, .16, .16, .16))); },   // gold ring sculpture round a white orb
      (F, t) => { put(U.cyl16, M.lux, under(F, T(t, fy + .12, 0, 0, .5, .1, .5))); put(U.cyl16, M.mallPool, under(F, T(t, fy + .18, 0, 0, .42, .02, .42))); cyl(M.gold, F, t, fy + .3, 0, .02, .24); glow(F, t, fy + .3, 0, 'cyan', .7); },   // a round fountain
      (F, t) => { box(M.lux, F, t, fy + .2, 0, .14, .24, .14); box(M.mallGlass, F, t, fy + .5, 0, .2, .36, .2); box(pick([M.gold, M.cloth1, M.cloth3]), F, t, fy + .45, 0, .07, .1, .07); glow(F, t, fy + .5, 0, 'warm', .5); },   // a glass vitrine on a pedestal
      (F, t) => { cyl(M.gold, F, t, fy + .25, 0, .02, .3); box(M.concDD, F, t, fy + .42, 0, .3, .2, .03); box(M.interiorCool, F, t, fy + .42, .02, .26, .16, .01); glow(F, t, fy + .42, .1, 'cyan', .45); },   // a directory screen
      (F, t) => { for (const o of [-.22, .22]){ box(M.lux, F, t + o, fy + .14, 0, .34, .1, .3); box(M.lux, F, t + o, fy + .24, -.13, .34, .18, .05); box(M.gold, F, t + o, fy + .1, 0, .3, .02, .26); } put(U.cyl16, M.gold, under(F, T(t, fy + .16, .25, 0, .2, .02, .2))); },   // a lounge pair round a gold side table
      (F, t) => { box(M.lux, F, t, fy + .16, 0, .34, .16, .34); box(M.gold, F, t, fy + .245, 0, .36, .02, .36); plant(pick(['bonsai','bushFlower','bush']), F, t, fy + .25, 0, rnd(.65, .85)); },   // planter (low plants only: tall bamboo poked up through the ceiling into the floor above and the pool)
    ];
    for (const e of (f === 0 ? mid : walk)){
      if (e.len < 1.2) continue;   // corner cuts are too short to furnish
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      let last = -1;
      for (let t = -e.len/2 + .55; t < e.len/2 - .4; t += rnd(.85, 1.3)){
        let k = Math.floor(R()*FURN.length); if (k === last) k = (k + 1) % FURN.length; last = k;
        FURN[k](F, t);
        if (chance(.7)){ const sx = t + rnd(-.35, .35), sz = f === 0 ? rnd(-.38, .38) : rnd(-.2, .2);                  // a shopper or two
          box(pick([M.frame, M.metalDark, M.concDD, M.awn1, M.cloth3, M.white2]), F, sx, fy + .19, sz, .07, .2, .05); box(M.concDD, F, sx, fy + .32, sz, .05, .05, .05); }
        if (chance(.6)){ cyl(M.gold, F, t + .4, fy + MALL_FLOOR - .14, 0, .006, .2); put(U.sph, M.bulb, under(F, T(t + .4, fy + MALL_FLOOR - .27, 0, 0, .09, .09, .09))); glow(F, t + .4, fy + MALL_FLOOR - .27, 0, 'warm', .55); }   // pendant
      }
    }
    if (f === 0) for (const k of [(escSide + 2) % 8, (escSide + 6) % 8]){
      const e = voidMid[k], F = under(P, T(e.mx, 0, e.mz, e.ry));
      put(U.cyl16, M.lux, under(F, T(0, fy + .14, 0, 0, 1.2, .12, .7))); put(U.cyl16, M.mallPool, under(F, T(0, fy + .2, 0, 0, 1.05, .02, .58)));
      for (const o of [-.25, 0, .25]) cyl(M.gold, F, o, fy + .4, 0, .015, .4); glow(F, 0, fy + .45, 0, 'cyan', .8);
      plant('bamboo', F, -.75, fy + .1, 0, .65); plant('bamboo', F, .75, fy + .1, 0, .6);   // kept below the walkway above
    }
    // the glass itself: one sheet per side, framed in gold only at the corners, with the odd streak of reflection
    for (const e of outer){
      const F = under(P, T(e.mx, 0, e.mz, e.ry));
      box(M.mallGlass, F, 0, fy + MALL_FLOOR/2 + .04, .03, e.len - .1, MALL_FLOOR - .08, .02);
      if (chance(.6)){ const gx = rnd(-e.len/2 + .6, e.len/2 - .6); box(M.mallGlint, F, gx, fy + MALL_FLOOR/2, .045, .05, MALL_FLOOR*.8, .01, 0, 0, .5); box(M.mallGlint, F, gx + .18, fy + MALL_FLOOR/2, .045, .025, MALL_FLOOR*.6, .01, 0, 0, .5); }
    }
    for (const [vx, vz] of octVerts(SX, SZ)) box(tierStart ? M.goldLit : M.gold, P, vx, fy + MALL_FLOOR/2, vz, .09, MALL_FLOOR, .09);
  }
  const roof = base + floors*MALL_FLOOR;

  // ---- the roof: a pool over most of it, a marble walk round it, and a white canopy along every edge
  octSlab(M.lux, P, roof, SX*1.03, SZ*1.03, .14);
  for (const e of octEdges(SX*1.03, SZ*1.03)) box(M.goldLit, under(P, T(e.mx, 0, e.mz, e.ry)), 0, roof + .1, .01, e.len, .06, .04);
  octSlab(M.marbleOut, P, roof + .14, SX*.98, SZ*.98, .03);
  octSlab(M.gold, P, roof + .17, SX*.75, SZ*.75, .04, SX*.72, SZ*.72);          // gold coping round the pool (a ring, so nothing shows through the water)
  // The water: a flat sheet level with the walk. Its normals lean slightly, so the wet-ground reflection pass
  // (which only treats surfaces facing straight up) leaves it alone; otherwise the posts and bamboo round the
  // pool smeared into it as dark streaks, like something under the water.
  { const shape = new THREE.Shape(); octVerts(SX*.72, SZ*.72).forEach(([x, z], k) => k ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-PI/2);
    const n = g.attributes.normal; for (let k=0; k<n.count; k++) n.setXYZ(k, 0, .84, .54);
    put(g, M.mallPool, under(P, T(0, roof + .19, 0))); g.dispose(); }
  for (const e of octEdges(SX*.87, SZ*.87)){
    const F = under(P, T(e.mx, 0, e.mz, e.ry));
    box(M.canvas, F, 0, roof + 1.0, .02, e.len*.95, .04, .46, 0, -.12);         // canopy, sloping out
    box(M.goldLit, F, 0, roof + .96, .25, e.len*.95, .04, .04);
    for (let t = -e.len*.45; t <= e.len*.45 + .01; t += e.len*.9/Math.max(1, Math.round(e.len/1.1))){
      cyl(M.gold, F, t, roof + .58, .2, .025, .8);                                 // gold posts
    }
    for (let t = -e.len*.4; t < e.len*.4; t += .5){ glow(F, t, roof + .9, 0, 'warm', .55); }
    for (let t = -e.len*.35; t < e.len*.35; t += rnd(.7, 1.0)){                    // loungers in the shade
      box(M.lux, F, t, roof + .24, -.02, .22, .05, .42); box(M.gold, F, t, roof + .2, -.02, .2, .04, .38);
      if (chance(.4)) box(pick([M.cloth4, M.awn3, M.cloth2]), F, t, roof + .28, .08, .18, .02, .16);
    }
  }
  for (const [vx, vz] of octVerts(SX*.92, SZ*.92)) plant('bamboo', P, vx, roof + .17, vz, rnd(.9, 1.1));

  // ---- the sign: a white pylon at the front of the court with the MALL panel framed in gold
  const Fs = under(Pc, T(-L/2 + .7, 0, D/2 - .55, 0));
  box(M.lux, Fs, 0, 1.25, 0, .62, 2.5, .2); box(M.gold, Fs, 0, 2.52, 0, .66, .06, .24); box(M.gold, Fs, 0, .03, 0, .7, .06, .28);
  plant('sign_mall', Fs, 0, 1.4, .11, 1.0, 'c', true); glow(Fs, 0, 1.4, .35, 'amber', 2.0);

  m.roofH = roof + .17;
  m.top = roof + 1.4;
}

/* ---------- the town square ---------- */
// A 5x5 open plaza for the neighbourhoods (each one varies: see squareVariant). In the middle, say, a holographic koi pond: a round, dark pool ringed in
// stone and cyan neon, with lily pads and lotus lights, where koi made of light circle and flicker. Lantern strings
// cross over it between poles round the square. Round the pond, a busy night market: food carts of three kinds
// (menu-tower bike carts, hawker stalls, little food trucks), all piled with food; long market stands with trays
// of food laid out under tarps, like a street market; tables, queues and crowds, steam rising off the woks.
M.lantern = toon(0x7a2a1a, { em:0xff8a3a, kind:'bulb' }); M.lantern2 = toon(0x7a5a1a, { em:0xffc04a, kind:'bulb' });
M.screen = toon(0x10202a, { em:0x4fd8ff, kind:'neon' }); M.screen2 = toon(0x1a1030, { em:0xc070ff, kind:'neon' });
M.tarp1 = toon(0x3f6f7a); M.tarp2 = toon(0x7a4a5a); M.tarp3 = toon(0x6a6a52);
// food: warm, saturated colours that read as food even at a few pixels (lit a little so they glow under the lamps)
const FOOD = [toon(0xe08a2a, { em:0x3a1e06, kind:'window' }), toon(0xf2c04a, { em:0x3a2a06, kind:'window' }), toon(0xc8402a, { em:0x30100a, kind:'window' }),
              toon(0x8fb03a, { em:0x1a2a06, kind:'window' }), toon(0xb8743a, { em:0x2a1608, kind:'window' }), toon(0xf4e2c0, { em:0x3a3020, kind:'window' }),
              toon(0xff8aa0, { em:0x3a141a, kind:'window' })];
const food = () => pick(FOOD);
M.koiWater = toon(0x1c5868, { em:0x0b3442, kind:'trim' });   // deep teal, dark enough for the glowing koi to read
// a tray heaped with food
function foodTray(P, x, y, z, w = .26, d = .18){
  box(pick([M.metal, M.white2, M.wood]), P, x, y + .01, z, w, .02, d);
  const f = food(), n = 3 + Math.floor(R()*4);
  for (let k=0; k<n; k++) put(U.sph, chance(.7) ? f : food(), under(P, T(x + rnd(-w*.35, w*.35), y + .04, z + rnd(-d*.3, d*.3), 0, rnd(.05, .09), rnd(.035, .06), rnd(.05, .09))));
}
// a bowl with a mound of noodles or rice
function foodBowl(P, x, y, z, r = .07){ put(U.cyl16, pick([M.white2, M.awn3, M.pot, M.corrBlue]), under(P, T(x, y + .025, z, 0, 2*r, .05, 2*r))); put(U.sph, food(), under(P, T(x, y + .05, z, 0, 1.6*r, .7*r, 1.6*r))); }
// skewers standing in a rack
function skewers(P, x, y, z){ box(M.wood, P, x, y + .02, z, .18, .04, .08); for (let k=0; k<5; k++){ const sx = x - .07 + k*.035; cyl(M.wood, P, sx, y + .12, z, .004, .2); for (let q=0; q<3; q++) box(food(), P, sx, y + .1 + q*.035, z, .028, .028, .028); } }
// a pot on a burner, steaming
function steamPot(P, x, y, z){ put(U.cyl16, M.metalDark, under(P, T(x, y + .03, z, 0, .2, .06, .2))); put(U.cyl16, M.metal, under(P, T(x, y + .12, z, 0, .18, .14, .18))); put(U.cyl16, food(), under(P, T(x, y + .19, z, 0, .15, .01, .15))); emitters.push(new THREE.Vector3(x, y + .22, z).applyMatrix4(P)); }
// hanging food: sausages, roast ducks, lanterns of buns
function hangingFood(P, x, y, z){ for (let k=0; k<4; k++){ const hx = x + (k - 1.5)*.07; cyl(M.frame, P, hx, y - .04, z, .003, .08); box(pick([FOOD[0], FOOD[4], FOOD[2]]), P, hx, y - .14, z, .045, .12, .04); } }
// lights near the pond, collected while the square is generated, for the water to reflect: [x, y, z, r, g, b]
let reflectLights = null;
const _rl = new THREE.Vector3();
function noteLight(P, x, y, z, hex){ if (!reflectLights) return; _rl.set(x, y, z).applyMatrix4(P); const c = new THREE.Color(hex); reflectLights.push([_rl.x, _rl.y, _rl.z, c.r, c.g, c.b]); }
function lanternString(P, ax, ay, az, bx, by, bz, sag){
  const n = Math.max(4, Math.round(Math.hypot(bx - ax, bz - az)/.55));
  let px = ax, py = ay, pz = az;
  for (let k=1; k<=n; k++){
    const t = k/n, x = ax + (bx - ax)*t, z = az + (bz - az)*t, y = ay + (by - ay)*t - sag*Math.sin(PI*t);
    strut(M.frame, P, px, py, pz, x, y, z, .012);
    if (k < n){ box(chance(.5) ? M.lantern : M.lantern2, P, x, y - .1, z, .1, .14, .1); if (k % 2) glow(P, x, y - .1, z, chance(.6) ? 'amber' : 'warm', .55); if (k % 2) noteLight(P, x, y - .1, z, 0xffa040); }
    px = x; py = y; pz = z;
  }
}
// In the town square the little box figures are replaced by real people: there, person() only notes the spot
// (still drawing the same random number, so the square's layout is unchanged) and the people system fills it.
let PERSON_GHOST = null;   // while building the square: { kind, stall, face } for the spots being noted, or kind null to skip
function ghostAs(kind, stall, face){ if (PERSON_GHOST) PERSON_GHOST = { kind, stall, face }; }
function person(P, x, y, z){ const c = pick([M.frame, M.metalDark, M.concDD, M.awn1, M.cloth3, M.white2, M.awn2, M.red2, M.cloth1, M.cloth4]); if (PERSON_GHOST){ if (PERSON_GHOST.kind) spotAt(P, x, y, z, PERSON_GHOST.kind, PERSON_GHOST.stall, PERSON_GHOST.face); return; }
  box(c, P, x, y + .11, z, .08, .22, .06); box(M.concDD, P, x, y + .26, z, .055, .06, .055); }
// cart 1: a tall bike cart with a stack of glowing menu boards (menu-tower reference), its counter full of food
function menuCart(P, neon){
  box(M.metalDark, P, 0, .42, 0, .9, .32, .45);
  for (const s of [-1, 1]) for (let k=0; k<2; k++){ const F = under(P, T(0, 0, s*.226, s > 0 ? 0 : PI)); box(neon, F, -.22 + k*.44, .42, 0, .3, .02, .01); box(neon, F, -.22 + k*.44, .42, 0, .02, .24, .01); box(neon, F, -.22 + k*.44 - .1, .45, 0, .02, .14, .01, 0, 0, .7); }
  box(M.metal, P, 0, .6, 0, .94, .04, .5);
  for (const s of [-1, 1]) for (const z of [.25, -.25]) put(U.torus, M.frame, under(P, T(.25*s, .2, z, 0, .4, .4, .4, PI/2)));
  for (const [x, z] of [[-.42,-.2],[.42,-.2],[-.42,.2],[.42,.2]]) cyl(M.frame, P, x, .9, z, .015, .6);
  box(M.metalDark, P, 0, 1.22, 0, 1.1, .05, .62); box(neon, P, 0, 1.2, .31, 1.1, .03, .02); box(neon, P, 0, 1.2, -.31, 1.1, .03, .02);
  box(M.metalDark, P, 0, 1.52, -.05, .8, .55, .4); box(M.screen, P, 0, 1.55, .16, .7, .4, .02); box(M.screen2, P, 0, 1.55, -.26, .7, .4, .02);
  box(M.metalDark, P, .05, 1.98, -.05, .55, .38, .32); box(M.screen2, P, .05, 2.0, .12, .46, .28, .02); box(neon, P, .05, 2.19, -.05, .6, .03, .36);
  glow(P, 0, 1.55, .3, neon === M.neonPink ? 'pink' : 'cyan', 1.2); glow(P, 0, 1.1, .2, 'warm', 1.0);
  // the food: trays on the counter, a steaming pot, skewers, buns hanging under the canopy
  foodTray(P, -.3, .62, .1); foodTray(P, 0, .62, .12); steamPot(P, .3, .62, -.05); skewers(P, .32, .62, .17);
  for (let k=0; k<3; k++) foodBowl(P, -.36 + k*.18, .62, -.14);
  hangingFood(P, -.25, 1.2, .25);
}
// cart 2: an open hawker stall under a sagging tarp
function hawkerStall(P){
  box(M.metal, P, 0, .5, 0, 1.3, .06, .6); box(M.metalDark, P, 0, .28, 0, 1.24, .4, .54);
  for (let k=0; k<5; k++) foodTray(P, -.5 + k*.2, .53, .15, .17, .2);                       // a front row of trays
  for (let k=0; k<4; k++) foodBowl(P, -.45 + k*.2, .53, -.08, .075);
  steamPot(P, .45, .53, -.15); steamPot(P, .2, .53, -.2);
  for (const [x, z] of [[-.66,-.32],[.66,-.32],[-.66,.4],[.66,.4]]) cyl(M.frame, P, x, .7, z, .015, 1.4 + (z > 0 ? -.2 : 0));
  box(pick([M.tarp1, M.tarp2, M.tarp3]), P, 0, 1.33, .04, 1.5, .03, .9, 0, -.2);
  hangingFood(P, -.3, 1.2, .3); hangingFood(P, .15, 1.22, .3);
  for (const x of [-.35, .35]){ cyl(M.frame, P, x, 1.2, 0, .006, .14); put(U.cone, M.metalDark, under(P, T(x, 1.08, 0, 0, .18, .1, .18))); box(M.bulb, P, x, 1.02, 0, .06, .04, .06); glow(P, x, 1.0, 0, 'warm', 1.0); }
  box(M.metalDark, P, -.68, .65, -.1, .04, .3, .3); box(pick([M.screen, M.screen2]), P, -.7, .7, -.1, .01, .2, .24);
  for (let k=0; k<3; k++){ const x = rnd(-.5, .5); cyl(pick([M.red2, M.awn2, M.white2]), P, x, .16, .55, .08, .3); }
  for (let k=0; k<3; k++) put(U.cyl16, pick([M.awn1, M.corrBlue, M.white2]), under(P, T(rnd(-.6, .6), .12, rnd(-.45, -.3), 0, .18, .24, .18)));
}
// cart 3: a little food truck, hatch open, food stacked on the counter and a menu board out front
function foodTruck(P, neon){
  const body = pick([M.corrBlue, M.metalDark, M.teal2, M.concDD]);
  box(body, P, 0, .5, 0, 1.5, .7, .7); box(body, P, .9, .4, 0, .4, .5, .66);
  box(M.glassDark, P, 1.08, .55, 0, .04, .22, .56);
  box(M.winLit, P, -.15, .58, .352, .95, .38, .01);                                    // the open hatch, warm-lit inside
  for (let k=0; k<5; k++) box(food(), P, -.5 + k*.17, .52, .34, .1, .12, .04);          // food on shelves inside
  box(M.metal, P, -.15, .4, .42, 1.0, .03, .16);                                        // counter
  for (let k=0; k<4; k++) foodTray(P, -.5 + k*.24, .41, .43, .2, .13);
  box(body, P, -.15, .86, .5, 1.0, .03, .32, 0, -.5);
  box(neon, P, 0, .16, .352, 1.4, .03, .01); box(neon, P, 0, .16, -.352, 1.4, .03, .01);
  glow(P, 0, .12, .45, NEON_NAME.get(neon) || 'pink', 1.0); glow(P, -.15, .58, .5, 'warm', .9);
  for (const [x, z] of [[-.45,.36],[.45,.36],[-.45,-.36],[.85,-.34],[.85,.34]]) put(U.cyl16, M.frame, under(P, T(x, .12, z, 0, .24, .06, .24, PI/2)));
  box(M.metalDark, P, -.1, .98, 0, 1.0, .3, .06); const kind = pick(GLYPH_H);
  plant(kind, under(P, T(-.1, 0, .04)), 0, .98, 0, .85, 'c', true); glow(P, -.1, .98, .3, GLYPH_GLOW[kind], 1.0);
  box(M.frame, P, .5, .3, .75, .04, .6, .04, 0, -.2); box(M.screen, P, .5, .5, .76, .3, .34, .02, 0, -.2);   // A-board menu out front
  emitters.push(new THREE.Vector3(.3, .9, 0).applyMatrix4(P));
}
// a market stand: a long table of food laid out under tarps (street-market reference)
function marketStand(P){
  const L = 2.6;
  box(M.metal, P, 0, .48, .1, L, .05, .7); box(M.metalDark, P, 0, .25, .1, L - .1, .42, .62);   // front table
  for (let a=0; a<8; a++) for (let b=0; b<2; b++) foodTray(P, -L/2 + .2 + a*.31, .5, -.1 + b*.26, .26, .2);
  box(M.wood, P, 0, .75, -.42, L, .04, .3); box(M.wood, P, 0, .4, -.42, .05, .7, .3);        // raised back shelf
  for (let k=0; k<10; k++) chance(.5) ? foodBowl(P, -L/2 + .15 + k*.26, .77, -.42, .08) : box(pick([M.pot, M.awn3, M.white2, M.veg2]), P, -L/2 + .15 + k*.26, .84, -.42, .1, .14, .1);   // jars and bowls
  steamPot(P, L/2 + .25, .45, 0); box(M.metal, P, L/2 + .25, .22, 0, .4, .44, .4);         // side table with a pot
  for (const [x, z, h] of [[-L/2,-.6,1.7],[L/2,-.6,1.7],[-L/2,.5,1.45],[L/2,.5,1.45],[0,-.6,1.7]]) cyl(M.frame, P, x, h/2, z, .02, h);
  box(pick([M.tarp1, M.tarp2, M.tarp3]), P, -L*.25, 1.62, -.05, L*.55, .03, 1.3, 0, -.18);   // two tarps at different heights
  box(pick([M.tarp1, M.tarp2, M.tarp3]), P, L*.25, 1.55, -.05, L*.55, .03, 1.2, 0, -.15);
  for (const x of [-L*.35, 0, L*.35]){ cyl(M.frame, P, x, 1.42, 0, .006, .2); put(U.cone, M.metalDark, under(P, T(x, 1.28, 0, 0, .2, .1, .2))); box(M.bulb, P, x, 1.22, 0, .06, .04, .06); glow(P, x, 1.2, .05, 'warm', 1.1); }
  for (let t = -L/2; t < L/2; t += .25){ box(M.bulb, P, t, 1.5, .55, .04, .04, .04); if (chance(.4)) glow(P, t, 1.48, .55, 'warm', .4); }   // a string of small bulbs
  hangingFood(P, -L*.2, 1.5, .4); hangingFood(P, L*.3, 1.45, .4);
  const st = PERSON_GHOST && PERSON_GHOST.stall;
  ghostAs('vendor', st, [0, 1]);
  for (let k=0; k<3; k++) person(P, rnd(-L/2 + .3, L/2 - .3), 0, -.75);                     // vendors behind
  ghostAs('queue', st, [0, -1]);
  for (let k=0; k<5; k++) person(P, rnd(-L/2, L/2), 0, rnd(.6, 1.1));                       // shoppers in front
  for (let k=0; k<6; k++){ const x = rnd(-L/2 - .3, L/2 + .3); box(pick([M.crate, M.awn1, M.corrBlue, M.white2, M.red2]), P, x, .12, rnd(-1.0, -.8), .26, .24, .22); }   // crates and tubs
  for (let k=0; k<4; k++) put(U.cyl16, pick([M.awn1, M.corrBlue, M.white2]), under(P, T(rnd(-L/2, L/2), .1, .55, 0, .2, .2, .2)));
  const neon = pick([M.neonPink, M.neonCyan, M.neonAmber]);
  box(M.metalDark, P, 0, 1.85, -.6, 1.1, .26, .04); box(neon, P, 0, 1.85, -.57, .95, .03, .02); box(neon, P, 0, 1.93, -.57, .6, .03, .02); glow(P, 0, 1.88, -.4, NEON_NAME.get(neon), 1.1);   // sign
}
function cafeTable(P, x, z){
  const Q = under(P, T(x, 0, z, rnd(0, TAU)));
  put(U.cyl16, M.white2, under(Q, T(0, .3, 0, 0, .44, .03, .44))); cyl(M.frame, Q, 0, .15, 0, .02, .3);
  for (let k=0; k<2; k++) foodBowl(Q, rnd(-.1, .1), .31, rnd(-.1, .1), .05);
  ghostAs(null);
  for (let k=0; k<3; k++){ const a = k*TAU/3; cyl(pick([M.red2, M.awn2, M.white2]), Q, Math.cos(a)*.34, .1, Math.sin(a)*.34, .06, .2); if (chance(.75)) person(Q, Math.cos(a)*.34, .06, Math.sin(a)*.34);
    if (PERSON_GHOST) spotAt(Q, Math.cos(a)*.34, .2, Math.sin(a)*.34, 'seat', null, [-Math.cos(a), -Math.sin(a)]); }
  if (chance(.6)){ cyl(M.frame, Q, 0, .6, 0, .012, .6); put(U.cone, pick([M.awn1, M.awn2, M.awn3, M.tarp1]), under(Q, T(0, .98, 0, 0, .8, .2, .8))); }
  else { box(M.bulb, Q, 0, .34, 0, .05, .06, .05); glow(Q, 0, .38, 0, 'warm', .5); }
}
// flat water whose normals lean a little, so the wet-ground reflection pass leaves it alone (see the mall pool)
function flatWater(mat, P, y, r){
  const g = new THREE.CircleGeometry(r, 28); g.rotateX(-PI/2);
  const n = g.attributes.normal; for (let k=0; k<n.count; k++) n.setXYZ(k, 0, .84, .54);
  put(g, mat, under(P, T(0, y, 0))); g.dispose();
}
const POND_R = 2.5, POND_Y = .2;
// Every town square is its own: from its seed it picks a centrepiece (the koi pond, a tiered fountain, a sakura
// tree, a bandstand, a little shrine or a clock tower), how its food carts are laid out (a ring, a horseshoe, four
// corner food courts, two food streets or scattered), which sides get the long market stands, the lantern poles,
// the paving pattern and what stands in each corner. SQ_FORCE (for testing) overrides any of these.
const SQ_CENTRES = ['pond', 'fountain', 'sakura', 'bandstand', 'shrine', 'clock'];
let SQ_FORCE = null;
// A new square takes whichever centrepiece the city has fewest of (a random one among those tied), so they come
// round evenly rather than by the luck of the dice; the choice is saved with the square.
function nextSquareCentre(m){
  const n = Object.fromEntries(SQ_CENTRES.map(c => [c, 0]));
  for (const o of megas.values()) if (o !== m && o.kind === 'square'){ const c = o.centre || (o.variant && o.variant.centre); if (c in n) n[c]++; }
  const low = Math.min(...Object.values(n)), pool = SQ_CENTRES.filter(c => n[c] === low);
  return pool[Math.floor(Math.random()*pool.length)];
}
function squareVariant(m){
  const r = mulberry32(hash('square-variant', m.seed)), one = a => a[Math.floor(r()*a.length)];
  const v = { centre: one(SQ_CENTRES), carts: one(['ring', 'horseshoe', 'corners', 'streets', 'scatter']),
    mix: one([[0, 1, 2], [0, 0, 1, 2], [1, 1, 2], [2, 2, 0, 1], [0, 1], [1, 2]]), stands: one(['four', 'four', 'pair', 'three']),
    poles: one(['octagon', 'square']), floor: one(['rings', 'checker', 'spokes', 'diagonal']), tiles: Math.floor(r()*4),
    corners: [0, 1, 2, 3].map(() => one(['planter', 'planter', 'vending', 'tree', 'kiosk'])), open: Math.floor(r()*4)*PI/2, skip: Math.floor(r()*4) };
  if (m.centre && SQ_CENTRES.includes(m.centre)) v.centre = m.centre;   // chosen when it was placed (see nextSquareCentre)
  if (v.carts === 'streets') v.stands = 'pair';   // the food streets run between the stands, not into them
  return Object.assign(v, SQ_FORCE || {});
}
M.fountainWater = toon(0x6fcfe6, { em:0x1e6a86, kind:'trim' });
M.sakura = toon(0xf2a2c4, { em:0x4a1830, kind:'window' }); M.sakura2 = toon(0xffc8dc, { em:0x5a2840, kind:'window' }); M.sakura3 = toon(0xd87aa6, { flat:1 }); M.sakura4 = toon(0xfbe4ee, { flat:1 });
M.sakuraBark = toon(0x4a3430, { flat:1 });
M.shrineRed = toon(0xc8402e); M.shrineRed2 = toon(0x9a2e22); M.shrineDark = toon(0x2e2826); M.shrineRope = toon(0xe8dcb8);
M.clockFace = toon(0xe8e0c8, { em:0x8a7a50, kind:'window' }); M.bandRoof = toon(0x5a4a82); M.bandRoof2 = toon(0x7a3a4a);
// a figure drawn as boxes (performers on the bandstand: always drawn, never real people)
function figure(P, x, y, z, c){ box(c, P, x, y + .11, z, .08, .22, .06); box(M.concDD, P, x, y + .26, z, .055, .06, .055); }
// the round stone base every centrepiece stands on, wide enough to cover the paving it replaces
function centreBase(P){ put(U.cyl16, M.concD, under(P, T(0, .06, 0, 0, 2*(POND_R + .75), .1, 2*(POND_R + .75)))); }
// ---- centrepieces: each returns { mast } (the height lantern strings can run from, or null) and { cross } (strings may cross over it)
function centrePond(P){
  put(U.cyl16, M.concM, under(P, T(0, .12, 0, 0, 2*POND_R + .7, .2, 2*POND_R + .7)));        // stone rim
  put(U.cyl16, M.concD, under(P, T(0, .225, 0, 0, 2*POND_R + .8, .04, 2*POND_R + .8)));
  put(U.cyl16, M.neonCyan, under(P, T(0, .16, 0, 0, 2*POND_R + .74, .03, 2*POND_R + .74)));  // neon band round the rim
  put(U.cyl16, M.wood, under(P, T(0, .1, 0, 0, 2*POND_R + 1.5, .05, 2*POND_R + 1.5)));       // ring bench
  flatWater(M.koiWater, P, POND_Y, POND_R + .05);
  // the koi themselves are an animated sprite sheet laid on the water (see koiFx)
  for (let k=0; k<4; k++){ const a = k*TAU/4 + PI/4, r = POND_R + .45;                        // hologram projectors on the rim
    const Q = under(P, T(Math.cos(a)*r, .25, Math.sin(a)*r, -a));
    box(M.metalDark, Q, 0, .15, 0, .18, .3, .18); box(M.screen, Q, 0, .32, 0, .12, .04, .12); glow(Q, 0, .34, 0, 'cyan', .7); noteLight(Q, 0, .34, 0, 0x4fd8ff); }
  for (let k=0; k<6; k++){ const a = rnd(0, TAU), r = POND_R + .55; plant(pick(['bush','bushFlower','g_fern2']), P, Math.cos(a)*r, .25, Math.sin(a)*r, .7); }
  return { mast: null, cross: true };
}
// a three-tier fountain: water spilling from bowl to bowl into a wide basin, jets arcing in from the rim
function centreFountain(P){
  centreBase(P);
  put(U.cyl16, M.concM, under(P, T(0, .2, 0, 0, 5.8, .3, 5.8)));
  put(U.cyl16, M.concL, under(P, T(0, .36, 0, 0, 6.0, .04, 6.0)));
  put(U.cyl16, M.neonCyan, under(P, T(0, .27, 0, 0, 5.86, .03, 5.86)));
  flatWater(M.koiWater, P, .33, 2.78);
  cyl(M.concM, P, 0, .95, 0, .38, 1.2);
  put(U.cyl16, M.concL, under(P, T(0, 1.5, 0, 0, 2.6, .18, 2.6))); flatWater(M.fountainWater, P, 1.6, 1.18);
  cyl(M.concM, P, 0, 2.05, 0, .2, 1.0);
  put(U.cyl16, M.concL, under(P, T(0, 2.55, 0, 0, 1.3, .14, 1.3))); flatWater(M.fountainWater, P, 2.63, .56);
  cyl(M.concL, P, 0, 2.8, 0, .05, .3); sph(M.neonCyan, P, 0, 3.02, 0, .15); glow(P, 0, 3.02, 0, 'cyan', 1.4); noteLight(P, 0, 3.02, 0, 0x38e8e0);
  for (let k=0; k<14; k++){ const a = k*TAU/14; strut(M.fountainWater, P, Math.cos(a)*.64, 2.6, Math.sin(a)*.64, Math.cos(a)*.78, 1.62, Math.sin(a)*.78, .035); }
  for (let k=0; k<22; k++){ const a = k*TAU/22; strut(M.fountainWater, P, Math.cos(a)*1.28, 1.56, Math.sin(a)*1.28, Math.cos(a)*1.5, .36, Math.sin(a)*1.5, .04); }
  for (let k=0; k<8; k++){ const a = k*TAU/8 + PI/8; let px = Math.cos(a)*2.72, pz = Math.sin(a)*2.72, py = .4;   // jets
    for (let q=1; q<=7; q++){ const u = q/7, r = 2.72 - 1.0*u, y = .4 + 1.25*Math.sin(u*PI)*(1 - .25*u), x = Math.cos(a)*r, z = Math.sin(a)*r; strut(M.fountainWater, P, px, py, pz, x, y, z, .03); px = x; py = y; pz = z; } }
  for (let k=0; k<6; k++){ const a = k*TAU/6; glow(P, Math.cos(a)*2.1, .36, Math.sin(a)*2.1, 'cyan', .8); }
  emitters.push(new THREE.Vector3(0, 2.9, 0).applyMatrix4(P));
  return { mast: 3.15, cross: false };
}
// a sakura tree in a raised planter of grass: a gnarled trunk that splits into crooked limbs, each forking again
// out and a little down, so the crown spreads wide and flat; the blossom sits in loose clumps of small irregular
// puffs at the twig ends (with gaps you can see branches through), in three pinks, lit soft at night. Paper
// lanterns hang from the lower limbs, and petals drift across the grass and the paving.
function sakuraLimb(P, x, y, z, dx, dy, dz, len, th, depth, tips){
  const ex = x + dx*len, ey = y + dy*len, ez = z + dz*len;
  // a slight kink halfway, so no limb is ruler-straight
  const mx = (x + ex)/2 + rnd(-.08, .08)*len, my = (y + ey)/2 + rnd(-.05, .08)*len, mz = (z + ez)/2 + rnd(-.08, .08)*len;
  strut(M.sakuraBark, P, x, y, z, mx, my, mz, th); strut(M.sakuraBark, P, mx, my, mz, ex, ey, ez, th*.85);
  if (depth <= 0){ tips.push([ex, ey, ez, len]); return; }
  const n = depth >= 2 ? irand(2, 3) : irand(2, 4), h = Math.atan2(dz, dx);
  for (let k=0; k<n; k++){
    const a = h + (k - (n - 1)/2)*rnd(.5, .8) + rnd(-.25, .25);
    const up = depth >= 2 ? rnd(.25, .6) : rnd(-.15, .25);                 // the crown flattens out, the twigs droop a touch
    const hl = Math.sqrt(1 - up*up);
    sakuraLimb(P, ex, ey, ez, Math.cos(a)*hl, up, Math.sin(a)*hl, len*rnd(.62, .78), th*.62, depth - 1, tips);
  }
}
function centreSakura(P){
  centreBase(P);
  put(U.cyl16, M.concM, under(P, T(0, .3, 0, 0, 5.6, .5, 5.6)));
  put(U.cyl16, M.neonPink, under(P, T(0, .42, 0, 0, 5.66, .03, 5.66)));
  put(U.cyl16, M.pgMoss, under(P, T(0, .56, 0, 0, 5.3, .04, 5.3)));
  // the planter laid to grass: the same short tufts as a lawn, packed edge to edge (clear round the trunk)
  const gs = .19;
  for (let gx = -2.6; gx <= 2.6; gx += gs) for (let gz = -2.6; gz <= 2.6; gz += gs){
    const x = gx + rnd(-.05, .05), z = gz + rnd(-.05, .05), r = Math.hypot(x, z);
    if (r > 2.58 || r < .38) continue;
    plant('gt0', P, x, .58, z, rnd(.24, .28));
  }
  for (let k=0; k<6; k++){ const a = rnd(0, TAU), r = rnd(1.4, 2.4); plant(pick(['bushFlower', 'g_fern3', 'g_flowers']), P, Math.cos(a)*r, .58, Math.sin(a)*r, rnd(.55, .8)); }
  for (let k=0; k<5; k++){ const a = k*TAU/5 + rnd(-.3, .3), r = rnd(.32, .5); strut(M.sakuraBark, P, 0, .9, 0, Math.cos(a)*(r + .25), .56, Math.sin(a)*(r + .25), .12); }   // roots over the soil
  // the trunk: leaning, twisting a little as it rises, then splitting into three or four limbs
  const lean = rnd(0, TAU), tips = [];
  let px = 0, py = .56, pz = 0;
  for (let k=1; k<=3; k++){ const nx = Math.cos(lean)*.12*k + rnd(-.06, .06), nz = Math.sin(lean)*.12*k + rnd(-.06, .06), ny = .56 + k*.5;
    strut(M.sakuraBark, P, px, py, pz, nx, ny, nz, .42 - k*.05); px = nx; py = ny; pz = nz; }
  const limbs = irand(3, 4), a0 = rnd(0, TAU);
  for (let k=0; k<limbs; k++){
    const a = a0 + k*TAU/limbs + rnd(-.35, .35), up = rnd(.45, .7), hl = Math.sqrt(1 - up*up);
    sakuraLimb(P, px, py, pz, Math.cos(a)*hl, up, Math.sin(a)*hl, rnd(1.0, 1.25), .2, 2, tips);
  }
  // blossom: a loose clump of small puffs round each twig end, a few strays hanging below
  const shades = [M.sakura, M.sakura2, M.sakura3, M.sakura4];
  for (const [ex, ey, ez] of tips){
    const n = irand(8, 12), base = pick(shades);
    for (let q=0; q<n; q++) blob(chance(.6) ? base : pick(shades), P, ex + rnd(-.42, .42), ey + rnd(-.18, .22), ez + rnd(-.42, .42), rnd(.13, .24), .7);
    if (chance(.5)) blob(pick(shades), P, ex + rnd(-.3, .3), ey - rnd(.25, .45), ez + rnd(-.3, .3), rnd(.08, .13), 1.1);
  }
  tips.forEach(([ex, ey, ez], k) => { if (k % 4 === 0) glow(P, ex, ey + .1, ez, 'pink', 1.1); });
  // lanterns from the lower twigs
  tips.slice().sort((a, b) => a[1] - b[1]).slice(0, 4).forEach(([ex, ey, ez]) => {
    cyl(M.frame, P, ex, ey - .3, ez, .006, .5); box(M.lantern, P, ex, ey - .62, ez, .15, .2, .15); glow(P, ex, ey - .62, ez, 'amber', .8); noteLight(P, ex, ey - .62, ez, 0xff8a3a); });
  // petals, on the grass and blown out across the paving
  for (let k=0; k<56; k++){ const a = rnd(0, TAU), r = rnd(.6, 6.0), x = Math.cos(a)*r, z = Math.sin(a)*r; box(pick([M.sakura2, M.sakura3]), P, x, r < 2.6 ? .62 : .065, z, .06, .012, .05, rnd(0, PI)); }
  return { mast: null, cross: false };
}
// a round bandstand: a stage under a conical roof on slim posts, a band playing, a big screen behind them
function centreBandstand(P){
  centreBase(P);
  put(U.cyl16, M.concM, under(P, T(0, .32, 0, 0, 5.6, .5, 5.6)));
  put(U.cyl16, M.wood, under(P, T(0, .58, 0, 0, 5.4, .03, 5.4)));
  put(U.cyl16, M4.neonPurple, under(P, T(0, .45, 0, 0, 5.66, .04, 5.66)));
  for (let k=0; k<3; k++) box(M.concL, P, 0, (k + 1)*.095, 2.85 + (2 - k)*.26, 1.8, (k + 1)*.19, .28);   // steps up at the front
  const top = 3.4;
  for (let k=0; k<8; k++){ const a = k*TAU/8 + PI/8, x = Math.cos(a)*2.55, z = Math.sin(a)*2.55;
    cyl(M.metalDark, P, x, .57 + (top - .57)/2, z, .06, top - .57);
    box(M.bulb, P, x*.92, top - .15, z*.92, .1, .1, .1); glow(P, x*.9, top - .2, z*.9, pick(['pink', 'cyan', 'amber']), 1.0); }
  put(U.cone, pick([M.bandRoof, M.bandRoof2, M.metalDark]), under(P, T(0, top + .5, 0, PI/8, 6.5, 1.0, 6.5)));
  for (let k=0; k<32; k++){ const a = k*TAU/32; box(M.neonPink, P, Math.cos(a)*3.22, top + .02, Math.sin(a)*3.22, .64, .05, .05, -a + PI/2); }
  glow(P, 0, top, 3.2, 'pink', 1.6); glow(P, 0, top, -3.2, 'pink', 1.6);
  cyl(M.metal, P, 0, top + 1.15, 0, .04, .4); sph(M.neonCyan, P, 0, top + 1.38, 0, .1); glow(P, 0, top + 1.38, 0, 'cyan', 1.0);
  // the band, the gear and a screen at the back
  for (const s of [-1, 1]){ box(M.frame, P, s*1.9, 1.05, -1.1, .5, .95, .45); for (const y of [.8, 1.25]) put(U.cyl16, M.metalDark, under(P, T(s*1.9, y, -.87, 0, .3, .02, .3, PI/2))); }
  box(M.metalDark, P, 0, .97, -1.55, 1.3, .8, .55); box(M.screen, P, 0, 1.2, -1.27, 1.1, .2, .01); box(M.neonCyan, P, 0, .65, -1.27, 1.2, .03, .01);
  box(M.metalDark, P, 0, 2.3, -2.45, 2.6, 1.5, .08); box(pick([M.screen, M.screen2]), P, 0, 2.3, -2.4, 2.4, 1.3, .02); glow(P, 0, 2.3, -2.2, 'platinum', 1.6);
  cyl(M.frame, P, 0, .85, .55, .012, .55); figure(P, 0, .57, .4, M.awn1);
  figure(P, -.85, .57, -.25, M.cloth3); box(M.wood, P, -.82, .82, -.15, .25, .07, .05, 0, 0, .6);
  figure(P, .9, .57, -.3, M.cloth4); box(M.metalDark, P, .9, .78, -.1, .45, .05, .18);
  return { mast: top + 1.2, cross: false };
}
// a little shrine: a hall with a dark gabled roof on a stone platform, a red torii in front, stone lanterns and pines
function centreShrine(P){
  centreBase(P);
  box(M.pgRock, P, 0, .2, -.3, 4.0, .3, 3.4); box(M.pgRock2, P, 0, .37, -.75, 3.0, .04, 2.0);
  const fy = .39, hz = -1.1;
  box(M.shrineDark, P, 0, fy + .06, hz, 2.2, .12, 1.6);
  for (const [sx, sz] of CORNERS) cyl(M.shrineRed, P, sx*.95, fy + .65, hz + sz*.65, .06, 1.2);
  box(M.wood, P, 0, fy + .62, hz - .7, 1.9, 1.1, .06); for (const s of [-1, 1]) box(M.wood, P, s*.97, fy + .62, hz, .06, 1.1, 1.3);
  box(M.shrineRed2, P, 0, fy + 1.27, hz, 2.15, .12, 1.5);
  for (const s of [-1, 1]) box(M.shrineDark, P, 0, fy + 1.62, hz + s*.48, 2.9, .09, 1.25, 0, s*.5);
  box(M.shrineDark, P, 0, fy + 1.9, hz, 3.0, .12, .14);
  box(M.wood, P, 0, fy + .3, hz - .35, .9, .5, .4); box(M.bulb, P, 0, fy + .65, hz - .35, .14, .18, .14); glow(P, 0, fy + .7, hz - .3, 'warm', 1.0);
  box(M.shrineRope, P, 0, fy + 1.15, hz + .78, 1.8, .06, .06);
  for (const s of [-1, 1]){ box(M.lantern, P, s*.8, fy + .95, hz + .82, .16, .24, .16); glow(P, s*.8, fy + .95, hz + .9, 'amber', .8); noteLight(P, s*.8, fy + .95, hz + .82, 0xff8a3a); }
  for (const [z, k] of [[1.95, 1], [2.85, .78]]){   // two torii, the far one smaller
    for (const s of [-1, 1]) cyl(M.shrineRed, P, s*1.0*k, .9*k, z, .09*k, 1.8*k);
    box(M.shrineRed, P, 0, 1.45*k, z, 2.4*k, .12*k, .14*k); box(M.shrineRed, P, 0, 1.72*k, z, 2.7*k, .1*k, .16*k);
    box(M.shrineDark, P, 0, 1.83*k, z, 3.0*k, .1*k, .2*k); box(M.shrineRed, P, 0, 1.58*k, z, .14*k, .26*k, .1*k);
    box(M.neonAmber, P, 0, 1.9*k, z + .1*k, 2.8*k, .03, .02); glow(P, 0, 1.9*k, z + .3, 'amber', 1.0*k);
  }
  for (let k=0; k<5; k++) box(M.pgRock2, P, rnd(-.06, .06), .37, 1.3 - k*.38, .5, .03, .3);   // stepping stones to the hall
  for (const s of [-1, 1]){ pgLantern(P, s*1.45, .35, .5, 1.1); pgLantern(P, s*1.45, .35, -.6, 1.1); pgPine(P, s*1.6, .35, -1.75, 1.0); }
  cyl(M.metalDark, P, 0, .5, .55, .16, .3); emitters.push(new THREE.Vector3(0, .75, .55).applyMatrix4(P));   // incense burner
  return { mast: null, cross: false };
}
// a clock tower: a slim stone shaft with neon corners, four lit clock faces at the top, a beacon on the spire
function centreClock(P){
  centreBase(P);
  put(U.cyl16, M.concM, under(P, T(0, .18, 0, 0, 5.0, .24, 5.0))); put(U.cyl16, M.concL, under(P, T(0, .4, 0, 0, 3.6, .2, 3.6)));
  for (let k=0; k<8; k++){ const a = k*TAU/8; box(M.wood, P, Math.cos(a)*2.15, .38, Math.sin(a)*2.15, .7, .06, .26, -a + PI/2); }
  const neon = pick([[M.neonCyan, 'cyan'], [M.neonPink, 'pink'], [M.neonAmber, 'amber']]);
  box(M.concL, P, 0, 3.1, 0, 1.3, 5.2, 1.3);
  for (const [sx, sz] of CORNERS){ box(M.metalDark, P, sx*.62, 3.1, sz*.62, .16, 5.2, .16); box(neon[0], P, sx*.71, 3.1, sz*.71, .03, 5.0, .03); }
  for (const y of [1.6, 3.2]) box(M.metalDark, P, 0, y, 0, 1.42, .1, 1.42);
  box(M.concM, P, 0, 6.3, 0, 1.7, 1.2, 1.7);
  for (let f=0; f<4; f++){ const Q = under(P, T(0, 6.3, 0, f*PI/2));
    put(U.cyl16, M.clockFace, under(Q, T(0, 0, .86, 0, .95, .04, .95, PI/2)));
    box(M.frame, Q, 0, .12, .89, .05, .3, .02); box(M.frame, Q, .1, -.03, .89, .24, .05, .02, 0, 0, .5); glow(Q, 0, 0, 1.0, 'warm', 1.1); }
  for (const s of [-1, 1]){ box(neon[0], P, 0, 4.4, s*.67, .9, .22, .02); glow(P, 0, 4.4, s*.85, neon[1], 1.2); }
  put(U.cone, M.metalDark, under(P, T(0, 7.35, 0, PI/4, 2.3, .9, 2.3)));
  cyl(M.metal, P, 0, 8.05, 0, .04, .6); beaconLight(P, 0, 8.4, 0);
  for (const [sx, sz] of CORNERS) glow(P, sx*.75, 1.0, sz*.75, neon[1], .9);
  return { mast: 6.9, cross: false };
}
const SQ_CENTRE_FN = { pond: centrePond, fountain: centreFountain, sakura: centreSakura, bandstand: centreBandstand, shrine: centreShrine, clock: centreClock };
// ---- where the food carts go: [x, z, fx, fz] (position, and the way the counter faces)
function squareCarts(v){
  const out = [], toCentre = (x, z) => { const l = Math.hypot(x, z) || 1; return [-x/l, -z/l]; };
  if (v.carts === 'ring') for (let k=0; k<10; k++){ const a = k*TAU/10 + PI/10 + rnd(-.08, .08), r = 5.0 + (k % 2)*.5, x = Math.cos(a)*r, z = Math.sin(a)*r; out.push([x, z, ...toCentre(x, z)]); }
  else if (v.carts === 'horseshoe') for (let k=0; k<9; k++){ const a = v.open + .75 + k*(TAU - 1.5)/8, x = Math.cos(a)*5.35, z = Math.sin(a)*5.35; out.push([x, z, ...toCentre(x, z)]); }
  else if (v.carts === 'corners') for (let q=0; q<4; q++){ const a = PI/4 + q*PI/2, bx = Math.cos(a)*6.0, bz = Math.sin(a)*6.0, tx = -Math.sin(a), tz = Math.cos(a);
    for (const o of [-1.75, 0, 1.75]){ const x = bx + tx*o, z = bz + tz*o; out.push([x, z, ...toCentre(x, z)]); } }
  else if (v.carts === 'streets') for (const s of [-1, 1]) for (const x of [-6, -3, 0, 3, 6]) out.push([x + rnd(-.15, .15), s*5.35, 0, -s]);
  else { for (let tries = 0; tries < 300 && out.length < 10; tries++){
      const a = rnd(0, TAU), r = rnd(4.7, 6.4), x = Math.cos(a)*r, z = Math.sin(a)*r;
      if (out.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 2.2)) continue;
      if (standNear(v, x, z, 2.4)) continue;
      const [fx, fz] = toCentre(x, z), j = rnd(-.5, .5); out.push([x, z, fx*Math.cos(j) - fz*Math.sin(j), fx*Math.sin(j) + fz*Math.cos(j)]); } }
  return out;
}
// the sides that get a long market stand (angles round the square)
function squareStandSides(v){
  const all = [0, PI/2, PI, -PI/2];
  if (v.stands === 'pair') return v.carts === 'streets' ? [0, PI] : [all[v.skip % 2], all[v.skip % 2 + 2]];
  if (v.stands === 'three') return all.filter((_, k) => k !== v.skip);
  return all;
}
function standNear(v, x, z, pad){ return squareStandSides(v).some(a => { const sx = Math.cos(a)*7.75, sz = Math.sin(a)*7.75; return Math.abs(a % PI) < .1 ? Math.abs(x - sx) < pad && Math.abs(z) < 1.6 + pad*.4 : Math.abs(z - sz) < pad && Math.abs(x) < 1.6 + pad*.4; }); }
// what stands in each corner
function squareCorner(Q, kind){
  if (kind === 'vending'){ box(M.concM, Q, 0, .05, 0, 1.0, .1, .8);
    for (const s of [-1, 1]){ box(pick([M.corrBlue, M.red2, M.white2, M.awn2]), Q, s*.24, .62, 0, .44, 1.15, .5); box(pick([M.screen, M.screen2]), Q, s*.24, .75, .26, .34, .55, .01); box(M.bulb, Q, s*.24, .3, .26, .3, .08, .01); }
    glow(Q, 0, .8, .5, pick(['cyan', 'pink']), 1.1); return; }
  if (kind === 'tree'){ put(U.cyl16, M.concM, under(Q, T(0, .25, 0, 0, 1.3, .5, 1.3))); put(U.cyl16, M.pgMoss, under(Q, T(0, .51, 0, 0, 1.2, .03, 1.2))); pgPine(Q, 0, .5, 0, 1.6); return; }
  if (kind === 'kiosk'){ box(M.concM, Q, 0, .05, 0, .8, .1, .8); cyl(M.metalDark, Q, 0, .6, 0, .06, 1.1); box(M.metalDark, Q, 0, 1.25, 0, .7, .5, .08);
    box(M.screen, Q, 0, 1.25, .05, .62, .42, .01); box(M.screen2, Q, 0, 1.25, -.05, .62, .42, .01); glow(Q, 0, 1.25, .2, 'cyan', 1.0); return; }
  box(M.concM, Q, 0, .2, 0, .9, .4, .9); plant(pick(['bonsai','bamboo']), Q, 0, .4, 0, 1.2); plant('bushFlower', Q, .25, .4, .25, .8);
}
function buildTownSquare(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const v = squareVariant(m); m.variant = v;
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), S5 = 5*LOT, H = S5/2;
  reflectLights = [];
  PERSON_GHOST = { kind: null };
  box(G.asph, P, 0, .012, 0, S5, .025, S5);
  // the paving: rings, a checkerboard, spokes or diagonal bands, in one of four pairings of tile colours
  const n = 25, st = S5/n, tl = TILES.low, tm = TILES.mid, tv = v.tiles;
  for (let a=0;a<n;a++) for (let b=0;b<n;b++){
    const x = (a-(n-1)/2)*st, z = (b-(n-1)/2)*st, r = Math.hypot(x, z);
    if (r < POND_R + .5) continue;
    const band = v.floor === 'rings' ? Math.floor(r/1.5) % 2 : v.floor === 'checker' ? (Math.floor(a/2) + Math.floor(b/2)) % 2
               : v.floor === 'spokes' ? Math.floor((Math.atan2(z, x) + PI)/(TAU/16)) % 2 : ((Math.floor((x + z)/1.6) % 2) + 2) % 2;
    const mat = band ? tm[(tv + (a + b) % 2) % tm.length] : tl[(tv + a*3 + b) % tl.length];
    if (!chance(.02)) box(mat, P, x, .03, z, st - .04, .045, st - .04);
  }
  if (v.floor === 'rings' || v.floor === 'spokes') for (const r of [POND_R + 1.4, 6.6]) for (let k=0; k<48; k++){ const a = k*TAU/48; box(M.concL, P, Math.cos(a)*r, .058, Math.sin(a)*r, .5, .012, .08, -a + PI/2); }
  // ---- the centrepiece
  const cen = SQ_CENTRE_FN[v.centre](P);
  // ---- lantern poles round the square, strung between each other (across the middle over a pond, or down from a tall centrepiece)
  const poles = [];
  if (v.poles === 'octagon') for (let k=0; k<8; k++){ const a = k*TAU/8 + PI/8, r = 7.9; poles.push([Math.cos(a)*r, Math.sin(a)*r]); }
  else for (const [x, z] of [[7.4, 7.4], [7.4, 3.8], [7.4, -3.8], [7.4, -7.4], [3.8, -7.4], [-3.8, -7.4], [-7.4, -7.4], [-7.4, -3.8], [-7.4, 3.8], [-7.4, 7.4], [-3.8, 7.4], [3.8, 7.4]]) poles.push([x, z]);
  for (const [x, z] of poles){ cyl(M.metalDark, P, x, 1.6, z, .05, 3.2); box(M.lantern2, P, x, 3.26, z, .14, .14, .14); glow(P, x, 3.26, z, 'warm', 1.0); noteLight(P, x, 3.26, z, 0xffcf7a); }
  const np = poles.length;
  if (cen.cross) for (let k=0; k<np/2; k++){ const [ax, az] = poles[k], [bx, bz] = poles[k + np/2]; lanternString(P, ax, 3.1, az, bx, 3.1, bz, .9); }
  else if (cen.mast) for (let k=0; k<np; k += np > 8 ? 3 : 2){ const [bx, bz] = poles[k]; lanternString(P, 0, cen.mast, 0, bx, 3.1, bz, .35); }
  for (let k=0; k<np; k++){ const [ax, az] = poles[k], [bx, bz] = poles[(k+1)%np]; lanternString(P, ax, 3.0, az, bx, 3.0, bz, .4); }
  // ---- market stands along some of the sides, between the poles, facing in
  squareStandSides(v).forEach((a, k) => { const r = 7.75; ghostAs(null, 100 + k); marketStand(under(P, T(Math.cos(a)*r, .05, Math.sin(a)*r, -a - PI/2))); });
  // ---- the food carts, bigger than life so the food reads
  const carts = squareCarts(v), CS = 1.45;
  carts.forEach(([x, z, fx, fz], k) => {
    const Q = under(P, T(x, .05, z, Math.atan2(fx, fz) + rnd(-.12, .12))), Qs = under(Q, T(0, 0, 0, 0, CS, CS, CS));
    const r = v.mix[k % v.mix.length];
    if (r === 0) menuCart(Qs, pick([M.neonPink, M.neonCyan, M4.neonPurple]));
    else if (r === 1) hawkerStall(Qs);
    else foodTruck(Qs, pick([M.neonPink, M.neonCyan, M.neonAmber]));
    ghostAs('queue', k, 'origin');
    for (let q=0; q<irand(2, 5); q++) person(Q, rnd(-.7, .7), 0, rnd(.9, 1.6));             // a queue
    // where the stall keeper stands: behind the cart, or at the end of the food truck's counter
    spotAt(Q, r === 2 ? -1.45 : 0, 0, r === 2 ? .62 : -.85, 'vendor', k, r === 2 ? [1, .4] : [0, 1]);
    if (r !== 2) for (const x2 of [-.45, .45]) spotAt(Q, x2, 0, 1.0, 'queue', k, 'origin');      // room to queue even where the dice gave few
  });
  for (let k=0; k<26; k++){
    const a = rnd(0, TAU), r = rnd(3.8, 7.0), x = Math.cos(a)*r, z = Math.sin(a)*r;
    if (carts.some(([cx, cz]) => Math.hypot(cx - x, cz - z) < 1.7)) continue;
    if (standNear(v, x, z, 1.4)) continue;
    if (poles.some(([px, pz]) => Math.hypot(px - x, pz - z) < .6)) continue;
    cafeTable(P, x, z);
  }
  ghostAs('stand', null, [0, 1]);
  for (let k=0; k<70; k++){ const a = rnd(0, TAU), r = rnd(POND_R + .9, 9); const x = Math.cos(a)*r, z = Math.sin(a)*r;   // the crowd, some in little groups
    person(P, x, .05, z); if (chance(.4)) person(P, x + rnd(-.15, .15), .05, z + rnd(.1, .18)); }
  PERSON_GHOST = null;
  CORNERS.forEach(([sx, sz], k) => squareCorner(under(P, T(sx*(H - .7), 0, sz*(H - .7), Math.atan2(-sx, -sz))), v.corners[k]));
  // the koi pond reflects the lights nearest it (the shader handles up to 16)
  if (v.centre === 'pond'){
    const near = reflectLights.map(l => [Math.hypot(l[0] - m.x, l[2] - m.z), l]).filter(([d]) => d < POND_R + 4).sort((a, b) => a[0] - b[0]).slice(0, 16).map(([, l]) => l);
    m.pond = { x: m.x, z: m.z, y: POND_Y + .06, r: POND_R, lights: near };
  } else m.pond = null;
  reflectLights = null;
  m.roofH = CURB + .1;
  m.top = v.centre === 'clock' ? 9 : 5;
}
// The holographic koi: a 10-frame neon line-art sheet (assets/sprites/koi_neon.png, 100x139 per frame) projected
// onto the pond. The frames don't flow smoothly into each other, so the projection is made to look faulty on purpose:
// each frame holds for a beat, and every change comes through a glitch (rows tearing sideways, colour channels
// splitting, half the image showing the previous frame, a flicker), with smaller stray glitches in between and
// faint scanlines all the time. Everything snaps to whole sprite pixels so it stays pixel art.
const KOI_FRAMES = 10, KOI_W = 100, KOI_H = 139;
let koiTex = null;
const _kd = new THREE.Vector3();
const KOI_SHADER = {
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D map; uniform float frame, prevFrame, glitch, seed, time;
    varying vec2 vUv;
    const float NF = ${KOI_FRAMES}.0; const vec2 SZ = vec2(${KOI_W}.0, ${KOI_H}.0);
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
    vec4 tap(vec2 uv, float f){
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
      uv = (floor(uv*SZ) + .5)/SZ;
      return texture2D(map, vec2((f + uv.x)/NF, uv.y));
    }
    void main(){
      vec2 uv = vUv;
      float row = floor(uv.y*SZ.y), band = floor(uv.y*18.0), g = glitch;
      float hb = h(vec2(band, seed));
      // rows tearing sideways in bands, by whole pixels
      if (hb < g*.6) uv.x += floor((h(vec2(band, seed + 7.0)) - .5)*g*22.0)/SZ.x;
      // some bands still show the previous frame
      float f = (h(vec2(band, seed + 3.0)) < g*.45) ? prevFrame : frame;
      // colour channels split apart
      float dx = floor(g*3.0 + .5)/SZ.x;
      vec4 c = tap(uv, f), cr = tap(uv + vec2(dx, 0.0), f), cb = tap(uv - vec2(dx, 0.0), f);
      float a = max(c.a, max(cr.a, cb.a));
      if (a < .5) discard;
      vec3 col = vec3(cr.a > .5 ? cr.r : c.r*.4, c.a > .5 ? c.g : .0, cb.a > .5 ? cb.b : c.b*.4);
      if (c.a < .5) col *= .8;
      col *= 1.0 - .22*mod(row, 2.0);                           // scanlines
      col *= 1.0 - g*.55*step(.6, h(vec2(floor(time*40.0), seed)));   // flicker
      gl_FragColor = vec4(col*1.15, 1.0);
    }`,
};
function koiFx(m){
  if (!koiTex){
    koiTex = new THREE.TextureLoader().load('assets/sprites/koi_neon.png');
    koiTex.magFilter = koiTex.minFilter = THREE.NearestFilter; koiTex.generateMipmaps = false;
  }
  const p = m.pond; if (!p) return null;   // only the squares with the koi pond
  const u = { map: { value: koiTex }, frame: { value: 0 }, prevFrame: { value: 0 }, glitch: { value: 0 }, seed: { value: 0 }, time: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: KOI_SHADER.vertexShader, fragmentShader: KOI_SHADER.fragmentShader });
  // sized so the whole frame, leaping koi included, sits inside the pond
  const ph = 2*p.r*.88, pw = ph*KOI_W/KOI_H, koiOff = 0;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
  plane.rotation.x = -PI/2; plane.position.set(p.x, p.y + .03, p.z - koiOff);
  plane.layers.set(1); plane.renderOrder = 3; scene.add(plane);
  // the water under the projection: deep blue, lighter toward the middle, with slow drifting shimmer bands and a
  // darker edge where it meets the stone, all in whole pond pixels
  // The water reflects the hologram and the lights round it, all inside its own shader (no extra render pass):
  // the koi's current frame is sampled a few times, blurred and rippled, so their colours spill into the water;
  // each nearby light is mirrored through the water surface on the CPU (cheap: a few dozen numbers a frame) and
  // drawn as a short wobbling streak of its own colour, stretched toward the viewer like a real reflection.
  const NL = 16, lightPos = [], lightCol = [];
  for (let k=0; k<NL; k++){ lightPos.push(new THREE.Vector3(0, 0, 0)); lightCol.push(new THREE.Vector3(0, 0, 0)); }
  const wu = { time: u.time, map: u.map, frame: u.frame, glitch: u.glitch, lp: { value: lightPos }, lc: { value: lightCol },
               streak: { value: new THREE.Vector2(0, 1) }, night: comp.uniforms.night,
               koiBox: { value: new THREE.Vector4(pw, ph, koiOff, 0) } };
  const wmat = new THREE.ShaderMaterial({ uniforms: wu,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, frame, glitch, night; uniform sampler2D map; uniform vec3 lp[${NL}], lc[${NL}]; uniform vec2 streak; uniform vec4 koiBox;
      varying vec2 vP;
      const float NF = ${KOI_FRAMES}.0; const vec2 SZ = vec2(${KOI_W}.0, ${KOI_H}.0);
      float koiA(vec2 uv){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0; return texture2D(map, vec2((frame + uv.x)/NF, uv.y)).a; }
      vec3 koiC(vec2 uv){ uv = clamp(uv, 0.0, 1.0); vec4 t = texture2D(map, vec2((frame + uv.x)/NF, uv.y)); return t.rgb*t.a; }
      void main(){
        vec2 q = floor(vP*14.0)/14.0; float r = length(q)/${(POND_R + .05).toFixed(2)};
        vec3 deep = vec3(.05, .22, .40), mid = vec3(.10, .46, .68);
        vec3 col = mix(mid, deep, smoothstep(.15, 1.0, r));
        float s = sin(q.x*3.1 + time*.7) + sin(q.y*2.6 - time*.55) + sin((q.x + q.y)*2.2 + time*.4);
        col += vec3(.05, .12, .15)*step(1.9, s);
        // the hologram's light in the water: a soft, rippling halo of its colours
        vec2 kuv = vec2(q.x/koiBox.x + .5, (q.y - koiBox.z)/koiBox.y + .5);
        kuv.x += sin(q.y*9.0 + time*2.0)*.012;
        vec3 halo = vec3(0.0); float tex = 2.5/SZ.x;
        halo += koiC(kuv + vec2(tex, 0.0)) + koiC(kuv - vec2(tex, 0.0)) + koiC(kuv + vec2(0.0, tex)) + koiC(kuv - vec2(0.0, tex));
        col += halo*.22*(1.0 + glitch);
        // lights overhead, mirrored in the surface: short streaks stretched toward the viewer, wobbling with the ripples
        vec2 side = vec2(-streak.y, streak.x);
        for (int i=0; i<${NL}; i++){
          vec2 d = q - lp[i].xy; d.x += sin(q.y*12.0 + time*3.0 + float(i))*.04;
          float along = dot(d, streak), across = dot(d, side);
          float g = exp(-across*across*45.0)*exp(-along*along*1.1)*lp[i].z;
          g = floor(g*4.0 + .5)/4.0;                               // stepped, to stay pixel art
          col += lc[i]*g*(.35 + .65*night)*1.3;
        }
        col *= 1.0 - .45*smoothstep(.86, 1.0, r);
        gl_FragColor = vec4(col, 1.0);
      }` });
  const water = new THREE.Mesh(new THREE.CircleGeometry(p.r + .05, 40), wmat);
  water.rotation.x = -PI/2; water.position.set(p.x, p.y + .012, p.z);
  water.layers.set(1); water.renderOrder = 2; scene.add(water);
  let hold = 0, burst = 0, stray = 2 + Math.random()*3;
  return {
    update(dt, time){
      u.time.value = time;
      // mirror each light through the water: the reflection of a light h above the surface sits where the view ray
      // to the point h below it crosses the surface
      cam.getWorldDirection(_kd);
      const sy = Math.max(.05, -_kd.y);
      const L = p.lights || [];
      for (let k=0; k<16; k++){
        const l = L[k];
        if (!l){ wu.lp.value[k].set(0, 0, 0); continue; }
        const h = l[1] - (p.y + .012), sc = h/sy;
        const x = l[0] - _kd.x*sc - p.x, z = l[2] - _kd.z*sc - p.z;
        wu.lp.value[k].set(x, -z, h > 0 ? 1 : 0); wu.lc.value[k].set(l[3], l[4], l[5]);
      }
      const hl = Math.hypot(_kd.x, _kd.z) || 1;
      wu.streak.value.set(_kd.x/hl, -_kd.z/hl);
      hold -= dt; stray -= dt;
      if (hold <= 0){                                              // next frame, through a glitch
        u.prevFrame.value = u.frame.value;
        u.frame.value = (u.frame.value + 1) % KOI_FRAMES;
        hold = .28 + Math.random()*.32;
        burst = .16 + Math.random()*.1;
      }
      if (stray <= 0){ burst = Math.max(burst, .1 + Math.random()*.15); stray = 2 + Math.random()*4; }   // the odd glitch between changes
      burst = Math.max(0, burst - dt);
      u.glitch.value = burst > 0 ? Math.min(1, burst*6)*(.6 + .4*Math.random()) : 0;
      if (burst > 0 && Math.random() < .5) u.seed.value = Math.floor(Math.random()*997);   // the tear pattern jumps around while it glitches
    },
    dispose(){ scene.remove(plane, water); plane.geometry.dispose(); mat.dispose(); water.geometry.dispose(); wmat.dispose(); }
  };
}

/* ---------- the foundry ---------- */
// A tall, brooding steel works on a 6x4 block, after the reference: stacked green-grey blocks clad in corrugated
// panels and stained with rust, a rounded-roof hall, a fat smokestack wrapped in scaffolding, a taller chimney, a
// tank tower ringed in light, and pipes looping over everything. The light is orange and comes from below the
// ledges (glowing strips tucked under each overhang), a vertical strip up the tall block, the loading dock and a
// few warm windows, with one cold blue tube for contrast. Steam rises off the stacks.
// the body uses the industrial district's own colours: green-grey painted metal, weathered concrete, darker trim
M.fSteel = toon(0x6a7066); M.fSteel2 = toon(0x7d858e); M.fSteel3 = toon(0x4a524d); M.fRust = toon(0x8A4A2A); M.fRib = toon(0x555c57);
M.fGlow = toon(0x5a2a10, { em:0xd84a08, kind:'neon' }); M.fGlow2 = toon(0x5a3410, { em:0xe0640e, kind:'neon' });   // deep orange: the emissive boost at night pushes paler oranges to yellow
M.fBlue = toon(0x10283a, { em:0x7fd0ff, kind:'neon' });
M.fWin = toon(0x4a2e18, { em:0xff7a2a, kind:'window' });
// the four faces of a block centred at (cx, cz) of size w x d, each as a transform whose +z faces out
function blockFaces(P, cx, cz, w, d){
  return [[under(P, T(cx, 0, cz + d/2, 0)), w], [under(P, T(cx, 0, cz - d/2, PI)), w], [under(P, T(cx + w/2, 0, cz, PI/2)), d], [under(P, T(cx - w/2, 0, cz, -PI/2)), d]];
}
// a clad block: body, corrugated ribs, rust streaks, a ledge with a glowing strip tucked under it
function fBlock(P, cx, cz, w, d, y0, h, mat, opts = {}){
  box(mat, P, cx, y0 + h/2, cz, w, h, d);
  for (const [F, len] of blockFaces(P, cx, cz, w, d)){
    for (let t = -len/2 + .25; t < len/2 - .1; t += .32) box(M.fRib, F, t, y0 + h/2, .02, .05, h - .1, .04);    // corrugation
    for (let k=0; k<Math.round(len/2.2); k++) box(M.fRust, F, rnd(-len/2 + .3, len/2 - .3), y0 + rnd(.3, h*.6), .035, rnd(.12, .3), rnd(.5, 1.6), .02);   // rust streaks
    if (opts.windows) for (let y = y0 + .9; y < y0 + h - .5; y += 1.1) for (let t = -len/2 + .6; t < len/2 - .4; t += .9)
      if (chance(.55)) box(chance(.25) ? M.fWin : M.glassDark, F, t, y, .04, .3, .4, .03);
  }
  // the ledge on top, and the orange strip under it: the signature light of the reference
  box(M.fSteel3, P, cx, y0 + h + .08, cz, w + .5, .16, d + .5);
  // nature taking the old works back: vines spilling down from every ledge, moss and ferns along it
  for (const [F, len] of blockFaces(P, cx, cz, w + .5, d + .5)){
    for (let t = -len/2 + .3; t < len/2 - .2; t += rnd(.45, .9)){
      if (chance(.55)) plant(pick(['vines','pothos','h_ivy','h_vine3','h_curtain1','h_curtain2','l_mossroots']), F, t, y0 + h + .1, .03, rnd(.9, 1.3), 't', true);
      if (chance(.4)) plant(pick(['moss','g_moss2','g_fern2','bush','g_cover']), F, t, y0 + h + .16, -.15, rnd(.7, .95));
    }
  }
  for (let k=0; k<Math.round(w*d/5); k++) plant(pick(['g_spread1','g_spread2','g_fern3','moss','bush','bushFlower','g_clover']), P, cx + rnd(-w/2 + .3, w/2 - .3), y0 + h + .16, cz + rnd(-d/2 + .3, d/2 - .3), rnd(.8, 1.1));   // roof garden gone wild
  if (opts.glow !== false) for (const [F, len] of blockFaces(P, cx, cz, w + .5, d + .5)){
    if (chance(opts.glowOdds ?? .75)){
      box(M.fGlow, F, 0, y0 + h - .02, -.08, len - .4, .05, .06);
      for (let t = -len/2 + .8; t < len/2 - .4; t += 1.6) glow(F, t, y0 + h - .2, .1, 'orange', 1.3);
    }
  }
}
function fPipe(P, ax, ay, az, bx, by, bz, r = .12, mat = M.fSteel2){ strut(mat, P, ax, ay, az, bx, by, bz, r*2); }
// a big round stack: shaft, collars, cap, a ladder, and steam
function fStack(P, x, z, r, h, opts = {}){
  put(U.cyl16, M.fSteel, under(P, T(x, CURB + h/2, z, 0, 2*r, h, 2*r)));
  for (let y = 1.2; y < h - .3; y += opts.collar || 2.4) put(U.cyl16, chance(.3) ? M.fRust : M.fSteel3, under(P, T(x, CURB + y, z, 0, 2*r + .2, .22, 2*r + .2)));
  put(U.cyl16, M.fSteel3, under(P, T(x, CURB + h + .2, z, 0, 2*r + .35, .4, 2*r + .35)));            // the lipped top
  put(U.cyl16, M.concDD, under(P, T(x, CURB + h + .3, z, 0, 2*r - .1, .22, 2*r - .1)));
  for (const y of opts.lit || []){ put(U.cyl16, M.fGlow, under(P, T(x, CURB + y, z, 0, 2*r + .24, .08, 2*r + .24))); glow(P, x + r + .15, CURB + y, z, 'orange', 1.4); glow(P, x - r - .15, CURB + y, z, 'orange', 1.4); }
  for (let y = .3; y < h - .4; y += .3) box(M.frame, P, x, CURB + y, z + r + .1, .3, .03, .03);       // ladder rungs
  box(M.frame, P, x - .15, CURB + h/2, z + r + .1, .03, h, .03); box(M.frame, P, x + .15, CURB + h/2, z + r + .1, .03, h, .03);
  emitters.push(new THREE.Vector3(x, CURB + h + .4, z).applyMatrix4(P));
  for (let k=0; k<Math.round(h/2.5); k++){                                   // ivy hanging off the collars
    const a = rnd(0, TAU), y = rnd(1.2, h*.75), F = under(P, T(x + Math.sin(a)*(r + .1), 0, z + Math.cos(a)*(r + .1), a));
    plant(pick(['h_ivy','vines','pothos','l_mossroots']), F, 0, CURB + y, .02, rnd(.9, 1.2), 't', true);
  }
  for (let k=0; k<4; k++){ const a = rnd(0, TAU); plant(pick(['bush','g_fern3','g_spread2']), P, x + Math.sin(a)*(r + .3), CURB + .05, z + Math.cos(a)*(r + .3), rnd(.8, 1.1)); }
  if (opts.beacon){ beaconLight(P, x + r + .1, CURB + h + .45, z, .1, 1.1); beaconLight(P, x - r - .1, CURB + h + .45, z, .1, 1.1); }
}
function buildFoundry(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h, L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;
  const P = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2]));   // the yard front faces local +z
  // ---- the yard: dark wet concrete in slabs, puddles, hazard lines, a few drums and crates
  box(G.asph, P, 0, .012, 0, L, .025, D);
  const nx = 24, nz = 16, sx = L/nx, sz = D/nz;
  for (let a=0;a<nx;a++) for (let b=0;b<nz;b++) if (!chance(.04)) box(pick(TILES.ind), P, (a-(nx-1)/2)*sx, .03, (b-(nz-1)/2)*sz, sx - .05, .045, sz - .05);
  for (let k=0; k<10; k++) box(G.puddle, P, rnd(-L/2 + 1, L/2 - 1), .056, rnd(2, D/2 - .6), rnd(.6, 1.8), .01, rnd(.3, .8));
  box(M.hazard, P, 0, .058, 4.0, L - 2, .012, .1);
  for (let k=0; k<14; k++){ const x = rnd(-L/2 + .6, L/2 - .6), z = rnd(4.4, D/2 - .4);
    chance(.6) ? put(U.cyl16, pick([M.fRust, M.awn3, M.corrBlue, M.fSteel2]), under(P, T(x, .28, z, 0, .4, .52, .4))) : box(pick([M.crate, M.fSteel2]), P, x, .22, z, .5, .44, .5); }

  // ---- greenery in the yard: weeds in the cracks, planters and a few small trees along the front
  for (let k=0; k<26; k++){ const x = rnd(-L/2 + .5, L/2 - .5), z = rnd(2.4, D/2 - .3), sc = rnd(.7, 1.0);
    chance(.1) ? plant('g_flowers', P, x, .06, z, sc) : floorBig(P, x, .066, z, sc + .2); }   // moss and weeds flat on the slabs, the odd flower clump
  for (let k=0; k<6; k++){ const x = -L/2 + 1.2 + k*(L - 2.4)/5, z = D/2 - .5;
    box(M.concM, P, x, .22, z, .9, .4, .5); plant(pick(['bamboo','bonsai','bushFlower','bush']), P, x, .42, z, rnd(.95, 1.25)); plant('h_ivy', under(P, T(x, 0, z + .25)), 0, .4, .01, .8, 't', true); }
  for (const x of [-L/2 + .5, L/2 - .5]) for (let z = -D/2 + 1; z < D/2 - 1; z += rnd(1.2, 2.0)) plant(pick(['bamboo','bush','g_fern3','bonsai']), P, x, .06, z, rnd(.9, 1.2));

  // ---- the main mass: a podium hall, two tall blocks over it, a rounded hall on top
  fBlock(P, -1.2, -2.0, 11.5, 7.6, CURB, 4.4, M.fSteel, { windows: true });                         // podium
  fBlock(P, -4.0, -3.4, 5.6, 4.8, CURB + 4.6, 4.6, M.fSteel2, { windows: true });                   // left block
  fBlock(P, -4.0, -3.4, 4.6, 4.0, CURB + 9.4, 2.6, M.fSteel, { glowOdds: .5 });                    // its crown
  fBlock(P, 2.0, -3.6, 3.6, 3.8, CURB + 4.6, 9.0, M.fSteel3, { windows: true, glowOdds: .5 });     // the tall block
  // the rounded roof over the left crown (the curved top in the reference)
  put(U.cyl16, M.fSteel2, under(P, T(-4.0, CURB + 12.2, -3.4, 0, 3.6, 4.0, 3.6, PI/2)));
  for (let t = -1.8; t <= 1.8; t += .45) put(U.torus, M.fRib, under(P, T(-4.0 + t, CURB + 12.2, -3.4, PI/2, 3.7, 3.7, 3.7)));
  // a vertical orange strip running up the tall block's front, like the one in the reference
  box(M.fGlow, P, 3.5, CURB + 9.0, -1.68, .07, 8.2, .06);
  for (let y = 5.5; y < 13; y += 1.4) glow(P, 3.5, CURB + y, -1.4, 'orange', 1.2);
  box(M.fGlow2, P, .4, CURB + 9.0, -1.68, .05, 6.5, .05); for (let y = 6.5; y < 12; y += 2) glow(P, .4, CURB + y, -1.45, 'orange', .9);
  // the one cold blue tube, low on the left
  box(M.fBlue, P, -5.5, CURB + 2.6, 1.92, 2.6, .07, .06); glow(P, -5.5, CURB + 2.6, 2.2, 'cyan', 1.4); glow(P, -6.6, CURB + 2.6, 2.2, 'cyan', 1.0);

  // ---- the loading dock along the podium's front: a deep canopy lit orange underneath, warm-lit bays
  const dz = 1.8 + .02;
  box(M.fSteel3, P, .8, CURB + 2.2, dz + .7, 7.5, .14, 1.5);
  box(M.fGlow, P, .8, CURB + 2.11, dz + 1.4, 7.4, .05, .05);
  for (let t = -2.6; t <= 4.2; t += 1.0){ box(M.fGlow2, P, t, CURB + 2.12, dz + .7, .5, .03, .2); glow(P, t, CURB + 1.95, dz + .8, 'orange', 1.5); }
  for (const t of [-2.0, .1, 2.2, 3.9]){ box(M.fWin, P, t, CURB + .95, dz, 1.4, 1.6, .03); box(M.shutter, P, t, CURB + 1.55, dz + .02, 1.4, .4, .03); }   // open bays, lit inside
  for (const t of [-2.9, 4.7]) cyl(M.frame, P, t, CURB + 1.1, dz + 1.35, .05, 2.2);
  for (let k=0; k<6; k++) person(P, rnd(-2.5, 4.5), CURB, dz + rnd(.3, 1.4));
  // a truck at the dock
  { const Q = under(P, T(-1.1, 0, dz + 2.6, 0)); box(M.corrBlue, Q, 0, .75, 0, 2.6, 1.2, 1.0); box(M.fSteel2, Q, 1.7, .55, 0, .8, .8, .95); box(M.glassDark, Q, 2.08, .7, 0, .03, .3, .8);
    for (const x of [-.8, .6, 1.6]) for (const s2 of [-1, 1]) put(U.cyl16, M.frame, under(Q, T(x, .2, s2*.5, 0, .38, .14, .38, PI/2))); box(M.bulb, Q, 2.1, .4, .35, .04, .08, .1); glow(Q, 2.2, .4, .35, 'warm', .9); }

  // ---- the fat smokestack on the left, wrapped in scaffolding
  const sx0 = -9.2, sz0 = -3.6;
  fStack(P, sx0, sz0, 1.15, 16.5, { lit: [6.2, 11.8], collar: 2.0 });
  for (let y = 0; y < 13; y += 1.3){                                                                 // scaffolding round it
    for (const [ax, az, bx2, bz2] of [[-1.6,-1.6,1.6,-1.6],[1.6,-1.6,1.6,1.6],[1.6,1.6,-1.6,1.6],[-1.6,1.6,-1.6,-1.6]]){
      strut(M.frame, P, sx0 + ax, CURB + y + 1.3, sz0 + az, sx0 + bx2, CURB + y + 1.3, sz0 + bz2, .04);
      if (chance(.6)) strut(M.frame, P, sx0 + ax, CURB + y, sz0 + az, sx0 + bx2, CURB + y + 1.3, sz0 + bz2, .03);
    }
  }
  for (const [ax, az] of [[-1.6,-1.6],[1.6,-1.6],[1.6,1.6],[-1.6,1.6]]) box(M.frame, P, sx0 + ax, CURB + 6.6, sz0 + az, .06, 13, .06);
  for (const y of [4.0, 8.0, 11.9]) box(M.fSteel3, P, sx0, CURB + y, sz0 + 1.6, 3.3, .06, .5);       // landings
  fPipe(P, sx0 + 1.3, CURB + 7.0, sz0, -6.8, CURB + 7.0, sz0, .22, M.fRust);                        // flue into the block
  fPipe(P, sx0 + 1.3, CURB + 3.2, sz0 + .6, -7.0, CURB + 3.2, sz0 + .6, .18);

  // ---- the tall chimney at the back right, with a beacon
  fStack(P, 8.6, -5.2, .85, 22.5, { lit: [9, 17.5], collar: 3.0, beacon: true });
  // ---- the tank tower, ringed in light, with catwalks and a ladder
  const tx = 8.0, tz = 1.4, tr = 1.5, th = 10.5;
  put(U.cyl16, M.fSteel2, under(P, T(tx, CURB + th/2, tz, 0, 2*tr, th, 2*tr)));
  for (const y of [2.6, 5.4, 8.2]){ put(U.cyl16, M.fGlow, under(P, T(tx, CURB + y, tz, 0, 2*tr + .14, .07, 2*tr + .14))); for (let a = 0; a < TAU; a += PI/2) glow(P, tx + Math.cos(a)*(tr + .2), CURB + y, tz + Math.sin(a)*(tr + .2), 'orange', 1.0); }
  for (const y of [4.0, 7.0]){ put(U.cyl16, M.fSteel3, under(P, T(tx, CURB + y, tz, 0, 2*tr + .9, .06, 2*tr + .9))); for (let a = 0; a < TAU; a += TAU/14) cyl(M.frame, P, tx + Math.cos(a)*(tr + .42), CURB + y + .2, tz + Math.sin(a)*(tr + .42), .015, .4); }
  put(U.cone, M.fSteel3, under(P, T(tx, CURB + th + .5, tz, 0, 2*tr + .1, 1.0, 2*tr + .1)));
  cyl(M.frame, P, tx, CURB + th + 1.4, tz, .03, 1.2); beaconLight(P, tx, CURB + th + 2.0, tz, .09, 1.0);
  for (let y = .3; y < th - .2; y += .3) box(M.frame, P, tx - tr - .1, CURB + y, tz, .03, .03, .3);
  // a stubby stack and a hopper on the right
  fStack(P, 5.6, -5.6, .6, 13.5, { lit: [8.5] });
  box(M.fSteel3, P, 9.4, CURB + 2.4, -1.8, 2.2, 4.8, 2.2); put(U.cone, M.fSteel2, under(P, T(9.4, CURB + 5.4, -1.8, 0, 2.6, 1.2, 2.6)));

  // ---- pipes over and round everything
  const loop = (ax, az, bx2, bz2, y0, up, r) => {                                                   // a raised loop between two points
    fPipe(P, ax, y0, az, ax, y0 + up, az, r); fPipe(P, bx2, y0, bz2, bx2, y0 + up, bz2, r);
    fPipe(P, ax, y0 + up, az, bx2, y0 + up, bz2, r);
    put(U.sph, M.fSteel2, under(P, T(ax, y0 + up, az, 0, 3*r, 3*r, 3*r))); put(U.sph, M.fSteel2, under(P, T(bx2, y0 + up, bz2, 0, 3*r, 3*r, 3*r)));
  };
  loop(-2.6, -2.0, .6, -2.0, CURB + 9.2, 2.6, .2);
  for (let t = -2.4; t < .5; t += .5) plant(pick(['vines','pothos','h_vine3']), under(P, T(0, 0, -2.0)), t, CURB + 11.7, 0, rnd(.8, 1.1), 't', true);                                                  // from the left block over to the tall one
  loop(-1.5, -5.0, 1.0, -5.0, CURB + 9.2, 1.6, .14);
  loop(3.6, -3.0, 7.2, -3.0, CURB + 7.0, 1.6, .18);                                                 // tall block to the chimney side
  loop(4.4, -1.2, 6.6, 1.0, CURB + 4.4, 2.2, .16);                                                  // podium to the tank
  for (const [y, r, z] of [[CURB + 3.8, .14, 1.95], [CURB + 3.4, .1, 1.95], [CURB + 1.0, .12, 1.95]]) fPipe(P, -6.9, y, z, 4.4, y, z, r, chance(.5) ? M.fRust : M.fSteel2);   // runs along the front
  for (const x of [-6.6, -.2, 3.3]) fPipe(P, x, CURB + .2, 1.95, x, CURB + 4.3, 1.95, .12);
  fPipe(P, 4.4, CURB + 3.0, -2.0, 7.0, CURB + 3.0, -2.0, .2, M.fRust); fPipe(P, 7.0, CURB + 3.0, -2.0, 7.0, CURB + 3.0, .4, .2, M.fRust);
  // aerials, cables and a few warm work lights up top
  for (const [x, z, h] of [[-5.2, -2.4, 2.4], [2.6, -2.6, 3.2], [1.0, -4.8, 1.8]]) cyl(M.frame, P, x, CURB + 13.6 + h/2 - (x < 0 ? 1.6 : 0), z, .03, h);
  for (const [x, y, z] of [[-6.5, 9.3, 1.0], [3.7, 13.7, -1.9], [-1.3, 4.6, 1.9], [7.3, 4.6, 2.9]]){ box(M.bulb, P, x, CURB + y, z, .14, .08, .1); glow(P, x, CURB + y - .05, z + .1, 'warm', 1.4); }
  for (let k=0; k<12; k++) plant(pick(['vines','h_ivy','l_mossroots','pothos','h_curtain3']), P, rnd(-6.5, 4), CURB + rnd(3.0, 4.3), 1.85, rnd(.9, 1.2), 't', true);   // growth over the front pipes
  m.roofH = CURB + 4.6;
  m.top = CURB + 23.5;
}

/* ---------- the police station ---------- */
// A civic building on a 3x3 block, after the reference: a pale two-storey block over a recessed, brightly lit
// glass lobby, a glass curtain wall in the middle of the front, big framed screens on the facade showing the
// city's wanted posters (cycling, with a projection glitch, see policeFx), the neon badge and a POLICE fascia, and
// a cyan holographic ring looping round the whole building. A light bar flashes red and blue on the roof; patrol
// cars, officers, a crossing and a traffic light out front.
M.polWall = toon(0xd2d5da); M.polWall2 = toon(0xb6bac2); M.polDark = toon(0x2a3140); M.polFrame = toon(0x8e949e);
M.polLobby = toon(0x7fc8e0, { em:0x9ae6ff, kind:'lamp' }); M.polScreen = toon(0x0c1622, { em:0x06202c, kind:'trim' });
M.polCar = toon(0xe8ebef); M.polCarDark = toon(0x1c2230);
const WANTED_N = 9, WANTED_W = 64, WANTED_H = 68;
function policeCar(P, x, z, ry){
  const Q = under(P, T(x, 0, z, ry));
  box(M.polCar, Q, 0, .32, 0, 1.3, .26, .6); box(M.polCarDark, Q, -.05, .52, 0, .7, .18, .54); box(M.glassDark, Q, .32, .52, 0, .04, .14, .5);
  box(M.polCarDark, Q, 0, .28, .305, 1.28, .08, .01); box(M.polCarDark, Q, 0, .28, -.305, 1.28, .08, .01);   // stripe
  box(M.neonCyan, Q, 0, .2, .31, 1.2, .02, .01);
  box(M.blink, Q, -.08, .64, -.12, .12, .05, .16); box(M.neonCyan, Q, -.08, .64, .12, .12, .05, .16);       // light bar
  for (const [wx, wz] of [[-.4,.3],[.4,.3],[-.4,-.3],[.4,-.3]]) put(U.cyl16, M.frame, under(Q, T(wx, .14, wz, 0, .24, .06, .24, PI/2)));
}
function buildPoliceStation(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), H = 3*LOT/2;   // the front faces local +z
  // ---- ground: a street along the front with a crossing, pale paving round the building
  box(G.asph, P, 0, .012, 0, 2*H, .025, 2*H);
  for (let a=0;a<14;a++) for (let b=0;b<10;b++) box(pick(TILES.high), P, -H + .41 + a*.81, .03, -H + .4 + b*.82, .77, .045, .78);
  box(G.asph2, P, 0, .03, H - 1.1, 2*H, .05, 2.2);                                                     // the street
  for (let t = -H + .6; t < H; t += 1.2) box(G.line, P, t, .058, H - 1.1, .6, .01, .06);
  for (let k=0; k<7; k++) box(M.white2, P, -3.6 + k*.32, .058, H - 1.1, .18, .01, 1.8);              // crossing
  // ---- the building
  const bx = 0, bz = -.9, bw = 9.4, bd = 6.6, gf = 2.2, top = 6.3, front = bz + bd/2;
  box(M.polDark, P, bx, CURB + gf/2, bz - .4, bw - 1.0, gf, bd - .8);                                  // recessed ground floor
  for (let t = -bw/2 + 1.1; t < bw/2 - .9; t += .9){                                                  // lit glass lobby along the front
    box(M.polLobby, P, t + .45, CURB + 1.05, front - .78, .84, 1.9, .04); box(M.polFrame, P, t, CURB + 1.05, front - .76, .05, 1.95, .06); }
  box(M.glassDark, P, -1.2, CURB + .9, front - .74, 1.4, 1.6, .03); box(M.polFrame, P, -1.2, CURB + .9, front - .72, .04, 1.6, .03);   // doors
  for (const t of [-3.4, -1.2, 1.0, 3.2]){ cyl(M.polWall, P, t, CURB + gf/2, front - .1, .1, gf); }   // columns under the overhang
  box(M.polScreen, P, 2.6, CURB + .7, front - .55, 1.8, .9, .1);                                     // reception desk screen
  box(M.polWall2, P, 2.6, CURB + .4, front - .45, 2.0, .7, .5);
  for (let t = -bw/2 + .6; t < bw/2 - .4; t += .8){ box(M.bulb, P, t, CURB + gf - .05, front - .3, .3, .03, .1); glow(P, t, CURB + gf - .2, front - .2, 'cyan', .7); }   // downlights in the soffit
  // upper storeys: a pale box, ledge lines, a glass curtain wall in the middle of the front
  // the back two corners are rounded and glazed: a single sheet of curved glass each, lit from inside
  const RC = 1.2, uh = top - gf, uy = CURB + gf + uh/2, back = bz - bd/2;
  box(M.polWall, P, bx, uy, bz + RC/2, bw, uh, bd - RC);
  box(M.polWall, P, bx, uy, back + RC/2, bw - 2*RC, uh, RC);
  for (const sx of [-1, 1]){
    const cx = bx + sx*(bw/2 - RC), cz = back + RC, th0 = sx > 0 ? PI/2 : PI;
    put(wedgeGeo(RC - .12, uh, th0, PI/2), M.polWall2, under(P, T(cx, uy, cz)));                    // the core behind the glass
    put(wedgeGeo(RC, uh - .1, th0, PI/2), M.polLobby, under(P, T(cx, uy, cz)));                       // one sheet of curved glass, floor to roof
    put(wedgeGeo(RC + .1, .24, th0, PI/2), M.polWall2, under(P, T(cx, CURB + top + .12, cz)));     // cap follows the curve
  }
  box(M.polWall2, P, bx, CURB + gf + .05, bz + RC/2, bw + .1, .12, bd - RC + .1);
  box(M.polWall2, P, bx, CURB + gf + .05, back + RC/2, bw - 2*RC, .12, RC + .1);
  box(M.polWall2, P, bx, CURB + top + .12, bz + RC/2, bw + .2, .24, bd - RC + .2);                     // parapet cap
  box(M.polWall2, P, bx, CURB + top + .12, back + RC/2 - .05, bw - 2*RC, .24, RC + .1);
  // recessed features: dark reveals between floors with a lit lip, sunken window slots, recessed fins on the back
  const reveal = (F, len, y) => { box(M.polDark, F, 0, y, .01, len - .3, .14, .04); box(M.trimCyan, F, 0, y - .075, .03, len - .4, .02, .02); };
  for (const [F, len] of [[under(P, T(bw/2, 0, bz + RC/2, PI/2)), bd - RC], [under(P, T(-bw/2, 0, bz + RC/2, -PI/2)), bd - RC], [under(P, T(bx, 0, back, PI)), bw - 2*RC]]){
    reveal(F, len, CURB + gf + 1.35); reveal(F, len, CURB + gf + 2.75);
    box(M.polDark, F, 0, CURB + top - .12, .01, len - .2, .1, .04);                                       // shadow line under the parapet
  }
  { const F = under(P, T(bx, 0, back, PI));                                                              // back face: sunken slots and fins
    for (let t = -(bw - 2*RC)/2 + .45; t < (bw - 2*RC)/2 - .3; t += .62){
      box(M.polDark, F, t, CURB + gf + .7, .01, .34, .9, .04); if (chance(.55)) box(M.polLobby, F, t, CURB + gf + .7, .015, .24, .8, .03);
      box(M.polDark, F, t, CURB + gf + 2.05, .01, .34, .9, .04); if (chance(.45)) box(M.polLobby, F, t, CURB + gf + 2.05, .015, .24, .8, .03);
      box(M.polWall2, F, t + .31, CURB + gf + 1.9, .06, .06, uh - .4, .12);                              // fin
    }
  }
  for (const [F, xs] of [[under(P, T(bw/2, 0, bz + RC/2, PI/2)), [-1.6, -.3]], [under(P, T(-bw/2, 0, bz + RC/2, -PI/2)), [1.1, 1.8]]])   // a column of sunken slots on each side
    for (const t of xs) for (const yy of [CURB + gf + .7, CURB + gf + 2.05, CURB + gf + 3.4]){ box(M.polDark, F, t, yy, .01, .4, .7, .04); box(chance(.5) ? M.polLobby : M.polScreen, F, t, yy, .015, .3, .6, .03); }
  // a deep recessed entrance portal round the curtain wall
  box(M.polDark, P, -.2, CURB + 3.95, front + .005, 3.3, 3.2, .02);
  for (const sx of [-1, 1]) box(M.polWall2, P, -.2 + sx*1.72, CURB + 3.92, front + .12, .14, 3.25, .26);   // the portal stops below the POLICE fascia
  box(M.polWall2, P, -.2, CURB + 5.55, front + .12, 3.58, .12, .26);
  box(M.polLobby, P, -.2, CURB + 3.95, front + .02, 3.0, 2.9, .04);                                     // the curtain wall, lit cool from inside
  for (let t = -1.7; t <= 1.31; t += .5) box(M.polFrame, P, t, CURB + 3.95, front + .05, .04, 2.9, .04);
  for (let y = 2.8; y <= 5.4; y += .85) box(M.polFrame, P, -.2, CURB + y, front + .05, 3.0, .04, .04);
  for (let k=0; k<10; k++) box(pick([M.polDark, M.polFrame, M.polScreen]), P, rnd(-1.5, 1.1), CURB + rnd(2.6, 5.6), front - .25, rnd(.2, .5), rnd(.2, .5), .1);   // silhouettes of people and desks inside
  // framed screens on the facade (the posters themselves are added live in policeFx)
  const screens = [];
  const screen = (F, x, y, w, h) => {
    box(M.polFrame, F, x, y, .12, w + .34, h + .34, .24);                                                // chamfered-looking frame: frame plus corner blocks
    for (const [cx, cy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) box(M.polWall2, F, x + cx*(w/2 + .12), y + cy*(h/2 + .12), .26, .22, .22, .06, 0, 0, PI/4);
    box(M.polScreen, F, x, y, .25, w, h, .02);
    box(M.neonCyan, F, x, y - h/2 - .08, .26, w*.6, .03, .02);                                         // a cyan strip under each
    glow(F, x, y - h/2 - .08, .4, 'cyan', .8);                                                           // the strip's glow, not over the poster
    const mt = under(F, T(x, y, .31)); screens.push({ m: mt.elements.slice(), w, h });   // in front of the panel (boxes are at least MIN_T thick)
  };
  const Ff = under(P, T(0, 0, front, 0)), Fr = under(P, T(bw/2, 0, bz, PI/2)), Fl = under(P, T(-bw/2, 0, bz, -PI/2));
  screen(Ff, -3.35, CURB + 4.15, 2.0, 2.12);
  screen(Ff, 3.1, CURB + 4.15, 2.3, 2.44);
  screen(Fr, .55, CURB + 4.2, 2.3, 2.44);
  screen(Fr, -2.3, CURB + 1.2, 1.2, 1.28);
  screen(Fl, -.1, CURB + 4.2, 2.2, 2.34);
  m.screens = screens;
  // the badge and the POLICE fascia over the entrance
  box(M.polDark, Ff, -1.2, CURB + 6.0, .14, 3.0, .6, .12);
  plant('sign_policetext', Ff, -1.85, CURB + 6.0, .23, 1.1, 'c', true); glow(Ff, -1.85, CURB + 6.0, .4, 'cyan', 1.4);
  plant('sign_police', Ff, -.25, CURB + 6.0, .23, .55, 'c', true); glow(Ff, -.25, CURB + 6.0, .4, 'blue', 1.6);
  plant('sign_police', Fr, -2.3, CURB + 4.7, .05, .7, 'c', true); glow(Fr, -2.3, CURB + 4.7, .3, 'blue', 1.6);
  // vents and service doors on the side, like the reference
  box(M.polDark, Fr, -3.2, CURB + 1.0, .02, .9, 1.9, .04); box(M.polFrame, Fr, -3.2, CURB + 2.1, .06, 1.0, .1, .1);
  for (let k=0; k<3; k++) box(M.polDark, Ff, -3.8 + k*.35, CURB + 6.05, .04, .25, .12, .03);
  // the holographic ring: a cyan loop round the building at mid height, with glows along it
  { const n = 64, rx = 6.4, rz = 4.9, tilt = .35;                                                   // a thin, slightly tilted ellipse of light
    const pt = a => [bx + Math.cos(a)*rx, CURB + 3.4 + Math.sin(a)*tilt, bz + Math.sin(a)*rz];
    for (let k=0; k<n; k++){ const [x0, y0, z0] = pt(k*TAU/n), [x1, y1, z1] = pt((k + 1)*TAU/n); strut(M.neonCyan, P, x0, y0, z0, x1, y1, z1, .035); }
    for (let k=0; k<16; k++){ const [x, y, z] = pt(k*TAU/16); glow(P, x, y, z, 'cyan', .8); } }
  // the roof: plant, a mast, a drone pad, the light bar (flashing, in policeFx)
  const ry = CURB + top + .24;
  // a large drone landing pad: a raised dark deck with neon guidelines (rings, an H, approach chevrons, edge lights)
  const px = -1.8, pz = -1.2, PS = 4.4, py = ry + .22;
  box(M.polWall2, P, px, ry + .08, pz, PS + .3, .16, PS + .3);
  box(M.polCarDark, P, px, py - .03, pz, PS, .06, PS);
  const ring = (r, mat, t) => { const n = 40; for (let k=0; k<n; k++){ const a0 = k*TAU/n, a1 = (k + 1)*TAU/n; strut(mat, P, px + Math.cos(a0)*r, py + .005, pz + Math.sin(a0)*r, px + Math.cos(a1)*r, py + .005, pz + Math.sin(a1)*r, t); } };
  ring(1.9, M.neonCyan, .05); ring(1.45, M.trimCyan, .03);
  for (let k=0; k<8; k++){ const a = k*TAU/8; glow(P, px + Math.cos(a)*1.9, py + .05, pz + Math.sin(a)*1.9, 'cyan', .7); }
  box(M.neonCyan, P, px - .35, py + .005, pz, .07, .01, .9); box(M.neonCyan, P, px + .35, py + .005, pz, .07, .01, .9); box(M.neonCyan, P, px, py + .005, pz, .7, .01, .07);   // the H
  for (let k=0; k<4; k++){ const a = k*PI/2, F = under(P, T(px + Math.sin(a)*(PS/2 - .35), 0, pz + Math.cos(a)*(PS/2 - .35), a));   // chevrons pointing in
    for (const o of [0, .22]){ strut(M.neonAmber, F, -.25, py + .005, -o, 0, py + .005, -o - .2, .04); strut(M.neonAmber, F, .25, py + .005, -o, 0, py + .005, -o - .2, .04); } }
  for (let k=0; k<16; k++){ const t = -PS/2 + .15 + (k % 4)*(PS - .3)/3, side = Math.floor(k/4);   // edge lights
    const [lx, lz] = [[t, -PS/2], [PS/2, t], [-t, PS/2], [-PS/2, -t]][side]; box(M.bulb, P, px + lx, py + .02, pz + lz, .07, .04, .07); if (k % 2) glow(P, px + lx, py + .05, pz + lz, 'warm', .5); }
  m.dronePad = under(P, T(px + .2, py, pz + .1, .4)).elements.slice();
  // the drones park in the pad's four quarters (they're live: see policeFx); three or four of them, by the station's seed
  m.dronePads = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], k) => under(P, T(px + sx*1.05, py, pz + sz*1.05, .4 + k*.9)).elements.slice());
  m.droneN = 3 + (hash('drones', m.i, m.j, m.seed) % 2);
  // machinery and an antenna on the other side of the roof
  box(M.metal, P, 3.1, ry + .3, .9, 1.3, .6, 1.0); box(M.metal, P, 3.6, ry + .25, -.6, .8, .5, .7); box(M.metalDark, P, 1.7, ry + .2, 1.4, .7, .4, .6);
  for (let k=0; k<3; k++) put(U.cyl16, M.polWall2, under(P, T(2.9 + k*.4, ry + .78, .9, 0, .3, .1, .3)));   // fan housings
  cyl(M.frame, P, 4.2, ry + 1.4, 1.8, .04, 2.8); beaconLight(P, 4.2, ry + 2.85, 1.8, .08, .8);
  // the radar's pedestal (the rotating head is in policeFx)
  const rx = 2.7, rz = -2.7;
  put(U.cyl16, M.polWall2, under(P, T(rx, ry + .3, rz, 0, 1.3, .6, 1.3))); put(U.cyl16, M.polDark, under(P, T(rx, ry + .64, rz, 0, 1.0, .1, 1.0)));
  put(U.cyl16, M.trimCyan, under(P, T(rx, ry + .6, rz, 0, 1.34, .03, 1.34)));
  cyl(M.polFrame, P, rx, ry + .95, rz, .12, .6);
  m.radar = { m: under(P, T(rx, ry + 1.25, rz)).elements.slice() };
  box(M.polDark, P, 0, ry + .2, front - .5, 1.6, .2, .3);
  m.lightbar = { m: under(P, T(0, ry + .38, front - .5)).elements.slice() };
  // out front: patrol cars, officers, a traffic light, bollards, trees in planters
  // four bays for the hoverbikes (live: see policeBikes), painted on the forecourt, each with a charging post
  m.bikePads = [];
  for (const bx2 of [-4.9, -3.6, 2.0, 3.3]){
    const Q = under(P, T(bx2, 0, front + 1.25));
    for (const s of [-1, 1]) box(M.neonCyan, Q, s*.42, .058, 0, .03, .01, 1.0); box(M.neonCyan, Q, 0, .058, -.5, .87, .01, .03);
    box(M.polCarDark, Q, -.5, .3, -.45, .08, .55, .08); box(M.neonCyan, Q, -.5, .5, -.4, .05, .1, .02);
    const w = new THREE.Vector3(0, 0, 0).applyMatrix4(Q), f = new THREE.Vector3(0, 0, 1).transformDirection(Q);
    m.bikePads.push({ x: w.x, z: w.z, fx: f.x, fz: f.z });
  }
  { const d = new THREE.Vector3(-1.2, 0, front + .1).applyMatrix4(P); m.stationDoor = { x: d.x, z: d.z }; }
  for (const [x, z] of [[-2.2, front + .9], [-.4, front + .6], [.2, front + .7], [3.9, front + .5], [-3.2, front + .5]]){
    const Q = under(P, T(x, 0, z)); box(M.polCarDark, Q, 0, CURB + .12, 0, .09, .24, .07); box(M.polCarDark, Q, 0, CURB + .29, 0, .07, .07, .07); box(M.neonCyan, Q, 0, CURB + .2, .036, .02, .02, .01); }
  { const Q = under(P, T(4.6, 0, H - 2.3)); cyl(M.metalDark, Q, 0, 1.0, 0, .04, 2.0); box(M.metalDark, Q, -.5, 1.9, 0, 1.0, .05, .05);
    box(M.polCarDark, Q, -.9, 1.75, 0, .16, .4, .14); box(M.blink, Q, -.9, 1.86, .08, .08, .08, .02); glow(Q, -.9, 1.86, .15, 'red', .8); }
  for (let t = -H + .6; t < H - .3; t += 1.0) cyl(M.polWall2, P, t, CURB + .2, front + .2 + 1.65, .05, .4);   // bollards
  for (const [x, z] of [[-H + .7, -H + .7], [H - .7, -H + .7], [-H + .7, front - .2], [H - .7, front - .2]]){
    box(M.polWall2, P, x, .25, z, .8, .4, .8); plant(pick(['bonsai','bush','bushFlower']), P, x, .45, z, 1.2); }
  m.roofH = ry;
  m.top = ry + 3;
}
// Live parts of the station: the wanted posters on the facade screens, each cycling through the nine posters with
// a slight projection glitch (scanlines, the odd jittering row, a soft colour fringe) and a stronger burst as it
// changes; and the roof light bar flashing red and blue.
let wantedTex = null;
const WANTED_FRAG = `
  uniform sampler2D map; uniform float frame, prevFrame, glitch, seed, time;
  varying vec2 vUv;
  const float NF = ${WANTED_N}.0; const vec2 SZ = vec2(${WANTED_W}.0, ${WANTED_H}.0);
  float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
  vec4 tap(vec2 uv, float f){ if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0); uv = (floor(uv*SZ) + .5)/SZ; return texture2D(map, vec2((f + uv.x)/NF, uv.y)); }
  void main(){
    vec2 uv = vUv; float row = floor(uv.y*SZ.y), band = floor(uv.y*12.0);
    float g = max(glitch, .08);                                          // never quite steady: a projection
    if (h(vec2(band, seed)) < g*.5) uv.x += floor((h(vec2(band, seed + 7.0)) - .5)*g*12.0)/SZ.x;
    if (h(vec2(row, floor(time*9.0))) > .985) uv.x += 1.0/SZ.x;          // the odd jittering row
    float f = (h(vec2(band, seed + 3.0)) < glitch*.5) ? prevFrame : frame;
    float dx = (glitch > .2 ? 2.0 : 1.0)/SZ.x;
    vec4 c = tap(uv, f), cr = tap(uv + vec2(dx, 0.0), f), cb = tap(uv - vec2(dx, 0.0), f);
    vec3 col = c.rgb*c.a; col.r = max(col.r, cr.r*cr.a*.6); col.b = max(col.b, cb.b*cb.a*.6);
    col *= 1.0 - .25*mod(row, 2.0);
    col *= 1.0 - glitch*.5*step(.6, h(vec2(floor(time*40.0), seed)));
    vec3 bg = vec3(.02, .07, .11);                                       // the screen behind the projection
    gl_FragColor = vec4(bg + col*1.2, 1.0);
  }`;
// The station's drone: parked on the roof pad, it now and then lifts off, flashing red and blue, and patrols the
// streets nearby from the air: it flies from crossing to crossing high enough to clear the buildings, hovers over
// each with its searchlight on the street, then comes home and lands. It doesn't do anything else.
function policeDrone(m, idx = 0, padM = m.dronePad, crew = null){
  const g = new THREE.Group(), pad = new THREE.Matrix4().fromArray(padM);
  const restPos = new THREE.Vector3(), restQ = new THREE.Quaternion(), _sc = new THREE.Vector3();
  pad.decompose(restPos, restQ, _sc);
  const restYaw = new THREE.Euler().setFromQuaternion(restQ, 'YXZ').y;
  const part = (geo, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, to = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); to.add(o); return o; };
  part(U.box, M.polCar, 0, .2, 0, .9, .18, .55); part(U.box, M.polCarDark, 0, .32, 0, .6, .1, .36); part(U.box, M.neonCyan, .46, .2, 0, .02, .05, .3);
  const blades = [];
  for (const [qx, qz] of [[-.55,-.45],[.55,-.45],[-.55,.45],[.55,.45]]){
    const arm = part(U.box, M.polCarDark, qx/2, .27, qz/2, Math.hypot(qx, qz), .05, .06); arm.rotation.y = -Math.atan2(qz, qx);
    part(U.cyl16, M.metal, qx, .34, qz, .1, .06, .1);
    part(U.torus, M.polCarDark, qx, .34, qz, .66, .66, .66, PI/2);
    const hub = new THREE.Group(); hub.position.set(qx, .37, qz); g.add(hub); blades.push(hub);
    part(U.box, M.metal, 0, 0, 0, .58, .015, .07, 0, 0, 0, hub); part(U.box, M.metal, 0, 0, 0, .07, .015, .58, 0, 0, 0, hub);
  }
  for (const sx of [-1, 1]) part(U.box, M.frame, sx*.3, .05, 0, .04, .1, .5);
  // the flashing lights: red on one side, blue on the other, each with a halo
  const flash = (col, z) => { const lm = new THREE.MeshBasicMaterial({ color: col }); const b = part(new THREE.BoxGeometry(.14, .06, .06), lm, 0, .4, z, 1, 1, 1);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.set(1.2, 1.2, 1); sp.position.set(0, .42, z); sp.layers.set(1); g.add(sp);
    return { b, sp, lm }; };
  const red = flash(0xff2030, -.16), blue = flash(0x2a6cff, .16);
  // the searchlight: a faint cone of light down to the street while it hovers
  const SEARCH = new THREE.Color(0xbfefff), ALARM = new THREE.Color(0xff2a3a);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.7, 1, 16, 1, true), coneMat); cone.layers.set(1); cone.renderOrder = 4; scene.add(cone);
  const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xbfefff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); spot.scale.set(2.2, 2.2, 1); spot.layers.set(1); scene.add(spot);
  g.traverse(o => { if (o.isMesh && o.layers.mask === 1) o.layers.set(0); });
  g.position.copy(restPos); g.rotation.y = restYaw; scene.add(g);
  // its own clock (real seconds), so it keeps to its rounds whatever the hour, the day cycle or the frame rate
  // the crew take off at different times; each flies a little higher than the last, so their paths never meet
  const st = { mode: 'rest', timer: 4 + idx*9 + Math.random()*5, way: [], yaw: restYaw, spin: 0, hover: 0, k: 0, last: performance.now(), chase: null };
  const cruiseTo = (a, b) => Math.max(droneCruise(a, b) + 1.2 + idx*.45, restPos.y + 1.5 + idx*.45);
  const _to = new THREE.Vector3();
  function goToward(target, dt, speed){
    _to.subVectors(target, g.position); const d = _to.length();
    if (d < .05) return true;
    const want = Math.atan2(_to.x, _to.z);
    if (Math.hypot(_to.x, _to.z) > .3){ let dy = want - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); st.yaw += dy*Math.min(1, dt*2.5); }
    g.position.addScaledVector(_to, Math.min(1, speed*dt/d));
    return d < .1;
  }
  return {
    g, st,
    // sent to a mugging: true if it's free to go (not already on one)
    scramble(L){ if (st.chase) return false; st.chase = { L, t: 25 }; if (st.mode === 'down' || st.mode === 'home'){ st.mode = 'fly'; st.target = null; st.climb = null; } return true; },
    get busy(){ return !!st.chase; }, get pos(){ return g.position; },
    update(_dt, time){
      const now = performance.now(), dt = Math.min(1, (now - st.last)/1000); st.last = now;
      const on = st.mode !== 'rest';
      st.spin = Math.max(0, Math.min(1, st.spin + (on ? dt : -dt*.5)));
      for (const h of blades) h.rotation.y += dt*40*st.spin;
      const ph = (time*2.2) % 2, a = ph < 1, fl = (time*14) % 1 < .6;
      red.b.visible = red.sp.visible = on && a && fl; blue.b.visible = blue.sp.visible = on && !a && fl;
      let light = 0;
      if (st.mode === 'rest'){
        st.timer -= dt;
        if (st.chase){ st.mode = 'up'; st.k = 0; st.way = []; }   // scrambled to a mugging
        else if (st.timer <= 0){
          const way = crew ? crew.plan(idx, restPos) : [];
          if (way.length){ st.way = way; st.mode = 'up'; st.k = 0; }
          else st.timer = 10;
        }
      } else if (st.mode === 'up'){
        st.k = Math.min(1, st.k + dt/2.2);
        g.position.set(restPos.x, restPos.y + 1.2*st.k*st.k*(3 - 2*st.k), restPos.z);
        if (st.k >= 1){ st.mode = st.chase ? 'chase' : 'fly'; st.target = null; }
      } else if (st.mode === 'chase'){
        // after a mugger: over the robbery, then tailing them as they run, the searchlight turned red on them
        const L = st.chase.L, live = L && (L.state === 'rob' || L.state === 'strike' || L.state === 'flee' || L.state === 'hide') && L.fade > .05;
        st.chase.t -= dt; if (L && L.tagged) st.chase.t = Math.max(st.chase.t, 2);   // a tagged mugger is followed until the bikes have them
        if (!live || st.chase.t <= 0){ st.chase = null; st.mode = st.way.length ? 'fly' : 'home'; st.target = null; st.climb = null; }
        else {
          _to.set(L.x, 0, L.z);
          const alt = Math.max(cruiseTo(g.position, _to) - .6, restPos.y + 1.2);
          const tgt = new THREE.Vector3(L.x, alt, L.z), far = Math.hypot(L.x - g.position.x, L.z - g.position.z);
          goToward(tgt, dt, far > 3 ? 3.4 : 2.6);
          if (far < 2.5){ light = 1; st.redOn = Math.min(1, (st.redOn || 0) + dt*3); st.aim = L;
            // held in the red light for five seconds, the mugger is tagged: the bikes know who they're after
            if (st.redOn > .5 && !L.tagged){ st.chase.lock = (st.chase.lock || 0) + dt; if (st.chase.lock >= 5){ L.tagged = true; if (crew && crew.onTag) crew.onTag(L); } } }
          else st.chase.lock = 0;
        }
      } else if (st.mode === 'fly' || st.mode === 'home'){
        if (st.chase && st.mode === 'fly'){ st.mode = 'chase'; st.target = null; st.climb = null; }
        if (!st.target){
          const w = st.mode === 'fly' ? st.way.shift() : null; st.at = w;
          const tx = w ? w.x : restPos.x, tz = w ? w.z : restPos.z;
          _to.set(tx, 0, tz);
          st.target = new THREE.Vector3(tx, cruiseTo(g.position, _to), tz);
          st.climb = new THREE.Vector3(g.position.x, st.target.y, g.position.z);   // climb first, then cross
        }
        if (st.climb){ if (goToward(st.climb, dt, 1.6)) st.climb = null; }
        else if (goToward(st.target, dt, 2.4)){
          st.target = null;
          if (st.mode === 'home'){ st.mode = 'down'; st.k = 0; st.from = g.position.clone(); }
          else { st.mode = 'hover'; st.hover = 1.8 + Math.random()*1.4; if (crew && st.at) crew.visited(st.at); }
        }
      } else if (st.mode === 'hover'){
        st.hover -= dt; light = Math.min(1, st.hover*2, 1);
        g.position.y += Math.sin(time*2.3)*.002;
        if (st.chase) st.mode = 'chase';
        else if (st.hover <= 0) st.mode = st.way.length ? 'fly' : 'home';
      } else if (st.mode === 'down'){
        st.k = Math.min(1, st.k + dt/2.8); const u = st.k*st.k*(3 - 2*st.k);
        g.position.lerpVectors(st.from, restPos, u);
        let dy = restYaw - st.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); st.yaw += dy*Math.min(1, dt*3);
        if (st.k >= 1){ st.mode = 'rest'; st.timer = 8 + Math.random()*10; st.yaw = restYaw; g.position.copy(restPos); }
      }
      g.rotation.y = st.yaw;
      // searchlight down to the street
      const h = g.position.y - CURB;
      if (st.mode !== 'chase') st.redOn = Math.max(0, (st.redOn || 0) - dt*2);
      const redK = st.redOn || 0;
      cone.visible = spot.visible = light > 0 || redK > 0;
      if (cone.visible){
        coneMat.color.copy(SEARCH).lerp(ALARM, redK); spot.material.color.copy(SEARCH).lerp(ALARM, redK);
        // the light pours straight down from the drone; on a chase the pool sits on the mugger
        const sx = redK > .5 && st.aim ? st.aim.x : g.position.x, sz = redK > .5 && st.aim ? st.aim.z : g.position.z;
        cone.position.set((g.position.x + sx)/2, CURB + h/2, (g.position.z + sz)/2); cone.scale.set(1, Math.hypot(g.position.x - sx, h, g.position.z - sz), 1);
        cone.rotation.set(0, 0, 0); cone.lookAt(sx, CURB, sz); cone.rotateX(-PI/2);
        coneMat.opacity = (.14 + .1*redK)*Math.max(light, redK);
        spot.position.set(sx, CURB + .05, sz); spot.material.opacity = (.55 + .3*redK)*Math.max(light, redK); spot.scale.setScalar(2.2 - .6*redK);
      }
    },
    dispose(){ scene.remove(g, cone, spot); coneMat.dispose(); cone.geometry.dispose(); spot.material.dispose(); red.lm.dispose(); blue.lm.dispose(); red.sp.material.dispose(); blue.sp.material.dispose(); }
  };
}
/* ---------- the police hoverbikes ---------- */
// One per drone, parked in the bays in front of the station. Now and then an officer takes one out on a patrol of
// the streets. When a drone is sent to a mugging, two bikes rush to the spot and search round it; if the drone holds
// the mugger in its red light for five seconds they're tagged, and the bikes run them down. The one that gets there
// first takes the mugger back to the station on its pillion and they go in; the other patrols the area a while.
// The bike is a billboard picked from eight drawn views by its heading; the officer (and passenger) are drawn by
// people.js from POLICE_BIKES.
const PBIKE_VIEWS = ['r2c1', 'r1c4', 'r2c3', 'r2c4', 'r1c1', 'r1c2', 'r1c3', 'r2c2'];   // nose away, away-right, right, ... going clockwise
const PBIKE_TEX = PBIKE_VIEWS.map(n => { const t = new THREE.TextureLoader().load('assets/sprites/pbike_' + n + '.png'); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; });
const PBIKE_SIZE = { r1c1: [14, 17], r1c2: [24, 17], r1c3: [26, 16], r1c4: [23, 18], r2c1: [14, 18], r2c2: [19, 18], r2c3: [26, 16], r2c4: [24, 18] };
let POLICE_BIKES = [];
const BIKE_Y = CURB + .28, BIKE_K = .8, BIKE_SEAT = .26;   // hover height; the rider's seat above the bike's base
function policeBike(m, idx, pad){
  const mat = new THREE.SpriteMaterial({ map: PBIKE_TEX[0], alphaTest: .5, transparent: false });
  const spr = new THREE.Sprite(mat); spr.center.set(.5, 0); spr.layers.set(1); spr.renderOrder = 2; scene.add(spr);
  const hum = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x4aa8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55 }));
  hum.layers.set(1); hum.scale.set(.9, .45, 1); scene.add(hum);
  // the siren: a red and blue glow that swaps over while they're on a call
  const siren = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  siren.layers.set(1); siren.scale.set(.7, .7, 1); scene.add(siren);
  const b = { idx, pad, x: pad.x, z: pad.z, y: CURB + .08, hx: pad.fx, hz: pad.fz, mode: 'park', timer: 40 + idx*25 + Math.random()*60,
              path: null, s: 0, speed: 1.6, rider: false, passenger: null, alpha: 1, target: null, until: 0, spr, hum, siren, mat };
  // follow a path of [x, z] points
  b.go = (pts, speed) => { const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1])); b.path = { pts, cum, len: cum[cum.length - 1] }; b.s = 0; b.speed = speed; };
  return b;
}
const nearNode = (x, z) => { let best = null, bd = Infinity; for (const c of (typeof patrolNodes !== 'undefined' ? patrolNodes : [])){ const d = (c.x - x)**2 + (c.z - z)**2; if (d < bd){ bd = d; best = c; } } return best; };
function bikeRoute(b, tx, tz, speed, direct){
  const a = nearNode(b.x, b.z), c = nearNode(tx, tz);
  let mid = a && c && typeof route === 'function' ? route(a.node, c.node) : null;
  if (!mid) mid = [];
  b.go([[b.x, b.z]].concat(mid, direct ? [[tx, tz]] : []), speed);
}
function policeBikes(m, crew){
  const pads = m.bikePads || [], n = Math.min(pads.length, crew.size);
  const bikes = []; for (let k = 0; k < n; k++) bikes.push(policeBike(m, k, pads[k]));
  POLICE_BIKES = POLICE_BIKES.concat(bikes);   // every station's bikes (people.js draws their riders)
  const home = b => { bikeRoute(b, b.pad.x + b.pad.fx*1.2, b.pad.z + b.pad.fz*1.2, b.passenger ? 2.4 : 1.8, true); b.path.pts.push([b.pad.x, b.pad.z]); b.go(b.path.pts, b.speed); b.mode = 'home'; };
  const sweep = (b, cx, cz, r, speed) => { const near = (typeof patrolNodes !== 'undefined' ? patrolNodes : []).filter(c => Math.hypot(c.x - cx, c.z - cz) < r);
    if (!near.length) return false; const t = near[Math.floor(Math.random()*near.length)]; bikeRoute(b, t.x, t.z, speed); return true; };
  let caseL = null;
  const api = {
    bikes,
    // a drone has gone to a mugging: two bikes come to the spot
    alert(L){ const free = bikes.filter(b => !b.case).sort((p, q) => Math.hypot(p.x - L.x, p.z - L.z) - Math.hypot(q.x - L.x, q.z - L.z)).slice(0, 2);
      if (!free.length) return; caseL = L;
      for (const b of free){ b.case = L; b.rider = true; b.mode = 'rush'; bikeRoute(b, L.x, L.z, 3.2); b.until = performance.now() + 50000; } },
    // the drone has tagged them: the case bikes run them down
    onTag(L){ for (const b of bikes) if (b.case === L){ b.mode = 'pursue'; b.repath = 0; } },
    update(dt, time){
      const now = performance.now();
      for (const b of bikes){
        const L = b.case;
        if (b.mode === 'park'){
          b.rider = false; b.timer -= dt;
          if (b.timer <= 0){ b.timer = 70 + Math.random()*90;   // out on patrol: a few crossings somewhere in the city, then back
            const nodes = typeof patrolNodes !== 'undefined' ? patrolNodes : [];
            if (nodes.length && bikes.filter(q => q.mode !== 'park').length < 2){ b.rider = true; b.mode = 'patrol'; b.legs = 3 + Math.floor(Math.random()*3); const t = nodes[Math.floor(Math.random()*nodes.length)]; bikeRoute(b, t.x, t.z, 1.7); } }
        }
        // moving along the path
        if (b.path && b.mode !== 'park' && b.mode !== 'enter'){
          b.s = Math.min(b.path.len, b.s + dt*b.speed);
          const P = b.path; let k = 1; while (k < P.cum.length - 1 && P.cum[k] < b.s) k++;
          const a = P.pts[k - 1], c = P.pts[k] || a, seg = P.cum[k] - P.cum[k - 1] || 1, u = Math.min(1, (b.s - P.cum[k - 1])/seg);
          b.x = a[0] + (c[0] - a[0])*u; b.z = a[1] + (c[1] - a[1])*u;
          const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz); if (l > 1e-3){ const tx = dx/l, tz = dz/l; b.hx += (tx - b.hx)*Math.min(1, dt*6); b.hz += (tz - b.hz)*Math.min(1, dt*6); }
          b.y += (BIKE_Y - b.y)*Math.min(1, dt*3);
        }
        const done = !b.path || b.s >= b.path.len - 1e-3;
        if (b.mode === 'patrol' && done){ if (--b.legs > 0) sweep(b, b.x, b.z, 14, 1.7) || home(b); else home(b); }
        else if (b.mode === 'rush' && done){ b.mode = 'search'; sweep(b, L ? L.x : b.x, L ? L.z : b.z, 6, 2.0); }
        else if (b.mode === 'search'){
          if (done) sweep(b, L ? L.x : b.x, L ? L.z : b.z, 6, 2.0);
          if (now > b.until || !L || L.state === 'away'){ b.case = null; home(b); }
        }
        else if (b.mode === 'pursue'){
          if (!L || L.state === 'away' || L.state === 'caught'){ if (L && L.state === 'caught' && L.bike !== b){ b.mode = 'guard'; b.until = now + 45000; sweep(b, b.x, b.z, 6, 1.6); } else { b.case = null; home(b); } }
          else {
            const d = Math.hypot(L.x - b.x, L.z - b.z);
            if (d < .45){ L.state = 'caught'; L.bike = b; b.passenger = L; b.case = null; home(b); }   // got them: onto the pillion
            else if (d < 1.4){ b.go([[b.x, b.z], [L.x, L.z]], 3.4); }   // close: straight at them
            else if ((b.repath -= dt) <= 0){ b.repath = 1.2; bikeRoute(b, L.x, L.z, 3.4, true); }
          }
        }
        else if (b.mode === 'guard'){ if (done) sweep(b, b.x, b.z, 7, 1.5); if (now > b.until){ b.case = null; home(b); } }
        else if (b.mode === 'home' && done){
          b.x = b.pad.x; b.z = b.pad.z; b.hx = b.pad.fx; b.hz = b.pad.fz;
          if (b.passenger){ b.mode = 'enter'; b.t = 0; } else { b.mode = 'park'; b.rider = false; }
        }
        else if (b.mode === 'enter'){   // the officer takes the mugger in: both fade through the station doors
          // they get off and walk to the door together (people.js draws the walk from b.walkIn), fading in the doorway
          const door = m.stationDoor || b.pad, dist = Math.hypot(door.x - b.pad.x, door.z - b.pad.z), dur = dist/.9;
          b.t += dt; b.walkIn = { x0: b.pad.x, z0: b.pad.z, x1: door.x, z1: door.z, u: Math.min(1, b.t/dur) };
          b.alpha = Math.max(0, Math.min(1, 1 - (b.t - dur + .5)/.6));
          if (b.t > dur + .15){ b.walkIn = null; const Lp = b.passenger; if (Lp){ Lp.state = 'away'; Lp.tagged = false; Lp.bike = null; Lp.until = (typeof pplNow !== 'undefined' ? pplNow : 0) + 400 + Math.random()*400; Lp.x = Lp.home.x; Lp.z = Lp.home.z; }
            b.passenger = null; b.rider = false; b.alpha = 1; b.mode = 'park'; }
        }
        if (b.mode === 'park') b.y += (CURB + .08 - b.y)*Math.min(1, dt*2);
        // the sprite: the view that matches the heading as the camera sees it
        const ax = b.hx*_bkR.x + b.hz*_bkR.z, az = -(b.hx*_bkF.x + b.hz*_bkF.z);
        const oct = ((Math.round(Math.atan2(ax, az)/(Math.PI/4)) % 8) + 8) % 8, view = PBIKE_VIEWS[oct], [w, h] = PBIKE_SIZE[view];
        b.mat.map = PBIKE_TEX[oct]; b.mat.color.copy(FOL_UNI.tint.value);
        const bob = b.mode === 'park' ? 0 : Math.sin(time*3 + b.idx)*.02;
        b.spr.position.set(b.x, b.y + bob, b.z); b.spr.scale.set(w/PX*BIKE_K, h/PX*BIKE_K, 1);
        b.hum.position.set(b.x, b.y - .02, b.z); b.hum.material.opacity = (b.mode === 'park' ? .15 : .5)*(.85 + .15*Math.sin(time*20 + b.idx));
        b.ry = b.y + bob;
        // the light bar flashes red and blue whenever the bike is on the move (faster and brighter on a call),
        // the red lamp on one side and the blue on the other, each with a quick double flash
        const moving = b.mode !== 'park' && b.mode !== 'enter', call = b.mode === 'rush' || b.mode === 'pursue' || b.mode === 'search' || (b.passenger && b.mode === 'home');
        const ph = (time*(call ? 2.6 : 1.6) + b.idx*.37) % 1, red2 = ph < .5, f = (ph % .5)/.5, flash = f < .18 || (f > .3 && f < .48);
        b.siren.material.color.setHex(red2 ? 0xff2030 : 0x2a6cff); b.siren.material.opacity = moving && flash ? (call ? .95 : .7)*b.alpha : 0;
        const side = (red2 ? -1 : 1)*.13;
        b.siren.position.set(b.x - b.hx*.15 + _bkR.x*side, b.ry + h/PX*BIKE_K*.8, b.z - b.hz*.15 + _bkR.z*side);
      }
    },
    dispose(){ for (const b of bikes){ scene.remove(b.spr, b.hum, b.siren); b.mat.dispose(); b.hum.material.dispose(); b.siren.material.dispose(); if (b.passenger){ b.passenger.state = 'away'; b.passenger = null; } } POLICE_BIKES = POLICE_BIKES.filter(b => !bikes.includes(b)); },
  };
  return api;
}
const _bkR = new THREE.Vector3(), _bkF = new THREE.Vector3();
// Every police station standing: people.js calls policeDroneAlert at a mugging, and the nearest station answers.
// Each station's drones patrol the crossings nearer to it than to any other station.
const POLICE_STATIONS = [];
let policeDroneAlert = null, policeCrew = null;
function policeWire(){
  policeCrew = POLICE_STATIONS.length ? POLICE_STATIONS[0].crew : null;
  policeDroneAlert = POLICE_STATIONS.length ? (L => {
    const by = POLICE_STATIONS.slice().sort((a, b) => Math.hypot(a.m.x - L.x, a.m.z - L.z) - Math.hypot(b.m.x - L.x, b.m.z - L.z));
    return by[0].alert(L);
  }) : null;
}
function policeFx(m){
  if (!wantedTex){ wantedTex = new THREE.TextureLoader().load('assets/sprites/wanted.png'); wantedTex.magFilter = wantedTex.minFilter = THREE.NearestFilter; wantedTex.generateMipmaps = false; }
  const parts = [], screens = [];
  (m.screens || []).forEach((sc, k) => {
    const u = { map: { value: wantedTex }, frame: { value: (k*2) % WANTED_N }, prevFrame: { value: 0 }, glitch: { value: 0 }, seed: { value: k*13 }, time: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: KOI_SHADER.vertexShader, fragmentShader: WANTED_FRAG });
    const sw = Math.min(sc.w, sc.h*WANTED_W/WANTED_H), sh = sw*WANTED_H/WANTED_W;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), mat);
    mesh.matrixAutoUpdate = false; mesh.matrix.fromArray(sc.m); mesh.matrixWorldNeedsUpdate = true; mesh.layers.set(1); mesh.renderOrder = 3;
    scene.add(mesh); parts.push(mesh);
    screens.push({ u, hold: 2 + k*1.3 + Math.random()*2, burst: 0, stray: 1 + Math.random()*3 });
  });
  // the light bar: a red and a blue lamp that alternate, each with a halo
  const bar = new THREE.Group(); bar.matrix.fromArray(m.lightbar.m); bar.matrix.decompose(bar.position, bar.quaternion, bar.scale);
  const mk = (col, x) => { const lm = new THREE.MeshBasicMaterial({ color: col }); const b = new THREE.Mesh(new THREE.BoxGeometry(.5, .14, .24), lm); b.position.x = x;
    const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s2.scale.set(2.2, 2.2, 1); s2.position.x = x;
    b.layers.set(1); s2.layers.set(1); bar.add(b, s2); return { b, s2, lm }; };
  const red = mk(0xff2030, -.32), blue = mk(0x2a6cff, .32);
  scene.add(bar); parts.push(bar);
  // the radar: a turntable carrying a tilted dish with a feed horn, a phased-array panel on its back and a sensor
  // dome, sweeping round; a cyan scan light pulses across the array as it turns
  const radar = new THREE.Group(); radar.matrix.fromArray(m.radar.m); radar.matrix.decompose(radar.position, radar.quaternion, radar.scale);
  const head = new THREE.Group(); radar.add(head);
  const add = (geo, mat, x, y, z, sx, sy, sz, rx2 = 0, ry2 = 0, rz2 = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx2, ry2, rz2); head.add(o); return o; };
  add(U.cyl16, M.polDark, 0, 0, 0, .9, .1, .9);
  add(U.box, M.polWall2, 0, .25, 0, .5, .4, .3);
  add(U.dish, M.polWall, 0, .55, .2, 1.6, 1.6, 1.6, .95);                       // the dish, tilted up and forward
  add(U.cyl16, M.polFrame, 0, .95, .62, .06, .5, .06, .95);
  add(U.box, M.polDark, 0, .7, -.3, 1.0, .75, .08, -.2);                        // the phased-array panel on the back
  const scanMat = new THREE.MeshBasicMaterial({ color: 0x38e8e0 });
  for (let k=0; k<4; k++) add(U.box, scanMat, 0, .44 + k*.17, -.36 - k*.035, .9, .025, .02, -.2);
  add(U.sph, M.polWall, .55, .45, 0, .32, .32, .32);                              // sensor dome
  add(U.box, M.blink, -.5, .5, 0, .07, .07, .07);
  head.traverse(o => { if (o.isMesh) o.layers.set(0); });
  scene.add(radar); parts.push(radar);
  // The drone crew. The city's street crossings are shared out between the drones as sectors (slices round the
  // middle of the city, so each drone has its own part); each sortie takes in the crossings of its sector that have
  // gone longest without a visit, in a sensible order, so between them they sweep the whole city over and over.
  const visits = new Map();   // crossing key -> when a drone last hovered over it
  const crew = {
    sectors: null, sig: '',
    split(n){
      const all = typeof patrolNodes !== 'undefined' ? patrolNodes : [];
      const sig = all.length + ':' + n + ':' + POLICE_STATIONS.length; if (this.sectors && sig === this.sig) return this.sectors;
      // this station's own beat: the crossings nearest to it
      const near = (c, st) => Math.hypot(c.x - st.m.x, c.z - st.m.z);
      const nodes = POLICE_STATIONS.length > 1 ? all.filter(c => POLICE_STATIONS.every(st => st.m === m || near(c, st) >= near(c, { m }))) : all;
      let cx = 0, cz = 0; for (const c of nodes){ cx += c.x; cz += c.z; } cx /= nodes.length || 1; cz /= nodes.length || 1;
      const sorted = nodes.slice().sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
      this.sectors = Array.from({ length: n }, (_, k) => sorted.slice(Math.floor(k*sorted.length/n), Math.floor((k + 1)*sorted.length/n)));
      this.sig = sig; return this.sectors;
    },
    plan(idx, from){
      const sec = this.split(drones.length)[idx] || []; if (!sec.length) return [];
      const n = Math.max(5, Math.min(10, Math.ceil(sec.length/2.5)));
      const pickd = sec.slice().sort((a, b) => ((visits.get(a.key) || 0) - (visits.get(b.key) || 0)) || (Math.random() - .5)).slice(0, n);
      const way = []; let x = from.x, z = from.z;   // nearest first, from where it is
      while (pickd.length){ let bi = 0, bd = Infinity; pickd.forEach((c, i) => { const d = (c.x - x)**2 + (c.z - z)**2; if (d < bd){ bd = d; bi = i; } }); const c = pickd.splice(bi, 1)[0]; way.push(c); x = c.x; z = c.z; }
      return way;
    },
    visited(c){ visits.set(c.key, performance.now()); },
    // the share of crossings a drone has hovered over in the last few minutes
    coverage(win = 300000){ const nodes = typeof patrolNodes !== 'undefined' ? patrolNodes : [], now = performance.now(); if (!nodes.length) return 0; return nodes.filter(c => now - (visits.get(c.key) || -1e9) < win).length/nodes.length; },
  };
  const drones = [];
  const pads = m.dronePads || [m.dronePad];
  for (let k = 0; k < Math.min(m.droneN || 1, pads.length); k++){ const d = policeDrone(m, k, pads[k], crew); drones.push(d); parts.push(d.g); }
  // now and then a drone is sent to a mugging: the nearest one that's free, unless they're all busy
  crew.size = drones.length;
  const bikes = policeBikes(m, crew);
  crew.onTag = L => bikes.onTag(L);
  const alert = L => {
    if (Math.random() > .7) return false;
    const free = drones.filter(d => !d.busy); if (!free.length) return false;
    free.sort((a, b) => Math.hypot(a.pos.x - L.x, a.pos.z - L.z) - Math.hypot(b.pos.x - L.x, b.pos.z - L.z));
    const sent = free[0].scramble(L);
    if (sent) bikes.alert(L);   // and two bikes come to the spot
    return sent;
  };
  const station = { m, crew, alert };
  POLICE_STATIONS.push(station); policeWire();
  const drone = drones[0];
  return {
    drone, drones, crew,
    update(dt, time){
      for (const s of screens){
        s.u.time.value = time; s.hold -= dt; s.stray -= dt;
        if (s.hold <= 0){ s.u.prevFrame.value = s.u.frame.value; s.u.frame.value = (s.u.frame.value + 1 + Math.floor(Math.random()*3)) % WANTED_N; s.hold = 4 + Math.random()*3; s.burst = .3; }
        if (s.stray <= 0){ s.burst = Math.max(s.burst, .08 + Math.random()*.08); s.stray = 2 + Math.random()*4; }
        s.burst = Math.max(0, s.burst - dt);
        s.u.glitch.value = s.burst > 0 ? Math.min(1, s.burst*4)*(.5 + .5*Math.random()) : 0;
        if (s.burst > 0 && Math.random() < .5) s.u.seed.value = Math.floor(Math.random()*997);
      }
      const ph = (time*2.2) % 2, a = ph < 1, flash = (time*14) % 1 < .6;   // alternate, with a quick double-flash
      red.b.visible = red.s2.visible = a && flash; blue.b.visible = blue.s2.visible = !a && flash;
      head.rotation.y = time*.55;
      for (const d of drones) d.update(dt, time);
      _bkR.set(1, 0, 0).applyQuaternion(cam.quaternion); _bkF.set(0, 0, -1).applyQuaternion(cam.quaternion); _bkF.y = 0; _bkF.normalize();
      bikes.update(dt, time);
      scanMat.color.setRGB(.22, .9, .88).multiplyScalar(.45 + .55*Math.abs(Math.sin(time*3)));
    },
    dispose(){ for (const p of parts){ scene.remove(p); if (p !== radar && !drones.some(d => d.g === p)) p.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } scanMat.dispose(); for (const d of drones) d.dispose(); bikes.dispose(); const k = POLICE_STATIONS.indexOf(station); if (k >= 0) POLICE_STATIONS.splice(k, 1); policeWire(); }
  };
}

/* ---------- the market mall ---------- */
// 彩虹广场 MALL, the Rainbow Plaza market, after the reference: a stacked, weathered market building on a 4x4 block,
// a size up from the police station and taller. Teal concrete gone patchy with rust, paint and graffiti. A ground
// floor of shops all the way round, with striped awnings and bright painted signboards; on its two street sides the
// produce stalls spill out under the awnings, crates of fruit and veg out front, sausages and garlic hanging, strings
// of bulbs. Above, a stepped floor of lit shops behind a terrace and a balcony (red lanterns, laundry, plants), then
// three masses on the roof: a tower capped by a big glass barrel vault behind a painted concrete hood, a smaller
// block with another vault and solar panels, and glass vaults over the front corners, lit warm from inside. A blue
// tarp over a rooftop cafe at the back, bikes and crates on the terraces, cables slung everywhere, a dish; and on
// top, the rainbow sign on its arch. The front is local +z and +x.
M.mkTeal = toon(0x3f8a80); M.mkTeal2 = toon(0x347670); M.mkTeal3 = toon(0x24504e); M.mkRust = toon(0x9a5634); M.mkRust2 = toon(0x7a4430);
const MK_PAINT = [0xd8508a, 0xe0803a, 0x8a5ac8, 0xe8c84a, 0x4ac0d0, 0xc84a4a, 0x6ac06a].map(h => toon(h));
const MK_STRIPE = [[0xe0508a, 0xf4e8d0], [0x2a9a8a, 0xf4e8d0], [0xe8803a, 0xf2cf3a], [0xd04040, 0xf4ece0], [0x3a7ac0, 0x8ad8e0], [0x8a5ac8, 0xf08ab8]].map(p => p.map(h => toon(h)));
const MK_RAINBOW = [0xe0508a, 0xe8803a, 0xf2cf3a, 0x2a9a8a, 0x3a7ac0].map(h => toon(h));
M.mkGlass = new THREE.MeshBasicMaterial({ color: 0xc4ece6, transparent: true, opacity: .17, depthWrite: false }); M.mkGlass.userData.colorOnly = true;
M.mkSolar = toon(0x24407a); M.mkSolarL = toon(0x6a8ac8); M.mkTarp = toon(0x3a78b8); M.mkTarp2 = toon(0x2e6298);
M.mkLit1 = toon(0x5a3a20, { em:0xffb05a, kind:'lamp' }); M.mkLit2 = toon(0x5a4024, { em:0xffc878, kind:'lamp' }); M.mkLit3 = toon(0x5a3420, { em:0xff9a4a, kind:'lamp' });
const MK_LIT = [M.mkLit1, M.mkLit2, M.mkLit3, M.mkLit1];   // warm market light, oranger than the sky mall's
const mkGoods = () => chance(.6) ? food() : pick([M.cloth1, M.cloth3, M.cloth4, M.awn1, M.awn2, M.white2, M.corrBlue, M.red2]);
// the vault: a glass half-cylinder along local x (open, radius 1, length 1), its half-disc ends, a half-ring rib
U.vault = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true, 0, PI); g.rotateZ(PI/2); return g; })();
U.vaultCap = new THREE.CircleGeometry(1, 16, 0, PI);
U.halfRing = new THREE.TorusGeometry(1, .022, 4, 16, PI);
// a glass barrel vault at (cx, y, cz), on a floor of lit market stalls
function mkVault(P, cx, y, cz, len, r, alongX){
  const Q = under(P, T(cx, y, cz, alongX ? 0 : PI/2));   // in Q the vault runs along x
  box(M.mkTeal3, Q, 0, -.05, 0, len + .12, .1, 2*r + .12);
  for (const s of [-1, 1]) for (let t = -len/2 + .35; t < len/2 - .25; t += rnd(.55, .8)){   // stalls along both sides, lit from behind
    box(pick(MK_LIT), Q, t, .42, s*(r - .3), .5, .75, .04);
    box(pick([M.wood, M.crate, M.metal, M.mkTeal2]), Q, t, .2, s*(r - .55), .44, .36, .34);
    for (let k=0; k<3; k++) box(mkGoods(), Q, t - .14 + k*.14, .42, s*(r - .55), .1, .08, .1);
  }
  for (let t = -len/2 + .4; t < len/2; t += .9){ glow(Q, t, r*.6, 0, 'warm', 1.1); if (chance(.5)) plant(pick(['bonsai','fern','bush','bamboo']), Q, t + .3, 0, rnd(-.2, .2), rnd(.7, .9)); }
  // the glass, its ribs and rails, a steel rim along the foot
  put(U.vault, M.mkGlass, under(Q, T(0, 0, 0, 0, len, r, r)));
  for (const s of [-1, 1]) put(U.vaultCap, M.mkGlass, under(Q, T(s*len/2, 0, 0, s*PI/2, r, r, 1)));
  const n = Math.max(3, Math.round(len/.5));
  for (let k=0; k<=n; k++) put(U.halfRing, M.mkTeal3, under(Q, T(-len/2 + k*len/n, 0, 0, PI/2, r, r, r)));
  for (const a of [PI*.18, PI*.4, PI*.6, PI*.82]) strut(M.mkTeal3, Q, -len/2, Math.sin(a)*r, Math.cos(a)*r, len/2, Math.sin(a)*r, Math.cos(a)*r, .035);
  strut(M.mkTeal3, Q, -len/2, r, 0, len/2, r, 0, .05);
  for (const s of [-1, 1]) for (const a of [PI*.35, PI*.65]) strut(M.mkTeal3, Q, s*len/2, 0, Math.cos(a)*r*.98, s*len/2, Math.sin(a)*r*.98, Math.cos(a)*r*.98, .03);   // mullions on the ends
  strut(M.mallGlint, Q, -len/2 + .1, Math.sin(PI*.3)*r + .01, Math.cos(PI*.3)*r, len/2 - .1, Math.sin(PI*.3)*r + .01, Math.cos(PI*.3)*r, .05);   // a glint
  for (const s of [-1, 1]) box(M.mkTeal2, Q, 0, .06, s*r, len + .12, .14, .12);
}
// worn paint, rust and old posters, as flat patches on a wall face. Every box is at least MIN_T thick (core.js), so
// a patch is placed by its outer face. Patches overlap, so each sits at its own depth (a couple of millimetres
// apart): two faces at the same depth fight over which is in front and flicker. With the default z they all stay
// behind the window glass, whose face stands about .04 out from the wall.
function mkPatches(F, len, y0, h, n, z = .015){
  const at = front => front - MIN_T/2;
  for (let k=0; k<n; k++){
    const w = rnd(.25, .9), hh = Math.min(h - .1, rnd(.15, .6));
    box(chance(.35) ? M.mkRust : chance(.2) ? M.mkTeal3 : pick(MK_PAINT), F, rnd(-len/2 + w/2, len/2 - w/2), rnd(y0 + hh/2 + .05, y0 + h - hh/2 - .05), at(z + .005 + .002*(k % 6)), w, hh, MIN_T);
  }
  for (let k=0; k<Math.round(len/2.5); k++) box(M.mkRust2, F, rnd(-len/2 + .2, len/2 - .2), y0 + h - rnd(.3, .6), at(z + .0175 + .001*(k % 2)), rnd(.06, .14), rnd(.3, .7), MIN_T);   // rust running down, over the paint
}
// a striped awning at t on face F: from the wall at height y, out and down
function mkAwning(F, t, y, w, out, drop, pal){
  const n = Math.max(3, Math.round(w/.19)), sw = w/n, L = Math.hypot(out, drop), a = Math.atan2(drop, out);
  for (let k=0; k<n; k++){
    const x = t - w/2 + (k + .5)*sw, mat = pal[k % pal.length];
    box(mat, F, x, y - drop/2, out/2, sw + .004, .03, L, 0, a);
    box(mat, F, x, y - drop - (k % 2 ? .05 : .07), out, sw, k % 2 ? .1 : .14, .02);   // scalloped valance
  }
  for (const s of [-1, 1]) strut(M.frame, F, t + s*(w/2 - .04), y - drop, out, t + s*(w/2 - .04), y - drop - .05, out - .02, .02);
}
// a produce stall under an awning: a table of tilted crates heaped with fruit and veg, more crates on the ground
function mkStall(F, t, w, y0){
  const z0 = .95, d = .55;
  box(M.wood, F, t, y0 + .46, z0, w, .05, d); box(M.crate, F, t, y0 + .22, z0 + d/2 - .03, w - .04, .4, .03);
  for (const s of [-1, 1]) for (const zz of [z0 - d/2 + .04, z0 + d/2 - .04]) box(M.frame, F, t + s*(w/2 - .04), y0 + .22, zz, .04, .44, .04);
  for (let x = t - w/2 + .16; x < t + w/2 - .1; x += .3) for (const [zz, tilt] of [[z0 - .12, 0], [z0 + .13, .3]]){
    const Q = under(F, T(x, y0 + .5, zz, 0, 1, 1, 1, tilt));
    box(chance(.6) ? M.crate : pick([M.awn2, M.corrBlue, M.red2]), Q, 0, .04, 0, .27, .08, .23);
    const fm = chance(.5) ? pick(VEG) : food();
    for (let q=0; q<4; q++) put(U.sph, chance(.85) ? fm : food(), under(Q, T(rnd(-.08, .08), .1, rnd(-.06, .06), 0, rnd(.08, .11), rnd(.06, .08), rnd(.08, .11))));
  }
  for (let k=0; k<Math.max(1, Math.round(w/.45)); k++){   // crates and tubs on the ground in front
    const x = t + rnd(-w/2 + .15, w/2 - .15), z = z0 + d/2 + rnd(.12, .25);
    if (chance(.7)){ box(chance(.6) ? M.crate : pick([M.awn2, M.corrBlue, M.red2]), F, x, y0 + .1, z, .26, .2, .2); for (let q=0; q<3; q++) put(U.sph, pick(VEG), under(F, T(x + rnd(-.07, .07), y0 + .21, z + rnd(-.05, .05), 0, .09, .07, .09))); }
    else put(U.cyl16, pick([M.wood, M.white2, M.awn1]), under(F, T(x, y0 + .1, z, 0, .22, .2, .22)));
  }
}
// a row of shopfronts along face F (+z out, the wall's face at z = 0), recessed under a fascia: lit interiors,
// shelves of goods, signboards, awnings; and on the street sides, stalls out front. The shop the block's side
// middle falls in is kept clear inside: that's the way in.
function mkShopRow(F, len, y0, h, o){
  const fy = y0 + h - .25;
  box(M.mkTeal, F, 0, fy, -.22, len, .5, .46);                                                   // fascia
  for (const s of [-1, 1]) box(M.mkTeal2, F, s*(len/2 - .22), y0 + h/2, -.22, .44, h, .46);      // corner piers
  const cuts = []; let a = -len/2 + .44;
  while (a < len/2 - .44 - .1){ let b = a + rnd(1.6, 2.5); if (len/2 - .44 - b < 1.2) b = len/2 - .44; cuts.push([a, b]); a = b; }
  cuts.forEach(([a, b], k) => {
    const tc = (a + b)/2, sw = b - a, entry = o.tmid >= a && o.tmid < b;
    if (k < cuts.length - 1) box(M.mkTeal2, F, b, y0 + (h - .5)/2, -.22, .14, h - .5, .46);    // pier between shops
    box(pick(MK_LIT), F, tc, y0 + (h - .5)/2, -.43, sw - .1, h - .52, .03);                     // the lit interior
    if (!entry){
      for (let s=0; s<3; s++){ const sy = y0 + .32 + s*.4; box(M.wood, F, tc, sy, -.35, sw - .22, .03, .14);
        for (let x = tc - sw/2 + .18; x < tc + sw/2 - .15; x += .13) if (chance(.8)) box(mkGoods(), F, x, sy + .06, -.35, .09, rnd(.07, .13), .1); }
      if (chance(.2)) box(M.shutter, F, tc, y0 + h - .75, -.06, sw - .1, .5, .03);               // a roll shutter half down
    }
    if (chance(o.signOdds ?? .85)){
      const kind = pick(MKT_SIGNS), [pw, ph] = SPR.size[kind], k = Math.min(.95, (sw - .3)*PX/pw, .62*PX/ph);
      plant(kind, F, tc + rnd(-.12, .12), fy, .06, k, 'c', true); glow(F, tc, fy, .3, MKT_GLOW[kind], .8 + k);
    }
    if (o.awning && chance(o.awnOdds ?? .9)) mkAwning(F, tc, y0 + h - .52, sw - .08, o.out || .95, o.drop || .32, chance(.3) ? MK_RAINBOW : pick(MK_STRIPE));
    if (o.stall && !entry){
      mkStall(F, tc, sw - .35, y0);
      const ey = y0 + h - .52 - (o.drop || .32);
      for (let x = tc - sw/2 + .15; x < tc + sw/2 - .1; x += .22){ box(M.bulb, F, x, ey - .1, (o.out || .95) - .06, .045, .05, .045); if (chance(.45)) glow(F, x, ey - .12, (o.out || .95), 'warm', .45); }
      if (chance(.7)) hangingFood(F, tc + rnd(-sw/3, sw/3), ey + .02, (o.out || .95) - .2);
    }
    else if (!entry && o.back && chance(.3)){ const x = tc + rnd(-sw/3, sw/3); box(pick([M.crate, M.corrBlue, M.metal]), F, x, y0 + .15, .25, .34, .3, .26); }
  });
  mkPatches(F, len, fy - .25, .5, Math.round(len/1.2), .025);
}
// an upper-floor wall: windows into lit shops and homes (or dark glass), sills, little awnings, AC units, plants,
// stretches of bare wall with graffiti
function mkUpperFace(F, len, y0, h, o = {}){
  const n = Math.max(1, Math.round(len/1.3)), seg = len/n;
  for (let k=0; k<n; k++){
    const t = -len/2 + (k + .5)*seg, ww = seg - .35, wh = h*.58, wy = y0 + h*.52;
    if (chance(o.bare ?? .2)){ if (chance(.7)) plant(pick(MKT_GRAF), F, t, wy, .06, rnd(.8, 1.1), 'c', true); continue; }
    box(chance(o.lit ?? .7) ? pick(MK_LIT) : M.glassDark, F, t, wy, .015, ww, wh, .03);
    box(M.mkTeal3, F, t, wy - wh/2 - .03, .07, ww + .12, .05, .14);                         // sill
    box(M.mkTeal3, F, t, wy + wh/2 + .02, .03, ww + .08, .05, .06);
    for (const s of ww > 1 ? [-1, 0, 1] : [-1, 1]) box(M.mkTeal3, F, t + s*ww/2, wy, .035, .04, wh, .04);
    if (chance(.3)) box(pick([M.tarp1, M.tarp2, M.tarp3, ...MK_STRIPE[k % MK_STRIPE.length]]), F, t, wy + wh/2 + .12, .2, ww + .1, .03, .42, 0, .35);
    if (chance(.35)){ const ax = t + rnd(-ww/3, ww/3); box(M.white2, F, ax, wy - wh/2 - .22, .14, .32, .22, .22); put(U.cyl16, M.metalDark, under(F, T(ax, wy - wh/2 - .22, .25, 0, .16, .01, .16, PI/2))); }
    if (chance(.4)) plant(pick(['bush','bushFlower','fern','succulent','bonsai']), F, t + rnd(-ww/3, ww/3), wy - wh/2, .1, rnd(.6, .85));
  }
  mkPatches(F, len, y0, h, Math.round(len*h/2.2));
  if (o.vines) for (let t = -len/2 + .3; t < len/2 - .2; t += rnd(.8, 1.6)) if (chance(.5)) plant(pick(['vines','pothos','h_ivy','h_vine3']), F, t, y0 + h, .05, rnd(.8, 1.1), 't', true);
}
// the four faces of a box at (cx, cz), w x d: [transform, length, which side, where the block's side middle falls]
function mkFaces(P, cx, cz, w, d){
  return [[under(P, T(cx, 0, cz + d/2, 0)), w, 'f', -cx], [under(P, T(cx, 0, cz - d/2, PI)), w, 'b', cx],
          [under(P, T(cx + w/2, 0, cz, PI/2)), d, 'r', cz], [under(P, T(cx - w/2, 0, cz, -PI/2)), d, 'l', -cz]];
}
// a parapet along a terrace edge (a to b, in P), with plants on it and now and then a glass rail
function mkParapet(P, ax, az, bx, bz, y, glass){
  const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), F = under(P, T((ax + bx)/2, 0, (az + bz)/2, ry));
  box(M.mkTeal2, F, 0, y + .2, 0, len, .4, .14); box(M.mkTeal3, F, 0, y + .41, 0, len + .04, .04, .18);
  for (const s of [1, -1]){ const G2 = under(F, T(0, 0, s*.075, s > 0 ? 0 : PI)); mkPatches(G2, len, y, .4, Math.round(len/1.4), .01); }
  if (glass){ box(M.mkGlass, F, 0, y + .7, 0, len, .5, .02); box(M.metalDark, F, 0, y + .96, 0, len, .03, .04); for (let t = -len/2; t <= len/2 + .01; t += 1.2) box(M.metalDark, F, t, y + .7, 0, .03, .55, .03); }
  for (let t = -len/2 + .3; t < len/2 - .2; t += rnd(.5, 1.0)){
    if (chance(.5)) plant(pick(['bush','bushFlower','fern','g_fern3','moss','bonsai']), F, t, y + .43, 0, rnd(.65, .9));
    if (chance(.3)) plant(pick(['vines','pothos','h_ivy','h_curtain1']), under(F, T(0, 0, .08)), t, y + .4, 0, rnd(.7, 1.0), 't', true);
  }
}
// a cable slung between two points (in P)
function mkCable(P, ax, ay, az, bx, by, bz, sag, t = .025){
  const n = 8; let px = ax, py = ay, pz = az;
  for (let k=1; k<=n; k++){ const u = k/n, x = ax + (bx - ax)*u, z = az + (bz - az)*u, y = ay + (by - ay)*u - sag*Math.sin(PI*u); strut(M.frame, P, px, py, pz, x, y, z, t); px = x; py = y; pz = z; }
}
// a laundry line: a cord between two points with clothes pegged along it
function mkLaundry(P, ax, ay, az, bx, by, bz){
  mkCable(P, ax, ay, az, bx, by, bz, .08, .015);
  const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax);
  for (let u = .3/len; u < 1 - .2/len; u += rnd(.28, .42)/len){ const F = under(P, T(ax + (bx - ax)*u, 0, az + (bz - az)*u, ry)); if (chance(.85)) plant(laundryKind(), F, 0, ay + (by - ay)*u - .08*Math.sin(PI*u) - .01, 0, rnd(.9, 1.1), 't', true); }
}
function mkBike(P, x, y, z, ry){
  const Q = under(P, T(x, y, z, ry)), c = pick([M.red2, M.awn2, M.cloth1, M.corrBlue, M.cloth4]);
  for (const s of [-1, 1]) put(U.torus, M.frame, under(Q, T(s*.24, .17, 0, 0, .34, .34, .34)));
  strut(c, Q, -.24, .17, 0, -.02, .17, 0, .03); strut(c, Q, -.02, .17, 0, .14, .38, 0, .03); strut(c, Q, -.24, .17, 0, -.06, .38, 0, .03);
  strut(c, Q, -.06, .38, 0, .14, .38, 0, .03); strut(c, Q, .14, .38, 0, .24, .17, 0, .025); strut(M.frame, Q, .14, .38, 0, .17, .46, 0, .02);
  box(M.frame, Q, .17, .46, 0, .03, .03, .2); box(M.frame, Q, -.08, .42, 0, .12, .03, .06);
}
function mkTable(P, x, y, z, umbrella){
  put(U.cyl16, M.white2, under(P, T(x, y + .3, z, 0, .42, .03, .42))); cyl(M.frame, P, x, y + .15, z, .02, .3);
  for (let k=0; k<3; k++){ const a = rnd(0, TAU); cyl(pick([M.red2, M.awn2, M.white2, M.awn3]), P, x + Math.cos(a)*.34, y + .1, z + Math.sin(a)*.34, .06, .2); }
  foodBowl(P, x + rnd(-.08, .08), y + .31, z + rnd(-.08, .08), .05);
  if (umbrella){ cyl(M.frame, P, x, y + .6, z, .012, .6); put(U.cone, pick([M.awn1, M.awn2, M.awn3, ...MK_PAINT]), under(P, T(x, y + .98, z, 0, .85, .2, .85))); }
}
function mkCrates(P, x, y, z, n = 3){
  for (let k=0; k<n; k++){ const ry = rnd(0, PI); box(pick([M.crate, M.crate, M.wood, M.corrBlue, M.awn2]), under(P, T(x + rnd(-.25, .25), 0, z + rnd(-.25, .25), ry)), 0, y + .12 + (k > 1 && chance(.5) ? .24 : 0), 0, rnd(.24, .34), .24, rnd(.2, .3)); }
}
function mkPotted(P, x, y, z){ put(U.cyl16, pick([M.pot, M.mkTeal3, M.white2]), under(P, T(x, y + .1, z, 0, .26, .2, .26))); plant(pick(['bush','bushFlower','fern','bonsai','bamboo','g_fern3']), P, x, y + .2, z, rnd(.8, 1.05)); }
function buildMarketMall(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), H = 2*LOT, Y = CURB;   // the street fronts are local +z and +x
  // ---- ground: worn paving, darker under the stalls
  box(G.asph, P, 0, .012, 0, 2*H, .025, 2*H);
  const nt = 19, st = 2*H/nt;
  for (let a=0; a<nt; a++) for (let b=0; b<nt; b++) if (!chance(.04)) box(pick(TILES.mid), P, -H + (a + .5)*st, .03, -H + (b + .5)*st, st - .05, .045, st - .05);
  // ---- tier 0: the ground floor of shops, stalls on the two street sides
  const x0 = -6.6, x1 = 5.4, z0 = -6.6, z1 = 4.4, cx0 = (x0 + x1)/2, cz0 = (z0 + z1)/2, w0 = x1 - x0, d0 = z1 - z0, h0 = 2.0;
  box(M.mkTeal, P, cx0, Y + h0/2, cz0, w0 - .9, h0, d0 - .9);
  for (const [F, len, side, tmid] of mkFaces(P, cx0, cz0, w0, d0)){
    const street = side === 'f' || side === 'r';
    mkShopRow(F, len, Y, h0, { tmid, awning: true, stall: street, back: !street, out: street ? .95 : .6, drop: street ? .32 : .22, awnOdds: street ? .95 : .6, signOdds: street ? .9 : .6 });
  }
  const y1 = Y + h0 + .18;
  box(M.mkTeal3, P, cx0, Y + h0 + .09, cz0, w0 + .2, .18, d0 + .2);                               // floor slab, a ledge all round
  // a corner fruit stand where the two street sides meet
  { const F = under(P, T(x1 + .55, 0, z1 + .55, PI/4));
    for (let k=0; k<3; k++){ box(M.wood, F, 0, Y + .2 + k*.16, -k*.16, 1.0, .05, .3); for (let q=0; q<4; q++) put(U.sph, pick(VEG), under(F, T(-.36 + q*.24, Y + .27 + k*.16, -k*.16, 0, .14, .1, .14))); }
    box(M.crate, F, 0, Y + .1, -.1, 1.0, .2, .6); }
  // ---- tier 1: set back from the street sides, leaving a terrace along the front and a balcony on the side
  const bx0 = -6.6, bx1 = 4.6, bz0 = -6.6, bz1 = 3.2, cx1 = (bx0 + bx1)/2, cz1 = (bz0 + bz1)/2, w1 = bx1 - bx0, d1 = bz1 - bz0, h1 = 1.75;
  for (const [F, len, side, tmid] of mkFaces(P, cx1, cz1, w1, d1)){
    if (side === 'f' || side === 'r') mkShopRow(F, len, y1, h1, { tmid: 99, awning: true, awnOdds: .5, out: .55, drop: .22, signOdds: .6 });
    else mkUpperFace(F, len, y1, h1, { lit: .6 });
  }
  box(M.mkTeal, P, cx1 - .225, y1 + h1/2, cz1 - .225, w1 - .45, h1, d1 - .45);   // recessed only on the shop sides
  const y2 = y1 + h1 + .18;
  box(M.mkTeal3, P, cx1, y1 + h1 + .09, cz1, w1 + .2, .18, d1 + .2);
  // the front terrace and side balcony (on the ground floor's roof)
  mkParapet(P, x0 + .1, z1 - .05, x1 - .05, z1 - .05, y1, false);
  mkParapet(P, x1 - .05, z1 - .05, x1 - .05, z0 + .1, y1, false);
  mkLaundry(P, -5.8, y1 + 1.35, 3.85, -2.2, y1 + 1.35, 3.85); cyl(M.frame, P, -5.8, y1 + .7, 3.85, .02, 1.4); cyl(M.frame, P, -2.2, y1 + .7, 3.85, .02, 1.4);
  mkLaundry(P, .2, y1 + 1.3, 3.9, 3.6, y1 + 1.25, 3.9); cyl(M.frame, P, .2, y1 + .67, 3.9, .02, 1.3); cyl(M.frame, P, 3.6, y1 + .65, 3.9, .02, 1.3);
  for (let x = x0 + .4; x < x1 - .3; x += .25){ box(M.bulb, P, x, y1 + 1.55 - .1*Math.sin(PI*((x - x0)%3/3)), z1 - .2, .04, .05, .04); if (chance(.3)) glow(P, x, y1 + 1.5, z1 - .1, 'warm', .4); }
  lanternString(P, x1 - .25, y1 + 1.5, z1 - .3, x1 - .25, y1 + 1.5, -1.2, .18);
  lanternString(P, x1 - .25, y1 + 1.5, -1.6, x1 - .25, y1 + 1.5, z0 + .4, .18);
  for (let k=0; k<3; k++) hangingFood(P, x1 - .25, y1 + 1.45, rnd(z0 + 1, z1 - 1));
  for (let k=0; k<4; k++){ const x = rnd(x0 + .6, x1 - 1); if (chance(.5)) mkCrates(P, x, y1, 3.75, 2); else mkPotted(P, x, y1, 3.8); }
  for (let k=0; k<5; k++) box(M.white2, P, bx1 + .2, y1 + .2, rnd(z0 + .5, z1 - .5), .26, .32, .4);   // AC units on the balcony
  // ---- tier 2: the roof masses
  // the tower: two more floors, the big signboard on its front
  const tx0 = -3.0, tx1 = 1.8, tz0 = -6.2, tz1 = -.6, tcx = (tx0 + tx1)/2, tcz = (tz0 + tz1)/2, tw = tx1 - tx0, td = tz1 - tz0, th = 2.4;
  box(M.mkTeal, P, tcx, y2 + th/2, tcz, tw, th, td);
  for (const [F, len, side] of mkFaces(P, tcx, tcz, tw, td)){
    mkUpperFace(F, len, y2, th/2, { lit: .8, bare: side === 'b' ? .4 : .15 }); mkUpperFace(F, len, y2 + th/2, th/2, { lit: .75, bare: .25, vines: true });
    box(M.mkTeal3, F, 0, y2 + th/2, .05, len + .06, .06, .1);
  }
  { const F = under(P, T(tcx, 0, tz1, 0)); box(M.mkTeal3, F, -1.1, y2 + th - .38, .05, 1.65, .05, .1); plant('sign_mkt16', F, -1.1, y2 + th - .7, .1, 1.15, 'c', true); glow(F, -1.1, y2 + th - .7, .4, 'orange', 2.0);
    const Fr = under(P, T(tx1, 0, tcz, PI/2)); plant('sign_mkt17', Fr, 1.4, y2 + th/2 + .05, .1, 1.0, 'c', true); glow(Fr, 1.4, y2 + th/2, .4, 'orange', 1.8); }
  const yT = y2 + th + .18;
  box(M.mkTeal3, P, tcx, y2 + th + .09, tcz, tw + .16, .18, td + .16);
  // on the tower: the big glass vault behind a painted concrete hood, and the rainbow sign on its arch
  const vx = tcx, vy = yT + .3;
  box(M.mkTeal2, P, vx, yT + .15, tcz, 4.0, .3, td - .2);
  mkVault(P, vx, vy, -3.85, 4.3, 1.8, false);
  put(U.vault, M.mkTeal, under(P, T(vx, vy, -1.2, PI/2, 1.0, 1.95, 1.95)));
  put(U.vaultCap, M.mkTeal, under(P, T(vx, vy, -.7, 0, 1.95, 1.95, 1))); put(U.vaultCap, M.mkTeal2, under(P, T(vx, vy, -1.7, PI, 1.95, 1.95, 1)));
  for (const z of [-.72, -1.68]) put(U.halfRing, M.mkTeal3, under(P, T(vx, vy, z, 0, 1.97, 1.97, 1.97)));
  for (let k=0; k<3; k++) put(U.vault, pick([...MK_PAINT, M.mkRust]), under(P, T(vx, vy, rnd(-1.6, -.85), PI/2, rnd(.12, .3), 1.965, 1.965)));   // paint bands over the hood
  { const F = under(P, T(vx, 0, -.69, 0));   // the hood's face: a lit window, patches, graffiti
    box(M.mkLit2, F, 0, vy + .6, .005, 2.2, .8, .02); for (let t = -1.1; t <= 1.11; t += .55) box(M.mkTeal3, F, t, vy + .6, .02, .04, .82, .03);
    box(M.mkTeal3, F, 0, vy + .2, .025, 2.3, .05, .05); box(M.mkTeal3, F, 0, vy + 1.0, .02, 2.3, .04, .04);
    for (let k=0; k<6; k++){ const a = rnd(.2, PI - .2), rr = rnd(1.15, 1.7), w = rnd(.2, .5); box(chance(.4) ? M.mkRust : pick(MK_PAINT), F, Math.cos(a)*rr, vy + Math.sin(a)*rr, .034 + .002*k - MIN_T/2, w, rnd(.15, .35), MIN_T); }
    plant(pick(MKT_GRAF), F, rnd(-.6, .6), vy + 1.45, .06, 1.0, 'c', true); }
  const yA = yT + 2.3, ax = 2.15;
  for (const s of [-1, 1]){ box(M.metalDark, P, vx + s*ax, (yT + yA)/2, -.66, .09, yA - yT, .09); box(M.metalDark, P, vx + s*(ax - .15), (yT + yA)/2, -.66, .06, yA - yT, .06); }
  put(U.halfRing, M.metalDark, under(P, T(vx, yA, -.66, 0, ax, ax, ax*1.5))); put(U.halfRing, M.metalDark, under(P, T(vx, yA, -.66, 0, ax - .15, ax - .15, (ax - .15)*1.5)));
  for (let k=1; k<12; k++){ const a = k*PI/12; strut(M.metalDark, P, vx + Math.cos(a)*ax, yA + Math.sin(a)*ax, -.66, vx + Math.cos(a)*(ax - .15), yA + Math.sin(a)*(ax - .15), -.66, .025); }
  plant('sign_mktroof', P, vx, yA + 1.0, -.6, .75, 'c', true);
  glow(P, vx - .8, yA + 1.2, -.4, 'pink', 1.6); glow(P, vx + .2, yA + 1.2, -.4, 'amber', 1.5); glow(P, vx + .9, yA + .7, -.4, 'pink', 1.3); glow(P, vx - .3, yA + .7, -.4, 'cyan', 1.2);
  // the front-left corner: a glass vault on a lit plinth, over the terrace
  box(M.mkTeal2, P, -4.8, y2 + .25, 1.7, 3.4, .5, 2.8);
  { const F = under(P, T(-4.8, 0, 3.1, 0)); box(M.mkLit2, F, 0, y2 + .27, .01, 3.0, .3, .02); mkPatches(F, 3.4, y2, .5, 3, .02); }
  mkVault(P, -4.8, y2 + .5, 1.7, 3.2, 1.3, true);
  // the back-left: a rooftop cafe under a blue tarp
  for (const [x, z] of [[-6.3, -5.9], [-3.3, -5.9], [-6.3, -2.6], [-3.3, -2.6]]) cyl(M.frame, P, x, y2 + .8, z, .03, 1.6);
  put(U.vault, M.mkTarp, under(P, T(-4.8, y2 + 1.6, -4.25, 0, 3.3, .45, 1.85)));
  for (const s of [-1, 1]) box(M.mkTarp2, P, -4.8, y2 + 1.58, -4.25 + s*1.82, 3.3, .1, .05);
  for (const [x, z, u] of [[-5.6, -5.0, false], [-4.0, -4.6, false], [-5.2, -3.3, false], [-4.4, -1.4, true], [-5.8, -.8, true]]) mkTable(P, x, y2, z, u);
  for (let x = -6.2; x < -3.3; x += .25){ box(M.bulb, P, x, y2 + 1.42, -2.55, .04, .05, .04); if (chance(.4)) glow(P, x, y2 + 1.4, -2.5, 'warm', .4); }
  mkParapet(P, bx0 + .08, -6.5, bx0 + .08, .3, y2, true); mkParapet(P, bx0 + .08, bz0 + .08, tx0 - .1, bz0 + .08, y2, true);
  for (let k=0; k<4; k++) mkPotted(P, rnd(-6.2, -3.4), y2, rnd(-2.2, -.1));
  // the front terrace on the first floor's roof: bikes, crates, plants, a cable or two
  mkParapet(P, tx0 - .2, bz1 - .08, bx1 - .05, bz1 - .08, y2, true);
  mkBike(P, -1.6, y2, .6, .3); mkBike(P, .5, y2, 2.4, -.2);
  mkCrates(P, -2.4, y2, 2.4, 3); mkCrates(P, 1.2, y2, .2, 2); mkTable(P, -.4, y2, 1.6, true);
  for (let k=0; k<5; k++) mkPotted(P, rnd(-2.8, 1.6), y2, rnd(-.3, 2.8));
  mkLaundry(P, -2.6, y2 + 1.2, -.3, 1.4, y2 + 1.2, -.3);
  for (let x = tx0; x < tx1; x += .25){ box(M.bulb, P, x, y2 + 1.55 - .25*Math.sin(PI*(x - tx0)/tw), 2.9, .04, .05, .04); if (chance(.35)) glow(P, x, y2 + 1.5, 2.95, 'warm', .4); }
  // the right: a block with a vault and solar panels behind, a smaller vault in front
  const rx0 = 1.8, rx1 = 4.6, rz0 = -6.6, rz1 = -2.4, rcx = (rx0 + rx1)/2, rcz = (rz0 + rz1)/2, rw = rx1 - rx0, rd = rz1 - rz0, rh = 1.6;
  box(M.mkTeal, P, rcx, y2 + rh/2, rcz - .225, rw, rh, rd - .45);
  for (const [F, len, side] of mkFaces(P, rcx, rcz, rw, rd)){
    if (side === 'f'){ mkShopRow(F, len, y2, rh, { tmid: 99, awning: true, awnOdds: 1, out: .4, drop: .2, signOdds: 1 }); mkLaundry(F, -len/2 + .2, y2 + 1.2, .3, len/2 - .2, y2 + 1.15, .3); }
    else if (side !== 'l') mkUpperFace(F, len, y2, rh, { lit: .65, vines: true });
  }
  const yR = y2 + rh + .15;
  box(M.mkTeal3, P, rcx, y2 + rh + .075, rcz, rw + .16, .15, rd + .16);
  box(M.mkTeal2, P, rcx, yR + .1, -4.9, rw - .1, .2, 3.1);
  mkVault(P, rcx, yR + .2, -4.9, 2.6, 1.5, true);
  { const F = under(P, T(rcx, 0, -3.3, 0)); box(M.mkRust, F, 0, yR + .1, .01, 2.6, .18, .02); }
  for (const x of [2.4, 3.5]){ const Q = under(P, T(x, yR, -2.95, 0, 1, 1, 1, -.5));   // solar panels, tilted to the sun
    box(M.frame, P, x, yR + .15, -2.95, .9, .3, .1); box(M.mkSolar, Q, 0, .32, 0, 1.0, .03, .62);
    for (let k=1; k<4; k++) box(M.mkSolarL, Q, -.5 + k*.25, .34, 0, .015, .01, .62); box(M.mkSolarL, Q, 0, .34, 0, 1.0, .01, .015); }
  dish(P, 4.25, yR, -2.75, .4, -.6, -.5, true);
  // the smaller vault on the front-right, on a plinth with a painted banner
  box(M.mkTeal2, P, 3.2, y2 + .25, -.55, 2.8, .5, 2.6);
  { const F = under(P, T(3.2, 0, .75, 0)); box(MK_PAINT[3], F, 0, y2 + .26, .01, 2.6, .42, .02); plant(pick(MKT_GRAF), F, 0, y2 + .27, .06, .85, 'c', true);
    const Fr = under(P, T(4.6, 0, -.55, PI/2)); box(MK_PAINT[1], Fr, 0, y2 + .26, .01, 2.4, .42, .02); }
  mkVault(P, 3.2, y2 + .5, -.55, 2.6, 1.2, false);
  // cables everywhere: slung across the facades and between the roof masses
  for (let k=0; k<3; k++){ const o = k*.08; mkCable(P, x0 + .3, y1 - .3 - o, z1 + .05 + o, -1.2, y1 - .15 - o, z1 + .05 + o, .5 + k*.12); mkCable(P, -1.2, y1 - .15 - o, z1 + .05 + o, x1 - .3, y1 - .3, z1 + .05 + o, .4 + k*.1); }
  for (let k=0; k<3; k++) mkCable(P, x1 + .05 + k*.06, y1 - .2, z1 - .4, x1 + .05 + k*.06, y1 - .3, z0 + .5, .6 + k*.15);
  for (let k=0; k<2; k++){ const o = k*.08; mkCable(P, x0 - .05, y2 - .1, -5.5 + o, x0 - .05 - o, Y + 1.5, .5, .3); }
  mkCable(P, tx1, yT - .2, -1.0, rx1 - .3, y2 + .9, .3, .25); mkCable(P, tx0, yT - .3, -1.0, -4.8, y2 + 1.6, .2, .3);
  for (let k=0; k<3; k++) mkCable(P, x0 - .04, y1 - .2, rnd(-5, 2), x0 - .04, Y + rnd(.6, 1.2), rnd(-5, 2), .1);   // drops down the side
  // the back: bins and a fire escape ladder
  for (let k=0; k<4; k++) put(U.cyl16, pick([M.awn2, M.corrBlue, M.metalDark]), under(P, T(rnd(-5, 4), Y + .25, z0 - .45, 0, .4, .5, .4)));
  for (let y = Y + .3; y < y2; y += .3) box(M.frame, P, 2.6, y, z0 - .08, .4, .03, .03);
  box(M.frame, P, 2.4, (Y + y2)/2, z0 - .08, .03, y2 - Y, .03); box(M.frame, P, 2.8, (Y + y2)/2, z0 - .08, .03, y2 - Y, .03);
  // greenery taking over the ledges
  for (const [F, len] of mkFaces(P, cx0, cz0, w0 + .2, d0 + .2)) for (let t = -len/2 + .4; t < len/2 - .3; t += rnd(.9, 1.8)) if (chance(.35)) plant(pick(['vines','pothos','h_ivy','h_vine3','h_curtain2']), F, t, Y + h0 + .12, .03, rnd(.7, 1.0), 't', true);
  for (const [F, len] of mkFaces(P, cx1, cz1, w1 + .2, d1 + .2)) for (let t = -len/2 + .4; t < len/2 - .3; t += rnd(.8, 1.7)) if (chance(.3)) plant(pick(['vines','pothos','h_ivy','h_vine3','h_curtain1','h_heart']), F, t, y1 + h1 + .12, .03, rnd(.8, 1.1), 't', true);
  m.roofH = yT;
  m.top = yA + ax + .4;
}

/* ---------- the cloud pagoda ---------- */
// A luxury megastructure on a 5x4 block, after the reference: a white stepped palace climbing to a two-tier pagoda.
// A raised podium with stairs up the front between two wings, then four rounded terraced levels, each a floor of
// glass lit warm under a white slab with a thin cyan light line and corners swept up like eaves. Every terrace is a
// Japanese garden: bonsai pines, bamboo, mossy rocks, lily ponds and stone lanterns behind a glass rail, with glass
// domes on the terraces. White piers carry gold chevron frames; on top, a lit hall under a white pagoda roof with
// upturned corners and gold hips, a smaller hall and roof above it, and a gold spire. Hover cars are parked on pads
// cantilevered off the podium. Its front is local +z; the long side runs along x.
M.pgPine = toon(0x3c6638, { flat:1 }); M.pgPine2 = toon(0x557f48, { flat:1 }); M.pgRock = toon(0xbfc2bc, { flat:1 }); M.pgRock2 = toon(0x9ea29c, { flat:1 });
M.pgMoss = toon(0x6f9a48, { flat:1 }); M.pgGoldLit = toon(0xb98a3a, { em:0x6a4a18, kind:'trim' });
M.pgNeon = toon(0x2a8a92, { em:0x52e6f2, kind:'lamp' });   // the blue strip lighting: lit day and night, steady (no flicker)
U.pgArchRing = new THREE.TorusGeometry(1, .09, 4, 14, PI);
U.pgBay = new THREE.SphereGeometry(1, 16, 8, 0, PI, 0, PI/2);   // a quarter sphere bulging out along +z
// a neon strip round a rounded plate's rim, with halos along it
function pgNeonRing(P, x, y, z, w, d, r, t = .05){
  lxPlate(M.pgNeon, P, x, y, z, w, d, r, t);
  for (const p of lxRing(w, d, r, 2.2)) glow(P, x + p.x*1.01, y, z + p.z*1.01, 'cyan', .7);
}
// an arched entrance on face F (local +z out): a lit doorway with a round top in a white frame, a gold outline and
// chevron, blue strips either side
function pgArch(F, x, y, z, w, h){
  const r = w/2, hs = Math.max(.1, h - r);
  box(M.lxRoom, F, x, y + hs/2, z, w - .06, hs, MIN_T);
  put(U.vaultCap, M.lxRoom, under(F, T(x, y + hs, z + .002, 0, r - .03, r - .03, 1)));
  box(M.frame, F, x, y + hs*.45, z + .01, .03, hs*.9, MIN_T);                                        // the doors' meeting line
  for (const s of [-1, 1]){ box(M.lxWhite, F, x + s*(r + .06), y + hs/2, z + .04, .12, hs, .12); box(M.gold, F, x + s*(r - .05), y + hs/2, z + .03, .04, hs, MIN_T);
    box(M.pgNeon, F, x + s*(r + .18), y + hs/2, z + .04, .04, hs, .05); }
  put(U.pgArchRing, M.lxWhite, under(F, T(x, y + hs, z + .04, 0, r + .06, r + .06, 1.3)));
  strut(M.gold, F, x - r*.62, y + hs + r*.1, z + .07, x, y + hs + r*.62, z + .07, .04); strut(M.gold, F, x + r*.62, y + hs + r*.1, z + .07, x, y + hs + r*.62, z + .07, .04);
  glow(F, x, y + hs*.6, z + .3, 'warm', .4 + w*.6);
}
// a rounded glass bay bulging out of a wall: a quarter dome over a lit half-round room, a white arched rim with a
// blue strip, glass ribs; local +z points out of the wall
function pgBay(P, x, y, z, r, ry){
  const Q = under(P, T(x, y, z, ry));
  put(wedgeGeo(r + .1, .12, -PI/2, PI), M.lxWhite, under(Q, T(0, .06, 0)));
  put(wedgeGeo(r + .12, .04, -PI/2, PI), M.pgNeon, under(Q, T(0, .03, 0)));
  put(U.vaultCap, M.lxRoom, under(Q, T(0, .12, .01, 0, r*.98, r*.98, 1)));                         // the lit room at the back
  for (let k=0; k<2; k++) box(pick([M.cream2, M.white2, M.wood]), Q, rnd(-r*.4, r*.4), .27, rnd(.2, r*.5), .4, .2, .25);
  pgPine(Q, r*.35, .12, r*.35, .55); plant(pick(['bush','fern','bonsai']), Q, -r*.4, .12, r*.3, .6);
  glow(Q, 0, r*.45, r*.3, 'warm', 1.0);
  put(U.pgBay, M.lxGlass, under(Q, T(0, .12, 0, 0, r, r, r)));
  for (const a of [-.55, 0, .55]) put(U.lxRib, M.lxWhite, under(Q, T(0, .12, 0, PI/2 + a, r, r, r)));
  put(U.lxHoop, M.lxWhite, under(Q, T(0, .12 + r*.5, 0, 0, r*.87, r*.87, r*.87, PI/2)));
  put(U.pgArchRing, M.lxWhite, under(Q, T(0, .12, .02, 0, r + .06, r + .06, 1.4)));
  put(U.pgArchRing, M.pgNeon, under(Q, T(0, .12, .1, 0, r + .14, r + .14, .5)));
}
// a bonsai pine: a leaning, bending trunk and flat pads of needles
function pgPine(P, x, y, z, s = 1){
  const dir = rnd(0, TAU), lean = rnd(.15, .45)*s, h = rnd(.85, 1.2)*s;
  let px = x, py = y, pz = z;
  for (let k=1; k<=3; k++){
    const u = k/3, bend = Math.sin(u*PI*.8)*lean, nx = x + Math.cos(dir)*bend + Math.cos(dir + 1.6)*(k === 2 ? .08*s : 0), nz = z + Math.sin(dir)*bend, ny = y + h*u;
    strut(M.trunk, P, px, py, pz, nx, ny, nz, .07*s*(1.15 - u*.4));
    if (k > 1) for (let q=0; q<2; q++) blob(chance(.5) ? M.pgPine : M.pgPine2, P, nx + rnd(-.22, .22)*s, ny + rnd(-.02, .08)*s, nz + rnd(-.22, .22)*s, rnd(.2, .3)*s, .38);
    px = nx; py = ny; pz = nz;
  }
  blob(M.pgPine2, P, px, py + .1*s, pz, .2*s, .45);
}
function pgRocks(P, x, y, z){
  for (let k=0; k<irand(2, 3); k++){ const rx = x + rnd(-.18, .18), rz = z + rnd(-.18, .18); blob(chance(.6) ? M.pgRock : M.pgRock2, P, rx, y + .07, rz, rnd(.1, .2), .7); if (chance(.6)) blob(M.pgMoss, P, rx, y + .15, rz, rnd(.07, .11), .4); }
  for (let k=0; k<3; k++) blob(M.pgMoss, P, x + rnd(-.3, .3), y + .02, z + rnd(-.3, .3), rnd(.08, .14), .35);
}
function pgLantern(P, x, y, z, s = 1){
  box(M.pgRock, P, x, y + .04*s, z, .22*s, .08*s, .22*s); cyl(M.pgRock, P, x, y + .22*s, z, .04*s, .3*s);
  box(M.pgRock, P, x, y + .4*s, z, .2*s, .04*s, .2*s); box(M.bulb, P, x, y + .5*s, z, .13*s, .14*s, .13*s); glow(P, x, y + .5*s, z, 'warm', .6*s);
  put(U.cone, M.pgRock, under(P, T(x, y + .64*s, z, PI/4, .36*s, .14*s, .36*s))); sph(M.pgRock, P, x, y + .74*s, z, .035*s);
}
function pgBamboo(P, x, y, z){ for (let k=0; k<irand(3, 5); k++) plant('bamboo', P, x + rnd(-.2, .2), y, z + rnd(-.2, .2), rnd(.8, 1.15)); blob(M.pgMoss, P, x, y + .02, z, .2, .3); }
// a pagoda roof: a square hip roof with concave slopes and corners that sweep up, white, scaled to W x D x H
U.pgRoof = (() => {
  const g = new THREE.CylinderGeometry(.12, 1, 1, 32, 8, true), p = g.attributes.position;
  for (let k=0; k<p.count; k++){
    const x = p.getX(k), z = p.getZ(k), t = p.getY(k) + .5, a = Math.atan2(z, x), c = Math.cos(a), s = Math.sin(a), m = Math.max(Math.abs(c), Math.abs(s));
    const r = (.1 + .9*Math.pow(1 - t, 1.6))/m, corner = 1 - (m - Math.SQRT1_2)/(1 - Math.SQRT1_2);
    p.setXYZ(k, c*r, t + Math.pow(corner, 2.5)*.32*Math.pow(1 - t, 3), s*r);
  }
  g.computeVertexNormals(); return g.toNonIndexed();
})();
function pgRoof(P, x, y, z, W, D, H){
  lxPlate(M.lxWhite2, P, x, y - .06, z, W*.9, D*.9, .1, .08);                                    // the soffit
  put(U.pgRoof, M.lxWhite, under(P, T(x, y, z, 0, W/2, H, D/2)));
  for (const [sx, sz] of CORNERS){                                                                // gold hips and eaves
    const cx = sx*W/2, cz = sz*D/2;
    strut(M.gold, P, x + cx, y + H*.33, z + cz, x + cx*.62, y + H*.12, z + cz*.62, .06);
    strut(M.gold, P, x + cx*.62, y + H*.12, z + cz*.62, x + cx*.12, y + H*.97, z + cz*.12, .06);
    box(M.gold, P, x + cx, y + H*.33 + .05, z + cz, .1, .1, .1);
  }
  for (const s of [-1, 1]){ box(M.pgGoldLit, P, x, y + .03, z + s*(D/2 - .02), W*.72, .05, .05); box(M.pgGoldLit, P, x + s*(W/2 - .02), y + .03, z, .05, .05, D*.72); }
}
// a white pier with a gold chevron frame (the reference's big gold M and V shapes); local +z faces out
function pgPier(P, x, y, z, h, ry, w = 1.1){
  const Q = under(P, T(x, y, z, ry));
  box(M.lxWhite, Q, 0, h/2, 0, w, h, .5);
  for (const s of [-1, 1]){ strut(M.gold, Q, s*(w/2 - .1), h - .12, .26, 0, h*.68, .26, .07); box(M.gold, Q, s*(w/2 - .1), h/2, .26, .07, h - .2, .05); }
  box(M.gold, Q, 0, h - .1, .26, w - .12, .07, .05);
  pgArch(Q, 0, 0, .26, Math.min(.9, w*.5), h*.55);
  for (const s of [-1, 1]) box(M.pgNeon, Q, s*(w/2 + .02), h/2, .12, .05, h - .3, .1);
}
// a swept-up corner on a slab, like an eave; Q's local +x points out from the corner
function pgFlare(P, x, y, z, ang){
  const Q = under(P, T(x, y, z, ang)), pts = [[-.25, -.1], [.15, -.08], [.45, -.02], [.7, .12], [.85, .3]];
  lxBand(M.lxWhite, Q, pts, .55, .12, 0); lxBand(M.pgNeon, Q, lxOffset(pts, -.07), .08, .03, 0);
}
// a car pad cantilevered from the podium, two cars and a charging post on it; local +z points out
function pgPad(P, x, y, z, ry){
  const Q = under(P, T(x, y, z, ry));
  lxPlate(M.lxWhite2, Q, 0, -.12, .8, 1.7, 2.0, .25, .12);
  for (const s of [-1, 1]) box(M.pgNeon, Q, s*.86, -.07, .8, .05, .05, 1.9); box(M.pgNeon, Q, 0, -.07, 1.81, 1.6, .05, .05);
  glow(Q, 0, -.07, 1.85, 'cyan', .8); for (const s of [-1, 1]) glow(Q, s*.88, -.07, .8, 'cyan', .7);
  box(M.frame, Q, 0, -.005, .9, .03, .01, 1.5);
  for (const s of [-1, 1]) lxCar(Q, s*.42, 0, 1.0, rnd(-.1, .1) + PI);
  box(M.lxWhite, Q, .7, .25, .05, .14, .5, .14); box(M.pgNeon, Q, .7, .4, .125, .08, .14, MIN_T);
  strut(M.lxWhite2, Q, 0, -.12, 1.4, 0, -.6, .1, .12);
}
function buildCloudPagoda(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const long = m.w >= m.h, L = Math.max(m.w, m.h)*LOT, D = Math.min(m.w, m.h)*LOT;
  const P = T(m.x, 0, m.z, long ? pick([0, PI]) : pick([PI/2, -PI/2])), Y = CURB;
  // ---- ground: pale paving
  box(G.asph, P, 0, .012, 0, L, .025, D);
  const nx = 25, nz = 20, sx = L/nx, sz = D/nz;
  for (let a=0; a<nx; a++) for (let b=0; b<nz; b++) if (!chance(.03)) box(pick(TILES.high), P, -L/2 + (a + .5)*sx, .03, -D/2 + (b + .5)*sz, sx - .05, .045, sz - .05);
  // ---- the podium, with stairs up the front between two wings
  const pw = 17.6, pd = 12.4, pcz = -.6, ph = 1.2, pFront = pcz + pd/2, wing = .9, gap = 1.5;
  lxPlate(M.lxWhite2, P, 0, Y, pcz, pw, pd, 1.2, ph);
  pgNeonRing(P, 0, Y + ph - .1, pcz, pw + .04, pd + .04, 1.22);
  for (const s of [-1, 1]){
    const ww = pw/2 - gap, wx = s*(gap + ww/2);
    lxPlate(M.lxWhite2, P, wx, Y, pFront + wing/2 - .3, ww, wing + .6, .45, ph);
    pgNeonRing(P, wx, Y + ph - .1, pFront + wing/2 - .3, ww + .04, wing + .64, .47);
    // two arched entrances into the podium on each wing's face
    const Fw = under(P, T(wx, 0, pFront + wing, 0));
    for (const u of [-.25, .25]) pgArch(Fw, u*ww, Y, 0, .9, 1.0);
  }
  const front = pFront + wing;
  for (let k=0; k<8; k++){ const u = (k + .5)/8; box(M.lxWhite, P, 0, Y + ph*u/2, front - u*(wing + .3), 2*gap, ph*u, (wing + .3)/8 + .02); }   // stairs
  for (const s of [-1, 1]){ box(M.lxWhite, P, s*(gap - .05), Y + ph/2 + .15, pFront + .1, .12, ph + .3, wing + .5); pgLantern(P, s*(gap + .35), Y + ph, front - .3, 1.1);
    box(M.pgNeon, P, s*(gap - .05), Y + ph + .31, pFront + .1, .14, .03, wing + .5); }   // blue strips along the tops of the stair walls
  // lit arched openings round the podium's face, gold framed
  for (const [F, len, side] of mkFaces(P, 0, pcz, pw, pd)){
    for (let t = -len/2 + 1.7; t < len/2 - 1.5; t += 2.0){
      if (side === 'f') continue;   // the front is the wings and the stairs
      pgArch(F, t, Y, .01, .75, .95);
    }
  }
  // car pads off the sides and the front wings
  pgPad(P, -pw/2 + .2, Y + ph, -2.6, -PI/2); pgPad(P, pw/2 - .2, Y + ph, 1.4, PI/2); pgPad(P, pw/2 - .2, Y + ph, -3.6, PI/2);
  pgPad(P, -5.8, Y + ph, front - .2, 0); pgPad(P, 6.0, Y + ph, front - .2, 0);
  // ---- the terraced levels
  const lv = [];
  for (let k=1; k<=4; k++) lv.push({ w: pw - k*2.7, d: pd - k*2.0, cz: pcz - k*.15, r: Math.max(.6, 1.3 - k*.15) });
  const LH = 2.0;
  let y = Y + ph;
  const gardenRing = (outer, inner, yy, skip) => {   // a Japanese garden round a terrace, between its rim and the floor above
    const mw = (outer.w + inner.w)/2, md = (outer.d + inner.d)/2, mz = (outer.cz + inner.cz)/2;
    for (const p of lxRing(mw, md, (outer.r + inner.r)/2, .8)){
      const x = p.x, z = mz + p.z; if (skip && skip(x, z)) continue;
      const q = R();
      if (q < .26) pgPine(P, x, yy, z, rnd(.8, 1.15)); else if (q < .42) pgBamboo(P, x, yy, z); else if (q < .62) pgRocks(P, x, yy, z);
      else if (q < .72) lxPond(P, x, yy, z, rnd(.6, .9), rnd(.4, .55)); else if (q < .8) pgLantern(P, x, yy, z, .9);
      else plant(pick(['bush','bushFlower','fern','g_fern2','bonsai']), P, x, yy, z, rnd(.6, .85));
    }
    lxRail(P, 0, yy, outer.cz, outer.w - .1, outer.d - .1, outer.r - .05);
  };
  const floorOf = l => ({ w: l.w - 1.4, d: l.d - 1.2, cz: l.cz, r: Math.max(.3, l.r - .5) });
  // rounded glass bays bulging out of the floors onto the terraces: two on the front of the first and third floors,
  // one on each side of the second and fourth (the domes take the back of the sides)
  const bays = [];
  lv.forEach((l, k) => {
    const f = floorOf(l), below = k ? lv[k - 1] : { w: pw, d: pd, cz: pcz };
    if (k % 2 === 0){ const ring = below.cz + below.d/2 - (f.cz + f.d/2), r = Math.min(1.15, f.w*.1, ring - .35);
      for (const s of [-1, 1]) bays.push({ k, x: s*f.w*.2, z: f.cz + f.d/2 - .05, r, ry: 0 }); }
    else { const ring = below.w/2 - f.w/2, r = Math.min(1.05, ring - .4, LH*.55);
      for (const s of [-1, 1]) bays.push({ k, x: s*(f.w/2 - .05), z: f.cz + f.d/2 - r - .35, r, ry: s*PI/2 }); }
  });
  const nearBay = (k, x, z, pad = .45) => bays.some(b => b.k === k && Math.hypot(x - b.x, z - b.z) < b.r + pad);
  // the podium's own garden, clear of the stairs and the bays
  gardenRing({ w: pw, d: pd, cz: pcz, r: 1.2 }, floorOf(lv[0]), y, (x, z) => (Math.abs(x) < gap + .9 && z > 0) || nearBay(0, x, z));
  const domes = [];
  lv.forEach((l, k) => {
    const f = floorOf(l), h = LH - .2;
    lxGlassFloor(P, 0, y, f.cz, f.w, f.d, f.r, h, null, .75);
    lxPlate(M.lxWhite2, P, 0, y + h*.52, f.cz, f.w + .04, f.d + .04, f.r + .02, .05);   // a transom between the upper and lower panes
    for (let x = -f.w/2 + .8; x < f.w/2 - .5; x += 1.6) glow(P, x, y + h*.6, f.cz + f.d/2 - .3, 'warm', .9);
    // white piers with gold chevrons and arched doors across the front (and on the sides of the first floor), the bays
    pgPier(P, 0, y, f.cz + f.d/2 + .2, h, 0, 1.4 - k*.1);
    if (k < 3) for (const s of [-1, 1]) pgPier(P, s*f.w*.36, y, f.cz + f.d/2 + .2, h, 0, .9);
    if (k === 0) for (const s of [-1, 1]) pgPier(P, s*(f.w/2 + .2), y, f.cz - 1.2, h, s*PI/2, 1.0);
    for (const b of bays) if (b.k === k) pgBay(P, b.x, y, b.z, b.r, b.ry);
    // a blue strip along the floor's foot, at the glass
    pgNeonRing(P, 0, y + .02, f.cz, f.w + .06, f.d + .06, f.r + .03, .04);
    // curved white buttresses under the slab corners
    for (const [sxx, szz] of CORNERS){ const Q = under(P, T(sxx*(f.w/2 - .3), y, f.cz + szz*(f.d/2 - .3), Math.atan2(-szz, sxx)));
      const pts = []; for (let q=0; q<=8; q++){ const u = q/8; pts.push([Math.sin(u*PI/2)*.9, u*h]); } lxBand(M.lxWhite, Q, pts, .22, .16, 0); lxBand(M.pgNeon, Q, lxOffset(pts, -.09), .05, .03, 0); }
    y += LH;
    lxSlab(P, 0, y, l.cz, l.w, l.d, l.r, .22, false);
    pgNeonRing(P, 0, y - .16, l.cz, l.w + .04, l.d + .04, l.r + .02, .07);   // the slab's blue edge
    for (const [sxx, szz] of CORNERS) pgFlare(P, sxx*(l.w/2 - l.r*.3), y - .1, l.cz + szz*(l.d/2 - l.r*.3), Math.atan2(-szz, sxx));
    // the terrace on top of this level: a garden round the next floor, domes on its sides
    if (k < lv.length - 1){
      const nf = floorOf(lv[k + 1]);
      const ringW = (l.w - nf.w)/2, dr = Math.min(1.3, (ringW - .55)/2);   // the dome and its base ring fit between the floor above and the rail
      if (k < 2 && dr > .5){ const side = k % 2 ? 1 : -1, dx = side*(nf.w/2 + dr + .2), dz = nf.cz - nf.d*.22;
        lxDome(P, dx, y, dz, dr); domes.push([dx, dz]);
        pgNeonRing(P, dx, y + .02, dz, 2*dr + .22, 2*dr + .22, dr + .11, .03);
        if (k === 0){ lxDome(P, -dx, y, dz, dr*.85); domes.push([-dx, dz]); pgNeonRing(P, -dx, y + .02, dz, 1.7*dr + .22, 1.7*dr + .22, .85*dr + .11, .03); } }
      gardenRing(l, nf, y, (x, z) => domes.some(([dx, dz]) => Math.hypot(x - dx, z - dz) < dr + .5) || nearBay(k + 1, x, z));
    }
  });
  // ---- the pagoda on top: a lit hall, a wide roof, a smaller hall and roof, a gold spire
  const top = lv[lv.length - 1], hw = top.w - 1.6, hd = top.d - 1.0;
  lxRail(P, 0, y, top.cz, top.w - .1, top.d - .1, top.r - .05);
  for (const [sxx, szz] of CORNERS) pgPine(P, sxx*(top.w/2 - .45), y, top.cz + szz*(top.d/2 - .4), .8);
  lxGlassFloor(P, 0, y, top.cz, hw, hd, .1, 1.5, null, .6);
  for (const [sxx, szz] of CORNERS) box(M.lxWhite, P, sxx*hw/2, y + .75, top.cz + szz*hd/2, .3, 1.5, .3);
  pgPier(P, 0, y, top.cz + hd/2 + .1, 1.5, 0, 1.0);
  y += 1.5;
  box(M.lxWhite, P, 0, y + .06, top.cz, hw + .3, .12, hd + .3); pgNeonRing(P, 0, y - .01, top.cz, hw + .34, hd + .34, .05, .04);
  pgRoof(P, 0, y + .12, top.cz, hw + 2.4, hd + 2.2, 1.6);
  const y2 = y + .9, h2w = hw*.55, h2d = hd*.6;
  lxGlassFloor(P, 0, y2, top.cz, h2w, h2d, .08, 1.2, null, .5);
  for (const [sxx, szz] of CORNERS) box(M.lxWhite, P, sxx*h2w/2, y2 + .6, top.cz + szz*h2d/2, .22, 1.2, .22);
  y = y2 + 1.2;
  box(M.lxWhite, P, 0, y + .05, top.cz, h2w + .25, .1, h2d + .25);
  pgRoof(P, 0, y + .1, top.cz, h2w + 2.0, h2d + 1.9, 1.9);
  const sp = y + .1 + 1.9;
  cyl(M.gold, P, 0, sp + .5, top.cz, .05, 1.1); for (let k=0; k<4; k++) put(U.torus, M.gold, under(P, T(0, sp + .25 + k*.2, top.cz, 0, .3 - k*.04, .3 - k*.04, .3 - k*.04, PI/2)));
  sph(M.gold, P, 0, sp + 1.1, top.cz, .09); beaconLight(P, 0, sp + 1.25, top.cz, .06, .7);
  m.roofH = Y + ph + LH;
  m.top = sp + 1.6;
}

/* ---------- the Neon Dome ---------- */
// A nightclub under a geodesic glass dome (the Neon Dome reference): a dark metal drum with a band of lit windows
// carries a dome of triangular glass panes on a dark frame, with runs of its struts in cyan and pink neon. Through
// the glass you see the club inside: a gallery ring round the top of the drum with a neon rail and a bar, and down
// in the middle the dance floor (its tiles pulse to the music), the DJ on a stage, the crowd, a mirror ball and
// coloured beams sweeping round (see clubFx). Outside: an arched entrance glowing warm under a big NEON DOME sign,
// NIGHTCLUB OPEN 24H under it, a CLUB / DRINKS / MUSIC pylon, an ENTER arrow, a queue snaking between barriers,
// and a bar kiosk and a snack stand either side. Each one picks from its seed which runs of struts are lit.
M.domeFrame = toon(0x2a2e3c); M.domeNode = toon(0x4a5060); M.domeDrum = toon(0x30323e); M.domeDrum2 = toon(0x3e4252); M.domeFloor = toon(0x1c1a26);
M.domeNeonA = toon(0x145452, { em:0x38e8e0, kind:'neon' }); M.domeNeonB = toon(0x5a1d4a, { em:0xff4fc8, kind:'neon' });
M.domeGlass = new THREE.MeshBasicMaterial({ color: 0xb8b0ff, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide }); M.domeGlass.userData.colorOnly = true;
M.clubWin = toon(0x40204a, { em:0xc060ff, kind:'window' }); M.clubDoor = toon(0x1c0c16, { em:0x1e0a18, kind:'window' }); /* a dim pink doorway */ M.clubWin2 = toon(0x1a3a50, { em:0x4ad8ff, kind:'window' });
NEON_GLOW.set(M.domeNeonA, 'cyan'); NEON_GLOW.set(M.domeNeonB, 'pink');
const DOME_R = 5.45, DOME_H = 4.4, DRUM_H = 1.5;
// the dome's points, rings of them from the drum up to the top, and its triangles (each ring zipped to the next)
function domeMesh(){
  const rings = [[20, 0], [20, .32], [15, .64], [10, .96], [5, 1.27]], pts = [], ringIdx = [];
  rings.forEach(([n, e], k) => { const off = (k % 2)*PI/n, idx = [];
    for (let q=0; q<n; q++){ const a = off + q*TAU/n; idx.push(pts.length); pts.push([DOME_R*Math.cos(e)*Math.cos(a), DOME_H*Math.sin(e), DOME_R*Math.cos(e)*Math.sin(a), k, a]); }
    ringIdx.push({ idx, off, n }); });
  const apex = pts.length; pts.push([0, DOME_H, 0, rings.length, 0]);
  const tris = [];
  for (let k=0; k<ringIdx.length - 1; k++){
    const A = ringIdx[k], B = ringIdx[k + 1];
    // walk round both rings together by angle, starting B at its point at or just before A's first
    const sb = Math.ceil((B.off - A.off)/(TAU/B.n) - 1e-9), bi = q => B.idx[(((q - sb) % B.n) + B.n) % B.n];
    const angA = q => A.off + q*TAU/A.n, angB = q => B.off + (q - sb)*TAU/B.n;
    let i = 0, j = 0;
    while (i < A.n || j < B.n){
      const goA = j >= B.n || (i < A.n && angA(i + 1) < angB(j + 1));
      if (goA){ tris.push([A.idx[i % A.n], bi(j), A.idx[(i + 1) % A.n]]); i++; }
      else { tris.push([A.idx[i % A.n], bi(j), bi(j + 1)]); j++; }
    }
  }
  const top = ringIdx[ringIdx.length - 1];
  for (let q=0; q<top.n; q++) tris.push([top.idx[q], top.idx[(q + 1) % top.n], apex]);
  const edges = new Map();
  for (const t of tris) for (let e=0; e<3; e++){ const a = t[e], b = t[(e + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b); if (!edges.has(key)) edges.set(key, [Math.min(a, b), Math.max(a, b)]); }
  return { pts, tris, edges: [...edges.values()] };
}
// which struts are neon, and in which colour: 0 none, 1 cyan, 2 pink
function domeNeonOf(style, a, b){
  const ka = a[3], kb = b[3], ang = Math.atan2((a[2] + b[2])/2, (a[0] + b[0])/2), side = Math.cos(ang - .6) > 0 ? 2 : 1;
  if (style === 0){ if (ka === kb && (ka === 1 || ka === 3)) return side; if (Math.abs(ka - kb) === 1 && Math.min(ka, kb) === 2) return 3 - side; return 0; }   // two rings and a zigzag, split cyan / pink by side
  if (style === 1){ if (ka !== kb){ const q = Math.round((ang + PI)/(TAU/10)); return q % 2 ? 1 : 0; } return ka === 2 ? 2 : 0; }           // ribs up the dome in cyan, one pink ring
  if (ka === kb) return ka % 2 ? 2 : 1; return 0;                                                                                        // every ring lit, alternating
}
function buildNeonDome(m){
  R = mulberry32(hash('mega', m.kind, m.i, m.j, m.seed));
  const P = T(m.x, 0, m.z, pick([0, PI/2, PI, -PI/2])), L = m.w*LOT, H = L/2, y0 = CURB;
  // ---- the plaza: dark wet paving
  box(G.asph, P, 0, .012, 0, L, .025, L);
  const n = 20, st = L/n;
  for (let a=0;a<n;a++) for (let b=0;b<n;b++) if (!chance(.03)) box(pick([TILES.ind[0], TILES.ind[1], TILES.low[2], TILES.ind[2]]), P, (a-(n-1)/2)*st, .03, (b-(n-1)/2)*st, st - .04, .045, st - .04);
  for (let k=0; k<8; k++) box(G.puddle, P, rnd(-H + 1, H - 1), .056, rnd(4.5, H - .5), rnd(.5, 1.4), .01, rnd(.3, .7));
  // ---- the drum: dark metal with a band of lit windows, pipes and AC boxes clinging to it
  const DR = DOME_R + .3;
  // a hollow ring of wall (so the dance floor inside shows through the glass), a ledge on top, a neon band
  const ring = (mat, r, y, h, t, n = 40) => { for (let k=0; k<n; k++){ const a = (k + .5)*TAU/n; box(mat, under(P, T(Math.cos(a)*r, 0, Math.sin(a)*r, PI/2 - a)), 0, y, 0, r*TAU/n + .02, h, t); } };
  ring(M.domeDrum, DR - .15, y0 + DRUM_H/2, DRUM_H, .3);
  ring(M.domeDrum2, DR - .05, y0 + DRUM_H + .06, .12, .55);
  ring(M.domeNeonB, DR + .01, y0 + DRUM_H - .03, .04, .04);
  for (let k=0; k<24; k++){ const a = k*TAU/24; if (Math.abs(((a - PI/2) + TAU) % TAU - 0) < .5 || Math.abs(((a - PI/2) + TAU) % TAU - TAU) < .5) continue;   // not over the entrance
    const F = under(P, T(Math.cos(a)*(DR + .01), 0, Math.sin(a)*(DR + .01), PI/2 - a));
    box(k % 3 ? M.clubWin : M.clubWin2, F, 0, y0 + .9, .01, .9, .32, .02);
    if (k % 5 === 2){ box(M.metal, F, 0, y0 + .35, .2, .55, .45, .35); box(M.metalDark, F, 0, y0 + .35, .38, .4, .35, .01); }   // an AC unit
    if (k % 7 === 3) cyl(M.inPipe2 || M.metalDark, F, .35, y0 + .75, .12, .05, 1.5); }
  // ---- the dome: glass panes on a dark frame, lit struts
  const D = domeMesh(), yb = y0 + DRUM_H + .12, style = hash('dome-neon', m.seed) % 3;
  const pos = [];
  for (const t of D.tris) for (const q of t){ const p = D.pts[q]; pos.push(p[0], p[1] + yb, p[2]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  put(g, M.domeGlass, P); g.dispose();
  for (const [a, b] of D.edges){
    const pa = D.pts[a], pb = D.pts[b], lit = domeNeonOf(style, pa, pb);
    strut(M.domeFrame, P, pa[0], pa[1] + yb, pa[2], pb[0], pb[1] + yb, pb[2], .07);
    if (lit){ const s = 1.012; strut(lit === 1 ? M.domeNeonA : M.domeNeonB, P, pa[0]*s, pa[1]*s + yb, pa[2]*s, pb[0]*s, pb[1]*s + yb, pb[2]*s, .045);
      if (chance(.35)) glow(P, (pa[0] + pb[0])/2*1.03, (pa[1] + pb[1])/2 + yb, (pa[2] + pb[2])/2*1.03, lit === 1 ? 'cyan' : 'pink', 1.1); }
  }
  for (const p of D.pts) sph(M.domeNode, P, p[0], p[1] + yb, p[2], .09);
  cyl(M.domeFrame, P, 0, yb + DOME_H + .2, 0, .05, .4); beaconLight(P, 0, yb + DOME_H + .45, 0, .09, 1.0);
  // ---- inside: the gallery ring on top of the drum, its neon rail, a bar along it
  const GI = 3.5, gy = y0 + DRUM_H + .1;
  for (let k=0; k<32; k++){ const a = k*TAU/32, a2 = (k + 1)*TAU/32, rm = (GI + DOME_R)/2, F = under(P, T(Math.cos(a + PI/32)*rm, 0, Math.sin(a + PI/32)*rm, PI/2 - a - PI/32));
    box(M.domeFloor, F, 0, gy, 0, rm*TAU/32 + .05, .1, (DOME_R - GI) + .1);
    strut(k % 2 ? M.domeNeonA : M.domeNeonB, P, Math.cos(a)*GI, gy + .42, Math.sin(a)*GI, Math.cos(a2)*GI, gy + .42, Math.sin(a2)*GI, .035); }
  for (let k=0; k<10; k++){ const a = k*TAU/10; cyl(M.domeFrame, P, Math.cos(a)*GI, gy + .22, Math.sin(a)*GI, .025, .42); }
  { const F = under(P, T(0, 0, -(GI + DOME_R)/2 - .1)); box(M.wood, F, 0, gy + .32, 0, 2.6, .5, .4); box(M.clubWin2, F, 0, gy + .58, .2, 2.5, .03, .02);
    for (let k=0; k<9; k++) box(pick([M.cloth1, M.cloth3, M.cloth4, M.white2]), F, -1.1 + k*.27, gy + .64, -.1, .05, .14, .05); glow(F, 0, gy + .7, .3, 'cyan', 1.2); }
  // ---- inside, down below: the dance floor (drawn live by clubFx), the stage and the DJ, the crowd
  put(U.cyl16, M.domeFloor, under(P, T(0, y0 + .03, 0, 0, 2*GI, .04, 2*GI)));
  { const F = under(P, T(0, 0, -2.6)); box(M.domeDrum2, F, 0, y0 + .25, 0, 2.2, .45, 1.0); box(M.domeNeonA, F, 0, y0 + .2, .51, 2.2, .04, .02);
    box(M.metalDark, F, 0, y0 + .72, .1, 1.1, .45, .4); box(M.screen2, F, 0, y0 + .88, .31, 1.0, .1, .01);
    figure(F, 0, y0 + .48, -.2, M.frame);
    for (const s of [-1, 1]){ box(M.frame, F, s*1.25, y0 + .75, 0, .45, 1.3, .45); put(U.cyl16, M.metalDark, under(F, T(s*1.25, y0 + .95, .23, 0, .3, .02, .3, PI/2))); }
    box(M.domeFrame, F, 0, y0 + 2.2, -.35, 3.4, 1.6, .08); box(M.screen, F, 0, y0 + 2.2, -.3, 3.2, 1.4, .02); glow(F, 0, y0 + 2.2, 0, 'platinum', 1.8); }
  // ---- outside: the entrance, an arch through the drum on the front, glowing warm inside
  const E = under(P, T(0, 0, DR - .1));
  box(M.domeDrum2, E, 0, y0 + 1.15, .45, 3.0, 2.3, 1.1);
  // the doorway: a dim pink glow from inside (a shutter rolls down over it while the club's shut: see clubFx)
  box(M.clubDoor, E, 0, y0 + .75, 1.0, 1.5, 1.4, .02); put(U.cyl16, M.clubDoor, under(E, T(0, y0 + 1.45, 1.0, 0, 1.5, .02, 1.5, PI/2)));
  box(M.domeFrame, E, 0, y0 - .005, 1.3, 1.9, .03, .6);   // a dark mat at the door, flush with the paving
  for (const s of [-1, 1]){ box(M.domeNeonB, E, s*.82, y0 + .8, 1.02, .04, 1.5, .03); }
  glow(E, 0, y0 + .8, 1.3, 'pink', .3);
  // the big sign over it, and NIGHTCLUB OPEN 24H under
  box(M.metalDark, E, 0, y0 + 2.72, 1.05, 4.3, 1.15, .14);
  plant('sign_w_neondome', under(E, T(0, 0, 1.13)), 0, y0 + 2.9, 0, 1.5, 'c', true); glow(E, 0, y0 + 2.85, 1.6, 'pink', 2.6);
  plant('sign_w_nightclub', under(E, T(0, 0, 1.13)), 0, y0 + 2.4, 0, .65, 'c', true); glow(E, 0, y0 + 2.38, 1.5, 'cyan', 1.2);
  // the pylon: CLUB, DRINKS, MUSIC
  { const Q = under(P, T(-2.95, 0, DR + 1.0)); box(M.metalDark, Q, 0, y0 + 1.5, 0, 1.05, 3.0, .2); box(M4.neonPurple, Q, 0, y0 + 1.5, .11, 1.07, 3.0, .01);
    box(M.domeFrame, Q, 0, y0 + 1.5, .12, .97, 2.9, .01);
    ['sign_w_club', 'sign_w_drinks', 'sign_w_music'].forEach((k, q) => plant(k, under(Q, T(0, 0, .14)), 0, y0 + 2.5 - q*.8, 0, .55, 'c', true));
    glow(Q, 0, y0 + 1.8, .4, 'platinum', 1.6); }
  // ENTER, with an arrow pointing in
  { const Q = under(P, T(2.95, 0, DR + .9)); cyl(M.metalDark, Q, 0, y0 + .6, 0, .04, 1.2); box(M.metalDark, Q, 0, y0 + 1.35, 0, 1.3, .5, .08);
    plant('sign_w_enter', under(Q, T(0, 0, .05)), -.15, y0 + 1.35, 0, .75, 'c', true);
    box(M.neonCyan, Q, .45, y0 + 1.35, .05, .25, .03, .02); box(M.neonCyan, Q, .52, y0 + 1.41, .05, .12, .03, .02, 0, 0, -.8); box(M.neonCyan, Q, .52, y0 + 1.29, .05, .12, .03, .02, 0, 0, .8);
    glow(Q, 0, y0 + 1.35, .3, 'cyan', 1.2); }
  // the queue line: a velvet rope on posts along the front, the queue forming inside it (residents: see people.js)
  const posts = []; for (let x = 1.05; x <= 4.7; x += .73) posts.push([x, DR + 1.78]);   // (clear of the door, where people come and go)
  for (const [x, z] of posts){ cyl(M.metal, P, x, y0 + .25, z, .03, .5); sph(M.metal, P, x, y0 + .52, z, .045); }
  for (let k=0; k<posts.length - 1; k++){ const [ax, az] = posts[k], [bx, bz] = posts[k + 1]; strut(M.red2, P, ax, y0 + .45, az, bx, y0 + .45, bz, .025); }
  // a bar kiosk and a snack stand either side of the front
  for (const s of [-1, 1]){
    const Q = under(P, T(s*5.3, 0, 5.3, s > 0 ? -PI/4 : PI/4));
    box(M.domeDrum2, Q, 0, y0 + .75, 0, 1.8, 1.5, 1.2); box(M.winLit, Q, 0, y0 + .7, .61, 1.4, .6, .01);
    box(M.metal, Q, 0, y0 + .42, .7, 1.6, .05, .25);
    box(s > 0 ? M.awn2 : M.awn1, Q, 0, y0 + 1.15, .85, 1.9, .05, .6, 0, -.35);
    box(M.metalDark, Q, 0, y0 + 1.75, .55, 1.5, .4, .06);
    plant(s > 0 ? 'sign_w_bar' : 'sign_w_snacks', under(Q, T(0, 0, .6)), 0, y0 + 1.75, 0, .72, 'c', true);
    glow(Q, 0, y0 + 1.75, .9, s > 0 ? 'blue' : 'pink', 1.3); glow(Q, 0, y0 + .7, 1.0, 'warm', 1.2);
    emitters.push(new THREE.Vector3(.4, y0 + 1.6, 0).applyMatrix4(Q));
  }
  // planters by the door, and the odd bush round the drum
  for (const s of [-1, 1]){ const Q = under(P, T(s*1.75, 0, DR + .55)); box(M.concM, Q, 0, y0 + .2, 0, .7, .4, .5); plant(pick(['bush', 'bushFlower', 'g_fern3']), Q, 0, y0 + .4, 0, .9); }
  for (let k=0; k<8; k++){ const a = rnd(PI*.75, PI*2.25), r = DR + .45; plant(pick(['bush', 'g_fern2', 'bamboo']), P, Math.cos(a)*r, y0, Math.sin(a)*r, rnd(.7, .95)); }
  for (const [sx, sz] of [[-1, -1], [1, -1]]) { const Q = under(P, T(sx*(H - .8), 0, sz*(H - .8))); box(M.concM, Q, 0, y0 + .2, 0, .9, .4, .9); plant(pick(['bonsai', 'bamboo']), Q, 0, y0 + .4, 0, 1.1); }
  // where clubFx draws: the dance floor, the light rig at the top
  m.club = { m: P.elements.slice(), floorR: GI - .15, floorY: y0 + .07, rigY: yb + DOME_H - .7, GI, gy: gy + .05, DR, outer: DOME_R, door: [0, DR + 1.0],
             kiosks: [-1, 1].map(s => ({ x: s*5.3, z: 5.3, ry: s > 0 ? -PI/4 : PI/4 })) };
  m.roofH = yb + DOME_H;
  m.top = yb + DOME_H + 1.2;
}
// The club's moving lights: the dance floor's tiles light up in patterns to a 124 bpm beat, a mirror ball turns
// under the rig throwing glints, and four coloured beams sweep round the floor.
// open from seven in the evening until four in the morning
const clubOpenAt = h => h >= 19 || h < 4;
function clubFx(m){
  const c = m.club; if (!c) return null;
  const root = new THREE.Group(); root.matrixAutoUpdate = false; root.matrix.fromArray(c.m); root.matrixWorldNeedsUpdate = true; scene.add(root);
  // the shutter over the doorway while it's shut: dark slats, rolled down
  const shutMat = new THREE.MeshLambertMaterial({ color: 0x2a2c34 });
  const shutter = new THREE.Group(); root.add(shutter);
  for (let k=0; k<8; k++){ const sl = new THREE.Mesh(new THREE.BoxGeometry(1.56, .17, .04), shutMat); sl.position.set(0, CURB + .1 + k*.18, c.door[1] + .07); shutter.add(sl); }
  shutter.traverse(o => { if (o.isMesh) o.layers.set(0); });
  const u = { time: { value: 0 } }, floorOn = { value: 1 }; u.lit = floorOn;
  const floorMat = new THREE.ShaderMaterial({ uniforms: u, transparent: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float time, lit; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
      void main(){
        vec2 cell = floor(vP/.42), f = fract(vP/.42);
        float beat = floor(time*124.0/60.0), bar = floor(beat/8.0), mode = mod(bar, 3.0);
        float r = length(cell + .5), a = atan(cell.y + .5, cell.x + .5);
        float on = mode < .5 ? step(.5, h(cell + beat))                                  // scattered tiles, a new lot each beat
                 : mode < 1.5 ? step(.5, fract(r*.25 - beat*.25))                       // rings rippling out
                 : step(.5, fract(a/6.2832*4.0 + beat*.125));                           // a spinning pinwheel
        vec3 c1 = vec3(1.0, .3, .8), c2 = vec3(.25, .9, 1.0), c3 = vec3(.65, .4, 1.0);
        float k = mod(cell.x + cell.y + bar, 3.0);
        vec3 col = k < .5 ? c1 : k < 1.5 ? c2 : c3;
        float edge = step(.08, f.x)*step(.08, f.y)*step(f.x, .92)*step(f.y, .92);
        float pulse = 1.0 - fract(time*124.0/60.0)*.45;
        gl_FragColor = vec4(mix(vec3(.05, .04, .08), col*pulse, on*edge*lit), 1.0);
      }` });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(c.floorR, 40), floorMat);
  floor.rotation.x = -PI/2; floor.position.set(0, c.floorY, 0); floor.layers.set(1); floor.renderOrder = 2; root.add(floor);
  // the mirror ball and its glints
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), new THREE.MeshBasicMaterial({ color: 0xdfe6f4 }));
  ball.position.set(0, c.rigY - .5, 0); ball.layers.set(1); root.add(ball);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .5, 6), new THREE.MeshBasicMaterial({ color: 0x2a2e3c })); rod.position.set(0, c.rigY - .1, 0); rod.layers.set(1); root.add(rod);
  const glints = [];
  for (let k=0; k<10; k++){ const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: [0xffffff, 0xff7ad8, 0x7af0ff][k % 3], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.layers.set(1); s.scale.set(.5, .5, 1); root.add(s); glints.push({ s, a: k*TAU/10, r: 1.2 + (k % 4)*.5, ph: k*.7 }); }
  // the beams: long thin cones from the rig down to the floor, swinging round
  const beams = [];
  const beamGeo = new THREE.ConeGeometry(.35, 1, 10, 1, true); beamGeo.translate(0, -.5, 0);
  [0xff4fc8, 0x38e8e0, 0x9b6bff, 0xffb347].forEach((col, k) => {
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const b = new THREE.Mesh(beamGeo, mat); b.position.set(Math.cos(k*PI/2)*.6, c.rigY, Math.sin(k*PI/2)*.6); b.layers.set(1); b.renderOrder = 4; root.add(b);
    const spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .6 }));
    spot.layers.set(1); spot.scale.set(1.2, 1.2, 1); root.add(spot);
    beams.push({ b, mat, spot, k }); });
  const _v = new THREE.Vector3();
  return {
    update(dt, time){
      u.time.value = time;
      ball.rotation.y = time*.8;
      const open = clubOpenAt(S.hour), night = open ? 1 : 0;
      shutter.visible = !open; floorOn.value = open ? 1 : 0;
      for (const B of beams){ B.b.visible = B.spot.visible = open; }
      for (const g of glints){ const a = g.a + time*.8, f = .5 + .5*Math.sin(time*6 + g.ph);
        g.s.position.set(Math.cos(a)*g.r, c.floorY + .05 + (g.r - 1.2)*.6, Math.sin(a)*g.r); g.s.material.opacity = f*.8*night; }
      for (const B of beams){
        const a = time*(.6 + B.k*.13) + B.k*PI/2, rr = 1.2 + 1.3*(.5 + .5*Math.sin(time*.9 + B.k));
        const tx = Math.cos(a)*rr, tz = Math.sin(a)*rr;
        _v.set(tx - B.b.position.x, c.floorY - c.rigY, tz - B.b.position.z);
        const len = _v.length(); B.b.scale.set(1, len, 1);
        B.b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _v.normalize());
        B.spot.position.set(tx, c.floorY + .04, tz);
        B.mat.opacity = .12 + .08*(.5 + .5*Math.sin(time*124/60*PI));
      }
    },
    dispose(){ scene.remove(root); floor.geometry.dispose(); floorMat.dispose(); ball.geometry.dispose(); ball.material.dispose(); rod.geometry.dispose(); rod.material.dispose();
      for (const g of glints) g.s.material.dispose(); beamGeo.dispose(); shutMat.dispose(); shutter.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const B of beams){ B.mat.dispose(); B.spot.material.dispose(); } }
  };
}

/* ---------- variants: each megastructure's own colour scheme ---------- */
// Besides what its seed already shuffles (dish farms, mast height, shop signs...), every megastructure picks a colour
// scheme from its seed. The first scheme of each kind is the original look; the others swap its main materials (and
// the glows that go with them) while it's built, through the same hook the districts use for their palettes (LUX,
// see core.js). The town square varies in its own way instead (see squareVariant).
let MEGA_SKINS = null;
function megaSkins(){
  if (MEGA_SKINS) return MEGA_SKINS;
  const t = (hex, o) => toon(hex, o);
  const trimAmber = t(0x5a3e18, { em:0xffb347, kind:'trim' }), trimPink = t(0x5a1d3a, { em:0xff4fa3, kind:'trim' });
  const lamp = em => t(0x2a3a4a, { em, kind:'lamp' }), neon = (hex, em) => t(hex, { em, kind:'neon' });
  MEGA_SKINS = {
    radio: [null,
      { mats: [[M.concM, t(0x8e4a3a)], [M.concD, t(0x5e3a30)], [M.concL, t(0xb08870)], [M.trimCyan, trimAmber], [M.neonPink, M.neonCyan], [M.red2, M.hazard]] },          // brick, yellow and white mast
      { mats: [[M.concM, t(0x3f6f6a)], [M.concD, t(0x2c4c4a)], [M.concL, t(0x7aa49c)], [M.trimCyan, trimPink], [M.neonPink, M.neonAmber], [M.red2, t(0xd06a2a)]] },      // teal, orange mast
      { mats: [[M.concM, t(0xd6dad6)], [M.concD, t(0x8a9096)], [M.concL, t(0xeef0ee)], [M.neonPink, M4.neonPurple], [M.red2, t(0x2a2f38)]] } ],                           // white, black and white mast
    mall: [null,
      { mats: [[M.lux, t(0x2a2c32)], [M.lux2, t(0x3a3c44)], [M.marbleOut, t(0x34363e)]] },                                                                                  // noir and gold
      { mats: [[M.gold, t(0xd89a80)], [M.goldLit, t(0xc8806a, { em:0xffaa80, kind:'trim' })], [M.lux, t(0xf6ece8)], [M.lux2, t(0xead8d2)]], glows: { warm: 'rosegold' } },   // rose gold
      { mats: [[M.gold, t(0xc8ccd8)], [M.goldLit, t(0xb8c0d0, { em:0xe2d6ff, kind:'trim' })], [M.lux, t(0xeef2f6)]], glows: { warm: 'platinum' } } ],                      // platinum
    police: [null,
      { mats: [[M.polWall, t(0x2e3442)], [M.polWall2, t(0x3a4252)], [M.polDark, t(0x161a22)], [M.polFrame, t(0x5a6270)], [M.neonCyan, M4.neonBlue]], glows: { cyan: 'blue' } },   // midnight
      { mats: [[M.polWall, t(0x9ab4d4)], [M.polWall2, t(0x7a94b8)], [M.polDark, t(0x1e2a48)], [M.neonCyan, M.neonAmber]], glows: { cyan: 'amber' } },                              // blue and amber
      { mats: [[M.polWall, t(0xd8ccb4)], [M.polWall2, t(0xb8a88e)], [M.polDark, t(0x3a3028)], [M.polFrame, t(0x8a7a64)]] } ],                                                  // sandstone
    foundry: [null,
      { mats: [[M.fSteel, t(0x7a5a46)], [M.fSteel2, t(0x8a6a54)], [M.fSteel3, t(0x5a4032)], [M.fGlow, neon(0x5a1010, 0xff1a3a)], [M.fGlow2, neon(0x5a1418, 0xff3a4a)]], glows: { orange: 'crimson' } },   // rust and crimson
      { mats: [[M.fSteel, t(0x4e5a6e)], [M.fSteel2, t(0x66728a)], [M.fSteel3, t(0x3a4456)], [M.fGlow, neon(0x10283a, 0x38e8e0)], [M.fGlow2, neon(0x10303a, 0x5ad8ff)], [M.fWin, t(0x1a3040, { em:0x7fd0ff, kind:'window' })]], glows: { orange: 'cyan' } },   // cobalt
      { mats: [[M.fSteel, t(0x4a5a3a)], [M.fSteel2, t(0x5e6e4a)], [M.fSteel3, t(0x36422c)], [M.fGlow, neon(0x2a4010, 0xc6ff3a)], [M.fGlow2, neon(0x30400e, 0xd8ff5a)]], glows: { orange: 'toxic' } } ],     // chemical green
    market: [null,
      { mats: [[M.mkTeal, t(0xb86a4a)], [M.mkTeal2, t(0x9a5640)], [M.mkTeal3, t(0x6a3a2c)], [M.mkTarp, t(0x3f8a80)], [M.mkTarp2, t(0x347670)]] },   // terracotta
      { mats: [[M.mkTeal, t(0x7a5aa0)], [M.mkTeal2, t(0x664a8a)], [M.mkTeal3, t(0x3e2c58)], [M.mkTarp, t(0xd8508a)], [M.mkTarp2, t(0xb8406e)]] },   // violet
      { mats: [[M.mkTeal, t(0xc8b47a)], [M.mkTeal2, t(0xa8946a)], [M.mkTeal3, t(0x6a5a40)], [M.mkTarp, t(0xc84a4a)], [M.mkTarp2, t(0xa83a3a)]] } ],  // sand
    club: [null,
      { mats: [[M.domeNeonA, neon(0x3a2a10, 0xffb347)], [M.domeNeonB, neon(0x3a1a5a, 0x9b6bff)]], glows: { cyan: 'amber', pink: 'platinum' } },   // amber and violet
      { mats: [[M.domeNeonA, neon(0x1a4010, 0x7aff6a)], [M.domeNeonB, neon(0x5a1a3a, 0xff4fa3)]], glows: { cyan: 'green' } },                    // acid green and pink
      { mats: [[M.domeNeonA, neon(0x1a2a60, 0x4f7bff)], [M.domeNeonB, neon(0x5a1010, 0xff2a4a)], [M.domeDrum, t(0x24262e)]], glows: { cyan: 'blue', pink: 'crimson' } } ],   // blue and red
    pagoda: [null,
      { mats: [[M.lxWhite, t(0xb8402e)], [M.lxWhite2, t(0x2e2826)], [M.pgNeon, lamp(0xffb347)]], glows: { cyan: 'amber' } },          // temple red
      { mats: [[M.lxWhite, t(0x5a9a80)], [M.lxWhite2, t(0x3e6e5a)], [M.gold, t(0xb88a4a)], [M.pgNeon, lamp(0xff6fb8)]], glows: { cyan: 'pink' } },   // jade and bronze
      { mats: [[M.lxWhite, t(0x2e3448)], [M.lxWhite2, t(0x22283a)], [M.pgNeon, lamp(0x9b6bff)]], glows: { cyan: 'platinum' } } ],      // midnight
  };
  return MEGA_SKINS;
}
// the scheme this one wears (null: the original look)
function megaSkinOf(m){
  const list = megaSkins()[m.kind]; if (!list) return null;
  const k = hash('skin', m.kind, m.seed) % list.length, s = list[k];
  m.skin = k;
  return s ? { mats: new Map(s.mats), glows: s.glows || {} } : null;
}
function withSkin(skin, fn){ if (!skin) return fn(); const was = LUX; LUX = skin; try { return fn(); } finally { LUX = was; } }
