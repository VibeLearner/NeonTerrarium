// NEON TERRARIUM cover, 630x500, a 48-frame loop at 12 fps. The picture is rasterized into one
// buffer (so glows, the title and the scanlines can read what is already there): the still parts
// are built once, then each frame copies that and adds what moves. Everything is driven by the
// frame index, never by chance, so the loop closes.
const W = 630, H = 500, FRAMES = 48

const PAL = {
  // sky, indigo -> warm pink
  0: "#170f3a", 1: "#261558", 2: "#3d2078", 3: "#61298a", 4: "#913a92", 5: "#c9508f", 6: "#f08592",
  // clouds: lit top, pink, lavender, violet shadow
  a: "#ffc9b6", b: "#f7a3b4", c: "#d29ad6", d: "#9a68c0",
  // walls (top / lit side / shadow side): charcoal plum, soot brown, dark slate, concrete
  P: "#4a3a52", p: "#33263d", q: "#211829",
  B: "#4d3a36", K: "#352723", k: "#231917",
  S: "#3a4152", s: "#282e3d", t: "#1a1e29",
  Z: "#6b6170", z: "#4a4350", j: "#312c38",
  D: "#8a5a5a",                                  // warm dusk edge on lit upper floors
  E: "#7d6a92",                                  // 1 px lighter roof edge
  // windows
  y: "#ffc94a", o: "#ffb04a", h: "#ffe9a0", n: "#5ef0ff", w: "#1a1424",
  // neon
  H: "#ff4f9a", M: "#e02fd0", V: "#8a5bff",
  // greenery, island plinth
  g: "#4fae5a", e: "#2e7a4a", U: "#2a2133", u: "#43344f",
  // title
  C: "#ff4a6e", X: "#3b1a5c", G: "#3dffcf",
  // cream, pale pink, red lights, taxi
  F: "#fff0d0", W: "#ffe6ee", x: "#ff3b4a", Y: "#ffd23a",
}
pal(PAL)
const KEYS = Object.keys(PAL).join("")
const IDX = {}
for (let i = 0; i < KEYS.length; i++) IDX[KEYS[i]] = i

let fb = new Uint8Array(W * H)
const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H
const put = (x, y, k) => {
  if (!inb(x, y)) return
  const i = IDX[k]
  if (i === undefined) throw new Error("no palette key " + k)
  fb[y * W + x] = i
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
const REC = { win: new Map(), signs: [], tips: [], stars: [], shops: [], tops: [] }
const paintPts = (pts, sink) => {
  for (const [x, y, k] of pts) { if (!inb(x, y)) continue; sink.push([x, y, k, get(x, y)]); put(x, y, k) }
}

// ================================================================ title geometry (letters are data below)
const TITLE_BOX = [14, 14, 330, 190]

// ================================================================ sky
const SKYV = (x, y) => {
  let v = 6.35 * Math.pow(clamp(y / 352, 0, 1), 1.02)
  v += 1.7 * Math.exp(-Math.hypot((x - 380) / 1.5, y - 320) / 115)      // pink glow behind the skyline
  return clamp(v, 0, 6)
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const v = SKYV(x, y), i = Math.floor(v)
  const f = clamp((v - i - 0.5) * 3 + 0.5, 0, 1)
  put(x, y, "0123456"[Math.min(6, i + (f > bay(x, y) ? 1 : 0))])
}
// faint stars, just appearing in the upper sky
for (let y = 0; y < 215; y++) for (let x = 0; x < W; x++) {
  if (x > TITLE_BOX[0] - 6 && x < TITLE_BOX[0] + TITLE_BOX[2] && y > TITLE_BOX[1] - 6 && y < TITLE_BOX[1] + TITLE_BOX[3]) continue
  const r = ih(x, y, 77)
  if (r < 0.0011) put(x, y, y < 110 ? "4" : "5")
  else if (r < 0.00135) { put(x, y, "F"); REC.stars.push([x, y]) }
  else if (r < 0.00142) { put(x, y, "F"); put(x - 1, y, "4"); put(x + 1, y, "4"); put(x, y - 1, "4"); put(x, y + 1, "4"); REC.stars.push([x, y]) }
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
  const baseY = opts.flat === false ? Infinity : cy + 14 * s     // flat cut base, cumulus
  for (const [ccx, ccy, r] of circles) {
    for (let y = Math.floor(ccy - r); y <= Math.ceil(ccy + r); y++) for (let x = Math.floor(ccx - r); x <= Math.ceil(ccx + r); x++) {
      const dx = x + 0.5 - ccx, dy = y + 0.5 - ccy
      if (dx * dx + dy * dy > r * r || y > baseY) continue
      let l = (-(dx * 0.32) - dy * 0.95) / r * 0.62
      l += (0.5 - (y - top) / Math.max(1, bot - top)) * 0.95
      l += (bay(x, y) - 0.5) * 0.2
      put(x, y, l > 0.52 ? "a" : l > 0.14 ? "b" : l > -0.28 ? "c" : "d")
    }
  }
}
// banks behind the city (peeking over its far edge)
cloud(300, 318, 1.25, 1, { n: 7, span: 230 })
cloud(432, 246, 0.85, 2, { n: 5, span: 150 })
cloud(588, 150, 0.6, 3, { n: 4, span: 100 })
cloud(372, 188, 0.5, 4, { n: 4, span: 90 })
cloud(52, 352, 0.95, 5, { n: 5, span: 140 })

// ================================================================ iso city
const OX = 470, OY = 270
const PXs = (a, b) => OX + Math.round((a - b) * 8)
const PYs = (a, b) => OY + Math.round((a + b) * 4)
const valid = (a, b) => a >= 0 && b <= 39 && a - b <= 23 && a + b <= 66

// the floating slab's top: dark street level under everything
for (let y = 150; y < H; y++) for (let x = 130; x < W; x++) {
  const u = (x + 0.5 - OX) / 8, v = (y + 0.5 - OY) / 4
  if (valid(Math.floor((u + v) / 2), Math.floor((v - u) / 2))) put(x, y, bay(x, y) < 0.3 ? "q" : "w")
}

const MAT = {
  plum: { top: "P", L: "p", R: "q" },
  soot: { top: "B", L: "K", R: "k" },
  slate: { top: "S", L: "s", R: "t" },
  concrete: { top: "Z", L: "z", R: "j" },
}
const EMIT = new Set("yohnHMVWFxY")
let WID = 0

const WIN_ROWS = [[2, 3], [1, 2, 3], [2, 3], [2, 3]]
const SHOPC = ["y", "o", "n", "H", "y", "M"]
const wallKey = (side, u, r, wW, h, mat, o) => {
  WID = 0
  const L = side === "L"
  const base = L ? mat.L : mat.R
  if (o.glass) return o.glass(side, u, r, wW, h)
  if (o.overhang && r === h - 1) return L ? mat.R : "w"           // the overhang's shadow line
  if (L && r === 0 && o.dusk) return "D"                           // dusk catches the upper floors
  if (L && u === 0) return mat.top
  const lp = o.ledgeP, lr = r % lp
  if (r >= 6 && lr === lp - 2) return L ? mat.top : mat.L          // a ledge: light line, then its shadow
  if (r >= 6 && lr === lp - 1) return L ? mat.R : "w"
  if (o.shop && L && u >= o.shop.u && u < o.shop.u + o.shop.w && r >= h - 7 && r <= h - 4) {
    WID = -1
    return r === h - 7 ? o.shop.awning : r === h - 6 ? o.shop.c : r === h - 5 ? (u & 1 ? o.shop.c : "h") : "w"
  }
  const style = o.style, rp = r % 6, rows = WIN_ROWS[style]
  if (r >= 3 && r <= h - 4 && rows.includes(rp) && u >= 1 && u <= wW - 3) {
    let col = -1, wx = 0
    if (style < 2) { if ((u & 3) === 1 || (u & 3) === 2) { col = (u - 1) >> 2; wx = (u - 1) & 1 } }
    else if (style === 2) {
      const m12 = u % 12
      if (m12 === 1 || m12 === 2) { col = Math.floor(u / 12) * 2; wx = m12 - 1 }
      else if (m12 === 5 || m12 === 6) { col = Math.floor(u / 12) * 2 + 1; wx = m12 - 5 }
      else if (m12 === 3 || m12 === 4) return "w"                 // the dark frame between a pair
    } else {
      if (u % 6 === 0) return "w"
      col = Math.floor(u / 6); wx = u % 2
    }
    if (col >= 0) {
      const fl = Math.floor(r / 6), wy = rp - rows[0]
      const q = ih(o.id, fl, 41)
      const pf = q < 0.17 ? 0.97 : q < 0.36 ? 0.06 : 0.64            // a floor fully lit, a floor dark
      WID = (o.id * 2 + (L ? 0 : 1)) * 65536 + col * 64 + fl
      if (ih(o.id * 131 + col, fl * 7 + (L ? 1 : 2), 11) < pf) {
        const t = ih(o.id + col * 3, fl, 5)
        if (t < 0.14) return "n"
        return wx === 0 && wy === 0 ? "h" : t < 0.55 ? "y" : "o"
      }
      return "w"
    }
  }
  if (o.fin && L && u % o.fin === 0) return mat.top               // vertical fins on the lit side
  return base
}

function isoBox(a0, b0, w, d, h, z0, mat, o) {
  const xl = PXs(a0, b0 + d), yBL = PYs(a0, b0 + d) - z0, wl = Math.round(8 * w)
  const xf = PXs(a0 + w, b0 + d), yF = PYs(a0 + w, b0 + d) - z0, wr = Math.round(8 * d)
  const wall = (side, x, y, u, r, ww) => {
    const k = wallKey(side, u, r, ww, h, mat, o)
    put(x, y, k)
    if (WID > 0) {
      let rec = REC.win.get(WID)
      if (!rec) { rec = { pts: [], lit: "yohn".includes(k) }; REC.win.set(WID, rec) }
      rec.pts.push([x, y, k])
    } else if (WID === -1 && r === h - 5) REC.shops.push([x, y, k, o.front])
  }
  for (let u = 0; u < wl; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) wall("L", xl + u, yBL - h + off + r, u, r, wl) }
  for (let u = 0; u < wr; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) wall("R", xf + u, yF - h - off + r, u, r, wr) }
  const z = z0 + h
  const xs = PXs(a0, b0 + d), xe = PXs(a0 + w, b0), ys = PYs(a0, b0) - z, ye = PYs(a0 + w, b0 + d) - z
  const ins = (x, y) => {
    const u = (x + 0.5 - OX) / 8, v = (y + 0.5 + z - OY) / 4
    const a = (u + v) / 2, b = (v - u) / 2
    return a >= a0 && a < a0 + w && b >= b0 && b < b0 + d
  }
  const m = 0.3
  for (let y = ys; y <= ye; y++) for (let x = xs; x <= xe; x++) {
    if (!ins(x, y)) continue
    const u = (x + 0.5 - OX) / 8, v = (y + 0.5 + z - OY) / 4
    const a = (u + v) / 2, b = (v - u) / 2
    const inner = a - a0 >= m && a0 + w - a >= m && b - b0 >= m && b0 + d - b >= m
    const edge = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1)
    let k = mat.top
    if (o.roof === "garden") k = inner ? (bay(x, y) < 0.32 ? "g" : "e") : "g"
    else if (edge) k = "E"                                          // lighter roof edge keeps the silhouette crisp
    else if (o.roof === "dark") k = inner ? (bay(x, y) < 0.55 ? mat.L : mat.top) : mat.top
    else if (inner && bay(x, y) < 0.18) k = mat.L
    put(x, y, k)
  }
  const mod = { a: a0, b: b0, w, d, h, z: z0 }
  return {
    wl, wr, h, mod,
    L: (u, r, k) => put(xl + u, yBL - h + ((u + 1) >> 1) + r, k),
    R: (u, r, k) => put(xf + u, yF - h - ((u + 1) >> 1) + r, k),
    xy: (side, u, r) => side === "L" ? [xl + u, yBL - h + ((u + 1) >> 1) + r] : [xf + u, yF - h - ((u + 1) >> 1) + r],
    pt: (a, b) => [PXs(a, b), PYs(a, b) - z],
  }
}

