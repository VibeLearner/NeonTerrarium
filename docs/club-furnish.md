# Furnish the Neon Dome

Click the Neon Dome and do up its ground floor in the furnisher (furnish.html), as Furnish pod does for apartments. The furniture
then shows through the dome's glass in the city, and the crowd uses it. Owner's decisions (Nov 19): see the project doc
`claude/neon-dome-club-furnishing.md`. In short:

- **Entry:** click the dome; the furnisher opens full screen with the club; Save returns to the city.
- **What's editable:** the ground floor, including the ring under the gallery (floored for this). The gallery and its bar stay fixed.
- **Dance floor:** placeable, as grid tiles in any shape, one look per set; joined tiles light up as one floor to the 124 bpm beat.
  The old fixed round floor and the stage go.
- **Starter kit:** a new club comes with a small dance floor and a DJ booth placed, which can be moved or removed. One DJ booth per club.
- **Catalog:** every piece of the club furniture section (all approved by the owner), all four sets. Purely cosmetic and free.
- **Grid snap with 45 degree turns.**
- **Crowd:** dances on dance floor tiles only, sits in booths and on stools, stands at high tables and counters.

## The pieces

- **furnish/club.js:** the club furniture section (booths, bar stools, high tables, decor bar counters, DJ booths, pendants, neon signs,
  centerpieces; sets A Neon lounge, B Orbital lounge, C Industrial rave, D Crystal bathhouse). It is a lab section like the others: it
  registers on `window.PODLAB_SECTIONS` and builds with the lab's kit (`K.STYLE`, `K.HAB`). `tools/furnish/build.py` puts its tag right
  before the lab core (`CLUB_MARK`), so `--refresh` brings it in without the lab. Categories are `cl_*`, arch keys `club_<category>_<set>` (e.g. `club_cl_dance_A`).
  The apartment Build view lists only its own groups, so apartments never show club pieces.

## Steps

1. **Club catalog in the furnisher.** Done: furnish/club.js, loaded by build.py.
2. **Dance floor tiles** in club.js: done. A 1 m tile per set (`cl_dance`, `club_cl_dance_<set>`), 2 by 2 or 3 by 3 lit panels, `dance: true`. They are tagged `rug` through `window.PODLAB_TAGS`, which build.py joins to the pods tag table (`TAGS_HOOK`), so other pieces can stand on them.
3. **The club home** in the furnisher: done.
   - `PODLAB_CLUB.home()` and `.recipe({seed, set, night})` (furnish/club.js) make a club recipe: `home.tier = 'club'`, a 70 by 70 grid
     of 0.5 m tiles (35 m) whose cells inside a 17.5 m circle are the one room "Club floor", the entrance on the south. The starter kit is a
     4 by 4 m dance floor in the middle and a DJ booth behind it, facing it, in one set picked from the seed.
   - `PODLAB_CLUBSHELL` builds the shell in place of an apartment's straight wall runs:
     - the drum wall in 64 segments, full height (4.7 m) on the far side and 0.9 m on the side facing the build camera (chosen per frame);
     - the gallery overhead as a faint ring with its neon rail and 10 posts;
     - four glass panes tagged `userData.window` at the room's edges, so PodRender brings day and night light through the dome.
   - The Build rail shows the club's groups (Seating, Tables, Dance, Lights, Center: `PODLAB_CLUBGROUPS`) while a club is open, and the
     apartment's otherwise (`railFor`, from `intoStage`). The club categories join the rail's catalog (`PODLAB_CLUBCATS`).
   - The base slab is round for a club.
   - One DJ booth per club: furnish/bridge.js takes a second one back (undo) with a message.
   - All of this goes in through `CLUB_HOOKS` in tools/furnish/build.py (each applied once, so `--refresh` can run again). club.js is
     inlined in the page like the lab's own sections, because the builder's furnishing worker bundles the inline section scripts.
4. **Entry from the game** (js/furnish.js): clicking a standing Neon Dome opens the furnisher with the club home (a `club` home row in the
   head, keyed by the dome's id). The recipe is saved with the city under `neonIsland.furnish` (key `club:<mega id>`).
5. **Through the glass:** on Save the furnisher also sends a light copy of the furniture (merged positions, colors, emissive) and the
   dance floor tiles. The game builds it inside the dome with its toon materials. `buildNeonDome` drops the fixed floor and stage when a
   club has a recipe, and `clubFx` lights the placed tiles and aims the beams at them.
6. **The crowd:** `clubDancePos` (js/people.js) picks dance spots from the tiles, and seats and standing spots from the pieces.

Heavy graphics checks (frame times, lighting bakes) run on the owner's Mac; the cloud VM only checks that things load and draw.
