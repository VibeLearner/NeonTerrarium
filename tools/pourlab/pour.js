// Neon Dome pour lab: drawing and input. The simulation lives in sim.js and the taste model in flavor.js; this file
// draws them at the scene's own 480x270 pixels, scaled up crisply (nearest-neighbor, no blur), and turns clicks and
// holds into actions. It also runs the test guest: they ask in vibe words, you serve, they react.
import { createSim, STEP, FILL_LINE, MAX_PARTS, SHORT, rng } from "./sim.js"
import { BASE, FUSED, LABEL, PARENTS, CROWDS, makeGuest, request, score, feedback } from "./flavor.js"

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
const EXT = 0, CW = W                     // the canvas is the scene, 480x270
view.width = CW; view.height = H
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

// ---------------------------------------------------------------- what each bottle is (shown on hover)
const PLAIN = { rice: "rice", rye: "rye", rum: "rum", coffee: "coffee", yuzu: "yuzu", ume: "ume", lemongrass: "lemongrass", glow: "glow", ginger: "ginger", shiso: "shiso", soda: "soda", bitters: "bitters", chili: "chili" }
const CUP_NAME = { cup_quarter: "A quarter", cup_half: "A half", cup_one: "One" }
const DESC = {
  rice: "A clean, clear spirit. Strong, with a whisper of sweetness, so everything else shows through.",
  rye: "Strong rye whiskey with a smoky, peppery edge and a little bitterness.",
  rum: "Strong and gently sweet, with a faint hint of smoke.",
  coffee: "Dark and rich: as sweet as it is bitter, with some kick and a roasted edge.",
  yuzu: "Sharp, bright citrus. Very sour, with a fresh zing.",
  ume: "Plum ferment: sweet and sour at once, with a slightly bitter finish.",
  lemongrass: "Fresh, grassy and sweet, with a light tang. Pours slowly.",
  glow: "Pure sweetness, thick and glowing. A little goes a long way. Pours slowly.",
  ginger: "Hot ginger: spicy and a little sweet.",
  shiso: "Fizzy and herbal: fresh, lightly bitter, a little sweet. Bubbles lift the fresh notes.",
  soda: "Bubbles and no flavor. Makes a drink longer and livelier, and softens everything in it.",
  bitters: "Very bitter, with a touch of spice. Dashes only: 0.05 parts each, six at most.",
  chili: "Pure heat. Dashes only: 0.05 parts each, six at most.",
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
  if (sim.total() < FILL_LINE - 0.05) { sim.say(`Pour at least the minimum drink amount first: ${FILL_LINE} parts, the gold MIN mark on the glass.`); return }
  dropHeld()
  if (S.toolMode) sim.putToolDown()
  const t = sim.tasteOf(S.glass), s = score(guest.g, t)
  guest.result = { t, s, fb: feedback(guest.g, t, s) }
  guest.phase = "served"; guest.t = 0
  closeSpectro()
}
// where the glass sits: on its mat, or slid across to the guest's hands (smaller, a little farther away)
const SERVED = { x: 330, y: 192, s: 0.85 }           // the guest's hands
function glassPose() {
  const sx = SERVED.x - glass.cx, sy = SERVED.y - glass.base
  if (guest.phase !== "asking") { const e = ease(Math.min(1, guest.t / 0.6)); return { dx: sx * e, dy: sy * e, s: 1 + (SERVED.s - 1) * e } }
  if (guest.back < 1) { const e = 1 - ease(guest.back); return { dx: sx * e, dy: sy * e, s: 1 + (SERVED.s - 1) * e } }
  return { dx: 0, dy: 0, s: 1 }
}

// ---------------------------------------------------------------- discoveries: the combinations you've found
// Two kinds, kept in the browser between visits:
//   pairings  the design doc's three secret pairs (fermented + smoked, citrus + herbal, roasted + spice): extra Depth,
//             Brightness or Toasted. Shown as ??? until found, then with the ingredients that did it.
//   combos    two ingredients that built Depth, Brightness or Toasted to at least 2 between them (the biggest giver
//             of each of the note's two parent notes). Any drink you taste or serve counts.
const BOOK_KEY = "neonDome.discoveries.v1"
const PAIRINGS = [["Fermented and smoked", "depth", "Something fermented with something smoked"], ["Citrus and herbal", "brightness", "Something citrus with something herbal"], ["Roasted and spice", "toasted", "Something roasted with something spicy"]]
const COMBO_MIN = 2
let found = { pairings: {}, combos: {} }
try { found = { pairings: {}, combos: {}, ...JSON.parse(globalThis.localStorage?.getItem(BOOK_KEY) || "{}") } } catch {}
const book = { open: false, t: 0, scroll: 0 }
const pairKey = (ids) => [...new Set(ids)].sort().join("+")
function noteDiscoveries(t) {
  if (!t) return
  const fresh = []
  for (const d of t.discoveries) {
    const list = (found.pairings[d.name] ||= []), k = pairKey(d.ids)
    if (!list.includes(k)) { list.push(k); fresh.push(`${namesOf(k)}: ${d.name.toLowerCase()}, +${d.bonus.toFixed(1)} ${LABEL[d.note]}`) }
  }
  for (const n of FUSED) {
    if (t.notes[n] < COMBO_MIN) continue
    const ids = PARENTS[n].map((p) => (t.contrib[p][0] || [])[0]).filter(Boolean)
    const list = (found.combos[n] ||= []), k = pairKey(ids)
    if (ids.length && !list.includes(k)) { list.push(k); fresh.push(`${namesOf(k)} gives ${LABEL[n]}`) }
  }
  if (!fresh.length) return
  try { globalThis.localStorage?.setItem(BOOK_KEY, JSON.stringify(found)) } catch {}
  sim.say(fresh.length === 1 ? `New combination: ${fresh[0]}.` : `${fresh.length} new combinations in Discoveries.`)
}
const namesOf = (k) => k.split("+").map((id) => SHORT[id]).join(" + ") + (k.includes("+") ? "" : " on its own")

