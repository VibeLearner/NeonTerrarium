# Neon Terrarium: builds the Tree Crown Lab page (treelab.html, published as an artifact) from template.html and the game's own sprite code,
# so the lab always shows exactly what the game draws: js/spritegen.js (the core) and js/spritegen_trees.js (the tree tops), inlined, and the
# tree tops' sizes and variant count read from js/sprites.js and js/spritegen.js.
#   python3 tools/treelab/build.py   ->   tools/treelab/treelab.html
import json, os, re
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
sizes = re.search(r"Object\.assign\(SPR\.size, (\{ tc_[^}]*\})\)", rd('js/sprites.js')).group(1)
sizes = json.loads(re.sub(r'(\w+):', r'"\1":', sizes))
count = max(int(n) for n in re.findall(r"tc_\w+: (\d+)", re.search(r"Object\.assign\(SG\.COUNT, \{ tc_[^}]*\}", rd('js/spritegen.js')).group(0)))
code = rd('js/spritegen.js') + '\n' + rd('js/spritegen_trees.js')
html = rd('tools/treelab/template.html')
html = html.replace('/*SIZES*/{}', json.dumps(sizes)).replace('/*COUNT*/8', str(count)).replace('/*SPRITEGEN*/', code)
open(os.path.join(ROOT, 'tools/treelab/treelab.html'), 'w', encoding='utf-8').write(html)
print('treelab.html:', len(sizes), 'kinds,', count, 'variants each,', len(html), 'bytes')
