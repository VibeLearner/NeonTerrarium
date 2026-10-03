# Builds assets/sprites/holo_walls.png, the atlas of the wall-hologram signs (see wallHologram in js/buildings.js),
# from the tall pictures in assets/sprites/originals/ (holo_<name>.webp, names in SIGNS below).
# Each sign is cropped to its artwork and put on black with a 12 px margin (the hologram is additive, so black is
# see-through, and the shader fades the very edge of a picture). The signs sit side by side, 2 px apart, in the
# order of SIGNS (the order of the ad numbers). The signs are already tall, so the hologram just scales them.
# After changing a picture or the order, copy the WALL_CELLS line printed below into js/buildings.js.
from PIL import Image
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites'))
SIGNS = ['sushi', 'repair', 'pureflow', 'satellite']
M, GAP = 12, 2
pics = []
for name in SIGNS:
    src = Image.open(f'originals/holo_{name}.webp').convert('RGBA')
    src = src.crop(src.getchannel('A').getbbox())
    pic = Image.new('RGB', (src.width + 2*M, src.height + 2*M), (0, 0, 0)); pic.paste(src, (M, M), src)
    pics.append(pic)
atlas = Image.new('RGB', (sum(p.width for p in pics) + GAP*(len(pics) - 1), max(p.height for p in pics)), (0, 0, 0))
cells, x = [], 0
for p in pics:
    atlas.paste(p, (x, 0)); cells.append([x, 0, p.width, p.height]); x += p.width + GAP
atlas.save('holo_walls.png')
print('holo_walls.png', atlas.size)
print(f'const WALL_ATLAS = {list(atlas.size)}, WALL_CELLS = {cells};   // x, y from the top, width, height of each sign')
