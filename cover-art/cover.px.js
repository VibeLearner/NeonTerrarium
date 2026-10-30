// NEON TERRARIUM cover, 630x500, a 48-frame loop at 12 fps. The picture is rasterized into one
// buffer (so glows, the title and the scanlines can read what is already there): the still parts
// are built once, then each frame copies that and adds what moves. Everything is driven by the
// frame index, never by chance, so the loop closes.
const W = 630, H = 500, FRAMES = 48

const PAL = {
  // sky, blue-violet at the top -> magenta -> pink near the city
  0: "#34389f", 1: "#4439a8", 2: "#5c3fae", 3: "#7646ac", 4: "#8e48a2", 5: "#a84c9a", 6: "#c25a98",
  // clouds, warm to cool: cream, peach, coral pink, rose, mauve, lavender, deep periwinkle
  "{": "#ffe8d0", "}": "#ffc8a8", "|": "#f4a0a0", a: "#d07aa0", b: "#a070b0", c: "#7666b0", d: "#54509a",
  // walls as (top / lit side / shadow side), seven distinct families: dusk rose, lilac grey, coral clay, periwinkle, plum, ink navy, deep teal
  R: "#b05a7e", r: "#84405e", u: "#582a42",
  P: "#8a7aa8", p: "#665a84", q: "#443c5c",
  S: "#c86a62", s: "#9a4c4c", t: "#643038",
  K: "#5c6cb0", k: "#434e86", l: "#2c3460",
  D: "#7a3e86", E: "#582c64", e: "#3a1c44",
  "%": "#2e3460", "^": "#222648", "&": "#161a32",
  f: "#3e7a86", i: "#2c5a66", j: "#1c3c48",
  // rosy wood for rails, benches and trunks; dusky glow
  T: "#a85a5a", U: "#7a3e48", m: "#4a2a50",
  // warm dusky stone for plazas and paths: lit, mid, shade
  "*": "#8a5a78", "(": "#64405c", ")": "#3e2840",
  // window pane highlights: warm cream, cool pale cyan; headlights
  ":": "#ffe6b0", ";": "#c8f4ff", "<": "#e8fbff",
  // glass: pale cyan-white lit, mid, shade, frame, pink sky reflection
  "$": "#cfeff0", "-": "#8fc4d0", "+": "#5a8aa8", "=": "#3a4a6a", "[": "#e8a0c8",
  // homes at dusk: peach, honey, soft pink, cool white-blue, shop gold; unlit deep plum
  y: "#ff9a6a", h: "#ffd27a", z: "#ff8ac0", v: "#d8ecff", Y: "#ffc94a", w: "#2a1838", L: "#ffb050",
  // neon: pink, magenta, cyan, violet, mint
  H: "#ff72c8", M: "#ff64f4", n: "#7af4ff", V: "#b088ff", N: "#6dffc8",
  // foliage, five steps: warm highlight (7), lit leaf (g), mid (o), shadow (O), indigo deep shadow (8); pink-lavender rim (9)
  7: "#b8e07a", g: "#78c25a", o: "#3f9450", O: "#23604a", 8: "#1c2e44", 9: "#d89ac0",
  // terracotta pots, greenhouse glass glow
  "!": "#c0644a", "@": "#8a4232",
  // streets and shadows, the dusk violet of the haze, the pink rim light
  A: "#2a1a48", B: "#2e1c50", Q: "#61298a", Z: "#f08592",
  // title: coral, purple, mint, ink, pale pink
  C: "#ff4a6e", X: "#3b1a5c", G: "#3dffcf", I: "#170f3a", J: "#f7c6d6",
  // cloud ramp ends: rim highlight, lit, underside glow; tagline cream
  "~": "#fff3e6",
  // star cream, pale pink-white, red lights
  F: "#fff0d0", W: "#ffe6ee", x: "#ff3b4a",
}
pal(PAL)
const KEYS = Object.keys(PAL).join("")
const IDX = {}
for (let i = 0; i < KEYS.length; i++) IDX[KEYS[i]] = i

let fb = new Uint8Array(W * H)
let recordCity = false, curLevel = 0, curDark = 0, curOwner = 0
const OWN = new Uint16Array(W * H)
const DEPTH = new Uint8Array(W * H), CITY = new Uint8Array(W * H), DARK = new Uint8Array(W * H), WARM = new Uint8Array(W * H)
const inb = (x, y) => x >= 0 && x < W && y >= 0 && y < H
let CLIP = null
const put = (x, y, k) => {
  if (!inb(x, y) || (CLIP && !CLIP(x, y))) return
  const i = IDX[k]
  if (i === undefined) throw new Error("no palette key " + k)
  const p = y * W + x
  fb[p] = i
  if (recordCity) { CITY[p] = 1; DEPTH[p] = curLevel; DARK[p] = curDark; OWN[p] = curOwner }
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
  v += 0.7 * Math.exp(-Math.hypot((x - 390) / 1.4, (y - 320) * 0.9) / 120)      // a pinker glow right behind the city
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
// Towering cumulus banks, each a cauliflower of hundreds of small billows. A pixel's tone comes from one smooth light field
// (a big warm-left / cool-right diagonal, plus each billow's own sun-side crescent, minus a shadow where it tucks under a
// billow in front), cut into seven flat tones with hard edges, then cleaned so every tone is a solid shape. No dithering.
// tones, warm to cool: cream, peach, coral pink, rose, mauve, lavender, deep periwinkle
const CRAMP = ["{", "}", "|", "a", "b", "c", "d"]
const SKYBASE = fb.slice()
const cloudLayer = () => new Uint8Array(W * H).fill(255)
const drawInto = (buf, fn) => { const s = fb; fb = buf; fn(); fb = s }
const bank = (o) => {
  const { base, env, seed } = o
  const R = (k, a = 0) => ih(seed, k, a)
  const sc = o.scale ?? 1
  const xs = env.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), ytop = Math.min(...env.map((p) => p[1]))
  const poly = [...env, [env[env.length - 1][0], base + 30], [env[0][0], base + 30]]
  const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [ax, ay] = poly[i], [bx, by] = poly[j]; if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) c = !c } return c }
  const segDist = (x, y) => { let m = 1e9; for (let i = 0; i + 1 < env.length; i++) { const [ax, ay] = env[i], [bx, by] = env[i + 1], dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)) } return m }
  const discs = []
  const add = (x, y, r, d, warm) => discs.push({ x: Math.round(x), y: Math.round(y), r, d, warm })
  const sp = (o.sp ?? 13) * sc
  // the body: big discs packed on a jittered grid, kept inside the outline
  for (let gy = ytop; gy < base; gy += sp * 0.8) for (let gx = x0; gx <= x1; gx += sp) {
    const x = gx + (R(1, gx * 7 + Math.round(gy)) - 0.5) * sp, y = gy + (R(2, gx * 5 + Math.round(gy)) - 0.5) * sp
    if (!inside(x, y) || y > base - 2) continue
    const r = Math.min(sp * (0.7 + 0.3 * R(3, gx + Math.round(gy) * 3)), segDist(x, y) + 3)
    if (r < 4) continue
    add(x, y, r, 0, false)
  }
  // the outline: scalloped discs all the way round (top and both sides), each throwing smaller billows outward
  const spawn = (p, depth, ang) => {
    if (p.r < 3.2 || depth > 3) return
    const n = 3 + Math.floor(R(10 + depth, p.x * 3 + p.y) * 3)
    for (let k = 0; k < n; k++) {
      const th = ang + (((k + R(11 + depth, p.x + p.y * 7 + k)) / n) - 0.5) * Math.PI * 0.95
      const r = p.r * (0.42 + 0.26 * R(12 + depth, p.x * 5 + p.y + k))
      const c = { x: Math.round(p.x + Math.cos(th) * p.r * 0.86), y: Math.round(p.y + Math.sin(th) * p.r * 0.86), r, d: depth + 1, warm: p.warm }
      discs.push(c); spawn(c, depth + 1, ang)
    }
  }
  for (let i = 0; i + 1 < env.length; i++) {
    const [ax, ay] = env[i], [bx, by] = env[i + 1], len = Math.hypot(bx - ax, by - ay)
    if (len < 1) continue
    let nx = (by - ay) / len, ny = -(bx - ax) / len
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    if (inside(mx + nx * 3, my + ny * 3)) { nx = -nx; ny = -ny }
    for (let t = 0; t < len; t += (6 + 5 * R(20, i * 31 + Math.round(t))) * sc) {
      const r = (7 + 8 * R(21, i * 17 + Math.round(t))) * sc
      const px = ax + ((bx - ax) * t) / len, py = ay + ((by - ay) * t) / len
      const p = { x: Math.round(px - nx * r * 0.55), y: Math.round(py - ny * r * 0.55), r, d: 1, warm: R(22, i * 13 + Math.round(t)) < (o.warmP ?? 1) }
      if (p.y > base - 6) continue
      discs.push(p); spawn(p, 1, Math.atan2(ny, nx))
    }
  }
  for (const [x, y, r] of o.peaks ?? []) { const p = { x, y, r, d: 1, warm: true }; discs.push(p); spawn(p, 1, -Math.PI / 2) }
  for (let i = 0; i < (o.frag ?? 8); i++) {
    const k = Math.floor(R(30, i) * (env.length - 1)), t = R(33, i)
    const x = env[k][0] + (env[k + 1][0] - env[k][0]) * t, y = env[k][1] + (env[k + 1][1] - env[k][1]) * t
    discs.push({ x: Math.round(x + (R(34, i) - 0.5) * 16), y: Math.round(y - 6 - R(32, i) * 12), r: 1.2 + 1.8 * R(31, i), d: 5, warm: true, frag: true })
  }
  const top = Math.floor(ytop) - Math.ceil(30 * sc) - 20
  const bx0 = Math.floor(x0) - 24, bx1 = Math.ceil(x1) + 24, bw = bx1 - bx0 + 1, bh = base + 2 - top + 1
  const own = new Int32Array(bw * bh).fill(-1)
  const order = discs.map((d, i) => i).sort((p, q) => discs[p].d - discs[q].d || discs[p].y - discs[q].y)
  const rb = (x) => base + ((x >> 2) % 3 === 0 ? -1 : 0)
  order.forEach((di, rank) => {
    const d = discs[di]; d.rank = rank
    for (let y = Math.floor(d.y - d.r); y <= Math.ceil(d.y + d.r); y++) for (let x = Math.floor(d.x - d.r); x <= Math.ceil(d.x + d.r); x++) {
      if (y < top || y > rb(x) || x < bx0 || x > bx1) continue
      const dx = x + 0.5 - d.x, dy = y + 0.5 - d.y
      if (dx * dx + dy * dy > d.r * d.r) continue
      own[(y - top) * bw + (x - bx0)] = di
    }
  })
  const at = (x, y) => (x < bx0 || x > bx1 || y < top || y >= top + bh ? -1 : own[(y - top) * bw + (x - bx0)])
  const tone = new Int8Array(bw * bh).fill(-1)
  const hh = Math.max(20, base - ytop), bfade = clamp(hh * 0.35, 12, 34), wd = Math.max(20, x1 - x0)
  for (let y = top; y < top + bh; y++) for (let x = bx0; x <= bx1; x++) {
    const k = at(x, y); if (k < 0) continue
    const d = discs[k]
    const nx = (x + 0.5 - d.x) / d.r, ny = (y + 0.5 - d.y) / d.r
    const l = -0.78 * nx - 0.68 * ny
    const u = (x - x0) / wd, v = (y - ytop) / hh
    let s = (o.lift ?? 1.4) - 1.95 * u - 0.85 * v + 0.46 * l * (d.d >= 1 ? 1.1 : 0.8) - (o.shade ?? 0)
    if (d.warm && !d.frag) s += o.warmLift ?? 0
    for (const [ax, ay] of [[0, -1], [-1, -1], [0, -2], [-1, -2], [-2, -1], [1, -2]]) { const kk = at(x + ax, y + ay); if (kk >= 0 && discs[kk].rank > d.rank) { s -= 0.32; break } }
    s -= 0.9 * clamp((y - (base - bfade)) / bfade, 0, 1)
    if (d.frag) s = Math.max(s, 0.8 - (o.shade ?? 0) * 0.6)
    const th = [0.95, 0.62, 0.3, 0.0, -0.3, -0.6]
    let t = 6; for (let j = 0; j < 6; j++) if (s > th[j]) { t = j; break }
    tone[(y - top) * bw + (x - bx0)] = t
  }
  for (let pass = 0; pass < 2; pass++) {
    const nt = tone.slice()
    for (let y = top + 1; y < top + bh - 1; y++) for (let x = bx0 + 1; x < bx1; x++) {
      const i = (y - top) * bw + (x - bx0)
      if (tone[i] < 0) continue
      const cnt = {}
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const t = tone[i + dy * bw + dx]; if (t >= 0) cnt[t] = (cnt[t] || 0) + 1 }
      for (const t in cnt) if (cnt[t] >= 6 && +t !== tone[i]) nt[i] = +t
    }
    tone.set(nt)
  }
  for (let y = top; y < top + bh; y++) for (let x = bx0; x <= bx1; x++) { const t = tone[(y - top) * bw + (x - bx0)]; if (t >= 0) put(x, y, CRAMP[t]) }
}
// five separate clouds, each its own layer so each drifts on its own; [buffer, amplitude, phase]
const CLOUDS = []
const cloudAt = (amp, ph, o) => { const buf = cloudLayer(); drawInto(buf, () => bank(o)); CLOUDS.push([buf, amp, ph]) }
// E: a small, faint fragment between B and the title, clear of the tagline
cloudAt(1.2, 5.3, { base: 148, env: [[292, 148], [294, 140], [302, 132], [314, 128], [326, 132], [334, 142], [336, 148]], seed: 55, scale: 0.55, shade: 0.85, frag: 2 })
// C: a small, high cloud near the top centre
cloudAt(1.8, 3.0, { base: 64, env: [[298, 64], [298, 52], [306, 38], [322, 24], [342, 18], [362, 26], [376, 42], [384, 64]], seed: 56, scale: 0.7, shade: 0.2, frag: 3 })
// B: a medium cloud behind the middle of the city
cloudAt(1.0, 1.8, { base: 310, env: [[296, 310], [298, 262], [306, 214], [322, 176], [346, 154], [376, 148], [404, 160], [424, 190], [434, 236], [434, 310]], seed: 57, sp: 12, shade: 0.4, frag: 5 })
// A: the tall tower behind and right of the hero tower, cropped by the right edge
cloudAt(1.4, 0.5, { base: 340, env: [[528, 340], [526, 262], [530, 196], [544, 136], [562, 88], [586, 54], [614, 40], [646, 46], [676, 78], [690, 130], [694, 340]], seed: 58, sp: 14, frag: 10 })
// D: the low cool bank at the bottom left, bumpy, with two warm billows poking up
cloudAt(1.6, 4.2, { base: 508, env: [[-10, 508], [-10, 372], [6, 360], [20, 348], [38, 356], [54, 344], [72, 352], [90, 366], [108, 356], [128, 372], [152, 384], [178, 396], [206, 412], [234, 432], [262, 458], [264, 508]], seed: 59, sp: 13, shade: 0.55, lift: 1.1, warmP: 0.25, warmLift: 0.8, frag: 4, peaks: [[34, 345, 10], [108, 352, 9]] })
const composeSky = (f, out) => {
  const t = (2 * Math.PI * f) / FRAMES
  const dxs = CLOUDS.map(([, amp, ph]) => Math.round(amp * Math.sin(t + ph)))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    if (CITY[i]) continue
    let v = SKYBASE[i]
    for (let l = 0; l < CLOUDS.length; l++) { const sx = x - dxs[l]; if (sx >= 0 && sx < W) { const c = CLOUDS[l][0][y * W + sx]; if (c !== 255) v = c } }
    out[i] = v
  }
}
composeSky(0, fb)

// ================================================================ iso city
// The buildings are drawn at 16 px per half cell; the hero tower keeps its own, finer 8 px grid.
let ISO = 16
const PXs = (a, b) => Math.round((a - b) * ISO)
const PYs = (a, b) => Math.round((a + b) * ISO / 2)

// the roof line the city climbs along, and where its back row of ground sits under it
const TKN = [[136, 455], [160, 392], [195, 388], [215, 345], [250, 308], [272, 332], [300, 350], [322, 232], [345, 290], [372, 304], [395, 226], [425, 232], [450, 262], [480, 276], [510, 284], [532, 300], [575, 326], [605, 346], [640, 356]]
const roofLine = (x) => lerpPoly(TKN, x)
const backLine = (x) => (x < 224 ? lerpPoly([[136, 508], [205, 500], [224, roofLine(224) + 84]], x) : roofLine(x) + 84)
const cellXY = (a, b) => [16 * (a - b), 8 * (a + b) + 8]
const cellOK = (a, b) => { const [cx, cy] = cellXY(a, b); return cx >= 136 && cx <= 700 && cy >= backLine(cx) && cy <= 590 }

