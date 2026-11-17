// Guest generator: visual-novel style pixel-art bar guests, drawn entirely in code from a seed.
//
// The look the art aims for (Ashley's references): a big, expressive bust; anime eyes with a colored iris, a dark
// pupil and white catchlights under a heavy lash line; hair built from pointed locks with a shine band and strand
// lines; flat cel shading (light, base, shadow, deep) instead of soft gradients; colored outlines (a darker shade of
// whatever they wrap, never plain black); clothes with real necklines, lapels and folds.
//
// How it's built:
//   1. A LOOK is picked once from the seed and the guest's crowd: build, skin, face shape, eyes, hair style and color,
//      clothes, accessories, a resting face. The same seed always gives the same person.
//   2. Every part is painted as a SHAPE into a shape buffer (which shape owns each pixel), back to front:
//      back hair, body, neck, collars, head, front hair, hats.
//   3. The buffer is SHADED: each shape is cel-shaded from its own outline (a shadow band on the side away from the
//      light, a light edge facing it), plus cast shadows (hair on the forehead, the chin on the neck).
//   4. OUTLINES: a colored line around the outside, and where a shape sits in front of a different material.
//   5. The FACE (eyes, brows, nose, mouth, blush) and details (shine, strands, folds, patterns, accessories) are
//      painted on top, pixel by pixel, only where the face or that part is still visible.
//
// A frame is a pose (where the head, arms, hands and glass go) plus an expression. Output: a "body" picture (drawn
// before the glass) and a "front" picture (the hand that holds the glass, drawn after it), and the glass's placement.
// Coordinates are local to BOX; the scene draws BOX at (BOX.x, BOX.y).
//
// Crowds dress and react differently:
//   industrial   work gear: hi-vis, overalls, flannel, hard hats, goggles; big, loud reactions
//   residential  everyday clothes: hoodies, knits, cardigans, headphones, glasses; warm, open reactions
//   commercial   office polish: suits, ties, lanyards, AR glasses, earpieces; bright, practiced reactions
//   luxury       tailoring: long coats, satin, high collars, jewelry; small, knowing reactions

export const BOX = { x: 259, y: 52, w: 150, h: 152 }      // scene pixels; the head's middle lands at scene (334, 100)
const CX = 75, HY = 48                                      // the head's middle, in the box
export const CLIP_Y = 129                                   // the counter's far edge (scene y 181): the body is hidden below
export const SERVED_BASE = { x: 71, y: 140 }                // the served glass's base, in the box (scene 330, 192)

// ---------------------------------------------------------------- random and color helpers
export function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const pick = (R, list) => list[Math.floor(R() * list.length)]
const chance = (R, p) => R() < p
function weighted(R, table) { let s = 0; for (const [, w] of table) s += w; let r = R() * s; for (const [v, w] of table) { r -= w; if (r <= 0) return v } return table[table.length - 1][0] }
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
function rgbHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
function hslRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l))
  if (!s) return [l * 255, l * 255, l * 255].map(Math.round)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255))
}
// a cel ramp from one color: [deep, shadow, base, light, highlight]. Shadows lean violet (the dome's dusk), lights warm.
function ramp(hex) {
  const [h, s, l] = rgbHsl(hexRgb(hex))
  const toward = (h0, to, k) => h0 + (((to - h0 + 540) % 360) - 180) * k
  return [
    hslRgb([toward(h, 268, 0.28), Math.min(1, s * 0.95 + 0.08), l * 0.48]),
    hslRgb([toward(h, 268, 0.14), Math.min(1, s * 0.98 + 0.04), l * 0.72]),
    hexRgb(hex),
    hslRgb([toward(h, 48, 0.08), s * 0.95, l + (1 - l) * 0.26]),
    hslRgb([toward(h, 48, 0.12), s * 0.8, l + (1 - l) * 0.55]),
  ]
}
const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const INKLINE = hexRgb("#1E1424")
const lineOf = (r) => mixc(r[0], INKLINE, 0.45)        // a shape's outline: its own deepest tone, darkened

// ---------------------------------------------------------------- the shape buffer
class SB {
  constructor(w, h) { this.w = w; this.h = h; this.id = new Int16Array(w * h).fill(-1); this.sh = [] }
  shape(r, o = {}) { this.sh.push({ r, cls: o.cls || r, shade: o.shade ?? 3, lit: o.lit ?? 1, cast: o.cast || null, deep: o.deep ?? 0, line: o.line ?? true }); return this.sh.length - 1 }
  put(x, y, id) { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.id[y * this.w + x] = id }
  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? -1 : this.id[y * this.w + x] }
}
function ellipse(B, id, cx, cy, rx, ry, clip) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
    if (((x - cx) / (rx + 0.45)) ** 2 + ((y - cy) / (ry + 0.45)) ** 2 <= 1 && (!clip || clip(x, y))) B.put(x, y, id)
}
function capsule(B, id, ax, ay, bx, by, r1, r2 = r1, clip) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, R = Math.max(r1, r2) + 1
  for (let y = Math.floor(Math.min(ay, by) - R); y <= Math.ceil(Math.max(ay, by) + R); y++) for (let x = Math.floor(Math.min(ax, bx) - R); x <= Math.ceil(Math.max(ax, bx) + R); x++) {
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
    if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= r1 + (r2 - r1) * t + 0.35 && (!clip || clip(x, y))) B.put(x, y, id)
  }
}
function rows(B, id, y0, y1, lf, rf, clip) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(lf(y)); x <= Math.round(rf(y)); x++) if (!clip || clip(x, y)) B.put(x, y, id)
}
function poly(B, id, pts, clip) {
  const ys = pts.map((p) => p[1]), y0 = Math.floor(Math.min(...ys)), y1 = Math.ceil(Math.max(...ys))
  for (let y = y0; y <= y1; y++) {
    const xs = []
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
      if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) xs.push(ax + (y + 0.5 - ay) / (by - ay) * (bx - ax))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) if (!clip || clip(x, y)) B.put(x, y, id)
  }
}
// a lock of hair: a tapered curve from its root to a point, bending through a control point
function lock(B, id, x0, y0, cx, cy, x1, y1, w, clip, taper = 0.9) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5) + 4
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1
    const r = (w / 2) * Math.pow(1 - t, taper)
    if (r < 0.35) { if (!clip || clip(Math.round(x), Math.round(y))) B.put(x, y, id); continue }
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++)
      if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r + 0.2 && (!clip || clip(xx, yy))) B.put(xx, yy, id)
  }
}

// ---------------------------------------------------------------- shading and outlines
// The light comes from the upper left, in front. A pixel is in shadow if a short step toward the lower right leaves
// its shape (the far side of the form); a pixel at the top-left edge catches the light.
function render(B, opt = {}) {
  const { w, h, sh } = B, C = new Array(w * h).fill(null)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const id = B.id[y * w + x]; if (id < 0) continue
    const s = sh[id], r = s.r
    let tone = 2
    for (let k = 1; k <= s.shade; k++) if (B.at(x + k, y + Math.round(k * 0.55)) !== id) { tone = k <= s.deep ? 0 : 1; break }
    if (tone === 2 && s.lit && B.at(x - 1, y - 1) !== id && B.at(x - 1, y) !== id) tone = 3
    if (tone === 2 && s.lit > 1 && (B.at(x - 2, y - 1) !== id || B.at(x - 1, y - 2) !== id)) tone = 3
    if (s.cast && s.cast(x, y, B)) tone = Math.min(tone, 1)
    C[y * w + x] = r[tone]
  }
  // outlines: around the outside, and where a part sits in front of a different material
  const out = C.slice()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, id = B.id[i]
    if (id < 0) {
      if (opt.openBelow !== undefined && y > opt.openBelow) continue
      let best = -1
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = B.at(x + dx, y + dy); if (n > best && sh[n].line) best = n }
      if (best >= 0) out[i] = lineOf(sh[best].r)
      continue
    }
    const s = sh[id]; if (!s.line) continue
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = B.at(x + dx, y + dy)
      if (n >= 0 && n < id && sh[n].cls !== s.cls) { out[i] = lineOf(s.r); break }
    }
  }
  return out
}
// painting on the rendered colors
const P = (C, B, x, y, col, ok) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= B.w || y >= B.h || !col) return; if (ok && !ok(B.at(x, y))) return; C[y * B.w + x] = col }
function stamp(C, B, x, y, rowsArr, map, ok, flip = false) {
  rowsArr.forEach((row, j) => { const n = row.length; [...row].forEach((ch, i) => { const c = map[ch]; if (c) P(C, B, x + (flip ? n - 1 - i : i), y + j, c, ok) }) })
}
const lineC = (C, B, x0, y0, x1, y1, col, ok) => { const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))); for (let k = 0; k <= n; k++) P(C, B, x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, col, ok) }

