import json, random
random.seed(7)
N = 22
MT_ROWS = [-4, 12]           # metro lines along j
HW_ROWS = [-15, 4]           # highways along j
HW_COLS = [15]               # highway along i
MEGAS = {'radio': (2,2), 'mall': (3,2), 'square': (5,5), 'police': (3,3), 'foundry': (6,4), 'market': (4,4), 'pagoda': (5,4), 'greenhouse': (5,4), 'spire': (3,3), 'bathhouse': (3,3), 'logistics': (6,6), 'club': (4,4)}
def corridor(i, j, pad):
    return any(abs(j - r) <= pad for r in MT_ROWS + HW_ROWS) or any(abs(i - c) <= pad for c in HW_COLS)
taken = set(); megas = []
for kind, (w, h) in sorted(MEGAS.items(), key=lambda kv: -kv[1][0]*kv[1][1]):
    for copy in range(2):
        done = False
        for j0 in range(-N + 1, N - h + 1):
            for i0 in range(-N + 1, N - w + 1):
                blk = [(i0 + a, j0 + b) for a in range(w) for b in range(h)]
                ring = [(i0 + a, j0 + b) for a in range(-1, w + 1) for b in range(-1, h + 1)]
                if any(corridor(i, j, 2) for i, j in blk) or any(p in taken for p in ring): continue
                # spread them out: skip spots too near a mega of the same kind
                if any(m['kind'] == kind and abs(m['i'] - i0) + abs(m['j'] - j0) < 14 for m in megas): continue
                taken.update(blk); megas.append({'id': 'm_%s_%d' % (kind, copy), 'kind': kind, 'i': i0, 'j': j0, 'w': w, 'h': h, 'levels': 1, 'seed': random.randrange(1, 10**9)}); done = True; break
            if done: break
        assert done, kind
ZONES = ['low', 'mid', 'high', 'ind']
cells = []; stats = {}
style = {"clutter": 1, "green": 1, "neon": 1}
stations = {(i, r) for r in MT_ROWS for i in (-20, 0, 20)}
lift_free = {(i, r + d) for (i, r) in stations for d in (-1, 1)} | stations
hw_ends = {(21, -15), (21, 4), (15, 21)}
for i in range(-N, N + 1):
    for j in range(-N, N + 1):
        secs = []
        if (i, j) not in taken and (i, j) not in lift_free and (i, j) not in hw_ends:
            z = ZONES[(i * 7 + j * 3 + (i * j) % 5) % 4]
            if any(abs(j - r) <= 1 for r in MT_ROWS): z, n = random.choice(['low', 'ind']), 1
            elif corridor(i, j, 1): z, n = random.choice(['low', 'ind', 'mid']), random.choice([1, 2])
            else: n = random.choice([1, 2, 2, 3, 3, 4])
            if z == 'high' and n == 1 and not corridor(i, j, 1): n = 2
            if (i + j) % 11 == 0 and not corridor(i, j, 1): secs = []   # a few open squares to breathe
            else: secs = [{'zone': (z if k == 0 else (z if z != 'ind' else random.choice(['ind', 'mid']))), 'seed': random.randrange(1, 10**9), 'style': style} for k in range(n)]
            for s in secs: stats[s['zone']] = stats.get(s['zone'], 0) + 1
        cells.append([i, j, secs, style, 'some', 0, 0])
store = {'neonIsland.v2': json.dumps(cells), 'neonIsland.megas': json.dumps(megas)}
json.dump({'name': 'maxcity', 'cam': {'x': 0, 'z': 0, 'zoom': 30, 'yaw': 0.7}, 'storage': store, 'edits': []}, open('maxcity_base.json', 'w'))
print(len(cells), 'plots', sum(1 for c in cells if c[2]), 'built', stats, len(megas), 'megas')