// ---------------------------------------------------------------- one light over everything
// each pixel a building paints remembers how far back it stands (haze toward the dusk violet), how far
// into the dark front-left it sits, and how near the tower's warm glow it is; once the city is drawn
// every colour is blended and snapped back onto the palette
const KEYRGB = {}
for (const k of KEYS) { const hx = PAL[k]; KEYRGB[k] = [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)] }
const SNAP = [...KEYS].filter((k) => !"CXGIJabcdFWx".includes(k))
const nearestKey = (r, g, b) => {
  let best = "0", bd = 1e9
  for (const k of SNAP) { const c = KEYRGB[k]; const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = k } }
  return best
}
const levelFor = (yBase) => (yBase >= 400 ? 0 : Math.round(20 * (0.15 + 0.1 * clamp((400 - yBase) / 80, 0, 1))))
const darkFor = (cx, yBase) => Math.round(clamp((380 - cx) / 170, 0, 1) * clamp((yBase - 350) / 100, 0, 1) * 0.55 * 20)
const tintCache = new Map()
const LIGHTKEYS = new Set("yhzvYnHMVNL$7-[+=:;<")
const tintKey = (k, hz, dk, wm) => {
  if (LIGHTKEYS.has(k)) { hz = Math.round(hz * 0.3); dk = Math.round(dk * 0.4); wm = 0 }
  if (!hz && !dk && !wm) return k
  const ck2 = ((hz * 32 + dk) * 32 + wm) * 128 + IDX[k]
  let r = tintCache.get(ck2)
  if (!r) {
    let c = KEYRGB[k].slice()
    const mix = (t, f) => { c = [c[0] * (1 - f) + t[0] * f, c[1] * (1 - f) + t[1] * f, c[2] * (1 - f) + t[2] * f] }
    if (hz) mix(KEYRGB.Q, hz / 20)
    if (dk) mix(KEYRGB.A, dk / 20)
    if (wm) mix(KEYRGB.y, wm / 20)
    r = nearestKey(c[0], c[1], c[2]); tintCache.set(ck2, r)
  }
  return r
}
const darkCache = new Map()
const darkKey = (k, amt) => {
  const ck2 = Math.round(amt * 10) * 128 + IDX[k]
  let r = darkCache.get(ck2)
  if (!r) { const a = Math.round(amt * 10) / 10, c = KEYRGB[k], v = KEYRGB.A; r = nearestKey(c[0] * (1 - a) + v[0] * a, c[1] * (1 - a) + v[1] * a, c[2] * (1 - a) + v[2] * a); darkCache.set(ck2, r) }
  return r
}
const GROUND_Y = 440
const grounded = (x, y, k) => {
  if (y < GROUND_Y || "$-+[=".includes(k)) return k
  const t = (y - GROUND_Y) / (H - GROUND_Y)
  return bay(x, y) < Math.min(1, t * 1.15) ? darkKey(k, 0.12 + 0.33 * t) : k
}
// what a raw key becomes at (x, y) once the haze, the dark corner, the warm core and the gradient are on it
const DIMW = 9
const WALLDIM = new Set("RruPpqSstKklDEe%^&fijTUm")
const FK = (x, y, k) => { const i = y * W + x; const kk = tintKey(k, DEPTH[i], Math.min(20, DARK[i] + (WALLDIM.has(k) ? DIMW : 0)), WARM[i]); return CITY[i] ? grounded(x, y, kk) : kk }

// ---------------------------------------------------------------- glow
const EMIT = new Set("yhzvYVNHMnL$-:;<")
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
    for (const [dy, dens] of [[1, 0.5], [2, 0.2]]) {
      const ny = y + dy
      if (!inb(x, ny) || EMIT.has(get(x, ny))) continue
      if (bay(x, ny) < dens) { sink.push([x, ny, k, get(x, ny)]); put(x, ny, k) }
    }
  }
}

// ---------------------------------------------------------------- an iso box with its faces as functions
function isoBox(a0, b0, w, d, h, z0, fn) {
  const xl = PXs(a0, b0 + d), yBL = PYs(a0, b0 + d) - z0, wl = Math.round(ISO * w)
  const xf = PXs(a0 + w, b0 + d), yF = PYs(a0 + w, b0 + d) - z0, wr = Math.round(ISO * d)
  if (fn.L) for (let u = 0; u < wl; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) { const k = fn.L(u, r, wl, h, xl + u, yBL - h + off + r); if (k) put(xl + u, yBL - h + off + r, k) } }
  if (fn.R) for (let u = 0; u < wr; u++) { const off = (u + 1) >> 1; for (let r = 0; r < h; r++) { const k = fn.R(u, r, wr, h, xf + u, yF - h - off + r); if (k) put(xf + u, yF - h - off + r, k) } }
  const z = z0 + h
  if (fn.T) {
    const xs = PXs(a0, b0 + d), xe = PXs(a0 + w, b0), ys = PYs(a0, b0) - z, ye = PYs(a0 + w, b0 + d) - z
    const ins = (x, y) => {
      const u = (x + 0.5) / ISO, v = (y + 0.5 + z) / (ISO / 2)
      const a = (u + v) / 2, b = (v - u) / 2
      return a >= a0 && a < a0 + w && b >= b0 && b < b0 + d
    }
    for (let y = ys; y <= ye; y++) for (let x = xs; x <= xe; x++) {
      if (!ins(x, y)) continue
      const u = (x + 0.5) / ISO, v = (y + 0.5 + z) / (ISO / 2)
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
const wallXY = (side, m, u, r) => side === "L"
  ? [PXs(m.a, m.b + m.d) + u, PYs(m.a, m.b + m.d) - m.z - m.h + ((u + 1) >> 1) + r]
  : [PXs(m.a + m.w, m.b + m.d) + u, PYs(m.a + m.w, m.b + m.d) - m.z - m.h - ((u + 1) >> 1) + r]

// ---------------------------------------------------------------- colours of the buildings
const FAMS = {
  rose: { top: "R", L: "r", R: "u" }, mauve: { top: "P", L: "p", R: "q" }, terra: { top: "S", L: "s", R: "t" },
  peri: { top: "K", L: "k", R: "l" }, plum: { top: "D", L: "E", R: "e" }, peach: { top: "S", L: "s", R: "t" }, navy: { top: "%", L: "^", R: "&" }, teal: { top: "f", L: "i", R: "j" },
}
const FAMMAIN = ["rose", "plum", "peach", "terra", "rose", "plum", "terra", "peach", "mauve"]
const ACCENTS = ["H", "H", "H", "H", "M", "M", "n", "n", "n", "V", "N"]
const WCOLS = ["L", "L", "h", "h", "y", "y", "z", "z", "v", "v"]      // six in ten warm
const MORELIT = new Set([62, 65])
const LITEDGE = new Set([62, 65])
const WALLSET = new Set("RruPpqSstKklDEeTUmfijAB%^&")
const HALO = { L: "y", h: "L", y: "y", z: "H", v: "n", Y: "L" }
const HALO2 = { L: "T", h: "T", y: "T", z: "R", v: "K", Y: "T" }
const HALO3 = { L: "U", h: "U", y: "U", z: "r", v: "k", Y: "U" }

// ---------------------------------------------------------------- foliage: clumps of leaves on a five-step green ramp
// every clump is a union of small lumps, each lit from the top and dark underneath, the lower ones overlapping the upper,
// so the outline stays bumpy and there are always light, mid and shadow values. 7 warm highlight, g lit, o mid, O shadow,
// 8 indigo deep shadow, 9 pink-lavender rim on the pixels that face the sky
const GREENRAMP = ["7", "g", "o", "O", "8"]
const leafMass = (cx, cy, r, seed, o = {}) => {
  const ramp = o.ramp ?? GREENRAMP, rimK = o.rim ?? "9"
  const rxx = o.rx ?? r, lr = clamp(o.lr ?? r * 0.42, 2, 4.4), sq = o.sq ?? 0.85, warm = o.warm ?? 0
  const R = Math.ceil(Math.max(r, rxx) + lr + 2), S = 2 * R + 1
  const val = new Float32Array(S * S).fill(-9)
  const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? -9 : val[y * S + x])
  const ex = Math.max(1, rxx - lr * 0.55), ey = Math.max(1, (r - lr * 0.55) * sq)
  const lumps = []
  const step = lr * 1.1
  for (let gy = -ey; gy <= ey + 0.01; gy += step * 0.85) for (let gx = -ex; gx <= ex + 0.01; gx += step) {
    const px = gx + (ih(seed, Math.round(gx * 7), Math.round(gy * 11)) - 0.5) * lr * 0.9
    const py = gy + (ih(seed + 3, Math.round(gx * 5), Math.round(gy * 13)) - 0.5) * lr * 0.9
    if ((px * px) / (ex * ex) + (py * py) / (ey * ey) > 1.08) continue
    lumps.push([Math.round(px), Math.round(py), lr * (0.85 + 0.35 * ih(seed + 5, Math.round(gx * 3), Math.round(gy * 3)))])
  }
  if (!lumps.length) lumps.push([0, 0, Math.max(1.5, r)])
  lumps.sort((p, q) => p[1] - q[1])
  for (const [pcx, pcy, lrr] of lumps) {
    const ry = lrr * 0.92
    for (let dy = Math.floor(-ry); dy <= Math.ceil(ry); dy++) for (let dx = Math.floor(-lrr); dx <= Math.ceil(lrr); dx++) {
      if ((dx * dx) / (lrr * lrr) + (dy * dy) / (ry * ry) > 1) continue
      const l = (-dx * 0.45 - dy * 0.9) / lrr, gl = (-(pcx + dx) * 0.3 - (pcy + dy) * 0.95) / Math.max(2, r)
      val[(R + pcy + dy) * S + R + pcx + dx] = 0.62 * l + 0.45 * gl
    }
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = val[y * S + x]
    if (v < -8) continue
    const up = at(x, y - 1) < -8
    const edge = up || at(x, y + 1) < -8 || at(x - 1, y) < -8 || at(x + 1, y) < -8
    const gx = cx + x - R, gy = cy + y - R
    const hh = ih(gx, gy, seed + 9)
    if (edge && !up && hh < 0.12) continue
    let k = v > 0.42 ? ramp[1] : v > -0.02 ? ramp[2] : v > -0.5 ? ramp[3] : ramp[4]
    if (k === ramp[2] && hh < 0.07) k = ramp[3]
    else if (k === ramp[3] && hh > 0.93) k = ramp[2]
    if (up && v > -0.2 && ((x + seed) & 3) !== 0) k = rimK
    else if (warm && k === ramp[1] && ((warm < 0 ? at(x - 1, y) : at(x + 1, y)) < -8 || ((x - R) * warm > rxx * 0.3 && hh < 0.55))) k = ramp[0]
    else if (k === ramp[1] && v > 0.85 && hh < 0.4) k = ramp[0]
    if (o.fleck && k === ramp[3] && hh > 0.8) k = o.fleck
    put(gx, gy, k)
  }
  // blossoms or fruit scattered over the crown
  if (o.dots) for (let i = 0; i < o.dots[1]; i++) {
    const a = ih(seed, i, 41) * Math.PI * 2, d = Math.sqrt(ih(seed, i, 42)) * 0.8
    const px = Math.round(cx + Math.cos(a) * d * rxx), py = Math.round(cy + Math.sin(a) * d * r * sq)
    if (get(px, py) !== null && "7goO89".includes(get(px, py))) { put(px, py, o.dots[0][i % o.dots[0].length]); if (r > 4 && i % 2) put(px + 1, py, o.dots[0][(i + 1) % o.dots[0].length]) }
  }
}
const PINKRAMP = ["W", "J", "z", "9", "Z"]
const trunk = (x, y, h, w, seed) => {
  for (let j = 0; j < h; j++) {
    const ww = j < 2 && w > 1 ? w + 1 : w
    for (let i = 0; i < ww; i++) put(x - (ww >> 1) + i, y - j, i === 0 && ww > 1 ? "T" : i === ww - 1 && ww > 2 ? "e" : "U")
  }
}
// a round street tree: trunk, a few branches, a lumpy crown 8 to 16 px across
const streetTree = (x, y, r, seed, o = {}) => {
  const th = Math.max(3, Math.round(r * 0.9))
  trunk(x, y, th, r > 6 ? 3 : 2, seed)
  if (r > 5) for (let k = 1; k <= 3; k++) { put(x - k, y - th - k + 2, "E"); put(x + k, y - th - k + 2, "E") }
  leafMass(x, y - th - Math.round(r * 0.5), r, seed, { warm: o.warm ?? 0, sq: o.sq ?? 0.82 })
}
// blossom tree: a pink crown with a few leaves showing through
const sakura = (x, y, r, seed, o = {}) => {
  const th = Math.max(3, Math.round(r * 0.9))
  trunk(x, y, th, r > 6 ? 3 : 2, seed)
  if (r > 5) for (let k = 1; k <= 3; k++) { put(x - k, y - th - k + 2, "E"); put(x + k, y - th - k + 2, "E") }
  leafMass(x, y - th - Math.round(r * 0.5), r, seed, { ramp: PINKRAMP, rim: "W", fleck: "g", warm: o.warm ?? 0, sq: 0.82, dots: [["W", "J", "z"], Math.round(r * 2.2)] })
  // petals fallen at the foot
  for (let i = 0; i < 5; i++) put(x - 6 + Math.floor(ih(seed, i, 51) * 13), y + 1 + (i % 2), i % 2 ? "J" : "z")
}
const lineK = (x0, y0, x1, y1, k) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); if (!n) { put(x0, y0, k); return }
  for (let i = 0; i <= n; i++) put(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), k)
}
// a palm: thin curved trunk, a crown of 4 to 6 drooping fronds
const palm = (x, y, h, seed, lean = 0) => {
  const tx = (u) => Math.round(x + lean * Math.pow(u, 1.7))
  for (let t = 0; t <= h; t++) {
    const u = t / h
    put(tx(u), y - t, "E"); if (h > 14 && t < h * 0.45) put(tx(u) + 1, y - t, "e"); if (t % 3 === 1) put(tx(u) - 1, y - t, "U")
  }
  const ex = tx(1), ey = y - h
  const dirs = [[-1, -0.3, 1], [-0.62, -0.78, 1], [0.05, -0.9, 0.7], [0.62, -0.78, 1], [1, -0.3, 1]]
  if (seed % 2) dirs.push([-0.35, -0.9, 0.8])
  const L = Math.round(5 + h * 0.3)
  dirs.forEach(([dx, dy, ls], fi) => {
    const FL = L * ls
    for (let s = 0; s <= FL; s++) {
      const t = s / FL
      const px = Math.round(ex + dx * FL * t), py = Math.round(ey + dy * FL * t + 0.9 * FL * t * t)
      const up = dy < -0.7
      put(px, py, up && t < 0.7 ? "g" : "o"); put(px, py + 1, t > 0.5 ? "O" : "o")
      if (s % 2 === 1) { put(px, py - 1, up ? "g" : "o"); put(px - Math.sign(dx || 1), py + 2, "O") }
      if (up && t > 0.15 && t < 0.5 && s % 3 === 0) put(px, py - 1, fi % 2 ? "7" : "g")
    }
    put(Math.round(ex + dx * FL), Math.round(ey + dy * FL + 0.9 * FL) + 1, "8")
  })
  put(ex, ey - 2, "9"); put(ex + 1, ey - 1, "7"); put(ex, ey, "g")
  rectK(ex - 1, ey + 1, 2, 2, "U")      // coconuts
}
// bamboo: tall thin stalks with nodes and tufts of leaves
const bamboo = (x, y, h, n, seed) => {
  for (let i = 0; i < n; i++) {
    const sx = x + Math.round((i - (n - 1) / 2) * 3 + (ih(seed, i, 61) - 0.5) * 2), hh = Math.round(h * (0.7 + 0.3 * ih(seed, i, 62)))
    const lean = ih(seed, i, 63) < 0.5 ? -1 : 1
    for (let j = 0; j < hh; j++) {
      const px = sx + (j > hh * 0.6 ? lean : 0)
      put(px, y - j, j % 5 === 4 ? "O" : "o"); if (j % 2 === 0) put(px - 1, y - j, "g")
    }
    for (let t = 0; t < 3; t++) {
      const yy = y - hh + 3 + t * 4, side = (t + i) % 2 ? 1 : -1, px = sx + lean
      put(px + side, yy, "g"); put(px + 2 * side, yy + 1, "g"); put(px + 3 * side, yy + 2, "o"); put(px + 4 * side, yy + 3, "O"); put(px + 2 * side, yy + 2, "O")
      if (t === 0) put(px + side, yy - 1, "7")
    }
    put(sx + lean, y - hh - 1, "g"); put(sx + lean, y - hh - 2, "9")
  }
}
// a hanging strand of pothos or ivy: leaves on alternating sides
const pothos = (x, y, len, seed) => {
  for (let k = 0; k < len; k++) {
    const sx = x + Math.round(Math.sin(k * 0.6 + seed) * 0.8)
    put(sx, y + k, "O")
    if (k % 3 === 1) {
      const d = (k / 3 + seed) % 2 < 1 ? 1 : -1
      put(sx + d, y + k, "g"); put(sx + 2 * d, y + k, k % 6 === 1 ? "7" : "g"); put(sx + d, y + k + 1, "o"); put(sx + 2 * d, y + k + 1, "O")
    }
  }
  put(x, y - 1, "o")
}
const vine = pothos
// a terracotta pot with a clump on top, bottom centre at (x, y)
const potPlant = (x, y, w, seed, o = {}) => {
  const hgt = w >= 5 ? 4 : 3
  for (let j = 0; j < hgt; j++) {
    const ww = j === 0 ? w + 2 : j === hgt - 1 ? w - 2 : w
    for (let i = 0; i < ww; i++) put(x - (ww >> 1) + i, y - j, j === hgt - 1 ? "@" : i >= ww - Math.max(1, Math.round(ww * 0.35)) ? "@" : "!")
  }
  const r = w >= 5 ? 3.4 : 2.6
  if (o.tall) bamboo(x, y - hgt, 7 + (seed % 3), 2, seed)
  else leafMass(x, y - hgt - 1, r, seed, { sq: 0.9, warm: o.warm ?? 0, dots: o.bloom ? [["z", "W", "Y"], 2] : null })
}
const potRow = (x, y, n, gap, seed, o = {}) => {
  for (let i = 0; i < n; i++) potPlant(x + i * gap, y, 5 + (ih(seed, i, 71) < 0.3 ? 1 : 0), seed + i * 3, { bloom: ih(seed, i, 72) < 0.35, tall: ih(seed, i, 73) < 0.12, warm: o.warm ?? 0 })
}
// a bush in a row: x is the left end, y the base line
const hedge = (x, y, len, seed, o = {}) => {
  const hh = o.h ?? 3.2
  leafMass(x + len / 2, y - Math.round(hh) + 1, hh, seed, { rx: len / 2 + 0.5, sq: 0.8, lr: 2.4, warm: o.warm ?? 0, dots: o.bloom ? [["z", "W"], Math.round(len / 3)] : null })
}
// a planter box with terracotta sides and a bush
const planter = (x, y, len, seed, o = {}) => {
  for (let i = 0; i < len; i++) for (let j = 0; j < 3; j++) put(x + i, y - j, j === 0 ? "@" : i < len * 0.65 ? "!" : "@")
  hlineK(x - 1, y - 2, len + 2, "!")
  hedge(x, y - 3, len, seed, { h: 3.4, warm: o.warm ?? 0, bloom: ih(seed, len, 81) < 0.5 })
}
// small ferns tucked into corners, moss along ledges
const fern = (x, y, seed) => {
  const arcs = [[-1, -1], [-2, -1], [0, -1], [1, -1], [2, -1]]
  for (const [i] of arcs) {
    const len = 3 + ((seed + i * 3) & 1)
    for (let s = 1; s <= len; s++) {
      const px = x + Math.round(i * s * 0.8), py = y - Math.round(s * (1 - Math.abs(i) * 0.25)) + (s > 3 ? 1 : 0)
      put(px, py, s === len ? "O" : s % 2 ? "g" : "o")
    }
  }
  put(x, y - 4, "7"); put(x, y, "O"); put(x - 1, y, "8"); put(x + 1, y, "8")
}
const moss = (x, y, len, seed) => {
  for (let i = 0; i < len; i++) {
    const hh = ih(x + i, seed, 91) < 0.55 ? 1 : 2
    put(x + i, y, "O"); put(x + i, y - 1, "o"); if (hh > 1) put(x + i, y - 2, i % 3 ? "g" : "7")
    if (ih(x + i, seed, 92) < 0.22) { put(x + i, y + 1, "o"); put(x + i, y + 2, "O") }
  }
}
// a mottled lawn: patches of lit, mid and shaded grass, tufts, clover flowers
const lawn = (lx, ly, rx, ry, seed) => {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const dd = (x * x) / (rx * rx) + (y * y) / (ry * ry)
    if (dd > 1) continue
    const nz = Math.sin((lx + x) * 0.23 + seed) + Math.sin((ly + y) * 0.55 + (lx + x) * 0.07) + 0.9 * (y / ry)
    let k = dd > 0.8 ? (y > 0 ? "8" : "O") : nz < -0.7 ? "g" : nz < 0.9 ? "o" : "O"
    if (dd > 0.8 && y < 0) k = "o"
    if (dd < 0.8 && ih(lx + x, ly + y, seed) < 0.1) { put(lx + x, ly + y - 1, "g"); k = "g" }
    put(lx + x, ly + y, k)
  }
  for (let i = 0; i < Math.round(rx * ry / 45); i++) {
    const px = Math.round(lx + (ih(seed, i, 31) * 2 - 1) * rx * 0.75), py = Math.round(ly + (ih(seed, i, 32) * 2 - 1) * ry * 0.7)
    if (i % 3 === 0) put(px, py, ["z", "W", "Y"][i % 3 + (i % 2)] || "W")
    else leafMass(px, py, 2.6, seed + i, { sq: 0.8, lr: 2 })
  }
}
const stringLights = (x1, y1, x2, y2, sag, seed) => {
  const dx = x2 - x1, n = Math.max(2, Math.floor(Math.abs(dx) / 7)), cols = ["h", "L", "y", "z"]
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { const t = (x - x1) / dx; put(x, Math.round(y1 + (y2 - y1) * t + sag * (1 - Math.pow(2 * t - 1, 2))), "E") }
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.round(x1 + dx * t), y = Math.round(y1 + (y2 - y1) * t + sag * (1 - Math.pow(2 * t - 1, 2))) + 1
    rectK(x, y, 2, 2, cols[(i + seed) % cols.length]); pts.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1])
  }
  glowAround(pts, "T", 3)
}
const GROUNDSET = new Set("AB*()")
const pool = (cx, cy, rx, ry, k, dens) => {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const dd = (x * x) / (rx * rx) + (y * y) / (ry * ry)
    if (dd > 1 || !GROUNDSET.has(get(cx + x, cy + y))) continue
    if (bay(cx + x, cy + y) < (1 - dd) * dens) put(cx + x, cy + y, k)
  }
}
const streetLamp = (x, y) => {
  vlineK(x, y - 13, 13, "E"); rectK(x - 1, y - 15, 4, 2, "h")
  glowAround([[x - 1, y - 15], [x, y - 15], [x + 1, y - 15], [x + 2, y - 15], [x - 1, y - 14], [x, y - 14], [x + 1, y - 14], [x + 2, y - 14]], "T", 3)
  pool(x, y, 11, 5, "y", 0.55)
}

