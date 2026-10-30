#!/usr/bin/env python3
"""Neon Terrarium: the itch.io build. Makes build/itch/ (the game as itch serves it) and build/neon-terrarium-itch.zip.

itch.io's rules for an HTML5 game (https://itch.io/docs/creators/html5): a zip with index.html at its root, at most 1,000 files and
500 MB once unzipped, no file over 200 MB, paths under 240 characters, relative paths, names matched case for case, and any request
to another domain over HTTPS. The repository is over the file limit (the tools, the story bible, test data), so this copies only what
the game loads, and on the way:
  - the music, the coast's songs and the radio are encoded smaller (MP3 at 128 kbps, the coast's Opus at 96 kbps, cover art dropped);
    a file is only replaced if it comes out smaller, and the encodes are cached in build/itch-cache so a rebuild is quick
  - three.js comes with the game (vendor/) instead of from a CDN: the same versions the pages ask for, from npm
  - the dev page is gone: '#dev' in the address is dropped before any script reads it
  - the limits are checked, and every local file the pages ask for is checked to be in the build
Needs: git, ffmpeg (with libmp3lame and libopus), npm. Run from anywhere: python3 tools/itch/build.py
"""
import hashlib, json, os, re, shutil, subprocess, sys, tarfile, zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'build', 'itch')
CACHE = os.path.join(ROOT, 'build', 'itch-cache')
ZIP = os.path.join(ROOT, 'build', 'neon-terrarium-itch.zip')

# what the game loads: the pages (m.html: the phone page, where index.html sends a phone or tablet, with its smaller scripts in min/ and its
# saved copy of the files, sw.js), the code, the styles, the art and sound, the stories and cases, the title screen's live lighting
INCLUDE = ['index.html', 'm.html', 'min/', 'sw.js', 'furnish.html', 'coast.html', 'js/', 'css/', 'furnish/', 'assets/', 'data/', 'tools/title/kitchen.js', 'tools/title/realtime.js']
EXCLUDE = ['assets/audio/sfx/originals/', 'assets/sprites/originals/']
EXCLUDE_EXT = ('.md', '.py')

# three.js: the CDN addresses in the pages, and where each comes from in the npm package
THREE = {
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': ('0.128.0', 'build/three.min.js'),
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/BufferGeometryUtils.js': ('0.128.0', 'examples/js/utils/BufferGeometryUtils.js'),
  'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js': ('0.149.0', 'build/three.min.js'),
}
AUDIO = {'.mp3': ['-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3'], '.m4a': ['-c:a', 'libopus', '-b:a', '96k', '-f', 'mp4']}
NO_DEV = ("<script>/* the itch.io build: no dev page, and no testing aids (self.ITCH: monitor.js leaves out the answer key) */self.ITCH=true;(function(){var d=function(){return /dev/.test(location.hash)};"
          "if(d())history.replaceState(null,'',location.pathname+location.search);"
          "addEventListener('hashchange',function(){if(d())location.replace(location.pathname+location.search)});})();</script>")

def run(*a, **k): return subprocess.run(a, check=True, capture_output=True, text=True, **k)
def sha(p):
  h = hashlib.sha1()
  with open(p, 'rb') as f:
    for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
  return h.hexdigest()

def files():
  out = run('git', 'ls-files', cwd=ROOT).stdout.splitlines()
  keep = [f for f in out if any(f == i or (i.endswith('/') and f.startswith(i)) for i in INCLUDE)]
  return [f for f in keep if not any(f.startswith(e) for e in EXCLUDE) and not f.endswith(EXCLUDE_EXT)]

def audio(src, dst, ext):
  key = sha(src) + '-' + '-'.join(AUDIO[ext])
  cached = os.path.join(CACHE, 'audio', key + ext)
  if not os.path.exists(cached):
    os.makedirs(os.path.dirname(cached), exist_ok=True)
    tmp = cached + '.part' + ext
    run('ffmpeg', '-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-map_metadata', '-1', *AUDIO[ext], tmp)
    os.replace(tmp, cached)
  shutil.copyfile(cached if os.path.getsize(cached) < os.path.getsize(src) else src, dst)

