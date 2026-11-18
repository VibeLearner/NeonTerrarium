import { pickLine, NONE_WORD } from "./voices.js"
import { ITEMS, STARTER, GARNISHES, isGarnish } from "./catalog.js"
// Neon Dome flavor model, from the "Neon Dome: Drink Crafting Design" doc. No drawing: it takes what's in a vessel
// and how it was made, and returns how the drink tastes, why, and what a guest makes of it.
//
// Pipeline (always in this order, as the doc sets out):
//   raw amounts per part -> concentration (divided by the drink's volume, melted ice included) -> perception
//   (10(1 - e^(-c/8)), so doubling never doubles the taste) -> Mask -> Carry -> Fuse -> discoveries ->
//   Complexity and Balance.
// Anything the doc leaves open is marked "(lab choice)" so it's easy to find and tune.

// Seven notes from the doc, plus three that came with the bought ingredients (Fruity, Floral, Creamy); five fused
// notes, each grown from two others (Juicy and Velvet came with the new notes).
export const BASE = ["sweet", "sour", "bitter", "strength", "fresh", "smoke", "spice", "fruity", "floral", "creamy"]
export const NEW_NOTES = ["fruity", "floral", "creamy"]
export const FUSED = ["depth", "brightness", "toasted", "juicy", "velvet"]
export const NOTES = [...BASE, ...FUSED]
export const LABEL = { sweet: "Sweet", sour: "Sour", bitter: "Bitter", strength: "Strength", fresh: "Fresh", smoke: "Smoke", spice: "Spice",
  fruity: "Fruity", floral: "Floral", creamy: "Creamy",
  depth: "Depth", brightness: "Brightness", toasted: "Toasted", juicy: "Juicy", velvet: "Velvet", complexity: "Complexity", balance: "Balance" }
export const PARENTS = { depth: ["sweet", "bitter"], brightness: ["sour", "fresh"], toasted: ["smoke", "sweet"], juicy: ["fruity", "sour"], velvet: ["creamy", "sweet"] }