// ---------------------------------------------------------------- palettes, by crowd
const SKIN = ["#4A2A1E", "#6A3E28", "#8A5434", "#A86A44", "#C08458", "#D49C74", "#E6B896", "#F2CDB0", "#DDA88A", "#B07454"]
const HAIR_NATURAL = ["#1E1418", "#3A2420", "#5A3420", "#7E4A26", "#A8723A", "#D4AC64", "#EED8A0", "#9A9AA4", "#D8D8E0", "#8A3222"]
const HAIR_DYED = ["#F2A0C8", "#6FD8C8", "#7AA8F0", "#B88AF0", "#FF5FB4", "#5FF3E8", "#F2C060", "#E06A8A", "#A8F07A"]
const IRIS = ["#5A3420", "#8A5A2A", "#4A7A4A", "#3E6EA8", "#6E7A8A", "#B8862E", "#7A4AA8", "#2E9A94", "#C2577E"]
const CROWD_STYLE = {
  industrial: {
    cloth: ["#5E6B3E", "#7A5A36", "#3E5A7A", "#4A4A44", "#8A3E26", "#C0581E", "#3B4A5E", "#5A4A3A"],
    under: ["#8A8A80", "#3A3A36", "#D0C8B8", "#6E3A2A", "#2E3A44"],
    accent: ["#FFC94A", "#FF8A2A", "#D7F04A"],
    hair: HAIR_NATURAL, dyed: 0.12,
    tops: [["workjacket", 3], ["overalls", 3], ["vest", 2], ["flannel", 2]],
    hats: [["hardhat", 3], ["beanie", 2], ["cap", 2], ["bandana", 1], [null, 3]],
    hairs: [["short", 3], ["spiky", 3], ["buzz", 2], ["mohawk", 1], ["ponytail", 2], ["messy", 2], ["bald", 1], ["bun", 1]],
    extras: { goggles: 0.35, grease: 0.4, stubble: 0.4, beard: 0.22, cyberarm: 0.2, earmuffs: 0.15, scar: 0.2, bandaid: 0.15 },
    chin: [4, 7], brows: 2,
  },
  residential: {
    cloth: ["#4F9C96", "#E6A9CF", "#E8B060", "#E9A08A", "#5E8FD0", "#F2E4C8", "#7A9A5A", "#B77CFF", "#C2577E"],
    under: ["#F2E4C8", "#3A3A44", "#E2EEF0", "#5A6458"],
    accent: ["#F2E4C8", "#E8B060", "#E6A9CF", "#4F9C96"],
    hair: HAIR_NATURAL, dyed: 0.32,
    tops: [["hoodie", 3], ["sweater", 3], ["cardigan", 2], ["puffer", 2], ["tee", 2]],
    hats: [["beanie", 2], ["clip", 2], [null, 6]],
    hairs: [["short", 2], ["bob", 3], ["long", 3], ["curly", 3], ["ponytail", 2], ["bun", 2], ["braids", 2], ["spiky", 2], ["messy", 2]],
    extras: { glasses: 0.35, headphones: 0.3, scarf: 0.2, freckles: 0.3, stubble: 0.12, beard: 0.12, blush: 0.5 },
    chin: [3, 5], brows: 1,
  },
  commercial: {
    cloth: ["#283A5A", "#3A3F48", "#5A6068", "#1F2A3A", "#4A5568", "#2E4A4A", "#8A3A2E"],
    under: ["#F4F1E8", "#CFE2F0", "#E2E6EA", "#F2E4C8", "#1B1F24"],
    accent: ["#FF4FC8", "#38E8E0", "#E8B060", "#5E8FD0", "#C2577E"],
    hair: HAIR_NATURAL, dyed: 0.12,
    tops: [["suit", 4], ["turtleblazer", 2], ["polo", 2], ["waistcoat", 2]],
    hats: [[null, 1]],
    hairs: [["sidepart", 4], ["bob", 2], ["ponytail", 2], ["short", 2], ["slick", 2], ["bun", 2]],
    extras: { lanyard: 0.4, earpiece: 0.35, arglasses: 0.28, glasses: 0.15, stubble: 0.08 },
    chin: [3, 5], brows: 1,
  },
  luxury: {
    cloth: ["#1E1A24", "#3A1E2E", "#F2E4C8", "#2A2440", "#5A2E22", "#1F3A34", "#C9A066", "#6E2A44"],
    under: ["#F4F1E8", "#1E1A24", "#E6A9CF", "#C9A066", "#2A2440"],
    accent: ["#E8B060", "#F6D79A", "#C8C8CC", "#E6A9CF"],
    hair: ["#1E1418", "#3A2420", "#EED8A0", "#D8D8E0", "#F4F0E8", "#8A3222", "#5A3420"], dyed: 0.14,
    tops: [["longcoat", 3], ["tux", 2], ["silk", 3], ["highcollar", 2]],
    hats: [["pillbox", 1], [null, 7]],
    hairs: [["slick", 3], ["updo", 3], ["bob", 2], ["long", 3], ["sidepart", 2], ["bald", 1]],
    extras: { earrings: 0.55, necklace: 0.4, shades: 0.14, monocle: 0.12, fur: 0.3, beautymark: 0.25 },
    chin: [2, 4], brows: 1,
  },
}

// ---------------------------------------------------------------- the look
export function makeLook(seed, crowd) {
  const R = rng(seed * 7919 + 13), C = CROWD_STYLE[crowd]
  const L = { seed, crowd }
  L.S = 46 + pick(R, [-3, -2, 0, 0, 2, 3])                          // shoulder reach from the middle
  L.skin = ramp(pick(R, SKIN))
  L.rw = 21 + Math.floor(R() * 3)                                   // face half width
  L.chin = C.chin[0] + Math.floor(R() * (C.chin[1] - C.chin[0] + 1)) // chin half width: pointed to square
  L.jaw = 0.55 + R() * 0.4                                          // how soon the jaw turns in
  L.eyeGap = 9 + Math.floor(R() * 2)
  L.iris = ramp(pick(R, IRIS))
  L.lashes = chance(R, 0.45)
  L.browThick = chance(R, 0.4) ? 2 : C.brows
  L.mouthW = 5 + Math.floor(R() * 2)
  L.lip = chance(R, crowd === "luxury" ? 0.5 : 0.25) ? ramp(pick(R, crowd === "luxury" ? ["#9A2E44", "#B4505E", "#6A1E36"] : ["#C2577E", "#B4505E", "#A86A5A"])) : null
  L.hair = ramp(chance(R, C.dyed) ? pick(R, HAIR_DYED) : pick(R, C.hair))
  L.hairStyle = weighted(R, C.hairs)
  L.hat = weighted(R, C.hats)
  L.top = weighted(R, C.tops)
  L.cloth = ramp(pick(R, C.cloth))
  L.under = ramp(pick(R, C.under))
  L.accent = ramp(pick(R, C.accent))
  L.extras = {}
  for (const [k, p] of Object.entries(C.extras)) L.extras[k] = chance(R, p)
  if (L.extras.beard) L.extras.stubble = false
  if (L.hairStyle === "bald" && L.hat && L.hat !== "hardhat") L.hat = null
  if (L.extras.arglasses) L.extras.glasses = false
  if (L.extras.shades) { L.extras.monocle = false; L.extras.glasses = false }
  L.phonesOnNeck = L.hat ? true : chance(R, 0.5)
  L.hatCol = ramp(L.hat === "hardhat" ? pick(R, ["#FFC94A", "#FF8A2A", "#F4F1E8", "#5E8FD0"]) : pick(R, C.cloth.concat(C.accent)))
  L.metal = ramp(pick(R, ["#8A98A2", "#6E7C86", "#A8B4BC"]))
  L.gold = ramp("#E8B060")
  L.rest = crowd === "industrial" ? pick(R, ["flat", "flat", "frown", "smirk"]) : crowd === "luxury" ? pick(R, ["flat", "smirk", "softsmile"]) : pick(R, ["flat", "smile", "softsmile", "smirk"])
  L.restEyes = crowd === "luxury" ? pick(R, ["half", "open", "half"]) : crowd === "industrial" ? pick(R, ["open", "open", "half"]) : "open"
  L.sleeve = L.top === "flannel" || (crowd === "industrial" && L.top !== "vest" && chance(R, 0.35)) ? "rolled" : L.top === "tee" || L.top === "polo" ? "short" : "long"
  L.bangs = 4 + Math.floor(R() * 3)                                 // how many locks in the fringe
  L.sweep = (R() - 0.5) * 8                                         // which way the fringe falls
  L.part = R() < 0.5 ? -1 : 1
  return L
}

// ---------------------------------------------------------------- poses
// Built from the look's shoulder reach S. Arms: elbow e and hand h for the guest's right arm (our left, "L") and left
// arm (our right, "R"). The glass: base point (x, y) and tilt a (radians).
function pose(name, S) {
  const restL = { e: [CX - S + 2, 128], h: [CX - 13, 143], hand: "fist" }, restR = { e: [CX + S - 2, 128], h: [CX + 13, 143], hand: "fist" }
  switch (name) {
    case "idle": return { head: [0, 0], L: restL, R: restR, glass: null }
    case "reach": return { head: [0, 1], L: { e: [CX - S + 2, 128], h: [CX - 6, 124], hand: "grip" }, R: restR, glass: { x: SERVED_BASE.x, y: SERVED_BASE.y, a: 0 } }
    case "lift": return { head: [0, 0], L: { e: [CX - S + 6, 126], h: [CX - 12, 104], hand: "grip" }, R: restR, glass: { x: CX - 11, y: 120, a: 0 } }
    case "drink": return { head: [1, -2], L: { e: [CX - S + 10, 120], h: [CX - 10, 82], hand: "grip" }, R: restR, glass: { x: CX - 18, y: 100, a: 0.45 } }
    case "down": return { head: [0, 0], L: { e: [CX - S + 2, 128], h: [CX - 6, 124], hand: "grip" }, R: restR, glass: { x: SERVED_BASE.x, y: SERVED_BASE.y, a: 0 } }
    case "toast": return { head: [0, 0], L: { e: [CX - S + 6, 124], h: [CX - 12, 100], hand: "grip" }, R: restR, glass: { x: CX - 11, y: 116, a: 0 } }
  }
  return pose("idle", S)
}
export const POSES = Object.fromEntries(["idle", "reach", "lift", "drink", "down", "toast"].map((n) => [n, pose(n, 52)]))
// the free arm's gestures in a reaction (our right side)
function gesture(name, S) {
  const G = {
    rest: { e: [CX + S - 2, 128], h: [CX + 13, 143], hand: "fist" },
    thumb: { e: [CX + S, 124], h: [CX + S - 12, 94], hand: "thumb" },
    fist: { e: [CX + S + 8, 100], h: [CX + S + 2, 60], hand: "fist" },
    fist2: { e: [CX + S + 8, 96], h: [CX + S + 2, 54], hand: "fist" },
    chest: { e: [CX + S - 4, 122], h: [CX + 14, 108], hand: "flat" },
    shrug: { e: [CX + S + 8, 122], h: [CX + S + 10, 106], hand: "palm" },
    wave: { e: [CX + S + 2, 118], h: [CX + S - 2, 92], hand: "palm" },
    chin: { e: [CX + S - 6, 122], h: [CX + 12, 80], hand: "fist" },
    push: { e: [CX + S, 126], h: [CX + 20, 122], hand: "palm" },
    ok: { e: [CX + S, 122], h: [CX + S - 10, 94], hand: "ok" },
  }
  return G[name] || G.rest
}
export const GESTURES = Object.fromEntries(["rest", "thumb", "fist", "fist2", "chest", "shrug", "wave", "chin", "push", "ok"].map((n) => [n, gesture(n, 52)]))

