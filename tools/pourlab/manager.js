// Vic, the Dome's manager. He's at the bar when it's closed, and he'll taste anything you slide him: no score, no
// tip, just what he tastes in plain note names (the same words as the screen), what's working together, what's
// hiding what, and what's wrong with it. A little sleazy, never cruel.
import { BASE, FUSED, LABEL, PARENTS } from "./flavor.js"
import { ITEMS } from "./catalog.js"

// lines picked from a shuffled deck, so he doesn't repeat himself
const decks = new Map()
function pick(key, list, R = Math.random) {
  let d = decks.get(key)
  if (!d || !d.length) { d = list.map((_, i) => i).sort(() => R() - 0.5); decks.set(key, d) }
  return list[d.pop()]
}
const OPEN = {
  great: ["Now that's a drink, kid.", "Smooth. I could sell this.", "Heh. You're learning.", "That's the stuff. Don't tell anyone I said so."],
  good: ["Not bad, not bad.", "Decent. Nobody's suing over this one.", "It'll do, kid.", "I've had worse. I've served worse."],
  meh: ["Eh. It's a drink.", "Rough around the edges. Like me.", "Drinkable. Barely.", "Hm. I'll finish it. Out of politeness."],
  bad: ["Kid. What is this?", "Tastes like a lawsuit.", "Don't serve that to anybody I like.", "I've had better out of a drip tray."],
}
// how much of a note, in words he'd use: whisper, some, a good dose, lots, a flood
const amount = (v) => (v < 2 ? "a whisper of" : v < 4 ? "some" : v < 6.5 ? "a good dose of" : v < 8.5 ? "lots of" : "a flood of")
const listOf = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1])

// what he says about a drink's taste (t, from the taste model): three or four short sentences
export function managerSays(t) {
  const lines = []
  const verdict = managerTier(t).toLowerCase()
  lines.push(pick("open-" + verdict, OPEN[verdict]))
  // what he tastes: the three strongest notes, biggest first
  const top = BASE.filter((n) => t.notes[n] >= 0.5).sort((a, b) => t.notes[b] - t.notes[a]).slice(0, 3)
  if (!top.length) lines.push(pick("water", ["I taste... water. Cold water.", "There's nothing in here, kid. Just ice.", "Tastes like a melted ice cube."]))
  else lines.push(pick("taste", ["I get ", "I'm tasting ", "Mostly "]) + listOf(top.map((n) => `${amount(t.notes[n])} ${LABEL[n]}`)) + ".")
  // the best thing about it: two notes fused, or a secret pairing
  const fused = FUSED.filter((n) => t.notes[n] >= 1.5).sort((a, b) => t.notes[b] - t.notes[a])[0]
  if (t.discoveries && t.discoveries.length) lines.push(`${t.discoveries[0].name}, huh? That pushes the ${LABEL[t.discoveries[0].note]}. Clever.`)
  else if (fused) { const [a, b] = PARENTS[fused]; lines.push(pick("fused", [`The ${LABEL[a]} and ${LABEL[b]} are working together. That's ${LABEL[fused]}.`, `${LABEL[a]} and ${LABEL[b]} close like that? That's ${LABEL[fused]}, kid.`])) }
  // the trouble with it: the biggest thing dragging Balance down, or something big being hidden
  const drag = (t.drags || []).slice().sort((a, b) => b[0] - a[0])[0]
  const hidden = BASE.map((n) => [n, (t.masked[n] || []).reduce((s, [a]) => s + a, 0), (t.masked[n] || []).sort((a, b) => b[0] - a[0])[0]]).filter(([, a]) => a >= 1.2).sort((a, b) => b[1] - a[1])[0]
  const dragSays = (why) => (/ingredients/.test(why) ? "too many bottles in it. Five, tops." : why === "watery" ? "it's watery. Ease off the ice." : why + ".")
  if (drag && drag[0] >= 0.6) lines.push(pick("drag", ["Problem is, ", "Thing is, ", "But "]) + dragSays(drag[1]))
  else if (hidden) lines.push(`Your ${LABEL[hidden[0]]} is ${hidden[2][1]}. Lost about ${hidden[1].toFixed(1)}.`)
  else if (t.complexity < 2.5 && top.length) lines.push(pick("simple", ["Bit one-note, though.", "Simple. Some folks like simple.", "Not much going on under the hood."]))
  else if (t.complexity > 7) lines.push(pick("layers", ["Lots going on in there.", "Every sip's a little different. Fancy.", "Layers. The rich folks eat that up."]))
  if (t.garnish && ITEMS[t.garnish]) lines.push(pick("garnish", [`Nice touch with the ${ITEMS[t.garnish].plain.toLowerCase()}.`, `The ${ITEMS[t.garnish].plain.toLowerCase()}'s a classy move.`]))
  return lines.slice(0, 4)
}
// how he looks after a sip, by how balanced the drink is (his face only: there's no score)
// (anything dragging Balance down, or one note flooding the rest, keeps him from calling it great)
export function managerTier(t) {
  const notes = BASE.map((n) => t.notes[n]), loud = Math.max(...notes), any = notes.some((v) => v >= 0.5)
  const dragged = (t.drags || []).some(([a]) => a >= 0.6) || loud >= 8.5
  if (!any || t.balance < 4) return "Bad"
  if (t.balance >= 8 && !dragged && t.complexity >= 3) return "Great"
  if (t.balance >= 6) return dragged ? "Meh" : "Good"
  return "Meh"
}
