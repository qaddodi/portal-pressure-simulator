// The Tube's stage 3 (brief S3-D, 10 Nov 2026): the choice of stage, the programs' start and finish, the lumen target, and the lumen pass and the layer pass run against
// a stand-in GL (what is drawn, with which program, in which order). Node only; nothing here reads the text of src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tubeStage, stage3Start, stage3Finish, STAGE3_PROGRAMS, createLumenTarget } from '../src/ui/tube-stage2.js';
import { makeHarness } from './tube-pass-harness.js';

test('the stage is a pure function of (stage 2 ready, the query, stage 3 ready): 3 needs both, webs, and neither ?tube=1 nor ?tube=2', () => {
  const cases = [
    [true, '', true, 3, 'web'], [true, '?perf', true, 3, 'web'], [true, '?tube=2', true, 2, 'web'], [true, '?perf&tube=2&x', true, 2, 'web'], [true, '?tube=1', true, 1, 'patch'],
    [true, '?tubejoin=patch', true, 2, 'patch'], [true, '', false, 2, 'web'], [false, '', true, 1, 'patch'], [false, '', false, 1, 'patch'], [true, '?tube=3', true, 3, 'web'],
    [true, '?tube=21', true, 3, 'web'], [true, '?tube=2&tubejoin=web', true, 2, 'web'],
  ];
  for (const [ready, q, ready3, stage, joins] of cases) assert.deepEqual({ ...tubeStage(ready, q, ready3) }, { stage, joins }, `${ready} ${q} ${ready3}`);
});

const K = { F_SEL: 1, F_DIFFUSE: 2, F_SHADOW: 4, F_DOTTED: 8, F_NOCASE: 16, F_SPEC: 32, F_EDGE: 64, F_VEIL: 128, F_WHOLE: 256, LIFT_EASE_MAX: 1, LIFT_EASE_SHARE: 0.5, LUMEN2: 0x8000, ROW2_BITS: 11, VEIL_K: 0.6, EDGE: 'const float EDGE = 1.0;', ENT_W: 2048, N_SAMPLES: 64, MAX_TIERS: 24, S_OFF: 96, ALONG_GLSL: 'float alongAt(int id, float u) { return u; }' };
const comp = { COMP_FS: (plain, streak, heads, tube) => `// comp ${plain ? 'plain' : 'full'} ${tube}`, COMP_VS: '// vs', COMP_CELL_VS: '// cell vs' };

test('stage3Start starts the six programs by name: the lumen programs on the strip and web vertex shaders, the compositor builds on the compositor\'s', () => {
  const started = [];
  const gl = { deleted: [], deleteProgram(p) { this.deleted.push(p); } };
  const s = stage3Start(gl, (g, vs, fs) => { const x = { p: { n: started.length }, vs, fs }; started.push(x); return x; }, K, '// zoom', comp);
  assert.deepEqual(Object.keys(s), STAGE3_PROGRAMS);
  assert.equal(started.length, 6);
  assert.equal(s.tubeLumen.fs, s.tubeWebLumen.fs, 'one lumen text');
  assert.notEqual(s.tubeLumen.vs, s.tubeWebLumen.vs);
  assert.equal(s.compTube.fs, '// comp full 1');
  assert.equal(s.plainTube.fs, '// comp plain 1');
  assert.equal(s.compTubeCell.vs, '// cell vs');
  assert.equal(s.compTubeCell.fs, s.compTube.fs);
});

test('stage3Finish gives the six back, or none and the names that failed', () => {
  const gl = { deleted: [], deleteProgram(p) { this.deleted.push(p); } };
  const list = STAGE3_PROGRAMS.map((n, i) => ({ p: { i }, n }));
  const ok = stage3Finish(gl, (g, st) => ({ p: st.p, u: {} }), list);
  assert.deepEqual(ok.failed, []);
  assert.deepEqual(Object.keys(ok.P), ['lumen', 'webLumen', 'comp', 'compCell', 'plain', 'plainCell']);
  const bad = stage3Finish(gl, (g, st) => { if (st.n === 'compTubeCell') throw new Error('link'); return { p: st.p, u: {} }; }, list);
  assert.equal(bad.P, null);
  assert.deepEqual(bad.failed, ['compTubeCell']);
  assert.equal(gl.deleted.length, 6);
});

test('the lumen target is made once, made again when the layer\'s size changes, and freed', () => {
  const calls = [];
  const gl = new Proxy({}, { get: (_, k) => (/^[A-Z0-9_]+$/.test(k) ? k : (...a) => { calls.push([k, ...a.filter((x) => typeof x === 'number')]); return k.startsWith('create') ? { o: k } : undefined; }) });
  const T = createLumenTarget(gl);
  assert.equal(T.made, 0);
  T.ensure(640, 480);
  assert.equal(T.made, 1);
  assert.deepEqual(calls.filter((c) => c[0] === 'renderbufferStorage').map((c) => c.slice(1)), [[640, 480]]);
  assert.ok(calls.some((c) => c[0] === 'texImage2D' && c[2] === 640 && c[3] === 480));
  T.ensure(640, 480);
  assert.equal(T.made, 1, 'the same size: kept');
  T.ensure(800, 600);
  assert.equal(T.made, 2);
  assert.ok(T.tex());
  T.dispose();
  assert.ok(calls.some((c) => c[0] === 'deleteFramebuffer') && calls.some((c) => c[0] === 'deleteTexture') && calls.some((c) => c[0] === 'deleteRenderbuffer'));
});

