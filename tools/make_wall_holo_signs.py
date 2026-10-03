# Builds the wall-hologram signs in assets/sprites (see wallHologram in js/buildings.js): holo_sushi.png and
# holo_repair.png, from the tall pictures in assets/sprites/originals/ (holo_sushi.webp, holo_repair.webp).
# Each is cropped to the sign and put on black with a 12 px margin (the hologram is additive, so black is see-through,
# and the shader fades the very edge of a picture). The signs are already tall, so the hologram just scales them.
# After changing a picture, update WALL_ASPECT in js/buildings.js (height over width of the output, printed below).
from PIL import Image
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites'))
for name in ['sushi', 'repair']:
    src = Image.open(f'originals/holo_{name}.webp').convert('RGBA')
    src = src.crop(src.getchannel('A').getbbox())
    out = Image.new('RGB', (src.width + 24, src.height + 24), (0, 0, 0)); out.paste(src, (12, 12), src)
    out.save(f'holo_{name}.png'); print(f'holo_{name}.png', out.size, 'aspect', round(out.height/out.width, 3))
