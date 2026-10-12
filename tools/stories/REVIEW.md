# Storylets round: review notes

Branch `wip/stories`, based on main. Data and tools only: `git diff origin/main --name-only` touches `data/stories/` and `tools/stories/` and nothing else. The game does not load any of it.

## Second pass (after the owner read the first sheets)

What was wrong, and what changed:

- **A label claimed more than was heard.** "How is Grandma?" was filed as a plan; "I swear it was in my coat" made the other person "housemate"; a parcel label naming someone else tied that name to whoever turned up later. Now a line teaches exactly what it states: names only from a name in the line and only for someone in the scene (a name on a label for someone absent stays a loose name), relations only from a line that says the relation. About 40 relation reveals were rewritten: lines that only hinted ("Happy anniversary", "Here is the rent") became `said` reveals that go in the notebook as heard, and every relation reveal now has lines that state it. The notebook is in three parts (details, people around them, observations), and observations are labeled by how they were learned (Seen, Overheard, On the phone, Posted, Read, Secondhand), never by what they might mean.
- **Seen lines that concluded.** "Lives at this address", "drinks here often", "has avoided this stretch before" and "visit number {n}" (a random number) claimed habits the feed hadn't watched. They are now observations, and any repeat is counted: `{seen}` is the real number of days the watcher saw it, with `minSeen` where the line only makes sense the second time.
- **Gendered words that could lie.** "Mom", "Dad", "Granddad", "my little brother", "an old woman" were written into lines whose cast person could be anyone. They are now `{X.rel}` and `{X.addr}`, which follow the cast person ("Mom" or "Dad", "sister" or "brother"). Lines that named family the game can't back up ("Tell Dad", "at my sister's") were made neutral.
- **Duplicate notebook entries.** The same hearsay from three people made three identical entries. Now it is one entry with a source count, one "heard again" line when a second person backs it up, and nobody repeats the same news more than twice.
- **The arrest read backward.** Hands up first, then the cuffs.
- **Gossip about the absent used "an unknown male resident" inside speech.** People talk about people by name: gossip now names them. That also gives the absent person's notebook their first name, heard secondhand.

**Names come quicker.** Before: 4 of 50 subjects had a name by the end of the week. Now names come up the way they do in real life, through engine rules in `vocab.passing` (greetings in passing from their own people, names used in conversation, an order called at a counter, a name tag at work, answering the phone, a parcel label, a door plate). With seed neon-1 the watcher has the subject's first name by day 1 for 13, by day 2 for 25, by day 3 for 32 and by day 7 for 41 of 50. Full names stay rare (they need a document). The catalog has a new **Names** tab with these rules and their lines.

## Open the catalog

Open `tools/stories/catalog.html` in a browser (double-click it; it is one file with the data inside, so it works from disk). It has a tier filter, a category dropdown, a search box (titles, notes, ids and every log line), a "New actions only" toggle, and a Chains tab that draws which storylets unlock which. Click a box in the chain chart to jump to that card. Rebuild it any time with `node tools/stories/build-catalog.js`.

## Read these first

1. **sec.second-visitor** and its four reveals (`sec.visitor-sister`, `-friend-of-c`, `-coworker`, `-partner`). A second person at the door of a shared home, with nothing in the setup's lines that names a relation. Any of four things can turn out to be true, and one of them (the partner) is a dramatic reveal only an eventful life can host. This is the pattern for the whole Secrets category.
2. **sec.night-call** and its four reveals (party, interview, lender, family). One side of a late call, heard from the street. Same fair-play design, built on the phone channel.
3. **The job chain**: `cty.workplace-gone` or `wrk.laid-off`, then `wrk.job-hunt`, `wrk.found-new-job`, `wrk.new-uniform`, `mil.first-day`. A job ends off screen (so it arrives as hearsay), the person is seen reading cards on a board, then wearing a new uniform. It also shows how a displacement event from the player's hand (a removed workplace) feeds an ordinary life chain.
4. **rtn.crossing-nod**, then **rtn.nod-becomes-hello**. Two strangers nod at a crossing, later say hello. It is the quietest chain in the set and the one that best shows the "most of life is small" intent. (`rtn.takes-longer-route` to `rtn.new-stall-found` and `rtn.skipped-usual-stall` to `rtn.keeper-asks` are the same idea in a shorter form.)
5. **cty.home-demolished**, then **cty.visits-the-lot**, then **cty.new-place-found**. What the player's demolish tool means for the person who lived there: the lot, the key they pick out of the rubble, a new door. Hearsay carries the middle of it.

