// NEON TERRARIUM cover, 630x500, a 48-frame loop at 12 fps. The picture is rasterized into one
// buffer (so glows, the title and the scanlines can read what is already there): the still parts
// are built once, then each frame copies that and adds what moves. Everything is driven by the
// frame index, never by chance, so the loop closes.
const W = 630, H = 500, FRAMES = 48

const PAL = {
  // sky, blue-violet at the top -> magenta -> pink near the city
  0: "#34389f", 1: "#4439a8", 2: "#5c3fae", 3: "#7646ac", 4: "#964ca6", 5: "#b4529f", 6: "#d0629d",
  // clouds: lit top, mauve, plum, shadow
  a: "#c4669f", b: "#ac518d", c: "#8f4388", d: "#6f3a7c",
  // walls, as (plate top / lit side / shadow side): brown, brick, plum, burnt orange
  B: "#7a5038", K: "#7a4a36", k: "#5a3a30",
  R: "#7a4044", r: "#6a3a3e", u: "#4a2a30",
  P: "#5a4254", p: "#4a3448", q: "#34243a",
  O: "#8e5634", L: "#7a4a2c", l: "#54301f",
  // lit glass: amber, orange, pale core, cyan, dark glass, teal, violet, green
  y: "#ffc94a", o: "#ff9a3a", h: "#ffe9a0", n: "#5ef0ff", w: "#1a1424", v: "#2fd6c6", V: "#8a5bff", N: "#3ae88a",
  // neon trim: hot pink, magenta, yellow
  H: "#ff4fb0", M: "#e02fd0", Y: "#ffd23a",
  // plants, terracotta pots; helipad dark, stone tile, grout
  g: "#3f7046", e: "#2f5a3c", T: "#c4602e", D: "#2a2438", S: "#8a6a5a", s: "#6a4a44",
  // title: coral, purple, mint, ink, pale pink
  C: "#ff4a6e", X: "#3b1a5c", G: "#3dffcf", I: "#170f3a", J: "#f7c6d6",
  // star cream, pale pink-white, red lights
  F: "#fff0d0", W: "#ffe6ee", x: "#ff3b4a",
  // dim window light: amber, brown-orange, teal, soft purple; dusk violet haze; helipad ochre
  m: "#c9803a", j: "#a8603a", t: "#4fb8c8", z: "#8a6ad0", Q: "#61298a", Z: "#8a6a3a",
}
pal(PAL)
const KEYS = Object.keys(PAL).join("")
const IDX = {}
for (let i = 0; i < KEYS.length; i++) IDX[KEYS[i]] = i

let fb = new Uint8Array(W * H)
let recordCity = false, curLevel = 0
const DEPTH = new Uint8Array(W * H), CITY = new Uint8Array(W * H)
const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H
const put = (x, y, k) => {
  if (!inb(x, y)) return
  const i = IDX[k]
  if (i === undefined) throw new Error("no palette key " + k)
  const p = y * W + x
  fb[p] = i
  if (recordCity) { CITY[p] = 1; DEPTH[p] = curLevel }
}
const get = (x, y) => (inb(x, y) ? KEYS[fb[y * W + x]] : null)
const rectK = (x, y, w, h, k) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, k) }
const hlineK = (x, y, w, k) => { for (let i = 0; i < w; i++) put(x + i, y, k) }
const vlineK = (x, y, h, k) => { for (let j = 0; j < h; j++) put(x, y + j, k) }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const ih = (a, b = 0, s = 0) => {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const lerpPoly = (k, x) => {
  if (x <= k[0][0]) return k[0][1]
  for (let i = 1; i < k.length; i++) if (x <= k[i][0]) { const t = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0]); return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * t }
  return k[k.length - 1][1]
}

// small grid sprite, anchored bottom-center at (x, y)
const spr = (x, y, rows, map) => {
  const w = rows[0].length, h = rows.length
  const x0 = x - (w >> 1), y0 = y - h + 1
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][i]
    if (ch !== ".") put(x0 + i, y0 + j, map ? map[ch] || ch : ch)
  }
}

// what the animation later flips: each record keeps the pixels it painted and what lay under them
const REC = { win: new Map(), signs: [], tips: [], stars: [], trims: [] }
const paintPts = (pts, sink) => {
  for (const [x, y, k] of pts) { if (!inb(x, y)) continue; sink.push([x, y, k, get(x, y)]); put(x, y, k) }
}

// ================================================================ sky
const SKYV = (x, y) => {
  let v = 6.2 * Math.pow(clamp(y / 400, 0, 1), 0.95)
  v += 0.9 * Math.exp(-Math.hypot((x - 400) / 1.5, y - 340) / 130)
  v -= 0.5 * clamp((x - 330) / 300, 0, 1) * clamp(1 - y / 260, 0, 1)      // bluer at the top right
  return clamp(v, 0, 6)
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = SKYV(x, y), i = Math.floor(v)
  const f = clamp((v - i - 0.5) * 3 + 0.5, 0, 1)
  put(x, y, "0123456"[Math.min(6, i + (f > bay(x, y) ? 1 : 0))])
}
// a fine scatter of stars
for (let y = 0; y < 430; y++) for (let x = 0; x < W; x++) {
  const r = ih(x, y, 77)
  if (r < 0.0036) put(x, y, y < 150 ? "3" : "5")
  else if (r < 0.0048) { put(x, y, "F"); REC.stars.push([x, y]) }
  else if (r < 0.00533) { put(x, y, "F"); put(x - 1, y, "4"); put(x + 1, y, "4"); put(x, y - 1, "4"); put(x, y + 1, "4"); REC.stars.push([x, y]) }
}

// ================================================================ clouds
const cloud = (cx, cy, s, seed, opts = {}) => {
  const circles = []
  const n = opts.n || 6
  const span = (opts.span || 150) * s
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const bump = Math.sin(t * Math.PI)
    const r = (16 + 14 * ih(i, seed, 1) + 14 * bump) * s
    circles.push([cx + (t - 0.5) * span + (ih(i, seed, 2) - 0.5) * 10 * s, cy - bump * 8 * s + (ih(i, seed, 3) - 0.5) * 8 * s, r])
    if (i % 2 === 0) circles.push([cx + (t - 0.5) * span * 0.8, cy - (14 + 16 * bump) * s - ih(i, seed, 4) * 8 * s, r * (0.8 + 0.2 * ih(i, seed, 5))])
  }
  circles.sort((p, q) => p[1] - q[1])
  let top = Infinity, bot = -Infinity
  for (const [, y, r] of circles) { top = Math.min(top, y - r); bot = Math.max(bot, y + r * 0.55) }
  for (const [ccx, ccy, r] of circles) {
    for (let y = Math.floor(ccy - r); y <= Math.ceil(ccy + r); y++) for (let x = Math.floor(ccx - r); x <= Math.ceil(ccx + r); x++) {
      const dx = x + 0.5 - ccx, dy = y + 0.5 - ccy
      if (dx * dx + dy * dy > r * r) continue
      let l = (-(dx * 0.32) - dy * 0.95) / r * 0.62
      l += (0.5 - (y - top) / Math.max(1, bot - top)) * 0.7
      l += (bay(x, y) - 0.5) * 0.22
      put(x, y, l > 0.5 ? "a" : l > 0.12 ? "b" : l > -0.26 ? "c" : "d")
    }
  }
}
// big soft round clouds: behind the city in the middle and upper right, and a few at the lower left
cloud(352, 38, 0.95, 21, { n: 5, span: 120 })
cloud(412, 88, 0.8, 22, { n: 4, span: 90 })
cloud(318, 168, 1.15, 23, { n: 6, span: 170 })
cloud(396, 138, 0.75, 24, { n: 4, span: 90 })
cloud(268, 232, 1.2, 25, { n: 6, span: 170 })
cloud(478, 12, 0.8, 26, { n: 4, span: 110 })
cloud(586, 14, 0.9, 27, { n: 4, span: 120 })
cloud(608, 122, 0.8, 28, { n: 4, span: 90 })
cloud(512, 210, 0.7, 29, { n: 4, span: 90 })
cloud(10, 238, 0.95, 30, { n: 5, span: 100 })
cloud(86, 304, 0.95, 31, { n: 5, span: 120 })
cloud(606, 306, 1.0, 32, { n: 5, span: 120 })

// ================================================================ iso city
const PXs = (a, b) => Math.round((a - b) * 8)
const PYs = (a, b) => Math.round((a + b) * 4)

// the roof line the city climbs along, and where its back row of ground sits under it
const TKN = [[136, 455], [160, 392], [195, 388], [215, 345], [250, 308], [272, 332], [300, 350], [322, 232], [345, 290], [372, 304], [395, 226], [425, 232], [450, 262], [480, 276], [510, 284], [532, 300], [575, 326], [605, 346], [640, 356]]
const roofLine = (x) => lerpPoly(TKN, x)
const backLine = (x) => (x < 224 ? lerpPoly([[136, 508], [205, 500], [224, roofLine(224) + 60]], x) : roofLine(x) + 60)
const cellOK = (a, b) => {
  const cx = 8 * (a - b), cy = 4 * (a + b) + 4
  return cx >= 138 && cx <= 690 && cy >= backLine(cx) && cy <= 575
}

