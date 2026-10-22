#!/usr/bin/env python3
"""Regenerate furnish.html (the game's Furnish pod page) from the Pod Furniture Lab.

usage: python3 tools/furnish/build.py [path/to/podlab]     (default: $PODLAB, else tools/podlab, else ../podlab)

Runs the lab's own `build.py --embed` (Build mode only, boots straight into Build, no localStorage), then adds what the game needs:
window.PODCITY_NOPACK (the city comes from the game, never from city/*.wasm) and furnish/bridge.css + furnish/bridge.js (the Exit to city
and Save bar and the postMessage side of js/furnish.js), each with a ?v= from its contents. Writes furnish.html next to index.html.
"""
import hashlib, os, subprocess, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
cands = [a for a in sys.argv[1:2]] + [os.environ.get('PODLAB', ''), os.path.join(REPO, 'tools', 'podlab'), os.path.join(REPO, '..', 'podlab')]
lab = next((os.path.abspath(c) for c in cands if c and os.path.exists(os.path.join(c, 'build.py'))), None)
if not lab:
    sys.exit('Pod Furniture Lab not found: pass its folder, or set PODLAB')

subprocess.run([sys.executable, 'build.py', '--embed'], cwd=lab, check=True)
src = os.path.join(lab, 'furnish.html')
html = open(src, encoding='utf-8').read()
if 'window.PODLAB_EMBED=true' not in html:
    sys.exit('the lab build has no embed mode (window.PODLAB_EMBED): update the lab')

ver = lambda f: hashlib.sha1(open(os.path.join(REPO, 'furnish', f), 'rb').read()).hexdigest()[:10]
html = html.replace('<script>window.PODLAB_EMBED=true</script>',
                    '<script>window.PODLAB_EMBED=true;window.PODCITY_NOPACK=true</script>', 1)
tail = ('<!-- Neon Terrarium: the game side (tools/furnish/build.py) -->\n'
        '<link rel="stylesheet" href="furnish/bridge.css?v=%s">\n<script src="furnish/bridge.js?v=%s"></script>\n' % (ver('bridge.css'), ver('bridge.js')))
i = html.rfind('</body>')
html = html[:i] + tail + html[i:] if i >= 0 else html + tail
out = os.path.join(REPO, 'furnish.html')
tmp = out + '.tmp'
open(tmp, 'w', encoding='utf-8').write(html)
os.replace(tmp, out)
print('furnish.html from %s: %.1f MB' % (lab, os.path.getsize(out) / 1048576))
