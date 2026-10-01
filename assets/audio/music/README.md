# Music

Put the music library here: the radio plays these once the radio station is built.

- Formats: .mp3 (best supported), .ogg, .m4a, .wav, .flac, .webm, .opus
- The song name shown on the cassette comes from the file name: `Night Market.mp3` shows as "Night Market"
  (a leading track number like `02 - ` is dropped, underscores become spaces).
- On GitHub Pages the game lists this folder by itself, so adding files and pushing is all it takes.
- To set nicer titles (or for running the game somewhere other than GitHub Pages), run
  `python3 tools/make_playlist.py` from the repo root: it writes `playlist.json` here, and you can edit the titles.

Big files: GitHub won't take a single file over 100 MB, and warns above 50 MB. A Pages site should stay under
1 GB in total, so prefer .mp3 or .ogg at around 128 to 192 kbps.
