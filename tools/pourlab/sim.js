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

export const STEP = 1 / 120
const GRAV = 520                      // px/s², tuned by feel: a stream falls about 50 px in a third of a second
const PART_VOL = 0.01                 // parts carried by one stream particle
export const MAX_PARTS = 8, FILL_LINE = 2.5, DASH = 0.05
const ICE_DISPLACE = 0.35             // parts of level each floating cube adds
const MAX_ICE = 4

// Pour behavior per ingredient (my choices: the design doc wasn't readable when this was built).
// flow: parts per second at full tilt. fizzy: gives off bubbles and a foam head. thick: syrups pour slower and
// fall in a heavier, steadier stream.
export const INGREDIENT_RULES = {
  rice: { flow: 1.6 }, rye: { flow: 1.5 }, rum: { flow: 1.6 }, coffee: { flow: 1.2, thick: true },
  yuzu: { flow: 1.8 }, ume: { flow: 1.4 }, lemongrass: { flow: 1.1, thick: true }, glow: { flow: 0.9, thick: true },
  ginger: { flow: 1.6 }, shiso: { flow: 2.0, fizzy: true }, soda: { flow: 2.2, fizzy: true },
  bitters: { dash: true }, chili: { dash: true },
}
// Short names for the readout (the full names don't fit beside the glass).
export const SHORT = {
  rice: "Clear Grid rice", rye: "Ashline rye", rum: "Neon Cane rum", coffee: "Night Shift coffee", yuzu: "Yuzu juice",
  ume: "Ume ferment", lemongrass: "Lemongrass cordial", glow: "Glow syrup", ginger: "Ginger fire", shiso: "Shiso tonic",
  soda: "Soda water", bitters: "Static bitters", chili: "Chili tincture",
}

export const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
// colors mix in linear light (as light really adds up), not in raw sRGB numbers, so a little dark coffee in pale
// yuzu reads as a believable tea brown rather than a muddy grey
const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const toSrgb = (v) => Math.round(255 * Math.max(0, Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))
const lin = (rgb) => rgb.map(toLin)
const srgb = (l) => l.map(toSrgb)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t

// A seeded random number generator, so a test run is repeatable.
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

