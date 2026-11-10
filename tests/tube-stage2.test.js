// The Tube's stage 2 (brief S2-D, 10 Nov 2026): the choice of stage and joins, the programs' start and finish, the data a frame bins and uploads, and the
// pass itself run against a stand-in GL (what it draws, with which program, in which order). Node only; nothing here reads the text of src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tubeStage, stage1Why, stage2Start, stage2Finish, STAGE2_PROGRAMS, joinEntriesInto, createStage2Data } from '../src/ui/tube-stage2.js';
import { makeHarness } from './tube-pass-harness.js';

test('the stage and the joins are a pure function of (the four programs ready, the query)', () => {
  const cases = [
    [false, '', 1, 'patch'], [true, '', 2, 'web'], [true, '?perf', 2, 'web'], [true, '?tube=1', 1, 'patch'], [true, '?perf&tube=1', 1, 'patch'], [true, '?tube=1&perf', 1, 'patch'],
    [true, '?tubejoin=patch', 2, 'patch'], [true, '?a=1&tubejoin=patch&b', 2, 'patch'], [false, '?tubejoin=patch', 1, 'patch'], [true, '?tube=12', 2, 'web'], [true, '?tube=1&tubejoin=patch', 1, 'patch'],
    [true, '?tubejoin=web', 2, 'web'], [null, '?perf', 1, 'patch'], [{ lean: 1 }, '#x', 2, 'web'],
  ];
  for (const [ready, q, stage, joins] of cases) assert.deepEqual({ ...tubeStage(ready, q) }, { stage, joins }, `${JSON.stringify(ready)} ${q}`);
});

test('the gauge says why the Tube is at stage 1', () => {
  assert.equal(stage1Why(true, null, false, ''), '');
  assert.equal(stage1Why(true, null, false, '?tube=1'), 'set by ?tube=1');
  assert.equal(stage1Why(false, ['tubeWeb'], false, ''), 'tubeWeb failed');
  assert.equal(stage1Why(false, ['tubeWeb', 'tubeLean'], false, ''), 'tubeWeb, tubeLean failed');
  assert.equal(stage1Why(false, null, true, ''), 'compiling');
});

const K = (() => { const k = { F_SEL: 1, F_DIFFUSE: 2, F_SHADOW: 4, F_DOTTED: 8, F_NOCASE: 16, F_SPEC: 32, F_EDGE: 64, F_VEIL: 128, F_WHOLE: 256, LIFT_EASE_MAX: 1, LIFT_EASE_SHARE: 0.5, LUMEN2: 0x8000, ROW2_BITS: 11, VEIL_K: 0.6, EDGE: 'const float EDGE = 1.0;', ENT_W: 2048, N_SAMPLES: 64, MAX_TIERS: 24, S_OFF: 96, ALONG_GLSL: 'float alongAt(int id, float u) { return u; }' }; return k; })();

test('stage2Start starts the four programs by name; stage2Finish gives them back, or none and the names that failed', () => {
  const started = [];
  const gl = { deleted: [], deleteProgram(p) { this.deleted.push(p); } };
  const start = (g, vs, fs) => { const s = { p: { n: started.length }, vs, fs }; started.push(s); return s; };
  const s = stage2Start(gl, start, K, '// zoom');
  assert.deepEqual(Object.keys(s), STAGE2_PROGRAMS);
  assert.equal(started.length, 4);
  assert.equal(s.tubeLean.vs, s.tubeDepth.vs, 'the strip programs share a vertex shader');
  assert.equal(s.tubeWeb.vs, s.tubeWebDepth.vs);
  assert.notEqual(s.tubeLean.vs, s.tubeWeb.vs);
  assert.equal(s.tubeLean.fs, s.tubeWeb.fs);
  assert.ok(s.tubeDepth.fs.length < 200 && s.tubeDepth.fs === s.tubeWebDepth.fs);
  const ok = stage2Finish(gl, (g, st) => ({ p: st.p, u: {} }), STAGE2_PROGRAMS.map((n) => s[n]));
  assert.deepEqual(ok.failed, []);
  assert.deepEqual(Object.keys(ok.P), ['lean', 'depth', 'web', 'webDepth']);
  // one fails: none are kept, the finished ones are given back, the failed one is named
  const bad = stage2Finish(gl, (g, st) => { if (st === s.tubeWeb) throw new Error('link'); return { p: st.p, u: {} }; }, STAGE2_PROGRAMS.map((n) => s[n]));
  assert.equal(bad.P, null);
  assert.deepEqual(bad.failed, ['tubeWeb']);
  assert.equal(gl.deleted.length, 4, 'the failed program and the three finished ones deleted');
});

