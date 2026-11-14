// Neon Dome pour lab: drawing and input. The simulation lives in sim.js and the taste model in flavor.js; this file
// draws them at the scene's own 480x270 pixels, scaled up crisply (nearest-neighbor, no blur), and turns clicks and
// holds into actions. It also runs the test guest: they ask in vibe words, you serve, they react.
import { createSim, STEP, FILL_LINE, MAX_PARTS, SHORT, rng } from "./sim.js"
import { BASE, FUSED, LABEL, PARENTS, CROWDS, PHRASES, makeGuest, request, score, feedback } from "./flavor.js"

const W = 480, H = 270
const view = document.getElementById("view")
const MAIN = view.getContext("2d")
MAIN.imageSmoothingEnabled = false
let ctx = MAIN                       // what the draw helpers paint on (swapped to an offscreen layer for the glass)

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
const L = await (await fetch("assets/layout.json")).json()
const FONT = await (await fetch("assets/font5x7.json")).json()
const IMG = {}
const TOOL_IMGS = ["shaker", "shaker_cap", "mixing_glass", "mixing_glass_bare"]
const names = ["glass", "cup_quarter", "cup_half", "cup_one", ...TOOL_IMGS, ...L.ingredients.flatMap((g) => ["bottle_" + g.id, "bottle_" + g.id + "_hover"])]
await Promise.all([
  loadImg("assets/pour_bg.png").then((i) => (IMG.bg = i)),
  loadImg("assets/pour_front.png").then((i) => (IMG.front = i)),
  ...names.map((n) => loadImg("assets/sprites/" + n + ".png").then((i) => (IMG[n] = i))),
])
const sizes = Object.fromEntries(["glass", "cup_quarter", "cup_half", "cup_one", "shaker", "mixing_glass"].map((n) => [n, { w: IMG[n].width, h: IMG[n].height }]))
const sim = createSim(L, sizes)
const S = sim.S, glass = sim.glass

// ---------------------------------------------------------------- small helpers
const logText = (log) => log.map((l, i) => (i ? l[0].toLowerCase() + l.slice(1) : l)).join(", ")
const rgbStr = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const mixRgb = (a, b, t) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t))
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ease = (t) => t * t * (3 - 2 * t)
const CREAM = hex("#F2E4C8"), WHITE = hex("#FFF6E6"), GOLD = hex("#E8B060"), INK = hex("#141A16"), SKY = hex("#C9D7E8")
const DIM = "#93A297", SOFT = "#B8C8BC"
// the hologram's colors: cyan light on a dark glass
const HOLO = { edge: "#5FF3E8", title: "#8FFFF4", text: "#CFF7F2", dim: "#5FA8A8", value: "#FFFFFF", track: "#1F4C54", lost: "#FF8AA8", glow: "#FFE27A" }
const FUSED_COLOR = { depth: hex("#B77CFF"), brightness: hex("#FFE96A"), toasted: hex("#FF9F4A") }
const px = (x, y, c) => { ctx.fillStyle = typeof c === "string" ? c : rgbStr(c); ctx.fillRect(Math.round(x), Math.round(y), 1, 1) }
function line(x0, y0, x1, y1, c, size = 1) {
  ctx.fillStyle = typeof c === "string" ? c : rgbStr(c)
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), size, size)
}
const fill = (x, y, w, h, c) => { ctx.fillStyle = typeof c === "string" ? c : rgbStr(c); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }
const frame1 = (x, y, w, h, c) => { fill(x, y, w, 1, c); fill(x, y + h - 1, w, 1, c); fill(x, y, 1, h, c); fill(x + w - 1, y, 1, h, c) }
// sprites with their anchor at the middle of their bottom edge, as pxl places them
const spriteAt = (name, x, feet, alpha = 1) => {
  const i = IMG[name]; ctx.globalAlpha = alpha; ctx.drawImage(i, Math.round(x - i.width / 2), Math.round(feet - i.height)); ctx.globalAlpha = 1
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
  x = Math.round(x); y = Math.round(y)
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
const liquidOf = (id) => (id === "water" ? hex("#E2EEF0") : hex(ingOf[id].liquid))
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
function toolBoxOf(tool) { const b = sim.toolBox(tool); return { x: b.left, y: b.top, w: tool.w, h: tool.h } }
// the ice well's opening, in the counter's perspective (the same numbers the art used)
const proj = (xn, y) => L.VPX + (xn - L.VPX) * (y - L.VPY) / (L.NEAR - L.VPY)
const WELL = [[proj(L.WELL.xa, L.WELL.far), L.WELL.far], [proj(L.WELL.xb, L.WELL.far), L.WELL.far], [proj(L.WELL.xb, L.WELL.near), L.WELL.near], [proj(L.WELL.xa, L.WELL.near), L.WELL.near]]
const WELL_MID = { x: proj((L.WELL.xa + L.WELL.xb) / 2, 204), y: 202 }
function inPoly(x, y, P) { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c }
const inBox = (x, y, b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
// a hovered cup or tool gets a gold edge, the same signal as a hovered bottle's ring
function outlineOf(img, color) {
  const c = document.createElement("canvas"); c.width = img.width + 2; c.height = img.height + 2
  const g = c.getContext("2d"); g.drawImage(img, 1, 1)
  const d = g.getImageData(0, 0, c.width, c.height), o = g.createImageData(c.width, c.height)
  const A = (x, y) => (x < 0 || y < 0 || x >= c.width || y >= c.height ? 0 : d.data[(y * c.width + x) * 4 + 3])
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (!A(x, y) && (A(x - 1, y) || A(x + 1, y) || A(x, y - 1) || A(x, y + 1))) { const i = (y * c.width + x) * 4; o.data.set([...color, 255], i) }
  g.clearRect(0, 0, c.width, c.height); g.putImageData(o, 0, 0); return c
}
const OUTLINE = Object.fromEntries(["cup_quarter", "cup_half", "cup_one", "shaker", "mixing_glass"].map((n) => [n, outlineOf(IMG[n], hex("#FFC94A"))]))
// frost: a speckle of pale ice over the tin's metal (not its dark outline), shown more the colder it gets
function frostOf(img) {
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height
  const g = c.getContext("2d"); g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, c.width, c.height)
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4, lum = d.data[i] + d.data[i + 1] + d.data[i + 2]
    const on = d.data[i + 3] > 0 && lum > 120 && (x * 7 + y * 13) % 5 < 2
    d.data.set(on ? [234, 246, 250, 255] : [0, 0, 0, 0], i)
  }
  g.putImageData(d, 0, 0); return c
}
const FROST = { shaker: frostOf(IMG.shaker), shaker_cap: frostOf(IMG.shaker_cap) }

