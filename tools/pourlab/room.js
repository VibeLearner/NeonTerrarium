// The room behind the guest, alive: the sky through the dome's glass by the clock, and the club's lights at night.
//
// Sky: the art bakes three backgrounds (day, dawn, night) and this fades between them. The sun, the moon, stars,
// clouds and the odd shooting star are drawn here so they can move. They're drawn on a small canvas of their own,
// then cut to the sky's shape with a mask (assets/pour_sky_mask.png: pure white wherever sky shows through the glass),
// so they pass behind the city, the struts and the shelf instead of over them.
//
// Club: the same lights the game's Neon Dome has when the club is live (js/mega.js clubFx): the dance floor's tiles
// light in patterns to a 124 bpm beat (scattered, rings rippling out, a spinning pinwheel, a new one every 8 beats),
// four colored beams sweep round the floor from the rig, and the mirror ball throws glints.
//
// Game-dev terms: "additive" light (canvas "lighter") adds its color to what's under it, so overlapping beams get
// brighter, like real light. A "mask" is a picture used only for its shape: drawing with "destination-in" keeps what's
// already drawn only where the mask has pixels.

const BPM = 124
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ease = (t) => t * t * (3 - 2 * t)
const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
const mixHex = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(",")})` }
// three stops: night (0), dawn (1), day (2)
const mix3 = (cols, m) => (m <= 1 ? mixHex(cols[0], cols[1], clamp(m, 0, 1)) : mixHex(cols[1], cols[2], clamp(m - 1, 0, 1)))
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// What the sky and the club look like at an hour of the day (0..24; the bar's 20..29 can be passed as is).
//   m: 0 night, 1 dawn (or dusk), 2 day. sun: 0 under the horizon, 1 at its morning height. moon: how far across
//   the night it has gone (0..1). The club is live 20:00 to 04:00, as in the game.
export function lookAt(h) {
  h = ((h % 24) + 24) % 24
  let m = 2, sun = 1
  if (h >= 20.5 || h < 3.4) { m = 0; sun = 0 }
  else if (h >= 3.4 && h < 5) { const t = (h - 3.4) / 1.6; m = 2 * ease(t); sun = ease(clamp((h - 4) / 1, 0, 1)) }
  else if (h >= 18.5) { const t = (h - 18.5) / 2; m = 2 - 2 * ease(t); sun = 1 - ease(clamp((h - 18.5) / 1.4, 0, 1)) }
  const nh = h < 12 ? h + 24 : h
  return { m, sun, moon: clamp((nh - 20) / 8.5, 0, 1), club: nh >= 20 && nh < 28 }
}

export function createRoom({ IMG, L, W, H }) {
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c }
  // ---------------------------------------------------------------- the sky's shape, from the mask
  const SKY_H = 100
  const fx = mk(W, SKY_H), fctx = fx.getContext("2d")
  let mask = null, skyTop = 60
  try {
    const mc = mk(W, SKY_H), mx = mc.getContext("2d")
    mx.drawImage(IMG.sky_mask, 0, 0)
    const d = mx.getImageData(0, 0, W, SKY_H), px = d.data
    skyTop = SKY_H
    for (let i = 0; i < W * SKY_H; i++) {
      const sky = px[i * 4] === 255 && px[i * 4 + 1] === 255 && px[i * 4 + 2] === 255
      px[i * 4 + 3] = sky ? 255 : 0
      if (sky) skyTop = Math.min(skyTop, Math.floor(i / W))
    }
    mx.putImageData(d, 0, 0); mask = mc
  } catch { mask = null }   // (a page opened from a file can't read its own pictures: then the sky just doesn't move)
  fctx.imageSmoothingEnabled = false

  // stars: fixed spots across the sky's rows, a few bright, most faint, each twinkling on its own beat
  const stars = []
  for (let y = skyTop; y < 94; y++) for (let x = 0; x < W; x++) {
    const h = hash(x, y)
    if (h < 0.012) stars.push({ x, y, bright: h < 0.0035, ph: hash(y, x) * 6.283, sp: 0.6 + hash(x + 7, y) * 2 })
  }
  // clouds: a few soft lumps, each a list of pixel runs (light on top, a shadow along the bottom)
  const clouds = []
  for (let k = 0; k < 6; k++) {
    const w = 22 + Math.floor(hash(k, 3) * 26), hgt = 6 + Math.floor(hash(k, 5) * 5), blobs = []
    for (let b = 0; b < 5; b++) { const t = b / 4; blobs.push([w * (0.12 + 0.76 * t), hgt * 0.62 - Math.sin(t * Math.PI) * hgt * (0.25 + 0.3 * hash(k, b)), hgt * (0.35 + 0.25 * Math.sin(t * Math.PI))]) }
    const inside = (x, y) => y < hgt && blobs.some(([cx, cy, r]) => (x - cx) ** 2 + ((y - cy) * 1.6) ** 2 <= r * r)
    const runs = []
    for (let y = 0; y < hgt; y++) {
      let run = null
      for (let x = 0; x <= w; x++) {
        const on = x < w && inside(x, y), shade = on && !inside(x, y + 2)
        const kind = on ? (shade ? 2 : 1) : 0
        if (run && run.kind !== kind) { runs.push(run); run = null }
        if (kind && !run) run = { x, y, n: 0, kind }
        if (run) run.n++
      }
    }
    clouds.push({ runs, w, x: hash(k, 9) * (W + 60) - 30, y: skyTop + 1 + Math.floor(hash(k, 11) * 22), sp: 0.7 + hash(k, 13) * 0.9 })
  }
  const CLOUD_LIT = ["#2A2E5E", "#FFC4B2", "#F6F8FC"], CLOUD_SHADE = ["#1B1E46", "#C68AAE", "#C9D4E6"]

  // ---------------------------------------------------------------- the dance floor's tiles, from the art's geometry
  // (same as the art: 6 px wide tiles, 3 rows deep, a dark seam on the left and bottom of each)
  const FL = L.floor, fTop = Math.min(...FL.map((f) => f[0])), fBot = Math.max(...FL.map((f) => f[1]))
  const floorC = mk(W, fBot - fTop), floorX = floorC.getContext("2d")
  const floorImg = floorX.createImageData(W, fBot - fTop)
  const tiles = new Map()
  FL.forEach(([top, bot], x) => {
    for (let y = top; y < bot; y++) {
      if (x % 6 === 0 || (y - top) % 3 === 2) continue
      const tx = Math.floor(x / 6), ty = Math.floor((y - top) / 3), key = tx * 100 + ty
      if (!tiles.has(key)) tiles.set(key, { tx, ty, px: [] })
      tiles.get(key).px.push((y - fTop) * W + x)
    }
  })
  const midTx = W / 12, rows = Math.max(...[...tiles.values()].map((t) => t.ty)) + 1
  const TILE_COLS = [[255, 77, 204], [64, 230, 255], [166, 102, 255]]
  let lastBeat = -1
  function paintFloor(beat) {
    const bar = Math.floor(beat / 8), mode = bar % 3, d = floorImg.data
    d.fill(0)
    for (const t of tiles.values()) {
      // where the tile sits on the round floor: across from the middle, and how deep (rows are foreshortened)
      const cx = t.tx - midTx, cz = (t.ty - rows / 2) * 3.2, r = Math.hypot(cx * 0.55, cz), a = Math.atan2(cz, cx)
      const on = mode === 0 ? hash(t.tx * 31 + beat, t.ty * 17 + beat) > 0.5
        : mode === 1 ? ((r * 0.25 - beat * 0.25) % 1 + 1) % 1 > 0.5
        : ((a / 6.2832 * 4 + beat * 0.125) % 1 + 1) % 1 > 0.5
      if (!on) continue
      const c = TILE_COLS[(t.tx + t.ty + bar) % 3]
      for (const i of t.px) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255 }
    }
    floorX.putImageData(floorImg, 0, 0)
  }
  const floorAt = (x) => FL[clamp(Math.round(x), 0, W - 1)]

  // ---------------------------------------------------------------- state
  const st = { t: 0, m: 2, sun: 1, moon: 0, club: 0, clubT: 0, cloudSpeed: 1, meteor: null, meteorIn: 20 }
  const BEAMS = [["#FF4FC8", 150], ["#38E8E0", 214], ["#9B6BFF", 300], ["#FFB347", 390]].map(([c, x], k) => ({ rgb: hexRgb(c), x, k }))
  const GLINT_COLS = [[255, 255, 255], [255, 122, 216], [122, 240, 255]]

  // look: from lookAt(); clubOn: whether the club's lights should be on; speed: how fast the clouds go (fast while
  // the clock fast-forwards)
  function update(dt, look, clubOn, speed = 1) {
    st.t += dt
    st.m = look.m; st.sun = look.sun; st.moon = look.moon
    st.club = clamp(st.club + (clubOn ? dt / 1.2 : -dt / 2), 0, 1)
    if (st.club > 0) st.clubT += dt
    for (const c of clouds) { c.x += dt * c.sp * 1.4 * speed; if (c.x > W + 10) c.x = -c.w - 10 }
    // now and then, on a dark night, a shooting star
    if (st.m < 0.4) {
      if (st.meteor) { st.meteor.t += dt; if (st.meteor.t > 0.7) st.meteor = null }
      else if ((st.meteorIn -= dt) <= 0) {
        st.meteor = { x: 120 + Math.random() * 340, y: skyTop + Math.random() * 6, t: 0 }
        st.meteorIn = 16 + Math.random() * 30
      }
    } else st.meteor = null
  }

  // ---------------------------------------------------------------- drawing
  function drawSky(ctx) {
    // the three backgrounds: night, then dawn over it, then day over that
    const m = st.m
    if (m < 1) { ctx.drawImage(IMG.bg_night, 0, 0); if (m > 0) { ctx.globalAlpha = m; ctx.drawImage(IMG.bg_dawn, 0, 0) } }
    else { ctx.drawImage(IMG.bg_dawn, 0, 0); ctx.globalAlpha = m - 1; ctx.drawImage(IMG.bg_day, 0, 0) }
    ctx.globalAlpha = 1
    if (!mask) return
    const f = fctx, night = clamp(1 - m, 0, 1)
    f.clearRect(0, 0, W, SKY_H)
    // stars
    if (night > 0) for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(st.t * s.sp + s.ph)
      f.globalAlpha = night * (s.bright ? 0.6 + 0.4 * tw : 0.25 + 0.35 * tw)
      f.fillStyle = s.bright ? "#FFFFFF" : "#B8C4FF"; f.fillRect(s.x, s.y, 1, 1)
    }
    f.globalAlpha = 1
    // the moon: rises on the right (east, where the sun comes up) as the bar opens, and sets on the left toward dawn.
    // (Left of x 265 the drink screen covers the glass, so its path and the sun's stay right of it.)
    const moonA = clamp(1.6 - m * 1.4, 0, 1)
    if (moonA > 0) {
      const p = st.moon, mx = Math.round(472 - 205 * p), my = Math.round(80 - 16 * Math.sin(Math.PI * p))
      f.globalAlpha = moonA
      const g = f.createRadialGradient(mx, my, 2, mx, my, 14); g.addColorStop(0, "rgba(200,210,255,0.35)"); g.addColorStop(1, "rgba(200,210,255,0)")
      f.fillStyle = g; f.fillRect(mx - 14, my - 14, 28, 28)
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        if (x * x + y * y > 18) continue
        const shade = (x + 2) * (x + 2) + (y - 1) * (y - 1) <= 9 ? 0 : 1      // a lit crescent on the right, earthshine on the rest
        f.fillStyle = shade ? (x * x + y * y > 12 ? "#C9D0F2" : "#EEF1FF") : "#5A6296"
        f.fillRect(mx + x, my + y, 1, 1)
      }
      f.globalAlpha = 1
    }
    // the sun: comes up out of the city at dawn, to its morning spot by 05:00 (and down again at dusk)
    if (st.sun > 0.001) {
      const s = st.sun, sx = Math.round(446 - 14 * s), sy = Math.round(102 - 32 * s)
      const g = f.createRadialGradient(sx, sy, 3, sx, sy, 20); g.addColorStop(0, `rgba(255,236,200,${0.45})`); g.addColorStop(1, "rgba(255,236,200,0)")
      f.fillStyle = g; f.fillRect(sx - 20, sy - 20, 40, 40)
      const core = mixHex("#FFC27A", "#FFF6E6", s), ring = mixHex("#FF8A5A", "#F6D79A", s), halo = mixHex("#FFA88A", "#E4E9EE", s)
      for (let yy = -10; yy <= 10; yy++) for (let xx = -10; xx <= 10; xx++) {
        const d = Math.hypot(xx, yy), px = sx + xx, py = sy + yy
        if (d <= 5) f.fillStyle = core; else if (d <= 7) f.fillStyle = ring; else if (d <= 10 && (px + py) % 2) f.fillStyle = halo; else continue
        f.fillRect(px, py, 1, 1)
      }
    }
    // clouds drift by
    const lit = mix3(CLOUD_LIT, m), shade = mix3(CLOUD_SHADE, m)
    f.globalAlpha = 0.55 + 0.3 * clamp(m / 2, 0, 1)
    for (const c of clouds) for (const r of c.runs) { f.fillStyle = r.kind === 2 ? shade : lit; f.fillRect(Math.round(c.x) + r.x, c.y + r.y, r.n, 1) }
    f.globalAlpha = 1
    // a shooting star: a bright head, a fading tail
    if (st.meteor) {
      const M = st.meteor, k = M.t / 0.7, hx = M.x - 110 * M.t, hy = M.y + 34 * M.t
      for (let i = 0; i < 9; i++) { f.globalAlpha = (1 - i / 9) * (1 - k * k); f.fillStyle = i ? "#C8D4FF" : "#FFFFFF"; f.fillRect(Math.round(hx + i * 3.2), Math.round(hy - i), 1, 1) }
      f.globalAlpha = 1
    }
    // cut it all to the sky's shape, and lay it over the glass
    f.globalCompositeOperation = "destination-in"; f.drawImage(mask, 0, 0); f.globalCompositeOperation = "source-over"
    ctx.drawImage(fx, 0, 0)
  }

  function drawClub(ctx) {
    const k = ease(st.club)
    if (k <= 0) return
    const t = st.clubT, beatF = t * BPM / 60, beat = Math.floor(beatF), pulse = 1 - (beatF % 1) * 0.45
    if (beat !== lastBeat) { lastBeat = beat; paintFloor(beat) }
    ctx.save()
    ctx.beginPath(); ctx.rect(0, skyTop - 2, W, L.CT - skyTop + 2); ctx.clip()
    // the floor's tiles, to the beat
    ctx.globalAlpha = k * 0.8 * pulse; ctx.drawImage(floorC, 0, fTop)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "lighter"
    // the beams: from the rig's cans (just above the screen, behind the shelf) down to spots that swing round the floor
    const bA = (0.12 + 0.08 * (0.5 + 0.5 * Math.sin(beatF * Math.PI))) * k
    for (const B of BEAMS) {
      const a = t * (0.6 + B.k * 0.13) + B.k * Math.PI / 2, rr = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.9 + B.k))
      const tx = clamp(240 + Math.cos(a) * rr * 225, 6, W - 6), [top, bot] = floorAt(tx)
      const mid = (top + bot) / 2, ty = mid + Math.sin(a) * rr * ((bot - top) / 2 - 3), near = (ty - top) / (bot - top)
      const wr = 5 + 5 * near, ox = B.x, oy = 10
      const g = ctx.createLinearGradient(ox, oy, tx, ty)
      g.addColorStop(0, rgba(B.rgb, 0)); g.addColorStop(0.35, rgba(B.rgb, bA * 0.8)); g.addColorStop(1, rgba(B.rgb, bA * 1.6))
      ctx.fillStyle = g
      ctx.beginPath(); ctx.moveTo(ox - 1.5, oy); ctx.lineTo(ox + 1.5, oy); ctx.lineTo(tx + wr, ty); ctx.lineTo(tx - wr, ty); ctx.closePath(); ctx.fill()
      // where it lands: a soft pool on the floor
      const pg = ctx.createRadialGradient(tx, ty, 0, tx, ty, wr + 4)
      pg.addColorStop(0, rgba(B.rgb, 0.55 * k)); pg.addColorStop(1, rgba(B.rgb, 0))
      ctx.fillStyle = pg; ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.32); ctx.translate(-tx, -ty)
      ctx.beginPath(); ctx.arc(tx, ty, wr + 4, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    }
    // the mirror ball's glints: little crosses of light going round the floor and the far wall
    for (let i = 0; i < 14; i++) {
      const a = i * 6.283 / 14 + t * 0.8, rr = 0.45 + (i % 4) * 0.18
      const gx = 240 + Math.cos(a) * rr * 235, [top, bot] = floorAt(gx), wall = i % 2
      const gy = wall ? top - 18 + (i % 3) * 5 + Math.sin(a) * 2 : (top + bot) / 2 + Math.sin(a) * rr * ((bot - top) / 2 - 2)
      const fl = (0.5 + 0.5 * Math.sin(t * 6 + i * 0.7)) * k, c = GLINT_COLS[i % 3]
      if (gx < 0 || gx >= W) continue
      ctx.fillStyle = rgba(c, fl * 0.9); ctx.fillRect(Math.round(gx), Math.round(gy), 1, 1)
      ctx.fillStyle = rgba(c, fl * 0.45)
      ctx.fillRect(Math.round(gx) - 1, Math.round(gy), 1, 1); ctx.fillRect(Math.round(gx) + 1, Math.round(gy), 1, 1)
      ctx.fillRect(Math.round(gx), Math.round(gy) - 1, 1, 1); ctx.fillRect(Math.round(gx), Math.round(gy) + 1, 1, 1)
    }
    // the ball itself catches the light: a couple of facets flash as it turns
    for (let i = 0; i < 3; i++) {
      const fi = Math.floor(t * 8) + i * 13, fxp = 196 + Math.round((hash(fi, 1) - 0.5) * 10), fyp = 78 + Math.round((hash(fi, 2) - 0.5) * 10)
      if ((fxp - 196) ** 2 + (fyp - 78) ** 2 > 30) continue
      ctx.fillStyle = rgba(GLINT_COLS[i], 0.8 * k); ctx.fillRect(fxp, fyp, 1, 1)
    }
    ctx.restore()
  }

  return { update, drawSky, drawClub, get state() { return st }, skyTop }
}
