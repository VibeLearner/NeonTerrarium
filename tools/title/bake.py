#!/usr/bin/env python3
"""Bakes the title screen's room: opens tools/title/bake.html in headless Chromium, runs the bake and writes
assets/title/room-{wide,tall}.png, glass-*.png, signoff-*.png and anchors.json. Run from anywhere:

  python3 tools/title/bake.py

Slow on purpose (real shadows and 72-step light shafts on a software GPU): about a minute.
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
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_page()
        pg.on('console', lambda m: print('page:', m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: print('page error:', e))
        pg.goto('http://127.0.0.1:%d/tools/title/bake.html' % PORT)
        opt = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
        res = pg.evaluate('o => BAKE(o)', opt)
        out = opt.get('out', OUT); os.makedirs(out, exist_ok=True)
        anchors = {}
        for view, r in res.items():
            for kind in ('room', 'glass', 'signoff'):
                if not r.get(kind): continue
                with open(os.path.join(out, '%s-%s.png' % (kind, view)), 'wb') as f:
                    f.write(base64.b64decode(r[kind].split(',', 1)[1]))
            anchors[view] = r['anchors']
        with open(os.path.join(out, 'anchors.json'), 'w') as f:
            json.dump(anchors, f, indent=1)
        print(json.dumps(anchors))
        b.close()
    srv.shutdown()


if __name__ == '__main__':
    main()
