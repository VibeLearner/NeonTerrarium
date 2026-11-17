// Nights, pay and the supplier: the bar's progress from the first night to a full back bar.
//
// A night runs on the city's clock (js/main.js: 24 game hours per real hour, so a game hour is 150 real seconds):
// the bar opens at 20:00 and the last guest is let in before 05:00, the city's night (js/people.js isNight).
// That's 9 game hours, 22.5 real minutes. At 05:00 nobody new comes in; the guest at the bar finishes, then it's day.
//
// Pay: a wage for working the night, however many guests you serve, plus a tip from each guest by how much they
// liked the drink and how much their crowd spends. Each guest after the first in a night tips a little less (the
// late crowd is thinner), so serving twice as many guests earns about a third more, not twice as much. The numbers
// are tuned by the progression simulation (sim_progress.mjs): about 2 hours to unlock everything at a relaxed pace,
// about 1.5 at a quick one.
import { ITEMS, STARTER, BUYABLE, isGarnish } from "./catalog.js"

export const NIGHT_START = 20, NIGHT_END = 29             // 20:00 to 05:00 the next morning (29 = 24 + 5)
export const GAME_HOURS_PER_SECOND = 24 / 3600             // the city's clock at 1x
export const NIGHT_SECONDS = (NIGHT_END - NIGHT_START) / GAME_HOURS_PER_SECOND
export const WAGE = 130
export const TIP = { industrial: 8, residential: 10, commercial: 14, luxury: 22 }
export const TAPER = 0.05                                  // the k-th guest of a night (from 0) tips 1 / (1 + 0.05 k)
// how much of their crowd's tip a guest gives, by score: nothing below 35, all of it at 95
export const tipShare = (score) => Math.pow(Math.max(0, Math.min(1, (score - 35) / 60)), 1.3)
export const tipFor = (crowd, score, k) => Math.round(TIP[crowd] * tipShare(score) * (1 / (1 + TAPER * k)))
export const priceOf = (id) => (ITEMS[id] && ITEMS[id].price) || 0
export const TOTAL_PRICE = BUYABLE.reduce((s, id) => s + priceOf(id), 0)

// clock text: "21:40" from hours since midnight (past 24 wraps)
export function clockText(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60)
  return String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0")
}

// ---------------------------------------------------------------- the rail
// 4 slots for bottles with alcohol on the left, 9 for the rest on the right (the starter rail's own split)
export const RAIL_SLOTS = { spirit: 4, mixer: 9 }
export const STARTER_RAIL = { spirit: ["rice", "rye", "rum", "coffee"], mixer: ["yuzu", "ume", "lemongrass", "glow", "ginger", "shiso", "soda", "bitters", "chili"] }
export const groupOf = (id) => ITEMS[id] && ITEMS[id].group

