import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Worker plan, step 2: the vessel renderer reads the page only through figure-settings.js, so it can load without a document.

test('the renderer and its organ painter load with no browser globals', async () => {
  for (const f of ['figure-settings', 'veins-gl', 'organs-gl', 'organ-paint']) {
    assert.ok(await import(`../src/ui/${f}.js`), f);
  }
});

test('a worker given the settings reads them, not the page', async () => {
  const m = await import('../src/ui/figure-settings.js');
  m.setFigureSettings({ tokens: { '--bleed-spray': '#ff8000', '--bleed-fresh': 'rgb(1, 2, 3)' }, search: '?blood=classic' });
  assert.deepEqual(m.figureRGB('--bleed-spray'), [255, 128, 0]);
  assert.deepEqual(m.figureRGB('--bleed-fresh'), [1, 2, 3]);
  assert.equal(m.figureSearch(), '?blood=classic');
  m.setFigureSettings(null);
  assert.equal(m.figureSearch(), '');
});

test('veins-gl keeps no direct read of the page', () => {
  const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.ok(!/location\.search/.test(src) && !/from '\.\/util\.js/.test(src));
});