// ---------------------------------------------------------------- rooftop and wall props
const TANKS = (x, y, rx, h, fam) => {
  // an upright tank on legs: light on the left, dark on the right, ring bands, an elliptical lid
  const ry = Math.max(2, Math.round(rx / 2))
  for (let i = -rx; i <= rx; i++) {
    const t = i / rx, k = t < -0.4 ? fam.top : t < 0.2 ? fam.L : fam.R
    for (let j = 0; j < h; j++) put(x + i, y - 3 - j, (j % 6 === 5 && Math.abs(t) < 0.95) ? "A" : k)
  }
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) put(x + i, y - 3 - h + j, j < 0 ? fam.top : fam.L)
  vlineK(x - rx + 1, y - 2, 3, "e"); vlineK(x + rx - 1, y - 2, 3, "e"); vlineK(x, y - 2, 3, "e")
}
const acUnit = (side, m, u, r) => {
  for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
    const [x, y] = wallXY(side, m, u + i, r + j)
    put(x, y, j === 0 ? "K" : (i > 1 && i < 5 && j > 1) ? "l" : i === 6 ? "k" : "K")
  }
}
const antenna = (x, y, L, id) => {
  vlineK(x, y - L, L, "E"); hlineK(x - 3, y - L + 4, 7, "E"); hlineK(x - 2, y - L + 8, 5, "E")
  const rec = []
  paintPts([[x, y - L - 1, "x"], [x + 1, y - L - 1, "x"], [x - 1, y - L - 1, "4"], [x + 2, y - L - 1, "4"], [x, y - L - 2, "5"], [x + 1, y - L - 2, "5"]], rec)
  REC.tips.push({ pts: rec, ph: (id * 5) % 12 })
}
const laundry = (side, m, u1, u2, r, id) => {
  for (let u = u1 - 2; u <= u2 + 2; u++) { const [x, y] = wallXY(side, m, u, r); put(x, y, "E") }
  const cl = ["H", "W", "n", "z", "W", "H"]
  for (let u = u1 + 1, i = 0; u + 2 < u2; u += 5, i++) {
    for (let a = 0; a < 3; a++) for (let b = 1; b <= 5; b++) { const [x, y] = wallXY(side, m, u + a, r + b); put(x, y, cl[(i + id) % cl.length]) }
  }
}
const screenPanel = (x, y, w, hgt, k) => {
  const pts = []
  const top = y - hgt - 3
  vlineK(x + 2, y - 3, 3, "E"); vlineK(x + w - 3, y - 3 + ((w - 3) >> 1), 3, "E")
  for (let u = 0; u < w; u++) for (let j = 0; j < hgt; j++) {
    const yy = top + (u >> 1) + j
    const edge = u === 0 || u === w - 1 || j === 0 || j === hgt - 1
    if (edge) { put(x + u, yy, "A"); pts.push([x + u, yy]) }
    else put(x + u, yy, ((u + j) & 1) === 0 || j === 1 ? k : bay(u, j) < 0.45 ? k : "e")
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
  for (let y = low + 3; y <= low + 6; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
    if (wallKeys.includes(get(x, y)) && ((x + y) & 3) === 0) { rec.glow.push([x, y, col, get(x, y)]); put(x, y, col) }
  }
  REC.signs.push(rec)
}
const glyph3 = (seed) => { const rows = []; for (let j = 0; j < 3; j++) { let r = ""; for (let i = 0; i < 3; i++) r += ih(seed, j * 3 + i, 71) < 0.58 ? "X" : "."; rows.push(r) } return rows }
const ICON = {
  ring: ["..XXXX..", ".XX..XX.", "XX.WW.XX", "X..WW..X", "X..WW..X", "XX.WW.XX", ".XX..XX.", "..XXXX.."],
  arrow: ["XX......", "XXXX....", "XXXXXX..", "XXXXXXXX", "XXXXXXXX", "XXXXXX..", "XXXX....", "XX......"],
  bolt: ["...XXXX.", "..XXXX..", ".XXXX...", "XXXXXXXX", "...XXXX.", "..XXXX..", ".XXXX...", ".XXX...."],
}
// boxy neon boards with two lines of glyph-like lettering, tall strips, round and arrow icons, a bracket sign
const addWallSign = (side, m, kind, u0, r0, col, id, seed, wk) => {
  const cells = []
  const at = (u, r, k) => { const [x, y] = wallXY(side, m, u, r); cells.push([x, y, k]) }
  if (kind === "board") {
    const bw = 12 + 2 * (seed % 3), bh = 8
    for (let u = 0; u < bw; u++) for (let r = 0; r < bh; r++) at(u0 + u, r0 + r, (u === 0 || u === bw - 1 || r === 0 || r === bh - 1) ? col : "A")
    for (let li = 0; li < 2; li++) for (let gi = 0; gi < Math.floor((bw - 2) / 4); gi++) {
      const g = glyph3(id * 7 + li * 13 + gi + seed * 31)
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (g[j][i] === "X") at(u0 + 2 + gi * 4 + i, r0 + 1 + li * 3 + j, li ? "W" : col)
    }
  } else if (kind === "strip") {
    const len = 14 + 2 * (seed % 4)
    for (let r = 0; r < len; r++) { at(u0, r0 + r, col); at(u0 + 1, r0 + r, "W"); at(u0 + 2, r0 + r, col) }
  } else {
    const ic = ICON[["ring", "arrow", "bolt"][seed % 3]]
    ic.forEach((row, r) => { for (let u = 0; u < row.length; u++) if (row[u] !== ".") at(u0 + u, r0 + r, row[u] === "X" ? col : row[u]) })
  }
  addSign(cells, col, wk)
}

// ---------------------------------------------------------------- windows with a soft halo
// one window pane, (cu, cr) counted from its top-left corner: a dark recess on the top and left, a lighter top row of glass,
// sometimes a dark mullion, a curtain, a plant pot or a faint reflection; v is a hash that picks the variety
const paneAt = (cu, cr, pw, wh, on, lit, v) => {
  if (cu === 0 || cr === 0) return "A"
  const pot = v >= 0.28 && v < 0.36
  if (pot && cu === 1 && cr === wh - 1) return "!"
  if (pot && cu === 1 && cr === wh - 2) return "o"
  if (!lit) return v < 0.12 && cu === pw - 2 && cr === 2 ? "l" : "w"
  const big = wh >= 6
  if (big && ((v >= 0.5 && v < 0.75 && cr === (wh + 1) >> 1) || (v >= 0.75 && (cr === (wh + 1) >> 1 || cu === (pw + 1) >> 1)))) return "A"
  if (v >= 0.12 && v < 0.24 && cu <= pw >> 1 && cr > 1) return "@"
  return cr === 1 ? (on === "v" || on === "n" ? ";" : ":") : on
}
let curWins = []
const haloPass = () => {
  for (const rec of curWins) {
    if (!rec.halo || !rec.pts.length || (rec.pts[0][0] * 7 + rec.pts[0][1] * 13) % 3) continue
    const hk = HALO[rec.on] || "T"
    const P = new Set(rec.pts.map((p) => p[0] + p[1] * W))
    const seen = new Set()
    const ring = []
    for (const p of rec.pts) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = p[0] + dx, ny = p[1] + dy, ni = nx + ny * W
      if (!inb(nx, ny) || P.has(ni) || seen.has(ni)) continue
      seen.add(ni)
      if (!WALLSET.has(get(nx, ny)) || ((nx + ny) & 1)) continue
      ring.push([nx, ny, hk, get(nx, ny)])
    }
    for (const q of ring) { rec.pts.push(q); if (rec.lit) put(q[0], q[1], q[2]) }
  }
  curWins = []
}
const newWin = (lit, on, halo = true) => { const rec = { pts: [], lit, on, halo }; curWins.push(rec); REC.win.set(REC.win.size, rec); return rec }

// ---------------------------------------------------------------- a stack of cantilevered floor plates
function stack(o) {
  const { a, b, w, d, n, fh, fam, id } = o
  const plate = o.plate ?? 3, ins = o.ins ?? 0.15
  const pw = o.pw ?? 4, pier = o.pier ?? 2, per = pw + pier
  const wcol = o.wcol ?? "h"
  let z = o.z0 || 0
  const post = []
  let roofBox = null
  const panes = new Map()
  for (let f = 0; f < n; f++) {
    const last = f === n - 1
    const fhf = o.fhFor ? o.fhFor(f) : fh
    const hb = fhf - plate
    const wh = o.wh ?? Math.min(6, hb - 3), wy0 = o.wy0 ?? 2
    const dx = o.twist ? Math.round(o.twist * Math.sin(f * 1.37 + id)) : 0
    const grow = o.over && f >= n * 0.45 ? o.over : 0
    const A = a + dx / (2 * ISO) - grow, B = b - dx / (2 * ISO) - grow, Wd = w + 2 * grow, Dd = d + 2 * grow
    const fq = ih(id, f, 3), ff = fq < 0.3 ? 0.4 : fq < 0.7 ? 1.0 : 1.6      // some floors dark, some busier
    const mk = (side) => (u, r, wW, h, x, y) => {
      const base = side === "L" ? fam.L : fam.R
      if (o.groundWall && f === 0) { const k = o.groundWall(side, u, r, wW, h, x, y); if (k) return k }
      if (r === 0) return side === "L" ? fam.R : "A"                          // shadow under the plate above
      const pane = wh >= 4 && pw <= 6
      if (r < wy0 || r > wy0 + wh || (r === wy0 + wh && !pane) || u < 2) return base
      const rel = (u - 2) % per
      if (rel >= pw) return base
      const u0 = u - rel
      if (u0 + pw > wW - 2) return base
      const col = Math.floor((u - 2) / per)
      const pk = side + f + "_" + col
      let rec = panes.get(pk)
      if (!rec) {
        const q = ih(id * 131 + col, f * 7 + (side === "L" ? 1 : 2), 17), t = ih(id + col * 3, f, 5)
        const lit = (o.bright ? (fq < (o.litP ?? 0.85) && q < 0.92) : fq < 0.2 ? q < 0.1 : fq < 0.68 ? q < 0.94 : (col % 5 !== 4 && q < 0.55)) || (MORELIT.has(curOwner) && ih(id * 7 + col, f, 55) < 0.4)      // dark floors, glowing bands, mixed floors
        const on = o.bright ? (o.glass === "white" ? (t < 0.3 ? "h" : "F") : t < 0.12 ? "Y" : t < 0.55 ? "h" : "y") : (t < 0.86 ? wcol : ["L", "h", "y", "v"][Math.floor(t * 40) % 4])
        rec = newWin(lit, on, !o.bright)
        rec.v = ih(id * 17 + col, f * 5 + (side === "L" ? 3 : 4), 99)
        panes.set(pk, rec)
      }
      if (!pane) { rec.pts.push([x, y, rec.on, "w"]); return rec.lit ? rec.on : "w" }
      if (r === wy0 + wh) return rec.lit ? (side === "L" ? fam.top : fam.L) : base      // a lighter sill under a lit window
      const on = paneAt(rel, r - wy0, pw, wh, rec.on, true, rec.v), off = paneAt(rel, r - wy0, pw, wh, rec.on, false, rec.v)
      if (on !== "A") rec.pts.push([x, y, on, off])
      return rec.lit ? on : off
    }
    isoBox(A + ins, B + ins, Wd - 2 * ins, Dd - 2 * ins, hb, z, { L: mk("L"), R: mk("R") })
    const trimOn = o.trimAll ? (last ? true : ih(id, f, 9) < (o.trimP ?? 0.4)) : (o.trimB && f >= n - 2)
    const trimC = o.trims ? (f % 4 === 2 ? o.trims[1] : o.trims[0]) : "H"
    const rec = { pts: [], glow: [] }
    const roofFn = last && o.roofFn
    const pl = isoBox(A, B, Wd, Dd, plate, z + hb, {
      L: (u, r) => (r === 0 ? fam.top : fam.L), R: (u, r) => (r === 0 ? fam.L : fam.R),
      T: (x, y, i) => {
        if (trimOn && i.low) { rec.pts.push([x, y, trimC, fam.top]); return trimC }
        if (roofFn) { const k = roofFn(x, y, i); if (k) return k }
        if (o.ringFn) { const k = o.ringFn(x, y, i, f); if (k) return k }
        return (i.low || i.up || i.side) ? fam.top : (bay(x, y) < 0.12 ? fam.L : fam.top)
      },
    })
    if (rec.pts.length) { glowDown(rec.pts, trimC, rec.glow); REC.trims.push(rec) }
    if (o.plantP && (!last || o.roofPlants)) post.push(() => {
      for (const side of ["L", "R"]) {
        const ww = side === "L" ? pl.wl : pl.wr
        for (let u = 5; u < ww - 12; u += 9 + Math.floor(ih(id, u + f, 12) * 6)) {
          const q = ih(id * 17 + f, u + (side === "L" ? 0 : 99), 8), sd = id * 7 + u + f
          const [x, y] = pl[side](u, -1)
          if (o.far) { if (q < o.plantP) hedge(x, y, 5 + (sd % 4), sd, { h: 2.6 }); else if (q < o.plantP + (o.vineP ?? 0.15)) pothos(...pl[side](u, plate), 6 + (sd % 6), sd); continue }
          if (q < o.plantP * 0.5) potRow(x, y, 2 + (sd % 2), 8, sd)
          else if (q < o.plantP * 0.8) planter(x, y, 6 + (sd % 5), sd)
          else if (q < o.plantP) { if (sd % 2) fern(x + 2, y, sd); else moss(x, y, 5 + (sd % 4), sd) }
          else if (q < o.plantP + (o.vineP ?? 0.15)) { const [vx, vy] = pl[side](u, plate); pothos(vx, vy, 8 + Math.floor(ih(id, u + f, 6) * 13), sd) }
        }
      }
    })
    z += fhf
    roofBox = pl
  }
  for (const fn of post) fn()
  return { z, roofBox }
}

