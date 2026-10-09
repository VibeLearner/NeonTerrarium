#!/usr/bin/env python3
"""What the static cache (js/staticcache.js) does while a look blends: counts per frame, from the cache's own state, with the perf harness's rig.

  PERF_PORT=9630 python3 tools/looks/cache_blend.py            all scenarios, prints a table and writes tools/looks/results/cache_blend.json
  PERF_PORT=9630 python3 tools/looks/cache_blend.py crossfade  just one (steady, crossfade, crossfade2, weather, weather30, weather30_overcast, dusk_looks, dusk_old, dawn_looks, dawn_old)

For every frame: the cache's state ('in use', 'redrawing k of K' (a background job), 'off' (the old way draws the frame)), the reason it
gives, and how many times the whole cache has been replaced (SC.rebuilds). Every frame is drawn (the cache only decides on drawn frames), on the small island scene at 240 lines. Counts only:
this software renderer says nothing about timing.
"""
import collections, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H

REC = '''(n, pre) => {
  const rows = []; __perf.skip = false; let reb0 = SC.rebuilds;
  for (let i = 0; i < n; i++){ if (pre) eval(pre); __step(1); rows.push([SC.state, SC.why, SC.rebuilds, +(typeof LIGHT_JUMP !== 'undefined' && LIGHT_JUMP)]); }
  return rows; }'''

# (setup, frames, per-frame JS, what). Every frame is drawn (the cache only decides on drawn frames), on the small 'island' scene at 240 lines:
# the cache's decisions do not depend on the picture's size. (The software renderer is slow, so the day is run in windows, not whole.)
DAY = 'S.hour = (S.hour + 24/3600) % 24'   # a day a minute: "show blends" speed (the normal day cycle is sixty times slower)
SCENARIOS = {
    'steady': ('S.hour = 13.5; LK.snapWeather("clear"); LK.setPick("afternoon", true)', 150, None, 'Mid afternoon held, nothing changing'),
    'crossfade': ('S.hour = 13.5; LK.setPick("afternoon", true)', 330, 'if (i === 30) LK.setPick("night")', 'Mid afternoon to Night by hand: the 3 s crossfade starts at frame 30'),
    'crossfade2': ('S.hour = 13.5; LK.setPick("afternoon", true)', 330, 'if (i === 30) LK.setPick("overcast")', 'Mid afternoon to Overcast by hand'),
    'weather': ('S.hour = 14; LK.snapWeather("clear"); LK.setPick("auto", true); LK.wx.fadeSec = 6', 480, 'if (i === 30) LK.setWeather("rain")', 'Auto at 14:00, clear to rain in 6 s (5 times faster than the real 30 s)'),
    'weather30': ('S.hour = 14; LK.snapWeather("clear"); LK.setPick("auto", true)', 1950, 'if (i === 30) LK.setWeather("rain")', 'Auto at 14:00, clear to rain over the real 30 s (1800 frames)'),
    'weather30_overcast': ('S.hour = 14; LK.snapWeather("clear"); LK.setPick("auto", true)', 1950, 'if (i === 30) LK.setWeather("overcast")', 'Auto at 14:00, clear to overcast over the real 30 s'),
    'dusk_looks': ('S.hour = 17.8; LK.snapWeather("clear"); LK.setPick("auto", true)', 450, DAY, 'Auto through the evening, 17:48 to 20:48 in 7.5 s (golden, dusk, night hand-offs)'),
    'dusk_old': ('S.hour = 17.8; LK.snapWeather("clear"); LK.setPick("auto", true); LK.old = true', 450, DAY, 'the same evening on the old path'),
    'dawn_looks': ('S.hour = 4.8; LK.snapWeather("clear"); LK.setPick("auto", true)', 450, DAY, 'Auto through the dawn, 04:48 to 07:48 in 7.5 s (late night, morning hand-offs)'),
    'dawn_old': ('S.hour = 4.8; LK.snapWeather("clear"); LK.setPick("auto", true); LK.old = true', 450, DAY, 'the same dawn on the old path'),
}


def summarize(rows):
    c = collections.Counter(); why = collections.Counter(); jumps = 0
    for st, w, reb, lj in rows:
        k = 'redrawing' if st.startswith('redrawing') else st.split(':')[0]
        c[k] += 1
        if w: why[w.split(':')[0]] += 1
        jumps += lj
    return { 'frames': len(rows), 'states': dict(c), 'reasons': dict(why), 'whole_cache_replacements': rows[-1][2] - rows[0][2], 'sun_jump_frames': jumps }


def main(names):
    from playwright.sync_api import sync_playwright
    os.makedirs(os.path.join(HERE, 'results'), exist_ok=True)
    srv = H.serve(); url = H.make_site('looks_cache'); sc = H.load_scenes(['island'])[0]
    res = {}
    with sync_playwright() as pw:
        br = H.launch(pw)
        for nm in names:
            setup, n, pre, desc = SCENARIOS[nm]
            ctx, pg, errs = H.open_game(br, url, sc, (640, 360))
            pg.evaluate('() => { S.cycle = false; S.res = 240; ' + setup + ' }')
            pg.evaluate('() => __perf.cap(40, 10)')      # settle: the cache is built and in use
            pg.evaluate('() => __perf.cap(400, 40)')     # (lights and the cache catch up with the look)
            rows = pg.evaluate('([n, pre]) => (' + REC + ')(n, pre)', [n, pre])
            r = summarize(rows); r['what'] = desc; r['errors'] = errs[:3]; res[nm] = r
            print(nm, json.dumps(r), flush=True)
            ctx.close()
        br.close()
    srv.shutdown()
    json.dump(res, open(os.path.join(HERE, 'results', 'cache_blend.json'), 'w'), indent=1)


if __name__ == '__main__':
    main([a for a in sys.argv[1:] if a in SCENARIOS] or list(SCENARIOS))
