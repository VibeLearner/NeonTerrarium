// Neon Dome bar, evening service screen. Bartender's view: we stand behind the counter and look
// across it at the guest. 2D side-on, 480x270 native, shown 4x (1080p) with nearest-neighbor.
// Light: morning haze through the big window on the left (cool, soft), warm backlight from the
// glowing top shelf, and neon accents (pink counter strip and dome sign, teal blade sign and liquid
// column, gold lanterns). Shadows lean film-green. Layout from the approved blockout (bar.px.js).
include("font5x7.px.js")

pal({
  0: "#141A16", 1: "#1C231E", 2: "#262E26", 3: "#34433C", 4: "#475A50", 5: "#5F766A", // film green
  T: "#2F6B68", t: "#4F9C96", u: "#8CCBC0", U: "#C6EDE4",                             // retro teal
  B: "#3E6BA8", b: "#5E8FD0", s: "#9DB8DC", S: "#C9D7E8", H: "#E4E9EE",               // sky, haze
  i: "#6E8BB8", j: "#8FA8CC", h: "#B2C4DC",                                            // city in haze
  g: "#A9783A", y: "#E8B060", Y: "#F6D79A",                                            // sun gold, brass
  O: "#7E3A22", o: "#B4501E", q: "#D2733A",                                            // burnt orange
  K: "#3A2218", r: "#4E2618", L: "#5A3424", M: "#7A4A30", P: "#9C6440",                // lacquered counter
  p: "#E9A08A", m: "#E6A9CF", c: "#F2E4C8", w: "#FFF6E6",                              // peach, pink, cream
  N: "#FF4FC8", n: "#FFC2EC", V: "#38E8E0", v: "#C4FFF6", G: "#FFC94A",                // neon, as on the dome outside
  D: "#283034", d: "#4A5258", l: "#B8B0FF",                                            // dome frame, nodes, glass tint
  X: "#2E3338", x: "#3E4448", Z: "#C060FF", z: "#4AD8FF",                              // drum wall, club windows
  e: "#2E3A44", E: "#56666E", f: "#93A6AC", F: "#D8E4E2",                              // steel, cool tint
})
ramps("012345", "TtuU", "KrLMP", "eEfF")

const W = 480, H = 270
const mix = (a, b, t) => {
  const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16)), pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16))
  return "#" + pa.map((v, k) => Math.round(v + (pb[k] - v) * t).toString(16).padStart(2, "0")).join("")
}
const INK = "#141A16", LITE = "#FFF6E6"

// ================================================================ bottles
// A bottle is a profile: half-widths per row from the neck down. [rows, h0, h1] tapers linearly,
// ["bulb", R] is a round body. Everyday bottles are drawn in full so the pour page can lift them
// off the rail; the rail's front plate hides their bottoms in the scene.
function bottleProfile(segs) {
  const out = []
  for (const s of segs) {
    if (s[0] === "bulb") { const R = s[1]; for (let k = 0; k < 2 * R; k++) { const d = k - R + 0.5; out.push(Math.max(1, Math.round(Math.sqrt(R * R - d * d)))) } }
    else { const [n, a, b] = s; for (let k = 0; k < n; k++) out.push(Math.round(a + (b - a) * (n > 1 ? k / (n - 1) : 0))) }
  }
  return out
}
const TOP = 13
// the speed rail: its front plate's top, and the trough floor the bottles stand in (below the screen's edge)
const RAIL_TOP = 254, BOTTLE_FLOOR = 282
// the short dashers stand on a riser at the end of the rail, the round Glow syrup on a smaller one
const lift = (ing) => (ing.dash ? 16 : ing.id === "glow" ? 8 : 0)
function drawBottle(c, spec) {
  const rows = bottleProfile(spec.segs), n = rows.length, mh = Math.max(...rows), cx = mh + 4
  const level = Math.round(n * (1 - spec.fill))
  const glassE = mix(spec.glass, "#1C231E", 0.55)
  rows.forEach((hw, k) => {
    const y = TOP + k
    for (let x = cx - hw; x <= cx + hw; x++) {
      const edge = x === cx - hw || x === cx + hw
      const wet = k >= level
      let col = wet ? spec.liquid : glassE
      const u = (x - (cx - hw)) / Math.max(1, 2 * hw)
      if (u > 0.66) col = mix(col, INK, 0.3)
      if (wet && k === level && !edge) col = mix(spec.liquid, LITE, 0.35)
      if (edge) col = mix(wet ? spec.liquid : spec.glass, INK, 0.5)
      if (k === n - 1) col = mix(col, INK, 0.35)
      c.px(x, y, col)
    }
  })
  // label band
  if (spec.label) {
    const [up, lh, lc, mk] = spec.label
    for (let k = n - up - lh; k < n - up; k++) {
      const hw = rows[k]
      for (let x = cx - hw + 1; x <= cx + hw - 1; x++) {
        const u = (x - (cx - hw)) / Math.max(1, 2 * hw)
        c.px(x, TOP + k, u > 0.66 ? mix(lc, INK, 0.3) : k === n - up - lh ? mix(lc, LITE, 0.3) : lc)
      }
    }
    if (mk) { const ky = TOP + n - up - Math.ceil(lh / 2); c.rect(cx - 1, ky - 1, 3, 3, mk); c.px(cx + 1, ky + 1, mix(mk, INK, 0.3)); c.hline(cx - 3, ky + 3, 7, mix(lc, INK, 0.3)) }
  }
  // shine: a long highlight on the lit side, a smaller dim one low on the other
  rows.forEach((hw, k) => {
    if (hw >= 3 && k > 1 && k < n - 3 && rows[k - 2] >= 3) c.px(cx - hw + 1, TOP + k, mix(k >= level ? spec.liquid : spec.glass, LITE, 0.55))
    if (hw >= 4 && k >= n - 9 && k < n - 5) c.px(cx + hw - 2, TOP + k, mix(k >= level ? spec.liquid : spec.glass, LITE, 0.3))
  })
  // top: pour spout, screw cap, crown cap or dasher
  const y0 = TOP
  if (spec.top === "spout") {
    // a rubber collar and a steel pour spout angled up and away
    c.rect(cx - 2, y0 - 3, 5, 3, "#2B2B2B"); c.hline(cx - 2, y0 - 3, 5, "#4A4A4A")
    for (let i = 0; i < 10; i++) { const x = cx + Math.floor(i / 3), y = y0 - 4 - i; c.px(x, y, "F"); c.px(x + 1, y, "E") }
    c.px(cx + 3, y0 - 13, "F")
  } else if (spec.top === "cap") {
    c.rect(cx - 3, y0 - 5, 7, 5, spec.cap); c.hline(cx - 3, y0 - 5, 7, mix(spec.cap, LITE, 0.4)); c.vline(cx - 3, y0 - 5, 5, mix(spec.cap, LITE, 0.4))
    c.vline(cx + 3, y0 - 5, 5, mix(spec.cap, INK, 0.35)); for (let x = cx - 2; x <= cx + 2; x += 2) c.vline(x, y0 - 3, 3, mix(spec.cap, INK, 0.2))
  } else if (spec.top === "crown") {
    c.rect(cx - 3, y0 - 3, 7, 3, spec.cap); for (let x = cx - 3; x <= cx + 3; x += 2) c.px(x, y0 - 1, mix(spec.cap, INK, 0.4))
    c.hline(cx - 2, y0 - 3, 4, mix(spec.cap, LITE, 0.5))
  } else if (spec.top === "dasher") {
    c.vline(cx, y0 - 8, 3, "f"); c.px(cx, y0 - 8, "F"); c.rect(cx - 2, y0 - 5, 5, 2, "F"); c.rect(cx - 3, y0 - 3, 7, 3, "f")
    c.vline(cx - 3, y0 - 3, 3, "F"); c.vline(cx + 3, y0 - 3, 3, "E")
  }
}

