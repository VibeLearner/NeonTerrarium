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
  before the lab core (`CLUB_MARK`), so `--refresh` brings it in without the lab. Categories are `cl_*`, arch keys `club_<kind>_<set>`.
  The apartment Build view lists only its own groups, so apartments never show club pieces.

## Steps

1. **Club catalog in the furnisher.** Done: furnish/club.js, loaded by build.py.
2. **Dance floor tiles** in club.js: a 1 m floor tile per set (glass, chrome, hazard deck, mosaic), flat, flagged as dance floor.
3. **The club home** in the furnisher:
   - A recipe with `home.tier = 'club'`: a round floor on the 0.5 m grid (the ground floor out to the drum wall).
   - A club shell instead of an apartment's walls: the drum wall, the gallery overhead, the dome glass (windows for PodRender's day
     and night light).
   - The Build rail swapped to club groups.
   - One DJ booth per club.
   - The starter kit.
   Done through hooks build.py adds to the builder (as `TOUCH_API` does).
4. **Entry from the game** (js/furnish.js): clicking a standing Neon Dome opens the furnisher with the club home (a `club` home row in the
   head, keyed by the dome's id). The recipe is saved with the city under `neonIsland.furnish` (key `club:<mega id>`).
5. **Through the glass:** on Save the furnisher also sends a light copy of the furniture (merged positions, colors, emissive) and the
   dance floor tiles. The game builds it inside the dome with its toon materials. `buildNeonDome` drops the fixed floor and stage when a
   club has a recipe, and `clubFx` lights the placed tiles and aims the beams at them.
6. **The crowd:** `clubDancePos` (js/people.js) picks dance spots from the tiles, and seats and standing spots from the pieces.

Heavy graphics checks (frame times, lighting bakes) run on the owner's Mac; the cloud VM only checks that things load and draw.