// ---------------------------------------------------------------- pods and round towers
function podTop(x, y, rx, hgt, fam, wk) {
  // a capsule on a ring: dome, a drum, and one big round window
  for (let j = 0; j < hgt; j++) {
    const t = j / (hgt - 1)
    const hw = t < 0.5 ? Math.round(rx * Math.sqrt(1 - Math.pow(1 - t * 2, 2))) : rx
    for (let i = -hw; i <= hw; i++) put(x + i, y - hgt + 1 + j, j === 0 || (j < 3 && Math.abs(i) === hw) ? fam.top : i > rx * 0.35 ? fam.R : fam.L)
  }
  const wy = y - Math.round(hgt * 0.45), wr = Math.max(3, Math.round(rx * 0.6))
  const pts = []
  for (let j = -wr; j <= wr; j++) for (let i = -wr; i <= wr; i++) {
    const dd = Math.hypot(i, j)
    if (dd <= wr) { put(x + i, wy + j, dd > wr - 1 ? "A" : (i < -wr / 3 && j < -wr / 3) ? "W" : j > wr / 2 ? "z" : wk); pts.push([x + i, wy + j]) }
  }
  glowAround(pts, wk === "v" ? "S" : "T", 3)
  hlineK(x - rx - 1, y, rx * 2 + 3, fam.top); hlineK(x - rx, y + 1, rx * 2 + 1, fam.R)
}
function cylinder(o) {
  // a round tower, or a pill (a round tower stretched along the a axis by sx, sy), with a balcony slab every floor
  const { cx, cy0, rx, ry, n, fh, fam, id, wcol } = o
  const sx = o.sx || 0, sy = o.sy || 0, SM = sx ? 14 : 0
  let z = 0
  const hb = fh - 3
  const ncol = Math.max(7, Math.round(rx / 3.2))
  const rb = 0.9
  const pk = (x, rr) => Math.floor((Math.asin(clamp((x - cx) / rr, -1, 1)) + Math.PI / 2) / (Math.PI / ncol))
  const lowAt = (x, rxx, ryy) => { let best = -1e9; for (let i = 0; i <= SM; i++) { const u = SM ? i / SM - 0.5 : 0, t = (x + 0.5 - (cx + u * sx)) / rxx; if (Math.abs(t) < 1) best = Math.max(best, cy0 + u * sy + ryy * Math.sqrt(1 - t * t)) } return best }
  const upAt = (x, rxx, ryy) => { let best = 1e9; for (let i = 0; i <= SM; i++) { const u = SM ? i / SM - 0.5 : 0, t = (x + 0.5 - (cx + u * sx)) / rxx; if (Math.abs(t) < 1) best = Math.min(best, cy0 + u * sy - ryy * Math.sqrt(1 - t * t)) } return best }
  const hw = sx / 2 + rx * rb, hwS = sx / 2 + rx
  const post = []
  for (let f = 0; f < n; f++) {
    const last = f === n - 1
    const fq = ih(id, f, 3)
    const trimOn = o.trimB && f >= n - 2
    for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
      const lw = lowAt(x, rx * rb, ry * rb)
      if (lw < -1e8) continue
      const t = (x + 0.5 - cx) / hw
      const yb = Math.round(lw - z)
      const x0 = Math.ceil(cx - hw)
      const col = sx ? Math.floor((x - x0) / 5) : pk(x, rx * rb), mull = sx ? (x - x0) % 5 === 0 : col !== pk(x - 1, rx * rb)
      for (let r = 0; r < hb; r++) {
        const y = yb - hb + r
        let k = t < -0.25 ? fam.L : t > 0.35 ? fam.R : (bay(x, y) < 0.5 ? fam.L : fam.R)
        if (r === 0) k = "A"
        else if (r >= 2 && r < hb - 2) {
          if (mull) k = fam.R
          else {
            const q = ih(id * 131 + col, f * 7, 17)
            k = (fq < 0.28 ? q < 0.1 : fq < 0.6 ? q < 0.93 : (col % 4 !== 3 && q < 0.5)) ? (t > 0.45 ? "y" : wcol) : "w"
          }
        }
        put(x, y, k)
      }
    }
    const rec = { pts: [], glow: [] }
    for (let x = Math.ceil(cx - hwS); x <= Math.floor(cx + hwS); x++) {
      const lw = lowAt(x, rx, ry)
      if (lw < -1e8) continue
      const t = (x + 0.5 - cx) / hwS
      const yw = Math.round(lw - (z + hb))
      put(x, yw - 3, t < 0.3 ? fam.top : fam.L); put(x, yw - 2, t < 0.1 ? fam.L : fam.R); put(x, yw - 1, fam.R)
      const ya = Math.round(upAt(x, rx, ry) - (z + fh)), yz = Math.round(lw - (z + fh)) - 1
      for (let y = ya; y <= yz; y++) {
        const low = y === yz
        const k = low && trimOn ? o.accent : fam.top
        if (low && trimOn) rec.pts.push([x, y, o.accent, fam.top])
        put(x, y, k)
      }
      if (o.plants && !last) {
        const q = ih(id * 3 + f, x >> 3, 19)
        if ((x - Math.ceil(cx - hwS)) % 8 === 4 && q < o.plants && t > -0.8 && t < 0.8) post.push([x, yw - 3, f, q])
      }
    }
    if (rec.pts.length) { glowDown(rec.pts, o.accent, rec.glow); REC.trims.push(rec) }
    z += fh
  }
  // pots, bushes and hanging strands along the curved balconies
  for (const [x, y, f, q] of post) {
    const sd = id * 13 + f * 5 + x
    if (q < o.plants * 0.4) potRow(x, y, 1, 6, sd)
    else if (q < o.plants * 0.75) hedge(x - 3, y, 6, sd, { h: 2.8 })
    else pothos(x, y + 2, 7 + (sd % 9), sd)
  }
  return { z, top: [cx, cy0 - z] }
}

// ---------------------------------------------------------------- roofs and other silhouettes
const P3 = (a, b, z) => [PXs(a, b), PYs(a, b) - z]
const fillPoly = (pts, fn) => {
  let y0 = Infinity, y1 = -Infinity
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]) }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const xs = []
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
      if ((ay <= y + 0.5) === (by <= y + 0.5)) continue
      xs.push(ax + ((y + 0.5 - ay) / (by - ay)) * (bx - ax))
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x < Math.ceil(xs[i + 1] - 0.5); x++) { const k = fn(x, y); if (k) put(x, y, k) }
  }
}
// a roof that rises to the back edge (axis "b") or the back-right edge (axis "a"), with one gable wall
const slantRoof = (a0, b0, w, d, z, hh, fam, axis, edgeK) => {
  const e = 0.1
  const roofK = (x, y) => (y % 3 === 0 ? fam.L : fam.top)
  if (axis === "b") {
    fillPoly([P3(a0 + w, b0, z), P3(a0 + w, b0, z + hh), P3(a0 + w, b0 + d, z)], () => fam.R)
    fillPoly([P3(a0 - e, b0 - e, z + hh), P3(a0 + w + e, b0 - e, z + hh), P3(a0 + w + e, b0 + d + e, z - 1), P3(a0 - e, b0 + d + e, z - 1)], roofK)
    const [x1, y1] = P3(a0 - e, b0 + d + e, z - 1), [x2, y2] = P3(a0 + w + e, b0 + d + e, z - 1)
    lineK(x1, y1, x2, y2, edgeK); lineK(x1, y1 - 1, x2, y2 - 1, fam.top)
    const [x3, y3] = P3(a0 - e, b0 - e, z + hh), [x4, y4] = P3(a0 + w + e, b0 - e, z + hh)
    lineK(x3, y3, x4, y4, "Z")
  } else {
    fillPoly([P3(a0, b0 + d, z), P3(a0, b0 + d, z + hh), P3(a0 + w, b0 + d, z)], () => fam.L)
    fillPoly([P3(a0 - e, b0 - e, z + hh), P3(a0 - e, b0 + d + e, z + hh), P3(a0 + w + e, b0 + d + e, z - 1), P3(a0 + w + e, b0 - e, z - 1)], (x, y) => (y % 3 === 0 ? fam.R : fam.L))
    const [x1, y1] = P3(a0 + w + e, b0 - e, z - 1), [x2, y2] = P3(a0 + w + e, b0 + d + e, z - 1)
    lineK(x1, y1, x2, y2, edgeK)
    const [x3, y3] = P3(a0 - e, b0 - e, z + hh), [x4, y4] = P3(a0 - e, b0 + d + e, z + hh)
    lineK(x3, y3, x4, y4, "Z")
  }
}
// a gabled roof, ridge along "a" or "b", tiles in terracotta
const gableRoof = (a0, b0, w, d, z, hh, axis, id) => {
  const e = 0.12
  const tile = (x, y) => (y % 3 === 0 ? "t" : (x + 2 * y) % 8 === 0 ? "T" : (y & 4) ? "s" : "U")
  if (axis === "a") {
    fillPoly([P3(a0 + w, b0, z), P3(a0 + w, b0 + d, z), P3(a0 + w, b0 + d / 2, z + hh)], (x, y) => ((x + y) % 11 === 0 ? "E" : "t"))
    fillPoly([P3(a0 - e, b0 + d / 2, z + hh), P3(a0 + w + e, b0 + d / 2, z + hh), P3(a0 + w + e, b0 + d + e, z - 1), P3(a0 - e, b0 + d + e, z - 1)], tile)
    const [x1, y1] = P3(a0 - e, b0 + d / 2, z + hh), [x2, y2] = P3(a0 + w + e, b0 + d / 2, z + hh)
    lineK(x1, y1 - 1, x2, y2 - 1, "Z"); lineK(x1, y1, x2, y2, "T")
    const [x3, y3] = P3(a0 - e, b0 + d + e, z - 1), [x4, y4] = P3(a0 + w + e, b0 + d + e, z - 1)
    lineK(x3, y3 + 1, x4, y4 + 1, "e")
    // the gable end: a round window
    const [wx, wy] = P3(a0 + w, b0 + d * 0.55, z + hh * 0.4)
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) put(wx + i, wy + j, i * i + j * j > 3 ? "E" : "h")
    return { eave: [[x3, y3 + 1], [x4, y4 + 1]], win: [wx, wy] }
  }
  fillPoly([P3(a0, b0 + d, z), P3(a0 + w, b0 + d, z), P3(a0 + w / 2, b0 + d, z + hh)], (x, y) => ((x + y) % 11 === 0 ? "E" : "t"))
  fillPoly([P3(a0 + w / 2, b0 - e, z + hh), P3(a0 + w / 2, b0 + d + e, z + hh), P3(a0 + w + e, b0 + d + e, z - 1), P3(a0 + w + e, b0 - e, z - 1)], tile)
  const [x1, y1] = P3(a0 + w / 2, b0 - e, z + hh), [x2, y2] = P3(a0 + w / 2, b0 + d + e, z + hh)
  lineK(x1, y1 - 1, x2, y2 - 1, "Z"); lineK(x1, y1, x2, y2, "T")
  const [x3, y3] = P3(a0 + w + e, b0 - e, z - 1), [x4, y4] = P3(a0 + w + e, b0 + d + e, z - 1)
  lineK(x3, y3 + 1, x4, y4 + 1, "e")
  const [wx, wy] = P3(a0 + w * 0.45, b0 + d, z + hh * 0.4)
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (i * i + j * j <= 5) put(wx + i, wy + j, i * i + j * j > 3 ? "E" : "h")
  return { eave: [[x3, y3 + 1], [x4, y4 + 1]], win: [wx, wy] }
}
// a paper lantern on a cord, with a soft glow
const lantern = (x, y, col) => {
  put(x, y, "E")
  const pts = [[x - 1, y + 1], [x, y + 1], [x + 1, y + 1], [x - 1, y + 2], [x, y + 2], [x + 1, y + 2], [x, y + 3]]
  put(x - 1, y + 1, col); put(x, y + 1, col); put(x + 1, y + 1, "x"); put(x - 1, y + 2, col); put(x, y + 2, "h"); put(x + 1, y + 2, "x"); put(x, y + 3, "E")
  glowAround(pts, "T", 3)
}
// a water tank on stilts: legs with cross braces, a banded tank and a conical lid
const waterTower = (x, y, seed) => {
  for (const lx of [-4, 4]) vlineK(x + lx, y - 9, 10, "E")
  vlineK(x, y - 9, 10, "e")
  lineK(x - 4, y - 1, x, y - 8, "e"); lineK(x + 4, y - 1, x, y - 8, "e"); lineK(x - 4, y - 8, x, y - 1, "e")
  for (let j = 0; j < 9; j++) for (let i = -5; i <= 5; i++) {
    const t = i / 5
    put(x + i, y - 10 - j, (j % 4 === 3 && Math.abs(t) < 0.95) ? "A" : t < -0.4 ? "T" : t < 0.3 ? "U" : "m")
  }
  for (let j = 0; j < 4; j++) hlineK(x - 4 + j, y - 19 - j, 9 - 2 * j, j === 0 ? "T" : j < 3 ? "U" : "m")
  put(x - 3, y - 20, "Z"); put(x - 2, y - 21, "Z"); vlineK(x, y - 24, 2, "E"); put(x, y - 25, "x")
  vlineK(x + 6, y - 14, 14, "E"); for (let j = 1; j < 14; j += 3) hlineK(x + 5, y - j, 3, "E")
}
// a cluster of antennas of different heights with a dish
const antennaCluster = (x, y, id) => {
  antenna(x - 7, y, 11 + (id % 5), id); antenna(x, y, 21 + (id % 7), id + 1); antenna(x + 7, y, 8 + (id % 4), id + 2)
  for (const [i, j, k] of [[0, 0, "K"], [1, 0, "K"], [2, 0, "K"], [0, 1, "k"], [1, 1, "l"], [2, 1, "k"], [1, 2, "E"]]) put(x + 12 + i, y - 8 + j, k)
  vlineK(x + 13, y - 5, 5, "E")
}
// a glass greenhouse dome: cyan-white panes in a dark frame grid, soft warm light and dim plants inside,
// a specular streak on the upper left and a pink sky reflection on top
const greenhouse = (cx, cy, rxD, Dh, seed) => {
  const ryD = Math.round(rxD / 2)
  const inside = (x, y) => { const t = (x + 0.5 - cx) / rxD; if (Math.abs(t) >= 1) return false; const s = Math.sqrt(1 - t * t); return y + 0.5 >= cy - Dh * s && y + 0.5 <= cy + ryD * s }
  const pts = []
  const tot = Dh + ryD
  // panes: shade by where they sit on the sphere (lit upper left, shade lower right)
  for (let x = cx - rxD; x <= cx + rxD; x++) for (let y = cy - Dh; y <= cy + ryD; y++) {
    if (!inside(x, y)) continue
    const tx = (x + 0.5 - cx) / rxD, ty = (y - (cy - Dh)) / tot
    const l = -tx * 0.6 - (ty - 0.35) * 0.9 + (bay(x, y) - 0.5) * 0.25
    put(x, y, l > 0.1 ? "$" : l > -0.5 ? "-" : "+")
  }
  // inside: soft warm light, low density, then dim green plants at about half density
  for (let x = cx - rxD; x <= cx + rxD; x++) for (let y = cy - Math.round(Dh * 0.5); y <= cy + ryD; y++) if (inside(x, y) && ((x + 2 * y) & 7) === 0 && ih(x, y, seed) < 0.7) put(x, y, "h")
  const DIM = ["o", "o", "O", "O", "8"]
  CLIP = (x, y) => inside(x, y) && bay(x, y) < 0.55
  const base = cy + Math.round(ryD * 0.5)
  leafMass(cx - Math.round(rxD * 0.42), base - 3, Math.max(4, Math.round(rxD * 0.26)), seed + 2, { ramp: DIM, rim: "o", sq: 0.9 })
  leafMass(cx + Math.round(rxD * 0.4), base - 4, Math.max(5, Math.round(rxD * 0.3)), seed + 3, { ramp: DIM, rim: "o", sq: 0.9 })
  leafMass(cx, base - 1, Math.max(4, Math.round(rxD * 0.24)), seed + 4, { ramp: DIM, rim: "o", sq: 0.8 })
  for (const dx of [-0.2, 0.2]) vlineK(cx + Math.round(rxD * dx), base - Math.round(Dh * 0.7), Math.round(Dh * 0.7), "8")
  leafMass(cx - Math.round(rxD * 0.2), base - Math.round(Dh * 0.7), 3, seed + 5, { ramp: DIM, rim: "o" })
  leafMass(cx + Math.round(rxD * 0.2), base - Math.round(Dh * 0.55), 3, seed + 6, { ramp: DIM, rim: "o" })
  CLIP = null
  // the frame: ribs and hoops in dark blue-grey, and an outline
  for (let f = -2; f <= 2; f++) for (let y = Math.floor(cy - Dh); y <= cy + ryD; y++) {
    const yo = y + 0.5 - cy, s = yo < 0 ? Math.sqrt(Math.max(0, 1 - (yo / Dh) ** 2)) : Math.sqrt(Math.max(0, 1 - (yo / ryD) ** 2))
    const x = Math.round(cx + (f / 2.6) * rxD * s)
    if (inside(x, y)) put(x, y, "=")
  }
  for (let x = cx - rxD; x <= cx + rxD; x++) {
    const t = (x + 0.5 - cx) / rxD; if (Math.abs(t) >= 1) continue
    const s = Math.sqrt(1 - t * t)
    const yt = Math.round(cy - Dh * s), yb = Math.round(cy + ryD * s)
    put(x, yt, "="); pts.push([x, yt])
    put(x, yb, "="); put(x, yb + 1, "="); pts.push([x, yb])
    for (const k of [0.33, 0.66]) { const yh = Math.round(cy - Dh * s * k); if (inside(x, yh)) put(x, yh, "=") }
    // pink sky reflection on the crown
    if (t > -0.6 && t < 0.5 && ih(x, 1, seed) < 0.9) { put(x, yt + 1, "["); if ((x & 1) === 0) put(x, yt + 2, "[") }
  }
  // the specular streak, upper left
  for (let j = 0; j < Math.round(Dh * 0.55); j++) { const x = cx - Math.round(rxD * 0.62) + Math.round(j * 0.55), y = cy - Math.round(Dh * 0.75) + j; if (inside(x, y)) { put(x, y, "W"); if (j < Dh * 0.35) put(x + 1, y, "W") } }
  glowAround(pts, "f", 3)
}

