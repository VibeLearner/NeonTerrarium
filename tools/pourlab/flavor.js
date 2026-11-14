// Neon Dome flavor model, from the "Neon Dome: Drink Crafting Design" doc. No drawing: it takes what's in a vessel
// and how it was made, and returns how the drink tastes, why, and what a guest makes of it.
//
// Pipeline (always in this order, as the doc sets out):
//   raw amounts per part -> concentration (divided by the drink's volume, melted ice included) -> perception
//   (10(1 - e^(-c/8)), so doubling never doubles the taste) -> Mask -> Carry -> Fuse -> discoveries ->
//   Complexity and Balance.
// Anything the doc leaves open is marked "(lab choice)" so it's easy to find and tune.

export const BASE = ["sweet", "sour", "bitter", "strength", "fresh", "smoke", "spice"]
export const FUSED = ["depth", "brightness", "toasted"]
export const NOTES = [...BASE, ...FUSED]
export const LABEL = { sweet: "Sweet", sour: "Sour", bitter: "Bitter", strength: "Strength", fresh: "Fresh", smoke: "Smoke", spice: "Spice",
  depth: "Depth", brightness: "Brightness", toasted: "Toasted", complexity: "Complexity", balance: "Balance" }
export const PARENTS = { depth: ["sweet", "bitter"], brightness: ["sour", "fresh"], toasted: ["smoke", "sweet"] }

// values per part, tags and cost (dome credits per part), straight from the doc's Ingredients table
export const INGREDIENTS = {
  rice: { v: { strength: 20, sweet: 1 }, tags: ["spirit"], cost: 1.0 },
  rye: { v: { strength: 18, smoke: 9, spice: 2, bitter: 2 }, tags: ["spirit", "smoked"], cost: 1.4 },
  rum: { v: { strength: 17, sweet: 6, smoke: 1 }, tags: ["spirit"], cost: 1.2 },
  coffee: { v: { sweet: 12, bitter: 12, strength: 8, smoke: 4 }, tags: ["roasted"], cost: 1.1 },
  yuzu: { v: { sour: 16, fresh: 8 }, tags: ["citrus"], cost: 0.6 },
  ume: { v: { sour: 9, sweet: 9, bitter: 2 }, tags: ["fermented"], cost: 0.8 },
  lemongrass: { v: { fresh: 16, sweet: 9, sour: 2 }, tags: ["herbal"], cost: 0.5 },
  glow: { v: { sweet: 24 }, tags: ["sugar"], cost: 0.3 },
  ginger: { v: { spice: 18, sweet: 7, fresh: 2 }, tags: ["spice"], cost: 0.5 },
  shiso: { v: { bitter: 5, fresh: 6, sweet: 4 }, tags: ["fizz", "herbal"], cost: 0.4 },
  soda: { v: {}, tags: ["fizz"], cost: 0.1 },
  bitters: { v: { bitter: 40, spice: 6 }, tags: ["bitter"], cost: 2.0 },
  chili: { v: { spice: 40 }, tags: ["spice"], cost: 1.5 },
  water: { v: {}, tags: [], cost: 0 },                 // melted ice: adds volume, no taste
}
export const MAX_DASHES = 6

// technique: dilution (share of the final drink that is melted ice) and chill (0 to 1), as a function of how long
// the player held. The doc gives the maximums; the time curves are (lab choice), picked so the doc's example holds:
// a simple sour shaken 2 s keeps Balance near 9.8, at 60 s it slides to about 8.3 (diluted past 28%).
export const METHOD = {
  build: { dilution: () => 0.10, chill: () => 0.4, label: "Built over ice" },
  stir: { dilution: (t) => 0.25 * (1 - Math.exp(-t / 10)), chill: (t) => 0.9 * (1 - Math.exp(-t / 4)), label: "Stirred" },
  shake: { dilution: (t) => 0.34 * (1 - Math.exp(-t / 8)), chill: (t) => 1 - Math.exp(-t / 3), label: "Shaken" },
}
export const SHAKE_FIZZ_LEFT = 0.2                     // shaking knocks out 80% of the fizz