// ---------------------------------------------------------------- drawing a guest
const below = (x, y) => y <= CLIP_Y
export function drawGuest(L, frame) {
  const S = L.S, po = pose(frame.pose || "idle", S), bob = frame.bob || 0
  const armR = frame.gesture ? gesture(frame.gesture, S) : po.R
  const hx = CX + po.head[0] + (frame.headX || 0), hy = HY + po.head[1] + bob + (frame.headY || 0)
  const B = new SB(BOX.w, BOX.h)
  const ex = { ...(frame.expr || {}) }
  const ctx = { L, B, hx, hy, S, by: bob, ex, frame }

  // back to front
  backHair(ctx)
  const ids = body(ctx, po.L, armR)
  const neckId = B.shape(L.skin, { cls: "skin", shade: 3, cast: (x, y, b) => { const n = b.at(x, y - 6); return n === ctx.faceId } })
  ctx.neckId = neckId
  const nw = Math.round(L.rw * 0.42)
  rows(B, neckId, hy + 16, ids.t0 + 6, () => hx - nw, () => hx + nw - 1, below)
  collarOver(ctx, ids)
  head(ctx)
  frontHair(ctx)
  hats(ctx)

  const C = render(B, { openBelow: CLIP_Y })
  for (let x = 0; x < B.w; x++) for (let y = CLIP_Y + 1; y < B.h; y++) { C[y * B.w + x] = null; B.id[y * B.w + x] = -1 }
  // details over the shading
  clothesDetail(ctx, C, ids)
  hairDetail(ctx, C)
  face(ctx, C)
  accessories(ctx, C, ids)

  // the forearms and hands: the free arm on the body layer, the arm holding the glass on the front layer
  const holding = po.glass && po.L.hand === "grip"
  const AR = new SB(BOX.w, BOX.h); forearm(ctx, AR, armR, 1)
  const arC = render(AR); for (let i = 0; i < arC.length; i++) if (arC[i]) C[i] = arC[i]
  const AL = new SB(BOX.w, BOX.h); forearm(ctx, AL, po.L, -1)
  const alC = render(AL)
  let FC = new Array(B.w * B.h).fill(null)
  if (holding) FC = alC
  else for (let i = 0; i < alC.length; i++) if (alC[i]) C[i] = alC[i]
  fx(ctx, C)
  return { body: { w: B.w, h: B.h, c: C }, front: { w: B.w, h: B.h, c: FC }, glass: po.glass, head: { x: hx, y: hy } }
}

// ---------------------------------------------------------------- the body: shoulders, chest, upper arms
function body(ctx, armL, armR) {
  const { L, B, hx, hy, S, by } = ctx
  const top = L.top, lean = (r) => ({ cls: r, shade: 5, deep: 1, lit: 2 })
  const torsoRamp = top === "overalls" ? L.under : L.cloth
  const nw = Math.round(L.rw * 0.42)
  // the far sides first: upper arms (shoulder to elbow), then the torso over them
  const sleeve = top === "overalls" || top === "vest" ? L.under : L.cloth
  const armId = B.shape(sleeve, lean(sleeve))
  for (const [s, a] of [[-1, armL], [1, armR]]) capsule(B, armId, CX + s * (S - 11), hy + 60 + by, a.e[0], a.e[1], 8, 8, below)
  const torso = B.shape(torsoRamp, lean(torsoRamp))
  const t0 = hy + 33 + by
  // the trapezius slopes from the neck down to the shoulders, then the chest falls straight to the counter
  const half = (y) => { const t = Math.max(0, Math.min(1, (y - t0) / 24)); return nw + 1 + (S - 6 - nw) * (1 - Math.pow(1 - t, 2)) }
  rows(B, torso, t0, CLIP_Y, (y) => CX - half(y), (y) => CX + half(y), below)
  // short sleeves: bare arms below the sleeve's hem
  if (L.sleeve === "short") {
    const sk = B.shape(L.skin, { cls: "skin", shade: 3 })
    for (const [s, a] of [[-1, armL], [1, armR]]) { const sx = CX + s * (S - 11), sy = hy + 60 + by, mx = sx + (a.e[0] - sx) * 0.45, my = sy + (a.e[1] - sy) * 0.45; capsule(B, sk, mx, my, a.e[0], a.e[1], 7, 7, below) }
  }
  return { armId, torso, t0, half }
}
// what goes around the neck in front of it: collars, turtlenecks, a scarf, headphones resting on the neck
function collarOver(ctx, ids) {
  const { L, B, hx, hy } = ctx, top = L.top, nw = Math.round(L.rw * 0.42), y0 = ids.t0
  if (top === "turtleblazer") { const id = B.shape(L.under, { shade: 3, lit: 1 }); rows(B, id, hy + 22, y0 + 4, () => hx - nw - 2, () => hx + nw + 1, below) }
  if (top === "highcollar" || top === "longcoat") {
    const id = B.shape(L.extras.fur && top === "longcoat" ? ramp("#E8DCC8") : L.cloth, { shade: 4, lit: 2 })
    ctx.collarId = id
    for (const s of [-1, 1]) poly(B, id, [[hx + s * (nw - 1), hy + 22], [hx + s * (nw + 9), y0 - 2], [hx + s * (nw + 12), y0 + 12], [hx + s * (nw + 2), y0 + 6]], below)
  }
  if (L.extras.scarf) {
    const id = B.shape(L.accent, { shade: 3, lit: 2 })
    capsule(B, id, hx - nw - 4, y0, hx + nw + 4, y0, 4, 4, below)
    capsule(B, id, hx + nw - 1, y0 + 2, hx + nw + 3, y0 + 22, 3.5, 3, below)
  }
  if (L.extras.earmuffs || (L.extras.headphones && L.phonesOnNeck)) {
    const band = B.shape(ramp("#3A3F48"), { shade: 2 }), cup = B.shape(L.extras.earmuffs ? ramp("#3A3A36") : L.accent, { shade: 3, lit: 2 })
    capsule(B, band, hx - nw - 6, y0 - 1, hx + nw + 6, y0 - 1, 2, 2, below)
    for (const s of [-1, 1]) ellipse(B, cup, hx + s * (nw + 7), y0 + 2, 4.5, 5.5, below)
  }
}

// ---------------------------------------------------------------- the head
function head(ctx) {
  const { L, B, hx, hy } = ctx, rw = L.rw
  // ears first (behind the face's edge)
  const ear = B.shape(L.skin, { cls: "skin", shade: 2 })
  for (const s of [-1, 1]) ellipse(B, ear, hx + s * (rw - 0.5), hy + 3, 3.5, 5.5)
  // the face: a round skull narrowing through the cheeks to the chin
  const face = B.shape(L.skin, { cls: "skin", shade: 3, lit: 0, cast: (x, y, b) => {
    // the fringe's shadow on the forehead, the hair's shadow beside the face
    for (const dy of [1, 2, 3]) { const n = b.at(x - (dy > 2 ? 1 : 0), y - dy); if (n === ctx.hairId || n === ctx.hatId) return true }
    return false
  } })
  ctx.faceId = face
  const yTop = hy - 26, yJaw = hy + 6, yChin = hy + 25
  for (let y = yTop; y <= yChin; y++) {
    let w
    if (y <= yJaw) { const d = (y - (hy - 2)) / 24; w = rw * Math.sqrt(Math.max(0, 1 - d * d)) }
    else { const t = (y - yJaw) / (yChin - yJaw); w = L.chin + (rw - L.chin) * (1 - Math.pow(t, 1 + L.jaw)) }
    for (let x = Math.round(hx - w); x <= Math.round(hx + w - 1); x++) B.put(x, y, face)
  }
  // a beard is its own shape (shaded and outlined like hair)
  if (L.extras.beard) {
    const bd = B.shape(L.hair, { cls: "hair", shade: 3, lit: 1 })
    for (let y = hy + 8; y <= yChin + 2; y++) for (let x = hx - rw; x <= hx + rw; x++) {
      if (B.at(x, y) !== face && !(y > yChin && Math.abs(x - hx) < L.chin + 2)) continue
      const mouthGap = Math.abs(x - hx) < L.mouthW / 2 + 2 && y > hy + 14 && y < hy + 21
      const cheek = y < hy + 15 && Math.abs(x - hx) < rw - 5
      if (!mouthGap && !cheek) B.put(x, y, bd)
    }
  }
}