// values per part and tags, from the catalog (catalog.js); garnishes are kept apart (no volume)
export const TRACE = 0.04
export const INGREDIENTS = Object.fromEntries([
  ...Object.entries(ITEMS).filter(([, it]) => it.group !== "garnish").map(([id, it]) => [id, { v: it.v, tags: it.tags, dash: !!it.dash }]),
  ["water", { v: {}, tags: [] }],                 // melted ice: adds volume, no taste
])
// Secret tag pairings: when both are in the drink (each at least a fifth of a part), the fused note gets a bonus.
// No single ingredient carries both tags of a pairing, so each one takes two bottles to find.
export const DISCOVERIES = [
  ["fermented", "smoked", "depth", 1.2, "Fermented and smoked"],
  ["citrus", "herbal", "brightness", 1.0, "Citrus and herbal"],
  ["roasted", "spice", "toasted", 1.0, "Roasted and spice"],
  ["fruit", "floral", "juicy", 1.0, "Fruit and flower"],
  ["creamy", "roasted", "velvet", 1.0, "Cream and roast"],
  ["aged", "fruit", "depth", 1.0, "Aged and fruit"],
  ["tea", "citrus", "brightness", 0.8, "Tea and citrus"],
  ["tropical", "smoked", "toasted", 1.0, "Tropics and smoke"],
  ["nut", "spice", "velvet", 0.8, "Nut and spice"],
  ["fermented", "fruit", "juicy", 0.8, "Ferment and fruit"],
]
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
  // what counts as an ingredient: anything at least most of a dash. Stray drops (a bottle dripping as it's carried
  // back over the glass, a splash) are traces and don't count toward "too many ingredients" (lab choice: 0.04 parts)
  out.counted = [...parts.keys()].filter((id) => id !== "water" && parts.get(id) >= TRACE)
  out.ingredients = out.counted.length

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
  // cream rounds off the edges; smoke covers flowers
  lose("strength", Math.min(P.strength, 0.06 * P.creamy), "softened by Creamy"); lose("bitter", Math.min(P.bitter, 0.08 * P.creamy), "softened by Creamy")
  lose("floral", Math.min(P.floral, 0.1 * P.smoke), "covered by Smoke")
  // Carry: alcohol carries heat; fizz lifts aromatics
  const lift = (n, amt, why) => { if (amt <= 1e-6) return; P[n] += amt; const c = out.carried[n]; out.carried[n] = c ? [c[0] + amt, c[1] + ", " + why] : [amt, why] }
  lift("spice", P.spice * 0.04 * P.strength, "carried by Strength")
  lift("fresh", P.fresh * 0.4 * out.bubbles, "lifted by bubbles")
  lift("floral", P.floral * 0.25 * out.bubbles, "lifted by bubbles")
  // the garnish: an aroma on top, the same amount whatever the drink's size (it shows as its own piece of the bar)
  const gid = d.garnish && isGarnish(d.garnish) ? d.garnish : null
  if (gid) {
    out.garnish = gid
    const fx = ITEMS[gid].fx, nm = ITEMS[gid].name
    for (const [n, a] of Object.entries(fx.add || {})) { P[n] += a; out.contrib[n].push([gid, a]) }
    for (const [n, a] of Object.entries(fx.hide || {})) lose(n, Math.min(P[n], a), "hidden by the " + nm.toLowerCase())
  }
  for (const n of BASE) out.notes[n] = clamp(P[n])

  // Fuse: strongest when its parents are equal, easing in as the weaker parent rises from 1 to 2.5
  for (const f of FUSED) {
    const [a, b] = PARENTS[f].map((n) => out.notes[n]), lo = Math.min(a, b)
    const fade = clamp((lo - 1) / 1.5, 0, 1)
    out.notes[f] = a + b > 0 ? clamp(0.75 * Math.sqrt(a * b) * (1 - Math.abs(a - b) / (a + b)) * fade) : 0
  }
  // Discoveries: secret tag pairings (lab choice: each side needs at least a fifth of a part)
  for (const [t1, t2, note, bonus, name] of DISCOVERIES) {
    if (hasTag(t1) && hasTag(t2)) {
      // which ingredients did it: the biggest pour with each tag (one ingredient can carry both, like shiso)
      const top = (t) => [...parts].filter(([id, p]) => p >= 0.2 && INGREDIENTS[id].tags.includes(t)).sort((a, b) => b[1] - a[1])[0][0]
      out.notes[note] = clamp(out.notes[note] + bonus); out.discoveries.push({ name, note, bonus, tags: [t1, t2], ids: [top(t1), top(t2)] })
    }
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
  drag(muddle, `${out.ingredients} ingredients, 5 at most`)
  drag(0.25 * Math.max(0, out.dilution * 100 - 28), "watery")
  out.drags.sort((a, b) => b[0] - a[0])
  out.balance = clamp(10 - out.drags.reduce((s, x) => s + x[0], 0))
  out.notes.complexity = out.complexity; out.notes.balance = out.balance
  return out
}