const perceive = (c) => 10 * (1 - Math.exp(-c / 8))
const clamp = (v, a = 0, b = 10) => Math.max(a, Math.min(b, v))

// What's in a vessel, as the flavor model needs it.
//   parts:   Map id -> parts (water included as "water")
//   chill:   0..1 for the whole drink
//   fizz:    0..1, how much of the fizzy ingredients' bubbles are still in it
//   shaken:  true once any of it was shaken (the Fresh lift for citrus or herbal)
//   method:  a short line for the technique strip
export function taste(d) {
  const parts = d.parts
  let vol = 0, ingVol = 0
  for (const [id, p] of parts) { vol += p; if (id !== "water") ingVol += p }
  const out = { notes: {}, contrib: {}, masked: {}, carried: {}, discoveries: [], ingredients: 0, volume: vol, ingVol,
    dilution: vol > 0 ? (parts.get("water") || 0) / vol : 0, chill: d.chill || 0, bubbles: 0, complexity: 0, balance: 10, drags: [] }
  if (vol <= 0) { for (const n of NOTES) out.notes[n] = 0; return out }
  out.ingredients = [...parts.keys()].filter((id) => id !== "water" && parts.get(id) > 1e-6).length

  // concentration and perception, with each ingredient's share of every note kept for the stacked bars
  const raw = {}
  for (const n of BASE) { raw[n] = 0; out.contrib[n] = [] }
  for (const [id, p] of parts) for (const [n, v] of Object.entries(INGREDIENTS[id].v)) { raw[n] += v * p; out.contrib[n].push([id, v * p]) }
  const P = {}
  for (const n of BASE) {
    P[n] = perceive(raw[n] / vol)
    out.contrib[n] = out.contrib[n].map(([id, r]) => [id, raw[n] > 0 ? P[n] * r / raw[n] : 0]).sort((a, b) => b[1] - a[1])
  }
  // bubbles: the fizzy share of the drink, times how much fizz is left (lab choice: a drink half soda is fully lively)
  let fizzy = 0
  for (const [id, p] of parts) if (INGREDIENTS[id].tags.includes("fizz")) fizzy += p
  out.bubbles = clamp((fizzy / vol) * 2 * (d.fizz ?? 1), 0, 1)
  const hasTag = (t, min = 0.2) => [...parts].some(([id, p]) => p >= min && INGREDIENTS[id].tags.includes(t))
  if (d.shaken && (hasTag("citrus", 0.01) || hasTag("herbal", 0.01))) { out.carried.fresh = [P.fresh * 0.12, "lifted by shaking"]; P.fresh *= 1.12 }

  // Mask: sugar and acid cancel; sugar hides burn and bitterness; cold mutes sweet
  const lose = (n, amt, why) => { if (amt <= 1e-6) return; P[n] -= amt; (out.masked[n] ||= []).push([amt, why]) }
  const m = Math.min(P.sweet, P.sour) * 0.3
  lose("sweet", m, "hidden by Sour"); lose("sour", m, "hidden by Sweet")
  lose("strength", Math.min(P.strength, 0.12 * P.sweet), "hidden by Sweet"); lose("bitter", Math.min(P.bitter, 0.12 * P.sweet), "hidden by Sweet")
  lose("sweet", P.sweet * 0.12 * out.chill, "muted by cold")
  // Carry: alcohol carries heat; fizz lifts aromatics
  const lift = (n, amt, why) => { if (amt <= 1e-6) return; P[n] += amt; const c = out.carried[n]; out.carried[n] = c ? [c[0] + amt, c[1] + ", " + why] : [amt, why] }
  lift("spice", P.spice * 0.04 * P.strength, "carried by Strength")
  lift("fresh", P.fresh * 0.4 * out.bubbles, "lifted by bubbles")
  for (const n of BASE) out.notes[n] = clamp(P[n])

  // Fuse: strongest when its parents are equal, easing in as the weaker parent rises from 1 to 2.5
  for (const f of FUSED) {
    const [a, b] = PARENTS[f].map((n) => out.notes[n]), lo = Math.min(a, b)
    const fade = clamp((lo - 1) / 1.5, 0, 1)
    out.notes[f] = a + b > 0 ? clamp(0.75 * Math.sqrt(a * b) * (1 - Math.abs(a - b) / (a + b)) * fade) : 0
  }
  // Discoveries: secret tag pairings (lab choice: each side needs at least a fifth of a part)
  for (const [t1, t2, note, bonus, name] of [["fermented", "smoked", "depth", 1.2, "Fermented and smoked"], ["citrus", "herbal", "brightness", 1.0, "Citrus and herbal"], ["roasted", "spice", "toasted", 1.0, "Roasted and spice"]]) {
    if (hasTag(t1) && hasTag(t2)) { out.notes[note] = clamp(out.notes[note] + bonus); out.discoveries.push({ name, note, bonus }) }
  }

  // Complexity: the effective number of clearly present notes (a diversity index), 1.5 notes -> 0, 7.5 -> 10
  const present = NOTES.map((n) => out.notes[n]).filter((v) => v > 1.5)
  const sum = present.reduce((s, v) => s + v, 0), sq = present.reduce((s, v) => s + v * v, 0)
  const eff = sq > 0 ? (sum * sum) / sq : 0
  const muddle = 0.8 * Math.max(0, out.ingredients - 5)
  out.complexity = clamp((eff - 1.5) / 6 * 10 - muddle)
  out.effectiveNotes = eff

  // Balance: starts at 10 and loses for harsh peaks (softened by chill), a towering note, muddle and wateriness
  const drag = (amt, why) => { if (amt > 0.05) out.drags.push([amt, why]) }
  for (const n of BASE) drag(2 * Math.max(0, out.notes[n] - 8) * (1 - 0.4 * out.chill), `${LABEL[n]} is harsh`)
  const sorted = BASE.map((n) => [out.notes[n], n]).sort((a, b) => b[0] - a[0])
  drag(0.5 * Math.max(0, sorted[0][0] - sorted[1][0] - 3), `${LABEL[sorted[0][1]]} drowns out the rest`)
  drag(muddle, "too many ingredients")
  drag(0.25 * Math.max(0, out.dilution * 100 - 28), "watery")
  out.drags.sort((a, b) => b[0] - a[0])
  out.balance = clamp(10 - out.drags.reduce((s, x) => s + x[0], 0))
  out.notes.complexity = out.complexity; out.notes.balance = out.balance
  return out
}

