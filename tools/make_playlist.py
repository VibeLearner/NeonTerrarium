#!/usr/bin/env python3
"""Write assets/audio/music/playlist.json from the music files in that folder.

Optional: on GitHub Pages the game can list the folder by itself. A playlist.json lets you set the order of the
list or give tracks nicer titles: edit the "title" fields after running this (re-running keeps your titles).

    python3 tools/make_playlist.py
"""
import json, os, re

DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio', 'music')
EXT = re.compile(r'\.(mp3|ogg|oga|m4a|aac|wav|flac|webm|opus)$', re.I)

def title_of(name):
    t = EXT.sub('', name)
    t = re.sub(r'^\d+\s*[-_.]\s*', '', t)
    return re.sub(r'_+', ' ', t).strip()

path = os.path.join(DIR, 'playlist.json')
old = {}
if os.path.exists(path):
    with open(path) as f:
        for t in json.load(f):
            if isinstance(t, dict) and 'file' in t:
                old[t['file']] = t.get('title')
files = sorted(f for f in os.listdir(DIR) if EXT.search(f))
tracks = [{'file': f, 'title': old.get(f) or title_of(f)} for f in files]
with open(path, 'w') as f:
    json.dump(tracks, f, indent=2, ensure_ascii=False)
    f.write('\n')
print(f'{len(tracks)} tracks written to {os.path.relpath(path)}')
