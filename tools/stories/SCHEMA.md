# The story database: schema

This is the contract for `data/stories/`. `tools/stories/validate.js` enforces it. Read `data/stories/vocab.json` next to this file: it is the list of every action, channel, fact, place and flag a storylet may use, and this document explains them.

Nothing here touches the game. The game does not load any of it yet.

## What it is for

The player clicks a citizen and a monitor follows them: a surveillance feed with no face drawn, and under it a details panel that starts blank and fills only from what the player witnesses. Each detail is **unconfirmed** (seen or overheard) or **verified** (documented), and shows its source. The simulation picks small story moments (**storylets**), casts real citizens into them and plays them out. The player reads the feed and draws conclusions; later moments confirm them or prove them wrong.

### The twelve rules

1. The monitor never lies, it only leaves things out. Every log line must stay true after any later reveal.
2. Observations, never conclusions. No "seems close to", "probably", "involved with".
3. Every fact shows its source.
4. Reveals rewrite earlier entries ("an unknown female resident" becomes "Mara (sister)" everywhere in the log).
5. Do not always subvert. Sometimes the suspicious reading is true, sometimes innocent, sometimes it is never resolved.
6. Most lives are quiet: about 60% quiet, 30% textured, 10% eventful.
7. Indoors is unknown: the feed shows SIGNAL LOST. Only what is visible outside reaches the log.
8. Gender may appear in log lines (through `{A.he}` and descriptors).
9. Only what the player witnesses is logged, live, in the present, at the moment it is seen. No backfill.
10. Off-screen events arrive only secondhand, in conversation the player witnesses, in the past tense, unconfirmed.
11. People who have left the city stay in the notebook, read-only and past tense, and can still gain secondhand entries.
12. No thoughts, ever. Feelings and plans appear only as something said or posted ("Says...", "Posted..."), through a named channel.

## The person model (what storylets can read)

