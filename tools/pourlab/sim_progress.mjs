// The progression simulation: a bot bartender plays the whole game, night after night, with what the bar owns.
// Run: node tools/pourlab/sim_progress.mjs [seed] [--quick]
//
// What it checks:
//   1. Every order can be made well with what the bar owns (the bot searches for the best drink each guest could
//      get; its best should be Great nearly always, and never worse than Good).
//   2. Pacing: nights and hours to unlock everything for a relaxed player (8 guests a night, scores a bit under the
//      bot's best) and a quick one (16 a night, scores closer to the bot's).
//   3. Orders follow the shelf: no guest asks for a note or a garnish the bar can't make.
//   4. The new notes behave the way a player would guess (fruit makes Fruity, cream softens kick, and so on).
//   5. Edge cases in the taste model and the save state.
import { taste, makeGuest, request, score, INGREDIENTS, BASE, NEW_NOTES, FUSED, reach } from "./flavor.js"
import { ITEMS, STARTER, BUYABLE, GARNISHES, isGarnish } from "./catalog.js"
import { seedVoices } from "./voices.js"
import * as E from "./economy.js"

const SEED = +(process.argv[2] || 7), QUICK = process.argv.includes("--quick")
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
seedVoices(rng(SEED + 99))
let fails = 0
const fail = (msg) => { fails++; console.log("  FAIL " + msg) }
const ok = (cond, msg) => { if (!cond) fail(msg) }

// the bot bartender lives in bot.js (the bar uses it too, to check each guest's order can be made)
import { drinkOf, bestDrink as best0, servableGuest, SERVABLE } from "./bot.js"
const bestDrink = (g, owned, R, iters = QUICK ? 350 : 700, starts = QUICK ? 4 : 7) => best0(g, owned, R, iters, starts)

// ---------------------------------------------------------------- 1, 3. orders follow the shelf and can be made
// The bar's progress in stages: the starter set, then items bought in a fixed shuffled order (as a player might).
const R = rng(SEED)
const order = [...BUYABLE].sort(() => R() - 0.5)
const stages = QUICK ? [0, 10, 20, 30, 40] : [0, 5, 10, 15, 20, 25, 30, 35, 40]
const perStage = QUICK ? 24 : 40
console.log(`Orders and how well they can be made (bot's best score; ${perStage} guests per stage)`)
const allBest = []
for (const k of stages) {
  const owned = [...STARTER, ...order.slice(0, k)], top = reach(owned)
  const fresh = order.slice(Math.max(0, k - 5), k)
  const scores = [], asks = { new: 0, garnish: 0, crave: 0 }
  let worst = null, raw = 0, rawBad = 0, ms = 0
  for (let i = 0; i < perStage; i++) {
    // the raw guest first (how often the generator alone makes an order the shelf can't serve), then the checked
    // guest the bar actually gets
    const g0 = makeGuest(R, null, { owned, fresh }); raw++; if (bestDrink(g0, owned, R).score < 65) rawBad++
    const t0 = performance.now(), g = servableGuest(R, null, { owned, fresh }); ms += performance.now() - t0
    const said = request(g)
    // 3: the order follows the shelf
    for (const ax of Object.keys(g.ranges)) if (NEW_NOTES.includes(ax)) { ok(top[ax] >= 3, `stage ${k}: ${g.crowd} has a ${ax} range but the bar reaches ${top[ax].toFixed(1)}`); asks.new++ }
    for (const s2 of said) if (NEW_NOTES.includes(s2.ax)) ok(top[s2.ax] >= 3, `stage ${k}: asked for ${s2.ax} without a way to make it`)
    if (g.garnishAsk) { asks.garnish++; ok(owned.some((id) => isGarnish(id) && ITEMS[id].fam.includes(g.garnishAsk)), `stage ${k}: garnish ask "${g.garnishAsk}" with none of that kind owned`) }
    if (g.craving) asks.crave++
    for (const [ax, [lo, hi]] of Object.entries(g.ranges)) ok(lo <= hi && lo >= 0 && hi <= 10, `stage ${k}: bad range ${ax} ${lo}..${hi}`)
    const b = bestDrink(g, owned, R)
    scores.push(b.score); allBest.push(b.score)
    if (!worst || b.score < worst.score) worst = { score: b.score, g, said, r: b.r }
  }
  scores.sort((a, b) => a - b)
  const great = scores.filter((s) => s >= 85).length / scores.length, good = scores.filter((s) => s >= 65).length / scores.length
  console.log(`  ${String(k).padStart(2)} bought: median ${scores[scores.length >> 1].toFixed(0)}, worst ${scores[0].toFixed(0)}, Great ${(great * 100).toFixed(0)}%, Good+ ${(good * 100).toFixed(0)}%   new-note ranges ${asks.new}, cravings ${asks.crave}, garnish asks ${asks.garnish}; raw orders under Good ${rawBad}/${raw}; check ${(ms / perStage).toFixed(0)} ms a guest`)
  if (k === 0) ok(asks.new === 0 && asks.garnish === 0 && asks.crave === 0, "starter bar: no new notes or garnishes asked")
  ok(good >= 0.98 && scores[0] >= 60, `stage ${k}: only ${(good * 100).toFixed(0)}% of orders can reach Good (worst ${scores[0].toFixed(0)})`)
  if (worst.score < 65) {
    console.log(`    worst: ${worst.g.crowd} wants ${worst.said.map((s2) => s2.text).join(" ")} best ${worst.score.toFixed(0)}: ${[...worst.r.parts].map(([i2, p2]) => i2 + " " + p2).join(", ")} ${worst.r.method}`)
    console.log(`    ranges ${JSON.stringify(Object.fromEntries(Object.entries(worst.g.ranges).map(([a2, r2]) => [a2, r2.map((x) => +x.toFixed(1))])))} quirk ${JSON.stringify(worst.g.quirk)} mood ${worst.g.mood && worst.g.mood.id} crave ${JSON.stringify(worst.g.craving)} garnish ${worst.g.garnishAsk}`)
    const again = bestDrink(worst.g, owned, R, 3000, 12); console.log(`    a longer search finds ${again.score.toFixed(0)}`)
  }
}

