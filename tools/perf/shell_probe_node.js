// Node half of tools/perf/shell_probe.py --node: runs js/shell.js on the dumped plot geometry (index.json + one .bin per plot) and prints, per plot kind, the
// counts and the voxel time (node, one run after a warm-up). Usage: node shell_probe_node.js <dump dir> [options JSON]
const fs = require('fs'), path = require('path');
const Shell = require('../../js/shell.js');
const dir = process.argv[2], opts = JSON.parse(process.argv[3] || '{}');
const metas = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')));
const load = f => { const b = fs.readFileSync(path.join(dir, f)), np = b.readUInt32LE(0), ni = b.readUInt32LE(4); const ab = b.buffer.slice(b.byteOffset + 8, b.byteOffset + 8 + np*4 + ni*4); return { p: new Float32Array(ab, 0, np), i: new Uint32Array(ab, np*4, ni) }; };
const rows = [];
let first = true;
for (const m of metas){
  const g = load(m.file);
  if (first){ Shell.build([g], opts); first = false; }   // warm-up
  const t0 = process.hrtime.bigint(); const r = Shell.build([g], opts); const ms = Number(process.hrtime.bigint() - t0)/1e6;
  rows.push({ kind: m.kind, ij: m.i + ',' + m.j, ms, boxes: r.boxes.length, shell: r.stats.shellTris, tris: r.stats.tris, kept: r.stats.kept, share: r.stats.keptShare, cover: r.stats.coverage, voxels: r.stats.voxels });
}
const by = {}; for (const r of rows) (by[r.kind] || (by[r.kind] = [])).push(r);
console.log('node (voxel time per plot, ms): kind, plots, mean, max, voxels (mean)');
for (const k of Object.keys(by).sort()){ const l = by[k]; const mean = l.reduce((a, r) => a + r.ms, 0)/l.length, max = Math.max(...l.map(r => r.ms)), vox = l.reduce((a, r) => a + r.voxels, 0)/l.length;
  console.log('  %s %d  %s  %s  %s', k.padEnd(14), l.length, mean.toFixed(1).padStart(7), max.toFixed(1).padStart(7), Math.round(vox)); }
