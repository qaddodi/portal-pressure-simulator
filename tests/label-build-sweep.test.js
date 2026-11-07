import { stageSource } from './stage-src.js';
// The label pool's deferred builds (stage.js blockBuild, renderBlock, late): a label asked for by an old layout is never built after a
// newer one, and a label's new pieces land in the task that moves it (2 Nov 2026, code sweep for glitches).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLateQueue } from '../src/ui/late-queue.js';
import { dropLabel } from '../src/ui/drop-label.js';

const STAGE = stageSource();

// A rest-pass stand-in: passes wait in a list until the test runs them.
function rig() {
  const passes = new Map(); let id = 0; const wrote = [];
  const q = createLateQueue((op, a, b) => wrote.push([op, a, b]), (fn) => { passes.set(++id, fn); return id; }, (n) => passes.delete(n));
  const runPasses = () => { for (const [n, fn] of [...passes]) { passes.delete(n); fn(); } };
  return { q, passes, wrote, runPasses };
}

test('late ops are applied in the order asked, by one pass', () => {
  const { q, passes, wrote, runPasses } = rig();
  q.push('kids', 'g', [1]); q.push('fill', 'sp', 'red'); q.push('kids', 'g', [2]);
  assert.equal(passes.size, 1, 'one pass for the lot');
  assert.deepEqual(wrote, [], 'nothing written on the spot');
  runPasses();
  assert.deepEqual(wrote.map((w) => w[0] + ':' + w[2]), ['kids:1', 'fill:red', 'kids:2']);
  assert.equal(q.pending, 0);
});

test('now() applies the queue in this task and drops the pass that waited for it', () => {
  const { q, passes, wrote, runPasses } = rig();
  q.push('kids', 'g', ['new']);
  q.push('fill', 'sp', 'red');
  q.now();
  assert.deepEqual(wrote.map((w) => w[0]), ['kids', 'fill'], 'the pieces and their fills land together');
  assert.equal(passes.size, 0, 'the waiting pass was cancelled');
  runPasses();
  assert.equal(wrote.length, 2, 'nothing is written twice');
  // (A later ask starts a pass of its own.)
  q.push('label', 'g2');
  assert.equal(passes.size, 1);
  runPasses();
  assert.equal(wrote.at(-1)[0], 'label');
});

test('now() with nothing queued writes nothing and leaves a later ask working', () => {
  const { q, passes, wrote } = rig();
  q.now();
  assert.equal(wrote.length, 0);
  q.push('add', 'p', 'c');
  assert.equal(passes.size, 1);
});

test('an op that asks for more while the queue is applied gets a pass of its own', () => {
  const wrote = []; const passes = new Map(); let id = 0;
  let q;
  q = createLateQueue((op) => { wrote.push(op); if (op === 'cathadd') q.push('after'); }, (fn) => { passes.set(++id, fn); return id; }, (n) => passes.delete(n));
  q.push('cathadd');
  q.now();
  assert.deepEqual(wrote, ['cathadd']);
  assert.equal(passes.size, 1, 'the ask made while applying is not lost');
  for (const [n, fn] of [...passes]) { passes.delete(n); fn(); }
  assert.deepEqual(wrote, ['cathadd', 'after']);
});

test('stage.js: the build pass lands a label\'s pieces with its move, and a newer layout drops older builds', () => {
  const build = STAGE.slice(STAGE.indexOf('function blockBuild()'), STAGE.indexOf('const blockSig ='));
  assert.match(build, /renderBlock\(it\);\s*\}\s*[^]*lateQueue\.now\(\);[^]*labelGlSync\?\.\(\);\s*\}/, 'the queue is applied before the pass ends, then the built labels go to the GPU (review #3)');
  assert.match(STAGE, /const lateQueue = createLateQueue\(\(op, a, b\) => lateRun\(op, a, b\), restPass, cancelRest\);/);
  // The layout's own sweep: what it wants replaces what an earlier layout asked to have built.
  assert.match(STAGE, /(?:live\.)?(?:live\.)?(?:live\.)?laidFrame = (?:live\.)?(?:live\.)?frameNo; blockWant\.clear\(\);\s*for \(const it of out\) renderBlock\(it\);/);
  // A label is stamped with the layout that wanted it, not the one now being solved (a sliced solve moves frameNo on first).
  const render = STAGE.slice(STAGE.indexOf('function renderBlock(it)'), STAGE.indexOf('// A presenter slide\'s term'));
  assert.match(render, /b\.seen = (?:live\.)?(?:live\.)?(?:live\.)?laidFrame;[^]*b\.seen = (?:live\.)?(?:live\.)?(?:live\.)?laidFrame;/);
  assert.doesNotMatch(render, /\.seen = (?:live\.)?frameNo/);
});

// A pill as stage.js cathLabels makes it: a glass and GPU words, each counting its disposals.
const pill = () => {
  const n = { glass: 0, k: 0, b: 0, u: 0 };
  return { n, el: { _glass: { dispose: () => n.glass++ }, _kW: { dispose: () => n.k++ }, _bW: { dispose: () => n.b++ }, _uW: { dispose: () => n.u++ } } };
};

test('dropping the HVPG summary lets go of its readings\' glass and words, not just its own', () => {
  const rows = [pill(), pill()], calc = pill();
  const sum = { _rows: rows.map((r) => r.el), _calc: calc.el };   // (the summary itself has no glass or words)
  dropLabel(sum);
  for (const p of [...rows, calc]) assert.deepEqual(p.n, { glass: 1, k: 1, b: 1, u: 1 }, 'each reading\'s glass and words are disposed');
  dropLabel(sum);   // (a second drop is the owner\'s double call: it asks each to dispose again, which each answers as a no-op)
  assert.equal(calc.n.glass, 2);
});

test('dropping a plain reading, or nothing, or one with no words, does not throw', () => {
  const one = pill();
  dropLabel(one.el);
  assert.deepEqual(one.n, { glass: 1, k: 1, b: 1, u: 1 });
  dropLabel(null);
  dropLabel({});
  dropLabel({ _rows: [null], _calc: null });
  const sp = { n: 0 };
  dropLabel({ _spW: [{ dispose: () => sp.n++ }, null, { dispose: () => sp.n++ }] });
  assert.equal(sp.n, 2);
});

test('stage.js drops callouts through the one helper', () => {
  assert.match(STAGE, /import \{ dropLabel \} from '\.\/drop-label\.js';/);
  assert.doesNotMatch(STAGE, /function dropLabel\(/);
  assert.match(STAGE, /if \(cath\.made\) for \(const el of cath\.made\.values\(\)\) dropLabel\(el\)/);
});
