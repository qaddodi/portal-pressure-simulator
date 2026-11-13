// The Tube's glow program wired in (brief PD part 4, 10 Nov 2026): started and finished on its own, used by the glow pairs (MP.GLOW, MP.UP) in every stage, the
// strip program when it is missing, and named by the ?perf gauge when it failed. Node only; nothing here reads the text of src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glowSources, glowStart, glowFinish, GLOW_PROGRAMS, stage2Sources } from '../src/ui/tube-stage2.js';
import { makeHarness } from './tube-pass-harness.js';

const K = { F_SEL: 1, F_DIFFUSE: 2, F_SHADOW: 4, F_DOTTED: 8, F_NOCASE: 16, F_SPEC: 32, F_EDGE: 64, F_VEIL: 128, F_WHOLE: 256, LIFT_EASE_MAX: 1, LIFT_EASE_SHARE: 0.5, LUMEN2: 0x8000, ROW2_BITS: 11, VEIL_K: 0.6,
  EDGE: 'const float EDGE = 1.0;', ENT_W: 2048, N_SAMPLES: 64, MAX_TIERS: 24, S_OFF: 96, ALONG_GLSL: 'float alongAt(int id, float u) { return u; }' };
const lit = (t) => { t[1 * 52 + 43] = 0.5; t[1 * 52 + 47] = 0.1; };   // row 1 glows
const strips = (log) => log.filter((c) => c.call === 'strips');

test('glowStart starts one program, the strip vertex shader over the short glow fragment shader; glowFinish gives it back, or null and the name', () => {
  const src = glowSources(K, '// zoom');
  assert.deepEqual(Object.keys(src), GLOW_PROGRAMS);
  const two = stage2Sources(K, '// zoom');
  assert.equal(src.tubeGlow.vs, two.tubeLean.vs, 'the strip\'s vertex shader, as the lean program has it');
  assert.ok(src.tubeGlow.fs.length < two.tubeLean.fs.length, 'a fragment shader shorter than the lean one');
  const gl = { deleted: [], deleteProgram(p) { this.deleted.push(p); } };
  const made = [];
  const s = glowStart(gl, (g, vs, fs) => { const st = { p: { n: made.length }, vs, fs }; made.push(st); return st; }, K, '// zoom', (type, text) => text);
  assert.equal(made.length, 1);
  const ok = glowFinish(gl, (g, st) => ({ p: st.p, u: {} }), [s.tubeGlow]);
  assert.deepEqual(ok.failed, []);
  assert.ok(ok.P);
  const bad = glowFinish(gl, () => { throw new Error('link'); }, [s.tubeGlow]);
  assert.equal(bad.P, null);
  assert.deepEqual(bad.failed, ['tubeGlow']);
  assert.equal(gl.deleted.length, 1);
});

test('stage 2: a lit vessel\'s glow pair draws with the glow program (prepass, then colour); the shape passes keep the lean program', () => {
  const h = makeHarness({ withGlow: true, tubeMutator: lit });
  h.run();
  const g = strips(h.log).filter((c) => c.prog === 'tubeGlow');
  assert.equal(g.length, 2, 'a glow prepass and its colour pass');
  assert.deepEqual(g.map((c) => c.mask === false), [true, false]);
  assert.ok(!strips(h.log).some((c) => c.prog === 'tubeStrip'), 'the strip program draws no glow when the glow program is ready');
  assert.ok(strips(h.log).some((c) => c.prog === 'tubeLean'), 'the shapes keep the lean program');
  assert.ok(h.sets.some((s) => s.prog === 'tubeGlow' && s.name === 'mPass'), 'the glow program is given the pass uniforms');
});

test('no glow program: the glow pair keeps the strip program, as before', () => {
  const h = makeHarness({ withGlow: false, tubeMutator: lit });
  h.run();
  assert.equal(strips(h.log).filter((c) => c.prog === 'tubeStrip').length, 2);
  assert.ok(!strips(h.log).some((c) => c.prog === 'tubeGlow'));
});

test('stage 1 draws its glow pair with the glow program too', () => {
  const h = makeHarness({ withGlow: true, withStage2: false, tubeMutator: lit });
  h.run();
  assert.equal(strips(h.log).filter((c) => c.prog === 'tubeGlow').length, 2);
  assert.ok(strips(h.log).some((c) => c.prog === 'tubeStrip'), 'the shapes keep the stage 1 strip program');
});

test('a vessel that is not lit draws no glow program at all, and sets none up', () => {
  const h = makeHarness({ withGlow: true });
  h.run();
  assert.ok(!strips(h.log).some((c) => c.prog === 'tubeGlow'));
  assert.ok(!h.sets.some((s) => s.prog === 'tubeGlow'));
});

test('?perf names the glow program when it failed', () => {
  const h = makeHarness({ withGlow: false, glowFailed: ['tubeGlow'], tubeMutator: lit });
  h.run();
  assert.match(h.gauges.map((x) => x[1]).join('\n'), /tubeGlow failed/);
  const ok = makeHarness({ withGlow: true, tubeMutator: lit });
  ok.run();
  assert.doesNotMatch(ok.gauges.map((x) => x[1]).join('\n'), /failed/);
});
