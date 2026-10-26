#!/usr/bin/env python3
"""Coast flash sound for the trailer: waves and shorebirds, made entirely in code.

No samples and no AI audio: every sound here is noise and sine waves shaped by hand.
Writes assets/audio/trailer/coast_flash.wav, a short stereo clip that starts at
CLIP_START seconds into the trailer (the trailer player and the recorder both line it
up from there). The window matches the lull in Bytes: the track drops out at 19.2 s
and the drop lands at 21.72 s.

    python3 tools/trailer/make_coast_sfx.py            # writes the clip
    python3 tools/trailer/make_coast_sfx.py --preview  # also mixes it over Bytes (0-45 s) for a listen
"""
import os, sys, subprocess
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
CLIP_START = 19.0      # trailer seconds where the clip begins
FLASH_IN = 19.2        # the cut to the coast (music drops out)
FLASH_OUT = 21.72      # the drop (back to the city)
CLIP_END = 21.9
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'audio', 'trailer', 'coast_flash.wav')

rng = np.random.default_rng(1926)
N = int((CLIP_END - CLIP_START)*SR)
t = np.arange(N)/SR + CLIP_START          # trailer time of each sample


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def pink(n):
    """Pink-ish noise (1/f) by shaping white noise in the frequency domain."""
    w = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1/SR); f[0] = f[1]
    x = np.fft.irfft(w/np.sqrt(f), n)
    return x/np.abs(x).max()


def env(a, b, rise, fall):
    """0 before a, ramps up over `rise`, holds, ramps down to 0 at b over `fall` (smoothstep)."""
    up = np.clip((t - a)/rise, 0, 1); dn = np.clip((b - t)/fall, 0, 1)
    s = lambda u: u*u*(3 - 2*u)
    return s(up)*s(dn)


def pan(mono, p):
    """Equal-power pan, p from -1 (left) to 1 (right)."""
    a = (p + 1)*np.pi/4
    return np.stack([mono*np.cos(a), mono*np.sin(a)], 1)


def room(x, secs=1.1, mix=.25):
    """A soft outdoor tail: convolve with decaying noise (open air, a little cliff echo)."""
    n = int(secs*SR); k = rng.standard_normal(n)*np.exp(-np.arange(n)/SR*5.5)
    k = lp(k, 5000); k /= np.sqrt((k**2).sum())
    wet = fftconvolve(x, k)[:len(x)]
    return x*(1 - mix) + wet*mix


# ---------- the sea ----------
def sea_channel(seed_shift):
    n = N
    bed = lp(hp(pink(n), 70), 1100)                       # far surf, a steady low roar
    swell = .55 + .45*np.sin(2*np.pi*(t - 19.0)/3.4 + seed_shift)   # breathing of the bed
    bed *= swell

    # one wave breaks just after the cut: a rush of noise whose brightness opens up, then the wash
    crash_t = 19.42
    u = t - crash_t
    crash_env = np.where(u < 0, np.exp(u*9), np.exp(-u*1.25))*(u > -.6)
    raw = pink(n)
    lo_part = lp(raw, 700)                                  # the body of the wave
    hi_part = bp(raw, 1800, 7000)                           # the white water
    bright = np.clip((u + .25)/.45, 0, 1)                   # the hiss opens a beat after the thump
    crash = lo_part*crash_env*1.2 + hi_part*crash_env*bright*.9

    # foam fizz: sparse tiny bubble pops on top of a high hiss, thinning out
    fizz = hp(rng.standard_normal(n), 3500)*.18
    pops = np.zeros(n)
    for _ in range(420):
        at = rng.uniform(19.55, 21.7); i = int((at - CLIP_START)*SR)
        if i < n - 400: pops[i] = rng.uniform(.2, 1)*rng.choice([-1, 1])
    pops = bp(pops, 2500, 9000)*3
    foam_env = np.where(u < .3, 0, np.exp(-(u - .3)*1.1))
    foam = (fizz + pops)*foam_env

    # the backwash: a soft rising sigh as the water slides back toward the end of the window
    back = bp(pink(n), 900, 4000)*env(20.6, 21.75, .7, .25)*.45
    return bed*.55 + crash + foam + back


sea = np.stack([sea_channel(0), sea_channel(1.3)], 1)
sea = np.stack([room(sea[:, 0], 1.4, .2), room(sea[:, 1], 1.4, .2)], 1)


