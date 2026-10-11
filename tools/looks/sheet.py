#!/usr/bin/env python3
"""One contact sheet per look: the look's two screenshots (zoom 15 and 30) next to the mood board images picked for it, so the two can be
compared by eye. Run it where the mood board folder is (it is not in this repo, and the sheets are never to be committed: they hold her images).

  MOODBOARD_DIR=/path/to/ashleyjacob165_weather python3 tools/looks/sheet.py        sheets go to tools/looks/sheets/ (ignored by git)

The image numbers and file names are the ones in claude/looks-moodboard.md (the order the images were uploaded).
"""
import os, sys
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))

FILES = {1: '965ab572c3d95e2cc6240fc1f570b7f8.png', 2: '3d8b22ad1d70d7393b2c1f7659d6398e.png', 3: 'e692f3266850892e39a5aec6a2ef36d9.jpg', 4: 'bb070c15742bddf2fb7ab0b6df23132d.jpg',
         5: '4776ea653ec9ad5d1c07813bc8dab8d6.png', 6: 'dba0343e74597189c81111e9e73396b7.jpg', 7: '82cdfb718b1b86a05393d8de6a254d97.jpg', 8: 'b41fdec0a6d5624ca4935b49b78a4650.jpg',
         9: '5e552d0482a8d87735122ec713e48697.jpg', 10: 'ac0b3c2fe1cfbb69a1035bc7043b59da.png', 11: 'ca0699eef7f413080f67ebe1e6177dea.jpg', 12: '917c0ceb7a081b16c4ae1e48f4838701.jpg',
         13: '8fb60b361440a7331aec967c55ddb54e.jpg', 14: 'f20f22f1da01a8f4ac936f6bdd734fdc.jpg', 15: '1e2809865608f3b4d34289d3bfd2a770.jpg', 16: 'e744f67d99c8c445e61859105d6141a8.jpg',
         17: '45886d279f69da8f453be97fb8262d61.jpg', 18: '79e9d672c5285afb21e8a51a1a39f5d6.jpg', 19: '7d6a6939eaeb1abe8be2ff5a49328b10.jpg', 20: 'b6f9e6535478a26233b9a1a13ebef9e0.jpg',
         21: 'c79ae004220e1b601d7f0bd7ef9b445b.jpg', 22: '07cc020a314a5fc600df4cf197b652f6.jpg', 23: 'ac12f887bee76c00a7687df60364cad3.jpg', 24: '1d4ba4c06813a99d6094049e6b3da64d.jpg',
         25: '784ed927f365f914a0f7e50dbc4d25c2.png'}
LOOK_IMAGES = {'morning': [1, 3, 6, 12], 'rainyMorning': [18, 2, 13, 19], 'afternoon': [24, 22, 17], 'rainyAfternoon': [10, 11, 15], 'overcast': [],
               'golden': [4, 5, 23, 14], 'dusk': [7, 8, 16, 20], 'night': [25, 21, 14, 9], 'rainyNight': [25], 'late': []}


def main():
    src = os.environ.get('MOODBOARD_DIR')
    shots = os.path.join(HERE, 'shots'); out = os.path.join(HERE, 'sheets'); os.makedirs(out, exist_ok=True)
    for look, nums in LOOK_IMAGES.items():
        tiles = []
        for z in (15, 30):
            p = os.path.join(shots, '%s_z%d.jpg' % (look, z))
            if os.path.exists(p): tiles.append((Image.open(p).convert('RGB'), 'game, zoom %d' % z))
        for n in nums:
            p = os.path.join(src, FILES[n]) if src else None
            if p and os.path.exists(p): tiles.append((Image.open(p).convert('RGB'), 'image %d' % n))
            else: tiles.append((Image.new('RGB', (640, 360), (40, 40, 48)), 'image %d: not found (%s)' % (n, FILES[n][:12])))
        W = 640; cols = 2; rows = (len(tiles) + cols - 1)//cols
        sheet = Image.new('RGB', (W*cols, 380*rows), (16, 18, 28)); d = ImageDraw.Draw(sheet)
        for i, (im, cap) in enumerate(tiles):
            im.thumbnail((W, 360)); x, y = (i % cols)*W, (i//cols)*380
            sheet.paste(im, (x + (W - im.width)//2, y)); d.text((x + 6, y + 362), '%s: %s' % (look, cap), fill=(220, 220, 220))
        sheet.save(os.path.join(out, look + '.jpg'), quality=88); print(os.path.join(out, look + '.jpg'))


if __name__ == '__main__':
    main()
