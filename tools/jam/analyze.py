#!/usr/bin/env python3
"""
Neon Terrarium jam room, Part A: style analysis of reference songs.

Usage:
    python analyze.py INPUT_DIR [-o OUT_DIR] [--workers N] [--max-seconds S]

Reads every audio file in INPUT_DIR and writes, into OUT_DIR (default: next to this script):
    style_profile.json      per-song and aggregate figures (numbers and distributions only)
    style_defaults.js       a tiny file the jam room page loads to set its defaults
    song_index.local.json   maps the anonymous ids (s01, s02, ...) back to file names (keep this private)

What is stored: tempo, key and mode, chord-color distributions, rhythm feel, energy shape, spectral
character. What is NEVER stored: note sequences, chord sequences, melodies, transcriptions or audio.
Every chord or key estimate is reduced to a distribution before it leaves the analysis function.

Dependencies: pip install librosa numpy scipy soundfile   (ffmpeg is used as a fallback decoder if present)
"""
import argparse
import json
import os
import subprocess
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np

warnings.filterwarnings("ignore")

SR = 22050
HOP = 256            # rhythm analysis hop (about 11.6 ms)
HOP_C = 512          # chroma / energy hop
AUDIO_EXT = (".mp3", ".wav", ".flac", ".ogg", ".oga", ".m4a", ".aac", ".opus", ".webm")
NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
MODE_NAMES = ["Ionian (major)", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian (natural minor)", "Locrian"]
MAJOR_SCALE = np.array([0, 2, 4, 5, 7, 9, 11])

# Triad-ish shapes used only to name a rough chord quality per half-bar, never to store a sequence.
TRIADS = {
    "maj": [0, 4, 7],
    "min": [0, 3, 7],
    "sus2": [0, 2, 7],
    "sus4": [0, 5, 7],
    "dim": [0, 3, 6],
    "power": [0, 7],
}
EXT_PRESENT = 0.5    # an added tone counts as present above this fraction of the chord-tone level (calibrated on synthetic chords)
BAND_EDGES = {"sub": (20, 60), "bass": (60, 250), "low_mid": (250, 500), "mid": (500, 2000),
              "high_mid": (2000, 6000), "air": (6000, 11025)}
METER_LAGS = {5: "5/8", 6: "3/4 or 6/8", 7: "7/8", 8: "4/4", 9: "9/8", 10: "5/4", 12: "6/4 or 12/8", 14: "7/4"}


# ---------------------------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------------------------
def clean(x, nd=3):
    """Turn numpy things into plain JSON numbers."""
    if isinstance(x, dict):
        return {str(k): clean(v, nd) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v, nd) for v in x]
    if isinstance(x, np.ndarray):
        return clean(x.tolist(), nd)
    if isinstance(x, (np.floating, float)):
        return round(float(x), nd) if np.isfinite(x) else None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


