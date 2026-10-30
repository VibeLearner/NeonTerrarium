#!/usr/bin/env python3
"""Regenerate furnish.html (the game's Furnish pod page) from the Pod Furniture Lab.

usage: python3 tools/furnish/build.py [path/to/podlab]     (default: $PODLAB, else tools/podlab, else ../podlab)
       python3 tools/furnish/build.py --refresh            (no lab needed: re-applies the game side below to the furnish.html already here,
                                                             after editing furnish/*.css or *.js, so their ?v= follow)

Runs the lab's own `build.py --embed` (Build mode only, boots straight into Build, no localStorage), then adds what the game needs:
window.PODCITY_NOPACK (the city comes from the game, never from city/*.wasm), furnish/bridge.css + furnish/bridge.js (the Exit to city
and Save bar and the postMessage side of js/furnish.js) and furnish/touch.css + furnish/touch.js (the phone layout: a bottom tray, a bar
over the selected piece, pinch and two-finger pan; touch screens only), each with a ?v= from its contents. The phone layout reaches into
the builder through PodBuilder.touch, a few hooks added to the lab's builder.js here (TOUCH_API). Writes furnish.html next to index.html.
Every step can run again on its own output: --refresh swaps the old tags for new ones instead of adding a second set.
"""
import hashlib, os, subprocess, sys

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(REPO, 'furnish.html')
FILES = ['bridge.css', 'bridge.js', 'touch.css', 'touch.js']
MARK = '<!-- Neon Terrarium: the game side (tools/furnish/build.py) -->'

# The hooks furnish/touch.js uses, put in front of window.PodBuilder in the lab's builder.js (so they see its own B, OV and functions).
# Nothing in them runs unless touch.js calls it, so a mouse and keyboard see the lab exactly as it was. Each hook looks a name up only
# when it is called: a lab that renames something breaks that one hook, not the page.
TOUCH_API = (
    "/* Neon Terrarium (tools/furnish/build.py): hooks for the phone layout, furnish/touch.js. Nothing here runs unless it is called. */\n"
    "const TOUCHAPI=(()=>{const v=new T.Vector3();\n"
    "  const aim=(x,y)=>{const r=$('bCanvas').getBoundingClientRect();B.ptr.x=x-r.left;B.ptr.y=y-r.top;B.ptr.nx=B.ptr.x/r.width*2-1;B.ptr.ny=-(B.ptr.y/r.height)*2+1;B.mods.shift=B.mods.ctrl=B.mods.alt=false;B.ptr.dirty=true;B.ptr.in=true};\n"
    "  return {ov:()=>OV,bad:()=>C_BAD,aim,\n"
    "    state:()=>({on:B.on,ready:!!B.s&&!B.loading,trans:!!B.trans,asleep:!!(B.warming||B.paused),mode:B.mode,sel:B.sel,drag:B.drag?B.drag.type:null,ctx:B.place?B.place.ctx:B.drag&&B.drag.type==='move'?B.drag.ctx:null,home:B.home}),\n"
    "    place:()=>{if(B.mode!=='place'||!B.place)return false;B.ptr.dirty=false;setRay();floatUpdate(B.place.ctx);placeGhost(false);return B.mode!=='place'},\n"
    "    startPlace:(it,o)=>startPlace(it,o),cancel:()=>cancelPlace(),rot:d=>{rot90(d);hint()},dup:()=>dupSel(),del:()=>delSel(),\n"
    "    surface:(x,y)=>{if(B.mode!=='select'||!B.s)return;B.drag=null;aim(x,y);setRay();if(!pickPiece(0))selectSurface();hint()},\n"
    "    pan:(dx,dy)=>{if(B.s)panBy(dx,dy)},\n"
    "    zoomAt:(f,x,y)=>{if(!B.s)return;const p={x:B.ptr.x,y:B.ptr.y,nx:B.ptr.nx,ny:B.ptr.ny};aim(x,y);setRay();const ok=ground(0,_v1),p0x=_v1.x,p0z=_v1.z;B.zoom=clamp(B.zoom*f,.6,5);updateCam();\n"
    "      if(ok){setRay();if(ground(0,_v1)){B.tx+=p0x-_v1.x;B.tz+=p0z-_v1.z;updateCam()}}Object.assign(B.ptr,p);B.ptr.dirty=true;B.needs=true},\n"
    "    drop:()=>{const D=B.drag;if(!D)return;if(D.type==='move'){D.ctx.hit=false;endMove()}else{if(D.type==='orbit'){B.az=D.az;setPitch(D.pitch)}\n"
    "      else if(D.type==='ring'){prCall('picking',false);const i=selInst();if(i&&D.before){Object.assign(i.rec,clone(D.before));syncInst(i.rec.id)}}B.drag=null}$('bStage').dataset.cur='';hint()},\n"
    "    anchor:()=>{const i=B.place?B.place.inst:B.drag&&B.drag.type==='move'?B.inst.get(B.drag.id):selInst();if(!i||!i.pivot.visible||!i.lbox)return null;const lb=i.lbox;\n"
    "      v.set((lb.min.x+lb.max.x)/2,lb.max.y,(lb.min.z+lb.max.z)/2).applyMatrix4(i.pivot.matrixWorld).project(B.cam);const r=$('bCanvas').getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height}}}})();\n")