// ---------------------------------------------------------------- distance haze and a grounding gradient
// every pixel a building paints remembers how far back it stands (DEPTH, in 1/20ths of a blend toward
// the dusk violet); after the city is drawn each colour is blended and snapped back onto the palette
const KEYRGB = {}
for (const k of KEYS) { const hx = PAL[k]; KEYRGB[k] = [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)] }
const SNAP = [...KEYS].filter((k) => !"CXGIJabcdFW".includes(k))
const nearestKey = (r, g, b) => {
  let best = "0", bd = 1e9
  for (const k of SNAP) { const c = KEYRGB[k]; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = k } }
  return best
}
const levelFor = (yBase) => {
  const f = yBase >= 500 ? 0 : yBase >= 470 ? 0.3 * (500 - yBase) / 30 : 0.3 + 0.2 * clamp((470 - yBase) / 140, 0, 1)
  return Math.round(f * 20)
}
const hazeCache = new Map()
const hazeKey = (k, level) => {
  if (!level) return k
  const ck2 = level * 128 + IDX[k]
  let r = hazeCache.get(ck2)
  if (!r) { const f = level / 20, c = KEYRGB[k], v = KEYRGB.Q; r = nearestKey(c[0] * (1 - f) + v[0] * f, c[1] * (1 - f) + v[1] * f, c[2] * (1 - f) + v[2] * f); hazeCache.set(ck2, r) }
  return r
}
const darkCache = new Map()
const darkKey = (k, amt) => {
  const ck2 = Math.round(amt * 10) * 128 + IDX[k]
  let r = darkCache.get(ck2)
  if (!r) { const a = Math.round(amt * 10) / 10, c = KEYRGB[k], v = KEYRGB.w; r = nearestKey(c[0] * (1 - a) + v[0] * a, c[1] * (1 - a) + v[1] * a, c[2] * (1 - a) + v[2] * a); darkCache.set(ck2, r) }
  return r
}
const GROUND_Y = 440
const grounded = (x, y, k) => {
  if (y < GROUND_Y) return k
  const t = (y - GROUND_Y) / (H - GROUND_Y)
  return bay(x, y) < Math.min(1, t * 1.15) ? darkKey(k, 0.12 + 0.33 * t) : k
}
// what a raw key becomes at (x, y) once the haze and the gradient are on it
const FK = (x, y, k) => { const i = y * W + x; const kk = hazeKey(k, DEPTH[i]); return CITY[i] ? grounded(x, y, kk) : kk }

// ---------------------------------------------------------------- glow
const EMIT = new Set("yohnvVNHMYWFxg")
const glowAround = (pts, k, reach = 2, sink) => {
  const set = new Set(pts.map(([x, y]) => x + y * W))
  for (const [x, y] of pts) for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const d = Math.abs(dx) + Math.abs(dy)
    if (d === 0 || d > reach) continue
    const nx = x + dx, ny = y + dy
    if (!inb(nx, ny) || set.has(nx + ny * W)) continue
    if (EMIT.has(get(nx, ny))) continue
    if (d === 1 ? ((nx + ny) & 1) === 0 : (nx & 1) === 0 && (ny & 1) === 0) {
      if (sink) sink.push([nx, ny, k, get(nx, ny)])
      put(nx, ny, k)
    }
  }
}
// the dithered halo a trim line throws on what lies below it
const glowDown = (pts, k, sink) => {
  for (const [x, y] of pts) {
    for (const [dy, dens] of [[1, 0.42], [2, 0.12]]) {
      const ny = y + dy
      if (!inb(x, ny) || EMIT.has(get(x, ny))) continue
      if (bay(x, ny) < dens) { sink.push([x, ny, k, get(x, ny)]); put(x, ny, k) }
    }
  }
}

// ---------------------------------------------------------------- an iso box with its faces as functions
function isoBox(a0, b0, w, d, h, z0, fn) {
  const xl = PXs(a0, b0 + d), yBL = PYs(a0, b0 + d) - z0, wl = Math.round(8 * w)
  const xf = PXs(a0 + w, b0 + d), yF = PYs(a0 + w, b0 + d) - z0, wr = Math.round(8 * d)
  if (fn.L) for (let u = 0; u < wl; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) { const k = fn.L(u, r, wl, h, xl + u, yBL - h + off + r); if (k) put(xl + u, yBL - h + off + r, k) } }
  if (fn.R) for (let u = 0; u < wr; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) { const k = fn.R(u, r, wr, h, xf + u, yF - h - off + r); if (k) put(xf + u, yF - h - off + r, k) } }
  const z = z0 + h
  if (fn.T) {
    const xs = PXs(a0, b0 + d), xe = PXs(a0 + w, b0), ys = PYs(a0, b0) - z, ye = PYs(a0 + w, b0 + d) - z
    const ins = (x, y) => {
      const u = (x + 0.5) / 8, v = (y + 0.5 + z) / 4
      const a = (u + v) / 2, b = (v - u) / 2
      return a >= a0 && a < a0 + w && b >= b0 && b < b0 + d
    }
    for (let y = ys; y <= ye; y++) for (let x = xs; x <= xe; x++) {
      if (!ins(x, y)) continue
      const u = (x + 0.5) / 8, v = (y + 0.5 + z) / 4
      const a = (u + v) / 2, b = (v - u) / 2
      const k = fn.T(x, y, { a, b, low: !ins(x, y + 1), up: !ins(x, y - 1), side: !ins(x - 1, y) || !ins(x + 1, y) })
      if (k) put(x, y, k)
    }
  }
  return {
    wl, wr, h, z,
    L: (u, r) => [xl + u, yBL - h + ((u + 1) >> 1) + r],
    R: (u, r) => [xf + u, yF - h - ((u + 1) >> 1) + r],
    pt: (a, b) => [PXs(a, b), PYs(a, b) - z],
  }
}

// ---------------------------------------------------------------- building parts
const FAMS = [
  { top: "B", L: "K", R: "k" }, { top: "R", L: "r", R: "u" }, { top: "P", L: "p", R: "q" }, { top: "O", L: "L", R: "l" },
]
const TRIMC = ["H", "H", "H", "H", "M", "M", "M", "n", "n", "n", "Y"]

const PLANT = [".g.g.", "ggegg", ".TTT."]
const BUSH = ["..ggg..", ".ggegg.", "ggeggeg", ".TTTTT."]
const PALM = ["g.g.g", ".ggg.", "g.e.g", "..e..", "..K..", "..K.."]
const TREE = ["..ggg..", ".ggegg.", "ggegegg", ".geggg.", "..eKe..", "...K...", "...K..."]
const TANK = ["..BBB..", ".BBBBK.", "BBBBKKk", "BBBKKkk", "BBKKKkk", "KKKKKkk", ".k...k.", ".k...k.", ".k...k."]
const AC = ["SSSSSs", "SqqqSs", "SqqqSs", "ssssss"]
const DISH = ["SSSSSSS", ".SSSSS.", "..sSs..", "...q...", "...q...", "..qqq.."]
const KIOSK = ["NNNN", "wyyw", "wyyw", "TTTT"]
const HGLYPH = ["Y...Y", "Y...Y", "Y...Y", "YYYYY", "Y...Y", "Y...Y", "Y...Y"]
const antenna = (x, y, L, id) => {
  vlineK(x, y - L, L, "q"); hlineK(x - 2, y - L + 3, 5, "q"); hlineK(x - 1, y - L + 6, 3, "q")
  const rec = []
  paintPts([[x, y - L - 1, "x"], [x - 1, y - L - 1, "4"], [x + 1, y - L - 1, "4"]], rec)
  REC.tips.push({ pts: rec, ph: (id * 5) % 12 })
}
const pod = (x, y, rx, hgt, wk) => {
  // upright capsule: a dome on a drum, plum body, one big glowing window filling its front
  for (let j = 0; j < hgt; j++) {
    const t = j / (hgt - 1)
    const hw = t < 0.5 ? Math.round(rx * Math.sqrt(1 - Math.pow(1 - t * 2, 2))) : rx
    for (let i = -hw; i <= hw; i++) put(x + i, y - hgt + 1 + j, j === 0 || (j < 3 && Math.abs(i) === hw) ? "P" : i > rx * 0.4 ? "q" : "p")
  }
  const wy = y - Math.round(hgt * 0.45), wr = Math.max(3, rx - 1), wh = Math.max(3, Math.round(hgt * 0.3))
  for (let j = -wh; j <= wh; j++) for (let i = -wr; i <= wr; i++) {
    if ((i * i) / (wr * wr) + (j * j) / (wh * wh) <= 1.0) put(x + i, wy + j, wk === "n" ? (j < -wh / 3 ? "n" : "t") : (i < -wr / 3 && j < -wh / 3 ? "y" : j > wh / 2 ? "j" : "m"))
  }
  hlineK(x - rx, y, rx * 2 + 1, "q")
}
// an upright glass screen on a thin frame, following the left walls' slope
const screenPanel = (x, y, w, hgt, k) => {
  const pts = []
  const top = y - hgt - 3
  vlineK(x + 1, y - 3, 3, "q"); vlineK(x + w - 2, y - 3 + ((w - 2) >> 1), 3, "q")
  for (let u = 0; u < w; u++) for (let j = 0; j < hgt; j++) {
    const yy = top + (u >> 1) + j
    const edge = u === 0 || u === w - 1 || j === 0 || j === hgt - 1
    if (edge) { put(x + u, yy, "w"); pts.push([x + u, yy]) }
    else put(x + u, yy, ((u + j) & 1) === 0 || j === 1 ? k : bay(u, j) < 0.4 ? k : "w")
  }
  for (let u = 1; u < w - 1; u++) put(x + u, top + (u >> 1), k)
  glowAround(pts, k, 2)
}
const addSign = (cells, col, wallKeys) => {
  const rec = { pts: [], glow: [] }
  paintPts(cells, rec.pts)
  const xy = cells.map(([x, y]) => [x, y])
  glowAround(xy, col, 2, rec.glow)
  let low = -Infinity
  for (const [, y] of xy) low = Math.max(low, y)
  const xs = xy.map(([x]) => x), x0 = Math.min(...xs), x1 = Math.max(...xs)
  for (let y = low + 3; y <= low + 5; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (wallKeys.includes(get(x, y)) && ((x + y) & 3) === 0) { rec.glow.push([x, y, col, get(x, y)]); put(x, y, col) }
  }
  REC.signs.push(rec)
}
// glyph-like lettering: a 3x3 pattern from a hash
const glyph3 = (seed) => { const rows = []; for (let j = 0; j < 3; j++) { let r = ""; for (let i = 0; i < 3; i++) r += ih(seed, j * 3 + i, 71) < 0.58 ? "X" : "."; rows.push(r) } return rows }