def load_audio(path, max_seconds=None):
    import librosa
    try:
        y, _ = librosa.load(path, sr=SR, mono=True, duration=max_seconds)
        if y.size > SR:
            return y.astype(np.float32)
    except Exception:
        pass
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR)]
    if max_seconds:
        cmd += ["-t", str(max_seconds)]
    cmd += ["-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def runs(mask, min_len):
    """Number of runs of True with at least min_len samples, and total samples in those runs."""
    n, total, cur = 0, 0, 0
    for v in list(mask) + [False]:
        if v:
            cur += 1
        else:
            if cur >= min_len:
                n += 1
                total += cur
            cur = 0
    return n, total


def count_events(mask, merge_gap):
    """Count separate events in a boolean series, merging events closer than merge_gap samples."""
    idx = np.flatnonzero(mask)
    if idx.size == 0:
        return 0, []
    starts = [idx[0]]
    last = idx[0]
    for i in idx[1:]:
        if i - last > merge_gap:
            starts.append(i)
        last = i
    return len(starts), starts


# ---------------------------------------------------------------------------------------------
# tempo and beats
# ---------------------------------------------------------------------------------------------
def tempo_prior(bpms):
    # gentle preference for the 100 to 200 range so we do not lock onto very slow sub-pulses
    return np.exp(-0.5 * (np.log2(bpms / 140.0) / 0.9) ** 2)


def analyze_tempo(oenv, sr):
    import librosa
    import scipy.signal
    tg = librosa.feature.tempogram(onset_envelope=oenv, sr=sr, hop_length=HOP, win_length=384)
    bpms = librosa.tempo_frequencies(tg.shape[0], sr=sr, hop_length=HOP)
    mask = (bpms >= 55) & (bpms <= 270)
    b = bpms[mask]
    prior = tempo_prior(b)
    mean_ac = tg[mask].mean(axis=1)
    score = mean_ac * prior
    peak_bpm = float(b[int(np.argmax(score))])

    # a few competing readings (for half-time / double-time discussion)
    pk, _ = scipy.signal.find_peaks(mean_ac, prominence=0.02 * mean_ac.max())
    cands = sorted(((float(b[i]), float(mean_ac[i] / mean_ac.max())) for i in pk), key=lambda t: -t[1])[:3]

    # local tempo over time
    loc = b[np.argmax(tg[mask] * prior[:, None], axis=0)]
    k = max(3, int(8.0 * sr / HOP / 8))
    loc = scipy.signal.medfilt(loc, kernel_size=k | 1)

    beat_t = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=HOP, start_bpm=peak_bpm,
                                     tightness=100, units="time")[1]
    out = {"tempo_peak_bpm": peak_bpm, "pulse_candidates": [{"bpm": c[0], "strength": c[1]} for c in cands]}
    if len(beat_t) >= 16:
        ibi = np.diff(beat_t)
        med = np.median(ibi)
        good = ibi[(ibi > 0.75 * med) & (ibi < 1.25 * med)]
        tempo = 60.0 / np.median(good)
        cv = float(np.std(good) / np.mean(good))
        out["tempo_bpm"] = float(tempo)
        out["ibi_cv"] = cv
        out["steadiness"] = float(max(0.0, 1.0 - cv * 10.0))
    else:
        tempo = peak_bpm
        out["tempo_bpm"] = peak_bpm
        out["ibi_cv"] = None
        out["steadiness"] = None

    def near(x, ref, tol=0.06):
        return np.abs(x - ref) <= tol * ref
    out["share_local_tempo_main"] = float(np.mean(near(loc, tempo)))
    out["share_local_tempo_half"] = float(np.mean(near(loc, tempo / 2)))
    out["share_local_tempo_double"] = float(np.mean(near(loc, tempo * 2)))
    # drift measured against whichever octave each local value sits closest to
    folded = loc / (2.0 ** np.round(np.log2(loc / tempo)))
    out["tempo_drift_bpm"] = float(np.std(folded))
    out["pulse_class"] = ("fast (170ish range)" if 155 <= tempo <= 195 else
                          "mid" if 110 <= tempo < 155 else
                          "slow or half-time reading" if tempo < 110 else "very fast")
    out["tempo_fast_bpm"] = float(tempo if tempo >= 120 else tempo * 2)
    return out, beat_t


# ---------------------------------------------------------------------------------------------
# rhythm
# ---------------------------------------------------------------------------------------------
def grid_values(oenv, beats, sr, sub=4):
    import scipy.ndimage
    env = scipy.ndimage.maximum_filter1d(oenv, size=3)
    t_env = np.arange(len(env)) * HOP / sr
    pts = []
    for a, b in zip(beats[:-1], beats[1:]):
        pts.append(a + (b - a) * np.arange(sub) / sub)
    pts = np.concatenate(pts)
    return np.interp(pts, t_env, env)


