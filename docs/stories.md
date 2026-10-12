# Stories in the game: the monitor, the web of people, and story moments

Code: `js/story.js` (the engine), `js/monitor.js` (the panel, picking, fast forward). Data: `data/stories/` (the storylets, `vocab.json`, `names.json`, and `engine.json` for the game's own lines). Rules for every line: `tools/stories/SCHEMA.md`.

## Playing with it

- **Click someone in the street.** The monitor opens top right: a camera feed cropped from the view around them, the log, and the notebook. Dragging from a person still turns the view.
- **Follow** keeps the camera on them (WASD or the arrows hand the camera back). When they go indoors the feed shows SIGNAL LOST and watches their door: anything that happens at that door (a knock, a drone, a neighbor with soup) is still seen.
- **The notebook** starts blank. Details only from a document or an introduction (or a name heard); people around them, with how each thing was learned; names heard for nobody you can put a face to yet; observations labeled by how they were learned. Click a name to switch the monitor to that person.
- **Answer key (for testing)** at the bottom of the notebook: who they really are, whether they're sick today, their ties, and the six-degrees numbers for the city.
- **Speed** (top middle): 1x (a day an hour), 10x (six minutes), 60x (one minute). Fast forward turns the day cycle on.
- Esc closes the monitor.

## What happens

- **Everyone has a place in a web**: household (partners, siblings, parents and children share a surname), neighbors in the homes next door, coworkers and a boss, the keeper of the stall they use, two friends across town, sometimes family elsewhere, an ex, a creditor, a landlord. The long ties keep the whole city a few steps apart (on the owner's city: 1,168 people, 2.8 steps on average, everyone within four).
- **Days vary**: a sick day (one to three days at home, all day; nobody sees it), a late start, a day off. By hash of the person and the day.
- **While someone is watched**, about once a game hour the director looks for a storylet that fits them, the hour, the weather and the people near them, and plays it with real people: they walk to real doors, knock, hand things over, talk. Often nothing happens: quiet stretches are real. Moments can also be someone else's that the watched person is part of (a neighbor locked out, a friend collecting a spare key).
- **Sick at home**: the door stays shut at the hour they usually come out ("Seen opening near this hour on 2 days before"). A neighbor or friend may turn up with food, and the reason comes out on the step. A pharmacy drone may come.
- **Deliveries**: drones wait at the door until someone comes out to take the parcel (nobody home: it goes on the step, as before). The label gives the full name, verified. What's inside follows their life (medicine when sick, a dress, a letter, papers from a law office, a bottle, flowers...), and so does what they do: go back in without a word, call someone on the step, or post on the mesh.
- **Gossip**: people pass on news about people they know (who is sick, who got what) when they talk in front of the watched person. The person talked about gets a secondhand entry in their own notebook.
- **Names come up the way they do in life**: a hello in passing, a name tag at work, an order called at a counter, a phone answered, a label, a door plate.
- What the player has learned is kept between sessions (`localStorage`, `neonIsland.stories`). `STORY.forget()` in the console clears it.

## Limits for now

- Storylets that need the metro, the club, the drop-offs, the police or an empty lot aren't staged yet (170 of 220 are). Life changes that move people (leaving the city, losing a home) only exist in the data; the game doesn't move anyone out yet.
- Only the watched person's life gets story moments; everyone else's days vary (sick, late, off) and they get parcels, and the news travels.
- The feed is a crop of the frame: someone off screen with Follow off shows OUT OF VIEW.

## For tests

`STORY.stats()`, `STORY.dbg` (why the director did or didn't start something), `STORY._dir()` (a director pass now), `STORY.sendDrone(id)`, `STORY.isSick(id)`, `MON.open(id)`.
