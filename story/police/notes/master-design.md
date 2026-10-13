# Master design: police story bible (read this first)

Project: story/police (story-skills project, schema v2). American English. No em dashes anywhere. Terse, camera-log voice.

## 1. How the bible maps onto the story-skills format

- A CHAPTER is a GAME DAY. chapter-01 to chapter-21 = day 1 to day 21 (a day is about an hour of play at 1x). Day tokens in tables: `d03` or `d03-d05` (a beat is 1 to 3 days).
- Every clue, promise and question uses chapter ids as days: `planted: chapter-04` means day 4.
- Cases are scenarios that all sit on the same 21 day frame. A boss case is played alone in a city run, with its crossing smaller cases running beside it.
- A BEAT is one concrete event. Beat ledgers are markdown tables in `plot/arcs/<arc-id>.md`.
- Facts live once: a clue is in `continuity/clues/<id>.md`, a question in `continuity/questions/<id>.md`, a promise in `continuity/promises/<id>.md`. Arc files only reference them by id.
- Do NOT run `story reindex`, `story add` or any CLI that rewrites registries. The lead runs the maintenance block at the end. Write the .md files directly.

## 2. Closed vocabularies (a checker enforces all of these)

PLACES (location ids; a sub-place may follow a slash):
tenements, shopfront, food-counter, luxury-tower, factory, town-square, lawn, market-plaza, sky-mall, cloud-pagoda, bath-house, neon-dome, foundry, logistics-hub, hydroponic-farm, data-spire, radio-station, metro-station, lift, sky-highway, police-station.
Sub-places: town-square/food-stalls, town-square/koi-pond, town-square/vending-machines, town-square/seats; bath-house/pools, bath-house/front-desk, bath-house/tea-counter; neon-dome/queue, neon-dome/door-staff, neon-dome/bar-kiosk, neon-dome/snack-stand; metro-station/platform; police-station/front-screens.
Delivery bots and drones are actors, not places. No animals, no street cars, no doorbells, no phones (a phone is a "comm").

ACTIONS (the only things a camera can show):
walk, run, walk-together, enter, leave, stand, wait-outside, knock-and-wait, read-notice, point, shrug, wave, chat, argue, hug, hand-over, serve, queue-order, phone-call, post-feed, sit, eat, picnic, bump, carry, pick-up, share-umbrella, watch-hologram, police-patrol, police-scan, arrest, escort, search, stakeout.

CHANNELS (how the player learns): seen, conversation (overheard), phone (one side of a comm call), feed (a mesh post), document (a badge, a label, a poster on the station screens, a receipt, a log), introduction. A beat may list two joined by `+`.

THE CAMERA RULE: the log shows only what a camera sees and hears right now. Never thoughts, motives, conclusions, or labels like "the boss". Hearsay is logged secondhand, in the past tense ("Courier tells vendor the officer paid last week"). Case characters act consistently with the hidden truth but never do anything that announces it. Banned in camera text: thinks, knows, realizes, decides, suspects, fears, hopes, believes, remembers, wants (the word "wanted" in a poster is fine), plans to, secretly, guilty, the boss.

## 3. Ledger table format (exact header, every ledger in every arc)

```
| Day range | Beat title | Who | Where | What a camera sees | Channel | Clue | State set |
|---|---|---|---|---|---|---|---|
| d03-d04 | Wrong door | courier, framed-officer | tenements | knock-and-wait: courier at door 4C, 03:10; wave: nobody answers | seen | plant b1-c03 | - |
```

- Who: character ids from characters/ (see section 4), or the generic tokens crowd, bystander, bot, drone, queue, patrons, resident.
- Where: one place id (optionally with a sub-place).
- What a camera sees: `;`-separated clauses, each `action: detail`, the action from the ACTIONS list. Times in 24h clock help ("03:10").
- Clue column: tokens `plant <id>`, `pay <id>`, `herring <id>` (a red herring planted), `debunk <id>` (a red herring cleared). Several tokens separated by `, `. `-` if none. A beat may plant and pay in the same cell.
- State set: flags `namespace:flag`, comma separated, `-` if none. Namespaces: boss, g1 (courier go-between), g2 (clerk go-between), g3 (extra go-between, careful only), inf (informant), A to H (the officers, see section 4), rh1 rh2 rh3 (red herring residents), station2 (second station), case. Flag names are kebab-case: `A:suspended`, `B:framed`, `B:cleared`, `boss:safehouse-burned`, `boss:safehouse2-burned`, `boss:arrested`, `g1:arrested`, `inf:missing`, `inf:talking`, `station2:cooperating`, `case:closed`.
- A beat title may carry a tag: `[CAREFUL]`, `[CARELESS]` (variant rows), `[x:<small-arc-id>]` (a crossover beat that matches a row in that small case).
- Beats are ordered by day. The same day can have several beats.

## 4. Characters (ids are fixed; files exist in characters/)