// ---------------------------------------------------------------- hair
function hairShape(ctx, back = false) { return ctx.B.shape(ctx.L.hair, { cls: "hair", shade: back ? 4 : 3, deep: back ? 1 : 0, lit: 2 }) }
function backHair(ctx) {
  const { L, B, hx, hy } = ctx, s = L.hairStyle, rw = L.rw
  if (s === "bald" || s === "buzz" || s === "mohawk") return
  const id = hairShape(ctx, true)
  ctx.backHairId = id
  // the back of the head, always a little wider than the skull
  ellipse(B, id, hx, hy - 6, rw + 3, rw + 2)
  if (s === "long" || s === "braids") {
    const end = s === "braids" ? hy + 40 : hy + 58
    rows(B, id, hy - 4, end, (y) => hx - rw - 4 - (y - hy) * 0.08, (y) => hx + rw + 3 + (y - hy) * 0.08, below)
    for (let k = -3; k <= 3; k++) lock(B, id, hx + k * 7, end - 4, hx + k * 7.5, end + 2, hx + k * 8 + (k % 2), end + 7 + (k % 2 ? 0 : 3), 8, below)
  }
  if (s === "bob") rows(B, id, hy - 6, hy + 20, () => hx - rw - 4, () => hx + rw + 3)
  if (s === "ponytail") lock(B, id, hx + rw - 6, hy - 20, hx + rw + 14, hy - 6, hx + rw + 8, hy + 30, 11)
  if (s === "curly") for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; ellipse(B, id, hx + Math.cos(a) * (rw + 2), hy - 4 + Math.sin(a) * (rw + 4), 6, 6) }
  if (s === "bun") ellipse(B, id, hx + 4, hy - 30, 9, 8)
  if (s === "updo") { ellipse(B, id, hx, hy - 32, 13, 9); ellipse(B, id, hx + 9, hy - 26, 7, 6) }
}
function frontHair(ctx) {
  const { L, B, hx, hy } = ctx, s = L.hairStyle, rw = L.rw
  if (s === "bald") return
  const id = hairShape(ctx)
  ctx.hairId = id
  const crown = (top, ry = rw - 1) => ellipse(B, id, hx, hy - 8, rw + 2, ry, (x, y) => y <= top(x))
  const fringe = (n, len, spread, sweep, w = 9) => {
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.5 : k / (n - 1), x0 = hx - spread + t * spread * 2
      const tipY = hy - 6 + len + ((k * 37 + L.seed) % 3) - (Math.abs(t - 0.5) > 0.4 ? 3 : 0)
      lock(B, id, x0, hy - 22, x0 + sweep * 0.5, hy - 12, x0 + sweep + (t - 0.5) * 4, tipY, w)
    }
  }
  const sideLocks = (len, w = 7) => { for (const sd of [-1, 1]) lock(B, id, hx + sd * (rw - 2), hy - 14, hx + sd * (rw + 2), hy, hx + sd * (rw - 1), hy + len, w) }
  if (s === "buzz") {
    crown((x) => hy - 16 + (Math.abs(x - hx) > rw - 4 ? 6 : 0))
  } else if (s === "short" || s === "messy") {
    crown(() => hy - 12)
    fringe(L.bangs, 2, rw - 5, L.sweep, 9)
    for (const sd of [-1, 1]) lock(B, id, hx + sd * (rw - 3), hy - 16, hx + sd * (rw + 1), hy - 8, hx + sd * rw, hy + 2, 6)
    if (s === "messy") for (let k = 0; k < 5; k++) lock(B, id, hx - 12 + k * 6, hy - 24, hx - 14 + k * 7, hy - 32, hx - 16 + k * 8 + ((k + L.seed) % 3), hy - 34 + (k % 2) * 3, 7)
  } else if (s === "spiky") {
    crown(() => hy - 12)
    // spikes out from the crown, upward and sideways, then a pointed fringe
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (1.08 + k * 0.14), len = 9 + ((k * 5 + L.seed) % 5)
      const bx = hx + Math.cos(a) * (rw - 2), byy = hy - 10 + Math.sin(a) * (rw - 4)
      lock(B, id, bx, byy, bx + Math.cos(a) * len * 0.6, byy + Math.sin(a) * len * 0.6 + 2, bx + Math.cos(a) * len, byy + Math.sin(a) * len - 2, 9)
    }
    fringe(L.bangs + 1, 5, rw - 4, L.sweep, 8)
    for (const sd of [-1, 1]) lock(B, id, hx + sd * (rw - 2), hy - 12, hx + sd * (rw + 5), hy - 2, hx + sd * (rw + 4), hy + 8, 7)
  } else if (s === "sidepart" || s === "slick") {
    crown(() => hy - (s === "slick" ? 18 : 14))
    if (s === "sidepart") {
      // a swept fringe from the part across the forehead
      const px0 = hx + L.part * 6
      for (let k = 0; k < 4; k++) lock(B, id, px0, hy - 24, hx - L.part * (4 + k * 4), hy - 18 + k, hx - L.part * (rw - 1 - k * 2), hy - 6 + k * 2, 10 - k)
    } else for (let k = 0; k < 5; k++) lock(B, id, hx - 12 + k * 6, hy - 18, hx - 10 + k * 6, hy - 30, hx - 6 + k * 5, hy - 34, 7)
    for (const sd of [-1, 1]) lock(B, id, hx + sd * (rw - 2), hy - 16, hx + sd * (rw + 1), hy - 8, hx + sd * (rw - 1), hy, 5)
  } else if (s === "mohawk") {
    for (let k = 0; k < 6; k++) lock(B, id, hx - 3 + (k % 2) * 2, hy - 22 + k * 3, hx - 2, hy - 36 + k * 3, hx + 4 + k, hy - 42 + k * 4, 8)
    crown((x) => (Math.abs(x - hx) <= 4 ? hy - 10 : hy - 40))
    ctx.shaved = true
  } else {
    // bob, long, braids, curly, bun, updo, ponytail: a crown with a fringe; side locks for the longer ones
    crown(() => hy - 12)
    const len = s === "updo" || s === "bun" ? 2 : 4
    fringe(L.bangs, len, rw - 4, s === "updo" ? L.part * 6 : L.sweep, 9)
    if (s === "bob" || s === "long" || s === "braids") sideLocks(s === "bob" ? 20 : 30, 8)
    if (s === "ponytail" || s === "bun" || s === "updo") for (const sd of [-1, 1]) lock(B, id, hx + sd * (rw - 3), hy - 14, hx + sd * (rw + 1), hy - 4, hx + sd * (rw - 1), hy + 8, 5)
    if (s === "curly") for (let k = 0; k < 9; k++) ellipse(B, id, hx - rw + 2 + k * 5, hy - 18 + ((k * 3) % 4), 4, 4)
    if (s === "braids") { const bid = B.shape(L.hair, { cls: "hair", shade: 2 }); for (const sd of [-1, 1]) for (let k = 0; k < 8; k++) ellipse(B, bid, hx + sd * (rw + 2) + (k % 2 ? sd : 0), hy + 10 + k * 5, 3.5, 3, below) }
  }
}
// shine, strands and texture on top of the shaded hair
function hairDetail(ctx, C) {
  const { L, B, hx, hy } = ctx, rw = L.rw, isHair = (n) => n >= 0 && B.sh[n].cls === "hair"
  if (L.hairStyle === "bald") {
    for (let x = hx - 9; x <= hx - 2; x++) P(C, B, x, hy - 21 + Math.round(((x - hx + 5) ** 2) / 12), L.skin[4], (n) => n === ctx.faceId)
    return
  }
  if (L.hairStyle === "buzz" || ctx.shaved) {
    for (let y = hy - 30; y < hy - 4; y++) for (let x = hx - rw - 2; x <= hx + rw + 2; x++) if ((x + y * 2) % 4 === 0) P(C, B, x, y, L.hair[1], (n) => n === ctx.hairId && B.at(x, y - 1) === ctx.hairId)
  }
  // the shine: a broken band across the top of the head, catching the light on the left
  const cy = hy - 8, r0 = rw - 3
  for (let a = Math.PI * 1.08; a < Math.PI * 1.75; a += 0.02) {
    const seg = Math.floor((a - Math.PI) / 0.13) % 2
    for (let d = 0; d < 3; d++) {
      const x = hx + Math.cos(a) * (r0 - d), y = cy + Math.sin(a) * (r0 - d) * 0.9
      if (seg === 0 || d === 1) P(C, B, x, y, d === 1 ? L.hair[4] : L.hair[3], isHair)
    }
  }
  // strand lines: short darker strokes down from the crown
  for (let k = 0; k < 6; k++) {
    const x0 = hx - rw + 6 + k * ((2 * rw - 12) / 5)
    lineC(C, B, x0, hy - 20, x0 + L.sweep * 0.2 + (k % 2 ? 1 : -1), hy - 12, L.hair[1], (n) => n === ctx.hairId)
  }
}

// ---------------------------------------------------------------- hats and headwear
function hats(ctx) {
  const { L, B, hx, hy } = ctx, rw = L.rw, top = hy - 26
  if (L.hat === "hardhat") {
    const id = ctx.hatId = B.shape(L.hatCol, { shade: 4, deep: 1, lit: 2 })
    ellipse(B, id, hx, top + 8, rw + 4, 14, (x, y) => y <= top + 9)
    rows(B, id, top + 9, top + 12, () => hx - rw - 8, () => hx + rw + 8)
  } else if (L.hat === "beanie") {
    const id = ctx.hatId = B.shape(L.hatCol, { shade: 4, lit: 2 })
    ellipse(B, id, hx, top + 8, rw + 3, 15, (x, y) => y <= top + 10)
    rows(B, id, top + 8, top + 14, () => hx - rw - 3, () => hx + rw + 2)
    if (L.seed % 2) { const p = B.shape(L.accent, { shade: 2, lit: 2 }); ellipse(B, p, hx, top - 9, 4.5, 4) }
    ctx.beanie = id
  } else if (L.hat === "cap") {
    const id = ctx.hatId = B.shape(L.hatCol, { shade: 4, lit: 2 })
    ellipse(B, id, hx, top + 8, rw + 2.5, 13, (x, y) => y <= top + 10)
    rows(B, id, top + 9, top + 12, () => hx - rw - 2, () => hx + rw + 13)
  } else if (L.hat === "bandana") {
    const id = B.shape(L.accent, { shade: 3, lit: 2 })
    rows(B, id, top + 5, top + 11, (y) => hx - rw - 2 + (y - top - 5) * 0.2, (y) => hx + rw + 1 - (y - top - 5) * 0.2)
    lock(B, id, hx + rw, top + 8, hx + rw + 6, top + 12, hx + rw + 8, top + 20, 5)
  } else if (L.hat === "pillbox") {
    const id = B.shape(L.hatCol, { shade: 3, lit: 2 })
    rows(B, id, top - 6, top + 2, () => hx - 4, () => hx + 12)
    const v = B.shape(ramp("#2A2440"), { shade: 1, line: false })
    poly(B, v, [[hx + 12, top + 2], [hx + 18, top + 4], [hx + 14, top + 14]])
  }
}

