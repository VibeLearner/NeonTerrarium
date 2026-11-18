// The order audit: does what a guest says match what they score, and can the player make it?
// Run: node tools/pourlab/audit_orders.mjs [seed] [guests per stage]
//
// For guests at several stages of the shop it checks:
//   1. Said vs scored: every note or dial that can pull the score down for being too LOW must be one the guest said
//      (or Balance, which is about the drink being harsh, not a note). Unsaid notes may only have upper limits.
//   2. Feedback: "more X" / "where's the X" lines only for things they asked for.
//   3. Makeable: the bot's best drink lands every said thing within half a point of what they asked, and scores Good
//      or better.
//   4. Plain routes: for each said "lots of X" with "none of Y", there's an owned bottle (or a dasher) that gives X
//      with little Y, so a person can see how to make it, not just a search.
import { makeGuest, request, score, feedback, taste, INGREDIENTS, BASE, levelOf } from "./flavor.js"
import { STARTER, BUYABLE, ITEMS, isGarnish } from "./catalog.js"
import { seedVoices } from "./voices.js"
import { servableGuest, bestDrink, drinkOf, plainRoute } from "./bot.js"

const SEED = +(process.argv[2] || 3), N = +(process.argv[3] || 60)
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
seedVoices(rng(SEED + 1))
const R = rng(SEED)
const order = [...BUYABLE].sort(() => R() - 0.5)
let fails = 0
const examples = []
for (const k of [0, 10, 20, 40]) {
  const owned = [...STARTER, ...order.slice(0, k)]
  const tally = { guests: 0, hiddenFloor: 0, unsaidMore: 0, saidMissed: 0, notGood: 0, noRoute: 0 }
  for (let i = 0; i < N; i++) {
    const g = servableGuest(R, null, { owned, fresh: [] }), said = request(g), saidAx = new Set(said.map((s) => s.ax))
    tally.guests++
    // 1. hidden floors
    const floors = Object.entries(g.ranges).filter(([ax, [lo]]) => lo > 0.05 && !saidAx.has(ax) && ax !== "balance")
    if (floors.length) { tally.hiddenFloor++; if (examples.length < 6) examples.push(`stage ${k}: unsaid floor ${floors.map(([a, r]) => a + " " + r[0].toFixed(1)).join(", ")} | said: ${said.map((s) => s.text).join(" ")}`) }
    // 3. the bot's best, and what the guest says back to it and to a rough human try
    const b = bestDrink(g, owned, R, 700, 6, true), t = taste(drinkOf(b.r)), s = score(g, t)
    if (s.score < 65) tally.notGood++
    for (const sx of said) if (sx.ax !== "garnish") { const m = s.misses.find((mm) => mm.ax === sx.ax); if (m && m.miss > 0.5) { tally.saidMissed++; if (examples.length < 12) examples.push(`stage ${k}: best drink misses said ${sx.ax} by ${m.miss.toFixed(1)} (${m.v.toFixed(1)} vs ${m.lo.toFixed(1)}-${m.hi.toFixed(1)}) | ${said.map((q) => q.text).join(" ")}`); break } }
    // 2. feedback on a rough try: the best drink with every amount nudged
    const rough = { ...b.r, parts: new Map([...b.r.parts].map(([id, p]) => [id, Math.max(0.25, p + (R() < 0.5 ? -0.5 : 0.5))])) }
    const tr = taste(drinkOf(rough)), sr = score(g, tr), fb = feedback(g, tr, sr)
    for (const m of sr.misses.filter((mm) => mm.miss > 0.35).sort((a, b2) => b2.cost - a.cost).slice(0, 2)) if (m.dir > 0 && !saidAx.has(m.ax) && m.ax !== "balance") { tally.unsaidMore++; if (examples.length < 18) examples.push(`stage ${k}: says "${fb.lines.slice(1).join(" ")}" about unsaid ${m.ax} | asked: ${said.map((q) => q.text).join(" ")}`); break }
    // 4. a plain route for "lots of X" with "none of Y"
    if (!plainRoute(g, owned)) { tally.noRoute++; if (examples.length < 24) examples.push(`stage ${k}: no plain route | ${said.map((q) => q.text).join(" ")}`) }
  }
  console.log(`stage ${String(k).padStart(2)}: ${tally.guests} guests | unsaid floors ${tally.hiddenFloor} | "more" about unsaid ${tally.unsaidMore} | best drink misses a said thing ${tally.saidMissed} | best under Good ${tally.notGood} | no plain route ${tally.noRoute}`)
  if (tally.hiddenFloor || tally.unsaidMore || tally.saidMissed || tally.notGood || tally.noRoute) fails++
}
for (const e of examples) console.log("  " + e)
console.log(fails ? `\n${fails} stages with problems` : "\nall orders say what they score, and can be made")
process.exit(fails ? 1 : 0)
