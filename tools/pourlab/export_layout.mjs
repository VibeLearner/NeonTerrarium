// Reads the pxl art file (tools/pourlab/art/neon_dome.px.js) and writes assets/layout.json: where every movable thing
// sits, the glass and cup shapes, and the 13 ingredients. The art file is plain JavaScript that pxl runs with its
// drawing functions; here those functions are stand-ins that draw nothing, so only the numbers come out.
// Run: node tools/pourlab/export_layout.mjs
import fs from "node:fs"; import vm from "node:vm"; import path from "node:path"; import url from "node:url"
const here = path.dirname(url.fileURLToPath(import.meta.url))
const src = fs.readFileSync(path.join(here, "art/neon_dome.px.js"), "utf8")
const noop = () => ({})
const ctx = { Math, JSON, console }
for (const k of ["pal", "ramps", "include", "sprite", "scene", "layer", "stamp", "rect", "poly", "glow", "clip", "text", "ellipse", "line", "sheet"]) ctx[k] = noop
vm.createContext(ctx)
vm.runInContext(src + `
;globalThis.__layout = {
  W, H, CT, NEAR, VPX, VPY, GX, POUR_X, GLASS_BASE, TOOL_BASE, RAIL_TOP, BOTTLE_FLOOR, WELL, K,
  rail: INGREDIENTS.map((ing, k) => ({ id: ing.id, x: RAIL_X[k], floor: BOTTLE_FLOOR - lift(ing) })),
  ingredients: INGREDIENTS.map((ing) => ({ id: ing.id, name: ing.name, tag: ing.tag, liquid: ing.liquid, top: ing.top, dash: !!ing.dash })),
  tools: TOOLS().map(([n, x, y]) => ({ id: n, x, y })),
  glass: { rt: 13, rb: 12, h: 40, cx: 14 },
  cups: { cup_quarter: { rt: 9, rb: 7, h: 13 }, cup_half: { rt: 10, rb: 8, h: 17 }, cup_one: { rt: 11, rb: 9, h: 21 } },
  foot: FOOT,
}`, ctx)
fs.writeFileSync(path.join(here, "assets/layout.json"), JSON.stringify(ctx.__layout, null, 1))
console.log("wrote assets/layout.json:", ctx.__layout.rail.length, "bottles,", ctx.__layout.tools.length, "tools, pour x", ctx.__layout.POUR_X)

// The 5x7 pixel font the readout uses, from the pxl library file next to the art (glyphs as "#" rows).
const fsrc = fs.readFileSync(path.join(here, "art/font5x7.px.js"), "utf8")
const block = fsrc.slice(fsrc.indexOf("const GLYPHS = {") + "const GLYPHS = ".length, fsrc.indexOf("\n}\n", fsrc.indexOf("const GLYPHS = {")) + 2)
const glyphs = vm.runInNewContext("(" + block + ")")
fs.writeFileSync(path.join(here, "assets/font5x7.json"), JSON.stringify(glyphs))
console.log("wrote assets/font5x7.json:", Object.keys(glyphs).length, "glyphs")
