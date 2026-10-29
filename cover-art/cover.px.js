// NEON TERRARIUM cover, 630x500. The whole picture is rasterized into one buffer (so the glows,
// the title mask and the scanlines can read what is already there), then handed to pxl as runs.
const W = 630, H = 500

const PAL = {
  // sky, indigo -> warm pink
  0: "#170f3a", 1: "#261558", 2: "#3d2078", 3: "#61298a", 4: "#913a92", 5: "#c9508f", 6: "#f08592",
  // clouds: lit top, pink, lavender, violet shadow
  a: "#ffc9b6", b: "#f7a3b4", c: "#d29ad6", d: "#9a68c0",
  // walls: plum, slate, rust (top, lit side, dark side)
  P: "#86508f", p: "#5d2c66", q: "#3d1e4d",
  S: "#8f9cbf", s: "#5e6d92", t: "#3a4670",
  R: "#e48a82", r: "#b05a6c", u: "#74364f",
  // lit windows
  y: "#ffc94a", h: "#ffe9a0", n: "#5ef0ff",
  // neon and title
  H: "#ff4f9a", M: "#e02fd0", V: "#8a5bff", C: "#ff6f61", W: "#ffe6ee", G: "#7dffc4", F: "#fff0d0",
  // greenery, taxi, red lights
  g: "#4fae5a", e: "#2e7a4a", Y: "#ffd23a", x: "#ff3b4a",
}
pal(PAL)
const KEYS = Object.keys(PAL).join("")
const IDX = {}
for (let i = 0; i < KEYS.length; i++) IDX[KEYS[i]] = i

const fb = new Uint8Array(W * H)
const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H
const put = (x, y, k) => { if (inb(x, y)) fb[y * W + x] = IDX[k] }
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

// ================================================================ title geometry (needed first so
// the stars and clouds leave it alone)
const TITLE_BOX = [14, 14, 330, 210]

// ================================================================ sky
const SKYV = (x, y) => {
  let v = 6.35 * Math.pow(clamp(y / 352, 0, 1), 1.02)
  v += 1.4 * Math.exp(-Math.hypot((x - 400) / 1.7, y - 340) / 105)
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
  else if (r < 0.00135) { put(x, y, "F") }
  else if (r < 0.00142) { put(x, y, "F"); put(x - 1, y, "4"); put(x + 1, y, "4"); put(x, y - 1, "4"); put(x, y + 1, "4") }
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
const MAT = {
  plum: { top: "P", L: "p", R: "q" },
  slate: { top: "S", L: "s", R: "t" },
  rust: { top: "R", L: "r", R: "u" },
}
const EMIT = new Set("yhnHMVCWGFxY")

const wallKey = (side, u, r, wW, h, mat, o) => {
  const base = side === "L" ? mat.L : mat.R
  if (o.glass) return o.glass(side, u, r, wW, h)
  if (side === "L" && u === 0) return mat.top
  if (r < 2) return base
  if (r % 12 === 11) return side === "L" ? mat.top : mat.L
  if (u >= 1 && u <= wW - 3 && r >= 3 && r <= h - 4 && ((u & 3) === 1 || (u & 3) === 2) && (r % 6 === 2 || r % 6 === 3)) {
    const col = (u - 1) >> 2, fl = Math.floor(r / 6)
    if (ih(o.id * 131 + col, fl * 7 + (side === "L" ? 1 : 2), 11) < 0.7) {
      const t = ih(o.id + col * 3, fl, 5)
      return t < 0.13 ? "n" : t < 0.45 ? "h" : "y"
    }
    return side === "L" ? mat.R : "0"
  }
  return base
}

function isoBox(a0, b0, w, d, h, z0, mat, o) {
  const xl = PXs(a0, b0 + d), yBL = PYs(a0, b0 + d) - z0, wl = Math.round(8 * w)
  const xf = PXs(a0 + w, b0 + d), yF = PYs(a0 + w, b0 + d) - z0, wr = Math.round(8 * d)
  for (let u = 0; u < wl; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) put(xl + u, yBL - h + off + r, wallKey("L", u, r, wl, h, mat, o)) }
  for (let u = 0; u < wr; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) put(xf + u, yF - h - off + r, wallKey("R", u, r, wr, h, mat, o)) }
  const z = z0 + h
  const xs = PXs(a0, b0 + d), xe = PXs(a0 + w, b0), ys = PYs(a0, b0) - z, ye = PYs(a0 + w, b0 + d) - z
  const m = 0.3
  for (let y = ys; y <= ye; y++) for (let x = xs; x <= xe; x++) {
    const u = (x + 0.5 - OX) / 8, v = (y + 0.5 + z - OY) / 4
    const a = (u + v) / 2, b = (v - u) / 2
    if (a < a0 || a >= a0 + w || b < b0 || b >= b0 + d) continue
    const inner = a - a0 >= m && a0 + w - a >= m && b - b0 >= m && b0 + d - b >= m
    let k = mat.top
    if (o.roof === "garden") k = inner ? (bay(x, y) < 0.32 ? "g" : "e") : "g"
    else if (o.roof === "dark") k = inner ? (bay(x, y) < 0.55 ? mat.L : mat.top) : mat.top
    else if (inner && bay(x, y) < 0.18) k = mat.L
    put(x, y, k)
  }
  return {
    wl, wr, h,
    L: (u, r, k) => put(xl + u, yBL - h + ((u + 1) >> 1) + r, k),
    R: (u, r, k) => put(xf + u, yF - h - ((u + 1) >> 1) + r, k),
    pt: (a, b) => [PXs(a, b), PYs(a, b) - z],
  }
}

