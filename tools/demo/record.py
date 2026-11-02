#!/usr/bin/env python3
"""Record the Neon Terrarium demo clip: 15 s, 1920 x 1080, 60 fps, captioned, with the music and the game's own build sounds laid in.

Runs on your own Mac (it needs the graphics card). It serves this folder, opens the game at index.html?full#demo in Chrome with a stepped
clock (tools/demo/shim.js), waits while the clip builds its city and lets it live a little, then captures every frame in turn and hands
them to ffmpeg. Time only moves when a frame is captured, so nothing is dropped or rushed however slow a frame is to draw.

    python3 tools/demo/record.py                 # the clip -> tools/demo/out/neon-terrarium-demo.mp4
    python3 tools/demo/record.py --preview       # a quick 720p, 30 fps look -> tools/demo/out/neon-terrarium-demo-preview.mp4
    python3 tools/demo/record.py --stills        # PNGs at the key moments only -> tools/demo/out/stills/
    python3 tools/demo/record.py --vertical      # also a 1080 x 1920 cut for phones (the 16:9 film centred on a blurred copy of itself)

Needs: pip3 install playwright && python3 -m playwright install chromium  (it uses Google Chrome if installed), and ffmpeg.
"""
import argparse, base64, functools, http.server, json, os, shutil, struct, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
LEN, FPS = 15.0, 60
STILLS = [1.2, 2.6, 4.2, 5.6, 6.8, 7.9, 9.4, 10.2, 11.6, 12.2, 13.2, 14.6]
SFX = {'place': ('assets/audio/sfx/place.wav', .45), 'megaArrive': ('assets/audio/sfx/mega-arrive.wav', .8)}   # (what the game played, and how loud under the music)


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


