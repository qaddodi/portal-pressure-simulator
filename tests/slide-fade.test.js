// Slide changes: the teaching card and the data card fade out and in, never pop, on every platform and with reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const run = src.slice(src.indexOf('async function transitionRun('), src.indexOf('const reFit = '));

test('the cards start fading out, and are painted fading, before the figure changes', () => {
  const out = run.indexOf('outMs = wordsOut(s)'), frames = run.indexOf('if (outMs) { await painted(); await painted(); }');
  assert.ok(out > 0 && frames > out);
  // (The marks, the lens and the slide's state all come after the fade is on screen.)
  for (const k of ['store.set({ focus: null', 'store.set({ colorMode: lens })', 'slideLayers(s)']) assert.ok(run.indexOf(k) > frames, k);
  // (It still runs its full length before the new words are built.)
  assert.ok(run.indexOf('await wait(Math.max(0, outMs - (performance.now() - outAt)))') > frames);
  assert.match(src, /function wordsOut\(next\) \{[\s\S]*?return 340;/);
});

test('the cards fade in only once the figure paints smoothly (after a new patient, once its organs are redrawn)', () => {
  const settle = run.indexOf('if (swap) { await until(() => cut() || stage.organsSettled(), 1500)');
  const quiet = run.indexOf('await unseen(cut); if (cut()) return;'), inn = run.indexOf('bare = false; layout(); cardsIn();');
  assert.ok(settle > 0 && quiet > settle && inn > quiet);
  // (Two frames in a row under 40 ms apart, at most 700 ms: paging is never held long; a hidden tab still moves on.)
  assert.match(src, /async function smooth\(cut, ms = 700\)[\s\S]*?t - last < 40/);
  assert.match(src, /const painted = \(\) => new Promise\(\(r\) => \{ const t = setTimeout\(r, 100\);/);
});

test('with reduced motion the cards still fade (opacity only, no slide)', () => {
  const rm = css.slice(css.indexOf('.pz *, .pz, .app.presenting #stageView { animation: none !important; transition: none !important; }'));
  const block = rm.slice(0, rm.indexOf('\n}'));
  assert.match(block, /\.pz > :is\(\.pz-text, \.pz-data, \.pz-panel\), \.pz-text > \*, \.pz-shade \{ transition: opacity \.3s var\(--ease\) !important; \}/);
  assert.match(block, /\.pz > :is\(\.pz-text, \.pz-data, \.pz-panel\), \.pz-text > \.pz-leave, \.pz-shade \{ transform: none !important; \}/);
  // (The data card waits out its fade before it is hidden, reduced motion or not.)
  assert.match(src, /data\.hidden = true; ui\?\.tools\.hide\(\); \} \}, 320\);/);
});

test('the cards are refitted and laid out at their final size while still unseen, then fade in', () => {
  assert.match(src, /async function unseen\(cut\) \{\s*if \(ui\) \{ reFit\(\); layout\(\); await painted\(\); await painted\(\); if \(cut\(\) \|\| !ui\) return; layout\(\); \}\s*await smooth\(cut\);/);
});
