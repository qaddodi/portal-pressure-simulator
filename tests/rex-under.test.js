// The Meso-Rex bypass passes UNDER the vessels it crosses and is joined to none of them (17 Nov 2026, Mohammad: "meso rex shunt is going and joining with the splenic
// vein, wrong, it should go under it"). The model never connected them (REX runs SMV -> LPV); the picture did: REX and the splenic vein's last stretch (SV_CONF) lay in one
// draw tier, and two vessels in one tier merge where they cross (the taller lumen wins, no outline between them). The vessels REX crosses are drawn a tier above it while it is
// shown (anatomy.js REX_UNDER, stage.js levelTier). Part 1 reads the drawn courses, so a new crossing cannot be left in one tier; part 2 boots the real figure (node only, no GPU).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BACK_EDGES, CIRCUIT_PATH, EDGE_PATH, REX_UNDER } from '../src/ui/anatomy.js';
import { EDGES, PORTAL_TERRITORY, isStent } from '../src/engine/portal/topology.js';

const EBY = Object.fromEntries(EDGES.map((e) => [e.id, e]));
const SHUNTS_OVER = ['TIPS', 'DIPS', 'C6', 'S_DSR', 'S_PC', 'C8', 'S_MC', 'REX'];   // (stage.js: the shunts drawn in the portal tree's tier)
const PORTAL_NAMED = ['PV_TRUNK', 'PV_TRUNK_1', 'PVH_R', 'PVH_R_1', 'PVH_R_2', 'PVH_L', 'PVH_L_1', 'SMV_CONF', 'SV_CONF'];
/** Whether a vessel is drawn in the tier REX is in (the portal tree's: stage.js x.front and x.over). */
const inRexTier = (id) => {
  const e = EBY[id];
  if (!e || e.kind === 'artery' || BACK_EDGES.has(id)) return false;
  if (e.kind === 'vein' && PORTAL_TERRITORY.has(e.to) && PORTAL_TERRITORY.has(e.from || '')) return true;
  return PORTAL_NAMED.includes(id) || SHUNTS_OVER.includes(id) || isStent(e);
};
function sample(d) {
  const t = d.match(/[MCLQ]|-?\d+\.?\d*/g), pts = [];
  let i = 0, cur, cmd;
  while (i < t.length) {
    if (/[MCLQ]/.test(t[i])) { cmd = t[i++]; continue; }
    if (cmd === 'M' || cmd === 'L') { cur = [+t[i], +t[i + 1]]; i += 2; pts.push(cur); } else if (cmd === 'C') {
      const [p0, p1, p2, p3] = [cur, [+t[i], +t[i + 1]], [+t[i + 2], +t[i + 3]], [+t[i + 4], +t[i + 5]]];
      i += 6;
      for (let k = 1; k <= 40; k++) { const u = k / 40, v = 1 - u; pts.push([0, 1].map((c) => v * v * v * p0[c] + 3 * v * v * u * p1[c] + 3 * v * u * u * p2[c] + u * u * u * p3[c])); }
      cur = p3;
    } else i++;
  }
  return pts;
}
function crossings(A, B) {
  const out = [];
  for (let i = 1; i < A.length; i++) for (let j = 1; j < B.length; j++) {
    const [a, b, c, d] = [A[i - 1], A[i], B[j - 1], B[j]], den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (!den) continue;
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den, u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  return out;
}
const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;

test('every vessel the Meso-Rex bypass crosses part-way along, in the same tier, is one it passes under (REX_UNDER), in both views', () => {
  let found = 0;
  for (const [view, P] of [['anatomy', EDGE_PATH], ['circuit', CIRCUIT_PATH]]) {
    const R = sample(P.REX), ends = [R[0], R[R.length - 1]];
    for (const id of Object.keys(P)) {
      if (id === 'REX' || !inRexTier(id)) continue;
      const S = sample(P[id]), se = [S[0], S[S.length - 1]];
      // (A crossing within 30 units of an end of either is a meeting at a node, a join or a divergence (two shunts leaving the SMV run together for 25 units), not a pass.)
      const mid = crossings(R, S).filter((p) => !ends.some((e) => near(p, e, 30)) && !se.some((e) => near(p, e, 30)));
      if (!mid.length) continue;
      found++;
      assert.ok(REX_UNDER.has(id), `${view}: the Meso-Rex bypass crosses ${id} at ${mid[0].map(Math.round)} in one tier, so the two merge as a join: add ${id} to REX_UNDER (anatomy.js)`);
    }
  }
  assert.ok(found >= 3, `the crossings REX_UNDER lists are the ones in the figure (${found})`);
  for (const id of REX_UNDER) assert.ok(inRexTier(id), `${id} is in the bypass's tier (else it needs no lift)`);
});

const SCRIPT = fileURLToPath(new URL('./tube-web-capture.mjs', import.meta.url));
const BOOT_MS = 240000;
const boot = (params) => new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, 'figure', '--params', JSON.stringify(params)], { maxBuffer: 512 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`tube-web-capture failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`tube-web-capture gave no JSON: ${e.message}\n${out.slice(-300)}`)); }
  });
});
const TF = 52, T_TIER = 8, T_FLAGS = 10, F_SHUNT = 1024;
const rowsOf = (view) => Object.fromEntries(view.rows.map((r) => [r.edge, { tier: view.tube[r.id * TF + T_TIER], flags: view.tube[r.id * TF + T_FLAGS] }]));

test('on the real figure, with the bypass shown, the vessels it passes under draw in a tier above it (both views); without it they are where they were', { timeout: BOOT_MS * 2 + 20000 }, async () => {
  const on = await boot({ rex: true }), off = await boot({ rex: false });
  for (const view of ['anatomy', 'circuit']) {
    const a = rowsOf(on[view]), b = rowsOf(off[view]);
    assert.ok(a.REX, `${view}: the bypass is in the figure`);
    for (const id of ['SV_CONF', 'LGV_CONF']) {
      assert.ok(a[id].tier > a.REX.tier, `${view}: ${id} (tier ${a[id].tier}) is drawn above the bypass (tier ${a.REX.tier}), which passes under it`);
      assert.ok((a[id].flags & F_SHUNT) !== 0, `${view}: ${id} keeps its corners' fillets across the tiers`);
      assert.equal(b[id].tier, a.REX.tier, `${view}: without the bypass ${id} is in the portal tree's tier, as before`);
      assert.equal(b[id].flags & F_SHUNT, 0, `${view}: without the bypass ${id} has no shunt flag`);
    }
    // (The splenic vein's other stretches and the vessels the bypass leaves and joins stay in its tier: it is joined to them, not under them.)
    for (const id of ['SMV_CONF', 'SV_MID']) assert.equal(a[id].tier, a.REX.tier, `${view}: ${id} stays in the bypass's tier`);
  }
});
