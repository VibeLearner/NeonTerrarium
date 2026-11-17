// Neon Dome pour lab: drawing and input. The simulation lives in sim.js and the taste model in flavor.js; this file
// draws them at the scene's own 480x270 pixels, scaled up crisply (nearest-neighbor, no blur), and turns clicks and
// holds into actions. It also runs the test guest: they ask in vibe words, you serve, they react.
import { FONT_SMALL } from "./font_small.js"
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
// and a smaller one for the hanging screen (font_small.js); text() and textW() use whichever is current
function glyphs(font) {
  const out = {}
  for (const [ch, s] of Object.entries(font)) {
    const rows = s.split(" ")
    let a = 5, b = -1
    for (const r of rows) for (let x = 0; x < 5; x++) if (r[x] === "#") { a = Math.min(a, x); b = Math.max(b, x) }
    out[ch] = { rows, a, w: b - a + 1 }
  }
  return out
}
const GLYPH_BIG = glyphs(FONT), GLYPH_SMALL = glyphs(FONT_SMALL)
let GLYPH = GLYPH_BIG, SPACE = 3
function useFont(small) { GLYPH = small ? GLYPH_SMALL : GLYPH_BIG; SPACE = small ? 2 : 3 }
function textW(s) { let w = 0; for (const ch of s) w += (ch === " " ? SPACE : (GLYPH[ch] ? GLYPH[ch].w : 3)) + 1; return Math.max(0, w - 1) }
const textWSmall = (s) => { const g = GLYPH; useFont(true); const w = textW(s); useFont(g === GLYPH_SMALL); return w }
function text(s, x, y, color, align = "left") {
  if (align === "right") x -= textW(s); else if (align === "center") x -= Math.round(textW(s) / 2)
  ctx.fillStyle = typeof color === "string" ? color : rgbStr(color)
  x = Math.round(x); y = Math.round(y)
  for (const ch of s) {
    const g = GLYPH[ch]
    if (!g) { x += SPACE + 1; continue }
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
// the bar spoon's handle, sticking up out of the stirring glass: press on it and circle the mouse to stir
// the bar spoon: its holder on the counter, and its handle sticking up out of the glass (press there to stir)
function holderBox() { const h = S.spoon.home; return { x: h.x - 8, y: h.y - 36, w: 16, h: 37 } }
function spoonGlassBox() { return { x: glass.cx - 3, y: glass.top - 17, w: 18, h: glass.rimY + 3 - (glass.top - 17) } }
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
  guest.phase = "asking"; guest.t = 0; guest.result = null; guest.saved = false
}
newGuest(); guest.back = 1
function nextGuest() {
  closeSpectro()
  if (guest.phase !== "asking") { sim.emptyGlass(); guest.back = 0 }   // the empty glass slides back from the guest
  newGuest()
}
function serve() {
  if (guest.phase !== "asking") return
  if (sim.total() < FILL_LINE - 0.05) { sim.say(`Pour at least the minimum drink amount first: ${FILL_LINE} parts, the lights on the glass turn green.`); return }
  dropHeld()
  if (S.toolMode) sim.putToolDown()
  sim.homeSpoon()
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
const book = { open: false, t: 0, page: [0, 0], flash: [0, 0], wheel: 0 }

// ---------------------------------------------------------------- recipes: drinks saved after a guest has tasted them
const RECIPE_KEY = "neonDome.recipes.v1"
let recipes = []
try { recipes = JSON.parse(globalThis.localStorage?.getItem(RECIPE_KEY) || "[]") } catch {}
function saveRecipe() {
  if (!guest.result || guest.saved) return
  const r = sim.readout(), c = S.glass
  const items = r.rows.filter((row) => row.id !== "water" && (row.parts >= 0.04 || row.dashes)).map((row) => row.dashes ? [row.id, 0, row.dashes] : [row.id, +row.parts.toFixed(2), 0])
  const rec = { no: recipes.length ? recipes[recipes.length - 1].no + 1 : 1, crowd: guest.g.crowdName, tier: guest.result.s.tier, score: Math.round(guest.result.s.score),
    color: sim.srgb(sim.compColor(c.parts)), items, ice: r.ice, method: c.log.length ? logText(c.log) : "Built in the glass", total: +r.total.toFixed(2) }
  recipes.push(rec); guest.saved = true
  try { globalThis.localStorage?.setItem(RECIPE_KEY, JSON.stringify(recipes)) } catch {}
  book.page[1] = recipes.length - 1
  sim.say(`Saved to your book as No. ${rec.no}.`)
}

const pairKey = (ids) => [...new Set(ids)].sort().join("+")
function noteDiscoveries(t) {
  if (!t) return
  const fresh = []
  for (const d of t.discoveries) {
    const list = (found.pairings[d.name] ||= []), k = pairKey(d.ids)
    if (!list.includes(k)) { list.push(k); fresh.push(`${namesOf(k)} = ${LABEL[d.note]}`) }
  }
  for (const n of FUSED) {
    if (t.notes[n] < COMBO_MIN) continue
    const ids = PARENTS[n].map((p) => (t.contrib[p][0] || [])[0]).filter(Boolean)
    const list = (found.combos[n] ||= []), k = pairKey(ids)
    if (ids.length && !list.includes(k)) { list.push(k); fresh.push(`${namesOf(k)} = ${LABEL[n]}`) }
  }
  if (!fresh.length) return
  try { globalThis.localStorage?.setItem(BOOK_KEY, JSON.stringify(found)) } catch {}
  sim.say(fresh.length === 1 ? `New in your book: ${fresh[0]}` : `${fresh.length} new finds in your book.`)
}
// the book's short names: the words on the rail tapes
const BOOK_NAME = { rice: "Rice", rye: "Rye", rum: "Rum", coffee: "Coffee", yuzu: "Yuzu", ume: "Ume", lemongrass: "Lemongrass",
  glow: "Glow", ginger: "Ginger", shiso: "Shiso", soda: "Soda", bitters: "Bitters", chili: "Chili" }
const namesOf = (k) => k.split("+").map((id) => BOOK_NAME[id] || SHORT[id]).join(" + ")

// ---------------------------------------------------------------- the spectrograph: what the drink tastes like
// A hologram that slides down over the scene: one bar per note, built from each ingredient's share, with what was
// hidden (masked) as a hollow piece and what was boosted (carried) as a glowing piece; Complexity and Balance as dials.
const SPEC = { x: 6 - EXT, y: 28, w: 262, h: 196 }
const spectro = { open: false, t: 0, src: "glass", taste: null, row: null }
function openSpectro(src) { spectro.open = true; spectro.t = 0; spectro.src = src; spectro.row = null; if (src !== "served") noteDiscoveries(spectroTaste()) }
function closeSpectro() { spectro.open = false }
function spectroTaste() {
  if (spectro.src === "served") return guest.result && guest.result.t
  return sim.tasteOf(drinkContents())
}
// what the taste profile shows: the glass, unless everything is still in the shaker (then the shaker). When the
// ingredients are split between the two, only the glass's taste is shown.
function drinkContents() {
  const g = S.glass, sh = S.tools.shaker && S.tools.shaker.c
  return sh && sim.volOf(g) < 0.004 && sim.volOf(sh) >= 0.004 ? sh : g
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
    const dial = x >= SPEC.x + 186 ? (y >= SPEC.y + 96 && y < SPEC.y + 160 ? "balance" : null) : null
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
  if (!S.held && S.spoon.state === "glass" && inBox(x, y, spoonGlassBox())) return { kind: "spoon" }
  if (!S.held && S.spoon.state === "home" && inBox(x, y, holderBox())) return { kind: "spoonHome" }
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
let pending = null, stirPress = null
// a second click on the same glass or tool soon after the first empties it (the first click picked it up: it goes
// straight back down, empty)
const DOUBLE_MS = 400, NAMES = { glass: "the glass", shaker: "the shaker" }
let lastClick = null
function doubleClick(e, p) {
  const lc = lastClick; lastClick = null
  if (!lc || e.timeStamp - lc.t > DOUBLE_MS || Math.hypot(p.x - lc.x, p.y - lc.y) > 6) return false
  const id = lc.id
  if (S.held && (S.held.kind === "glass" || (S.held.kind === "tool" && S.held.id === id))) { if (S.held.kind === "glass") sim.dropGlass(); else sim.putBack(null) }
  if (sim.emptyVessel(id)) sim.say(`Emptied ${NAMES[id]}.`)
  return true
}
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
  if (e.button === 0 && doubleClick(e, p)) return
  if (t && t.kind === "ice") { sim.grabIce(p.x, p.y, e.timeStamp / 1000); return }      // a cube from the well, to drag or flick
  if (S.toolMode) { sim.press(true); return }                     // hold anywhere to shake or stir
  if (t && t.kind === "bottle") {
    dropHeld()                                                     // swap: the one in hand goes straight back
    sim.pick(t.id, railTip(t.id)); const a = clampAim(p); sim.aim(a.x, a.y)
  } else if (t && t.kind === "rail") putBackHeld()
  else if (t && t.kind === "spoon") { if (sim.startStir(p.x, p.y)) stirPress = { t: e.timeStamp, x: p.x, y: p.y } }
  else if (t && t.kind === "spoonHome") sim.placeSpoon()
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
  if (S.stirring) sim.stirAt(p.x, p.y)
  if (S.grab) sim.moveIce(clamp(p.x, 2, W - 2), clamp(p.y, 2, H - 2), e.timeStamp / 1000)
  if (pending && !pending.moving && Math.hypot(p.x - pending.x, p.y - pending.y) > 3)
    pending.moving = sim.startMove(MOVABLE[pending.t.kind], pending.t.id || "glass", pending.x, pending.y)
  if (pending && pending.moving) sim.dragTo(p.x, p.y)
})
const release = (e, cancelled = false) => {
  if (S.stirring) {
    // a quick click on the spoon (no circling) takes it out of the glass and back to its holder
    const p = toScene(e), sp = stirPress; stirPress = null; pointer.down = false
    if (sp && !cancelled && e.timeStamp - sp.t < 250 && Math.hypot(p.x - sp.x, p.y - sp.y) < 4) sim.homeSpoon(); else sim.endStir()
    return
  }
  if (pending) {
    const pd = pending; pending = null; pointer.down = false
    if (pd.moving) { const toGuest = pd.t.kind === "glass" && !cancelled && overServe(); sim.endMove(); if (toGuest) serve() }
    else if (!cancelled) { clickThing(pd.t); if (pd.t.kind === "glass" || pd.t.kind === "tool") lastClick = { id: pd.t.id || "glass", t: e.timeStamp, x: pd.x, y: pd.y } }
    return
  }
  pointer.down = false; if (S.grab) { sim.releaseIce(e.timeStamp / 1000); return } if (S.toolMode || (S.held && S.held.kind !== "dasher")) sim.press(false) }
view.addEventListener("pointerup", release)
view.addEventListener("pointercancel", (e) => release(e, true))
view.addEventListener("pointerleave", () => { pointer.x = -99; pointer.y = -99 })
view.addEventListener("wheel", (e) => {
  if (book.open) {
    e.preventDefault()
    // the wheel turns the page under the pointer, a page per notch
    book.wheel += e.deltaY
    const side = toScene(e).x < READER.x + READER.w / 2 ? 0 : 1
    while (Math.abs(book.wheel) >= 60) { const d = Math.sign(book.wheel); turnPage(side, d); book.wheel -= d * 60 }
    return
  }
  const p = toScene(e)
  if (!spectro.open && inBox(p.x, p.y, SCREEN)) {
    e.preventDefault()
    // a row per notch of a mouse wheel; a trackpad's many small nudges add up to a row
    listScroll.wheel += e.deltaY
    while (Math.abs(listScroll.wheel) >= 30) { const d = Math.sign(listScroll.wheel); listScroll.target += d * 8; listScroll.wheel -= d * 30 }
  }
}, { passive: false })
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
  const cx = left + tool.cx, base = top + tool.top + tool.ryT + L.vessels[tool.id].h - 6, a = tool.spoonA ?? tool.stir * 9
  const bx = cx + Math.cos(a) * 7, by = base + Math.sin(a) * 2, tx = cx + 4 + Math.cos(a) * 2, ty = top + 1
  line(bx, by, tx, ty, "#DCE6EC"); line(bx + 1, by, tx + 1, ty, "#8A98A2")
  fill(tx - 1, ty - 1, 4, 2, "#C9D3DA"); fill(bx - 1, by, 3, 2, "#C9D3DA")
}
// the bar spoon: a long twisted steel handle with a small disc on top and a little bowl at the bottom
function spoonLine(x0, y0, x1, y1, surf) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
  for (let k = 0; k <= n; k++) {
    const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n)
    ctx.globalAlpha = surf !== undefined && y > surf ? 0.55 : 1          // seen through the drink below its surface
    px(x, y, k % 4 === 0 ? "#8A98A2" : "#DCE6EC"); px(x + 1, y, "#6E7C86")
  }
  ctx.globalAlpha = 1
}
function spoonKnob(x, y) { fill(x - 1, y - 1, 4, 2, "#C9D3DA"); px(x - 1, y - 1, "#F2F7F9") }
// in the glass: the bowl circles near the bottom as you stir, the handle leans out over the rim
function drawGlassSpoon() {
  if (S.spoon.state !== "glass") return
  const a = S.spoon.a, by = glass.bottomY - 3, [il, ir] = glass.inner(by), r = Math.max(2, (ir - il) / 2 - 3)
  const bx = glass.cx + Math.cos(a) * r, byy = by + Math.sin(a) * 1.5, tx = glass.cx + 5 + Math.cos(a) * 2, ty = glass.top - 14
  const surf = sim.total() > 0.05 ? sim.surfaceY() : undefined
  spoonLine(tx, ty, bx, byy, surf)
  ctx.globalAlpha = surf !== undefined ? 0.6 : 1; fill(bx - 1, byy, 3, 2, "#C9D3DA"); ctx.globalAlpha = 1
  spoonKnob(tx, ty)
  if (hover && hover.kind === "spoon" && !S.stirring) frame1(Math.round(tx) - 3, ty - 3, 8, 6, "#FFC94A")
}
// at home: standing in a small steel tin on the counter
function drawHolder() {
  const h = S.spoon.home, x = Math.round(h.x), y = Math.round(h.y), hov = hover && hover.kind === "spoonHome"
  drawShadow(x, y - 2, 7, 2, 0.4)
  if (S.spoon.state === "home") {
    if (hov) { spoonLineGold(x + 1, y - 10, x + 3, y - 33) }
    spoonLine(x + 1, y - 10, x + 3, y - 33); spoonKnob(x + 3, y - 33)
  }
  if (hov) frame1(x - 7, y - 15, 15, 16, "#FFC94A")
  fill(x - 6, y - 13, 13, 13, "#56666E"); fill(x - 5, y - 13, 2, 13, "#93A6AC"); fill(x + 5, y - 13, 2, 13, "#2E3A44")
  fill(x - 6, y - 14, 13, 2, "#D8E4E2"); fill(x - 5, y - 13, 11, 1, "#2E3A44")
  fill(x - 6, y - 1, 13, 1, "#2E3A44")
}
function spoonLineGold(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
  for (let k = 0; k <= n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n); fill(x - 1, y, 4, 1, "#FFC94A") }
  fill(x1 - 2, y1 - 2, 6, 4, "#FFC94A")
}
function drawToolHome(tool) {
  const b = toolBoxOf(tool), img = IMG[tool.id], ryB = Math.max(2, Math.round(tool.rb * K)), carried = tool.state === "carried"
  drawShadow(tool.x, tool.y - 1 - ryB, tool.rb + 1, ryB, carried ? 0.25 : 0.4)
  if (carried) b.y -= 5; else drawReflection(img, b.x, tool.y)
  if (hover && (hover.kind === "tool" || hover.kind === "spoon") && hover.id === tool.id && !S.stirring) ctx.drawImage(OUTLINE[tool.id], b.x - 1, b.y - 1)
  if (tool.id === "mixing_glass") drawMixLiquid(tool, b.x, b.y)
  // being stirred: the spoon turns with the circles you make
  if (S.stirring && S.stirring.id === tool.id) { drawSpoon(tool, b.x, b.y); ctx.drawImage(IMG.mixing_glass_bare, b.x, b.y) }
  else ctx.drawImage(img, b.x, b.y)
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
// the minimum drink amount: a small light on each side of the glass at that height, red until there's enough, then green
function drawFillLine() {
  const y = Math.round(glass.bottomY - FILL_LINE * glass.ppp), [il, ir] = glass.inner(y)
  const ok = sim.total() >= FILL_LINE - 0.05
  const [core, glow] = ok ? ["#7CFFA0", "#2E9A58"] : ["#FF5A6E", "#9A2E44"]
  for (const x of [il - 5, ir + 3]) {
    ctx.globalAlpha = 0.45; ctx.fillStyle = glow; ctx.fillRect(x - 1, y - 2, 4, 4)
    ctx.globalAlpha = 1; ctx.fillStyle = core; ctx.fillRect(x, y - 1, 2, 2)
  }
}
// the glass and everything in it is painted on its own layer, so it can slide across to the guest and shrink a
// little with distance while staying crisp (scaled pixel for pixel, never blurred)
const glassLayer = document.createElement("canvas"); glassLayer.width = W; glassLayer.height = H
const GCTX = glassLayer.getContext("2d"); GCTX.imageSmoothingEnabled = false
function drawGlass() {
  const pose = glassPose(), h = S.held && S.held.kind === "glass" ? S.held : null
  ctx = GCTX; ctx.clearRect(0, 0, W, H)
  drawLiquid(); drawIce(); drawGlassSpoon(); ctx.drawImage(IMG.glass, glass.left, glass.top)
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
  // one tag over each tool; when two tools stand close, the second tag goes up a row so they never overlap
  const placed = []
  for (const tool of Object.values(S.tools)) if (tool.state === "home" && (sim.volOf(tool.c) > 0.05 || tool.c.ice)) {
    const v = sim.volOf(tool.c), bits = []
    if (v > 0.05) bits.push(`${v.toFixed(2)} parts`)
    bits.push(tool.c.ice ? `${tool.c.ice} ice` : "no ice")
    const str = bits.join(", "), w = textW(str) + 6, cx = clamp(tool.x, w / 2 + 2, W - w / 2 - 2)
    let y = toolBoxOf(tool).y - 11
    while (placed.some((p) => cx - w / 2 < p.x1 + 2 && cx + w / 2 > p.x0 - 2 && y < p.y + 11 && y + 10 > p.y - 1)) y -= 11
    placed.push({ x0: cx - w / 2, x1: cx + w / 2, y })
    tag(str, cx, y, tool.c.ice ? CREAM : "#E9A08A")
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
const SCREEN = { x: 4, y: 43, w: 260, h: 109 }   // under the shelf and the DRINKS sign, left of the guest buttons
// tiny 3x4 letters for the SHKR tag on the screen (much smaller than the screen's own font)
const MICRO = { S: [".##", "#..", "..#", "##."], H: ["#.#", "###", "#.#", "#.#"], K: ["#.#", "##.", "##.", "#.#"], R: ["##.", "#.#", "##.", "#.#"] }
const microW = (str) => str.length * 4 - 1
function micro(str, x, y, col) {
  ctx.fillStyle = col
  ;[...str].forEach((ch, i) => (MICRO[ch] || []).forEach((row, r) => [...row].forEach((v, k) => { if (v === "#") ctx.fillRect(x + i * 4 + k, y + r, 1, 1) })))
}
const listScroll = { y: 0, target: 0, focus: null, ids: [], bar: false, wheel: 0 }
// the scroll bar sits on the divider between the list and the profile: a track, a bright thumb, an arrow at each end
function scrollArrows(x, top, area, off, max, used) {
  listScroll.bar = true
  const P = SCREEN, up = { x: x - 3, y: P.y + 19, w: 7, h: 6 }, dn = { x: x - 3, y: top + area - 5, w: 7, h: 6 }
  const t0 = up.y + up.h + 1, t1 = dn.y - 1, len = t1 - t0
  fill(x, t0, 1, len, "rgba(95,243,232,0.2)")
  const th = Math.max(6, Math.round(len * area / used)), ty = t0 + Math.round((len - th) * off / max)
  fill(x - 1, ty, 3, th, "rgba(95,243,232,0.75)")
  for (const [b, dir, can] of [[up, -1, off > 0], [dn, 1, off < max]]) {
    const col = can ? (hover && hover.kind === "button" && hover.key === "scroll" + dir ? HOLO.value : "rgba(95,243,232,0.8)") : "rgba(95,243,232,0.25)"
    for (let r = 0; r < 3; r++) { const yy = dir < 0 ? b.y + 1 + r : b.y + 3 - r; fill(b.x + 3 - r, yy, 1 + r * 2, 1, col) }
    if (can) buttons.push({ ...b, key: "scroll" + dir, act: () => { listScroll.target += dir * 2 * LH } })
  }
}
function drawScreen() {
  useFont(true)
  try { drawScreenBody() } finally { useFont(false) }
}
const LH = 8                      // the screen's line pitch, in its small font
function drawScreenBody() {
  const P = SCREEN, free = !S.held && !S.grab && !S.moving && guest.phase === "asking"
  // the two cables up to the shelf, then the bezel
  for (const cx of [P.x + 24, P.x + 200]) { fill(cx, 33, 1, P.y - 33, "#2A2F35"); fill(cx + 1, 33, 1, P.y - 33, "#4A525A") }
  fill(P.x - 2, P.y - 2, P.w + 4, P.h + 4, "#1B1F24"); frame1(P.x - 2, P.y - 2, P.w + 4, P.h + 4, "#3A4048")
  fill(P.x, P.y, P.w, P.h, "rgba(6,22,30,0.94)")
  for (let yy = P.y + 1; yy < P.y + P.h; yy += 2) fill(P.x, yy, P.w, 1, "rgba(95,243,232,0.03)")
  // one list for the whole drink: the glass, and anything still in the shaker (tagged SHKR)
  const r = sim.readout(), sh = S.tools.shaker, sc = sh.c, rs = sim.readout(sc), inShaker = rs.total > 0.004 || sc.ice > 0
  const c = S.glass, tool = null
  text("THE DRINK", P.x + 5, P.y + 6, HOLO.title)
  const room = P.x + P.w - 4 - (P.x + 5 + textW("THE DRINK") + 8)
  const gl = [`${r.total.toFixed(2)} of ${MAX_PARTS} parts`, `${r.total.toFixed(2)} / ${MAX_PARTS}`]
  const totals = inShaker && rs.total > 0.004 ? [`${gl[0]} + ${rs.total.toFixed(2)} SHKR`, `${gl[1]} + ${rs.total.toFixed(2)} SHKR`, gl[1]] : gl
  text(totals.find((t2) => textW(t2) <= room) || totals[totals.length - 1], P.x + P.w - 4, P.y + 6, HOLO.text, "right")
  fill(P.x + 3, P.y + 17, P.w - 6, 1, "rgba(95,243,232,0.3)")
  // the columns, measured from the text itself: the taste profile on the right is as wide as its longest label plus
  // a bar; the contents on the left get the rest
  const labelW = Math.max(...SPEC_ROWS.map((n) => textW(LABEL[n]))), BAR = 50, valW = textW("10.0")
  const colR = P.x + P.w - 4 - valW - 4 - BAR - 4 - labelW - 9   // the left column's right edge
  const leftW = colR - (P.x + 5)                            // room for text in the left column
  // status lines under the contents, wrapped to the column so they never run into the profile
  const status = []
  const say2 = (str, col) => { for (const l of wrap(str, leftW)) status.push([l, col]) }
  if (inShaker) {
    if (!sc.ice) say2("Shaker: no ice", "#FF8AA8")
    else if (rs.total > 0.004) say2(sc.techT > 0.05 ? `Shaker: shaken ${sc.techT.toFixed(1)} s` : "Shaker: not shaken yet", sh.working ? "#FFC94A" : HOLO.dim)
  }
  if (guest.phase === "asking") {
    if (r.full) say2("Full to the rim", "#FF8AA8")
    if (S.spoon.state === "glass" || c.stirT > 0.05) {
      if (S.spoon.state === "glass" && !r.ice) say2("No ice: it stays warm", "#FF8AA8")
      say2(c.stirT > 0.05 ? `Stirred ${c.stirT.toFixed(1)} s` : "Not stirred yet", S.spoon.working ? "#FFC94A" : HOLO.dim)
      if (c.stirT > 0.05) say2(`Cold ${r.chill.toFixed(1)}, ${Math.round(r.dilution * 100)}% melted`, HOLO.dim)
    }
  }
  const bottom = P.y + P.h - 3 - status.length * LH
  listScroll.bar = false
  // left: what's in it; a long name wraps under itself, its amount stays on the first line
  let y = P.y + 21
  const toRows = (rd, ice, tag) => {
    const out = rd.rows.filter((row) => row.parts >= 0.04 || row.dashes).map((row) => [row.name, row.dashes ? `${row.dashes} dash${row.dashes > 1 ? "es" : ""}` : row.parts.toFixed(2), row.id, tag])
    if (ice) out.push(["Ice", `${ice} cube${ice > 1 ? "s" : ""}`, null, tag])
    return out
  }
  const rows = [...toRows(r, r.ice, false), ...(inShaker ? toRows(rs, sc.ice, true) : [])]
  if (!rows.length) text("Empty", P.x + 5, y, HOLO.dim)
  // every row is measured; when they don't all fit between the tabs and the status lines, the list scrolls (mouse
  // wheel over the screen, or the little arrows), the divider beside it shows where you are, and a new ingredient
  // scrolls itself into view
  // a shaker row carries a bracketed SHKR tag just left of its amount
  const TAG = "SHKR", tagW = microW(TAG) + 6
  const nameW = (amt, tag) => colR - (P.x + 11) - textW(amt) - 5 - (tag ? tagW + 3 : 0)
  const heights = rows.map(([name, amt, , tag]) => wrap(name, nameW(amt, tag)).length * LH)
  const top = y, area = Math.floor((bottom - 2 - top) / LH) * LH, used = heights.reduce((a2, b2) => a2 + b2, 0), max = Math.max(0, used - area)
  const ids = rows.map((row) => row[0] + (row[3] ? "|SHKR" : ""))
  const added = ids.findIndex((n) => !listScroll.ids.includes(n))
  if (added >= 0) {
    const at = heights.slice(0, added).reduce((a2, b2) => a2 + b2, 0)
    if (at < listScroll.target) listScroll.target = at; else if (at + heights[added] > listScroll.target + area) listScroll.target = at + heights[added] - area
  }
  listScroll.ids = ids
  listScroll.target = clamp(Math.round(listScroll.target / LH) * LH, 0, max)     // it rests on whole rows
  listScroll.y += (listScroll.target - listScroll.y) * 0.35
  if (Math.abs(listScroll.target - listScroll.y) < 0.5) listScroll.y = listScroll.target
  const off = Math.round(listScroll.y)
  ctx.save(); ctx.beginPath(); ctx.rect(P.x + 1, top - 1, colR - P.x + 1, area + 1); ctx.clip()
  y = top - off
  for (let k = 0; k < rows.length; k++) {
    const [name, amt, id, tag] = rows[k], lines = wrap(name, nameW(amt, tag))
    if (y + lines.length * LH > top - LH && y < top + area) {
      if (id) fill(P.x + 5, y + 2, 3, 3, liquidOf(id))
      lines.forEach((l, n) => text(l, P.x + 11, y + n * LH, id === "water" || !id ? HOLO.dim : HOLO.text))
      text(amt, colR, y, HOLO.value, "right")
      if (tag) {
        const tx = colR - textW(amt) - 4 - tagW, col = "#FFC94A"
        fill(tx, y, 1, 6, col); fill(tx, y, 2, 1, col); fill(tx, y + 5, 2, 1, col)                               // [
        fill(tx + tagW - 1, y, 1, 6, col); fill(tx + tagW - 2, y, 2, 1, col); fill(tx + tagW - 2, y + 5, 2, 1, col)   // ]
        micro(TAG, tx + 3, y + 1, col)
      }
    }
    y += lines.length * LH
  }
  ctx.restore()
  if (max > 0) {
    // fades at the cut edges, so a half-hidden row reads as "more this way"
    if (off > 0) fill(P.x + 1, top - 1, colR - P.x, 2, "rgba(6,22,30,0.9)")
    if (off < max) fill(P.x + 1, top + area - 2, colR - P.x, 2, "rgba(6,22,30,0.9)")
    scrollArrows(colR + 4, top, area, off, max, used)
  }
  const rowsEnd = rows.length ? Math.min(top + used, top + area) : top + LH
  status.forEach(([t2, col], k) => text(t2, P.x + 5, bottom + k * LH, col))
  // right: the taste profile, a row per note (the divider is drawn here unless the list's scroll bar took its place): label, a bar built from what each ingredient gives (in its color), the value
  if (!listScroll.bar) fill(colR + 4, P.y + 19, 1, P.h - 21, "rgba(95,243,232,0.2)")
  const dc = drinkContents(), t = sim.volOf(dc) > 0.01 ? sim.tasteOf(dc) : null, lx = colR + 9, bx = lx + labelW + 4, vx = P.x + P.w - 4
  SPEC_ROWS.forEach((n, k) => {
    const yy = P.y + 19 + k * LH, v = t ? t.notes[n] : 0, on = v > 0.05
    text(LABEL[n], lx, yy, on ? HOLO.text : HOLO.dim)
    fill(bx, yy + 3, BAR, 1, HOLO.track)
    for (let q = 0; q <= 10; q += 5) fill(bx + q * BAR / 10, yy + 2, 1, 3, HOLO.track)
    if (on) {
      const segs = FUSED.includes(n) ? [[FUSED_COLOR[n], v]] : (() => { const tot = t.contrib[n].reduce((a2, [, x2]) => a2 + x2, 0) || 1; return t.contrib[n].map(([id, x2]) => [mixRgb(liquidOf(id), [200, 255, 250], 0.4), v * x2 / tot]) })()
      let acc = 0, px0 = bx
      for (const [col, part] of segs) {
        acc += part; const end = Math.round(bx + Math.min(10, acc) * BAR / 10)
        if (end > px0) { fill(px0, yy + 1, end - px0, 5, mixRgb(col, [6, 22, 30], 0.15)); fill(px0, yy + 1, end - px0, 1, mixRgb(col, [255, 255, 255], 0.4)) }
        px0 = Math.max(px0, end)
      }
    }
    text(on ? v.toFixed(1) : "0", vx, yy, on ? HOLO.value : HOLO.dim, "right")
  })
  SCREEN.layout = { colR, leftW, lx, labelW, bx, barEnd: bx + BAR, valLeft: vx - valW, status, rows: rows.length, rowsBottom: rowsEnd, statusTop: bottom }     // for the layout check in the tests
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
  const y = 44, labels = [["Book", () => { book.open = !book.open; book.t = 0; book.flash = [0, 0] }], [crowdPick ? CROWDS[crowdPick].name : "Any crowd", cycleCrowd], ["Next guest", nextGuest]]
  let x = 476
  for (const [l, act] of labels) { const w = textW(l) + 10; x -= w; button(l, x, y, act, { w, key: act === cycleCrowd ? "crowd" : l, on: l === "Book" && book.open }); x -= 4 }
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
  const what = served ? "THE SERVED DRINK" : drinkContents() === S.glass ? "TASTE: THE GLASS" : "TASTE: THE SHAKER"
  text(what, P.x + 8, P.y + 5, HOLO.title)
  button("Close", P.x + P.w - 40, P.y + 3, closeSpectro, { w: 34, tone: "holo" })
  // once the guest has tasted it, the drink can be saved to the book as a recipe card
  if (served) { const l = guest.saved ? "Saved" : "Save recipe", w = textW(l) + 10; button(l, P.x + P.w - 44 - w, P.y + 3, saveRecipe, { w, tone: "holo", key: "saveRecipe", on: guest.saved }) }
  const c = served ? S.glass : drinkContents()
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

// ---------------------------------------------------------------- drawing: discoveries
// ---------------------------------------------------------------- the book: a two-screen e-reader
// Left screen: what you've found, one line each ("Coffee + Ginger = Toasted"; a star marks a secret pairing, the
// ones still hidden read "? + ? = Depth"). Right screen: saved recipes, a card a page. E-ink: pale paper, dark ink,
// a quick black flash when a page changes.
const READER = { x: 40, y: 24, w: 400, h: 222 }
const EINK = "#1F2622", INK2 = "#5A6458", INK3 = "#8E978A", PAPER = "#C8D0C0"
const BOOK_LH = 11
const inkOf = (n) => rgbStr(mixRgb(FUSED_COLOR[n], [31, 38, 34], 0.45))
function pageBoxes() {
  const D = READER, pw = (D.w - 16 - 12) / 2
  return [{ x: D.x + 8, y: D.y + 15, w: pw, h: D.h - 25 }, { x: D.x + 8 + pw + 12, y: D.y + 15, w: pw, h: D.h - 25 }]
}
function bookEntries() {
  const out = []
  for (const n of FUSED) {
    const secret = PAIRINGS.find(([, note]) => note === n), sk = found.pairings[secret[0]] || []
    const keys = [...new Set([...sk, ...(found.combos[n] || [])])]
    for (const k of keys) out.push({ k, n, star: sk.includes(k) })
  }
  for (const [name, n] of PAIRINGS) if (!(found.pairings[name] || []).length) out.push({ k: null, n, star: true })
  return out
}
const findsPerPage = () => Math.floor((pageBoxes()[0].h - 36) / BOOK_LH)
function bookPages(side) {
  if (side === 1) return Math.max(1, recipes.length)
  return Math.max(1, Math.ceil(bookEntries().length / findsPerPage()))
}
function turnPage(side, d) {
  const n = bookPages(side), p = clamp(book.page[side] + d, 0, n - 1)
  if (p !== book.page[side]) { book.page[side] = p; book.flash[side] = 0.14 }
}
function roundFill(x, y, w, h, col) { fill(x + 2, y, w - 4, h, col); fill(x + 1, y + 1, w - 2, h - 2, col); fill(x, y + 2, w, h - 4, col) }
function star(x, y, col) { fill(x + 1, y, 1, 3, col); fill(x, y + 1, 3, 1, col) }
function drawBook() {
  if (!book.open) return
  for (const k of [0, 1]) book.flash[k] = Math.max(0, book.flash[k] - 1 / 60)
  const D = READER, [LP, RP] = pageBoxes()
  // the case: dark metal, a pink neon strip along the top, a cyan one along the bottom
  ctx.globalAlpha = 0.55; fill(-EXT, 0, CW, H, "#06080A"); ctx.globalAlpha = 1
  roundFill(D.x - 1, D.y - 1, D.w + 2, D.h + 2, "#3A4048")
  roundFill(D.x, D.y, D.w, D.h, "#15181C")
  fill(D.x + 6, D.y, D.w - 12, 1, "#FF4FC8"); fill(D.x + 6, D.y + D.h - 1, D.w - 12, 1, "#38E8E0")
  // the status bar on the case: a name, a battery, the close button
  useFont(true)
  text("DOME//READER", D.x + 9, D.y + 4, "#5FA8A8")
  const bx = D.x + D.w - 44; frame1(bx, D.y + 4, 11, 6, "#5FA8A8"); fill(bx + 11, D.y + 6, 1, 2, "#5FA8A8"); fill(bx + 2, D.y + 6, 6, 2, "#38E8E0")
  useFont(false)
  const cb = { x: D.x + D.w - 27, y: D.y + 2, w: 19, h: 11, key: "bookClose", act: () => (book.open = false) }
  const ch = hover && hover.kind === "button" && hover.key === "bookClose"
  fill(cb.x, cb.y, cb.w, cb.h, ch ? "rgba(255,79,200,0.35)" : "rgba(255,79,200,0.12)"); frame1(cb.x, cb.y, cb.w, cb.h, "#FF4FC8")
  for (let k = 0; k < 5; k++) { fill(cb.x + 7 + k, cb.y + 3 + k, 1, 1, "#FFC2EC"); fill(cb.x + 11 - k, cb.y + 3 + k, 1, 1, "#FFC2EC") }
  buttons.push(cb)
  // the hinge between the two screens
  const hx = LP.x + LP.w + 2
  fill(hx, LP.y, 8, LP.h, "#0E1013"); fill(hx + 3, LP.y + 2, 2, LP.h - 4, "#262B31")
  for (const yy of [LP.y + 20, LP.y + LP.h - 24]) { fill(hx + 1, yy, 6, 4, "#3A4048"); fill(hx + 2, yy + 1, 4, 1, "#56666E") }
  fill(hx + 3, Math.round(LP.y + LP.h / 2 - 1), 2, 2, "#38E8E0")
  // the screens: an e-ink flash when the book opens or a page turns, then the page
  const opening = book.t < 0.12
  for (const [k, P] of [[0, LP], [1, RP]]) {
    if (opening || book.flash[k] > 0.07) { fill(P.x, P.y, P.w, P.h, EINK); continue }
    fill(P.x, P.y, P.w, P.h, PAPER)
    for (let yy = P.y + 1; yy < P.y + P.h; yy += 3) fill(P.x, yy, P.w, 1, "rgba(31,38,34,0.035)")
    if (book.flash[k] > 0) { ctx.globalAlpha = 0.5; fill(P.x, P.y, P.w, P.h, INK3); ctx.globalAlpha = 1 }
    if (k === 0) drawFinds(P); else drawRecipe(P)
  }
}
// a page's header, and its footer with the page turners
function pageFrame(P, side, title, count) {
  text(title, P.x + 7, P.y + 6, EINK)
  useFont(true)
  if (count) text(count, P.x + P.w - 7, P.y + 7, INK2, "right")
  fill(P.x + 6, P.y + 16, P.w - 12, 1, INK2)
  const n = bookPages(side), pg = book.page[side] = clamp(book.page[side], 0, n - 1), fy = P.y + P.h - 11
  if (n > 1) {
    text(`${pg + 1} / ${n}`, P.x + P.w / 2, fy + 2, INK2, "center")
    for (const [d, x] of [[-1, P.x + 6], [1, P.x + P.w - 18]]) {
      const can = pg + d >= 0 && pg + d < n, key = `page${side}${d}`, hov = hover && hover.kind === "button" && hover.key === key
      if (hov && can) fill(x, fy, 12, 10, "rgba(31,38,34,0.12)")
      for (let r = 0; r < 4; r++) fill(d < 0 ? x + 4 + r : x + 7 - r, fy + 4 - r, 1, 1 + r * 2, can ? EINK : INK3)
      if (can) buttons.push({ x, y: fy, w: 12, h: 10, key, act: () => turnPage(side, d) })
    }
  }
  useFont(false)
}
function drawFinds(P) {
  const all = bookEntries(), known = all.filter((e) => e.k).length, per = findsPerPage()
  pageFrame(P, 0, "DISCOVERIES", known ? `${known} found` : "")
  useFont(true)
  const list = all.slice(book.page[0] * per, book.page[0] * per + per)
  let y = P.y + 23
  if (!known) { text("Nothing yet.", P.x + P.w / 2, y, INK2, "center"); y += BOOK_LH + 4 }
  for (const e of list) {
    let x = P.x + 9
    const put = (str, col) => { text(str, x, y, col); x += textW(str) + 3 }
    const names = e.k ? e.k.split("+").map((id) => BOOK_NAME[id]) : ["?", "?"]
    names.forEach((nm, i) => { if (i) put("+", INK3); put(nm, e.k ? EINK : INK3) })
    put("=", INK3)
    text(LABEL[e.n], P.x + P.w - 8, y, e.k ? inkOf(e.n) : INK3, "right")
    y += BOOK_LH
  }
  useFont(false)
}
function drawRecipe(P) {
  pageFrame(P, 1, "RECIPES", recipes.length ? `${recipes.length} saved` : "")
  useFont(true)
  if (!recipes.length) {
    text("No recipes yet.", P.x + P.w / 2, P.y + 23, INK2, "center")
    wrap("After a guest tastes a drink, press Save recipe to keep it here.", P.w - 24).forEach((l, i) => text(l, P.x + P.w / 2, P.y + 38 + i * 9, INK3, "center"))
    useFont(false); return
  }
  const r = recipes[book.page[1]]
  useFont(false); text(`No. ${r.no}`, P.x + 8, P.y + 22, EINK); useFont(true)
  text(`${r.crowd} crowd`, P.x + 8, P.y + 32, INK2)
  text(`${r.tier}, ${r.score}`, P.x + 8, P.y + 41, r.score >= 65 ? "#2E6B4A" : r.score >= 40 ? INK2 : "#8A3A3A")
  // the drink itself: a small tumbler in its color
  const gx = Math.round(P.x + P.w - 26), gy = P.y + 22
  fill(gx + 1, gy + 6, 14, 13, rgbStr(mixRgb(r.color, [200, 208, 192], 0.2))); fill(gx + 1, gy + 6, 14, 1, rgbStr(mixRgb(r.color, [255, 255, 255], 0.35)))
  fill(gx, gy, 1, 20, EINK); fill(gx + 15, gy, 1, 20, EINK); fill(gx, gy + 19, 16, 2, EINK)
  fill(P.x + 6, P.y + 51, P.w - 12, 1, INK3)
  // what went in, and how much
  let y = P.y + 55
  const row = (name, amt, sw) => {
    if (sw) fill(P.x + 8, y + 2, 3, 3, sw)
    text(name, P.x + 14, y, EINK); text(amt, P.x + P.w - 8, y, EINK, "right"); y += 9
  }
  for (const [id, parts, dashes] of r.items) row(SHORT[id], dashes ? `${dashes} dash${dashes > 1 ? "es" : ""}` : parts.toFixed(2), liquidOf(id))
  if (r.ice) row("Ice", `${r.ice} cube${r.ice > 1 ? "s" : ""}`, "#E8F4F4")
  fill(P.x + 6, y + 1, P.w - 12, 1, INK3); y += 5
  text("Total", P.x + 14, y, INK2); text(`${r.total.toFixed(2)} parts`, P.x + P.w - 8, y, INK2, "right"); y += 11
  for (const l of wrap(r.method, P.w - 22)) { if (y > P.y + P.h - 22) break; text(l, P.x + 8, y, INK2); y += 9 }
  useFont(false)
}
// a small card above whatever the player points at: a title, then a few lines
function tooltip(title, body, cx, bottom) {
  const w = 150, lines = wrap(body, w - 10), h = 16 + lines.length * 9
  const x = clamp(Math.round(cx - w / 2), 4 - EXT, W - 4 - w), y = Math.max(4, bottom - h)
  fill(x, y, w, h, "rgba(20,26,22,0.92)"); frame1(x, y, w, h, "rgba(255,201,74,0.75)")
  text(title, x + 5, y + 4, "#FFC94A")
  lines.forEach((l, i) => text(l, x + 5, y + 14 + i * 9, CREAM))
}
// bottles show their card at once; anything else only after the pointer has rested on it for about 2 seconds
const DWELL = 2, dwell = { key: "", x: 0, y: 0, t: 0 }
function trackDwell(dt) {
  const key = hover ? hover.kind + ":" + (hover.id || "") : ""
  if (key !== dwell.key || Math.hypot(pointer.x - dwell.x, pointer.y - dwell.y) > 3 || pointer.down) { dwell.key = key; dwell.x = pointer.x; dwell.y = pointer.y; dwell.t = 0 }
  else dwell.t += dt
}
function drawTooltip() {
  if (!hover || S.pressing || S.moving || S.stirring || book.open) return
  if (hover.kind !== "bottle" && dwell.t < DWELL) return
  if (hover.kind === "bottle") { const b = bottleBox(hover.id); tooltip(ingOf[hover.id].name, (ingOf[hover.id].alcohol ? "Alcohol. " : "No alcohol. ") + DESC[hover.id], b.x + b.w / 2, b.y - 8) }
  else if (hover.kind === "cup") { const cup = S.cups[hover.id]; tooltip(`${CUP_NAME[cup.id]} jigger`, `A bar measuring cup. Holds exactly ${CUP_NAME[cup.id].toLowerCase()} part. Click to set it beside the glass, pour a bottle into it, then click it to pick it up and pour the measure. Drag it to move it.`, cup.x, cupBox(cup).y - 4) }
  else if (hover.kind === "activeCup") tooltip("Jigger", sim.volOf(S.cups[hover.id].c) > 0.001 ? "Click to pick it up, then hold to pour it." : "Pour a bottle into it, or click to put it away.", S.cups[hover.id].x, cupBox(S.cups[hover.id]).y - 14)
  else if (hover.kind === "tool") {
    const tool = S.tools[hover.id], has = sim.volOf(tool.c) > 0.004
    tooltip(tool.id === "shaker" ? "Shaker" : "Stirring glass", (tool.id === "shaker"
      ? "Shaking chills a drink fast, waters it down more, and knocks out most of the fizz (add soda after). "
      : "Stirring chills a drink gently and keeps it clear and fizzy. ") + (tool.c.ice ? "" : "It needs ice to work: drag or flick some in. ") + (tool.id === "shaker"
        ? "Pour bottles into it, then click to pick it up: move it about to shake it, hold to pour it. Drag it to move it. Double-click to empty it."
        : "Pour bottles into it. To stir, press on the spoon and move the mouse in circles. Click the glass to pick it up and pour it. Drag it to move it. Double-click to empty it."), tool.x, toolBoxOf(tool).y - 14)
  }
  else if (hover.kind === "spoonHome") tooltip("Bar spoon", "Click to put it in the glass, then stir there.", S.spoon.home.x, holderBox().y - 4)
  else if (hover.kind === "spoon") tooltip("Bar spoon", "Press and hold on it, then move the mouse in circles to stir. Back and forth doesn't stir. Click it to take it out." + (sim.readout().ice ? "" : " Put ice in first, or the drink won't get cold."), glass.cx, spoonGlassBox().y - 4)
  else if (hover.kind === "ice") tooltip("Ice well", "Drag a cube out and drop it into the glass, shaker or stirring glass, or flick it in. The shaker and stirring glass need ice to chill a drink; in the glass it melts in slowly.", WELL_MID.x + 50, WELL[0][1] - 4)
  else if (hover.kind === "glass" && guest.phase === "asking")
    tooltip("The glass", `The lights on its sides mark the minimum drink amount: ${FILL_LINE} parts. They turn from red to green once there's enough. Guests won't take a smaller drink. It holds up to ${MAX_PARTS} parts.` + " Slide it over to the guest to serve it. Click to pick it up and pour it out. Drag it to move it. Double-click to empty it.", glass.cx, glass.top - 4)
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
  drawHolder()
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
  const c = drinkContents(), key = sim.volOf(c).toFixed(2) + ":" + [...c.parts.keys()].join()
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
  const dt = Math.min(0.1, (now - last) / 1000)
  acc += dt; last = now
  while (acc >= STEP) { sim.step(); update(STEP); acc -= STEP }
  hover = targetAt(pointer.x, pointer.y)
  trackDwell(dt)
  if (spectro.open && hover && hover.kind === "spectro") spectro.row = hover.row
  view.style.cursor = S.grab || S.moving || S.stirring ? "grabbing" : hover && hover.kind === "spoon" ? "grab" : hover && hover.kind === "spoonHome" ? "pointer" : S.toolMode ? (pointer.down ? "grabbing" : "grab") : S.held ? (pointer.down ? "grabbing" : hover ? "pointer" : "grab") : hover && hover.kind !== "spectro" && hover.kind !== "modal" && hover.kind !== "screen" ? "pointer" : "default"
  render()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
// a handle for the browser console and the node test harness: the simulation, the guest, and today's buttons
globalThis.pourlab = { sim, guest, spectro, book, SCREEN, textW: textWSmall, get buttons() { return buttons } }
