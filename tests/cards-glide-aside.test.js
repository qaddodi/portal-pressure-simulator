// A card that stands to the left of another on the right edge (Treat and History beside Tests or the Details panel, the side Tests card beside the
// Details panel) makes room by gliding aside, never by a jump: its offset was `right: calc(... var(--panel-occ) ...)`, which a transition on a layout
// property would not play on the compositor and which no rule animated, so Treat leapt across the screen when Tests opened (play-test, Mac, 16 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const css = readdirSync(new URL('../styles/', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => readFileSync(new URL(`../styles/${f}`, import.meta.url), 'utf8')).join('\n');
const rules = (sel) => [...css.matchAll(/(^|\n)([^{}\n]*)\{([^{}]*)\}/g)].filter((m) => m[2].split(',').some((s) => s.trim() === sel)).map((m) => m[3]);

test('no card\'s `right` carries the occupancy of the cards beside it (the docked vessel card, which narrows beside Tests and eases its `right`, is its own rule)', () => {
  for (const m of css.matchAll(/(?:^|\n)([^{}\n]*)\{([^{}]*)\}/g)) {
    if (m[1].includes('action-card')) continue;
    assert.ok(!/(?:^|[;\s])right\s*:[^;]*var\(--(?:panel|instr|right)-occ/.test(m[2]), `${m[1].trim()} offsets its right edge by an occupancy`);
  }
});

test('Treat, History and the side Tests card shift by translate, and the shift is eased', () => {
  for (const sel of ['.treat-card', '.instrument-workspace.side']) {
    const body = rules(sel).join(';');
    assert.match(body, /--occ-x\s*:[^;]*-occ/, `${sel} sets --occ-x from the occupancy`);
    assert.match(body, /translate\s*:\s*var\(--occ-x\)/, `${sel} translates by it`);
    assert.match(body, /transition\s*:[^;]*translate/, `${sel} eases the translate`);
  }
});

test('the thumb dock keeps the shift beside the sheet sink', () => {
  assert.match(css, /\.app\.thumb :is\(\.panel, \.treat-card, \.instrument-workspace\.float-ui\)\s*\{\s*translate:\s*var\(--occ-x, 0px\) var\(--sink, 0px\)/);
});
