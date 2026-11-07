// Rest passes (src/ui/rest-pass.js): layout work measured between frames, never inside the render loop, and the presenter's
// fits, its dock glide and its gestures reading nothing per frame (owner, 1 Nov 2026: reads only at rest boundaries).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unsnap } from './unsnap.js';

let rafs = 0;
globalThis.requestAnimationFrame = () => { rafs++; return rafs; };
const { restPass, cancelRest } = await import('../src/ui/rest-pass.js');
// (Waits for a pass to land, up to 2 s: a loaded test machine can hold a message past a short timer.)
const tick = async (until = () => true) => { for (let t = 0; t < 400; t++) { await new Promise((r) => setTimeout(r, 5)); if (until()) return; } };

test('a rest pass runs once as a task of its own, never through the frame scheduler', async () => {
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
  assert.doesNotMatch(src, /requestAnimationFrame\(|\bframe\(fn/m);
  // (Its one import is the shared preparation budget (review pass 2), which reads the frame budget and asks for no frame either.)
  assert.deepEqual(src.match(/^import[^\n]*/gm), [src.match(/^import \{[^}]*\} from '\.\/prep-budget\.js';/m)?.[0]]);
  const budget = readFileSync(new URL('../src/ui/prep-budget.js', import.meta.url), 'utf8');
  assert.doesNotMatch(budget, /requestAnimationFrame\(|\b(frame|lateFrame|finalFrame|readFrame)\(/);
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

const pz = unsnap(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'));
test('presenter: a dock glide\'s and a drag\'s frames write from what was read at rest', () => {
  const paint = pz.slice(pz.indexOf('const dockPaint = () => {'), pz.indexOf('const DOCK_FADE'));
  assert.match(paint, /const vec = dock\.vec \|\| DOCK_ZERO, x = vec\[0\], y = vec\[1\];/);
  assert.doesNotMatch(paint, /dockVec\(\)|placeLip\(\)|offset[A-Z]|getBoundingClientRect/, 'nothing read in a glide frame');
  const lip = pz.slice(pz.indexOf('function lipPaint() {'), pz.indexOf('function dockTo('));
  assert.doesNotMatch(lip, /offset[A-Z]|getBoundingClientRect|getComputedStyle|measureUnder/);
  assert.match(pz, /dockRest\(\);\n\s*cancelRest\(dock\.rest\);\n\s*if \(ms && from !== to && ui && !ui\.data\.hidden && !wideSheet\(ui\.data\)\) \{\n\s*dockGlide\(from, to, ms\);/, 'a glide reads where it goes before its first frame');
  assert.match(pz, /const glideDone = \(\) => \{ if \(!glide\) return; glideEnd\(\); dock\.rest = restPass\(lipSoon\); \};/, 'landed, the glide: the edge measured between frames');
  assert.match(pz, /else dock\.rest = restPass\(lipSoon\);/, 'landed: the edge measured between frames');
});

test('presenter: a folding card follows a finger by transform and opacity; its height is set once at each end (never a height per move)', () => {
  assert.match(pz, /gg\.p\.style\.transition = 'none'; gg\.xf = true; gg\.fade = el\.classList\.contains\('pz-folds'\);/);
  assert.doesNotMatch(pz, /FOLD_XF|foldxf/);
  assert.match(pz, /if \(gg\.xf\) \{ gg\.p\.style\.translate = `0 \$\{\(-\(1 - u\) \* FOLD_SLIDE\)\.toFixed\(1\)\}px`; if \(gg\.fade\) gg\.p\.style\.opacity = u\.toFixed\(3\); \}/);
  const ff = pz.slice(pz.indexOf('const foldFollow = (gg, dy) => {'), pz.indexOf('const settle = (gg, show) => {'));
  assert.doesNotMatch(ff, /maxHeight|style\.height/, 'no height written as the finger moves');
  assert.match(pz, /if \(e\.touches\.length > 1\) \{ const gg = g; reset\(\); restPass\(\(\) => landCut\(gg\)\); return; \}/);
  assert.match(pz, /cancelRest\(camGrabT\); camGrabT = restPass\(camGrabNow\);/);
  assert.match(pz, /if \(gg\.xf\) \{ gg\.xf = false; gg\.p\.classList\.remove\('pz-follow'\); gg\.p\.style\.translate = ''; \}/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-data\.pz-folds > \.pz-tool\.pz-follow \{ max-height: none; margin-bottom: 0; \}/);
});
