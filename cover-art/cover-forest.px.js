// NEON TERRARIUM, the alternate "forest" cover, 630x500, a 48-frame loop at 12 fps. A high iso view
// over a deep forest at golden hour: districts in clearings, a glowing maglev line, drifting clouds.
// The picture is painted in free colour into one buffer (ground, then every tree and building from
// back to front, then shadows and haze), and every frame is quantized to one shared palette at the
// end. Everything is driven by the frame index and fixed hashes, never by chance, so the loop closes.
const W = 630, H = 500, FRAMES = 48

// ================================================================ helpers
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const hex = (s) => parseInt(s.slice(1), 16)
const cr = (c) => (c >> 16) & 255, cg = (c) => (c >> 8) & 255, cb = (c) => c & 255
const rgb = (r, g, b) => (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)
const mix = (a, b, t) => rgb(cr(a) + (cr(b) - cr(a)) * t, cg(a) + (cg(b) - cg(a)) * t, cb(a) + (cb(b) - cb(a)) * t)
const mul = (c, k) => rgb(cr(c) * k, cg(c) * k, cb(c) * k)
const hsh = (x, y = 0, s = 0) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const vn = (x, y, s = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const sx_ = fx * fx * (3 - 2 * fx), sy_ = fy * fy * (3 - 2 * fy)
  const a = hsh(xi, yi, s), b = hsh(xi + 1, yi, s), c = hsh(xi, yi + 1, s), d = hsh(xi + 1, yi + 1, s)
  return a + (b - a) * sx_ + (c - a) * sy_ + (a - b - c + d) * sx_ * sy_
}
const fbmn = (x, y, s = 0) => vn(x, y, s) * 0.55 + vn(x * 2.1, y * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, s + 13) * 0.15
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bay = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16
const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }

// the iso grid: one cell is 6 px wide and 3 px tall, u runs down-right and v down-left
const OX = 315, OY = -30
const sx = (u, v) => OX + (u - v) * 3
const sy = (u, v) => OY + (u + v) * 1.5
const toU = (x, y) => ((x - OX) / 3 + (y - OY) / 1.5) / 2
const toV = (x, y) => ((y - OY) / 1.5 - (x - OX) / 3) / 2

const buf = new Int32Array(W * H)       // the picture, 0xRRGGBB
const OBJ = new Uint8Array(W * H)      // 1 where a building face, roof or glass is (shadows skip it)
const SHM = new Uint8Array(W * H)      // cast shadow mask
const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = c }
const putO = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) { const p = y * W + x; buf[p] = c; OBJ[p] = 1 } }
const getc = (x, y) => (inb(x, y) ? buf[y * W + x] : 0)

// ================================================================ colours
const hexList = (a) => a.map(hex)
// five-step foliage ramps, sunlit -> deep shade (the sunlit side leans yellow, the shadows deep teal)
const RAMP = {
  std: hexList(["#b8d86a", "#7ab84e", "#4a8a3c", "#2c5e34", "#183a2a"]),
  light: hexList(["#d6ec8a", "#a4d264", "#6ab04a", "#3c7e3e", "#22503a"]),
  dark: hexList(["#8cc060", "#5a9a46", "#357a40", "#1f5236", "#102c26"]),
  autumn: hexList(["#f8cc7c", "#e0904a", "#c4623e", "#8a3c4a", "#4e2a44"]),
  blossom: hexList(["#fbe0e6", "#e8a0b4", "#c46e8c", "#8a4a74", "#523656"]),
  meadow: hexList(["#d4e684", "#b0d462", "#8cc055", "#6aa648", "#4e8a40"]),
}
const WALL = {
  cream: hex("#f1e3c0"), white: hex("#f4f0e8"), sand: hex("#dcc59a"), pgrey: hex("#cfd2d4"), wgrey: hex("#b8b0a8"),
  brick: hex("#b4503e"), terra: hex("#cf6f4a"), salmon: hex("#f08c6a"), pink: hex("#d89a9e"), rose: hex("#d98c98"),
  sage: hex("#9ec09a"), pblue: hex("#9cc0d8"), butter: hex("#f0d890"), glass: hex("#8ccad0"), glass2: hex("#a8d6e0"),
}
const NEONPINK = hex("#ff5ac8"), NEONCYAN = hex("#5af0ff"), WARM = hex("#ffd98a")
const faceCols = (c) => ({
  top: mix(mul(c, 1.04), hex("#fff4cc"), 0.38),
  lit: mix(c, hex("#ffdc90"), 0.2),
  shade: mix(mul(c, 0.56), hex("#4a46a0"), 0.4),
  edge: mix(c, hex("#fff6d8"), 0.5),
  winL: mix(mul(c, 0.5), hex("#4a6a98"), 0.55),
  winS: mix(mul(c, 0.35), hex("#3a3a7a"), 0.5),
})

// ================================================================ the map
const R_DT = { u0: 90, v0: 62, du: 54, dv: 40 }
const R_BQ = { u0: 58, v0: 118, du: 46, dv: 34 }
const R_SL = { u0: 63, v0: 0, du: 14, dv: 30 }
const R_IN = { u0: 32, v0: 22, du: 20, dv: 14 }
const R_VL = { u0: 176, v0: 98, du: 18, dv: 14 }
const RECTS = [R_DT, R_BQ, R_SL, R_IN, R_VL]
const HILL = { cx: 335, cy: 466, rx: 112, ry: 46 }
// roads as uv segments [axis, fixed, from, to]: "u" runs along u at a fixed v, "v" along v at a fixed u
const ROADS = [
  ["v", 104, 14, 62], ["u", 28, 52, 104], ["v", 42, -45, 22], ["u", 82, 144, 215],
  ["v", 108, 102, 152], ["u", 152, 108, 215], ["v", 80, 152, 215], ["v", 170, 82, 105], ["u", 105, 170, 176],
  ["u", 19, 78, 104],
]
const ROAD_W = 0.62
const roadDist = (u, v) => {
  let best = 1e9
  for (const [ax, f, a, b] of ROADS) {
    const along = ax === "u" ? u : v, across = ax === "u" ? v : u
    if (along < a || along > b) continue
    const d = Math.abs(across - f)
    if (d < best) best = d
  }
  return best
}

// ---------------------------------------------------------------- ground
const DD = new Float32Array(W * H)     // distance (cells) outside the nearest district, negative inside
const RD = new Float32Array(W * H)
const WHICH = new Int8Array(W * H)
const PARKS = new Set()
const GROUND = {
  street: hex("#aaa49a"), lot: hex("#d9cfb8"), lotB: hex("#d2c3ae"), road: hex("#bdb4a6"), roadEdge: hex("#847f7e"),
  floor: hex("#173f2c"), floor2: hex("#215033"),
}
const groundColor = (x, y, u, v, dd, which) => {
  if (dd < 0 && which >= 0) {
    const r = RECTS[which]
    const iu = Math.floor(u - r.u0), iv = Math.floor(v - r.v0)
    if (iu % 5 === 4 || iv % 5 === 4) return mix(GROUND.street, hex("#c8c0b4"), hsh(x, y, 4) * 0.3)
    if (PARKS.has(which * 100000 + Math.floor(iu / 5) * 1000 + Math.floor(iv / 5))) {
      const n = fbmn(x * 0.4, y * 0.5, 9)
      return RAMP.meadow[n > 0.62 ? 1 : n > 0.4 ? 2 : 3]
    }
    return mix(GROUND.lot, GROUND.lotB, hsh(x >> 1, y, 3))
  }
  // forest floor and meadows
  const mm = fbmn(x * 0.012, y * 0.02, 8)
  if (mm > 0.6 || dd < 2.5) {
    const n = fbmn(x * 0.35, y * 0.5, 2), t = hsh(x, y, 6)
    let c = RAMP.meadow[n > 0.7 ? 0 : n > 0.52 ? 1 : n > 0.34 ? 2 : 3]
    if (t < 0.012) c = hex("#e8a0b4")
    else if (t > 0.992) c = hex("#f4e07a")
    return c
  }
  return mix(GROUND.floor, GROUND.floor2, fbmn(x * 0.2, y * 0.3, 5))
}
const buildGround = () => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x
    const u = toU(x + 0.5, y + 0.5), v = toV(x + 0.5, y + 0.5)
    let dd = 1e9, which = -1
    for (let i = 0; i < RECTS.length; i++) {
      const r = RECTS[i]
      const d = Math.max(r.u0 - u, u - (r.u0 + r.du), r.v0 - v, v - (r.v0 + r.dv))
      if (d < dd) { dd = d; which = i }
    }
    const hx = (x - HILL.cx) / HILL.rx, hy = (y - HILL.cy) / HILL.ry
    const hd = (Math.sqrt(hx * hx + hy * hy) - 1) * 8
    if (hd < dd) { dd = hd; which = -1 }
    DD[p] = dd; WHICH[p] = which
    const rd = roadDist(u, v)
    RD[p] = rd
    let c = groundColor(x, y, u, v, dd, which)
    if (rd < ROAD_W / 2) c = rd > ROAD_W / 2 - 0.2 ? GROUND.roadEdge : mix(GROUND.road, hex("#d4cabb"), hsh(x, y, 8) * 0.4)
    buf[p] = c
  }
}