// ---------------------------------------------------------------- crowds, guests, and how they talk
// comfort ranges [low, high, weight] per axis; "loves" a fused note; budget in credits (from the doc)
export const CROWDS = {
  industrial: { name: "Industrial", ranges: { strength: [6, 9.5, 3], bitter: [4, 8, 2], sweet: [0, 3.5, 2], smoke: [2, 8, 1], balance: [3, 10, 1] }, loves: "toasted", budget: 8 },
  residential: { name: "Residential", ranges: { sweet: [6, 9.5, 3], strength: [5, 8.5, 2], bitter: [0, 3, 2], fresh: [1, 6, 0.5], balance: [4, 10, 1] }, loves: null, budget: 10 },
  commercial: { name: "Commercial", ranges: { balance: [8, 10, 3], complexity: [3.5, 6.5, 2], fresh: [4, 7.5, 2], strength: [3, 6, 2], sweet: [2, 5, 1.5], bitter: [0, 3.5, 1] }, loves: "brightness", budget: 14 },
  luxury: { name: "Luxury", ranges: { complexity: [6.5, 10, 3], balance: [6, 10, 2], bitter: [2.5, 6.5, 1.5], sweet: [2.5, 6, 1], fresh: [3, 7, 1], strength: [3, 7, 1] }, loves: "depth", budget: 24 },
}
export const MOODS = {
  rough: { name: "Rough shift", shift: { strength: 1.5 } },
  celebrating: { name: "Celebrating", shift: { sweet: 1.5, fresh: 1 } },
  hungover: { name: "Hungover", shift: { strength: -2, fresh: 1.5 } },
  restless: { name: "Restless", shift: { spice: 2 } },
}