// The 13 starter ingredients. liquid is the color the pour page mixes with.
const INGREDIENTS = [
  { id: "rice", name: "Clear Grid rice spirit", tag: "RCE", liquid: "#D6ECEC", glass: "#BFE3E6", fill: 0.78, top: "spout",
    segs: [[4, 1, 1], [3, 1, 4], [34, 4, 4]], label: [22, 9, "#F2E4C8", "#4F9C96"] },
  { id: "rye", name: "Ashline smoked rye", tag: "RYE", liquid: "#B8682A", glass: "#C98A4C", fill: 0.8, top: "spout",
    segs: [[4, 2, 2], [2, 2, 7], [30, 7, 7]], label: [21, 10, "#262E26", "#E8B060"] },
  { id: "rum", name: "Neon Cane rum", tag: "RUM", liquid: "#D99A3A", glass: "#E2B266", fill: 0.72, top: "spout",
    segs: [[4, 1, 1], [4, 1, 5], [28, 5, 5]], label: [21, 9, "#4F9C96", "#FF5FB4"] },
  { id: "coffee", name: "Night Shift coffee liqueur", tag: "COF", liquid: "#3B2418", glass: "#4A3020", fill: 0.85, top: "spout",
    segs: [[4, 2, 2], [3, 2, 4], [3, 4, 6], [26, 6, 6]], label: [20, 9, "#E8B060", "#3B2418"] },
  { id: "yuzu", name: "Yuzu juice", tag: "YUZ", liquid: "#F0DC72", glass: "#F4E9A8", fill: 0.7, top: "cap", cap: "#F2E4C8",
    segs: [[3, 2, 2], [4, 2, 5], [30, 5, 5]], label: [19, 7, "#F2E4C8", "#E8B060"] },
  { id: "ume", name: "Ume ferment", tag: "UME", liquid: "#C2577E", glass: "#B85C7E", fill: 0.66, top: "spout",
    segs: [[6, 1, 1], [4, 1, 5], [27, 5, 5]], label: [20, 8, "#F2E4C8", "#C2577E"] },
  { id: "lemongrass", name: "Lemongrass cordial", tag: "LEM", liquid: "#B6D684", glass: "#CFE3A8", fill: 0.62, top: "spout",
    segs: [[5, 2, 2], [1, 2, 6], [30, 6, 6]], label: [20, 11, "#2F6B68", "#B6D684"] },
  { id: "glow", name: "Glow syrup", tag: "GLO", liquid: "#FF8AD0", glass: "#FFB8E2", fill: 0.7, top: "spout",
    segs: [[8, 1, 1], [2, 1, 2], ["bulb", 8], [3, 6, 6]], label: null },
  { id: "ginger", name: "Ginger fire", tag: "GIN", liquid: "#E8782C", glass: "#EE9A5A", fill: 0.75, top: "crown", cap: "#B4501E",
    segs: [[4, 2, 2], [3, 2, 6], [24, 6, 6]], label: [19, 9, "#F2E4C8", "#B4501E"] },
  { id: "shiso", name: "Shiso tonic", tag: "SHI", liquid: "#B9A2E0", glass: "#CDBDEA", fill: 0.82, top: "crown", cap: "#4F9C96",
    segs: [[3, 1, 1], [5, 1, 4], [2, 4, 3], [4, 3, 4], [20, 4, 4]], label: [20, 7, "#E6A9CF", "#4F9C96"] },
  { id: "soda", name: "Soda water", tag: "SOD", liquid: "#CFE6F0", glass: "#B8DCEC", fill: 0.85, top: "crown", cap: "#5E8FD0",
    segs: [[3, 1, 1], [4, 1, 4], [30, 4, 4]], label: [22, 7, "#5E8FD0", "#F2E4C8"] },
  { id: "bitters", name: "Static bitters", tag: "BIT", liquid: "#7A2A2A", glass: "#5C3A2A", fill: 0.6, top: "dasher", dash: true,
    segs: [[3, 1, 1], [2, 1, 4], [20, 4, 4]], label: [17, 12, "#F2E4C8", "#7A2A2A"] },
  { id: "chili", name: "Chili tincture", tag: "CHI", liquid: "#D23A2A", glass: "#E06A50", fill: 0.7, top: "dasher", dash: true,
    segs: [[4, 1, 1], [1, 1, 3], ["bulb", 6], [2, 5, 5]], label: null },
]
// The bottles are the thing the player handles most, so they're big: 1.8x the profiles above, about twice the
// glass's height as real bottles are (and nearer to us than it). The rail plate hides their lower bodies.
// Interactive scale: everything the player picks up shares one size class, a little larger than life. The game
// also runs on phones, where these 480 px span about 800 points, so a 44-point finger target is about 24 px:
// no bottle body is narrower than 21 px (23 with its outline). Heights stay true (1.8x the profiles); widths get
// the extra, so the bottles read chunky and grabbable rather than tall.
const BS = 1.8, BSW = 2.4, MIN_HALF = 10
const scaleSegs = (segs) => {
  const widest = Math.max(...segs.map((sg) => sg[0] === "bulb" ? sg[1] : Math.max(sg[1], sg[2])))
  const fw = Math.max(BSW, MIN_HALF / widest)
  return segs.map((sg) => sg[0] === "bulb" ? ["bulb", Math.max(MIN_HALF, Math.round(sg[1] * 2))] : [Math.round(sg[0] * BS), Math.max(1, Math.round(sg[1] * fw)), Math.max(1, Math.round(sg[2] * fw))])
}
for (const ing of INGREDIENTS) {
  const segs = scaleSegs(ing.segs), rows = bottleProfile(segs), n = rows.length, mh = Math.max(...rows)
  let label = null
  if (ing.label) {
    const hidden = BOTTLE_FLOOR - RAIL_TOP - lift(ing), up = hidden + 3
    const lh = Math.max(8, Math.min(Math.round(ing.label[1] * 1.6), Math.floor(n * 0.62) - up))
    label = [up, lh, ing.label[2], ing.label[3]]
  }
  ing.big = { ...ing, segs, label }
  sprite("bottle_" + ing.id, { w: 2 * mh + 9, h: TOP + n, pivot: "bottom", outline: "0" }, (c) => drawBottle(c, ing.big))
  // hovered: a gold ring round the dark outline, the look the pour page uses for "you can pick this up"
  sprite("bottle_" + ing.id + "_hover", { base: "bottle_" + ing.id, outline: "G" })
}

// ================================================================ small props, pixel by pixel
sprite("lantern", { pivot: [4, 0] }, `
  ...222...
  .oqyyyqo.
  oqyYYYyqo
  OoqyyyqoO
  oqyYwYyqo
  oqyYwYyqo
  OoqyyyqoO
  oqyYYYyqo
  .oqyyyqo.
  ...222...
  ....q....
  ....o....`)

sprite("mushroom_lamp", { pivot: "bottom" }, `
  ...pppp...
  .pcwwwcpp.
  pcwwwwwcpp
  OppppppppO
  ....yg....
  ....yg....
  ....yg....
  ..ggggggg.`)

sprite("sill_plant", { pivot: "bottom" }, `
  ...u.....t..
  ..ut5..utt..
  .t5t..ut5t5.
  ..5tutt55...
  5..ttt5..5..
  t5.oqqqo.t5.
  ...oqqoO..t.
  ...OooOO..5.
  ....OOO.....`)

