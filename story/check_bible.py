#!/usr/bin/env python3
"""Fair-play and vocabulary checker for the police story bible (story/police).
Reads plot/arcs/*.md, continuity/{clues,questions,promises}/*.md, characters/*.md, worldbuilding/locations/*.md.
  python3 story/check_bible.py [path-to-project]
Checks: ledger tables (day ranges, who, where, camera clauses, channels, clue tokens, flags), clue files against ledger rows, truth tables (2+ clues on different days before the payoff),
boss case counts and endings, crossover pairs on both sides, question and promise days, no em or en dashes, a few British spellings.
Prints every finding; exits 1 if any."""
import os, re, sys, glob
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'police')
PLACES = set('tenements shopfront food-counter luxury-tower factory town-square lawn market-plaza sky-mall cloud-pagoda bath-house neon-dome foundry logistics-hub hydroponic-farm data-spire radio-station metro-station lift sky-highway police-station'.split())
SUBS = {'town-square': {'food-stalls', 'koi-pond', 'vending-machines', 'seats'}, 'bath-house': {'pools', 'front-desk', 'tea-counter'}, 'neon-dome': {'queue', 'door-staff', 'bar-kiosk', 'snack-stand'}, 'metro-station': {'platform'}, 'police-station': {'front-screens'}}
ACTIONS = set('walk run walk-together enter leave stand wait-outside knock-and-wait read-notice point shrug wave chat argue hug hand-over serve queue-order phone-call post-feed sit eat picnic bump carry pick-up share-umbrella watch-hologram police-patrol police-scan arrest escort search stakeout'.split())
CHANNELS = {'seen', 'conversation', 'phone', 'feed', 'document', 'introduction'}
GENERIC = set('crowd bystander bot drone queue patrons resident'.split())
NS = set('boss g1 g2 g3 inf A B C D E F G H rh1 rh2 rh3 station2 case'.split())
OFFICERS = 'inside-officer framed-officer veteran-officer rookie-officer family-caller-officer burnout-officer desk-sergeant night-stakeout-officer'.split()
BANNED = re.compile(r"\b(thinks?|thinking|knows?|realizes?|realises?|decides?|decided|suspected|suspecting|fears?|hopes?|believes?|remembers?|wants|plans to|secretly|guilty|the boss)\b", re.I)
BRIT = re.compile(r"\b(colour\w*|neighbour\w*|centre\w*|metre\w*|recognis\w*|realis\w*|organis\w*|favour\w*|honour\w*|behaviour\w*|defence|licence|theatre|programme|grey|jewellery|storey|kerb|pavement|lorry)\b", re.I)
BOSS = {'b1': 'b1-long-queue', 'b2': 'b2-door-work', 'b3': 'b3-the-regular', 'b4': 'b4-dead-drop-days', 'b5': 'b5-last-train'}
SMALL = {'s1': ('s1-lift-lobby-muggings', 2, 12), 's2': ('s2-missing-delivery', 3, 10), 's3': ('s3-stall-fire', 5, 13), 's4': ('s4-sky-mall-pickpocket', 6, 14), 's5': ('s5-platform-lurker', 4, 15), 's6': ('s6-screen-graffiti', 8, 17), 's7': ('s7-missing-regular', 8, 19)}
CROSS = {'s1': {'b1': 8, 'b3': 8, 'b5': 8}, 's2': {'b4': 9, 'b1': 9}, 's3': {'b1': 9, 'b2': 9}, 's4': {'b2': 7, 'b5': 7}, 's5': {'b5': 11, 'b3': 11}, 's6': {'b3': 10, 'b4': 10}, 's7': {'b3': 9, 'b5': 9, 'b1': 9}}
bad = []
def err(where, msg): bad.append('%s: %s' % (where, msg))
def read(p): return open(p, encoding='utf-8').read()
def fm(text):
    m = re.match(r'---\n(.*?)\n---\n?(.*)', text, re.S)
    if not m: return {}, text
    d = {}
    for line in m.group(1).split('\n'):
        k = re.match(r'^([A-Za-z0-9_-]+):\s*(.*)$', line)
        if k: d[k.group(1)] = k.group(2).strip().strip('"')
    return d, m.group(2)