// ---------------------------------------------------------------- a stack of cantilevered floor plates
function paneKey(o, side, col, f, pr, pc, lit) {
  const id = o.id
  if (o.bright) {
    const q = ih(id * 131 + col, f * 7 + (side === "L" ? 1 : 2), 11)
    if (!lit) return q < 0.08 ? "o" : "D"
    if (q > 0.93) return "D"
    if (o.glass === "white") return pr < pc - 1 ? (q < 0.25 ? "h" : "F") : "h"
    const t = ih(id + col * 3, f, 5)
    if (t < 0.05) return "v"
    if (t < 0.08) return "V"
    if (t < 0.16) return pr === 0 ? "h" : "y"
    return pr < pc - 1 ? (t < 0.55 ? "o" : "y") : "o"
  }
  if (!lit) return "w"
  const t = ih(id + col * 3, f, 5)
  if (t < 0.125) return t < 0.06 ? "t" : "z"          // about 1 in 8 is cool
  if (t < 0.3) return pr === 1 ? "y" : "m"             // gold only as a small scattered spark
  return side === "L" ? (t < 0.65 ? "m" : "j") : "j"
}
function stack(o) {
  const { a, b, w, d, n, fh, fam, id } = o
  let z = o.z0 || 0
  const post = []
  let roofBox = null
  for (let f = 0; f < n; f++) {
    const last = f === n - 1
    const dx = o.twist ? Math.round(o.twist * Math.sin(f * 1.37 + id)) : 0
    const grow = o.over && f >= n * 0.45 ? o.over : 0
    const A = a + dx / 16 - grow, B = b - dx / 16 - grow, Wd = w + 2 * grow, Dd = d + 2 * grow
    const ins = 0.22, hb = fh - 2
    const fq = ih(id, f, 3), ff = fq < 0.3 ? 0.35 : fq < 0.7 ? 1.0 : 1.6      // some floors dark, some busier
    const mk = (side) => (u, r, wW, h, x, y) => {
      const base = side === "L" ? fam.L : fam.R
      if (r === 0) return side === "L" ? fam.R : "w"
      if (r === h - 1 || u < 1 || u > wW - 2) return base
      const pos = (u - 1) % (o.pw + 1)
      if (pos === o.pw) return o.bright ? "D" : "w"
      const col = Math.floor((u - 1) / (o.pw + 1)), pr = r - 1, pc = h - 2
      const lit = o.bright ? fq < (o.litP ?? 0.8) : (col % 4 !== 3 && ih(id * 131 + col, f * 7 + (side === "L" ? 1 : 2), 17) < 0.4 * ff)
      const k = paneKey(o, side, col, f, pr, pc, lit)
      const wid = (id * 2 + (side === "L" ? 0 : 1)) * 65536 + col * 64 + (f & 63)
      let rec = REC.win.get(wid)
      if (!rec) { rec = { pts: [], lit: "yohnvVNFhmjtz".includes(k) }; REC.win.set(wid, rec) }
      rec.pts.push([x, y, k])
      return k
    }
    isoBox(A + ins, B + ins, Wd - 2 * ins, Dd - 2 * ins, hb, z, { L: mk("L"), R: mk("R") })
    const trimOn = o.trimAll ? (last ? true : ih(id, f, 9) < (o.trimP ?? 0.4)) : (o.trimB && f >= n - 2)
    const trimC = (f % 4 === 2 ? o.trims[1] : o.trims[0])
    const rec = { pts: [], glow: [] }
    const roofFn = last && o.roofFn
    const pl = isoBox(A, B, Wd, Dd, 2, z + hb, {
      L: (u, r) => (r === 0 ? fam.top : fam.L), R: (u, r) => (r === 0 ? fam.L : fam.R),
      T: (x, y, i) => {
        if (trimOn && i.low) { rec.pts.push([x, y, trimC, fam.top]); return trimC }
        if (roofFn) { const k = roofFn(x, y, i); if (k) return k }
        return (i.low || i.up || i.side) ? fam.top : (bay(x, y) < 0.22 ? "p" : "q")
      },
    })
    if (rec.pts.length) { glowDown(rec.pts, trimC, rec.glow); REC.trims.push(rec) }
    // decorations that go on after the whole stack: pots and plants on the plate, vines below
    if (!last || o.roofPlants) post.push(() => {
      for (const side of ["L", "R"]) {
        const ww = side === "L" ? pl.wl : pl.wr
        for (let u = 3; u < ww - 3; u += 5) {
          const q = ih(id * 17 + f, u + (side === "L" ? 0 : 99), 8)
          if (q < (o.plantP ?? 0.45)) {
            const [x, y] = pl[side](u, -1)
            put(x, y, "T"); put(x + 1, y, "T"); put(x, y - 1, "g"); put(x + 1, y - 1, "g")
            if (q < 0.15) { put(x - 1, y - 1, "e"); put(x, y - 2, "g") }
            if (q < 0.1) put(x + 1, y - 2, "e")
          } else if (q < 0.62) {
            const [x, y] = pl[side](u, 2)
            const len = 3 + Math.floor(ih(id, u + f, 6) * 5)
            for (let k = 0; k < len; k++) put(x, y + k, k % 2 ? "e" : "g")
          }
        }
      }
    })
    z += fh
    roofBox = pl
  }
  for (const fn of post) fn()
  return { z, roofBox }
}

// a cylinder tower: stacked elliptical bands with curved ring plates
function cylinder(o) {
  const { cx, cy0, rx, ry, n, fh, fam, id } = o
  let z = 0
  const ncol = Math.max(6, Math.round(rx / 2.2))
  const pk = (x, rr) => Math.floor((Math.asin(clamp((x - cx) / rr, -1, 1)) + Math.PI / 2) / (Math.PI / ncol))
  for (let f = 0; f < n; f++) {
    const last = f === n - 1
    const fq = ih(id, f, 3), ff = fq < 0.3 ? 0.35 : fq < 0.7 ? 1.0 : 1.6, hb = fh - 2, rb = 0.88
    const trimC = o.trims[0], trimOn = o.trimB && f >= n - 2
    for (let x = Math.ceil(cx - rx * rb); x <= Math.floor(cx + rx * rb); x++) {
      const t = (x + 0.5 - cx) / (rx * rb)
      if (Math.abs(t) >= 1) continue
      const dy = ry * rb * Math.sqrt(1 - t * t)
      const yb = Math.round(cy0 - z + dy)
      const mull = pk(x, rx * rb) !== pk(x - 1, rx * rb)
      const col = pk(x, rx * rb)
      for (let r = 0; r < hb; r++) {
        const y = yb - hb + r
        const tone = t < -0.25 ? fam.L : t > 0.35 ? fam.R : (bay(x, y) < 0.5 ? fam.L : fam.R)
        let k = tone
        if (r === 0) k = "w"
        else if (r < hb - 1) {
          if (mull) k = "w"
          else {
            const q = ih(id * 131 + col, f * 7, 17), tt = ih(id + col * 3, f, 5)
            k = col % 4 !== 3 && q < 0.4 * ff ? (tt < 0.125 ? "t" : tt < 0.3 && r === 2 ? "y" : tt > 0.65 || t > 0.4 ? "j" : "m") : "w"
          }
        }
        put(x, y, k)
      }
    }
    const rec = { pts: [], glow: [] }
    const yTopC = cy0 - (z + fh)
    for (let x = Math.ceil(cx - rx); x <= Math.floor(cx + rx); x++) {
      const t = (x + 0.5 - cx) / rx
      if (Math.abs(t) >= 1) continue
      const dy = ry * Math.sqrt(1 - t * t)
      const yw = Math.round(cy0 - (z + hb) + dy)
      put(x, yw - 2, t < 0.3 ? fam.top : fam.L); put(x, yw - 1, t < 0.1 ? fam.L : fam.R)
      for (let y = Math.round(yTopC - dy); y <= Math.round(yTopC + dy) - 1; y++) {
        const low = y === Math.round(yTopC + dy) - 1
        const k = low && trimOn ? trimC : fam.top
        if (low && trimOn) rec.pts.push([x, y, trimC, fam.top])
        put(x, y, last && o.roofK ? (low ? trimC : o.roofK) : k)
      }
    }
    glowDown(rec.pts, trimC, rec.glow); REC.trims.push(rec)
    z += fh
  }
  return { z, top: [cx, cy0 - z] }
}