// ================================================================ inside the dome (matches js/mega.js buildNeonDome)
// The bar stands on the gallery ring round the top of the drum. Behind the guest: the gallery's neon rail
// (cyan and pink by turns), the drop to the dance floor below, the far side of the drum with its band of
// purple and cyan windows, the far gallery and its rail, and over it all the geodesic dome: triangular glass
// panes on a dark frame, two rings and a zigzag of its struts in neon, the morning city through the glass.
const HORIZON = 110
// the dome's rings as seen from the gallery: [y at the middle, how much higher at the screen's edges,
// spacing of its nodes]. Higher rings are closer overhead, so their struts are further apart.
const RINGS = [[116, -10, 52], [78, 14, 60], [42, 28, 72], [8, 46, 88], [-28, 70, 110]]
function ringPts(k) {
  const [Y, Bw, d] = RINGS[k], off = k % 2 ? 0.5 : 0, out = []
  for (let i = -8; i <= 8; i++) {
    const u = i + off, x = Math.round(240 + d * u * (1 + 0.05 * Math.abs(u))), sx = (x - 240) / 240
    out.push([x, Math.round(Y - Bw * sx * sx)])
  }
  return out
}
// struts and panes: each ring zipped to the next by x, as the game zips its rings by angle
function lattice() {
  const edges = [], tris = []
  for (let k = 0; k < RINGS.length; k++) {
    const A = ringPts(k)
    for (let i = 0; i < A.length - 1; i++) edges.push({ a: A[i], b: A[i + 1], k, kind: "ring" })
    if (k === RINGS.length - 1) break
    const B = ringPts(k + 1)
    let i = 0, j = 0
    while (B[j + 1] && B[j + 1][0] < A[0][0]) j++
    edges.push({ a: A[0], b: B[j], k, kind: "zig" })
    while (i < A.length - 1 || j < B.length - 1) {
      const goA = j >= B.length - 1 || (i < A.length - 1 && A[i + 1][0] < B[j + 1][0])
      if (goA) { tris.push([A[i], B[j], A[i + 1]]); i++ } else { tris.push([A[i], B[j], B[j + 1]]); j++ }
      edges.push({ a: A[i], b: B[j], k, kind: "zig" })
    }
  }
  return { edges, tris }
}
const LAT = lattice()
// which struts are neon (the game's style 0): rings 1 and 3, the zigzag between rings 2 and 3; pink on the
// left of the dome, cyan on the right
const neonOf = (e) => {
  const lit = (e.kind === "ring" && (e.k === 1 || e.k === 3)) || (e.kind === "zig" && e.k === 2)
  return lit ? ((e.a[0] + e.b[0]) / 2 < 240 ? "N" : "V") : null
}
function skyThroughGlass(c) {
  const tones = ["B", "b", "b", "s", "s", "S", "H"]
  for (let y = 0; y < HORIZON + 4; y++) for (let x = 0; x < W; x++) {
    // whole rows step between tones (no checkerboard): the next tone comes in by rows at shrinking gaps
    const v = Math.max(0, y + 20) / (HORIZON + 30) * (tones.length - 1), f = v - Math.floor(v)
    const next = f > [0.8, 0.6, 0.9, 0.7][y % 4]
    c.px(x, y, tones[Math.min(tones.length - 1, Math.floor(v) + (next ? 1 : 0))])
  }
  // the low morning sun, off to the left
  for (let yy = -10; yy <= 10; yy++) for (let xx = -10; xx <= 10; xx++) {
    const d = Math.hypot(xx, yy), px = 96 + xx, py = 70 + yy
    if (d <= 5) c.px(px, py, "w"); else if (d <= 7) c.px(px, py, "Y"); else if (d <= 10 && (px + py) % 2) c.px(px, py, "H")
  }
}
function cityThroughGlass(c) {
  const r = c.rng(7)
  const band = (top, var_, col, lit, step) => {
    for (let x = -4; x < W;) {
      const bw = step[0] + Math.floor(r() * step[1]), t = top + Math.floor(r() * var_)
      c.rect(x, t, bw, HORIZON + 6 - t, col)
      if (r() < 0.35 && bw > 6) c.vline(x + 2, t - 5, 5, col)
      if (lit) for (let yy = t + 3; yy < HORIZON + 4; yy += 3) for (let xx = x + 1; xx < x + bw - 1; xx += 2) if (r() < 0.1) c.px(xx, yy, lit)
      x += bw + (r() < 0.3 ? 1 : 0)
    }
  }
  band(74, 16, "h", null, [10, 14])
  band(84, 12, "j", "S", [8, 12])
  band(94, 10, "i", "Y", [7, 10])
}
function panes(c) {
  // each pane of glass catches the light a little differently: a lavender tint, a pale sheen, or clear
  LAT.tris.forEach((t, k) => {
    const h = (k * 2654435761 >>> 0) % 7
    if (h < 3) c.poly(t.flat(), "l"); else if (h === 3) c.poly(t.flat(), "w")
  })
}
function struts(c) {
  for (const e of LAT.edges) {
    const near = Math.min(e.a[1], e.b[1]) < 30
    c.line(e.a[0], e.a[1], e.b[0], e.b[1], "D")
    if (near) c.line(e.a[0], e.a[1] + 1, e.b[0], e.b[1] + 1, "D")
  }
  for (const e of LAT.edges) { const n = neonOf(e); if (n) c.line(e.a[0], e.a[1] + 1, e.b[0], e.b[1] + 1, n) }
  for (let k = 0; k < RINGS.length; k++) for (const [x, y] of ringPts(k)) {
    const r = y < 30 ? 2 : 1
    c.rect(x - r, y - r + 1, 2 * r, 2 * r, "d"); c.px(x - r, y - r + 1, "f")
  }
}
// the far side: the far gallery and its rail on top of the drum, the drum's band of windows below it. Below eye
// level a round room's far wall comes nearer toward the sides, so it bends down there; the near rail, the
// inside edge of our own gallery, goes away toward the sides, so it bends up. Between them, the drop to the floor.
const bow = (x, B) => Math.round(B * ((x - 240) / 240) ** 2)
const farY = (x) => 116 + bow(x, 10), railY = (x) => 172 - bow(x, 8)
function farSide(c) {
  for (let x = 0; x < W; x++) {
    const y0 = farY(x)
    if (x % 6 === 0) c.vline(x, y0 - 4, 4, "D")
    c.px(x, y0 - 4, "d")
    c.px(x, y0, "f"); c.px(x, y0 + 1, "x"); c.px(x, y0 + 2, "x"); c.px(x, y0 + 3, "N")
    c.vline(x, y0 + 4, 15, "X"); c.px(x, y0 + 19, "1")
    const k = Math.floor((x - 4) / 22), inWin = (x - 4) % 22 < 14
    if (inWin) { c.px(x, y0 + 8, k % 3 ? "m" : "v"); c.vline(x, y0 + 9, 4, k % 3 ? "Z" : "z") }
  }
}
// the dance floor down below: dark tiles, a very few lit (it's morning: the club is idling)
function danceFloor(c) {
  for (let x = 0; x < W; x++) {
    const top = farY(x) + 20, bot = railY(x)
    for (let y = top; y < bot; y++) {
      const tx = Math.floor(x / 6), ty = Math.floor((y - top) / 3), h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0
      const edge = x % 6 === 0 || (y - top) % 3 === 2
      c.px(x, y, edge ? "0" : h % 41 === 0 ? ["N", "V", "Z"][h % 3] : "1")
    }
  }
}
function nearRail(c) {
  // our gallery's rail behind the guest: dark steel, no neon (the neon stays on the dome and the windows)
  for (let x = 0; x < W; x++) {
    const y = railY(x)
    if (x % 10 === 2) c.vline(x, y, 6, "D")
    c.px(x, y, "d"); c.px(x, y + 1, "D")
    c.px(x, y + 6, "x"); c.vline(x, y + 7, CT - 4 - y - 7, "1"); c.px(x, y + 7, "0")
  }
}
// the light rig hanging under the top of the dome: a truss, spot cans, the mirror ball on a rod
function lightRig(c) {
  c.hline(120, 2, 310, "D"); c.hline(120, 7, 310, "D")
  for (let x = 120; x < 430; x += 6) { c.line(x, 2, x + 3, 7, "D"); c.line(x + 3, 7, x + 6, 2, "D") }
  for (const x of [150, 214, 300, 390]) { c.rect(x - 2, 8, 5, 4, "e"); c.hline(x - 1, 12, 3, "F") }
  c.vline(196, 8, 64, "D")
}
sprite("mirror_ball", { w: 15, h: 15, pivot: "center" }, (c) => {
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    if (x * x + y * y > 50) continue
    const lit = x + y < -2, tile = (Math.floor((x + 8) / 2) + Math.floor((y + 8) / 2)) % 2
    c.px(x + 7, y + 7, lit ? (tile ? "F" : "f") : (tile ? "E" : "e"))
  }
  c.px(4, 4, "w"); c.px(3, 5, "w"); c.px(9, 3, "U"); c.px(5, 9, "m")
})

