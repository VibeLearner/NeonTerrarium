#!/usr/bin/env python3
"""Sample pack builder for the jam room.

Downloads ONLY the chosen single-note and single-hit samples from CC0 libraries (sparse checkouts of pinned commits, never the
full libraries), trims silence, cuts tails, normalizes, resamples to 48 kHz and encodes Ogg Opus. Writes:
    pack/<group>/*.opus      the encoded pack (committed)
    manifest.json            instruments, notes, velocity layers, round robins, lengths, plus a source and license for every file
    CREDITS.md               library, URL, license for each source
    licenses/<lib>.txt       a copy of each library's license file
The source libraries go in $JAM_SRC (default samples/_src, ignored by git). Same sources + same tools = same output.

    python3 samples/build.py            build everything
    python3 samples/build.py --only kit_tight,fmpiano
Needs: git, ffmpeg (libopus), python3 with numpy, scipy, soundfile.
"""
import os, re, sys, json, math, glob, shutil, hashlib, subprocess, argparse
import numpy as np, soundfile as sf
from scipy.signal import resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get('JAM_SRC', os.path.join(HERE, '_src'))
PACK = os.path.join(HERE, 'pack')
SR = 48000
CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'

# ---- the libraries (commit pins are filled in by the first build; a pin makes the build repeatable)
LIBS = {
    'unruly':   dict(name='Unruly Drums', by='Karoryfer Samples', url='https://github.com/sfzinstruments/karoryfer.unruly-drums', lic='LICENSE'),
    'bigrusty': dict(name='Big Rusty Drums', by='Karoryfer Samples', url='https://github.com/sfzinstruments/karoryfer.big-rusty-drums', lic='LICENSE'),
    'greens':   dict(name='Black And Green Guitars (green Gretsch)', by='Karoryfer Samples', url='https://github.com/sfzinstruments/karoryfer.black-and-green-guitars', lic='LICENSE'),
    'fashion':  dict(name='Fashionbass', by='Karoryfer Samples', url='https://github.com/sfzinstruments/karoryfer.fashionbass', lic='LICENSE'),
    'meat':     dict(name='Meatbass', by='Karoryfer Samples', url='https://github.com/sfzinstruments/karoryfer.meatbass', lic='LICENSE'),
    'vcsl':     dict(name='Versilian Community Sample Library (VCSL)', by='Versilian Studios, S. Gossner', url='https://github.com/sgossner/VCSL', lic='LICENSE'),
}
PINS = {}   # filled from pins.json
PINFILE = os.path.join(HERE, 'pins.json')
if os.path.exists(PINFILE): PINS = json.load(open(PINFILE))

# ---- what to take. Each hit/note group: lib, a regex over the repo path, how many velocity layers and round robins, length cap, level.
# 'vl' / 'rr' / 'note' are captured from the file name. Velocity layers are picked evenly from what exists.
def H(lib, rx, vl, rr, maxlen, peak, fade=0.12, kbps=48, stereo=False, vlgroup=None):
    return dict(lib=lib, rx=rx, vl=vl, rr=rr, maxlen=maxlen, peak=peak, fade=fade, kbps=kbps, stereo=stereo, vlgroup=vlgroup)

