// The menu's kept rows (src/ui/menu-keep.js): a row is put back when its text is unchanged and made again when anything it shows changes.
// The browser check (tests/e2e/menu-kept.mjs, `npm run smoke:menu`) proves a kept list equals a made one; this pins the rule that decides it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckSig, patientSig } from '../src/ui/menu-keep.js';

const deck = () => ({ id: 'd1', title: 'Portal hypertension', short: 'PH', level: 'core', minutes: 20, summary: 'Why the pressure rises', slides: [1, 2, 3], objectives: ['a', 'b'] });
const sig = (d = deck(), o = {}) => deckSig(d, o.script ?? false, o.current ?? false, o.resume ?? null, o.marked ?? false);

test('a deck row: the same inputs give the same text', () => {
  assert.equal(sig(), sig());
  assert.equal(sig(deck(), { resume: { at: 2, n: 9 } }), sig(deck(), { resume: { at: 2, n: 9 } }));
});

test('a deck row: each thing the row shows changes the text', () => {
  const base = sig();
  const changed = [
    ['title', () => sig({ ...deck(), title: 'Other' })],
    ['short', () => sig({ ...deck(), short: 'PX' })],
    ['level', () => sig({ ...deck(), level: 'advanced' })],
    ['minutes', () => sig({ ...deck(), minutes: 25 })],
    ['summary', () => sig({ ...deck(), summary: 'Different' })],
    ['slide count', () => sig({ ...deck(), slides: [1, 2] })],
    ['objectives', () => sig({ ...deck(), objectives: ['a'] })],
    ['now playing', () => sig(deck(), { current: true })],
    ['resume place', () => sig(deck(), { resume: { at: 1, n: 5 } })],
    ['highlight', () => sig(deck(), { marked: true })],
    ['script listing', () => sig(deck(), { script: true })],
  ];
  for (const [what, f] of changed) assert.notEqual(f(), base, `${what} changes the deck's text`);
});

test('a deck row: a resume place moving or going changes the text', () => {
  const at2 = sig(deck(), { resume: { at: 2, n: 9 } });
  assert.notEqual(sig(deck(), { resume: { at: 3, n: 9 } }), at2);
  assert.notEqual(sig(deck(), { resume: { at: 2, n: 10 } }), at2);
  assert.notEqual(sig(), at2);
});

test('a patient row: the same preset gives the same text; the preset or the current flag changes it', () => {
  const p = { id: 'p1', label: 'Cirrhosis', group: 'Cirrhosis', summary: 's', vals: { a: 1 } };
  assert.equal(patientSig(p, false), patientSig({ ...p }, false));
  assert.notEqual(patientSig(p, true), patientSig(p, false));
  assert.notEqual(patientSig({ ...p, label: 'Other' }, false), patientSig(p, false));
  assert.notEqual(patientSig({ ...p, vals: { a: 2 } }, false), patientSig(p, false));
});

test('a patient row that cannot be written out is never put back', () => {
  const loop = { id: 'p2' }; loop.me = loop;
  assert.equal(patientSig(loop, false), null);
});