// ---------------------------------------------------------------- crowds, guests, and how they talk
// comfort ranges [low, high, weight] per axis; "loves" a fused note; budget in credits (from the doc).
// extra: how much of the newer notes (Fruity, Floral, Creamy) a crowd puts up with: upper limits only, so a guest
// never silently needs a note they didn't ask for. A guest only has them once the bar can make that note (see
// reach). Asking for one out loud is a craving (makeGuest).
export const CROWDS = {
  industrial: { name: "Industrial", ranges: { strength: [6, 9.5, 3], bitter: [4, 8, 2], sweet: [0, 3.5, 2], smoke: [2, 8, 1], balance: [3, 10, 1] },
    extra: { floral: [0, 3, 0.8], fruity: [0, 5, 0.6] }, craves: ["creamy", "fruity"], loves: "toasted", budget: 8 },
  residential: { name: "Residential", ranges: { sweet: [6, 9.5, 3], strength: [5, 8.5, 2], bitter: [0, 3, 2], fresh: [1, 6, 0.5], balance: [4, 10, 1] },
    extra: { floral: [0, 6, 0.6] }, craves: ["fruity", "creamy", "floral"], loves: null, lovesLater: "velvet", budget: 10 },
  commercial: { name: "Commercial", ranges: { balance: [8, 10, 3], complexity: [3.5, 6.5, 2], fresh: [4, 7.5, 2], strength: [3, 6, 2], sweet: [2, 5, 1.5], bitter: [0, 3.5, 1] },
    extra: { creamy: [0, 5, 0.8], floral: [0, 5, 0.6] }, craves: ["fruity", "floral"], loves: "brightness", budget: 14 },
  luxury: { name: "Luxury", ranges: { complexity: [6.5, 10, 3], balance: [6, 10, 2], bitter: [2.5, 6.5, 1.5], sweet: [2.5, 6, 1], fresh: [3, 7, 1], strength: [3, 7, 1] },
    extra: { fruity: [0, 6, 0.8], creamy: [0, 6, 0.6] }, craves: ["floral", "creamy", "fruity"], loves: "depth", budget: 24 },
}
export const MOODS = {
  rough: { name: "Rough shift", shift: { strength: 1.5 } },
  celebrating: { name: "Celebrating", shift: { sweet: 1.5, fresh: 1 } },
  hungover: { name: "Hungover", shift: { strength: -2, fresh: 1.5 } },
  restless: { name: "Restless", shift: { spice: 2 } },
}

// How high the bar can push each note with what it owns: the best single bottle as most of a drink (dashers at six
// dashes in a small drink), plus the strongest garnish for that note. Rough on purpose: it decides what guests may
// ask for, so it errs low (the simulation checks every order can still be made well).
const perceive0 = (c) => 10 * (1 - Math.exp(-c / 8))
export function reach(owned) {
  const r = Object.fromEntries(BASE.map((n) => [n, 0]))
  for (const id of owned) {
    const it = ITEMS[id]; if (!it) continue
    if (it.group === "garnish") continue
    for (const [n, v] of Object.entries(it.v)) r[n] = Math.max(r[n], perceive0(it.dash ? v * 0.3 / 2.5 : v * 0.7))
  }
  return r                                   // (a garnish alone never makes a note askable: its nudge is too small)
}
// a range the bar can't reach slides down to what it can (keeping its width), so every order is makeable
function fitRange([lo, hi, w], top) {
  if (lo <= top - 1) return [lo, hi, w]
  const nlo = Math.max(0, top - 2), d = lo - nlo
  return [nlo, Math.max(nlo + 2, hi - d), w]
}

// The phrasebook: one phrase per level per note, always meaning the same thing. Strength, Sweet, Bitter, Fresh,
// Smoke, Complexity and Balance are the doc's own; Sour and Spice, and the "none" lines the doc didn't spell out,
// are (lab choice) written in the same voice. (Each crowd's own words are in voices.js; these are the fallback.)
export const PHRASES = {
  strength: ["no alcohol for me tonight", "easy, I want to stay sharp", "some kick, not a knockout", "something with a real kick", "strong enough to erase my shift"],
  sweet: ["zero sugar", "not too sweet", "a little sweet", "sweet, like candy neon", "as sweet as you can make it"],
  sour: ["nothing sour", "just a hint of tang", "a bit tart", "sharp and sour", "sour enough to wake me up"],
  bitter: ["nothing bitter", "barely bitter", "a bitter edge", "something that bites back", "bitter as a corp memo"],
  fresh: ["nothing green", "a little lift", "fresh", "bright, like morning rain", "like breathing on a rooftop garden"],
  smoke: ["can't stand smoke", "a wisp of smoke", "smoky", "like a burnt-out server room", "pure exhaust, the good kind"],
  spice: ["no heat", "a little warmth", "some heat", "spicy", "hot enough to see sparks"],
  fruity: ["nothing fruity", "a hint of fruit", "fruity", "really fruity", "as fruity as it gets"],
  floral: ["nothing floral", "a hint of flowers", "floral", "really floral, like a garden", "as floral as it gets"],
  creamy: ["nothing creamy", "a touch of cream", "creamy", "really creamy", "as creamy as it gets"],
  complexity: ["simple, nothing fussy", "simple, nothing fussy", "a few layers", "something that keeps changing as I drink it", "a whole story in a glass"],
  balance: ["rough is fine", "rough is fine", "smooth enough", "clean, nothing loud", "perfectly balanced"],
}
export const LEVELS = ["none", "low", "mid", "high", "max"]
// which level a target value reads as (lab choice: the doc names five levels, not their cut-offs)
export const levelOf = (v) => (v < 1 ? 0 : v < 3.5 ? 1 : v < 6 ? 2 : v < 8.5 ? 3 : 4)