KITS = {
    # tight kit: drum and bass, pop punk. Unruly kick, snare, hats; Big Rusty ride, crash and toms.
    'kit_tight': dict(kind='kit', hits={
        'kick':    H('unruly', r'^Samples/k20/in/rr\d+/kick_clean_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 4, 2, 0.70, -2),
        'snare':   H('unruly', r'^Samples/s14/top/rr\d+/s14_center_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 4, 3, 0.55, -2),
        'rim':     H('unruly', r'^Samples/s14/top/rr\d+/s14_rimshot_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 0.45, -3),
        'hat':     H('unruly', r'^Samples/h14/cl/rr\d+/hh_closed_tip_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 3, 2, 0.22, -9, fade=0.05),
        'hatOpen': H('unruly', r'^Samples/h14/cl/rr\d+/hh_open_tip_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 0.90, -9, fade=0.3),
        'ride':    H('bigrusty', r'^Samples/ride_22/rd/cl/rd_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 3, 2, 1.8, -9, fade=0.6),
        'crash':   H('bigrusty', r'^Samples/crash_17/cr/oh/cr_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 1, 2.6, -8, fade=1.0),
        'tomHi':   H('bigrusty', r'^Samples/tom_14/center/cl/t14_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 3, 2, 0.8, -4),
        'tomMid':  H('bigrusty', r'^Samples/tom_18/center/cl/t18_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 3, 2, 0.9, -4),
        'tomLo':   H('bigrusty', r'^Samples/tom_22/center/cl/t22_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 3, 2, 1.0, -4),
    }),
    # jazz kit: soft layers, brush hats, side stick, a ridable ride (Unruly only; the Virtuosity kit has no verifiable CC0 source)
    'kit_jazz': dict(kind='kit', hits={
        'kick':    H('unruly', r'^Samples/k20/in/rr\d+/kick_clean_vl(?P<vl>[123])_rr(?P<rr>\d+)\.flac$', 3, 2, 0.8, -5),
        'snare':   H('unruly', r'^Samples/s14/top/rr\d+/s14_center_vl(?P<vl>[123])_rr(?P<rr>\d+)\.flac$', 3, 3, 0.5, -5),
        'rim':     H('unruly', r'^Samples/s14/top/rr\d+/s14_sstick_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 0.4, -4),
        'hat':     H('unruly', r'^Samples/h14/cl/rr\d+/hh_closed_brush_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 3, 2, 0.25, -11, fade=0.08),
        'hatOpen': H('unruly', r'^Samples/h14/cl/rr\d+/hh_open_brush_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 0.9, -11, fade=0.3),
        'ride':    H('unruly', r'^Samples/r20/cl/rr\d+/ride_bow_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 4, 2, 2.0, -9, fade=0.7),
        'crash':   H('unruly', r'^Samples/c16/oh/rr\d+/cr_brush_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 1, 2.4, -10, fade=1.0),
        'tomHi':   H('bigrusty', r'^Samples/tom_14/brush/cl/[^/]*_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 0.8, -7),
        'tomMid':  H('bigrusty', r'^Samples/tom_18/brush/cl/[^/]*_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 0.9, -7),
        'tomLo':   H('bigrusty', r'^Samples/tom_22/brush/cl/[^/]*_vl(?P<vl>\d+)_rr(?P<rr>\d+)\.flac$', 2, 2, 1.0, -7),
    }),
}
# pitched instruments: every NSTEP semitones inside [lo, hi] from the notes a library actually has
def P(lib, rx, step, lo, hi, vl, rr, maxlen, peak=-3, fade=0.25, kbps=56, vlmap=None, octave_hint=None):
    return dict(lib=lib, rx=rx, step=step, lo=lo, hi=hi, vl=vl, rr=rr, maxlen=maxlen, peak=peak, fade=fade, kbps=kbps, vlmap=vlmap, stereo=False)
NOTE = r'(?P<note>[a-gA-G][b#]?)(?P<oct>\d)'
PITCHED = {
    'gtr_green': dict(kind='pitched', arts={
        'stac':   P('greens', r'^Samples/green/stac/staccato_' + NOTE + r'_rr(?P<rr>\d+)\.wav$', 2, 52, 100, 1, 2, 0.9),
        'twang':  P('greens', r'^Samples/green/ord/twang_' + NOTE + r'_(?P<dyn>p|mf|f)_rr(?P<rr>\d+)\.wav$', 2, 52, 100, 3, 2, 1.2, vlmap={'p': 1, 'mf': 2, 'f': 3}),
        'hammer': P('greens', r'^Samples/green/hammer/hammer_' + NOTE + r'_rr(?P<rr>\d+)\.wav$', 2, 52, 100, 1, 2, 1.0),
    }),
    'fmpiano': dict(kind='pitched', arts={
        'main': P('vcsl', r'^Electrophones/TX81Z/FM Piano/FMPiano_(?P<note>[A-G]#?)(?P<oct>\d)_vl(?P<vl>\d)\.wav$', 1, 36, 96, 3, 1, 2.4, peak=-4, fade=0.8),
    }),
    'bass_fashion': dict(kind='pitched', arts={
        'main': P('fashion', r'^notes/(?P<note>[a-g]b?)(?P<oct>\d)_(?P<dyn>p|mf|ff)_rr(?P<rr>\d+)\.wav$', 1, 24, 60, 3, 2, 1.6, peak=-3, fade=0.5, vlmap={'p': 1, 'mf': 2, 'ff': 3}),
    }),
    'bass_double': dict(kind='pitched', arts={
        'main': P('meat', r'^Samples/pizz/(?P<note>[a-g]b?)(?P<oct>\d)_vl(?P<vl>\d)_rr(?P<rr>\d+)\.wav$', 1, 24, 60, 3, 2, 1.8, peak=-3, fade=0.6),
    }),
    'vibes': dict(kind='pitched', arts={
        'main': P('vcsl', r'^Idiophones/Struck Idiophones/Vibraphone/Soft Mallets/Vibes_soft_(?P<note>[A-G]#?)(?P<oct>\d)_v(?P<vl>\d)_rr(?P<rr>\d+)_Main\.wav$', 1, 48, 100, 2, 1, 3.0, fade=1.2),
    }),
    'glock': dict(kind='pitched', arts={
        'main': P('vcsl', r'^Idiophones/Struck Idiophones/Glockenspiel/glock_(?P<dyn>loud|soft)_(?P<note>[A-G]#?)(?P<oct>\d)_(?P<rr>\d+)\.wav$', 1, 72, 110, 1, 1, 2.2, fade=0.9, vlmap={'loud': 1, 'soft': 1}),
    }),
    'marimba': dict(kind='pitched', arts={
        'main': P('vcsl', r'^Idiophones/Struck Idiophones/Marimba/Marimba_hit_Outrigger_(?P<note>[A-G]#?)(?P<oct>\d)_(?P<dyn>soft|med|loud)_(?P<rr>\d+)\.wav$', 1, 40, 100, 3, 1, 1.6, fade=0.6, vlmap={'soft': 1, 'med': 2, 'loud': 3}),
    }),
    'kalimba': dict(kind='pitched', arts={
        'main': P('vcsl', r'^Idiophones/Plucked Idiophones/Kalimba, Tanzania/MBira3_pluck_Main_(?P<note>[A-G]#?)(?P<oct>\d)_k\d+_50_100_rr(?P<rr>\d+)\.wav$', 1, 36, 100, 1, 1, 1.8, fade=0.7),
    }),
    'upright': dict(kind='pitched', arts={
        'main': P('vcsl', r'^Chordophones/Zithers/Upright Piano, Yamaha/Sustains/Upright1_Sus_(?P<note>[A-G]#?)(?P<oct>\d)_vl(?P<vl>\d)_rr(?P<rr>\d+)\.wav$', 3, 36, 100, 2, 1, 2.6, peak=-4, fade=1.0),
    }),
}
ALL = {}; ALL.update(KITS); ALL.update(PITCHED)

PC = {'c': 0, 'c#': 1, 'db': 1, 'd': 2, 'd#': 3, 'eb': 3, 'e': 4, 'f': 5, 'f#': 6, 'gb': 6, 'g': 7, 'g#': 8, 'ab': 8, 'a': 9, 'a#': 10, 'bb': 10, 'b': 11}

def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout

def repo_dir(lib): return os.path.join(SRC, lib)

def ensure_repo(lib):
    d = repo_dir(lib)
    if not os.path.isdir(os.path.join(d, '.git')):
        os.makedirs(SRC, exist_ok=True)
        sh(['git', 'clone', '-q', '--filter=blob:none', '--no-checkout', LIBS[lib]['url'] + '.git', d])
    commit = PINS.get(lib) or sh(['git', '-C', d, 'rev-parse', 'HEAD']).strip()
    return commit

def tree(lib, commit):
    out = sh(['git', '-C', repo_dir(lib), 'ls-tree', '-r', '--name-only', commit])
    return [l for l in out.split('\n') if l]

def fetch(lib, commit, paths):
    """check out only these paths (git fetches just those blobs)"""
    d = repo_dir(lib)
    for p in paths:                                  # a checkout that was cut short can leave an empty file behind
        fp = os.path.join(d, p)
        if os.path.exists(fp) and os.path.getsize(fp) == 0: os.remove(fp)
    todo = [p for p in paths if not os.path.exists(os.path.join(d, p))]
    for i in range(0, len(todo), 200):
        chunk = todo[i:i + 200]
        subprocess.run(['git', '-C', d, 'checkout', commit, '--pathspec-from-file=-', '--pathspec-file-nul', '-q'], input='\0'.join(chunk) + '\0', text=True, check=True, capture_output=True)
    for p in paths:
        fp = os.path.join(d, p)
        if not os.path.exists(fp) or os.path.getsize(fp) == 0:
            if os.path.exists(fp): os.remove(fp)
            subprocess.run(['git', '-C', d, 'checkout', commit, '-q', '--', p], check=True, capture_output=True)
            assert os.path.getsize(fp) > 0, 'could not fetch ' + p

def pick_even(vals, k):
    vals = sorted(vals)
    if k >= len(vals): return vals
    if k == 1: return [vals[len(vals) // 2]]
    return sorted(set(vals[round(i * (len(vals) - 1) / (k - 1))] for i in range(k)))

def midi_of(note, octv, hint):
    return PC[note.lower()] + 12 * (int(octv) + 1) + hint

# ---- audio
def read_mono(path, stereo=False):
    x, sr = sf.read(path, always_2d=True, dtype='float32')
    x = x.mean(axis=1) if not stereo else x
    if sr != SR:
        g = math.gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0).astype('float32')
    return x

def trim_head(x, pre=0.0015, floor_db=-48):
    m = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=1)
    pk = m.max()
    if pk <= 0: return x
    idx = np.argmax(m > pk * 10 ** (floor_db / 20))
    return x[max(0, idx - int(pre * SR)):]

def cut_tail(x, maxlen, fade):
    n = int(maxlen * SR)
    x = x[:n].copy()
    f = min(int(fade * SR), len(x))
    if f > 0:
        t = np.linspace(0, 1, f, dtype='float32')
        w = np.cos(t * math.pi / 2) ** 2
        x[-f:] *= w if x.ndim == 1 else w[:, None]
    # a few samples of fade-in so the file never starts on a click
    a = min(24, len(x)); x[:a] *= (np.linspace(0, 1, a, dtype='float32') if x.ndim == 1 else np.linspace(0, 1, a, dtype='float32')[:, None])
    return x

def f0_midi(x):
    """rough pitch (MIDI float) by autocorrelation over the first 0.6 s after the attack; used only to check octave naming and tune"""
    seg = x[int(0.03 * SR):int(0.63 * SR)]
    if len(seg) < 4000: return None
    seg = seg - seg.mean()
    n = len(seg); f = np.fft.rfft(seg, 2 * n); ac = np.fft.irfft(f * np.conj(f))[:n]
    lo, hi = int(SR / 2200), int(SR / 28)
    ac = ac / (ac[0] + 1e-9)
    k = lo + int(np.argmax(ac[lo:hi]))
    # prefer the first strong peak (avoid sub-octave picks)
    for j in range(lo + 2, hi):
        if ac[j] > 0.8 * ac[k] and ac[j] >= ac[j - 1] and ac[j] >= ac[j + 1]: k = j; break
    if k <= lo or k >= hi - 1: return None
    a, b, c = ac[k - 1], ac[k], ac[k + 1]
    d = (a - c) / (2 * (a - 2 * b + c) + 1e-12)
    return 69 + 12 * math.log2(SR / (k + d) / 440)

def tune_cents(x, named):
    """how many cents the sample is above its equal-tempered name: spectral peaks near the first partials, with the name as the prior"""
    seg = x[int(0.04 * SR):int(1.3 * SR)]
    if len(seg) < int(0.3 * SR): return None
    seg = (seg - seg.mean()) * np.hanning(len(seg))
    N = 1 << 20
    mag = np.abs(np.fft.rfft(seg, N)); df = SR / N
    f_named = 440 * 2 ** ((named - 69) / 12)
    num = den = 0.0; top = 0.0
    found = []
    for h in (1, 2, 3):
        lo, hi = h * f_named * 2 ** (-70 / 1200), h * f_named * 2 ** (70 / 1200)
        i0, i1 = int(lo / df), int(hi / df) + 1
        if i1 >= len(mag) - 2 or i1 <= i0 + 3: continue
        k = i0 + int(np.argmax(mag[i0:i1]))
        if k <= i0 or k >= i1 - 1: continue
        a_, b_, c_ = np.log(mag[k - 1] + 1e-12), np.log(mag[k] + 1e-12), np.log(mag[k + 1] + 1e-12)
        d = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-12)
        f = (k + d) * df
        found.append((mag[k], 1200 * math.log2(f / (h * f_named))))
    if not found: return None
    top = max(m for m, _ in found)
    good = [(m, c) for m, c in found if m > 0.25 * top]
    return sum(m * c for m, c in good) / sum(m for m, _ in good)

def encode(x, path, kbps):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp.wav'
    sf.write(tmp, x, SR, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'libopus', '-b:a', f'{kbps}k', '-vbr', 'on', '-application', 'audio', '-ar', str(SR), path], check=True)
    os.remove(tmp)

def db(x): return 20 * math.log10(max(x, 1e-9))

# ---- build
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--only', default=''); ap.add_argument('--keep', action='store_true')
    a = ap.parse_args()
    only = [s for s in a.only.split(',') if s]
    todo = {k: v for k, v in ALL.items() if not only or k in only}
    commits = {}
    for lib in sorted({h['lib'] for v in todo.values() for h in (v['hits'].values() if v['kind'] == 'kit' else v['arts'].values())}):
        commits[lib] = ensure_repo(lib)
    if not PINS or any(l not in PINS for l in commits):
        PINS.update(commits); json.dump(PINS, open(PINFILE, 'w'), indent=1, sort_keys=True)
    trees = {lib: tree(lib, commits[lib]) for lib in commits}
    manifest_path = os.path.join(HERE, 'manifest.json')
    man = json.load(open(manifest_path)) if os.path.exists(manifest_path) and only else {'version': 1, 'sr': SR, 'instruments': {}, 'files': {}, 'libraries': {}}
    for lib, c in commits.items():
        L = LIBS[lib]
        man['libraries'][lib] = dict(name=L['name'], by=L['by'], url=L['url'], commit=c, license='CC0-1.0', license_url=CC0_URL, license_file='licenses/%s.txt' % lib)
        os.makedirs(os.path.join(HERE, 'licenses'), exist_ok=True)
        fetch(lib, c, [L['lic']])
        shutil.copy(os.path.join(repo_dir(lib), L['lic']), os.path.join(HERE, 'licenses', lib + '.txt'))
        head = open(os.path.join(HERE, 'licenses', lib + '.txt')).read(400)
        assert 'CC0 1.0' in head, 'license file of %s is not CC0 1.0' % lib

    for name, spec in todo.items():
        outdir = os.path.join(PACK, name)
        if os.path.isdir(outdir): shutil.rmtree(outdir)
        for fk in [k for k, v in man['files'].items() if v.get('group') == name]: del man['files'][fk]
        groups = spec['hits'] if spec['kind'] == 'kit' else spec['arts']
        inst = {'kind': spec['kind'], 'hits' if spec['kind'] == 'kit' else 'arts': {}}
        # pass 1: pick the files and read them
        staged = {}
        for gk, g in groups.items():
            lib = g['lib']; rx = re.compile(g['rx'])
            cand = []
            for p in trees[lib]:
                m = rx.match(p)
                if not m: continue
                d = m.groupdict()
                cand.append((p, d))
            if not cand: sys.exit('no files for %s.%s (%s)' % (name, gk, g['rx']))
            if spec['kind'] == 'kit':
                vls = sorted({int(d['vl']) for p, d in cand}); rrs = sorted({int(d['rr']) for p, d in cand})
                useV = pick_even(vls, g['vl']); useR = rrs[:g['rr']]
                sel = [(p, dict(vl=useV.index(int(d['vl'])) + 1, rr=int(d['rr'])), d) for p, d in cand if int(d['vl']) in useV and int(d['rr']) in useR]
            else:
                hint = 0
                notes = {}
                for p, d in cand:
                    mm = midi_of(d['note'], d['oct'], 0)
                    notes.setdefault(mm, []).append((p, d))
                sel = []
                avail = sorted(notes)
                sel = [(p, d, d) for m in avail for p, d in notes[m]]
            staged[gk] = (g, sel)
        # pass 2: figure out the octave offset of pitched libraries by listening for the pitch, then choose notes
        for gk, (g, sel) in list(staged.items()):
            if isinstance(gk, tuple): continue
            if spec['kind'] != 'pitched': continue
            lib = g['lib']
            mid = [t for t in sel if 48 <= midi_of(t[2]['note'], t[2]['oct'], 0) <= 84] or sel
            probes = mid[:: max(1, len(mid) // 8)][:8]
            fetch(lib, commits[lib], [p for p, _, _ in probes])
            offs = []
            for p, _, d in probes:
                x = read_mono(os.path.join(repo_dir(lib), p))
                f = f0_midi(x)
                if f is None: continue
                named = midi_of(d['note'], d['oct'], 0)
                offs.append(round((f - named) / 12) * 12)
            hint = max(set(offs), key=offs.count) if offs else 0
            g['_hint'] = hint
            print('  %s.%s octave offset vs file names: %+d semitones (from %d probes)' % (name, gk, hint, len(offs)))
            by = {}
            for p, _, d in sel:
                by.setdefault(midi_of(d['note'], d['oct'], hint), []).append((p, d))
            avail = sorted(by)
            inrange = [m for m in avail if g['lo'] <= m <= g['hi']]
            keep = []
            last = None
            for m in inrange:
                if last is None or m - last >= g['step']: keep.append(m); last = m
            chosen = []
            for m in keep:
                items = by[m]
                vkey = lambda d: (g['vlmap'][d['dyn']] if g['vlmap'] else int(d.get('vl', 1)))
                vls = sorted({vkey(d) for p, d in items}); useV = pick_even(vls, g['vl']) if not g['vlmap'] else sorted(vls)[:g['vl']] if len(vls) <= g['vl'] else pick_even(vls, g['vl'])
                for v in useV:
                    here = sorted(((int(d.get('rr', 1) or 1), p, d) for p, d in items if vkey(d) == v), key=lambda t: (t[0], t[1]))
                    seen = []
                    for rr, p, d in here:
                        if rr in seen: continue
                        seen.append(rr)
                        if len(seen) > g['rr']: break
                        chosen.append((p, dict(note=m, vl=useV.index(v) + 1, rr=len(seen)), d))
            staged[gk] = (g, chosen)
        # pass 3: process and encode
        wavs = {}
        for gk, (g, sel) in staged.items():
            if isinstance(gk, tuple): continue
            fetch(g['lib'], commits[g['lib']], [p for p, _, _ in sel])
            items = []
            for p, key, d in sel:
                x = read_mono(os.path.join(repo_dir(g['lib']), p), stereo=g['stereo'])
                x = trim_head(x)
                pitch = (key['note'] + (tune_cents(x, key['note']) or 0) / 100) if spec['kind'] == 'pitched' and tune_cents(x, key['note']) is not None else None
                x = cut_tail(x, g['maxlen'], g['fade'])
                items.append(dict(p=p, key=key, x=x, pitch=pitch))
            # level: loudest file of the group peaks at g['peak'] dBFS; pitched notes are evened out by loudness of their loudest layer
            if spec['kind'] == 'pitched':
                loud = {}
                for it in items:
                    r = float(np.sqrt(np.mean(it['x'][:int(0.3 * SR)] ** 2)) + 1e-9)
                    loud[it['key']['note']] = max(loud.get(it['key']['note'], 0), r)
                ref = float(np.median(list(loud.values())))
                for it in items: it['x'] = it['x'] * (ref / loud[it['key']['note']])
            pk = max(float(np.abs(it['x']).max()) for it in items)
            gain = 10 ** (g['peak'] / 20) / pk
            if spec['kind'] == 'pitched': gain = min(gain, 10 ** (g['peak'] / 20) / pk)
            for it in items: it['x'] = np.clip(it['x'] * gain, -1, 1)
            wavs[gk] = items
        # write files and the manifest entry
        for gk, items in wavs.items():
            g = staged[gk][0]
            tree_out = {}
            for it in sorted(items, key=lambda i: (i['key'].get('note', 0), i['key']['vl'], i['key']['rr'])):
                k = it['key']
                nm = '%s_%s%s_v%d_r%d.opus' % (gk, '' if 'note' not in k else 'n%d_' % k['note'], '', k['vl'], k['rr'])
                rel = 'pack/%s/%s' % (name, nm)
                encode(it['x'], os.path.join(HERE, rel), g['kbps'])
                dur = round(len(it['x']) / SR, 3)
                h = hashlib.sha256(open(os.path.join(HERE, rel), 'rb').read()).hexdigest()[:16]
                L = man['libraries'][g['lib']]
                man['files'][rel] = dict(group=name, library=g['lib'], source=L['url'] + '/blob/' + L['commit'] + '/' + it['p'].replace(' ', '%20').replace('#', '%23'), original=it['p'], license='CC0-1.0', sha=h, bytes=os.path.getsize(os.path.join(HERE, rel)))
                note = k.get('note'); tune = 0
                if note is not None and it['pitch'] is not None:
                    dev = it['pitch'] - note
                    # only trust a small deviation (within 60 cents); anything else is a pitch-detector octave or fifth mistake
                    tune = round(dev * 100) if abs(dev) < 0.7 else 0
                tree_out.setdefault(note, {}).setdefault(k['vl'], []).append([rel.replace('pack/', '', 1), dur, tune] if note is not None else [rel.replace('pack/', '', 1), dur])
            if spec['kind'] == 'kit':
                layers = []
                for vl in sorted(tree_out[None]):
                    layers.append(dict(rr=tree_out[None][vl]))
                n = len(layers)
                for i, ly in enumerate(layers): ly['max'] = round((i + 1) / n, 4); ly['center'] = round((i + 0.5) / n, 4)
                inst['hits'][gk] = dict(layers=layers, peak=g['peak'])
            else:
                notes = []
                for note in sorted(tree_out):
                    vls = sorted(tree_out[note]); n = len(vls)
                    layers = [dict(max=round((i + 1) / n, 4), center=round((i + 0.5) / n, 4), rr=tree_out[note][vl]) for i, vl in enumerate(vls)]
                    notes.append(dict(midi=note, layers=layers))
                inst['arts'][gk] = dict(notes=notes, maxlen=g['maxlen'])
        if name == 'gtr_green':          # one guitar: take the tuning from the sustained twang notes, which measure cleanly
            ref = {n['midi']: [f[2] for ly in n['layers'] for f in ly['rr']] for n in inst['arts']['twang']['notes']}
            for art in ('stac', 'hammer'):
                for n in inst['arts'][art]['notes']:
                    if n['midi'] in ref:
                        t = int(round(sum(ref[n['midi']]) / len(ref[n['midi']])))
                        for ly in n['layers']:
                            for f in ly['rr']: f[2] = t
        man['instruments'][name] = inst
        size = sum(v['bytes'] for v in man['files'].values() if v['group'] == name)
        cnt = sum(1 for v in man['files'].values() if v['group'] == name)
        print('%-13s %4d files %7.2f MB' % (name, cnt, size / 1e6))
    man['totals'] = {'files': len(man['files']), 'bytes': sum(v['bytes'] for v in man['files'].values())}
    json.dump(man, open(manifest_path, 'w'), separators=(',', ':'), sort_keys=True)
    write_credits(man)
    print('pack total: %d files, %.2f MB' % (man['totals']['files'], man['totals']['bytes'] / 1e6))

def write_credits(man):
    L = ['# Sample credits', '',
         'Every file in `samples/pack/` is a single note or a single hit cut from one of the libraries below. All of them are released under **CC0 1.0 Universal** (public domain); the license file of each library is copied to `samples/licenses/`. CC0 does not require credit; it is given anyway.', '',
         '| Library | By | Source | License | Commit | Used in |', '| --- | --- | --- | --- | --- | --- |']
    used = {}
    for rel, f in man['files'].items(): used.setdefault(f['library'], set()).add(f['group'])
    for lib, v in sorted(man['libraries'].items()):
        L.append('| %s | %s | %s | [CC0 1.0](%s) | `%s` | %s |' % (v['name'], v['by'], v['url'], v['license_url'], v['commit'][:10], ', '.join('`%s`' % g for g in sorted(used.get(lib, [])))))
    L += ['', '## Every file', '', 'Each shipped file, its original path inside the library and its source, are listed in `manifest.json` under `files` (library, source URL at the pinned commit, original path, license). `check_licenses.py` fails if a shipped file is missing from that list or has no CC0 source.', '',
          '## Not used on purpose', '',
          '- jRhodes3 (sfzinstruments `jlearman.jRhodes3d`): CC BY-NC when shipped inside software, so it cannot go in a published game.',
          '- Virtuosity Drums (Versilian Studios): no CC0 source could be verified, so the jazz kit uses Unruly Drums brush and soft-layer samples instead.',
          '- Freesound files, general MIDI soundfonts and anything AI-generated: not allowed by the sample rules.', '']
    open(os.path.join(HERE, 'CREDITS.md'), 'w').write('\n'.join(L))

if __name__ == '__main__':
    main()
