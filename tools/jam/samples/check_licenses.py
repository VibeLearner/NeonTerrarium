#!/usr/bin/env python3
"""Fails (exit 1) if any shipped sample file lacks a manifest entry with a CC0 source.

Checks: every file under samples/pack is listed in manifest.json 'files' with license CC0-1.0, a known library whose license file says
CC0 1.0, a source URL inside that library, and the sha of the file on disk; every listed file exists; no audio file sits anywhere else
under samples/ (the downloaded sources in _src are ignored by git and never shipped); nothing comes from a blocked source; and no
file is longer than 6 seconds (single notes and single hits only: no loops or phrases).
"""
import os, sys, json, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
BLOCK = ('jrhodes', 'jlearman', 'freesound', 'soundfont', '.sf2', '.sf3', 'gm.sf', 'musescore')
AUDIO = ('.wav', '.flac', '.mp3', '.ogg', '.opus', '.m4a', '.aif', '.aiff', '.sfz')
bad = []
man = json.load(open(os.path.join(HERE, 'manifest.json')))
libs = man['libraries']
for k, L in libs.items():
    if L.get('license') != 'CC0-1.0': bad.append('library %s is not marked CC0-1.0' % k)
    lf = os.path.join(HERE, L.get('license_file', 'licenses/%s.txt' % k))
    if not os.path.exists(lf): bad.append('missing license copy for %s' % k)
    elif 'CC0 1.0' not in open(lf).read(500): bad.append('license file of %s does not say CC0 1.0' % k)
    if any(b in (L['url'] + L['name']).lower() for b in BLOCK): bad.append('blocked source: ' + L['url'])
files = man['files']
on_disk = []
for root, dirs, fs in os.walk(HERE):
    dirs[:] = [d for d in dirs if d not in ('_src', '__pycache__', '.git')]
    for f in fs:
        if f.lower().endswith(AUDIO):
            on_disk.append(os.path.relpath(os.path.join(root, f), HERE).replace(os.sep, '/'))
for rel in on_disk:
    if not rel.startswith('pack/') or not rel.endswith('.opus'): bad.append('audio file outside pack/: ' + rel); continue
    e = files.get(rel)
    if not e: bad.append('no manifest entry: ' + rel); continue
    if e.get('license') != 'CC0-1.0': bad.append('not CC0 in manifest: ' + rel)
    L = libs.get(e.get('library'))
    if not L: bad.append('unknown library for ' + rel); continue
    if not e.get('source', '').startswith(L['url'] + '/'): bad.append('source outside its library: ' + rel)
    if not e.get('original'): bad.append('no original file name: ' + rel)
    if any(b in (e.get('source', '') + e.get('original', '')).lower() for b in BLOCK): bad.append('blocked source in ' + rel)
    h = hashlib.sha256(open(os.path.join(HERE, rel), 'rb').read()).hexdigest()[:16]
    if h != e.get('sha'): bad.append('file changed since the build: ' + rel)
for rel in files:
    if rel not in on_disk: bad.append('listed but missing: ' + rel)
# durations: no loops or phrases
def walk(o, out):
    if isinstance(o, dict):
        for v in o.values(): walk(v, out)
    elif isinstance(o, list):
        if len(o) >= 2 and isinstance(o[0], str) and o[0].endswith('.opus'): out.append(o)
        else:
            for v in o: walk(v, out)
refs = []; walk(man['instruments'], refs)
for r in refs:
    if r[1] > 6.0: bad.append('longer than 6 s (a loop or phrase?): ' + r[0])
    if 'pack/' + r[0] not in files: bad.append('instrument refers to an unlisted file: ' + r[0])
total = sum(e['bytes'] for e in files.values())
print('%d files, %.2f MB, %d libraries' % (len(files), total / 1e6, len(libs)))
if bad:
    print('FAILED:'); [print(' -', b) for b in bad[:40]]; sys.exit(1)
print('check_licenses: OK (every shipped file has a CC0 source in the manifest)')