Officers, station 1 (8 per station, three shifts). Letter = flag namespace.
- A `inside-officer` (day shift, pair 1). Works for the boss. Charming, generous with rides.
- B `framed-officer` (day shift, pair 1). A's partner. Gets framed. Stubborn, by the book.
- C `veteran-officer` (swing shift, pair 2). Near retirement. Notices things. Slow, deliberate.
- D `rookie-officer` (swing shift, pair 2). Eager, keeps notes, over-reads rules.
- E `family-caller-officer` (night shift). Family keeps calling on shift (comm, one side).
- F `burnout-officer` (swing shift). Burning out: skips scans, sits too long, eats at odd times.
- G `desk-sergeant` (day shift). Runs the briefing, the station screens and wanted posters.
- H `night-stakeout-officer` (night shift). Quiet, patient, the one who stands and watches doors for hours.
Extra stations: `inside-officer-extra` (one profile reused, one per extra station, CAREFUL variant only).

Pair dynamics (ladders, a case moves a pair one step or two):
- Pair 1 (A + B): P1-1 easy trust, P1-2 small lies, P1-3 A changes routes and B notices, P1-4 rupture (B suspended or A cold), P1-5 estranged or reconciled.
- Pair 2 (C + D): P2-1 teacher and pupil, P2-2 rookie impatient, P2-3 rookie ahead, P2-4 veteran retiring, P2-5 torch passed or broken.

The boss: `boss-careless`, `boss-careful` (the same criminal, two variants). The boss hides behind a cover face (a different ordinary face per case, section 5). Go-betweens: `go-between-courier` (g1), `go-between-clerk` (g2), `go-between-bartender` (g3, careful only). Informant `informant` (inf). Red herring residents: `red-herring-night-courier` (rh1), `red-herring-bath-regular` (rh2), `red-herring-stall-neighbor` (rh3). The framing victim is `framed-officer`.
Small-case minor characters: each small case file may add minor characters with prefix `<case>-`, role minor, NO relationships entries (relations go in the body).

Boss variants (rolled per case):
- CARELESS: fewer layers (g1 only plus maybe g2), one safe house, caught sooner when several stations cooperate (flag station2:cooperating). Arrest around d13 to d15 when cooperating, around d17 to d19 when not.
- CAREFUL: extra go-between g3, a second safe house, one extra inside officer per extra station, arrest only d19 to d21 even with cooperation, an extra set-back beat or two.
Every boss arc has three ledgers: BASE, CARELESS DELTA, CAREFUL DELTA (delta rows are added to or replace base rows; say which with the tag and the beat title).

## 5. The five boss cases (fixed seeds; arc ids; clue prefix)

Case days run d01 to d21. Base ledger 16 to 20 beats. All five end with `boss:arrested` and `case:closed`.

b1 `b1-long-queue`, prefix b1. Cover face: noodle stall keeper, town-square/food-stalls. Default CARELESS. Operation: the Square stalls pay a weekly "tip" collected hand to hand. Go-between g1 courier carries the bowls. Safe house: a tenements flat. CAREFUL second safe house: a foundry locker room. Inside officer A buys a bowl at the stall, pays nothing, skips the stall on scans, lengthens his route past it. Frame: B's badge number on a payoff label plus a feed post; G posts B's suspension on the station screens. Informant: the vending machine restocker slips away on d09 (this is the s7 missing resident) and is found d17. Red herrings: rh3 (stall neighbor argues with courier; actually owes rent), rh1 (night courier at 03:00 doors, visiting a partner). Crossing small cases: s1, s2, s3, s7.
b2 `b2-door-work`, prefix b2. Cover face: Dome door worker, neon-dome/door-staff. Default CAREFUL. Operation: sells queue priority and fences items from the cloakroom. Payoffs as snack tokens and bar kiosk tabs. g1 courier, g3 bartender. Safe houses: luxury-tower unit, foundry office. Inside officer A plus extra insiders. Frame: B at the Dome door in scan logs on theft nights, B shown on a wanted poster by mis-match, evidence goes missing from the station. Informant: snack stand worker. Red herrings: rh1 (queue at odd hours), rh3 (argued with door staff). Crossing: s3, s4.
b3 `b3-the-regular`, prefix b3. Cover face: bath house regular who never seems to pay, bath-house/pools. Either variant. Operation: launders through tea credits at the tea counter, trades on pool gossip. g2 clerk at bath-house/tea-counter (slips away d07), g1 courier. Safe house: cloud-pagoda suite. CAREFUL second: tenements flat. Inside officer A visits the bath house in civilian clothes, hand-over of towels. Frame: a tea counter ledger page marked with B's initials, a comm call that sounds like B. Informant: bath house front desk attendant. Red herrings: rh2 (bath regular who pays cash, a gambling debt), rh1. Crossing: s1, s5, s6, s7.
b4 `b4-dead-drop-days`, prefix b4. Cover face: logistics hub dispatcher who sends bots and drones. Either variant. Operation: payoffs ride in false-bottom parcels to doorsteps (carry, pick-up). g1 courier at doorsteps, g3 drone bay fixer (careful). Safe house: hydroponic-farm shed. CAREFUL second: tenements flat. Frame: spoofed comm calls in B's voice, a delivery log under B's badge. Informant: bot bay mechanic. Red herrings: rh1, rh3. Crossing: s2, s6.
b5 `b5-last-train`, prefix b5. Cover face: metro platform attendant, metro-station/platform (lost property bin). Either variant. Operation: payoffs left in the lost property bin and carried by a chain of commuters. g1 courier, g3 platform sweeper (careful). Safe house: tenements flat. CAREFUL second: foundry. The partner who changes routes: A swaps to metro patrol. Frame: B's police-scan log altered to scan the boss's courier. Informant: lost property clerk vanishes. Red herrings: rh1, rh2. Crossing: s1, s4, s5, s7.

