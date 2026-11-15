// R09 (external production review, 15 Nov 2026): the figure's accessible caption used to rate the portal pressure with its own copy of the lines
// ("(raised)" past 10, "(high)" from 15) while the tile and the heat tables used another. It now reads the absolute portal pressure as a number and the HVPG
// with the band word of the one table (src/engine/pressure-cuts.js), the same word the HVPG tile prints.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HVPG_WORDS, hvpgSev } from '../src/engine/pressure-cuts.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} disconnect() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { caption } = await import('../src/ui/a11y.js');

const fake = (pv, hvpg) => ({
  metrics: { pv, hvpg, varix: { present: false, grade: { label: 'None' } }, ascites: { grade: 0, volume: 0 }, pvVel: 12 },
  Q: new Array(40).fill(1),
});

test('the caption names the HVPG band from the shared table, at the tile\'s one decimal', () => {
  for (const h of [3, 5, 5.04, 5.1, 9.6, 10, 10.04, 10.1, 17]) {
    const c = caption(fake(18, h), { scenario: false });
    const want = HVPG_WORDS[hvpgSev(+h.toFixed(1))][0];
    assert.ok(c.includes(`HVPG ${h.toFixed(1)} mmHg (${want})`), `${h}: ${c}`);
  }
});

test('the caption puts no severity word on the absolute portal pressure', () => {
  for (const pv of [8, 11, 14, 16, 25]) {
    const c = caption(fake(pv, 6), { scenario: false });
    assert.ok(c.includes(`Portal pressure ${pv} mmHg,`), c);
    assert.ok(!/raised|\(high\)|severe/i.test(c.split('HVPG')[0]), c);
  }
});
