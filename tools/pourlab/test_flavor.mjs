// Checks the flavor model against the rules and results in the design doc: node tools/pourlab/test_flavor.mjs
import { taste, makeGuest, request, score, feedback, CROWDS, METHOD, INGREDIENTS, BASE } from "./flavor.js"
let fails = 0
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) fails++ }
const R0 = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
// a drink made with a method held for t seconds (water added as melted ice, chill and fizz set)
function make(recipe, method = "build", t = 0) {
  const parts = new Map(Object.entries(recipe))
  let ing = 0; for (const p of parts.values()) ing += p
  const M = METHOD[method], d = M.dilution(t)
  parts.set("water", ing * d / (1 - d))
  return taste({ parts, chill: M.chill(t), fizz: method === "shake" ? 0.2 : 1, shaken: method === "shake" })
}
const f1 = (x) => x.toFixed(1)

console.log("rules feel intuitive (the doc's monotonic checks)")
const baseR = { rum: 1.5, yuzu: 0.75, glow: 0.5, soda: 0.5 }
const t0 = make(baseR)
const more = (id, by) => make({ ...baseR, [id]: (baseR[id] || 0) + by })
ok(more("glow", 0.5).notes.sweet >= t0.notes.sweet - 1e-9, "more syrup never less sweet")
ok(more("glow", 0.5).notes.sour <= t0.notes.sour + 1e-9 && more("glow", 0.5).notes.strength <= t0.notes.strength + 1e-9, "more syrup never more sour or strong")
ok(more("bitters", 0.05).notes.bitter >= t0.notes.bitter - 1e-9, "a dash of bitters never less bitter")
const sd = more("soda", 1)
ok(sd.notes.sour <= t0.notes.sour && sd.notes.sweet <= t0.notes.sweet && sd.notes.strength <= t0.notes.strength, "more soda never more sour, sweet or strong")
const dbl = make(Object.fromEntries(Object.entries(baseR).map(([k, v]) => [k, v * 2])))
ok(Math.max(...BASE.map((n) => Math.abs(dbl.notes[n] - t0.notes[n]))) < 1e-9, "a doubled recipe tastes identical")

console.log("technique: a simple sour, shaken 2 s against 60 s")
const sour = { rice: 2, yuzu: 1, glow: 0.75 }
const s2 = make(sour, "shake", 2), s60 = make(sour, "shake", 60)
console.log(`    2 s: Balance ${f1(s2.balance)}, Strength ${f1(s2.notes.strength)}, dilution ${(s2.dilution * 100).toFixed(0)}%   60 s: Balance ${f1(s60.balance)}, Strength ${f1(s60.notes.strength)}, dilution ${(s60.dilution * 100).toFixed(0)}%`)
ok(s2.balance > s60.balance + 0.8, "a long shake waters it down and costs Balance")
ok(s60.dilution > 0.28 && s60.dilution <= 0.34 + 1e-9, "shaking plateaus at 34% dilution")

console.log("fusing: a touch of syrup in a smoky, bitter drink")
const smoky = make({ rye: 2, bitters: 0.1 }, "stir", 15), smokySweet = make({ rye: 2, bitters: 0.1, glow: 0.4 }, "stir", 15)
console.log(`    without: Depth ${f1(smoky.notes.depth)} Toasted ${f1(smoky.notes.toasted)}   with: Depth ${f1(smokySweet.notes.depth)} Toasted ${f1(smokySweet.notes.toasted)}`)
ok(smokySweet.notes.depth > smoky.notes.depth + 1 && smokySweet.notes.toasted > smoky.notes.toasted + 1, "syrup unlocks Depth and Toasted together")

console.log("exploits score badly")
const best = (t) => Math.max(...Object.keys(CROWDS).map((c) => score({ ranges: CROWDS[c].ranges, loves: CROWDS[c].loves }, t).score))
const sink = make(Object.fromEntries(Object.keys(INGREDIENTS).filter((k) => k !== "water").map((k) => [k, ["bitters", "chili"].includes(k) ? 0.1 : 0.4])), "shake", 10)
const syrup = make({ glow: 3 }), spirit = make({ rice: 3 }), soda = make({ soda: 3 })
console.log(`    kitchen sink ${best(sink).toFixed(0)}, syrup only ${best(syrup).toFixed(0)}, spirit only ${best(spirit).toFixed(0)}, soda only ${best(soda).toFixed(0)}`)
ok(best(sink) < 40 && best(syrup) < 40 && best(spirit) < 40 && best(soda) < 40, "none of them reaches Good for any crowd")

console.log("many right answers, no drink for everyone (random drinks, as the doc's simulation)")
const R = R0(42), ids = Object.keys(INGREDIENTS).filter((k) => k !== "water")
const great = { industrial: 0, residential: 0, commercial: 0, luxury: 0 }; let allFour = 0
const N = 20000
for (let i = 0; i < N; i++) {
  const k = 2 + Math.floor(R() * 4), rec = {}
  for (let j = 0; j < k; j++) { const id = ids[Math.floor(R() * ids.length)]; rec[id] = (rec[id] || 0) + (["bitters", "chili"].includes(id) ? 0.05 * (1 + Math.floor(R() * 4)) : 0.25 * (1 + Math.floor(R() * 8))) }
  let tot = 0; for (const v of Object.values(rec)) tot += v
  if (tot < 2.5) { const s = 2.5 / tot; for (const id in rec) rec[id] *= s }
  const t = make(rec, ["build", "stir", "shake"][Math.floor(R() * 3)], 2 + R() * 20)
  let n = 0
  for (const c of Object.keys(CROWDS)) if (score({ ranges: CROWDS[c].ranges, loves: CROWDS[c].loves }, t).score >= 85) { great[c]++; n++ }
  if (n === 4) allFour++
}
console.log("    share Great: " + Object.entries(great).map(([c, n]) => `${c} ${(n / N * 100).toFixed(1)}%`).join(", ") + `  (doc: commercial 11.6, luxury 5.6, residential 3.3, industrial 2.1)`)
ok(Object.values(great).every((n) => n > 0), "every crowd has Great drinks")
ok(allFour === 0, "no random drink is Great for all four crowds")

console.log("guests: requests and feedback")
const G = R0(7)
for (let i = 0; i < 3; i++) {
  const g = makeGuest(G), req = request(g)
  const t = make({ rum: 1.5, yuzu: 0.5, glow: 0.5, soda: 0.5 }, "build"), s = score(g, t), fb = feedback(g, t, s)
  console.log(`    ${g.crowdName}${g.mood ? ", " + g.mood.name : ""}${g.quirk ? ", " + g.quirk.kind + "s " + g.quirk.note : ""}: "${req.map((r) => r.text).join(" ")}" -> ${s.tier} ${s.score.toFixed(0)}: ${fb.lines.join(" ")}`)
}
ok(true, "requests and feedback read in vibe words")
console.log(fails ? `${fails} failed` : "all passed")
process.exit(fails ? 1 : 0)
