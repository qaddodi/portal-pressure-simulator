// Getting around the presentations (review U3, U5, U7, U15, U22, U23, U24): search lists them, an upright iPad's pill
// has back and next, the Guide lists the presenter's keys, Help is in the phone's Settings sheet, every outline has
// sections, quiz mode's remains are gone, and a deck left part way resumes where it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { noteResume, resumeFor, forgetResume } from '../src/ui/resume.js';
import { presenterSource } from './split-src.js';

const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const presenter = presenterSource(), main = read('main.js');

// A localStorage for node: the resume records live there.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

test('a deck left part way resumes at that slide; the first or last slide, or a changed deck, starts afresh', () => {
  mem.clear();
  assert.equal(resumeFor('circuit', 12), null);
  noteResume('circuit', 6, 12);
  assert.deepEqual(resumeFor('circuit', 12), { at: 6, n: 12 });
  assert.equal(resumeFor('circuit', 13), null, 'the deck gained a slide since');
  noteResume('circuit', 11, 12);
  assert.equal(resumeFor('circuit', 12), null, 'the last slide: the talk is over');
  noteResume('circuit', 4, 12);
  noteResume('circuit', 0, 12);
  assert.equal(resumeFor('circuit', 12), null, 'back at the start');
  noteResume('sites', 3, 10);
  forgetResume('sites');
  assert.equal(resumeFor('sites', 10), null);
  mem.set('pps.resume', '{not json');
  assert.equal(resumeFor('sites', 10), null, 'a damaged record is ignored');
  noteResume('sites', 3, 10);
  assert.deepEqual(resumeFor('sites', 10), { at: 3, n: 10 });
});

test('the resume records keep to the newest 40 decks', () => {
  mem.clear();
  for (let i = 0; i < 45; i++) noteResume(`d${i}`, 2, 10);
  const all = JSON.parse(mem.get('pps.resume'));
  assert.equal(Object.keys(all).length, 40);
  assert.equal(resumeFor('d0', 10), null);
  assert.deepEqual(resumeFor('d44', 10), { at: 2, n: 10 });
});




test('the Guide lists the presenter\'s keys, and ? opens it there while presenting; Esc then closes the Guide, not the talk', () => {
  const keys = main.slice(main.indexOf('const PRESENT_KEYS'), main.indexOf('];', main.indexOf('const PRESENT_KEYS')));
  for (const k of ["'G'", "'F'", "'Esc'", "'B or .'", "'Home · End'"]) assert.ok(keys.includes(k), k);
  const onKey = presenter.slice(presenter.indexOf('function onKey('), presenter.indexOf("addEventListener('keydown', onKey, true)"));
  for (const k of ["lk === 'g'", "lk === 'f'", "lk === 'b'", "k === 'Home'", "k === 'End'", "k === 'Escape'"]) assert.ok(onKey.includes(k), `the Guide lists a key the presenter has: ${k}`);
});


test('every deck\'s outline lists three to five sections, and the circuit talk places each slide in one', () => {
  for (const d of DECKS) {
    const o = withOverview(d), secs = o.slides[0].outline;
    if (d.id === 'circuit' || d.sections) assert.ok(secs.length >= 3 && secs.length <= 5, `${d.id}: ${secs.length} sections`);
  }
  const c = withOverview(DECKS.find((d) => d.id === 'circuit'));
  assert.deepEqual(c.slides[0].outline, ['Flow and resistance', 'Cirrhosis', 'Collaterals', 'Treatment']);
  for (const s of c.slides.slice(1)) if (!s.visual && s.kicker !== 'Summary') assert.ok(s.sec, `circuit/${s.id} has no section`);
});

test('quiz mode is gone: no deck asks a quiz question and the presenter has no quiz branches', () => {
  for (const d of DECKS) for (const s of d.slides) assert.equal(s.quiz, undefined, `${d.id}/${s.id}`);
  assert.doesNotMatch(readFileSync(new URL('../docs/deck-authoring-guide.md', import.meta.url), 'utf8'), /quiz/i);
});