// ---------------------------------------------------------------- the face: eyes, brows, nose, mouth, blush
// Eye templates, drawn for the eye on our right (its outer corner on the right); the other eye is mirrored.
// L lash line, i iris dark, m iris, n iris light, p pupil, h catchlight, w white, s lid shadow
const EYES = {
  open: ["..LLLLL.", ".LiiiiiL", "whhippiw", "whmippmw", "wmmnnmmw", ".wnnnnw.", "..ssss.."],
  wide: [".LLLLLL.", "LwwwwwwL", "wwhiimww", "wwmppmww", "wwmnnmww", ".wwwwww.", "..ssss.."],
  half: ["........", "..ssss..", ".LLLLLLL", "whmippmw", "wmmnnmmw", ".wnnnnw.", "..ssss.."],
  narrow: ["........", "........", "..ssss..", ".LLLLLLL", "wmmppmmw", "..ssss..", "........"],
  closed: ["........", "........", "........", "L......L", ".LLLLLL.", "........", "........"],
  happy: ["........", "..LLLL..", ".LL..LL.", "LL....LL", "........", "........", "........"],
  squeeze: [".....LL.", "...LL...", ".LL.....", "...LL...", ".....LL.", "........", "........"],
}
function eye(ctx, C, cx, y, side, kind, look = [0, 0]) {
  const { L, B } = ctx, ok = (n) => n === ctx.faceId
  let t = EYES[kind] || EYES.open
  if ((kind === "open" || kind === "half" || kind === "wide") && (look[0] || look[1])) t = shiftIris(t, side < 0 ? -look[0] : look[0], look[1])
  if (kind === "side") t = shiftIris(EYES.open, side > 0 ? 1 : -2, 0)
  const lash = mixc(L.hair[0], INKLINE, 0.6)
  const map = { L: lash, i: L.iris[0], m: L.iris[2], n: L.iris[3], p: mixc(L.iris[0], INKLINE, 0.6), h: hexRgb("#FFFFFF"), w: hexRgb("#F6F2EE"), s: mixc(L.skin[0], L.skin[1], 0.5) }
  stamp(C, B, cx - 4, y - 3, t, map, ok, side < 0)
  if (L.lashes && (kind === "open" || kind === "wide" || kind === "half" || kind === "side")) {
    const top = kind === "half" ? y - 1 : y - 3
    P(C, B, side < 0 ? cx - 5 : cx + 4, top, lash, ok); P(C, B, side < 0 ? cx - 6 : cx + 5, top - 1, lash, ok)
  }
}
function shiftIris(t, dx, dy) {
  const g = t.map((r) => [...r]), out = t.map((r) => [...r]), IR = "imnph"
  for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (IR.includes(g[j][i])) out[j][i] = "w"
  for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) {
    if (!IR.includes(g[j][i])) continue
    const ni = i + dx, nj = j + dy
    if (nj >= 1 && nj < g.length && ni >= 0 && ni < g[j].length && (IR.includes(g[nj][ni]) || g[nj][ni] === "w")) out[nj][ni] = g[j][i]
  }
  return out.map((r) => r.join(""))
}
const MOUTHS = {
  flat: ["LLLL"],
  smile: ["L...L", ".LLL."],
  softsmile: ["....L", "LLLL."],
  smirk: [".....L", "....L.", "LLLL.."],
  frown: [".LLL.", "L...L"],
  tight: ["LLLLLL", "k....k"],
  pursed: [".LL.", ".kk."],
  o: [".LL.", "LddL", "LddL", ".LL."],
  wavy: ["L.L.L.", ".L.L.L"],
  grin: ["LLLLLLL", "LwwwwwL", ".LdddL.", "..LLL.."],
  laugh: [".LLLLLLL.", "LwwwwwwwL", "LdddddddL", ".LdtttdL.", "..LLLLL.."],
  grimace: ["LLLLLLLL", "LwLwLwLL", "LLLLLLLL", "k......k"],
  tongue: ["LL.LL", ".LLL.", "..tt.", "..tt."],
}
function face(ctx, C) {
  const { L, B, hx, hy, ex, frame } = ctx, ok = (n) => n === ctx.faceId
  const eyes = frame.blink ? "closed" : ex.eyes || L.restEyes, brows = ex.brows || "neutral", mouth = ex.mouth || L.rest
  const ey = hy + 3, g = L.eyeGap
  // skin marks first, so the features sit on top
  // stubble: a soft tint along the jaw and over the lip (no dither: this style keeps flat tones)
  if (L.extras.stubble) for (let y = hy + 10; y <= hy + 26; y++) for (let x = hx - L.rw; x <= hx + L.rw; x++) if (Math.hypot((x - hx) / L.rw, (y - hy - 4) / 20) > 0.66 || (y === hy + 14 && Math.abs(x - hx) < 4)) { const i = y * B.w + x; if (ok(B.at(x, y)) && C[i]) C[i] = mixc(C[i], L.hair[0], 0.22) }
  if (L.extras.freckles) for (const [dx, dy] of [[-12, 9], [-10, 10], [-13, 11], [12, 9], [10, 10], [13, 11]]) P(C, B, hx + dx, hy + dy, L.skin[1], ok)
  if (L.extras.grease) { lineC(C, B, hx + 10, hy + 12, hx + 14, hy + 11, mixc(L.skin[0], INKLINE, 0.3), ok); P(C, B, hx + 12, hy + 13, L.skin[0], ok) }
  if (L.extras.scar) lineC(C, B, hx - 13, hy - 4, hx - 10, hy + 5, L.skin[4], ok)
  if (L.extras.bandaid) stamp(C, B, hx + 9, hy + 10, ["xxxx", "xyyx", "xxxx"], { x: hexRgb("#E9C8A0"), y: hexRgb("#C9A27A") }, ok)
  if (L.extras.beautymark) P(C, B, hx + 9, hy + 13, L.skin[0], ok)
  // eyes
  for (const s of [-1, 1]) eye(ctx, C, hx + s * g, ey, s, eyes, ex.look)
  // brows: thin arcs that move with the expression
  const bc = mixc(L.hair[0], INKLINE, 0.5)
  for (const s of [-1, 1]) {
    const cx = hx + s * g, by = ey - 7
    let inner = 0, outer = 0
    if (brows === "raised") { inner = -1; outer = -1 } else if (brows === "high") { inner = -3; outer = -2 }
    else if (brows === "furrow") { inner = 2; outer = -1 } else if (brows === "worried") { inner = -2; outer = 1 }
    else if (brows === "oneup" && s > 0) { inner = -2; outer = -3 } else if (brows === "oneup_l" && s < 0) { inner = -2; outer = -3 }
    for (let k = -3; k <= 3; k++) {
      const tIn = (s < 0 ? 3 - k : k + 3) / 6                       // 1 at the inner end... the brow's far end is k = 3 on our right eye
      const inn = s < 0 ? (k + 3) / 6 : (3 - k) / 6
      const arch = Math.abs(k) <= 1 ? -1 : 0
      const yy = by + Math.round(outer + (inner - outer) * inn) + arch
      P(C, B, cx + k, yy, bc, (n) => n === ctx.faceId || (n >= 0 && B.sh[n].cls === "hair"))
      if (L.browThick > 1 && Math.abs(k) < 3) P(C, B, cx + k, yy + 1, bc, (n) => n === ctx.faceId)
      void tIn
    }
  }
  // nose: a small shadow on the side away from the light, a glint on the bridge
  const nose = mixc(L.skin[0], L.skin[1], 0.4)
  P(C, B, hx + 1, hy + 11, nose, ok); P(C, B, hx + 2, hy + 10, nose, ok); P(C, B, hx, hy + 9, L.skin[4], ok)
  // blush
  if (ex.blush || (L.extras.blush && /smile|grin|laugh/.test(mouth))) for (const s of [-1, 1]) for (let k = -2; k <= 2; k++) { P(C, B, hx + s * (g + 2) + k, hy + 11, mixc(L.skin[2], hexRgb("#FF6A8A"), 0.45), ok); if (Math.abs(k) < 2) P(C, B, hx + s * (g + 2) + k, hy + 12, mixc(L.skin[2], hexRgb("#FF6A8A"), 0.3), ok) }
  // mouth
  const m = MOUTHS[mouth] || MOUTHS.flat, mw = m[0].length
  const lineCol = L.lip ? mixc(L.lip[0], hexRgb("#2A0E16"), 0.3) : mixc(L.skin[0], hexRgb("#2A0E16"), 0.72)
  const map = { L: lineCol, k: mixc(L.skin[0], L.skin[1], 0.5), w: hexRgb("#FAF6F0"), d: hexRgb("#4A1420"), t: hexRgb("#E87A88") }
  stamp(C, B, hx - Math.floor(mw / 2) + 1, hy + 16 - (m.length > 2 ? 1 : 0), m, map, ok)
  if (L.lip && /flat|smile|softsmile|smirk|tight|pursed/.test(mouth)) lineC(C, B, hx - 1, hy + 18, hx + 1, hy + 18, L.lip[2], ok)
}