// ---------------------------------------------------------------- glow
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

// ---------------------------------------------------------------- rooftop clutter
const TANK = ["..BBB..", ".BBBBK.", "BBBBKKk", "BBBKKkk", "BBKKKkk", "KKKKKkk", ".t...t.", ".t...t.", ".t...t."]
const AC = ["ZZZZZz", "ZjjjZz", "ZjjjZz", "zzzzzz"]
const DISH = ["EEEEEEE", ".ZZZZZ.", "..zZz..", "...t...", "...t...", "..ttt.."]
const PLANT = [".g.g.", "ggegg", ".BBB."]
const BUSH = ["..ggg..", ".ggggg.", "gegegeg", ".eeeee."]
const TREE = ["...gg...", "..gggg..", ".gggegg.", "gggeggeg", ".geggeg.", "..eggg..", "...BB...", "...BB...", "...KK..."]
const antenna = (x, y, L, id) => {
  vlineK(x, y - L, L, "t"); hlineK(x - 2, y - L + 3, 5, "t"); hlineK(x - 1, y - L + 6, 3, "t")
  const rec = []
  paintPts([[x, y - L - 1, "x"], [x - 1, y - L - 1, ((x + y) & 1) ? "5" : "4"], [x + 1, y - L - 1, "4"]], rec)
  REC.tips.push({ pts: rec, ph: (id * 5) % 12 })
  REC.tops.push([x, y - L - 1])
}
const pod = (x, y, rx, hgt, wk) => {
  // upright capsule: a dome on a drum, dark body, one big glowing window filling its front
  for (let j = 0; j < hgt; j++) {
    const t = j / (hgt - 1)
    const hw = t < 0.5 ? Math.round(rx * Math.sqrt(1 - Math.pow(1 - t * 2, 2))) : rx
    for (let i = -hw; i <= hw; i++) put(x + i, y - hgt + 1 + j, j === 0 || (j < 3 && Math.abs(i) === hw) ? "E" : i > rx * 0.4 ? "t" : "S")
  }
  const wy = y - Math.round(hgt * 0.46), wr = Math.max(3, rx - 1), wh = Math.max(3, Math.round(hgt * 0.3))
  for (let j = -wh; j <= wh; j++) for (let i = -wr; i <= wr; i++) {
    if ((i * i) / (wr * wr) + (j * j) / (wh * wh) <= 1.0) put(x + i, wy + j, wk === "n" ? (j < -wh / 3 ? "W" : "n") : (i < -wr / 3 && j < 0 ? "h" : j > wh / 2 ? "o" : "y"))
  }
  hlineK(x - rx, y, rx * 2 + 1, "t"); hlineK(x - rx - 1, y + 1, rx * 2 + 3, "j")
}
const billboard = (x, y, w, hgt, k, k2) => {
  const pts = []
  const top = y - hgt - 4
  vlineK(x + 1, y - 4, 4, "t"); vlineK(x + w - 2, y - 4 + ((w - 2) >> 1), 4, "t")
  for (let u = 0; u < w; u++) for (let j = 0; j < hgt; j++) {
    const yy = top + (u >> 1) + j
    const edge = u === 0 || u === w - 1 || j === 0 || j === hgt - 1
    if (edge) { put(x + u, yy, k); pts.push([x + u, yy]) }
    else put(x + u, yy, (u + j) % 3 === 0 || j === (hgt >> 1) ? k2 : "w")
  }
  glowAround(pts, k, 2)
}
const holoScreen = (x, y, w, hgt, k) => {
  const pts = []
  for (let u = 0; u < w; u++) for (let j = 0; j < hgt; j++) {
    const yy = y + (u >> 1) + j
    const edge = u === 0 || u === w - 1 || j === 0 || j === hgt - 1
    if (edge || ((u + j) & 1) === 0) { put(x + u, yy, edge ? k : "n"); if (edge) pts.push([x + u, yy]) }
  }
  glowAround(pts, k, 1)
}

