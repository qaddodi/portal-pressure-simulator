// Precondition for acceptance point 3 (vector-renderer-plan.md section 11; plan-r1 section 7): continuous blood through speed change and reversal.
// NOT PASSED. This file is a node precondition, not the acceptance: it tests partition rules, maths and scheduling, which cannot show seamless GPU
// rendering, stable streaks or pacing. The point is judged on the devices: a TIPS slide and a reversal slide, with the vessels drawing.
// Node judges (D's vec-blood-math.js, the JS mirror of the GLSL arithmetic, run with blood.js's own advanceStream): the stream's travelled
// distance has no jump across a speed step, a beat, a re-anchor (the blood clock's epoch) or a reversal. D's own test runs one scripted
// flow; this runs eight seeded random flows, so a case D did not think of is a case here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

// What each check waits for: a workstream's file that is not in the tree yet (or lacks the export named). While anything is missing the
// check is skipped, and the skip says what for, so a plain `npm test` shows what is left (plan 9.J, Phase 1).
const UI = new URL('../src/ui/', import.meta.url);
async function needs(list) {
  const lack = [], mods = {};
  for (const [who, file, names] of list) {
    if (!existsSync(new URL(file, UI))) { lack.push(`${who}: ${file}`); continue; }
    mods[file] = await import(new URL(file, UI).href);
    const no = names.filter((n) => !(n in mods[file]));
    if (no.length) lack.push(`${who}: ${file} to export ${no.join(', ')}`);
  }
  return { mods, skip: lack.length ? `waits for ${lack.join('; ')}` : false };
}

const d = await needs([['D', 'vec-blood-math.js', ['streamDistance', 'anchorStream', 'anchorOf', 'circDiff']], ['D', 'vec-blood-glsl.js', ['VEC_BLOOD_GLSL']]]);
const M = d.mods['vec-blood-math.js'];
const B = d.skip ? null : await import('../src/ui/blood.js');

// The same stream the app keeps (the field list of stage-blood.js's streams), run as the app runs it each frame: advanceStream, then the
// CPU's anchoring, then the distance the GPU shows on the blood clock.
const BT_SPAN = 32;   // (stage-blood.js: the blood clock's epoch moves on every 32 s, and every stream is anchored again)
const newStream = (seed) => ({ seed, vSlow: NaN, vFast: NaN, D: 0.5, hold: 0.5, settle: 0.5, vOld: 0.5, vm: NaN, v: 0.5, vd: 0.5, stasis: 0.5, drift: 0.5, aB: NaN, aA: 0, vp: 0, aD: 0.5, aV: 0.5, aT: 0.5, aS: 0.5, aR: 0.5 });
function run({ frames, dt, plan, speed, phasic, seed }) {
  const sm = newStream(seed), so = { speed, bt: 0, dt };
  let clock = 0, epoch = 0, prev = null;
  const out = [];
  for (let f = 0; f < frames; f++) {
    clock += dt;
    const reset = clock - epoch > BT_SPAN;
    if (reset) epoch = clock;
    const bT = clock - epoch, p = plan(clock);
    so.bt = bT;
    B.advanceStream(sm, p.vMean, p.vNow, dt, { phasic, speed, large: true, still: false, rev: p.rev, dt });
    M.anchorStream(sm, so, reset);
    const a = M.anchorOf(sm);
    out.push({ t: clock, shown: M.streamDistance(a, bT), vd: sm.vd, reset, rev: p.rev, anchored: !prev || prev.B0 !== a.B0 || prev.D !== a.D || prev.vd !== a.vd, before: prev && !reset ? M.streamDistance(prev, bT) : null });
    prev = { ...a };
  }
  return out;
}

// A seeded random flow: a base speed, a step of the mean at some moment, a beat, and one window where the flow runs the other way.
function scenario(n) {
  let s = 0x9e3779b9 ^ (n * 2654435761); const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const base = 6 + 34 * rnd(), stepAt = 4 + 30 * rnd(), mult = 0.4 + 2.6 * rnd(), beatHz = 0.8 + 1.4 * rnd(), depth = 0.6 * rnd();
  const revAt = 8 + 32 * rnd(), revLen = 3 + 9 * rnd();
  return { base, stepAt, mult, beatHz, depth, revAt, revLen, phasic: n % 2 === 0, speed: 0.6 + 0.4 * rnd(),
    plan: (t) => { const v = base * (t < stepAt ? 1 : mult), rev = t >= revAt && t < revAt + revLen, vMean = rev ? -v : v; return { vMean, vNow: vMean * (1 + depth * Math.sin(2 * Math.PI * beatHz * t)), rev }; } };
}