// ================================================================ trees
const SHIM = []                        // sunlit pixels that can twinkle: [x, y, colour]
const drawTree = (x, y, s, kind, ramp, shimmer, bias) => {
  const r = RAMP[ramp]
  const ht = Math.round(s * 1.15)
  const cx = x, cy = y - ht
  // cast shadow on the ground, down-right
  const sw = s + 0.6
  for (let dy = -1; dy <= 1; dy++) for (let dx = -Math.ceil(sw); dx <= Math.ceil(sw); dx++) {
    const ex = (dx - s * 0.9) / sw, ey = dy / 1.1
    if (ex * ex + ey * ey <= 1) put(x + dx + Math.round(s * 0.9), y + dy, r[4])
  }
  const rx = s + 0.35, ry = s * (kind === "con" ? 1.2 : 0.98)
  const ix = Math.ceil(rx), iy = Math.ceil(ry)
  for (let dy = -iy; dy <= iy; dy++) for (let dx = -ix; dx <= ix; dx++) {
    let inside
    if (kind === "con") {
      const wdt = rx * (0.3 + 0.7 * (dy + ry) / (2 * ry))
      inside = Math.abs(dx) <= wdt && dy >= -ry && dy <= ry * 0.85
    } else {
      const ex = dx / rx, ey = dy / ry
      inside = ex * ex + ey * ey <= 1.02
    }
    if (!inside) continue
    const tx = dx / rx, ty = dy / ry
    let light = -(tx * 0.6 + ty * 0.8) + (hsh(cx + dx, cy + dy, 21) - 0.5) * 0.55
    if (tx + ty > 0.95) light -= 0.35
    let idx = light > 0.78 ? 0 : light > 0.3 ? 1 : light > -0.12 ? 2 : light > -0.52 ? 3 : 4
    idx = clamp(idx + (bias || 0), idx === 0 ? 0 : 1, 4)
    put(cx + dx, cy + dy, r[idx])
    if (idx === 0 && shimmer) SHIM.push([cx + dx, cy + dy, r[0], r[1]])
  }
}

// ================================================================ boxes and buildings
const NEON = []                        // groups of neon pixels: { pts: [[x, y, on, off]], mode, a, d }
const HOLO = []                        // holo boards
const BLINK = []                       // blinking red lights
const neonPut = (grp, x, y, c) => {
  if (!inb(x, y)) return
  const p = y * W + x
  grp.pts.push([x, y, c, buf[p]])
  buf[p] = c; OBJ[p] = 1
}
const drawBox = (u, v, du, dv, h, fL, fR, fT) => {
  const Lx = sx(u, v + dv), Ly = sy(u, v + dv)
  const w = du * 3, w2 = dv * 3
  for (let k = 0; k < w; k++) {
    const yb = Math.floor(Ly + k * 0.5)
    for (let r = 0; r < h; r++) putO(Lx + k, yb - h + r, fL(k, r, w, h))
  }
  const Bx = Lx + w, By = sy(u + du, v + dv)
  for (let k = 0; k < w2; k++) {
    const yb = Math.floor(By - k * 0.5)
    for (let r = 0; r < h; r++) putO(Bx + k, yb - h + r, fR(k, r, w2, h))
  }
  const Tx = Lx + dv * 3, Rx = Bx + dv * 3
  const L1 = Ly - h
  for (let x = Lx; x < Rx; x++) {
    const up = x < Tx ? L1 - (x - Lx) * 0.5 : L1 - dv * 1.5 + (x - Tx) * 0.5
    const dn = x < Bx ? L1 + (x - Lx) * 0.5 : L1 + du * 1.5 - (x - Bx) * 0.5
    const y0 = Math.floor(up), y1 = Math.floor(dn)
    for (let y = y0; y < y1; y++) putO(x, y, fT(x, y, y === y0, y === y1 - 1))
  }
  return { Lx, Tx, Rx, Bx, L1, cx: Lx + 1.5 * (du + dv), cy: L1 + 0.75 * (du - dv), up: (x) => Math.floor(x < Tx ? L1 - (x - Lx) * 0.5 : L1 - dv * 1.5 + (x - Tx) * 0.5), dn: (x) => Math.floor(x < Bx ? L1 + (x - Lx) * 0.5 : L1 + du * 1.5 - (x - Bx) * 0.5) }
}
const facade = (style, cols, side, seed, glass) => (k, r, w, h) => {
  const base = side === "L" ? cols.lit : cols.shade
  const win = side === "L" ? cols.winL : cols.winS
  const rb = h - 1 - r
  if (rb === 0) return mul(base, 0.86)
  if (side === "L" && k === 0) return cols.edge
  if (side === "R" && k === w - 1) return mul(base, 0.88)
  if (style === "band") {
    const m = mix(base, side === "L" ? hex("#e8fbff") : hex("#7a9ad0"), (rb % 2 ? 0.28 : 0.04))
    return (k + rb) % 9 < 2 ? mix(m, hex("#ffffff"), 0.3) : m
  }
  if (style === "slab") {
    const m = rb % 4
    if (m === 0 || m === 1) {
      const n = hsh(k, rb, seed)
      if (k % 3 !== 0 || m === 1) return n < 0.12 ? hex("#e8a0b4") : RAMP.std[(m === 0 ? 2 : 1) + (n > 0.6 ? 1 : 0)]
      return mul(base, 0.85)
    }
    if (m === 2 && k % 3 === 1) return win
    return base
  }
  if (style === "win") {
    if (r > 0 && rb > 1 && rb % 3 === 1 && k % 2 === 1 && hsh(k, rb, seed) > 0.08) {
      return hsh(k * 7, rb * 3, seed + 5) < 0.14 ? (side === "L" ? WARM : hex("#ffc060")) : win
    }
    return base
  }
  if (style === "ind") {
    if (rb % 3 === 0) return mul(base, 0.92)
    return base
  }
  // plain: a window dot and a door
  if (rb === 2 && k % 3 === 1) return win
  if (rb === 1 && k === 2 && w > 3) return mul(base, 0.7)
  return base
}
const topFn = (cols, roof, seed, topC) => (x, y, first, last) => {
  const t = topC || cols.top
  if (roof === "garden") {
    const n = vn(x * 0.45, y * 0.6, seed)
    if (n > 0.52) return hsh(x, y, seed) < 0.1 ? hex("#e8a0b4") : RAMP.std[n > 0.7 ? 1 : 2]
  } else if (roof === "solar") {
    if (!first && !last) return y % 3 === 0 ? hex("#8aa8d8") : hex("#34508a")
  }
  if (first || last) return mix(t, hex("#fffbe8"), 0.45)
  return t
}
const podTop = (cx, cy, r) => {
  for (let dy = -r; dy <= 0; dy++) for (let dx = -r; dx <= r; dx++) {
    const ex = dx / r, ey = dy / (r * 0.9)
    if (ex * ex + ey * ey > 1.05) continue
    const lit = -(ex * 0.6 + ey * 0.8)
    putO(Math.round(cx) + dx, Math.round(cy) + dy, lit > 0.45 ? hex("#ffffff") : lit > -0.1 ? hex("#d4f0f0") : hex("#8aa8c8"))
  }
}
const neonTrim = (b, col, mode, a, d) => {
  const grp = { pts: [], mode, a, d }
  for (let x = b.Lx; x < b.Rx; x++) { neonPut(grp, x, b.dn(x) - 1, col); neonPut(grp, x, b.up(x), col) }
  NEON.push(grp)
  // soft halo
  for (const [x, y] of grp.pts) for (const [ox, oy] of [[0, -1], [0, 1]]) {
    const q = getc(x + ox, y + oy)
    if (inb(x + ox, y + oy) && !OBJ[(y + oy) * W + x + ox] && bay(x, y + oy) < 0.35) buf[(y + oy) * W + x + ox] = mix(q, col, 0.35)
  }
}
const neonSign = (side, b, k0, rtop, len, col, mode, a, d) => {
  const grp = { pts: [], mode, a, d }
  const w = side === "L" ? b.w : b.w2
  for (let r = rtop; r < rtop + len; r++) {
    const kk = k0
    if (side === "L") { const yb = Math.floor(b.Ly + kk * 0.5); neonPut(grp, b.Lx + kk, yb - b.h + r, col) }
    else { const yb = Math.floor(b.By - kk * 0.5); neonPut(grp, b.Bx + kk, yb - b.h + r, col) }
  }
  NEON.push(grp)
}
const holoBoard = (x0, y0, bw, bh, hue) => {
  const rows = bh
  const rowPts = []
  for (let r = 0; r < bh; r++) rowPts.push([])
  const frame = []
  const main = hue === 0 ? NEONPINK : NEONCYAN, alt = hue === 0 ? NEONCYAN : NEONPINK
  for (let k = 0; k < bw; k++) for (let r = 0; r < bh; r++) {
    const x = x0 + k, y = y0 + r + Math.floor(k * 0.5)
    const edge = k === 0 || k === bw - 1 || r === 0 || r === bh - 1
    let c
    if (edge) c = main
    else {
      const n = hsh(k, r, 40 + hue)
      c = r % 2 === 0 ? (n < 0.55 ? alt : mix(hex("#2a2060"), main, 0.4)) : hex("#2a2060")
      if (r === Math.floor(bh / 2) && k > 1 && k < bw - 2 && k % 3 !== 0) c = hex("#ffe8f4")
    }
    putO(x, y, c)
    if (edge) frame.push([x, y, c, getc(x, y - 1)])
    else rowPts[r].push([x, y, c])
  }
  // legs
  for (let k = 2; k < bw; k += bw - 5) for (let r = bh; r < bh + 3; r++) putO(x0 + k, y0 + r + Math.floor(k * 0.5), hex("#6a6a88"))
  // halo
  for (let k = -2; k < bw + 2; k++) for (let r = -2; r < bh + 2; r++) {
    const x = x0 + k, y = y0 + r + Math.floor(k * 0.5)
    if (!inb(x, y) || OBJ[y * W + x]) continue
    const d = Math.max(-k, k - bw + 1, -r, r - bh + 1)
    if (bay(x, y) < (d <= 1 ? 0.5 : 0.22)) buf[y * W + x] = mix(buf[y * W + x], main, d <= 1 ? 0.55 : 0.3)
  }
  HOLO.push({ rowPts, frame, rows, main })
}

