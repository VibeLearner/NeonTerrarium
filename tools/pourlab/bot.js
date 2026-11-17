// The bot bartender: given a guest and what the bar owns, it searches for the best drink it can make (hill climbing
// from a few random starts, in quarter parts, whole dashes, every method and garnish). The progression simulation
// uses it to check pacing and that orders can be made; the bar uses it when a guest walks up, so nobody orders a
// drink the shelf can't make well (a guest whose best possible drink would score under Good is replaced).
import { taste, score, makeGuest, METHOD, SHAKE_FIZZ_LEFT, INGREDIENTS, MAX_DASHES } from "./flavor.js"
import { isGarnish } from "./catalog.js"

export const FILL = 2.5, MAX = 8
// recipe: { parts: Map id -> parts, dashes: Map id -> count, method, t (seconds of stirring or shaking), garnish }
export function drinkOf(r) {
  const parts = new Map()
  for (const [id, p] of r.parts) if (p > 0) parts.set(id, p)
  for (const [id, n] of r.dashes) if (n > 0) parts.set(id, (parts.get(id) || 0) + n * 0.05)
  const ing = [...parts.values()].reduce((a, b) => a + b, 0)
  const M = METHOD[r.method], dil = M.dilution(r.t), water = ing * dil / (1 - dil)
  if (water > 0) parts.set("water", water)
  return { parts, chill: M.chill(r.t), fizz: r.method === "shake" ? SHAKE_FIZZ_LEFT : 1, shaken: r.method === "shake", garnish: r.garnish, vol: ing + water }
}
const valid = (d) => d.vol >= FILL - 1e-9 && d.vol <= MAX + 1e-9

export function bestDrink(g, owned, R, iters = 700, starts = 7) {
  const pours = owned.filter((id) => INGREDIENTS[id] && !INGREDIENTS[id].dash), dashers = owned.filter((id) => INGREDIENTS[id] && INGREDIENTS[id].dash)
  const garn = [null, ...owned.filter(isGarnish)]
  const evalR = (r) => { const d = drinkOf(r); if (!valid(d)) return -1; return score(g, taste(d)).score }
  const clone = (r) => ({ parts: new Map(r.parts), dashes: new Map(r.dashes), method: r.method, t: r.t, garnish: r.garnish })
  const pick = (a) => a[Math.floor(R() * a.length)]
  let best = null, bestS = -1
  for (let s = 0; s < starts && bestS < 99.5; s++) {
    let r = { parts: new Map(), dashes: new Map(), method: pick(["build", "stir", "shake"]), t: pick([4, 8, 12, 20]), garnish: null }
    const n = 2 + Math.floor(R() * 3)
    for (let k = 0; k < n; k++) { const id = pick(pours); r.parts.set(id, (r.parts.get(id) || 0) + 0.25 * (1 + Math.floor(R() * 5))) }
    let cur = evalR(r)
    for (let i = 0; i < iters && cur < 99.5; i++) {
      const c = clone(r), m = R()
      if (m < 0.45 && c.parts.size) { const id = pick([...c.parts.keys()]); c.parts.set(id, Math.max(0, c.parts.get(id) + (R() < 0.5 ? -0.25 : 0.25))); if (!c.parts.get(id)) c.parts.delete(id) }
      else if (m < 0.6) { const id = pick(pours); c.parts.set(id, (c.parts.get(id) || 0) + 0.25) }
      else if (m < 0.72 && dashers.length) { const id = pick(dashers); c.dashes.set(id, Math.max(0, Math.min(MAX_DASHES, (c.dashes.get(id) || 0) + (R() < 0.5 ? -1 : 1)))) }
      else if (m < 0.82) { c.method = pick(["build", "stir", "shake"]); c.t = pick([2, 4, 6, 8, 12, 16, 20, 30]) }
      else if (m < 0.92) c.garnish = pick(garn)
      else if (c.parts.size > 1) c.parts.delete(pick([...c.parts.keys()]))
      const v = evalR(c)
      if (v >= cur) { r = c; cur = v }
    }
    if (cur > bestS) { bestS = cur; best = r }
  }
  return { r: best, score: bestS }
}

// A guest the bar can serve well: up to 6 tries, each checked by a short search (a few thousand tastings, a few
// milliseconds). The last try is kept if none clears the bar, which the simulation shows doesn't happen.
export const SERVABLE = 75
export function servableGuest(R, crowdId, bar, tries = 6) {
  let g = null
  for (let k = 0; k < tries; k++) {
    g = makeGuest(R, crowdId, bar)
    const b = bestDrink(g, [...bar.owned], R, 400, 4)
    g.bestScore = b.score
    if (b.score >= SERVABLE) return g
  }
  return g
}
