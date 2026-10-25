// The event labels of a talk-so-far chart (data card of one-year, prehepatic, recompensation) sit at 45° along the top,
// each time point is named once, and the chart makes room so no label is clipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traceLabel, traceLabelRoom, traceWhen, LABEL_MAX } from '../src/ui/trace-labels.js';
import { DECKS } from '../src/ui/decks.js';

test('labels are cut to a readable length, and a day that repeats is worded, not repeated', () => {
  assert.equal(traceLabel('Endoscopy'), 'Endoscopy');
  assert.ok(traceLabel('x'.repeat(60)).length <= LABEL_MAX);
  assert.equal(traceWhen(undefined, 'Year 1', 'Day 180'), 'Year 1');
  assert.equal(traceWhen(undefined, 'Year 1', 'Year 1'), 'Same day');
  assert.equal(traceWhen('On carvedilol', 'Year 1', 'Year 1'), 'On carvedilol');
});

test('the chart leaves room for the longest label at its last column', () => {
  const W = 520, L = 46, ticks = ['Diagnosis, catheter', 'FibroScan', 'Endoscopy', 'Catheter, Doppler', 'Carvedilol started'];
  const { R, pad } = traceLabelRoom(ticks, { W, L });
  assert.ok(R > L + 160 && R <= W - 64, `plot edge ${R}`);
  assert.ok(pad > 50 && pad < 140, `pad ${pad}`);
  const dx = Math.ceil('Carvedilol started'.length * 9.2 * Math.SQRT1_2);
  assert.ok(R + 6 + dx <= W - 4, 'the last label ends inside the picture');
  assert.deepEqual(traceLabelRoom([], { W, L }).pad, 0);
});

test('the chart draws its labels at 45° on top, and the one-year deck has no two states on the same label', () => {
  const src = readFileSync(new URL('../src/ui/talk-trace.js', import.meta.url), 'utf8');
  assert.match(src, /'text-anchor': 'start', transform: `rotate\(-45 /);
  assert.doesNotMatch(src, /rotate\(-90/);
  const d = DECKS.find((x) => x.id === 'one-year' || x.id === 'oneyear') || DECKS.find((x) => x.slides.some((s) => s.id === 'd365'));
  const ticks = d.slides.filter((s) => s.tick).map((s) => s.tick);
  assert.equal(new Set(ticks).size, ticks.length);
  assert.ok(d.slides.find((s) => s.id === 'carv').when, 'the drug slide names its own time point (it shares the year-1 visit)');
});