Also worth a look for tone: `rom.breakup` (street side only, rest is hearsay), `fam.sibling-quarrel` with `fam.cold-shoulder` and `fam.apology-hug`, `qui.long-bench`.

## Counts

| Category | Mundane | Texture | Notable | Dramatic | Total |
|---|---|---|---|---|---|
| Routine and daily life | 16 | 12 | 0 | 0 | 28 |
| Work and money | 4 | 8 | 3 | 0 | 15 |
| Home and household | 6 | 5 | 3 | 0 | 14 |
| Family | 4 | 4 | 4 | 0 | 12 |
| Friendship | 2 | 7 | 3 | 0 | 12 |
| Romance and dating | 2 | 6 | 4 | 0 | 12 |
| Neighbors and community | 5 | 5 | 1 | 0 | 11 |
| Secrets and misunderstandings | 4 | 17 | 14 | 1 | 36 |
| Conflict and rivalry | 1 | 5 | 3 | 0 | 9 |
| Nightlife | 5 | 5 | 2 | 0 | 12 |
| The street and the law | 2 | 5 | 2 | 2 | 11 |
| Weather and the city | 7 | 3 | 0 | 0 | 10 |
| The player's city | 6 | 7 | 3 | 0 | 16 |
| Milestones | 0 | 5 | 2 | 1 | 8 |
| Quiet moments | 12 | 0 | 0 | 0 | 12 |
| **All** | **76** | **94** | **44** | **4** | **218** |

Secrets (36) and Routine (28) are the two largest, as asked. Mundane plus texture is 170 of 218 (78%), so it is well past "about half" on the quiet side; dramatic is the smallest tier at 4. Every category has entries a quiet life can host (the validator checks it). 14 storylets are unwatched (they carry hearsay), 7 are ambiguous setups with 22 reveal storylets between them, and there are 28 chains.

## Main decisions

- **Plain JSON, one file per category** (`data/stories/NN-<category>.json`), one `vocab.json` as the single source of truth for places, actions, facts, channels, flags and banned words, and `names.json` for name pools (228 first names with nicknames, 177 last names). The game can `fetch` these as they are.
- **Defaults live in the validator and `SCHEMA.md`**, not in every storylet: `unwatched` false, weight 5, cooldown 24 hours per person and 1 city-wide, `indoors` false.
- **Fair play for ambiguity is structural.** A setup's own log lines may not contain any relation word. Every truth names its reveal storylet, which requires a flag the setup sets. The validator also insists that every life tier that can host a setup can host at least one of its reveals, so a quiet life cannot be handed a mystery it could never resolve.
- **Facts arrive only through channels**, and the channel decides confidence: seen, conversation, phone and feed are unconfirmed; document and introduction are verified. Reveal lines are checked against what each channel is allowed to carry (a phone call cannot carry "family", a nameplate cannot carry a feeling).
- **Rule 12 is mechanical.** A word list of thoughts and conclusions is banned from every live line unless the sentence is quoted or follows an attribution verb ("says", "posted"). The validator also rejects a log line that describes another beat's action, names a role that is not in that beat, repeats a phrasing anywhere in the database, uses British spelling, an em dash or an en dash.
- **Indoors is SIGNAL LOST.** After a visible `enter`, the person's later beats must be marked `indoors` until a `leave`, and indoor beats have no log lines.
- **Life changes are always unwatched with hearsay** (job lost, moved out, breakup, left the city and so on), so what the player learns about them is secondhand and in the past tense.
- **Displacement and closures use the game's own flags** (`single:home-demolished`, `single:workplace-removed`, `single:newly-arrived`, `single:new-neighbor-moved-in`, and `city:*` for things the player builds). The validator accepts them as always available.
- **The life sheet's director** caps dramatic storylets at 3 per week city-wide with at least 36 hours between them, caps notable ones at 8 per day, hosts dramatic ones only in eventful lives, leans harder toward a dramatic one the longer the week goes without, and dampens repeats (each repeat of the same storylet for the same person is 70% less likely).