// ---------------------------------------------------------------- 2. pacing
// A player: guests per night, how far under the bot's best they land (a person adjusts by taste, not by search),
// and a shopping habit (cheapest first is the slowest way to finish; we buy what the player can afford, a mix).
function playthrough(guestsPerNight, slip, seed) {
  const R2 = rng(seed), p = E.newProgress(), nights = []
  for (let night = 1; night <= 20 && p.owned.length < STARTER.length + BUYABLE.length; night++) {
    for (let k = 0; k < guestsPerNight; k++) {
      const g = makeGuest(R2, null, { owned: p.owned, fresh: p.fresh })
      const b = bestDrink(g, p.owned, R2, 300, 3)
      const s = Math.max(0, b.score - slip * (0.6 + R2() * 0.8))
      E.recordGuest(p, g.crowd, s)
    }
    const earned = E.endNight(p)
    // shopping: a random affordable thing until nothing affordable is left
    let bought = 0
    for (;;) {
      const can = BUYABLE.filter((id) => !E.canBuy(p, id)); if (!can.length) break
      E.buy(p, can[Math.floor(R2() * can.length)]); bought++
    }
    nights.push({ night, earned, bought, owned: p.owned.length - STARTER.length })
    if (p.owned.length < STARTER.length + BUYABLE.length) E.startNight(p)
  }
  return nights
}
console.log(`\nPacing (all ${BUYABLE.length} items cost ${E.TOTAL_PRICE} credits; a night is ${(E.NIGHT_SECONDS / 60).toFixed(1)} minutes)`)
for (const [name, gpn, slip] of [["one guest a night", 1, 15], ["still learning", 8, 35], ["relaxed", 8, 14], ["steady", 12, 10], ["quick", 16, 8]]) {
  const runs = (QUICK ? [1, 2] : [1, 2, 3]).map((s) => playthrough(gpn, slip, SEED * 31 + s))
  const n = runs.map((r) => r.length), avg = n.reduce((a, b) => a + b, 0) / n.length
  const per = runs[0].map((x) => x.earned)
  console.log(`  ${name.padEnd(18)} ${gpn} guests: ${avg.toFixed(1)} nights = ${(avg * E.NIGHT_SECONDS / 3600).toFixed(2)} h (runs ${n.join(", ")}), earned per night ${per.slice(0, 6).join(", ")}${per.length > 6 ? "..." : ""}`)
  if (name === "relaxed") ok(avg * E.NIGHT_SECONDS / 3600 <= 2.3 && avg * E.NIGHT_SECONDS / 3600 >= 1.7, `relaxed pace ${(avg * E.NIGHT_SECONDS / 3600).toFixed(2)} h, want about 2`)
  if (name === "quick") ok(avg * E.NIGHT_SECONDS / 3600 <= 1.75 && avg * E.NIGHT_SECONDS / 3600 >= 1.25, `quick pace ${(avg * E.NIGHT_SECONDS / 3600).toFixed(2)} h, want about 1.5`)
}