// ================================================================ top shelf and the guest
// The top shelf hangs on brass rods over our side of the bar, above the speed rail, close to us: wide, at the top
// of the screen, its bottles bigger than the guest's things. We look up at it a little, so its underside shows.
const SHELF = { x: -4, y: 0, w: 488, h: 30 }
function shelfBack(c) {
  const { x, y, w, h } = SHELF
  // glowing back panel behind the bottles: hottest in the middle
  for (let yy = y; yy < y + h; yy++) for (let xx = 0; xx < W; xx++) {
    const d = Math.hypot((xx - 240) / 260, (yy - 18) / 26)
    c.px(xx, yy, d < 0.3 ? "w" : d < 0.55 ? "Y" : d < 0.75 ? ((xx + yy) % 2 ? "Y" : "p") : d < 0.92 ? "p" : "m")
  }
}
function shelfBoard(c) {
  // The shelf is above our eye level, so we see under it: the front lip, then the underside going back and
  // DOWN toward eye level (above the eye, further away sits lower). Its slats run back toward the vanishing
  // point, so they lean in toward the middle. The light strip runs along the back edge, shining down.
  const lip = SHELF.y + SHELF.h, under = lip + 9, back = under + 18
  c.rect(0, lip, W, 9, "y"); c.hline(0, lip, W, "Y"); c.hline(0, lip + 8, W, "g")
  for (let y = under; y < back; y++) c.hline(0, y, W, y < under + 3 ? "0" : y < under + 7 ? "K" : y < under + 12 ? "r" : y < under + 16 ? "O" : "o")
  const at = (xn, y) => Math.round(VPX + (xn - VPX) * (VPY - y) / (VPY - under))
  for (let xn = VPX - 16 * 32; xn <= VPX + 16 * 32; xn += 32) {
    for (let y = under; y < back; y++) { const x = at(xn, y); c.px(x, y, "K"); c.px(x + (xn < VPX ? 1 : -1), y, y > under + 10 ? "q" : y > under + 4 ? "M" : "r") }
  }
  c.hline(0, back, W, "g"); c.hline(0, back + 1, W, "N"); c.hline(0, back + 2, W, "n")
  // DRINKS, as on the pylon outside, set into the middle of the lip
  c.rect(218, lip, 44, 9, "1"); c.rect(219, lip + 1, 42, 7, "0")
  c.text(240, lip + 1, "DRINKS", "V", { font: "5x7", align: "c" })
}
// backlit top-shelf bottles, as big as the rail's (they're as close to us), cut off by the top of the frame:
// dark bodies, rims in each spirit's color, a dim label; empty slots softly lit
const SB = 1.8
// Top-shelf bottles are lit from BEHIND by the glowing panel, so they read like stained glass: the light comes
// through the liquid, brightest down the middle and darkening toward the edges where the glass is thickest, with a
// thin bright line right at the silhouette where light bends round it. Labels are paper: they block the light and
// read dark. The shelf is above our eye level, so we see these bottles from below: every ring round them (label
// edges, the liquid's surface) bows UP in the middle, the opposite of the bottles and glasses down on the counter.
const SHELF_BOTTLES = [
  { segs: [[6, 1, 1], [3, 1, 4], [30, 4, 4]], liquid: "#D9952E", fill: 0.62, label: "#3A2218" },                 // amber whisky
  { segs: [[3, 2, 2], [2, 2, 7], [30, 7, 7]], liquid: "#B4501E", fill: 0.8, label: "#F2E4C8" },                  // dark rum, squat
  null,
  { segs: [[8, 1, 1], [3, 1, 4], [30, 4, 5]], liquid: "#6FD8C8", fill: 0.5, label: "#262E26" },                  // botanical gin
  { segs: [[4, 1, 1], [4, 1, 5], [30, 5, 5]], liquid: "#FF5FB4", fill: 0.72, label: "#1C231E" },                 // neon liqueur
  { segs: [[3, 1, 1], ["bulb", 9], [1, 6, 6]], liquid: "#E6A9CF", fill: 0.55, label: null },                      // round cordial
  null,
  { segs: [[5, 2, 2], [1, 2, 6], [30, 6, 6]], liquid: "#5E8FD0", fill: 0.68, label: "#F2E4C8" },                 // blue curacao-ish
  { segs: [[7, 1, 1], [2, 1, 4], [30, 4, 4]], liquid: "#F2E4C8", fill: 0.45, label: "#4F9C96" },                 // clear sake
  null,
]
function shelfBottles(c) {
  const base = SHELF.y + SHELF.h, slot = W / SHELF_BOTTLES.length
  SHELF_BOTTLES.forEach((b, k) => {
    const cx = Math.round(slot * k + slot / 2)
    if (!b) {
      // empty slot: a dashed outline running up out of frame, a small plus, waiting for an upgrade
      for (let yy = 0; yy < base; yy++) if (yy % 2) { c.px(cx - 11, yy, "g"); c.px(cx + 11, yy, "g") }
      c.hline(cx - 3, base - 14, 7, "g"); c.vline(cx, base - 17, 7, "g")
      return
    }
    const segs = b.segs.map((sg) => sg[0] === "bulb" ? ["bulb", Math.round(sg[1] * SB)] : [Math.round(sg[0] * SB), Math.round(sg[1] * SB), Math.round(sg[2] * SB)])
    const rows = bottleProfile(segs), n = rows.length, top = base - n, level = Math.round(n * (1 - b.fill))
    // a ring round the bottle seen from below: its middle is nearer, so higher on screen (bows up)
    const bowUp = (hw, x, amt) => Math.round(amt * (1 - ((x - cx) / Math.max(1, hw)) ** 2))
    const labTop = n - 17, labBot = n - 7
    rows.forEach((hw, j) => {
      const y = top + j
      if (y < 0) return
      for (let x = cx - hw; x <= cx + hw; x++) {
        const d = Math.abs(x - cx) / Math.max(1, hw)                       // 0 in the middle, 1 at the edge
        const bw = bowUp(hw, x, Math.max(1, Math.round(hw * 0.17)))
        const wet = j + bw >= level
        const onLabel = b.label && j + bw >= labTop && j + bw < labBot
        let col
        if (x === cx - hw || x === cx + hw) col = mix(b.liquid, LITE, 0.5)             // light bending round the silhouette
        else if (d > 0.78) col = mix(b.liquid, INK, 0.82)                               // thick glass at the edges
        else if (onLabel) col = j + bw === labTop ? mix(b.label, LITE, 0.35) : mix(mix(b.label, b.liquid, 0.25), INK, 0.15 + 0.45 * d)
        else if (wet) col = mix(mix(b.liquid, INK, d * d * 0.85), LITE, Math.max(0, 0.45 * (1 - d * 1.6)))   // glowing core
        else col = mix(mix(b.liquid, INK, 0.55 + d * 0.3), LITE, Math.max(0, 0.15 * (1 - d * 2)))            // air in the bottle
        if (wet && j + bw === level && d < 0.78) col = mix(b.liquid, LITE, 0.7)          // the liquid's surface, seen from below
        c.px(x, y, col)
      }
    })
    // a label mark in the liquid's color, and the shine of the room's light down the left side
    if (b.label) { const my = top + n - 12 - Math.round(rows[n - 12] * 0.17); c.rect(cx - 1, my, 3, 2, mix(b.liquid, LITE, 0.2)) }
    for (let j = Math.max(0, -top); j < n - 3; j++) if (rows[j] >= 4 && (j < labTop - 1 || j >= labBot + 1 || !b.label)) c.px(cx - rows[j] + 2, top + j, mix(b.liquid, LITE, 0.75))
    c.hline(cx - rows[n - 1], base - 1, 2 * rows[n - 1] + 1, "0")
  })
}
// the guest: one backlit silhouette at true scale. Sitting just across the bar, their head is about 3/4 the glass's
// height and their eyes are at our eye level; behind them is the bright dome glass, so they read dark against it.
// Lit from the sun through the glass (top and left, warm) and faintly from the cyan bar strip (right, low).
const GS = 2.2, GUEST_W = Math.ceil(48 * GS), GUEST_H = Math.ceil(68 * GS)
// distance from point (u, v) to the segment a-b, for limbs drawn as capsules
const segDist = (u, v, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(u - ax - t * dx, v - ay - t * dy) }
function guestMask() {
  const m = Array.from({ length: GUEST_H }, () => Array(GUEST_W).fill(0)), c0 = 24
  for (let y = 0; y < GUEST_H; y++) for (let x = 0; x < GUEST_W; x++) {
    const u = x / GS, v = y / GS, du = Math.abs(u - c0)
    let on = ((u - c0) / 6.4) ** 2 + ((v - 9) / 7.6) ** 2 <= 1           // head
      || Math.hypot(u - (c0 + 4.8), v - 2.6) <= 3.4                      // a loose bun
      || (v >= 14 && v < 21 && du <= 2.8)                                 // neck
    // trapezius: a soft slope from the neck out to the shoulders, then rounded shoulders
    if (v >= 17 && v < 27) { const t = Math.min(1, (v - 17) / 7); on = on || du <= 3 + 11.5 * (1 - (1 - t) ** 2) }
    on = on || Math.hypot(du - 14.5, v - 26) <= 4.6
    if (v >= 24 && du <= 14.5 - Math.max(0, v - 30) * 0.06) on = true    // torso, a jacket
    on = on || segDist(du, v, 15, 26, 18.5, 46) <= 4.4                   // upper arms down to the elbows on the bar
    if (v >= 16.5 && v < 23 && Math.abs(du - 5.2) < 0.9) on = true        // turned-up collar
    if (on) m[y][x] = 1
  }
  return m
}
sprite("guest", { w: GUEST_W, h: GUEST_H, pivot: "bottom" }, (c) => {
  const m = guestMask(), at = (x, y) => (x >= 0 && y >= 0 && x < GUEST_W && y < GUEST_H ? m[y][x] : 0), mid = GUEST_W / 2
  for (let y = 0; y < GUEST_H; y++) for (let x = 0; x < GUEST_W; x++) {
    if (!at(x, y)) continue
    let k = "0"
    if (!at(x, y - 1)) k = y < 60 ? "Y" : "p"                                    // the sun on the top edges
    else if (!at(x, y - 2) || (!at(x - 1, y - 2) && x < mid)) k = y < 60 ? "y" : "g"
    else if (!at(x - 1, y) && x < mid && y < 110) k = (y % 3) ? "p" : "g"         // warm rim on the sunlit left side
    else if (!at(x + 1, y) && x > mid && y > 40 && y < 130) k = "T"               // a cool edge on the right
    else if (!at(x - 2, y) && x < mid && y < 90) k = "2"
    c.px(x, y, k)
  }
  // a few folds in the jacket, picked out by the light coming round it
  const fold = (x0, y0, x1, y1) => c.line(Math.round(x0 * GS), Math.round(y0 * GS), Math.round(x1 * GS), Math.round(y1 * GS), "1")
  fold(17, 31, 18, 46); fold(31, 31, 30, 46); fold(24, 23, 24, 46); fold(9.5, 30, 11, 40); fold(38.5, 30, 37, 40)
})

