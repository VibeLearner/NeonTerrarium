// Node half of tools/perf/shell_probe.py --node: runs js/shell.js on the dumped plot geometry (index.json + one .bin per plot or megastructure) and prints, per kind,
// the voxel time and the time of each stage (node, after a warm-up run) and the grid size. Usage: node shell_probe_node.js <dump dir> [options JSON] [boxes per megastructure plot]
const fs = require('fs'), path = require('path');
const Shell = require('../../js/shell.js');
const dir = process.argv[2], opts = JSON.parse(process.argv[3] || '{}'), perCell = Number(process.argv[4] || 0);
const metas = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')));
const load = f => {
  const b = fs.readFileSync(path.join(dir, f)), np = b.readUInt32LE(0), ni = b.readUInt32LE(4), nv = b.readUInt32LE(8);
  const vis = []; for (let k = 0; k < nv; k++) vis.push([b.readUInt32LE(12 + k*8), b.readUInt32LE(16 + k*8)]);
  const o = 12 + nv*8, ab = b.buffer.slice(b.byteOffset + o, b.byteOffset + o + np*4 + ni*4);
  return { p: new Float32Array(ab, 0, np), i: new Uint32Array(ab, np*4, ni), vis };
};
const rows = [];
for (const m of metas){
  const g = load(m.file), o = Object.assign({}, opts); if (m.cells && perCell) o.maxBoxes = Math.max(opts.maxBoxes || 12, Math.round(perCell*m.cells));
  const r0 = Shell.build([g], o), r = Shell.build([g], o);   // (the first is the warm-up)
  rows.push({ kind: m.kind, ms: r.stats.timeMs, total: r.stats.timeMs.total, voxels: r.stats.voxels, boxes: r.boxes.length, same: r0.boxes.length === r.boxes.length });
}
const by = {}; for (const r of rows) (by[r.kind.startsWith('mega') ? 'mega' : r.kind] || (by[r.kind.startsWith('mega') ? 'mega' : r.kind] = [])).push(r);
const pad = (v, n) => String(v).padStart(n);
console.log('node, per plot: voxel time (ms) total mean / max, then the mean of each stage; voxels (grid cells, mean)');
console.log('  ' + 'kind'.padEnd(16) + pad('n', 4) + pad('mean', 8) + pad('max', 8) + pad('surf', 7) + pad('fill', 7) + pad('open', 7) + pad('boxes', 7) + pad('snap', 7) + pad('keep', 7) + pad('voxels', 10));
for (const k of Object.keys(by).sort()){
  const l = by[k], mean = f => l.reduce((a, r) => a + f(r), 0)/l.length;
  console.log('  ' + k.padEnd(16) + pad(l.length, 4) + pad(mean(r => r.total).toFixed(1), 8) + pad(Math.max(...l.map(r => r.total)).toFixed(1), 8) + ['surface', 'fill', 'open', 'boxes', 'snap', 'keep'].map(s => pad(mean(r => r.ms[s]).toFixed(1), 7)).join('') + pad(Math.round(mean(r => r.voxels)), 10));
}