// ---------------------------------------------------------------- the layout: streets, a plaza, lots
const STREET_A = [34, 41], STREET_B = [9]
const PLAZA = { a0: 37, b0: 14, w: 5, d: 4 }
const TOWERC = { a0: 44, b0: 9, w: 5, d: 5 }
const occ = new Set()
const ck = (a, b) => a + "," + b
const inRect = (r, a, b) => a >= r.a0 && a < r.a0 + r.w && b >= r.b0 && b < r.b0 + r.d
// nothing is built in front of the plaza, so it stays in view
const CLEAR = { a0: 37, b0: 14, w: 9, d: 8 }
const isStreet = (a, b) => STREET_A.includes(a) || STREET_B.includes(b) || (inRect(CLEAR, a, b) && !inRect(PLAZA, a, b))
const SIZES = [[3, 3], [3, 3], [3, 4], [4, 3], [2, 3], [3, 2], [4, 4], [2, 4], [4, 2], [2, 2], [3, 3], [2, 3]]
const blds = []
for (let b = 0; b <= 40; b++) for (let a = 12; a <= 70; a++) {
  if (!cellOK(a, b) || occ.has(ck(a, b)) || isStreet(a, b) || inRect(PLAZA, a, b) || inRect(TOWERC, a, b)) continue
  let w = 1, d = 1, found = false
  for (let t = 0; t < 10; t++) {
    const [tw, td] = SIZES[Math.floor(ih(a, b, 31 + t) * SIZES.length)]
    let ok = true
    for (let i = 0; i < tw && ok; i++) for (let j = 0; j < td; j++) {
      const aa = a + i, bb = b + j
      if (!cellOK(aa, bb) || occ.has(ck(aa, bb)) || isStreet(aa, bb) || inRect(PLAZA, aa, bb) || inRect(TOWERC, aa, bb)) { ok = false; break }
    }
    if (ok) { w = tw; d = td; found = true; break }
  }
  if (!found) for (const [tw, td] of [[2, 2], [2, 1], [1, 2], [1, 1]]) {
    let ok = true
    for (let i = 0; i < tw && ok; i++) for (let j = 0; j < td; j++) {
      const aa = a + i, bb = b + j
      if (!cellOK(aa, bb) || occ.has(ck(aa, bb)) || isStreet(aa, bb) || inRect(PLAZA, aa, bb) || inRect(TOWERC, aa, bb)) { ok = false; break }
    }
    if (ok) { w = tw; d = td; found = true; break }
  }
  // a cell that fits no lot stays an open yard, except along the skyline, where it gets a slim tower
  if (!found && !(8 * (a + b) + 8 - backLine(16 * (a - b)) < 46)) continue
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) occ.add(ck(a + i, b + j))
  blds.push({ a0: a, b0: b, w, d, id: blds.length + 1 })
}
// the type of each: pagoda tenements (two at most), glass offices, round pods, pills with curved balconies, terraced garden blocks,
// flat shophouses, gabled teahouses, boxy apartment grids, slim slanted towers, greenhouse domes, industrial blocks
const TYPES = { tenement: 2, glass: 5, pod: 4, pill: 4, terrace: 5, shop: 6, tea: 5, grid: 7, slim: 5, dome: 4, industrial: 3 }
for (const bd of blds) {
  const [cx, cy] = cellXY(bd.a0 + bd.w / 2 - 0.5, bd.b0 + bd.d / 2 - 0.5)
  bd.cx = cx; bd.cy = cy
  bd.back = 8 * (bd.a0 + bd.b0) + 8 - backLine(cx) < 46
  bd.vis = PYs(bd.a0 + bd.w / 2, bd.b0 + bd.d / 2) - 40 < H && bd.cx < 700 && bd.cx > 100
  bd.lowCap = 0
  const mid = bd.a0 + bd.w / 2 + bd.b0 + bd.d / 2
  for (let i = -1; i <= bd.w && !bd.lowCap; i++) for (let j = -1; j <= bd.d; j++) {
    const aa = bd.a0 + i, bb = bd.b0 + j
    if ((isStreet(aa, bb) || inRect(PLAZA, aa, bb)) && mid > aa + bb) { bd.lowCap = inRect(PLAZA, aa, bb) ? 34 : 54; break }      // only the near side of a canyon stays low
  }
}
{
  const allowed = (bd) => allowed0(bd).filter((t) => t !== "tea" || bd.w * bd.d <= 6)
  const allowed0 = (bd) => {
    const m = Math.min(bd.w, bd.d), M = Math.max(bd.w, bd.d)
    if (bd.cy > 400 && !bd.back) return ["shop", "tea", "grid", "terrace", "dome", "industrial"].filter((t) => m > 1 || t === "shop" || t === "tea")
    if (m === 1) return bd.back ? ["shop", "tea", "slim", "grid", "dome", "pod", "glass"] : bd.lowCap ? ["shop", "tea", "dome"] : ["slim", "tea", "shop", "grid", "dome", "pod", "glass"]
    if (bd.lowCap) return ["shop", "tea", "grid", "terrace", "dome", "industrial"]
    if (bd.back) return ["tenement", "glass", "pod", "pill", "slim", "grid", "terrace", "grid", "terrace"].filter((t) => t !== "pill" || bd.w * bd.d >= 4)
    return ["tenement", "glass", "pod", "pill", "slim", "grid", "terrace", "shop", "tea", "dome", "industrial"].filter((t) => t !== "pill" || bd.w * bd.d >= 4)
  }
  const adj = (p, q) => p.a0 - 1 <= q.a0 + q.w && q.a0 - 1 <= p.a0 + p.w && p.b0 - 1 <= q.b0 + q.d && q.b0 - 1 <= p.b0 + p.d
  const used = {}
  // the cylinder tower and two pagoda tenements stay where they were
  for (const [pid, t] of [[48, "pod"], [24, "tenement"], [21, "tenement"]]) { const bd = blds.find((x) => x.id === pid); if (bd) { bd.type = t; used[t] = (used[t] || 0) + 1 } }
  const order0 = [...blds].sort((p, q) => (q.vis - p.vis) || (ih(p.id, 5, 5) - ih(q.id, 5, 5)))
  for (const bd of order0) {
    if (bd.type) continue
    const al = allowed(bd)
    const nb = new Set(blds.filter((o) => o.type && o !== bd && adj(bd, o)).map((o) => o.type))
    const sc = (t) => (used[t] || 0) / TYPES[t] + ih(bd.id, t.length * 7 + t.charCodeAt(0), 5) * 0.7
    let c = al.filter((t) => !nb.has(t) && (used[t] || 0) < TYPES[t])
    if (!c.length) c = al.filter((t) => !nb.has(t) && t !== "tenement")
    if (!c.length) c = al.filter((t) => t !== "tenement")
    c.sort((p, q) => sc(p) - sc(q))
    bd.type = c[0]; used[bd.type] = (used[bd.type] || 0) + 1
  }
}
{
  // at least two pills with curved balconies must be in view
  const vis = (b) => b.vis && b.cx > 200 && b.cx < 560 && b.cy < 470
  const have = blds.filter((b) => vis(b) && b.type === "pill").length
  const pick = blds.filter((b) => vis(b) && b.type !== "pill" && ![48, 24, 21].includes(b.id) && b.w * b.d >= 3 && (b.back || !b.lowCap)).sort((p, q) => q.w * q.d - p.w * p.d || p.id - q.id)
  for (const b of pick.slice(0, Math.max(0, 2 - have))) b.type = "pill"
}
for (const bd of blds) {
  // the footprint a building really stands on (slim towers stand narrower than their lot)
  bd.fp = { a: bd.a0, b: bd.b0, w: bd.w, d: bd.d }
  if (bd.type === "slim") {
    const mw = Math.max(1.2, bd.w * 0.6), md = Math.max(1.2, bd.d * 0.6)
    bd.fp = { a: bd.a0 + (bd.w - mw) / 2, b: bd.b0 + (bd.d - md) / 2, w: mw, d: md }
  }
}
{
  // each building gets one wall family, neighbors differ; the towers beside the hero lean cool so they separate from its warm glow
  const NAMES = ["rose", "teal", "peri", "plum", "terra", "mauve", "navy"]
  const adj2 = (p, q) => p.a0 - 1 <= q.a0 + q.w && q.a0 - 1 <= p.a0 + p.w && p.b0 - 1 <= q.b0 + q.d && q.b0 - 1 <= p.b0 + p.d
  const use = {}
  for (const bd of [...blds].sort((p, q) => (q.vis - p.vis) || (ih(p.id, 9, 9) - ih(q.id, 9, 9)))) {
    const nb = new Set(blds.filter((o) => o.famName && o !== bd && adj2(bd, o)).map((o) => o.famName))
    const al = Math.abs(bd.cx - 552) < 130 && bd.cy < 460 ? ["teal", "peri", "navy"] : NAMES
    let c = al.filter((n) => !nb.has(n)); if (!c.length) c = al
    c.sort((p, q) => (use[p] || 0) - (use[q] || 0) + (ih(bd.id, p.length * 3 + p.charCodeAt(0), 8) - ih(bd.id, q.length * 3 + q.charCodeAt(0), 8)) * 1.5)
    bd.famName = c[0]; use[c[0]] = (use[c[0]] || 0) + 1
  }
}
const HRANGE = { tenement: [100, 160], glass: [130, 180], pod: [90, 130], pill: [110, 170], slim: [150, 240], grid: [60, 130], terrace: [55, 115], shop: [30, 46], tea: [28, 40], dome: [58, 80], industrial: [56, 96] }
const heightOf = (bd) => {
  const r1 = ih(bd.id, 3, 9), r2 = ih(bd.id, 4, 9)
  const ac = bd.a0 + bd.w / 2, bc = bd.b0 + bd.d / 2
  const cyc = PYs(ac, bc)
  const [lo, hi] = HRANGE[bd.type]
  let h = lo + (hi - lo) * r1
  if (bd.back) {
    const fit = cyc - (roofLine(bd.cx) + (r2 - 0.5) * 20)
    h = ["grid", "terrace"].includes(bd.type) ? Math.max(70, fit * (0.55 + 0.2 * r1)) : ["shop", "tea", "dome"].includes(bd.type) ? h : Math.max(70, fit + (bd.type === "slim" ? 14 : 0))
  }
  if (bd.lowCap && !bd.back) h = Math.min(h, bd.lowCap)
  if (!bd.back && !bd.lowCap && !["shop", "tea", "dome", "grid", "terrace"].includes(bd.type)) h = Math.max(h, 70)
  if (!bd.back) h = Math.min(h, bd.cy > 440 ? 64 : bd.cy > 400 ? 96 : bd.cy > 360 ? 150 : 999)
  const nearTower = Math.abs(bd.cx - 552) < 62 && bd.cy > 380
  return clamp(Math.round(nearTower ? Math.min(h, 64) : h), 24, 270)
}
for (const bd of blds) bd.h = heightOf(bd)
// skybridges: lit tubes between pairs of towers that stand side by side on screen; the pair is retyped as a glass tower and a boxy apartment block
const BRIDGES = []
{
  const eR = (b) => PXs(b.a0 + b.w, b.b0) - 1, eL = (b) => PXs(b.a0, b.b0 + b.d)
  const bot = (b, x) => (x === "R" ? PYs(b.a0 + b.w, b.b0) : PYs(b.a0, b.b0 + b.d))
  const cand = blds.filter((b) => b.vis && ![48, 24, 21].includes(b.id) && b.type !== "pill" && (b.back || !b.lowCap) && b.cx > 170 && b.cx < 520 && b.cy < 470 && b.w * b.d >= 2)
  const pairs = []
  for (const p of cand) for (const q of cand) {
    if (p === q) continue
    const hp = Math.max(p.h, 120), hq = Math.max(q.h, 110), g = eL(q) - eR(p)
    if (g < 12 || g > 44) continue
    const top = Math.max(bot(p, "R") - hp, bot(q, "L") - hq), btm = Math.min(bot(p, "R"), bot(q, "L"))
    if (btm - top < 60 || top < 140) continue
    pairs.push({ p, q, g, hp, hq, y: Math.round(top + 22 + 0.15 * (btm - top - 22)), score: Math.abs(g - 24) + Math.abs(top - 260) * 0.2 })
  }
  pairs.sort((u, v) => u.score - v.score)
  const used = new Set()
  for (const pr of pairs) {
    if (used.has(pr.p.id) || used.has(pr.q.id) || BRIDGES.length >= 1) continue
    used.add(pr.p.id); used.add(pr.q.id)
    pr.p.type = "glass"; pr.q.type = "grid"; pr.p.h = pr.hp; pr.q.h = pr.hq
    pr.p.fp = { a: pr.p.a0, b: pr.p.b0, w: pr.p.w, d: pr.p.d }; pr.q.fp = { a: pr.q.a0, b: pr.q.b0, w: pr.q.w, d: pr.q.d }
    BRIDGES.push({ x1: eR(pr.p) + 1, x2: eL(pr.q) - 1, y: pr.y, key: Math.max(pr.p.a0 + pr.p.w + pr.p.b0 + pr.p.d, pr.q.a0 + pr.q.w + pr.q.b0 + pr.q.d) + 0.1, lvl: levelFor(PYs(pr.q.a0 + pr.q.w, pr.q.b0 + pr.q.d)) })
  }
  const cnt = {}; for (const b of blds.filter((x) => x.vis)) cnt[b.type] = (cnt[b.type] || 0) + 1
}

// ---------------------------------------------------------------- what each type puts on its walls
const pickFam = (bd) => bd.famName
const wallBoards = (bd, m, n, accent, wk, kinds, base = 8) => {
  const id = bd.id
  for (let s = 0; s < n; s++) {
    const side = ih(id, 26 + s, 3) < 0.7 ? "L" : "R"
    const wW = Math.round(ISO * (side === "L" ? m.w : m.d))
    if (wW < 22 || m.h < 30) continue
    const kind = kinds[Math.floor(ih(id, 28 + s, 3) * kinds.length)]
    const need = kind === "board" ? 14 : kind === "strip" ? 5 : 9
    const u0 = 3 + Math.floor(ih(id, 31 + s, 3) * Math.max(1, wW - need - 6))
    const r0 = base + Math.floor(ih(id, 32 + s, 3) * Math.max(1, m.h - 30))
    addWallSign(side, m, kind, u0, r0, accent, id, Math.floor(ih(id, 33 + s, 3) * 12), wk)
  }
}

// rooftop gardens: beds in terracotta boxes either side of a stone path, with bushes, small trees, flowers
let SAKURAS = 0
const gardenRoofFn = (a, b, w, d) => (x, y, i) => {
  if (i.low || i.up || i.side) return null
  const mid = b + d / 2
  if (Math.abs(i.b - mid) < 0.2) return ((x + y) % 6 === 0 ? ")" : (x >> 1) % 3 === 0 ? "*" : "(")
  return null
}
const gardenBeds = (z, a, b, w, d, seed, far) => {
  const beds = []
  const mid = b + d / 2
  for (const [b1, b2] of [[b + 0.22, mid - 0.26], [mid + 0.26, b + d - 0.22]]) {
    if (b2 - b1 < 0.3) continue
    const na = Math.max(1, Math.floor((w - 0.3) / 1.1)), aw0 = (w - 0.4) / na
    for (let i = 0; i < na; i++) beds.push({ a1: a + 0.2 + i * aw0, aw: aw0 - 0.16, b1, bw: b2 - b1, i, j: b1 > mid ? 1 : 0 })
  }
  beds.sort((p, q) => (p.a1 + p.b1) - (q.a1 + q.b1))
  for (const bd of beds) {
    isoBox(bd.a1, bd.b1, bd.aw, bd.bw, 3, z, { L: (u, r) => (r === 0 ? "T" : "!"), R: (u, r) => (r === 0 ? "!" : "@"), T: () => "e" })
    const [px, py] = P3(bd.a1 + bd.aw / 2, bd.b1 + bd.bw / 2, z + 3)
    const sd = seed * 11 + bd.i * 5 + bd.j, q = ih(seed, bd.i * 3 + bd.j, 7)
    const rxw = Math.max(3, Math.min(11, Math.round(ISO * (bd.aw + bd.bw) * 0.32)))
    if (far) { leafMass(px, py - 1, 3, sd, { rx: rxw, sq: 0.8, lr: 2.2 }); continue }
    if (q < 0.3) streetTree(px, py + 1, 4 + (sd % 2), sd)
    else if (q < 0.5 && SAKURAS < 3) { SAKURAS++; sakura(px, py + 1, 5, sd) }
    else if (q < 0.62) bamboo(px, py + 1, 11 + (sd % 4), 3, sd)
    else if (q < 0.72) palm(px, py + 1, 12 + (sd % 4), sd, 3)
    else leafMass(px, py - 2, 4.2, sd, { rx: rxw + 2, sq: 0.8, lr: 2.6, dots: q < 0.88 ? [["z", "W", "Y"], 3] : null })
    if (q > 0.45) { fern(px - rxw, py + 1, sd) }
  }
}
// a skybridge: a lit tube between two towers, with struts, a neon edge and little windows
const drawBridge = (br) => {
  const { x1, x2, y } = br
  curWins = []
  const len = x2 - x1
  for (let x = x1; x <= x2; x++) {
    for (let j = -5; j <= 4; j++) {
      const k = j === -5 ? "K" : j === -4 ? "k" : j === 4 ? "A" : j === 3 ? "l" : "w"
      put(x, y + j, k)
    }
    put(x, y - 6, "Z")
    const px = x - x1
    if (px > 1 && px < len - 1 && px % 5 !== 4) {
      const rec = newWin(true, px % 15 < 5 ? "z" : "h", false)
      for (let j = -3; j <= 1; j++) { rec.pts.push([x, y + j, rec.on, "w"]); put(x, y + j, rec.on) }
    }
  }
  for (let x = x1; x <= x2; x += 2) put(x, y + 5, "H")
  lineK(x1 + 2, y + 5, x1 - 4, y + 12, "E"); lineK(x2 - 2, y + 5, x2 + 4, y + 12, "E")
  vlineK(x1, y - 9, 14, "E"); vlineK(x2, y - 9, 14, "E")
  glowAround([...Array(len + 1).keys()].map((i) => [x1 + i, y + 5]), "H", 2)
  haloPass()
}