def analyze_rhythm(oenv, beats, sr, duration):
    import librosa
    out = {}
    onset_frames = librosa.onset.onset_detect(onset_envelope=oenv, sr=sr, hop_length=HOP, backtrack=False)
    onset_t = onset_frames * HOP / sr
    out["onset_density_per_s"] = len(onset_t) / max(duration, 1e-6)
    if len(beats) < 16:
        return out, None
    out["onset_density_per_beat"] = len(onset_t) / max(len(beats), 1)

    v = grid_values(oenv, beats, sr, 4)
    n = (len(v) // 4) * 4
    prof = v[:n].reshape(-1, 4).sum(axis=0)
    prof = prof / max(prof.sum(), 1e-9)
    out["sixteenth_profile"] = prof                      # share of onset energy at beat, e-of-beat, and-of-beat, a-of-beat
    out["on_beat_share"] = prof[0]
    out["eighth_offbeat_share"] = prof[2]
    out["sixteenth_offbeat_share"] = prof[1] + prof[3]
    out["syncopation_index"] = (prof[1] + prof[2] + prof[3])

    # swing: where do offbeat onsets sit between beats?
    strengths = oenv[np.minimum(onset_frames, len(oenv) - 1)]
    idx = np.searchsorted(beats, onset_t) - 1
    ok = (idx >= 0) & (idx < len(beats) - 1)
    idx, t, w = idx[ok], onset_t[ok], strengths[ok]
    frac = (t - beats[idx]) / (beats[idx + 1] - beats[idx])
    off = (frac >= 0.40) & (frac <= 0.75)
    if off.sum() > 20:
        p = float(np.average(frac[off], weights=w[off]))
        out["eighth_offbeat_position"] = p
        out["swing_ratio"] = p / (1 - p)                  # 1.0 straight, 2.0 full triplet swing
        trip = (frac >= 0.62) & (frac <= 0.72)
        straight = (frac >= 0.45) & (frac <= 0.55)
        den = w[trip].sum() + w[straight].sum()
        out["triplet_feel_share"] = float(w[trip].sum() / den) if den > 0 else None

    # odd-meter evidence: autocorrelation of the eighth-note-grid onset strength in sliding windows
    e8 = v[: (len(v) // 2) * 2].reshape(-1, 2).max(axis=1)
    W, H = 128, 64
    votes = {}
    nwin = 0
    for s in range(0, max(len(e8) - W, 1), H):
        w8 = e8[s:s + W]
        if len(w8) < 96 or w8.std() < 1e-6:
            continue
        w8 = w8 - w8.mean()
        ac = librosa.autocorrelate(w8, max_size=40)
        ac = ac / (ac[0] + 1e-9)
        scores = {}
        for L, label in METER_LAGS.items():
            sc = [ac[L]] + ([ac[2 * L]] if 2 * L < len(ac) else [])
            scores[L] = float(np.mean(sc))
        best = max(scores, key=scores.get)
        if best != 8 and scores[best] - scores[8] < 0.04:
            best = 8
        lab = METER_LAGS[best]
        votes[lab] = votes.get(lab, 0) + 1
        nwin += 1
    if nwin:
        share = {k: c / nwin for k, c in votes.items()}
        out["meter_window_share"] = share
        out["odd_meter_share"] = 1.0 - share.get("4/4", 0.0)
    return out, v


# ---------------------------------------------------------------------------------------------
# harmony: key / mode and chord color distributions
# ---------------------------------------------------------------------------------------------
def ks_rank(chroma_mean):
    """Correlate a pitch-class profile with the 24 Krumhansl keys. Returns list of (r, tonic, mode)."""
    res = []
    for t in range(12):
        for mode, prof in (("major", KS_MAJOR), ("minor", KS_MINOR)):
            r = np.corrcoef(chroma_mean, np.roll(prof, t))[0, 1]
            res.append((float(r), t, mode))
    res.sort(key=lambda x: -x[0])
    return res


def analyze_key(chroma, chroma_bass, sr):
    g = chroma.mean(axis=1)
    rank = ks_rank(g)
    r1, t1, m1 = rank[0]
    rel = (t1 + (3 if m1 == "minor" else -3)) % 12
    rel_mode = "major" if m1 == "minor" else "minor"
    par_mode = "minor" if m1 == "major" else "major"
    unrelated = [x for x in rank[1:] if not ((x[1] == rel and x[2] == rel_mode) or (x[1] == t1 and x[2] == par_mode))]
    rel_r = next(x[0] for x in rank if x[1] == rel and x[2] == rel_mode)
    out = {
        "key_ks": f"{NOTE[t1]} {m1}",
        "tonic_pc": NOTE[t1],
        "mode_ks": m1,
        "ks_corr": r1,
        "ks_margin_vs_unrelated": r1 - unrelated[0][0],
        "ks_margin_vs_relative": r1 - rel_r,
    }
    # diatonic collection and modal flavour via the bass register
    cover = []
    for r in range(12):
        pcs = (r + MAJOR_SCALE) % 12
        cover.append(g[pcs].sum() / g.sum())
    R = int(np.argmax(cover))
    pcs = (R + MAJOR_SCALE) % 12
    bass = chroma_bass.mean(axis=1)
    bass = bass / max(bass.sum(), 1e-9)
    deg = int(np.argmax(bass[pcs]))
    out["diatonic_coverage"] = float(cover[R])
    out["mode_by_bass_tonic"] = MODE_NAMES[deg]
    out["bass_tonic_pc"] = NOTE[int(pcs[deg])]
    out["bass_tonic_strength"] = float(bass[pcs[deg]])

    # stability: key per ~15 s window
    fps = sr / HOP_C
    seg = int(15 * fps)
    keys = []
    for s in range(0, chroma.shape[1] - seg // 2, seg):
        c = chroma[:, s:s + seg].mean(axis=1)
        if c.sum() <= 0:
            continue
        r_, t_, m_ = ks_rank(c)[0]
        keys.append((t_, m_))
    if len(keys) >= 3:
        out["key_stability"] = float(np.mean([k == (t1, m1) for k in keys]))
        out["key_changes_per_min"] = float(sum(a != b for a, b in zip(keys[:-1], keys[1:])) / (len(keys) * 0.25))
    return out


def analyze_chords(chroma, beats, sr):
    """Chord-color distribution. Only shares are returned, never the sequence.

    Each beat gets a rough triad label. Extensions (7ths, 9ths, ...) are only judged where two neighbouring
    beats agree on the same label, so chunks that straddle a chord change do not read as "extended chords".
    """
    if len(beats) < 16:
        return {}
    edges = np.clip(librosa_time_to_frames(beats, sr), 0, chroma.shape[1])
    cols = []
    for a, b in zip(edges[:-1], edges[1:]):
        cols.append(chroma[:, a:max(b, a + 1)].mean(axis=1))
    C = np.array(cols).T                                # 12 x beats
    energy = C.sum(axis=0)
    live = energy > 0.15 * np.median(energy)
    Cn = C / np.maximum(np.linalg.norm(C, axis=0, keepdims=True), 1e-9)

    names, tmpl, notes = [], [], []
    for q, shape in TRIADS.items():
        for r in range(12):
            v = np.zeros(12)
            v[(r + np.array(shape)) % 12] = 1
            names.append((r, q))
            tmpl.append(v / np.linalg.norm(v))
            notes.append((r + np.array(shape)) % 12)
    T = np.array(tmpl)
    sim = T @ Cn
    best = np.argmax(sim, axis=0)
    label = [int(best[j]) if (live[j] and sim[best[j], j] >= 0.55) else -1 for j in range(C.shape[1])]

    counts = {q: 0 for q in TRIADS}
    ext = {"seventh_minor_or_dominant": 0, "seventh_major": 0, "ninth": 0, "eleventh": 0, "sixth": 0, "any_extension": 0}
    used = 0
    i = 0
    while i < len(label) - 1:
        if label[i] >= 0 and label[i] == label[i + 1]:
            k = label[i]
            r, q = names[k]
            col = C[:, i:i + 2].mean(axis=1)
            level = col[notes[k]].mean()
            i += 2
            if level <= 0:
                continue
            used += 1
            counts[q] += 1
            rel = col / level
            has = {
                "b7": rel[(r + 10) % 12] > EXT_PRESENT,
                "M7": rel[(r + 11) % 12] > EXT_PRESENT,
                "9": q != "sus2" and rel[(r + 2) % 12] > EXT_PRESENT,
                "11": q != "sus4" and rel[(r + 5) % 12] > EXT_PRESENT,
                "6": rel[(r + 9) % 12] > EXT_PRESENT,
            }
            if has["b7"]:
                ext["seventh_minor_or_dominant"] += 1
            if has["M7"]:
                ext["seventh_major"] += 1
            if has["9"]:
                ext["ninth"] += 1
            if has["11"]:
                ext["eleventh"] += 1
            if has["6"] and q in ("maj", "min"):
                ext["sixth"] += 1
            if any(has.values()):
                ext["any_extension"] += 1
        else:
            i += 1
    if used < 8:
        return {}
    valid = [l for l in label if l >= 0]
    changes = sum(1 for a, b in zip(valid[:-1], valid[1:]) if a != b)
    out = {"triad_share": {q: counts[q] / used for q in counts},
           "extension_share": {k: v / used for k, v in ext.items()},
           "sus_share": (counts["sus2"] + counts["sus4"]) / used,
           "minor_quality_share": counts["min"] / max(counts["min"] + counts["maj"], 1),
           "chord_changes_per_bar": changes / max(len(valid) / 4.0, 1.0),
           "stable_chord_fraction": 2.0 * used / max(len(valid), 1)}
    return out


def librosa_time_to_frames(t, sr):
    return np.round(np.asarray(t) * sr / HOP_C).astype(int)


# ---------------------------------------------------------------------------------------------
# energy shape and spectral character
# ---------------------------------------------------------------------------------------------
def analyze_energy(y, sr):
    import librosa
    frame = 2048
    rms = librosa.feature.rms(y=y, frame_length=frame, hop_length=HOP_C)[0]
    p = rms ** 2
    fps = sr / HOP_C
    step = int(round(fps))
    n = len(p) // step
    if n < 30:
        return {}, None
    e = 10 * np.log10(p[: n * step].reshape(n, step).mean(axis=1) + 1e-10)
    # 2 s moving average
    k = np.ones(2) / 2
    es = np.convolve(e, k, mode="same")
    dur = n
    out = {"loudness_db_mean": float(e.mean()), "dynamic_range_db": float(np.percentile(es, 95) - np.percentile(es, 10))}

    d3 = es[3:] - es[:-3]
    nd, ds = count_events(d3 <= -5.0, 6)
    out["sharp_drops_per_min"] = nd / dur * 60
    out["max_drop_db_per_s"] = float(-d3.min() / 3.0) if len(d3) else None
    d8 = es[8:] - es[:-8]
    nb, bs = count_events(d8 >= 6.0, 10)
    out["builds_per_min"] = nb / dur * 60
    out["max_build_db_per_s"] = float(d8.max() / 8.0) if len(d8) else None
    d20 = es[20:] - es[:-20]
    nc, _ = count_events(d20 >= 6.0, 20)
    out["long_crescendos_per_min"] = nc / dur * 60
    low = es <= np.median(es) - 6.0
    nbd, tot = runs(low, 4)
    out["breakdowns_per_min"] = nbd / dur * 60
    out["breakdown_time_share"] = tot / dur
    # shape of the whole song, ten equal slices, relative to its own average
    chunks = np.array_split(es, 10)
    out["energy_arc_db"] = [float(c.mean() - es.mean()) for c in chunks]
    out["peak_position"] = float(np.argmax(es) / len(es))
    return out, es


def analyze_spectral(y, sr, es):
    import librosa
    n_fft = 2048
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=1024))
    P = S ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    tot = P.sum()
    out = {"band_share": {}}
    for name, (lo, hi) in BAND_EDGES.items():
        m = (freqs >= lo) & (freqs < hi)
        out["band_share"][name] = float(P[m].sum() / tot)
    cen = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
    out["centroid_hz_mean"] = float(cen.mean())
    out["centroid_hz_std"] = float(cen.std())
    out["rolloff85_hz_mean"] = float(librosa.feature.spectral_rolloff(S=S, sr=sr, roll_percent=0.85)[0].mean())
    out["flatness_mean"] = float(librosa.feature.spectral_flatness(S=S)[0].mean())
    # density: share of bins between 100 Hz and 8 kHz within 40 dB of each frame's peak
    m = (freqs >= 100) & (freqs <= 8000)
    db = 20 * np.log10(S[m] + 1e-9)
    peak = db.max(axis=0, keepdims=True)
    out["density"] = float(np.mean(db > peak - 40))
    # does the song get brighter when it gets louder?
    if es is not None:
        per_s = int(round(sr / 1024))
        n = min(len(es), len(cen) // per_s)
        if n > 20:
            cs = cen[: n * per_s].reshape(n, per_s).mean(axis=1)
            if cs.std() > 0 and es[:n].std() > 0:
                out["brightness_loudness_corr"] = float(np.corrcoef(cs, es[:n])[0, 1])
    return out


# ---------------------------------------------------------------------------------------------
# one song
# ---------------------------------------------------------------------------------------------
def analyze_song(path, sid, max_seconds=None):
    import librosa
    t0 = time.time()
    y = load_audio(path, max_seconds)
    sr = SR
    dur = len(y) / sr
    y_h, y_p = librosa.effects.hpss(y)
    oenv = librosa.onset.onset_strength(y=y_p, sr=sr, hop_length=HOP, aggregate=np.median)
    tempo, beats = analyze_tempo(oenv, sr)
    rhythm, _ = analyze_rhythm(oenv, beats, sr, dur)

    chroma = librosa.feature.chroma_cqt(y=y_h, sr=sr, hop_length=HOP_C, fmin=librosa.note_to_hz("C2"), n_octaves=6)
    chroma_bass = librosa.feature.chroma_cqt(y=y_h, sr=sr, hop_length=HOP_C, fmin=librosa.note_to_hz("C1"), n_octaves=3)
    key = analyze_key(chroma, chroma_bass, sr)
    chords = analyze_chords(chroma, beats, sr)
    energy, es = analyze_energy(y, sr)
    spectral = analyze_spectral(y, sr, es)
    return {
        "id": sid,
        "duration_s": dur,
        "tempo": tempo,
        "key": key,
        "chord_color": chords,
        "rhythm": rhythm,
        "energy": energy,
        "spectral": spectral,
        "analysis_seconds": time.time() - t0,
    }


def _worker(args):
    path, sid, max_seconds = args
    try:
        return sid, analyze_song(path, sid, max_seconds), None
    except Exception as e:  # keep going if one file is bad
        return sid, None, f"{type(e).__name__}: {e}"


# ---------------------------------------------------------------------------------------------
# aggregate
# ---------------------------------------------------------------------------------------------
def flatten(d, prefix=""):
    for k, v in d.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            yield from flatten(v, key + ".")
        elif isinstance(v, (int, float, np.floating)) and v is not None and np.isfinite(v):
            yield key, float(v)


def aggregate(songs):
    vals = {}
    for s in songs:
        for k, v in flatten({kk: vv for kk, vv in s.items() if kk not in ("id",)}):
            vals.setdefault(k, []).append(v)
    scalars = {}
    for k, arr in vals.items():
        a = np.array(arr)
        scalars[k] = {"n": len(a), "mean": a.mean(), "median": np.median(a), "std": a.std(),
                      "min": a.min(), "p25": np.percentile(a, 25), "p75": np.percentile(a, 75), "max": a.max()}
    agg = {"scalars": scalars}

    def count(getter):
        c = {}
        for s in songs:
            v = getter(s)
            if v is not None:
                c[v] = c.get(v, 0) + 1
        return dict(sorted(c.items(), key=lambda kv: -kv[1]))

    agg["key_ks_counts"] = count(lambda s: s["key"].get("key_ks"))
    agg["mode_ks_counts"] = count(lambda s: s["key"].get("mode_ks"))
    agg["mode_by_bass_tonic_counts"] = count(lambda s: s["key"].get("mode_by_bass_tonic"))
    agg["tonic_pc_counts"] = count(lambda s: s["key"].get("tonic_pc"))
    agg["pulse_class_counts"] = count(lambda s: s["tempo"].get("pulse_class"))
    hist = {}
    for s in songs:
        t = s["tempo"].get("tempo_bpm")
        if t:
            lo = int(t // 10) * 10
            hist[f"{lo}-{lo + 9}"] = hist.get(f"{lo}-{lo + 9}", 0) + 1
    agg["tempo_bpm_hist"] = dict(sorted(hist.items(), key=lambda kv: int(kv[0].split("-")[0])))
    # meter shares averaged
    ms = {}
    n = 0
    for s in songs:
        m = s["rhythm"].get("meter_window_share")
        if m:
            n += 1
            for k, v in m.items():
                ms[k] = ms.get(k, 0) + v
    agg["meter_window_share_mean"] = {k: v / n for k, v in sorted(ms.items(), key=lambda kv: -kv[1])} if n else {}
    agg["songs_with_notable_odd_meter"] = sum(1 for s in songs if (s["rhythm"].get("odd_meter_share") or 0) > 0.25)
    return agg


def jam_defaults(agg, songs):
    """A small, clamped set of starting values for the jam room. The page treats these as soft defaults."""
    sc = agg["scalars"]

    def g(key, stat="mean", default=None):
        return sc.get(key, {}).get(stat, default)

    fast = [s["tempo"].get("tempo_fast_bpm") for s in songs if s["tempo"].get("tempo_fast_bpm")]
    fast = np.array(fast) if fast else np.array([173.0])
    lo, hi = np.percentile(fast, 25), np.percentile(fast, 75)
    lo, hi = float(np.clip(lo, 140, 186)), float(np.clip(hi, 142, 190))
    if hi - lo < 4:
        lo, hi = lo - 2, hi + 2
    ext = lambda k: g(f"chord_color.extension_share.{k}", "mean", 0.0)
    minor_share = agg["mode_ks_counts"].get("minor", 0) / max(sum(agg["mode_ks_counts"].values()), 1)
    return {
        "tempo_fast_range": [lo, hi],
        "tempo_fast_median": float(np.median(fast)),
        "minor_song_share": minor_share,
        "chord_color": {"seventh": ext("seventh_minor_or_dominant") + ext("seventh_major"), "ninth": ext("ninth"),
                        "eleventh": ext("eleventh"), "sixth": ext("sixth"),
                        "sus": g("chord_color.sus_share", "mean", 0.0), "any": ext("any_extension")},
        "odd_meter_share": g("rhythm.odd_meter_share", "mean", 0.0),
        "swing_ratio": g("rhythm.swing_ratio", "median", 1.0),
        "syncopation_index": g("rhythm.syncopation_index", "mean", 0.5),
        "breakdowns_per_min": g("energy.breakdowns_per_min", "mean", 0.5),
        "builds_per_min": g("energy.builds_per_min", "mean", 0.5),
        "sharp_drops_per_min": g("energy.sharp_drops_per_min", "mean", 0.5),
        "half_time_share": g("tempo.share_local_tempo_half", "mean", 0.0),
        "bass_share": g("spectral.band_share.bass", "mean", 0.3) + g("spectral.band_share.sub", "mean", 0.05),
        "brightness_hz": g("spectral.centroid_hz_mean", "mean", 2000.0),
    }


# ---------------------------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Analyze reference songs into an aggregate style profile.")
    ap.add_argument("input_dir")
    ap.add_argument("-o", "--out", default=os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument("--max-seconds", type=float, default=None, help="only analyze the first N seconds of each file")
    ap.add_argument("--budget", type=float, default=None,
                    help="stop starting new songs after this many seconds; re-run to continue (finished songs are cached)")
    a = ap.parse_args()

    files = sorted(os.path.join(a.input_dir, f) for f in os.listdir(a.input_dir)
                   if f.lower().endswith(AUDIO_EXT) and not f.startswith("."))
    if not files:
        sys.exit("no audio files found in " + a.input_dir)
    os.makedirs(a.out, exist_ok=True)
    cache_dir = os.path.join(a.out, "_cache")
    os.makedirs(cache_dir, exist_ok=True)
    jobs = [(p, f"s{i + 1:02d}", a.max_seconds) for i, p in enumerate(files)]
    index = {sid: os.path.basename(p) for p, sid, _ in jobs}

    def cache_path(sid):
        return os.path.join(cache_dir, sid + ".json")

    def stamp(p):
        st = os.stat(p)
        return [os.path.basename(p), st.st_size, a.max_seconds]

    songs, errors, todo = [], [], []
    for p, sid, ms in jobs:
        cp = cache_path(sid)
        if os.path.exists(cp):
            try:
                c = json.load(open(cp))
                if c.get("stamp") == stamp(p):
                    songs.append(c["result"])
                    continue
            except Exception:
                pass
        todo.append((p, sid, ms))
    print(f"{len(songs)} cached, {len(todo)} to analyze, {a.workers} workers", flush=True)

    t0 = time.time()
    if todo:
        with ProcessPoolExecutor(max_workers=a.workers) as ex:
            pending, queue = {}, list(todo)

            def fill():
                while queue and len(pending) < a.workers and (a.budget is None or time.time() - t0 < a.budget):
                    j = queue.pop(0)
                    pending[ex.submit(_worker, j)] = j
            fill()
            while pending:
                for f in as_completed(list(pending)):
                    j = pending.pop(f)
                    sid, res, err = f.result()
                    if res:
                        songs.append(res)
                        with open(cache_path(sid), "w") as fh:
                            json.dump({"stamp": stamp(j[0]), "result": clean(res)}, fh)
                    else:
                        errors.append({"id": sid, "error": err})
                    print(f"  {sid} {'ok' if res else 'FAILED ' + str(err)}  ({time.time() - t0:.0f}s)", flush=True)
                    fill()
                    break
        left = len(queue)
        if left:
            print(f"paused with {left} songs left; run the same command again to continue", flush=True)
            return
    songs = [clean(s) for s in songs]
    songs.sort(key=lambda s: s["id"])
    agg = aggregate(songs)
    prof = {
        "version": 1,
        "n_songs": len(songs),
        "note": "Aggregate figures and per-song summary numbers only. No melodies, chord sequences or audio.",
        "caveats": ["Key and chord estimates from mixed audio are approximate.",
                    "Extension shares (7th/9th/11th) are inflated or deflated by the mix; read them as relative, not exact.",
                    "Swing, syncopation and meter are measured against a tracked beat that may sit at half or double the felt pulse."],
        "aggregate": agg,
        "jam_defaults": jam_defaults(agg, songs),
        "songs": songs,
        "errors": errors,
    }
    prof = clean(prof)
    with open(os.path.join(a.out, "style_profile.json"), "w") as f:
        json.dump(prof, f, indent=1)
    with open(os.path.join(a.out, "style_defaults.js"), "w") as f:
        f.write("// Generated by analyze.py from style_profile.json. Aggregate figures only.\n")
        f.write("window.JAM_STYLE = " + json.dumps(prof["jam_defaults"], indent=1) + ";\n")
    with open(os.path.join(a.out, "song_index.local.json"), "w") as f:
        json.dump(index, f, indent=1, ensure_ascii=False)
    print(f"done: {len(songs)} ok, {len(errors)} failed -> {a.out}")


if __name__ == "__main__":
    main()
