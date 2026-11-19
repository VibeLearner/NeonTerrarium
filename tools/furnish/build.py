#!/usr/bin/env python3
"""Regenerate furnish.html (the game's Furnish pod page) from the Pod Furniture Lab.

usage: python3 tools/furnish/build.py [path/to/podlab]     (default: $PODLAB, else tools/podlab, else ../podlab)
       python3 tools/furnish/build.py --refresh            (no lab needed: re-applies the game side below to the furnish.html already here,
                                                             after editing furnish/*.css or *.js, so their ?v= follow; furnish/club.js too)

Runs the lab's own `build.py --embed` (Build mode only, boots straight into Build, no localStorage), then adds what the game needs:
window.PODCITY_NOPACK (the city comes from the game, never from city/*.wasm), furnish/bridge.css + furnish/bridge.js (the Exit to city
and Save bar and the postMessage side of js/furnish.js) and furnish/touch.css + furnish/touch.js (the phone layout: a bottom tray, a bar
over the selected piece, pinch and two-finger pan; touch screens only), each with a ?v= from its contents. The phone layout reaches into
the builder through PodBuilder.touch, a few hooks added to the lab's builder.js here (TOUCH_API), and a touch screen gets a hold in the head
that keeps a touch from cutting the loading hologram short (HOLD). Writes furnish.html next to index.html.
Every step can run again on its own output: --refresh swaps the old tags for new ones instead of adding a second set.
"""
import hashlib, os, re, subprocess, sys

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

# On a touch screen the hologram that plays while an apartment comes in is a loading screen: a touch must not cut it short. The lab skips
# it from a window capture listener of the builder's (added at startup) and one of PodContext's, so this goes in the head, before any of the
# lab's scripts, and is the first listener there: while furnish/bridge.js says the apartment is still coming in (window.__ntLoading) it
# stops every pointer, touch and click before the lab's listeners or touch.js see it. Keys are left alone (Esc still goes back to the city).
HOLD_MARK = '<!-- Neon Terrarium: the touch hold (tools/furnish/build.py) -->'
HOLD = (HOLD_MARK + '\n<script>(()=>{if(!(window.matchMedia&&matchMedia(\'(pointer: coarse)\').matches))return;'
        'const hold=e=>{const f=window.__ntLoading;if(f&&f()){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation()}};'
        "for(const t of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','mousedown','mouseup','click','dblclick','contextmenu','wheel'])"
        'addEventListener(t,hold,{capture:true,passive:false})})()</script>\n')
HOLD_AT = '<script>window.PODLAB_EMBED=true;window.PODCITY_NOPACK=true</script>\n'