// ---------------------------------------------------------------- the packing
const TOWER = { a0: 9, b0: 3, w: 4, d: 4 }
const occ = new Set()
const ck = (a, b) => a + "," + b
for (let a = TOWER.a0; a < TOWER.a0 + TOWER.w; a++) for (let b = TOWER.b0; b < TOWER.b0 + TOWER.d; b++) occ.add(ck(a, b))
const SIZES = [[2, 2], [2, 2], [3, 2], [2, 3], [3, 3], [3, 3], [4, 2], [2, 4], [3, 4], [4, 3], [2, 1], [1, 2], [4, 4]]
const blds = []
for (let b = -30; b <= 39; b++) for (let a = 0; a <= 70; a++) {
  if (!valid(a, b) || occ.has(ck(a, b))) continue
  let w = 1, d = 1
  for (let t = 0; t < 8; t++) {
    const [tw, td] = SIZES[Math.floor(ih(a, b, 31 + t) * SIZES.length)]
    let ok = true
    for (let i = 0; i < tw && ok; i++) for (let j = 0; j < td; j++) if (!valid(a + i, b + j) || occ.has(ck(a + i, b + j))) { ok = false; break }
    if (ok) { w = tw; d = td; break }
  }
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) occ.add(ck(a + i, b + j))
  blds.push({ a0: a, b0: b, w, d, id: blds.length + 1 })
}

// a strong height mix: a few tall slim towers, many mid-rise blocks, low shophouses in the gaps
const tallness = (bd) => {
  const ac = bd.a0 + bd.w / 2, bc = bd.b0 + bd.d / 2
  const c = Math.exp(-((ac - 11) ** 2 + (bc - 5) ** 2) / 120)
  const e = clamp(ac / 7, 0, 1)
  const r1 = ih(bd.id, 3, 9), r2 = ih(bd.id, 4, 9)
  let h
  if (bd.w <= 2 && bd.d <= 2 && r1 < 0.2) h = 92 + 56 * r2
  else if (r1 < 0.5) h = 12 + 20 * r2
  else h = (36 + 40 * r2 + 34 * c) * (0.7 + 0.3 * e)
  return clamp(Math.round(h / 4) * 4, 12, 160)
}

const SIGNC = ["H", "n", "M", "y", "V", "H", "n", "M"]
const ICON = {
  ring: [".XXX.", "X...X", "X.W.X", "X...X", ".XXX."],
  arrow: ["X....", "XX...", "XXXXX", "XX...", "X...."],
  bolt: ["..XX.", ".XX..", "XXXX.", "..XX.", ".XX.."],
}
const wallXY = (side, m, u, r) => side === "L"
  ? [PXs(m.a, m.b + m.d) + u, PYs(m.a, m.b + m.d) - m.z - m.h + ((u + 1) >> 1) + r]
  : [PXs(m.a + m.w, m.b + m.d) + u, PYs(m.a + m.w, m.b + m.d) - m.z - m.h - ((u + 1) >> 1) + r]
const wallPut = (side, m, u, r, k) => { const [x, y] = wallXY(side, m, u, r); put(x, y, k) }

