import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { N_SAMPLES } from '../src/ui/veins-mesh.js';
import { WEB_FLOATS, WEB_ARC, WEB_MIN_DEG, WEB_MAX_DEG, webGeometry } from '../src/ui/tube-joint.js';
import { webInstances, joinLegs, tubeRows, TUBE_ROW_FLOATS, TUBE_NO_END } from '../src/ui/tube-data.js';
import { loadCapture, polyDist, lineDist } from './tube-web-helpers.js';

// The Tube's webs and row records on the REAL joins (brief S2-J): the figure (anatomy and circuit) and the lobule (blood only, and with the lymph layer).
// Node only: tests/tube-web-capture.mjs boots the real stage or the real lobule in jsdom with the GL stub and prints the rows, their radii and the join
// entries the renderer was given. Each capture is its own process (the lobule is a module-level singleton); all start at once.

const SCRIPT = fileURLToPath(new URL('./tube-web-capture.mjs', import.meta.url));
const BOOT_MS = 180000;
const boot = (mode, ...extra) => new Promise((resolve, reject) => {
  execFile(process.execPath, [SCRIPT, mode, ...extra], { maxBuffer: 512 * 1024 * 1024, timeout: BOOT_MS }, (err, out, errOut) => {
    if (err) return reject(new Error(`tube-web-capture ${mode} failed: ${err.message}\n${errOut}`));
    const line = out.trim().split('\n').filter((l) => l.startsWith('{')).pop();
    try { resolve(JSON.parse(line)); } catch (e) { reject(new Error(`tube-web-capture gave no JSON: ${e.message}\n${out.slice(-300)}`)); }
  });
});
const runs = { figure: boot('figure'), lobule: boot('lobule'), 'lobule with lymph': boot('lobule', '--lymph') };
for (const p of Object.values(runs)) p.catch(() => {});   // (judged in the tests that await them)
const sets = [];   // [name, promise of a capture]
sets.push(['figure anatomy', runs.figure.then((f) => f.anatomy)], ['figure circuit', runs.figure.then((f) => f.circuit)], ['lobule', runs.lobule], ['lobule with lymph', runs['lobule with lymph']]);
for (const [, p] of sets) p.catch(() => {});

const AA = 0.4;
const f2 = (x) => +Number(x).toFixed(2);