const drawBuilding = (bd) => {
  const { a0, b0, w, d, id } = bd
  curOwner = id
  const left = PXs(a0, b0 + d), right = PXs(a0 + w, b0)
  const roofY = PYs(a0 + w / 2, b0 + d / 2) - bd.h
  if (right < -30 || left > W + 20 || roofY > H + 20) return
  const yBase = PYs(a0 + w, b0 + d)
  curLevel = levelFor(yBase); curDark = darkFor(bd.cx, yBase)
  curWins = []
  const fam = FAMS[pickFam(bd, bd.id)]
  const accent = ACCENTS[Math.floor(ih(id, 5, 3) * ACCENTS.length)]
  const trims = [accent, accent]
  const wcol = WCOLS[Math.floor(ih(id, 6, 3) * WCOLS.length)]
  const trimB = ih(id, 52, 3) < 0.45
  const wk = [fam.L, fam.R, "A"]
  const type = bd.type
  const H0 = bd.h
  const far = bd.back
  const mods = []     // wall planes for signs and details
  const roofBits = (rx, ry, kind) => {
    const q = ih(id, 101, 6)
    if (kind === "tank") TANKS(rx - 8, ry + 2, 5, 9, fam)
    if (q < 0.3) waterTower(rx + 12, ry + 3, id)
    else if (q < 0.6) hedge(rx + 6, ry + 4, 9, id, { h: far ? 2.6 : 3.2 })
  }
  if (type === "tenement") {
    const fh = 11, total = Math.max(5, Math.round(H0 / fh))
    const ns = [Math.max(2, Math.round(total * 0.5)), Math.max(1, Math.round(total * 0.3))]
    ns.push(Math.max(1, total - ns[0] - ns[1]))
    let z = 0, st = null
    for (let k = 0; k < 3; k++) {
      const tw = Math.min(0.4 * k, (w - 0.7) / 2), td = Math.min(0.4 * k, (d - 0.7) / 2)
      const ma = a0 + tw, mb = b0 + td, mw = w - 2 * tw, md = d - 2 * td
      st = stack({ a: ma, b: mb, w: mw, d: md, z0: z, n: ns[k], fh, fam, id: id * 3 + k, trims, pw: 4, pier: 2, wcol, trimB: trimB && k === 2, plantP: 0.5, vineP: 0.2, far })
      mods.push({ a: ma, b: mb, w: mw, d: md, z, h: ns[k] * fh, n: ns[k], fh })
      z = st.z
    }
    const top = st.roofBox, [rx, ry] = top.pt(a0 + w / 2, b0 + d / 2)
    for (const m of mods) {
      for (let f = 0; f < m.n; f++) {
        const q = ih(id, f + m.z, 50)
        const wL = Math.round(ISO * m.w)
        if (q < 0.2 && wL > 20) acUnit("L", m, 4 + Math.floor(ih(id, f, 51) * Math.max(1, wL - 16)), (m.n - 1 - f) * m.fh + 4)
        else if (q < 0.3 && wL > 24) laundry("L", m, 5, wL - 6, (m.n - 1 - f) * m.fh + 4, id + f)
      }
    }
    wallBoards(bd, mods[0], 5, accent, wk, ["board", "strip", "icon", "board"], 14)
    antenna(rx + 6, ry, 12 + Math.floor(ih(id, 100, 6) * 8), id)
    roofBits(rx, ry, "tank")
  } else if (type === "glass") {
    const fh = 12, n = Math.max(6, Math.round(H0 / fh)), h = n * fh
    const lam = fam
    const panes = new Map()
    const glassKey = (side) => (u, r, wW, hh, x, y) => {
      const base = side === "L" ? lam.L : lam.R
      if (r % fh === 0 && r > 0) return side === "L" ? lam.R : "l"
      if (u % 8 === 0) return side === "L" ? lam.R : "l"
      const col = Math.floor(u / 8), f = Math.floor(r / fh), rr = r % fh
      if (u % 8 >= 2 && u % 8 <= 6 && rr >= 3 && rr <= 10 && u > 2 && u < wW - 3) {
        const pk = side + f + "_" + col
        let rec = panes.get(pk)
        if (!rec) {
          const q = ih(id * 131 + col, f * 7 + (side === "L" ? 1 : 2), 17), t = ih(id + col, f, 5)
          rec = newWin(ih(id, f, 3) < 0.28 ? q < 0.1 : ih(id, f, 3) < 0.6 ? q < 0.93 : (q < 0.5 && col % 4 !== 3), t < 0.86 ? wcol : "v", true)
          rec.v = ih(id * 17 + col, f * 5 + (side === "L" ? 3 : 4), 99)
          panes.set(pk, rec)
        }
        const cu = u % 8 - 2, cr = rr - 3
        if (cr === 8) return rec.lit ? lam.top : base
        const on = paneAt(cu, cr, 5, 8, rec.on, true, rec.v), off = paneAt(cu, cr, 5, 8, rec.on, false, rec.v)
        if (on !== "A") rec.pts.push([x, y, on, off])
        return rec.lit ? on : off
      }
      const sheen = (1 - r / hh) * 0.55 + (side === "L" ? (1 - u / wW) * 0.25 : 0)
      return bay(x, y) < sheen * 0.7 ? (side === "L" ? lam.top : lam.L) : base
    }
    isoBox(a0, b0, w, d, h, 0, {
      L: glassKey("L"), R: glassKey("R"),
      T: (x, y, i) => ((i.low || i.up) ? accent : (i.side ? lam.top : (bay(x, y) < 0.15 ? lam.L : lam.top))),
    })
    const top = { a: a0, b: b0, w, d, z: 0, h }
    const cells = []
    for (let r = 2; r < h - 2; r++) { const x = PXs(a0 + w, b0 + d), y = PYs(a0 + w, b0 + d) - h + r; cells.push([x - 1, y, accent], [x, y, "W"], [x + 1, y, accent]) }
    addSign(cells, accent, wk)
    mods.push(top)
    const [rx, ry] = [PXs(a0 + w / 2, b0 + d / 2), PYs(a0 + w / 2, b0 + d / 2) - h]
    antenna(rx + 4, ry - 2, 16 + Math.floor(ih(id, 100, 6) * 10), id)
    spr(rx - 10, ry + 2, ["KKKKKk", "KllllK", "KllllK", "kkkkkk"])
    hedge(rx + 8, ry + 5, 10, id, { h: far ? 2.6 : 3.2 })
    if (!far) { const [vx, vy] = wallXY("L", top, 12 + (id % 3) * 12, 2); pothos(vx, vy, 10 + (id % 8), id) }
  } else if (type === "pod" || type === "pill") {
    const fh = 12, n = Math.max(5, Math.round(H0 / fh))
    const long = Math.max(w, d), short = Math.min(w, d)
    let R = short * 0.5 * 0.92, s = 0
    if (type === "pill") { s = (long - short) + (long === short ? 0.8 : 0); R = short * 0.5 * (long === short ? 0.78 : 0.92) }
    const rx = 22.6 * R * (type === "pod" && ih(id, 10, 3) < 0.3 ? 1.35 : 1), ry = 11.3 * R
    const cx = PXs(a0 + w / 2, b0 + d / 2), cy0 = PYs(a0 + w / 2, b0 + d / 2)
    const top = cylinder({ cx, cy0, rx, ry, n, fh, fam, id, wcol, trimB, accent, plants: far ? 0 : (type === "pill" ? 0.95 : 0.6), sx: s ? (w >= d ? 1 : -1) * Math.round(ISO * s) : 0, sy: Math.round(ISO * s / 2) })
    const [tx, ty] = top.top
    if (type === "pod") {
      podTop(tx, ty + 2, 5 + Math.floor(ih(id, 11, 3) * 3), 13 + Math.floor(ih(id, 12, 3) * 3), fam, ih(id, 13, 3) < 0.3 ? "v" : wcol)
      if (ih(id, 14, 3) < 0.7) streetTree(tx - Math.round(rx * 0.55), ty + 4, 4, id)
    } else {
      hedge(tx - Math.round(rx * 0.6), ty + 3, 12, id, { h: 3.4, bloom: true })
      streetTree(tx + Math.round(rx * 0.35), ty + 5, 4, id + 3)
      palm(tx - 2, ty + 3, 14, id, 3)
    }
    mods.push({ a: a0, b: b0, w, d, z: 0, h: n * fh })
  } else if (type === "terrace") {
    // a staircase of wide steps toward the back, each with a roof garden
    const fh = 12, steps = Math.max(2, Math.min(3, Math.round(H0 / 40)))
    const per = Math.max(2, Math.round(H0 / fh / steps))
    let z = 0, st = null
    for (let k = 0; k < steps; k++) {
      const ta = Math.min(0.55 * k, w - 1.0)
      const ma = a0 + ta, mb = b0, mw = w - ta, md = d - Math.min(0.3 * k, d - 1)
      const lastStep = k === steps - 1
      st = stack({
        a: ma, b: mb, w: mw, d: md, z0: z, n: per, fh, fam, id: id * 5 + k, trims, pw: 4, pier: 3, wcol,
        ins: 0.3, trimB: trimB && lastStep, plantP: 0.8, vineP: 0.4, roofPlants: true, far,
        roofFn: gardenRoofFn(ma, mb, mw, md),
      })
      mods.push({ a: ma, b: mb, w: mw, d: md, z, h: per * fh })
      gardenBeds(st.z, ma, mb, mw, md, id * 9 + k, far)
      z = st.z
    }
  } else if (type === "shop") {
    const fh = 12, n = 2 + (ih(id, 15, 3) < 0.5 ? 1 : 0)
    const awn = accent === "N" ? "H" : accent
    const st = stack({
      a: a0, b: b0, w, d, n, fh, fhFor: (f) => (f === 0 ? 16 : fh), fam, id, trims, pw: 4, pier: 3, wcol, trimB, plantP: 0.6, vineP: 0.2, ins: 0.2, far,
      groundWall: (side, u, r, wW, h) => {
        if (side === "R") {
          if (r === 0) return fam.R
          if (u >= 3 && u < wW - 3 && r >= 5 && r < h - 1) return (u - 3) % 9 < 3 ? "w" : (u % 11 < 6 ? "h" : "y")
          return null
        }
        if (r === 0) return fam.R
        if (r >= 1 && r <= 4) return Math.floor(u / 3) % 2 === 0 ? awn : "W"
        if (u >= 3 && u < wW - 3 && r >= 5 && r < h - 1) return (u - 3) % 9 === 8 ? "A" : (r === 5 ? "Y" : (u % 17 < 9 ? "h" : "Y"))
        return null
      },
      roofFn: (x, y, i) => ((i.low || i.up || i.side) ? null : ((x + y) % 5 === 0 ? fam.L : fam.top)),
    })
    const m0 = { a: a0, b: b0, w, d, z: 0, h: 16 + (n - 1) * fh }
    mods.push(m0)
    wallBoards(bd, m0, 2, accent, wk, ["board", "icon"], 22)
    const [px, py] = [PXs(a0, b0 + d) + Math.round(ISO * w * 0.5), PYs(a0, b0 + d) + 3]
    pool(px, py + 3, 30, 9, "L", 0.85); pool(px, py + 3, 20, 6, "y", 0.8)
    const rb = st.roofBox
    const [x1, y1] = rb.pt(a0 + 0.2, b0 + d - 0.2), [x2, y2] = rb.pt(a0 + w - 0.2, b0 + d - 0.2)
    stringLights(x1 + 2, y1 - 8, x2 - 2, y2 - 8, 4, id)
    const [cx2, cy2] = rb.pt(a0 + w / 2, b0 + d / 2)
    planter(cx2 - 12, cy2 + 2, 8, id); spr(cx2 + 6, cy2 + 3, ["UUUUU", ".E.E."])
    if (!far) { const [wx, wy] = wallXY("L", m0, 5, 15); potRow(wx, wy + 2, 2, 7, id) }
  } else if (type === "tea") {
    // a low gabled teahouse with paper lanterns under the eaves
    const hh = clamp(Math.round(ISO * Math.min(w, d) * 0.3) + 3, 9, 17)
    const body = Math.max(14, H0 - hh)
    const n = body >= 28 ? 2 : 1, fh = Math.round((body - (n === 2 ? 16 : 0)) / (n === 2 ? 1 : 1))
    const awn = accent === "N" ? "H" : accent
    const st = stack({
      a: a0, b: b0, w, d, n, fh: 16, fhFor: (f) => (f === 0 ? 16 : 13), fam, id, trims, pw: 4, pier: 3, wcol, trimB: false, plantP: 0.5, vineP: 0.1, ins: 0.2, far,
      groundWall: (side, u, r, wW, h) => {
        if (r === 0) return side === "L" ? fam.R : "A"
        if (side === "R") return (u >= 3 && u < wW - 3 && r >= 5 && r < h - 1) ? ((u - 3) % 9 < 3 ? "w" : (u % 11 < 6 ? "h" : "y")) : null
        if (r >= 1 && r <= 3) return Math.floor(u / 3) % 2 === 0 ? awn : "W"
        if (u >= 3 && u < wW - 3 && r >= 5 && r < h - 1) return (u - 3) % 9 === 8 ? "E" : (r === 5 ? "Y" : (u % 17 < 9 ? "h" : "Y"))
        return null
      },
      roofFn: () => fam.top,
    })
    mods.push({ a: a0, b: b0, w, d, z: 0, h: st.z })
    const axis = w >= d ? "a" : "b"
    const rf = gableRoof(a0, b0, w, d, st.z, hh, axis, id)
    const [ex1, ey1] = rf.eave[0], [ex2, ey2] = rf.eave[1]
    const nL = Math.max(2, Math.round(Math.abs(ex2 - ex1) / 11))
    for (let i = 0; i <= nL; i++) { const t = (i + 0.5) / (nL + 1); lantern(Math.round(ex1 + (ex2 - ex1) * t), Math.round(ey1 + (ey2 - ey1) * t) + 1, ["z", "y", "L"][(i + id) % 3]) }
    const [px, py] = [PXs(a0, b0 + d) + Math.round(ISO * w * 0.5), PYs(a0, b0 + d) + 3]
    pool(px, py + 3, 26, 8, "L", 0.85); pool(px, py + 3, 16, 5, "y", 0.8)
    if (!far) { const [wx, wy] = wallXY("L", { a: a0, b: b0, w, d, z: 0, h: st.z }, 6, 15); potRow(wx, wy + 2, 2, 7, id + 4); const [mx, my] = wallXY("R", { a: a0, b: b0, w, d, z: 0, h: st.z }, 4, 15); fern(mx, my + 2, id) }
  } else if (type === "grid") {
    // a boxy apartment block: a grid of small pink, peach and blue windows, each with a balcony rail and a tiny plant
    const FH = 9, n = Math.max(4, Math.round(H0 / FH)), h = n * FH
    const GW = ["z", "y", "v", "z", "y", "h", "v", "z"]
    const panes = new Map()
    const gk = (side) => (u, r, wW, hh, x, y) => {
      const base = side === "L" ? fam.L : fam.R
      const rt = r - (hh - h), f = Math.floor(rt / FH), fr = rt % FH, cu = (u - 2) % 7, col = Math.floor((u - 2) / 7)
      if (r === 0) return side === "L" ? fam.top : fam.L
      if (u < 2 || u >= wW - 3 || col < 0) return base
      if (fr === 0) return side === "L" ? fam.R : "A"
      if (cu >= 0 && cu <= 3 && fr >= 1 && fr <= 5 && u < wW - 6) {
        const pk = side + f + "_" + col
        let rec = panes.get(pk)
        if (!rec) {
          const q = ih(id * 131 + col, f * 7 + (side === "L" ? 1 : 2), 17)
          rec = newWin(q < 0.8, GW[Math.floor(ih(id + col * 3, f, 5) * GW.length)], true)
          rec.v = ih(id * 17 + col, f * 5 + (side === "L" ? 3 : 4), 99)
          panes.set(pk, rec)
        }
        const on = paneAt(cu, fr - 1, 4, 5, rec.on, true, rec.v), off = paneAt(cu, fr - 1, 4, 5, rec.on, false, rec.v)
        if (on !== "A") rec.pts.push([x, y, on, off])
        return rec.lit ? on : off
      }
      if (fr === 6 && cu <= 4) return fam.top
      return base
    }
    const gr = w * d >= 4 ? gardenRoofFn(a0, b0, w, d) : null
    isoBox(a0, b0, w, d, h, 0, { L: gk("L"), R: gk("R"), T: (x, y, i) => ((i.low || i.up) ? accent : (i.side ? fam.top : ((gr && gr(x, y, i)) || (bay(x, y) < 0.15 ? fam.L : fam.top)))) })
    if (gr) gardenBeds(h, a0, b0, w, d, id * 13, far)
    const top = { a: a0, b: b0, w, d, z: 0, h }
    // a balcony plant sits on each rail
    for (const side of ["L", "R"]) {
      const wW = Math.round(ISO * (side === "L" ? w : d))
      for (let f = 0; f < n; f++) for (let col = 0; col < Math.floor((wW - 8) / 7); col++) {
        const q = ih(id * 3 + col, f * 5 + (side === "L" ? 1 : 2), 33)
        if (q > (far ? 0.4 : 0.8)) continue
        const [x, y] = wallXY(side, top, 2 + col * 7 + 2, (n - 1 - f) * FH + 6)
        put(x - 1, y - 1, "o"); put(x, y - 1, "g"); put(x + 1, y - 1, "o"); put(x, y - 2, q < 0.2 ? "7" : "g"); put(x - 1, y - 2, "O")
        if (q < 0.15) put(x + 1, y - 2, "z")
        if (q > 0.55 && !far) { put(x - 1, y + 1, "g"); put(x - 1, y + 2, "o") }
      }
    }
    mods.push(top)
    const [rx, ry] = [PXs(a0 + w / 2, b0 + d / 2), PYs(a0 + w / 2, b0 + d / 2) - h]
    if (id % 2) waterTower(rx - 6, ry + 4, id); else { TANKS(rx - 8, ry + 2, 5, 9, fam); antenna(rx + 8, ry, 12, id) }
    hedge(rx + 6, ry + 5, 9, id, { h: far ? 2.6 : 3.2 })
    wallBoards(bd, top, 1, accent, wk, ["strip", "board"], 14)
  } else if (type === "slim") {
    // a slim tower with a slanted roof, a neon edge and a cluster of antennas
    const { a: ma, b: mb, w: mw, d: md } = bd.fp
    const fh = 10, hh = 14 + (id % 4) * 3
    const n = Math.max(5, Math.round((H0 - hh) / fh))
    const st = stack({ a: ma, b: mb, w: mw, d: md, n, fh, fam, id, trims, pw: 4, pier: 2, wcol, trimAll: true, trimP: 0.25, plantP: 0.35, vineP: 0.15, far, ins: 0.12 })
    mods.push({ a: ma, b: mb, w: mw, d: md, z: 0, h: n * fh })
    const axis = id % 2 ? "a" : "b"
    slantRoof(ma, mb, mw, md, st.z, hh, fam, axis, accent)
    const [ax, ay] = axis === "b" ? P3(ma + mw / 2, mb + 0.12, st.z + hh) : P3(ma + 0.12, mb + md / 2, st.z + hh)
    antennaCluster(ax + 2, ay + 1, id)
    wallBoards(bd, mods[0], 1, accent, wk, ["strip", "icon"], 18)
  } else if (type === "dome") {
    // a low block under a glass dome: ferns, palms and a pink-white glow inside
    const rxD = Math.round(ISO * Math.min(w, d) * 0.5 * 0.92 * 1.414)
    const Dh = clamp(Math.round(rxD * 0.8), 12, Math.max(12, H0 - 14))
    const body = Math.max(14, H0 - Dh)
    const n = Math.max(1, Math.round(body / 12))
    const st = stack({ a: a0, b: b0, w, d, n, fh: 12, fam, id, trims, pw: 4, pier: 3, wcol, trimB, plantP: 0.6, vineP: 0.3, ins: 0.2, far })
    mods.push({ a: a0, b: b0, w, d, z: 0, h: st.z })
    const [cx2, cy2] = st.roofBox.pt(a0 + w / 2, b0 + d / 2)
    greenhouse(cx2, cy2, rxD, Dh, id)
  } else {
    // industrial: pipes, tanks, vents, a chimney, slit windows, moss on the ledges
    const fh = 14, n = Math.max(3, Math.round(H0 / fh))
    const st = stack({ a: a0, b: b0, w, d, n, fh, fam, id, trims, pw: 10, pier: 4, wh: 2, wy0: 5, wcol, trimB, plantP: 0.2, vineP: 0.3, litP: 0.3, far,
      roofFn: (x, y, i) => ((i.low || i.up || i.side) ? null : (((i.a * 3) % 1 < 0.1 || (i.b * 3) % 1 < 0.1) ? fam.L : null)) })
    const m0 = { a: a0, b: b0, w, d, z: 0, h: n * fh }
    mods.push(m0)
    const wL = Math.round(ISO * w), wR = Math.round(ISO * d)
    for (let k = 0; k < 2; k++) {
      const u = 6 + Math.floor(ih(id, 60 + k, 3) * Math.max(1, wL - 14))
      for (let r = 3; r < m0.h - 4; r++) { for (let t = 0; t < 3; t++) { const [x, y] = wallXY("L", m0, u + t, r); put(x, y, t === 0 ? "K" : t === 1 ? "k" : "l") } }
    }
    for (let u = 3; u < wL - 3; u++) { const [x, y] = wallXY("L", m0, u, Math.round(m0.h * 0.4)); put(x, y, "K"); const [x2, y2] = wallXY("L", m0, u, Math.round(m0.h * 0.4) + 1); put(x2, y2, "l") }
    const rb = st.roofBox
    const [cx2, cy2] = rb.pt(a0 + w / 2, b0 + d / 2)
    wallBoards(bd, m0, 1, accent, wk, ["board", "strip"], 16)
    TANKS(cx2 - 14, cy2 + 2, 7, 12, FAMS.mauve)
    waterTower(cx2 + 8, cy2 + 6, id)
    rectK(cx2 + 16, cy2 - 4, 8, 6, "t"); hlineK(cx2 + 16, cy2 - 4, 8, "S"); for (let i = 0; i < 3; i++) hlineK(cx2 + 17, cy2 - 2 + i * 2, 6, "l")
    for (let j = 0; j < 22; j++) rectK(cx2 - 2, cy2 - 6 - j, 5, 1, j % 6 < 2 ? "S" : "s")
    const tipRec = []; paintPts([[cx2, cy2 - 29, "x"], [cx2 + 1, cy2 - 29, "x"], [cx2 - 1, cy2 - 29, "4"], [cx2 + 2, cy2 - 29, "4"]], tipRec); REC.tips.push({ pts: tipRec, ph: (id * 5) % 12 })
    if (!far) { const [mx, my] = wallXY("L", m0, 10, 3); moss(mx, my, 10, id); fern(mx + 14, my, id + 1) }
  }
  haloPass()
  curLevel = 0; curDark = 0; curOwner = 0
}

