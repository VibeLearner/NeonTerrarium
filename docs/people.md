# People: plan and progress

A living city: residents with homes, jobs and routines, walking the sidewalks between real buildings.
Code: `js/people.js`. Sprites: `assets/sprites/people.png`.

## Steps

| Step | What | Status |
|---|---|---|
| 1 | Sprite people, sidewalk network, walking door to door | Done |
| 2 | Households, jobs, daily routines tied to the hour; fewer people out at night | Done |
| 3 | Eating at the carts, sitting on benches, stopping to talk | Not started |
| 4 | Delivery robots on the sidewalks, bumping into each other, reactions with emote icons | Not started |
| 5 | Dark streets and muggings, police patrols, an event log for the radio RJ | Not started |

## How it works

**Sprites.** One atlas, 12 characters (Craftpix townspeople and city men packs), one 16 px row each:
6 walk frames then 4 idle frames, 12 px wide, facing right (mirrored for walking left). All visible people are
one instanced draw call. They stand upright to the screen and snap to whole render pixels, like the plants,
and dissolve in a pixel dither when they step through a door.

**Sidewalk network.** Rebuilt after every edit. Each plot contributes the four corners of its sidewalk ring
(1.2 units from the plot center). Edges run round the ring, straight across the street to the neighbor's
corner, and diagonally across empty plots. Megastructures are walked round and entered through doors on their
edge. Routes use A* and are cached.

**Places.** Every building is a place with one front door (side picked from its seed). The door's inside point
is found once by casting a ray from the sidewalk to the wall. Megastructures are places with doors on every
edge that faces a plot. The town square is an open place: visitors walk in and stand round the koi pond.

**Residents.** Seeded from each building section, so the same people always live in the same building.
Residential sections house 4 to 8, commercial 2 to 3, luxury 3 to 5, industrial none.

**Jobs.** Commercial 3 to 5, luxury 2 to 4, industrial 4 to 6, and the megastructures (mall 8 per tier,
foundry 14, police 8, radio 6, square 6). About 80% want work; jobs nearer home are more likely. Jobs are kept
across edits and only re-handed out when a workplace goes.

**Routines.** The hour is the one set in Settings (the clock doesn't run). Each person has a wake time, a
bedtime (a few night owls stay up till 4), a shift (a share of foundry, industrial, police and radio staff work
nights), and how much they like going out. At any hour they are asleep (home), at work, on a lunch break, on a
courier round (20% of workers walk parcels between shops), or free (out at a shop, bar, mall or the square, or
at home). When their stay ends they check where they should be and walk there. Changing the hour makes everyone
reconsider over a few seconds.

**Cost.** People indoors are a few numbers each. Decisions are time-sliced (60 people a frame). Walkers move by
distance along a precomputed path. Only people on screen are drawn, up to 700.

## Testing notes

Headless Chromium runs at a few frames a second, and walking uses the capped frame time, so test scripts call
`updatePeople(0.1, t)` in a loop to fast-forward. `peopleStats()` returns counts (people, jobs, walking, home,
work, out, drawn, nodes).

Rough numbers on a 7x7 test island (half plazas): 89 people; at 12:30 up to 57 walking at once; at 3:00
2 to 4.

## Known gaps and ideas

- Doors are a chosen side of the building, not a modeled door. A later pass could draw a lit doorway there.
- The small box figures baked into the square's queues and the foundry are a smaller scale than the sprites.
  Step 3 should replace them with sprite people queuing and eating.
- Square visitors stand still (idle animation). Sitting on the ring bench and talking come in step 3.
- No collision between walkers; each has a small personal lane offset so crowds don't stack exactly.

## Licensing

The character sheets are Craftpix assets (see https://craftpix.net/file-licenses/). Their terms allow use in
games but generally not redistributing the raw files, so the untouched source sheets
(`assets/sprites/originals/people/`) are kept out of the repo by `.gitignore`; only the packed atlas ships.