// ---------------------------------------------------------------- the test guest
// They ask in vibe words (three things that matter most to them, plus a mood or a quirk), you serve, they react.
const GR = rng((Date.now() % 1e9) + 1)
const CROWD_IDS = Object.keys(CROWDS)
let crowdPick = null                                 // null: any crowd
const guest = { g: null, said: [], phase: "asking", t: 0, result: null, back: 1 }
function newGuest() {
  guest.g = makeGuest(GR, crowdPick); guest.said = request(guest.g)
  guest.phase = "asking"; guest.t = 0; guest.result = null
}
newGuest(); guest.back = 1
function nextGuest() {
  closeSpectro()
  if (guest.phase !== "asking") { sim.emptyGlass(); guest.back = 0 }   // the empty glass slides back from the guest
  newGuest()
}
function serve() {
  if (guest.phase !== "asking") return
  if (sim.total() < FILL_LINE - 0.05) { sim.say(`Fill the glass to the gold line first (${FILL_LINE} parts).`); return }
  dropHeld()
  if (S.toolMode) sim.putToolDown()
  const t = sim.tasteOf(S.glass), s = score(guest.g, t)
  guest.result = { t, s, fb: feedback(guest.g, t, s) }
  guest.phase = "served"; guest.t = 0
  closeSpectro()
}
// where the glass sits: on its mat, or slid across to the guest's hands (smaller, a little farther away)
const SERVED = { dx: 102, dy: -18, s: 0.85 }
function glassPose() {
  if (guest.phase !== "asking") { const e = ease(Math.min(1, guest.t / 0.6)); return { dx: SERVED.dx * e, dy: SERVED.dy * e, s: 1 + (SERVED.s - 1) * e } }
  if (guest.back < 1) { const e = 1 - ease(guest.back); return { dx: SERVED.dx * e, dy: SERVED.dy * e, s: 1 + (SERVED.s - 1) * e } }
  return { dx: 0, dy: 0, s: 1 }
}

// ---------------------------------------------------------------- the phrasebook: what the guests' words mean
// A phrase is learned once you serve someone who said it; its entry then shows the range of the note it stands for.
const BOOK_KEY = "neonDome.phrasebook.v1"
const BOOK_AXES = ["strength", "sweet", "sour", "bitter", "fresh", "smoke", "spice", "complexity", "balance"]
const LEVEL_NAME = ["None", "A little", "Some", "A lot", "The most"]
const LEVEL_RANGE = ["under 1", "1 to 3.5", "3.5 to 6", "6 to 8.5", "8.5 and up"]
let learned = {}
try { learned = JSON.parse(globalThis.localStorage?.getItem(BOOK_KEY) || "{}") } catch { learned = {} }
const book = { open: false, ax: "sweet", t: 0 }
function learn(said) {
  let fresh = 0
  for (const { ax, level } of said) { learned[ax] ||= [false, false, false, false, false]; if (!learned[ax][level]) { learned[ax][level] = true; fresh++ } }
  try { globalThis.localStorage?.setItem(BOOK_KEY, JSON.stringify(learned)) } catch {}
  return fresh
}

// ---------------------------------------------------------------- the spectrograph: what the drink tastes like
// A hologram that slides down over the scene: one bar per note, built from each ingredient's share, with what was
// hidden (masked) as a hollow piece and what was boosted (carried) as a glowing piece; Complexity and Balance as dials.
const SPEC = { x: 6, y: 28, w: 262, h: 190 }
const spectro = { open: false, t: 0, src: "glass", taste: null, row: null }
function openSpectro(src) { spectro.open = true; spectro.t = 0; spectro.src = src; spectro.row = null }
function closeSpectro() { spectro.open = false }
function spectroTaste() {
  if (spectro.src === "served") return guest.result && guest.result.t
  const c = spectro.src === "glass" ? S.glass : S.tools[spectro.src] && S.tools[spectro.src].c
  return c ? sim.tasteOf(c) : null
}
const SPEC_ROWS = [...BASE, ...FUSED]
const rowY = (i) => SPEC.y + 37 + i * 11 + (i >= BASE.length ? 4 : 0)
const BAR_X = SPEC.x + 60, UNIT = 10

// ---------------------------------------------------------------- buttons (rebuilt every frame, so they always match what's drawn)
let buttons = []
const TONES = {
  gold: { fill: "rgba(232,176,96,0.15)", hov: "rgba(232,176,96,0.38)", edge: "rgba(232,176,96,0.8)", text: CREAM, off: "rgba(232,176,96,0.05)", offEdge: "rgba(232,176,96,0.35)", offText: DIM },
  holo: { fill: "rgba(95,243,232,0.10)", hov: "rgba(95,243,232,0.32)", edge: "rgba(95,243,232,0.8)", text: HOLO.text, off: "rgba(95,243,232,0.04)", offEdge: "rgba(95,243,232,0.3)", offText: HOLO.dim },
}
function button(label, x, y, act, { w, tone = "gold", key = label, dim = false, on = false } = {}) {
  w = w || textW(label) + 10
  const b = { x: Math.round(x), y: Math.round(y), w, h: 12, key, act }
  const T = TONES[tone], hov = hover && hover.kind === "button" && hover.key === key
  fill(b.x, b.y, w, 12, on ? T.hov : dim ? T.off : hov ? T.hov : T.fill)
  frame1(b.x, b.y, w, 12, dim ? T.offEdge : T.edge)
  text(label, b.x + Math.round((w - textW(label)) / 2), b.y + 3, dim ? T.offText : T.text)
  buttons.push(b); return b
}