// the guest's forearms resting on the counter, toward us, hands loosely together near the middle
const GX = 334
// the guest's hands, two loose fists side by side on the counter: their tops catch the dome's light, their
// undersides sink into shadow, knuckles picked out, a seam between them
sprite("guest_hands", { w: 34, h: 12, pivot: "center" }, (c) => {
  const fist = (x, y, cx) => ((x - cx) / 9.5) ** 2 + ((y - 6) / 5.6) ** 2 <= 1
  for (let y = 0; y < 12; y++) for (let x = 0; x < 34; x++) {
    const l = fist(x, y, 11), r = fist(x, y, 23)
    if (!l && !r) continue
    const top = !(fist(x, y - 1, 11) || fist(x, y - 1, 23))
    c.px(x, y, top ? (x < 17 ? "p" : "g") : y < 4 ? "4" : y < 7 ? "3" : y < 9 ? "2" : "0")
  }
  for (const x of [6, 9, 12, 15, 19, 22, 25, 28]) c.px(x, 4, "5")
  c.vline(17, 5, 6, "0")
})
function guestArms(c) {
  // each forearm comes toward us from the elbow at the far edge to the wrist, widening as it nears; its top lit,
  // its underside dark, a lighter cuff at the wrist where the jacket sleeve ends
  for (const sgn of [-1, 1]) {
    const ex = GX + sgn * 17.5 * GS, ey = CT - 1, wx = GX + sgn * 15, wy = CT + 5
    for (let y = ey - 6; y <= wy + 7; y++) for (let x = Math.min(ex, wx) - 8; x <= Math.max(ex, wx) + 8; x++) {
      const dx = wx - ex, dy = wy - ey, t = Math.max(0, Math.min(1, ((x - ex) * dx + (y - ey) * dy) / (dx * dx + dy * dy)))
      const d = Math.hypot(x - ex - t * dx, y - ey - t * dy), r = 4 + 1.8 * t
      if (d > r) continue
      const above = (y - 1 - ey - t * dy)
      const top = Math.hypot(x - ex - t * dx, y - 1 - ey - t * dy) > r
      c.px(x, y, top ? (sgn < 0 ? "p" : "g") : (y - (ey + t * dy)) < -1 ? "3" : (y - (ey + t * dy)) < 2 ? "2" : "0")
    }
    // the cuff
    c.line(Math.round(wx + sgn * 5), wy - 4, Math.round(wx + sgn * 2), wy + 5, "4")
  }
}
// ================================================================ the player's side of the counter
const CT = 186, NEAR = 230
// The counter top is a flat surface seen from above at a slant: boards run away from us toward the guest and
// narrow with distance, meeting at a vanishing point at eye level. proj() takes a board's x where it meets our
// edge and gives its x at row y.
const VPX = 240, VPY = 100   // eye level: the one vanishing point the whole scene shares
const proj = (xn, y) => VPX + (xn - VPX) * (y - VPY) / (NEAR - VPY)
const unproj = (x, y) => VPX + (x - VPX) * (NEAR - VPY) / (y - VPY)
const BOARD = 64, WOOD = ["K", "r", "L", "M", "P"]
function counterTop(c) {
  // depth: the far end catches the light from the dome, the near end is in our own shadow
  const depthTone = (y) => { const t = (y - CT) / (NEAR - CT), d = [0.9, 0.3, 0.6, 0.1][y % 4] * 0.18
    return t + d < 0.16 ? 3 : t + d < 0.7 ? 2 : 1 }
  for (let y = CT; y < NEAR; y++) for (let x = 0; x < W; x++) {
    const xn = unproj(x, y), b = Math.floor((xn + 10000) / BOARD)
    let k = depthTone(y) - (b % 2 ? 0 : 0) - (b % 3 === 1 && y > CT + 12 ? 1 : 0)
    c.px(x, y, WOOD[Math.max(0, k)])
  }
  // grain: thin streaks along each board, narrowing with it
  const r = c.rng(11)
  for (let k = 0; k < 60; k++) {
    const xn = -300 + r() * 1080, y0 = CT + 4 + r() * 50, y1 = Math.min(NEAR - 1, y0 + 8 + r() * 30)
    c.line(Math.round(proj(xn, y0)), Math.round(y0), Math.round(proj(xn, y1)), Math.round(y1), r() < 0.7 ? "r" : "M")
  }
  // the seams between boards, each with a lit bevel on the side toward the light
  for (let xn = 240 - 20 * BOARD; xn < 240 + 21 * BOARD; xn += BOARD) {
    const xa = Math.round(proj(xn, CT)), xb = Math.round(proj(xn, NEAR))
    c.line(xa, CT, xb, NEAR - 1, "r"); c.line(xa + 1, CT, xb + 1, NEAR - 1, "M")
  }
  // a long gloss highlight: the bright dome glass caught in the lacquer, running toward us and fading
  for (let y = CT + 2; y < CT + 22; y++) {
    const x0 = Math.round(proj(150, y)), x1 = Math.round(proj(196, y)), t = (y - CT) / 22
    for (let x = x0; x <= x1; x++) if ((x + y) % (t < 0.3 ? 1 : t < 0.6 ? 2 : 4) === 0) c.px(x, y, "P")
  }
  // our edge: a rounded brass rail
  c.hline(0, NEAR, W, "Y"); c.hline(0, NEAR + 1, W, "y"); c.hline(0, NEAR + 2, W, "g"); c.hline(0, NEAR + 3, W, "K")
}
// reflections on the gloss: what's beyond the far edge, mirrored and smeared toward us
function reflections(c) {
  const smear = (x, w, top, len, col) => {
    const r = c.rng(x * 13 + top)
    for (let xx = x; xx < x + w; xx++) {
      const mid = 1 - Math.abs(xx - (x + w / 2)) / (w / 2), l = Math.round(len * (0.35 + 0.65 * mid) * (0.6 + 0.4 * r()))
      for (let yy = top; yy < top + l; yy++) if (yy - top < 2 || (yy + xx) % 2 === 0) c.px(xx, yy, col)
    }
  }
  smear(0, 240, CT + 1, 6, "s")      // the dome glass and the sun
  smear(84, 56, CT + 1, 10, "H")
  smear(150, 90, CT + 1, 5, "z")     // the drum's windows across the floor
  smear(380, 70, CT + 1, 5, "Z")
}
function guestReflection(c) {
  for (let y = 0; y < 9; y++) for (let x = 0; x < 100; x++) if (y < 9 - Math.abs(x - 50) / 6) c.px(284 + x, CT + 1 + y, "K")
}
function farEdge(c) {
  // the far edge of the counter: a pink neon tube along its lip
  c.hline(0, CT - 5, W, "1"); c.hline(0, CT - 4, W, "z"); c.hline(0, CT - 3, W, "v"); c.hline(0, CT - 2, W, "z"); c.hline(0, CT - 1, W, "K")
}
function barMat(c) {
  const far = 192, near = 212, xa = POUR_X - 72, xb = POUR_X + 52   // xa, xb: its sides, as x where they would meet our edge
  for (let y = far; y < near; y++) {
    const x0 = Math.round(proj(xa, y)), x1 = Math.round(proj(xb, y))
    c.hline(x0, y, x1 - x0, y === far ? "3" : y === near - 1 ? "0" : "1")
    c.px(x0, y, "3")
  }
  for (const z of [1.18, 1.26, 1.35, 1.45, 1.56, 1.68, 1.8]) {
    const y = Math.round(VPY + (NEAR - VPY) / z); if (y <= far + 1 || y >= near - 2) continue
    for (let xn = xa + 4; xn < xb - 2; xn += 4) c.px(Math.round(proj(xn, y)), y, "2")
  }
  c.line(Math.round(proj(xa + 4, near - 3)), near - 3, Math.round(proj(xa + 40, near - 3)), near - 3, "T")
}
// The counter tools, each its own sprite (pivot at its base) so the pour page can lift and move it. Steel things
// get the dark outline; glassware stays unoutlined (an outline would draw inside its clear walls).
// Every container is a cylinder seen from above: we look down on the counter from eye level, so rims and bases
// are ellipses about 0.3 as tall as they are wide. vessel() draws one in a sprite: rt / rb are the top and bottom
// half widths, h the height from the rim's middle to the base's middle. Steel is opaque: shaded in vertical bands
// (light on the left), the opening dark inside with its far inner wall catching light. Glass is clear: only its
// walls, rim and thick base are drawn, so what's behind shows through.
const K = 0.3
function vessel(c, cx, top, rt, rb, h, kind) {
  const ryT = Math.max(2, Math.round(rt * K)), ryB = Math.max(2, Math.round(rb * K)), rimY = top + ryT, baseY = rimY + h
  const hwAt = (y) => rt + (rb - rt) * (y - rimY) / h
  const inEll = (x, y, ex, ey, rx, ry) => ((x - ex) / (rx + 0.5)) ** 2 + ((y - ey) / (ry + 0.5)) ** 2 <= 1
  const steel = (u) => u < 0.1 ? "f" : u < 0.32 ? "F" : u < 0.45 ? "f" : u < 0.8 ? "E" : "e"
  for (let y = rimY; y <= baseY + ryB; y++) {
    const hw = y <= baseY ? hwAt(y) : rb
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      if (y > baseY && !inEll(x, y, cx, baseY, rb, ryB)) continue
      const u = (x - (cx - hw)) / (2 * hw), edgeL = x === Math.round(cx - hw), edgeR = x === Math.round(cx + hw)
      if (kind === "steel") { const k = steel(u), dk = { F: "f", f: "E", E: "e", e: "0" }; c.px(x, y, y >= baseY - 2 ? dk[k] : k) }
      else if (edgeL) c.px(x, y, "U")
      else if (edgeR) c.px(x, y, "T")
      else if (x === Math.round(cx - hw) + 1) c.px(x, y, "u")
    }
  }
  if (kind === "steel") {
    // the bottom curve of the body, darker as it turns under
    for (let x = Math.round(cx - rb); x <= Math.round(cx + rb); x++) {
      const yb = Math.round(baseY + ryB * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rb + 0.5)) ** 2)))
      c.px(x, yb, "e")
    }
    // the opening: dark inside, the far inner wall lit just under the back rim, a bright front rim
    for (let y = rimY - ryT; y <= rimY + ryT; y++) for (let x = Math.round(cx - rt); x <= Math.round(cx + rt); x++) {
      if (!inEll(x, y, cx, rimY, rt, ryT)) continue
      const back = y < rimY - ryT + 2
      c.px(x, y, back ? "E" : y < rimY ? "e" : "0")
    }
    for (let x = Math.round(cx - rt); x <= Math.round(cx + rt); x++) {
      const d = ryT * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rt + 0.5)) ** 2))
      c.px(x, Math.round(rimY - d), "f"); c.px(x, Math.round(rimY + d), "F")
    }
  } else {
    // glass: a thick base (a lens of glass), the rim as a ring: back arc dim, front arc bright
    for (let y = baseY - 3; y <= baseY + ryB; y++) for (let x = Math.round(cx - rb); x <= Math.round(cx + rb); x++) {
      const inside = y <= baseY ? inEll(x, Math.max(y, baseY - 3), cx, baseY, rb, ryB) || y > baseY - 3 : inEll(x, y, cx, baseY, rb, ryB)
      if (inside && (y >= baseY - 3)) c.px(x, y, y === baseY - 3 ? "U" : "u")
    }
    for (let x = Math.round(cx - rb); x <= Math.round(cx + rb); x++) {
      const d = ryB * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rb + 0.5)) ** 2))
      c.px(x, Math.round(baseY + d), "T"); c.px(x, Math.round(baseY - 3 - d * 0.6), "U")
    }
    for (let x = Math.round(cx - rt); x <= Math.round(cx + rt); x++) {
      const d = ryT * Math.sqrt(Math.max(0, 1 - ((x - cx) / (rt + 0.5)) ** 2))
      c.px(x, Math.round(rimY - d), "u"); c.px(x, Math.round(rimY + d), "U")
    }
    // shine: a long highlight down the lit side, a short one low on the far side
    c.vline(Math.round(cx - rt) + 3, rimY + 3, Math.round(h * 0.55), "w")
    c.vline(Math.round(cx + rb) - 3, baseY - Math.round(h * 0.4), Math.round(h * 0.18), "U")
  }
  return { rimY, baseY, ryT, ryB }
}
const vesselSize = (rt, rb, h) => ({ h: Math.max(2, Math.round(rt * K)) + h + Math.max(2, Math.round(rb * K)) + 1 })

