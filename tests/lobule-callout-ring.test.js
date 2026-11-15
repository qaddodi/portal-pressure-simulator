// The presenter's lesion pointer in the lobule (ring and leader) is drawn at a bold, fixed screen weight so it reads on
// phone, iPad and Mac at any zoom (only its radius follows the zoom).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LOOKS } from '../src/ui/chart-looks/index.js';
import { makeCtx, withCtx, resolveProps } from '../src/ui/chart-looks/resolve.js';
import { lobuleSource } from './split-src.js';

test('the lobule callout ring and leader are at least 4px thick, in every kind', () => {
  // (their looks are the chart-looks table's now: small.call, both pieces)
  const c = withCtx(makeCtx({ host: 'lobule' }), { theme: 'light', dark: false, palette: 'navy', view: 'anatomic' });
  for (const kind of [undefined, 'block', 'treat', 'note']) for (const on of [false, true]) {
    const w = resolveProps(LOOKS['small.call'], c, { kind, on }, {}).width;
    assert.ok(w >= 4, `stroke-width is ${w}px (${kind}, on ${on})`);
  }
});

test('the pointer pill prefers spots outside the lobule, falling back inside only when there is no room', () => {
  const js = lobuleSource();
  const cost = Number(js.match(/INSIDE_COST = (\d+)/)?.[1]);
  assert.ok(cost > 0 && cost * 6 < 1e5, 'the inside cost stays well below the clash costs, so it never causes overlaps');
});

test('resistance callouts in the lobule are one short word, so they never crowd the vessel labels', async () => {
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../src/ui/decks/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/callout: \{ at: '\w+', label: '([^']*)' \}/g)) if (/resist/i.test(m[1])) assert.equal(m[1], 'Resistance', `${f}: "${m[1]}"`);
  }
});
