// The fluid balance's capacity window (tool { kind: 'fluid', window: true }, tool-fluid.js; Mohammad's pick, 20 Oct 2026):
// per-day numbers whose printed sums are exact, the window's geometry on one scale, the Lymphatics row's word, and the
// Testing deck's four fluid slides opting in.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fluidDay, windowGeom, windowState, WINDOW_TOP } from '../src/ui/tool-fluid.js';

const perMin = (d) => ({ hep: d.liver / 1440, spl: d.gut / 1440, cap: d.limit / 1440, back: d.back / 1440 });
const STATES = {
  healthy: { liver: 790, gut: 0, limit: 3600, back: 0 },
  schisto: { liver: 2090, gut: 1500, limit: 3600, back: 0 },
  day60: { liver: 2330, gut: 3030, limit: 4340, back: 860 },
  diuretics: { liver: 2330, gut: 3030, limit: 4340, back: 2160 },
};

test('per day, every printed sum is exact', () => {
  const d = fluidDay(perMin(STATES.day60));
  assert.deepEqual(d, { liver: 2330, gut: 3030, made: 5360, limit: 4340, carried: 4340, over: 1020, back: 860, net: 160, room: -1020 });
  assert.equal(fluidDay(perMin(STATES.diuretics)).net, -1140);
  assert.equal(fluidDay(perMin(STATES.healthy)).room, 2810);
  assert.equal(fluidDay(perMin(STATES.schisto)).room, 10);
  // (any model values: rounded parts, sums taken from the parts)
  for (let i = 0; i < 500; i++) {
    const f = { hep: Math.random() * 3, spl: Math.random() * 3, cap: 1 + Math.random() * 3, back: Math.random() * 2 };
    const x = fluidDay(f);
    for (const k of ['liver', 'gut', 'limit', 'back']) assert.equal(x[k] % 10, 0, `${k} rounded to 10 mL`);
    assert.equal(x.made, x.liver + x.gut);
    assert.equal(x.carried + x.over, x.made);
    assert.equal(x.net, x.over - x.back);
    assert.ok(x.over === 0 || x.carried === x.limit, 'overflow only once the lymphatics are full');
  }
});

test('the window widens with what the lymphatics can carry, and the overflow never leaves the bar', () => {
  const h = windowGeom(perMin(STATES.healthy)), c = windowGeom(perMin(STATES.day60));
  assert.ok(Math.abs(h.win - 3600 / WINDOW_TOP) < 1e-9 && c.win > h.win, 'one scale: the day-60 window is wider');
  assert.ok(Math.abs(h.fill - 790 / 3600) < 1e-9 && c.fill === 1, 'health fills a fifth; cirrhosis fills it');
  assert.ok(Math.abs(c.over - 1020 / WINDOW_TOP) < 1e-9);
  for (const f of [perMin(STATES.day60), { hep: 4, spl: 4, cap: 2, back: 0 }, { hep: 0, spl: 0, cap: 6, back: 0 }]) {
    const g = windowGeom(f);
    assert.ok(g.win + g.over <= 1 + 1e-9, 'window and overflow fit the bar');
    assert.ok(g.fill >= 0 && g.fill <= 1);
  }
});

test('the Lymphatics row names the room left or the overflow', () => {
  assert.deepEqual(windowState(fluidDay(perMin(STATES.healthy))), { text: '2,810 to spare', rate: 'ok' });
  assert.deepEqual(windowState(fluidDay(perMin(STATES.schisto))), { text: '10 to spare', rate: 'mid' });
  assert.deepEqual(windowState(fluidDay(perMin(STATES.day60))), { text: 'Full, 1,020 over', rate: 'hi' });
});

test('only the Testing deck\'s four fluid slides draw the window, with their tiles under the card', () => {
  const deck = readFileSync(new URL('../src/ui/test-decks/demo-all-new-visuals.js', import.meta.url), 'utf8');
  assert.equal((deck.match(/"kind": "fluid",\s*"window": true/g) || []).length, 4);
  assert.equal((deck.match(/"kind": "fluid"/g) || []).length, 4);
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(pres, /!\(s\.tool\?\.kind === 'fluid' && s\.tool\.window\)/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.gw\[hidden\], \.gw-unit\[hidden\] \{ display: none; \}/, 'hidden really hides the grid and flex rows');
});