// ---------------------------------------------------------------- 4. the new notes make intuitive sense
console.log("\nIntuition checks")
const mk = (parts, method = "shake", t = 8, garnish = null) => taste(drinkOf({ parts: new Map(Object.entries(parts)), dashes: new Map(), method, t, garnish }))
const base = mk({ rice: 1.5, yuzu: 0.75, glow: 0.5 })
const t1 = mk({ rice: 1.5, yuzu: 0.75, glow: 0.5, passion: 0.75 })
ok(t1.notes.fruity > 2.5 && base.notes.fruity === 0, "passionfruit makes it Fruity")
ok(t1.notes.juicy > 1.5, `fruit with sour makes it Juicy (${t1.notes.juicy.toFixed(1)})`)
const c0 = mk({ rice: 1.5, coffee: 1 }), c1 = mk({ rice: 1.5, coffee: 1, cream: 1 })
ok(c1.notes.creamy > 3, "cream liqueur makes it Creamy")
ok(c1.masked.strength && c1.masked.bitter, "cream softens kick and bitterness")
ok(c1.notes.velvet > 1.5, `cream with sweet makes it Velvet (${c1.notes.velvet.toFixed(1)})`)
ok(c1.discoveries.some((d) => d.name === "Cream and roast"), "cream with coffee is a discovery")
const f0 = mk({ gin: 1.5, bloom: 1, yuzu: 0.5 }), f1 = mk({ gin: 1.5, bloom: 1, yuzu: 0.5, rye: 0.5 })
ok(f0.notes.floral > 3, "elderflower makes it Floral")
ok(f1.masked.floral, "smoke covers flowers")
const fz0 = mk({ gin: 1.5, lavender: 0.75, tonic: 1.5 }, "build"), fz1 = mk({ gin: 1.5, lavender: 0.75, tonic: 1.5 }, "shake", 10)
ok(fz0.notes.floral > fz1.notes.floral, "bubbles lift flowers (a built highball is more floral than a shaken one)")
const sa0 = mk({ rice: 1.5, grapefruit: 1, glow: 0.25 }), sa1 = mk({ rice: 1.5, grapefruit: 1, glow: 0.25 }, "shake", 8, "salt")
ok(sa1.notes.bitter < sa0.notes.bitter && sa1.notes.sweet > sa0.notes.sweet, "a salt rim hides bitter and tastes sweeter")
const ga = mk({ rice: 1.5, yuzu: 0.75, glow: 0.5 }, "shake", 8, "twist")
ok(Math.abs(ga.notes.fresh - base.notes.fresh - 1.2) < 0.01, "a lemon twist adds 1.2 Fresh, whatever the drink")
const big = mk({ rice: 3, yuzu: 1.5, glow: 1 }, "shake", 8, "twist"), bigBase = mk({ rice: 3, yuzu: 1.5, glow: 1 })
ok(Math.abs((big.notes.fresh - bigBase.notes.fresh) - 1.2) < 0.01, "a garnish adds the same to a big drink")
const lp = mk({ lapsang: 1.5, yuzu: 0.75, glow: 0.5 })
ok(lp.notes.smoke > 3 && lp.notes.strength === 0, "smoked tea gives smoke with no alcohol")
const sh = mk({ shochu: 2, yuzu: 0.5, glow: 0.25 }), rc = mk({ rice: 2, yuzu: 0.5, glow: 0.25 })
ok(sh.notes.strength < rc.notes.strength - 1.5, "shochu is gentler than rice spirit")
const an = mk({ anise: 2, yuzu: 0.5, glow: 0.25 })
ok(an.notes.strength > rc.notes.strength, "anise is the strongest")
console.log(`  passion sour: Fruity ${t1.notes.fruity.toFixed(1)}, Juicy ${t1.notes.juicy.toFixed(1)}; coffee cream: Creamy ${c1.notes.creamy.toFixed(1)}, Strength ${c0.notes.strength.toFixed(1)} -> ${c1.notes.strength.toFixed(1)}, Velvet ${c1.notes.velvet.toFixed(1)}`)
console.log(`  floral: ${f0.notes.floral.toFixed(1)}, with rye ${f1.notes.floral.toFixed(1)}; highball floral built ${fz0.notes.floral.toFixed(1)} vs shaken ${fz1.notes.floral.toFixed(1)}; salt bitter ${sa0.notes.bitter.toFixed(1)} -> ${sa1.notes.bitter.toFixed(1)}`)