const addSign = (cells, col, wallKeys) => {
  // cells: [x, y, key]; paints them, their dithered halo and a faint colored spill on the wall below
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

const drawBuilding = (bd) => {
  const { a0, b0, w, d, id } = bd
  const sx = PXs(a0 + w, b0 + d), sy = PYs(a0 + w, b0 + d)
  if (sx < -40 || sx > W + 140 || sy < 40 || sy > H + 260) return
  const mk = ih(id, 1, 3)
  const mat = mk < 0.32 ? MAT.plum : mk < 0.6 ? MAT.soot : mk < 0.92 ? MAT.slate : MAT.concrete
  const H0 = tallness(bd)
  const style = Math.floor(ih(id, 2, 3) * 4)
  const finP = ih(id, 3, 3) < 0.3 ? (style < 2 ? 4 : 6) : 0
  const ledgeP = ih(id, 4, 3) < 0.5 ? 12 : 18
  const front = b0 + d === 40
  // modules: set back, or (sometimes) a recessed base under a full-width upper block that overhangs
  const mods = []
  const n = H0 > 84 ? 3 : H0 > 40 ? 2 : 1
  if (n === 2 && w >= 2 && d >= 2 && ih(id, 19, 4) < 0.3) {
    const h1 = Math.max(12, Math.round(H0 * 0.4 / 4) * 4)
    mods.push({ a: a0, b: b0, w: w - 1, d: d - 1, h: h1, z: 0 })
    mods.push({ a: a0, b: b0, w, d, h: H0 - h1, z: h1, overhang: true })
  } else {
    let z = 0, ca = a0, cb = b0, cw = w, cd = d
    for (let k = 0; k < n; k++) {
      const last = k === n - 1
      const hk = last ? H0 - z : Math.max(8, Math.round(H0 * (k === 0 ? 0.5 : 0.3) / 4) * 4)
      mods.push({ a: ca, b: cb, w: cw, d: cd, h: hk, z })
      z += hk
      const fr = ih(id, 20 + k, 4) < 0.3
      if (cw > 1 && cd > 1) {
        if (fr) { cw -= 1; cd -= 1 }
        else if (ih(id, 30 + k, 4) < 0.5) { ca += 1; cw -= 1; if (ih(id, 40 + k, 4) < 0.5) { cb += 1; cd -= 1 } }
        else { cb += 1; cd -= 1 }
      } else if (cw > 1) { ca += 1; cw -= 1 } else if (cd > 1) { cb += 1; cd -= 1 }
    }
  }
  const garden = ih(id, 7, 3) < 0.17
  const shopC = SHOPC[Math.floor(ih(id, 17, 3) * SHOPC.length)]
  mods.forEach((m, k) => {
    const last = k === mods.length - 1
    const wl = Math.round(8 * m.w)
    const o = {
      id: id * 7 + k, style, fin: finP, ledgeP, overhang: m.overhang, dusk: m.z > 0 || H0 > 60, front,
      roof: last ? (garden ? "garden" : ih(id, 8, 3) < 0.3 ? "dark" : "") : "",
      shop: m.z === 0 && wl >= 14 && ih(id, 18, 3) < 0.7
        ? { u: 1 + 2 * Math.floor(ih(id, 16, 3) * Math.floor((wl - 12) / 2)), w: ih(id, 15, 3) < 0.5 ? 4 : 6, c: shopC, awning: shopC === "n" ? "V" : "M" }
        : null,
    }
    m.box = isoBox(m.a, m.b, m.w, m.d, m.h, m.z, mat, o)
  })
  const wk = [mat.L, mat.R]
  // neon: signs on most blocks, some on brackets off the edge
  const nsign = ih(id, 9, 3) < 0.8 ? 1 + (ih(id, 10, 3) < 0.4 ? 1 : 0) + (ih(id, 24, 3) < 0.12 ? 1 : 0) : 0
  for (let s = 0; s < nsign; s++) {
    const m = mods[Math.floor(ih(id, 11 + s, 3) * Math.min(2, mods.length))]
    const side = ih(id, 12 + s, 3) < 0.62 ? "L" : "R"
    const wW = side === "L" ? m.box.wl : m.box.wr
    if (wW < 10 || m.h < 18) continue
    const col = SIGNC[Math.floor(ih(id, 13 + s, 3) * SIGNC.length)]
    const kind = ih(id, 14 + s, 3)
    const cells = []
    const at = (u, r, k) => { const [x, y] = wallXY(side, m, u, r); cells.push([x, y, k]) }
    if (kind < 0.3) {
      // vertical strip, two wide
      const len = Math.min(m.h - 10, 7 + Math.floor(ih(id, 15 + s, 3) * 9))
      const u0 = 1 + 2 * Math.floor(ih(id, 16 + s, 3) * Math.floor((wW - 6) / 2))
      const r0 = 4 + Math.floor(ih(id, 17 + s, 3) * Math.max(1, m.h - len - 8))
      for (let r = 0; r < len; r++) { at(u0, r0 + r, col); at(u0 + 1, r0 + r, r % 4 === 0 ? "W" : col) }
    } else if (kind < 0.62) {
      // a board with dashes of lettering
      const bw = Math.min(wW - 6, 8 + 2 * Math.floor(ih(id, 18 + s, 3) * 3))
      const u0 = 1 + 2 * Math.floor(ih(id, 16 + s, 3) * Math.floor(Math.max(1, wW - bw - 4) / 2))
      const r0 = 4 + Math.floor(ih(id, 17 + s, 3) * Math.max(1, m.h - 14))
      for (let u = 0; u < bw; u++) for (let r = 0; r < 5; r++) {
        const edge = u === 0 || u === bw - 1 || r === 0 || r === 4
        at(u0 + u, r0 + r, edge ? col : r === 2 ? (u % 3 !== 0 ? "W" : "w") : (r === 1 ? (u % 4 < 2 ? col : "w") : (u % 4 >= 2 ? col : "w")))
      }
    } else if (kind < 0.8) {
      // a small round or arrow icon
      const ic = ICON[["ring", "arrow", "bolt"][Math.floor(ih(id, 25 + s, 3) * 3)]]
      const u0 = 3 + 2 * Math.floor(ih(id, 16 + s, 3) * Math.floor(Math.max(1, wW - 12) / 2))
      const r0 = 5 + Math.floor(ih(id, 17 + s, 3) * Math.max(1, m.h - 16))
      ic.forEach((row, r) => { for (let u = 0; u < row.length; u++) if (row[u] !== ".") at(u0 + u, r0 + r, row[u] === "X" ? col : row[u]) })
    } else {
      // hung off the building's west edge on a bracket
      const [ex, ey] = wallXY("L", m, 0, 6 + Math.floor(ih(id, 26 + s, 3) * Math.max(1, m.h - 24)))
      for (let k = 1; k <= 4; k++) cells.push([ex - k, ey, "w"])
      const len = 8 + Math.floor(ih(id, 27 + s, 3) * 6)
      for (let r = 0; r < len; r++) { cells.push([ex - 6, ey + 1 + r, col]); cells.push([ex - 5, ey + 1 + r, r % 3 === 0 ? "W" : col]) }
    }
    addSign(cells, col, wk)
  }
  // pipes, wall AC boxes, light strips
  for (const m of mods) {
    if (m.h > 30 && ih(id, 50 + m.z, 5) < 0.3) {
      const side = ih(id, 51 + m.z, 5) < 0.6 ? "L" : "R"
      const u = 3 + Math.floor(ih(id, 52 + m.z, 5) * Math.max(1, (side === "L" ? m.box.wl : m.box.wr) - 7))
      for (let r = 4; r < m.h - 1; r++) { m.box[side](u, r, "w"); m.box[side](u + 1, r, side === "L" ? mat.top : mat.L) }
    }
    if (m.h > 24 && ih(id, 53 + m.z, 5) < 0.3) {
      const side = "L", u = 3 + 2 * Math.floor(ih(id, 54 + m.z, 5) * Math.max(1, (m.box.wl - 10) / 2))
      const r = 8 + Math.floor(ih(id, 55 + m.z, 5) * Math.max(1, m.h - 18))
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) m.box.L(u + i, r + j, j === 2 ? "z" : i === 1 || i === 2 ? "j" : "Z")
    }
  }
  if (ih(id, 21, 3) < 0.26) {
    const m = mods[mods.length - 1]
    const col = ["n", "H", "y", "V"][Math.floor(ih(id, 22, 3) * 4)]
    const pts = []
    for (let u = 1; u < m.box.wl - 1; u++) { m.box.L(u, -1, col); pts.push([PXs(m.a, m.b + m.d) + u, PYs(m.a, m.b + m.d) - m.z - m.h + ((u + 1) >> 1) - 1]) }
    glowAround(pts, col, 1)
  }
  // rooftop: a pod on about a quarter of them, railings, clutter, gardens
  const m = mods[mods.length - 1]
  const spot = (i) => m.box.pt(m.a + 0.5 + ih(id, 56 + i, 6) * Math.max(0.1, m.w - 1), m.b + 0.5 + ih(id, 66 + i, 6) * Math.max(0.1, m.d - 1))
  if (ih(id, 57, 6) < 0.28) {
    for (let u = 1; u < m.box.wl - 1; u++) m.box.L(u, -4, "w")
    for (let u = 1; u < m.box.wl - 1; u += 6) for (let r = -3; r < 0; r++) m.box.L(u, r, "w")
  }
  const hasPod = !garden && ih(id, 58, 6) < 0.3 && m.w * m.d >= 3
  if (hasPod) {
    const [x, y] = m.box.pt(m.a + m.w * (0.35 + 0.3 * ih(id, 59, 6)), m.b + m.d * (0.35 + 0.3 * ih(id, 60, 6)))
    pod(x, y + 2, 5 + Math.floor(ih(id, 61, 6) * 3), 10 + Math.floor(ih(id, 62, 6) * 4), ih(id, 63, 6) < 0.3 ? "n" : "y")
  }
  const items = (garden ? 3 : 1) + Math.floor(ih(id, 70, 6) * 3)
  for (let i = 0; i < items; i++) {
    const [x, y] = spot(i)
    const t = ih(id, 80 + i, 6)
    if (garden) { if (t < 0.45) spr(x, y, TREE); else if (t < 0.85) spr(x, y, BUSH); else spr(x, y, PLANT); continue }
    if (t < 0.22) spr(x, y, TANK)
    else if (t < 0.4) antenna(x, y, 8 + Math.floor(ih(id, 100 + i, 6) * 9), id * 4 + i)
    else if (t < 0.52) spr(x, y, AC)
    else if (t < 0.6) spr(x, y, DISH)
    else if (t < 0.72) billboard(x - 7, y, 14 + 2 * Math.floor(ih(id, 110 + i, 6) * 3), 6, SIGNC[Math.floor(ih(id, 111 + i, 6) * SIGNC.length)], "W")
    else if (t < 0.8) holoScreen(x - 5, y - 12, 11, 7, ["n", "H"][Math.floor(ih(id, 112 + i, 6) * 2)])
    else if (t < 0.92) spr(x, y, BUSH)
    else spr(x, y, PLANT)
  }
  // balcony plants, moss and vines hanging off the ledges
  for (const mm of mods) {
    for (let r = ledgeP - 2; r < mm.h - 3; r += ledgeP) {
      if (r < 6) continue
      for (let u = 4; u < mm.box.wl - 3; u += 7) {
        const q = ih(id * 17 + r, u, 8)
        if (q < 0.22) {
          mm.box.L(u, r - 1, "g"); mm.box.L(u + 1, r - 1, "g"); mm.box.L(u + 2, r - 1, "e"); mm.box.L(u + 1, r - 2, "g")
          if (ih(id, u + r, 9) < 0.75) for (let k = 0; k < 3 + Math.floor(ih(id, r, u) * 6); k++) mm.box.L(u + 1 + (k > 3 ? 1 : 0), r + 2 + k, k % 2 ? "e" : "g")
        } else if (q < 0.4) { mm.box.L(u, r, "e"); mm.box.L(u + 3, r, "e") }
      }
    }
  }
}

