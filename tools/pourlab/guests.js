// The guest generator's preview page: a lineup per crowd, played through a whole drink (wait, reach, lift, drink, set
// down, react), or every frame side by side. Roll for new seeds; save the current view as one PNG sheet.
import { BOX, CLIP_Y, makeLook, frameCanvases, REACTIONS } from "./guestgen.js"

const CROWDS = ["industrial", "residential", "commercial", "luxury"], PER = 6
const $ = (id) => document.getElementById(id)
const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c }
let seed0 = Date.now() % 100000
let figures = []                     // { cv, look, crowd }

// the glass stand-in: a clear tumbler with a drink in it, the size the game draws it, at the frame's base and tilt
function glass(cx, g) {
  if (!g) return
  cx.save(); cx.translate(g.x, g.y); cx.rotate(g.a)
  cx.fillStyle = "rgba(225,240,240,0.45)"; cx.fillRect(-12, -46, 25, 46)
  cx.fillStyle = "rgba(232,140,60,0.85)"; cx.fillRect(-11, -26, 23, 24)
  cx.strokeStyle = "#E2EEF0"; cx.strokeRect(-12.5, -46.5, 25, 46)
  cx.restore()
}
function sequence(crowd, tier, k) {
  const v = REACTIONS[crowd][tier][k % REACTIONS[crowd][tier].length]
  const react = { pose: v.hold === "toast" ? "toast" : "down", gesture: v.gesture, expr: { eyes: v.eyes, brows: v.brows, mouth: v.mouth, fx: v.fx, blush: v.blush } }
  return { v, react }
}
// one figure's picture at time t (seconds) in "play" mode, or frame index in "frames" mode
function frameAt(crowd, tier, k, t) {
  const { v, react } = sequence(crowd, tier, k), T = t % 6.5
  if (T < 1.6) return { pose: "idle", blink: T % 1.6 > 1.45 }
  if (T < 1.95) return { pose: "reach", expr: { look: [0, 2] } }
  if (T < 2.35) return { pose: "lift", expr: { look: [0, 1] } }
  if (T < 3.4) return { pose: "drink", expr: { eyes: "closed" } }
  if (T < 3.7) return { pose: "down", expr: { look: [0, 1] } }
  const rt = T - 3.7, beat = Math.floor(rt * 5), lively = rt < 1.8
  return { ...react, gesture: v.pump && lively ? (beat % 2 ? "fist2" : "fist") : react.gesture, bob: v.bounce && lively ? (beat % 2 ? -v.bounce : 0) : 0, headX: v.shudder && rt < 1 ? (beat % 2 ? 1 : -1) : 0, tick: Math.floor(rt * 3) % 2 }
}
const ALL_FRAMES = (crowd, tier, k) => [{ pose: "idle" }, { pose: "idle", blink: true }, { pose: "reach", expr: { look: [0, 2] } }, { pose: "lift", expr: { look: [0, 1] } }, { pose: "drink", expr: { eyes: "closed" } }, sequence(crowd, tier, k).react]

function paint(cv, look, f, zoom) {
  const g = frameCanvases(look, f, mk), cx = cv.getContext("2d")
  cx.imageSmoothingEnabled = false
  cx.setTransform(zoom, 0, 0, zoom, 0, 0); cx.clearRect(0, 0, BOX.w, BOX.h)
  cx.drawImage(g.body, 0, 0); glass(cx, g.glass); cx.drawImage(g.front, 0, 0)
}
function build() {
  const crowd = $("crowd").value, mode = $("mode").value, zoom = +$("zoom").value, tier = $("tier").value
  const out = $("out"); out.textContent = ""; figures = []
  for (const c of crowd === "all" ? CROWDS : [crowd]) {
    const sec = document.createElement("section"), h = document.createElement("h2"), row = document.createElement("div")
    h.textContent = c + " crowd"; row.className = "row"; sec.append(h, row); out.append(sec)
    const n = crowd === "all" ? PER : PER * 2
    for (let k = 0; k < n; k++) {
      const look = makeLook(seed0 + k * 31 + CROWDS.indexOf(c) * 1000, c)
      const list = mode === "frames" ? ALL_FRAMES(c, tier, k) : [null]
      for (const [j, f] of list.entries()) {
        const fig = document.createElement("figure"), cv = mk(BOX.w * zoom, (CLIP_Y + 18) * zoom), cap = document.createElement("figcaption")
        cap.textContent = mode === "frames" ? ["wait", "blink", "reach", "lift", "drink", tier][j] : `${look.gender}, ${look.top}, ${look.hairStyle}${look.hat ? ", " + look.hat : ""}`
        fig.append(cv, cap); row.append(fig)
        figures.push({ cv, look, crowd: c, k, fixed: f, zoom, tier, mode })
        if (f) paint(cv, look, f, zoom)
        else if (mode === "idle") paint(cv, look, { pose: "idle" }, zoom)
      }
      if (mode === "frames") break                      // one guest per crowd: all their frames in a row
    }
  }
}
// play: every figure runs through the drink, a little out of step with its neighbors
function tick(now) {
  for (const fg of figures) if (fg.mode === "play") paint(fg.cv, fg.look, frameAt(fg.crowd, fg.tier, fg.k, now / 1000 + fg.k * 0.37), fg.zoom)
  requestAnimationFrame(tick)
}
$("roll").onclick = () => { seed0 = Math.floor(Math.random() * 1e6); build() }
for (const id of ["crowd", "mode", "tier", "zoom"]) $(id).onchange = build
// one PNG of everything on the page right now
$("save").onclick = () => {
  const cols = Math.max(...[...document.querySelectorAll(".row")].map((r) => r.children.length)), rowsEl = [...document.querySelectorAll(".row")]
  const w0 = figures[0].cv.width, h0 = figures[0].cv.height, sheet = mk(cols * (w0 + 4), rowsEl.length * (h0 + 4)), sx = sheet.getContext("2d")
  sx.fillStyle = "#141A16"; sx.fillRect(0, 0, sheet.width, sheet.height)
  rowsEl.forEach((r, j) => [...r.querySelectorAll("canvas")].forEach((c, i) => sx.drawImage(c, i * (w0 + 4), j * (h0 + 4))))
  const a = document.createElement("a"); a.download = `guests-${seed0}.png`; a.href = sheet.toDataURL("image/png"); a.click()
}
build()
requestAnimationFrame(tick)