// ---------------------------------------------------------------- the spectrograph: what the drink tastes like
// A hologram that slides down over the scene: one bar per note, built from each ingredient's share, with what was
// hidden (masked) as a hollow piece and what was boosted (carried) as a glowing piece; Complexity and Balance as dials.
const SPEC = { x: 6 - EXT, y: 28, w: 262, h: 196 }
const spectro = { open: false, t: 0, src: "glass", taste: null, row: null }
function openSpectro(src) { spectro.open = true; spectro.t = 0; spectro.src = src; spectro.row = null; if (src !== "served") noteDiscoveries(spectroTaste()) }
function closeSpectro() { spectro.open = false }
function spectroTaste() {
  if (spectro.src === "served") return guest.result && guest.result.t
  const c = spectro.src === "glass" ? S.glass : S.tools[spectro.src] && S.tools[spectro.src].c
  return c ? sim.tasteOf(c) : null
}
const SPEC_ROWS = [...BASE, ...FUSED]
const rowY = (i) => SPEC.y + 37 + i * 11 + (i >= BASE.length ? 4 : 0)
const BAR_X = SPEC.x + 66, UNIT = 10

// ---------------------------------------------------------------- buttons (rebuilt every frame, so they always match what's drawn)
let buttons = []
const TOOL_NAME = { shaker: "THE SHAKER", mixing_glass: "THE STIRRING GLASS" }
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
function toScene(e) { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) * CW / r.width - EXT, y: (e.clientY - r.top) * H / r.height } }
function targetAt(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) if (inBox(x, y, buttons[i])) return { kind: "button", key: buttons[i].key, b: buttons[i] }
  if (book.open) return { kind: "modal" }
  if (spectro.open && inBox(x, y, SPEC)) {
    const i = SPEC_ROWS.findIndex((_, k) => y >= rowY(k) - 2 && y < rowY(k) + 9)
    const dial = x >= SPEC.x + 186 ? (y < SPEC.y + 96 ? "complexity" : y < SPEC.y + 160 ? "balance" : null) : null
    return { kind: "spectro", row: i >= 0 && x < SPEC.x + 186 ? SPEC_ROWS[i] : dial }
  }
  if (guest.phase !== "asking") return null
  if (S.toolMode) return inPoly(x, y, WELL) ? { kind: "ice" } : null       // a lifted tool can still take ice
  // bottles on the rail (the one in hand has left its slot)
  for (const g of L.ingredients) {
    if (S.held && S.held.id === g.id) continue
    if (hitBottle(g.id, x, y)) return { kind: "bottle", id: g.id }
  }
  if (!S.held && !S.grab && inBox(x, y, SCREEN)) return { kind: "screen" }
  const glassBox = { x: glass.left, y: glass.top, w: glass.w, h: glass.h }
  if (S.held && S.held.kind === "glass" && inBox(x, y, glassBox)) return { kind: "mat" }   // set the glass back down
  const bottleInHand = S.held && (S.held.kind === "bottle" || S.held.kind === "dasher")
  if (bottleInHand && (y >= L.NEAR - 2 || inBox(x, y, bottleBox(S.held.id)))) return { kind: "rail" }   // its slot, or the rail
  if (S.held && y >= L.RAIL_TOP - 4) return { kind: "rail" }
  if (inPoly(x, y, WELL)) return { kind: "ice" }
  for (const cup of Object.values(S.cups)) {
    if (cup.state === "home" && inBox(x, y, cupBox(cup))) return { kind: "cup", id: cup.id }
    if (cup.state === "active" && !S.held && inBox(x, y, cupBox(cup))) return { kind: "activeCup", id: cup.id }
  }
  if (!S.held && inBox(x, y, { x: glass.left, y: glass.top, w: glass.w, h: glass.h })) return { kind: "glass" }
  if (!S.held) for (const tool of Object.values(S.tools)) if (tool.state === "home" && y < L.RAIL_TOP - 2 && inBox(x, y, toolBoxOf(tool))) return { kind: "tool", id: tool.id }
  return null
}
// whatever is in hand goes back: a bottle to its slot, a cup to the measuring spot
function dropHeld() { if (!S.held) return; if (S.held.kind === "cup" || S.held.kind === "tool") sim.putBack(null); else if (S.held.kind === "glass") sim.dropGlass(); else S.held = null }
function putBackHeld() { if (!S.held || S.held.back) return; if (S.held.kind === "cup" || S.held.kind === "glass" || S.held.kind === "tool") sim.putBack(null); else sim.putBack(railTip(S.held.id)) }
const clampAim = (p) => ({ x: clamp(p.x, 12, W - 12), y: clamp(p.y, 66, 214) })
// the glass, the tools and the cups can be dragged to another spot on the counter; a click without moving does what
// clicking always did (pick up, lift, set beside the glass)
const MOVABLE = { glass: "glass", tool: "tool", cup: "cup", activeCup: "cup" }
let pending = null
function clickThing(t) {
  if (t.kind === "cup") sim.activateCup(t.id)
  else if (t.kind === "activeCup") sim.clickActiveCup()
  else if (t.kind === "tool") sim.handTool(t.id)
  else if (t.kind === "glass") sim.pickGlass()
}
view.addEventListener("pointerdown", (e) => {
  e.preventDefault(); view.setPointerCapture(e.pointerId)
  const p = toScene(e); pointer.x = p.x; pointer.y = p.y; pointer.down = true
  const t = targetAt(p.x, p.y)
  if (t && t.kind === "button") { t.b.act(); return }
  if (book.open || (t && t.kind === "spectro")) return
  if (e.button === 2) { putBackHeld(); return }
  if (guest.phase !== "asking") { sim.say("Click Next guest to serve someone new."); return }
  if (t && t.kind === "screen") { const c = focusContents(); if (sim.volOf(c) > 0.01) openSpectro(focus); else sim.say("Nothing in it to taste yet."); return }
  if (t && t.kind === "ice") { sim.grabIce(p.x, p.y, e.timeStamp / 1000); return }      // a cube from the well, to drag or flick
  if (S.toolMode) { sim.press(true); return }                     // hold anywhere to shake or stir
  if (t && t.kind === "bottle") {
    dropHeld()                                                     // swap: the one in hand goes straight back
    sim.pick(t.id, railTip(t.id)); const a = clampAim(p); sim.aim(a.x, a.y)
  } else if (t && t.kind === "rail") putBackHeld()
  else if (t && MOVABLE[t.kind] && sim.canMove(MOVABLE[t.kind], t.id || "glass")) pending = { t, x: p.x, y: p.y, moving: false }   // a click or a drag: decided when it moves or lets go
  else if (t && t.kind === "cup") sim.activateCup(t.id)
  else if (t && t.kind === "activeCup") sim.clickActiveCup()
  else if (t && t.kind === "tool") sim.handTool(t.id)
  else if (t && t.kind === "glass") sim.pickGlass()
  else if (t && t.kind === "mat") putBackHeld()
  else if (S.held) sim.press(true)
})
view.addEventListener("pointermove", (e) => {
  const p = toScene(e); pointer.x = p.x; pointer.y = p.y
  if (S.held && !S.held.back) { const a = clampAim(p); sim.aim(a.x, a.y) }
  if (S.grab) sim.moveIce(clamp(p.x, 2, W - 2), clamp(p.y, 2, H - 2), e.timeStamp / 1000)
  if (pending && !pending.moving && Math.hypot(p.x - pending.x, p.y - pending.y) > 3)
    pending.moving = sim.startMove(MOVABLE[pending.t.kind], pending.t.id || "glass", pending.x, pending.y)
  if (pending && pending.moving) sim.dragTo(p.x, p.y)
})
const release = (e, cancelled = false) => {
  if (pending) {
    const pd = pending; pending = null; pointer.down = false
    if (pd.moving) { const toGuest = pd.t.kind === "glass" && !cancelled && overServe(); sim.endMove(); if (toGuest) serve() }
    else if (!cancelled) clickThing(pd.t)
    return
  }
  pointer.down = false; if (S.grab) { sim.releaseIce(e.timeStamp / 1000); return } if (S.toolMode || (S.held && S.held.kind !== "dasher")) sim.press(false) }