def chap(v):
    m = re.match(r'chapter-(\d+)$', v or '')
    return int(m.group(1)) if m else None
chars = {os.path.basename(p)[:-3] for p in glob.glob(os.path.join(ROOT, 'characters', '*.md')) if not p.endswith('_index.md')}
clues = {}
for p in glob.glob(os.path.join(ROOT, 'continuity', 'clues', '*.md')):
    cid = os.path.basename(p)[:-3]
    if cid == '_index': continue
    d, body = fm(read(p))
    clues[cid] = {'planted': chap(d.get('planted')), 'payoff': chap(d.get('payoff')), 'rh': d.get('red-herring') == 'true', 'file': p}
    if clues[cid]['planted'] is None: err(cid, 'clue has no planted chapter')
    if clues[cid]['payoff'] is None: err(cid, 'clue has no payoff chapter')
    elif clues[cid]['planted'] and clues[cid]['payoff'] < clues[cid]['planted']: err(cid, 'payoff before plant')
def rng(s):
    m = re.fullmatch(r'd(\d\d)(?:-d(\d\d))?', s.strip())
    if not m: return None
    a = int(m.group(1)); b = int(m.group(2) or a)
    return (a, b)
arcs = {}
refs = {}   # clue id -> list of (arc, kind, range)
xbeats = {}   # (boss, small) -> list of ranges
for p in sorted(glob.glob(os.path.join(ROOT, 'plot', 'arcs', '*.md'))):
    aid = os.path.basename(p)[:-3]
    if aid == '_index': continue
    text = read(p); d, body = fm(text)
    arcs[aid] = {'rows': {'BASE': [], 'CARELESS': [], 'CAREFUL': []}, 'body': body, 'fm': d}
    section = None; hdr = False
    for line in body.split('\n'):
        h = re.match(r'^#+\s+(.*)$', line)
        if h:
            t = h.group(1).upper()
            section = 'CARELESS' if 'CARELESS' in t else 'CAREFUL' if 'CAREFUL' in t else 'BASE' if ('LEDGER' in t or 'BEAT' in t) else None
            hdr = False; continue
        if not line.startswith('|') or section is None: continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if cells and cells[0].lower().startswith('day range'): hdr = True; continue
        if not hdr or set(line.replace('|', '').strip()) <= set('-: '): continue
        if len(cells) != 8: err(aid, 'ledger row has %d cells: %s' % (len(cells), line[:80])); continue
        arcs[aid]['rows'][section].append(cells)
    prefix = aid.split('-')[0]
    allrows = [(s, r) for s, rows in arcs[aid]['rows'].items() for r in rows]
    for sec, cells in allrows:
        day, title, who, where, cam, chn, clue, state = cells
        w = '%s %s "%s"' % (aid, day, title[:40])
        r = rng(day)
        if not r: err(w, 'bad day range'); continue
        if r[0] < 1 or r[1] > 21 or r[1] < r[0] or r[1] - r[0] > 2: err(w, 'day range out of 1..21 or longer than 3 days')
        if aid in {v[0] for v in SMALL.values()}:
            sk = [k for k, v in SMALL.items() if v[0] == aid][0]
            if r[0] < SMALL[sk][1] or r[1] > SMALL[sk][2]: err(w, 'outside the small case window d%02d-d%02d' % (SMALL[sk][1], SMALL[sk][2]))
        for t in [x.strip() for x in who.split(',')]:
            if t not in chars and t not in GENERIC: err(w, 'unknown who "%s"' % t)
        pl = where.split('/')[0].strip()
        if pl not in PLACES: err(w, 'unknown place "%s"' % where)
        elif '/' in where and where.split('/')[1].strip() not in SUBS.get(pl, set()): err(w, 'unknown sub-place "%s"' % where)
        clauses = [c.strip() for c in cam.split(';') if c.strip()]
        if not clauses: err(w, 'empty camera cell')
        for c in clauses:
            m = re.match(r'^([a-z-]+):', c)
            if not m or m.group(1) not in ACTIONS: err(w, 'camera clause must start with an allowed action: "%s"' % c[:50])
        if BANNED.search(cam): err(w, 'banned word in camera text: %s' % BANNED.search(cam).group(0))
        for c in [x.strip() for x in chn.split('+')]:
            if c not in CHANNELS: err(w, 'unknown channel "%s"' % c)
        if clue.strip() not in ('-', ''):
            for tok in [x.strip() for x in clue.split(',')]:
                m = re.match(r'^(plant|pay|herring|debunk)\s+([a-z0-9]+-[cqp]\d\d)$', tok)
                if not m: err(w, 'bad clue token "%s"' % tok); continue
                kind, cid = m.groups()
                refs.setdefault(cid, []).append((aid, kind, r))
                c = clues.get(cid)
                if not c: err(w, 'clue %s has no file' % cid); continue
                if kind in ('plant', 'herring') and not (c['planted'] and r[0] <= c['planted'] <= r[1]): err(w, '%s planted day %s outside beat range' % (cid, c['planted']))
                bridge = re.fullmatch(r's\d-c01', cid) is not None
                if kind in ('pay', 'debunk') and sec != 'BASE':   # a variant row moves the payoff: the clue must be planted by then
                    if not (c['planted'] and c['planted'] <= r[1]): err(w, '%s paid off in a variant row before it is planted' % cid)
                elif kind in ('pay', 'debunk') and not (c['payoff'] and (r[0] <= c['payoff'] <= r[1] or (bridge and r[0] >= c['payoff']))): err(w, '%s payoff day %s outside beat range' % (cid, c['payoff']))
                if kind in ('herring', 'debunk') and not c['rh']: err(w, '%s used as red herring but not marked' % cid)
        if state.strip() not in ('-', ''):
            for f in [x.strip() for x in state.split(',')]:
                m = re.match(r'^([A-Za-z0-9]+):([a-z0-9-]+)$', f)
                if not m or m.group(1) not in NS: err(w, 'bad flag "%s"' % f)
        for tag in re.findall(r'\[x:([a-z0-9-]+)\]', title):
            full = tag if tag in {v[0] for v in SMALL.values()} else (SMALL[tag][0] if tag in SMALL else tag)
            xbeats.setdefault((prefix, full), []).append(r)
