// The HVPG catheter's frame (review of 3b099a80, 26 Oct): the shaft is sampled once along the whole route and sent to the GPU
// once, a frame adding only the piece to the tip, the band, the balloon and the ripples; the readings' sizes and the cards' room
// are kept until they change; and each frame runs in order: the catheter's step, the camera following it, the readings, then the
// figure's one render pass (animate, a late callback of the shared frame), with no direct vessel draws from the camera paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const stage = read('src/ui/stage.js'), gl = read('src/ui/veins-gl.js');
const fn = (src, name) => src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {2}\\}`))[0];

test('a late callback runs after every other callback of its frame, once; asked for in it, the next frame', async () => {
  const q = [];
  globalThis.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  const { frame, lateFrame, cancelFrame } = await import(`../src/ui/frame.js?t=${Date.now()}`);
  const seen = [];
  const run = () => { const cb = q.shift(); cb(performance.now()); };
  lateFrame(() => { seen.push('render'); lateFrame(() => seen.push('render 2')); });
  frame(() => { seen.push('a'); frame(() => seen.push('b')); lateFrame(() => seen.push('labels')); });
  frame(() => seen.push('c'));
  const gone = lateFrame(() => seen.push('cancelled'));
  cancelFrame(gone);
  run();
  assert.deepEqual(seen, ['a', 'c', 'render', 'labels']);
  assert.equal(q.length, 1, 'one browser frame asked for the next');
  run();
  assert.deepEqual(seen, ['a', 'c', 'render', 'labels', 'b', 'render 2']);
  assert.equal(q.length, 0);
  delete globalThis.requestAnimationFrame;
});

test('the figure renders as the frame\'s last callback, and the camera paths no longer draw the vessels themselves', () => {
  assert.match(stage, /const drawFrame = lateFrameFor\('stage'\);/);
  assert.doesNotMatch(stage, /nextFrame\(animate\)/);
  assert.match(stage, /function animate\(now\) \{\n {4}cathLabelsNow\(\);/);
  const follow = fn(stage, 'cathFollow');
  assert.doesNotMatch(follow, /drawVeins|getBoundingClientRect|clientToVB\(|safeInsets\(|cutLen/);
  assert.match(follow, /const wr = stageBox\(\), ins = cathInsets\(now\);/);
  const glide = fn(stage, 'animateVT');
  assert.match(glide, /if \(cath\.st\) \{ refreshCTM\(\); cathLabelsSoon\(\); \}/);
  assert.doesNotMatch(glide, /drawVeins/);
});

test('the catheter\'s step moves the camera before its readings are laid out, in every caller', () => {
  const paint = fn(stage, 'cathPaint');
  assert.ok(paint.indexOf('if (st.follow) cathFollow();') > paint.indexOf('cathGL(st, r, tipD, rc)'));
  assert.ok(paint.indexOf('cathLabelsSoon();') > paint.indexOf('if (st.follow) cathFollow();'));
  assert.doesNotMatch(paint, /cathLabels\(\)/);
  assert.match(read('src/ui/presenter.js'), /follow: cath\.follow \}\);/);
  const hv = read('src/ui/hvpg-proc.js'), pa = read('src/ui/proc-anim.js');
  assert.equal((hv.match(/labels, follow,/g) || []).length, 2);
  assert.match(pa, /ring: null, clock: t, opacity: f\.opacity, labels, follow \}\);/);
  for (const src of [hv, pa, read('src/ui/presenter.js')]) assert.doesNotMatch(src, /cathFollow/);
});

test('the shaft is sampled once per route and width, and the GPU gets it once', () => {
  const g = fn(stage, 'cathGL');
  assert.match(g, /const sh = cathShaft\(r, rc\), begin = \(\) => sh\.count \+ V\.length \/ 6;/);
  assert.doesNotMatch(g, /tube\(0, tipD/);
  assert.match(g, /veins\.setCath\(cathLast = \{ base: sh\.verts,/);
  assert.match(fn(stage, 'cathShaft'), /if \(cath\.shaft\?\.key === key\) return cath\.shaft;/);
  // (a point along the route by halving, not a walk from its start)
  assert.match(fn(stage, 'cathAt'), /while \(i < hi\) \{ const m = \(i \+ hi\) >> 1;/);
  // (and the shaft's samples, which only go further along, walk on from the last one)
  assert.match(fn(stage, 'cathAt'), /if \(walk\) \{ i = Math\.max\(1, walk\.i \|\| 1\); while \(i < hi && r\.cum\[i\] < d\) i\+\+; walk\.i = i; \}/);
  assert.match(fn(stage, 'cathShaft'), /q = cathAt\(r, d, walk\)/);
  assert.match(gl, /if \(base && base !== cathBase\) gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, base\);/);
  assert.match(gl, /gl\.bufferSubData\(gl\.ARRAY_BUFFER, at, cath\.verts\)/);
});

test('the readings\' sizes and the cards\' room are kept until they change', () => {
  const L = fn(stage, 'cathLabels');
  assert.doesNotMatch(L, /wrap\.clientWidth|cardSpace\(\)|readBlockers\(\)|\[el\.offsetWidth, el\.offsetHeight\]\]\)/);
  assert.match(L, /const room = cathRoomNow\(\)/);
  assert.match(L, /blockers: room\.blk/);
  assert.match(fn(stage, 'cathSize'), /text\.replace\(\/\\d\/g, '0'\)/);
  assert.match(stage, /addEventListener\('pps:occ', \(\) => \{ panFit = null; cath\.lblKey = ''; cathRoom\(\); \}\);/);
  assert.match(stage, /addEventListener\('resize', \(\) => \{ panFit = null; cath\.lblKey = ''; cathRoom\(\); \}\);/);
});