// ---------------------------------------------------------------- the object list (painted back to front)
const OBJS = []
const addObj = (y, fn) => OBJS.push({ y, fn, i: OBJS.length })
const OCC = new Map()
const chooseWall = (list, u, v, du, dv, seed) => {
  const near = new Set()
  for (let i = -1; i <= du; i++) { near.add(OCC.get((u + i) * 1024 + v - 1)); near.add(OCC.get((u + i) * 1024 + v + dv)) }
  for (let j = -1; j <= dv; j++) { near.add(OCC.get((u - 1) * 1024 + v + j)); near.add(OCC.get((u + du) * 1024 + v + j)) }
  let i0 = Math.floor(hsh(u, v, seed) * list.length)
  for (let t = 0; t < list.length; t++) {
    const c = list[(i0 + t) % list.length]
    if (!near.has(c)) return c
  }
  return list[i0]
}
const markOcc = (u, v, du, dv, c) => { for (let i = 0; i < du; i++) for (let j = 0; j < dv; j++) OCC.set((u + i) * 1024 + v + j, c) }

// shadow of a box on the ground, long and down-right
const hull = (pts) => {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], up = []
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of pts.slice().reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p) }
  lo.pop(); up.pop()
  return lo.concat(up)
}
const castShadow = (u, v, du, dv, h) => {
  const fp = [[sx(u, v), sy(u, v)], [sx(u + du, v), sy(u + du, v)], [sx(u + du, v + dv), sy(u + du, v + dv)], [sx(u, v + dv), sy(u, v + dv)]]
  const dx = h * 0.95, dy = h * 0.4
  const pts = fp.concat(fp.map(([x, y]) => [x + dx, y + dy]))
  const hl = hull(pts)
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
  for (const [x, y] of hl) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
    let ok = true
    for (let i = 0; i < hl.length; i++) {
      const a = hl[i], b = hl[(i + 1) % hl.length]
      if ((b[0] - a[0]) * (y + 0.5 - a[1]) - (b[1] - a[1]) * (x + 0.5 - a[0]) < 0) { ok = false; break }
    }
    if (ok) SHM[y * W + x] = 1
  }
}

const building = (b) => {
  const { u, v, du, dv, h } = b
  const cols = faceCols(b.wall)
  const seed = b.seed || 1
  const roof = b.roof || "flat"
  castShadow(u, v, du, dv, h)
  markOcc(u, v, du, dv, b.wall)
  addObj(sy(u + du, v + dv) - 1, () => {
    const fns = [facade(b.style || "win", cols, "L", seed), facade(b.style || "win", cols, "R", seed + 3), topFn(cols, roof, seed, b.topC)]
    const bx = drawBox(u, v, du, dv, h, fns[0], fns[1], fns[2])
    bx.Ly = sy(u, v + dv); bx.By = sy(u + du, v + dv); bx.h = h; bx.w = du * 3; bx.w2 = dv * 3
    if (roof === "pod") podTop(bx.cx, bx.cy + 1, du >= 2 ? 3 : 2)
    if (roof === "hvac" || (roof === "flat" && hsh(u, v, seed + 9) < 0.4)) {
      const hx = Math.round(bx.cx - 1 + (hsh(u, v, 31) - 0.5) * (du + dv)), hy = Math.round(bx.cy)
      for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) putO(hx + i, hy + j, j === 0 ? hex("#e8e4dc") : hex("#9a98b0"))
    }
    if (b.spire) {
      for (let j = 1; j <= b.spire; j++) putO(Math.round(bx.cx), Math.round(bx.cy) - j, j === b.spire ? hex("#ff5a5a") : hex("#e4e0ea"))
      BLINK.push([Math.round(bx.cx), Math.round(bx.cy) - b.spire, hsh(u, v, 77)])
    }
    if (b.trim) neonTrim(bx, b.trim, b.trimMode || "steady", b.a || 0, b.d || 0)
    if (b.sign) neonSign(b.sign.side, bx, b.sign.k, b.sign.r, b.sign.len, b.sign.col, b.sign.mode || "steady", b.sign.a || 0, b.sign.d || 0)
    if (b.holo) holoBoard(Math.round(bx.cx - 6), Math.round(bx.cy - 11), 12, 6, b.holo.hue)
  })
}

// ---------------------------------------------------------------- the districts
const splitBlock = (u, v, w, h2, fn, depth) => {
  const r = hsh(u, v, 11)
  if (w >= 2 && h2 >= 2 && depth < 2 && r < 0.62) {
    if (hsh(u, v, 12) < 0.5 && w >= 2) { const a = Math.max(1, Math.floor(w / 2)); splitBlock(u, v, a, h2, fn, depth + 1); splitBlock(u + a, v, w - a, h2, fn, depth + 1) }
    else { const a = Math.max(1, Math.floor(h2 / 2)); splitBlock(u, v, w, a, fn, depth + 1); splitBlock(u, v + a, w, h2 - a, fn, depth + 1) }
    return
  }
  fn(u, v, w, h2)
}
const forBlocks = (rect, ri, parkChance, fn) => {
  for (let bi = 0; bi * 5 < rect.du; bi++) for (let bj = 0; bj * 5 < rect.dv; bj++) {
    const bu = rect.u0 + bi * 5, bv = rect.v0 + bj * 5
    const bw = Math.min(4, rect.du - bi * 5), bh = Math.min(4, rect.dv - bj * 5)
    if (bw < 1 || bh < 1) continue
    if (hsh(bi, bj, 50 + ri) < parkChance) { PARKS.add(ri * 100000 + bi * 1000 + bj); fn(null, bu, bv, bw, bh); continue }
    splitBlock(bu, bv, bw, bh, (u, v, w, h2) => fn(true, u, v, w, h2), 0)
  }
}
const treeLine = (rect, ri, spacing) => {
  // little street trees in the street cells
  for (let iu = 0; iu < rect.du; iu++) for (let iv = 0; iv < rect.dv; iv++) {
    const su = iu % 5 === 4, sv = iv % 5 === 4
    if (su === sv) continue
    if ((su ? iv : iu) % spacing !== 0) continue
    const u = rect.u0 + iu + 0.5, v = rect.v0 + iv + 0.5
    const x = Math.round(sx(u, v)), y = Math.round(sy(u, v))
    addObj(y, () => drawTree(x, y + 1, 1.25, "dec", hsh(iu, iv, 5) < 0.08 ? "blossom" : "light", false))
  }
}
const genDowntown = () => {
  const R = R_DT, cu = R.u0 + R.du / 2, cv = R.v0 + R.dv / 2
  const pals = [[WALL.cream, WALL.white, WALL.sand, WALL.pgrey, WALL.wgrey, WALL.butter, WALL.pblue, WALL.pink, WALL.salmon, WALL.sage, WALL.rose]]
  forBlocks(R, 0, 0.07, (ok, u, v, w, h2) => {
    if (!ok) { return }
    const dcn = Math.max(Math.abs(u + w / 2 - cu) / (R.du / 2), Math.abs(v + h2 / 2 - cv) / (R.dv / 2))
    const rnd = hsh(u, v, 60)
    let h = Math.round((9 + 56 * Math.pow(1 - clamp(dcn, 0, 1), 1.35)) * (0.55 + 0.85 * rnd)) + 3
    if (rnd > 0.92 && dcn < 0.55) h = 66 + Math.floor(hsh(u, v, 61) * 12)
    h = Math.min(h, 80)
    const glass = hsh(u, v, 62) < 0.16 && h > 14
    const wall = glass ? (hsh(u, v, 63) < 0.5 ? WALL.glass : WALL.glass2) : chooseWall(pals[0], u, v, w, h2, 64)
    const o = { u, v, du: w, dv: h2, h, wall, style: glass ? "band" : h > 9 ? "win" : "plain", seed: Math.floor(hsh(u, v, 65) * 1000) }
    const rr = hsh(u, v, 66)
    o.roof = rr < 0.15 && h > 12 ? "pod" : rr < 0.24 ? "garden" : "flat"
    if (h > 30 && hsh(u, v, 67) < 0.14) o.spire = 5 + Math.floor(hsh(u, v, 68) * 5)
    if (h > 14 && hsh(u, v, 69) < 0.26) { o.trim = hsh(u, v, 70) < 0.5 ? NEONPINK : NEONCYAN; o.trimMode = hsh(u, v, 71) < 0.3 ? "flick" : "steady"; o.a = Math.floor(hsh(u, v, 72) * 48); o.d = 2 + Math.floor(hsh(u, v, 73) * 3) }
    if (h <= 22 && h > 7 && hsh(u, v, 74) < 0.3) o.sign = { side: hsh(u, v, 75) < 0.5 ? "L" : "R", k: 1, r: 2, len: 3 + Math.floor(hsh(u, v, 76) * 3), col: hsh(u, v, 77) < 0.5 ? NEONPINK : NEONCYAN, mode: hsh(u, v, 78) < 0.35 ? "flick" : "steady", a: Math.floor(hsh(u, v, 79) * 48), d: 2 + Math.floor(hsh(u, v, 80) * 4) }
    if (h > 46 && hsh(u, v, 81) < 0.45) o.holo = { hue: hsh(u, v, 82) < 0.5 ? 0 : 1 }
    building(o)
  })
  treeLine(R, 0, 3)
}
const genBrick = () => {
  const R = R_BQ
  const pals = [WALL.brick, WALL.terra, WALL.rose, WALL.cream, WALL.pink, WALL.sand, WALL.white]
  const tops = [hex("#d9744f"), hex("#c45e46"), hex("#e0a080"), hex("#8c9ec0"), hex("#f1e3c0")]
  forBlocks(R, 1, 0.1, (ok, u, v, w, h2) => {
    if (!ok) { return }
    const rnd = hsh(u, v, 90)
    const h = 4 + Math.floor(rnd * 5) + (hsh(u, v, 91) < 0.1 ? 5 : 0)
    const wall = chooseWall(pals, u, v, w, h2, 92)
    building({ u, v, du: w, dv: h2, h, wall, style: "plain", roof: hsh(u, v, 93) < 0.3 ? "garden" : "flat", topC: hsh(u, v, 94) < 0.45 ? tops[Math.floor(hsh(u, v, 95) * tops.length)] : undefined, seed: Math.floor(hsh(u, v, 96) * 1000) })
  })
  treeLine(R, 1, 2)
}
const genSlabs = () => {
  const cols = [hex("#f08c6a"), hex("#f29a74"), hex("#ec7e60"), hex("#f4a07c"), hex("#e88a68"), hex("#f09878")]
  for (let k = 0; k < 7; k++) {
    const h = 44 + Math.floor(hsh(k, 1, 200) * 14)
    building({ u: 66, v: 1 + k * 4, du: 7, dv: 3, h, wall: cols[k % cols.length], style: "slab", roof: "garden", seed: 300 + k })
  }
}
const genIndustrial = () => {
  const walls = [WALL.pgrey, WALL.white, WALL.pblue, WALL.sand, WALL.wgrey]
  const tops = [hex("#e6e8ec"), hex("#bfc4cc"), hex("#d8dce0"), hex("#f4f4f0")]
  const list = [[33, 23, 6, 3, 6], [33, 27, 6, 3, 6], [33, 31, 6, 3, 7], [41, 23, 4, 6, 7], [41, 30, 4, 5, 5], [46, 23, 5, 4, 6], [46, 28, 5, 3, 5], [46, 32, 5, 3, 6]]
  list.forEach(([u, v, du, dv, h], i) => building({ u, v, du, dv, h, wall: walls[i % walls.length], style: "ind", roof: i % 3 === 0 ? "solar" : "flat", topC: tops[i % tops.length], seed: 400 + i }))
  building({ u: 51, v: 35, du: 1, dv: 1, h: 26, wall: WALL.white, style: "ind", roof: "flat", seed: 411, spire: 3 })
}
const genVillage = () => {
  const R = R_VL
  const pals = [WALL.cream, WALL.sage, WALL.pblue, WALL.pink, WALL.butter, WALL.white, WALL.rose]
  const tops = [hex("#d9744f"), hex("#8c9ec0"), hex("#e0a080"), hex("#9ec09a")]
  forBlocks(R, 4, 0.12, (ok, u, v, w, h2) => {
    if (!ok) return
    building({ u, v, du: Math.min(w, 2), dv: Math.min(h2, 2), h: 3 + Math.floor(hsh(u, v, 120) * 4), wall: chooseWall(pals, u, v, w, h2, 121), style: "plain", roof: hsh(u, v, 122) < 0.2 ? "garden" : "flat", topC: tops[Math.floor(hsh(u, v, 123) * tops.length)], seed: Math.floor(hsh(u, v, 124) * 1000) })
  })
  treeLine(R, 4, 2)
}

