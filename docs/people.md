# People: plan and progress

A living city: residents with homes, jobs and routines, walking the sidewalks between real buildings.
Code: `js/people.js`. Sprites: `assets/sprites/people.png`.

## Steps

| Step | What | Status |
|---|---|---|
| 1 | Sprite people, sidewalk network, walking door to door | Done |
| 2 | Households, jobs, daily routines tied to the hour; fewer people out at night | Done |
| 2b | Real doors that slide open and shut; walking that never clips buildings, furniture or plants | Done |
| 3 | Stall keepers, queueing and eating at the food stalls, sitting on benches and stools, stopping to chat | Done |
| 4 | Delivery robots on the sidewalks, bumping into each other, reactions with emote icons | Done |
| 5 | Dark streets and muggings, police patrols, an event log for the radio RJ | Done (the log is kept; the radio host that reads it is still to come) |

## How it works

**Sprites.** One atlas (`assets/sprites/people.png`, 32 cells of 12x16 by 15 rows): 12 citizens, the police
officer (row 12), the delivery robot (row 13) and emote bubbles (row 14). Citizens: 12 characters (Craftpix townspeople and city men packs), one 16 px row each, 20 cells
of 12 px, facing right (mirrored for facing left): 6 walk, 4 idle, 6 gesture, 4 sitting. Gestures come from the
pack's Special sheets (scaled to match the rest; the five characters that have one), used for chatting, ordering
and serving; the others sway through their idle frames instead. Sitting frames are made from the idle frames:
the body drops a pixel and the legs fold forward. All visible people are
one instanced draw call. They stand upright to the screen and snap to whole render pixels, like the plants,
and dissolve in a pixel dither when they step through a door.

**Police.** The police station's staff wear the police officer sprite (its own sheet: walk, idle, talk, sitting,
a handheld scanner and an angry reaction). Officers work three shifts round the clock (7:00, 15:00, 23:00). On
duty they walk a beat: from the station to a street crossing a few blocks away, stop and scan for a while, then
on to the next, and now and then back to the station. Like the stalls, the station is always staffed.

**Delivery robots.** The small hover bot from the drones pack (the one with a parcel drop animation). About one
for every two shops, each based at a shop: it glides out of the shop's door, crosses town on the sidewalk
network to a home, lowers a parcel capsule onto the step, the door opens to take it in, and the bot heads back
(or straight on to another drop). Fewer deliveries between 23:00 and 6:00.

**Bumping and emotes.** Walkers (and bots) meeting head-on or crossing on a narrow path sometimes bump: both stop
for a moment and react with a bubble over their head (!, ?, a sweat drop or an anger mark; officers scowl with
their angry animation). Emote bubbles also show up in the square: music notes and hearts while chatting, dots
while waiting for a stall keeper, a bowl when sitting down with food. The eight bubbles are drawn in code in the
people atlas (row 14) and always drawn bright.

**Dark streets.** About one building in fifteen stands on a dark street (picked from its grid position, so it
never changes). While a dark plot is generated, about 80% of its windows, lamps, neon and trim are swapped for
unlit look-alikes (picked by position, so the same ones stay off), most halos and lit signs are left out, and
whatever still glows flickers hard and often. Every dark plot has one failing street lamp. (Code: `DARK` and
`KEEP_LIGHT` in core.js, `isDarkPlot` in world.js; the hard flicker is flicker ids 200 to 254 in sprites.js.)

**Muggings.** At night (20:00 to 5:00) a shady figure lurks on a clear corner of each dark plot. When someone walks
past alone, with no officer within 8 units, the lurker sometimes darts over and robs them: the victim freezes
('!', then a sweat drop), the mugger runs off to a crossing well away and melts into the dark, and the victim
hurries on. The nearest officer on duty runs to the spot (keeping to the walkways) and looks around with the
scanner. A lurker lies low for a few minutes after each job. Muggings and police call-outs go into `cityLog`
(hour, place, who), kept for the radio host.

**Police drone.** The drone parked on the station's roof pad is live (in `policeFx`, mega.js): every minute or so
it lifts off with its red and blue lights flashing, climbs high enough to clear the buildings, visits three
street crossings nearby, hovers over each with a searchlight cone on the street, then flies home and lands.

