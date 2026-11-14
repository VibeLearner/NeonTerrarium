// Neon Dome pour lab: the simulation. No drawing and no page here, so it runs the same in a browser and in node
// (tools/pourlab/test_sim.mjs). Everything is in the scene's own pixels (480x270) and seconds; volumes are in
// "parts", the bar's unit of measure.
//
// Game-dev terms used below:
//   particle     a tiny moving dot with a position and a speed; thousands of them make the stream and the splashes
//   fixed step   physics advances in equal small slices (1/120 s) however fast the screen draws, so it behaves
//                the same on every machine
//   heightfield  the liquid's surface stored as one height per pixel column; waves are those heights pushing on
//                their neighbors (a "1D wave")
//   state        what something is doing right now (a tool at home, lifted, being strained...); the code moves
//                things from one state to the next
import { taste, METHOD, SHAKE_FIZZ_LEFT, INGREDIENTS as FLAVOR, MAX_DASHES } from "./flavor.js"

export const STEP = 1 / 120
const GRAV = 520                      // px/s², tuned by feel: a stream falls about 50 px in a third of a second
const PART_VOL = 0.01                 // parts carried by one stream particle
export const MAX_PARTS = 8, FILL_LINE = 2.5, DASH = 0.05
const ICE_DISPLACE = 0.35             // parts of level each floating cube adds (lab choice)
const MAX_ICE = 4

// Pour rates (lab choice: the design doc says each bottle has its own rate, not what they are).
// flow: parts per second at full tilt. thick: syrups fall in a heavier, steadier stream.
export const INGREDIENT_RULES = {
  rice: { flow: 1.6 }, rye: { flow: 1.5 }, rum: { flow: 1.6 }, coffee: { flow: 1.2, thick: true },
  yuzu: { flow: 1.8 }, ume: { flow: 1.4 }, lemongrass: { flow: 1.1, thick: true }, glow: { flow: 0.9, thick: true },
  ginger: { flow: 1.6 }, shiso: { flow: 2.0 }, soda: { flow: 2.2 },
  bitters: { dash: true }, chili: { dash: true },
}
// Names for the readout: the bottles' full names, plus melted ice.
export const SHORT = {
  rice: "Clear Grid rice spirit", rye: "Ashline smoked rye", rum: "Neon Cane rum", coffee: "Night Shift coffee liqueur",
  yuzu: "Yuzu juice", ume: "Ume ferment", lemongrass: "Lemongrass cordial", glow: "Glow syrup", ginger: "Ginger fire",
  shiso: "Shiso tonic", soda: "Soda water", bitters: "Static bitters", chili: "Chili tincture", water: "Melted ice",
}
const isFizzy = (id) => FLAVOR[id].tags.includes("fizz")

export const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
// colors mix in linear light (as light really adds up), not in raw sRGB numbers, so a little dark coffee in pale
// yuzu reads as a believable tea brown rather than a muddy grey
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const toSrgb = (v) => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))
const lin = (rgb) => rgb.map(toLin)
const srgb = (l) => l.map(toSrgb)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const ease = (t) => t * t * (3 - 2 * t)

// A seeded random number generator, so a test run is repeatable.
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

// ---------------------------------------------------------------- what a vessel holds
// parts (melted ice included as "water"), how cold it is (summed over its volume), how much of its fizz is left,
// whether it was shaken, how many dashes of each, and a short log of how it was made
const newContents = () => ({ parts: new Map(), chillVol: 0, fizzKeep: 0, shaken: false, dashes: new Map(), log: [], directVol: 0, buildWater: 0, techT: 0 })
const volOf = (c) => { let s = 0; for (const v of c.parts.values()) s += v; return s }
const fizzyOf = (c) => { let s = 0; for (const [id, v] of c.parts) if (isFizzy(id)) s += v; return s }
function addTo(c, comp, vol, meta = {}) {
  if (vol <= 0) return
  let fz = 0
  for (const [id, f] of comp) { c.parts.set(id, (c.parts.get(id) || 0) + vol * f); if (isFizzy(id)) fz += vol * f }
  c.chillVol += vol * (meta.chill || 0)
  c.fizzKeep += fz * (meta.ret ?? 1)
  if (meta.shaken) c.shaken = true
  if (meta.direct) c.directVol += vol
  if (meta.log) for (const l of meta.log) if (!c.log.includes(l)) c.log.push(l)
  if (meta.dashRate) for (const [id, n] of meta.dashRate) c.dashes.set(id, (c.dashes.get(id) || 0) + n * vol)   // dashes per part, so each drop brings its share
}
// take some volume out (a cup or tool pouring): returns its makeup and properties, and shrinks the rest to match
function takeFrom(c, vol) {
  const tot = volOf(c); vol = Math.min(vol, tot)
  if (tot <= 0 || vol <= 0) return null
  const k = vol / tot, fz = fizzyOf(c)
  const out = { comp: new Map([...c.parts].map(([id, v]) => [id, v / tot])), vol,
    meta: { chill: c.chillVol / tot, ret: fz > 0 ? c.fizzKeep / fz : 1, shaken: c.shaken, log: [...c.log], dashRate: new Map([...c.dashes].map(([id, n]) => [id, n / tot])) } }
  for (const [id, v] of c.parts) c.parts.set(id, v * (1 - k))
  for (const [id, n] of c.dashes) c.dashes.set(id, n * (1 - k))     // dashes travel with the drink
  for (const key of ["chillVol", "fizzKeep", "directVol", "buildWater"]) c[key] *= 1 - k
  return out
}
function clearContents(c) { Object.assign(c, newContents()) }
export function tasteOf(c) {
  const fz = fizzyOf(c)
  const parts = new Map([...c.parts].filter(([, v]) => v > 1e-6))
  const vol = volOf(c)
  return taste({ parts, chill: vol > 0 ? c.chillVol / vol : 0, fizz: fz > 0 ? c.fizzKeep / fz : 1, shaken: c.shaken })
}