// ---------------------------------------------------------------- the terrarium hill and its glass domes
const drawHill = () => {
  const { cx, cy, rx, ry } = HILL
  for (let t = 0; t <= 11; t++) {
    const top = t === 11
    const e = t * 0.35, ex_ = rx - e, ey_ = ry - e * 0.5, ccy = cy - t
    for (let y = Math.floor(ccy - ey_); y <= Math.ceil(ccy + ey_); y++) for (let x = Math.floor(cx - ex_); x <= Math.ceil(cx + ex_); x++) {
      const a = (x - cx) / ex_, b = (y - ccy) / ey_
      if (a * a + b * b > 1) continue
      let c
      if (top) {
        const n = fbmn(x * 0.3, y * 0.45, 4)
        const lit = -((x - cx) / rx * 0.5 + (y - ccy) / ry * 0.5)
        c = RAMP.std[clamp(Math.floor(1.9 - lit * 2.2 + (n - 0.5) * 2.6), 1, 3)]
      } else {
        const lit = x < cx - rx * 0.1
        c = lit ? (hsh(x, y, 3) < 0.3 ? RAMP.std[1] : RAMP.std[2]) : (hsh(x, y, 3) < 0.3 ? RAMP.std[3] : RAMP.std[4])
      }
      put(x, y, c)
    }
  }
}
const dome = (cx, cy, r, seed) => {
  const H1 = r * 0.95, H2 = r * 0.5
  const inside = (dx, dy) => (dy < 0 ? (dx / r) * (dx / r) + (dy / H1) * (dy / H1) <= 1 : (dx / r) * (dx / r) + (dy / H2) * (dy / H2) <= 1)
  const x0 = Math.floor(cx - r - 11), x1 = Math.ceil(cx + r + 11), y0 = Math.floor(cy - H1 - 11), y1 = Math.ceil(cy + H2 + 11)
  // soft glow first
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy
    if (inside(dx, dy)) continue
    const k = dy < 0 ? Math.sqrt((dx / r) * (dx / r) + (dy / H1) * (dy / H1)) : Math.sqrt((dx / r) * (dx / r) + (dy / H2) * (dy / H2))
    const t = 1 - (k - 1) * r / 10
    if (t > 0 && bay(x, y) < t * 0.7) put(x, y, mix(getc(x, y), hex("#e4ffd8"), 0.5))
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - cx, dy = y - cy
    if (!inside(dx, dy)) continue
    // what is inside: soil, paths and plants
    const n = fbmn(x * 0.5, y * 0.65, seed)
    let c
    const rel = (dy + H1) / (H1 + H2)       // 0 top .. 1 bottom
    if (n > 0.46 + (1 - rel) * 0.18) {
      const idx = clamp(Math.floor(3.2 - (n - 0.46) * 7 - rel * 0.8), 0, 4)
      c = RAMP.std[idx]
      const t = hsh(x, y, seed + 2)
      if (t < 0.06) c = hex("#e8a0b4")
      else if (t > 0.95) c = hex("#f4c070")
    } else c = hex("#e6d6b8")
    // glass tint, brighter up-left
    const lit = -(dx / r * 0.6 + dy / H1 * 0.7)
    c = mix(c, hex("#d4fff0"), clamp(0.22 + lit * 0.22, 0.08, 0.5))
    // ribs
    const hx = dx / r
    if (dy < 0 && Math.abs(hx * 4 - Math.round(hx * 4)) < 0.13) c = mix(c, hex("#ffffff"), 0.4)
    if (Math.abs(dy / H1 * 3 - Math.round(dy / H1 * 3)) < 0.1) c = mix(c, hex("#ffffff"), 0.28)
    // rim
    if (!inside(dx - 1, dy) || !inside(dx + 1, dy) || !inside(dx, dy - 1) || !inside(dx, dy + 1)) c = dx + dy * 1.4 < 0 ? hex("#f4fffa") : hex("#5aa8a0")
    // highlight glints
    if (lit > 0.78 && bay(x, y) < 0.7) c = hex("#ffffff")
    putO(x, y, c)
  }
}
const genTerrarium = () => {
  const list = [[335, 452, 35, 1], [262, 463, 16, 2], [406, 464, 17, 3], [297, 482, 12, 4], [372, 484, 13, 5], [236, 454, 10, 6], [434, 455, 10, 7]]
  for (const [x, y, r, s] of list) {
    // the shadow of a dome on the hill
    for (let dy = 0; dy <= r * 0.5; dy++) for (let dx = -r; dx <= r * 1.5; dx++) {
      const ex = (dx - r * 0.55) / (r * 1.2), ey = dy / (r * 0.5)
      if (ex * ex + ey * ey <= 1) SHM[clamp(y + dy + 2, 0, H - 1) * W + clamp(x + dx, 0, W - 1)] = 1
    }
    addObj(y + r * 0.5, () => dome(x, y, r, s * 11))
  }
  // trees round the rim of the hilltop
  for (let i = 0; i < 90; i++) {
    const a = hsh(i, 1, 700) * Math.PI * 2, rr = 0.74 + 0.22 * hsh(i, 2, 700)
    const x = Math.round(HILL.cx + Math.cos(a) * rr * (HILL.rx - 10)), y = Math.round(HILL.cy - 11 + Math.sin(a) * rr * (HILL.ry - 6))
    if (list.some(([dx, dy, r]) => Math.hypot((x - dx) / (r + 4), (y - dy) / (r * 0.6 + 3)) < 1)) continue
    const k = hsh(i, 3, 700)
    addObj(y, () => drawTree(x, y, 1.4 + hsh(i, 4, 700) * 0.7, "dec", k < 0.12 ? "blossom" : k < 0.2 ? "autumn" : "light", false, 0))
  }
}