for (const [name, run] of sets) {
  test(`${name}: webs on the real joins: counts, legs and the joins left without a web`, { timeout: BOOT_MS + 20000 }, async (t) => {
    const d = loadCapture(await run);
    const out = webInstances(d.ent, d.tube, d.pts, {});
    // the joins by number of legs, and why a join with legs made no web
    const seen = new Set(), legHist = {}, why = {}, noWeb = [];
    const webJoins = new Set();
    for (let n = 0; n < out.count; n++) webJoins.add(`${f2(out.at[2 * n])},${f2(out.at[2 * n + 1])}`);
    for (let e = 0; e < d.ent.length / 8; e++) {
      const q = e * 8;
      if (!(d.ent[q + 2] > 0)) continue;
      const key = Array.from(d.ent.subarray(q, q + 8)).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const L = joinLegs(d.ent, q, d.pts, d.nRows);
      legHist[L.n] = (legHist[L.n] || 0) + 1;
      if (L.n >= 2 && !webJoins.has(`${f2(d.ent[q])},${f2(d.ent[q + 1])}`)) {
        const fill = d.ent[q + 3] - Math.floor(d.ent[q + 3]);
        const reason = !(Math.floor(d.ent[q + 3]) * 0.01 * Math.min(1, fill / 0.99) > 0) ? 'no fillet' : 'every neighbouring pair of legs is under 20 or over 170 degrees apart (a straight run, or legs side by side)';
        why[reason] = (why[reason] || 0) + 1;
        noWeb.push(`rows ${[...new Set(L.row)].join('+')} at (${f2(d.ent[q])}, ${f2(d.ent[q + 1])}): ${reason}`);
      }
    }
    t.diagnostic(`${seen.size} joins (${d.ent.length / 8} entries, repeats included); joins by number of legs ${JSON.stringify(legHist)}; webs ${out.count} (by legs of their join ${JSON.stringify(Array.from(out.kinds).map((v, i) => [i, v]).filter(([, v]) => v).reduce((o, [i, v]) => ({ ...o, [i]: v }), {}))}); pairs left out for their angle ${out.empty}`);
    t.diagnostic(`joins with two legs or more and no web: ${noWeb.length} ${JSON.stringify(why)}${noWeb.length ? '\n  ' + noWeb.slice(0, 12).join('\n  ') : ''}`);
    assert.ok(out.count > 0, 'no web on any real join');
    assert.equal(out.joins, Object.entries(legHist).filter(([n]) => +n >= 2).reduce((s, [, v]) => s + v, 0), 'joins read');
    // stable: a second call gives the same webs in the same buffer
    const data = out.data, first = Array.from(out.data.subarray(0, out.count * WEB_FLOATS)), n0 = out.count;
    webInstances(d.ent, d.tube, d.pts, out);
    assert.equal(out.data, data); assert.equal(out.count, n0); assert.deepEqual(Array.from(out.data.subarray(0, n0 * WEB_FLOATS)), first);
    // every record is whole: rows that exist, a sample and a direction, a fillet and a reach, an owner in 0..2
    for (let n = 0; n < out.count; n++) {
      const r = out.data.subarray(n * WEB_FLOATS, (n + 1) * WEB_FLOATS);
      assert.ok(d.P[r[0]] && d.P[r[4]], `web ${n}: a row without points`);
      for (const o of [0, 4]) { assert.ok(Number.isInteger(r[o + 1]) && r[o + 1] >= 0 && r[o + 1] < N_SAMPLES); assert.ok(r[o + 2] === 1 || r[o + 2] === -1); }
      assert.equal(r[3], 1); assert.equal(r[7], -1);
      assert.ok(r[8] > 0 && r[9] > 0 && [0, 1, 2].includes(r[10]));
    }
  });

  test(`${name}: every real web is tangent to both of its walls, its fill stays on the pocket side of both, its skirt stops short of the centre`, { timeout: BOOT_MS + 20000 }, async (t) => {
    const d = loadCapture(await run);
    const out = webInstances(d.ent, d.tube, d.pts, {});
    let nonEmpty = 0, empty = 0, worstTangent = 0, worstSide = 0;
    const pen = [];
    for (let n = 0; n < out.count; n++) {
      const rec = out.data.subarray(n * WEB_FLOATS, (n + 1) * WEB_FLOATS), a = rec[0], b = rec[4];
      const g = webGeometry(d.P[a], d.R[a], d.P[b], d.R[b], rec, AA);
      if (g.empty) { empty++; continue; }
      nonEmpty++;
      const label = `web ${n} (rows ${a}, ${b})`;
      // tangent to the two walls (the legs' wall lines), within 1e-3
      const dA = lineDist(g.wa[0], g.wa[1], g.A.d[0], g.A.d[1], g.O[0], g.O[1]), dB = lineDist(g.wb[0], g.wb[1], g.B.d[0], g.B.d[1], g.O[0], g.O[1]);
      worstTangent = Math.max(worstTangent, Math.abs(dA - g.rho), Math.abs(dB - g.rho));
      assert.ok(Math.abs(dA - g.rho) < 1e-3 && Math.abs(dB - g.rho) < 1e-3, `${label}: the arc is ${dA} and ${dB} from the walls, its radius ${g.rho}`);
      for (const q of g.arc) assert.ok(Math.abs(Math.hypot(q[0] - g.O[0], q[1] - g.O[1]) - g.rho) < 1e-6);
      // the fill is on the pocket side of both wall lines (the legs' own model of the lumen): outside each leg's straight lumen by 1e-3
      for (const q of [g.C, ...g.arc]) {
        for (const [leg, w] of [[g.A, g.wa], [g.B, g.wb]]) {
          const side = (q[0] - w[0]) * leg.n[0] + (q[1] - w[1]) * leg.n[1];   // along the leg's wall normal (out of the lumen is positive)
          worstSide = Math.min(worstSide, side);
          assert.ok(side >= -1e-3, `${label}: a fill vertex lies ${-side} inside a leg's straight lumen`);
        }
        // against the real (curved) polylines: the penetration, as a share of the larger radius; reported, and bounded below
        pen.push(Math.max(g.A.r - polyDist(d.P[a], q[0], q[1]), g.B.r - polyDist(d.P[b], q[0], q[1]), 0) / Math.max(g.A.r, g.B.r));
      }
      // the skirt never crosses O
      assert.ok(g.w > 0 && g.w <= 0.98 * g.rho + 1e-12, `${label}: skirt ${g.w} of fillet ${g.rho}`);
      assert.equal(g.arc.length, WEB_ARC + 1);
    }
    pen.sort((x, y) => x - y);
    const share = pen.filter((x) => x > 0.3).length / pen.length;
    t.diagnostic(`${nonEmpty} webs placed, ${empty} empty (zero area); fill against the real curved lumen: median penetration ${f2(pen[pen.length >> 1])} of a radius, 90th percentile ${f2(pen[Math.floor(pen.length * 0.9)])}, ${f2(share * 100)} percent of the vertices more than 0.3 radius inside; worst tangent error ${worstTangent.toExponential(1)}`);
    assert.ok(nonEmpty > 0);
    assert.ok(share <= 0.05, `${f2(share * 100)} percent of the fill vertices lie more than 0.3 radius inside a real lumen: the straight wall lines drift off these vessels`);
    assert.ok(WEB_MIN_DEG > 0 && WEB_MAX_DEG > WEB_MIN_DEG);
  });

  test(`${name}: no web's straight edges hang in empty space: the real walls stay within reach of them (the fault of 10 Nov: fins past the walls)`, { timeout: BOOT_MS + 20000 }, async (t) => {
    const d = loadCapture(await run);
    const out = webInstances(d.ent, d.tube, d.pts, {});
    // free(q): how far q lies outside both members' real lumens (negative: inside one). The fan's edges C->Ta and C->Tb run along the legs' wall lines: on the real wall,
    // free is 0; where the vessel bends away from its straight line it grows, and that gap is a sliver of the web's colour in empty space.
    const lumenGap = (row, q) => {
      let best = Infinity;
      const P = d.P[row], R = d.R[row];
      for (let j = 0; j < N_SAMPLES - 1; j++) {
        const ax = P[2 * j], ay = P[2 * j + 1], dx = P[2 * j + 2] - ax, dy = P[2 * j + 3] - ay;
        const u = Math.min(1, Math.max(0, ((q[0] - ax) * dx + (q[1] - ay) * dy) / (dx * dx + dy * dy || 1e-300)));
        best = Math.min(best, Math.hypot(q[0] - ax - u * dx, q[1] - ay - u * dy) - (R[j] * (1 - u) + R[j + 1] * u));
      }
      return best;
    };
    const rel = [];
    for (let n = 0; n < out.count; n++) {
      const rec = out.data.subarray(n * WEB_FLOATS, (n + 1) * WEB_FLOATS), a = rec[0], b = rec[4];
      const g = webGeometry(d.P[a], d.R[a], d.P[b], d.R[b], rec, AA);
      if (g.empty) continue;
      let worst = -Infinity;
      for (let k = 0; k <= 10; k++) for (const T of [g.Ta, g.Tb]) {
        const q = [g.C[0] + (T[0] - g.C[0]) * (k / 10), g.C[1] + (T[1] - g.C[1]) * (k / 10)];
        worst = Math.max(worst, Math.min(lumenGap(a, q), lumenGap(b, q)));
      }
      rel.push(worst / g.Rm);
    }
    rel.sort((x, y) => x - y);
    const at = (p) => rel[Math.min(rel.length - 1, Math.floor(rel.length * p))];
    t.diagnostic(`${rel.length} webs: edge gap to the real walls, share of the larger radius: median ${f2(at(0.5))}, 90th percentile ${f2(at(0.9))}, worst ${f2(rel[rel.length - 1])}`);
    assert.ok(at(0.9) <= 0.25, `the 90th percentile of the edge gap is ${f2(at(0.9))} radii`);
    assert.ok(rel[rel.length - 1] <= 0.6, `the worst edge gap is ${f2(rel[rel.length - 1])} radii: a fin of web colour in empty space`);
  });

  test(`${name}: row records on the real data: ends carry the right trunk row and sample`, { timeout: BOOT_MS + 20000 }, async (t) => {
    const d = loadCapture(await run);
    const rows = tubeRows(d.tube, d.nRows, d.ent, {}, d.pts);
    let ends = 0, exact = 0, clipped = 0, dotted = 0, continues = 0;
    // each end flagged is a leg of some join whose trunk is the row stored, at the sample stored, and the end is the nearest sample of the row to that join
    for (const r of d.rows) {
      const o = r.id * TUBE_ROW_FLOATS;
      assert.equal(rows.rows[o], r.id);
      const kind = rows.rows[o + 3] - 2;
      if (kind === 1) exact++;
      if (d.tube[r.id * 52 + 20] > 1e-6 || d.tube[r.id * 52 + 21] < 1 - 1e-6) clipped++;
      if ((d.tube[r.id * 52 + 10] & 8) !== 0) dotted++;
      for (const [slot, end] of [[1, 0], [2, N_SAMPLES - 1]]) {
        const v = rows.rows[o + slot];
        if (v === TUBE_NO_END) continue;
        ends++;
        assert.equal(rows.rows[o + 3], 3, `row ${r.id} has an end but is not exact`);
        const cont = v <= -2, code = cont ? -(v + 2) : v, tRow = Math.floor(code / N_SAMPLES), tSample = code % N_SAMPLES;
        if (cont) {
          continues++;
          // the partner's end points back at this row, at this row's end sample
          const back = rows.rows[tRow * TUBE_ROW_FLOATS + (tSample === 0 ? 1 : 2)];
          assert.equal(back, -(2 + r.id * N_SAMPLES + end), `row ${r.id} continues row ${tRow}, which does not continue it back`);
        }
        let found = false;
        for (let e = 0; e < d.ent.length / 8 && !found; e++) {
          const q = e * 8;
          if (!(d.ent[q + 2] > 0)) continue;
          const L = joinLegs(d.ent, q, d.pts, d.nRows);
          let mine = false, theirs = false, through = false;
          for (let a = 0; a < L.n; a++) {
            if (L.row[a] === r.id && L.sample[a] === end) mine = true;
            if (L.row[a] === tRow && L.sample[a] === tSample && (cont || L.mark[a] > 0.1 || L.row.filter((x) => x === tRow).length === 2 || rows.rows[tRow * TUBE_ROW_FLOATS + (tSample === 0 ? 1 : 2)] <= -2)) theirs = true;
            if (L.row[a] === tRow && L.row.filter((x) => x === tRow).length === 2) through = true;
          }
          if (!mine || !theirs) continue;
          const trunkIsPair = rows.rows[tRow * TUBE_ROW_FLOATS + (tSample === 0 ? 1 : 2)] <= -2;   // (no row runs through: the target is the first row of the join's continuing pair)
          if (cont ? L.row.filter((x) => x === r.id).length === 1 && L.row.filter((x) => x === tRow).length === 1 : through || trunkIsPair || L.mark.some((m) => m > 0.1)) found = true;   // (a continuation: two rows' end legs of one join)
        }
        assert.ok(found, `row ${r.id} end ${end} says it ${cont ? 'continues' : 'ends on'} row ${tRow} sample ${tSample}, but no join of the data has that`);
      }
      if (rows.rows[o + 1] === TUBE_NO_END && rows.rows[o + 2] === TUBE_NO_END) {
        const isClip = d.tube[r.id * 52 + 20] > 1e-6 || d.tube[r.id * 52 + 21] < 1 - 1e-6, isDot = (d.tube[r.id * 52 + 10] & 8) !== 0;
        assert.equal(kind, isClip || isDot ? 1 : 0, `row ${r.id}`);
      }
    }
    t.diagnostic(`${d.rows.length} rows: ${exact} exact (${ends} ends on a vessel or continuing one, of which ${continues} continuations, ${clipped} clipped, ${dotted} dotted), ${d.rows.length - exact} plain`);
  });
}