// ---------------------------------------------------------------- input
const pointer = { x: -99, y: -99, down: false }
let hover = null
function toScene(e) { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height } }
function targetAt(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) if (inBox(x, y, buttons[i])) return { kind: "button", key: buttons[i].key, b: buttons[i] }
  if (book.open) return { kind: "modal" }
  if (spectro.open && inBox(x, y, SPEC)) {
    const i = SPEC_ROWS.findIndex((_, k) => y >= rowY(k) - 2 && y < rowY(k) + 9)
    const dial = x >= SPEC.x + 186 ? (y < SPEC.y + 96 ? "complexity" : y < SPEC.y + 160 ? "balance" : null) : null
    return { kind: "spectro", row: i >= 0 && x < SPEC.x + 186 ? SPEC_ROWS[i] : dial }
  }
  if (guest.phase !== "asking" || S.toolMode) return null
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
  if (!S.held) for (const tool of Object.values(S.tools)) if (tool.state === "home" && y < L.RAIL_TOP - 2 && inBox(x, y, toolBoxOf(tool))) return { kind: "tool", id: tool.id }
  return null
}
// whatever is in hand goes back: a bottle to its slot, a cup to the measuring spot
function dropHeld() { if (!S.held) return; if (S.held.kind === "cup") sim.putBack(null); else S.held = null }
function putBackHeld() { if (!S.held || S.held.back) return; if (S.held.kind === "cup") sim.putBack(null); else sim.putBack(railTip(S.held.id)) }
const clampAim = (p) => ({ x: clamp(p.x, 12, W - 12), y: clamp(p.y, 66, 214) })
view.addEventListener("pointerdown", (e) => {
  e.preventDefault(); view.setPointerCapture(e.pointerId)
  const p = toScene(e); pointer.x = p.x; pointer.y = p.y; pointer.down = true
  const t = targetAt(p.x, p.y)
  if (t && t.kind === "button") { t.b.act(); return }
  if (book.open || (t && t.kind === "spectro")) return
  if (e.button === 2) { putBackHeld(); return }
  if (guest.phase !== "asking") { sim.say("Click Next guest to serve someone new."); return }
  if (S.toolMode) { sim.press(true); return }                     // hold anywhere to shake or stir
  if (t && t.kind === "bottle") {
    dropHeld()                                                     // swap: the one in hand goes straight back
    sim.pick(t.id, railTip(t.id)); const a = clampAim(p); sim.aim(a.x, a.y)
  } else if (t && t.kind === "rail") putBackHeld()
  else if (t && t.kind === "ice") sim.addIce(WELL_MID)
  else if (t && t.kind === "cup") sim.activateCup(t.id)
  else if (t && t.kind === "activeCup") sim.clickActiveCup()
  else if (t && t.kind === "tool") sim.liftTool(t.id)
  else if (S.held) sim.press(true)
})
view.addEventListener("pointermove", (e) => {
  const p = toScene(e); pointer.x = p.x; pointer.y = p.y
  if (S.held && !S.held.back) { const a = clampAim(p); sim.aim(a.x, a.y) }
})
const release = () => { pointer.down = false; if (S.toolMode || (S.held && S.held.kind !== "dasher")) sim.press(false) }
view.addEventListener("pointerup", release)
view.addEventListener("pointercancel", release)
view.addEventListener("pointerleave", () => { pointer.x = -99; pointer.y = -99 })
view.addEventListener("contextmenu", (e) => { e.preventDefault(); putBackHeld() })
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return
  if (book.open) book.open = false; else if (spectro.open) closeSpectro(); else if (S.toolMode) sim.putToolDown(); else putBackHeld()
})

// ---------------------------------------------------------------- fit the window, crisp
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H), k = s >= 1 ? Math.floor(s) : s
  view.style.width = W * k + "px"; view.style.height = H * k + "px"
}
addEventListener("resize", fit); fit()