// ---------------------------------------------------------------- the packing
const TOWERC = { a: 89, b: 20, w: 6, d: 6 }
const occ = new Set()
const ck = (a, b) => a + "," + b
for (let a = TOWERC.a; a < TOWERC.a + TOWERC.w; a++) for (let b = TOWERC.b; b < TOWERC.b + TOWERC.d; b++) occ.add(ck(a, b))
const SIZES = [[2, 2], [2, 2], [2, 2], [3, 2], [2, 3], [3, 3], [3, 3], [1, 2], [2, 1], [3, 4], [4, 3], [1, 1]]
const blds = []
for (let b = 0; b <= 160; b++) for (let a = 0; a <= 170; a++) {
  if (!cellOK(a, b) || occ.has(ck(a, b))) continue
  let w = 1, d = 1
  for (let t = 0; t < 8; t++) {
    const [tw, td] = SIZES[Math.floor(ih(a, b, 31 + t) * SIZES.length)]
    let ok = true
    for (let i = 0; i < tw && ok; i++) for (let j = 0; j < td; j++) if (!cellOK(a + i, b + j) || occ.has(ck(a + i, b + j))) { ok = false; break }
    if (ok) { w = tw; d = td; break }
  }
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) occ.add(ck(a + i, b + j))
  blds.push({ a0: a, b0: b, w, d, id: blds.length + 1 })
}
const heightOf = (bd) => {
  const ac = bd.a0 + bd.w / 2, bc = bd.b0 + bd.d / 2
  const cx = 8 * (ac - bc), cyc = 4 * (ac + bc)
  const r1 = ih(bd.id, 3, 9), r2 = ih(bd.id, 4, 9)
  const back = 4 * (bd.a0 + bd.b0) + 4 - backLine(cx) < 30
  let h
  if (back) h = cyc - (roofLine(cx) + (r2 - 0.5) * 22)
  else h = 28 + 96 * Math.pow(r1, 1.4) + (r2 < 0.12 ? 36 : 0)
  const nearTower = Math.abs(cx - 552) < 70 && ac + bc > 112
  return clamp(Math.round(nearTower ? Math.min(h, 34) : h), 18, 280)
}

const ICON = {
  ring: [".XXX.", "X...X", "X.W.X", "X...X", ".XXX."],
  arrow: ["X....", "XX...", "XXXXX", "XX...", "X...."],
  bolt: ["..XX.", ".XX..", "XXXX.", "..XX.", ".XX.."],
}
const SIGNC = ["H", "n", "M", "y", "V", "H", "n", "Y"]
const wallXY = (side, m, u, r) => side === "L"
  ? [PXs(m.a, m.b + m.d) + u, PYs(m.a, m.b + m.d) - m.z - m.h + ((u + 1) >> 1) + r]
  : [PXs(m.a + m.w, m.b + m.d) + u, PYs(m.a + m.w, m.b + m.d) - m.z - m.h - ((u + 1) >> 1) + r]

const drawBuilding = (bd) => {
  const { a0, b0, w, d, id } = bd
  const H0 = bd.h
  const left = PXs(a0, b0 + d), right = PXs(a0 + w, b0)
  const roofY = PYs(a0 + w / 2, b0 + d / 2) - H0
  if (right < -30 || left > W + 20 || roofY > H + 20) return
  const fam = FAMS[Math.floor(ih(id, 1, 3) * 4)]
  const fh = ih(id, 2, 3) < 0.5 ? 8 : 7
  const n = Math.max(2, Math.round(H0 / fh))
  const accent = TRIMC[Math.floor(ih(id, 5, 3) * TRIMC.length)]
  const trims = [accent, accent]
  const trimB = ih(id, 52, 3) < 0.35
  curLevel = levelFor(PYs(a0 + w, b0 + d))
  const roofType = ih(id, 7, 3)
  const big = w >= 2 && d >= 2
  const isCyl = big && ih(id, 8, 3) < 0.13
  const pw = ih(id, 9, 3) < 0.5 ? 2 : 3
  if (isCyl) {
    const R = Math.min(w, d) * 0.5 * 0.92
    const rx = 11.3 * R * (ih(id, 10, 3) < 0.35 ? 1.5 : 1), ry = 5.66 * R
    const cx = PXs(a0 + w / 2, b0 + d / 2), cy0 = PYs(a0 + w / 2, b0 + d / 2)
    const top = cylinder({ cx, cy0, rx, ry, n, fh, fam, id, trims, trimB, roofK: roofType < 0.5 ? "D" : null })
    const [tx, ty] = top.top
    if (roofType < 0.5) { hlineK(tx - 3, ty, 7, "Z"); vlineK(tx, ty - 3, 7, "Z") }
    else pod(tx, ty + 2, Math.max(4, Math.round(rx * 0.4)), 10, "y")
  } else {
    // the roof: helipad, paved terrace, garden, pod or plain clutter
    const kind = big && roofType < 0.1 ? "heli" : roofType < 0.2 ? "terrace" : roofType < 0.27 ? "garden" : roofType < 0.45 ? "pod" : "plain"
    const roofFn = (x, y, i) => {
      if (i.low || i.up) return null
      if (kind === "heli") return i.side ? "q" : (bay(x, y) < 0.1 ? "p" : "D")
      if (kind === "terrace") { const ta = Math.floor(i.a * 2), tb = Math.floor(i.b * 2); const gr = (i.a * 2 - ta) < 0.14 || (i.b * 2 - tb) < 0.14; return gr ? "s" : ((ta + tb) & 1 ? "S" : "B") }
      if (kind === "garden") return bay(x, y) < 0.3 ? "e" : "D"
      return null
    }
    const st = stack({
      a: a0, b: b0, w, d, n, fh, fam, id, trims, pw,
      twist: ih(id, 11, 3) < 0.4 ? 2 + Math.floor(ih(id, 12, 3) * 2) : 0,
      over: ih(id, 13, 3) < 0.3 ? 0.22 : 0,
      trimB, plantP: 0.5, roofFn, roofPlants: kind === "garden",
    })
    const rb = st.roofBox
    const [cx, cy] = rb.pt(a0 + w / 2, b0 + d / 2)
    if (H0 >= 150 && ih(id, 90, 3) < 0.3) screenPanel(cx - 13, cy - 1, 26, 15, ["M", "n", "V", "N"][Math.floor(ih(id, 91, 3) * 4)])
    if (kind === "heli") {
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (HGLYPH[j][i] !== ".") put(cx - 2 + i, cy - 3 + j, "Z")
      for (const [px, py, k] of [[a0, b0, "n"], [a0 + w, b0, "H"], [a0 + w, b0 + d, "n"], [a0, b0 + d, "H"]]) {
        const [qx, qy] = rb.pt(px, py); const sx = Math.sign(cx - qx), sy = Math.sign(cy - qy)
        put(qx + 2 * sx, qy + 2 * sy, k); put(qx + 3 * sx, qy + 2 * sy, k)
      }
    } else if (kind === "terrace") {
      const [kx, ky] = rb.pt(a0 + w * 0.65, b0 + d * 0.4)
      spr(kx, ky, KIOSK)
      const [px, py] = rb.pt(a0 + w * 0.3, b0 + d * 0.6); spr(px, py, PLANT)
      const [qx, qy] = rb.pt(a0 + w * 0.7, b0 + d * 0.75); spr(qx, qy, BUSH)
    } else if (kind === "garden") {
      for (let i = 0; i < 4 + w + d; i++) {
        const [px, py] = rb.pt(a0 + 0.35 + ih(id, 20 + i, 6) * Math.max(0.2, w - 0.7), b0 + 0.35 + ih(id, 40 + i, 6) * Math.max(0.2, d - 0.7))
        const t = ih(id, 60 + i, 6)
        spr(px, py, t < 0.3 ? PALM : t < 0.55 ? TREE : t < 0.85 ? BUSH : PLANT)
      }
    } else if (kind === "pod") {
      const [px, py] = rb.pt(a0 + w * (0.35 + 0.3 * ih(id, 14, 6)), b0 + d * (0.35 + 0.3 * ih(id, 15, 6)))
      pod(px, py + 2, 5 + Math.floor(ih(id, 16, 6) * 3), 11 + Math.floor(ih(id, 17, 6) * 3), ih(id, 18, 6) < 0.3 ? "n" : "y")
    } else {
      const items = 1 + Math.floor(ih(id, 70, 6) * 3)
      for (let i = 0; i < items; i++) {
        const [px, py] = rb.pt(a0 + 0.4 + ih(id, 56 + i, 6) * Math.max(0.1, w - 0.8), b0 + 0.4 + ih(id, 66 + i, 6) * Math.max(0.1, d - 0.8))
        const t = ih(id, 80 + i, 6)
        if (t < 0.22) spr(px, py, TANK)
        else if (t < 0.4) antenna(px, py, 8 + Math.floor(ih(id, 100 + i, 6) * 9), id * 4 + i)
        else if (t < 0.52) spr(px, py, AC)
        else if (t < 0.6) spr(px, py, DISH)
        else if (t < 0.69) screenPanel(px - 7, py, 14 + 2 * Math.floor(ih(id, 110 + i, 6) * 3), 8, ["n", "V", "N"][Math.floor(ih(id, 111 + i, 6) * 3)])
        else if (t < 0.92) spr(px, py, BUSH)
        else spr(px, py, PLANT)
      }
    }
  }
  // neon on the walls: boxy two-line shop signs, strips and icons, a zigzag stair on some towers
  const m = { a: a0, b: b0, w, d, z: 0, h: n * fh }
  const wk = [fam.L, fam.R, "w"]
  const nsign = H0 > 30 && ih(id, 24, 3) < 0.4 ? 1 + (ih(id, 25, 3) < 0.2 ? 1 : 0) : 0
  for (let s = 0; s < nsign; s++) {
    const side = ih(id, 26 + s, 3) < 0.65 ? "L" : "R"
    const wW = Math.round(8 * (side === "L" ? w : d))
    if (wW < 10) continue
    const col = accent
    const kind = ih(id, 28 + s, 3)
    const cells = []
    const at = (u, r, k) => { const [x, y] = wallXY(side, m, u, r); cells.push([x, y, k]) }
    const rr = (lo, hi, sd) => lo + Math.floor(ih(id, sd, 3) * Math.max(1, hi - lo))
    if (kind < 0.4) {
      const bw = Math.min(wW - 5, 12 + 2 * Math.floor(ih(id, 30 + s, 3) * 3))
      const u0 = 1 + 2 * Math.floor(ih(id, 31 + s, 3) * Math.floor(Math.max(1, wW - bw - 3) / 2))
      const r0 = rr(8, m.h - 18, 32 + s)
      for (let u = 0; u < bw; u++) for (let r = 0; r < 8; r++) {
        const edge = u === 0 || u === bw - 1 || r === 0 || r === 7
        at(u0 + u, r0 + r, edge ? col : "w")
      }
      for (let li = 0; li < 2; li++) for (let gi = 0; gi < Math.floor((bw - 2) / 4); gi++) {
        const g = glyph3(id * 7 + li * 13 + gi + s * 31)
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (g[j][i] === "X") at(u0 + 2 + gi * 4 + i, r0 + 1 + li * 3 + j, li ? "W" : col)
      }
    } else if (kind < 0.7) {
      const len = Math.min(m.h - 12, 8 + Math.floor(ih(id, 33 + s, 3) * 10))
      const u0 = 1 + 2 * Math.floor(ih(id, 34 + s, 3) * Math.floor(Math.max(1, wW - 6) / 2))
      const r0 = rr(6, m.h - len - 6, 35 + s)
      for (let r = 0; r < len; r++) { at(u0, r0 + r, col); at(u0 + 1, r0 + r, r % 3 === 0 ? "W" : col) }
    } else {
      const ic = ICON[["ring", "arrow", "bolt"][Math.floor(ih(id, 36 + s, 3) * 3)]]
      const u0 = 3 + 2 * Math.floor(ih(id, 37 + s, 3) * Math.floor(Math.max(1, wW - 12) / 2))
      const r0 = rr(6, m.h - 14, 38 + s)
      ic.forEach((row, r) => { for (let u = 0; u < row.length; u++) if (row[u] !== ".") at(u0 + u, r0 + r, row[u] === "X" ? col : row[u]) })
    }
    addSign(cells, col, wk)
  }
  if (m.h > 80 && ih(id, 45, 3) < 0.2) {
    // neon zigzag exterior stair up the lit side
    const col = accent
    const wL = Math.round(8 * w)
    const cells = []
    const flights = Math.floor((m.h - 12) / fh)
    for (let fl = 0; fl < flights; fl++) {
      const u0 = fl % 2 ? wL - 3 : 2, u1 = fl % 2 ? 2 : wL - 3
      const len = Math.abs(u1 - u0)
      for (let s2 = 0; s2 <= len; s2++) {
        const u = u0 + Math.sign(u1 - u0) * s2
        const r = m.h - 6 - fl * fh - Math.round((s2 / len) * (fh - 1))
        const [x, y] = wallXY("L", m, u, r)
        cells.push([x, y, col])
      }
    }
    addSign(cells, col, wk)
  }
}

