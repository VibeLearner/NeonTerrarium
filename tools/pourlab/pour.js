// Neon Dome pour lab: drawing and input. The simulation lives in sim.js; this file draws it at the scene's own
// 480x270 pixels and scales that up crisply (nearest-neighbor, no blur), and turns clicks and holds into actions.
import { createSim, STEP, FILL_LINE, MAX_PARTS } from "./sim.js"

const W = 480, H = 270
const view = document.getElementById("view")
const ctx = view.getContext("2d")
ctx.imageSmoothingEnabled = false

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
const L = await (await fetch("assets/layout.json")).json()
const FONT = await (await fetch("assets/font5x7.json")).json()
const IMG = {}
const names = ["glass", "cup_quarter", "cup_half", "cup_one", ...L.ingredients.flatMap((g) => ["bottle_" + g.id, "bottle_" + g.id + "_hover"])]
await Promise.all([
  loadImg("assets/pour_bg.png").then((i) => (IMG.bg = i)),
  loadImg("assets/pour_front.png").then((i) => (IMG.front = i)),
  ...names.map((n) => loadImg("assets/sprites/" + n + ".png").then((i) => (IMG[n] = i))),
])
const sizes = Object.fromEntries(["glass", "cup_quarter", "cup_half", "cup_one"].map((n) => [n, { w: IMG[n].width, h: IMG[n].height }]))
const sim = createSim(L, sizes)
const S = sim.S, glass = sim.glass

// ---------------------------------------------------------------- small helpers
const rgbStr = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const mixRgb = (a, b, t) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t))
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
const CREAM = hex("#F2E4C8"), WHITE = hex("#FFF6E6"), GOLD = hex("#E8B060"), INK = hex("#141A16"), SKY = hex("#C9D7E8")
const px = (x, y, c) => { ctx.fillStyle = typeof c === "string" ? c : rgbStr(c); ctx.fillRect(Math.round(x), Math.round(y), 1, 1) }
function line(x0, y0, x1, y1, c, size = 1) {
  ctx.fillStyle = typeof c === "string" ? c : rgbStr(c)
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), size, size)
}
// sprites with their anchor at the middle of their bottom edge, as pxl places them
const spriteAt = (name, x, feet, alpha = 1) => {
  const i = IMG[name]; ctx.globalAlpha = alpha; ctx.drawImage(i, Math.round(x - i.width / 2), feet - i.height); ctx.globalAlpha = 1
}

// ---------------------------------------------------------------- the 5x7 pixel font (from pxl's library)
const GLYPH = {}
for (const [ch, s] of Object.entries(FONT)) {
  const rows = s.split(" ")
  let a = 5, b = -1
  for (const r of rows) for (let x = 0; x < 5; x++) if (r[x] === "#") { a = Math.min(a, x); b = Math.max(b, x) }
  GLYPH[ch] = { rows, a, w: b - a + 1 }
}
function textW(s) { let w = 0; for (const ch of s) w += (ch === " " ? 3 : (GLYPH[ch] ? GLYPH[ch].w : 3)) + 1; return Math.max(0, w - 1) }
function text(s, x, y, color, align = "left") {
  if (align === "right") x -= textW(s); else if (align === "center") x -= Math.round(textW(s) / 2)
  ctx.fillStyle = typeof color === "string" ? color : rgbStr(color)
  for (const ch of s) {
    const g = GLYPH[ch]
    if (!g) { x += 4; continue }
    for (let r = 0; r < 7; r++) for (let c = g.a; c < g.a + g.w; c++) if (g.rows[r][c] === "#") ctx.fillRect(x + c - g.a, y + r, 1, 1)
    x += g.w + 1
  }
}
function wrap(s, maxW) {
  const out = []; let cur = ""
  for (const word of s.split(" ")) { const t = cur ? cur + " " + word : word; if (textW(t) > maxW && cur) { out.push(cur); cur = word } else cur = t }
  if (cur) out.push(cur)
  return out
}