Fair play, per boss case: a TRUTHS table in the arc (id, truth, 2+ planted clues on distinct days before the payoff day, payoff day, red herring clue ids). At least 6 truths per boss case. At least 3 red herring clues per boss case (a red herring clue has `red-herring: true` and its payoff is the debunk day). Every truth is backed by at least two clues the player can see. Some clues come over two channels. Case characters never announce anything.

## 6. The seven smaller cases (fixed windows; arc ids; clue prefix)

Each has its own 8 to 12 beat ledger, a TRUTHS table (3+ truths, 2 clues each), 2 red herring clues, and a CROSSOVER table.
s1 `s1-lift-lobby-muggings`, d02-d12, officer H and D. A string of muggings at lifts. The mugger arrested d08 turns out to run errands for g1. Crosses b1, b3, b5 at d08-d09.
s2 `s2-missing-delivery`, d03-d10, officer E. A parcel vanishes between logistics-hub and a doorstep. Found d09. Crosses b4 (core), b1 at d09.
s3 `s3-stall-fire`, d05-d13, officer F. A stall at market-plaza burns d05. Arson suspect d09. Crosses b1 and b2 at d09-d10.
s4 `s4-sky-mall-pickpocket`, d06-d14, officer D. A thief lifts an envelope d07, arrested d12. Crosses b2 and b5 at d07 and d12.
s5 `s5-platform-lurker`, d04-d15, officer H. A lurker on the metro platform, caught d11. Crosses b5 and b3 at d11.
s6 `s6-screen-graffiti`, d08-d17, officer G. Graffiti over wanted posters on police-station/front-screens, poster covered d10. Crosses b3 and b4 at d10 and d14.
s7 `s7-missing-regular`, d09-d19, officer C. A resident goes missing d09, found d17. Crosses b3, b5, b1 at d09 and d17.
Plus `ordinary-police-work` (background arc): patrols, scans at corners, muggings, thieves, lurkers on a loop by shift.

CROSSOVER RULE: for each crossing, the small arc has a CROSSOVER table row (boss case, day, what is shared: a person, a clue id, a flag) and the boss arc has a beat tagged `[x:<small-arc-id>]` on the same day or one day later. Both sides must name each other. Shared clues are planted once, in the arc that owns them, and the other arc references the id in its Clue column as `pay` or `plant` only if it owns it.

## 7. File formats the helper writes

Arc file `plot/arcs/<arc-id>.md`:
```
---
name: "..."
type: main        # boss cases; small cases: subplot
status: planned
characters: [kebab ids that exist in characters/]
themes: ["ordinary faces"]
acts: [act-1, act-2, act-3]
---
# Name
## Setup
## Rising Action
## Climax
## Resolution
## Cast and hidden truth   (what is really going on, for the story team only)
## Truths                  (| Truth id | Truth | Planted clues (2+) | Payoff day | Red herrings |)
## Beat ledger (BASE)      (the table)
## Careless delta / Careful delta   (boss cases)
## Crossover               (| Case | Day | Shared | Clue or flag |)
## Officer dynamics        (which ladder step the pairs start and end on)
## Clues, questions, promises   (ids and one-line each; the files hold the detail)
```
Clue file `continuity/clues/<id>.md`:
```
---
title: "..."
status: planned
planted: chapter-04
payoff: chapter-12
red-herring: true       # only for red herrings (payoff = the debunk day)
arcs: [<arc-id>]
characters: [ids]
---
## Seen as
(the camera view, 1 to 2 lines, channel in brackets)
## Points to
## Truth
```
Question file `continuity/questions/<id>.md`: frontmatter `title`, `status: answered`, `introduced: chapter-NN`, `resolved: chapter-NN`, `characters`; body: where introduced (beat), where resolved (beat).
Promise file `continuity/promises/<id>.md`: `title`, `status: planned`, `planted`, `payoff`, `arcs`, `characters`; body: where planted and paid off.
Ids: clue `<prefix>-cNN`, question `<prefix>-qNN`, promise `<prefix>-pNN` (prefix b1..b5, s1..s7, ow for ordinary work).
A promise is a setup other than a mystery clue (a vow, a deadline, a Chekhov object). A question is what the player is left asking.
Every plant day must fall inside the beat's day range; payoff after plant; ledger tokens must match the clue files exactly (plant day vs the beat day range).
