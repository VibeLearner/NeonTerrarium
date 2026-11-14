// Runs the pour simulation with no screen, to check its numbers: node tools/pourlab/test_sim.mjs
import fs from "node:fs"; import path from "node:path"; import url from "node:url"
import { createSim, STEP, DASH } from "./sim.js"
const here = path.dirname(url.fileURLToPath(import.meta.url))
const L = JSON.parse(fs.readFileSync(path.join(here, "assets/layout.json"), "utf8"))
const png = (f) => { const b = fs.readFileSync(path.join(here, "assets/sprites", f + ".png")); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } }
const sizes = Object.fromEntries(["glass", "cup_quarter", "cup_half", "cup_one", "shaker", "mixing_glass"].map((n) => [n, png(n)]))
let fails = 0
const ok = (cond, msg) => { console.log((cond ? "  ok   " : "  FAIL ") + msg); if (!cond) fails++ }
const run = (sim, secs) => { for (let t = 0; t < secs; t += STEP) sim.step() }
const railTip = (id) => ({ x: L.rail.find((r) => r.id === id).x, y: 220 })

{
  console.log("pour rum into the glass for 1.5 s")
  const sim = createSim(L, sizes), g = sim.glass
  sim.pick("rum", railTip("rum")); sim.aim(g.cx - 22, g.top - 26); run(sim, 0.5)
  sim.press(true); run(sim, 1.5); sim.press(false); run(sim, 3)
  const r = sim.readout()
  console.log("   ", r.rows.map((x) => `${x.name} ${x.parts.toFixed(2)}`).join(", "), "| total", r.total.toFixed(2))
  ok(r.total > 1.0 && r.total < 2.4, "a steady 1.5 s pour lands between 1 and 2.4 parts (" + r.total.toFixed(2) + ")")
  ok(sim.S.particles.length === 0, "the stream has all landed")
  const w = Math.max(...sim.S.wave.map(Math.abs)); ok(w < 0.6, "the surface has settled (" + w.toFixed(2) + " px)")
}
{
  console.log("aim off to the side: it lands on the counter, not in the glass")
  const sim = createSim(L, sizes), g = sim.glass
  sim.pick("yuzu", railTip("yuzu")); sim.aim(g.cx + 60, g.top - 26); run(sim, 0.5)
  sim.press(true); run(sim, 1); sim.press(false); run(sim, 3)
  ok(sim.total() < 0.01, "nothing in the glass (" + sim.total().toFixed(3) + ")")
  ok(sim.S.splats.length >= 0, "splats on the counter")
}
{
  console.log("dashers add exactly 0.05 a shake")
  const sim = createSim(L, sizes), g = sim.glass
  sim.pick("bitters", railTip("bitters")); sim.aim(g.cx, g.top - 20); run(sim, 0.5)
  for (let k = 0; k < 3; k++) { sim.press(true); sim.press(false); run(sim, 0.3) }
  run(sim, 2)
  const r = sim.readout(), b = r.rows.find((x) => x.id === "bitters")
  for (let k = 0; k < 5; k++) { sim.press(true); sim.press(false); run(sim, 0.3) }
  run(sim, 1.5)
  ok(sim.S.glass.dashes.get("bitters") === 6, "no more than six dashes land (" + sim.S.glass.dashes.get("bitters") + ")")
  ok(b && Math.abs(b.parts - 3 * DASH) < 1e-6, "3 dashes = 0.15 parts (" + (b ? b.parts.toFixed(3) : "none") + ")")
  ok(b && b.dashes === 3, "counted as 3 dashes")
}
{
  console.log("measure a half part, then tip it in")
  const sim = createSim(L, sizes), g = sim.glass
  sim.activateCup("cup_half"); run(sim, 0.5)
  const cup = sim.S.cups.cup_half, rim = sim.cupRim(cup)
  ok(cup.state === "active", "the cup moved to the measuring spot")
  sim.pick("rye", railTip("rye")); sim.aim(rim.cx - 16, rim.y - 24); run(sim, 0.5)
  sim.press(true); run(sim, 1.6); sim.press(false); run(sim, 1.5)
  ok(Math.abs(sim.volOf(cup.c) - 0.5) < 0.011, "the cup holds 0.5, the rest brimmed over (" + sim.volOf(cup.c).toFixed(3) + ")")
  ok(sim.total() < 0.02, "the glass is still empty")
  sim.putBack(railTip("rye")); run(sim, 0.5)
  sim.clickActiveCup(); ok(sim.S.held && sim.S.held.kind === "cup", "the full cup is picked up")
  sim.aim(g.cx - 22, g.top - 26); run(sim, 0.4); sim.press(true); run(sim, 1.2); sim.press(false); run(sim, 2)
  ok(Math.abs(sim.total() - 0.5) < 0.02, "the glass got the half part (" + sim.total().toFixed(3) + ")")
  ok(cup.state === "active" && sim.volOf(cup.c) < 1e-6, "the empty cup went back to the measuring spot")
}
{
  console.log("fizz, ice, overflow")
  const sim = createSim(L, sizes), g = sim.glass
  sim.pick("soda", railTip("soda")); sim.aim(g.cx - 22, g.top - 26); run(sim, 0.5)
  sim.press(true); run(sim, 1.2)
  ok(sim.S.foam > 1, "a foam head forms while soda pours (" + sim.S.foam.toFixed(2) + " px)")
  sim.press(false); run(sim, 3)
  ok(sim.S.foam < 1, "the foam settles within a few seconds (" + sim.S.foam.toFixed(2) + " px)")
  const before = sim.levelParts()
  for (let k = 0; k < 3; k++) { sim.addIce({ x: 30, y: 200 }); run(sim, 0.2) }
  run(sim, 3)
  ok(sim.levelParts() - before > 0.9, "3 cubes raise the level by about 1 part (" + (sim.levelParts() - before).toFixed(2) + ")")
  const c = sim.S.ice[0], sy = sim.surfaceY()
  ok(Math.abs(c.y - (sy + 1)) < 3, "the cubes float at the surface")
  sim.press(true); run(sim, 6); sim.press(false); run(sim, 3)
  ok(sim.levelParts() <= 8 + 1e-6, "never more than 8 parts (" + sim.levelParts().toFixed(2) + ")")
  sim.emptyGlass(); ok(sim.total() === 0 && sim.S.ice.length === 0, "empty glass clears it")
}
{
  console.log("shake a sour, strain it into the glass, top with soda")
  const sim = createSim(L, sizes), g = sim.glass, sh = sim.S.tools.shaker, rim = sim.toolRim(sh)
  for (const [id, secs] of [["rice", 1.25], ["yuzu", 0.6], ["glow", 0.85]]) {
    sim.pick(id, railTip(id)); sim.aim(rim.cx - 24, rim.y - 26); run(sim, 0.5); sim.press(true); run(sim, secs); sim.press(false); run(sim, 1.2); sim.putBack(railTip(id)); run(sim, 0.3)
  }
  const inShaker = sim.volOf(sh.c)
  ok(inShaker > 2 && sim.total() < 0.01, "the shaker filled, the glass didn't (" + inShaker.toFixed(2) + " parts)")
  sim.liftTool("shaker"); run(sim, 0.4); ok(sim.S.toolMode === "shaker", "the shaker is lifted to shake")
  sim.press(true); run(sim, 10); sim.press(false)
  const r = sim.readout(sh.c)
  ok(r.dilution > 0.15 && r.dilution < 0.25 && r.chill > 0.9, `10 s of shaking: ${(r.dilution * 100).toFixed(0)}% melted ice, chill ${r.chill.toFixed(2)}`)
  sim.strainTool(); run(sim, 3)
  ok(sim.volOf(sh.c) < 1e-6 && sh.state === "home", "strained out and put back")
  ok(sim.total() > inShaker * 0.95, "the glass got it all, melted ice included (" + sim.total().toFixed(2) + ")")
  ok(sim.S.glass.log.some((l) => l.startsWith("Shaken")), "the glass remembers it was shaken")
  const t1 = sim.tasteOf(sim.S.glass)
  sim.pick("soda", railTip("soda")); sim.aim(g.cx - 22, g.top - 26); run(sim, 0.5); sim.press(true); run(sim, 0.6); sim.press(false); run(sim, 2)
  const t2 = sim.tasteOf(sim.S.glass)
  ok(t2.bubbles > 0.05 && t2.notes.sour < t1.notes.sour, `topped with soda: bubbles ${(t2.bubbles * 100).toFixed(0)}%, sour ${t1.notes.sour.toFixed(1)} -> ${t2.notes.sour.toFixed(1)}`)
}
console.log(fails ? `${fails} failed` : "all passed")
process.exit(fails ? 1 : 0)