// ---------------------------------------------------------------- the hero tower
let TOWER_MASK = null, TOWER_POST = null
const drawTower = () => {
  const pre = fb.slice()
  curLevel = 0
  const F = { brick: FAMS[1], brown: FAMS[0], plum: FAMS[2], orange: FAMS[3] }
  // a stepped, wide base with plants
  stack({ a: 90, b: 21, w: 4, d: 4, n: 3, fh: 8, fam: F.brick, id: 9901, bright: true, trimAll: true, trims: ["H", "n"], pw: 6, litP: 0.8, plantP: 0.7 })
  // the white-lit body, windows in pale rows
  stack({ a: 90.3, b: 21.3, w: 3.4, d: 3.4, z0: 24, n: 13, fh: 8, fam: F.brown, id: 9902, bright: true, trimAll: true, trims: ["h", "Y"], pw: 4, litP: 0.95, plantP: 0.55, glass: "white" })
  // a twisting stack of thick plates, white and yellow floor lines
  stack({ a: 90.75, b: 21.75, w: 2.5, d: 2.5, z0: 128, n: 10, fh: 9, fam: F.plum, id: 9903, bright: true, trimAll: true, trims: ["h", "Y"], pw: 4, litP: 0.55, plantP: 0.3, twist: 3 })
  // a warm brown block with a lit crown line
  stack({ a: 91, b: 22, w: 2, d: 2, z0: 218, n: 4, fh: 10, fam: F.orange, id: 9904, bright: true, trimAll: true, trims: ["Y", "H"], pw: 4, litP: 0.85, plantP: 0.2 })
  // a dark stack with cyan and pink trims
  stack({ a: 91, b: 22, w: 2, d: 2, z0: 258, n: 12, fh: 9, fam: F.plum, id: 9905, bright: true, trimAll: true, trims: ["n", "H"], pw: 4, litP: 0.5, trimP: 0.7, plantP: 0.15, twist: 2 })
  const st = stack({ a: 91.2, b: 22.2, w: 1.6, d: 1.6, z0: 366, n: 2, fh: 9, fam: F.brown, id: 9906, bright: true, trimAll: true, trims: ["n", "Y"], pw: 4, litP: 0.95 })
  const [cx, cy] = st.roofBox.pt(92, 23)
  // crown: an antenna with a red tip, and a small screen on a frame
  vlineK(cx + 6, cy - 16, 16, "q")
  const tip = []
  paintPts([[cx + 6, cy - 17, "x"], [cx + 5, cy - 17, "4"], [cx + 7, cy - 17, "4"]], tip)
  REC.tips.push({ pts: tip, ph: 0 })
  const x0 = cx - 18, y0 = cy - 40
  const pts = []
  for (let j = 0; j < 30; j++) for (let i = 0; i < 28; i++) {
    const yy = y0 + j + Math.floor(i / 7)
    const edge = i === 0 || i === 27 || j === 0 || j === 29
    if (edge) { put(x0 + i, yy, "w"); pts.push([x0 + i, yy]) }
    else put(x0 + i, yy, j < 3 ? "n" : (i + j) % 5 === 0 ? "W" : j > 20 ? "V" : bay(i, j) < 0.5 ? "n" : "v")
  }
  glowAround(pts, "n", 2)
  vlineK(x0 + 4, y0 + 33, 10, "q"); vlineK(x0 + 22, y0 + 38, 8, "q")
  TOWER_POST = fb.slice()
  TOWER_MASK = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) if (TOWER_POST[i] !== pre[i]) TOWER_MASK[i] = 1
}

// ---------------------------------------------------------------- go
for (const bd of blds) bd.h = heightOf(bd)
const order = blds.map((b) => ({ t: "b", b, k: b.a0 + b.w + b.b0 + b.d, k2: b.a0 + b.w }))
order.push({ t: "T", k: 119, k2: 94 })
order.sort((p, q) => p.k - q.k || p.k2 - q.k2)
recordCity = true
for (const e of order) { if (e.t === "T") drawTower(); else drawBuilding(e.b); curLevel = 0 }

const stillAt = (x, y, k) => get(x, y) === k
// keep only the records whose pixels survived being painted over by nearer buildings
REC.stars = REC.stars.filter(([x, y]) => stillAt(x, y, "F"))
for (const s of REC.signs) { s.pts = s.pts.filter(([x, y, k]) => stillAt(x, y, k)); s.glow = s.glow.filter(([x, y, k]) => stillAt(x, y, k)) }
REC.signs = REC.signs.filter((s) => s.pts.length >= 4)
for (const s of REC.trims) { s.pts = s.pts.filter(([x, y, k]) => stillAt(x, y, k)); s.glow = s.glow.filter(([x, y, k]) => stillAt(x, y, k)) }
REC.trims = REC.trims.filter((s) => s.pts.length >= 8)
for (const t of REC.tips) t.pts = t.pts.filter(([x, y, k]) => stillAt(x, y, k))
REC.tips = REC.tips.filter((t) => t.pts.length >= 1)
const WINS = [...REC.win.values()].map((r) => ({ lit: r.lit, pts: r.pts.filter(([x, y, k]) => stillAt(x, y, k)) })).filter((r) => r.pts.length >= 3)