// ---------------------------------------------------------------- pylons, turbines and the maglev line
const LINES = []
const pylon = (x, y, h) => {
  addObj(y, () => {
    for (let j = 0; j < h; j++) putO(x, y - j, j % 3 === 0 ? hex("#c4c0d4") : hex("#8a88a8"))
    for (let i = -2; i <= 2; i++) putO(x + i, y - h + 1, hex("#8a88a8"))
    putO(x - 1, y - h + 3, hex("#8a88a8")); putO(x + 1, y - h + 3, hex("#8a88a8"))
    putO(x - 1, y - 2, hex("#8a88a8")); putO(x + 1, y - 2, hex("#8a88a8"))
    for (let k = 1; k <= 3; k++) put(x + k + 1, y + (k >> 1), mul(getc(x + k + 1, y + (k >> 1)), 0.7))
  })
}
const powerLine = (pts, h) => {
  const sp = pts.map(([u, v]) => [Math.round(sx(u, v)), Math.round(sy(u, v))])
  sp.forEach(([x, y]) => pylon(x, y, h))
  LINES.push(sp.map(([x, y]) => [x, y - h + 1]))
}
const TURB = []
const turbine = (x, y, h) => {
  for (let k = 0; k < h; k++) { const sxk = x + Math.round(k * 0.7), syk = y + Math.round(k * 0.3); SHM[clamp(syk, 0, H - 1) * W + clamp(sxk + 1, 0, W - 1)] = 1 }
  addObj(y, () => {
    for (let j = 0; j < h; j++) { putO(x, y - j, hex("#f4f0e8")); putO(x + 1, y - j, j < 2 ? hex("#c4c0d4") : hex("#aaa8c8")) }
    putO(x, y - h, hex("#e8e4ee")); putO(x + 1, y - h, hex("#aaa8c8"))
  })
  TURB.push([x, y - h])
}
const DECK = (x) => Math.floor(566 - x / 2)
const genMaglev = () => {
  for (let x = 20; x < W + 40; x += 28) {
    const yg = DECK(x) + 9
    addObj(yg, () => {
      for (let j = 0; j < 9; j++) { putO(x, yg - j, hex("#d8d4e4")); putO(x + 1, yg - j, hex("#8a86a8")) }
      putO(x - 1, yg, hex("#8a86a8")); putO(x + 2, yg, hex("#8a86a8"))
    })
    // the deck's shadow on the forest
    for (let k = -14; k < 14; k++) { const xx = x + k, yy = DECK(xx) + 9; for (let j = 0; j < 3; j++) { const sxx = xx + 8, syy = yy + 4 + j; if (inb(sxx, syy)) SHM[syy * W + sxx] = 1 } }
  }
  addObj(1000, () => {
    for (let x = 0; x < W; x++) {
      const y = DECK(x)
      putO(x, y - 1, hex("#f6f2ea")); putO(x, y, hex("#cac6dc")); putO(x, y + 1, hex("#8a86a8"))
      if ((x >> 1) % 2 === 0) putO(x, y + 2, NEONCYAN)
      // soft cyan glow under the deck
      for (let j = 3; j <= 5; j++) if (bay(x, y + j) < (j === 3 ? 0.5 : j === 4 ? 0.3 : 0.14)) put(x, y + j, mix(getc(x, y + j), NEONCYAN, 0.42))
    }
  })
}

// ================================================================ the still picture
genDowntown(); genBrick(); genSlabs(); genIndustrial(); genVillage(); genTerrarium()
buildGround()
drawHill()

// trees: a jittered, half-offset grid, thinned by what the land is (road, clearing, meadow, edge)
const TREE_COUNT = { n: 0 }
for (let gy = -3; gy < H + 6; gy += 3) {
  const ri = (gy + 3) / 3
  for (let gx = -4; gx < W + 4; gx += 3) {
    const jx = gx + (ri & 1 ? 2 : 0) + Math.round((hsh(gx, gy, 1) - 0.5) * 3)
    const jy = gy + Math.round((hsh(gx, gy, 2) - 0.5) * 3)
    if (jx < -2 || jx >= W + 2 || jy < 0 || jy >= H + 4) continue
    const p = clamp(jy, 0, H - 1) * W + clamp(jx, 0, W - 1)
    const dd = DD[p], rd = RD[p]
    const margin = 2.0 + 2.6 * fbmn(jx * 0.03, jy * 0.05, 3)
    if (rd < 1.15 || dd < margin) continue
    let dens = 1
    const mm = fbmn(jx * 0.012, jy * 0.02, 8)
    if (mm > 0.66) dens = 0.08
    else if (mm > 0.6) dens = 0.45
    if (dd < margin + 1.4) dens *= 0.6
    if (hsh(gx, gy, 3) > dens) continue
    const title = jx < 300 && jy < 205
    const cn = fbmn(jx * 0.02, jy * 0.03, 99), tn = fbmn(jx * 0.045, jy * 0.05, 5), t1 = hsh(gx, gy, 4)
    let kind = "dec", ramp = "std", s = 1.25 + hsh(gx, gy, 5) * 1.0
    if (title ? t1 < 0.85 : cn > 0.54) { kind = "con"; ramp = "dark"; s *= 0.92 }
    else if (cn < 0.3) ramp = "light"
    else if (t1 < 0.1) ramp = "light"
    if (!title) {
      if (tn > 0.76 && hsh(gx, gy, 6) < 0.4) ramp = "autumn"
      else if (tn < 0.2 && hsh(gx, gy, 7) < 0.3) ramp = "blossom"
      else if (hsh(gx, gy, 8) < 0.004) ramp = "autumn"
    }
    if (dd < margin + 1.2 && (ramp === "std" || ramp === "light")) ramp = "dark"
    const shim = hsh(gx, gy, 9) < 0.014
    const pn = fbmn(jx * 0.05, jy * 0.07, 31), bias = pn > 0.72 ? 2 : pn > 0.42 ? 1 : (hsh(gx, gy, 10) < 0.4 ? 1 : 0)
    TREE_COUNT.n++
    addObj(jy, () => drawTree(jx, jy, s, kind, ramp, shim, bias))
  }
}
powerLine([[52, 29], [62, 29], [72, 29], [72, 40], [72, 51], [72, 62], [72, 73], [72, 84], [72, 95], [72, 106], [72, 117]], 9)
powerLine([[42, 18], [42, 8], [42, -2], [42, -12], [42, -22], [42, -32], [42, -42]], 9)
for (const [x, y, h] of [[300, 150, 20], [420, 150, 20], [445, 178, 20], [570, 312, 20], [205, 395, 18]]) turbine(x, y, h)
genMaglev()

OBJS.sort((a, b) => a.y - b.y || a.i - b.i)
for (const o of OBJS) o.fn()

// cast shadows: cool, blue-violet, over ground and canopy but never on a building face
const shadowC = (c) => mix(mul(c, 0.76), hex("#3a3a8a"), 0.2)
for (let p = 0; p < W * H; p++) if (SHM[p] && !OBJ[p]) buf[p] = shadowC(buf[p])

// power lines between the pylons
for (const line of LINES) for (let i = 0; i + 1 < line.length; i++) {
  const [x0, y0] = line[i], [x1, y1] = line[i + 1]
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 2)
    if (inb(x, y)) buf[y * W + x] = mix(buf[y * W + x], hex("#40385c"), 0.7)
  }
}

// aerial haze: warm, lighter and flatter toward the top, in dithered steps
const HAZEC = hex("#f2dcae")
const hazeT = (y) => 0.38 * Math.pow(1 - y / H, 1.35)
const hz = (x, y, c) => {
  const q = Math.floor(hazeT(y) * 10 + bay(x, y)) / 10
  return q <= 0 ? c : mix(c, HAZEC, q)
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) buf[y * W + x] = hz(x, y, buf[y * W + x])

// the dark pocket of forest behind the title: a dithered backing, deep green-navy
const NAVY = hex("#0c2430")
for (let y = 0; y < 215; y++) for (let x = 0; x < 310; x++) {
  const e = Math.hypot((x - 148) / 170, (y - 102) / 118)
  const sh = smooth(1.0, 0.3, e) * 0.68
  if (sh <= 0) continue
  const q = Math.floor(sh * 6 + bay(x, y)) / 6
  if (q > 0) buf[y * W + x] = mix(buf[y * W + x], NAVY, q)
}
for (const g of NEON) g.pts = g.pts.map(([x, y, on, off]) => [x, y, hz(x, y, on), hz(x, y, off)])
for (const hb of HOLO) { hb.rowPts = hb.rowPts.map((r) => r.map(([x, y, c]) => [x, y, hz(x, y, c)])) }