# clue coverage: every clue planted in a row and paid in a row
for cid, c in clues.items():
    rs = refs.get(cid, [])
    if not any(k in ('plant', 'herring') for _, k, _ in rs): err(cid, 'clue is never planted in a ledger row')
    if not any(k in ('pay', 'debunk') for _, k, _ in rs): err(cid, 'clue is never paid off in a ledger row')
# truths and boss counts
def truths(aid):
    out = []; inside = False
    for line in arcs[aid]['body'].split('\n'):
        if re.match(r'^#+\s+.*truths', line, re.I): inside = True; continue
        if inside and re.match(r'^#+\s', line): break
        if inside and line.startswith('|'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if cells[0].lower().startswith('truth') or set(line.replace('|', '').strip()) <= set('-: '): continue
            out.append(cells)
    return out
for k, aid in BOSS.items():
    if aid not in arcs: err(aid, 'boss arc missing'); continue
    A = arcs[aid]
    base, careless, careful = A['rows']['BASE'], A['rows']['CARELESS'], A['rows']['CAREFUL']
    if not 16 <= len(base) <= 22: err(aid, 'BASE ledger has %d beats (want 16 to 22)' % len(base))
    if not 3 <= len(careless) <= 6: err(aid, 'CARELESS delta has %d beats (want 3 to 6)' % len(careless))
    if not 5 <= len(careful) <= 8: err(aid, 'CAREFUL delta has %d beats (want 5 to 8)' % len(careful))
    flags = ' '.join(r[7] for r in base)
    for need in ('boss:arrested', 'case:closed'):
        if need not in flags: err(aid, 'BASE ledger never sets %s' % need)
    seen = set(t.strip() for r in base + careless + careful for t in r[2].split(','))
    for o in OFFICERS:
        if o not in seen: err(aid, 'officer %s never appears' % o)
    rh = [c for c in clues if c.startswith(k + '-c') and clues[c]['rh']]
    if len(rh) < 3: err(aid, 'only %d red herring clues (want 3+)' % len(rh))
    tr = truths(aid)
    if len(tr) < 6: err(aid, 'only %d truths (want 6+)' % len(tr))
    for t in tr:
        ids = re.findall(r'[a-z0-9]+-c\d\d', t[2] if len(t) > 2 else '')
        days = sorted({clues[i]['planted'] for i in ids if i in clues and clues[i]['planted']})
        try: pay = int(re.sub(r'\D', '', t[3]))
        except Exception: pay = None
        if not pay or pay > 21:   # payoff day not in the table: take it from the clue files
            pays = [clues[i]['payoff'] for i in ids if i in clues and clues[i]['payoff']]
            pay = max(pays) if pays else None
        if len(ids) < 2 or len(days) < 2: err(aid + ' ' + t[0], 'truth needs 2+ clues on different days (has %s)' % ids)
        elif pay and days[-1] >= pay: err(aid + ' ' + t[0], 'a clue is planted on or after the payoff day d%02d' % pay)
        for i in ids:
            if i not in clues: err(aid + ' ' + t[0], 'clue %s has no file' % i)
    for sk, days in CROSS.items():
        if k in days:
            rows = xbeats.get((k, SMALL[sk][0]), [])
            if not rows: err(aid, 'no beat tagged [x:%s]' % SMALL[sk][0])
            elif not any(a <= days[k] <= b or a <= days[k] + 1 <= b for a, b in rows): err(aid, '[x:%s] beat not on d%02d' % (SMALL[sk][0], days[k]))
for sk, (aid, lo, hi) in SMALL.items():
    if aid not in arcs: err(aid, 'small arc missing'); continue
    A = arcs[aid]; base = A['rows']['BASE']
    if not 8 <= len(base) <= 14: err(aid, 'ledger has %d beats (want 8 to 14)' % len(base))
    if len(truths(aid)) < 3: err(aid, 'fewer than 3 truths')
    rh = [c for c in clues if c.startswith(sk + '-c') and clues[c]['rh']]
    if len(rh) < 2: err(aid, 'only %d red herring clues (want 2+)' % len(rh))
    first = {'s1': 9, 's2': 9, 's3': 9, 's4': 12, 's5': 11, 's6': 14, 's7': 17}[sk]   # the bridge payoff day (a crossing day: later crossings may repeat the pay token)
    c1 = clues.get(sk + '-c01')
    if not c1: err(aid, 'bridge clue %s-c01 missing' % sk)
    elif c1['payoff'] != first: err(aid, 'bridge clue payoff d%s, want first crossover day d%02d' % (c1['payoff'], first))
    for b in CROSS[sk]:
        if not re.search(r'\|\s*' + b + r'(-[a-z-]+)?\s*\|', A['body']): err(aid, 'Crossover table has no row for %s' % b)
if 'ordinary-police-work' not in arcs: err('ordinary-police-work', 'arc missing')
# questions and promises
for kind in ('questions', 'promises'):
    for p in glob.glob(os.path.join(ROOT, 'continuity', kind, '*.md')):
        n = os.path.basename(p)[:-3]
        if n == '_index': continue
        d, _ = fm(read(p))
        a, b = chap(d.get('introduced' if kind == 'questions' else 'planted')), chap(d.get('resolved' if kind == 'questions' else 'payoff'))
        if a is None or b is None: err(n, '%s file needs both days' % kind[:-1])
        elif b < a: err(n, 'resolved before introduced')
# text rules over the whole project
for p in glob.glob(os.path.join(ROOT, '**', '*.md'), recursive=True):
    t = read(p); rel = os.path.relpath(p, ROOT)
    for ch in ('—', '–'):
        if ch in t: err(rel, 'contains an em or en dash')
    m = BRIT.search(t)
    if m and not rel.startswith('notes') and rel != 'style-sheet.md': err(rel, 'British spelling "%s"' % m.group(0))
for b in bad: print(b)
print('\n%d findings; %d arcs, %d clues' % (len(bad), len(arcs), len(clues)))
sys.exit(1 if bad else 0)