// ---------------------------------------------------------------- the hero tower (its own finer grid)
let TOWER_MASK = null, TOWER_POST = null
const drawTower = () => {
  const pre = fb.slice()
  curLevel = 0; curDark = 0
  ISO = 8
  const F = FAMS
  // a stepped, wide base with plants
  stack({ a: 88.75, b: 19.75, w: 6.5, d: 6.5, n: 3, fh: 8, plate: 2, ins: 0.22, fam: F.rose, id: 9901, bright: true, trimAll: true, trims: ["H", "n"], pw: 3, pier: 1, wh: 4, wy0: 1, litP: 0.8, plantP: 0.7 })
  // the white-lit body, windows in pale rows
  stack({ a: 89.25, b: 20.25, w: 5.5, d: 5.5, z0: 24, n: 13, fh: 8, plate: 2, ins: 0.22, fam: F.terra, id: 9902, bright: true, trimAll: true, trims: ["h", "z"], pw: 3, pier: 1, wh: 4, wy0: 1, litP: 0.95, plantP: 0.55, glass: "white" })
  // a twisting stack of thick plates
  stack({ a: 89.75, b: 20.75, w: 4.5, d: 4.5, z0: 128, n: 10, fh: 9, plate: 2, ins: 0.22, fam: F.mauve, id: 9903, bright: true, trimAll: true, trims: ["h", "H"], pw: 3, pier: 1, wh: 4, wy0: 1, litP: 0.7, plantP: 0.3, twist: 3 })
  // a warm peach block with a lit crown line
  stack({ a: 90.1, b: 21.1, w: 3.8, d: 3.8, z0: 218, n: 4, fh: 10, plate: 2, ins: 0.22, fam: F.peach, id: 9904, bright: true, trimAll: true, trims: ["z", "H"], pw: 3, pier: 1, wh: 4, wy0: 1, litP: 0.85, plantP: 0.2 })
  // a dark stack with cyan and pink trims
  stack({ a: 90.3, b: 21.3, w: 3.4, d: 3.4, z0: 258, n: 12, fh: 9, plate: 2, ins: 0.22, fam: F.plum, id: 9905, bright: true, trimAll: true, trims: ["n", "H"], pw: 3, pier: 1, wh: 4, wy0: 1, litP: 0.6, trimP: 0.7, plantP: 0.15, twist: 2 })
  const st = stack({ a: 90.6, b: 21.6, w: 2.8, d: 2.8, z0: 366, n: 2, fh: 9, plate: 2, ins: 0.22, fam: F.peach, id: 9906, bright: true, trimAll: true, trims: ["n", "H"], pw: 3, pier: 1, wh: 4, wy0: 1, litP: 0.95 })
  const [cx, cy] = st.roofBox.pt(92, 23)
  // crown: an antenna with a red tip, and a small screen on a frame
  vlineK(cx + 6, cy - 16, 16, "E")
  const tip = []
  paintPts([[cx + 6, cy - 17, "x"], [cx + 5, cy - 17, "4"], [cx + 7, cy - 17, "4"]], tip)
  REC.tips.push({ pts: tip, ph: 0 })
  const x0 = cx - 18, y0 = cy - 40
  const pts = []
  for (let j = 0; j < 30; j++) for (let i = 0; i < 28; i++) {
    const yy = y0 + j + Math.floor(i / 7)
    const edge = i === 0 || i === 27 || j === 0 || j === 29
    if (edge) { put(x0 + i, yy, "A"); pts.push([x0 + i, yy]) }
    else put(x0 + i, yy, j < 3 ? "n" : (i + j) % 5 === 0 ? "W" : j > 20 ? "V" : bay(i, j) < 0.5 ? "n" : "v")
  }
  glowAround(pts, "n", 2)
  vlineK(x0 + 4, y0 + 33, 10, "E"); vlineK(x0 + 22, y0 + 38, 8, "E")
  ISO = 16
  TOWER_POST = fb.slice()
  TOWER_MASK = new Uint8Array(W * H)
  for (let i = 0; i < W * H; i++) if (TOWER_POST[i] !== pre[i]) { TOWER_MASK[i] = 1 }
  curWins = []
}

// ---------------------------------------------------------------- go: ground and streets first, then everything back to front
recordCity = true
for (let y = 150; y < H; y++) for (let x = 120; x < W; x++) {
  const u = (x + 0.5) / 16, v = (y + 0.5) / 8
  const ia = Math.floor((u + v) / 2), ib = Math.floor((v - u) / 2)
  if (!cellOK(ia, ib)) continue
  curLevel = levelFor(y); curDark = darkFor(x, y)
  const plaza = inRect(PLAZA, ia, ib)
  put(x, y, plaza ? ((((ia + ib) & 1) ? bay(x, y) < 0.85 : bay(x, y) < 0.35) ? "*" : "(") : (bay(x, y) < 0.22 ? "A" : "B"))
}
curLevel = 0; curDark = 0
// neon spill and shop light pooled on the streets
for (let a = 12; a <= 70; a++) for (let b = 0; b <= 40; b++) {
  if (!cellOK(a, b) || !isStreet(a, b)) continue
  const [cx, cy] = cellXY(a, b), q = ih(a, b, 61)
  curLevel = levelFor(cy); curDark = darkFor(cx, cy)
  if (q < 0.18) pool(cx, cy, 12, 5, "H", 0.5)
  else if (q < 0.36) pool(cx, cy, 12, 5, "n", 0.5)
  else if (q < 0.62) { pool(cx, cy, 14, 6, "L", 0.8); pool(cx, cy, 8, 3, "y", 0.7) }
}
curLevel = 0
const props = []
for (let a = 12; a <= 70; a++) for (let b = 0; b <= 40; b++) if (cellOK(a, b) && isStreet(a, b) && ih(a, b, 62) < 0.16) props.push({ t: "lamp", a, b })
// the plaza is drawn as one prop, in its own place in the back-to-front order
const order = blds.map((b) => ({ t: "b", b, k: b.a0 + b.w + b.b0 + b.d, k2: b.a0 + b.w }))
for (const p of props) order.push({ t: "lamp", p, k: p.a + p.b + 1.5, k2: p.a })
// trees, palms, bamboo and shrubs along the streets
let streetSakura = 0
for (let a = 12; a <= 70; a++) for (let b = 0; b <= 40; b++) {
  if (!cellOK(a, b) || !isStreet(a, b) || ih(a, b, 64) > 0.7) continue
  const q = ih(a, b, 65), [cx, cy] = cellXY(a, b)
  if (cy < 250) continue
  const kind = q < 0.38 ? "tree" : q < 0.56 ? "palm" : q < 0.7 ? "bamboo" : q < 0.88 ? "shrub" : "sakura"
  if (kind === "sakura" && ++streetSakura > 1) continue
  order.push({ t: "flora", kind, a, b, k: a + b + 1.5, k2: a + 0.5 })
}
order.push({ t: "T", k: 59.5, k2: 0 })
for (const br of BRIDGES) order.push({ t: "bridge", br, k: br.key, k2: 0 })
order.push({ t: "plaza", k: PLAZA.a0 + PLAZA.w + PLAZA.b0 + PLAZA.d - 0.5, k2: 0 })
order.sort((p, q) => p.k - q.k || p.k2 - q.k2)
for (const e of order) {
  if (e.t === "T") drawTower()
  else if (e.t === "lamp") { const [cx, cy] = cellXY(e.p.a, e.p.b); curLevel = levelFor(cy); curDark = darkFor(cx, cy); streetLamp(cx, cy + 6) }
  else if (e.t === "bridge") { curLevel = e.br.lvl; drawBridge(e.br) }
  else if (e.t === "flora") {
    const [cx0, cy0] = cellXY(e.a, e.b), sd = e.a * 31 + e.b * 7
    const x = cx0 + Math.round((ih(e.a, e.b, 66) - 0.5) * 14), y = cy0 + 5 + Math.round(ih(e.a, e.b, 67) * 4)
    curLevel = levelFor(cy0); curDark = darkFor(cx0, cy0)
    const wm = ih(e.a, e.b, 68) < 0.5 ? -1 : 1
    if (e.kind === "tree") streetTree(x, y, 5 + Math.floor(ih(e.a, e.b, 69) * 4), sd, { warm: wm })
    else if (e.kind === "palm") palm(x, y, 16 + Math.floor(ih(e.a, e.b, 69) * 10), sd, wm * 4)
    else if (e.kind === "bamboo") bamboo(x, y, 16 + Math.floor(ih(e.a, e.b, 69) * 8), 3 + (sd % 2), sd)
    else if (e.kind === "sakura") sakura(x, y, 7, sd, { warm: wm })
    else { hedge(x - 6, y, 12, sd, { h: 3.6, bloom: true }); fern(x + 8, y, sd); moss(x - 9, y + 1, 5, sd) }
  }
  else if (e.t === "plaza") {
    const pcx = 16 * (PLAZA.a0 + PLAZA.w / 2 - PLAZA.b0 - PLAZA.d / 2), pcy = 8 * (PLAZA.a0 + PLAZA.w / 2 + PLAZA.b0 + PLAZA.d / 2)
    curLevel = levelFor(pcy); curDark = darkFor(pcx, pcy)
    // two mottled lawns; then, back to front, bamboo, palms, a pair of blossom trees, round trees, benches, pots, ferns
    lawn(pcx - 30, pcy + 5, 30, 12, 3); lawn(pcx + 34, pcy - 2, 26, 10, 7)
    const bench = (x, y) => { spr(x, y, ["UUUUUUUU", ".E....E."]); hlineK(x - 4, y - 2, 8, "T") }
    const items = [
      [pcy - 10, () => bamboo(pcx - 70, pcy - 10, 30, 5, 5)],
      [pcy - 12, () => bamboo(pcx + 70, pcy - 12, 26, 4, 9)],
      [pcy - 14, () => streetTree(pcx + 20, pcy - 14, 8, 11, { warm: -1 })],
      [pcy - 10, () => streetTree(pcx - 22, pcy - 10, 7, 12, { warm: 1 })],
      [pcy - 4, () => palm(pcx + 6, pcy - 4, 30, 3, 6)],
      [pcy - 2, () => sakura(pcx - 52, pcy - 2, 9, 13, { warm: 1 })],
      [pcy - 4, () => sakura(pcx + 54, pcy - 4, 8, 14, { warm: -1 })],
      [pcy + 4, () => palm(pcx - 64, pcy + 6, 34, 2, -6)],
      [pcy + 6, () => palm(pcx + 62, pcy + 8, 28, 1, 6)],
      [pcy + 8, () => { hedge(pcx - 58, pcy + 8, 14, 3, { bloom: true }); hedge(pcx + 44, pcy + 8, 14, 5, { bloom: true }) }],
      [pcy + 4, () => bench(pcx + 22, pcy + 4)],
      [pcy + 14, () => { bench(pcx - 4, pcy + 14); potRow(pcx - 16, pcy + 14, 3, 6, 21) }],
      [pcy + 14, () => streetTree(pcx - 34, pcy + 18, 7, 15, { warm: 1 })],
      [pcy + 16, () => { streetTree(pcx + 40, pcy + 20, 9, 16, { warm: -1 }); fern(pcx + 30, pcy + 22, 4); moss(pcx + 24, pcy + 24, 6, 4) }],
      [pcy + 18, () => { potRow(pcx + 4, pcy + 24, 4, 7, 33); planter(pcx - 50, pcy + 26, 9, 8) }],
    ]
    items.sort((p, q) => p[0] - q[0])
    for (const it of items) it[1]()
    const posts = [[pcx - 62, pcy], [pcx, pcy - 30], [pcx + 62, pcy], [pcx, pcy + 30]]
    for (const [x, y] of posts) { vlineK(x, y - 24, 24, "E"); rectK(x - 1, y - 26, 3, 2, "h"); pool(x, y + 2, 16, 6, "L", 0.8) }
    for (let i = 0; i < 4; i++) { const [x1, y1] = posts[i], [x2, y2] = posts[(i + 1) % 4]; stringLights(x1, y1 - 22, x2, y2 - 22, 6, i) }
    curLevel = 0; curDark = 0
  } else drawBuilding(e.b)
  curLevel = 0; curDark = 0
}