view.addEventListener("pointerup", release)
view.addEventListener("pointercancel", (e) => release(e, true))
view.addEventListener("pointerleave", () => { pointer.x = -99; pointer.y = -99 })
view.addEventListener("wheel", (e) => { if (book.open) { e.preventDefault(); book.scroll += e.deltaY * 0.25 } }, { passive: false })
view.addEventListener("contextmenu", (e) => { e.preventDefault(); putBackHeld() })
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return
  if (book.open) book.open = false; else if (spectro.open) closeSpectro(); else if (S.toolMode) sim.putToolDown(); else putBackHeld()
})

// ---------------------------------------------------------------- fit the window, crisp
// as big as the window allows (not only whole-number steps, so it fills the screen), pixels kept square and sharp
function fit() {
  const k = Math.min(innerWidth / CW, innerHeight / H)
  view.style.width = Math.floor(CW * k) + "px"; view.style.height = Math.floor(H * k) + "px"
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
  const i = IMG[cup.id], carried = cup.state === "carried", b = cupBox(cup)
  if (carried) { drawShadow(cup.x - 2, cup.y - 1 - Math.round(cup.rb * K), cup.rb + 1, Math.max(2, Math.round(cup.rb * K)), 0.25); b.y -= 5 }
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
  const c = tool.c, vol = sim.volOf(c)
  const cx = left + tool.cx, rim = top + tool.top + tool.ryT, base = rim + L.vessels[tool.id].h - 4
  const surf = Math.round(base - Math.min(1, vol / 6) * (base - rim - 3))
  const col = sim.srgb(sim.compColor(c.parts)), face = mixRgb(mixRgb(col, SKY, 0.18), WHITE, 0.15)
  if (vol >= 0.005) for (let y = surf - 1; y <= base; y++) for (let x = cx - tool.rt + 2; x <= cx + tool.rt - 1; x++) {
    const d = (x - cx) / tool.rt
    px(x, y, y <= surf ? face : mixRgb(col, INK, 0.3 * d * d))
  }
  // its ice: floating at the surface (turning with the spoon), or piled on the bottom while it's dry
  for (let k = 0; k < c.ice; k++) {
    const row = Math.floor(k / 3), slot = k % 3
    const sx = cx - 6 + slot * 6 + (vol >= 0.005 ? Math.round(Math.sin(tool.stir * 6 + k * 2.1) * 3) : row * 3)
    const sy = vol >= 0.005 ? Math.max(surf + 1 + (k % 2) + row * 5, rim + 4) : base - 4 - row * 5
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) px(sx + x - 2, sy + y - 2, mixRgb(cubePx(Math.min(5, x + (x > 1)), Math.min(5, y + (y > 1))), col, vol >= 0.005 && sy + y - 2 > surf ? 0.3 : 0))
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
  const b = toolBoxOf(tool), img = IMG[tool.id], ryB = Math.max(2, Math.round(tool.rb * K)), carried = tool.state === "carried"
  drawShadow(tool.x, tool.y - 1 - ryB, tool.rb + 1, ryB, carried ? 0.25 : 0.4)
  if (carried) b.y -= 5; else drawReflection(img, b.x, tool.y)
  if (hover && hover.kind === "tool" && hover.id === tool.id) ctx.drawImage(OUTLINE[tool.id], b.x - 1, b.y - 1)
  if (tool.id === "mixing_glass") drawMixLiquid(tool, b.x, b.y)
  ctx.drawImage(img, b.x, b.y)
  if (tool.id === "shaker" && sim.volOf(tool.c) > 0.001) {
    const rim = sim.toolRim(tool), f = Math.min(1, sim.volOf(tool.c) / 6)
    drawOpening(Math.round(rim.cx), Math.round(rim.y), rim.hw + 1, tool.ryT, (1 - f) * 8, sim.srgb(sim.compColor(tool.c.parts)))
  }
  // the tops of its cubes, seen down the tin's opening
  if (tool.id === "shaker" && tool.c.ice) {
    const rim = sim.toolRim(tool)
    for (let k = 0; k < Math.min(4, tool.c.ice); k++) { const x = Math.round(rim.cx - 6 + k * 4), y = Math.round(rim.y + (k % 2)); fill(x, y, 3, 1, WHITE); fill(x, y + 1, 3, 1, hex("#8CCBC0")) }
  }
  if (tool.clink > 0) { const rim = sim.toolRim(tool); ctx.globalAlpha = tool.clink * 4; px(rim.cx - 5, rim.y - 4, WHITE); px(rim.cx + 4, rim.y - 5, WHITE); px(rim.cx, rim.y - 7, WHITE); ctx.globalAlpha = 1 }
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
// an ice cube: 6 px, lit from the top left; tinted by the drink where it's under the surface
function cubePx(x, y, under) {
  const edge = x === 0 || y === 0 || x === 5 || y === 5
  const col = edge ? (y === 0 || x === 0 ? hex("#8CCBC0") : hex("#4F9C96")) : y === 1 || x === 1 ? WHITE : hex("#C6EDE4")
  return under ? mixRgb(col, under, 0.45) : col
}
const CUBE = document.createElement("canvas"); CUBE.width = 6; CUBE.height = 6
{ const g = CUBE.getContext("2d"); for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { g.fillStyle = rgbStr(cubePx(x, y)); g.fillRect(x, y, 1, 1) } }
// cubes in the air (turning as they fly), melting on the counter, and the one in hand
function drawThrown() {
  for (const c of S.thrown) {
    if (c.state === "counter") ctx.globalAlpha = Math.min(1, c.life * 1.5)
    ctx.save(); ctx.translate(Math.round(c.x), Math.round(c.y)); ctx.rotate(Math.round(c.rot / (Math.PI / 8)) * (Math.PI / 8)); ctx.drawImage(CUBE, -3, -3); ctx.restore()
    ctx.globalAlpha = 1
  }
  if (S.clink) { const a = S.clink.t / 0.2; ctx.globalAlpha = a; for (const [dx, dy] of [[-3, -2], [3, -2], [0, -4]]) px(S.clink.x + dx * (2 - a), S.clink.y + dy * (2 - a), WHITE); ctx.globalAlpha = 1 }
  if (S.grab) { drawShadow(S.grab.x, Math.min(L.GLASS_BASE, S.grab.y + 14), 3, 1, 0.25); ctx.drawImage(CUBE, Math.round(S.grab.x - 3), Math.round(S.grab.y - 3)) }
}
function drawIce() {
  const s = sim.surfaceY()
  for (const c of S.ice) {
    const x0 = Math.round(c.x - 3), y0 = Math.round(c.y - 3), mean = sim.srgb(S.mean)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++)
      px(x0 + x, y0 + y, cubePx(x, y, c.state === "in" && sim.total() > 0.15 && y0 + y > s + S.wave[clamp(x0 + x - glass.col0, 0, glass.N - 1)] ? mean : null))
  }
}
function drawFillLine() {
  const y = Math.round(glass.bottomY - FILL_LINE * glass.ppp), [il, ir] = glass.inner(y)
  const near = Math.abs(sim.total() - FILL_LINE) < 0.06
  ctx.globalAlpha = near ? 1 : 0.6
  for (let x = il; x <= ir; x += 2) px(x, y, GOLD)
  px(il - 3, y, GOLD); px(il - 4, y, GOLD); px(ir + 3, y, GOLD); px(ir + 4, y, GOLD)
  text("MIN", ir + 7, y - 3, GOLD)          // the minimum drink amount
  ctx.globalAlpha = 1
}
// the glass and everything in it is painted on its own layer, so it can slide across to the guest and shrink a
// little with distance while staying crisp (scaled pixel for pixel, never blurred)
const glassLayer = document.createElement("canvas"); glassLayer.width = W; glassLayer.height = H
const GCTX = glassLayer.getContext("2d"); GCTX.imageSmoothingEnabled = false
function drawGlass() {
  const pose = glassPose(), h = S.held && S.held.kind === "glass" ? S.held : null
  ctx = GCTX; ctx.clearRect(0, 0, W, H)
  drawLiquid(); drawIce(); ctx.drawImage(IMG.glass, glass.left, glass.top)
  if (!h && guest.phase === "asking" && guest.back >= 1) drawFillLine()
  ctx = MAIN
  // in hand: held by the right end of its rim and turned about it, drink and all
  if (h) { const lip = sim.glassLip(); ctx.save(); ctx.translate(Math.round(h.x), Math.round(h.y)); ctx.rotate(h.angle); ctx.drawImage(glassLayer, -lip.x, -lip.y); ctx.restore(); return }
  const lift = S.moving && S.moving.kind === "glass" ? 5 : 0
  if (guest.phase === "asking" && guest.back >= 1) drawShadow(glass.cx, glass.base - 1 - glass.ryB, 13, glass.ryB, lift ? 0.3 : 0.45)
  const ox = Math.round(glass.cx + pose.dx - glass.cx * pose.s), oy = Math.round(glass.base + pose.dy - glass.base * pose.s) - lift
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
  if (S.overflow > 0.02 && guest.phase === "asking" && !S.glassHeld) {
    ctx.globalAlpha = Math.min(1, S.overflow * 2); const col = sim.srgb(S.mean), [il, ir] = glass.inner(glass.rimY)
    for (const [x, ph] of [[il - 2, 0], [ir + 2, 1.7], [il + 5, 3.1]]) { const len = 6 + Math.round((Math.sin(S.t * 3 + ph) * 0.5 + 0.5) * 30); line(x, glass.rimY, x, glass.rimY + len, col) }
    ctx.globalAlpha = 1
  }
}
function drawRail() {
  for (const g of L.ingredients) {
    if (S.held && S.held.id === g.id) {
      // its empty slot shows a faint ghost of it, brighter when pointed at: click there to put it back
      const r = railOf[g.id]; spriteAt("bottle_" + g.id, r.x, r.floor, hover && hover.kind === "rail" ? 0.45 : 0.18); continue
    }
    const r = railOf[g.id], hov = hover && hover.kind === "bottle" && hover.id === g.id
    spriteAt("bottle_" + g.id + (hov ? "_hover" : ""), r.x, r.floor - (hov ? 6 : 0))
  }
  ctx.drawImage(IMG.front, -EXT, 0)
}
function drawHeld() {
  const h = S.held; if (!h) return
  if (h.kind === "glass") { drawGlass(); return }
  if (h.kind === "tool") {
    const tool = S.tools[h.id], shaker = tool.id === "shaker", busy = tool.workShow > 0
    const img = IMG[shaker || !busy ? tool.id : "mixing_glass_bare"]
    const left = -(Math.round(tool.w / 2) + tool.rt + 1), top = -(tool.top + tool.ryT)
    const jig = shaker && tool.working ? S.t * 26 : 0
    const chill = sim.volOf(tool.c) > 0 ? tool.c.chillVol / sim.volOf(tool.c) : 0
    ctx.save(); ctx.translate(Math.round(h.x + (jig ? Math.sin(jig) * 2 : 0)), Math.round(h.y + (jig ? Math.cos(jig * 2) * 1.5 : 0))); ctx.rotate(h.angle + (jig ? Math.sin(jig) * 0.12 : 0))
    if (!shaker) drawMixLiquid(tool, left, top)
    if (!shaker && busy) drawSpoon(tool, left, top)
    ctx.drawImage(img, left, top)
    const cap = IMG.shaker_cap, capX = left + Math.round(tool.w / 2) - Math.round(cap.width / 2), capY = top - cap.height + 7
    if (shaker && busy) ctx.drawImage(cap, capX, capY)
    if (shaker && chill > 0.05) { ctx.globalAlpha = Math.min(0.85, chill * 0.85); ctx.drawImage(FROST.shaker, left, top); if (busy) ctx.drawImage(FROST.shaker_cap, capX, capY); ctx.globalAlpha = 1 }
    ctx.restore()
    return
  }
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
  cx = clamp(cx, w / 2 + 2, W - w / 2 - 2)            // keep it on screen
  fill(Math.round(cx - w / 2), y, w, 10, "rgba(20,26,22,0.82)")
  text(s, Math.round(cx), y + 1, color, "center")
}
// where to slide the glass to serve it: in front of the guest's hands
const SERVE_ZONE = { x: 290, y: 168, w: 84, h: 38 }
const overServe = () => inBox(pointer.x, pointer.y, SERVE_ZONE)
function drawServeZone() {
  if (!(S.moving && S.moving.kind === "glass")) return
  const on = overServe(), ready = sim.total() >= FILL_LINE - 0.05
  ctx.globalAlpha = on ? 0.95 : 0.5
  for (let k = 0; k < 2; k++) for (let a = 0; a < Math.PI * 2; a += 0.04) px(332 + Math.cos(a) * (30 - k), 195 + Math.sin(a) * (6 - k), ready ? "#9CF0B0" : "#FF8AA8")
  ctx.globalAlpha = 1
  tag(ready ? "Let go here to serve" : `Pour ${FILL_LINE} parts first`, 332, 128, ready ? "#9CF0B0" : "#FF8AA8")
}
function drawLabels() {
  if (S.pressing && S.held) ctx.globalAlpha = 0.3          // faded while pouring, so the stream shows through
  const cup = S.activeCup && S.cups[S.activeCup]
  if (cup && cup.state === "active") {
    const v = sim.volOf(cup.c)
    tag(`${v.toFixed(2)} / ${cup.cap.toFixed(2)}`, cup.x, cupBox(cup).y - 12, v >= cup.cap - 0.005 ? "#FFC94A" : CREAM)
  }
  for (const tool of Object.values(S.tools)) if (tool.state === "home" && (sim.volOf(tool.c) > 0.05 || tool.c.ice)) {
    const v = sim.volOf(tool.c), bits = []
    if (v > 0.05) bits.push(`${v.toFixed(2)} parts`)
    bits.push(tool.c.ice ? `${tool.c.ice} ice` : "no ice")
    tag(bits.join(", "), tool.x, toolBoxOf(tool).y - 11, tool.c.ice ? CREAM : "#E9A08A")
  }
  ctx.globalAlpha = 1
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
// ---------------------------------------------------------------- the screen hanging from the top shelf
// Shows one vessel at a time (glass, shaker or stirring glass), switching by itself to whichever you're using: what's
// in it, and its taste profile as it stands. It hangs above the counter, clear of everything you can pick up, and
// draws behind the action, so a bottle or a stream in front of it is never hidden. Click it for the full breakdown.
const SCREEN = { x: 4, y: 44, w: 210, h: 102 }
const VESSELS = [["glass", "Glass"], ["shaker", "Shaker"], ["mixing_glass", "Stirrer"]]
let focus = "glass"
function followFocus() {
  if (S.held && (S.held.kind === "tool" || S.held.kind === "glass")) focus = S.held.id
  else if (S.lastInto) { if (VESSELS.some(([id]) => id === S.lastInto)) focus = S.lastInto; S.lastInto = null }
}
const focusContents = () => (focus === "glass" ? S.glass : S.tools[focus].c)
function drawScreen() {
  const P = SCREEN, free = !S.held && !S.grab && !S.moving && guest.phase === "asking"
  // the two cables up to the shelf, then the bezel
  for (const cx of [P.x + 24, P.x + P.w - 24]) { fill(cx, 37, 1, P.y - 37, "#2A2F35"); fill(cx + 1, 37, 1, P.y - 37, "#4A525A") }
  fill(P.x - 2, P.y - 2, P.w + 4, P.h + 4, "#1B1F24"); frame1(P.x - 2, P.y - 2, P.w + 4, P.h + 4, "#3A4048")
  fill(P.x, P.y, P.w, P.h, "rgba(6,22,30,0.94)")
  for (let yy = P.y + 1; yy < P.y + P.h; yy += 2) fill(P.x, yy, P.w, 1, "rgba(95,243,232,0.03)")
  if (hover && hover.kind === "screen") frame1(P.x, P.y, P.w, P.h, "rgba(95,243,232,0.6)")
  // tabs: which vessel is shown; click one to look at it (while your hands are free)
  let x = P.x + 3
  for (const [id, label] of VESSELS) {
    const w = textW(label) + 6
    if (free) button(label, x, P.y + 3, () => (focus = id), { w, key: "tab_" + id, tone: "holo", on: focus === id })
    else { if (focus === id) fill(x, P.y + 3, w, 12, "rgba(95,243,232,0.32)"); frame1(x, P.y + 3, w, 12, "rgba(95,243,232,0.5)"); text(label, x + 3, P.y + 6, focus === id ? HOLO.value : HOLO.dim) }
    x += w + 2
  }
  const tool = focus === "glass" ? null : S.tools[focus], c = focusContents(), r = tool ? sim.readout(c) : sim.readout()
  // the total, right of the tabs: the long form if it fits, else a shorter one (never over the tabs)
  const room = P.x + P.w - 4 - (x + 2)
  const totals = tool ? [`${r.total.toFixed(2)} parts`, r.total.toFixed(2)] : [`${r.total.toFixed(2)} of ${MAX_PARTS} parts`, `${r.total.toFixed(2)} / ${MAX_PARTS} parts`, `${r.total.toFixed(2)} / ${MAX_PARTS}`]
  text(totals.find((t2) => textW(t2) <= room) || totals[totals.length - 1], P.x + P.w - 4, P.y + 6, HOLO.text, "right")
  fill(P.x + 3, P.y + 17, P.w - 6, 1, "rgba(95,243,232,0.3)")
  // the columns, measured from the text itself: the taste profile on the right is as wide as its longest label plus
  // a bar; the contents on the left get the rest
  const labelW = Math.max(...SPEC_ROWS.map((n) => textW(LABEL[n]))), BAR = 24
  const colR = P.x + P.w - 4 - BAR - 3 - labelW - 6        // the left column's right edge
  const leftW = colR - (P.x + 5)                            // room for text in the left column
  // status lines under the contents, wrapped to the column so they never run into the profile
  const status = []
  const say2 = (str, col) => { for (const l of wrap(str, leftW)) status.push([l, col]) }
  if (tool) {
    const verb = tool.method === "shake" ? "Shaken" : "Stirred"
    if (!c.ice) say2("No ice: it stays warm", "#FF8AA8")
    else say2(c.techT > 0.05 ? `${verb} ${c.techT.toFixed(1)} s` : c.log.length ? c.log[c.log.length - 1] : `Not ${verb.toLowerCase()} yet`, tool.working ? "#FFC94A" : HOLO.dim)
    if (r.total > 0.01) say2(`Cold ${r.chill.toFixed(1)}, ${Math.round(r.dilution * 100)}% melted`, HOLO.dim)
  } else if (guest.phase === "asking") {
    const left = FILL_LINE - r.total
    if (r.full) say2("Full to the rim", "#FF8AA8")
    else if (left > 0.05) { say2("Minimum drink amount", HOLO.dim); say2(`${left.toFixed(2)} parts to go`, HOLO.dim) }
    else { say2("Ready to serve.", "#9CF0B0"); say2("Slide it to the guest.", "#9CF0B0") }
  }
  const bottom = P.y + P.h - 3 - status.length * 9
  // left: what's in it; a long name wraps under itself, its amount stays on the first line
  let y = P.y + 21
  const ice = tool ? c.ice : r.ice
  const rows = r.rows.filter((row) => row.parts >= 0.04 || row.dashes).map((row) => [row.name, row.dashes ? `${row.dashes} dash${row.dashes > 1 ? "es" : ""}` : row.parts.toFixed(2), row.id])
  if (ice) rows.push(["Ice", `${ice} cube${ice > 1 ? "s" : ""}`, null])
  if (!rows.length) text("Empty", P.x + 5, y, HOLO.dim)
  // measure every row first; if they don't all fit, keep as many as fit with a "+n more" line under them
  const nameW = (amt) => colR - (P.x + 11) - textW(amt) - 5
  const heights = rows.map(([name, amt]) => wrap(name, nameW(amt)).length * 9)
  let shown = rows.length, used = heights.reduce((a2, b2) => a2 + b2, 0)
  if (y + used > bottom) { while (shown > 0 && y + used + 9 > bottom) used -= heights[--shown] }
  for (let k = 0; k < rows.length; k++) {
    const [name, amt, id] = rows[k], lines = wrap(name, nameW(amt))
    if (k >= shown) { text(`+${rows.length - k} more`, P.x + 5, y, HOLO.dim); break }
    if (id) fill(P.x + 5, y + 2, 3, 3, liquidOf(id))
    lines.forEach((l, n) => text(l, P.x + 11, y + n * 9, id === "water" || !id ? HOLO.dim : HOLO.text))
    text(amt, colR, y, HOLO.value, "right"); y += lines.length * 9
  }
  const rowsEnd = rows.length ? y + (shown < rows.length ? 9 : 0) : y + 9
  status.forEach(([t2, col], k) => text(t2, P.x + 5, bottom + k * 9, col))
  // right: the taste profile, one short bar per note, starting after the longest label
  fill(colR + 3, P.y + 20, 1, P.h - 23, "rgba(95,243,232,0.2)")
  const t = r.total > 0.01 ? sim.tasteOf(c) : null, lx = colR + 6, bx = P.x + P.w - 4 - BAR
  SPEC_ROWS.forEach((n, k) => {
    const yy = P.y + 20 + k * 8 + (k >= BASE.length ? 1 : 0), v = t ? t.notes[n] : 0
    text(LABEL[n], lx, yy, v > 0.05 ? HOLO.text : HOLO.dim)
    fill(bx, yy + 3, BAR, 1, HOLO.track)
    const col = FUSED.includes(n) ? FUSED_COLOR[n] : [143, 255, 244], bw = Math.max(1, Math.round(v * BAR / 10))
    if (v > 0.05) { fill(bx, yy + 1, bw, 5, mixRgb(col, [6, 22, 30], 0.3)); fill(bx, yy + 1, bw, 1, col) }
  })
  SCREEN.layout = { colR, leftW, lx, labelW, bx, status, rows: rows.length, rowsBottom: rowsEnd, statusTop: bottom }     // for the layout check in the tests
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
  const y = 44, labels = [["Discoveries", () => { book.open = !book.open; book.t = 0 }], [crowdPick ? CROWDS[crowdPick].name : "Any crowd", cycleCrowd], ["Next guest", nextGuest]]
  let x = 476
  for (const [l, act] of labels) { const w = textW(l) + 10; x -= w; button(l, x, y, act, { w, key: act === cycleCrowd ? "crowd" : l, on: l === "Discoveries" && book.open }); x -= 4 }
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
  fill(x, y, w, h, "rgba(6,22,30,0.97)")
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
  // the story of the bar you point at goes under the bars, whole: the panel grows to fit it
  const story = rowStory(t, spectro.row).split("\n").flatMap((part) => wrap(part, SPEC.w - 16)).slice(0, 8)
  SPEC.h = 168 + story.length * 9 + 2
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
  y = P.y + 162
  fill(P.x + 6, y, P.w - 12, 1, "rgba(95,243,232,0.25)"); y += 4
  for (const l of story) { text(l, P.x + 8, y, HOLO.text); y += 9 }
}
// what's behind a bar, in words: its top three ingredients, then anything hidden or boosted
function rowStory(t, n) {
  if (!n) return "Point at a bar to see what made it."
  const counted = `\nCounted: ${t.counted.map((id) => PLAIN[id]).join(", ")}.`
  if (n === "complexity") return `Complexity counts how many notes stand out clearly: ${t.effectiveNotes.toFixed(1)} here.` + (t.ingredients > 5 ? counted : "")
  if (n === "balance") return (t.drags.length ? "Balance loses: " + t.drags.slice(0, 3).map(([a, why]) => `${why} (-${a.toFixed(1)})`).join(", ") + "." : "Balance is perfect: nothing sticks out.") + (t.ingredients > 5 ? counted : "")
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

// ---------------------------------------------------------------- drawing: discoveries
function drawBook() {
  if (!book.open) return
  const w = 380, P = { x: Math.round((CW - w) / 2) - EXT, y: 30, w, h: 212 }
  holoPanel(P.x, P.y, P.w, P.h, book.t)
  const nPair = PAIRINGS.filter(([name]) => (found.pairings[name] || []).length).length
  const nCombo = FUSED.reduce((s, n) => s + (found.combos[n] || []).length, 0)
  text("DISCOVERIES", P.x + 8, P.y + 5, HOLO.title)
  button("Close", P.x + P.w - 40, P.y + 3, () => (book.open = false), { w: 34, tone: "holo", key: "bookClose" })
  text("Taste or serve drinks to find what combines.", P.x + 8, P.y + 16, HOLO.dim)
  // lay the whole list out first, then draw the part that fits (scroll with the wheel)
  const rows = [], x = P.x + 10, inner = P.w - 22
  const head = (s) => rows.push([s, HOLO.title, 0, 12])
  const row = (s, c, indent = 0) => { for (const l of wrap(s, inner - indent)) rows.push([l, c, indent, 9]) }
  head(`SECRET PAIRINGS  ${nPair} of 3`)
  for (const [name, note, hint] of PAIRINGS) {
    const list = found.pairings[name] || []
    if (!list.length) { row(`??? : extra ${LABEL[note]}`, HOLO.dim); row(`Hint: ${hint}.`, HOLO.dim, 8) }
    else { row(`${name}: extra ${LABEL[note]}`, HOLO.glow); for (const k of list) row(namesOf(k), HOLO.value, 8) }
    rows.push(["", null, 0, 3])
  }
  head(`COMBINED NOTES  ${nCombo} found`)
  for (const n of FUSED) {
    const [a, b] = PARENTS[n], list = found.combos[n] || []
    row(`${LABEL[n]}: when ${LABEL[a]} and ${LABEL[b]} are close to each other`, rgbStr(FUSED_COLOR[n]))
    if (!list.length) row("None found yet", HOLO.dim, 8)
    for (const k of list) row(namesOf(k), HOLO.value, 8)
    rows.push(["", null, 0, 3])
  }
  const top = P.y + 30, bottom = P.y + P.h - 6, total = rows.reduce((s, r) => s + r[3], 0)
  book.max = Math.max(0, total - (bottom - top)); book.scroll = clamp(book.scroll, 0, book.max)
  let y = top - book.scroll
  ctx.save(); ctx.beginPath(); ctx.rect(P.x + 2, top - 2, P.w - 4, bottom - top + 2); ctx.clip()
  for (const [s2, c, indent, h] of rows) { if (c && y > top - 12 && y < bottom) text(s2, x + indent, y, c); y += h }
  ctx.restore()
  if (book.max > 0) { const bh = Math.max(12, (bottom - top) * (bottom - top) / total); fill(P.x + P.w - 5, top + (bottom - top - bh) * book.scroll / book.max, 2, bh, HOLO.edge) }
}
// a small card above whatever the player points at: a title, then a few lines
function tooltip(title, body, cx, bottom) {
  const w = 150, lines = wrap(body, w - 10), h = 16 + lines.length * 9
  const x = clamp(Math.round(cx - w / 2), 4 - EXT, W - 4 - w), y = Math.max(4, bottom - h)
  fill(x, y, w, h, "rgba(20,26,22,0.92)"); frame1(x, y, w, h, "rgba(255,201,74,0.75)")
  text(title, x + 5, y + 4, "#FFC94A")
  lines.forEach((l, i) => text(l, x + 5, y + 14 + i * 9, CREAM))
}
function drawTooltip() {
  if (!hover || S.pressing || S.moving || book.open) return
  if (hover.kind === "bottle") { const b = bottleBox(hover.id); tooltip(ingOf[hover.id].name, DESC[hover.id], b.x + b.w / 2, b.y - 8) }
  else if (hover.kind === "cup") { const cup = S.cups[hover.id]; tooltip(`${CUP_NAME[cup.id]} measuring cup`, `Holds exactly ${CUP_NAME[cup.id].toLowerCase()} part. Click to set it beside the glass, pour a bottle into it, then click it to pick it up and pour the measure. Drag it to move it.`, cup.x, cupBox(cup).y - 4) }
  else if (hover.kind === "activeCup") tooltip("Measuring cup", sim.volOf(S.cups[hover.id].c) > 0.001 ? "Click to pick it up, then hold to pour it." : "Pour a bottle into it, or click to put it away.", S.cups[hover.id].x, cupBox(S.cups[hover.id]).y - 14)
  else if (hover.kind === "tool") {
    const tool = S.tools[hover.id], has = sim.volOf(tool.c) > 0.004
    tooltip(tool.id === "shaker" ? "Shaker" : "Stirring glass", (tool.id === "shaker"
      ? "Shaking chills a drink fast, waters it down more, and knocks out most of the fizz (add soda after). "
      : "Stirring chills a drink gently and keeps it clear and fizzy. ") + (tool.c.ice ? "" : "It needs ice to work: drag or flick some in. ") + "Pour bottles into it, then click to pick it up: move it about to " + (tool.id === "shaker" ? "shake" : "stir") + " it, hold to pour it. Drag it to move it.", tool.x, toolBoxOf(tool).y - 14)
  }
  else if (hover.kind === "screen") tooltip("The screen", "What's in the glass or the tool you're using, and how it tastes right now. Click it for the full breakdown.", SCREEN.x + SCREEN.w / 2 + 40, SCREEN.y + SCREEN.h + 62)
  else if (hover.kind === "ice") tooltip("Ice well", "Drag a cube out and drop it into the glass, shaker or stirring glass, or flick it in. The shaker and stirring glass need ice to chill a drink; in the glass it melts in slowly.", WELL_MID.x + 50, WELL[0][1] - 4)
  else if (hover.kind === "glass" && guest.phase === "asking")
    tooltip("The glass", `The gold MIN mark is the minimum drink amount: ${FILL_LINE} parts. Guests won't take a smaller drink. It holds up to ${MAX_PARTS} parts.` + " Slide it over to the guest to serve it. Click to pick it up and pour it out. Drag it to move it.", glass.cx, glass.top - 4)
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
  MAIN.setTransform(1, 0, 0, 1, EXT, 0)          // everything below is in the scene's own coordinates
  ctx.drawImage(IMG.bg, -EXT, 0)
  drawScreen()
  drawWellHover()
  for (const cup of Object.values(S.cups)) if (cup.state === "home" || cup.state === "toHome") drawCup(cup)
  for (const tool of Object.values(S.tools)) if (tool.state === "home") drawToolHome(tool)
  for (const cup of Object.values(S.cups)) if (cup.state === "carried") drawCup(cup)
  for (const tool of Object.values(S.tools)) if (tool.state === "carried") drawToolHome(tool)
  drawServeZone()
  if (!S.glassHeld) drawGlass()
  for (const cup of Object.values(S.cups)) if (cup.state === "active" || cup.state === "toMeasure") drawCup(cup)
  drawStream()
  drawRail()
  for (const tool of Object.values(S.tools)) if (tool.state !== "home" && tool.state !== "carried" && tool.state !== "hand") drawToolMoving(tool)
  drawLabels()
  drawBubble()
  drawHeld()                           // whatever is in hand stays on top, even over the bubble and the panel
  drawThrown()                         // ice in the air goes over the panels, so a flick can be followed the whole way
  if (!book.open) drawSpectro()
  drawStrip()
  drawBook()
  drawTooltip()
  drawNotice()
}

// ---------------------------------------------------------------- the loop: physics in fixed steps, drawn once a frame
let last = performance.now(), acc = 0
const settle = { key: "", t: 0, done: true }
function update(dt) {
  guest.t += dt; book.t += dt; spectro.t += dt
  // once what's on the screen has stopped changing for a moment, any combination in it counts as found
  const c = focusContents(), key = focus + ":" + sim.volOf(c).toFixed(2) + ":" + [...c.parts.keys()].join()
  if (key !== settle.key) { settle.key = key; settle.t = 0; settle.done = false }
  else if (!settle.done && (settle.t += dt) > 0.6 && !S.pressing && sim.volOf(c) > 0.3) { settle.done = true; noteDiscoveries(sim.tasteOf(c)) }
  if (guest.back < 1) guest.back = Math.min(1, guest.back + dt / 0.4)
  // the guest takes a sip, then says what they think; the spectrograph opens with their arrows on it
  if (guest.phase === "served" && guest.t >= 1.2) {
    guest.phase = "reacting"
    openSpectro("served")
    noteDiscoveries(guest.result.t)
  }
}
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now
  while (acc >= STEP) { sim.step(); update(STEP); acc -= STEP }
  followFocus()
  hover = targetAt(pointer.x, pointer.y)
  if (spectro.open && hover && hover.kind === "spectro") spectro.row = hover.row
  view.style.cursor = S.grab || S.moving ? "grabbing" : S.toolMode ? (pointer.down ? "grabbing" : "grab") : S.held ? (pointer.down ? "grabbing" : hover ? "pointer" : "grab") : hover && hover.kind !== "spectro" && hover.kind !== "modal" ? "pointer" : "default"
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
// a handle for the browser console and the node test harness: the simulation, the guest, and today's buttons
globalThis.pourlab = { sim, guest, spectro, book, SCREEN, textW, get buttons() { return buttons } }