## New actions the database wants

Seventeen actions are not in the game today. The count is beats using each, from `node tools/stories/validate.js --stats`.

| Action | Beats | Notes |
|---|---|---|
| hand-over | 37 | Two people, one item changes hands. The most used and most useful. |
| carry | 27 | A person visibly carrying a thing (box, bag, crate). |
| walk-together | 24 | Two people walking side by side to one destination. |
| hug | 12 | |
| shrug | 11 | Also covers "turns away". |
| wave | 11 | |
| phone-call | 10 | Handset at the ear, one side heard. |
| point | 10 | |
| knock-and-wait | 9 | At a door, then steps back. |
| wait-outside | 9 | Stands outside a closed place for a long time. |
| read-notice | 7 | A notice board or printed sheet. |
| post-feed | 7 | Thumbs on a handset, then the post appears on the feed. |
| argue | 5 | Two people, raised voices, hand gestures. |
| pick-up | 5 | |
| feed-stray | 3 | |
| water-plant | 1 | |
| share-umbrella | 1 | |

If you can only build a few, `hand-over`, `carry`, `walk-together` and `phone-call` unlock the most. `post-feed` is the only way a mood or plan reaches the monitor through the feed channel, so it matters for rule 12.

## Life sheet

`node tools/stories/lifesheet.js --save` writes `tools/stories/sheets/week-neon-1-summary.md` and a file with all 50 sheets. It is seeded: the same seed gives the same week byte for byte. Seed "neon-1" gives exactly 30 quiet, 15 textured and 5 eventful lives (60/30/10), 611 storylets played across the week, 50 of 50 distinct watcher logs, 2 dramatic scenes, 3 citizens leaving the city, and hearsay that reached both the speaker's log and the absent person's notebook. Each sheet shows the watcher's log, the notebook, an answer key the watcher does not have, and which lines were rewritten by a later reveal (marked `[rewritten]` with the line as first logged).

## Known limits and things I would look at next

- **The picker in the life sheet is a stand-in**, not the game's picker. It is simple on purpose: weights, cooldowns, eligibility, a director cap. The real one will want more care about places and the time of day a person is where.
- **Only the subject's watcher sees a storylet.** If A and B are both citizens, B's monitor does not log it as well. The game would need to decide who is being watched.
- **A week is short.** In the sample only a minority of ambiguous setups reach their reveal inside the week; that is by design (they should take a while) but worth watching in a longer run.
- **Names in passing are generic.** They are written to fit any friendly moment, but a "Long day?" can still land on a cheerful scene. The game could tag lines by mood once storylets carry one.
- **Family the game doesn't model.** Lines no longer name parents or siblings the person may not have, but anything that refers to people outside the cast is a risk; the validator can't catch all of them.
- **Phrasing warnings.** The validator gives 29 warnings, none of them errors: 17 are roles with no relation to another role (strangers, officers, stall workers), and 12 are openings that repeat ("X comes up to the", "Overheard: X says to"). A polish pass could vary those.
- **The balance is heavy on the quiet side** (78% mundane and texture, against "about half"). If you want more drama, the notable tier is where to add: it only needs textured and eventful lives to host it.
- **Nothing here has been seen in the game.** The catalog was rendered and checked with a headless browser for errors; a real open in your browser is still the check that counts.

## Files

- `data/stories/vocab.json`, `names.json`, `01-routine.json` to `15-quiet.json`
- `tools/stories/SCHEMA.md`, `validate.js`, `build-catalog.js`, `catalog.html`, `lifesheet.js`, `sheets/`, `REVIEW.md`

Run `node tools/stories/validate.js` for the checks (0 errors expected), `--stats` for the tables.
