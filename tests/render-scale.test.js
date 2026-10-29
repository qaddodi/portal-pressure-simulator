// Figure resolution (29 Oct, an experiment): one Settings row, shown in the app and in a talk, that draws the figure's canvases
// at a share of their pixels. Words are not on those canvases, so they stay sharp. Full (1) changes nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const main = src('main.js');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

test('one Figure resolution row, ahead of the block a talk leaves out', () => {
  assert.equal(settings.split("'Figure resolution'").length - 1, 1);
  assert.ok(settings.indexOf("'Figure resolution'") < settings.indexOf('...(talk ? [] : ['), 'a talk shows it too');
  assert.match(settings, /RENDER_SCALES\.map/);
  assert.match(settings, /setRenderScale\(v\)/);
});

test('the scales, the stored value and the listeners', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=${Date.now()}`);
  assert.deepEqual(f.RENDER_SCALES, [1, 0.75, 0.5, 0.25]);
  assert.equal(f.renderScale(), 1, 'Full by default');
  const seen = [];
  f.onRenderScale((k) => seen.push(k));
  f.setRenderScale(0.5);
  assert.equal(f.renderScale(), 0.5);
  assert.equal(store.get('pps.renderScale'), '0.5');
  f.setRenderScale(0.3);   // (not a choice: ignored)
  f.setRenderScale(0.5);   // (no change: no call)
  f.setRenderScale(1);
  assert.equal(store.has('pps.renderScale'), false, 'Full stores nothing');
  assert.deepEqual(seen, [0.5, 1]);
  delete globalThis.localStorage;
});

test('the anatomy canvas, the lobule and the sinusoid read it; the instruments and labels do not', () => {
  const stage = src('stage.js');
  assert.match(stage, /vdpr = Math\.min\(2, devicePixelRatio \|\| 1\) \* QUALITY\[quality\]\.res \* renderScale\(\)/);
  assert.match(stage, /onRenderScale\(\(\) => resizeCanvas\(\)\)/);
  assert.equal(src('lobule-zoom.js').split('* renderScale()').length - 1, 5);
  assert.equal(src('sinusoid-view.js').split('* renderScale()').length - 1, 1);
  for (const f of ['util.js', 'label-gl.js', 'glass-gl.js', 'instruments.js']) assert.ok(!src(f).includes('renderScale'), f);
});
