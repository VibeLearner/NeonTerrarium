#!/usr/bin/env python3
"""Baked far buildings, round 10: every crop and every number in one run, for a real graphics card.
   pip install playwright pillow numpy
   PERF_GPU=1 python3 tools/perf/baked_mac.py dense --out baked_mac_out
Three pages are opened one after the other from the same save, each ONCE: baked (Detail tiers on, Baked far buildings on), then real (Detail tiers off) and stand-in (tiers on, baked off). Each page goes through
every zoom, hour and motion (still, mid-turn) in turn, so a block that was baked stays baked and nothing is loaded twice. The baked page decides how many frames each capture takes (it waits for the bakes);
the other two step exactly as many, so the clock, the clouds and the shadows are the same in all three pictures. With PERF_GPU=1 the page runs in your own Google Chrome, in a visible window, on your card
(do not cover or resize the window while it runs); without it, in the headless software renderer (a lot slower, and its timings mean nothing).
Writes, in one folder (--out):
  crops/<scene>_z<zoom>_h<hour>_<motion>.png   real | stand-in | baked | difference real/baked (x4) | difference real/stand-in (x4), the middle of the picture
  full/<scene>_z<zoom>_h<hour>_<motion>_<real|stand|baked>.png   the whole pictures, for flip tests
  numbers.json, numbers.csv, SUMMARY.md       triangles and draw calls (with the static cache on, and with it off so the whole frame is drawn), milliseconds a frame (drawn frames, the card finished),
                                              the geometry and texture counts, the page's heap, the baked maps' size, the bake counts and times"""
import argparse, csv, io, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import harness as H
from PIL import Image, ImageChops