// the guest's glass, empty and waiting: a highball, the pour's target
sprite("glass", { w: 29, h: vesselSize(13, 12, 40).h, pivot: "bottom" }, (c) => { vessel(c, 14, 0, 13, 12, 40, "glass") })
// the stirring glass: heavy cut glass, faceted, a bar spoon leaning in it
sprite("mixing_glass", { w: 30, h: vesselSize(13, 13, 30).h + 14, pivot: "bottom" }, (c) => {
  const v = vessel(c, 14, 14, 13, 13, 30, "glass")
  for (let x = 4; x <= 24; x += 4) for (let y = v.rimY + 6; y < v.baseY - 4; y++) if ((y + x) % 3) c.px(x, y, (x / 4) % 2 ? "U" : "u")
  c.line(20, 0, 15, v.baseY - 6, "f"); c.line(21, 0, 16, v.baseY - 6, "E"); c.rect(19, 0, 4, 2, "F")
})
// the same stirring glass with the spoon out (the pour lab turns the spoon itself while stirring)
sprite("mixing_glass_bare", { w: 30, h: vesselSize(13, 13, 30).h + 14, pivot: "bottom" }, (c) => {
  const v = vessel(c, 14, 14, 13, 13, 30, "glass")
  for (let x = 4; x <= 24; x += 4) for (let y = v.rimY + 6; y < v.baseY - 4; y++) if ((y + x) % 3) c.px(x, y, (x / 4) % 2 ? "U" : "u")
})
// the shaker's cap: a smaller tin turned upside down over the mouth, closed end up, frosted rim at the seam
sprite("shaker_cap", { w: 23, h: 26, pivot: "bottom", outline: "0" }, (c) => {
  const cx = 11, top = 2, H = 20
  for (let y = 0; y <= H; y++) {
    const hw = 7 + 3 * y / H
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const u = (x - (cx - hw)) / (2 * hw)
      c.px(x, top + y, u < 0.1 ? "f" : u < 0.32 ? "F" : u < 0.45 ? "f" : u < 0.8 ? "E" : "e")
    }
  }
  c.ellipse(cx, top, 7, 2, "f"); c.hline(cx - 5, top - 1, 9, "F")
  c.hline(cx - 10, top + H, 21, "F"); c.hline(cx - 10, top + H + 1, 21, "E")
})
// Boston shaker tin: wide mouth up, a weighted base band
sprite("shaker", { w: 25, h: vesselSize(11, 9, 46).h, pivot: "bottom", outline: "0" }, (c) => {
  const v = vessel(c, 12, 0, 11, 9, 46, "steel")
  for (let x = 3; x <= 21; x++) { const u = (x - 3) / 18; c.px(x, v.baseY - 6, u < 0.45 ? "F" : "E") }
})
// measuring cups: a quarter, a half and one part; a steel cup with a handle on the right
function cupSprite(name, rt, rb, h) {
  const H = vesselSize(rt, rb, h).h
  sprite(name, { w: 2 * rt + 8, h: H, pivot: [rt + 1, H], outline: "0" }, (c) => {
    const v = vessel(c, rt + 1, 0, rt, rb, h, "steel")
    const hx = 2 * rt + 2, hy = v.rimY + 2
    c.hline(hx, hy, 4, "F"); c.vline(hx + 4, hy, 6, "f"); c.hline(hx, hy + 6, 4, "E"); c.px(hx + 4, hy, "F")
    c.hline(rt - 2, v.rimY + Math.round(h / 2), 6, "E")
  })
}
cupSprite("cup_quarter", 9, 7, 13); cupSprite("cup_half", 10, 8, 17); cupSprite("cup_one", 11, 9, 21)
// The ice well: a steel-lined cubby sunk into the counter top, drawn in the counter's own perspective (its sides
// run toward the vanishing point like the boards). It sits left of us, so we see down its far wall and its left
// inner wall; the near wall is hidden under the counter's edge. Ice heaped just under the rim, the cubes smaller
// toward the back; a steel scoop resting in it. The pour page treats the whole opening as where ice comes from.
const WELL = { xa: -48, xb: 12, far: 193, near: 216 }
function iceWell(c) {
  const { xa, xb, far, near } = WELL, X = (xn, y) => Math.round(proj(xn, y))
  // steel rim on the counter top, lit along its near lip
  for (let y = far - 2; y <= near + 1; y++) for (let x = X(xa, y) - 2; x <= X(xb, y) + 2; x++) c.px(x, y, y >= near ? "F" : "f")
  c.line(X(xa, far - 2) - 2, far - 2, X(xb, far - 2) + 2, far - 2, "E")
  // the opening: far inner wall going down, the left inner wall, both cold steel in shadow
  for (let y = far; y < near; y++) for (let x = X(xa, y); x <= X(xb, y); x++) {
    const wall = y < far + 5 ? "E" : x < X(xa, y) + 4 ? "e" : "0"
    c.px(x, y, y < far + 2 ? "e" : wall)
  }
  // ice: sits a little below the rim, so the far wall shows above it. Cubes heaped irregularly, back to front,
  // smaller toward the back; the ones in the rim's shadow (along the far and left walls) are dimmer
  const r = c.rng(21), cubes = []
  for (let k = 0; k < 120; k++) {
    const y = far + 6 + Math.floor(r() * (near - far - 7)), t = (y - far) / (near - far)
    const x0 = X(xa, y) + 2, x1 = X(xb, y) - 2, sz = 3 + Math.floor(t * 2.5 + r() * 2)
    cubes.push({ x: x0 + Math.floor(r() * Math.max(1, x1 - x0 - sz)), y, sz, turned: r() < 0.3 })
  }
  cubes.sort((p, q) => p.y - q.y)
  for (const q of cubes) {
    const dim = q.y < far + 9 || q.x < X(xa, q.y) + 6
    const top = dim ? "u" : "U", lit = dim ? "U" : "w", side = dim ? "t" : "u"
    if (q.turned) {
      // a cube turned on its corner: a small diamond
      const h = Math.max(1, q.sz >> 1)
      for (let i = 0; i <= h; i++) { c.hline(q.x + h - i, q.y - h + i, 2 * i + 1, top); c.hline(q.x + h - i, q.y + h - i, 2 * i + 1, i === h ? top : side) }
      c.px(q.x + h, q.y - h, lit)
    } else {
      c.rect(q.x, q.y - q.sz + 1, q.sz, q.sz - 1, top); c.hline(q.x, q.y - q.sz + 1, q.sz - 1, lit)
      c.vline(q.x + q.sz - 1, q.y - q.sz + 2, q.sz - 2, side); c.hline(q.x + 1, q.y, q.sz - 1, "t")
    }
  }
  // the scoop: its bowl buried in the ice, the handle angled up and out to the right, catching the light
  const sx = X(-14, 207), sy = 207
  c.ellipse(sx, sy, 5, 2, "E"); c.hline(sx - 4, sy - 2, 9, "F"); c.hline(sx - 5, sy - 1, 11, "f")
  for (let i = 0; i < 16; i++) { const hx = sx + 5 + i, hy = sy - 1 - Math.round(i * 0.6); c.px(hx, hy, "F"); c.px(hx, hy + 1, "E") }
  c.rect(sx + 20, sy - 12, 4, 3, "e"); c.px(sx + 20, sy - 12, "f")
}
// where the tools stand: [sprite, x at its base, base y]
const TOOL_BASE = 206, GLASS_BASE = 210
const TOOLS = () => [["cup_quarter", 86, TOOL_BASE], ["cup_half", 114, TOOL_BASE], ["cup_one", 145, TOOL_BASE],
  ["mixing_glass", 406, TOOL_BASE + 1], ["shaker", 444, TOOL_BASE + 1]]