// the haze and the grounding gradient, now that the records hold the raw colours
recordCity = false
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (CITY[i]) fb[i] = IDX[FK(x, y, KEYS[fb[i]])] }

// ================================================================ title: the letters are Archivo Black outlines
// rasterized once from the supplied SVG (8x, box filtered, thresholded at 50%) and kept as row runs
const GLYPHS = {"neon":[{"x":22,"y":19,"rows":[[0,17,40,18],[0,17,40,18],[0,18,40,18],[0,19,40,18],[0,20,40,18],[0,21,40,18],[0,22,40,18],[0,23,40,18],[0,23,40,18],[0,24,40,18],[0,25,40,18],[0,26,40,18],[0,27,40,18],[0,28,40,18],[0,29,40,18],[0,29,40,18],[0,30,40,18],[0,31,40,18],[0,32,40,18],[0,33,40,18],[0,34,40,18],[0,35,40,18],[0,35,40,18],[0,36,40,18],[0,37,40,18],[0,38,40,18],[0,39,40,18],[0,58],[0,58],[0,58],[0,17,18,40],[0,17,19,39],[0,17,19,39],[0,17,20,38],[0,17,21,37],[0,17,22,36],[0,17,23,35],[0,17,24,34],[0,17,25,33],[0,17,25,33],[0,17,26,32],[0,17,27,31],[0,17,28,30],[0,17,29,29],[0,17,30,28],[0,17,31,27],[0,17,31,27],[0,17,32,26],[0,17,33,25],[0,17,34,24],[0,17,35,23],[0,17,36,22],[0,17,37,21],[0,17,38,20],[0,17,38,20],[0,17,39,19],[0,17,40,18],[0,17,41,16]]},{"x":88,"y":19,"rows":[[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,50]]},{"x":142,"y":18,"rows":[[24,15],[19,24],[16,30],[14,35],[12,38],[11,41],[9,44],[8,46],[7,48],[6,50],[6,51],[5,53],[4,54],[4,55],[3,24,36,23],[3,21,38,22],[2,21,40,20],[2,20,41,20],[2,19,41,20],[1,20,42,19],[1,19,42,20],[1,19,43,19],[1,19,43,19],[1,18,43,19],[0,19,43,19],[0,19,44,18],[0,19,44,18],[0,19,44,18],[0,19,44,19],[0,19,44,19],[0,19,44,19],[0,19,44,19],[0,19,44,18],[0,19,44,18],[0,19,44,18],[1,18,43,19],[1,18,43,19],[1,19,43,19],[1,19,43,19],[1,20,42,19],[1,20,42,19],[2,20,41,20],[2,21,40,21],[3,21,39,21],[3,22,38,22],[3,25,34,25],[4,55],[5,53],[5,52],[6,51],[7,49],[8,47],[9,45],[10,43],[11,40],[13,37],[15,33],[17,28],[21,21],[26,10]]},{"x":211,"y":19,"rows":[[0,16,40,17],[0,17,40,17],[0,18,40,17],[0,19,40,17],[0,20,40,17],[0,21,40,17],[0,21,40,17],[0,22,40,17],[0,23,40,17],[0,24,40,17],[0,25,40,17],[0,26,40,17],[0,27,40,17],[0,27,40,17],[0,28,40,17],[0,29,40,17],[0,30,40,17],[0,31,40,17],[0,32,40,17],[0,32,40,17],[0,33,40,17],[0,34,40,17],[0,35,40,17],[0,36,40,17],[0,37,40,17],[0,38,40,17],[0,38,40,17],[0,39,40,17],[0,57],[0,57],[0,57],[0,17,18,39],[0,17,19,38],[0,17,20,37],[0,17,21,36],[0,17,22,35],[0,17,22,35],[0,17,23,34],[0,17,24,33],[0,17,25,32],[0,17,26,31],[0,17,27,30],[0,17,28,29],[0,17,29,28],[0,17,29,28],[0,17,30,27],[0,17,31,26],[0,17,32,25],[0,17,33,24],[0,17,34,23],[0,17,35,22],[0,17,35,22],[0,17,36,21],[0,17,37,20],[0,17,38,19],[0,17,39,18],[0,17,40,17],[0,17,41,16]]}],"ter":{"x":22,"y":90,"rows":[[0,26,28,23,54,20,83,20,118,10,139,20,168,9,181,9,199,9,211,13,231,12],[0,26,28,23,54,22,83,22,118,11,139,22,168,9,181,9,199,9,211,13,231,12],[0,26,28,23,54,23,83,23,117,12,139,23,168,9,181,9,199,9,211,13,231,12],[0,26,28,23,54,24,83,24,117,13,139,24,168,9,181,9,199,9,211,13,230,13],[0,26,28,23,54,25,83,24,117,13,139,25,168,9,181,9,199,9,211,14,230,13],[0,26,28,23,54,25,83,25,116,14,139,25,168,9,181,9,199,9,211,14,230,13],[0,26,28,9,54,9,70,9,83,8,98,10,116,15,139,9,155,10,168,9,181,9,199,9,211,14,230,13],[9,8,28,9,54,9,71,9,83,8,99,9,116,15,139,9,156,9,168,9,181,9,199,9,211,14,229,14],[9,8,28,9,54,9,71,9,83,8,99,9,115,8,124,7,139,9,156,9,168,9,181,9,199,9,211,15,229,14],[9,8,28,9,54,9,71,8,83,8,99,9,115,7,124,8,139,9,156,9,168,9,181,9,199,9,211,15,229,14],[9,8,28,21,54,9,70,9,83,8,98,10,114,8,124,8,139,9,155,9,168,9,181,9,199,9,211,15,229,14],[9,8,28,21,54,25,83,24,114,8,124,8,139,25,168,9,181,9,199,9,211,15,228,15],[9,8,28,21,54,24,83,24,114,8,125,8,139,24,168,9,181,9,199,9,211,8,220,7,228,6,235,8],[9,8,28,21,54,23,83,23,113,8,125,8,139,24,168,9,181,9,199,9,211,8,220,7,228,6,235,8],[9,8,28,21,54,22,83,22,113,8,125,9,139,22,168,9,181,9,199,9,211,8,220,14,235,8],[9,8,28,21,54,21,83,20,113,8,126,8,139,21,168,9,181,9,199,9,211,8,220,13,234,9],[9,8,28,9,54,21,83,20,112,8,126,8,139,21,168,9,181,9,199,9,211,8,221,12,234,9],[9,8,28,9,54,9,66,10,83,8,95,9,112,23,139,9,151,10,168,9,181,9,199,9,211,8,221,12,234,9],[9,8,28,9,54,9,67,9,83,8,95,9,112,23,139,9,152,9,168,9,182,9,198,9,211,8,221,11,234,9],[9,8,28,9,54,9,67,10,83,8,96,9,111,24,139,9,152,10,168,9,182,9,198,9,211,8,221,11,234,9],[9,8,28,23,54,9,68,9,83,8,96,10,111,25,139,9,153,9,168,9,182,25,211,8,222,10,234,9],[9,8,28,23,54,9,68,10,83,8,97,9,110,26,139,9,153,10,168,9,183,23,211,8,222,10,234,9],[9,8,28,23,54,9,69,9,83,8,97,10,110,26,139,9,154,9,168,9,183,23,211,8,222,9,234,9],[9,8,28,23,54,9,69,10,83,8,98,9,110,8,128,9,139,9,154,10,168,9,184,21,211,8,223,8,234,9],[9,8,28,23,54,9,70,9,83,8,98,10,109,9,128,9,139,9,155,9,168,9,185,19,211,8,223,8,234,9],[9,8,28,23,54,9,70,10,83,8,99,9,109,9,128,10,139,9,155,10,168,9,187,15,211,8,223,8,234,9],[9,8,29,22,55,8,71,9,83,8,99,9,109,8,129,8,140,8,156,9,169,7,190,9,212,7,224,6,235,8]]},"taglineY":148}

