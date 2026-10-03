# Builds assets/sprites/holo_robo_tall.png and holo_pureflow_tall.png from the 512x384 originals (holo_robo.png,
# holo_pureflow.png in the same folder). Each output is an atlas of five portrait versions of the ad, 512 px wide,
# so a wall hologram can run the height of a building without stretching the picture (see wallHologram in
# js/buildings.js, which must agree with the layout below).
# Nothing is scaled. Each ad is cut into the parts that matter (frame, lettering, picture), kept at their true
# size, and the extra height is filled by repeating the plain rows in the gaps between them.
# Atlas layout: two columns of 512 px,
#   column 0: aspect 4.2 (2150 px) at y 0, then aspect 2.1 (1075 px) at y 2150
#   column 1: aspect 3.0 (1536 px) at y 0, then 1.5 (768 px) at y 1536, then 1.05 (538 px) at y 2304
from PIL import Image
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sprites'))
W = 512
CELLS = [(0, 0, 2150), (0, 2150, 1075), (512, 0, 1536), (512, 1536, 768), (512, 2304, 538)]   # x, y, height
# Gaps that can grow: (first row, last row, share of the extra height), rows counted in the 512x384 original
GAPS = {
    'robo':     [(81, 86, .40), (229, 236, .25), (292, 299, .10), (321, 327, .25)],
    'pureflow': [(95, 115, .40), (255, 274, .40), (321, 331, .20)],
}

def tall(src, gaps, h):
    extra = h - src.height
    total = sum(g[2] for g in gaps)
    out = Image.new('RGB', (W, h), (0, 0, 0))
    y = 0; row = 0; given = 0
    for k, (a, b, wt) in enumerate(gaps):
        out.paste(src.crop((0, row, W, a)), (0, y)); y += a - row; row = a   # the part before the gap, at true size
        n = round(extra*wt/total) if k < len(gaps) - 1 else extra - given     # rows this gap grows by
        n += b - a + 1; given += n - (b - a + 1)
        for i in range(n):                                                      # the gap's own rows, repeated
            out.paste(src.crop((0, a + i % (b - a + 1), W, a + i % (b - a + 1) + 1)), (0, y + i))
        y += n; row = b + 1
    out.paste(src.crop((0, row, W, src.height)), (0, y))
    return out

for ad, gaps in GAPS.items():
    src = Image.open(f'holo_{ad}.png').convert('RGB')
    atlas = Image.new('RGB', (1024, 3225), (0, 0, 0))
    for (x, y, h) in CELLS:
        atlas.paste(tall(src, gaps, h), (x, y))
    atlas.save(f'holo_{ad}_tall.png'); print(f'holo_{ad}_tall.png', atlas.size)