# The Neon Dome's club furniture (furnish/club.js): one more furniture section, in the lab's own grammar and kit (K.STYLE, K.HAB). Sections
# register themselves on window.PODLAB_SECTIONS and the lab core reads them when it starts, so it goes right before the core's script,
# inline like the lab's own sections (the builder's furnishing worker bundles the page's inline section scripts).
CLUB_MARK = '<!-- Neon Terrarium: the club furniture section (tools/furnish/build.py) -->'
CORE_AT = '<script>\n(function(){\n"use strict";\nconst T=window.THREE;'
# Tags from sections (window.PODLAB_TAGS, e.g. furnish/club.js's dance tiles place like a rug) join the pods' own tag table; then the club
# room (furnish/club.js, PODLAB_CLUB*): a home with tier 'club' is the Neon Dome's round ground floor. Every hook is an insertion next to an
# anchor in the lab's code, wrapped in /*ntc*/ ... /*/ntc*/, so a run strips the old ones first and adds them again (never twice).
NTC = re.compile(r'/\*ntc\*/.*?/\*/ntc\*/', re.S)
CLUB_HOOKS = [   # (anchor, 'before' | 'after', code)
    ('const TG={};for(const k in TAG_SRC)', 'before', "Object.assign(TAG_SRC,window.PODLAB_TAGS||{});"),
    # the club categories join the Build rail's catalog
    ("['walls','Walls','Walls','brick','fin']]", 'after', ".concat(window.PODLAB_CLUBCATS||[])"),
    # buildPod: no straight wall runs for a club; club.js builds its shell (two levels, the dome, the dome's light)
    ("const runs=wallRunsOf(P);const faceList=[];", 'after', "if(P.type==='club'){runs.length=0;if(window.PODLAB_CLUBSHELL)window.PODLAB_CLUBSHELL(P,root,{T,TILE})}"),
    # the rail shows the club's groups while a club is open (railFor, from intoStage), and the page gets the club's backdrop (body.nt-club)
    ("const GROUP_OF={};GROUPS.forEach(g=>g.cats.forEach(k=>GROUP_OF[k]=g));const lastCat={};", 'after',
     "const GROUPS_APT=GROUPS.slice();function railFor(club){club=!!club;document.body.classList.toggle('nt-club',club);if(GROUPS.__club===club)return;"
     "const want=club?(window.PODLAB_CLUBGROUPS||[]).map(g=>Object.assign({},g,{cats:g.cats.filter(k=>CATK[k])})).filter(g=>g.cats.length):GROUPS_APT;"
     "GROUPS.length=0;GROUPS.push(...want);GROUPS.__club=club;for(const k in GROUP_OF)delete GROUP_OF[k];GROUPS.forEach(g=>g.cats.forEach(k=>GROUP_OF[k]=g));"
     "for(const k in lastCat)delete lastCat[k];if($('bRail')&&$('bRail').innerHTML){closeFly();buildRail()}}"),
    ("function intoStage(s){", 'after', "try{railFor(!!(s&&s.P&&s.P.type==='club'))}catch(e){console.warn('club rail',e)}"),
    # the Walls buttons and the camera's turn reach the club's shell (which side of it stands)
    ("function wallTargets(s,mode,az,hov){", 'after', "if(s&&s.P&&s.P.type==='club'&&window.PODLAB_CLUBVIEW)window.PODLAB_CLUBVIEW(s,mode,az);"),
    # only the dome, no city round it (owner, Nov 19): PodContext (the city backdrop and its hologram) stays out of a club
    ("function ctxEarly(pk,tier){const C=window.PodContext;", 'after', "if(tier==='club')return false;"),
    ("function ctxEnter(){const C=window.PodContext;", 'after', "if(B.home&&B.home.tier==='club')return;"),
    # the header names the club
    ("const podText=p=>!p?'':", 'after', "p.kind==='club'||(B.home&&B.home.tier==='club')?'Neon Dome · the club floor':"),
    # the dome fills the view when a club opens
    ("B.tx=B.tz=0;B.zoom=1;B.az=SH.AZ0;", 'after', "if(rc.home.tier==='club')B.zoom=1.3;"),
]


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
    # the touch hold (see HOLD), right after the embed flags in the head; an older one from a previous run goes first
    i = html.find(HOLD_MARK)
    if i >= 0:
        j = html.find('</script>\n', i)
        html = html[:i] + html[j + len('</script>\n'):]
    if HOLD_AT in html:
        html = html.replace(HOLD_AT, HOLD_AT + HOLD, 1)
    else:
        print('warning: no embed flags script in the lab build: the touch hold is left out (a touch can cut the hologram short)')
    # the phone layout's hooks into the builder (see TOUCH_API); without them touch.js leaves the page as it is
    if 'touch:TOUCHAPI' not in html:
        if html.count(API_AT) == 1:
            html = html.replace(API_AT, TOUCH_API + 'window.PodBuilder={version:1,touch:TOUCHAPI,', 1)
        else:
            print('warning: no window.PodBuilder={version:1, in the lab build: the phone layout is left out (update TOUCH_API)')
    # the club furniture section, before the lab core (see CLUB_MARK); an older tag from a previous run goes first
    i = html.find(CLUB_MARK)
    if i >= 0:
        j = html.find('</script>\n', i)
        html = html[:i] + html[j + len('</script>\n'):]
    html = NTC.sub('', html)
    for anchor, where, code in CLUB_HOOKS:
        if html.count(anchor) != 1:
            print('warning: a club hook anchor was not found once: %s... (update CLUB_HOOKS)' % anchor[:40]); continue
        w = '/*ntc*/' + code + '/*/ntc*/'
        html = html.replace(anchor, w + anchor if where == 'before' else anchor + w, 1)
    if html.count(CORE_AT) == 1:
        # inline, as the lab's own sections are: the builder's furnishing worker bundles the page's inline section scripts
        club = open(os.path.join(REPO, 'furnish', 'club.js'), encoding='utf-8').read()
        html = html.replace(CORE_AT, CLUB_MARK + '\n<script>' + club.rstrip() + '\n</script>\n' + CORE_AT, 1)
    else:
        print('warning: the lab core script was not found: the club furniture is left out (update CORE_AT)')
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