// ---------------------------------------------------------------- where things are
const railOf = Object.fromEntries(L.rail.map((r) => [r.id, r]))
const ingOf = Object.fromEntries(L.ingredients.map((g) => [g.id, g]))
function bottleBox(id) {
  const r = railOf[id], i = IMG["bottle_" + id]
  return { x: Math.round(r.x - i.width / 2), y: r.floor - i.height, w: i.width, h: i.height }
}
// where the liquid comes out of each bottle, in its sprite's pixels: the pour spout's tip, the cap's opening, the
// dasher's nozzle. Bottles are held by that point, so it's where the stream starts.
function tipOf(id) {
  const i = IMG["bottle_" + id], mh = (i.width - 11) / 2, cx = mh + 5, top = ingOf[id].top
  return top === "spout" ? { x: cx + 3, y: 1 } : top === "cap" ? { x: cx, y: 9 } : top === "crown" ? { x: cx, y: 11 } : { x: cx, y: 6 }
}
// a bottle answers to a click on its own pixels (not the empty corners of its picture, which reach over the
// counter's tools) or anywhere in its slot in the rail, below the plate's top edge
const MASK = {}
for (const g of L.ingredients) {
  const i = IMG["bottle_" + g.id], c = document.createElement("canvas"); c.width = i.width; c.height = i.height
  const x = c.getContext("2d"); x.drawImage(i, 0, 0); const d = x.getImageData(0, 0, i.width, i.height).data
  MASK[g.id] = (u, v) => u >= 0 && v >= 0 && u < i.width && v < i.height && d[(v * i.width + u) * 4 + 3] > 0
}
function hitBottle(id, x, y) {
  const b = bottleBox(id), u = Math.floor(x - b.x), v = Math.floor(y - b.y)
  if (u < 2 || u >= b.w - 2) return false
  if (y >= L.RAIL_TOP - 2) return true
  for (const [du, dv] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (MASK[id](u + du, v + dv)) return true
  return false
}
function railTip(id) { const b = bottleBox(id), t = tipOf(id); return { x: b.x + t.x, y: b.y + t.y } }
function cupBox(cup) { return { x: Math.round(cup.x - (cup.rt + 2)), y: Math.round(cup.y - cup.h), w: cup.w, h: cup.h } }
// the ice well's opening, in the counter's perspective (the same numbers the art used)
const proj = (xn, y) => L.VPX + (xn - L.VPX) * (y - L.VPY) / (L.NEAR - L.VPY)
const WELL = [[proj(L.WELL.xa, L.WELL.far), L.WELL.far], [proj(L.WELL.xb, L.WELL.far), L.WELL.far], [proj(L.WELL.xb, L.WELL.near), L.WELL.near], [proj(L.WELL.xa, L.WELL.near), L.WELL.near]]
const WELL_MID = { x: proj((L.WELL.xa + L.WELL.xb) / 2, 204), y: 202 }
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c }
const inBox = (x, y, b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
// a hovered cup gets a gold edge, the same signal as a hovered bottle's ring
function outlineOf(img, color) {
  const c = document.createElement("canvas"); c.width = img.width + 2; c.height = img.height + 2
  const g = c.getContext("2d"); g.drawImage(img, 1, 1)
  const d = g.getImageData(0, 0, c.width, c.height), o = g.createImageData(c.width, c.height)
  const A = (x, y) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? 0 : d.data[(y * c.width + x) * 4 + 3])
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (!A(x, y) && (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1))) { const i = (y * c.width + x) * 4; o.data.set([...color, 255], i) }
  g.clearRect(0, 0, c.width, c.height); g.putImageData(o, 0, 0); return c
}
const OUTLINE = Object.fromEntries(["cup_quarter", "cup_half", "cup_one"].map((n) => [n, outlineOf(IMG[n], hex("#FFC94A"))]))

// ---------------------------------------------------------------- the readout panel
const PANEL = { x: 6, y: 66, w: 152 }
let panelButton = null