// what guests say back, by axis and direction
const MORE = { strength: "Needed more kick.", sweet: "Could be sweeter.", sour: "Needed more tang.", bitter: "Wanted more bite.", fresh: "Needed more lift.",
  smoke: "Wanted more smoke.", spice: "Wanted more heat.", fruity: "Wanted more fruit.", floral: "Wanted more flowers.", creamy: "Wanted it creamier.",
  complexity: "A bit simple for me.", balance: "A little rough." }
const LESS = { strength: "Too strong for me.", sweet: "A bit too sweet for me.", sour: "Too sour.", bitter: "Too bitter.", fresh: "Too green.",
  smoke: "Too smoky.", spice: "Too hot.", fruity: "Too fruity.", floral: "Too floral, like perfume.", creamy: "Too creamy.",
  complexity: "Too much going on.", balance: "Too smooth, almost boring." }
const SPOT_ON = { strength: "That kick was perfect.", sweet: "Sweet, just right.", sour: "That tang was perfect.", bitter: "That bite was perfect.", fresh: "So fresh.",
  smoke: "Love that smoke.", spice: "That heat was perfect.", fruity: "That fruit was perfect.", floral: "Those flowers were perfect.", creamy: "So creamy.",
  complexity: "It keeps changing. I love it.", balance: "So smooth." }
export const TIERS = [[85, "Great", "This is incredible."], [65, "Good", "Nice. I like it."], [40, "Meh", "Hm. It's okay."], [0, "Bad", "I'll leave this here."]]
// a garnish ask: what it adds to the score when met, when a different garnish came, when none did
export const GARNISH_SCORE = { match: 5, other: -2, none: -8 }