const decodeMask = (g) => {
  const m = new Uint8Array(W * H)
  g.rows.forEach((row, j) => { for (let i = 0; i < row.length; i += 2) for (let k = 0; k < row[i + 1]; k++) m[(g.y + j) * W + g.x + row[i] + k] = 1 })
  return m
}
const SMALL = {
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  B: ["XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."],
  C: [".XXX.", "X...X", "X....", "X....", "X....", "X...X", ".XXX."],
  D: ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
  H: ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  I: [".XXX.", "..X..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
  K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
  L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
  N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
  R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
  S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
  U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  Y: ["X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."],
  Z: ["XXXXX", "....X", "...X.", "..X..", ".X...", "X....", "XXXXX"],
}
const textMask = (str, font, gw, gh, scale, gap, x0, y0) => {
  const mask = new Uint8Array(W * H)
  let x = x0
  for (const ch of str) {
    if (ch === " ") { x += gw * scale + gap; continue }
    const g = font[ch]
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      if (g[j][i] !== "X") continue
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
        const px = x + i * scale + xx, py = y0 + j * scale + yy
        if (inb(px, py)) mask[py * W + px] = 1
      }
    }
    x += gw * scale + gap
  }
  return mask
}
// chessboard distance from a mask, over the pixels outside it, bounded to a box
const outsideOf = (mask, box) => {
  const [bx, by, bw, bh] = box
  const dist = new Uint8Array(W * H).fill(255)
  const val = (x, y) => (inb(x, y) ? dist[y * W + x] : 255)
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (mask[y * W + x]) dist[y * W + x] = 0
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    if (mask[y * W + x]) continue
    dist[y * W + x] = Math.min(255, Math.min(val(x - 1, y), val(x - 1, y - 1), val(x, y - 1), val(x + 1, y - 1)) + 1)
  }
  for (let y = by + bh - 1; y >= by; y--) for (let x = bx + bw - 1; x >= bx; x--) {
    if (mask[y * W + x]) continue
    dist[y * W + x] = Math.min(dist[y * W + x], Math.min(val(x + 1, y), val(x + 1, y + 1), val(x, y + 1), val(x - 1, y + 1)) + 1)
  }
  return dist
}
const listOf = (box, fn) => {
  const [bx, by, bw, bh] = box, out = []
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) { const r = fn(x, y, y * W + x); if (r !== undefined && r !== null) out.push(r) }
  return out
}
const TITLE_MASK = new Uint8Array(W * H)
const boxOf = (g, pad) => [g.x - pad, g.y - pad, Math.max(...g.rows.map((r) => (r.length ? r[r.length - 2] + r[r.length - 1] : 0))) + 2 * pad, g.rows.length + 2 * pad]
const shadowList = (mask, dx, dy, box) => listOf(box, (x, y, i) => (!mask[i] && inb(x - dx, y - dy) && mask[(y - dy) * W + (x - dx)] ? [x, y] : null))
const TITLE = { neon: [], ter: null, outline: [] }
const ANY = new Uint8Array(W * H), UNI = new Uint8Array(W * H)
const neonMasks = GLYPHS.neon.map(decodeMask)
const terMask = decodeMask(GLYPHS.ter)
for (const m of [...neonMasks, terMask]) for (let i = 0; i < m.length; i++) if (m[i]) { ANY[i] = 1; TITLE_MASK[i] = 1 }
GLYPHS.neon.forEach((g, gi) => {
  const m = neonMasks[gi], box = boxOf(g, 7)
  const out = outsideOf(m, box)
  const body = listOf(box, (x, y, i) => (m[i] ? [x, y] : null))
  const shadow = shadowList(m, 3, 3, [box[0], box[1], box[2] + 4, box[3] + 4]).filter(([x, y]) => !ANY[y * W + x])
  for (const [x, y] of body) UNI[y * W + x] = 1
  for (const [x, y] of shadow) UNI[y * W + x] = 1
  TITLE.neon.push({ body, shadow, glow: listOf(box, (x, y, i) => (!ANY[i] && out[i] >= 1 && out[i] <= 3 ? [x, y, out[i]] : null)) })
})
// a 1 px ink outline round NEON and its shadow so it shows on the dark sky
for (let y = 14; y < 90; y++) for (let x = 14; x < 280; x++) {
  const i = y * W + x
  if (UNI[i]) continue
  let near = false
  for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (UNI[(y + dy) * W + x + dx]) { near = true; break }
  if (near) TITLE.outline.push([x, y])
}
{
  const g = GLYPHS.ter, box = boxOf(g, 6)
  const out = outsideOf(terMask, box)
  TITLE.ter = {
    body: listOf(box, (x, y, i) => (terMask[i] ? [x, y] : null)),
    shadow: shadowList(terMask, 2, 2, [box[0], box[1], box[2] + 4, box[3] + 4]).filter(([x, y]) => !ANY[y * W + x]),
    glow: listOf(box, (x, y, i) => (!ANY[i] && out[i] >= 1 && out[i] <= 2 ? [x, y, out[i]] : null)),
  }
}
// the tagline, still: chunky wide-spaced caps in pale pink with a soft pink glow
{
  const sy = GLYPHS.taglineY
  for (const [line, yy] of [["A COZY CYBERPUNK", sy], ["CITY BUILDER", sy + 25]]) {
    const m3 = textMask(line, SMALL, 5, 7, 2, 6, 22, yy)
    const box3 = [14, yy - 8, 16 * 16 + 20, 14 + 16]
    const out3 = outsideOf(m3, box3)
    for (const [x, y, d] of listOf(box3, (x, y, i) => (!m3[i] && out3[i] >= 1 && out3[i] <= 2 ? [x, y, out3[i]] : null))) {
      if (bay(x, y) < (d === 1 ? 0.5 : 0.28)) put(x, y, d === 1 ? "H" : "4")
    }
    for (const [x, y] of listOf(box3, (x, y, i) => (m3[i] ? [x, y] : null))) { put(x, y, "J"); TITLE_MASK[y * W + x] = 1 }
  }
}

// ---------------------------------------------------------------- what is still is now done
const BASE = fb.slice()
for (let i = 0; i < W * H; i++) if (TOWER_MASK[i] && BASE[i] !== TOWER_POST[i]) TOWER_MASK[i] = 0
// pick what moves, by position in the lists (fixed), so every run gives the same loop
const pickEvery = (list, n) => { const step = Math.max(1, Math.floor(list.length / n)); const out = []; for (let i = Math.floor(step / 2); i < list.length && out.length < n; i += step) out.push(list[i]); return out }
const lvl = (p) => DEPTH[p[1] * W + p[0]]
const MOVING_WINS = pickEvery(WINS.filter((w2) => w2.pts[0][1] > 230 && lvl(w2.pts[0]) <= 6), 22).map((w2, i) => ({ w: w2, a: (i * 7 + 3) % FRAMES, d: 6 + ((i * 5) % 10) }))
const BLINKERS = pickEvery(REC.signs.filter((s) => s.pts[0][1] > 230 && lvl(s.pts[0]) <= 6), 8).map((s, i) => ({ s, a: 3 + i * 6, d: 1 + (i % 2) }))
const BLINKTRIMS = pickEvery(REC.trims.filter((s) => s.pts[0][1] > 230 && lvl(s.pts[0]) <= 6), 6).map((s, i) => ({ s, a: 9 + i * 7, d: 1 + ((i + 1) % 2) }))
const LOWSIGNS = REC.signs.filter((s) => s.pts[0][1] > 220)
const STUTTER = LOWSIGNS[Math.floor(LOWSIGNS.length / 5)]
const TWINKLERS = pickEvery(REC.stars, 14)

const inLoop = (f, a, d) => ((f - a + FRAMES * 4) % FRAMES) < d
const setPts = (pts, off) => { for (const p of pts) put(p[0], p[1], FK(p[0], p[1], off ? p[3] : p[2])) }

// ================================================================ the moving parts
const HOLO = { x: 469, y: 75, w: 119, h: 57 }
const drawHolo = (f) => {
  const { x: hx, y: hy, w: hw, h: hh } = HOLO
  const hy0 = (u) => hy + Math.floor(u / 3)
  const glitch = f === 21 ? [26, 38] : null
  const ops = []
  const hp = (u, j, k) => ops.push([hx + u, hy0(u) + j, k, j])
  const edge = []
  for (let u = 0; u < hw; u++) for (let j = 0; j < hh; j++) {
    const isEdge = u < 2 || u >= hw - 2 || j < 2 || j >= hh - 2
    if (isEdge) { hp(u, j, "n"); edge.push([u, j]) }
    else if (j % 3 === 0) { if (bay(u, j) < 0.62) hp(u, j, "n") }
    else if (((u + j) & 1) === 0 && bay(u, j) < 0.5) hp(u, j, "n")
  }
  // a bright scan band rolls from the bottom to the top once per loop
  const jb = Math.round(hh + 4 - (f / FRAMES) * (hh + 8))
  for (let u = 2; u < hw - 2; u++) for (let dj = -2; dj <= 2; dj++) {
    const j = jb + dj
    if (j < 2 || j >= hh - 2) continue
    if (dj === 0) hp(u, j, "W")
    else if (Math.abs(dj) === 1) hp(u, j, "n")
    else if (((u + j) & 1) === 0) hp(u, j, "n")
  }
  // a white corner frame
  for (const [cu, cj] of [[0, 0], [hw - 1, 0], [0, hh - 1], [hw - 1, hh - 1]]) {
    for (let k = 0; k < 9; k++) { hp(cu === 0 ? k : cu - k, cj, "W"); hp(cu, cj === 0 ? k : cj - k, "W"); hp(cu === 0 ? k : cu - k, cj + (cj === 0 ? 1 : -1), "W"); hp(cu + (cu === 0 ? 1 : -1), cj === 0 ? k : cj - k, "W") }
  }
  // a round corporate emblem
  const eu = 59, ej = 15
  for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) {
    const dd = Math.hypot(i, j)
    if (dd <= 9.3 && dd >= 7.6) hp(eu + i, ej + j, "W")
    else if (dd < 7.6) hp(eu + i, ej + j, bay(eu + i, ej + j) < 0.45 ? "n" : "1")
  }
  for (let k = 0; k <= 4; k++) { hp(eu - 4 + k, ej - 2 + k, "W"); hp(eu + 4 - k, ej - 2 + k, "W") }
  for (let i = -4; i <= 4; i++) hp(eu + i, ej - 3, "W")
  for (let j = 27; j < 38; j++) for (let u = 14; u < 106; u++) if (((u + j) & 1) === 0 || j === 27 || j === 37) hp(u, j, "1")
  // the pixel text HAS YOUR BACK, each letter held flat on the sloped panel
  const text = "HAS YOUR BACK"
  let tu = 20
  for (const ch of text) {
    if (ch !== " ") {
      const g = SMALL[ch]
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i] === "X") hp(tu + i, 29 + j - (Math.floor((tu + i) / 3) - Math.floor(tu / 3)), "W")
    }
    tu += 6
  }
  // two thin lines of "data"
  for (const [j, u0, u1, step] of [[42, 14, 100, 7], [47, 14, 78, 5]]) for (let u = u0; u < u1; u++) if ((u - u0) % step < step - 2) hp(u, j, ((u - u0) / step) % 3 < 1 ? "W" : "n")
  const pts = []
  for (const [x, y, k, j] of ops) {
    const sh = glitch && j >= glitch[0] && j <= glitch[1] ? 3 : 0
    const px = x + sh
    put(px, y, k)
  }
  for (const [u, j] of edge) { const sh = glitch && j >= glitch[0] && j <= glitch[1] ? 3 : 0; const x = hx + u + sh, y = hy0(u) + j; pts.push([x, y]) }
  glowAround(pts, "n", 2)
}