CAP = r"""
async ([zoom, hour, turn, mode, settle]) => {
  S.cycle = false; S.hour = hour; S.rain = false; PH.tests.noStatic = false;
  const step = async n => { for (let g = 0; g < n; g++){ __step(1); if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); } };
  if (!window.__bm) window.__bm = { yaw0: yaw };
  __perf.skip = true; zoomT = zoom; yaw = yawT = __bm.yaw0; let used = 0;
  const bakedDone = () => mode !== 'baked' || (typeof BAKE !== 'undefined' && (() => { const s = BAKE.stats(); return (s.by.ready || 0) + (s.by.failed || 0) >= s.plots && !BAKE.job; })());
  if (settle > 0){ await step(settle); used = settle; }
  else {
    await step(300); used += 300;
    for (let g = 0; g < 60000 && !((!solidDirty.size && !SOLID_JOB && !TIER.markedAt.size && bakedDone()) && g > 60); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); }
    await step(240); used += 240; for (let g = 0; g < 4000 && (solidDirty.size || SOLID_JOB || TIER.markedAt.size); g++){ __step(1); used++; if (g % 10 === 9) await new Promise(r => setTimeout(r, 1)); }
  }
  let c;
  if (turn){ yawT = yaw + 1.1; await step(14); __perf.skip = false; c = __perf.cap(3, 3); __perf.skip = true; }
  else { __perf.skip = false; c = __perf.cap(6, 6); __perf.skip = true; }
  const out = { used, png: c.png, tris: c.info.tris, calls: c.info.calls, geos: c.info.geos, tex: c.info.tex, tier: TIER.line(), bk: BK.line() };
  // is the simulation the same in the three pages (rand calls, and everything that moves or decides, without the save): if not, movers differ and the pixel counts are inflated
  { const st = JSON.parse(__perf.state()); delete st.save; const t = JSON.stringify(st); let h = 2166136261; for (let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } out.rand = st.rand; out.stateHash = (h >>> 0).toString(16); out.stateLen = t.length; }
  // the whole frame drawn (static cache off): triangles and calls; then a run of drawn frames on the card for the time a frame takes
  PH.tests.noStatic = true; __perf.skip = false; const c2 = __perf.cap(4, 4); out.trisFull = c2.info.tris; out.callsFull = c2.info.calls;
  // a run of 30 drawn frames, the card finished (a one-pixel read waits for it); callsPerFrame says the loop really drew (0 would mean it did not)
  const timed = () => { const gl = renderer.getContext(), px = new Uint8Array(4); renderer.info.reset(); const t0 = __realNow(); for (let g = 0; g < 30; g++) __step(1); gl.finish(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return { ms: +((__realNow() - t0)/30).toFixed(2), calls: Math.round(renderer.info.render.calls/30), tris: Math.round(renderer.info.render.triangles/30) }; };
  if (!turn){ const t = timed(); out.msFrameFull = t.ms; out.loopCallsFull = t.calls; out.loopTrisFull = t.tris; }
  PH.tests.noStatic = false; for (let g = 0; g < 90; g++) __step(1);   // (the static cache is made again in steps: drawn frames until it is whole, then the time)
  if (!turn){ const t = timed(); out.msFrameCache = t.ms; out.loopCallsCache = t.calls; out.loopTrisCache = t.tris; }
  __perf.skip = true;
  let vb = 0, nv = 0, ni = 0; for (const r of solidRegions.values()) for (const g of r.geoms){ const v = g.attributes.position.count; nv += v; vb += v*26; const n = g.index ? g.index.count : 0; ni += n; vb += n*(g.userData.bpe || (v > 65535 ? 4 : 2)); }
  out.mergedMB = +(vb/1048576).toFixed(1); out.mergedTris = ni/3; out.blocks = solidRegions.size; out.bakedBlocks = [...solidRegions.values()].filter(r => r.tier === 'baked').length;
  out.mapsMB = Math.round(BK.pages.length*3*BK.PAGE*BK.PAGE*4/1048576); out.pages = BK.pages.length; out.plotsBaked = mode === 'baked' ? (BAKE.stats().by.ready || 0) : 0;
  out.jsHeapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null; out.bakeStats = mode === 'baked' ? BK.stats : null;
  if (mode === 'baked'){ const c = BAKE.stats(); out.bakeTicks = { ticks: c.ticks, over: c.ticksOver, maxMs: +c.maxTickMs.toFixed(1), coldMs: +(BAKE.coldMs || 0).toFixed(1), worst: BAKE.worst || null, tpu: BK.tpu }; }
  return out;
}
"""
INITS = {'real': 'window.__TIER_OFF = true;', 'stand': '', 'baked': 'window.__BAKED_ON = true;'}