const draws = (log) => log.filter((c) => c.call === 'strips' || c.call === 'patch');
const seq = (log) => draws(log).map((c) => `${c.prog}:${c.n}${c.mask === false ? ' pre' : ' col'}${c.mask === false ? '' : ' ' + c.depth}`);

test('the lumen pass: all prepasses (depth only), then all lumens (LEQUAL), strips with tubeLumen and webs with tubeWebLumen, the programs bound first', () => {
  const h = makeHarness({ withStage3: true });
  assert.equal(h.runLumen(), true);
  const webs = h.MG.lumWebs;
  assert.equal(webs, 4);
  assert.equal(h.MG.lumStrips, 3);
  assert.deepEqual(seq(h.log), ['tubeDepth:1 pre', 'tubeLean:2 pre', `tubeWebDepth:${webs} pre`, 'tubeLumen:3 col LEQUAL', `tubeWebLumen:${webs} col LEQUAL`]);
  const binds = h.log.filter((c) => c.call === 'lumenBind').map((c) => c.prog);
  assert.deepEqual(binds, ['tubeLumen', 'tubeWebLumen']);
  assert.ok(h.log.findIndex((c) => c.call === 'lumenBind') < h.log.findIndex((c) => c.call === 'strips'), 'the blood\'s uniforms are set before the first draw');
  assert.ok(!h.log.some((c) => c.call === 'invalidate' && c.what[0] !== 'DEPTH_ATTACHMENT'));
  const inv = h.log.filter((c) => c.call === 'invalidate');
  assert.equal(inv.length, 1, 'the depth is invalidated, once');
  assert.deepEqual(inv[0].what, ['DEPTH_ATTACHMENT']);
  assert.ok(h.log.findIndex((c) => c.call === 'invalidate') > h.log.findLastIndex((c) => c.call === 'strips'), 'after the last draw');
});

test('the lumen pass: no glow, no lift, no scratch layers, and no blend', () => {
  const h = makeHarness({ withStage3: true, tubeMutator: (t) => { t[1 * 52 + 43] = 0.5; t[1 * 52 + 47] = 0.1; } });
  h.runLumen();
  assert.ok(!draws(h.log).some((c) => c.prog === 'tubeStrip' || c.prog === 'tubePatch' || c.prog === 'tubeLean' && c.mask !== false), 'no glow pair');
  assert.equal(draws(h.log).filter((c) => c.prog === 'tubeLumen').length, 1);
});

test('the lumen pass: with tiers, every tier\'s prepass comes before any tier\'s lumen', () => {
  const h = makeHarness({ withStage3: true, tiers: [0, 1, 1] });
  h.runLumen();
  const s = seq(h.log), firstLumen = s.findIndex((x) => /^tube(Web)?Lumen/.test(x)), lastPre = s.map((x) => x.endsWith(' pre')).lastIndexOf(true);
  assert.ok(firstLumen > lastPre && lastPre >= 0, s.join(' | '));
  assert.ok(s.filter((x) => x.startsWith('tubeLumen')).length === 2, 'a lumen draw for each tier with rows');
});

test('the lumen pass draws nothing in stages 1 and 2', () => {
  for (const w3 of [false]) {
    const h = makeHarness({ withStage3: w3 });
    assert.equal(h.runLumen(), false);
    assert.equal(draws(h.log).length, 0);
  }
  const h = makeHarness({ withStage2: false, withStage3: true });   // stage 3 programs with no stage 2: stage 1
  assert.equal(h.runLumen(), false);
  assert.equal(draws(h.log).length, 0);
});

test('the layer pass in stage 3 writes no second flow target: draw buffers colour, the flow target, none, the picking one; restored whole at the end', () => {
  const h = makeHarness({ withStage3: true });
  h.run();
  const bufs = h.log.filter((c) => c.call === 'drawBuffers').map((c) => c.bufs);
  assert.ok(bufs.length > 0);
  const A3 = bufs[0];
  assert.equal(A3.length, 4);
  assert.equal(A3[2], 'NONE', 'the second flow target is not written');
  assert.deepEqual(bufs.at(-1), ['A'], 'the pass leaves the layer\'s own draw buffers');
  assert.match(h.gauges[0][1], /^tube 3: /);
});

test('stages 1 and 2: the layer pass keeps all its draw buffers; the gauge says tube 2', () => {
  const h = makeHarness();
  h.run();
  assert.ok(h.log.filter((c) => c.call === 'drawBuffers').every((c) => c.bufs.length === 1 && c.bufs[0] === 'A'));
  assert.match(h.gauges[0][1], /^tube 2: /);
});

test('the gauge text after the lumen pass: tube 3 with the layer pass\'s numbers and the lumen pass strips and webs', () => {
  const h = makeHarness({ withStage3: true });
  h.run();
  h.runLumen();
  assert.equal(h.tubePass.gaugeText(), 'tube 3: 2 passes, 3 strips (1 plain), 4 webs, lumen pass 3 strips 4 webs');
  assert.equal(h.tubePass.stage(), 3);
});

test('stage 3 programs lost mid-run: the next frame is stage 2, and the lumen pass draws nothing', () => {
  const h = makeHarness({ withStage3: true });
  assert.equal(h.tubePass.stage(), 3);
  const ok = h.E.tube3;
  Object.defineProperty(h.E, 'tube3', { get: () => null, configurable: true });
  assert.equal(h.tubePass.stage(), 2);
  assert.equal(h.runLumen(), false);
  Object.defineProperty(h.E, 'tube3', { get: () => ok, configurable: true });
  assert.equal(h.tubePass.stage(), 3);
});