const drawTaxi = (f) => {
  const bob = Math.round(Math.sin((2 * Math.PI * f) / FRAMES))
  // draw it level into a scratch buffer, then shear it so it climbs toward the city
  const saved = fb
  fb = new Uint8Array(W * H).fill(255)
  const a0 = 20, b0 = 10, z0 = 5
  const lights = []
  // skids
  isoBox(a0 + 0.2, b0 + 0.4, 0.45, 3.3, 3, 2, { L: () => "w", R: () => "w", T: () => "w" })
  isoBox(a0 + 1.35, b0 + 0.4, 0.45, 3.3, 3, 2, { L: () => "w", R: () => "w", T: () => "w" })
  // body: the short rear face looks down-left, the long side down-right
  const body = isoBox(a0, b0, 2.2, 4.6, 8, z0, {
    L: (u, r, wW, h) => {
      if (r === h - 1) return "w"
      if (r >= 2 && r <= 4 && (u >= 1 && u <= 3 || u >= wW - 4 && u <= wW - 2)) { lights.push([u, r]); return "x" }
      if (r === 3 && u >= 6 && u <= 9) return "W"
      return u === 0 ? "h" : "Y"
    },
    R: (u, r, wW, h) => (r === h - 1 ? "w" : r === 0 ? "h" : u > wW - 3 ? "o" : r > h - 3 ? "o" : "Y"),
    T: (x, y, i) => ((i.low || i.up) ? "h" : "Y"),
  })
  // cabin and roof sign
  isoBox(a0 + 0.45, b0 + 0.9, 1.1, 2.2, 6, z0 + 7, {
    L: (u, r, wW, h) => (r === 0 || r === h - 1 || u < 1 || u > wW - 2 ? "Y" : (r === 2 && u > 2 && u < 5 ? "n" : "I")),
    R: (u, r, wW, h) => (r === 0 || r === h - 1 || u % 9 === 0 ? "Y" : (r === 2 && u % 9 === 2 ? "n" : "I")),
    T: (x, y, i) => ((i.low || i.up) ? "W" : "h"),
  })
  isoBox(a0 + 0.7, b0 + 1.5, 0.6, 1.0, 3, z0 + 13, { L: () => "W", R: (u, r) => (r === 1 ? "H" : "W"), T: () => "W" })
  // collect the sprite, shear it, place it
  const sc = fb
  fb = saved
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sc[y * W + x] !== 255) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y) }
  const SL = 0.27, X0 = 42, Y0top = 226
  const shear = (x) => Math.floor((x - minx) * SL)
  const dest = (x, y) => [X0 + x - minx, Y0top + (y - miny) - shear(x) + (shear(maxx) ) + bob - 12]
  // the tail-light trails run back off the left edge, thin and red, shimmering every other frame pair
  const ph = f >> 1
  const lamps = []
  for (const [u, r] of [[2, 3], [13, 3]]) { const [x, y] = body.L(u, r); lamps.push(dest(x, y)) }
  for (const [lx, ly] of lamps) {
    const pts = []
    for (let i = 0; i < 120 && lx - i >= 0; i++) {
      if (i > 55 && i % 3 === 0) continue
      if (i > 80 && i % 2 === 0) continue
      pts.push([lx - 1 - i, Math.round(ly + 2 + i * 0.36)])
    }
    for (const [xx, yy] of pts) put(xx, yy, "x")
    for (const [xx, yy] of pts) { if (((xx + ph) & 1) === 0) put(xx, yy - 1, "C"); if (((xx + ph) & 3) === 1) put(xx, yy + 1, "5") }
  }
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const v = sc[y * W + x]
    if (v === 255) continue
    const [dx, dy] = dest(x, y)
    if (inb(dx, dy)) fb[dy * W + dx] = v
  }
  // hover glow under the skids
  for (const [lx, ly] of lamps) for (let k = -2; k <= 2; k++) if (bay(lx + k, ly) < 0.6) put(lx + k - 1, ly + 3, "C")
}
const wlast = (arr) => arr.length ? arr[arr.length - 1] : [13, 3]

const drawTitle = (f) => {
  // NEON: solid coral, purple shadow, ink outline, soft coral glow; E and the last N stutter around frame 30
  const off = (i, s) => (i === 1 || i === 3) && [0, 2].includes(f - (s + (i === 3 ? 1 : 0)))
  TITLE.neon.forEach((l, i) => {
    if (off(i, 30)) return
    for (const [x, y, d] of l.glow) if (bay(x, y) < (d === 1 ? 0.62 : d === 2 ? 0.4 : 0.2)) put(x, y, "C")
  })
  const pg = Math.sin((2 * Math.PI * f) / FRAMES)
  for (const [x, y, d] of TITLE.ter.glow) if (bay(x, y) < (d === 1 ? 0.5 + 0.22 * pg : 0.26 + 0.16 * pg)) put(x, y, "G")
  for (const [x, y] of TITLE.outline) put(x, y, "I")
  for (const l of TITLE.neon) for (const [x, y] of l.shadow) put(x, y, "X")
  for (const [x, y] of TITLE.ter.shadow) put(x, y, "C")
  TITLE.neon.forEach((l, i) => { const k = off(i, 30) ? "X" : "C"; for (const [x, y] of l.body) put(x, y, k) })
  for (const [x, y] of TITLE.ter.body) put(x, y, "G")
}

const DARKER = { 6: "5", 5: "4", 4: "3", 3: "2", 2: "1", 1: "0", a: "b", b: "c", c: "d", d: "3", B: "K", K: "k", k: "u", R: "r", r: "u", P: "p", p: "q", O: "L", L: "l", S: "s", g: "e" }
const scanlines = () => {
  for (let y = 2; y < H; y += 3) for (let x = (y >> 1) & 1; x < W; x += 2) {
    const i = y * W + x
    if (TITLE_MASK[i]) continue
    const dk = DARKER[KEYS[fb[i]]]
    if (dk) fb[i] = IDX[dk]
  }
}

const renderFrame = (f) => {
  fb = BASE.slice()
  // windows: each of ~20 flips off (or on) at a fixed frame and flips back, like someone moving about
  for (const { w, a, d } of MOVING_WINS) {
    if (!inLoop(f, a, d)) continue
    w.pts.forEach(([x, y, k], i) => put(x, y, FK(x, y, w.lit ? "w" : i === 0 ? "y" : "m")))
  }
  BLINKERS.forEach(({ s, a, d }) => { if (inLoop(f, a, d)) { setPts(s.pts, true); setPts(s.glow, true) } })
  BLINKTRIMS.forEach(({ s, a, d }) => { if (inLoop(f, a, d)) { setPts(s.pts, true); setPts(s.glow, true) } })
  if (STUTTER) {
    const on = f === 18 || f === 20 || (f >= 22 && f <= 35)
    if (!on) { setPts(STUTTER.pts, true); setPts(STUTTER.glow, true) }
  }
  REC.tips.forEach((t) => { if (((f + t.ph) % 12) >= 6) setPts(t.pts, true) })
  TWINKLERS.forEach(([x, y], i) => { if (((f + i * 7) % 16) >= 10) put(x, y, "4") })
  drawHolo(f)
  drawTaxi(f)
  drawTitle(f)
  scanlines()
  return fb
}

// ================================================================ hand the rows to pxl
const emit = (c, buf) => {
  for (let y = 0; y < H; y++) {
    let x = 0
    while (x < W) {
      const v = buf[y * W + x]
      let e = x + 1
      while (e < W && buf[y * W + e] === v) e++
      c.hline(x, y, e - x, KEYS[v])
      x = e
    }
  }
}
sprite("cover", { w: W, h: H }, (c) => emit(c, renderFrame(0)))
anim("cover_loop", { w: W, h: H, frames: FRAMES, fps: 12 }, (c) => emit(c, renderFrame(c.frame)))