// Grounding. The light here comes from behind the guest (the sun and the dome), so shadows fall TOWARD us, down
// the counter and a little right; behind an object they'd be hidden by it. Shadows are shade layers: they step
// the wood darker along its own ramp, so a shadow is a deeper brown of the counter, not a grey stamp. The counter
// is glossy lacquer, so each object also shows a faint mirrored reflection under its base, fading out.
const FOOT = { cup_quarter: [7, 2], cup_half: [8, 2], cup_one: [9, 3], mixing_glass: [13, 4], shaker: [9, 3], glass: [12, 4] }
const footprints = (list = [...TOOLS(), ["glass", POUR_X, GLASS_BASE]]) => list.map(([n, x, y]) => {
  const [rx, ry] = FOOT[n], ox = n.startsWith("cup_") ? -2 : 0
  return { n, x: x + ox, feet: y, cy: y - 1 - ry, rx, ry }
})
function castShadows(c, list) {
  for (const f of footprints(list)) {
    const L = Math.round(f.ry * 2 + 5)
    for (let t = 0; t <= L; t++) c.ellipse(f.x + Math.round(t * 0.4), f.cy + t, Math.max(2, Math.round(f.rx - t * 0.25)), f.ry, "0")
  }
  // the guest's forearms and hands shade the counter in front of them
  c.ellipse(GX, CT + 14, 26, 3, "0"); c.ellipse(GX - 30, CT + 7, 12, 2, "0"); c.ellipse(GX + 32, CT + 7, 12, 2, "0")
}
function contactShadows(c, list) { for (const f of footprints(list)) c.ellipse(f.x, f.cy + 1, f.rx + 1, f.ry, "0") }
// sprite heights, so a reflection can be flipped about each object's base
const H_OF = {
  cup_quarter: vesselSize(9, 7, 13).h + 2, cup_half: vesselSize(10, 8, 17).h + 2,
  cup_one: vesselSize(11, 9, 21).h + 2, mixing_glass: vesselSize(13, 13, 30).h + 14, shaker: vesselSize(11, 9, 46).h + 2,
}
const toolReflections = (from, to, list = TOOLS()) => list.map(([n, x, y]) => clip([x - 30, y + from, 60, to - from], stamp(n, x, y, { flip: "y" })))