def fmt(z): return ('%g' % z)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('scene', nargs='?', default='dense', help='dense (default), city, maxcity, megas or island: the scenes in tools/perf/scenes')
    ap.add_argument('--out', default='baked_mac_out'); ap.add_argument('--zooms', type=float, nargs='+', default=[24.5, 27, 30]); ap.add_argument('--hours', type=float, nargs='+', default=[12, 19, 23])
    ap.add_argument('--motions', nargs='+', default=['still', 'turn'], choices=['still', 'turn']); ap.add_argument('--pages', type=int, default=1000, help='the limit of pages of baked maps (48 MB each); the game itself uses 10')
    ap.add_argument('--keepdist', type=float, default=None, help='how far a piece may stand out of its shell before it stays real geometry (the game: 0.3)'); ap.add_argument('--paint-lights', action='store_true', help='paint the lights that are not windows (the game keeps them real)')
    ap.add_argument('--no-timing', action='store_true', help='leave the milliseconds a frame out of SUMMARY.md'); ap.add_argument('--tpu', type=int, default=None, help='texels a unit (the game picks it from the render setting and the screen: 10 to 24)'); ap.add_argument('--width', type=int, default=1280); ap.add_argument('--height', type=int, default=720)
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright
    os.makedirs(os.path.join(a.out, 'crops'), exist_ok=True); os.makedirs(os.path.join(a.out, 'full'), exist_ok=True)
    srv = H.serve(); url = H.make_site('bmac', None); sc = H.load_scenes([a.scene])[0]
    configs = [(z, h, m == 'turn') for z in a.zooms for h in a.hours for m in a.motions]
    extra = 'window.__BAKED_PAGES = %d;' % a.pages + ('window.__BAKED_SHELL = {keepDist: %g};' % a.keepdist if a.keepdist else '') + ('window.__BAKED_NOLIGHTS = true;' if a.paint_lights else '') + ('window.__BAKED_TPU = %d;' % a.tpu if a.tpu else '')
    R = {m: [] for m in ('baked', 'real', 'stand')}; errs = []; t_start = time.time()
    with sync_playwright() as pw:
        br = H.launch(pw)
        for mode in ('baked', 'real', 'stand'):
            ctx, pg, e = H.open_game(br, url, sc, (a.width, a.height), extra_init='window.__NV_OFF = true;' + INITS[mode] + (extra if mode == 'baked' else ''))
            pg.set_default_timeout(3600000)
            for k, (z, h, turn) in enumerate(configs):
                settle = 0 if mode == 'baked' else R['baked'][k]['used']
                r = pg.evaluate(CAP, [z, h, turn, mode, settle]); r['zoom'] = z; r['hour'] = h; r['motion'] = 'turn' if turn else 'still'; R[mode].append(r)
                print('%s  z%s h%g %s: %d frames, %.0f k triangles (cache on), %.0f k (full frame), %s ms a frame  [%.0f s]' % (mode.ljust(5), fmt(z), h, r['motion'], r['used'], r['tris']/1000, r['trisFull']/1000, r.get('msFrameFull', '-'), time.time() - t_start), flush=True)
            errs += e; ctx.close()
        br.close()
    srv.shutdown()
    rows = []
    for k, (z, h, turn) in enumerate(configs):
        tag = '%s_z%s_h%g_%s' % (a.scene, fmt(z), h, 'turn' if turn else 'still')
        im = {m: Image.open(io.BytesIO(H.png_bytes(R[m][k]['png']))).convert('RGB') for m in R}
        for m in im: im[m].save(os.path.join(a.out, 'full', '%s_%s.png' % (tag, m)))
        d1 = ImageChops.difference(im['real'], im['baked']); d2 = ImageChops.difference(im['real'], im['stand'])
        n1 = sum(1 for p in d1.getdata() if p != (0, 0, 0)); n2 = sum(1 for p in d2.getdata() if p != (0, 0, 0))
        W_, H_ = im['real'].size; box = (W_//4, H_//5, W_*3//4, H_*4//5); bw = box[2] - box[0]
        strip = Image.new('RGB', ((bw + 10)*5, box[3] - box[1]), (255, 255, 255))
        for i, x in enumerate((im['real'], im['stand'], im['baked'], d1.point(lambda v: min(255, v*4)), d2.point(lambda v: min(255, v*4)))): strip.paste(x.crop(box), (i*(bw + 10), 0))
        strip.save(os.path.join(a.out, 'crops', tag + '.png'))
        row = {'scene': a.scene, 'zoom': z, 'hour': h, 'motion': 'turn' if turn else 'still', 'pixels_differ_real_baked': n1, 'pixels_differ_real_stand': n2, 'of': W_*H_}
        for m in R:
            for key in ('tris', 'calls', 'trisFull', 'callsFull', 'msFrameFull', 'msFrameCache', 'loopCallsFull', 'loopCallsCache', 'rand', 'stateHash', 'geos', 'tex', 'mergedMB', 'mergedTris', 'blocks', 'bakedBlocks', 'mapsMB', 'pages', 'plotsBaked', 'jsHeapMB', 'used'):
                row['%s_%s' % (m, key)] = R[m][k].get(key)
        row['same_simulation'] = len({R[m][k]['rand'] for m in R}) == 1 and len({R[m][k]['stateHash'] for m in R}) == 1
        row['tier_baked'] = R['baked'][k]['tier']; row['bk_baked'] = R['baked'][k]['bk']; rows.append(row)
    json.dump({'scene': a.scene, 'args': vars(a), 'rows': rows, 'bakeStats': R['baked'][-1]['bakeStats'], 'bakeTicks': R['baked'][-1]['bakeTicks'], 'errors': errs[:10]}, open(os.path.join(a.out, 'numbers.json'), 'w'), indent=1)
    with open(os.path.join(a.out, 'numbers.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    bs = R['baked'][-1]['bakeStats']; n = max(1, bs['baked'])
    L = ['# Baked far buildings: %s' % a.scene, '', 'Run on %s; %d s. Errors: %s.' % ('your card (PERF_GPU)' if os.environ.get('PERF_GPU') else 'the software renderer (timings mean nothing)', time.time() - t_start, errs[:3] or 'none'), '']
    if not a.no_timing:
        L += ['| zoom | hour | motion | tris real | tris stand | tris baked | ms/frame real | stand | baked | differ real/stand | differ real/baked | same simulation | maps MB | blocks baked |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    else:
        L += ['| zoom | hour | motion | tris real | tris stand | tris baked | differ real/stand | differ real/baked | same simulation | maps MB | blocks baked |', '|---|---|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        sim = 'yes' if r['same_simulation'] else 'NO (movers differ: the pixel counts are inflated)'
        head = [fmt(r['zoom']), '%g' % r['hour'], r['motion'], r['real_trisFull'], r['stand_trisFull'], r['baked_trisFull']]
        mid = [r['real_msFrameFull'], r['stand_msFrameFull'], r['baked_msFrameFull']] if not a.no_timing else []
        tail = [r['pixels_differ_real_stand'], r['pixels_differ_real_baked'], sim, r['baked_mapsMB'], '%s/%s' % (r['baked_bakedBlocks'], r['baked_blocks'])]
        L.append('| ' + ' | '.join(str(x) for x in head + mid + tail) + ' |')
    if not a.no_timing: L += ['', 'Milliseconds a frame: 30 drawn frames of the whole frame (static cache off), the card finished by a one-pixel read; the draw calls of each loop are in numbers.json (loopCallsFull, loopCallsCache: 0 would mean the loop did not draw). The author has only run this in the software renderer (about half a second a frame on the island, the same simulation in all three pages); the cache-on loop (msFrameCache in numbers.json, not in this table) was about twice the cache-off one there, with more draw calls (157 against 136), which I take to be the cache passes and have not checked.']
    L += ['', 'Triangles are of the whole frame (static cache off). The bake: %d plots, %.0f ms a plot in all (%s), shell %.0f, kept %.0f, overlay %.0f triangles a plot, %.2f MB of maps a plot.' % (bs['baked'], bs['ms']/n, {k: round(v/n) for k, v in bs['ph'].items()}, bs['shellTris']/n, bs['keptTris']/n, bs['ovlTris']/n, bs['texels']*12/n/1048576)]
    bt = R['baked'][-1]['bakeTicks']; last = [r for r in rows if r['motion'] == 'still'][-1] if any(r['motion'] == 'still' for r in rows) else rows[-1]; L += ['', 'Bake stalls (the scheduler gives a frame at most 4 ms, and one step runs past it): %d ticks, %d over budget, the worst tick %.1f ms (%s), first two ticks %.1f ms; texels a unit %s.' % (bt['ticks'], bt['over'], bt['maxMs'], bt['worst'], bt['coldMs'], bt['tpu']), 'Timing loops drew: calls a frame in the full-frame loop %s / %s / %s (real / stand-in / baked), in the cache-on loop %s / %s / %s (0 would mean it did not draw).' % (last['real_loopCallsFull'], last['stand_loopCallsFull'], last['baked_loopCallsFull'], last['real_loopCallsCache'], last['stand_loopCallsCache'], last['baked_loopCallsCache'])]
    open(os.path.join(a.out, 'SUMMARY.md'), 'w').write('\n'.join(L) + '\n')
    print('\n'.join(L)); print('\nwritten to', os.path.abspath(a.out))

if __name__ == '__main__':
    main()
