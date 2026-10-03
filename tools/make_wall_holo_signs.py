# Builds assets/sprites/holo_walls.png, the atlas of the wall-hologram signs (see wallHologram in js/buildings.js),
# from the tall pictures in assets/sprites/originals/ (holo_<name>.webp, names in SIGNS below).
# Each sign is cropped to its artwork and put on black with a 12 px margin (the hologram is additive, so black is
# see-through, and the shader fades the very edge of a picture). The signs sit side by side in rows, 2 px apart, in
# the order of SIGNS (the order of the ad numbers). The signs are already tall, so the hologram just scales them.
# After changing a picture or the order, copy the WALL_CELLS line printed below into js/buildings.js.
from PIL import Image
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites'))
SIGNS = ['sushi', 'repair', 'pureflow', 'satellite', 'loan']
ROW_W = 2200   # start a new row of signs when a row would pass this width
M, GAP = 12, 2
pics = []
for name in SIGNS:
    src = Image.open(f'originals/holo_{name}.webp').convert('RGBA')
    src = src.crop(src.getchannel('A').getbbox())
    pic = Image.new('RGB', (src.width + 2*M, src.height + 2*M), (0, 0, 0)); pic.paste(src, (M, M), src)
    pics.append(pic)
cells, x, y, rowH = [], 0, 0, 0
for p in pics:
    if x and x + p.width > ROW_W: x, y, rowH = 0, y + rowH + GAP, 0
    cells.append([x, y, p.width, p.height]); x += p.width + GAP; rowH = max(rowH, p.height)
atlas = Image.new('RGB', (max(c[0] + c[2] for c in cells), max(c[1] + c[3] for c in cells)), (0, 0, 0))
for p, c in zip(pics, cells): atlas.paste(p, (c[0], c[1]))
atlas.save('holo_walls.png')
print('holo_walls.png', atlas.size)
print(f'const WALL_ATLAS = {list(atlas.size)}, WALL_CELLS = {cells};   // x, y from the top, width, height of each sign')