// ---------------------------------------------------------------- clothes: necklines, lapels, folds, patterns
function clothesDetail(ctx, C, ids) {
  const { L, B, hx, S } = ctx, top = L.top, y0 = ids.t0, nw = Math.round(L.rw * 0.42)
  const onT = (n) => n === ids.torso, onBody = (n) => n === ids.torso || n === ids.armId
  const cl = L.cloth, un = L.under, ac = L.accent, line = lineOf(cl)
  // a V neckline: what's under shows in a V from the collarbones down
  const vee = (depth, wide, fillR) => {
    for (let y = y0; y <= Math.min(CLIP_Y, y0 + depth); y++) { const w = (wide + 1) * (1 - (y - y0) / depth); for (let x = Math.round(hx - w); x <= Math.round(hx + w); x++) P(C, B, x, y, x > hx + w - 2 ? fillR[1] : fillR[2], onT) }
    for (const s of [-1, 1]) lineC(C, B, hx + s * (wide + 1), y0, hx, y0 + depth, line, onT)
  }
  const fold = (x0, y_0, x1, y_1, k = 0) => lineC(C, B, x0, y_0, x1, y_1, cl[k], onBody)
  if (top === "suit" || top === "tux" || top === "waistcoat" || top === "turtleblazer") {
    if (top !== "turtleblazer") {
      vee(26, nw + 3, un)
      // collar points, and a tie (or a bow tie)
      for (const s of [-1, 1]) stamp(C, B, hx + (s < 0 ? -nw - 4 : nw - 2), y0 - 1, ["xx..", "xxx.", ".xxx", "..xx"], { x: un[3] }, onT, s > 0)
      if (top === "tux") stamp(C, B, hx - 4, y0 + 3, ["xx..xx", "xxxxxx", "xxxxxx", "xx..xx"], { x: hexRgb("#1E1A24") }, onT)
      else { for (let y = y0 + 3; y < Math.min(CLIP_Y, y0 + 30); y++) { const w = y < y0 + 6 ? 1 : 2 + Math.floor((y - y0 - 6) / 10); for (let x = hx - w; x <= hx + w - 1; x++) P(C, B, x, y, x >= hx ? ac[1] : ac[2], onT) } lineC(C, B, hx - 1, y0 + 3, hx + 1, y0 + 3, ac[0], onT) }
    } else vee(20, nw + 2, un)
    // lapels: a lighter edge and the line where they fold
    for (const s of [-1, 1]) {
      lineC(C, B, hx + s * (nw + 4), y0, hx + s * 6, y0 + 28, top === "tux" ? hexRgb("#3A3448") : cl[3], onT)
      lineC(C, B, hx + s * (nw + 9), y0 + 2, hx + s * 12, y0 + 22, line, onT)
    }
    if (top === "waistcoat") for (let k = 0; k < 3; k++) P(C, B, hx + 3, y0 + 30 + k * 6, ac[3], onT)
    if (top === "suit" && L.seed % 3 === 0) stamp(C, B, hx + 16, y0 + 18, ["xyxy", "yyyy"], { x: ac[3], y: ac[2] }, onT)
    if (L.extras.lanyard) lanyard(ctx, C, y0, onT)
    fold(hx - S + 14, y0 + 16, hx - S + 18, y0 + 34, 1); fold(hx + S - 14, y0 + 16, hx + S - 18, y0 + 34, 1)
  } else if (top === "polo") {
    for (const s of [-1, 1]) stamp(C, B, hx + (s < 0 ? -nw - 5 : nw - 1), y0 - 1, ["xxxx", ".xxx", "..xx"], { x: cl[3] }, onT, s > 0)
    lineC(C, B, hx, y0 + 2, hx, y0 + 14, line, onT); P(C, B, hx + 1, y0 + 6, un[3], onT); P(C, B, hx + 1, y0 + 11, un[3], onT)
    stamp(C, B, hx + 14, y0 + 14, [".x.", "xxx", ".x."], { x: ac[3] }, onT)
    if (L.extras.lanyard) lanyard(ctx, C, y0, onT)
  } else if (top === "overalls") {
    crew(ctx, C, y0, un, onT)
    // the bib and straps over the shirt
    for (let y = y0 + 20; y <= CLIP_Y; y++) for (let x = hx - 17; x <= hx + 17; x++) P(C, B, x, y, x > hx + 12 ? cl[1] : x < hx - 14 ? cl[3] : cl[2], onT)
    lineC(C, B, hx - 18, y0 + 20, hx + 18, y0 + 20, line, onT)
    for (const s of [-1, 1]) { for (let y = y0; y < y0 + 21; y++) for (let k = 0; k < 5; k++) P(C, B, hx + s * 13 + k - 2, y, k === 0 ? cl[3] : k === 4 ? cl[1] : cl[2], onT); stamp(C, B, hx + s * 13 - 1, y0 + 19, ["xx", "xx"], { x: L.metal[4] }, onT) }
    stamp(C, B, hx - 6, y0 + 25, ["xxxxxxxxxxxx", "x..........x", "xxxxxxxxxxxx"], { x: cl[1] }, onT)
  } else if (top === "workjacket" || top === "vest") {
    if (top === "vest") {
      crew(ctx, C, y0, un, onT)
      const vr = ramp(rgbToHex(ac[2]))
      for (let y = y0 + 2; y <= CLIP_Y; y++) for (let x = hx - S + 6; x <= hx + S - 6; x++) if (Math.abs(x - hx) > 6 + (y - y0) * 0.1) P(C, B, x, y, x > hx + S - 14 ? vr[1] : vr[2], onT)
      for (const s of [-1, 1]) lineC(C, B, hx + s * 7, y0 + 2, hx + s * 10, CLIP_Y, lineOf(vr), onT)
    } else {
      for (const s of [-1, 1]) stamp(C, B, hx + (s < 0 ? -nw - 6 : nw - 1), y0 - 2, ["xxxxx", ".xxxx", "..xxx", "...xx"], { x: cl[3] }, onT, s > 0)
      lineC(C, B, hx, y0 + 2, hx, CLIP_Y, line, onT)
      stamp(C, B, hx - 20, y0 + 10, ["xxxxxxx", "x.....x", "xxxxxxx"], { x: cl[1] }, onT)
    }
    // reflective stripes
    for (const yy of [y0 + 22, y0 + 32]) if (yy < CLIP_Y) for (let x = hx - S - 8; x <= hx + S + 8; x++) { P(C, B, x, yy, top === "vest" ? hexRgb("#D8E4E2") : ac[2], onBody); P(C, B, x, yy + 1, hexRgb("#F4F8F6"), onBody); P(C, B, x, yy + 2, top === "vest" ? hexRgb("#B8C4C2") : ac[1], onBody) }
  } else if (top === "flannel") {
    for (let y = y0; y <= CLIP_Y; y++) for (let x = hx - S - 8; x <= hx + S + 8; x++) {
      const id = B.at(x, y); if (!onBody(id)) continue
      const v = (x - hx + 64) % 10 < 2, h = (y - y0) % 10 < 2
      if (v || h) C[y * B.w + x] = mixc(C[y * B.w + x], INKLINE, v && h ? 0.4 : 0.22)
    }
    crew(ctx, C, y0, un, onT, true)
    for (const s of [-1, 1]) stamp(C, B, hx + (s < 0 ? -nw - 5 : nw - 1), y0 - 1, ["xxxx", ".xxx", "..xx"], { x: cl[3] }, onT, s > 0)
    lineC(C, B, hx, y0 + 8, hx, CLIP_Y, line, onT)
  } else if (top === "hoodie") {
    crew(ctx, C, y0, cl, onT)
    // the hood bunched behind the neck, the drawstrings
    for (let x = hx - nw - 8; x <= hx + nw + 8; x++) { P(C, B, x, y0 - 1, cl[1], onT); P(C, B, x, y0, cl[3], onT) }
    for (const s of [-1, 1]) { lineC(C, B, hx + s * 5, y0 + 4, hx + s * 6, y0 + 20, un[3], onT); P(C, B, hx + s * 6, y0 + 21, ac[2], onT); P(C, B, hx + s * 6, y0 + 22, ac[2], onT) }
    fold(hx - S + 14, y0 + 18, hx - S + 16, y0 + 32, 1)
  } else if (top === "sweater") {
    crew(ctx, C, y0, cl, onT)
    for (let x = hx - nw - 3; x <= hx + nw + 3; x += 2) lineC(C, B, x, y0, x, y0 + 3, cl[1], onT)
    for (let x = hx - S - 8; x <= hx + S + 8; x++) { P(C, B, x, y0 + 18, ac[2], onBody); if ((x + 1) % 4 < 2) P(C, B, x, y0 + 19, ac[3], onBody); P(C, B, x, y0 + 20, ac[2], onBody) }
  } else if (top === "cardigan") {
    crew(ctx, C, y0, un, onT)
    for (let y = y0 + 4; y <= CLIP_Y; y++) for (let x = hx - 6; x <= hx + 6; x++) P(C, B, x, y, x > hx + 3 ? un[1] : un[2], onT)
    for (const s of [-1, 1]) lineC(C, B, hx + s * 7, y0 + 4, hx + s * 7, CLIP_Y, line, onT)
    for (let k = 0; k < 4; k++) P(C, B, hx + 9, y0 + 8 + k * 7, ac[3], onT)
  } else if (top === "puffer") {
    crew(ctx, C, y0, un, onT)
    for (let yy = y0 + 8; yy <= CLIP_Y; yy += 9) for (let x = hx - S - 8; x <= hx + S + 8; x++) { P(C, B, x, yy, cl[1], onBody); P(C, B, x, yy - 3, cl[3], onBody) }
    lineC(C, B, hx, y0 + 6, hx, CLIP_Y, L.metal[3], onT)
  } else if (top === "tee") {
    crew(ctx, C, y0, cl, onT)
    stamp(C, B, hx - 3, y0 + 14, ["..xxx..", ".x...x.", "x.x.x.x", ".x...x.", "..xxx.."], { x: ac[3] }, onT)
    fold(hx - 14, y0 + 10, hx - 8, y0 + 26, 3)
  } else if (top === "longcoat" || top === "highcollar") {
    vee(24, nw + 2, un)
    for (const s of [-1, 1]) lineC(C, B, hx + s * (nw + 6), y0 + 4, hx + s * 4, y0 + 30, cl[3], onT)
    for (let k = 0; k < 3; k++) { P(C, B, hx - 12, y0 + 28 + k * 8, L.gold[3], onT); P(C, B, hx + 12, y0 + 28 + k * 8, L.gold[3], onT) }
    if (L.extras.fur && top === "longcoat") for (let k = 0; k < 26; k++) P(C, B, hx - 22 + ((k * 7) % 44), y0 - 6 + ((k * 5) % 16), hexRgb("#FBF6EC"), (n) => n === ctx.collarId)
    fold(hx - S + 14, y0 + 14, hx - S + 16, y0 + 34, 1)
  } else if (top === "silk") {
    // an open jacket over a silk blouse: the blouse in the middle with soft sheen, a draped neckline
    const bw = S - 20
    for (let y = y0 + 1; y <= CLIP_Y; y++) for (let x = hx - bw; x <= hx + bw; x++) P(C, B, x, y, (x * 2 + y) % 13 === 0 ? un[4] : x > hx + bw - 4 ? un[1] : x < hx - bw + 3 ? un[3] : un[2], onT)
    for (let x = hx - 9; x <= hx + 9; x++) { const dy = Math.round(8 * Math.sqrt(Math.max(0, 1 - ((x - hx) / 9.5) ** 2))); for (let y = y0; y < y0 + dy; y++) P(C, B, x, y, x > hx + 5 ? L.skin[1] : L.skin[2], onT); P(C, B, x, y0 + dy, un[3], onT) }
    for (const s of [-1, 1]) lineC(C, B, hx + s * (bw + 1), y0 + 1, hx + s * (bw + 1), CLIP_Y, lineOf(cl), onT)
  }
  if (L.extras.necklace) for (let x = -8; x <= 8; x++) P(C, B, hx + x, y0 + 3 + Math.round(x * x / 9), L.gold[x % 2 ? 3 : 4], (n) => n === ids.torso || n === ctx.neckId)
  if (L.extras.necklace && L.seed % 2) stamp(C, B, hx - 1, y0 + 10, [".x.", "xyx", ".x."], { x: L.gold[2], y: L.accent[3] }, (n) => n === ids.torso || n === ctx.neckId)
}
function crew(ctx, C, y0, r, ok, open = false) {
  const { L, B, hx } = ctx, nw = Math.round(L.rw * 0.42)
  // the neck hole: skin showing in a soft U, the collar's rib on its edge
  for (let x = hx - nw - 2; x <= hx + nw + 1; x++) {
    const d = Math.round(4 * Math.sqrt(Math.max(0, 1 - ((x - hx + 0.5) / (nw + 2.5)) ** 2)))
    for (let y = y0; y < y0 + d; y++) P(C, B, x, y, L.skin[1], ok)
    P(C, B, x, y0 + d, r[3], ok); P(C, B, x, y0 + d + 1, r[1], ok)
  }
  if (open) for (let y = y0 + 2; y < y0 + 10; y++) P(C, B, hx, y, L.skin[1], ok)
}
function lanyard(ctx, C, y0, ok) {
  const { L, B, hx } = ctx
  for (const s of [-1, 1]) lineC(C, B, hx + s * 10, y0, hx + s * 3, y0 + 24, L.accent[2], ok)
  stamp(C, B, hx - 5, y0 + 24, ["xxxxxxxxxx", "xaaaaaaaax", "xaaaaaaaax", "xxxxxxxxxx", "xggggggxxx", "xxxxxxxxxx", "xgggggggxx", "xxxxxxxxxx"], { x: hexRgb("#F4F1E8"), a: L.accent[2], g: hexRgb("#9AA294") }, ok)
}
function rgbToHex(c) { return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("") }

