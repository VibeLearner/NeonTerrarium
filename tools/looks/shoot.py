#!/usr/bin/env python3
"""Screenshots of the looks on one city scene, from one view, at zoom 15 and 30 (uses the perf harness's rig: tools/perf/harness.py).

  PERF_PORT=9610 python3 tools/looks/shoot.py                       all ten looks, zoom 15 and 30, into tools/looks/shots/
  PERF_PORT=9610 python3 tools/looks/shoot.py night rainyNight      only these
  OUT=/some/dir ZOOMS=15 SCENE=city SETUP='S.cycle=false' python3 tools/looks/shoot.py morning

Each look is held (LK.setPick) at an hour that suits it, with the weather it belongs to (rain streaks for the rainy looks), the lights
given time to come on, and the frame drawn. The pictures are the game's own; no mood board images are used or stored here.
"""
import base64, io, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H

# id: (hour, weather)
LOOKS = {
    'morning': (8.0, 'clear'), 'rainyMorning': (8.0, 'rain'), 'afternoon': (13.5, 'clear'), 'rainyAfternoon': (14.5, 'rain'),
    'overcast': (12.5, 'overcast'), 'golden': (17.4, 'clear'), 'dusk': (19.2, 'clear'), 'night': (23.0, 'clear'),
    'rainyNight': (23.0, 'rain'), 'late': (4.2, 'clear'),
}


def shoot(ids, zooms, out, scene_name='city', setup='', vp=(1280, 720), frames=700, quality=88):
    from playwright.sync_api import sync_playwright
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    srv = H.serve()
    url = H.make_site('looks_shoot')
    sc = H.load_scenes([scene_name])[0]
    files, errs_all = [], []
    with sync_playwright() as pw:
        br = H.launch(pw)
        ctx, pg, errs = H.open_game(br, url, sc, vp)
        pg.evaluate('() => { S.cycle = false; ' + setup + ' }')
        for z in zooms:
            for i in ids:
                hour, wx = LOOKS[i]
                pg.evaluate('([i, h, w, z, old]) => { S.hour = h; LK.old = old; LK.snapWeather(w); LK.setPick(i, true); zoom = zoomT = z; }', [i, hour, wx, z, bool(os.environ.get('OLD'))])
                c = pg.evaluate('([n]) => __perf.cap(n, 0)', [frames])
                im = Image.open(io.BytesIO(base64.b64decode(c['png'].split(',', 1)[1]))).convert('RGB')
                fn = os.path.join(out, '%s_z%d.jpg' % (i, z))   # (OLD=1: the old time of day and grades at the same hour and weather, to compare with)
                im.save(fn, quality=quality)
                files.append(fn); print(fn, flush=True)
        errs_all = list(errs)
        ctx.close(); br.close()
    srv.shutdown()
    if errs_all: print('PAGE ERRORS:', errs_all[:5])
    return files


if __name__ == '__main__':
    ids = [a for a in sys.argv[1:] if a in LOOKS] or list(LOOKS)
    zooms = [int(z) for z in os.environ.get('ZOOMS', '15,30').split(',')]
    shoot(ids, zooms, os.environ.get('OUT', os.path.join(HERE, 'shots')), os.environ.get('SCENE', 'city'), os.environ.get('SETUP', ''), frames=int(os.environ.get('FRAMES', '700')))