# ---------- shorebirds ----------
def peep(at, f0, dur, rise=1.18, fall=.9):
    """A plover / sandpiper peep: a short bright whistle that lifts then drops."""
    n = int(dur*SR); x = np.arange(n)/SR; u = x/dur
    f = f0*np.where(u < .35, 1 + (rise - 1)*(u/.35), rise - (rise - fall)*((u - .35)/.65))
    ph = 2*np.pi*np.cumsum(f)/SR
    a = np.sin(np.pi*u)**1.6
    s = (np.sin(ph) + .12*np.sin(2*ph))*a
    out = np.zeros(N); i = int((at - CLIP_START)*SR); out[i:i + n] = s[:max(0, min(n, N - i))]
    return out


def gull(at, dur=.42, f_hi=1150, f_lo=720, level=1.):
    """A distant gull 'kyow': a harsh, gliding, slightly wobbly cry through a throat formant."""
    n = int(dur*SR); x = np.arange(n)/SR; u = x/dur
    f = f_lo + (f_hi - f_lo)*(1 - u)**1.4 + 18*np.sin(2*np.pi*23*x)   # glide down with a wobble
    f = np.where(u < .08, f_lo*1.05 + (f_hi - f_lo*1.05)*(u/.08), f)  # a quick scoop up at the start
    ph = 2*np.pi*np.cumsum(f)/SR
    saw = sum(np.sin(k*ph)/k for k in range(1, 14))                   # harmonic-rich voice
    rough = 1 + .25*rng.standard_normal(n)                            # throat rasp
    s = saw*rough*np.sin(np.pi*np.clip(u*1.15, 0, 1))**.7
    s = bp(s, 1300, 3200) + .4*bp(s, 650, 1100)                       # formants
    out = np.zeros(N); i = int((at - CLIP_START)*SR); out[i:i + n] = s[:max(0, min(n, N - i))]
    return out/np.abs(out).max()*level


birds_l = np.zeros(N); birds_r = np.zeros(N)
# small flock of peeps on the shoreline (right side), a couple answering on the left
for at, f0, side in [(19.48, 3900, .6), (19.6, 4150, .65), (19.71, 3800, .55),
                     (20.18, 4400, -.5), (20.29, 4250, -.45),
                     (20.85, 3950, .7), (20.95, 4200, .7), (21.06, 4050, .62), (21.3, 4500, -.3)]:
    s = peep(at, f0, rng.uniform(.06, .095))*rng.uniform(.5, .8)
    st = pan(s, side); birds_l += st[:, 0]; birds_r += st[:, 1]
# a gull far off over the water, then a shorter second call
for at, dur, hi, lo, lvl, side in [(19.86, .44, 1150, 720, .5, -.25), (20.55, .3, 1080, 780, .38, -.35)]:
    s = gull(at, dur, hi, lo, lvl)
    st = pan(s, side); birds_l += st[:, 0]; birds_r += st[:, 1]
birds = np.stack([room(birds_l, 1.0, .3), room(birds_r, 1.0, .3)], 1)

# ---------- mix ----------
mix = sea*.42 + birds*.32
window = env(FLASH_IN - .02, FLASH_OUT + .02, .1, .12)     # hard-ish cut in, quick tuck under the drop
mix *= window[:, None]
peak = np.abs(mix).max()
mix = mix/peak*10**(-3/20)                                  # peak at -3 dBFS; level is set in the mixer
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wavfile.write(OUT, SR, (mix*32767).astype(np.int16))
print('wrote', os.path.relpath(OUT, ROOT), f'{N/SR:.2f}s, starts at {CLIP_START}s')

if '--preview' in sys.argv:
    out = os.path.join(os.path.dirname(OUT), 'coast_flash_preview.mp3')
    music = os.path.join(ROOT, 'assets', 'audio', 'music', 'Bytes.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-t', '45', '-i', music, '-i', OUT, '-filter_complex',
                    f'[1:a]adelay={int(CLIP_START*1000)}|{int(CLIP_START*1000)},volume=0.9[s];'
                    '[0:a][s]amix=inputs=2:normalize=0,afade=t=out:st=43.2:d=1.8[a]',
                    '-map', '[a]', '-b:a', '256k', out], check=True)
    print('preview', os.path.relpath(out, ROOT))