// ---------------------------------------------------------------- accessories over the face and head
function accessories(ctx, C) {
  const { L, B, hx, hy } = ctx, rw = L.rw, g = L.eyeGap, ey = hy + 3, any = () => true
  const dark = hexRgb("#1E1A24")
  if (L.extras.arglasses) {
    const vis = hexRgb("#38E8E0"), hi = hexRgb("#C4FFF6")
    for (let x = hx - g - 6; x <= hx + g + 6; x++) for (let y = ey - 3; y <= ey + 1; y++) P(C, B, x, y, (x + y) % 5 === 0 || y === ey - 3 ? hi : mixc(vis, C[y * B.w + x] || vis, 0.35), any)
    lineC(C, B, hx - g - 7, ey - 1, hx - rw, ey - 1, dark, any); lineC(C, B, hx + g + 7, ey - 1, hx + rw, ey - 1, dark, any)
  }
  if (L.extras.glasses) {
    for (const s of [-1, 1]) stamp(C, B, hx + s * g - 5, ey - 5, [".xxxxxxxxx.", "x.........x", "x.........x", "x.........x", "x.........x", "x.........x", ".xxxxxxxxx."], { x: dark }, any)
    lineC(C, B, hx - 2, ey - 3, hx + 1, ey - 3, dark, any)
  }
  if (L.extras.shades) {
    for (const s of [-1, 1]) { const cx = hx + s * g; stamp(C, B, cx - 5, ey - 4, ["xxxxxxxxxxx", "xyyyyyyyyyx", "xyyyyyyyyyx", ".xyyyyyyyx.", "..xxxxxxx.."], { x: dark, y: hexRgb("#2E2A3A") }, any); P(C, B, cx - 3, ey - 3, hexRgb("#8A98A2"), any); P(C, B, cx - 2, ey - 3, hexRgb("#8A98A2"), any) }
    lineC(C, B, hx - 2, ey - 3, hx + 1, ey - 3, dark, any)
  }
  if (L.extras.monocle) { const cx = hx + g; for (let a = 0; a < 24; a++) P(C, B, cx + Math.round(Math.cos(a / 24 * Math.PI * 2) * 5.5), ey + Math.round(Math.sin(a / 24 * Math.PI * 2) * 5), L.gold[3], any); lineC(C, B, cx + 5, ey + 4, cx + 9, ey + 22, L.gold[2], any) }
  if (L.extras.goggles) {
    const gy = L.hat === "hardhat" ? hy - 24 : hy - 18
    lineC(C, B, hx - rw - 2, gy + 1, hx + rw + 2, gy + 1, hexRgb("#2E3338"), any)
    for (const s of [-1, 1]) stamp(C, B, hx + s * 8 - 5, gy - 3, [".xxxxxxxx.", "xyyyyyyyyx", "xyzzyyyyyx", "xyyyyyyyyx", ".xxxxxxxx."], { x: hexRgb("#4A5258"), y: hexRgb("#E8B060"), z: hexRgb("#FFF0C8") }, any)
  }
  if (L.extras.headphones && !L.phonesOnNeck) {
    for (let a = 0; a <= 28; a++) { const t = Math.PI + a / 28 * Math.PI; P(C, B, hx + Math.cos(t) * (rw + 3), hy - 6 + Math.sin(t) * (rw + 5), hexRgb("#3A3F48"), any); P(C, B, hx + Math.cos(t) * (rw + 4), hy - 6 + Math.sin(t) * (rw + 6), hexRgb("#2A2E36"), any) }
    for (const s of [-1, 1]) stamp(C, B, hx + s * (rw + 1) - 3, hy - 2, [".xxxx.", "xyyyyx", "xyyyyx", "xyyyyx", "xyyyyx", ".xxxx."], { x: hexRgb("#2A2E36"), y: L.accent[2] }, any)
  }
  if (L.extras.earpiece) stamp(C, B, hx - rw - 3, hy + 1, [".xx.", "xyyx", ".xx."], { x: hexRgb("#2A2E36"), y: hexRgb("#38E8E0") }, any)
  if (L.extras.earrings) for (const s of [-1, 1]) { P(C, B, hx + s * (rw - 1), hy + 8, L.gold[4], any); P(C, B, hx + s * (rw - 1), hy + 9, L.gold[3], any); if (L.seed % 3 === 0) { P(C, B, hx + s * (rw - 1), hy + 10, L.accent[3], any); P(C, B, hx + s * (rw - 1), hy + 11, L.accent[2], any) } }
  if (L.hat === "clip") stamp(C, B, hx + 8, hy - 20, ["xxxxx", "yyyyy"], { x: L.accent[3], y: L.accent[1] }, any)
}

// ---------------------------------------------------------------- forearms and hands
function forearm(ctx, AB, arm, side) {
  const { L } = ctx, e = arm.e, h = arm.h
  const cyber = L.extras.cyberarm && side < 0
  const sleeve = L.top === "overalls" || L.top === "vest" ? L.under : L.cloth
  const bare = L.sleeve !== "long"
  const wx = h[0] + (e[0] - h[0]) * 0.2, wy = h[1] + (e[1] - h[1]) * 0.2
  const lean = (r) => ({ cls: r, shade: 4, deep: 1, lit: 2 })
  if (cyber) {
    const id = AB.shape(L.metal, lean(L.metal)); capsule(AB, id, e[0], e[1], wx, wy, 7, 5.5)
  } else if (bare) {
    const id = AB.shape(L.skin, { cls: "skin", shade: 3, lit: 1 }); capsule(AB, id, e[0], e[1], wx, wy, 6.5, 5)
    if (L.sleeve === "rolled") { const r = AB.shape(sleeve, lean(sleeve)); ellipse(AB, r, e[0], e[1], 9, 7) }
  } else {
    const id = AB.shape(sleeve, lean(sleeve)); capsule(AB, id, e[0], e[1], wx, wy, 8, 6.5)
    const cuffR = L.top === "suit" || L.top === "tux" || L.top === "waistcoat" ? L.under : sleeve
    const c = AB.shape(cuffR, lean(cuffR)); capsule(AB, c, wx + (e[0] - wx) * 0.14, wy + (e[1] - wy) * 0.14, wx, wy, 6.5, 6.5)
  }
  hand(ctx, AB, h, arm.hand, side, cyber)
}
function hand(ctx, AB, [x, y], kind, side, cyber) {
  const { L } = ctx, r = cyber ? L.metal : L.skin, id = AB.shape(r, { cls: "hand", shade: 3, lit: 2 })
  if (kind === "grip") { ellipse(AB, id, x, y, 8, 7); ellipse(AB, id, x - 6 * side, y - 6, 3.5, 3) }
  else if (kind === "fist") ellipse(AB, id, x, y, 8, 6.5)
  else if (kind === "thumb") { ellipse(AB, id, x, y + 3, 7, 6); capsule(AB, id, x - 2, y - 2, x - 2, y - 11, 2.6) }
  else if (kind === "palm" || kind === "flat") { ellipse(AB, id, x, y, 7, 7.5); for (let k = -4; k <= 4; k += 3) capsule(AB, id, x + k, y - 4, x + k * 1.1, y - 11, 1.6) }
  else if (kind === "ok") { ellipse(AB, id, x, y + 2, 6.5, 6); ellipse(AB, id, x - 3, y - 6, 3.5, 3.5); for (let k = 1; k <= 5; k += 2) capsule(AB, id, x + k, y - 3, x + k, y - 10, 1.4) }
}