**Fixed from the seed.** Home district and zone (`low`, `mid`, `high`, `ind`, the game's own zones), job and workplace kind, temperament, eventfulness tier, routine.

- Temperament has three axes, each 0 to 1: `outgoing` (0 private, 1 outgoing), `careful` (0 impulsive, 1 careful), `warm` (0 guarded, 1 warm).
- Eventfulness tier: `quiet`, `textured` or `eventful`, drawn 60/30/10. It limits which storylet tiers a person can host (see `lifeTiers` below).
- Routine: where they eat, shop, drink and spend free evenings (their regular places, by place type).

**Relationships.** Each has a `kind` (see `relationKinds` in the vocab: `sibling-of`, `partner-of`, `friend-of`, `coworker-of`, `neighbor-of`, `ex-of`, `rival-of`, `creditor-of`, `cohabitant-of` and so on), a `warmth` value 0 to 1 that drifts, how they met, and whether they live together.

**Pressures.** `money`, `loneliness`, `work-trouble`, `secret`, `life-change`. Each 0 to 1, drifting.

**Facts** (what the monitor can reveal): `first-name`, `last-name`, `full-name`, `nickname`, `age-range`, `job`, `employer`, `home`, `cohabitants`, `family`, `partner`, `habit`, `regular`, `secret`, `whereabouts`, `relation-to` (written `B.relation-to-A` in a reveal), and the three stated kinds `feeling-stated`, `plan-stated`, `opinion-stated`, plus `news` and `money-stated`. Every fact is **lazy**: it is decided when something first reveals it, and from then on every later decision must fit it.

**Flags and memory.** What storylets have happened to a person and with whom.

## A storylet

Each storylet lives in a category file, `data/stories/NN-<category>.json`, as one object in the `storylets` array. Fields:

| Field | Meaning |
|---|---|
| `id` | `<prefix>.<slug>`, the prefix being the category's (see the vocab). Unique. |
| `title` | Short, human. |
| `tier` | `mundane`, `texture`, `notable`, `dramatic`. |
| `roles` | `{ "A": {...}, "B": {...} }`. `A` is always the subject: the person who is watched. Each role: `{ "needs": [...], "rel": "sibling-of:A" }`. `needs` come from `vocab.needs`; `rel` is `<kind>:<role>`. A role with no requirements is `{}`. |
| `when` | When it may happen (below). |
| `unwatched` | `true` if the heart of it usually happens while nobody watches (a move, a breakup, a lost job). Then `hearsay` is required. Default `false`. |
| `beats` | What the camera sees, in order, using only the action vocabulary. |
| `log` | `{ "b1": ["phrasing", ...] }`: the live lines for each visible beat. |
| `effects` | Changes after it plays (below). |
| `reveals` | Facts a watcher can learn (below). |
| `hearsay` | Conversation lines about it, for storylets that happen unwatched. |
| `next` | Flags it sets and outcome branches, including fizzles. |
| `ambiguous` / `fairPlay` | For setups that leave several truths open. |
| `resolves` | On a reveal storylet: which setup and which truth it settles. |
| `note` | Optional: a line of design intent for the catalog. |

### `when`

```
"when": {
  "hours": [18, 23],          // start, end, 24 h clock; start > end wraps midnight
  "days": "weekday",          // any | weekday | weekend
  "weather": "any",           // any | clear | rain
  "at": ["stall", "square"],  // place types where the camera sees the beats (vocab.places)
  "requires": ["A:flag"],     // flags that must be set
  "forbids": ["A:flag"],      // flags that must not be set
  "cooldown": { "person": 48, "city": 2 },   // game hours between repeats (default 24 and 1)
  "weight": 6,                // base weight in the picker (default 5); 8 or more counts as "common"
  "temper": { "outgoing": 0.5 },             // -1..1: pushes the weight up or down by temperament
  "pressure": { "money": [0.6, 1] },         // pressure ranges the subject must be in
  "lifeTiers": ["quiet", "textured", "eventful"]   // optional override of who can host it
}
```

Default `lifeTiers` by tier: mundane and texture all three; notable textured and eventful; dramatic eventful only. That is how a quiet life stays quiet.

Flags are written `Scope:name`. Scope is a role (`A:laid-off`), a pair (`A+B:met-at-stall`) or `city:` or `world:`. Flags set by the game itself (`vocab.worldFlags`: a demolished home, a removed workplace, a new metro line and so on) are always available. Every flag a storylet requires must be set by some storylet that is itself reachable; the validator runs that to a fixed point.

### `beats`

```
{ "id": "b1", "do": "walk", "who": "A", "with": ["B"], "at": "street", "indoors": false }
```

- `do` is an action from `vocab.actions`. Actions marked `"status": "new"` are not in the game yet: using one is allowed, the catalog badges it, and `REVIEW.md` counts them so the owner can decide which to build.
- `who` is a role or a list; `with` lists others in the beat. `emote` names a bubble when `do` is `emote` or when a beat adds one.
- `indoors` defaults to `false`. `indoors: true` marks a beat the player cannot see. It has no log lines; the feed shows SIGNAL LOST. Use it to keep the simulation honest: it can say what happens inside, but only the outside reaches the log.
- `dur` is optional: a rough length in game minutes.

### `log`

Several phrasings per visible beat: at least 3, at least 4 where the storylet is common (`weight` 8 or more). The voice is a terse, flat surveillance feed, a little noir. Live lines are present tense or clipped past. The game adds the timestamp.

Placeholders: `{A}` (the name, or "Subject" until learned), `{B.desc}` (a descriptor such as "an unknown female resident" until known, the name and relation afterward), `{A.he} {A.him} {A.his}`, `{place}`, `{place2}`, `{n}`, `{item}`. The full list is in the vocab.

Checks on the text:

- No thought or inner state outside speech: a line may not use words such as thinks, feels, wants, misses, wonders, hopes, worries, remembers, decides, plans to, nervous, happy, unless it is quoted or follows an attribution verb ("Says", "Told", "Posted", "Asks") in the same sentence.
- No conclusion words (seems, probably, close to, involved with), same exception.
- A beat's lines may not describe an action that belongs to another beat of the same storylet, and may only name roles that are in that beat's `who` or `with`.
- American spelling, no em dashes, no repeated phrasings anywhere in the database.

### `effects`

```
"effects": {
  "warmth": [["A", "B", 0.1]],       // role, role, change in warmth
  "pressure": [["A", "money", 0.2]], // role, pressure, change
  "flags": ["A:borrowed-from-b"],    // memory only; may also be required elsewhere
  "life": "job-lost"                 // a permanent life change (vocab.lifeChanges)
}
```

A storylet with `effects.life` always has `unwatched: true` and hearsay: lasting changes happen off screen and arrive secondhand.

### `reveals`

```
{ "fact": "B.first-name", "beat": "b2", "channel": "conversation", "chance": 0.5,
  "log": ["Overheard: {A} says \"{B.first}\" twice.", "Overheard: {B.desc} is called {B.first}."] }
```

- `fact` is `<Role>.<fact>`; for relations `<Role>.relation-to-<Role>`.
- `channel` must be a channel in the vocab that can carry that fact. The confidence (`unconfirmed` or `verified`) comes from the channel, never from the storylet.
- `beat` is where in the storylet it can happen. It must be a visible beat.
- `chance` 0 to 1 that the watcher actually gets it this time.
- `log` has at least 2 phrasings. They are extra lines the monitor adds, and the fact rewrites earlier entries.

### The channels

| Channel | Gives | Carries |
|---|---|---|
| `seen` | unconfirmed | habit, regular, home, whereabouts, cohabitants, job, age range |
| `conversation` | unconfirmed | names, nickname, age range, job, employer, family, partner, relation, stated feelings, plans, opinions, news, secrets, money, whereabouts |
| `phone` | unconfirmed | one side only: names, plans, feelings, news, secrets, relation, money, whereabouts |
| `feed` | unconfirmed | a public post: nickname, feelings, plans, news, whereabouts, partner status, habit, opinions |
| `document` | verified | a label, nameplate, badge, ticket: names, home, employer, job, cohabitants, age range, regular |
| `introduction` | verified | names, relation, partner, family, job, as stated by the introducer |

A fact learned by an unconfirmed channel can later be verified by a document or an introduction. Feelings and plans never arrive any other way than as stated.

### `hearsay`

For `unwatched` storylets.

```
"hearsay": {
  "about": "B",                                   // the person the news is about
  "speakers": ["neighbor", "friend"],             // who can mention it (vocab.speakerKinds)
  "channel": "conversation",
  "lines": ["Overheard: {S} tells {L} that ...", ...],   // at least 3, on the speaker's monitor
  "entry": ["Moved out of the district (overheard: a neighbor, in conversation).", ...]   // at least 2, past tense, on the absent person's monitor
}
```

Hearsay lines are the secondhand news as the watcher hears it, in the past tense, with `{S}` the speaker and `{L}` the listener. They may be vague or partly wrong. Everything in `entry` is unconfirmed and says its source.

### `next`

```
"next": {
  "sets": ["A+B:cooling"],
  "branches": [
    { "w": 60, "sets": ["A+B:made-up"], "label": "they make up" },
    { "w": 25, "sets": [], "label": "it fizzles", "fizzle": true }
  ]
}
```

`sets` is set every time. A branch is chosen by weight and sets its own flags. A fizzle is the build-up that never pays off, and it is as welcome as a payoff.

### `fairPlay` (ambiguous setups)

```
"ambiguous": true,
"fairPlay": {
  "subject": "B",
  "truths": { "sibling": "sec.visitor-is-sister", "partner": "sec.visitor-is-partner", "friend": "sec.visitor-is-friend" }
}
```

A setup leaves at least two truths open, and every life tier that can host the setup must be able to host at least one of its reveals (so a quiet life is never handed a mystery it cannot resolve). Every truth names the reveal storylet that settles it, and that storylet carries `"resolves": { "setup": "<setup id>", "truth": "sibling" }` and requires a flag the setup sets. The setup's own log lines may not contain any relation word (sister, wife, friend, colleague...) so every truth stays fair. At reveal time the simulation picks among the truths that every earlier line still supports.

## Tiers and balance

`mundane` and `texture` are ordinary life; `notable` is a small thing happening; `dramatic` is rare and big. About half the database is mundane or texture, dramatic is the smallest tier, and every category has some quiet entries. The validator warns if not.

## The action vocabulary

Surveyed from `js/people.js`. Existing means the game already draws it; new means it would have to be built. See `vocab.json` for the list with sources and words.

Existing: walk, enter, leave, stand, chat, sit, eat, queue-order, serve, receive-delivery, run, umbrella, emote (bang, quest, heart, anger, sweat, note, dots, bowl), bump, club-queue, club-enter, club-turned-away, dance, throw-up, mugged, mug, flee, police-scan, police-arrive, police-patrol, arrest, ride-metro, ride-lift, arrive-dropoff, leave-dropoff, picnic, watch-hologram, soak, escort, courier-run.

New: walk-together, wait-outside, knock-and-wait, hand-over, carry, argue, phone-call, post-feed, wave, hug, read-notice, feed-stray, water-plant, share-umbrella, point, pick-up, shrug.

Existing actions that the game does only in some places carry a note in the catalog; where a storylet needs more than the game does today, it uses a new action instead.

## Files

- `data/stories/vocab.json`: the vocabulary.
- `data/stories/names.json`: name pools.
- `data/stories/NN-<category>.json`: one file per category: `{ "category", "title", "theme", "storylets": [...] }`.
- `tools/stories/validate.js`: `node tools/stories/validate.js` (add `--stats` for tables, `--quiet` for errors only, `--partial` to skip the whole-database checks of size, balance and missing categories while a category is still being written).
- `tools/stories/build-catalog.js`: writes `tools/stories/catalog.html` from the data.
- `tools/stories/lifesheet.js`: a seeded dry run with no game.
- `tools/stories/REVIEW.md`: decisions, counts, what to read first, new actions wanted.

The data is plain JSON so the game can load it later. All randomness anywhere in these tools is seeded hashing, never `Math.random`.