// A guest: their crowd plus a personal nudge (ranges slide about 0.6, weights scale 0.8 to 1.25), maybe a quirk
// (a note they hate or love), maybe a craving (one of the newer notes, said out loud), maybe a mood, maybe a garnish.
// bar: what the bar owns ({ owned: ids, fresh: ids bought recently }); without it, the starter bar.
// Every range is fitted to what the bar can reach, and the newer notes only appear once something on the shelf
// makes them.
export function makeGuest(R, crowdId, bar = null) {
  const owned = bar ? [...bar.owned] : STARTER, fresh = bar && bar.fresh ? bar.fresh : []
  const top = reach(owned), can = (n) => n === "complexity" || n === "balance" || top[n] >= 3
  const garnishes = owned.filter(isGarnish)
  const ids = Object.keys(CROWDS)
  const cid = crowdId || ids[Math.floor(R() * ids.length)], C = CROWDS[cid]
  const ranges = {}
  for (const [ax, [lo, hi, w]] of Object.entries(C.ranges)) {
    const s = (R() - 0.5) * 1.2
    ranges[ax] = [clamp(lo + (lo > 0 ? s : 0)), clamp(hi + (hi < 10 ? s : 0)), w * (0.8 + R() * 0.45)]
  }
  for (const [ax, [lo, hi, w]] of Object.entries(C.extra || {})) {
    const s = (R() - 0.5) * 1.2
    if (can(ax)) ranges[ax] = [clamp(lo + (lo > 0 ? s : 0)), clamp(hi + (hi < 10 ? s : 0)), w * (0.8 + R() * 0.45)]
  }
  let quirk = null, mood = null, craving = null, garnishAsk = null
  // the draws happen in the same order whatever the bar owns, so the same seed makes the same guest's basics
  const rq = R(), rq2 = R(), rq3 = R(), rc = R(), rc2 = R(), rc3 = R(), rm = R(), rm2 = R(), rg = R(), rg2 = R()
  if (rq < 0.3) {
    const pool = BASE.filter((b) => b !== "strength" && can(b))
    const n = pool[Math.floor(rq2 * pool.length)]
    quirk = rq3 < 0.6 ? { note: n, kind: "hate" } : { note: n, kind: "love" }
    ranges[n] = quirk.kind === "hate" ? [0, 0.8, 3] : [Math.min(6, top[n] - 1.5), 10, 2.5]
  }
  // a craving: one of the newer notes the bar can make, said out loud at a level; notes bought lately come up more
  const newer = (C.craves || NEW_NOTES).filter((n) => can(n) && !(quirk && quirk.note === n))
  if (newer.length && rc < 0.4) {
    const weights = newer.map((n) => (fresh.some((id) => ITEMS[id] && (ITEMS[id].v || {})[n] >= 6) ? 2 : 1))
    let t = rc2 * weights.reduce((a, b) => a + b, 0), k = 0
    while (t > weights[k] && k < newer.length - 1) t -= weights[k++]
    const n = newer[k], high = rc3 < 0.4 && top[n] >= 8
    craving = { note: n, level: high ? 3 : 2 }
    ranges[n] = high ? [6, 9.5, 2.5] : [3.5, 6.5, 2.5]
  }
  if (rm < 0.5) {
    const k = Object.keys(MOODS)[Math.floor(rm2 * 4)]; mood = { id: k, ...MOODS[k] }
    for (const [ax, d] of Object.entries(mood.shift)) {
      if (ranges[ax]) ranges[ax] = [clamp(ranges[ax][0] + d), clamp(ranges[ax][1] + d), ranges[ax][2]]
      else ranges[ax] = d > 0 ? [clamp(d + 1), 10, 1.5] : [0, clamp(5 + d), 1.5]
    }
  }
  // fit every note range to what the bar can reach
  for (const ax of Object.keys(ranges)) if (top[ax] !== undefined) ranges[ax] = fitRange(ranges[ax], top[ax])
  // a garnish: only once the bar owns one, and only a kind it owns
  if (garnishes.length && rg < 0.3) {
    const fams = [...new Set(garnishes.flatMap((id) => ITEMS[id].fam))]
    garnishAsk = fams[Math.floor(rg2 * fams.length)]
  }
  const loves = C.loves || (C.lovesLater && PARENTS[C.lovesLater].every((n) => top[n] >= 3) ? C.lovesLater : null)
  const g = { crowd: cid, crowdName: C.name, ranges, loves, budget: C.budget, quirk, mood, craving, garnishAsk }
  // What they'll say out loud, decided here so the score can't hold anything else against them: a quirk, craving or
  // mood always, then the heaviest of the rest, three or four in all. Anything they don't say keeps only its upper
  // limit (they won't complain it's missing, only if there's too much of it). Balance keeps its floor: a harsh,
  // lopsided drink is a fault whatever was asked.
  g.saidAxes = chooseSaid(g)
  for (const ax of Object.keys(ranges)) if (!g.saidAxes.includes(ax) && ax !== "balance") ranges[ax] = [0, ranges[ax][1], ranges[ax][2]]
  return g
}
const isMust = (g, ax) => (g.quirk && g.quirk.note === ax) || (g.craving && g.craving.note === ax) || (g.mood && ax in g.mood.shift)
function chooseSaid(g) {
  const axes = Object.entries(g.ranges).map(([ax, [, , w]]) => ({ ax, w, must: isMust(g, ax) }))
  axes.sort((a, b) => (b.must - a.must) || (b.w - a.w))
  const musts = axes.filter((a) => a.must).length
  return axes.slice(0, Math.min(4, Math.max(3, musts))).map((a) => a.ax)
}

