# Furnish pod

Do up any floor of a residential (`low`) or luxury (`high`) building, or a lifted pod, in the Pod Furniture Lab's Build mode,
from inside the game.

## How it fits together

- **js/furnish.js** (the game, three.js r128): the Furnish pod button, picking a floor, gathering the city, the overlay, saving.
- **furnish.html** (generated, committed): the lab built with `--embed` (Build only, boots straight into Build, writes nothing
  to localStorage), plus `window.PODCITY_NOPACK = true` (the city comes from the game, never from `city/*.wasm`) and the two
  files below. It runs three.js r149 from the CDN inside an iframe, so the two versions never meet.
- **furnish/bridge.js, furnish/bridge.css**: the game's side of furnish.html: the Exit to city and Save bar, in the game's
  colors and fonts, and the messages. They hide the lab's own Home menu (the game owns saving).

### Picking

Pick mode takes the pointer, the wheel and a few keys before the building controls (capture listeners on the canvas and the
window), so no zone, delete, transport or tilt action fires while picking; dragging still turns the view, and W A S D still
move it. The homes of a building are worked out from the cell the same way the lab's city pack does (`homesOf`): every whole
floor (`FH`) of each residential or luxury section, counted from the section's base (a lifted pod's sections start at
`lift.y`, an upper section 0.1 above the one below it, a bracketed pod section at its own `at`), plus the floors of a building
standing under a pod (sections numbered from 100). The bottom floor of a lifted pod is the pod itself (`section: -1`,
`kind: 'lift'`), whatever its zone, as in the lab.

### What the lab gets

On confirm the game gathers every plot and megastructure (`c.data.geo`, already in world space; `pmEnsure(c, 'full')` brings
back arrays that were let go after merging, as `claude/podlab/city/export-city.js` does), as plain arrays per class (`solid`,
`glass` for transparent materials, `fx` for shader materials): positions, rgb bytes (vertex color times material color), an
emission index into a shared table of `[r, g, b, flag]` (from `aEm`) and indices. Plots within about 46 units of the home go
at full detail; the rest are clustered on a 0.22 grid like the lab's own pack (kept between visits while a plot is unchanged).
Then it posts, with every ArrayBuffer transferred:

```
{ type: 'furnish:open', city, home, recipe, tier, time, label }
city = { v: 1, source: {live: true}, consts, camera, cells, megas, em, homes, towers, plots: [{kind, id, box, full | coarse}] }
home = { cell: [i, j], section, floor, sf, y, y1, zone, kind, x, z, sides, v, d }
```

`city` has the shape of the lab's `city/index.json` with the plots already decoded, and goes to `PodContext.setCitySource`.
A home with a saved recipe is loaded with `PodBuilder.load(recipe)` (its `home.pod` set to this home); a new one is
`PodBuilder.newHome(null, pod)`: the lab picks the size from the building and takes the windows from its real facade. The game's day or night is set with
`PodBuilder.setTime(time, {host: true})`.

### Messages

| From | Message | Meaning |
|---|---|---|
| furnish.html | `furnish:ready` | PodBuilder is up: send the city |
| game | `furnish:open` | the city, the home, its saved recipe |
| furnish.html | `furnish:save` `{recipe}` | Save (or Ctrl+S): keep it with the city |
| game | `furnish:saved` `{ok}` | stored (or the storage is full) |
| furnish.html | `furnish:exit` `{recipe or null}` | Exit to city; the recipe when there are unsaved changes |
| furnish.html | `furnish:error` `{message}` | the home could not be opened |

Only messages from the frame's own window and the page's own origin are read, both ways.

### Saving

Recipes live in localStorage `neonIsland.furnish`: `{ v: 1, homes: { "i,j|section|floor": { at, zone, kind, n, recipe } } }`.
It is one of the city's keys (`js/saveguard.js`), so it is copied into the save slot and goes into city files and cloud saves.

### While it's open

`FURN.hold` stops the frame loop (as the Overseer's desk and the Acoustic Panel do): the city, its clock and its people wait.
The iframe is made on open and removed on exit, so its WebGL context goes with it.

## Making furnish.html again

After the lab changes (or after editing `furnish/bridge.*`, whose `?v=` comes from their contents):

```
python3 tools/furnish/build.py path/to/podlab
```

It runs the lab's `build.py --embed` in the lab's folder and writes `furnish.html` here. Nothing from the lab's `city/` folder
(the packs, the export JSON) belongs in this repo.

## Known gaps

- Furnished floors aren't marked in the city yet.
- A building removed or rebuilt keeps its old recipes under the same cell, section and floor.
- Gathering a big city the first time can take a few seconds while plots are made again; later visits reuse the stand-ins.