// ---------------------------------------------------------------- glow
const glowAround = (pts, k, reach = 2) => {
  const set = new Set(pts.map(([x, y]) => x + y * W))
  for (const [x, y] of pts) for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const d = Math.abs(dx) + Math.abs(dy)
    if (d === 0 || d > reach) continue
    const nx = x + dx, ny = y + dy
    if (!inb(nx, ny) || set.has(nx + ny * W)) continue
    if (EMIT.has(get(nx, ny))) continue
    if (d === 1 ? ((nx + ny) & 1) === 0 : (nx & 1) === 0 && (ny & 1) === 0) put(nx, ny, k)
  }
}
const neon = (pts, k, reach = 2) => { for (const [x, y] of pts) put(x, y, k); glowAround(pts, k, reach) }

// ---------------------------------------------------------------- rooftop clutter
const TANK = ["..RRR..", ".RRRRr.", "RRRRrru", "RRRrruu", "RRrrruu", "rrrrruu", ".q...q.", ".q...q.", ".q...q."]
const AC = ["SSSSSt", "SqqqSt", "SqqqSt", "ssssst"]
const DISH = ["FFFFFFF", ".SSSSS.", "..sSs..", "...q...", "...q...", "..qqq.."]
const PLANT = [".g.g.", "ggegg", ".rrr."]
const BUSH = ["..ggg..", ".ggggg.", "gegegeg", ".eeeee."]
const BARREL = [".ss.", "stts", "stts", ".tt."]
const antenna = (x, y, L) => {
  vlineK(x, y - L, L, "t"); hlineK(x - 2, y - L + 3, 5, "t"); hlineK(x - 1, y - L + 6, 3, "t")
  put(x, y - L - 1, "x"); put(x - 1, y - L - 1, ((x + y) & 1) ? "5" : "4"); put(x + 1, y - L - 1, "4")
}
const pod = (x, y, rx, hgt) => {
  // upright capsule: dome on a short drum, one big glowing window
  for (let j = 0; j < hgt; j++) {
    const t = j / (hgt - 1)
    const hw = t < 0.5 ? Math.round(rx * Math.sqrt(1 - Math.pow(1 - t * 2, 2))) : rx
    for (let i = -hw; i <= hw; i++) {
      const lit = i < -rx * 0.35
      put(x + i, y - hgt + 1 + j, i > rx * 0.45 ? "s" : j < 2 ? "S" : lit ? "S" : "s")
    }
  }
  const wy = y - Math.round(hgt * 0.62), wr = Math.max(2, rx - 3)
  for (let j = -2; j <= 2; j++) for (let i = -wr; i <= wr; i++) {
    if ((i * i) / (wr * wr) + (j * j) / 6.5 <= 1.05) put(x + i, wy + j, j >= 1 ? "y" : "h")
  }
  hlineK(x - rx, y, rx * 2 + 1, "t")
}
const billboard = (x, y, w, hgt, k, k2) => {
  // panel on two legs; follows the left walls' 2:1 slope
  const pts = []
  const top = y - hgt - 4
  vlineK(x + 1, y - 4, 4, "t"); vlineK(x + w - 2, y - 4 + ((w - 2) >> 1), 4 - ((w - 2) >> 1) > 0 ? 4 : 2, "t")
  for (let u = 0; u < w; u++) for (let j = 0; j < hgt; j++) {
    const yy = top + (u >> 1) + j
    const edge = u === 0 || u === w - 1 || j === 0 || j === hgt - 1
    if (edge) { put(x + u, yy, k); pts.push([x + u, yy]) }
    else put(x + u, yy, (u + j) % 3 === 0 || j === (hgt >> 1) ? k2 : "q")
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
const valid = (a, b) => a >= 0 && b <= 39 && a - b <= 23 && a + b <= 66
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

const tallness = (bd) => {
  const ac = bd.a0 + bd.w / 2, bc = bd.b0 + bd.d / 2
  const c = Math.exp(-((ac - 11) ** 2 + (bc - 5) ** 2) / 120)
  const e = clamp(ac / 7, 0, 1)
  let h = (14 + 62 * c + 40 * ih(bd.id, 3, 9)) * (0.62 + 0.38 * e)
  h += 20 * clamp((-bc + 2) / 14, 0, 1) * ih(bd.id, 4, 9)
  if (bd.w <= 2 && bd.d <= 2 && ih(bd.id, 5, 9) < 0.22) h += 34 + 30 * ih(bd.id, 6, 9)
  return clamp(Math.round(h / 4) * 4, 12, 156)
}

const SIGNC = ["H", "n", "M", "y", "V", "H", "n", "C"]
const drawBuilding = (bd) => {
  const { a0, b0, w, d, id } = bd
  const sx = PXs(a0 + w, b0 + d), sy = PYs(a0 + w, b0 + d)
  if (sx < -40 || sx > W + 140 || sy < 40 || sy > H + 260) return
  const mk = ih(id, 1, 3)
  const mat = mk < 0.42 ? MAT.plum : mk < 0.84 ? MAT.slate : MAT.rust
  const H0 = tallness(bd)
  // modules: the lower one the full footprint, the upper ones set back
  const mods = []
  const n = H0 > 84 ? 3 : H0 > 40 ? 2 : 1
  let z = 0, ca = a0, cb = b0, cw = w, cd = d
  for (let k = 0; k < n; k++) {
    const last = k === n - 1
    const hk = last ? H0 - z : Math.max(8, Math.round(H0 * (k === 0 ? 0.5 : 0.3) / 4) * 4)
    mods.push({ a: ca, b: cb, w: cw, d: cd, h: hk, z })
    z += hk
    const front = ih(id, 20 + k, 4) < 0.3
    const na = (ih(id, 30 + k, 4) < 0.5 || cw <= 1)
    if (cw > 1 && cd > 1) {
      if (front) { cw -= 1; cd -= 1 }
      else if (na) { ca += 1; cw -= 1; if (ih(id, 40 + k, 4) < 0.5) { cb += 1; cd -= 1 } }
      else { cb += 1; cd -= 1 }
    } else if (cw > 1) { ca += 1; cw -= 1 } else if (cd > 1) { cb += 1; cd -= 1 }
  }
  const garden = ih(id, 7, 3) < 0.13
  let top
  mods.forEach((m, k) => {
    top = isoBox(m.a, m.b, m.w, m.d, m.h, m.z, mat, { id: id * 7 + k, roof: k === n - 1 ? (garden ? "garden" : ih(id, 8, 3) < 0.35 ? "dark" : "") : "" })
    m.box = top
  })
  // neon signs and strips on the walls
  const nsign = ih(id, 9, 3) < 0.9 ? (ih(id, 10, 3) < 0.35 ? 2 : 1) : 0
  for (let s = 0; s < nsign; s++) {
    const m = mods[Math.floor(ih(id, 11 + s, 3) * Math.min(2, mods.length))]
    const side = ih(id, 12 + s, 3) < 0.6 ? "L" : "R"
    const bx = m.box
    const wW = side === "L" ? bx.wl : bx.wr
    if (wW < 10 || m.h < 18) continue
    const col = SIGNC[Math.floor(ih(id, 13 + s, 3) * SIGNC.length)]
    const pts = []
    const set = (u, r, k) => { (side === "L" ? bx.L : bx.R)(u, r, k); pts.push([null, u, r]) }
    const kind = ih(id, 14 + s, 3)
    const px = []
    const paint = (u, r, k, glow) => {
      (side === "L" ? bx.L : bx.R)(u, r, k)
      if (glow) px.push([u, r])
    }
    if (kind < 0.5) {
      // vertical strip, two wide, sometimes on the corner edge
      const len = Math.min(m.h - 10, 7 + Math.floor(ih(id, 15 + s, 3) * 8))
      const u0 = 1 + 2 * Math.floor(ih(id, 16 + s, 3) * Math.floor((wW - 6) / 2))
      const r0 = 4 + Math.floor(ih(id, 17 + s, 3) * Math.max(1, m.h - len - 8))
      for (let r = 0; r < len; r++) { paint(u0, r0 + r, col, true); paint(u0 + 1, r0 + r, r % 4 === 0 ? "W" : col, true) }
    } else {
      // board with dashes of "lettering"
      const bw = Math.min(wW - 6, 8 + 2 * Math.floor(ih(id, 18 + s, 3) * 3))
      const u0 = 1 + 2 * Math.floor(ih(id, 16 + s, 3) * Math.floor(Math.max(1, wW - bw - 4) / 2))
      const r0 = 4 + Math.floor(ih(id, 17 + s, 3) * Math.max(1, m.h - 14))
      for (let u = 0; u < bw; u++) for (let r = 0; r < 5; r++) {
        const edge = u === 0 || u === bw - 1 || r === 0 || r === 4
        paint(u0 + u, r0 + r, edge ? col : ((u + r) & 1 ? "q" : "0"), edge)
        if (!edge && r === 2 && u % 3 !== 0) paint(u0 + u, r0 + r, "W", false)
      }
    }
    // collect the absolute pixels for the halo by re-reading the painted keys
    const abs = []
    for (const [u, r] of px) {
      const x = side === "L" ? 0 : 0
      abs.push([u, r])
    }
    const base = side === "L" ? bx : bx
    const toAbs = ([u, r]) => side === "L"
      ? [PXs(m.a, m.b + m.d) + u, PYs(m.a, m.b + m.d) - m.z - m.h + ((u + 1) >> 1) + r]
      : [PXs(m.a + m.w, m.b + m.d) + u, PYs(m.a + m.w, m.b + m.d) - m.z - m.h - ((u + 1) >> 1) + r]
    glowAround(px.map(toAbs), col, 2)
  }
  // light strips along a few roof edges
  if (ih(id, 21, 3) < 0.28) {
    const m = mods[mods.length - 1]
    const col = ["n", "H", "y", "V"][Math.floor(ih(id, 22, 3) * 4)]
    const pts = []
    for (let u = 1; u < m.box.wl - 1; u++) { m.box.L(u, -1, col); pts.push([PXs(m.a, m.b + m.d) + u, PYs(m.a, m.b + m.d) - m.z - m.h + ((u + 1) >> 1) - 1]) }
    glowAround(pts, col, 1)
  }
  // rooftop: pod, clutter, plants
  const m = mods[mods.length - 1]
  const spot = (i) => m.box.pt(m.a + 0.5 + ih(id, 50 + i, 6) * Math.max(0.1, m.w - 1), m.b + 0.5 + ih(id, 60 + i, 6) * Math.max(0.1, m.d - 1))
  const items = 1 + Math.floor(ih(id, 70, 6) * 3)
  for (let i = 0; i < items; i++) {
    const [x, y] = spot(i)
    const t = ih(id, 80 + i, 6)
    if (t < 0.17 && m.w + m.d >= 3) pod(x, y + 1, 5 + Math.floor(ih(id, 90 + i, 6) * 3), 8 + Math.floor(ih(id, 95 + i, 6) * 4))
    else if (t < 0.3) spr(x, y, TANK)
    else if (t < 0.42) antenna(x, y, 8 + Math.floor(ih(id, 100 + i, 6) * 9))
    else if (t < 0.52) spr(x, y, AC)
    else if (t < 0.6) spr(x, y, DISH)
    else if (t < 0.68) billboard(x - 7, y, 14 + 2 * Math.floor(ih(id, 110 + i, 6) * 3), 6, SIGNC[Math.floor(ih(id, 111 + i, 6) * SIGNC.length)], "W")
    else if (t < 0.74) holoScreen(x - 5, y - 12, 11, 7, ["n", "H"][Math.floor(ih(id, 112 + i, 6) * 2)])
    else if (t < 0.9) spr(x, y, BUSH)
    else spr(x, y, PLANT)
  }
  // balcony plants and vines hanging off the ledges
  for (const mm of mods) {
    for (let f = 0; f < Math.floor(mm.h / 12); f++) {
      const r = f * 12 + 11
      for (let u = 4; u < mm.box.wl - 3; u += 7) {
        if (ih(id * 17 + f, u, 8) < 0.2) {
          mm.box.L(u, r - 1, "g"); mm.box.L(u + 1, r - 1, "g"); mm.box.L(u + 2, r - 1, "e")
          if (ih(id, u + f, 9) < 0.7) for (let k = 0; k < 3 + Math.floor(ih(id, f, u) * 4); k++) mm.box.L(u + 1, r + 1 + k, k % 2 ? "e" : "g")
        }
      }
    }
  }
}

// ---------------------------------------------------------------- the hero tower
const drawTower = () => {
  const { a0, b0, w, d } = TOWER
  const glass = (side, u, r, wW, h) => {
    const L = side === "L"
    if (L && u === 0) return "3"
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
  const base = { glass: (side, u, r, wW, h) => {
    const L = side === "L"
    if (r % 6 === 2 || r % 6 === 3) { if ((u & 3) === 1 || (u & 3) === 2) { const t = ih(u >> 2, r, 22 + (L ? 0 : 1)); return t < 0.2 ? "n" : t < 0.65 ? "y" : (L ? "2" : "1") } }
    return L ? (u === 0 ? "3" : "2") : "1"
  } }
  isoBox(a0, b0, w, d, 40, 0, MAT.slate, { id: 9999, ...base })
  const sh = isoBox(10, 4, 2, 2, 258, 40, MAT.slate, { id: 9998, glass })
  // crown: a wider cap with a lit ring
  const crown = isoBox(9.5, 3.5, 3, 3, 12, 298, MAT.slate, { id: 9997, glass: (side, u, r, wW, h) => (r === 1 || r === h - 2) ? ((u & 1) ? "n" : "H") : (side === "L" ? (u === 0 ? "3" : "2") : "1") })
  const [cx, cy] = crown.pt(11, 5)
  // top plate colour
  for (let i = -12; i <= 12; i++) for (let j = -6; j <= 6; j++) {
    if (Math.abs(i) / 12 + Math.abs(j) / 6 <= 1) put(cx + i, cy + j, Math.abs(i) / 12 + Math.abs(j) / 6 > 0.8 ? "S" : bay(cx + i, cy + j) < 0.2 ? "3" : "2")
  }
  vlineK(cx, cy - 22, 22, "S"); vlineK(cx + 1, cy - 22, 22, "s")
  hlineK(cx - 2, cy - 14, 5, "s"); hlineK(cx - 3, cy - 9, 7, "s")
  put(cx, cy - 23, "x"); put(cx + 1, cy - 23, "x"); put(cx - 1, cy - 23, "4"); put(cx + 2, cy - 23, "4"); put(cx, cy - 24, "5"); put(cx + 1, cy - 24, "5")
  // neon spines running down the corners
  const edgeL = []
  for (let r = 130; r < 250; r++) { sh.L(1, r, "H"); edgeL.push([PXs(10, 6) + 1, PYs(10, 6) - 40 - 258 + ((1 + 1) >> 1) + r]) }
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

// the island's front edge: a stone plinth with vines, lit strips and a few glowing seams
{
  const x0 = PXs(0, 40), y0 = PYs(0, 40)
  for (let u = 0; u < 620 - x0 + 30; u++) {
    const off = (u + 1) >> 1
    for (let r = 0; r < 13; r++) {
      let k = r === 0 ? "P" : r === 1 ? "p" : "q"
      if (u % 12 === 0 || u % 12 === 1) k = r < 2 ? k : "0"
      if (r === 11 && (u % 6) < 3) k = "0"
      if (r === 5 && (u % 24) > 15) k = ["n", "H", "y"][Math.floor(u / 24) % 3]
      put(x0 + u, y0 + off + r, k)
    }
    if (ih(u, 5, 40) < 0.07) { const len = 4 + Math.floor(ih(u, 6, 40) * 10); for (let k = 0; k < len; k++) put(x0 + u, y0 + off + 13 + k, k % 3 === 2 ? "g" : "e") }
  }
}

// clouds in front: the cloud sea under the island's corner
cloud(40, 468, 1.45, 11, { n: 7, span: 250 })
cloud(190, 500, 1.3, 12, { n: 6, span: 230 })
cloud(330, 520, 1.1, 13, { n: 5, span: 200 })
cloud(98, 400, 0.6, 14, { n: 4, span: 90 })

// ================================================================ flying taxi, seen from behind
{
  const tx = 118, ty = 240
  const half = [
    "..........HHHHHH",
    "..........HWWWWW",
    "......YYYYYYYYYY",
    ".....YYhhhhhhhhh",
    "....YYYYYYYYYYYY",
    "....YYt111111111",
    "....YYt11nn11111",
    "....YYt111111111",
    "....YYtttttttttt",
    "...YYYYYYYYYYYYY",
    "..YYYYYYYYYYYYYY",
    ".YYYYYYYYYYYYYYY",
    "YYYYyyyyyyyyyyyy",
    "YxxxxYYYYYYYYYYY",
    "YxxxxYYYYYYtFtFt",
    "YxxxxYYYYYYYYYYY",
    ".yyyyyyyyyyyyyyy",
    "..tttttttttttttt",
    "...nn..........n",
    "....CC..........",
  ]
  const bx = tx - 16, by = ty
  // tail-light trails: two thin red lines streaming back toward the viewer, fading out
  for (const lx of [bx + 2, bx + 29]) {
    const pts = []
    for (let i = 0; i < 120; i++) {
      if (i > 70 && i % 3 === 0) continue
      if (i > 95 && i % 2 === 0) continue
      pts.push([Math.round(lx - 3 - i * 1.0), Math.round(by + 14 + i * 0.36)])
    }
    for (const [xx, yy] of pts) put(xx, yy, "x")
    for (const [xx, yy] of pts) { if ((xx & 1) === 0) put(xx, yy - 1, "C"); if ((xx & 3) === 1) put(xx, yy + 1, "5") }
  }
  for (let j = 0; j < half.length; j++) for (let i = 0; i < 16; i++) {
    const ch = half[j][i]
    if (ch === ".") continue
    put(bx + i, by + j, ch)
    put(bx + 31 - i, by + j, ch === "Y" && i < 2 ? "y" : ch)
  }
  // shading on the right, a red glow at the lamps, hover glow under the hull
  for (let j = 4; j < 17; j++) { if (get(bx + 31, by + j) === "Y") put(bx + 31, by + j, "r"); if (get(bx + 30, by + j) === "Y") put(bx + 30, by + j, "y") }
  for (const lx of [bx + 1, bx + 26]) {
    for (const [dx, dy] of [[-1, 0], [-1, 1], [-1, 2], [4, 0], [4, 1], [4, 2], [0, -1], [1, -1], [2, -1], [3, -1], [0, 3], [1, 3], [2, 3], [3, 3]]) {
      const xx = lx + dx, yy = by + 13 + dy
      if (get(xx, yy) !== "x" && bay(xx, yy) < 0.7) put(xx, yy, "C")
    }
  }
  for (let i = 3; i < 29; i++) if (get(bx + i, by + 20) !== "n" && bay(bx + i, by + 20) < 0.5) put(bx + i, by + 20, "n")
  put(bx + 15, by - 1, "H"); put(bx + 16, by - 1, "H")
}

// ================================================================ hologram billboard near the tower's top
{
  const hx = 396, hy = 56, hw = 82, hh = 56
  const pts = []
  const hy0 = (u) => hy + (u >> 1)           // follows the left-wall slope
  for (let u = 0; u < hw; u++) for (let j = 0; j < hh; j++) {
    const y = hy0(u) + j
    const edge = u < 2 || u >= hw - 2 || j < 2 || j >= hh - 2
    const scan = j % 4 === 0
    if (edge) { put(396 + u, y, "n"); pts.push([396 + u, y]) }
    else if (scan) { if (((u + j) & 1) === 0 || j % 8 === 0) put(396 + u, y, "n") }
    else if (((u + j) & 1) === 0 && bay(u, j) < 0.55) put(396 + u, y, "n")
  }
  // corner brackets in pale cyan-white
  for (const [cu, cj] of [[0, 0], [hw - 1, 0], [0, hh - 1], [hw - 1, hh - 1]]) {
    for (let k = 0; k < 7; k++) {
      put(396 + (cu === 0 ? k : cu - k), hy0(cu === 0 ? k : cu - k) + cj, "W")
      put(396 + cu, hy0(cu) + (cj === 0 ? k : cj - k), "W")
    }
  }
  // corporate emblem: a hexagon ring around a stylised leaf in a diamond
  const ex = 396 + 41, ey = hy0(41) + 22
  const hexPts = []
  for (let t = 0; t < 360; t += 2) {
    const ang = (t * Math.PI) / 180
    const r = 15
    const x = Math.round(ex + r * Math.cos(ang) * 1.0), y = Math.round(ey + r * Math.sin(ang) * 0.9)
    hexPts.push([x, y])
  }
  const emb = (x, y, k) => put(x, y, k)
  for (let a = 0; a < 6; a++) {
    const a1 = (a * 60 + 30) * Math.PI / 180, a2 = ((a + 1) * 60 + 30) * Math.PI / 180
    const x1 = ex + 16 * Math.cos(a1), y1 = ey + 14.4 * Math.sin(a1), x2 = ex + 16 * Math.cos(a2), y2 = ey + 14.4 * Math.sin(a2)
    const n = 28
    for (let i = 0; i <= n; i++) { emb(Math.round(x1 + (x2 - x1) * i / n), Math.round(y1 + (y2 - y1) * i / n), "W"); emb(Math.round(x1 + (x2 - x1) * i / n), Math.round(y1 + (y2 - y1) * i / n) + 1, "n") }
  }
  // diamond with a sprout inside
  for (let j = -9; j <= 9; j++) for (let i = -9; i <= 9; i++) {
    const m = Math.abs(i) + Math.abs(j)
    if (m <= 9) put(ex + i, ey + j, m >= 8 ? "W" : bay(ex + i, ey + j) < 0.35 ? "n" : "1")
  }
  for (let j = -4; j <= 6; j++) put(ex, ey + j, "W")
  for (let k = 1; k <= 4; k++) { put(ex - k, ey - 1 - Math.floor(k * 0.7), "W"); put(ex + k, ey - 2 - Math.floor(k * 0.7), "W") }
  // lines of "data" under the emblem
  rectK(396 + 12, hy0(20) + 40, 22, 2, "W"); rectK(396 + 12, hy0(20) + 44, 34, 2, "n"); rectK(396 + 52, hy0(60) + 40, 18, 2, "W"); rectK(396 + 50, hy0(60) + 44, 12, 2, "n")
  glowAround(pts, "n", 2)
  // a thin beam binding it to the tower's crown
  for (let i = 0; i < 26; i++) { const x = 396 + hw + i, y = hy0(hw) + 30 + Math.round(i * 0.55); if ((i & 1) === 0) put(x, y, "n") }
}

// ================================================================ the title
const BIG = {
  N: ["XXX..XX", "XXXX.XX", "XXXX.XX", "XXXX.XX", "XXXXXXX", "XX.XXXX", "XX.XXXX", "XX.XXXX", "XX..XXX"],
  E: ["XXXXXXX", "XXXXXXX", "XX.....", "XXXXXX.", "XXXXXX.", "XX.....", "XX.....", "XXXXXXX", "XXXXXXX"],
  O: [".XXXXX.", "XXXXXXX", "XX...XX", "XX...XX", "XX...XX", "XX...XX", "XX...XX", "XXXXXXX", ".XXXXX."],
  T: ["XXXXXXX", "XXXXXXX", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "..XXX.."],
  R: ["XXXXXX.", "XXXXXXX", "XX...XX", "XX...XX", "XXXXXX.", "XXXXX..", "XX.XXX.", "XX..XXX", "XX...XX"],
  A: [".XXXXX.", "XXXXXXX", "XX...XX", "XX...XX", "XXXXXXX", "XXXXXXX", "XX...XX", "XX...XX", "XX...XX"],
  I: ["XXXXXXX", "XXXXXXX", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "..XXX..", "XXXXXXX", "XXXXXXX"],
  U: ["XX...XX", "XX...XX", "XX...XX", "XX...XX", "XX...XX", "XX...XX", "XX...XX", "XXXXXXX", ".XXXXX."],
  M: ["XX...XX", "XXX.XXX", "XXXXXXX", "XXXXXXX", "XX.X.XX", "XX...XX", "XX...XX", "XX...XX", "XX...XX"],
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
// chessboard distance: inside depth (1 at the edge) and outside distance, both bounded to a box
const depthOf = (mask, box) => {
  const [bx, by, bw, bh] = box
  const dist = new Uint8Array(W * H).fill(255)
  const val = (x, y) => (inb(x, y) ? dist[y * W + x] : 0)
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) if (!mask[y * W + x]) dist[y * W + x] = 0
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    if (!mask[y * W + x]) continue
    dist[y * W + x] = Math.min(255, Math.min(val(x - 1, y), val(x - 1, y - 1), val(x, y - 1), val(x + 1, y - 1)) + 1)
  }
  for (let y = by + bh - 1; y >= by; y--) for (let x = bx + bw - 1; x >= bx; x--) {
    if (!mask[y * W + x]) continue
    dist[y * W + x] = Math.min(dist[y * W + x], Math.min(val(x + 1, y), val(x + 1, y + 1), val(x, y + 1), val(x - 1, y + 1)) + 1)
  }
  return dist
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
const TITLE_MASK = new Uint8Array(W * H)
const shadowOf = (mask, dx, dy, k, box) => {
  const [bx, by, bw, bh] = box
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    if (mask[y * W + x] || !inb(x - dx, y - dy)) continue
    if (mask[(y - dy) * W + (x - dx)]) put(x, y, k)
  }
}
const glowOf = (mask, out, levels, box) => {
  const [bx, by, bw, bh] = box
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    if (mask[y * W + x]) continue
    const d = out[y * W + x]
    if (d < 1 || d > levels.length) continue
    const [k, dens] = levels[d - 1]
    if (bay(x, y) < dens) put(x, y, k)
  }
}
{
  // NEON: 9x pixels, 7-wide heavy caps
  const nx = 26, ny = 24, S1 = 9
  const m1 = textMask("NEON", BIG, 7, 9, S1, S1, nx, ny)
  const box1 = [nx - 10, ny - 10, 4 * 7 * S1 + 3 * S1 + 20, 9 * S1 + 24]
  const out1 = outsideOf(m1, box1), in1 = depthOf(m1, box1)
  glowOf(m1, out1, [["C", 0.9], ["C", 0.62], ["5", 0.7], ["5", 0.42], ["4", 0.4], ["4", 0.18]], box1)
  shadowOf(m1, 3, 3, "0", box1)
  for (let y = box1[1]; y < box1[1] + box1[3]; y++) for (let x = box1[0]; x < box1[0] + box1[2]; x++) {
    if (!m1[y * W + x]) continue
    const d = in1[y * W + x]
    put(x, y, d === 1 ? "H" : d <= 6 ? "C" : d === 7 ? (bay(x, y) < 0.5 ? "W" : "C") : "W")
    TITLE_MASK[y * W + x] = 1
  }
  // TERRARIUM: 4x pixels
  const ty = ny + 9 * S1 + 12, S2 = 4
  const m2 = textMask("TERRARIUM", BIG, 7, 9, S2, S2, nx + 2, ty)
  const box2 = [nx - 8, ty - 8, 9 * 7 * S2 + 8 * S2 + 22, 9 * S2 + 20]
  const out2 = outsideOf(m2, box2), in2 = depthOf(m2, box2)
  glowOf(m2, out2, [["G", 0.6], ["G", 0.22]], box2)
  shadowOf(m2, 2, 2, "H", box2)
  for (let y = box2[1]; y < box2[1] + box2[3]; y++) for (let x = box2[0]; x < box2[0] + box2[2]; x++) {
    if (!m2[y * W + x]) continue
    const d = in2[y * W + x]
    put(x, y, d >= 4 ? "F" : d === 3 ? (bay(x, y) < 0.5 ? "F" : "G") : "G")
    TITLE_MASK[y * W + x] = 1
  }
  // subtitle, two lines, wide spaced
  const sy = ty + 9 * S2 + 12
  for (const [line, yy] of [["A COZY CYBERPUNK", sy], ["CITY BUILDER", sy + 19]]) {
    const m3 = textMask(line, SMALL, 5, 7, 2, 4, nx + 2, yy)
    const box3 = [nx - 8, yy - 8, 16 * 14 + 20, 14 + 16]
    const out3 = outsideOf(m3, box3)
    glowOf(m3, out3, [["H", 0.55], ["4", 0.35]], box3)
    shadowOf(m3, 1, 1, "0", box3)
    for (let y = box3[1]; y < box3[1] + box3[3]; y++) for (let x = box3[0]; x < box3[0] + box3[2]; x++) {
      if (m3[y * W + x]) { put(x, y, "F"); TITLE_MASK[y * W + x] = 1 }
    }
  }
}

// ================================================================ CRT scanlines
const DARKER = { 6: "5", 5: "4", 4: "3", 3: "2", 2: "1", 1: "0", a: "b", b: "c", c: "d", d: "4", P: "p", p: "q", q: "1", S: "s", s: "t", t: "1", R: "r", r: "u", u: "1", g: "e", e: "0", Y: "y" }
for (let y = 3; y < H; y += 4) for (let x = 0; x < W; x++) {
  if (TITLE_MASK[y * W + x] || (x & 1)) continue
  const k = KEYS[fb[y * W + x]]
  if (DARKER[k]) fb[y * W + x] = IDX[DARKER[k]]
}

// ================================================================ hand the rows to pxl
sprite("cover", { w: W, h: H }, (c) => {
  for (let y = 0; y < H; y++) {
    let x = 0
    while (x < W) {
      const v = fb[y * W + x]
      let e = x + 1
      while (e < W && fb[y * W + e] === v) e++
      c.hline(x, y, e - x, KEYS[v])
      x = e
    }
  }
})
