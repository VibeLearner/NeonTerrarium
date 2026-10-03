#!/bin/sh
# Builds the tall wall-hologram atlases holo_robo_tall.png and holo_pureflow_tall.png from the 512x384 originals
# (holo_robo.png, holo_pureflow.png in assets/sprites). Needs ImageMagick built with liquid rescale.
# Each atlas holds five portrait versions of the ad, 512 px wide, made with seam carving (-liquid-rescale) so the
# lettering, the picture and the frame keep their proportions and only the empty space between them grows.
# Layout (must match WALL_ASPECT and the WALL_CELLS table in js/buildings.js): two columns of 512 px,
#   column 0: aspect 4.2 (2150 px) at y 0, then aspect 2.1 (1075 px) at y 2150
#   column 1: aspect 3.0 (1536 px) at y 0, then 1.5 (768 px) at y 1536, then 1.05 (538 px) at y 2304
set -e
cd "$(dirname "$0")/../assets/sprites"
for ad in robo pureflow; do
  convert -size 1024x3225 xc:black \
    \( holo_$ad.png -liquid-rescale 512x2150! \) -geometry +0+0 -composite \
    \( holo_$ad.png -liquid-rescale 512x1075! \) -geometry +0+2150 -composite \
    \( holo_$ad.png -liquid-rescale 512x1536! \) -geometry +512+0 -composite \
    \( holo_$ad.png -liquid-rescale 512x768! \) -geometry +512+1536 -composite \
    \( holo_$ad.png -liquid-rescale 512x538! \) -geometry +512+2304 -composite \
    holo_${ad}_tall.png
  echo "holo_${ad}_tall.png"
done