// ---------------------------------------------------------------- the hero tower
const drawTower = () => {
  const { a0, b0, w, d } = TOWER
  const glass = (side, u, r, wW, h) => {
    const L = side === "L"
    if (L && u === 0) return "E"
    if (!L && u === wW - 1) return "0"
    if (r % 12 === 4 || r % 12 === 5) {
      const col = u >> 1, fl = Math.floor(r / 12)
      if ((u & 3) === 3) return L ? "2" : "1"
      const t = ih(col + (L ? 0 : 40), fl, 21)
      return t < 0.12 ? "n" : t < 0.4 ? "h" : "y"
    }
    if (r % 12 === 6) return L ? "3" : "2"
    return L && u % 8 === 7 ? "3" : L ? "2" : u % 8 === 7 ? "2" : "1"
  }
  const base = { glass: (side, u, r) => {
    const L = side === "L"
    if (r % 6 === 2 || r % 6 === 3) { if ((u & 3) === 1 || (u & 3) === 2) { const t = ih(u >> 2, r, 22 + (L ? 0 : 1)); return t < 0.2 ? "n" : t < 0.65 ? "y" : (L ? "2" : "1") } }
    return L ? (u === 0 ? "3" : "2") : "1"
  } }
  isoBox(a0, b0, w, d, 40, 0, MAT.slate, { id: 9999, ...base })
  const sh = isoBox(10, 4, 2, 2, 258, 40, MAT.slate, { id: 9998, glass })
  const crown = isoBox(9.5, 3.5, 3, 3, 12, 298, MAT.slate, { id: 9997, glass: (side, u, r, wW, h) => (r === 1 || r === h - 2) ? ((u & 1) ? "n" : "H") : (side === "L" ? (u === 0 ? "E" : "2") : "1") })
  const [cx, cy] = crown.pt(11, 5)
  for (let i = -12; i <= 12; i++) for (let j = -6; j <= 6; j++) {
    const s = Math.abs(i) / 12 + Math.abs(j) / 6
    if (s <= 1) put(cx + i, cy + j, s > 0.8 ? "E" : bay(cx + i, cy + j) < 0.2 ? "3" : "2")
  }
  vlineK(cx, cy - 22, 22, "E"); vlineK(cx + 1, cy - 22, 22, "Z")
  hlineK(cx - 2, cy - 14, 5, "Z"); hlineK(cx - 3, cy - 9, 7, "Z")
  const tip = []
  paintPts([[cx, cy - 23, "x"], [cx + 1, cy - 23, "x"], [cx - 1, cy - 23, "4"], [cx + 2, cy - 23, "4"], [cx, cy - 24, "5"], [cx + 1, cy - 24, "5"]], tip)
  REC.tips.push({ pts: tip, ph: 0 })
  const edgeL = []
  for (let r = 130; r < 250; r++) { sh.L(1, r, "H"); edgeL.push([PXs(10, 6) + 1, PYs(10, 6) - 40 - 258 + 1 + r]) }
  glowAround(edgeL, "H", 1)
  for (let r = 60; r < 200; r++) sh.R(sh.wr - 3, r, r % 14 < 10 ? "V" : "1")
  // a rim of pink glow on the open sky either side of the shaft
  const SKYK = "0123456"
  for (let y = 40; y < 330; y++) {
    for (const [x, kk] of [[501, "5"], [500, "4"], [534, "5"], [535, "4"]]) {
      if (!SKYK.includes(get(x, y))) continue
      if (kk === "5" ? ((x + y) & 1) === 0 : (y & 1) === 0 && ((x + y) & 3) === 0) put(x, y, kk)
    }
  }
}

// ---------------------------------------------------------------- go
const order = blds.map((b) => ({ t: "b", b, k: b.a0 + b.w + b.b0 + b.d, k2: b.a0 + b.w }))
order.push({ t: "T", k: TOWER.a0 + TOWER.w + TOWER.b0 + TOWER.d, k2: TOWER.a0 + TOWER.w })
order.sort((p, q) => p.k - q.k || p.k2 - q.k2)
for (const e of order) { if (e.t === "T") drawTower(); else drawBuilding(e.b) }

// cables sagging between nearby antenna tops
{
  const tops = REC.tops.filter(([x, y]) => x > 150 && y > 120).sort((p, q) => p[0] - q[0])
  for (let i = 0; i + 1 < tops.length; i++) {
    const [x1, y1] = tops[i], [x2, y2] = tops[i + 1]
    const dx = x2 - x1
    if (dx < 14 || dx > 95 || Math.abs(y2 - y1) > 60 || ih(i, 3, 99) > 0.5) continue
    const sag = 3 + dx / 18
    for (let x = x1; x <= x2; x++) {
      const t = (x - x1) / dx
      const y = Math.round(y1 + (y2 - y1) * t + sag * (1 - Math.pow(2 * t - 1, 2)))
      if (EMIT.has(get(x, y))) continue
      put(x, y + 2, "w")
    }
  }
}

// the island's front edge: a dark stone plinth, grass along its lip, hanging vines and roots, glowing seams
{
  const x0 = PXs(0, 40), y0 = PYs(0, 40)
  const xmax = Math.min(W - 1, x0 + 520)
  for (let u = 0; x0 + u <= xmax; u++) {
    const off = (u + 1) >> 1
    for (let r = 0; r < 13; r++) {
      let k = r === 0 ? (u % 5 === 0 ? "e" : "g") : r === 1 ? "e" : r === 2 ? "u" : "U"
      if (u % 14 === 0 || u % 14 === 1) k = r < 3 ? k : "t"
      if (r === 11 && (u % 6) < 3) k = "t"
      if (r === 6 && (u % 26) > 17) k = ["n", "H", "y"][Math.floor(u / 26) % 3]
      put(x0 + u, y0 + off + r - 1, k)
    }
    if (ih(u, 4, 40) < 0.22) put(x0 + u, y0 + off - 2, "g")
    if (ih(u, 5, 40) < 0.09) { const len = 4 + Math.floor(ih(u, 6, 40) * 14); for (let k = 0; k < len; k++) put(x0 + u, y0 + off + 12 + k, k % 3 === 2 ? "g" : "e") }
  }
  // the glow of lit ground-floor shops spills onto the grass lip
  for (const [x, y, k, fr] of REC.shops) {
    if (!fr) continue
    const col = k === "w" ? null : k
    if (!col || col === "h") continue
    const off = ((x - x0) + 1) >> 1
    if ((x & 1) === 0) put(x, y0 + off - 1, col)
  }
}

// clouds in front: the cloud sea under the island's corner
cloud(14, 492, 1.3, 11, { n: 7, span: 240 })
cloud(190, 556, 1.0, 12, { n: 6, span: 230 })
cloud(350, 548, 1.1, 13, { n: 5, span: 200 })
cloud(98, 408, 0.6, 14, { n: 4, span: 90 })