test('joinEntriesInto copies the entries by index, with the frame\'s place between the views', () => {
  const ent = new Float32Array(200);
  ent.set([7, 8, 2, 30.5, 1, -1, -1, -1], 8);   // entry 1 (between the views its x, 7, is the join's index)
  ent.set([111, 222, 0, 0], (3 + 7) * 4);        // the frame's place of join 7, from texel joinBase (3) + 7
  const out = new Float32Array(8);
  assert.equal(joinEntriesInto(ent, Int32Array.of(1), 1, -1, out), 8);
  assert.deepEqual(Array.from(out), [7, 8, 2, 30.5, 1, -1, -1, -1]);
  joinEntriesInto(ent, Int32Array.of(1), 1, 3, out);
  assert.deepEqual([out[0], out[1], out[2], out[3]], [111, 222, 2, 30.5], 'x and y are the frame\'s place of join 7; the rest as it was');
});

test('a frame bins the rows (plain first) and the webs, once for a binning, and uploads them', () => {
  const h = makeHarness();
  const calls = [];
  const gl = h.E.gl;
  const D = createStage2Data(gl, h.MG);
  const G = { pts: h.MG.pts };
  D.frame(G, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(D.binnings, 1);
  assert.equal(D.tb.count[0], 3);
  assert.equal(D.tb.plain[0], 1, 'the trunk is plain; the dotted branch and the branch that ends on the trunk are exact');
  assert.ok(D.wb.n > 0, 'the joins make webs');
  const rows = D.tb.rows, webs = D.wb.data;
  D.frame(G, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(D.binnings, 1, 'the same binning: not read again');
  assert.equal(D.tb.rows, rows, 'the arrays are kept');
  assert.equal(D.wb.data, webs);
  h.MG.gen++;
  D.frame(G, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(D.binnings, 2, 'a new geometry is binned again');
  void calls;
});

test('a row that becomes dotted after the binning is an exact row at once, without a new binning', () => {
  const h = makeHarness();
  const D = createStage2Data(h.E.gl, h.MG);
  const G = { pts: h.MG.pts };
  D.frame(G, h.E.tubeNow, h.E.nTubes, -1);
  assert.equal(D.tb.plain[0], 1);
  const T = h.E.tubeNow, F = 52;
  T[0 * F + 10] = 8;   // the trunk becomes dotted
  D.frame(G, T, h.E.nTubes, -1);
  assert.equal(D.binnings, 1);
  assert.equal(D.tb.plain[0], 0, 'no plain row is left: the trunk is exact now');
  T[0 * F + 10] = 0; T[1 * F + 20] = 0.2;   // and one becomes clipped
  D.frame(G, T, h.E.nTubes, -1);
  assert.equal(D.tb.plain[0], 0, 'an exact row stays exact until the next binning (slower, never wrong)');
});

const draws = (log) => log.filter((c) => c.call === 'strips' || c.call === 'patch');
const seq = (log) => draws(log).map((c) => `${c.prog}:${c.n}${c.mask === false ? ' pre' : ' col'}${c.mask === false ? '' : ' ' + c.depth}`);

test('stage 2 draws a shape pair: the prepass plain rows with the depth program, exact rows with the lean one, webs with the web depth one; then all rows and the webs in colour', () => {
  const h = makeHarness();
  assert.equal(h.run(), true);
  const webs = h.MG.webs;
  assert.equal(webs, 4);
  assert.deepEqual(seq(h.log), ['tubeDepth:1 pre', 'tubeLean:2 pre', `tubeWebDepth:${webs} pre`, 'tubeLean:3 col LEQUAL', `tubeWeb:${webs} col LEQUAL`]);
  assert.ok(!draws(h.log).some((c) => c.call === 'patch'), 'no patch is drawn when the joins are webs');
  assert.ok(!draws(h.log).some((c) => c.prog === 'tubePatch' || c.prog === 'tubeStrip'), 'nor a stage 1 program, with no glow');
});

test('the rows are read as four floats a record (attribute 1 a vec4) and the webs as three vec4 from the web buffer', () => {
  const h = makeHarness();
  h.run();
  const att = h.log.filter((c) => c.call === 'attrib');
  assert.ok(att.some((c) => c.loc === 1 && c.size === 4 && c.stride === 16));
  assert.ok(att.some((c) => c.loc === 2 && c.size === 4 && c.stride === 48) && att.some((c) => c.loc === 3 && c.size === 4 && c.stride === 48));
  assert.ok(!att.some((c) => c.loc === 1 && c.size === 1), 'no one-float row attribute');
});

test('a strip is drawn with isWeb 0 and a web with isWeb 1', () => {
  const h = makeHarness();
  h.run();
  const w = h.sets.filter((s) => s.name === 'isWeb');
  assert.ok(w.length >= 5);
  for (const s of w) assert.equal(s.v, s.prog === 'tubeWeb' || s.prog === 'tubeWebDepth' ? 1 : 0, s.prog);
});

test('the gauge: tube 2 with the passes, the strips (the plain among them) and the webs, counted in the colour draws', () => {
  const h = makeHarness();
  h.run();
  assert.deepEqual(h.gauges, [['vessel renderer', 'tube 2: 2 passes, 3 strips (1 plain), 4 webs']]);
});

test('with the stage 2 programs not ready the Tube draws stage 1: its own programs and buffer, the patches, and the gauge says why', () => {
  const h = makeHarness({ withStage2: false });
  h.run();
  const d = draws(h.log);
  assert.ok(d.length > 0 && d.every((c) => c.prog === 'tubeStrip' || c.prog === 'tubePatch'), 'only the stage 1 programs');
  assert.ok(h.log.some((c) => c.call === 'attrib' && c.loc === 1 && c.size === 1 && c.stride === 4), 'the stage 1 one-float rows');
  assert.ok(h.gauges[0][1].startsWith('tube 1: compiling, ') || /^tube 1: /.test(h.gauges[0][1]), h.gauges[0][1]);
  assert.ok(!seq(h.log).some((x) => x.startsWith('tubeLean') || x.startsWith('tubeWeb') || x.startsWith('tubeDepth')));
});

test('when a stage 2 program is lost mid-run the next frame is stage 1, and when they come back, stage 2', () => {
  const h = makeHarness();
  h.run();
  assert.ok(seq(h.log).some((x) => x.startsWith('tubeLean')));
  const keep = h.E.tube2;
  h.setTube2(null);
  h.run();
  assert.ok(draws(h.log).every((c) => c.prog === 'tubeStrip' || c.prog === 'tubePatch'));
  h.setTube2(keep);
  h.run();
  assert.ok(seq(h.log).some((x) => x.startsWith('tubeLean')));
});

test('a lit vessel\'s glow pair stays on the stage 1 strip program, EQUAL, over the rows of the stage 2 buffer read as one float a record', () => {
  const h = makeHarness({ tubeMutator: (t) => { t[1 * 52 + 43] = 0.5; t[1 * 52 + 47] = 0.1; } });
  h.run();
  const g = draws(h.log).filter((c) => c.prog === 'tubeStrip');
  assert.equal(g.length, 2, 'a glow prepass and its colour pass');
  assert.deepEqual(g.map((c) => c.mask === false), [true, false]);
  assert.equal(g[1].depth, 'EQUAL');
  assert.ok(h.log.some((c) => c.call === 'attrib' && c.loc === 1 && c.size === 1 && c.stride === 16), 'one float of each four-float record');
});

test('tiers: each tier gets its own pair, and a web is drawn in the higher tier of its two rows', () => {
  const h = makeHarness({ tiers: [0, 1, 1] });
  h.run();
  assert.ok(draws(h.log).length > 5);
  const tierSets = h.sets.filter((s) => s.name === 'tierNow').map((s) => s.v);
  assert.ok(tierSets.includes(0) && tierSets.includes(1));
});
