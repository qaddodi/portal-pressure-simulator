// A collateral or shunt that ends on another vessel really joins it (Mohammad, 13 Nov 2026, twice: "the gastrorenal shunt doesn't open on the renal vein side").
// The left renal vein lies in a fainter tier than a collateral drawn at full strength, and websByTier dropped every fillet web between two tiers unless one of the two
// rows was a shunt's (F_SHUNT): the gastrorenal and splenorenal shunts met the vein at a right angle with no fillet, as a pipe laid across it. stage-vessels.js now flags
// a collateral's row (the vessel itself, at full strength) as it does a shunt's. This boots the real figure (tests/tube-web-capture.mjs, the preset's model and the
// collaterals it opens) and checks the rows the renderer is given and the webs it draws: node only, no GPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webInstances, websByTier, F_SHUNT } from '../src/ui/tube-data.js';
import { webGeometry, WEB_FLOATS } from '../src/ui/tube-joint.js';
import { EDGES } from '../src/engine/topology.js';
import { loadCapture } from './tube-web-helpers.js';

const SCRIPT = fileURLToPath(new URL('./tube-web-capture.mjs', import.meta.url));
const BOOT_MS = 240000;
const TIER_NET = 16, T_TIER = 8, T_FLAGS = 10, TF = 52;
const boot = (preset) => new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, 'figure', '--preset', preset], { maxBuffer: 512 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`tube-web-capture ${preset} failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`tube-web-capture gave no JSON: ${e.message}\n${out.slice(-300)}`)); }
  });
});
const kindOf = Object.fromEntries(EDGES.map((e) => [e.id, e.kind]));
// The gastrorenal shunt (gastric-varix) and the spontaneous splenorenal shunt (cirr-hepatofugal), each with its end on the left renal vein.
const RUNS = [['gastric-varix', 'C5'], ['cirr-hepatofugal', 'C6']];
const runs = Object.fromEntries(RUNS.map(([p]) => [p, boot(p)]));
for (const p of Object.values(runs)) p.catch(() => {});

/** The webs of a view: each with its two rows' edges, whether it has a shape, and whether websByTier draws it (as the stage calls it, mixed tiers dropped). */
function websOf(view) {
  const d = loadCapture(view), edge = {};
  for (const r of view.rows) edge[r.id] = r.edge;
  const out = webInstances(d.ent, d.tube, d.pts, {});
  const by = websByTier(out.data, out.count, d.tube, {}, null, true);
  const drawn = new Set();
  for (let p = 0; p < by.n; p++) drawn.add(`${by.data[p * WEB_FLOATS]},${by.data[p * WEB_FLOATS + 4]},${by.data[p * WEB_FLOATS + 2]},${by.data[p * WEB_FLOATS + 6]}`);
  const webs = [];
  for (let n = 0; n < out.count; n++) {
    const rec = out.data.subarray(n * WEB_FLOATS, (n + 1) * WEB_FLOATS), a = rec[0], b = rec[4];
    const g = webGeometry(d.P[a], d.R[a], d.P[b], d.R[b], rec, 0.4);
    webs.push({ a, b, ea: edge[a], eb: edge[b], empty: g.empty, drawn: drawn.has(`${a},${b},${rec[2]},${rec[6]}`) });
  }
  return { d, webs, edge };
}

for (const [preset, shunt] of RUNS) {
  for (const view of ['anatomy', 'circuit']) {
    test(`${preset}, ${view}: the ${shunt} shunt's row carries the shunt flag and every fillet web at its ends is drawn, on the renal vein as on any vessel`, { timeout: BOOT_MS + 20000 }, async () => {
      const cap = (await runs[preset])[view];
      const { d, webs } = websOf(cap);
      const rows = cap.rows.filter((r) => r.edge === shunt && r.kind === 'v');
      assert.equal(rows.length, 1, `${shunt} is in the figure`);
      const row = rows[0].id;
      assert.ok(d.tube[row * TF + T_TIER] >= TIER_NET, `${shunt} is drawn at full strength`);
      assert.ok((Math.floor(d.tube[row * TF + T_FLAGS] + 0.5) & F_SHUNT) !== 0, `${shunt} carries F_SHUNT`);
      const mine = webs.filter((w) => !w.empty && (w.a === row || w.b === row));
      assert.ok(mine.length >= 2, `${shunt} has fillets at its ends (${mine.length})`);
      const onRenal = mine.filter((w) => [w.ea, w.eb].some((e) => e === 'V_KID_L' || e === 'LRV_IVC'));
      // (The gastrorenal shunt lands at a right angle, a fillet on each side; the splenorenal shunt comes in at a slant, and its acute side is a plain V by design, MOUTH_WEB_DEG.)
      assert.ok(onRenal.length >= (shunt === 'C5' ? 2 : 1), `${shunt} has fillets at its mouth on the left renal vein (${onRenal.length})`);
      const lost = mine.filter((w) => !w.drawn);
      assert.equal(lost.length, 0, `fillets of ${shunt} dropped: ${lost.map((w) => `${w.ea}/${w.eb}`).join(', ')}`);
    });
  }
}

test('every collateral drawn at full strength carries the shunt flag, and none of its fillet webs is dropped for the tier of the vessel beside it', { timeout: BOOT_MS + 20000 }, async () => {
  for (const [preset] of RUNS) {
    const full = await runs[preset];
    for (const view of ['anatomy', 'circuit']) {
      const cap = full[view], { d, webs } = websOf(cap);
      const coll = new Set();
      for (const r of cap.rows) {
        if (r.kind !== 'v' || kindOf[r.edge] !== 'collateral' || d.tube[r.id * TF + T_TIER] < TIER_NET) continue;
        coll.add(r.id);
        assert.ok((Math.floor(d.tube[r.id * TF + T_FLAGS] + 0.5) & F_SHUNT) !== 0, `${preset} ${view}: collateral ${r.edge} has no shunt flag`);
      }
      assert.ok(coll.size >= 1, `${preset} ${view}: the collaterals the preset opens are in the figure (${coll.size})`);
      const lost = webs.filter((w) => !w.empty && !w.drawn && (coll.has(w.a) || coll.has(w.b)));
      assert.equal(lost.length, 0, `${preset} ${view}: dropped ${lost.map((w) => `${w.ea}/${w.eb}`).join(', ')}`);
    }
  }
});
