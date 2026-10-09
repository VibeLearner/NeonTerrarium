# Sample credits

Every file in `samples/pack/` is a single note or a single hit cut from one of the libraries below. All of them are released under **CC0 1.0 Universal** (public domain); the license file of each library is copied to `samples/licenses/`. CC0 does not require credit; it is given anyway.

| Library | By | Source | License | Commit | Used in |
| --- | --- | --- | --- | --- | --- |
| Big Rusty Drums | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.big-rusty-drums | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `f07ce00df3` | `kit_jazz`, `kit_tight` |
| Fashionbass | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.fashionbass | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `0703973b30` | `bass_fashion` |
| Black And Green Guitars (green Gretsch) | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.black-and-green-guitars | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `b3b3249d37` | `gtr_green` |
| Meatbass | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.meatbass | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `ac9e859564` | `bass_double` |
| Unruly Drums | Karoryfer Samples | https://github.com/sfzinstruments/karoryfer.unruly-drums | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `9bf75c2a13` | `kit_jazz`, `kit_tight` |
| Versilian Community Sample Library (VCSL) | Versilian Studios, S. Gossner | https://github.com/sgossner/VCSL | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `c1ea7bcc3c` | `fmpiano`, `glock`, `kalimba`, `marimba`, `upright`, `vibes` |

## Every file

Each shipped file, its original path inside the library and its source, are listed in `manifest.json` under `files` (library, source URL at the pinned commit, original path, license). `check_licenses.py` fails if a shipped file is missing from that list or has no CC0 source.

## Not used on purpose

- jRhodes3 (sfzinstruments `jlearman.jRhodes3d`): CC BY-NC when shipped inside software, so it cannot go in a published game.
- Virtuosity Drums (Versilian Studios): no CC0 source could be verified, so the jazz kit uses Unruly Drums brush and soft-layer samples instead.
- Freesound files, general MIDI soundfonts and anything AI-generated: not allowed by the sample rules.
