# The itch.io build

`python3 tools/itch/build.py` makes `build/neon-terrarium-itch.zip`, ready to upload to itch.io as an HTML game (`build/` is not kept in git).

What it does (details at the top of `build.py`):
- copies only what the game loads (the repository itself is over itch's 1,000-file limit)
- encodes the music smaller: MP3 at 128 kbps, the coast's Opus at 96 kbps, cover art dropped (cached in `build/itch-cache`, so rebuilds are quick)
- ships three.js with the game (`vendor/`) instead of loading it from a CDN
- turns off the dev page (`#dev`)
- checks itch's limits, and that every file the pages ask for is in the build

Needs git, ffmpeg (with libmp3lame and libopus) and npm.

On itch: Kind of project HTML, upload the zip, tick "This file will be played in the browser"; Embed: click to launch in fullscreen; Mobile friendly on; Click to Play on.