export function createSim(L, sizes) {
  const R = rng(7)
  const ing = Object.fromEntries(L.ingredients.map((g) => [g.id, { ...g, ...INGREDIENT_RULES[g.id], lin: lin(hexRgb(g.liquid)) }]))
  ing.water = { id: "water", lin: lin(hexRgb("#E2EEF0")) }
  // water lightens a mix only gently (melted ice doesn't wash a drink out to white)
  const colorWeight = (id) => (id === "water" ? 0.35 : 1)
  function compColor(parts) {
    let tot = 0; const m = [0, 0, 0]
    for (const [id, v] of parts) { const w = v * colorWeight(id); tot += w; for (let k = 0; k < 3; k++) m[k] += ing[id].lin[k] * w }
    return tot > 0 ? m.map((x) => x / tot) : [0, 0, 0]
  }

  // ---------------------------------------------------------------- the glass (from the sprite's own numbers)
  const G = L.glass, gw = sizes.glass.w, gh = sizes.glass.h
  const ryT = Math.max(2, Math.round(G.rt * L.K)), ryB = Math.max(2, Math.round(G.rb * L.K))
  const glass = { left: Math.round(L.POUR_X - gw / 2), top: L.GLASS_BASE - gh, w: gw, h: gh, ryT, ryB }
  glass.cx = glass.left + G.cx
  glass.rimY = glass.top + ryT                       // the rim's middle line
  glass.bottomY = glass.top + ryT + G.h - 4          // the liquid's lowest row, just above the thick base
  const topY = glass.rimY + 3                        // 8 parts reach here
  glass.ppp = (glass.bottomY - topY) / MAX_PARTS     // pixels of height per part
  glass.hw = (y) => G.rt + (G.rb - G.rt) * clamp((y - glass.rimY) / G.h, 0, 1)
  glass.inner = (y) => { const hw = glass.hw(y); return [Math.round(glass.cx - hw + 2), Math.round(glass.cx + hw - 1)] }
  const [col0, col1] = glass.inner(glass.bottomY)
  const N = col1 - col0 + 1, ROWS = Math.ceil(glass.bottomY - topY) + 4
  glass.col0 = col0; glass.N = N; glass.ROWS = ROWS

  // ---------------------------------------------------------------- state
  const S = {
    t: 0,
    glass: newContents(),
    wave: new Float32Array(N), waveV: new Float32Array(N),
    field: new Float32Array(N * ROWS * 3), fieldReady: false,   // the swirl: a linear-light color per cell
    mean: [0, 0, 0],
    swirls: [],                 // little dye blobs that sink and curl where a new color enters
    particles: [],              // stream, drips and splash spray
    splats: [],                 // drops landing on the counter, a short-lived mark
    bubbles: [], foam: 0,
    ice: [],                    // cubes: in flight from the well, or in the glass
    overflow: 0,                // recent spill over the rim (drives the drips down the outside)
    held: null,                 // { kind: "bottle" | "dasher" | "cup", id, x, y, angle, ... }
    pressing: false,
    cups: {}, activeCup: null,
    tools: {}, toolMode: null,  // the shaker and stirring glass; which one is lifted and in use
    emitAcc: 0, streamId: 1, trail: 0,
    notice: null,               // a short message for the player, fading
  }
  const say = (text) => { S.notice = { text, t: 3.5 } }

  // ---------------------------------------------------------------- measuring cups
  const MEASURE = { x: L.POUR_X - 40, y: L.GLASS_BASE + 2 }
  const CAP = { cup_quarter: 0.25, cup_half: 0.5, cup_one: 1 }
  for (const t of L.tools) if (L.cups[t.id]) {
    const c = L.cups[t.id]
    S.cups[t.id] = { id: t.id, home: { x: t.x, y: t.y }, x: t.x, y: t.y, cap: CAP[t.id], ...c, state: "home", c: newContents(),
      angle: 0, anim: 0, from: null, to: null, ryT: Math.max(2, Math.round(c.rt * L.K)), w: sizes[t.id].w, h: sizes[t.id].h }
  }
  // the rim's middle line on screen, and the half width of the opening
  const cupRim = (cup) => ({ y: cup.y - cup.h + 1 + cup.ryT, cx: cup.x, hw: cup.rt - 1 })

  // ---------------------------------------------------------------- the shaker and stirring glass
  const TOOL_METHOD = { shaker: "shake", mixing_glass: "stir" }
  for (const t of L.tools) if (L.vessels[t.id]) {
    const v = L.vessels[t.id]
    S.tools[t.id] = { id: t.id, method: TOOL_METHOD[t.id], home: { x: t.x, y: t.y }, x: t.x, y: t.y, ...v, ryT: Math.max(2, Math.round(v.rt * L.K)),
      w: sizes[t.id].w, h: sizes[t.id].h, state: "home", angle: 0, anim: 0, from: null, to: null, c: newContents(), stir: 0 }
  }
  const toolBox = (tool) => ({ left: Math.round(tool.x - tool.w / 2), top: tool.y - tool.h })
  const toolRim = (tool) => { const b = toolBox(tool); return { y: b.top + tool.top + tool.ryT, cx: b.left + tool.cx, hw: tool.rt - 2 } }
  const TOOL_CAP = 6   // parts a tool holds before brimming over (lab choice)

  // ---------------------------------------------------------------- totals for the glass
  const total = () => volOf(S.glass)
  const iceIn = () => S.ice.filter((c) => c.state === "in").length
  const iceDisp = () => (total() > 0.15 ? iceIn() * ICE_DISPLACE : 0)
  const levelParts = () => Math.min(MAX_PARTS, total() + iceDisp())
  const surfaceY = () => glass.bottomY - levelParts() * glass.ppp

  // ---------------------------------------------------------------- adding liquid to the glass
  const colOf = (x) => clamp(Math.round(x - glass.col0), 0, N - 1)
  function addToGlass(comp, vol, x, speed, meta) {
    if (vol <= 0) return
    const before = total()
    addTo(S.glass, comp, vol, meta)
    const fz = [...comp].reduce((s, [id, f]) => s + (isFizzy(id) ? f : 0), 0) * vol * (meta.ret ?? 1)
    if (fz > 0) S.foam = Math.min(6, S.foam + fz * (8 + speed * 0.06))
    const c = colOf(x), color = compColor(comp)
    if (before < 1e-6 || !S.fieldReady) { for (let i = 0; i < S.field.length; i += 3) S.field.set(color, i); S.fieldReady = true }
    // the new color lands where it enters, and a little curl of it sinks and swirls before it blends
    paint(c, Math.round(glass.bottomY - surfaceY()), color, Math.min(0.9, vol * 30))
    if (S.swirls.length < 60 && R() < 0.5) S.swirls.push({ x: c, y: glass.bottomY - surfaceY(), a: R() * 6.28, r: 1.5 + R() * 2.5, spin: (R() < 0.5 ? -1 : 1) * (5 + R() * 4), sink: 18 + R() * 16, life: 0.9, color })
    // the stream pushes the surface down where it lands; a hard, fast hit throws spray
    S.waveV[c] -= speed * vol * 90
    if (c > 0) S.waveV[c - 1] -= speed * vol * 40
    if (c < N - 1) S.waveV[c + 1] -= speed * vol * 40
    if (speed > 120 && R() < 0.06 + vol * 4) spray(x, surfaceY() - 1, color, 2)
    checkOverflow()
  }
  function paint(c, row, color, w) {
    for (let dc = -2; dc <= 2; dc++) for (let dr = -1; dr <= 4; dr++) {
      const cc = c + dc, rr = row - dr; if (cc < 0 || cc >= N || rr < 0 || rr >= ROWS) continue
      const f = w * (1 - Math.abs(dc) / 3) * (1 - Math.max(0, dr) / 5), i = (rr * N + cc) * 3
      for (let k = 0; k < 3; k++) S.field[i + k] = lerp(S.field[i + k], color[k], f)
    }
  }
  function checkOverflow() {
    const over = total() + iceDisp() - MAX_PARTS
    if (over <= 0) return
    takeFrom(S.glass, over)                         // what spills is the mix itself
    S.overflow = Math.min(1, S.overflow + over * 3)
  }
  function spray(x, y, color, n) {
    for (let k = 0; k < n; k++) S.particles.push({ x, y, vx: (R() - 0.5) * 90, vy: -50 - R() * 70, vol: 0, color, spray: true, sid: 0, life: 1.2 })
  }

  // ---------------------------------------------------------------- picking things up and putting them back
  function pick(id, from) {
    const g = ing[id]
    S.held = { kind: g.dash ? "dasher" : "bottle", id, x: from.x, y: from.y, tx: from.x, ty: from.y, angle: 0, shake: 0, back: null }
    S.pressing = false
  }
  function putBack(railPos) {
    if (!S.held) return
    if (S.held.kind === "cup") { returnCup(); return }
    S.held.back = { x: railPos.x, y: railPos.y, t: 0 }
    S.pressing = false
  }
  function aim(x, y) { if (S.held) { S.held.tx = x; S.held.ty = y } }
  function press(on) {
    if (S.toolMode) { S.pressing = on; return }
    if (!S.held || S.held.back) return
    if (S.held.kind === "dasher") { if (on) dash(); return }
    S.pressing = on
    if (!on) S.trail = 0.35                          // a few last drops after letting go
  }
  const pourDir = (a) => [Math.sin(a), -Math.cos(a)]
  function dash() {
    const h = S.held; h.shake = 0.18
    S.particles.push({ x: h.x, y: h.y + 2, vx: (R() - 0.5) * 6, vy: 40, vol: DASH, color: ing[h.id].lin, comp: new Map([[h.id, 1]]), meta: { direct: true }, sid: 0, dash: h.id, life: 3 })
  }

  // ---------------------------------------------------------------- ice
  function addIce(from) {
    if (S.ice.length >= MAX_ICE) { say("Four cubes is plenty for this glass."); return false }
    S.ice.push({ state: "fly", t: 0, fx: from.x, fy: from.y, tx: glass.cx + (R() - 0.5) * 8, ty: glass.rimY - 4, x: from.x, y: from.y, vx: 0, vy: 0 })
    return true
  }

  // ---------------------------------------------------------------- cups: measure, then pick up and pour
  function moveCup(cup, state, to) { cup.state = state; cup.anim = 0; cup.from = { x: cup.x, y: cup.y }; cup.to = to }
  function activateCup(id) {
    for (const c of Object.values(S.cups)) if (c !== S.cups[id] && (c.state === "active" || c.state === "toMeasure")) sendHome(c)
    const cup = S.cups[id]
    if (cup.state !== "home") return
    moveCup(cup, "toMeasure", { ...MEASURE }); S.activeCup = id
  }
  function sendHome(cup) { clearContents(cup.c); moveCup(cup, "toHome", { ...cup.home }); if (S.activeCup === cup.id) S.activeCup = null }
  // a filled cup is picked up like a bottle and poured wherever you aim; an empty one goes back to its place
  function clickActiveCup() {
    const cup = S.cups[S.activeCup]; if (!cup || cup.state !== "active") return
    if (volOf(cup.c) > 0.001) {
      cup.state = "held"
      const rim = cupRim(cup)
      S.held = { kind: "cup", id: cup.id, x: rim.cx + cup.rt, y: rim.y, tx: rim.cx + cup.rt, ty: rim.y, angle: 0, back: null }
    } else sendHome(cup)
  }
  function returnCup() {
    const cup = S.cups[S.held.id]; S.held = null; S.pressing = false
    moveCup(cup, "toMeasure", { ...MEASURE })
  }

  // ---------------------------------------------------------------- tools: shake or stir, then strain
  function liftTool(id) {
    const tool = S.tools[id]
    if (tool.state !== "home") return
    if (volOf(tool.c) < 0.01) { say(id === "shaker" ? "Pour something into the shaker first." : "Pour something into the stirring glass first."); return }
    if (S.held) S.held = null
    moveTool(tool, "lift", { x: tool.home.x + (id === "shaker" ? 2 : 0), y: tool.home.y - (id === "shaker" ? 30 : 20) })   // straight up off its spot
    S.toolMode = id; S.pressing = false
  }
  function moveTool(tool, state, to) { tool.state = state; tool.anim = 0; tool.from = { x: tool.x, y: tool.y }; tool.to = to }
  function putToolDown() { const tool = S.tools[S.toolMode]; if (!tool) return; S.toolMode = null; S.pressing = false; moveTool(tool, "down", { ...tool.home }) }
  // strain into the glass, or into the other tool (stir, then shake: or the other way round)
  function strainTool(into = "glass") {
    const tool = S.tools[S.toolMode]; if (!tool || tool.state !== "ready") return
    const other = into !== "glass" && S.tools[into]
    if (into !== "glass" && (!other || other === tool || other.state !== "home")) return
    S.toolMode = null; S.pressing = false
    // its method goes in the drink's log, and travels with the drink
    if (tool.c.techT > 0.3) tool.c.log.push(`${tool.method === "shake" ? "Shaken" : "Stirred"} ${Math.round(tool.c.techT)} s`)
    tool.c.techT = 0
    // place it so the turned lip ends up just above the middle of what it pours into
    const lip = lipOffset(tool, 1.9), rim = other ? toolRim(other) : { cx: glass.cx, y: glass.top }
    moveTool(tool, "strainUp", { x: rim.cx - 3 - lip.x, y: rim.y - 6 - lip.y })
  }
  function dumpTool() { const tool = S.tools[S.toolMode]; if (!tool) return; clearContents(tool.c); putToolDown() }
  // shaking or stirring while held: melted ice and cold build up with time, easing to a plateau
  function workTool(tool, dt) {
    const c = tool.c, M = METHOD[tool.method]
    c.techT += dt
    const ingVol = volOf(c) - (c.parts.get("water") || 0)
    // melted ice only builds up to this method's curve: water already in the drink (from stirring before shaking,
    // say) counts toward it, so a second technique adds only what it would add beyond the first
    const D = M.dilution(c.techT), target = ingVol * D / (1 - D), water = c.parts.get("water") || 0
    if (target > water) addTo(c, new Map([["water", 1]]), target - water)
    const v = volOf(c); c.chillVol = Math.max(c.chillVol, v * M.chill(c.techT))
    if (tool.method === "shake") {
      c.shaken = true
      const fz = fizzyOf(c); if (fz > 0) c.fizzKeep = Math.max(fz * SHAKE_FIZZ_LEFT, c.fizzKeep * Math.exp(-dt * 4))
    }
  }

  function emptyGlass() {
    clearContents(S.glass); S.ice = S.ice.filter((c) => c.state === "fly")
    S.wave.fill(0); S.waveV.fill(0); S.swirls = []; S.bubbles = []; S.foam = 0; S.overflow = 0
    S.fieldReady = false
    S.particles = S.particles.filter((p) => !p.inGlass)
  }

  // ---------------------------------------------------------------- one fixed step
  function step(dt = STEP) {
    S.t += dt
    if (S.notice && (S.notice.t -= dt) <= 0) S.notice = null
    stepHeld(dt)
    for (const cup of Object.values(S.cups)) stepCup(cup, dt)
    for (const tool of Object.values(S.tools)) stepTool(tool, dt)
    stepParticles(dt)
    S.splats = S.splats.filter((s) => (s.life -= dt) > 0)
    stepBuild(dt)
    stepSurface(dt)
    stepField(dt)
    stepFizz(dt)
    stepIce(dt)
    if (S.overflow > 0) S.overflow = Math.max(0, S.overflow - dt * 0.6)
  }

  // the held bottle or cup follows the pointer, a little behind it; it tilts while pressed, rights itself when let go
  function stepHeld(dt) {
    const h = S.held; if (!h) return
    if (h.back) {
      h.back.t += dt / 0.22
      h.x = lerp(h.x, h.back.x, Math.min(1, h.back.t)); h.y = lerp(h.y, h.back.y, Math.min(1, h.back.t))
      h.angle = lerp(h.angle, 0, Math.min(1, dt * 14))
      if (h.back.t >= 1) S.held = null
      return
    }
    const k = 1 - Math.exp(-dt * 16)
    h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k
    if (h.kind === "dasher") { h.angle = Math.PI; if (h.shake > 0) h.shake -= dt; return }
    const target = S.pressing ? 2.0 : 0, rate = S.pressing ? 3.2 : 6        // about 115 degrees: a full, steady pour
    h.angle += clamp(target - h.angle, -rate * dt, rate * dt)
    // flow ramps up with the tilt (nothing until the liquid reaches the neck, at about 65 degrees)
    const f = clamp((h.angle - 1.13) / (1.85 - 1.13), 0, 1)
    let flow, source = null
    if (h.kind === "cup") {
      const cup = S.cups[h.id]; source = cup.c
      flow = volOf(cup.c) > 1e-6 ? 3 * f : 0
      if (volOf(cup.c) <= 1e-6 && !S.pressing && h.angle < 0.3) { clearContents(cup.c); returnCup(); return }
    } else {
      const g = ing[h.id]
      flow = g.flow * f * f * (3 - 2 * f)
      if (!S.pressing && S.trail > 0) { S.trail -= dt; flow = Math.max(flow, R() < 0.25 ? 0.4 : 0) }   // trailing drops
    }
    if (flow <= 0) { if (!S.pressing) { S.emitAcc = 0; S.streamId++ } return }
    S.emitAcc += flow * dt / PART_VOL
    const thick = h.kind === "bottle" && ing[h.id].thick
    const [dx, dy] = pourDir(h.angle), speed = (thick ? 26 : 34) + 34 * f
    while (S.emitAcc >= 1) {
      S.emitAcc -= 1
      let comp, meta, color, vol = PART_VOL
      if (source) {
        const out = takeFrom(source, PART_VOL); if (!out) break
        comp = out.comp; meta = out.meta; color = compColor(out.comp); vol = out.vol
      } else { comp = new Map([[h.id, 1]]); meta = { direct: true }; color = ing[h.id].lin }
      const wob = Math.sin(S.t * (thick ? 9 : 17) + S.streamId) * (thick ? 2 : 5)
      S.particles.push({ x: h.x + dx * 1.5, y: h.y + dy * 1.5, vx: dx * speed + wob + (R() - 0.5) * 3, vy: dy * speed, vol,
        color, comp, meta, sid: S.streamId, life: 4, thin: f < 0.35 || !S.pressing, broken: f < 0.2 && R() < 0.5 })
    }
  }

  function stepCup(cup, dt) {
    if (cup.state === "toMeasure" || cup.state === "toHome") {
      cup.anim = Math.min(1, cup.anim + dt / 0.25)
      const e = ease(cup.anim); cup.x = lerp(cup.from.x, cup.to.x, e); cup.y = lerp(cup.from.y, cup.to.y, e) - Math.sin(Math.PI * cup.anim) * 10
      cup.angle = 0
      if (cup.anim >= 1) cup.state = cup.state === "toMeasure" ? "active" : "home"
    }
  }
  function stepTool(tool, dt) {
    const go = (secs) => { tool.anim = Math.min(1, tool.anim + dt / secs); const e = ease(tool.anim); tool.x = lerp(tool.from.x, tool.to.x, e); tool.y = lerp(tool.from.y, tool.to.y, e); return e }
    if (tool.state === "lift") { go(0.25); if (tool.anim >= 1) tool.state = "ready" }
    else if (tool.state === "ready") {
      if (S.toolMode === tool.id && S.pressing) { workTool(tool, dt); tool.stir += dt }
    } else if (tool.state === "down") { go(0.25); if (tool.anim >= 1) tool.state = "home" }
    else if (tool.state === "strainUp") { const e = go(0.35); tool.angle = 1.9 * e; if (tool.anim >= 1) { tool.state = "straining"; tool.anim = 0 } }
    else if (tool.state === "straining") {
      // through the strainer at about 3 parts a second; the ice stays in the tool
      const out = takeFrom(tool.c, Math.min(volOf(tool.c), 3 * dt))
      if (out) {
        const lip = toolLip(tool), n = Math.max(1, Math.round(out.vol / PART_VOL)), color = compColor(out.comp)
        for (let k = 0; k < n; k++) S.particles.push({ x: lip.x, y: lip.y, vx: 6 + (R() - 0.5) * 4, vy: 10, vol: out.vol / n, color, comp: out.comp, meta: out.meta, sid: -2, life: 4 })
      }
      if (volOf(tool.c) <= 1e-6) { tool.anim += dt; if (tool.anim > 0.25) { clearContents(tool.c); moveTool(tool, "strainDown", { ...tool.home }) } }
    } else if (tool.state === "strainDown") { const e = go(0.35); tool.angle = 1.9 * (1 - e); if (tool.anim >= 1) { tool.state = "home"; tool.angle = 0 } }
  }
  // the pouring lip: the rim's right end, turned with the tool about its base point
  function lipOffset(tool, a) {
    const lx = tool.rt + 1, ly = -(tool.h - tool.top - tool.ryT)
    return { x: lx * Math.cos(a) - ly * Math.sin(a), y: lx * Math.sin(a) + ly * Math.cos(a) }
  }
  function toolLip(tool) { const o = lipOffset(tool, tool.angle); return { x: tool.x + o.x, y: tool.y + o.y } }

  // particles: fall, land in a vessel, or splat on the counter
  function catchers() {
    const list = []
    const cup = S.activeCup && S.cups[S.activeCup]
    if (cup && cup.state === "active") list.push({ rim: cupRim(cup), c: cup.c, cap: cup.cap, name: "cup" })
    for (const tool of Object.values(S.tools)) if (tool.state === "home") list.push({ rim: toolRim(tool), c: tool.c, cap: TOOL_CAP, name: tool.id })
    return list
  }
  function stepParticles(dt) {
    const surf = surfaceY(), into = catchers(), keep = []
    for (const p of S.particles) {
      p.life -= dt
      p.vy += GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.life <= 0) continue
      // into a measuring cup or a tool at the counter
      if (!p.spray && p.vy > 0 && !p.inGlass) {
        let caught = false
        for (const k of into) {
          if (p.y >= k.rim.y && p.y - p.vy * dt < k.rim.y && Math.abs(p.x - k.rim.cx) <= k.rim.hw) {
            caught = true
            if (p.dash && (k.c.dashes.get(p.dash) || 0) >= MAX_DASHES) { say("Six dashes is the most a drink takes."); break }
            const room = k.cap - volOf(k.c)
            if (room > 0) addTo(k.c, p.comp, Math.min(room, p.vol), p.meta)
            if (p.dash) k.c.dashes.set(p.dash, (k.c.dashes.get(p.dash) || 0) + 1)
            if (p.vol > room + 1e-9) splat(p.x + (R() - 0.5) * 6, k.rim.y + 2, p.color)   // brimming over
            break
          }
        }
        if (caught) continue
      }
      // into the glass: through the rim opening, then down to the surface
      const [il, ir] = glass.inner(p.y)
      if (!p.inGlass && p.y >= glass.rimY - glass.ryT && p.y - p.vy * dt < glass.rimY - glass.ryT && p.vy > 0) {
        if (p.x >= il && p.x <= ir) p.inGlass = true
        else if (p.x >= il - 3 && p.x <= ir + 3) { if (p.vol > 0) splat(p.x, p.y, p.color); continue }   // caught the rim
      }
      if (p.inGlass) {
        p.x = clamp(p.x, il, ir)
        const c = colOf(p.x), sy = surf + S.wave[c]
        if (p.y >= Math.min(sy, glass.bottomY)) {
          if (p.vol > 0) {
            if (p.dash && (S.glass.dashes.get(p.dash) || 0) >= MAX_DASHES) say("Six dashes is the most a drink takes.")
            else {
              addToGlass(p.comp, p.vol, p.x, Math.hypot(p.vx, p.vy), p.meta || {})
              if (p.dash) S.glass.dashes.set(p.dash, (S.glass.dashes.get(p.dash) || 0) + 1)
            }
          } else S.waveV[c] -= 4
          continue
        }
      }
      // the counter: anything that misses lands here (the glass's base and the mat sit about this high)
      if (!p.inGlass && p.y >= L.GLASS_BASE + 2) { if (p.vol > 0) splat(p.x, L.GLASS_BASE + 2, p.color); continue }
      if (p.y > L.H + 10) continue
      keep.push(p)
    }
    S.particles = keep
  }
  function splat(x, y, color) {
    if (S.splats.length < 80) S.splats.push({ x: Math.round(x), y: Math.round(y), color, life: 0.5 + R() * 0.4 })
  }
  // built over ice: cubes in the glass slowly melt into what was poured straight in (to 10%) and chill it (to 0.4)
  function stepBuild(dt) {
    const g = S.glass
    if (!iceIn() || total() < 0.1) return
    const target = g.directVol * 0.1 / 0.9
    if (g.buildWater < target) { const w = Math.min(target - g.buildWater, dt * 0.06); addTo(g, new Map([["water", 1]]), w); g.buildWater += w }
    const v = volOf(g); if (g.chillVol < v * 0.4) g.chillVol = Math.min(v * 0.4, g.chillVol + v * dt * 0.15)
    if (g.directVol > 0.2 && !g.log.includes("Built over ice")) g.log.push("Built over ice")
  }

  // the surface: each column pulled by its neighbors (a wave), slowly calming down
  function stepSurface(dt) {
    const w = S.wave, v = S.waveV, has = total() > 0.02
    for (let i = 0; i < N; i++) {
      const l = w[Math.max(0, i - 1)], r = w[Math.min(N - 1, i + 1)]
      v[i] += ((l + r - 2 * w[i]) * 1400 - w[i] * 40 - v[i] * 2.6) * dt
    }
    for (let i = 0; i < N; i++) w[i] = has ? clamp(w[i] + v[i] * dt, -3.5, 3.5) : 0
    let m = 0; for (let i = 0; i < N; i++) m += w[i]; m /= N
    for (let i = 0; i < N; i++) w[i] -= m          // waves move the surface around, never the amount of liquid
  }
  // the color: each cell drifts toward its neighbors and toward the drink's true mix, so a new pour shows as a
  // streak that curls and fades into the blend in a second or two
  function stepField(dt) {
    if (total() <= 0) return
    S.mean = compColor(S.glass.parts)
    const F = S.field, top = Math.min(ROWS - 1, Math.ceil(glass.bottomY - surfaceY()) + 1)
    for (const s of S.swirls) {
      s.life -= dt; s.a += s.spin * dt; s.y -= s.sink * dt
      const x = s.x + Math.cos(s.a) * s.r * 1.6, y = s.y + Math.sin(s.a) * s.r
      const c = Math.round(x), r = Math.round(y)
      if (c >= 0 && c < N && r >= 0 && r <= top) { const i = (r * N + c) * 3; for (let k = 0; k < 3; k++) F[i + k] = lerp(F[i + k], s.color[k], 0.35 * Math.max(0, s.life)) }
    }
    S.swirls = S.swirls.filter((s) => s.life > 0 && s.y > 0)
    const a = Math.min(0.45, dt * 9), relax = 1 - Math.exp(-dt * 1.4)
    const tmp = F.slice()
    for (let r = 0; r <= top; r++) for (let c = 0; c < N; c++) {
      const i = (r * N + c) * 3
      for (let k = 0; k < 3; k++) {
        const nb = (tmp[(r * N + Math.max(0, c - 1)) * 3 + k] + tmp[(r * N + Math.min(N - 1, c + 1)) * 3 + k] +
          tmp[(Math.max(0, r - 1) * N + c) * 3 + k] + tmp[(Math.min(top, r + 1) * N + c) * 3 + k]) / 4
        F[i + k] = lerp(lerp(tmp[i + k], nb, a), S.mean[k], relax)
      }
    }
  }
  // fizz: bubbles rise and pop while the drink still has its fizz; the foam head settles over a second or two
  function stepFizz(dt) {
    S.foam *= Math.exp(-dt / 0.9)
    const g = S.glass, fz = fizzyOf(g), tot = total()
    // a fizzy drink slowly goes flat in the glass (lab choice: about a minute to lose a third)
    g.fizzKeep *= Math.exp(-dt / 160)
    const lively = tot > 0 ? Math.min(1, (g.fizzKeep / Math.max(tot, 1e-6)) * 2.5) : 0
    if (tot > 0.1 && fz > 0 && R() < lively * 45 * dt && S.bubbles.length < 80) {
      const [il, ir] = glass.inner(glass.bottomY)
      S.bubbles.push({ x: il + 1 + R() * (ir - il - 2), y: glass.bottomY - R() * 3, vy: 10 + R() * 14, ph: R() * 6 })
    }
    const surf = surfaceY()
    for (const b of S.bubbles) { b.y -= b.vy * dt; b.vy += 6 * dt; b.ph += dt * 8 }
    S.bubbles = S.bubbles.filter((b) => { if (b.y <= surf + 1) { S.foam = Math.min(6, S.foam + 0.015); return false } return true })
  }
  // ice: flies from the well in an arc, splashes in, then floats: mostly under, a little showing, bobbing on the waves
  function stepIce(dt) {
    const surf = surfaceY(), has = total() > 0.15
    for (const c of S.ice) {
      if (c.state === "fly") {
        c.t = Math.min(1, c.t + dt / 0.5)
        c.x = lerp(c.fx, c.tx, c.t); c.y = lerp(c.fy, c.ty, c.t) - Math.sin(Math.PI * c.t) * 46
        if (c.t >= 1) { c.state = "in"; c.vy = 70; c.vx = (R() - 0.5) * 10 }
        continue
      }
      const col = colOf(c.x), sy = surf + S.wave[col]
      const floatY = sy + 1, restY = glass.bottomY - 2.5
      if (has && c.y >= floatY - 0.5) {
        if (!c.wet) { c.wet = true; S.waveV[col] -= Math.min(160, c.vy * 1.6); spray(c.x, sy - 1, S.mean, 3) }
        c.vy += (-(c.y - floatY) * 90 - c.vy * 7) * dt                          // buoyancy, damped
      } else c.vy += GRAV * 0.8 * dt
      c.y += c.vy * dt
      if (c.y > restY) { c.y = restY; c.vy = 0 }
      c.vx += (R() - 0.5) * 6 * dt - c.vx * 1.5 * dt
      for (const o of S.ice) if (o !== c && o.state === "in") { const d = c.x - o.x; if (Math.abs(d) < 6) c.vx += Math.sign(d || 1) * 30 * dt }
      const [il, ir] = glass.inner(c.y)
      c.x = clamp(c.x + c.vx * dt, il + 3, ir - 3)
      if (!has) c.wet = false
    }
  }

  // ---------------------------------------------------------------- readouts
  function readout(c = S.glass) {
    const rows = []
    for (const [id, v] of c.parts) if (v > 0.004) rows.push({ id, name: SHORT[id], parts: v, dashes: Math.round(c.dashes.get(id) || 0) })
    rows.sort((a, b) => (a.id === "water") - (b.id === "water"))
    const tot = volOf(c)
    return { rows, total: tot, ice: c === S.glass ? iceIn() : 0, full: c === S.glass && tot + iceDisp() >= MAX_PARTS - 0.01, fillLine: FILL_LINE,
      chill: tot > 0 ? c.chillVol / tot : 0, dilution: tot > 0 ? (c.parts.get("water") || 0) / tot : 0, log: c.log }
  }

  return {
    S, L, ing, glass, MEASURE, CAP,
    step, pick, putBack, aim, press, addIce, activateCup, clickActiveCup, sendHome, emptyGlass,
    liftTool, putToolDown, strainTool, dumpTool, toolBox, toolRim, toolLip,
    total, levelParts, surfaceY, volOf, cupRim, compColor, srgb, readout, tasteOf, say,
  }
}
