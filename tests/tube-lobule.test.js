import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PG_M, PG_J } from '../src/ui/veins-mesh-data.js';
import { tubeVertex, TUBE_LEVEL } from '../src/ui/tube-geo.js';
import { MAXT, MITRE_DEG, Z_GAP_MIN, lumenOrder, tubeVertexKnowsZ } from '../scripts/lobule-joins.mjs';

// The real lobule's data against the Tube renderer's buffers and caps (docs/recommendations/tube-renderer-lobule-plan.md, brief L-E).
// Node only: scripts/lobule-joins.mjs boots the lobule layer in jsdom with the GL stub and hands back what it gave the renderer. Each mode
// (blood only, with the lymph layer) is its own process, because the lobule is a module-level singleton; both start at once.

const SCRIPT = fileURLToPath(new URL('../scripts/lobule-joins.mjs', import.meta.url));
const BOOT_MS = 120000;
const boot = (lymph) => new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, '--json', ...(lymph ? ['--lymph'] : [])], { maxBuffer: 256 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`lobule-joins ${lymph ? '--lymph ' : ''}failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`lobule-joins gave no JSON: ${e.message}\n${out.slice(-500)}`)); }
  });
});
const runs = { 'blood only': boot(false), 'with lymph': boot(true) };
for (const p of Object.values(runs)) p.catch(() => {});   // (judged in the tests that await them)

const f4 = (x) => +Number(x).toFixed(4);

for (const [name, run] of Object.entries(runs)) {
  const lymph = name === 'with lymph';

  test(`lobule ${name}: every join is in exactly one patch group, none over PG_M vessels or PG_J joins`, { timeout: BOOT_MS + 10000 }, async (t) => {
    const a = await run;
    t.diagnostic(`rows ${a.rows}, joins ${a.joinsHanded}, patch groups ${a.groups}`);
    t.diagnostic(`vessels per group ${JSON.stringify(a.vesselsPerGroup)} (max ${a.maxVesselsPerGroup} of PG_M ${PG_M}); joins per group ${JSON.stringify(a.joinsPerGroup)} (max ${a.maxJoinsPerGroup} of PG_J ${PG_J})`);
    t.diagnostic(`group boxes overlapping ${a.overlapPairs} pairs, of which share a vessel ${a.overlapShare}; vessel length inside a join's reach ${(a.lengthInJoinReach * 100).toFixed(1)}%`);
    assert.ok(a.maxVesselsPerGroup <= PG_M, `a patch group holds ${a.maxVesselsPerGroup} vessels (PG_M ${PG_M})`);
    assert.ok(a.maxJoinsPerGroup <= PG_J, `a patch group holds ${a.maxJoinsPerGroup} joins (PG_J ${PG_J})`);
    assert.equal(a.PG_M, PG_M); assert.equal(a.PG_J, PG_J);
    // each join the lobule handed is in the groups once: the groups count them all, and no two are the same entry
    assert.equal(a.joinsUnique, a.joinsHanded, 'a join the lobule handed is in no group (or in two)');
    assert.equal(a.joinsInGroups, a.joinsHanded, 'the groups count a different number of joins than the lobule handed');
    assert.equal(a.distinctJoinsInGroups, a.joinsHanded, 'a join is listed twice in the groups');
  });

  test(`lobule ${name}: the rows fit MAXT and the Tube's index is a Uint16Array that holds them`, { timeout: BOOT_MS + 10000 }, async (t) => {
    const a = await run;
    t.diagnostic(`rows ${a.rows} of MAXT ${a.MAXT}, largest row id ${a.maxId}; tubeIndex(${MAXT}): ${a.index.nIndex} indices, largest ${a.index.maxIndex}, ${a.index.nVerts} vertices, ${a.index.rows} row ids`);
    assert.equal(a.MAXT, MAXT);
    assert.equal(MAXT, 320, 'the lobule changed MAXT: this harness and the brief say 320');
    assert.ok(a.rows <= MAXT, `${a.rows} rows do not fit ${MAXT}`);
    assert.ok(a.maxId < MAXT, `row id ${a.maxId} is past the last row ${MAXT - 1}`);
    assert.equal(a.index.rows, MAXT);
    assert.ok(a.index.isUint16, 'tubeIndex(320) index is not a Uint16Array');
    assert.ok(a.index.maxIndex < a.index.nVerts && a.index.maxIndex <= 65535, `index ${a.index.maxIndex} is past the vertex count ${a.index.nVerts} or the Uint16 range`);
    if (lymph) assert.ok(a.rows > 156, 'the lymph layer added no rows');
  });

  test(`lobule ${name}: every row is on tier 1 and the smallest gap between two z is at least ${Z_GAP_MIN}`, { timeout: BOOT_MS + 10000 }, async (t) => {
    const a = await run;
    t.diagnostic(`tiers ${JSON.stringify(a.tierHist)}`);
    t.diagnostic(`${a.zValues.length} distinct z: ${a.zValues.map(f4).join(' ')}; smallest gap ${f4(a.zGap.gap)} (between ${f4(a.zGap.lo)} and ${f4(a.zGap.hi)})`);
    assert.equal(a.minTier, 1, `a row is on tier ${a.minTier}`);
    assert.equal(a.maxTier, 1, `a row is on tier ${a.maxTier}`);
    assert.ok(a.zValues.length > 1);
    assert.ok(a.zGap.gap >= Z_GAP_MIN, `z ${f4(a.zGap.lo)} and ${f4(a.zGap.hi)} are only ${f4(a.zGap.gap)} apart: hK = 0.008 could reorder them`);
  });

  test(`lobule ${name}: with zK and hK, a higher z row's lowest lumen level is above a lower z row's highest`, { timeout: BOOT_MS + 10000 }, async (t) => {
    if (!tubeVertexKnowsZ()) return t.skip('tubeVertex has no zK / hK yet (thread A, brief L-A): skipped until it has');
    const a = await run, o = lumenOrder(a);
    t.diagnostic(`hRef ${f4(o.hRef)} (the largest radius); ${o.levels.map((k) => `z ${f4(k.z)}: ${f4(k.lo)}..${f4(k.hi)} (${k.rows} rows)`).join('; ')}`);
    assert.deepEqual(o.bad, [], `order not kept for ${o.bad.length} pair(s) of kinds`);
    for (const k of o.levels) assert.ok(k.lo >= TUBE_LEVEL.LUMEN0 - 1e-9 && k.hi <= TUBE_LEVEL.LUMEN0 + TUBE_LEVEL.LUMEN_H + 1e-9, `z ${k.z}: a lumen level leaves LUMEN0 .. LUMEN0 + LUMEN_H`);
  });

  test(`lobule ${name}: the sharpest joint is under ${MITRE_DEG.toFixed(0)} degrees (the mitre limit) or names its row`, { timeout: BOOT_MS + 10000 }, async (t) => {
    const a = await run;
    t.diagnostic(`sharpest joint ${a.sharpest.deg.toFixed(1)} degrees at row ${a.sharpest.row}, sample ${a.sharpest.at}; largest radius ${f4(a.radius.max)} (row ${a.radius.row}, from ${a.radius.source}), largest binning reach ${f4(a.radius.reachMax)}`);
    assert.equal(a.mitreDeg, MITRE_DEG);
    assert.ok(Math.abs(MITRE_DEG - 120) < 1e-9, `the mitre limit is ${MITRE_DEG} degrees, not 120`);
    assert.ok(a.sharpest.deg < MITRE_DEG, `row ${a.sharpest.row} turns ${a.sharpest.deg.toFixed(1)} degrees at sample ${a.sharpest.at}: past the mitre limit ${MITRE_DEG.toFixed(0)}`);
    assert.ok(a.radius.max > 0 && Number.isFinite(a.radius.max));
  });
}