// The phrasebook: one phrase per level per note, always meaning the same thing. Strength, Sweet, Bitter, Fresh,
// Smoke, Complexity and Balance are the doc's own; Sour and Spice, and the "none" lines the doc didn't spell out,
// are (lab choice) written in the same voice.
export const PHRASES = {
  strength: ["no alcohol for me tonight", "easy, I want to stay sharp", "some kick, not a knockout", "something with a real kick", "strong enough to erase my shift"],
  sweet: ["zero sugar", "not too sweet", "a little sweet", "sweet, like candy neon", "as sweet as you can make it"],
  sour: ["nothing sour", "just a hint of tang", "a bit tart", "sharp and sour", "sour enough to wake me up"],
  bitter: ["nothing bitter", "barely bitter", "a bitter edge", "something that bites back", "bitter as a corp memo"],
  fresh: ["nothing green", "a little lift", "fresh", "bright, like morning rain", "like breathing on a rooftop garden"],
  smoke: ["can't stand smoke", "a wisp of smoke", "smoky", "like a burnt-out server room", "pure exhaust, the good kind"],
  spice: ["no heat", "a little warmth", "some heat", "spicy", "hot enough to see sparks"],
  complexity: ["simple, nothing fussy", "simple, nothing fussy", "a few layers", "something that keeps changing as I drink it", "a whole story in a glass"],
  balance: ["rough is fine", "rough is fine", "smooth enough", "clean, nothing loud", "perfectly balanced"],
}
export const LEVELS = ["none", "low", "mid", "high", "max"]
// which level a target value reads as (lab choice: the doc names five levels, not their cut-offs)
export const levelOf = (v) => (v < 1 ? 0 : v < 3.5 ? 1 : v < 6 ? 2 : v < 8.5 ? 3 : 4)

// what guests say back, by axis and direction
const MORE = { strength: "Needed more kick.", sweet: "Could be sweeter.", sour: "Needed more tang.", bitter: "Wanted more bite.", fresh: "Needed more lift.",
  smoke: "Wanted more smoke.", spice: "Wanted more heat.", complexity: "A bit simple for me.", balance: "A little rough." }
const LESS = { strength: "Too strong for me.", sweet: "A bit too sweet for me.", sour: "Too sour.", bitter: "Too bitter.", fresh: "Too green.",
  smoke: "Too smoky.", spice: "Too hot.", complexity: "Too much going on.", balance: "Too smooth, almost boring." }
const SPOT_ON = { strength: "That kick was perfect.", sweet: "Sweet, just right.", sour: "That tang was perfect.", bitter: "That bite was perfect.", fresh: "So fresh.",
  smoke: "Love that smoke.", spice: "That heat was perfect.", complexity: "It keeps changing. I love it.", balance: "So smooth." }
export const TIERS = [[85, "Great", "This is incredible."], [65, "Good", "Nice. I like it."], [40, "Meh", "Hm. It's okay."], [0, "Bad", "I'll leave this here."]]

