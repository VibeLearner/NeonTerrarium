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
   - `PODLAB_CLUBSHELL` builds the shell in place of an apartment's straight wall runs, two levels as in the city (owner, Nov 19):
     - the drum wall in 64 segments (4.7 m), with a ledge, a pink neon band and lit windows inside;
     - the gallery on top of the drum: 32 deck sectors, an edge fascia with neon, glass rail panels with a cyan and pink top rail,
       posts, brackets, and the bar at the back (a lacquer counter, shelves of lit bottles);
     - two curved flights of stairs from beside the entrance up to the gallery's edge;
     - the geodesic glass dome (the city's own rings and triangles, 17.5 m by 13.9 m) with its dark frame and runs of neon struts;
     - four glass panes tagged `userData.window` at the room's edges, so PodRender brings day and night light through the dome.
   - `PODLAB_CLUBVIEW` (from `wallTargets`, so the Walls buttons and the camera's turn) decides what stands by the side each part faces:
     Up shows it all; Cutaway drops the near side of the drum to 0.9 m and takes away the near half of the gallery, stairs and dome;
     Down leaves the ground floor with the drum low all round.
   - Only the dome, no city (owner, Nov 19): PodContext stays out of a club (`ctxEarly`, `ctxEnter`), the painted skyline is hidden,
     and a night gradient sits behind the dome (`body.nt-club`). The view opens zoomed in (1.3) so the dome fills the screen. The header
     says "Neon Dome · the club floor".
   - Club floors (`cl_floors`): a floor finish per set (black terrazzo with brass inlay, caramel terrazzo, deck plate, bathhouse mosaic).
     A new club lays its set's; a club saved without one gets it when it opens (furnish/bridge.js).
   - The Build rail shows the club's groups (Seating, Tables, Dance, Lights, Center: `PODLAB_CLUBGROUPS`) while a club is open, and the
     apartment's otherwise (`railFor`, from `intoStage`). The club categories join the rail's catalog (`PODLAB_CLUBCATS`).
   - The base slab is round for a club (in the shell).
   - One DJ booth per club: furnish/bridge.js takes a second one back (undo) with a message.
   - All of this goes in through `CLUB_HOOKS` in tools/furnish/build.py: insertions next to anchors in the lab's code, wrapped in
     `/*ntc*/ ... /*/ntc*/`, which every run strips and adds again (so `--refresh` never adds a hook twice). club.js is
     inlined in the page like the lab's own sections, because the builder's furnishing worker bundles the inline section scripts.
4. **Entry from the game** (js/furnish.js): done.
   - With no zone, tool or mode picked, a click or tap on a standing Neon Dome (no drag) opens the furnisher with its club (`openClub`;
     `FURN.openClub(m)` from the console).
   - The club's home row (`clubRow`) is the dome's floor: its corner cell, section `'club'`, floor 0, so the save key is `'i,j|club|0'` in
     `neonIsland.furnish`. It sits at the floor's height, with a footprint the dome's size turned the way its entrance faces. `head()` adds
     it to the homes, so the lab finds where the club sits.
   - Nobody lives there: no household. The label is "Neon Dome · the club floor", and the tier is `'club'`.
   - A dome furnished for the first time opens with the starter kit (furnish/bridge.js, from `PODLAB_CLUB.recipe` and the dome's seed),
     and it counts as a change, so Exit keeps it.
5. **Through the glass:** on Save the furnisher also sends a light copy of the furniture (merged positions, colors, emissive) and the
   dance floor tiles. The game builds it inside the dome with its toon materials. `buildNeonDome` drops the fixed floor and stage when a
   club has a recipe, and `clubFx` lights the placed tiles and aims the beams at them.
6. **The crowd:** `clubDancePos` (js/people.js) picks dance spots from the tiles, and seats and standing spots from the pieces.

Heavy graphics checks (frame times, lighting bakes) run on the owner's Mac; the cloud VM only checks that things load and draw.
