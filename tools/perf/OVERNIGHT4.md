# Overnight 4: the recipes round (in progress, stopped early)

Base: main at 6da3dbf. Work branch (local): wip/recipes.

## Status

| Item | State |
| --- | --- |
| 0 Baseline | memcheck maxcity and city started, numbers not yet recorded |
| 1 Recipe and proof | discovery only (below), no recipe code yet |
| 2 to 7 | not started |

## Item 1 discovery so far (traced `collectGen(cellBody(c))` with Proxies)

- Neighbor reads in the scenes traced (megas, city, dense) are only `cells.has(ckey(i+a, j+b))` for the four edge offsets (1,0), (-1,0), (0,1), (0,-1). No neighbor field is read. So the recipe's neighbor input is a 4-bit existence mask.
- Own fields read: style, green, i, j, x, z, mega, sections, lift, lifts, belowTop, sectionTops, _topLot, dark, park.
- Own fields written: lifts, topY, belowTop, belowTops, liftRoof, sectionTops, firstFloors, _topLot, height, walks, liftCab, vent.
- Global helpers called: hwFeet, mtFeet, hwKeepOut, mtKeepOut (hwAt, mtAt, isDarkPlot, megaAt are not wrappable by name, so they were not counted).
- Not yet covered: maxcity, highway and metro heavy scenes, c.mega contents, S.* reads, airCells and addPerch writes, read-before-write order per field.

## Blocked

The session designates branch claude/beautiful-lovelace-oa42g9, which exists locally and on origin at a7b4449 (an ancestor of 6da3dbf, so a fast-forward loses nothing). Checking it out and fast-forwarding was denied by the permission classifier, so nothing has been pushed. Decision needed from the owner: allow the fast-forward (or name another branch to push to).
