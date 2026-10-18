#!/usr/bin/env python3
"""Bakes the title screen's room: opens tools/title/bake.html in headless Chromium, runs the bake and writes
assets/title/room-{wide,tall}.png, glass-*.png, signoff-*.png and anchors.json. Run from anywhere:

  python3 tools/title/bake.py

On a Mac it uses the graphics card through Chrome (a window opens while it bakes; leave it alone): a few minutes.
On a machine without one it renders in software: about an hour. Needs: pip3 install playwright pillow.
"""
import base64, functools, http.server, json, os, sys, threading
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(REPO, 'assets', 'title')
PORT = 8799


def main():
    os.makedirs(OUT, exist_ok=True)
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=REPO)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        opt = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
        mode = os.environ.get('BAKE_GL', 'metal' if sys.platform == 'darwin' else 'software')
        if mode == 'software':   # no graphics card (a cloud machine): slow
            b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        else:   # the real graphics card through Chrome (a window opens while it bakes; leave it alone)
            args = ['--ignore-gpu-blocklist'] + (['--use-angle=metal'] if mode == 'metal' else [])
            try: b = p.chromium.launch(channel='chrome', headless=False, args=args)
            except Exception: b = p.chromium.launch(headless=False, args=args)
        print('baking with:', mode, flush=True)
        pg = b.new_page(); pg.set_default_timeout(0)
        pg.on('crash', lambda *_: print('THE PAGE CRASHED (usually the graphics driver running out of memory). Try: BAKE_GL=default python3 tools/title/bake.py', flush=True))
        pg.on('close', lambda *_: print('the bake window closed', flush=True))
        pg.on('console', lambda m: print('page:', m.text) if m.type in ('error', 'warning') and 'favicon' not in m.text and 'Feedback loop' not in m.text and '404' not in m.text else (print('progress:', m.text[5:], flush=True) if m.text.startswith('BAKE ') else None))
        pg.on('pageerror', lambda e: print('page error:', e))
        pg.goto('http://127.0.0.1:%d/tools/title/bake.html?scene=%s' % (PORT, opt.get('scene', 'kitchen')))
        res = pg.evaluate('o => BAKE(o)', opt)
        out = opt.get('out', OUT); os.makedirs(out, exist_ok=True)
        anchors = {}
        def save(name, data):
            with open(os.path.join(out, name), 'wb') as f:
                f.write(base64.b64decode(data.split(',', 1)[1]))
        for view, r in res.items():
            if 'anchors' in r:   # one picture set for the view (the old room, or a checking view)
                for kind in ('room', 'glass', 'signoff', 'plants'):
                    if r.get(kind): save('%s-%s.png' % (kind, view), r[kind])
                anchors[view] = r['anchors']; continue
            for t, rt in r.items():   # the kitchen's title views: a set per hour, and the sun's headings
                if 'suns' not in rt:
                    for kind in ('room', 'glass'):
                        if rt.get(kind): save('%s-%s-%s.png' % (kind, view, t), rt[kind])
                    anchors.setdefault(view, {})[t] = rt['anchors']; continue
                for kind in ('room', 'glass', 'signoff', 'plants', 'lamp'):
                    if rt.get(kind): save('%s-%s-%s.png' % (kind, view, t), rt[kind])
                for i, d in enumerate(rt['suns']):   # (what the sun adds: mostly black, so a JPEG; the faint haze trimmed off)
                    save('sun.tmp.png', d); from PIL import Image
                    Image.open(os.path.join(out, 'sun.tmp.png')).convert('RGB').point([max(0, min(255, int((v - 14)*.95))) for v in range(256)]*3).save(os.path.join(out, 'sun-%s-%s-%d.jpg' % (view, t, i)), quality=82)
                    os.remove(os.path.join(out, 'sun.tmp.png'))
                anchors.setdefault(view, {})[t] = rt['anchors']
        with open(os.path.join(out, 'anchors.json'), 'w') as f:
            json.dump(anchors, f, indent=1)
        print(json.dumps(anchors))
        b.close()
    srv.shutdown()


if __name__ == '__main__':
    main()