// The lumen-order check itself, on the real rows, with a stand-in for tubeVertex that has the planned formula (so it runs before thread A's
// lands): kept at hK = 0.008, broken when hK is as large as a gap between kinds.
test('the lumen-order check sees a kept and a broken order (planned formula, real rows)', { timeout: BOOT_MS + 10000 }, async () => {
  const a = await runs['blood only'];
  const { LUMEN0, LUMEN_H } = TUBE_LEVEL;
  const planned = (P, R, at, o) => {   // today's height level, mapped onto LUMEN0 + LUMEN_H * clamp(zK * z + hK * height, 0, 1)
    const q = tubeVertex(P, R, at, { w: o.w, hRef: o.hRef, glow: false });
    if (q[2] < LUMEN0 - 1e-9) return q;
    const s = (q[2] - LUMEN0) / LUMEN_H;
    return [q[0], q[1], LUMEN0 + LUMEN_H * Math.min(1, Math.max(0, o.zK * o.z + o.hK * s))];
  };
  const kept = lumenOrder(a, { zK: 1, hK: 0.008, vertex: planned });
  assert.deepEqual(kept.bad, [], 'a planned zK = 1, hK = 0.008 should keep every kind in order');
  assert.equal(kept.levels.length, a.zValues.length);
  const broken = lumenOrder(a, { zK: 1, hK: 0.2, vertex: planned });
  assert.ok(broken.bad.length > 0, 'hK = 0.2 is bigger than the gaps between kinds, so some order must break');
});