// soft cyan thruster glows under the slab, peeking over the clouds
{
  const x0 = PXs(0, 40), y0 = PYs(0, 40)
  for (const tx of [x0 + 28, x0 + 66, x0 + 100]) {
    const off = (tx - x0 + 1) >> 1
    const ty = y0 + off + 13
    rectK(tx - 3, ty - 2, 7, 2, "u"); rectK(tx - 2, ty, 5, 1, "U")
    for (let j = 1; j < 18; j++) for (let i = -9; i <= 9; i++) {
      const dd = (i * i) / (8 * 8) + (j * j) / (16 * 16)
      if (dd > 1) continue
      if (bay(tx + i, ty + j) < (1 - dd) * 0.85) put(tx + i, ty + j, "n")
    }
  }
}

// ================================================================ title: the letters are Archivo Black outlines
// rasterized once from the supplied SVG (8x, box filtered, thresholded at 50%) and kept as row runs
const GLYPHS = {"neon":[{"x":26,"y":25,"rows":[[0,18,43,19],[0,19,43,19],[0,20,43,19],[0,20,43,19],[0,21,43,19],[0,22,43,19],[0,23,43,19],[0,24,43,19],[0,25,43,19],[0,26,43,19],[0,26,43,19],[0,27,43,19],[0,28,43,19],[0,29,43,19],[0,30,43,19],[0,31,43,19],[0,31,43,19],[0,32,43,19],[0,33,43,19],[0,34,43,19],[0,35,43,19],[0,36,43,19],[0,37,43,19],[0,37,43,19],[0,38,43,19],[0,39,43,19],[0,40,43,19],[0,41,43,19],[0,42,43,19],[0,62],[0,62],[0,62],[0,62],[0,18,20,42],[0,18,20,42],[0,18,21,41],[0,18,22,40],[0,18,23,39],[0,18,24,38],[0,18,25,37],[0,18,26,36],[0,18,26,36],[0,18,27,35],[0,18,28,34],[0,18,29,33],[0,18,30,32],[0,18,31,31],[0,18,32,30],[0,18,33,29],[0,18,33,29],[0,18,34,28],[0,18,35,27],[0,18,36,26],[0,18,37,25],[0,18,38,24],[0,18,39,23],[0,18,39,23],[0,18,40,22],[0,18,41,21],[0,18,42,20],[0,18,43,19],[0,18,44,18]]},{"x":97,"y":25,"rows":[[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,48],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,49],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,20],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54],[0,54]]},{"x":155,"y":24,"rows":[[27,14],[21,25],[18,31],[16,36],[14,40],[12,43],[11,46],[10,48],[9,50],[8,52],[7,54],[6,56],[5,57],[5,58],[4,59],[4,25,39,25],[3,24,41,23],[3,22,42,23],[2,22,43,22],[2,21,44,22],[2,21,45,21],[1,21,45,21],[1,21,46,20],[1,20,46,21],[1,20,46,21],[1,20,47,20],[1,20,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[0,21,47,20],[1,20,47,20],[1,20,47,20],[1,20,46,21],[1,20,46,21],[1,21,46,20],[1,21,45,21],[2,21,45,21],[2,21,44,22],[2,22,44,21],[3,22,42,23],[3,23,41,24],[3,26,39,25],[4,60],[5,58],[5,57],[6,56],[7,54],[7,53],[8,51],[10,48],[11,46],[12,43],[14,40],[16,36],[18,32],[21,26],[25,17]]},{"x":229,"y":25,"rows":[[0,18,43,19],[0,19,43,19],[0,19,43,19],[0,20,43,19],[0,21,43,19],[0,22,43,19],[0,23,43,19],[0,24,43,19],[0,25,43,19],[0,25,43,19],[0,26,43,19],[0,27,43,19],[0,28,43,19],[0,29,43,19],[0,30,43,19],[0,30,43,19],[0,31,43,19],[0,32,43,19],[0,33,43,19],[0,34,43,19],[0,35,43,19],[0,36,43,19],[0,36,43,19],[0,37,43,19],[0,38,43,19],[0,39,43,19],[0,40,43,19],[0,41,43,19],[0,42,43,19],[0,42,43,19],[0,62],[0,62],[0,62],[0,18,19,43],[0,18,20,42],[0,18,21,41],[0,18,22,40],[0,18,23,39],[0,18,24,38],[0,18,25,37],[0,18,26,36],[0,18,26,36],[0,18,27,35],[0,18,28,34],[0,18,29,33],[0,18,30,32],[0,18,31,31],[0,18,32,30],[0,18,32,30],[0,18,33,29],[0,18,34,28],[0,18,35,27],[0,18,36,26],[0,18,37,25],[0,18,38,24],[0,18,38,24],[0,18,39,23],[0,18,40,22],[0,18,41,21],[0,18,42,20],[0,18,43,19],[0,18,44,18]]}],"ter":{"x":26,"y":100,"rows":[[0,22,23,20,45,17,69,17,98,9,116,17,140,7,151,7,166,7,176,10,193,10],[0,22,23,20,45,19,69,18,98,9,116,19,140,7,151,7,166,7,176,11,192,11],[0,22,23,20,45,20,69,20,98,10,116,20,140,7,151,7,166,7,176,11,192,11],[0,22,23,20,45,21,69,20,97,11,116,20,140,7,151,7,166,7,176,11,192,11],[0,22,23,20,45,21,69,21,97,12,116,21,140,7,151,7,166,7,176,11,192,11],[0,21,23,8,45,7,58,8,69,7,82,8,97,12,116,7,129,8,140,7,151,7,166,7,176,12,191,12],[7,7,23,8,45,7,59,7,69,7,83,7,96,13,116,7,130,7,140,7,151,7,166,7,176,12,191,12],[7,7,23,8,45,7,59,7,69,7,83,7,96,6,103,7,116,7,130,7,140,7,151,7,166,7,176,12,191,12],[7,7,23,18,45,7,58,8,69,7,82,8,95,7,103,7,116,7,129,8,140,7,151,7,166,7,176,12,191,12],[7,7,23,18,45,21,69,20,95,6,104,6,116,21,140,7,151,7,166,7,176,13,190,13],[7,7,23,18,45,20,69,20,95,6,104,7,116,20,140,7,151,7,166,7,176,13,190,5,196,7],[7,7,23,18,45,19,69,19,94,7,104,7,116,19,140,7,151,7,166,7,176,13,190,13],[7,7,23,18,45,18,69,17,94,7,105,6,116,18,140,7,151,7,166,7,176,7,184,10,195,8],[7,7,23,8,45,17,69,17,94,6,105,7,116,17,140,7,151,7,166,7,176,7,184,10,195,8],[7,7,23,8,45,8,55,8,69,7,79,8,93,19,116,7,126,8,140,7,151,7,166,7,176,7,184,10,195,8],[7,7,23,8,45,8,56,7,69,7,79,8,93,20,116,7,127,7,140,7,151,8,165,8,176,7,184,10,195,8],[7,7,23,8,45,8,56,8,69,7,80,8,92,21,116,7,127,8,140,7,152,8,164,9,176,7,185,8,195,8],[7,7,23,20,45,8,57,8,69,7,80,8,92,21,116,7,128,8,140,7,152,20,176,7,185,8,195,8],[7,7,23,20,45,8,57,8,69,7,81,8,92,22,116,7,128,8,140,7,153,19,176,7,185,8,195,8],[7,7,23,20,45,8,58,8,69,7,81,8,91,8,107,7,116,7,129,8,140,7,153,18,176,7,185,8,195,8],[7,7,23,20,45,8,58,8,69,7,82,8,91,7,107,7,116,7,129,8,140,7,155,15,176,7,186,6,195,8],[7,7,23,20,45,8,59,8,69,7,82,16,107,8,116,7,130,8,140,7,156,12,176,7,186,6,195,8]]},"taglineY":134}

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
  I: [".XXX.", "..X..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
  K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
  L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
  N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
  R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
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
const listOf = (mask, box, fn) => {
  const [bx, by, bw, bh] = box, out = []
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) { const r = fn(x, y, y * W + x); if (r !== undefined && r !== null) out.push(r) }
  return out
}
const TITLE_MASK = new Uint8Array(W * H)
const boxOf = (g, pad) => [g.x - pad, g.y - pad, Math.max(...g.rows.map((r) => (r.length ? r[r.length - 2] + r[r.length - 1] : 0))) + 2 * pad, g.rows.length + 2 * pad]
const shadowList = (mask, dx, dy, box) => listOf(mask, box, (x, y, i) => (!mask[i] && inb(x - dx, y - dy) && mask[(y - dy) * W + (x - dx)] ? [x, y] : null))
const TITLE = { neon: [], ter: null }
const ANY = new Uint8Array(W * H)
for (const g of GLYPHS.neon) { const m = decodeMask(g); for (let i = 0; i < m.length; i++) if (m[i]) { ANY[i] = 1; TITLE_MASK[i] = 1 } }
{
  const mt = decodeMask(GLYPHS.ter)
  for (let i = 0; i < mt.length; i++) if (mt[i]) { ANY[i] = 1; TITLE_MASK[i] = 1 }
}
for (const g of GLYPHS.neon) {
  const m = decodeMask(g), box = boxOf(g, 6)
  const out = outsideOf(m, box)
  TITLE.neon.push({
    body: listOf(m, box, (x, y, i) => (m[i] ? [x, y] : null)),
    shadow: shadowList(m, 3, 3, [box[0], box[1], box[2] + 4, box[3] + 4]).filter(([x, y]) => !ANY[y * W + x]),
    glow: listOf(m, box, (x, y, i) => (!ANY[i] && out[i] >= 1 && out[i] <= 2 ? [x, y, out[i]] : null)),
  })
}
{
  const m = decodeMask(GLYPHS.ter), box = boxOf(GLYPHS.ter, 6)
  const out = outsideOf(m, box)
  TITLE.ter = {
    body: listOf(m, box, (x, y, i) => (m[i] ? [x, y] : null)),
    shadow: shadowList(m, 2, 2, [box[0], box[1], box[2] + 4, box[3] + 4]).filter(([x, y]) => !ANY[y * W + x]),
    glow: listOf(m, box, (x, y, i) => (!ANY[i] && out[i] >= 1 && out[i] <= 2 ? [x, y, out[i]] : null)),
  }
}
// the tagline, still: pale cream with a soft pink glow
{
  const sy = GLYPHS.taglineY
  for (const [line, yy] of [["A COZY CYBERPUNK", sy], ["CITY BUILDER", sy + 19]]) {
    const m3 = textMask(line, SMALL, 5, 7, 2, 4, 26, yy)
    const box3 = [18, yy - 8, 16 * 14 + 20, 14 + 16]
    const out3 = outsideOf(m3, box3)
    for (const [x, y, d] of listOf(m3, box3, (x, y, i) => (!m3[i] && out3[i] >= 1 && out3[i] <= 2 ? [x, y, out3[i]] : null))) {
      if (bay(x, y) < (d === 1 ? 0.55 : 0.35)) put(x, y, d === 1 ? "H" : "4")
    }
    for (const [x, y] of shadowList(m3, 1, 1, box3)) put(x, y, "0")
    for (const [x, y] of listOf(m3, box3, (x, y, i) => (m3[i] ? [x, y] : null))) { put(x, y, "F"); TITLE_MASK[y * W + x] = 1 }
  }
}

