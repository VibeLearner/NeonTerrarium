#!/usr/bin/env python3
"""Record the Neon Terrarium demo clip: 15 s, 1920 x 1080, 60 fps, with the game's own sound.

Runs on your own Mac (it needs the graphics card). Two passes, both at index.html?full#demo in headless Chrome (no window):
  1. the picture: the clip runs on a stepped clock (tools/demo/shim.js), every frame captured in turn, so nothing stutters or drops
  2. the sound: the clip plays again in real time (in a hidden browser) and everything the game sends to the speakers (the Grid's Booth loop, the two notes,
     the build sounds) is recorded straight from the game (tools/demo/audio.js).
Then the two are put together.

    python3 tools/demo/record.py --stills      # PNGs at the key moments only -> tools/demo/out/stills/
    python3 tools/demo/record.py --preview     # a quick 720p, 30 fps look
    python3 tools/demo/record.py               # the clip -> tools/demo/out/neon-terrarium-demo.mp4
    python3 tools/demo/record.py --vertical    # the clip, plus a 1080 x 1920 version for phones
    python3 tools/demo/record.py --tod --both  # the 30 s cut: two homes, the apartment, then a turn over the city through the times of day
    python3 tools/demo/record.py --mid --both  # the 19 s cut: the long cut's pictures, captions on the right, wide and tall (1080 x 1620)
    python3 tools/demo/record.py --city --both # the city cut (30 s): wide 1920 x 1080 and tall 1080 x 1620, each filmed natively
    python3 tools/demo/record.py --pg          # the procedural generation cut (60 s, js/demo_pg.js) -> tools/demo/out/neon-terrarium-procgen.mp4

The --pg cut plays the Grid's own live music, which is never the same twice, so its sound pass runs first and notes what the music player showed
each moment; the picture pass then shows exactly that, so the player on screen matches what you hear.

Needs: pip3 install playwright && python3 -m playwright install chromium  (it uses Google Chrome if installed), and ffmpeg.
"""
import argparse, base64, functools, http.server, json, os, shutil, struct, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
FPS = 60
STILLS = [.8, 2.0, 3.2, 4.4, 5.2, 5.5, 5.8, 6.6, 7.8, 8.9, 10.2, 11.0, 12.2, 13.6, 14.7]
STILLS_TOD = [.6, 1.6, 2.6, 3.8, 5.0, 6.0, 7.2, 9.2, 10.3, 11.5, 13.0, 15.0, 16.4, 17.6, 18.8, 19.9, 21.4, 22.9, 24.4, 25.9, 27.2, 28.2, 29.5]
STILLS_MID = [.5, 1.2, 2.2, 3.2, 4.3, 5.4, 6.3, 7.4, 8.4, 9.4, 10.6, 11.6, 12.6, 13.8, 14.8, 16.0, 17.2, 18.6]
STILLS_CITY = [.5, 1.2, 2.3, 3.4, 4.6, 6.3, 8.2, 10.0, 11.4, 12.6, 13.6, 15.0, 16.6, 17.6]
STILLS_PG = [.6, 2.3, 5.0, 8.9, 11.0, 14.3, 18.4, 21.3, 23.2, 25.0, 26.6, 28.4, 30.6, 33.5, 36.5, 39.0, 41.8, 44.0, 46.0, 49.0, 53.0, 57.0, 59.5]
STILLS_LONG = [1.0, 2.5, 4.0, 5.5, 6.8, 7.2, 8.6, 10.2, 11.9, 13.5, 15.0, 16.6, 18.0, 19.5, 20.8, 22.0, 23.5, 26.0, 28.5]