// ---------------------------------------------------------------- input
const pointer = { x: -99, y: -99, down: false }
let hover = null
function toScene(e) { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height } }
function targetAt(x, y) {
  if (panelButton && inBox(x, y, panelButton)) return { kind: "empty" }
  // bottles on the rail (the one in hand has left its slot)
  for (const g of L.ingredients) {
    if (S.held && S.held.id === g.id) continue
    if (hitBottle(g.id, x, y)) return { kind: "bottle", id: g.id }
  }
  if (S.held && y >= L.RAIL_TOP - 4) return { kind: "rail" }
  if (inPoly(x, y, WELL)) return { kind: "ice" }
  for (const cup of Object.values(S.cups)) {
    if (cup.state === "home" && inBox(x, y, cupBox(cup))) return { kind: "cup", id: cup.id }
    if (cup.state === "active" && !S.held && inBox(x, y, cupBox(cup))) return { kind: "activeCup", id: cup.id }
  }
  return null
}
function putBackHeld() { if (S.held && !S.held.back) sim.putBack(railTip(S.held.id)) }
view.addEventListener("pointerdown", (e) => {
  e.preventDefault(); view.setPointerCapture(e.pointerId)
  const p = toScene(e); pointer.x = p.x; pointer.y = p.y; pointer.down = true
  if (e.button === 2) { putBackHeld(); return }
  const t = targetAt(p.x, p.y)
  if (t && t.kind === "empty") sim.emptyGlass()
  else if (t && t.kind === "bottle") {
    if (S.held) S.held = null                     // swap: the one in hand goes straight back to its slot
    sim.pick(t.id, railTip(t.id)); sim.aim(clampAim(p).x, clampAim(p).y)
  } else if (t && t.kind === "rail") putBackHeld()
  else if (t && t.kind === "ice") sim.addIce(WELL_MID)
  else if (t && t.kind === "cup") sim.activateCup(t.id)
  else if (t && t.kind === "activeCup") sim.clickActiveCup()
  else if (S.held) sim.press(true)
})
const clampAim = (p) => ({ x: Math.max(12, Math.min(W - 12, p.x)), y: Math.max(66, Math.min(214, p.y)) })
view.addEventListener("pointermove", (e) => {
  const p = toScene(e); pointer.x = p.x; pointer.y = p.y
  if (S.held && !S.held.back) { const a = clampAim(p); sim.aim(a.x, a.y) }
})
const release = () => { pointer.down = false; if (S.held && S.held.kind === "bottle") sim.press(false) }
view.addEventListener("pointerup", release)
view.addEventListener("pointercancel", release)
view.addEventListener("pointerleave", () => { pointer.x = -99; pointer.y = -99 })
view.addEventListener("contextmenu", (e) => { e.preventDefault(); putBackHeld() })
addEventListener("keydown", (e) => { if (e.key === "Escape") putBackHeld() })

// ---------------------------------------------------------------- fit the window, crisp
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H), k = s >= 1 ? Math.floor(s) : s
  view.style.width = W * k + "px"; view.style.height = H * k + "px"
}
addEventListener("resize", fit); fit()