for (let n = 0; n < 8; n++) {
  test(`random flow ${n}: the distance never jumps across its speed step, beat, re-anchors and reversal, and a new anchor starts where the old stood`, { skip: d.skip }, () => {
    const sc = scenario(n), dt = 1 / 60;
    const fr = run({ frames: 4200, dt, plan: sc.plan, speed: sc.speed, phasic: sc.phasic, seed: n + 1 });
    assert.ok(fr.some((f) => f.reset), 'the run crosses the blood clock\'s epoch');
    assert.ok(fr.some((f) => f.rev) && fr.some((f) => !f.rev), 'the run has a reversal in it');
    for (let k = 1; k < fr.length; k++) {
      const moved = M.circDiff(fr[k - 1].shown, fr[k].shown);
      const bound = Math.max(Math.abs(fr[k - 1].vd), Math.abs(fr[k].vd)) * sc.speed * dt * 1.5 + 0.02;
      assert.ok(Math.abs(moved) <= bound, `frame ${k} (t=${fr[k].t.toFixed(2)}): moved ${moved.toFixed(4)}, the speed allows ${bound.toFixed(4)}`);
      if (fr[k].anchored && fr[k].before != null) assert.ok(Math.abs(M.circDiff(fr[k].before, fr[k].shown)) < 1e-6, `frame ${k}: a new anchor started ${M.circDiff(fr[k].before, fr[k].shown)} from where the old one stood`);
    }
  });
}

test('the reversal: the blood slows to a stop, stands for about the hold, then runs the other way, with no step in the distance', { skip: d.skip }, async () => {
  const { REVERSE_HOLD } = await import('../src/ui/blood.js');
  const dt = 1 / 60, plan = (t) => { const rev = t >= 10 && t < 30; return { vMean: rev ? -14 : 14, vNow: rev ? -14 : 14, rev }; };
  const fr = run({ frames: 2400, dt, plan, speed: 0.8, phasic: false, seed: 3 });
  const at = (t) => fr[Math.round(t / dt) - 1];
  assert.ok(M.circDiff(at(9).shown, at(9.9).shown) > 1, 'running forward before');
  assert.ok(M.circDiff(at(20).shown, at(21).shown) < -1, 'running back during');
  assert.ok(M.circDiff(at(34).shown, at(35).shown) > 1, 'running forward again after');
  for (const [from, to] of [[10, 14], [30, 34]]) {
    let still = 0, best = 0;
    for (const f of fr) if (f.t > from && f.t < to && Math.abs(M.circDiff(fr[Math.round(f.t / dt) - 2]?.shown ?? f.shown, f.shown)) < 1e-3) { still++; best = Math.max(best, still); } else still = 0;
    assert.ok(best * dt >= REVERSE_HOLD * 0.8, `from ${from} s: stood still ${(best * dt).toFixed(2)} s, the hold is ${REVERSE_HOLD} s`);
  }
});

test('a TIPS-like step: the mean speed triples in one frame and the distance goes on without a jump', { skip: d.skip }, () => {
  const dt = 1 / 60, plan = (t) => { const v = t < 5 ? 9 : 27; return { vMean: v, vNow: v, rev: false }; };
  const fr = run({ frames: 900, dt, plan, speed: 0.8, phasic: false, seed: 7 });
  for (let k = 1; k < fr.length; k++) {
    const moved = Math.abs(M.circDiff(fr[k - 1].shown, fr[k].shown)), bound = Math.max(Math.abs(fr[k - 1].vd), Math.abs(fr[k].vd)) * 0.8 * dt * 1.5 + 0.02;
    assert.ok(moved <= bound, `frame ${k} (t=${fr[k].t.toFixed(2)}): moved ${moved.toFixed(4)}, the display speed allows ${bound.toFixed(4)}`);
  }
});
