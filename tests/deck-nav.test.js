// Getting around the presentations (review U3, U5, U7, U15, U22, U23, U24): search lists them, an upright iPad's pill
// has back and next, the Guide lists the presenter's keys, Help is in the phone's Settings sheet, every outline has
// sections, quiz mode's remains are gone, and a deck left part way resumes where it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { noteResume, resumeFor, forgetResume } from '../src/ui/resume.js';

const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const presenter = read('presenter.js'), main = read('main.js'), palette = read('palette.js'), menu = read('menu.js'), tools = read('presenter-tools.js');

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

test('the presenter notes each slide it goes to, and the menu offers Resume with its slide number', () => {
  assert.match(presenter, /want = clamp\(i, 0, slides\.length - 1\);\s*noteResume\(deck\.id, want, slides\.length\);/);
  assert.match(presenter, /resumeAt: \(d\) => resumeFor\(d\.id, \(d\.mine \? d\.slides : withOverview\(d\)\.slides\)\.length\)/);
  assert.match(menu, /lib\.start\(d\.id, r\?\.at \?\? 0\)/);
  assert.match(menu, /`Resume \$\{r\.at \+ 1\} \/ \$\{r\.n\}`/);
  assert.match(menu, /'From the start'/);
});

test('search lists the presentations and starts one', () => {
  assert.match(palette, /add\('Present', d\.short \|\| d\.title, \(\) => ctx\.present\(d\.id\)/);
  assert.match(palette, /ctx\.library\(\)\.then\(\(\) => \{ if \(!back\.hidden\) renderList\(\); \}\)/, 'the list fills in once the presenter has loaded');
  assert.match(main, /library: presenter\.library, libraryNow: presenter\.libraryNow, present: \(id\) => presenter\.start\(id\)/);
});

test('an upright tablet\'s pill has back and next around the count; a phone\'s keeps the count alone', () => {
  assert.match(presenter, /ui\.bar\.replaceChildren\(\.\.\.\(tab \? \[prevBtn\(\), countBtn, nextBtn\(\)\] : \[countBtn\]\), gear\(\)/);
  assert.match(presenter, /const tab = tabUp\(\);/);
  // Turning the tablet rebuilds the pill before the words are fitted around it.
  assert.match(presenter, /if \(ui\.bar\.dataset\.kind !== pillKind\(\)\) paintChrome\(\);\s*(\/\/[^\n]*\n\s*)?layout\(\);/);
});

test('the Guide lists the presenter\'s keys, and ? opens it there while presenting; Esc then closes the Guide, not the talk', () => {
  assert.match(main, /h\('h3', \{ 'data-sec': 'present' \}, 'While presenting'\)/);
  assert.match(main, /if \(e\.key === '\?'\) \{ openHelp\(presenter\.active\(\) \? 'present' : undefined\); return; \}/);
  const keys = main.slice(main.indexOf('const PRESENT_KEYS'), main.indexOf('];', main.indexOf('const PRESENT_KEYS')));
  for (const k of ["'G'", "'F'", "'Esc'", "'B or .'", "'Home · End'"]) assert.ok(keys.includes(k), k);
  const onKey = presenter.slice(presenter.indexOf('function onKey('), presenter.indexOf("addEventListener('keydown', onKey, true)"));
  assert.match(onKey, /if \(isModalOpen\(\)\) return;/);
  for (const k of ["lk === 'g'", "lk === 'f'", "lk === 'b'", "k === 'Home'", "k === 'End'", "k === 'Escape'"]) assert.ok(onKey.includes(k), `the Guide lists a key the presenter has: ${k}`);
});

test('the phone\'s Settings sheet carries Help as well as Search', () => {
  assert.match(main, /menuItem\('Search', \{ icon: 'search'[^\n]*\n\s*menuItem\('Help', \{ icon: 'help', onClick: \(\) => \{ closePopover\(\); openHelpMenu\(anchor, \{ place: 'above'/);
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
  assert.doesNotMatch(presenter, /\bquiz\b|asking\(|wantRev/);
  assert.doesNotMatch(tools, /\bquiz\b|'ask'/);
  assert.doesNotMatch(readFileSync(new URL('../docs/deck-authoring-guide.md', import.meta.url), 'utf8'), /quiz/i);
});