// ---------------------------------------------------------------- what is still is now done
const BASE = fb.slice()
const stillAt = (x, y, k) => get(x, y) === k
// keep only the records whose pixels survived being painted over by nearer buildings
REC.stars = REC.stars.filter(([x, y]) => stillAt(x, y, "F"))
for (const s of REC.signs) { s.pts = s.pts.filter(([x, y, k]) => stillAt(x, y, k)); s.glow = s.glow.filter(([x, y, k]) => stillAt(x, y, k)) }
REC.signs = REC.signs.filter((s) => s.pts.length >= 4)
for (const t of REC.tips) t.pts = t.pts.filter(([x, y, k]) => stillAt(x, y, k))
REC.tips = REC.tips.filter((t) => t.pts.length >= 1)
const WINS = [...REC.win.values()].map((r) => ({ lit: r.lit, pts: r.pts.filter(([x, y, k]) => stillAt(x, y, k)) })).filter((r) => r.pts.length >= 3)

// pick what moves, by position in the lists (fixed), so every run gives the same loop
const pickEvery = (list, n) => { const step = Math.max(1, Math.floor(list.length / n)); const out = []; for (let i = Math.floor(step / 2); i < list.length && out.length < n; i += step) out.push(list[i]); return out }
const MOVING_WINS = pickEvery(WINS, 22).map((w, i) => ({ w, a: (i * 7 + 3) % FRAMES, d: 6 + ((i * 5) % 10) }))
const BLINKERS = pickEvery(REC.signs.filter((s) => s.pts[0][1] > 120), 8).map((s, i) => ({ s, a: 3 + i * 6, d: 1 + (i % 2) }))
const LOWSIGNS = REC.signs.filter((s) => s.pts[0][1] > 220)
const STUTTER = LOWSIGNS[Math.floor(LOWSIGNS.length / 5)]
const TWINKLERS = pickEvery(REC.stars, 14)

const inLoop = (f, a, d) => ((f - a + FRAMES * 4) % FRAMES) < d
const setPts = (pts, off) => { for (const p of pts) put(p[0], p[1], off ? p[3] : p[2]) }

