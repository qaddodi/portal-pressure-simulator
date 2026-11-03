import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { scrubSpec, scrubKey, scrubWords } from '../src/ui/scrub-plan.js';

// N9: which slides get the before / after slider, and what the worker does with it.
const deck = [
  { id: 'a' }, { id: 'b', params: { cirrhosis: 0.5 }, delta: true }, { id: 'c', delta: 'a' },
  { id: 'd', lens: 'since' }, { id: 'e', lens: 'since', since: 'a' }, { id: 'f', delta: true }, { id: 'g', delta: true, lapse: { days: 5 } }, { id: 'h', visual: 'outline', delta: true },
];
const stateOf = [0, 1, 2, 3, 4, 4, 6, 7];

test('a slide that counts its change from an earlier one can be scrubbed between the two states', () => {
  assert.deepEqual(scrubSpec(deck, stateOf, 1), { ia: 0, ib: 1, from: 'Before', to: 'This slide' });
  assert.equal(scrubSpec(deck, stateOf, 2).ia, 0, 'delta by id counts from that slide');
  assert.equal(scrubSpec(deck, stateOf, 3).ia, 2, 'lens since counts from the slide before');
  assert.equal(scrubSpec(deck, stateOf, 4).ia, 0, 'lens since with since counts from that slide');
});

test('no scrub on the first slide, a slide with no change of patient, a time-lapse, a visual or a slide that does not say', () => {
  assert.equal(scrubSpec(deck, stateOf, 0), null);
  assert.equal(scrubSpec(deck, stateOf, 5), null, 'same state as the one before: nothing to scrub');
  assert.equal(scrubSpec(deck, stateOf, 6), null);
  assert.equal(scrubSpec(deck, stateOf, 7), null);
  assert.equal(scrubSpec([{ id: 'x' }, { id: 'y', params: {} }], [0, 1], 1), null, 'no delta, no lens since');
  assert.equal(scrubSpec(deck, stateOf, 99), null);
});

test('a scrubbed card is never kept for another slide (the plan names the slide)', () => {
  assert.notEqual(scrubKey(scrubSpec(deck, stateOf, 1), 1), scrubKey(scrubSpec(deck, stateOf, 2), 2));
  assert.equal(scrubKey(null, 3), '');
  const sp = scrubSpec(deck, stateOf, 1);
  assert.equal(scrubWords(0, sp), 'Before');
  assert.equal(scrubWords(1, sp), 'This slide');
  assert.match(scrubWords(0.37, sp), /^37%/);
});

test('the worker holds the model at k of the way between two snapshots, linear, and k alone moves it', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const messages = [];
  const core = createCore((m) => messages.push(structuredClone(m)));
  t.after(() => core.dispose());
  core.handle({ type: 'init' });
  const from = core.engine().snapshot();
  core.handle({ type: 'setParams', params: { cirrhosis: 0.7 }, settle: true });
  const to = core.engine().snapshot();
  const tick = (ms) => { now += ms; t.mock.timers.tick(ms); };
  const at = () => core.engine().snapshot().params.cirrhosis;
  core.handle({ type: 'scrub', from, to, k: 0 }); tick(100);
  assert.ok(Math.abs(at() - from.params.cirrhosis) < 1e-9, 'k 0 is the earlier state');
  core.handle({ type: 'scrub', k: 0.5 }); tick(100);
  assert.ok(Math.abs(at() - (from.params.cirrhosis + to.params.cirrhosis) / 2) < 1e-9, 'k 0.5 is half way, with no easing');
  core.handle({ type: 'scrub', k: 1 }); tick(2000);
  assert.ok(Math.abs(at() - to.params.cirrhosis) < 1e-9, 'k 1 is the slide\'s state and it stays there');
  core.handle({ type: 'scrub', k: 0.25 }); tick(100);
  assert.ok(Math.abs(at() - (from.params.cirrhosis * 0.75 + to.params.cirrhosis * 0.25)) < 1e-9, 'and back again');
  const f = messages.filter((m) => m.type === 'frame').at(-1);
  assert.equal(f.morphing, true, 'the page sees the model as easing');
  core.handle({ type: 'scrub', k: 0.9 }); core.handle({ type: 'restore', snap: from });
  tick(100);
  assert.ok(Math.abs(at() - from.params.cirrhosis) < 1e-9, 'a restore ends the scrub');
  core.handle({ type: 'scrub', k: 0.5 }); tick(100);
  assert.ok(Math.abs(at() - from.params.cirrhosis) < 1e-9, 'a k with no scrub under way is ignored');
});

test('the presenter wires the scrub into the data card without moving it', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /scrubIn\(s, i\);/);
  assert.match(src, /tools\.el, scrubBox, tiles\.el/);
  assert.match(src, /scrub: scrubKey\(scrubSpec\(slides, stateOf, i\), i\)/);
});