def three():
  got = {}
  for url, (ver, inner) in THREE.items():
    tgz = os.path.join(CACHE, 'three-' + ver + '.tgz')
    if not os.path.exists(tgz):
      os.makedirs(CACHE, exist_ok=True)
      name = run('npm', 'pack', 'three@' + ver, '--pack-destination', CACHE, '--silent').stdout.strip().splitlines()[-1]
      os.replace(os.path.join(CACHE, name), tgz)
    rel = 'vendor/three-' + ver + '/' + os.path.basename(inner)
    dst = os.path.join(OUT, rel); os.makedirs(os.path.dirname(dst), exist_ok=True)
    with tarfile.open(tgz) as t, open(dst, 'wb') as f: f.write(t.extractfile('package/' + inner).read())
    got[url] = rel
  return got

def main():
  if os.path.exists(OUT): shutil.rmtree(OUT)
  saved = 0
  for f in files():
    src, dst = os.path.join(ROOT, f), os.path.join(OUT, f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ext = os.path.splitext(f)[1].lower()
    if f.startswith('assets/audio/') and ext in AUDIO: audio(src, dst, ext); saved += os.path.getsize(src) - os.path.getsize(dst)
    else: shutil.copyfile(src, dst)
  vend = three()
  for page in ('index.html', 'm.html', 'furnish.html', 'coast.html'):
    p = os.path.join(OUT, page); s = open(p, encoding='utf-8').read()
    for url, rel in vend.items(): s = s.replace(url, rel)
    s = s.replace('<head>', '<head>\n' + NO_DEV, 1)
    open(p, 'w', encoding='utf-8').write(s)
  check(saved)
  if os.path.exists(ZIP): os.remove(ZIP)
  with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, _, fs in sorted(os.walk(OUT)):
      for n in sorted(fs):
        p = os.path.join(d, n); rel = os.path.relpath(p, OUT).replace(os.sep, '/')
        z.write(p, rel, compress_type=zipfile.ZIP_STORED if rel.endswith(('.mp3', '.m4a', '.png', '.jpg')) else zipfile.ZIP_DEFLATED)
  print('zip: %s (%.1f MB)' % (os.path.relpath(ZIP, ROOT), os.path.getsize(ZIP)/1e6))

def check(saved):
  all_ = [os.path.join(d, n) for d, _, fs in os.walk(OUT) for n in fs]
  rels = [os.path.relpath(p, OUT).replace(os.sep, '/') for p in all_]
  total = sum(os.path.getsize(p) for p in all_); big = max(all_, key=os.path.getsize)
  bad = []
  if 'index.html' not in rels: bad.append('no index.html at the root')
  if len(all_) > 1000: bad.append('%d files (itch allows 1,000)' % len(all_))
  if total > 500e6: bad.append('%.0f MB in all (itch allows 500)' % (total/1e6))
  if os.path.getsize(big) > 200e6: bad.append(big + ' is over 200 MB')
  bad += [r + ' has a path over 240 characters' for r in rels if len(r) > 240]
  # every local file the pages ask for by src or href must be there, case for case
  have = set(rels)
  for page in ('index.html', 'm.html', 'furnish.html', 'coast.html'):
    for u in re.findall(r'(?:src|href)="([^"#]+)"', open(os.path.join(OUT, page), encoding='utf-8').read()):
      if re.match(r'^(https?:|data:|mailto:|javascript:)', u):
        if u.startswith('http:'): bad.append(page + ' asks for ' + u + ' over plain http')
        continue
      if u.split('?')[0] not in have: bad.append(page + ' asks for ' + u + ', which is not in the build')
  print('files: %d, %.1f MB unzipped, largest %s (%.1f MB), audio %.1f MB smaller' % (len(all_), total/1e6, os.path.relpath(big, OUT), os.path.getsize(big)/1e6, saved/1e6))
  if bad: print('\n'.join('PROBLEM: ' + b for b in bad)); sys.exit(1)

if __name__ == '__main__': main()
