#!/usr/bin/env python3
"""The look editor and the looks menu, as the player sees them: opens the settings deck and the editor (Shift+L), drops a reference
image on it, takes page screenshots and prints what the page reported. Uses the perf harness's rig.

  PERF_PORT=9620 python3 tools/looks/ui_shot.py [outdir]
"""
import os, sys, base64, io, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'perf'))
import harness as H


def main(out):
    from playwright.sync_api import sync_playwright
    from PIL import Image
    os.makedirs(out, exist_ok=True)
    srv = H.serve(); url = H.make_site('looks_ui'); sc = H.load_scenes(['city'])[0]
    with sync_playwright() as pw:
        br = H.launch(pw)
        ctx, pg, errs = H.open_game(br, url, sc, (1440, 800))
        pg.evaluate("() => { document.head.lastElementChild.remove(); }")   # the harness hides every page element but the canvas: show them
        pg.evaluate('() => { S.cycle = false; S.hour = 8; __step(90); }')
        pg.click('#deckToggle')
        pg.evaluate('() => { __step(5); }')
        pg.screenshot(path=os.path.join(out, 'menu.png'))
        pg.keyboard.press('Shift+L')
        pg.evaluate('() => { __step(5); }')
        print('editor open:', pg.evaluate('() => !document.getElementById("lookEd").hidden'), 'cycle after open:', pg.evaluate('() => S.cycle'))
        # a reference image dropped on the zone (a generated picture, not a mood board image)
        png = io.BytesIO(); Image.new('RGB', (160, 90), (200, 120, 60)).save(png, 'PNG')
        pg.set_input_files('#lookEd input[type=file]', files=[{'name': 'ref.png', 'mimeType': 'image/png', 'buffer': png.getvalue()}])
        pg.evaluate('() => { __step(5); }')
        pg.screenshot(path=os.path.join(out, 'editor.png'))
        print('refs shown:', pg.evaluate('() => document.querySelectorAll("#lookRefs img").length'))
        # typing in the paste box must not reach the game (x is delete mode, h centers the view)
        pg.fill('#lookEd textarea', '')
        pg.click('#lookEd textarea'); pg.keyboard.type('xhq1 {"id":"night"}')
        print('delete mode after typing x:', pg.evaluate('() => typeof delMode !== "undefined" ? delMode : null'))
        # copy, change, paste
        pg.get_by_role('button', name='Copy JSON', exact=True).click(); pg.wait_for_timeout(300)
        print('json box:', pg.evaluate('() => document.querySelector("#lookEd textarea").value.slice(0, 60)'))
        # a slider changes the look
        pg.evaluate('() => { const i = document.querySelector("#lookEd input[aria-label=Saturation]"); i.value = 1.9; i.dispatchEvent(new Event("input")); __step(3); }')
        print('sat now:', pg.evaluate('() => LK.looks.morning.v.sat'))
        pg.get_by_role('button', name='Save', exact=True).click(); pg.wait_for_timeout(200)
        print('stored:', pg.evaluate('() => (localStorage.getItem("neonLooks.edits") || "").slice(0, 80)'))
        pg.keyboard.press('Shift+L'); pg.evaluate('() => { __step(2); }')
        print('editor closed:', pg.evaluate('() => document.getElementById("lookEd").hidden'))
        print('page errors:', errs[:5])
        br.close()
    srv.shutdown()


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'shots'))