// every bought ingredient shows up as its own note in a simple drink, and nothing dominates absurdly
for (const id of BUYABLE.filter((i) => !isGarnish(i))) {
  const it = ITEMS[id], amt = it.dash ? null : 1
  const r = { parts: new Map([["rice", 1.25], ["yuzu", 0.5], ["glow", 0.25]]), dashes: new Map(), method: "shake", t: 8, garnish: null }
  if (it.dash) r.dashes.set(id, 4); else r.parts.set(id, amt)
  const t = taste(drinkOf(r)), mainNote = Object.entries(it.v).sort((a, b) => b[1] - a[1])[0][0]
  ok(t.notes[mainNote] >= 2, `${id}: its main note ${mainNote} reads ${t.notes[mainNote].toFixed(1)} in a simple drink`)
  for (const n of BASE) ok(t.notes[n] >= 0 && t.notes[n] <= 10, `${id}: ${n} out of range`)
}

// ---------------------------------------------------------------- 5. edge cases
console.log("\nEdge cases")
const empty = taste({ parts: new Map(), chill: 0, fizz: 1, shaken: false, garnish: "orchid" })
ok(Object.values(empty.notes).every((v) => v === 0), "an empty glass with a garnish tastes of nothing")
const water = taste({ parts: new Map([["water", 3]]), chill: 1, fizz: 1, shaken: false, garnish: "salt" })
ok(Object.values(water.notes).every((v) => v >= 0), "salt on plain water: no note below zero")
const nobitter = mk({ rice: 1.5, yuzu: 0.75, glow: 0.5 }, "shake", 8, "salt")
ok(nobitter.notes.bitter === 0, "salt rim on a drink with no bitter stays at 0")
const unknown = taste({ parts: new Map([["rice", 2], ["water", 0.5]]), chill: 0.5, fizz: 1, shaken: false, garnish: "nope" })
ok(!unknown.garnish && unknown.notes.strength > 0, "an unknown garnish is ignored")
const garnAsIng = taste({ parts: new Map([["rice", 2]]), chill: 0.5, fizz: 1, shaken: false, garnish: "rice" })
ok(!garnAsIng.garnish, "a bottle can't be a garnish")
const all = {}; for (const id of Object.keys(INGREDIENTS)) if (id !== "water") all[id] = INGREDIENTS[id].dash ? 0.05 : 0.3
const sink = mk(all, "shake", 10, "orchid")
ok(NOTES_OK(sink), "everything at once: every note within 0..10, complexity floored by the muddle penalty")
function NOTES_OK(t) { return [...BASE, ...FUSED].every((n) => t.notes[n] >= 0 && t.notes[n] <= 10) && t.complexity >= 0 && t.complexity <= 10 && t.balance >= 0 && t.balance <= 10 }
ok(sink.drags.some((d) => /ingredients/.test(d[1])), "too many ingredients still drags Balance")
// a guest asking for a garnish: no garnish, the wrong kind, the right kind
const R3 = rng(5)
let gg = null; for (let i = 0; i < 200 && !gg; i++) { const g = makeGuest(R3, null, { owned: [...STARTER, "twist", "cherry"] }); if (g.garnishAsk) gg = g }
ok(!!gg, "garnish asks happen once garnishes are owned")
if (gg) {
  const fam = gg.garnishAsk, right = ["twist", "cherry"].find((id) => ITEMS[id].fam.includes(fam)), wrong = ["twist", "cherry"].find((id) => !ITEMS[id].fam.includes(fam))
  const d0 = mk({ rice: 1.5, yuzu: 0.75, glow: 0.5 }), d1 = mk({ rice: 1.5, yuzu: 0.75, glow: 0.5 }, "shake", 8, right)
  const s0 = score(gg, d0), s1 = score(gg, d1)
  ok(s0.garnishHit === "none" && s1.garnishHit === "match", "garnish ask: none, then a match")
  if (wrong) { const s2 = score(gg, mk({ rice: 1.5, yuzu: 0.75, glow: 0.5 }, "shake", 8, wrong)); ok(s2.garnishHit === "other", "garnish ask: the wrong kind is told apart") }
}
// the save: junk in, starter out; partial saves repaired
ok(E.sanitize(null).owned.length === STARTER.length, "no save: the starter bar")
const junk = E.sanitize({ v: 1, owned: ["rice", "nope", "gin", "gin", "twist"], credits: -50, rail: { spirit: ["gin", "gin", "yuzu", "nope"], mixer: [] }, night: "x" })
ok(junk.credits === 0 && junk.night === 1, "a broken save: credits and night repaired")
ok(junk.rail.spirit.length === 4 && junk.rail.mixer.length === 9 && new Set(junk.rail.spirit).size === 4 && junk.rail.spirit[0] === "gin", "a broken save: the rail is refilled, unique, on the right sides")
ok(!junk.rail.spirit.includes("yuzu"), "a mixer can't sit on the spirit side")
const p = E.newProgress(); p.credits = 1000
ok(E.buy(p, "rice") === "not for sale", "starter bottles aren't sold")
ok(E.buy(p, "gin") === null && E.buy(p, "gin") === "owned", "nothing is bought twice")
const p2 = E.newProgress(); p2.credits = 5
ok(E.buy(p2, "gin") === "short" && p2.credits === 5, "no buying into debt")
ok(E.swapIntoRail(p, "gin", 0) === null && p.rail.spirit[0] === "gin", "gin swaps into a spirit slot")
ok(E.onShelf(p).includes("rice"), "the swapped-out bottle goes to the shelf")
ok(E.swapIntoRail(p, "yuzu", 0) === null && p.rail.mixer[0] === "yuzu", "a bottle already on the rail just trades places")
ok(E.swapIntoRail(p, "twist", 0) === "not owned", "a garnish never goes on the rail")
const p3 = E.newProgress(); for (let k = 0; k < 20; k++) E.recordGuest(p3, "luxury", 100)
ok(p3.tonight.guests[19].tip < p3.tonight.guests[0].tip, "later guests tip a little less")
ok(E.tipFor("luxury", 30, 0) === 0 && E.tipFor("luxury", 95, 0) === E.TIP.luxury, "no tip for a Bad drink, the full tip at 95")
const one = E.newProgress(); E.recordGuest(one, "industrial", 50); const paid = E.endNight(one)
ok(paid >= E.WAGE, "one guest a night still earns the wage")
ok(E.clockText(20) === "20:00" && E.clockText(28.5) === "04:30" && E.clockText(29) === "05:00", "the clock reads right across midnight")

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
process.exit(fails ? 1 : 0)
