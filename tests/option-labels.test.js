// Every stepped setting has one name per step and no name twice (15 Nov 2026, Mohammad: Figure detail read "Standard, Softer, Softest, Softest").
// The cause: a word table shorter than the step list, the last word standing in for every step beyond it. The names are now made for the steps
// they name (src/ui/fig-detail-words.js) and these tests fail when a list of options has a repeated or a missing name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIG_STEPS, figDetailWords } from '../src/ui/fig-detail-words.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const dupes = (a) => a.filter((x, i) => a.indexOf(x) !== i);

test('Figure detail: every step has a name, and no two steps share one, for any device default', () => {
  for (const dflt of FIG_STEPS.filter(Boolean)) {
    const w = figDetailWords(FIG_STEPS, dflt);
    assert.equal(w.length, FIG_STEPS.length, `one name per step (default ${dflt})`);
    assert.ok(w.every((x) => typeof x === 'string' && x.trim()), `no empty name (default ${dflt})`);
    assert.deepEqual(dupes(w), [], `no repeated name (default ${dflt}): ${w.join(', ')}`);
    assert.equal(w[FIG_STEPS.indexOf(dflt)], 'Standard');
    assert.equal(w.at(-1), 'Full');
  }
});

test('Figure detail: the phone and the laptop defaults read in order from softest to Full', () => {
  assert.deepEqual(figDetailWords(FIG_STEPS, 1.5), ['Softest', 'Softer', 'Soft', 'Standard', 'Sharp', 'Sharper', 'Sharpest', 'Fine', 'Finer', 'Full']);
  assert.deepEqual(figDetailWords(FIG_STEPS, 0.5), ['Soft', 'Standard', 'Sharp', 'Sharper', 'Sharpest', 'Fine', 'Finer', 'Finest', 'Ultra', 'Full']);
});

test('Figure detail: a list too short for its steps falls back to the megapixels, never to a repeat', () => {
  const w = figDetailWords([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 0], 0.1);
  assert.deepEqual(dupes(w), []);
  assert.ok(w.includes('1 MP'));
});

test('Figure detail: the steps are the very values the figure size accepts (frame.js), and the control uses the one table', () => {
  const cap = /cap: \[([^\]]+)\]/.exec(read('src/ui/frame.js'))[1].split(',').map(Number);
  assert.deepEqual([...cap].sort((a, b) => a - b), [...FIG_STEPS].sort((a, b) => a - b), 'FIG_OPTS.cap and the control steps agree');
  const main = read('src/ui/main.js');
  assert.ok(main.includes('figDetailWords('), 'the control takes its names from figDetailWords');
  assert.ok(!/'Softest'|'Sharpest'/.test(main), 'no second hand-written name table in main.js');
});

test('The other named option lists have no repeated name: looks, time ranges, figure labels', () => {
  const looks = [...read('src/ui/looks.js').matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(looks.length >= 5, `looks found: ${looks}`);
  assert.deepEqual(dupes(looks), [], 'looks');
  const ranges = /const RANGES = \[(.*)\];/.exec(read('src/ui/pressure-time.js'))[1];
  const rl = [...ranges.matchAll(/\['([^']+)', '([^']+)'/g)];
  assert.ok(rl.length >= 3);
  assert.deepEqual(dupes(rl.map((m) => m[1])), [], 'range ids');
  assert.deepEqual(dupes(rl.map((m) => m[2])), [], 'range labels');
  const lab = /\[\['key', 'Key'\], \['all', 'All'\], \['none', 'None'\]\]/.test(read('src/ui/main.js'));
  assert.ok(lab, 'labels-on-the-figure choices are Key, All, None');
});
