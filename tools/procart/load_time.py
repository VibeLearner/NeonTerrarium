#!/usr/bin/env python3
"""The load time this round's art adds, counted in pixels and timed in headless Chromium (no game, no GPU: just the generators on a bare page).
  python3 tools/procart/load_time.py
Prints, for the art drawn in the load itself (the shop signs and badge, the drone, the bikes, the cassette) and the art drawn a moment after load (the deferred boards: koi, wanted posters, hologram ads,
the air holograms, the wall holograms), the milliseconds of the first (cold) run and of the next runs, and the pixels each draws. Timing in the game's real page on a real machine: see the two-line
console snippet printed at the end (REVIEW.md has it too)."""
import glob, os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
JS = """() => {
  const sync = ['ddrone', 'cassette', 'pbike_r1c1', 'pbike_r1c2', 'pbike_r1c3', 'pbike_r1c4', 'pbike_r2c1', 'pbike_r2c2', 'pbike_r2c3', 'pbike_r2c4'], rows = [];
  const lit = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };
  const run = names => { let ms = 0, px = 0; for (const n of names){ const [w, h] = ART.SIZE[n], c = document.createElement('canvas'); c.width = w; c.height = h; const t = performance.now(); ART.gens[n].fn(c.getContext('2d'), w, h, ART); ms += performance.now() - t; px += lit(c); } return [ms, px]; };
  const signs = () => { let px = 0; const t = performance.now(); for (const k of ART.SIGNS){ const p = SG.draw(k, k === 'sign_police' ? 40 : 30, k === 'sign_police' ? 50 : 25, 0); px += p.n; } return [performance.now() - t, px]; };
  const later = Object.keys(ART.gens).filter(n => ART.gens[n].defer);
  const out = {};
  for (const pass of ['cold', 'warm1', 'warm2']){ const s = signs(), a = run(sync), d = run(later); out[pass] = { loadMs: +(s[0] + a[0]).toFixed(1), loadPx: s[1] + a[1], deferredMs: +d[0].toFixed(1), deferredPx: d[1] }; }
  out.deferred = later; return out; }"""
def main():
    from playwright.sync_api import sync_playwright
    files = [os.path.join(ROOT, 'js/spritegen.js'), os.path.join(ROOT, 'js/artgen.js'), os.path.join(ROOT, 'js/artgen_tools.js')] + sorted(f for f in glob.glob(os.path.join(ROOT, 'js/artgen_*.js')) if os.path.basename(f) != 'artgen_tools.js')
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.set_content('<html><body></body></html>')
        pg.evaluate('() => { window.THREE = { Texture: function(){}, CanvasTexture: function(){}, TextureLoader: function(){ this.load = () => ({}); } }; }')
        for f in files: pg.add_script_tag(content=open(f).read() + "\n;if (typeof ART !== 'undefined') window.ART = ART; if (typeof SG !== 'undefined') window.SG = SG;")
        r = pg.evaluate(JS); b.close()
    for k in ('cold', 'warm1', 'warm2'): print(k, r[k])
    print('deferred kinds:', r['deferred'])
    if errs: print('PAGE ERRORS', errs[:3]); sys.exit(1)
    print("\nOn your machine (game open, console):\n  const t = performance.now(); for (const k in ART.gens){ const [w, h] = ART.SIZE[k] || [64, 64], c = document.createElement('canvas'); c.width = w; c.height = h; ART.gens[k].fn(c.getContext('2d'), w, h, ART); } console.log('art drawn in', (performance.now() - t).toFixed(0), 'ms (all of it, including the boards drawn after load)');\n  const u = performance.now(); for (const k of ART.SIGNS) SG.draw(k, k === 'sign_police' ? 40 : 30, k === 'sign_police' ? 50 : 25, 0); console.log('shop signs and badge', (performance.now() - u).toFixed(1), 'ms');")
main()