// ---------------------------------------------------------------- progress (saved in the browser)
const KEY = "neonDome.progress.v1"
export function newProgress() {
  return { v: 1, night: 1, phase: "night", hour: NIGHT_START, credits: 0, owned: [...STARTER], fresh: [],
    rail: { spirit: [...STARTER_RAIL.spirit], mixer: [...STARTER_RAIL.mixer] },
    tonight: { wage: WAGE, tips: 0, guests: [] }, history: [], bought: [] }
}
// a saved game is checked before use: anything missing or unknown falls back to the starter state, piece by piece
export function sanitize(p) {
  const base = newProgress()
  if (!p || typeof p !== "object" || p.v !== 1) return base
  const owned = [...new Set([...STARTER, ...(Array.isArray(p.owned) ? p.owned.filter((id) => ITEMS[id]) : [])])]
  const rail = { spirit: [], mixer: [] }
  for (const grp of ["spirit", "mixer"]) {
    const want = Array.isArray(p.rail && p.rail[grp]) ? p.rail[grp] : base.rail[grp]
    for (const id of want) if (owned.includes(id) && groupOf(id) === grp && !rail[grp].includes(id) && rail[grp].length < RAIL_SLOTS[grp]) rail[grp].push(id)
    // top up an incomplete rail from what's owned, starter bottles first
    for (const id of [...base.rail[grp], ...owned]) if (rail[grp].length < RAIL_SLOTS[grp] && groupOf(id) === grp && !rail[grp].includes(id)) rail[grp].push(id)
  }
  const num = (v, d) => (typeof v === "number" && isFinite(v) ? v : d)
  return {
    ...base, night: Math.max(1, Math.floor(num(p.night, 1))), phase: p.phase === "day" ? "day" : "night",
    hour: Math.min(NIGHT_END, Math.max(NIGHT_START, num(p.hour, NIGHT_START))), credits: Math.max(0, Math.floor(num(p.credits, 0))),
    owned, fresh: (p.fresh || []).filter((id) => owned.includes(id)), rail,
    tonight: p.tonight && Array.isArray(p.tonight.guests) ? { wage: num(p.tonight.wage, WAGE), tips: num(p.tonight.tips, 0), guests: p.tonight.guests.slice(0, 200) } : base.tonight,
    history: Array.isArray(p.history) ? p.history.slice(-60) : [], bought: Array.isArray(p.bought) ? p.bought.filter((id) => ITEMS[id]) : [],
  }
}
export function loadProgress(store = globalThis.localStorage) {
  try { return sanitize(JSON.parse(store.getItem(KEY))) } catch { return newProgress() }
}
export function saveProgress(p, store = globalThis.localStorage) {
  try { store.setItem(KEY, JSON.stringify(p)) } catch { /* private mode or full: the night still plays */ }
}
export function clearProgress(store = globalThis.localStorage) { try { store.removeItem(KEY) } catch { /* nothing saved */ } }

// a guest served: their tip goes into tonight's takings (credits arrive at the end of the night with the wage)
export function recordGuest(p, crowd, scoreV) {
  const k = p.tonight.guests.length, tip = tipFor(crowd, scoreV, k)
  p.tonight.guests.push({ crowd, score: Math.round(scoreV), tip }); p.tonight.tips += tip
  return tip
}
// the night ends: wage and tips are paid, and it's day
export function endNight(p) {
  const total = p.tonight.wage + p.tonight.tips
  p.credits += total
  p.history.push({ night: p.night, wage: p.tonight.wage, tips: p.tonight.tips, guests: p.tonight.guests.length, total })
  p.phase = "day"; p.fresh = []
  return total
}
// the next night opens
export function startNight(p) {
  p.night += 1; p.phase = "night"; p.hour = NIGHT_START; p.tonight = { wage: WAGE, tips: 0, guests: [] }
}
// buying at the supplier: never twice, never into debt
export function canBuy(p, id) {
  if (!ITEMS[id] || STARTER.includes(id)) return "not for sale"
  if (p.owned.includes(id)) return "owned"
  if (p.credits < priceOf(id)) return "short"
  return null
}
export function buy(p, id) {
  const why = canBuy(p, id); if (why) return why
  p.credits -= priceOf(id); p.owned.push(id); p.fresh.push(id); p.bought.push(id)
  // a new bottle goes straight onto the rail if its side has a free slot (it never does after the start, but a
  // repaired save might)
  const grp = groupOf(id)
  if (!isGarnish(id) && p.rail[grp].length < RAIL_SLOTS[grp]) p.rail[grp].push(id)
  return null
}
// swap a bottle from the back bar into a rail slot (same side only); the one there goes back to the shelf
export function swapIntoRail(p, id, slot) {
  const grp = groupOf(id)
  if (!p.owned.includes(id) || isGarnish(id)) return "not owned"
  if (slot < 0 || slot >= p.rail[grp].length) return "no slot"
  if (p.rail[grp].includes(id)) {
    // already on the rail: the two trade places
    const at = p.rail[grp].indexOf(id); [p.rail[grp][at], p.rail[grp][slot]] = [p.rail[grp][slot], p.rail[grp][at]]
    return null
  }
  p.rail[grp][slot] = id
  return null
}
export const onShelf = (p) => p.owned.filter((id) => !isGarnish(id) && !p.rail[groupOf(id)].includes(id))
export const ownedGarnishes = (p) => p.owned.filter(isGarnish)
