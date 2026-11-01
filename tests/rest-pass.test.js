// Rest passes (src/ui/rest-pass.js): layout work measured between frames, never inside the render loop, and the presenter's
// fits, its dock glide and its gestures reading nothing per frame (owner, 1 Nov 2026: reads only at rest boundaries).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let rafs = 0;
globalThis.requestAnimationFrame = () => { rafs++; return rafs; };
const { restPass, cancelRest, REST_PASS } = await import('../src/ui/rest-pass.js');
// (Waits for a pass to land, up to 2 s: a loaded test machine can hold a message past a short timer.)
const tick = async (until = () => true) => { for (let t = 0; t < 400; t++) { await new Promise((r) => setTimeout(r, 5)); if (until()) return; } };

test('a rest pass runs once as a task of its own, never through the frame scheduler', async () => {
  assert.equal(REST_PASS, true);
  const ran = [];
  const a = restPass(() => ran.push('a'));
  restPass(() => ran.push('b'));
  assert.ok(a > 0);
  assert.deepEqual(ran, [], 'not run on the spot');
  await tick(() => ran.length >= 2);
  assert.deepEqual(ran, ['a', 'b'], 'in the order asked, once each');
  assert.equal(rafs, 0, 'no frame asked for');
});

test('a rest pass never goes through the frame scheduler, off switch included; the off-GPU scan knows it defers', () => {
  const src = readFileSync(new URL('../src/ui/rest-pass.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^import|requestAnimationFrame\(|\bframe\(fn/m);
  const scan = readFileSync(new URL('../scripts/off-gpu-scan.mjs', import.meta.url), 'utf8');
  assert.match(scan, /const DEFERRED = [^\n]*\|restPass\|/);
});

test('a cancelled rest pass never runs; one asked for while passes run waits for the next', async () => {
  const ran = [];
  const a = restPass(() => ran.push('a'));
  cancelRest(a); cancelRest(0); cancelRest(a);
  restPass(() => { ran.push('b'); restPass(() => ran.push('c')); });
  await tick(() => ran.length >= 2); await tick();
  assert.deepEqual(ran, ['b', 'c']);
});

const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
test('presenter: the card fits, the zoom\'s return and a wheel gesture\'s action are rest passes', () => {
  assert.match(pz, /fitRaf = restPass\(\(\) => \{ if \(ui && cardMoving\(\)\) return;/);
  assert.match(pz, /paneRaf = restPass\(\(\) => \{ if \(!ui \|\| cardMoving\(\)\) return;/);
  assert.match(pz, /const zoomSettled = \(\) => restPass\(/);
  assert.match(pz, /restPass\(\(\) => wheelAct\(a\)\);/);
  assert.doesNotMatch(pz, /requestAnimationFrame\(/, 'the presenter asks the scheduler, never the browser');
});

test('presenter: a dock glide\'s and a drag\'s frames write from what was read at rest', () => {
  const paint = pz.slice(pz.indexOf('const dockPaint = () => {'), pz.indexOf('const DOCK_FADE'));
  assert.match(paint, /const \[x, y\] = dock\.vec \|\| \[0, 0\];/);
  assert.doesNotMatch(paint, /dockVec\(\)|placeLip\(\)|offset[A-Z]|getBoundingClientRect/, 'nothing read in a glide frame');
  const lip = pz.slice(pz.indexOf('function lipPaint() {'), pz.indexOf('function dockTo('));
  assert.doesNotMatch(lip, /offset[A-Z]|getBoundingClientRect|getComputedStyle|measureUnder/);
  assert.match(pz, /dockRest\(\);\n\s*const step = \(now\) => \{/, 'a glide reads where it goes before its first frame');
  assert.match(pz, /else dock\.rest = restPass\(\(\) => ui && placeLip\(\)\);/, 'landed: the edge measured between frames');
});

test('presenter: a finger\'s moves read nothing; the room and the card\'s width are read as it lands', () => {
  assert.match(pz, /if \(sw\) sw\.room = ui && CARD_TURN && !CARD_PAGE \? turnRoom\(\) : 20;/);
  assert.match(pz, /pull = \{ on: true, x: 0, pts: \[\], cap: g\.room \};/);
  assert.match(pz, /cd\.w = caseCard\.c\.offsetWidth \|\| 1;/);
  assert.match(pz, /const c = cd\.card\.c, w = cd\.w;/);
});

test('presenter: a folding card follows a finger by transform and opacity; its height is set once at each end (?foldxf=0: as before)', () => {
  assert.match(pz, /const FOLD_XF = !\/\[\?&\]foldxf=0\\b\/\.test\(location\.search\)/);
  assert.match(pz, /if \(gg\.xf\) \{ gg\.p\.style\.translate = `0 \$\{\(-\(1 - u\) \* FOLD_SLIDE\)\.toFixed\(1\)\}px`; if \(gg\.fade\) gg\.p\.style\.opacity = u\.toFixed\(3\); return; \}/);
  assert.match(pz, /if \(gg\.xf\) \{ gg\.xf = false; gg\.p\.classList\.remove\('pz-follow'\); gg\.p\.style\.translate = ''; \}/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-data\.pz-folds > \.pz-tool\.pz-follow \{ max-height: none; margin-bottom: 0; \}/);
});
