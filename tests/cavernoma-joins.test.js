// What the cavernoma (the periportal collaterals of the chronic portal vein thrombosis, edge C8) is joined to, on the real figure: its two ends open into the trunk of the portal vein
// (the inflow below the clot and the hilum above it) and nothing else does (13 Nov 2026, Mohammad: "the cavernomatous veins around the portal vein ... connect to the coronary vein").
// The coronary vein's end lay within the join reach of the cavernoma's channels, so the join pass (vein-joins.js) opened it into one of them, a fillet and a shared lumen, and the
// tied halves of the fine channel ended under it on purpose. JOIN_REFUSED (anatomy.js) keeps any vessel's end from opening into the cavernoma. This boots the real figure
// (tests/tube-web-capture.mjs, the preset's model) and reads the join entries the renderer is given: node only, no GPU. The anatomy only: in the circuit the vessels meet at
// the nodes of the diagram, where the coronary vein and the cavernoma both end by design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./tube-web-capture.mjs', import.meta.url));
const BOOT_MS = 240000;
const boot = (preset) => new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, 'figure', '--preset', preset], { maxBuffer: 512 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`tube-web-capture ${preset} failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`tube-web-capture gave no JSON: ${e.message}\n${out.slice(-300)}`)); }
  });
});

test('chronic PVT, anatomy: the cavernoma joins the portal trunk at its two ends and no other vessel (not the coronary vein), and every one of its channels is joined at both ends', { timeout: BOOT_MS + 20000 }, async () => {
  const view = (await boot('pvt-chronic')).anatomy, edge = {}, kind = {};
  for (const r of view.rows) { edge[r.id] = r.edge; kind[r.id] = r.kind; }
  const cav = view.rows.filter((r) => r.edge === 'C8');
  assert.ok(cav.length >= 2, `the cavernoma's main channel and its strand are in the figure (${cav.length} rows)`);
  assert.ok(view.rows.some((r) => r.edge === 'LGV_CONF'), 'the coronary vein is in the figure');
  const ends = new Map(cav.map((r) => [r.id, new Set()]));   // the end of each channel that has a join: 0 first, 1 last
  const seen = new Set();
  for (const e of view.joins) {
    // (A member of an entry is its row, with a quarter or three eighths added to the trunk the others end on.)
    const rows = e.slice(4).filter((v) => v >= 0).map((v) => Math.floor(v + 0.001));
    if (!rows.some((r) => edge[r] === 'C8')) continue;
    const others = new Set(rows.filter((r) => edge[r] !== 'C8').map((r) => edge[r]));
    for (const o of others) assert.equal(o, 'PV_TRUNK', `the cavernoma is joined to ${o}, at ${e[0].toFixed(0)},${e[1].toFixed(0)} (only the portal trunk's inflow and hilum may be)`);
    seen.add(`${e[0].toFixed(0)},${e[1].toFixed(0)}`);
    for (const r of rows) if (ends.has(r)) {
      const row = cav.find((c) => c.id === r), d = (i) => Math.hypot(e[0] - row.P[2 * i], e[1] - row.P[2 * i + 1]);
      ends.get(r).add(d(0) < d(63) ? 0 : 1);
    }
  }
  assert.ok(seen.size >= 2, `the cavernoma has joins at both its ends (${[...seen]})`);
  for (const [r, s] of ends) assert.equal(s.size, 2, `channel ${r} (${kind[r]}) is joined at ${s.size} of its two ends`);
});