def launch(pw, headless):
    args = ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--hide-scrollbars']
    try:
        return pw.chromium.launch(channel='chrome', headless=headless, args=args)
    except Exception as e:
        print('Google Chrome not found, using Playwright\'s Chromium:', str(e).splitlines()[0])
        return pw.chromium.launch(headless=headless, args=args)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=None)
    ap.add_argument('--preview', action='store_true', help='a quick look: 30 fps, 1280 x 720 (the timing is the same as the real clip)')
    ap.add_argument('--stills', action='store_true', help='only save stills at key moments (PNG) and stop')
    ap.add_argument('--vertical', action='store_true', help='also make a 1080 x 1920 version for phones')
    ap.add_argument('--headless', action='store_true', help='no browser window (some Macs draw WebGL slower or not at all headless)')
    ap.add_argument('--port', type=int, default=8794)
    ap.add_argument('--quality', type=int, default=95)
    ap.add_argument('--crf', type=int, default=16)
    a = ap.parse_args()
    a.out = a.out or os.path.join(OUT, 'neon-terrarium-demo' + ('-preview' if a.preview else '') + '.mp4')
    if not shutil.which('ffmpeg') and not a.stills: sys.exit('ffmpeg is needed: brew install ffmpeg')
    from playwright.sync_api import sync_playwright
    os.makedirs(OUT, exist_ok=True)
    srv = serve(a.port)
    url = f'http://127.0.0.1:{a.port}/index.html?full#demo'
    with sync_playwright() as pw:
        def open_page(headless):
            browser = launch(pw, headless)
            ctx = browser.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
            ctx.add_init_script(path=os.path.join(HERE, 'shim.js'))
            page = ctx.new_page(); cdp = ctx.new_cdp_session(page)
            page.on('console', lambda m: print('  page:', m.text[:1500]) if m.text.startswith('[demo]') or m.type == 'error' else None)
            page.on('pageerror', lambda e: print('  page error:', e))
            page.on('crash', lambda *_: print('  the page crashed (the graphics process may have run out of memory)'))
            page.goto(url, wait_until='load')
            return browser, page, cdp
        browser, page, cdp = open_page(a.headless)
        def grab(fmt='jpeg', quality=None):
            o = {'format': fmt, 'fromSurface': True, 'captureBeyondViewport': False}
            if fmt == 'jpeg': o['quality'] = quality or a.quality
            return base64.b64decode(cdp.send('Page.captureScreenshot', o)['data'])
        # a screen too small for a 1920 x 1080 window clips it: then the clip is made without a window instead
        if not a.headless:
            png = grab('png'); w, h = struct.unpack('>II', png[16:24])
            if (w, h) != (1920, 1080) and not (w % 1920 == 0 and h % 1080 == 0 and w//1920 == h//1080):
                print(f'  the browser window only shows {w} x {h} of the 1920 x 1080 picture: filming without a window instead')
                browser.close(); a.headless = True
                browser, page, cdp = open_page(True)
        ev = page.evaluate

        t0, last = time.time(), ''
        while True:
            ev('__step(2)')
            st = ev('typeof DEMO !== "undefined" ? DEMO.state() : null') or {}
            fail = ev('typeof DEMO !== "undefined" && DEMO.failed')
            if fail: sys.exit('the demo could not set up: ' + str(fail) + '\n' + '\n'.join(st.get('log', [])))
            if st.get('stage') != last: last = st.get('stage'); print(f'[{time.time() - t0:5.1f}s] {last}')
            if st.get('ready'): break
            if time.time() - t0 > 1200: sys.exit('setup took over 20 minutes; last stage: ' + str(last))
            time.sleep(.01)
        print('ready:', json.dumps(st.get('info')))
        if not ev('DEMO.start()'): sys.exit('the clip would not start')

        frames = int(round(LEN*FPS)); every = 2 if a.preview else 1
        enc = None
        if a.stills:
            want = sorted(int(round(s*FPS)) for s in STILLS)
            sd = os.path.join(OUT, 'stills'); os.makedirs(sd, exist_ok=True)
        else:
            raw = os.path.splitext(a.out)[0] + '.video.mp4'
            size, fps = ('1280:720', FPS//2) if a.preview else ('1920:1080', FPS)
            enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'image2pipe', '-framerate', str(fps), '-c:v', 'mjpeg', '-i', '-',
                                    '-vf', f'scale={size}:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf + (5 if a.preview else 0)),
                                    '-pix_fmt', 'yuv420p', '-r', str(fps), raw], stdin=subprocess.PIPE)
        t1 = time.time()
        for f in range(frames):
            ev('__step(1)')
            if a.stills:
                if f in want:
                    p = os.path.join(sd, f'{f/FPS:05.2f}s.png'); open(p, 'wb').write(grab('png')); print('still', os.path.relpath(p, ROOT))
                continue
            if f % every: continue
            enc.stdin.write(grab(**({'quality': 80} if a.preview else {})))
            if f % FPS == 0:
                el = time.time() - t1; eta = el/(f + 1)*(frames - f - 1)
                print(f'  {f/FPS:4.0f}s of {LEN:.0f}s   ({el:4.0f}s elapsed, about {eta/60:.1f} min to go)')
        st = ev('DEMO.state()')
        browser.close()
    srv.shutdown()
    with open(os.path.join(OUT, 'demo-log.txt'), 'w') as fh: fh.write(json.dumps(st.get('info'), indent=1) + '\n' + json.dumps(st.get('sfx')) + '\n' + '\n'.join(st.get('log', [])) + '\n')
    if a.stills: print('stills in', os.path.relpath(sd, ROOT)); return
    enc.stdin.close(); enc.wait()

    # the sound: the music from where the clip says, the game's own sounds at the moments it played them, a short fade at the end
    music = st['info']['music']
    mp = os.path.join(ROOT, 'assets', 'audio', 'music', music['file'])
    ins, chains, mix = ['-i', raw, '-i', mp], [f"[1:a]atrim={music['start']:.3f}:{music['start'] + LEN:.3f},asetpts=PTS-STARTPTS[m]"], ['[m]']
    n = 2
    for k, s in enumerate(st.get('sfx') or []):
        if s['name'] not in SFX: continue
        path, vol = SFX[s['name']]; ins += ['-i', os.path.join(ROOT, path)]
        ms = int(round(s['t']*1000)); chains.append(f'[{n}:a]adelay={ms}|{ms},volume={vol}[s{k}]'); mix.append(f'[s{k}]'); n += 1
    fc = ';'.join(chains) + ';' + ''.join(mix) + f'amix=inputs={len(mix)}:normalize=0:duration=first,afade=t=in:d=0.25,afade=t=out:st={LEN - .6:.2f}:d=0.6,alimiter=limit=0.95[a]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
                    '-t', f'{LEN:.2f}', '-movflags', '+faststart', a.out], check=True)
    os.remove(raw)
    print('done:', os.path.relpath(a.out, ROOT), f'({(time.time() - t1)/60:.1f} min of capture)')
    if a.vertical:
        vo = os.path.splitext(a.out)[0] + '-vertical.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.out, '-filter_complex',
                        '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.18[bg];'
                        '[0:v]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2',
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', vo], check=True)
        print('vertical:', os.path.relpath(vo, ROOT))


if __name__ == '__main__':
    main()