**What's in the way.** Every plot gets a 5 cm footprint map of everything in the walking band (ankle to head
height, 0.14 to 0.95 units): its triangles, clipped to the band and stamped from above, plus the solid middle
of every plant, laundry or sign sprite that reaches into it. A 10 cm walking map marks where a person fits,
keeping 0.17 units from anything. Megastructures are mapped once across their whole block and sliced per plot.
Maps are cached per plot and redone only when that plot is rebuilt.

**Walking network.** Neighboring plots are joined by a crossing point on the street between them, as near the
middle of the side (where the crosswalks are) as is clear on both sides. Inside a plot, every pair of its
crossings, its door and any standing spots is joined by a grid path on the walking map, then straightened
wherever a straight line stays clear. Closed megastructures only join their doors to the street, so nobody
walks through them; the town square is open ground. Routes between plots use A* over this network.

**Doors.** Each building gets one front door, preferring sides that face a street crossing (order seeded per
building). The search walks in from the side's middle (then further along it) to the first thing in the way,
which sets where people stand, then looks for a door-high, flat wall right there or just behind a low step.
Nothing knee-to-chest high and nothing leafy may sit in the doorway. The door is turned to match the wall.
Megastructures get up to three doors, spread round them, real doors first. A building with no wall to put a
door on (a tower on stilts, the sky mall on its columns) gets an open entry instead: people walk in under it as
far as there's room and slip inside there, with no door drawn.

Doors are drawn in three instanced batches (frame, lit hallway, sliding panel in one of eight colors). A door
slides open in a fifth of a second when someone is about to come out or go in, and closes behind them. People
dissolve in the doorway as they cross the threshold.

**Places.** Every building is a place. Open places have spots instead of doors, one person per spot:
- **The town square.** The little box figures that used to stand in the square are gone; where they stood is
  noted while the square is built (stall keepers behind the counters, queues in front, the crowd round the pond,
  every cafe stool) and real people fill those spots. Each of the 14 food stalls has a keeper: the square's jobs
  are its stalls, and if nobody in town is looking for work, people living nearest swap their job for one. Half
  work the day market (10:00 to 17:30), half the night market (16:30 to midnight), so a stall is only open while
  its keeper is at the counter.
- **Benches.** Sidewalk benches and plaza benches have two seats each; every plot with one is a small place to
  sit for a while.

**What people do there.** A square visitor usually queues at an open stall (gesturing as they order while the
keeper serves), then takes their food to a cafe stool or a spot to stand. Otherwise they stand somewhere, often
right next to someone, and the two face each other and chat with gestures. Seats get the sitting frames. Each
spot is reached from the nearest clear point of the walking map, and the last little step onto a seat or behind a
counter is taken from there.

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
work, out, drawn, nodes, doors, and homeless: buildings with no way in, which should be 0).

A clipping check (in the session scratchpad, `clip.js`) fast-forwards a 9x9 test city for 150 seconds and
samples every walker outside a doorway against the footprint map: 0 of about 130,000 samples came within 0.1
units of a wall, a piece of furniture or a plant.

Rough numbers on a 7x7 test island (half plazas): 89 people; at 12:30 up to 57 walking at once; at 3:00
2 to 4.

## Known gaps and ideas

- Building the maps for a whole city at load takes about 2 ms a plot (more on a slow machine). Edits only
  redo the plots they touch.
- The small box figures at the foundry's loading dock are still there, at a smaller scale than the sprites.
- Chatting happens between people standing next to each other in the square; people passing on the street don't
  stop to talk yet.
- No collision between walkers yet: two people can pass through each other on a narrow path.
- People walk on the street band more than the sidewalk: the sidewalk round most buildings is too narrow for a
  person with clearance.

## Licensing

The character sheets are Craftpix assets (see https://craftpix.net/file-licenses/). Their terms allow use in
games but generally not redistributing the raw files, so the untouched source sheets
(`assets/sprites/originals/people/`) are kept out of the repo by `.gitignore`; only the packed atlas ships.