// ---------------------------------------------------------------- drawing: things on the counter
const K = L.K
function drawShadow(x, y, rx, ry, a = 0.35) {
  ctx.fillStyle = `rgba(36,14,8,${a})`
  for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2)); ctx.fillRect(Math.round(x - w), Math.round(y + dy), 2 * w + 1, 1) }
}
// a faint mirrored copy under a thing standing on the lacquer, fading out
function drawReflection(img, left, feet) {
  for (const [from, to, a] of [[0, 5, 0.25], [5, 12, 0.12]]) {
    ctx.save(); ctx.beginPath(); ctx.rect(left - 2, feet + from, img.width + 4, to - from); ctx.clip()
    ctx.globalAlpha = a; ctx.translate(left, feet); ctx.scale(1, -1); ctx.drawImage(img, 0, 0); ctx.restore()
  }
}
// what's in a cup, seen through its opening: the surface sits lower the less there is
function drawOpening(cx, rimY, hw, ry, depth, col) {
  for (let y = rimY - ry; y <= rimY + ry; y++) for (let x = cx - hw; x <= cx + hw; x++) {
    const inOpen = ((x - cx) / (hw + 0.5)) ** 2 + ((y - rimY) / (ry + 0.5)) ** 2 <= 1
    const inLiq = ((x - cx) / (hw + 0.5)) ** 2 + ((y - rimY - depth) / (ry + 0.5)) ** 2 <= 1
    if (inOpen && inLiq) px(x, y, y <= rimY + depth - ry + 1 ? mixRgb(col, WHITE, 0.3) : col)
  }
}
function drawCup(cup) {
  const i = IMG[cup.id], b = cupBox(cup)
  if (cup.state === "home" || cup.state === "active") {
    drawShadow(cup.x - 2, cup.y - 1 - Math.round(cup.rb * K), cup.rb + 1, Math.max(2, Math.round(cup.rb * K)), 0.4)
    if (cup.state === "home") drawReflection(i, b.x, cup.y)
  }
  if (hover && (hover.kind === "cup" || hover.kind === "activeCup") && hover.id === cup.id) ctx.drawImage(OUTLINE[cup.id], b.x - 1, b.y - 1)
  ctx.drawImage(i, b.x, b.y)
  const tot = sim.volOf(cup.c)
  if (tot > 0.001) {
    const rim = sim.cupRim(cup), f = Math.min(1, tot / cup.cap)
    drawOpening(Math.round(rim.cx), Math.round(rim.y), rim.hw, cup.ryT, (1 - f) * Math.min(cup.h * 0.5, 7), sim.srgb(sim.compColor(cup.c.parts)))
  }
}
// the stirring glass is clear, so its drink shows through the side: a body, a surface, and a few cubes of ice
function drawMixLiquid(tool, left, top) {
  const c = tool.c, vol = sim.volOf(c); if (vol < 0.005) return
  const cx = left + tool.cx, rim = top + tool.top + tool.ryT, base = rim + L.vessels[tool.id].h - 4
  const surf = Math.round(base - Math.min(1, vol / 6) * (base - rim - 3))
  const col = sim.srgb(sim.compColor(c.parts)), face = mixRgb(mixRgb(col, SKY, 0.18), WHITE, 0.15)
  for (let y = surf - 1; y <= base; y++) for (let x = cx - tool.rt + 2; x <= cx + tool.rt - 1; x++) {
    const d = (x - cx) / tool.rt
    px(x, y, y <= surf ? face : mixRgb(col, INK, 0.3 * d * d))
  }
  for (let k = 0; k < 3; k++) {
    const sx = cx - 6 + k * 6 + Math.round(Math.sin(tool.stir * 6 + k * 2.1) * 4), sy = surf + 1 + (k % 2)
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) px(sx + x - 2, sy + y - 2, x === 0 || y === 0 ? hex("#8CCBC0") : x === 4 || y === 4 ? hex("#4F9C96") : mixRgb(hex("#C6EDE4"), col, 0.3))
  }
}
// the bar spoon, turning in the stirring glass: its bowl circles near the bottom, the handle leans out of the top
function drawSpoon(tool, left, top) {
  const cx = left + tool.cx, base = top + tool.top + tool.ryT + L.vessels[tool.id].h - 6, a = tool.stir * 9
  const bx = cx + Math.cos(a) * 7, by = base + Math.sin(a) * 2, tx = cx + 4 + Math.cos(a) * 2, ty = top + 1
  line(bx, by, tx, ty, "#DCE6EC"); line(bx + 1, by, tx + 1, ty, "#8A98A2")
  fill(tx - 1, ty - 1, 4, 2, "#C9D3DA"); fill(bx - 1, by, 3, 2, "#C9D3DA")
}
function drawToolHome(tool) {
  const b = toolBoxOf(tool), img = IMG[tool.id], ryB = Math.max(2, Math.round(tool.rb * K))
  drawShadow(tool.x, tool.y - 1 - ryB, tool.rb + 1, ryB, 0.4)
  drawReflection(img, b.x, tool.y)
  if (hover && hover.kind === "tool" && hover.id === tool.id) ctx.drawImage(OUTLINE[tool.id], b.x - 1, b.y - 1)
  if (tool.id === "mixing_glass") drawMixLiquid(tool, b.x, b.y)
  ctx.drawImage(img, b.x, b.y)
  if (tool.id === "shaker" && sim.volOf(tool.c) > 0.001) {
    const rim = sim.toolRim(tool), f = Math.min(1, sim.volOf(tool.c) / 6)
    drawOpening(Math.round(rim.cx), Math.round(rim.y), rim.hw + 1, tool.ryT, (1 - f) * 8, sim.srgb(sim.compColor(tool.c.parts)))
  }
}
// a tool off its spot: lifted to shake or stir (jiggling while held down), or tipped to strain into the glass
function drawToolMoving(tool) {
  const working = S.toolMode === tool.id && S.pressing && tool.state === "ready"
  const chill = sim.volOf(tool.c) > 0 ? tool.c.chillVol / sim.volOf(tool.c) : 0
  if (tool.angle) {                                     // straining: turned about its foot
    const img = IMG[tool.id === "shaker" ? "shaker" : "mixing_glass_bare"]
    ctx.save(); ctx.translate(Math.round(tool.x), Math.round(tool.y)); ctx.rotate(tool.angle); ctx.drawImage(img, -Math.round(img.width / 2), -img.height)
    if (tool.id === "shaker" && chill > 0.05) { ctx.globalAlpha = Math.min(0.8, chill * 0.8); ctx.drawImage(FROST.shaker, -Math.round(img.width / 2), -img.height) }
    ctx.restore(); return
  }
  if (tool.id === "shaker") {
    const t = S.t * 26, jx = working ? Math.sin(t) * 3 : 0, jy = working ? Math.cos(t * 2) * 2 : 0, rot = working ? Math.sin(t) * 0.16 : 0
    const capped = tool.state === "ready" || tool.state === "lift"
    const img = IMG.shaker, cap = IMG.shaker_cap
    ctx.save(); ctx.translate(Math.round(tool.x + jx), Math.round(tool.y - img.height / 2 + jy)); ctx.rotate(rot)
    const ox = -Math.round(img.width / 2), oy = -Math.round(img.height / 2)
    ctx.drawImage(img, ox, oy)
    if (capped) ctx.drawImage(cap, -Math.round(cap.width / 2), oy - cap.height + 7)
    if (chill > 0.05) {
      ctx.globalAlpha = Math.min(0.85, chill * 0.85); ctx.drawImage(FROST.shaker, ox, oy)
      if (capped) ctx.drawImage(FROST.shaker_cap, -Math.round(cap.width / 2), oy - cap.height + 7)
    }
    ctx.restore()
  } else {
    const b = toolBoxOf(tool)
    drawMixLiquid(tool, b.x, b.y)
    if (tool.state === "ready" || tool.state === "lift") drawSpoon(tool, b.x, b.y)
    ctx.drawImage(IMG[tool.state === "ready" || tool.state === "lift" ? "mixing_glass_bare" : "mixing_glass"], b.x, b.y)
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
        const r = clamp(Math.round(G.bottomY - y), 0, G.ROWS - 1)
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
      if (c.state === "in" && sim.total() > 0.15 && y0 + y > s + S.wave[clamp(x0 + x - glass.col0, 0, glass.N - 1)]) col = mixRgb(col, sim.srgb(S.mean), 0.45)
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
// the glass and everything in it is painted on its own layer, so it can slide across to the guest and shrink a
// little with distance while staying crisp (scaled pixel for pixel, never blurred)
const glassLayer = document.createElement("canvas"); glassLayer.width = W; glassLayer.height = H
const GCTX = glassLayer.getContext("2d"); GCTX.imageSmoothingEnabled = false
function drawGlass() {
  const pose = glassPose()
  ctx = GCTX; ctx.clearRect(0, 0, W, H)
  drawShadow(glass.cx, L.GLASS_BASE - 1 - glass.ryB, 13, glass.ryB, 0.45)
  drawLiquid(); drawIce(); ctx.drawImage(IMG.glass, glass.left, glass.top)
  if (guest.phase === "asking" && guest.back >= 1) drawFillLine()
  ctx = MAIN
  const ox = Math.round(glass.cx + pose.dx - glass.cx * pose.s), oy = Math.round(L.GLASS_BASE + pose.dy - L.GLASS_BASE * pose.s)
  ctx.drawImage(glassLayer, 0, 0, W, H, ox, oy, Math.round(W * pose.s), Math.round(H * pose.s))
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
  for (const s of S.splats) { ctx.globalAlpha = Math.min(1, s.life * 2); fill(s.x - 1, s.y, 3, 1, sim.srgb(s.color)); ctx.globalAlpha = 1 }
  // spilled over the rim: drips running down the outside of the glass
  if (S.overflow > 0.02 && guest.phase === "asking") {
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
  if (h.kind === "cup") {
    // a cup is held by its pouring lip (the right end of its rim) and turns about it
    const cup = S.cups[h.id], i = IMG[cup.id]
    ctx.save(); ctx.translate(Math.round(h.x), Math.round(h.y)); ctx.rotate(h.angle); ctx.drawImage(i, -(2 * cup.rt + 2), -(1 + cup.ryT)); ctx.restore()
    if (h.angle < 0.2 && sim.volOf(cup.c) > 0.001) {
      const f = Math.min(1, sim.volOf(cup.c) / cup.cap)
      drawOpening(Math.round(h.x - cup.rt), Math.round(h.y), cup.rt - 1, cup.ryT, (1 - f) * Math.min(cup.h * 0.5, 7), sim.srgb(sim.compColor(cup.c.parts)))
    }
    return
  }
  const i = IMG["bottle_" + h.id], t = tipOf(h.id)
  const wob = h.kind === "dasher" && h.shake > 0 ? Math.sin(h.shake * 70) * 0.28 : 0
  ctx.save(); ctx.translate(Math.round(h.x), Math.round(h.y)); ctx.rotate(h.angle + wob); ctx.drawImage(i, -t.x, -t.y); ctx.restore()
}
function tag(s, cx, y, color = CREAM) {
  const w = textW(s) + 6
  fill(Math.round(cx - w / 2), y, w, 10, "rgba(20,26,22,0.82)")
  text(s, Math.round(cx), y + 1, color, "center")
}
function drawLabels() {
  const cup = S.activeCup && S.cups[S.activeCup]
  if (cup && cup.state === "active") {
    const v = sim.volOf(cup.c)
    tag(`${v.toFixed(2)} / ${cup.cap.toFixed(2)}`, cup.x, cupBox(cup).y - 12, v >= cup.cap - 0.005 ? "#FFC94A" : CREAM)
  }
  for (const tool of Object.values(S.tools)) if (tool.state === "home" && sim.volOf(tool.c) > 0.004) tag(`${sim.volOf(tool.c).toFixed(2)} parts`, tool.x, toolBoxOf(tool).y - 11)
}
function drawWellHover() {
  if (!(hover && hover.kind === "ice")) return
  for (let i = 0; i < 4; i++) { const a = WELL[i], b = WELL[(i + 1) % 4]; line(a[0], a[1] - 1, b[0], b[1] - 1, "#FFC94A") }
}

// ---------------------------------------------------------------- drawing: panels
function panel(x, y, w, h) {
  fill(x, y, w, h, "rgba(20,26,22,0.84)"); frame1(x, y, w, h, "rgba(232,176,96,0.55)")
}
function gauge(label, x, y, w, f, value, color) {
  text(label, x, y, CREAM); text(value, x + w, y, CREAM, "right")
  fill(x, y + 9, w, 3, "rgba(232,176,96,0.18)"); fill(x, y + 9, Math.round(w * clamp(f, 0, 1)), 3, color)
}
function contentRows(r, P, y) {
  if (!r.rows.length) { text("Empty", P.x + 6, y, DIM); return y + 9 }
  for (const row of r.rows) {
    fill(P.x + 6, y + 2, 3, 3, liquidOf(row.id))
    text(row.name, P.x + 12, y, row.id === "water" ? SOFT : CREAM)
    text(row.dashes ? `${row.dashes} dash${row.dashes > 1 ? "es" : ""}` : row.parts.toFixed(2), P.x + P.w - 6, y, CREAM, "right"); y += 9
  }
  return y
}
const TOOL_NAME = { shaker: "THE SHAKER", mixing_glass: "THE STIRRING GLASS" }
// the left panel shows the vessel you're working with: the glass, or the shaker or stirring glass in your hand
function drawSidePanel() {
  const P = { x: 6, y: 44, w: 152 }
  const tool = S.toolMode && S.tools[S.toolMode]
  // measure first (draw nothing), then draw: the panel's height follows its contents
  const r = tool ? sim.readout(tool.c) : sim.readout()
  const hint = wrap(hintText(), P.w - 12)
  const rows = Math.max(1, r.rows.length)
  const h = tool ? 14 + rows * 9 + 6 + 9 + 30 + 11 + 32 + hint.length * 9 + 4
    : 14 + rows * 9 + 6 + 9 + (r.ice ? 9 : 0) + 11 + (r.log.length ? 9 : 0) + 17 + hint.length * 9 + 4
  panel(P.x, P.y, P.w, h)
  let y = P.y + 5
  text(tool ? "IN " + TOOL_NAME[tool.id] : "IN THE GLASS", P.x + 6, y, GOLD); y += 12
  y = contentRows(r, P, y)
  fill(P.x + 6, y + 1, P.w - 12, 1, "rgba(232,176,96,0.35)"); y += 5
  text("Total", P.x + 6, y, CREAM); text(tool ? `${r.total.toFixed(2)} parts` : `${r.total.toFixed(2)} of ${MAX_PARTS} parts`, P.x + P.w - 6, y, CREAM, "right"); y += 9
  if (tool) {
    gauge("Cold", P.x + 6, y + 1, P.w - 12, r.chill, r.chill.toFixed(2), "#8FE6FF"); y += 15
    gauge("Melted ice", P.x + 6, y + 1, P.w - 12, r.dilution / 0.4, `${Math.round(r.dilution * 100)}%`, "#C6EDE4"); y += 15
    const verb = tool.method === "shake" ? "Shaken" : "Stirred"
    text(tool.c.techT > 0.05 ? `${verb} ${tool.c.techT.toFixed(1)} s` : `Not ${verb.toLowerCase()} yet`, P.x + 6, y, S.pressing ? "#FFC94A" : SOFT); y += 11
    button("Strain into the glass", P.x + 6, y, () => sim.strainTool(), { w: P.w - 12, dim: tool.state !== "ready" }); y += 16
    const bw = Math.floor((P.w - 12 - 8) / 3)
    button("Taste", P.x + 6, y, () => (spectro.open && spectro.src === tool.id ? closeSpectro() : openSpectro(tool.id)), { w: bw, on: spectro.open && spectro.src === tool.id })
    button("Put down", P.x + 10 + bw, y, () => sim.putToolDown(), { w: bw })
    button("Dump", P.x + 14 + 2 * bw, y, () => sim.dumpTool(), { w: bw }); y += 16
  } else {
    if (r.ice) { text("Ice", P.x + 6, y, CREAM); text(`${r.ice} cube${r.ice > 1 ? "s" : ""}`, P.x + P.w - 6, y, CREAM, "right"); y += 9 }
    const diff = r.total - FILL_LINE
    const status = r.full ? ["Full to the rim", "#FF8A7A"] : Math.abs(diff) <= 0.05 ? ["At the fill line", "#FFC94A"] : diff < 0 ? [`Fill line: ${(-diff).toFixed(2)} to go`, DIM] : [`${diff.toFixed(2)} over the fill line`, "#E9A08A"]
    text(status[0], P.x + 6, y, status[1]); y += 11
    if (r.log.length) { text(logText(r.log), P.x + 6, y - 2, SOFT); y += 9 }
    const asking = guest.phase === "asking", has = r.total > 0.05, bw = Math.floor((P.w - 12 - 8) / 3)
    button("Taste", P.x + 6, y, () => { if (!has) return sim.say("Pour something first, then taste it."); spectro.open && spectro.src === "glass" ? closeSpectro() : openSpectro("glass") }, { w: bw, dim: !has || !asking, on: spectro.open && spectro.src === "glass" })
    button("Serve", P.x + 10 + bw, y, serve, { w: bw, dim: !asking || r.total < FILL_LINE - 0.05 })
    button("Empty", P.x + 14 + 2 * bw, y, () => { if (asking) sim.emptyGlass() }, { w: bw, dim: !asking || !has }); y += 17
  }
  for (const l of hint) { text(l, P.x + 6, y, SOFT); y += 9 }
}
function hintText() {
  if (guest.phase !== "asking") return "Click Next guest when you're ready for the next one."
  const tool = S.toolMode && S.tools[S.toolMode]
  if (tool) return tool.method === "shake" ? "Hold anywhere to shake. About 10 seconds gets it cold. Then strain it into the glass." : "Hold anywhere to stir. Stirring is gentler: about 20 seconds. Then strain it into the glass."
  const cup = S.activeCup && S.cups[S.activeCup]
  if (S.held && S.held.kind === "dasher") return "Click to add a dash. Click the rail to put it back."
  if (S.held && S.held.kind === "cup") return "Hold to pour from the cup. It goes back once it's empty."
  if (S.held) return "Hold to pour, move to aim: into the glass, a cup, the shaker or the stirring glass. Click the rail to put it back."
  if (cup && cup.state === "active") return sim.volOf(cup.c) > 0.001 ? "Click the cup to pick it up and pour it." : "Pour a bottle into the cup. Click the empty cup to put it away."
  return "Click a bottle to pick it up. Measure with a cup, shake or stir in the tools on the right. Click the ice well for ice."
}

// the guest's speech bubble, beside their head: what they want, then how they liked it
const HEAD = { x: 352, y: 96 }
function drawBubble() {
  const g = guest.g, x = 380, w = 97, inner = w - 10
  const lines = []                                   // [text, color]
  if (guest.phase === "asking") {
    for (const l of wrap(g.crowdName + " crowd", inner)) lines.push([l, GOLD])
    if (g.mood) for (const l of wrap(g.mood.name + ".", inner)) lines.push([l, "#FFB3D9"])
    for (const s of guest.said) for (const l of wrap(s.text, inner)) lines.push([l, CREAM])
  } else if (guest.phase === "served") {
    lines.push([".".repeat(1 + (Math.floor(guest.t * 3) % 3)), CREAM])
  } else {
    const { s, fb } = guest.result
    lines.push([`${s.tier} (${Math.round(s.score)})`, s.score >= 85 ? "#FFE27A" : s.score >= 65 ? "#9CF0B0" : s.score >= 40 ? "#E9C08A" : "#FF8A7A"])
    for (const l of fb.lines) for (const w2 of wrap(l, inner)) lines.push([w2, CREAM])
  }
  const t = guest.phase === "asking" ? guest.t : guest.phase === "served" ? 1 : guest.t - 1.2
  const pop = ease(Math.min(1, t / 0.2)), h = 8 + lines.length * 9
  const y = 58 + Math.round((1 - pop) * 4)
  ctx.globalAlpha = pop
  fill(x, y, w, h, "rgba(26,16,30,0.9)"); frame1(x, y, w, h, "rgba(255,111,181,0.75)")
  // the tail points at the guest's head
  for (let k = 0; k < 7; k++) fill(x - 1 - k * 4 / 1.5, HEAD.y - 4 + Math.round(k * 0.7), 2, Math.max(1, 6 - k), "rgba(255,111,181,0.75)")
  let ly = y + 5
  for (const [s, c] of lines) { text(s, x + 5, ly, c); ly += 9 }
  ctx.globalAlpha = 1
}
// the guest controls, top right
function drawStrip() {
  const y = 44, labels = [["Phrasebook", () => { book.open = !book.open; book.t = 0 }], [crowdPick ? CROWDS[crowdPick].name : "Any crowd", cycleCrowd], ["Next guest", nextGuest]]
  let x = 476
  for (const [l, act] of labels) { const w = textW(l) + 10; x -= w; button(l, x, y, act, { w, key: act === cycleCrowd ? "crowd" : l, on: l === "Phrasebook" && book.open }); x -= 4 }
}
function cycleCrowd() {
  const i = crowdPick ? CROWD_IDS.indexOf(crowdPick) : -1
  crowdPick = i + 1 < CROWD_IDS.length ? CROWD_IDS[i + 1] : null
  sim.say(`The next guest will be from ${crowdPick ? "the " + CROWDS[crowdPick].name + " crowd" : "any crowd"}.`)
}

// ---------------------------------------------------------------- drawing: the spectrograph
function holoPanel(x, y, w, h, t) {
  // it flickers in for a moment, then holds steady
  const flick = t < 0.18 ? (Math.floor(t * 60) % 2 ? 0.55 : 1) : 1
  ctx.globalAlpha = flick
  fill(x, y, w, h, "rgba(6,22,30,0.88)")
  for (let yy = y + 1; yy < y + h - 1; yy += 2) fill(x + 1, yy, w - 2, 1, "rgba(95,243,232,0.035)")
  frame1(x, y, w, h, "rgba(95,243,232,0.75)")
  fill(x + 2, y + 2, 6, 1, HOLO.edge); fill(x + 2, y + 2, 1, 6, HOLO.edge)          // corner brackets
  fill(x + w - 8, y + h - 3, 6, 1, HOLO.edge); fill(x + w - 3, y + h - 8, 1, 6, HOLO.edge)
}
function arrowMark(x, y, dir) {
  // > needs more, < needs less, a small diamond for spot on
  const c = dir > 0 ? "#FFC94A" : dir < 0 ? "#FF8AA8" : "#9CF0B0"
  if (dir === 0) { px(x + 1, y, c); fill(x, y + 1, 3, 1, c); px(x + 1, y + 2, c); return }
  for (let k = 0; k < 4; k++) fill(dir > 0 ? x + k : x + 3 - k, y - 3 + k, 1, 7 - 2 * k, c)
}
function dial(cx, cy, r, v, color, caption, sub, arrow) {
  text(caption, cx, cy - r - 10, HOLO.text, "center")
  const f = clamp(v / 10, 0, 1)
  for (let a = 0; a <= Math.PI; a += 1 / (r * 2)) {
    const lit = a <= f * Math.PI
    for (const rr of [r, r - 1]) px(cx - Math.cos(a) * rr, cy - Math.sin(a) * rr, lit ? color : HOLO.track)
  }
  const a = f * Math.PI
  line(cx, cy, cx - Math.cos(a) * (r - 4), cy - Math.sin(a) * (r - 4), HOLO.value)
  fill(cx - 1, cy - 1, 3, 3, HOLO.value)
  text(v.toFixed(1), cx, cy + 4, HOLO.value, "center")
  if (arrow !== undefined) arrowMark(cx + 14, cy + 4, arrow)
  let y = cy + 14
  for (const l of sub) { text(l, cx, y, HOLO.dim, "center"); y += 9 }
}
function drawSpectro() {
  if (!spectro.open) return
  const t = spectroTaste(); if (!t) { closeSpectro(); return }
  const slide = 1 - (1 - Math.min(1, spectro.t / 0.28)) ** 3
  const P = { ...SPEC, y: Math.round(SPEC.y - (1 - slide) * (SPEC.h + SPEC.y)) }
  const dy = P.y - SPEC.y
  holoPanel(P.x, P.y, P.w, P.h, spectro.t)
  const served = spectro.src === "served", arrows = served ? guest.result.fb.arrows : {}
  // header: what's being tasted, and how it was made
  const what = served ? "THE SERVED DRINK" : spectro.src === "glass" ? "THE GLASS" : TOOL_NAME[spectro.src]
  text("TASTE: " + what, P.x + 8, P.y + 5, HOLO.title)
  button("Close", P.x + P.w - 40, P.y + 3, closeSpectro, { w: 34, tone: "holo" })
  const c = spectro.src === "glass" || served ? S.glass : S.tools[spectro.src].c
  const stats = [`Melted ice ${Math.round(t.dilution * 100)}%`, `Cold ${t.chill.toFixed(1)}`]
  if (t.bubbles > 0.01) stats.push(`Bubbles ${Math.round(t.bubbles * 100)}%`)
  text(c.log.length ? logText(c.log) : "Poured straight in", P.x + 8, P.y + 15, HOLO.text)
  text(stats.join(" / "), P.x + 8, P.y + 24, HOLO.dim)
  // the note bars
  for (let i = 0; i < SPEC_ROWS.length; i++) {
    const n = SPEC_ROWS[i], y = rowY(i) + dy, v = t.notes[n], hov = spectro.row === n
    if (hov) fill(P.x + 10, y - 2, 172, 11, "rgba(95,243,232,0.10)")
    text(LABEL[n], P.x + 12, y, hov ? HOLO.value : HOLO.text)
    fill(BAR_X, y + 6, 10 * UNIT, 1, HOLO.track)                       // the 0 to 10 track
    for (let k = 0; k <= 10; k += 5) fill(BAR_X + k * UNIT, y + 5, 1, 3, HOLO.track)
    const bx = BAR_X, by = y + 1, bh = 5
    if (BASE.includes(n)) {
      const carried = t.carried[n] ? t.carried[n][0] : 0, masked = (t.masked[n] || []).reduce((s, m) => s + m[0], 0)
      const kept = Math.max(0, v - carried), tot = (t.contrib[n] || []).reduce((s, m) => s + m[1], 0)
      let x = bx, acc2 = 0
      // stacked: each ingredient's share of what's left after masking, in its own color
      for (const [id, val] of t.contrib[n] || []) {
        acc2 += tot > 0 ? kept * val / tot : 0
        const end = Math.round(bx + acc2 * UNIT)
        if (end > x) { fill(x, by, end - x, bh, mixRgb(liquidOf(id), [200, 255, 250], 0.25)); fill(x, by, end - x, 1, mixRgb(liquidOf(id), [255, 255, 255], 0.5)); if (end - x > 2) fill(end - 1, by, 1, bh, "rgba(6,22,30,0.7)") }
        x = Math.max(x, end)
      }
      x = Math.round(bx + kept * UNIT)
      // carried: a glowing piece on the end
      if (carried > 0.02) {
        const w = Math.max(1, Math.round(carried * UNIT)), pulse = 0.55 + 0.45 * Math.sin(S.t * 6)
        ctx.globalAlpha = 0.35 * pulse; fill(x, by - 1, w, bh + 2, HOLO.glow); ctx.globalAlpha = 1
        fill(x, by, w, bh, HOLO.glow); x += w
      }
      // masked: a hollow piece for what was there but got hidden
      if (masked > 0.02) {
        const w = Math.max(2, Math.round(masked * UNIT))
        for (let k = 0; k < w; k += 2) { px(x + k, by, HOLO.lost); px(x + k, by + bh - 1, HOLO.lost) }
        fill(x + w - 1, by, 1, bh, HOLO.lost); x += w
      }
      if (n in arrows) arrowMark(Math.max(x, Math.round(bx + v * UNIT)) + 3, y + 3, arrows[n])
    } else {
      // fused notes: one color, joined by a bracket to the two notes they grow from
      const bonus = t.discoveries.filter((d) => d.note === n).reduce((s, d) => s + d.bonus, 0)
      const base = Math.max(0, v - bonus), col = FUSED_COLOR[n]
      fill(bx, by, Math.round(base * UNIT), bh, col); fill(bx, by, Math.round(base * UNIT), 1, mixRgb(col, [255, 255, 255], 0.5))
      if (bonus > 0) { const x0 = Math.round(bx + base * UNIT), w = Math.max(1, Math.round(Math.min(bonus, v) * UNIT)); ctx.globalAlpha = 0.5 + 0.5 * Math.sin(S.t * 5); fill(x0, by - 1, w, bh + 2, HOLO.glow); ctx.globalAlpha = 1; fill(x0, by, w, bh, HOLO.glow) }
      const j = FUSED.indexOf(n), cx = P.x + 3 + j * 3, ys = [...PARENTS[n].map((p) => rowY(SPEC_ROWS.indexOf(p)) + dy + 3), y + 3]
      ctx.globalAlpha = hov ? 1 : 0.55
      fill(cx, Math.min(...ys), 1, Math.max(...ys) - Math.min(...ys) + 1, col)
      for (const yy of ys) fill(cx, yy, 10 - j * 3 - 1 + 1, 1, col)
      ctx.globalAlpha = 1
      if (n in arrows) arrowMark(Math.round(bx + v * UNIT) + 3, y + 3, arrows[n])
    }
    text(v.toFixed(1), P.x + 180, y, HOLO.value, "right")
  }
  // the dials
  const dx = P.x + 222
  dial(dx, P.y + 58, 15, t.complexity, "#B77CFF", "Complexity", wrap(`${t.effectiveNotes.toFixed(1)} clear notes`, 70), arrows.complexity)
  const drag = t.drags[0]
  dial(dx, P.y + 118, 15, t.balance, HOLO.edge, "Balance", drag ? wrap(drag[1][0].toUpperCase() + drag[1].slice(1), 78).slice(0, 3) : ["Nothing sticks", "out"], arrows.balance)
  // discoveries, then the hovered row's story
  let y = rowY(SPEC_ROWS.length - 1) + dy + 12
  for (const d of t.discoveries.slice(0, 1)) text(`Discovered: ${d.name}, +${d.bonus.toFixed(1)} ${LABEL[d.note]}`, P.x + 8, y, HOLO.glow)
  y = P.y + 165
  fill(P.x + 6, y, P.w - 12, 1, "rgba(95,243,232,0.25)"); y += 4
  for (const l of wrap(rowStory(t, spectro.row), P.w - 16).slice(0, 2)) { text(l, P.x + 8, y, HOLO.text); y += 9 }
}
// what's behind a bar, in words: its top three ingredients, then anything hidden or boosted
function rowStory(t, n) {
  if (!n) return "Point at a bar to see what made it."
  if (n === "complexity") return `Complexity counts how many notes stand out clearly: ${t.effectiveNotes.toFixed(1)} here.` + (t.ingredients > 5 ? ` More than five ingredients muddles it.` : "")
  if (n === "balance") return t.drags.length ? "Balance loses: " + t.drags.slice(0, 3).map(([a, why]) => `${why} (-${a.toFixed(1)})`).join(", ") + "." : "Balance is perfect: nothing sticks out."
  const v = t.notes[n]
  if (FUSED.includes(n)) {
    const [a, b] = PARENTS[n], d = t.discoveries.filter((x) => x.note === n)
    return `${LABEL[n]} ${v.toFixed(1)}: grows when ${LABEL[a]} and ${LABEL[b]} are close to each other (${t.notes[a].toFixed(1)} and ${t.notes[b].toFixed(1)}).` + (d.length ? ` Plus ${d[0].bonus.toFixed(1)} from ${d[0].name.toLowerCase()}.` : "")
  }
  const top = (t.contrib[n] || []).filter(([, x]) => x > 0.05).slice(0, 3).map(([id, x]) => `${SHORT[id]} ${x.toFixed(1)}`)
  let s = `${LABEL[n]} ${v.toFixed(1)}: ` + (top.length ? top.join(", ") + "." : "nothing in it brings this.")
  for (const [amt, why] of t.masked[n] || []) s += ` Lost ${amt.toFixed(1)}, ${why}.`
  if (t.carried[n]) s += ` Gained ${t.carried[n][0].toFixed(1)}, ${t.carried[n][1]}.`
  return s
}

// ---------------------------------------------------------------- drawing: the phrasebook
function drawBook() {
  if (!book.open) return
  const P = { x: 96, y: 58, w: 288, h: 162 }
  holoPanel(P.x, P.y, P.w, P.h, book.t)
  text("PHRASEBOOK", P.x + 8, P.y + 5, HOLO.title)
  button("Close", P.x + P.w - 40, P.y + 3, () => (book.open = false), { w: 34, tone: "holo", key: "bookClose" })
  text("Serve guests to learn what their words mean.", P.x + 8, P.y + 16, HOLO.dim)
  BOOK_AXES.forEach((ax, i) => {
    const n = (learned[ax] || []).filter(Boolean).length
    button(`${LABEL[ax]} ${n}/5`, P.x + 8, P.y + 28 + i * 14, () => (book.ax = ax), { w: 80, tone: "holo", key: "book_" + ax, on: book.ax === ax })
  })
  let y = P.y + 30
  const x = P.x + 96, w = P.w - 104
  PHRASES[book.ax].forEach((phrase, lv) => {
    // Complexity and Balance use the same words for their two lowest levels; show those once
    if (lv === 1 && PHRASES[book.ax][0] === phrase) return
    const known = learned[book.ax] && (learned[book.ax][lv] || (PHRASES[book.ax][0] === PHRASES[book.ax][1] && lv === 0 && learned[book.ax][1]))
    text(`${LEVEL_NAME[lv]}: ${LABEL[book.ax]} ${lv === 0 && PHRASES[book.ax][1] === phrase ? "under 3.5" : LEVEL_RANGE[lv]}`, x, y, HOLO.text); y += 9
    for (const l of wrap(known ? `"${phrase[0].toUpperCase() + phrase.slice(1)}"` : "Not heard yet", w)) { text(l, x + 4, y, known ? HOLO.value : HOLO.dim); y += 9 }
    y += 4
  })
}
function drawNotice() {
  if (!S.notice) return
  const lines = wrap(S.notice.text, 220), w = Math.max(...lines.map(textW)) + 12, h = lines.length * 9 + 6
  ctx.globalAlpha = Math.min(1, S.notice.t * 2)
  const x = Math.round(240 - w / 2), y = 232 - h
  fill(x, y, w, h, "rgba(20,26,22,0.9)"); frame1(x, y, w, h, "rgba(255,201,74,0.7)")
  lines.forEach((l, i) => text(l, 240, y + 3 + i * 9, CREAM, "center"))
  ctx.globalAlpha = 1
}

function render() {
  buttons = []
  ctx.drawImage(IMG.bg, 0, 0)
  drawWellHover()
  for (const cup of Object.values(S.cups)) if (cup.state === "home" || cup.state === "toHome") drawCup(cup)
  for (const tool of Object.values(S.tools)) if (tool.state === "home") drawToolHome(tool)
  drawGlass()
  for (const cup of Object.values(S.cups)) if (cup.state === "active" || cup.state === "toMeasure") drawCup(cup)
  drawStream()
  drawRail()
  for (const tool of Object.values(S.tools)) if (tool.state !== "home") drawToolMoving(tool)
  drawHeld()
  drawLabels()
  drawBubble()
  if (!spectro.open) drawSidePanel()
  if (!book.open) drawSpectro()
  drawStrip()
  drawBook()
  drawNotice()
}

// ---------------------------------------------------------------- the loop: physics in fixed steps, drawn once a frame
let last = performance.now(), acc = 0
function update(dt) {
  guest.t += dt; book.t += dt; spectro.t += dt
  if (guest.back < 1) guest.back = Math.min(1, guest.back + dt / 0.4)
  // the guest takes a sip, then says what they think; the spectrograph opens with their arrows on it
  if (guest.phase === "served" && guest.t >= 1.2) {
    guest.phase = "reacting"
    openSpectro("served")
    const n = learn(guest.said)
    if (n) sim.say(`${n} new phrase${n > 1 ? "s" : ""} in your phrasebook.`)
  }
}
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now
  while (acc >= STEP) { sim.step(); update(STEP); acc -= STEP }
  hover = targetAt(pointer.x, pointer.y)
  if (spectro.open && hover && hover.kind === "spectro") spectro.row = hover.row
  view.style.cursor = S.toolMode ? (pointer.down ? "grabbing" : "grab") : S.held ? (pointer.down ? "grabbing" : hover ? "pointer" : "grab") : hover && hover.kind !== "spectro" && hover.kind !== "modal" ? "pointer" : "default"
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
// a handle for the browser console and the node test harness: the simulation, the guest, and today's buttons
globalThis.pourlab = { sim, guest, spectro, book, get buttons() { return buttons } }