// ---------------------------------------------------------------- reaction effects around the head
function fx(ctx, C) {
  const { B, hx, hy, ex, frame } = ctx, list = ex.fx || [], t = frame.tick || 0, any = () => true
  const W = hexRgb("#F4F8F6"), Y = hexRgb("#FFE27A"), Y2 = hexRgb("#FFB84A")
  for (const f of list) {
    if (f === "sparkle") for (const [dx, dy, s] of [[-34, -20, 2], [32, -28, 3], [36, -2, 2]]) { const c = (t + dx) % 2 ? Y : Y2; for (let k = -s; k <= s; k++) { P(C, B, hx + dx + k, hy + dy, c, any); P(C, B, hx + dx, hy + dy + k, c, any) } P(C, B, hx + dx, hy + dy, W, any) }
    if (f === "sweat") stamp(C, B, hx + 24, hy - 14 + (t % 2), ["..x..", ".xyx.", "xyyyx", "xyyzx", ".xxx."], { x: hexRgb("#4A8AB0"), y: hexRgb("#9CE0F0"), z: W }, any)
    if (f === "steam") for (const [dx, dy] of [[-14, -40], [0, -44], [14, -40]]) { const o = t % 2; lineC(C, B, hx + dx, hy + dy - o, hx + dx + 2, hy + dy - 4 - o, W, any); lineC(C, B, hx + dx + 2, hy + dy - 4 - o, hx + dx, hy + dy - 8 - o, W, any) }
    if (f === "shake") for (const s of [-1, 1]) for (let k = 0; k < 3; k++) lineC(C, B, hx + s * (32 + k * 2), hy - 10 + k * 7, hx + s * (36 + k * 2), hy - 10 + k * 7, W, any)
    if (f === "heart") stamp(C, B, hx + 28, hy - 38 - (t % 2), [".xx.xx.", "xyyxyyx", "xyyyyyx", ".xyyyx.", "..xyx..", "...x..."], { x: hexRgb("#B4304E"), y: hexRgb("#FF6A8A") }, any)
    if (f === "bang") stamp(C, B, hx + 32, hy - 42, [".xx.", "xyyx", "xyyx", "xyyx", ".xx.", "....", ".xx.", "xyyx", ".xx."], { x: hexRgb("#B4501E"), y: Y }, any)
    if (f === "gloom") for (let k = 0; k < 4; k++) lineC(C, B, hx - 12 + k * 8, hy - 44, hx - 12 + k * 8, hy - 36 + (k % 2) * 2, hexRgb("#6E7C96"), any)
    if (f === "note") stamp(C, B, hx + 28, hy - 36 - (t % 2), ["...xx", "...xy", "...x.", "xxxx.", "xyyx.", ".xx.."], { x: hexRgb("#B4501E"), y: Y }, any)
    if (f === "dots") for (let k = 0; k < 3; k++) stamp(C, B, hx + 24 + k * 5, hy - 34, ["xx", "xx"], { x: W }, any)
  }
}

// ---------------------------------------------------------------- reactions
// Expressions by crowd and how much they liked it. Luxury barely moves; industrial goes all out. A few variants per tier
// so two guests don't react the same way: face (eyes, brows, mouth, fx, blush), the free arm's gesture, whether the
// glass is held up (a small toast) or set down, and how much they bounce.
export const REACTIONS = {
  luxury: {
    Great: [
      { eyes: "half", brows: "oneup", mouth: "softsmile", hold: "toast", gesture: "rest" },
      { eyes: "half", brows: "raised", mouth: "smirk", hold: "toast", gesture: "rest" },
      { eyes: "closed", brows: "raised", mouth: "softsmile", hold: "down", gesture: "chin" },
    ],
    Good: [
      { eyes: "open", brows: "oneup", mouth: "smirk", hold: "down", gesture: "rest" },
      { eyes: "half", brows: "neutral", mouth: "softsmile", hold: "toast", gesture: "rest" },
    ],
    Meh: [
      { eyes: "half", brows: "oneup_l", mouth: "flat", hold: "down", gesture: "rest" },
      { eyes: "side", brows: "neutral", mouth: "pursed", hold: "down", gesture: "chin" },
    ],
    Bad: [
      { eyes: "narrow", brows: "furrow", mouth: "pursed", hold: "down", gesture: "push" },
      { eyes: "closed", brows: "oneup", mouth: "tight", hold: "down", gesture: "rest" },
    ],
  },
  commercial: {
    Great: [
      { eyes: "open", brows: "raised", mouth: "grin", hold: "down", gesture: "thumb", fx: ["sparkle"], bounce: 1 },
      { eyes: "happy", brows: "raised", mouth: "grin", hold: "toast", gesture: "ok", fx: ["sparkle"], bounce: 1 },
    ],
    Good: [
      { eyes: "open", brows: "raised", mouth: "smile", hold: "down", gesture: "thumb" },
      { eyes: "happy", brows: "neutral", mouth: "smile", hold: "down", gesture: "ok" },
    ],
    Meh: [
      { eyes: "open", brows: "worried", mouth: "tight", hold: "down", gesture: "rest", fx: ["dots"] },
      { eyes: "side", brows: "raised", mouth: "wavy", hold: "down", gesture: "rest" },
    ],
    Bad: [
      { eyes: "open", brows: "worried", mouth: "grimace", hold: "down", gesture: "push", fx: ["sweat"] },
      { eyes: "narrow", brows: "furrow", mouth: "tight", hold: "down", gesture: "push", fx: ["sweat"] },
    ],
  },
  residential: {
    Great: [
      { eyes: "happy", brows: "raised", mouth: "grin", hold: "down", gesture: "chest", fx: ["heart"], blush: true, bounce: 1 },
      { eyes: "happy", brows: "raised", mouth: "laugh", hold: "toast", gesture: "rest", fx: ["note"], blush: true, bounce: 1 },
    ],
    Good: [
      { eyes: "happy", brows: "neutral", mouth: "smile", hold: "down", gesture: "chest", blush: true },
      { eyes: "open", brows: "raised", mouth: "grin", hold: "down", gesture: "wave" },
    ],
    Meh: [
      { eyes: "open", brows: "worried", mouth: "wavy", hold: "down", gesture: "shrug" },
      { eyes: "side", brows: "oneup", mouth: "flat", hold: "down", gesture: "shrug" },
    ],
    Bad: [
      { eyes: "squeeze", brows: "furrow", mouth: "grimace", hold: "down", gesture: "push", fx: ["gloom"] },
      { eyes: "wide", brows: "worried", mouth: "wavy", hold: "down", gesture: "rest", fx: ["sweat"] },
    ],
  },
  industrial: {
    Great: [
      { eyes: "squeeze", brows: "high", mouth: "laugh", hold: "down", gesture: "fist", fx: ["bang", "sparkle"], bounce: 2, pump: true },
      { eyes: "wide", brows: "high", mouth: "laugh", hold: "toast", gesture: "fist", fx: ["sparkle"], bounce: 2, pump: true },
      { eyes: "happy", brows: "high", mouth: "grin", hold: "down", gesture: "thumb", fx: ["bang"], bounce: 2 },
    ],
    Good: [
      { eyes: "happy", brows: "raised", mouth: "grin", hold: "down", gesture: "thumb", bounce: 1 },
      { eyes: "open", brows: "raised", mouth: "grin", hold: "toast", gesture: "fist", bounce: 1 },
    ],
    Meh: [
      { eyes: "narrow", brows: "furrow", mouth: "wavy", hold: "down", gesture: "shrug", fx: ["dots"] },
      { eyes: "side", brows: "oneup", mouth: "frown", hold: "down", gesture: "rest" },
    ],
    Bad: [
      { eyes: "squeeze", brows: "furrow", mouth: "tongue", hold: "down", gesture: "push", fx: ["shake", "steam"], bounce: 2, shudder: true },
      { eyes: "wide", brows: "worried", mouth: "grimace", hold: "down", gesture: "push", fx: ["shake"], bounce: 1, shudder: true },
      { eyes: "squeeze", brows: "furrow", mouth: "grimace", hold: "down", gesture: "wave", fx: ["steam"], bounce: 2, shudder: true },
    ],
  },
}

// ---------------------------------------------------------------- canvases, cached per look and frame
const cache = new Map()
export function frameCanvases(look, frame, makeCanvas) {
  const key = look.seed + ":" + look.crowd + ":" + JSON.stringify(frame)
  let hit = cache.get(key)
  if (hit) return hit
  const g = drawGuest(look, frame)
  const toCanvas = (b) => {
    const cv = makeCanvas(b.w, b.h), cx = cv.getContext("2d"), img = cx.createImageData(b.w, b.h)
    for (let i = 0; i < b.w * b.h; i++) { const c = b.c[i]; if (!c) continue; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255 }
    cx.putImageData(img, 0, 0)
    return cv
  }
  hit = { body: toCanvas(g.body), front: toCanvas(g.front), glass: g.glass, head: g.head }
  if (cache.size > 400) cache.clear()
  cache.set(key, hit)
  return hit
}