API_AT = 'window.PodBuilder={version:1,'


def ver(f):
    return hashlib.sha1(open(os.path.join(REPO, 'furnish', f), 'rb').read()).hexdigest()[:10]


def game_side(html):
    # a real viewport (with viewport-fit=cover, so the safe-area insets are there on phones), unless the lab has one already
    if 'name="viewport"' not in html:
        html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">', 1)
    # the animations play whatever the device's reduce-motion setting says (owner's choice, Oct 30)
    for a, b in [('@media (prefers-reduced-motion:reduce){.bstage *,.bstage *::after{animation:none!important;transition:none!important}}', ''), ('@media (prefers-reduced-motion:reduce){*{transition:none!important}}', ''), ("const rm=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)", 'const rm=false')]:
        html = html.replace(a, b)
    if 'window.PODCITY_NOPACK=true' not in html:
        html = html.replace('<script>window.PODLAB_EMBED=true</script>', '<script>window.PODLAB_EMBED=true;window.PODCITY_NOPACK=true</script>', 1)
    # the phone layout's hooks into the builder (see TOUCH_API); without them touch.js leaves the page as it is
    if 'touch:TOUCHAPI' not in html:
        if html.count(API_AT) == 1:
            html = html.replace(API_AT, TOUCH_API + 'window.PodBuilder={version:1,touch:TOUCHAPI,', 1)
        else:
            print('warning: no window.PodBuilder={version:1, in the lab build: the phone layout is left out (update TOUCH_API)')
    # the game's own files, last, each with a ?v= from its contents (an older set from a previous run goes first)
    i = html.find(MARK)
    if i >= 0:
        j = html.rfind('</body>')
        html = html[:i] + (html[j:] if j > i else '')
    tail = (MARK + '\n'
            '<link rel="stylesheet" href="furnish/bridge.css?v=%s">\n<script src="furnish/bridge.js?v=%s"></script>\n'
            '<link rel="stylesheet" href="furnish/touch.css?v=%s">\n<script src="furnish/touch.js?v=%s"></script>\n') % tuple(ver(f) for f in FILES)
    i = html.rfind('</body>')
    return html[:i] + tail + html[i:] if i >= 0 else html + tail


def write(html, src):
    tmp = OUT + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(html)
    os.replace(tmp, OUT)
    print('furnish.html from %s: %.1f MB' % (src, os.path.getsize(OUT) / 1048576))


if sys.argv[1:2] == ['--refresh']:
    write(game_side(open(OUT, encoding='utf-8').read()), 'the furnish.html already here')
    sys.exit(0)

cands = [a for a in sys.argv[1:2]] + [os.environ.get('PODLAB', ''), os.path.join(REPO, 'tools', 'podlab'), os.path.join(REPO, '..', 'podlab')]
lab = next((os.path.abspath(c) for c in cands if c and os.path.exists(os.path.join(c, 'build.py'))), None)
if not lab:
    sys.exit('Pod Furniture Lab not found: pass its folder, or set PODLAB')

subprocess.run([sys.executable, 'build.py', '--embed'], cwd=lab, check=True)
html = open(os.path.join(lab, 'furnish.html'), encoding='utf-8').read()
if 'window.PODLAB_EMBED=true' not in html:
    sys.exit('the lab build has no embed mode (window.PODLAB_EMBED): update the lab')
write(game_side(html), lab)
