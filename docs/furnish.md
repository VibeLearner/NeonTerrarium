# Furnish pod

Do up any pod of a residential (`low`) or luxury (`high`) building, or a lifted pod, in the Pod Furniture Lab's Build mode,
from inside the game.

## How it fits together

- **js/furnish.js** (the game, three.js r128): the Furnish pod button, picking a pod, gathering the city, the overlay, saving.
- **furnish.html** (generated, committed): the lab built with `--embed` (Build only, boots straight into Build, writes nothing
  to localStorage), plus `window.PODCITY_NOPACK = true` (the city comes from the game, never from `city/*.wasm`) and the two
  files below. It runs three.js r149 from the CDN inside an iframe, so the two versions never meet.
- **furnish/bridge.js, furnish/bridge.css**: the game's side of furnish.html: the Exit to city and Save bar, in the game's
  colors and fonts, and the messages. They hide the lab's own Home menu (the game owns saving).
- **furnish/touch.js, furnish/touch.css**: the phone layout, only when the main pointer is a finger (`html.ftouch`): a bottom
  tray of icon tabs and a sideways strip of tiles (the lab's own rail and flyout, restyled), Stored and Home tabs, a bar over the
  selected piece or the ghost (place, turn, copy, tint, store, delete), cyan solid or magenta dashed ghost outlines, press and hold
  a floor or wall to tint it, pinch and two-finger pan. They reach into the builder through `PodBuilder.touch`, a few hooks
  `tools/furnish/build.py` adds to the lab's builder.js (`TOUCH_API`). After editing any furnish/ file,
  `python3 tools/furnish/build.py --refresh` updates the tags and their `?v=` in furnish.html without the lab.

### Picking

Pick mode takes the pointer, the wheel and a few keys before the building controls (capture listeners on the canvas and the
window), so no zone, delete, transport or tilt action fires while picking; dragging still turns the view, and W A S D still
move it. The homes of a building are its **pods**, the blocks its builder stacked. While a plot's sections are built,
`chunkBox` (`js/buildings.js`) notes each block it makes (its section, height range, centre and footprint) in `c._pods`. The
list is made afresh with each build and comes back from the plot worker like the plot's other fields. `homesOf` turns them
into homes for each residential or luxury section:
- blocks side by side at one height are one pod;
- a block more than about three floors tall is split into pods of about two floors;
- a section with no blocks noted falls back to pods of two floors.

The building under a lifted pod counts too (its sections are numbered from 100). The bottom pod of a lifted stack is the pod
itself (`section: -1`, `kind: 'lift'`), whatever its zone, as in the lab. A home row carries:
- `floor`: the floor number at the pod's bottom, unique within its section, and used in the save key;
- `y` and `y1`: the deck (the pod's bottom) and its top;
- `x`, `z` and `fp: {w, d, ry}`: the block's centre and footprint;
- `pod` and `pods`: "pod N of M".

Picking outlines the pod in its zone's neon, hugging the block, with a light fill. Scrolling or Up / Down steps pod by pod.

### What the lab gets, and when

A click opens furnish.html at once over the city as it stands (the game holds its frame loop from that moment; the picked pod
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

### Kept loaded, and timed

The page is made once and kept for the whole session.
- **Preloaded.** While the title screen shows, or in idle time after the city loads when the title is skipped, `js/furnish.js`
  makes the page hidden, letting clicks through to the city (`.furnish.pre`). On `furnish:ready` it sends `furnish:warm`. The
  bridge then calls `PodBuilder.warm()` (the furniture library, the furnishing worker, the build view's programs) and
  `PodContext.warm()` (every render target and the city, hologram and pass programs, compiled in idle slices with parallel
  shader compile), and the page sleeps (`PodBuilder.pauseRender`).
- **Instant open.** A click shows the page at once and sends `furnish:begin`: no page load and no shader compiles. The
  lab's hologram draws from its first frame, and the work behind it (the city's plots, the furnisher in its worker, the
  meshes, the uploads) runs in slices of a few milliseconds.
- **Reused.** Exit, or Esc while it opens, hides the page again. The bridge lets go of the home and the city
  (`PodBuilder.unload()`, `PodContext.exit()`) and keeps the programs, library and worker for the next visit. A lab without
  `PodBuilder.unload` can't be reused, so the page is made again for each visit, as before.

Every open is timed from the click. `FURN.lastStats` in the game page's console holds:
- `clickToLive`: the hologram has the screen, from `furnish:live`;
- `clickToResolve`: the home is in, the city has all come and the hologram has resolved, from `furnish:done`;
- `longestBlock`: the longest gap between two frames on the shared thread during the open;
- `gather`: the city stream's own numbers;
- `lab`: the lab's `PodContext.stats().timeline` (firstHoloFrame, cityBuilt, warm, firstBake, resolve, longestTaskMs,
  slicesOver8ms) and `PodBuilder.perf()` (worker plan and pieces, main-thread assembly, longest slice);
- `pageLoadMs` and `warmMs` from the preload.

A console line, "Furnish pod: open timing", prints the same.

### Who lives there

Residents live in pods. `syncResidents` (`js/people.js`) still makes each residential or luxury section's people as before:
the same number, with the same ids, so stories, cases, the ledger and the residents count are unchanged. It then shares them
out over that section's pods:
- the pods are visited in a seeded order of their own;
- each pod takes a household of one to four until the people run out, so some pods stand vacant;
- anyone left over joins the smallest households, up to four;
- past that they live in the building without a pod, as everyone used to.

Each person's pod is `p.pod` (the save key `'i,j|section|floor'`), and `POD_HH` holds each pod's household.
`podsResync(c)` redoes one plot from its pods as they stand. Furnish pod calls it when you hover a building and before it
opens a pod, because a plot's blocks are only known once it has been built. Everything follows from the city's saved data,
so households are the same on every load.

Opening a pod with no saved apartment furnishes it for its household:
- `householdFor` (`js/furnish.js`) turns the pod's people into the lab's household model:
  - an age band from their age (`story.js`);
  - a job from the lab's list, from what they do (`STORY.jobKind`);
  - the shift;
  - their temperament (outgoing, careful, warm);
  - hobbies from the places they keep going to;
  - how they're related (single, couple, roommates, siblings, couple and roommate).
- The lab's `PodBuilder.furnishFor(household, {tier: null, pod})` takes the pod's real windows first, runs the household
  furnisher (mixed sets, lived-in clutter, the layout engine with its rule-break ladder) and loads the result as an
  ordinary editable home.
- The Residents card (`PodBuilder.setResidents`) names them, with their age, job and traits.
- A vacant pod opens empty with "Vacant: nobody lives here yet".
- The pick tip says how many live in the pod, or "vacant".

### Messages

| From | Message | Meaning |
|---|---|---|
| furnish.html | `furnish:ready` `{reusable}` | PodBuilder is up (reusable: it can be kept for the next visit) |
| game | `furnish:warm` | preloaded: warm everything up, then sleep |
| furnish.html | `furnish:warmed` `{ms}` | warmed up |
| game | `furnish:wake` | a visit is starting |
| game | `furnish:begin` `{head, home, recipe, tier, time, label, household, residents, vacant}` | the head of the city, the home, its saved recipe, who lives there |
| game | `furnish:plots` `{plots, em, k, done}` | a batch of plots, progress 0 to 1, and whether it is the last |
| furnish.html | `furnish:live` | the hologram has the screen: show the page |
| furnish.html | `furnish:done` `{lab}` | the open has resolved, with the lab's timings |
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

- Furnished pods aren't marked in the city yet.
- A building removed or rebuilt keeps its old recipes under the same cell, section and floor.
- The first visit in a big city takes longer while plots whose arrays were let go are made again; the hologram waits for them.
- The gathering runs on the game's thread, which the page shares, in short slices: a heavy first visit can make the hologram's first second less smooth.

## Open-path performance notes (round: open hitches)
- While picking, the stand-ins of every plot are kept for the visit. Plots the game has let go of are asked for from its worker eight at a time (`warmLater`), so the click no longer waits for hundreds of them.
- Resting the pointer on a building for 300 ms asks for the full-detail ring round it (`nearWarm`, up to 40 plots, once per 15 s per building).
- The hover pick runs once per frame, and a building's pod boxes are kept for 400 ms.
- In the lab: the governor ignores a GPU timer reading above the frame interval (Apple's timer over-reads) and tries a step up when the rate holds; plain line programs are compiled in the title warm-up; the Work light keeps a spare lighting bake for the other state (baked when the room is idle) and swaps to it on toggle; the city's normals are computed in 4096-triangle pieces.