def serve(port):
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store'); super().end_headers()
    class Server(http.server.ThreadingHTTPServer):
        def handle_error(self, request, address):
            if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)): return
            super().handle_error(request, address)
    srv = Server(('127.0.0.1', port), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def launch(pw, headless, soft=False):
    args = (['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] if soft else []) + ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars']
    try:
        return pw.chromium.launch(channel='chrome', headless=headless, args=args)
    except Exception as e:
        print('Google Chrome not found, using Playwright\'s Chromium:', str(e).splitlines()[0])
        return pw.chromium.launch(headless=headless, args=args)


def log_page(page):
    page.on('console', lambda m: print('  page:', m.text[:1500]) if m.text.startswith(('[demo]', 'Furnish pod', 'PodContext', 'PodRender', '[lab')) or m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: print('  page error:', e))
    page.on('crash', lambda *_: print('  the page crashed (the graphics process may have run out of memory)'))


DM = 'DEMO'   # (the clip's object in the page: DEMOPG for --pg)


def wait_ready(ev, t0, limit=1500):
    last = ''
    while True:
        st = ev(f'typeof {DM} !== "undefined" ? {DM}.state() : null') or {}
        fail = ev(f'typeof {DM} !== "undefined" && {DM}.failed')
        if fail: sys.exit('the demo could not set up: ' + str(fail) + '\n' + '\n'.join(st.get('log', [])))
        if st.get('stage') != last: last = st.get('stage'); print(f'[{time.time() - t0:5.1f}s] {last}')
        if st.get('ready'): return st
        if time.time() - t0 > limit: sys.exit('setup took too long; last stage: ' + str(last))
        yield st


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=None)
    ap.add_argument('--preview', action='store_true', help='a quick look: 30 fps, 1280 x 720 (the timing is the same as the real clip)')
    ap.add_argument('--stills', action='store_true', help='only save stills at key moments (PNG) and stop')
    ap.add_argument('--vertical', action='store_true', help='also make a 1080 x 1920 version for phones')
    ap.add_argument('--no-audio', action='store_true', help='skip the sound pass (the clip comes out silent)')
    ap.add_argument('--window', action='store_true', help='film the picture in a visible Chrome window instead of the headless browser (only if headless draws wrong on your Mac)')
    ap.add_argument('--port', type=int, default=8794)
    ap.add_argument('--quality', type=int, default=95)
    ap.add_argument('--crf', type=int, default=16)
    ap.add_argument('--long', action='store_true', help='the long cut: 29 s, no captions or badge, the furnisher'"'"'s sofa put back on camera, the work light off at the end')
    ap.add_argument('--nolab', action='store_true', help='checking only: leave the apartment out')
    ap.add_argument('--pg', action='store_true', help='the procedural generation cut (60 s, no captions, the Grid\'s live music and its player on screen: js/demo_pg.js)')
    ap.add_argument('--tod', action='store_true', help='the 30 s cut: two homes go up, the apartment scene, then out over the city turning through times of day and weather, back to night for the title')
    ap.add_argument('--mid', action='store_true', help='the 19 s cut: the long cut\'s apartment scene at a quicker pace, captions on the right, the Booth loop')
    ap.add_argument('--city', action='store_true', help='the city cut (30 s): one bare plot grows into a whole city, the Grid\'s music on (js/demo_pg.js)')
    ap.add_argument('--tall', action='store_true', help='film it tall, 1080 x 1620, its own framing (not a crop of the wide one)')
    ap.add_argument('--both', action='store_true', help='film it wide and then tall, one after the other')
    ap.add_argument('--test', action='store_true', help='for checking on a machine without a graphics card: a small 640 x 360 picture at 30 fps, software drawing, no sound')
    a = ap.parse_args()
    global FPS, DM
    if a.city: a.pg = True
    if a.pg: DM = 'DEMOPG'
    if a.both:   # (two runs, wide then tall, each with its own sound pass)
        args = [x for x in sys.argv[1:] if x not in ('--both', '--tall')]
        for extra in ([], ['--tall']):
            subprocess.run([sys.executable, os.path.abspath(__file__), *args, *extra], check=True)
        return

    VW, VH = (1080, 1620) if a.tall else (1920, 1080)
    DSF = 1
    if a.test: DSF, FPS, a.no_audio = .5, 30, True   # (the desktop layout of every panel, drawn at half the pixels)
    a.out = a.out or os.path.join(OUT, ('neon-terrarium-city' if a.city else 'neon-terrarium-procgen' if a.pg else 'neon-terrarium-demo') + ('-30s' if a.tod else '-19s' if a.mid else '') + ('-tall' if a.tall else '') + ('-long' if a.long else '') + ('-test' if a.test else '-preview' if a.preview else '') + '.mp4')
    if not shutil.which('ffmpeg') and not a.stills: sys.exit('ffmpeg is needed: brew install ffmpeg')
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    srv = serve(a.port)
    url = f'http://127.0.0.1:{a.port}/index.html?full#demo' + ('&pg' if a.pg else '') + ('&city' if a.city else '')
    with sync_playwright() as pw:
        # ---------- the sound: the clip played in real time in a hidden browser, recording what the game plays ----------
        def sound_pass():
            print('the sound: playing the clip in real time, in a hidden browser, recording what the game plays')
            browser = launch(pw, True)
            ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=1)
            if a.long: ctx.add_init_script(script='window.__DM_LONG = true;')
            if a.mid: ctx.add_init_script(script='window.__DM_MID = true;')
            if a.tod: ctx.add_init_script(script='window.__DM_TOD = true;')
            ctx.add_init_script(path=os.path.join(HERE, 'audio.js'))
            page = ctx.new_page(); log_page(page); page.goto(url, wait_until='load')
            t0 = time.time()
            for _ in wait_ready(page.evaluate, t0): time.sleep(.25)
            while not page.evaluate(f'{DM}.state().done'):
                if time.time() - t0 > 2400: raise RuntimeError('the clip never finished')
                time.sleep(.2)
            recs = page.evaluate('__dmStop()')
            deck = page.evaluate(f'{DM}.deckTrack ? {DM}.deckTrack() : null') if a.pg else None
            browser.close()
            out = []
            for k, r in enumerate(recs):
                p = os.path.join(OUT, f'demo-audio-{k}.webm'); open(p, 'wb').write(base64.b64decode(r['data'])); out.append((p, r['at']/1000))
            print('  recorded', len(out), 'sound track(s)' + (f', and {len(deck)} moments of the music player' if deck else ''))
            return out, deck
        tracks, deck = [], None
        # (--pg: the sound first, so the picture can show the music player as it was while that sound played)
        if a.pg and not a.no_audio and not a.stills:
            try:
                tracks, deck = sound_pass()
                if deck:
                    with open(os.path.join(OUT, ('city' if a.city else 'procgen') + ('-tall' if a.tall else '') + '-deck.json'), 'w') as fh: json.dump(deck, fh)
            except Exception as e:
                print('  the sound pass failed (the clip will be silent):', e)
        # ---------- the picture ----------
        def open_page(headless):
            browser = launch(pw, headless, soft=a.test)
            ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=DSF)
            ctx.add_init_script(script=f'window.__DM_FPS = {FPS};' + ('window.__DM_NOLAB = true;' if a.nolab else '') + ('window.__DM_TEST = true;' if a.test else '') + ('window.__DM_LONG = true;' if a.long else '') + ('window.__DM_MID = true;' if a.mid else '') + ('window.__DM_TOD = true;' if a.tod else ''))
            if deck: ctx.add_init_script(script='window.__DM_DECK = ' + json.dumps(deck, separators=(',', ':')) + ';')
            ctx.add_init_script(path=os.path.join(HERE, 'shim.js'))
            page = ctx.new_page(); cdp = ctx.new_cdp_session(page); log_page(page)
            page.goto(url, wait_until='load')
            return browser, page, cdp
        # headless by default: the page is exactly 1920 x 1080 whatever the screen, and nothing on the desktop can get in the way
        a.headless = not a.window
        browser, page, cdp = open_page(a.headless)
        def grab(fmt='jpeg', quality=None):
            o = {'format': fmt, 'fromSurface': True, 'captureBeyondViewport': False}
            if fmt == 'jpeg': o['quality'] = quality or a.quality
            return base64.b64decode(cdp.send('Page.captureScreenshot', o)['data'])
        # (--window: a screen too small for a 1920 x 1080 window (a MacBook's) clips it, and the frames would be its top-left part stretched,
        # everything off center. Then it goes headless after all. A Retina window at twice the pixels is fine.)
        if not a.headless:
            png = grab('png'); w, h = struct.unpack('>II', png[16:24])
            if (w, h) != (int(VW*DSF), int(VH*DSF)) and not (w % VW == 0 and h % VH == 0 and w//VW == h//VH):
                print(f'  the browser window only shows {w} x {h} of the 1920 x 1080 picture: filming without a window instead, so nothing is off center')
                browser.close(); a.headless = True
                browser, page, cdp = open_page(True)
        ev = page.evaluate
        t0 = time.time()
        for _ in wait_ready(ev, t0, 14400 if a.test else 1500):
            ev(f'__step(2, {1000/FPS})'); time.sleep(.01)
        st = ev(f'{DM}.state()')
        print('ready:', json.dumps(st.get('info')))
        if not ev(f'{DM}.start()'): sys.exit('the clip would not start')
        length = float(st.get('len') or 15)
        frames = int(round(length*FPS)); every = 2 if a.preview else 1
        enc = None
        if a.stills:
            want = sorted(int(round(s*FPS)) for s in (STILLS_TOD if a.tod else STILLS_MID if a.mid else STILLS_CITY if a.city else STILLS_PG if a.pg else STILLS_LONG if a.long else STILLS) if s < length)
            sd = os.path.join(OUT, 'stills'); os.makedirs(sd, exist_ok=True)
        else:
            raw = os.path.splitext(a.out)[0] + '.video.mp4'
            size, fps = (('720:1080' if a.tall else '1280:720'), FPS//2) if a.preview else (f'{VW}:{VH}', FPS)
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(fps), '-c:v', 'mjpeg', '-i', '-',
                                    '-vf', f'scale={size}:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf + (5 if a.preview else 0)),
                                    '-pix_fmt', 'yuv420p', '-r', str(fps), raw], stdin=subprocess.PIPE)
        t1 = time.time()
        # one picture per frame the film draws: while it holds (the apartment lab still working) the clock steps on and no picture is taken
        held_steps = 0
        for f in range(frames):
            d0 = ev(f'{DM}.drawn'); n = 0
            while True:
                ev(f'__step(1, {1000/FPS})')
                if ev(f'{DM}.drawn') != d0: break
                n += 1; held_steps += 1; time.sleep(.004)
                if n % 600 == 0: print(f'  the film is holding for the apartment lab ({n} steps so far): ' + str(ev(f'{DM}.state().info.wait')))
            if n > 2: print(f'  at {f/FPS:.2f}s the film held {n} steps for the lab')
            if a.stills:
                if f in want:
                    p = os.path.join(sd, f'{f/FPS:05.2f}s.png'); open(p, 'wb').write(grab('png')); print('still', os.path.relpath(p, ROOT))
                continue
            if f % every: continue
            enc.stdin.write(grab(**({'quality': 80} if a.preview else {})))
            if f % FPS == 0:
                el = time.time() - t1; eta = el/(f + 1)*(frames - f - 1)
                print(f'  {f/FPS:4.0f}s of {length:.0f}s   ({el:4.0f}s elapsed, about {eta/60:.1f} min to go)')
        st = ev(f'{DM}.state()')
        browser.close()
        st['info']['heldSteps'] = held_steps
        with open(os.path.join(OUT, (('city' if a.city else 'procgen') + ('-tall' if a.tall else '') + '-log.txt') if a.pg else 'demo-log.txt'), 'w') as fh: fh.write(json.dumps(st.get('info'), indent=1) + '\n' + '\n'.join(st.get('log', [])) + '\n')
        if a.stills:
            srv.shutdown(); print('stills in', os.path.relpath(sd, ROOT), '(and what happened when in tools/demo/out/demo-log.txt)'); return
        enc.stdin.close(); enc.wait()

        # ---------- the sound (the 15 s clip: after the picture) ----------
        if not a.no_audio and not a.pg:
            try: tracks, _ = sound_pass()
            except Exception as e: print('  the sound pass failed (the clip will be silent):', e)
    srv.shutdown()
    if tracks:
        ins, chains, mix = ['-i', raw], [], ''
        for k, (p, at) in enumerate(tracks):
            ins += ['-i', p]; ms = int(round(at*1000))
            chains.append(f'[{k + 1}:a]aresample=48000,adelay={ms}|{ms}[t{k}]'); mix += f'[t{k}]'
        fc = ';'.join(chains) + ';' + mix + f'amix=inputs={len(tracks)}:normalize=0:duration=longest,atrim=0:{length:.3f},afade=t=in:d=0.2,afade=t=out:st={length - .7:.2f}:d=0.7,alimiter=limit=0.95[a]'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
                        '-t', f'{length:.2f}', '-movflags', '+faststart', a.out], check=True)
        os.remove(raw)
        for p, _ in tracks: os.remove(p)
    else:
        os.replace(raw, a.out)
    print('done:', os.path.relpath(a.out, ROOT))
    # a compressed copy to post (H.264 at a sensible size for Reddit, YouTube and phones; the full-quality one stays beside it)
    if not a.preview and not a.test:
        co = os.path.splitext(a.out)[0] + '-compressed.mp4'
        has_audio = bool(tracks)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.out, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-maxrate', '10M', '-bufsize', '20M',
                        '-pix_fmt', 'yuv420p', *(['-c:a', 'aac', '-b:a', '160k'] if has_audio else ['-an']), '-movflags', '+faststart', co], check=True)
        mb = lambda f: os.path.getsize(f)/1e6
        print(f'compressed: {os.path.relpath(co, ROOT)}  ({mb(co):.0f} MB, from {mb(a.out):.0f} MB)')
    if a.vertical:
        vo = os.path.splitext(a.out)[0] + '-vertical.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.out, '-filter_complex',
                        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.18[bg];'
                        '[0:v]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2',
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', vo], check=True)
        print('vertical:', os.path.relpath(vo, ROOT))


if __name__ == '__main__':
    main()
