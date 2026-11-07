// The talk-so-far chart's "Two gaps" layout (Mohammad's pick, 6 Nov 2026, mocks in /mnt/project-files/course-chart-mocks/): the visits on
// the time row, the treatment bars, the names kept clear, and the source pieces that carry the look.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { visitsOf, visitUnits, daysOf, spanWords, rxBars, keepClear, WEDGE_C } from '../src/ui/talk-trace.js';
import { bandRuns } from '../src/ui/rx-bands.js';
import { LOOKS } from '../src/ui/chart-looks/index.js';
import { DECKS } from '../src/ui/decks.js';

// The PVT course: before the clot, the clot, carvedilol (all day 0), then 180 days of anticoagulation.
const PVT = [{ day: 'Day 0', when: 'Day 0' }, { day: 'Day 0', when: 'Same day' }, { day: 'Day 0', when: 'Same day' }, { day: 'Day 180', when: 'Day 180' }];
const PARAMS = [{}, { thrombus: { PV_TRUNK: 0.6 } }, { drugs: { carvedilol: true } }, { drugs: { carvedilol: true }, anticoag: true }];

test('the states of one visit share it, and the time between visits is wider than a step', () => {
  const g = visitsOf(PVT);
  assert.deepEqual(g, [0, 0, 0, 1]);
  assert.deepEqual(visitUnits(g), [0, 1, 2, 3.55]);
  assert.deepEqual(visitsOf([{ when: 'Year 0' }, { when: 'Year 1' }, { when: 'Year 1' }]), [0, 1, 1], 'a chain without days groups by its time words');
  assert.equal(daysOf('Day 180'), 180);
  assert.equal(daysOf('Year 2'), 730);
  assert.equal(daysOf('Same day'), null);
  assert.equal(spanWords(180), '180 d');
  assert.equal(spanWords(730), '2 y');
  assert.equal(spanWords(270), '9 mo');
});

test('a treatment bar starts where it started: at its own visit, or the visit before when its first state came after days on it', () => {
  const runs = bandRuns(PARAMS, ['carvedilol', 'anticoag']), X = (i) => 100 * i;
  const { bars, rows } = rxBars(runs, X, visitsOf(PVT), 3, 400, (t) => t.length * 7);
  const carv = bars.find((b) => b.run.key === 'carvedilol'), ac = bars.find((b) => b.run.key === 'anticoag');
  assert.deepEqual([carv.a, carv.b, carv.more], [200, 300, true], 'carvedilol from its own state on, still on at the end');
  assert.deepEqual([ac.a, ac.b, ac.more], [200, 300, true], 'anticoagulation ran the 180 days from the carvedilol visit');
  assert.equal(rows, 2, 'two bars from the same state take a row each');
  assert.ok(bars.every((b) => (b.anchor === 'end' ? b.nameX <= 400 : b.nameX + b.run.name.length * 7 <= 400)), 'every name inside the chart');
});

test('names on a row are kept clear of each other, the last always', () => {
  const k = keepClear([10, 30, 50, 200], [30, 30, 30, 30], 300);
  assert.ok(k.has(3));
  assert.ok(!(k.has(1) && k.has(0)), 'two names 20 px apart never both');
});

test('the Two gaps pieces have their looks, WHVP is violet, and the PVT course names its gap the clot', () => {
  for (const k of ['talk.gap', 'talk.gap.hv', 'talk.gap.name', 'talk.stage', 'talk.rx.bar', 'talk.rx.dot', 'talk.rx.name', 'talk.when', 'talk.span', 'talk.read', 'talk.read.name', 'talk.line', 'talk.line.free', 'talk.dot', 'talk.axis.mark']) assert.ok(LOOKS[k], `${k} has a look`);
  assert.equal(WEDGE_C, '--s7');
  const course = DECKS.find((d) => d.id === 'prehepatic').slides.find((s) => s.id === 'course');
  assert.equal(course.tool.gap, 'clot');
});