// A guest: their crowd plus a personal nudge (ranges slide about 0.6, weights scale 0.8 to 1.25), maybe a quirk
// (a note they hate or love), maybe a mood. These lab guests ask in vibe words, like the doc's regulars.
export function makeGuest(R, crowdId) {
  const ids = Object.keys(CROWDS)
  const cid = crowdId || ids[Math.floor(R() * ids.length)], C = CROWDS[cid]
  const ranges = {}
  for (const [ax, [lo, hi, w]] of Object.entries(C.ranges)) {
    const s = (R() - 0.5) * 1.2
    ranges[ax] = [clamp(lo + (lo > 0 ? s : 0)), clamp(hi + (hi < 10 ? s : 0)), w * (0.8 + R() * 0.45)]
  }
  let quirk = null, mood = null
  if (R() < 0.3) {
    const n = BASE.filter((b) => b !== "strength")[Math.floor(R() * 6)]
    quirk = R() < 0.6 ? { note: n, kind: "hate" } : { note: n, kind: "love" }
    ranges[n] = quirk.kind === "hate" ? [0, 0.8, 3] : [6, 10, 2.5]
  }
  if (R() < 0.5) {
    const k = Object.keys(MOODS)[Math.floor(R() * 4)]; mood = { id: k, ...MOODS[k] }
    for (const [ax, d] of Object.entries(mood.shift)) {
      if (ranges[ax]) ranges[ax] = [clamp(ranges[ax][0] + d), clamp(ranges[ax][1] + d), ranges[ax][2]]
      else ranges[ax] = d > 0 ? [clamp(d + 1), 10, 1.5] : [0, clamp(5 + d), 1.5]
    }
  }
  return { crowd: cid, crowdName: C.name, ranges, loves: C.loves, budget: C.budget, quirk, mood }
}

// What they say: the three things that matter most to them (heaviest weights), a quirk or a mood always said.
export function request(g) {
  const axes = Object.entries(g.ranges).map(([ax, [lo, hi, w]]) => ({ ax, lo, hi, w, must: (g.quirk && g.quirk.note === ax) || (g.mood && ax in g.mood.shift) }))
  axes.sort((a, b) => (b.must - a.must) || (b.w - a.w))
  const said = axes.slice(0, 3).map((a) => {
    const target = a.ax === "balance" || (a.hi >= 10 && a.lo > 0) ? (a.lo + 10) / 2 : (a.lo + a.hi) / 2
    const lv = a.lo <= 0 && a.hi <= 1 ? 0 : levelOf(target)
    const text = PHRASES[a.ax][lv]
    return { ax: a.ax, level: lv, text: text[0].toUpperCase() + text.slice(1) + "." }
  })
  return said
}

// The score: 0 to 100 by how far the drink falls outside each comfort range (small misses squared, big ones linear),
// plus up to 6 for a loved fused note rising from 1.5 to 3.5. Ingredients never count, only taste.
export function score(g, t) {
  let wsum = 0, psum = 0
  const misses = []
  for (const [ax, [lo, hi, w]] of Object.entries(g.ranges)) {
    const v = t.notes[ax] ?? 0
    const miss = v < lo ? lo - v : v > hi ? v - hi : 0
    const pen = miss < 1 ? miss * miss : 2 * miss - 1
    wsum += w; psum += w * pen
    misses.push({ ax, v, lo, hi, w, miss, dir: v < lo ? 1 : v > hi ? -1 : 0, cost: w * pen })
  }
  const P = wsum > 0 ? psum / wsum : 0
  const love = g.loves ? 6 * clamp((t.notes[g.loves] - 1.5) / 2, 0, 1) : 0
  const S = clamp(100 * Math.exp(-P) + love, 0, 100)
  const tier = TIERS.find(([min]) => S >= min)
  return { score: S, tier: tier[1], line: tier[2], misses, love }
}

// What they say back, in the same words: the biggest misses, or praise for what mattered most to them.
export function feedback(g, t, s) {
  const lines = [], arrows = {}
  const bad = s.misses.filter((m) => m.miss > 0.35).sort((a, b) => b.cost - a.cost).slice(0, 2)
  for (const m of bad) { lines.push(m.dir > 0 ? MORE[m.ax] : LESS[m.ax]); arrows[m.ax] = m.dir }
  if (lines.length < 2 && s.score >= 65) {
    const good = s.misses.filter((m) => m.miss === 0 && SPOT_ON[m.ax]).sort((a, b) => b.w - a.w)[0]
    if (good) { lines.push(SPOT_ON[good.ax]); arrows[good.ax] = 0 }
  }
  return { lines: [s.line, ...lines], arrows }
}

// cost of the drink in dome credits (for later rounds: menu prices)
export const costOf = (parts) => [...parts].reduce((s, [id, p]) => s + p * INGREDIENTS[id].cost, 0)