// ================================================================ the title (Archivo Black outlines from the supplied SVG)
const GLYPHS = {"neon":[{"x":22,"y":19,"rows":[[0,17,40,18],[0,17,40,18],[0,18,40,18],[0,19,40,18],[0,20,40,18],[0,21,40,18],[0,22,40,18],[0,23,40,18],[0,23,40,18],[0,24,40,18],[0,25,40,18],[0,26,40,18],[0,27,40,18],[0,28,40,18],[0,29,40,18],[0,29,40,18],[0,30,40,18],[0,31,40,18],[0,32,40,18],[0,33,40,18],[0,34,40,18],[0,35,40,18],[0,35,40,18],[0,36,40,18],[0,37,40,18],[0,38,40,18],[0,39,40,18],[0,58],[0,58],[0,58],[0,17,18,40],[0,17,19,39],[0,17,19,39],[0,17,20,38],[0,17,21,37],[0,17,22,36],[0,17,23,35],[0,17,24,34],[0,17,25,33],[0,17,25,33],[0,17,26,32],[0,17,27,31],[0,17,28,30],[0,17,29,29],[0,17,30,28],[0,17,31,27],[0,17,31,27],[0,17,32,26],[0,17,33,25],[0,17,34,24],[0,17,35,23],[0,17,36,22],[0,17,37,21],[0,17,38,20],[0,17,38,20],[0,17,39,19],[0,17,40,18],[0,17,41,16]]},{"x":88,"y":19,"rows":[[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,50],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,45],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,19],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,51],[0,50]]},{"x":142,"y":18,"rows":[[24,15],[19,24],[16,30],[14,35],[12,38],[11,41],[9,44],[8,46],[7,48],[6,50],[6,51],[5,53],[4,54],[4,55],[3,24,36,23],[3,21,38,22],[2,21,40,20],[2,20,41,20],[2,19,41,20],[1,20,42,19],[1,19,42,20],[1,19,43,19],[1,19,43,19],[1,18,43,19],[0,19,43,19],[0,19,44,18],[0,19,44,18],[0,19,44,18],[0,19,44,19],[0,19,44,19],[0,19,44,19],[0,19,44,19],[0,19,44,18],[0,19,44,18],[0,19,44,18],[1,18,43,19],[1,18,43,19],[1,19,43,19],[1,19,43,19],[1,20,42,19],[1,20,42,19],[2,20,41,20],[2,21,40,21],[3,21,39,21],[3,22,38,22],[3,25,34,25],[4,55],[5,53],[5,52],[6,51],[7,49],[8,47],[9,45],[10,43],[11,40],[13,37],[15,33],[17,28],[21,21],[26,10]]},{"x":211,"y":19,"rows":[[0,16,40,17],[0,17,40,17],[0,18,40,17],[0,19,40,17],[0,20,40,17],[0,21,40,17],[0,21,40,17],[0,22,40,17],[0,23,40,17],[0,24,40,17],[0,25,40,17],[0,26,40,17],[0,27,40,17],[0,27,40,17],[0,28,40,17],[0,29,40,17],[0,30,40,17],[0,31,40,17],[0,32,40,17],[0,32,40,17],[0,33,40,17],[0,34,40,17],[0,35,40,17],[0,36,40,17],[0,37,40,17],[0,38,40,17],[0,38,40,17],[0,39,40,17],[0,57],[0,57],[0,57],[0,17,18,39],[0,17,19,38],[0,17,20,37],[0,17,21,36],[0,17,22,35],[0,17,22,35],[0,17,23,34],[0,17,24,33],[0,17,25,32],[0,17,26,31],[0,17,27,30],[0,17,28,29],[0,17,29,28],[0,17,29,28],[0,17,30,27],[0,17,31,26],[0,17,32,25],[0,17,33,24],[0,17,34,23],[0,17,35,22],[0,17,35,22],[0,17,36,21],[0,17,37,20],[0,17,38,19],[0,17,39,18],[0,17,40,17],[0,17,41,16]]}],"ter":{"x":22,"y":90,"rows":[[0,26,28,23,54,20,83,20,118,10,139,20,168,9,181,9,199,9,211,13,231,12],[0,26,28,23,54,22,83,22,118,11,139,22,168,9,181,9,199,9,211,13,231,12],[0,26,28,23,54,23,83,23,117,12,139,23,168,9,181,9,199,9,211,13,231,12],[0,26,28,23,54,24,83,24,117,13,139,24,168,9,181,9,199,9,211,13,230,13],[0,26,28,23,54,25,83,24,117,13,139,25,168,9,181,9,199,9,211,14,230,13],[0,26,28,23,54,25,83,25,116,14,139,25,168,9,181,9,199,9,211,14,230,13],[0,26,28,9,54,9,70,9,83,8,98,10,116,15,139,9,155,10,168,9,181,9,199,9,211,14,230,13],[9,8,28,9,54,9,71,9,83,8,99,9,116,15,139,9,156,9,168,9,181,9,199,9,211,14,229,14],[9,8,28,9,54,9,71,9,83,8,99,9,115,8,124,7,139,9,156,9,168,9,181,9,199,9,211,15,229,14],[9,8,28,9,54,9,71,8,83,8,99,9,115,7,124,8,139,9,156,9,168,9,181,9,199,9,211,15,229,14],[9,8,28,21,54,9,70,9,83,8,98,10,114,8,124,8,139,9,155,9,168,9,181,9,199,9,211,15,229,14],[9,8,28,21,54,25,83,24,114,8,124,8,139,25,168,9,181,9,199,9,211,15,228,15],[9,8,28,21,54,24,83,24,114,8,125,8,139,24,168,9,181,9,199,9,211,8,220,7,228,6,235,8],[9,8,28,21,54,23,83,23,113,8,125,8,139,24,168,9,181,9,199,9,211,8,220,7,228,6,235,8],[9,8,28,21,54,22,83,22,113,8,125,9,139,22,168,9,181,9,199,9,211,8,220,14,235,8],[9,8,28,21,54,21,83,20,113,8,126,8,139,21,168,9,181,9,199,9,211,8,220,13,234,9],[9,8,28,9,54,21,83,20,112,8,126,8,139,21,168,9,181,9,199,9,211,8,221,12,234,9],[9,8,28,9,54,9,66,10,83,8,95,9,112,23,139,9,151,10,168,9,181,9,199,9,211,8,221,12,234,9],[9,8,28,9,54,9,67,9,83,8,95,9,112,23,139,9,152,9,168,9,182,9,198,9,211,8,221,11,234,9],[9,8,28,9,54,9,67,10,83,8,96,9,111,24,139,9,152,10,168,9,182,9,198,9,211,8,221,11,234,9],[9,8,28,23,54,9,68,9,83,8,96,10,111,25,139,9,153,9,168,9,182,25,211,8,222,10,234,9],[9,8,28,23,54,9,68,10,83,8,97,9,110,26,139,9,153,10,168,9,183,23,211,8,222,10,234,9],[9,8,28,23,54,9,69,9,83,8,97,10,110,26,139,9,154,9,168,9,183,23,211,8,222,9,234,9],[9,8,28,23,54,9,69,10,83,8,98,9,110,8,128,9,139,9,154,10,168,9,184,21,211,8,223,8,234,9],[9,8,28,23,54,9,70,9,83,8,98,10,109,9,128,9,139,9,155,9,168,9,185,19,211,8,223,8,234,9],[9,8,28,23,54,9,70,10,83,8,99,9,109,9,128,10,139,9,155,10,168,9,187,15,211,8,223,8,234,9],[9,8,29,22,55,8,71,9,83,8,99,9,109,8,129,8,140,8,156,9,169,7,190,9,212,7,224,6,235,8]]},"taglineY":148}
const decodeMask = (g) => {
  const m = new Uint8Array(W * H)
  g.rows.forEach((row, j) => { for (let i = 0; i < row.length; i += 2) for (let k = 0; k < row[i + 1]; k++) m[(g.y + j) * W + g.x + row[i] + k] = 1 })
  return m
}
const SMALL = {
  A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"], B: ["XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."],
  C: [".XXX.", "X...X", "X....", "X....", "X....", "X...X", ".XXX."], D: ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."],
  E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"], H: ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
  I: [".XXX.", "..X..", "..X..", "..X..", "..X..", "..X..", ".XXX."], K: ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
  L: ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"], N: ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
  O: [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."], P: ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
  R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"], S: [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
  T: ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."], U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
  Y: ["X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."], Z: ["XXXXX", "....X", "...X.", "..X..", ".X...", "X....", "XXXXX"],
}
const textMask = (str, font, gw, gh, scale, gap, x0, y0) => {
  const mask = new Uint8Array(W * H)
  let x = x0
  for (const ch of str) {
    if (ch === " ") { x += gw * scale + gap; continue }
    const g = font[ch]
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      if (g[j][i] !== "X") continue
      for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) { const qx = x + i * scale + xx, qy = y0 + j * scale + yy; if (inb(qx, qy)) mask[qy * W + qx] = 1 }
    }
    x += gw * scale + gap
  }
  return mask
}
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
const boxOf = (g, pad) => [g.x - pad, g.y - pad, Math.max(...g.rows.map((r) => (r.length ? r[r.length - 2] + r[r.length - 1] : 0))) + 2 * pad, g.rows.length + 2 * pad]
const shadowList = (mask, dx, dy, box) => listOf(box, (x, y, i) => (!mask[i] && inb(x - dx, y - dy) && mask[(y - dy) * W + (x - dx)] ? [x, y] : null))
const C_CORAL = hex("#ff4a6e"), C_PURPLE = hex("#3b1a5c"), C_MINT = hex("#3dffcf"), C_INK = hex("#0a1c28"), C_PALE = hex("#f7c6d6")
const TITLE = { neon: [], ter: null, outline: [] }
const ANY = new Uint8Array(W * H), UNI = new Uint8Array(W * H)
const neonMasks = GLYPHS.neon.map(decodeMask)
const terMask = decodeMask(GLYPHS.ter)
for (const m of [...neonMasks, terMask]) for (let i = 0; i < m.length; i++) if (m[i]) ANY[i] = 1
GLYPHS.neon.forEach((g, gi) => {
  const m = neonMasks[gi], box = boxOf(g, 7)
  const out = outsideOf(m, box)
  const body = listOf(box, (x, y, i) => (m[i] ? [x, y] : null))
  const shadow = shadowList(m, 3, 3, [box[0], box[1], box[2] + 4, box[3] + 4]).filter(([x, y]) => !ANY[y * W + x])
  for (const [x, y] of body) UNI[y * W + x] = 1
  for (const [x, y] of shadow) UNI[y * W + x] = 1
  TITLE.neon.push({ body, shadow, glow: listOf(box, (x, y, i) => (!ANY[i] && out[i] >= 1 && out[i] <= 3 ? [x, y, out[i]] : null)) })
})
{
  const g = GLYPHS.ter, box = boxOf(g, 6)
  const out = outsideOf(terMask, box)
  TITLE.ter = {
    body: listOf(box, (x, y, i) => (terMask[i] ? [x, y] : null)),
    shadow: shadowList(terMask, 2, 2, [box[0], box[1], box[2] + 4, box[3] + 4]).filter(([x, y]) => !ANY[y * W + x]),
    glow: listOf(box, (x, y, i) => (!ANY[i] && out[i] >= 1 && out[i] <= 2 ? [x, y, out[i]] : null)),
  }
  for (const [x, y] of TITLE.ter.body) UNI[y * W + x] = 1
  for (const [x, y] of TITLE.ter.shadow) UNI[y * W + x] = 1
}
// a 1 px dark outline round both words and their shadows so they stand off the forest
for (let y = 14; y < 125; y++) for (let x = 14; x < 285; x++) {
  const i = y * W + x
  if (UNI[i]) continue
  let near = false
  for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (UNI[(y + dy) * W + x + dx]) { near = true; break }
  if (near) TITLE.outline.push([x, y])
}
// the tagline, still: chunky wide-spaced caps in pale pink with a dark outline and a soft glow
{
  const sy0 = GLYPHS.taglineY
  for (const [line, yy] of [["A COZY CYBERPUNK", sy0], ["CITY BUILDER", sy0 + 25]]) {
    const m3 = textMask(line, SMALL, 5, 7, 2, 6, 22, yy)
    const box3 = [14, yy - 8, 16 * 16 + 20, 14 + 16]
    const out3 = outsideOf(m3, box3)
    for (const [x, y, d] of listOf(box3, (x, y, i) => (!m3[i] && out3[i] >= 1 && out3[i] <= 2 ? [x, y, out3[i]] : null))) put(x, y, d === 1 ? C_INK : mix(getc(x, y), NAVY, 0.5))
    for (const [x, y] of listOf(box3, (x, y, i) => (m3[i] ? [x, y] : null))) put(x, y, C_PALE)
  }
}
const BASE = Int32Array.from(buf)