// ================================================================ the speed rail
// bottles laid out left to right with even gaps, and one wider gap under the glass so nothing stands in front of the pour
const GAP_AFTER = 5, POUR_GAP = 30
const RAIL_X = (() => {
  const ws = INGREDIENTS.map((ing) => 2 * Math.max(...bottleProfile(ing.big.segs)) + 3)
  const g = (W - 12 - ws.reduce((a, b) => a + b, 0) - POUR_GAP) / (ws.length - 1)
  const xs = []; let x = 6
  ws.forEach((w, k) => { xs.push(Math.round(x + w / 2)); x += w + g + (k === GAP_AFTER ? POUR_GAP : 0) })
  return xs
})()
const railX = (k) => RAIL_X[k]
const POUR_X = Math.round((RAIL_X[GAP_AFTER] + RAIL_X[GAP_AFTER + 1]) / 2)
function railBack(c) { c.rect(0, NEAR + 4, W, H - NEAR - 4, "0"); c.hline(0, NEAR + 4, W, "K") }
function railFront(c) {
  c.rect(0, RAIL_TOP, W, H - RAIL_TOP, "E")
  c.hline(0, RAIL_TOP, W, "F"); c.hline(0, RAIL_TOP + 1, W, "f"); c.hline(0, RAIL_TOP + 2, W, "e")
  for (let y = RAIL_TOP + 5; y < H - 1; y += 4) c.hline(0, y, W, "e")
  c.hline(0, H - 1, W, "e")
  for (let x = 4; x < W; x += 120) { c.rect(x, RAIL_TOP + 6, 2, 2, "f"); c.px(x, RAIL_TOP + 6, "F") }
  // tape labels so the everyday bottles read at a glance
  INGREDIENTS.forEach((ing, k) => {
    const x = railX(k)
    c.rect(x - 7, RAIL_TOP + 5, 15, 7, "c"); c.hline(x - 7, RAIL_TOP + 11, 15, "p")
    c.text(x - 5, RAIL_TOP + 6, ing.tag, "1")
  })
}

// ================================================================ the scene
// a hovered bottle rises a little out of the rail, as if half lifted
const railStamps = (hover) => INGREDIENTS.map((ing, k) => stamp("bottle_" + ing.id + (ing.id === hover ? "_hover" : ""), railX(k), BOTTLE_FLOOR - lift(ing) - (ing.id === hover ? 6 : 0)))

function barScene(name, hover) { return scene(name, { w: W, h: H, bg: "3", world: { light: [-1, -0.6] } },
  layer("sky", skyThroughGlass, cityThroughGlass),
  layer("haze", { opacity: 0.3 }, rect(0, 86, W, 30, "H")),
  layer("panes", { opacity: 0.22 }, panes),
  layer("far side", farSide),
  layer("dance floor", danceFloor),
  layer("light shafts", { opacity: 0.07 }, poly([88, 70, 120, 66, 300, 170, 210, 170], "w"), poly([130, 72, 160, 70, 360, 170, 300, 170], "w")),
  layer("near rail", nearRail),
  layer("depth haze", { opacity: 0.28 }, rect(0, 108, W, CT - 108, "s")),
  layer("dome", struts, lightRig, stamp("mirror_ball", 196, 78)),
  layer("guest", stamp("guest", GX, VPY - Math.round(9 * GS) + GUEST_H)),
  layer("counter", counterTop),
  layer("reflections", { opacity: 0.35 }, reflections),
  layer("guest reflection", { opacity: 0.5 }, guestReflection),
  layer("far edge", farEdge),
  layer("guest arms", guestArms, stamp("guest_hands", GX, CT + 9)),
  layer("mat", barMat),
  layer("ice well", iceWell),
  layer("tool reflections", { opacity: 0.28 }, ...toolReflections(0, 5)),
  layer("tool reflections far", { opacity: 0.14 }, ...toolReflections(5, 12)),
  layer("cast shadows", { shade: 1 }, castShadows),
  layer("contact", { shade: 1 }, contactShadows),
  layer("tools", ...TOOLS().map(([n, x, y]) => stamp(n, x, y))),
  layer("glass", stamp("glass", POUR_X, GLASS_BASE)),
  layer("rail back", railBack),
  layer("rail", ...railStamps(hover)),
  layer("rail front", railFront),
  layer("shelf glow", { opacity: 0.1 }, poly([0, 60, 480, 60, 480, 86, 0, 86], "n")),
  layer("top shelf", shelfBack, shelfBottles, shelfBoard),
  glow("Nn", { r: 5, strength: 0.4 }),
  glow("Vv", { r: 5, strength: 0.35 }),
  glow("G", { r: 3, strength: 0.4 }),
  glow("Zz", { r: 3, strength: 0.3 }),
  glow("w", { where: [84, 58, 24, 24], r: 12, strength: 0.25 }),
  glow(["#FF8AD0"], { r: 4, strength: 0.4 }),
) }
barScene("neon_dome")
// ---------------------------------------------------------------- export for the pour page (tools/pourlab)
// pour_bg: everything that never moves. The cups, the glass and the rail bottles are left out (the page draws them,
// with their shadows and reflections, so they can be picked up); the shaker and stirring glass stay in for now.
// pour_front: the rail's front plate on its own, drawn over the bottles.
const STATIC_TOOLS = () => []   // the pour lab moves every tool now
scene("pour_bg", { w: W, h: H, bg: "3", world: { light: [-1, -0.6] } },
  layer("sky", skyThroughGlass, cityThroughGlass),
  layer("haze", { opacity: 0.3 }, rect(0, 86, W, 30, "H")),
  layer("panes", { opacity: 0.22 }, panes),
  layer("far side", farSide),
  layer("dance floor", danceFloor),
  layer("light shafts", { opacity: 0.07 }, poly([88, 70, 120, 66, 300, 170, 210, 170], "w"), poly([130, 72, 160, 70, 360, 170, 300, 170], "w")),
  layer("near rail", nearRail),
  layer("depth haze", { opacity: 0.28 }, rect(0, 108, W, CT - 108, "s")),
  layer("dome", struts, lightRig, stamp("mirror_ball", 196, 78)),
  layer("guest", stamp("guest", GX, VPY - Math.round(9 * GS) + GUEST_H)),
  layer("counter", counterTop),
  layer("reflections", { opacity: 0.35 }, reflections),
  layer("guest reflection", { opacity: 0.5 }, guestReflection),
  layer("far edge", farEdge),
  layer("guest arms", guestArms, stamp("guest_hands", GX, CT + 9)),
  layer("mat", barMat),
  layer("ice well", iceWell),
  layer("tool reflections", { opacity: 0.28 }, ...toolReflections(0, 5, STATIC_TOOLS())),
  layer("tool reflections far", { opacity: 0.14 }, ...toolReflections(5, 12, STATIC_TOOLS())),
  layer("cast shadows", { shade: 1 }, (c) => castShadows(c, STATIC_TOOLS())),
  layer("contact", { shade: 1 }, (c) => contactShadows(c, STATIC_TOOLS())),
  layer("tools", ...STATIC_TOOLS().map(([n, x, y]) => stamp(n, x, y))),
  layer("rail back", railBack),
  layer("shelf glow", { opacity: 0.1 }, poly([0, 60, 480, 60, 480, 86, 0, 86], "n")),
  layer("top shelf", shelfBack, shelfBottles, shelfBoard),
  glow("Nn", { r: 5, strength: 0.4 }),
  glow("Vv", { r: 5, strength: 0.35 }),
  glow("G", { r: 3, strength: 0.4 }),
  glow("Zz", { r: 3, strength: 0.3 }),
  glow("w", { where: [84, 58, 24, 24], r: 12, strength: 0.25 }),
)
scene("pour_front", { w: W, h: H }, layer("rail front", railFront))
barScene("neon_dome_hover", "rum")