// What they say: the things chosen in makeGuest (saidAxes), each in their crowd's words; a garnish they want comes
// last.
export function request(g) {
  const saidAxes = g.saidAxes || chooseSaid(g)
  const said = saidAxes.map((ax) => ({ ax, lo: g.ranges[ax][0], hi: g.ranges[ax][1] })).map((a) => {
    const target = a.ax === "balance" || (a.hi >= 10 && a.lo > 0) ? (a.lo + 10) / 2 : (a.lo + a.hi) / 2
    const lv = a.lo <= 0 && a.hi <= 1 ? 0 : levelOf(target)
    // in the guest's own crowd's words (voices.js), never the same wording twice in a row
    const text = pickLine(g.crowd, "ask", a.ax, lv) || PHRASES[a.ax][lv]
    return { ax: a.ax, level: lv, text: text[0].toUpperCase() + text.slice(1) + "." }
  })
  if (g.garnishAsk) {
    const text = pickLine(g.crowd, "garnish", g.garnishAsk) || "with " + g.garnishAsk + " on top"
    said.push({ ax: "garnish", fam: g.garnishAsk, text: text[0].toUpperCase() + text.slice(1) + "." })
  }
  if (g.mood) g.moodLine = pickLine(g.crowd, "mood", g.mood.id) || g.mood.name + "."
  return said
}

// The score: 0 to 100 by how far the drink falls outside each comfort range (small misses squared, big ones linear),
// plus up to 6 for a loved fused note rising from 1.5 to 3.5, plus or minus the garnish they asked for.
// Ingredients never count, only taste (and the garnish, when they asked for one).
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
  let garnish = 0, garnishHit = null
  if (g.garnishAsk) {
    garnishHit = !t.garnish ? "none" : ITEMS[t.garnish].fam.includes(g.garnishAsk) ? "match" : "other"
    garnish = GARNISH_SCORE[garnishHit]
  }
  const S = clamp(100 * Math.exp(-P) + love + garnish, 0, 100)
  const tier = TIERS.find(([min]) => S >= min)
  return { score: S, tier: tier[1], line: tier[2], misses, love, garnish, garnishHit }
}

// What they say back, in the same words: the biggest misses, or praise for what mattered most to them. A missed
// garnish comes first: it's the easiest thing to fix.
export function feedback(g, t, s) {
  const lines = [], arrows = {}
  if (s.garnishHit && s.garnishHit !== "match") lines.push(pickLine(g.crowd, "garnishMiss", s.garnishHit) || (s.garnishHit === "none" ? "Where's my garnish?" : "Not the garnish I meant."))
  const asked = (ax) => !g.saidAxes || g.saidAxes.includes(ax)
  const bad = s.misses.filter((m) => m.miss > 0.35 && (m.dir < 0 || asked(m.ax) || m.ax === "balance")).sort((a, b) => b.cost - a.cost).slice(0, 2 - lines.length)
  for (const m of bad) { lines.push(pickLine(g.crowd, m.dir > 0 ? "more" : "less", m.ax) || (m.dir > 0 ? MORE[m.ax] : LESS[m.ax])); arrows[m.ax] = m.dir }
  if (lines.length < 2 && s.score >= 65) {
    // (praise for layers never goes to someone who asked for something simple)
    const good = s.misses.filter((m) => m.miss === 0 && SPOT_ON[m.ax] && asked(m.ax) && !(m.ax === "complexity" && m.hi <= 3.5)).sort((a, b) => b.w - a.w)[0]
    if (good) {
      // they asked for none of it: praise its absence, never its taste
      const none = good.hi <= 1 && NONE_WORD[good.ax]
      const line = none ? (pickLine(g.crowd, "spotNone") || "No {w}, just right.").replace("{w}", NONE_WORD[good.ax]) : pickLine(g.crowd, "spot", good.ax) || SPOT_ON[good.ax]
      lines.push(line[0].toUpperCase() + line.slice(1)); arrows[good.ax] = 0
    }
  }
  return { lines: [pickLine(g.crowd, "tier", s.tier) || s.line, ...lines], arrows }
}
