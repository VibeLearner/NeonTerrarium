// Neon Terrarium: the people drawn in code (character generator plan, claude/character-generator-plan.md). This is the core: the look codes, the palette lookup and the switch to the old Craftpix sheet;
// the drawing (pose table, body, parts, looks) is added to it step by step. Runs after spritegen.js and before people.js, shares their scope. Like spritegen.js it touches no game state, and the plot worker
// (which loads people.js, with stand-ins) never draws: everything here that draws is guarded by IN_RECIPE_WORKER.
//
// A look code is what a person carries as their `row` (people.js emit): old row | shape << 5 | palette << 12. The old row is the Craftpix sheet's row for this person (what the old sprite sheet draws,
// and what the switch "old people (as before)" shows); the shape is a row of the generated sheet, the palette a row of the palette texture. emit writes `code & 31` in the old mode and `code >> 5`
// (shape | palette << 7) in the new, so every site that draws a person stays as it is. A code with no shape bits is a role by its old row (officer, bouncer, archivist, emote bubbles): see PG.roleCode.
const PG = (() => {
  const P = { VERSION: 1, sheet: null, pal: null, roleShape: {}, rolePal: {} };
  // is the generated sheet in use (a generator has drawn it, and the old Craftpix sheet is not asked for: window.__OLD_PEOPLE, the overlay test "old people (as before)")
  P.live = () => !!P.sheet && !window.__OLD_PEOPLE;
  // the code of a person: old row (0..31), shape (0..127), palette (0..1023)
  P.code = (oldRow, shape, pal) => oldRow | (shape << 5) | (pal << 12);
  P.oldRowOf = code => code & 31;
  // what the shader gets in the new mode: shape | palette << 7; a code with no shape bits is a role by its old row
  P.shapeOf = code => { const s = code >> 5; return s ? s : (P.roleShape[code & 31] | 0) | ((P.rolePal[code & 31] | 0) << 7); };
  return P;
})();
