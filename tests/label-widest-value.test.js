// L4 (heat-speed-label-lock.md, 12 Nov 2026): a reading is laid out at its widest value. Its digits are measured tabular (as zeros) and its first
// run of digits padded to the most it shows (two, or three for a velocity or a saturation), so a value that ticks from 9.8 to 10.2 mmHg keeps its
// box: refreshValues had found the width moved and laid every label out again, many times a minute with the model running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabelSize } from '../src/ui/stage-label-size.js';

// (Widths as the labels' own measure gives them: every digit as wide as a zero, 7 px a character here.)
globalThis.innerWidth ??= 1440; globalThis.innerHeight ??= 900;
const textW = (t) => t.replace(/\d/g, '0').length * 7;
const mq = { matches: true, addEventListener() {} };
const { lineW } = createLabelSize({ deskK: () => 1.5, deskMQ: mq, textW }, { labelScale: 1, labelK: 1, projecting: false });
const val = (t, more = {}) => [{ t: 'Portal v.', size: 11.5, weight: 600, cls: 'lb-name' }, { t, size: 14, weight: 650, cls: 'lb-val', gap: 4, ...more }];

test('a pressure keeps its width from 9.8 to 10.2 and back', () => {
  assert.equal(lineW(val('9.8')), lineW(val('10.2')));
  assert.equal(lineW(val('0.4')), lineW(val('18.0')));
});

test('a velocity or a saturation is laid out three digits wide', () => {
  assert.equal(lineW(val('98', { pad: 3 })), lineW(val('120', { pad: 3 })));
  assert.equal(lineW(val('7', { pad: 3 })), lineW(val('100', { pad: 3 })));
});

test('a change badge keeps its width too, and a name is measured as it is', () => {
  const d = (t) => [{ t, size: 10.5, weight: 650, cls: 'lb-delta up' }];
  assert.equal(lineW(d('+7.9')), lineW(d('+12.1')));
  assert.ok(lineW([{ t: 'RA', size: 11.5, cls: 'lb-name' }]) < lineW([{ t: 'IVC', size: 11.5, cls: 'lb-name' }]));
});