// ---------------------------------------------------------------- drawing
const K = L.K
function drawShadow(x, y, rx, ry, a = 0.35) {
  ctx.fillStyle = `rgba(36,14,8,${a})`
  for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2)); ctx.fillRect(Math.round(x - w), Math.round(y + dy), 2 * w + 1, 1) }
}
// a faint mirrored copy under a cup standing on the lacquer, fading out
function drawReflection(img, left, feet) {
  for (const [from, to, a] of [[0, 5, 0.25], [5, 12, 0.12]]) {
    ctx.save(); ctx.beginPath(); ctx.rect(left - 2, feet + from, img.width + 4, to - from); ctx.clip()
    ctx.globalAlpha = a; ctx.translate(left, feet); ctx.scale(1, -1); ctx.drawImage(img, 0, 0); ctx.restore()
  }
}
function drawCup(cup) {
  const i = IMG[cup.id], b = cupBox(cup)
  if (cup.state === "home" || cup.state === "active") {
    const onWood = cup.state === "home"
    drawShadow(cup.x - 2, cup.y - 1 - cup.ryT * 0 - Math.round(cup.rb * K), cup.rb + 1, Math.max(2, Math.round(cup.rb * K)), 0.4)
    if (onWood) drawReflection(i, b.x, cup.y)
  }
  if (cup.angle) {
    ctx.save(); ctx.translate(Math.round(cup.x), Math.round(cup.y)); ctx.rotate(cup.angle); ctx.drawImage(i, -(cup.rt + 2), -cup.h); ctx.restore()
  } else {
    if (hover && (hover.kind === "cup" || hover.kind === "activeCup") && hover.id === cup.id) ctx.drawImage(OUTLINE[cup.id], b.x - 1, b.y - 1)
    ctx.drawImage(i, b.x, b.y)
    // what's in it, seen through its opening: the surface sits lower the less there is
    const tot = sim.cupTotal(cup)
    if (tot > 0.001) {
      const rim = sim.cupRim(cup), f = Math.min(1, tot / cup.cap), depth = (1 - f) * Math.min(cup.h * 0.5, 7)
      const col = sim.srgb(sim.compColor(cup.comp)), ry = cup.ryT
      for (let y = rim.y - ry; y <= rim.y + ry; y++) for (let x = rim.cx - rim.hw; x <= rim.cx + rim.hw; x++) {
        const inOpen = ((x - rim.cx) / (rim.hw + 0.5)) ** 2 + ((y - rim.y) / (ry + 0.5)) ** 2 <= 1
        const inLiq = ((x - rim.cx) / (rim.hw + 0.5)) ** 2 + ((y - rim.y - depth) / (ry + 0.5)) ** 2 <= 1
        if (inOpen && inLiq) px(x, y, y <= rim.y + depth - ry + 1 ? mixRgb(col, WHITE, 0.3) : col)
      }
    }
  }
}
// the liquid in the glass: a body seen through the glass, and its top face seen from above (an ellipse, like the
// rim) that ripples with the waves; foam on top when something fizzy went in
function drawLiquid() {
  const tot = sim.total(); if (tot < 0.005) return
  const s = sim.surfaceY(), G = glass, N = G.N
  const mean = sim.srgb(S.mean)
  const face = mixRgb(mixRgb(mean, SKY, 0.18), WHITE, 0.15)
  const cells = new Array(N * G.ROWS)
  for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < N; c++) { const i = (r * N + c) * 3; cells[r * N + c] = sim.srgb([S.field[i], S.field[i + 1], S.field[i + 2]]) }
  const foam = S.foam
  for (let c = 0; c < N; c++) {
    const x = G.col0 + c, sy = s + S.wave[c]
    const hw = G.hw(sy), dx = (x - G.cx) / hw, e = hw * K * Math.sqrt(Math.max(0, 1 - dx * dx))
    const back = Math.round(sy - e), front = Math.round(sy + e)
    const bot = G.bottomY + Math.round(1.5 * Math.sqrt(Math.max(0, 1 - ((x - G.cx) / G.hw(G.bottomY)) ** 2)))
    const d = Math.abs(dx)
    for (let y = Math.max(back, G.rimY - 2); y <= bot; y++) {
      const [il, ir] = G.inner(y); if (x < il || x > ir) continue
      let col
      if (y <= front) col = y === back ? mixRgb(face, WHITE, 0.35) : face
      else {
        const r = Math.max(0, Math.min(G.ROWS - 1, Math.round(G.bottomY - y)))
        col = mixRgb(cells[r * N + c], INK, 0.32 * d * d)
        if (x <= il + 1) col = mixRgb(col, WHITE, 0.2)
      }
      px(x, y, col)
    }
    // the foam head: cream bubbles riding the surface, a little down the front too
    if (foam > 0.4) {
      const top = Math.round(back - foam * 0.6), down = front + Math.round(foam * 0.35)
      for (let y = top; y <= down; y++) {
        const [il, ir] = G.inner(y); if (x < il || x > ir) continue
        const h = ((x * 73 + y * 151 + Math.floor(S.t * 6)) % 7)
        px(x, y, h === 0 ? mean : h < 3 ? WHITE : CREAM)
      }
    }
  }
  // bubbles rising through it
  const bc = mixRgb(mean, WHITE, 0.55)
  for (const b of S.bubbles) px(b.x + Math.sin(b.ph) * 0.6, b.y, bc)
}
function drawIce() {
  const s = sim.surfaceY()
  for (const c of S.ice) {
    const x0 = Math.round(c.x - 3), y0 = Math.round(c.y - 3)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const edge = x === 0 || y === 0 || x === 5 || y === 5
      let col = edge ? (y === 0 || x === 0 ? hex("#8CCBC0") : hex("#4F9C96")) : y === 1 || x === 1 ? WHITE : hex("#C6EDE4")
      if (c.state === "in" && sim.total() > 0.15 && y0 + y > s + S.wave[Math.max(0, Math.min(glass.N - 1, x0 + x - glass.col0))]) col = mixRgb(col, sim.srgb(S.mean), 0.45)
      px(x0 + x, y0 + y, col)
    }
  }
}
function drawFillLine() {
  const y = Math.round(glass.bottomY - FILL_LINE * glass.ppp), [il, ir] = glass.inner(y)
  const near = Math.abs(sim.total() - FILL_LINE) < 0.06
  ctx.globalAlpha = near ? 1 : 0.6
  for (let x = il; x <= ir; x += 2) px(x, y, GOLD)
  px(il - 3, y, GOLD); px(il - 4, y, GOLD); px(ir + 3, y, GOLD); px(ir + 4, y, GOLD)
  ctx.globalAlpha = 1
}
function drawStream() {
  let prev = null
  for (const p of S.particles) {
    if (!p.rgb) p.rgb = rgbStr(sim.srgb(p.color))
    if (p.spray) { px(p.x, p.y, p.rgb); prev = null; continue }
    const size = p.dash ? 2 : p.thin ? 1 : 2
    if (prev && prev.sid === p.sid && p.sid !== 0 && !p.broken && Math.hypot(p.x - prev.x, p.y - prev.y) < 9) line(prev.x, prev.y, p.x, p.y, p.rgb, size)
    else { ctx.fillStyle = p.rgb; ctx.fillRect(Math.round(p.x), Math.round(p.y), size, size) }
    prev = p
  }
  for (const s of S.splats) { ctx.globalAlpha = Math.min(1, s.life * 2); ctx.fillStyle = rgbStr(sim.srgb(s.color)); ctx.fillRect(s.x - 1, s.y, 3, 1); ctx.globalAlpha = 1 }
  // spilled over the rim: drips running down the outside of the glass
  if (S.overflow > 0.02) {
    ctx.globalAlpha = Math.min(1, S.overflow * 2); const col = sim.srgb(S.mean), [il, ir] = glass.inner(glass.rimY)
    for (const [x, ph] of [[il - 2, 0], [ir + 2, 1.7], [il + 5, 3.1]]) { const len = 6 + Math.round((Math.sin(S.t * 3 + ph) * 0.5 + 0.5) * 30); line(x, glass.rimY, x, glass.rimY + len, col) }
    ctx.globalAlpha = 1
  }
}
function drawRail() {
  for (const g of L.ingredients) {
    if (S.held && S.held.id === g.id) continue
    const r = railOf[g.id], hov = hover && hover.kind === "bottle" && hover.id === g.id
    spriteAt("bottle_" + g.id + (hov ? "_hover" : ""), r.x, r.floor - (hov ? 6 : 0))
  }
  ctx.drawImage(IMG.front, 0, 0)
}
function drawHeld() {
  const h = S.held; if (!h) return
  const i = IMG["bottle_" + h.id], t = tipOf(h.id)
  const wob = h.kind === "dasher" && h.shake > 0 ? Math.sin(h.shake * 70) * 0.28 : 0
  ctx.save(); ctx.translate(Math.round(h.x), Math.round(h.y)); ctx.rotate(h.angle + wob); ctx.drawImage(i, -t.x, -t.y); ctx.restore()
}
function drawPanel() {
  const r = sim.readout(), P = PANEL
  const lines = r.rows.length ? r.rows : null
  let h = 14 + (lines ? lines.length : 1) * 9 + 6 + 9 + (r.ice ? 9 : 0) + 9 + 18
  const hint = hintText(), hintLines = wrap(hint, P.w - 12)
  h += hintLines.length * 9 + 4
  ctx.fillStyle = "rgba(20,26,22,0.82)"; ctx.fillRect(P.x, P.y, P.w, h)
  ctx.fillStyle = "rgba(232,176,96,0.55)"; ctx.fillRect(P.x, P.y, P.w, 1); ctx.fillRect(P.x, P.y + h - 1, P.w, 1); ctx.fillRect(P.x, P.y, 1, h); ctx.fillRect(P.x + P.w - 1, P.y, 1, h)
  let y = P.y + 5
  text("IN THE GLASS", P.x + 6, y, GOLD); y += 12
  if (!lines) { text("Empty", P.x + 6, y, "#93A297"); y += 9 }
  else for (const row of lines) {
    const sw = rgbStr(hex(ingOf[row.id].liquid)); ctx.fillStyle = sw; ctx.fillRect(P.x + 6, y + 2, 3, 3)
    text(row.name, P.x + 12, y, CREAM)
    text(row.dashes ? `${row.dashes} dash${row.dashes > 1 ? "es" : ""}` : row.parts.toFixed(2), P.x + P.w - 6, y, CREAM, "right"); y += 9
  }
  ctx.fillStyle = "rgba(232,176,96,0.35)"; ctx.fillRect(P.x + 6, y + 1, P.w - 12, 1); y += 5
  text("Total", P.x + 6, y, CREAM); text(`${r.total.toFixed(2)} of ${MAX_PARTS} parts`, P.x + P.w - 6, y, CREAM, "right"); y += 9
  if (r.ice) { text("Ice", P.x + 6, y, CREAM); text(`${r.ice} cube${r.ice > 1 ? "s" : ""}`, P.x + P.w - 6, y, CREAM, "right"); y += 9 }
  const diff = r.total - FILL_LINE
  const status = r.full ? ["Full to the rim", "#FF8A7A"] : Math.abs(diff) <= 0.05 ? ["At the fill line", "#FFC94A"] : diff < 0 ? [`Fill line: ${(-diff).toFixed(2)} to go`, "#93A297"] : [`${diff.toFixed(2)} over the fill line`, "#E9A08A"]
  text(status[0], P.x + 6, y, status[1]); y += 11
  // the button
  const bw = textW("Empty glass") + 10, hov = hover && hover.kind === "empty"
  panelButton = { x: P.x + 6, y, w: bw, h: 12 }
  ctx.fillStyle = hov ? "rgba(232,176,96,0.35)" : "rgba(232,176,96,0.15)"; ctx.fillRect(panelButton.x, y, bw, 12)
  ctx.fillStyle = "rgba(232,176,96,0.8)"; ctx.fillRect(panelButton.x, y, bw, 1); ctx.fillRect(panelButton.x, y + 11, bw, 1); ctx.fillRect(panelButton.x, y, 1, 12); ctx.fillRect(panelButton.x + bw - 1, y, 1, 12)
  text("Empty glass", panelButton.x + 5, y + 3, CREAM); y += 17
  for (const l of hintLines) { text(l, P.x + 6, y, "#B8C8BC"); y += 9 }
}
function hintText() {
  const cup = S.activeCup && S.cups[S.activeCup]
  if (S.held && S.held.kind === "dasher") return "Click to add a dash. Right-click or click the rail to put it back."
  if (S.held) return cup && cup.state === "active" ? "Hold to pour into the cup or the glass. Click the rail to put the bottle back." : "Hold to pour. Move to aim. Click the rail to put the bottle back."
  if (cup && cup.state === "active") return sim.cupTotal(cup) > 0.001 ? "Click the cup to tip it into the glass." : "Pick a bottle and pour into the cup. Click the empty cup to put it away."
  return "Click a bottle to pick it up. Click a measuring cup to measure. Click the ice to add a cube."
}
function drawCupLabel() {
  const cup = S.activeCup && S.cups[S.activeCup]; if (!cup || cup.state !== "active") return
  const s = `${sim.cupTotal(cup).toFixed(2)} / ${cup.cap.toFixed(2)}`, w = textW(s) + 6, b = cupBox(cup)
  ctx.fillStyle = "rgba(20,26,22,0.82)"; ctx.fillRect(Math.round(cup.x - w / 2), b.y - 12, w, 10)
  text(s, Math.round(cup.x), b.y - 11, sim.cupTotal(cup) >= cup.cap - 0.005 ? "#FFC94A" : CREAM, "center")
}
function drawWellHover() {
  if (!(hover && hover.kind === "ice")) return
  for (let i = 0; i < 4; i++) { const a = WELL[i], b = WELL[(i + 1) % 4]; line(a[0], a[1] - 1, b[0], b[1] - 1, "#FFC94A") }
}

function render() {
  ctx.drawImage(IMG.bg, 0, 0)
  drawWellHover()
  for (const cup of Object.values(S.cups)) if (cup.state === "home" || cup.state === "toHome") drawCup(cup)
  // the glass: its shadow on the mat, then the liquid behind its front, then the glass itself over both
  drawShadow(glass.cx, L.GLASS_BASE - 1 - glass.ryB, 13, glass.ryB, 0.45)
  drawLiquid(); drawIce(); ctx.drawImage(IMG.glass, glass.left, glass.top); drawFillLine()
  for (const cup of Object.values(S.cups)) if (cup.state !== "home" && cup.state !== "toHome") drawCup(cup)
  drawStream()
  drawRail()
  drawHeld()
  drawCupLabel()
  drawPanel()
}

// ---------------------------------------------------------------- the loop: physics in fixed steps, drawn once a frame
let last = performance.now(), acc = 0
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now
  while (acc >= STEP) { sim.step(); acc -= STEP }
  hover = targetAt(pointer.x, pointer.y)
  view.style.cursor = S.held ? (pointer.down ? "grabbing" : hover ? "pointer" : "grab") : hover ? "pointer" : "default"
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