// ================================================================ clouds: dithered clusters, a warm lit top and a grey-lavender underside
const CLOUD_COL = hexList(["#fffaf0", "#fcefd6", "#eee0d8", "#d2c8de", "#b2aacb"])
const makeCloud = (spec) => {
  const { cx, cy, rx, ry, n, seed, sq } = spec
  const blobs = []
  for (let i = 0; i < n; i++) {
    const a = hsh(i, seed, 1) * Math.PI * 2, r = Math.sqrt(hsh(i, seed, 2))
    const brx = (0.17 + 0.22 * hsh(i, seed, 3)) * rx
    blobs.push([cx + Math.cos(a) * r * rx * 0.8, cy + Math.sin(a) * r * ry * 0.8, brx, brx * sq])
  }
  const x0 = Math.floor(cx - rx * 1.2) - 4, x1 = Math.ceil(cx + rx * 1.2) + 4
  const y0 = Math.floor(cy - ry * 1.6) - 4, y1 = Math.ceil(cy + ry * 1.6) + 4
  const gw = x1 - x0, gh = y1 - y0
  const D = new Float32Array(gw * gh)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let d = 0
    const X = x + x0, Y = y + y0
    for (const [bx, by, brx, bry] of blobs) {
      const t = ((X - bx) / brx) * ((X - bx) / brx) + ((Y - by) / bry) * ((Y - by) / bry)
      if (t < 1) d += (1 - t) * (1 - t)
    }
    D[y * gw + x] = d > 0 ? d + (fbmn(X * 0.09, Y * 0.14, seed * 5) - 0.5) * 0.5 : 0
  }
  const dens = (x, y) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : D[y * gw + x])
  const pix = [], sh = []
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const d = D[y * gw + x]
    const a = clamp((d - 0.1) / 0.5, 0, 1)
    if (a <= 0) continue
    if (a > 0.5 && bay(x + 2, y + 1) < 0.45) sh.push([x + 16, y + 9])
    if (a <= bay(x, y)) continue
    const gU = dens(x - 2, y - 3), gD = dens(x + 2, y + 3)
    const up = clamp(dens(x, y - 7) - 0.7, 0, 1)
    const Lc = clamp(0.6 - 0.9 * (gU - gD) - 0.4 * up, 0, 1)
    const idx = clamp(4 - Math.floor(Lc * 5 + (bay(x, y) - 0.5) * 0.9), 0, 4)
    pix.push([x, y, CLOUD_COL[idx]])
  }
  return { pix, sh, x0, y0 }
}
const CLOUDS = [
  { cx: 60, cy: 432, rx: 200, ry: 74, n: 20, seed: 1, sq: 0.5, amp: 3, ph: 0 },
  { cx: 595, cy: 40, rx: 150, ry: 54, n: 16, seed: 2, sq: 0.5, amp: 3, ph: 1.7 },
  { cx: 300, cy: 322, rx: 72, ry: 8, n: 7, seed: 3, sq: 0.28, amp: 5, ph: 3.1 },
  { cx: 505, cy: 186, rx: 62, ry: 7, n: 6, seed: 4, sq: 0.26, amp: 5, ph: 4.4 },
  { cx: 150, cy: 262, rx: 50, ry: 6, n: 5, seed: 5, sq: 0.26, amp: 4, ph: 5.3 },
].map((s) => ({ ...makeCloud(s), amp: s.amp, ph: s.ph }))

// ================================================================ the moving parts
const inLoop = (f, a, d) => ((f - a + FRAMES * 4) % FRAMES) < d
const pickEvery = (list, n) => { const step = Math.max(1, Math.floor(list.length / n)); const out = []; for (let i = Math.floor(step / 2); i < list.length && out.length < n; i += step) out.push(list[i]); return out }
const SHIMS = pickEvery(SHIM.filter(([x, y, c0]) => inb(x, y) && BASE[y * W + x] === hz(x, y, c0)), 150).map(([x, y, c0, c1], i) => [x, y, hz(x, y, c0), hz(x, y, c1), (i * 7) % 24])
const BLINKS = BLINK.map(([x, y, ph]) => [x, y, Math.floor(ph * 12), BASE[y * W + x]])
const CAR_ROADS = []
ROADS.forEach(([ax, f, a, b], i) => {
  const p0 = ax === "u" ? [a, f] : [f, a], p1 = ax === "u" ? [b, f] : [f, b]
  const x0 = sx(p0[0], p0[1]), y0 = sy(p0[0], p0[1]), x1 = sx(p1[0], p1[1]), y1 = sy(p1[0], p1[1])
  const L = Math.hypot(x1 - x0, y1 - y0)
  if (L < 60) return
  const wl = Math.min(L, 130)
  const ws = hsh(i, 3, 600) * (L - wl)
  for (let k = 0; k < 2; k++) CAR_ROADS.push({ x0, y0, dx: (x1 - x0) / L, dy: (y1 - y0) / L, ws, wl, ph: (k * 0.5 + hsh(i, k, 601) * 0.3) * wl, dir: k ? -1 : 1, lane: k ? 1 : 0 })
})
const TRAIN_LEN = 5, CAR_L = 15, TRAIN_PERIOD = 860