// ================================================================ the moving parts
const drawHolo = (f) => {
  const hx = 396, hy = 56, hw = 82, hh = 56
  const hy0 = (u) => hy + (u >> 1)
  const glitch = f === 21 ? [18, 27] : null
  const ops = []
  const hp = (x, y, k) => ops.push([x, y, k])
  const edgePts = []
  for (let u = 0; u < hw; u++) for (let j = 0; j < hh; j++) {
    const y = hy0(u) + j
    const edge = u < 2 || u >= hw - 2 || j < 2 || j >= hh - 2
    if (edge) { hp(hx + u, y, "n"); edgePts.push([hx + u, y, j]) }
    else if (j % 4 === 0) { if (((u + j) & 1) === 0 || j % 8 === 0) hp(hx + u, y, "n") }
    else if (((u + j) & 1) === 0 && bay(u, j) < 0.55) hp(hx + u, y, "n")
  }
  // a brighter scan band rolls from the bottom to the top once per loop
  const jb = Math.round(hh + 4 - (f / FRAMES) * (hh + 8))
  for (let u = 2; u < hw - 2; u++) for (let dj = -2; dj <= 2; dj++) {
    const j = jb + dj
    if (j < 2 || j >= hh - 2) continue
    const y = hy0(u) + j
    if (dj === 0) hp(hx + u, y, "W")
    else if (Math.abs(dj) === 1) hp(hx + u, y, "n")
    else if (((u + j) & 1) === 0) hp(hx + u, y, "n")
  }
  for (const [cu, cj] of [[0, 0], [hw - 1, 0], [0, hh - 1], [hw - 1, hh - 1]]) {
    for (let k = 0; k < 7; k++) {
      hp(hx + (cu === 0 ? k : cu - k), hy0(cu === 0 ? k : cu - k) + cj, "W")
      hp(hx + cu, hy0(cu) + (cj === 0 ? k : cj - k), "W")
    }
  }
  // corporate emblem: a hexagon ring around a stylised sprout in a diamond
  const ex = hx + 41, ey = hy0(41) + 22
  for (let a = 0; a < 6; a++) {
    const a1 = (a * 60 + 30) * Math.PI / 180, a2 = ((a + 1) * 60 + 30) * Math.PI / 180
    const x1 = ex + 16 * Math.cos(a1), y1 = ey + 14.4 * Math.sin(a1), x2 = ex + 16 * Math.cos(a2), y2 = ey + 14.4 * Math.sin(a2)
    for (let i = 0; i <= 28; i++) {
      const xx = Math.round(x1 + (x2 - x1) * i / 28), yy = Math.round(y1 + (y2 - y1) * i / 28)
      hp(xx, yy, "W"); hp(xx, yy + 1, "n")
    }
  }
  for (let j = -9; j <= 9; j++) for (let i = -9; i <= 9; i++) {
    const m = Math.abs(i) + Math.abs(j)
    if (m <= 9) hp(ex + i, ey + j, m >= 8 ? "W" : bay(ex + i, ey + j) < 0.35 ? "n" : "1")
  }
  for (let j = -4; j <= 6; j++) hp(ex, ey + j, "W")
  for (let k = 1; k <= 4; k++) { hp(ex - k, ey - 1 - Math.floor(k * 0.7), "W"); hp(ex + k, ey - 2 - Math.floor(k * 0.7), "W") }
  const bar = (u, j, w2, k) => { for (let i = 0; i < w2; i++) for (let r = 0; r < 2; r++) hp(hx + u + i, hy0(u + i) + j + r, k) }
  bar(12, 40, 22, "W"); bar(12, 44, 34, "n"); bar(52, 40, 18, "W"); bar(50, 44, 12, "n")
  // one frame: a band of the panel slips 3 px sideways
  const jOf = (x, y) => y - hy0(x - hx)
  let pts = []
  for (const [x, y, k] of ops) {
    const sh = glitch && jOf(x, y) >= glitch[0] && jOf(x, y) <= glitch[1] ? 3 : 0
    put(x + sh, y, k)
  }
  for (const [x, y, j] of edgePts) { const sh = glitch && j >= glitch[0] && j <= glitch[1] ? 3 : 0; pts.push([x + sh, y]) }
  glowAround(pts, "n", 2)
  // a thin beam binding it to the tower's crown
  for (let i = 0; i < 26; i++) { const x = hx + hw + i, y = hy0(hw) + 30 + Math.round(i * 0.55); if ((i & 1) === 0) put(x, y, "n") }
}

const TAXI = [
  "..........HHHHHH", "..........HWWWWW", "......YYYYYYYYYY", ".....YYhhhhhhhhh",
  "....YYYYYYYYYYYY", "....YYt111111111", "....YYt11nn11111", "....YYt111111111",
  "....YYtttttttttt", "...YYYYYYYYYYYYY", "..YYYYYYYYYYYYYY", ".YYYYYYYYYYYYYYY",
  "YYYYooooooooooo", "YxxxxYYYYYYYYYYY", "YxxxxYYYYYYtFtFt", "YxxxxYYYYYYYYYYY",
  ".oooooooooooooo", "..tttttttttttttt", "...nn..........n", "....CC..........",
].map((r) => r.padEnd(16, r[r.length - 1] === "o" ? "o" : "."))
const drawTaxi = (f) => {
  const bob = Math.round(Math.sin((2 * Math.PI * f) / FRAMES))
  const tx = 118, ty = 240 + bob
  const bx = tx - 16, by = ty
  // tail-light trails: two thin red lines streaming back toward the viewer, shimmering every other frame pair
  const ph = f >> 1
  for (const lx of [bx + 2, bx + 29]) {
    const pts = []
    for (let i = 0; i < 120; i++) {
      if (i > 70 && i % 3 === 0) continue
      if (i > 95 && i % 2 === 0) continue
      pts.push([Math.round(lx - 3 - i * 1.0), Math.round(by + 14 + i * 0.36)])
    }
    for (const [xx, yy] of pts) put(xx, yy, "x")
    for (const [xx, yy] of pts) { if (((xx + ph) & 1) === 0) put(xx, yy - 1, "C"); if (((xx + ph) & 3) === 1) put(xx, yy + 1, "5") }
  }
  for (let j = 0; j < TAXI.length; j++) for (let i = 0; i < 16; i++) {
    const ch = TAXI[j][i]
    if (ch === ".") continue
    put(bx + i, by + j, ch)
    put(bx + 31 - i, by + j, ch === "Y" && i < 2 ? "o" : ch)
  }
  for (let j = 4; j < 17; j++) { if (get(bx + 31, by + j) === "Y") put(bx + 31, by + j, "o"); if (get(bx + 30, by + j) === "Y") put(bx + 30, by + j, "o") }
  for (const lx of [bx + 1, bx + 26]) {
    for (const [dx, dy] of [[-1, 0], [-1, 1], [-1, 2], [4, 0], [4, 1], [4, 2], [0, -1], [1, -1], [2, -1], [3, -1], [0, 3], [1, 3], [2, 3], [3, 3]]) {
      const xx = lx + dx, yy = by + 13 + dy
      if (get(xx, yy) !== "x" && bay(xx, yy) < 0.7) put(xx, yy, "C")
    }
  }
  for (let i = 3; i < 29; i++) if (get(bx + i, by + 20) !== "n" && bay(bx + i, by + 20) < 0.5) put(bx + i, by + 20, "n")
  put(bx + 15, by - 1, "H"); put(bx + 16, by - 1, "H")
}

const drawTitle = (f) => {
  // NEON: solid coral, hard purple shadow; E and the last N stutter like a buzzing tube around frame 30
  const off = (i, s) => (i === 1 || i === 3) && [0, 2].includes(f - (s + (i === 3 ? 1 : 0)))
  const pg = Math.sin((2 * Math.PI * f) / FRAMES)
  for (const [x, y, d] of TITLE.ter.glow) if (bay(x, y) < (d === 1 ? 0.5 + 0.22 * pg : 0.26 + 0.16 * pg)) put(x, y, "G")
  for (const l of TITLE.neon) for (const [x, y] of l.shadow) put(x, y, "X")
  for (const [x, y] of TITLE.ter.shadow) put(x, y, "C")
  TITLE.neon.forEach((l, i) => { const k = off(i, 30) ? "3" : "C"; for (const [x, y] of l.body) put(x, y, k) })
  for (const [x, y] of TITLE.ter.body) put(x, y, "G")
}

const DARKER = { 6: "5", 5: "4", 4: "3", 3: "2", 2: "1", 1: "0", a: "b", b: "c", c: "d", d: "4", P: "p", p: "q", B: "K", K: "k", S: "s", s: "t", Z: "z", z: "j", g: "e", e: "0", Y: "o", E: "Z" }
const scanlines = () => {
  for (let y = 3; y < H; y += 4) for (let x = 0; x < W; x += 2) {
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
    w.pts.forEach(([x, y, k], i) => put(x, y, w.lit ? "w" : i === 0 ? "h" : "y"))
  }
  BLINKERS.forEach(({ s, a, d }) => { if (inLoop(f, a, d)) { setPts(s.pts, true); setPts(s.glow, true) } })
  if (STUTTER) {
    const on = (f >= 18 && f <= 18) || f === 20 || (f >= 22 && f <= 35)
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