// keep only the records whose pixels survived being painted over by nearer buildings
const stillAt = (x, y, k) => get(x, y) === k
REC.stars = REC.stars.filter(([x, y]) => stillAt(x, y, "F"))
for (const s of REC.signs) { s.pts = s.pts.filter(([x, y, k]) => stillAt(x, y, k)); s.glow = s.glow.filter(([x, y, k]) => stillAt(x, y, k)) }
REC.signs = REC.signs.filter((s) => s.pts.length >= 6)
for (const s of REC.trims) { s.pts = s.pts.filter(([x, y, k]) => stillAt(x, y, k)); s.glow = s.glow.filter(([x, y, k]) => stillAt(x, y, k)) }
REC.trims = REC.trims.filter((s) => s.pts.length >= 8)
for (const t of REC.tips) t.pts = t.pts.filter(([x, y, k]) => stillAt(x, y, k))
REC.tips = REC.tips.filter((t) => t.pts.length >= 1)
const WINS = [...REC.win.values()].map((r) => ({ lit: r.lit, pts: r.pts.filter(([x, y, on, off]) => stillAt(x, y, r.lit ? on : off)) })).filter((r) => r.pts.length >= 6)

// the warm glow round the hero tower, then the haze, the dark corner and the gradient on every city pixel
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x
  if (!CITY[i] || TOWER_MASK[i]) continue
  const d = Math.hypot((x - 552) / 1.25, y - 410)
  WARM[i] = Math.round(20 * 0.11 * Math.pow(clamp(1 - d / 120, 0, 1), 1.2))
}
recordCity = false
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (CITY[i]) fb[i] = IDX[FK(x, y, KEYS[fb[i]])] }
// a 1 px pink rim along the skyline against the clouds, a warm edge under it, and the last dusk light on the left sides
const LITK = new Set("LhzvyYnHMVN")
for (let y = 2; y < H; y++) for (let x = 1; x < W; x++) {
  const i = y * W + x
  if (!CITY[i] || TOWER_MASK[i]) continue
  const here = KEYS[fb[i]]
  if (!CITY[i - W]) fb[i] = IDX.Z
  else if (!CITY[i - 2 * W] && bay(x, y) < 0.6 && !LITK.has(here)) fb[i] = IDX.y
  else if (!CITY[i - 1] && bay(x, y) < 0.7 && !LITK.has(here)) fb[i] = IDX.y
  else if (!CITY[i - 2] && bay(x, y) < 0.3 && !LITK.has(here)) fb[i] = IDX.T
}
// the big dark towers on the left get a 1 px pink-violet lit edge on their left and top sides
for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
  const i = y * W + x, o = OWN[i]
  if (!CITY[i] || !LITEDGE.has(o) || TOWER_MASK[i] || LITK.has(KEYS[fb[i]])) continue
  if (OWN[i - 1] !== o || OWN[i - W] !== o) fb[i] = IDX["9"]
}

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
// the tagline: chunky cream caps (2 px strokes), a 1 px deep-purple drop shadow down and right, a faint coral glow
const TAG = []
{
  const sy = GLYPHS.taglineY
  for (const [line, yy] of [["A COZY CYBERPUNK", sy], ["CITY BUILDER", sy + 25]]) {
    const m3 = textMask(line, SMALL, 5, 7, 2, 6, 22, yy)
    const box3 = [12, yy - 8, 16 * 16 + 24, 14 + 18]
    const body = listOf(box3, (x, y, i) => (m3[i] ? [x, y] : null))
    const shadow = listOf(box3, (x, y, i) => (!m3[i] && x > 0 && y > 0 && m3[i - W - 1] ? [x, y] : null))
    const sm = new Uint8Array(W * H); for (const [x, y] of shadow) sm[y * W + x] = 1
    const all = new Uint8Array(W * H); for (const [x, y] of body) all[y * W + x] = 1; for (const [x, y] of shadow) all[y * W + x] = 1
    const out3 = outsideOf(all, box3)
    const glow = listOf(box3, (x, y, i) => (!all[i] && out3[i] >= 1 && out3[i] <= 2 ? [x, y, out3[i]] : null))
    for (const [x, y] of [...body, ...shadow]) TITLE_MASK[y * W + x] = 1
    TAG.push({ body, shadow, glow })
  }
}
const drawTagline = () => {
  for (const t of TAG) {
    for (const [x, y] of t.shadow) put(x, y, "X")
    for (const [x, y] of t.body) put(x, y, "~")
  }
}

// ---------------------------------------------------------------- what is still is now done
const BASE = fb.slice()
for (let i = 0; i < W * H; i++) if (TOWER_MASK[i] && BASE[i] !== TOWER_POST[i]) TOWER_MASK[i] = 0
// pick what moves, by position in the lists (fixed), so every run gives the same loop
const pickEvery = (list, n) => { const step = Math.max(1, Math.floor(list.length / n)); const out = []; for (let i = Math.floor(step / 2); i < list.length && out.length < n; i += step) out.push(list[i]); return out }
const lvl = (p) => DEPTH[p[1] * W + p[0]]
const MOVING_WINS = pickEvery(WINS.filter((w2) => w2.pts[0][1] > 230 && lvl(w2.pts[0]) <= 6), 22).map((w2, i) => ({ w: w2, a: (i * 7 + 3) % FRAMES, d: 6 + ((i * 5) % 10) }))
const BLINKERS = pickEvery(REC.signs.filter((s) => s.pts[0][1] > 230 && lvl(s.pts[0]) <= 9), 8).map((s, i) => ({ s, a: 3 + i * 6, d: 1 + (i % 2) }))
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
    else if (j % 2 === 0) { if (bay(u, j) < 0.7) hp(u, j, "G") }
    else hp(u, j, "n")
  }
  // a bright scan band rolls from the bottom to the top once per loop
  const jb = Math.round(-4 + (f / FRAMES) * (hh + 8))
  for (let u = 2; u < hw - 2; u++) for (let dj = -2; dj <= 2; dj++) {
    const j = jb + dj
    if (j < 2 || j >= hh - 2) continue
    if (dj === 0) hp(u, j, "W")
    else if (Math.abs(dj) === 1) hp(u, j, ";")
    else if (Math.abs(dj) === 2 && j % 2 === 0) hp(u, j, "n")
  }
  // a white corner frame
  for (const [cu, cj] of [[0, 0], [hw - 1, 0], [0, hh - 1], [hw - 1, hh - 1]]) {
    for (let k = 0; k < 9; k++) { hp(cu === 0 ? k : cu - k, cj, "W"); hp(cu, cj === 0 ? k : cj - k, "W"); hp(cu === 0 ? k : cu - k, cj + (cj === 0 ? 1 : -1), "W"); hp(cu + (cu === 0 ? 1 : -1), cj === 0 ? k : cj - k, "W") }
  }
  // a bold emblem that reads at thumbnail size: a thick ring around a leaf
  const eu = 59, ej = 28
  for (let j = -23; j <= 23; j++) for (let i = -23; i <= 23; i++) {
    const dd = Math.hypot(i, j)
    if (dd <= 21.5 && dd >= 17.5) hp(eu + i, ej + j, "W")
    else if (dd < 17.5) hp(eu + i, ej + j, dd > 16 ? "n" : (bay(eu + i, ej + j) < 0.55 ? "1" : "0"))
  }
  const ax = Math.cos(-0.7), ay = Math.sin(-0.7)
  for (let j = -15; j <= 15; j++) for (let i = -15; i <= 15; i++) {
    const p = i * ax + j * ay, q = -i * ay + j * ax
    if (Math.abs(p) > 13) continue
    const wq = 6.5 * Math.sqrt(1 - (p / 13) * (p / 13))
    if (Math.abs(q) <= wq) hp(eu + i, ej + j, Math.abs(q) < 0.8 ? "W" : q < 0 ? "N" : "n")
  }
  for (let k = 13; k <= 18; k++) hp(eu + Math.round(-k * ax), ej + Math.round(-k * ay), "W")
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
  // drawn level in profile, nose to the right, into a scratch buffer; then sheared so the nose dives toward the city
  const saved = fb
  fb = new Uint8Array(W * H).fill(255)
  const K = 1.12, X = 20, Y = 20
  const pt = (x, y) => [Math.round(X + x * K), Math.round(Y + y * K)]
  const poly = (pts, fn) => fillPoly(pts.map(([x, y]) => pt(x, y)), fn)
  // body: squared-off tail, cabin toward the back, sloped windshield, a hood that tapers and drops to the nose
  poly([[0, 8], [9, 8], [10, 2], [29, 2], [37, 8], [45, 10], [52, 13], [54, 15], [51, 17], [2, 17], [0, 16]], (x, y) => (y < pt(0, 3)[1] ? "h" : "Y"))
  poly([[0, 8], [0, 4], [5, 4], [6, 8]], () => "Y")                        // rear spoiler
  lineK(...pt(0, 4), ...pt(5, 4), "h"); lineK(...pt(0, 6), ...pt(5, 6), "E")
  poly([[11, 3.5], [28, 3.5], [35, 8], [11, 8]], (x, y) => "I")             // cabin glass
  lineK(...pt(20, 3.5), ...pt(20, 8), "Y")                                // door pillar
  lineK(...pt(13, 4.5), ...pt(18, 4.5), "n"); lineK(...pt(23, 4.5), ...pt(27, 4.5), "n")
  lineK(...pt(30, 4), ...pt(34, 7.5), "n")                                // windshield glint
  lineK(...pt(1, 9), ...pt(46, 9), "h")                                   // beltline
  lineK(...pt(2, 16), ...pt(50, 16), "E")                                 // darker belly
  lineK(...pt(2, 17), ...pt(50, 17), "I")
  // roof sign
  const [sx, sy] = pt(15, -1)
  rectK(sx, sy, 11, 4, "W"); for (let i = 1; i < 11; i += 3) put(sx + i, sy + 1, "x"); hlineK(sx, sy + 3, 11, "h")
  // tail lights on the squared-off back, headlights on the nose
  const tail = [pt(0, 10), pt(0, 13)]
  for (const [tx, ty] of tail) rectK(tx, ty, 2, 2, "x")
  const head = [pt(52, 12), pt(47, 11)]
  rectK(head[0][0], head[0][1], 3, 3, "<"); rectK(head[1][0], head[1][1], 3, 2, "<")
  const sc = fb
  fb = saved
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (sc[y * W + x] !== 255) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y) }
  const SL = 0.22, X0 = 36, Y0 = 212
  const dest = (x, y) => [X0 + x - minx, Y0 + (y - miny) + Math.floor((x - minx) * SL) + bob]
  const ph = f >> 1
  // trails start at the two tail lights and stream up and back to the left edge
  for (const [tx, ty] of tail) {
    const [lx, ly] = dest(tx, ty + 1)
    const pts = []
    for (let i = 0; i < 120 && lx - i >= 0; i++) {
      if (i > 55 && i % 3 === 0) continue
      if (i > 80 && i % 2 === 0) continue
      pts.push([lx - 1 - i, Math.round(ly - i * SL)])
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
  // hover glow under the belly, and a short soft beam ahead of the headlights
  for (let x = minx + 4; x < maxx - 4; x += 1) { const [dx, dy] = dest(x, maxy + 2); if (((x + ph) & 3) < 3) { put(dx, dy + 1, "C"); if ((x & 1) === 0) put(dx, dy + 2, "5") } }
  const [hx, hy] = dest(head[0][0] + 2, head[0][1])
  for (let i = 1; i <= 6; i++) for (let j = -1; j <= 1; j++) if (((i + j) & 1) === 0 && Math.abs(j) <= (i > 3 ? 1 : 0) + (i > 0 ? 0 : 0)) put(hx + i, hy + j + Math.round(i * SL), i > 3 ? "v" : "<")
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

const DARKER = { 6: "5", 5: "4", 4: "3", 3: "2", 2: "1", 1: "0", a: "b", b: "c", c: "d", d: "3", R: "r", r: "u", P: "p", p: "q", S: "s", s: "t", K: "k", k: "l", D: "E", E: "e", T: "U", U: "m", f: "i", i: "j", 7: "g", g: "o", o: "O", O: "8", "!": "@", B: "A" }
const CLOUDKEYS = new Set("{}|abcd")
const GLASSK = new Set("$-+=[")
const scanlines = () => {
  // a faint CRT texture: every 4th row, one pixel in four; never on clouds, the high sky, the glass domes, the billboard, windows or the title
  for (let y = 2; y < H; y += 4) {
    if (y < 120) continue
    for (let x = (y >> 2) & 3; x < W; x += 4) {
      const i = y * W + x
      if (TITLE_MASK[i]) continue
      if (x >= HOLO.x - 4 && x < HOLO.x + HOLO.w + 4 && y >= HOLO.y - 4 && y < HOLO.y + HOLO.h + HOLO.w / 3 + 4) continue
      const k = KEYS[fb[i]]
      if (CLOUDKEYS.has(k) || GLASSK.has(k)) continue
      const dk = DARKER[k]
      if (dk) fb[i] = IDX[dk]
    }
  }
}

const DRONES = [[318, 128, 12, 3, 0, "x"], [205, 262, 10, 2, 5, "n"], [405, 52, 14, 3, 9, "x"]]
const LANTERNS = [[278, 268, 3], [335, 226, 17], [420, 218, 31], [470, 206, 9], [365, 200, 40]]
const SPARKLES = [[430, 52, 3], [346, 96, 2], [456, 178, 2]]
const drawLife = (f) => {
  const t = (2 * Math.PI * f) / FRAMES
  // four-point sparkle stars that slowly swell and shrink
  SPARKLES.forEach(([x, y, sz], i) => {
    const arm = sz + (((f + i * 8) % 24) < 12 ? 1 : 0)
    put(x, y, "W")
    for (let k = 1; k <= arm; k++) { const key = k === 1 ? "W" : "F"; put(x - k, y, key); put(x + k, y, key); put(x, y - k, key); put(x, y + k, key) }
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (arm > 2) put(x + dx, y + dy, "5")
  })
  // tiny drones drift back and forth; a light on top blinks
  DRONES.forEach(([x0, y0, A, B, ph, lk], i) => {
    const x = Math.round(x0 + A * Math.sin(t + i * 2)), y = Math.round(y0 + B * Math.sin(2 * t + i))
    put(x - 1, y, "X"); put(x, y, "I"); put(x + 1, y, "X"); put(x - 2, y + 1, "I"); put(x + 2, y + 1, "I")
    if (((f + ph) % 8) < 4) put(x, y - 1, lk)
  })
  // warm sky lanterns rise a little, fading in at the bottom of the climb and out at the top
  LANTERNS.forEach(([x0, y0, off]) => {
    const p = ((f + off) % FRAMES) / FRAMES, a = Math.sin(Math.PI * p)
    const x = Math.round(x0 + 2 * Math.sin(2 * Math.PI * p)), y = Math.round(y0 - 16 * p)
    if (a > 0.3) { put(x, y, "h"); put(x - 1, y + 1, "y"); put(x, y + 1, "h"); put(x + 1, y + 1, "y"); put(x, y + 2, "L") }
    if (a > 0.55) { for (const [dx, dy] of [[-2, 1], [2, 1], [0, -1], [0, 3]]) if (((x + dx + y + dy) & 1) === 0) put(x + dx, y + dy, "L") }
  })
}

const renderFrame = (f) => {
  fb = BASE.slice()
  composeSky(f, fb)
  // windows: each of ~20 flips off (or on) at a fixed frame and flips back, like someone moving about
  for (const { w, a, d } of MOVING_WINS) {
    if (!inLoop(f, a, d)) continue
    w.pts.forEach(([x, y, on, off]) => put(x, y, FK(x, y, w.lit ? off : on)))
  }
  BLINKERS.forEach(({ s, a, d }) => { if (inLoop(f, a, d)) { setPts(s.pts, true); setPts(s.glow, true) } })
  BLINKTRIMS.forEach(({ s, a, d }) => { if (inLoop(f, a, d)) { setPts(s.pts, true); setPts(s.glow, true) } })
  if (STUTTER) {
    const on = f === 18 || f === 20 || (f >= 22 && f <= 35)
    if (!on) { setPts(STUTTER.pts, true); setPts(STUTTER.glow, true) }
  }
  REC.tips.forEach((t) => { if (((f + t.ph) % 12) >= 6) setPts(t.pts, true) })
  TWINKLERS.forEach(([x, y], i) => { if (((f + i * 7) % 16) >= 10 && fb[y * W + x] === IDX.F) put(x, y, "4") })
  drawHolo(f)
  drawLife(f)
  drawTaxi(f)
  drawTitle(f)
  drawTagline()
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
