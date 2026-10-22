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

### What the lab gets, and when

A click opens furnish.html at once over the city as it stands (the game holds its frame loop from that moment; the picked floor
stays lit underneath) and the page fades in as soon as the lab's hologram has the screen. The loading is folded into the
hologram: the game sends a **head** first and then the **plots** in small batches while the hologram plays, and the lab paces
the hologram on that progress (`PodContext.progress`).

- **head** (a few ms to make): `{ v: 1, source: {live: true, streaming: true}, consts, camera, cells, megas, em, homes, towers, plots: [] }`,
  the shape of the lab's `city/index.json` with no geometry. It goes to `PodContext.setCitySource(head, {streaming: true})`,
  so the homes, the city map and the hologram's starting camera (the game camera) work straight away.
- **plots**, nearest first: the home's own plot alone in the first batch, then the ring within about 46 units at full detail
  (with the game's normals, which saves the lab working them out), then the rest of the city as a clustered stand-in (vertices
  merged on a 0.22 grid). Each goes to `PodContext.addPlots(plots, em)`; the last batch calls `PodContext.cityDone()`.
- Each plot is `{kind, id, box, full | coarse}`, a class (`solid`, `glass` for transparent materials, `fx` for shader
  materials) being `{pos, col, em, idx, n, nrm?}`: world-space positions, rgb bytes (vertex color times material color), an
  index into the shared emission table of `[r, g, b, flag]` rows (from `aEm`; the table only grows, so indices stay put), and
  indices. Every ArrayBuffer is transferred, not copied.
- Speed: the far stand-ins are made while the player is still picking (idle moments, from arrays the game still holds) and
  kept while a plot is unchanged, so most of the city goes straight out. The far city uses the game's own stand-in tier when it
  has one. Plots whose arrays were let go after merging are asked for again (`pmEnsure`) the near ones first, the far ones
  last and a couple of dozen at a time. Work is done in slices of about 6 ms (the page shares the game's thread). The page
  itself is prefetched when picking starts. `FURN.lastStats` and a console line give the timings of the last visit.

A home with a saved recipe is loaded with `PodBuilder.load(recipe)` (its `home.pod` set to this home); a new one is
`PodBuilder.newHome(null, pod)`: the lab picks the size from the building and takes the windows from its real facade. The
game's day or night is set with `PodBuilder.setTime(time, {host: true})`.

### Messages

| From | Message | Meaning |
|---|---|---|
| furnish.html | `furnish:ready` | PodBuilder is up |
| game | `furnish:begin` `{head, home, recipe, tier, time, label}` | the head of the city, the home, its saved recipe |
| game | `furnish:plots` `{plots, em, k, done}` | a batch of plots, progress 0 to 1, and whether it is the last |
| furnish.html | `furnish:live` | the hologram has the screen: show the page |
| furnish.html | `furnish:save` `{recipe}` | Save (or Ctrl+S): keep it with the city |
| game | `furnish:saved` `{ok}` | stored (or the storage is full) |
| furnish.html | `furnish:exit` `{recipe or null}` | Exit to city; the recipe when there are unsaved changes. Esc while the apartment is still coming in sends it with no recipe (cancel) |
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
- The first visit in a big city takes longer while plots whose arrays were let go are made again; the hologram waits for them.
- The gathering runs on the game's thread, which the page shares, in short slices: a heavy first visit can make the hologram's first second less smooth.