export function createSim(L, sizes) {
  const R = rng(7)
  const ing = Object.fromEntries(L.ingredients.map((g) => [g.id, { ...g, ...INGREDIENT_RULES[g.id], lin: lin(hexRgb(g.liquid)) }]))

  // ---------------------------------------------------------------- the glass (from the sprite's own numbers)
  const G = L.glass, gw = sizes.glass.w, gh = sizes.glass.h
  const ryT = Math.max(2, Math.round(G.rt * L.K)), ryB = Math.max(2, Math.round(G.rb * L.K))
  const glass = {
    left: Math.round(L.POUR_X - gw / 2), top: L.GLASS_BASE - gh, w: gw, h: gh, ryT, ryB,
    cx: 0, rimY: 0, bottomY: 0, ppp: 0,
  }
  glass.cx = glass.left + G.cx
  glass.rimY = glass.top + ryT                       // the rim's middle line
  glass.bottomY = glass.top + ryT + G.h - 4          // the liquid's lowest row, just above the thick base
  const topY = glass.rimY + 3                        // 8 parts reach here
  glass.ppp = (glass.bottomY - topY) / MAX_PARTS     // pixels of height per part
  // half width of the inside at a screen row (the glass tapers a little toward its base)
  glass.hw = (y) => G.rt + (G.rb - G.rt) * clamp((y - glass.rimY) / G.h, 0, 1)
  glass.inner = (y) => { const hw = glass.hw(y); return [Math.round(glass.cx - hw + 2), Math.round(glass.cx + hw - 1)] }
  const [col0, col1] = glass.inner(glass.bottomY)
  const N = col1 - col0 + 1, ROWS = Math.ceil(glass.bottomY - topY) + 4
  glass.col0 = col0; glass.N = N; glass.ROWS = ROWS

  // ---------------------------------------------------------------- state
  const S = {
    t: 0,
    comp: new Map(),            // ingredient id -> parts in the glass (in the order first added)
    dashes: new Map(),          // ingredient id -> dash count
    wave: new Float32Array(N), waveV: new Float32Array(N),
    field: new Float32Array(N * ROWS * 3),         // the swirl: a linear-light color per cell of the liquid
    fieldReady: false,
    mean: [0, 0, 0],
    swirls: [],                 // little dye blobs that sink and curl where a new color enters
    particles: [],              // stream, drips and splash spray
    splats: [],                 // drops landing on the counter, a short-lived mark
    bubbles: [], foam: 0, fizz: 0, fizzyParts: 0,
    ice: [],                    // cubes: in flight from the well, or in the glass
    overflow: 0,                // parts spilled over the rim recently (drives the drips down the outside)
    held: null,                 // { kind: "bottle" | "dasher", id, x, y, angle, press, tx, ty }
    pressing: false,
    cups: {}, activeCup: null,
    emitAcc: 0, streamId: 1, trail: 0,
  }

  // ---------------------------------------------------------------- measuring cups
  const MEASURE = { x: L.POUR_X - 40, y: L.GLASS_BASE + 2 }
  const CAP = { cup_quarter: 0.25, cup_half: 0.5, cup_one: 1 }
  for (const t of L.tools) if (L.cups[t.id]) {
    const c = L.cups[t.id]
    S.cups[t.id] = { id: t.id, home: { x: t.x, y: t.y }, x: t.x, y: t.y, cap: CAP[t.id], ...c, state: "home", comp: new Map(),
      angle: 0, anim: 0, from: null, to: null, ryT: Math.max(2, Math.round(c.rt * L.K)), w: sizes[t.id].w, h: sizes[t.id].h }
  }
  const cupTotal = (cup) => [...cup.comp.values()].reduce((a, b) => a + b, 0)
  // the rim's middle line on screen, and the half width of the opening
  const cupRim = (cup) => ({ y: cup.y - cup.h + 1 + cup.ryT, cx: cup.x, hw: cup.rt - 1 })

  // ---------------------------------------------------------------- totals
  const total = () => { let s = 0; for (const v of S.comp.values()) s += v; return s }
  const iceIn = () => S.ice.filter((c) => c.state === "in").length
  const iceDisp = () => (total() > 0.15 ? iceIn() * ICE_DISPLACE : 0)
  const levelParts = () => Math.min(MAX_PARTS, total() + iceDisp())
  const surfaceY = () => glass.bottomY - levelParts() * glass.ppp
  function meanColor() {
    const tot = total(); if (tot <= 0) return [0, 0, 0]
    const m = [0, 0, 0]
    for (const [id, v] of S.comp) for (let k = 0; k < 3; k++) m[k] += ing[id].lin[k] * v / tot
    return m
  }
  function compColor(comp) {
    let tot = 0; const m = [0, 0, 0]
    for (const [id, v] of comp) { tot += v; for (let k = 0; k < 3; k++) m[k] += ing[id].lin[k] * v }
    return tot > 0 ? m.map((x) => x / tot) : [0, 0, 0]
  }

  // ---------------------------------------------------------------- adding liquid to the glass
  const colOf = (x) => clamp(Math.round(x - glass.col0), 0, N - 1)
  function addToGlass(comp, vol, x, speed) {
    if (vol <= 0) return
    const before = total()
    let tot = 0; for (const v of comp.values()) tot += v
    for (const [id, v] of comp) {
      S.comp.set(id, (S.comp.get(id) || 0) + vol * v / tot)
      if (ing[id].fizzy) { S.fizzyParts += vol * v / tot; S.fizz = Math.min(1, S.fizz + vol * v / tot * 1.6); S.foam = Math.min(6, S.foam + vol * v / tot * (8 + speed * 0.06)) }
    }
    const c = colOf(x), color = compColor(comp)
    // first liquid in an empty glass sets the whole field
    if (before < 1e-6 || !S.fieldReady) { for (let i = 0; i < S.field.length; i += 3) S.field.set(color, i); S.fieldReady = true }
    // the new color lands where it enters, and a little curl of it sinks and swirls before it blends
    paint(c, Math.round((glass.bottomY - surfaceY())), color, Math.min(0.9, vol * 30))
    if (S.swirls.length < 60 && R() < 0.5) S.swirls.push({ x: c, y: (glass.bottomY - surfaceY()), a: R() * 6.28, r: 1.5 + R() * 2.5, spin: (R() < 0.5 ? -1 : 1) * (5 + R() * 4), sink: 18 + R() * 16, life: 0.9, color })
    // the stream pushes the surface down where it lands; a hard, fast hit throws spray
    S.waveV[c] -= speed * vol * 90
    if (c > 0) S.waveV[c - 1] -= speed * vol * 40
    if (c < N - 1) S.waveV[c + 1] -= speed * vol * 40
    if (speed > 120 && R() < 0.06 + vol * 4) spray(x, surfaceY() - 1, color, comp, 2)
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
    const tot = total()
    for (const [id, v] of S.comp) S.comp.set(id, v - over * v / tot)     // what spills is the mix itself
    S.overflow = Math.min(1, S.overflow + over * 3)
  }
  function spray(x, y, color, comp, n) {
    for (let k = 0; k < n; k++) S.particles.push({ x, y, vx: (R() - 0.5) * 90, vy: -50 - R() * 70, vol: 0, color, comp, spray: true, sid: 0, life: 1.2 })
  }

  // ---------------------------------------------------------------- picking things up and putting them back
  function pick(id, from) {
    const g = ing[id]
    S.held = { kind: g.dash ? "dasher" : "bottle", id, x: from.x, y: from.y, tx: from.x, ty: from.y, angle: 0, shake: 0, back: null }
    S.pressing = false
  }
  function putBack(railPos) {
    if (!S.held) return
    S.held.back = { x: railPos.x, y: railPos.y, t: 0 }
    S.pressing = false
  }
  function aim(x, y) { if (S.held) { S.held.tx = x; S.held.ty = y } }
  function press(on) {
    if (!S.held || S.held.back) return
    if (S.held.kind === "dasher") { if (on) dash(); return }
    S.pressing = on
    if (!on) S.trail = 0.35                          // a few last drops after letting go
  }
  // where the liquid leaves the held bottle: the anchor point we hold it by is its spout, so it's (x, y) itself
  const pourDir = (a) => [Math.sin(a), -Math.cos(a)]
  function dash() {
    const h = S.held; h.shake = 0.18
    const g = ing[h.id]
    S.particles.push({ x: h.x, y: h.y + 2, vx: (R() - 0.5) * 6, vy: 40, vol: DASH, color: g.lin, comp: new Map([[h.id, 1]]), sid: 0, dash: true, life: 3 })
  }

  // ---------------------------------------------------------------- ice
  function addIce(from) {
    if (S.ice.length >= MAX_ICE) return false
    S.ice.push({ state: "fly", t: 0, fx: from.x, fy: from.y, tx: glass.cx + (R() - 0.5) * 8, ty: glass.rimY - 4, x: from.x, y: from.y, vx: 0, vy: 0, spin: R() })
    return true
  }

  // ---------------------------------------------------------------- cups
  function activateCup(id) {
    for (const c of Object.values(S.cups)) if (c !== S.cups[id] && (c.state === "active" || c.state === "toMeasure")) sendHome(c)
    const cup = S.cups[id]
    if (cup.state !== "home") return
    cup.state = "toMeasure"; cup.anim = 0; cup.from = { x: cup.x, y: cup.y }; cup.to = { ...MEASURE }
    S.activeCup = id
  }
  function sendHome(cup) { cup.comp.clear(); cup.state = "toHome"; cup.anim = 0; cup.from = { x: cup.x, y: cup.y }; cup.to = { ...cup.home }; if (S.activeCup === cup.id) S.activeCup = null }
  function clickActiveCup() {
    const cup = S.cups[S.activeCup]; if (!cup || cup.state !== "active") return
    if (cupTotal(cup) > 0.001) { cup.state = "tipUp"; cup.anim = 0; cup.from = { x: cup.x, y: cup.y }; cup.to = { x: glass.cx - 18, y: glass.top - 28 } }   // its lip ends up just over the rim
    else sendHome(cup)
  }

  function emptyGlass() {
    S.comp.clear(); S.dashes.clear(); S.ice = S.ice.filter((c) => c.state === "fly")
    S.wave.fill(0); S.waveV.fill(0); S.swirls = []; S.bubbles = []; S.foam = 0; S.fizz = 0; S.fizzyParts = 0; S.overflow = 0
    S.fieldReady = false
    S.particles = S.particles.filter((p) => !p.inGlass)
  }

  // ---------------------------------------------------------------- one fixed step
  function step(dt = STEP) {
    S.t += dt
    const h = S.held
    // the held bottle follows the pointer, a little behind it; it tilts while pressed, rights itself when let go
    if (h) {
      if (h.back) {
        h.back.t += dt / 0.22
        h.x = lerp(h.x, h.back.x, Math.min(1, h.back.t)); h.y = lerp(h.y, h.back.y, Math.min(1, h.back.t))
        h.angle = lerp(h.angle, 0, Math.min(1, dt * 14))
        if (h.back.t >= 1) S.held = null
      } else {
        const k = 1 - Math.exp(-dt * 16)
        h.x += (h.tx - h.x) * k; h.y += (h.ty - h.y) * k
        if (h.kind === "bottle") {
          const target = S.pressing ? 2.0 : 0                       // about 115 degrees: a full, steady pour
          const rate = S.pressing ? 3.2 : 6
          h.angle += clamp(target - h.angle, -rate * dt, rate * dt)
        } else {
          h.angle = Math.PI                                          // a dasher is held upside down over the glass
          if (h.shake > 0) h.shake -= dt
        }
      }
    }
    // pouring: flow ramps up with the tilt (nothing until the liquid reaches the neck, at about 65 degrees)
    if (h && h.kind === "bottle" && !h.back) {
      const g = ing[h.id]
      const f = clamp((h.angle - 1.13) / (1.85 - 1.13), 0, 1)
      let flow = g.flow * f * f * (3 - 2 * f)
      if (!S.pressing && S.trail > 0) { S.trail -= dt; flow = Math.max(flow, R() < 0.25 ? 0.4 : 0) }   // trailing drops
      if (flow > 0) {
        S.emitAcc += flow * dt / PART_VOL
        const [dx, dy] = pourDir(h.angle), speed = (g.thick ? 26 : 34) + 34 * f
        while (S.emitAcc >= 1) {
          S.emitAcc -= 1
          const wob = Math.sin(S.t * (g.thick ? 9 : 17) + S.streamId) * (g.thick ? 2 : 5)
          S.particles.push({ x: h.x + dx * 1.5, y: h.y + dy * 1.5, vx: dx * speed + wob + (R() - 0.5) * 3, vy: dy * speed, vol: PART_VOL,
            color: g.lin, comp: new Map([[h.id, 1]]), sid: S.streamId, life: 4, thin: f < 0.35 || !S.pressing, broken: f < 0.2 && R() < 0.5 })
        }
      } else if (!S.pressing) { S.emitAcc = 0; S.streamId++ }
    }
    // a cup tipping into the glass pours its whole measure out of its rim
    for (const cup of Object.values(S.cups)) stepCup(cup, dt)

    // particles: fall, land in the glass or a cup, or splat on the counter
    const surf = surfaceY()
    const keep = []
    for (const p of S.particles) {
      p.life -= dt
      p.vy += GRAV * dt; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.life <= 0) continue
      // into the active cup (measuring)
      const cup = S.activeCup && S.cups[S.activeCup]
      if (cup && cup.state === "active" && !p.spray && p.vy > 0) {
        const rim = cupRim(cup)
        if (p.y >= rim.y && p.y - p.vy * dt < rim.y && Math.abs(p.x - rim.cx) <= rim.hw) {
          const room = cup.cap - cupTotal(cup)
          if (room > 0) for (const [id, v] of p.comp) cup.comp.set(id, (cup.comp.get(id) || 0) + Math.min(room, p.vol) * v)
          if (p.vol > room + 1e-9) splat(p.x + (R() - 0.5) * 6, rim.y + 2, p.color)   // brimming over
          continue
        }
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
            addToGlass(p.comp, p.vol, p.x, Math.hypot(p.vx, p.vy))
            if (p.dash) for (const id of p.comp.keys()) S.dashes.set(id, (S.dashes.get(id) || 0) + 1)
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
    S.splats = S.splats.filter((s) => (s.life -= dt) > 0)

    stepSurface(dt)
    stepField(dt)
    stepFizz(dt, surf)
    stepIce(dt)
    if (S.overflow > 0) S.overflow = Math.max(0, S.overflow - dt * 0.6)
  }
  function splat(x, y, color) {
    if (S.splats.length < 80) S.splats.push({ x: Math.round(x), y: Math.round(y), color, life: 0.5 + R() * 0.4 })
  }

  function stepCup(cup, dt) {
    const ease = (t) => t * t * (3 - 2 * t)
    if (cup.state === "toMeasure" || cup.state === "toHome") {
      cup.anim = Math.min(1, cup.anim + dt / 0.25)
      const e = ease(cup.anim); cup.x = lerp(cup.from.x, cup.to.x, e); cup.y = lerp(cup.from.y, cup.to.y, e) - Math.sin(Math.PI * cup.anim) * 10
      if (cup.anim >= 1) cup.state = cup.state === "toMeasure" ? "active" : "home"
    } else if (cup.state === "tipUp") {
      cup.anim = Math.min(1, cup.anim + dt / 0.3)
      const e = ease(cup.anim); cup.x = lerp(cup.from.x, cup.to.x, e); cup.y = lerp(cup.from.y, cup.to.y, e); cup.angle = 1.9 * e
      if (cup.anim >= 1) { cup.state = "pouring"; cup.anim = 0 }
    } else if (cup.state === "pouring") {
      // its whole measure, poured from the rim's lip at about 3 parts a second
      const tot = cupTotal(cup)
      const out = Math.min(tot, 3 * dt)
      if (out > 0) {
        const lip = cupLip(cup)
        const n = Math.max(1, Math.round(out / PART_VOL))
        const comp = new Map([...cup.comp].map(([id, v]) => [id, v / tot]))
        const color = compColor(cup.comp)
        for (let k = 0; k < n; k++) S.particles.push({ x: lip.x, y: lip.y, vx: 22 + (R() - 0.5) * 4, vy: 8, vol: out / n, color, comp, sid: -1, life: 4 })
        for (const [id, v] of cup.comp) cup.comp.set(id, v - out * v / tot)
      }
      if (cupTotal(cup) <= 1e-6) { cup.comp.clear(); cup.anim += dt; if (cup.anim > 0.25) { cup.state = "tipDown"; cup.anim = 0; cup.from = { x: cup.x, y: cup.y }; cup.to = { ...MEASURE } } }
    } else if (cup.state === "tipDown") {
      cup.anim = Math.min(1, cup.anim + dt / 0.3)
      const e = ease(cup.anim); cup.x = lerp(cup.from.x, cup.to.x, e); cup.y = lerp(cup.from.y, cup.to.y, e); cup.angle = 1.9 * (1 - e)
      if (cup.anim >= 1) { cup.state = "active"; cup.angle = 0 }
    }
  }
  // the pouring lip: the rim's right end, turned with the cup about its base point
  function cupLip(cup) {
    const a = cup.angle, lx = cup.rt + 1, ly = -(cup.h - 1 - cup.ryT)
    return { x: cup.x + lx * Math.cos(a) - ly * Math.sin(a), y: cup.y + lx * Math.sin(a) + ly * Math.cos(a) }
  }

  // the surface: each column pulled by its neighbors (a wave), slowly calming down
  function stepSurface(dt) {
    const w = S.wave, v = S.waveV, has = total() > 0.02
    for (let i = 0; i < N; i++) {
      const l = w[Math.max(0, i - 1)], r = w[Math.min(N - 1, i + 1)]
      v[i] += ((l + r - 2 * w[i]) * 1400 - w[i] * 40 - v[i] * 2.6) * dt
    }
    for (let i = 0; i < N; i++) { w[i] = has ? clamp(w[i] + v[i] * dt, -3.5, 3.5) : 0 }
    // keep the mean at zero: the waves move the surface around, never the amount of liquid
    let m = 0; for (let i = 0; i < N; i++) m += w[i]; m /= N
    for (let i = 0; i < N; i++) w[i] -= m
  }
  // the color: each cell drifts toward its neighbors and toward the drink's true mix, so a new pour shows as a
  // streak that curls and fades into the blend in a second or two
  function stepField(dt) {
    if (total() <= 0) return
    S.mean = meanColor()
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
        const nb = (tmp[((r) * N + Math.max(0, c - 1)) * 3 + k] + tmp[((r) * N + Math.min(N - 1, c + 1)) * 3 + k] +
          tmp[(Math.max(0, r - 1) * N + c) * 3 + k] + tmp[(Math.min(top, r + 1) * N + c) * 3 + k]) / 4
        let v = lerp(tmp[i + k], nb, a)
        F[i + k] = lerp(v, S.mean[k], relax)
      }
    }
  }
  // fizz: bubbles rise and pop; the foam head grows with each fizzy splash and settles over a second or two
  function stepFizz(dt, surf) {
    S.foam *= Math.exp(-dt / 0.9)
    S.fizz *= Math.exp(-dt / 50)
    const frac = total() > 0 ? S.fizzyParts / total() : 0
    const rate = S.fizz * Math.min(1, frac * 1.5) * 45
    if (total() > 0.1 && R() < rate * dt && S.bubbles.length < 80) {
      const [il, ir] = glass.inner(glass.bottomY)
      S.bubbles.push({ x: il + 1 + R() * (ir - il - 2), y: glass.bottomY - R() * 3, vy: 10 + R() * 14, ph: R() * 6 })
    }
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
        if (!c.wet) { c.wet = true; S.waveV[col] -= Math.min(160, c.vy * 1.6); spray(c.x, sy - 1, S.mean, S.comp, 3) }
        c.vy += (-(c.y - floatY) * 90 - c.vy * 7) * dt                          // buoyancy, damped
      } else c.vy += GRAV * 0.8 * dt
      c.y += c.vy * dt
      if (c.y > restY) { c.y = restY; c.vy = 0 }
      // drift, kept off the walls and apart from each other
      c.vx += (R() - 0.5) * 6 * dt - c.vx * 1.5 * dt
      for (const o of S.ice) if (o !== c && o.state === "in") { const d = c.x - o.x; if (Math.abs(d) < 6) c.vx += Math.sign(d || 1) * 30 * dt }
      const [il, ir] = glass.inner(c.y)
      c.x = clamp(c.x + c.vx * dt, il + 3, ir - 3)
      if (!has) c.wet = false
    }
  }

  // ---------------------------------------------------------------- readout
  function readout() {
    const rows = []
    for (const [id, v] of S.comp) if (v > 0.004) rows.push({ id, name: SHORT[id], parts: v, dashes: S.dashes.get(id) || 0 })
    return { rows, total: total(), ice: iceIn(), full: total() + iceDisp() >= MAX_PARTS - 0.01, fillLine: FILL_LINE }
  }

  return {
    S, L, ing, glass, MEASURE, CAP,
    step, pick, putBack, aim, press, addIce, activateCup, clickActiveCup, sendHome, emptyGlass,
    total, levelParts, surfaceY, cupTotal, cupRim, cupLip, compColor, srgb, readout,
  }
}
