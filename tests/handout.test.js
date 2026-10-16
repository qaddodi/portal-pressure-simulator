import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { handoutHTML, lineText, NO_FIGURE } from '../src/ui/handout.js';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { TILE } from '../src/ui/table-marks.js';

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('the notes handout has a row per slide with its notes and question, for every deck', () => {
  for (const d of DECKS) {
    const html = handoutHTML(d);
    assert.equal(html.match(/<article/g).length, d.slides.length + (d.checks?.length ? 1 : 0), d.id);   // (the outline slide goes in the header; the quick check is added at the end)
    for (const [q] of d.checks || []) assert.ok(html.includes(q.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')), `${d.id} check`);
    for (const s of d.slides) {
      if (s.notes) assert.ok(html.includes(esc(s.notes)), `${d.id}/${s.id} notes`);
      if (s.ask?.[0]) assert.ok(html.includes(s.ask[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')), `${d.id}/${s.id} ask`);
    }
  }
});

test('the handout escapes a script\'s own text', () => {
  const html = handoutHTML({ title: '<b>x</b>', mine: true, slides: [{ title: 'a<script>', notes: '"n"', ask: ['q&', 'a'] }] });
  assert.ok(!html.includes('<script>') && html.includes('a&lt;script&gt;') && html.includes('q&amp;'));
});

// Print notes print what the slide shows: every value and pointer in a line is filled in (121 values and 22 pointers
// printed raw, "an HVPG of hvpg", until 15 Oct).
test('the handout prints each line\'s values and words, never a raw placeholder', () => {
  const fp = Object.fromEntries(Object.keys(TILE).map((k) => [k, 7.25]));   // (any finite number: the check is that every token is read)
  for (const d of DECKS) {
    const slides = withOverview(d).slides, ids = new Set(slides.map((s) => s.id));
    for (const s of slides) for (const m of (s.line || '').matchAll(/\{(\w+)@([\w-]+)\}/g)) assert.ok(ids.has(m[2]), `${d.id}/${s.id}: {${m[1]}@${m[2]}} names no slide`);
    const html = handoutHTML(d, 'figs/', slides.map(() => fp));
    const text = html.slice(html.indexOf('</style>')).replace(/<[^>]+>/g, '');
    for (const bad of ['{', '}', '](', '—']) assert.ok(!text.includes(bad), `${d.id}: "${bad}" in ${text.slice(Math.max(0, text.indexOf(bad) - 60), text.indexOf(bad) + 20)}`);
  }
  assert.equal(lineText('An HVPG of {hvpg} in the [portal vein](pv), under {<15 cm/s}; {6 to 8 g}; before {ppg@a}.', { hvpg: 11.64 }, (id) => (id === 'a' ? { ppg: 4.25 } : null)),
    'An HVPG of 11.6 mmHg in the portal vein, under 15 cm/s; 6 to 8 g; before 4.3 mmHg.');
  assert.equal(lineText('{asc} and {plt} and {shunt}', { asc: 4300, plt: 92.4, shunt: 0.715 }), '4.3 L and 92 ×10³/µL and 72%');
});
test('every slide of every deck prints its figure, except the outline and the quick check', () => {
  const dir = new URL('../brand/handout/', import.meta.url), want = new Set();
  for (const d of DECKS) {
    const slides = withOverview(d).slides, html = handoutHTML(d, 'figs/');
    for (const s of slides) {
      if (NO_FIGURE.has(s.visual)) continue;
      want.add(`${d.id}/${s.id}.webp`);
      assert.ok(html.includes(`src="figs/${d.id}/${s.id}.webp"`), `${d.id}/${s.id}: no figure slot`);
      assert.ok(existsSync(new URL(`${d.id}/${s.id}.webp`, dir)), `${d.id}/${s.id}: no figure; run node scripts/handout-figures.mjs ${d.id}`);
    }
    assert.equal((html.match(/<figure>/g) || []).length, slides.filter((s) => !NO_FIGURE.has(s.visual)).length, d.id);
  }
  // (a figure no slide prints is a renamed or removed slide's: its deck's figures want drawing again)
  const have = readdirSync(dir).flatMap((d) => readdirSync(new URL(`${d}/`, dir)).map((f) => `${d}/${f}`));
  assert.deepEqual(have.filter((f) => !want.has(f)), []);
});