const renderFrame = (f) => {
  const cur = Int32Array.from(BASE)
  const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) cur[y * W + x] = c }
  // neon: a few signs and trims flicker off for a couple of frames
  for (const g of NEON) if (g.mode === "flick" && inLoop(f, g.a, g.d)) for (const [x, y, , off] of g.pts) set(x, y, off)
  // holo boards: a bright scan band climbs each one, and one board drops out for two frames
  HOLO.forEach((hb, i) => {
    const rb = Math.floor(((f + i * 9) % FRAMES) / FRAMES * (hb.rows + 4)) - 2
    for (let r = 0; r < hb.rows; r++) if (r === hb.rows - 1 - rb) for (const [x, y, c] of hb.rowPts[r] || []) set(x, y, mix(c, hex("#ffffff"), 0.6))
    if (i === 2 && inLoop(f, 33, 2)) for (const [x, y, c, u] of hb.frame) set(x, y, hz(x, y, u))
  })
  for (const [x, y, ph, c] of BLINKS) set(x, y, ((f + ph) % 12) < 3 ? hex("#ff4a4a") : mix(c, hex("#ffffff"), 0.2))
  for (const [x, y, c0, c1, ph] of SHIMS) set(x, y, ((f + ph) % 24) < 6 ? c1 : c0)
  // wind turbines: three blades, two thirds of a turn per loop (so the loop closes on the 120 degree symmetry)
  TURB.forEach(([hx, hy], k) => {
    const th = (f / FRAMES) * 2 * (2 * Math.PI / 3) + k * 0.9
    for (let b = 0; b < 3; b++) {
      const ang = th + b * 2 * Math.PI / 3
      for (let i = 1; i <= 9; i++) {
        const x = hx + Math.round(Math.cos(ang) * i), y = hy + Math.round(Math.sin(ang) * i * 0.85)
        set(x, y, hz(x, y, i > 6 ? hex("#ffffff") : hex("#ece8f0")))
      }
    }
    set(hx, hy, hz(hx, hy, hex("#8a88a8")))
  })
  // tiny cars: a bright head and a dim tail along a window of each road
  for (const c of CAR_ROADS) {
    const s = ((c.ph + f * c.wl / FRAMES) % c.wl)
    if (s < 4 || s > c.wl - 4) continue
    const pos = c.dir > 0 ? c.ws + s : c.ws + c.wl - s
    const x = Math.round(c.x0 + c.dx * pos + (c.lane ? 1 : -1) * (-c.dy) * 0.9), y = Math.round(c.y0 + c.dy * pos + (c.lane ? 1 : -1) * c.dx * 0.45)
    const bx = Math.round(c.x0 + c.dx * (pos - c.dir * 2)), by = Math.round(c.y0 + c.dy * (pos - c.dir * 2))
    set(x, y, hex("#fff6d0"))
    set(x - Math.sign(c.dx) * c.dir, y - Math.sign(c.dy) * c.dir, mix(getc(bx, by), hex("#ff9a58"), 0.8))
  }
  // the maglev train: white cars with a teal window band, a pink stripe and a cyan glow
  {
    const head = -90 + (((f + 27) % FRAMES) / FRAMES) * TRAIN_PERIOD
    const glow = []
    for (let ci = 0; ci < TRAIN_LEN; ci++) {
      const xe = Math.round(head - ci * (CAR_L + 1)), xs = xe - CAR_L + 1
      for (let x = xs; x <= xe; x++) {
        if (x < -2 || x >= W + 2) continue
        const y = DECK(x), nose = ci === 0 && x > xe - 4 ? xe - x : 99
        const top = nose < 4 ? 5 - (3 - nose) : 6
        for (let j = 1; j <= top; j++) {
          const yy = y - 1 - j
          let c = j === top ? hex("#fffdf6") : j === 1 ? hex("#9a96bc") : hex("#e6e2f0")
          if (j === 3 || j === 4) c = ((x - xs) % 3 === 2 || (ci === 0 && x > xe - 3)) ? hex("#e6e2f0") : hex("#4cc4d0")
          if (j === 2) c = (x & 1) ? NEONPINK : hex("#e6e2f0")
          set(x, yy, c)
        }
        glow.push([x, y])
      }
    }
    for (const [x, y] of glow) for (let j = 3; j <= 6; j++) if (bay(x, y + j) < 0.8 - j * 0.12) set(x, y + j, mix(getc(x, y + j), NEONCYAN, 0.5))
  }
  // cloud shadows then clouds, drifting a few pixels on a sine so the loop closes
  const offs = CLOUDS.map((c) => [Math.round(c.amp * Math.sin((2 * Math.PI * f) / FRAMES + c.ph)), Math.round(c.amp * 0.4 * Math.cos((2 * Math.PI * f) / FRAMES + c.ph))])
  CLOUDS.forEach((c, i) => {
    const [dx, dy] = offs[i]
    for (const [x, y] of c.sh) { const X = c.x0 + x + dx, Y = c.y0 + y + dy; if (X >= 0 && X < W && Y >= 0 && Y < H) { const p = Y * W + X; cur[p] = mix(cur[p], hex("#3a3a7a"), 0.2) } }
  })
  CLOUDS.forEach((c, i) => {
    const [dx, dy] = offs[i]
    for (const [x, y, col] of c.pix) set(c.x0 + x + dx, c.y0 + y + dy, col)
  })
  // the title: NEON stutters once, TERRARIUM breathes
  const off = (i, s) => (i === 1 || i === 3) && [0, 2].includes(f - (s + (i === 3 ? 1 : 0)))
  TITLE.neon.forEach((l, i) => {
    if (off(i, 30)) return
    for (const [x, y, d] of l.glow) if (bay(x, y) < (d === 1 ? 0.62 : d === 2 ? 0.4 : 0.2)) set(x, y, C_CORAL)
  })
  const pg = Math.sin((2 * Math.PI * f) / FRAMES)
  for (const [x, y, d] of TITLE.ter.glow) if (bay(x, y) < (d === 1 ? 0.5 + 0.22 * pg : 0.26 + 0.16 * pg)) set(x, y, C_MINT)
  for (const [x, y] of TITLE.outline) set(x, y, C_INK)
  for (const l of TITLE.neon) for (const [x, y] of l.shadow) set(x, y, C_PURPLE)
  for (const [x, y] of TITLE.ter.shadow) set(x, y, C_CORAL)
  TITLE.neon.forEach((l, i) => { const k = off(i, 30) ? C_PURPLE : C_CORAL; for (const [x, y] of l.body) set(x, y, k) })
  for (const [x, y] of TITLE.ter.body) set(x, y, C_MINT)
  return cur
}
const FRAMEDATA = []
for (let f = 0; f < FRAMES; f++) FRAMEDATA.push(renderFrame(f))

// ================================================================ one shared palette for every frame
const KEYS = []
for (let i = 33; i < 127; i++) { const ch = String.fromCharCode(i); if (!'."_\\`$# '.includes(ch)) KEYS.push(ch) }
for (let i = 0x100; i < 0x100 + 200; i++) KEYS.push(String.fromCharCode(i))
const NCOL = 232
const hist = new Map()
for (const fr of FRAMEDATA) for (let i = 0; i < fr.length; i++) hist.set(fr[i], (hist.get(fr[i]) || 0) + 1)
const FORCED = [C_CORAL, C_PURPLE, C_MINT, C_INK, C_PALE, NEONPINK, NEONCYAN, WARM, hex("#ffffff"), hex("#ff4a4a"), ...RAMP.std, RAMP.autumn[1], RAMP.blossom[1], ...CLOUD_COL]
const palette = [...new Set(FORCED)]
{
  const rest = [...hist].filter(([c]) => !palette.includes(c)).map(([c, n]) => ({ c, w: Math.pow(n, 0.55), r: cr(c), g: cg(c), b: cb(c) }))
  const boxes = [rest]
  const range = (bx) => {
    let lo = [255, 255, 255], hi = [0, 0, 0]
    for (const e of bx) { lo = [Math.min(lo[0], e.r), Math.min(lo[1], e.g), Math.min(lo[2], e.b)]; hi = [Math.max(hi[0], e.r), Math.max(hi[1], e.g), Math.max(hi[2], e.b)] }
    return [(hi[0] - lo[0]) * 0.8, (hi[1] - lo[1]) * 1.0, (hi[2] - lo[2]) * 0.7]
  }
  const target = NCOL - palette.length
  while (boxes.length < target) {
    let bi = -1, best = -1
    boxes.forEach((bx, i) => { if (bx.length < 2) return; const rg = range(bx); const sc = Math.max(...rg) * Math.sqrt(bx.reduce((a, e) => a + e.w, 0)); if (sc > best) { best = sc; bi = i } })
    if (bi < 0) break
    const bx = boxes[bi], rg = range(bx)
    const ax = rg[0] >= rg[1] && rg[0] >= rg[2] ? "r" : rg[1] >= rg[2] ? "g" : "b"
    bx.sort((a, b) => a[ax] - b[ax])
    const tot = bx.reduce((a, e) => a + e.w, 0)
    let acc = 0, cut = 1
    for (let i = 0; i < bx.length; i++) { acc += bx[i].w; if (acc >= tot / 2) { cut = clamp(i + 1, 1, bx.length - 1); break } }
    boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut))
  }
  for (const bx of boxes) {
    if (!bx.length) continue
    let r = 0, g = 0, b = 0, t = 0
    for (const e of bx) { r += e.r * e.w; g += e.g * e.w; b += e.b * e.w; t += e.w }
    palette.push(rgb(r / t, g / t, b / t))
  }
}
const nearest = new Map()
const toIdx = (c) => {
  let i = nearest.get(c)
  if (i !== undefined) return i
  let best = 1e18
  const r = cr(c), g = cg(c), b = cb(c)
  for (let k = 0; k < palette.length; k++) {
    const p = palette[k], dr = cr(p) - r, dg = cg(p) - g, db = cb(p) - b
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
    if (d < best) { best = d; i = k }
  }
  nearest.set(c, i)
  return i
}
const PAL = {}
palette.forEach((c, i) => { PAL[KEYS[i]] = "#" + c.toString(16).padStart(6, "0") })
pal(PAL)
const FRAMEIDX = FRAMEDATA.map((fr) => { const o = new Uint8Array(W * H); for (let i = 0; i < fr.length; i++) o[i] = toIdx(fr[i]); return o })

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
sprite("cover_forest", { w: W, h: H }, (c) => emit(c, FRAMEIDX[0]))
anim("cover_forest_loop", { w: W, h: H, frames: FRAMES, fps: 12 }, (c) => emit(c, FRAMEIDX[c.frame]))
