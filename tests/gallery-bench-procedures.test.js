// The Procedures bench's list (src/ui/gallery/benches/procedures.js) against the real decks: every procedure kind the decks use is a group, every entry is a real
// slide that plays it (or shows the HVPG catheter), and the numbers are the presenter's (the outline is slide 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { PROCEDURES } from '../src/ui/procedure-names.js';
import { procedureSlides, kindOfProcedure, labelOf, hasCatheter, whereText, CATHETER } from '../src/ui/gallery/benches/procedures.js';

const groups = procedureSlides(DECKS);
const slideOf = (e) => withOverview(DECKS.find((d) => d.id === e.deckId)).slides[e.index];

test('kindOfProcedure reads a string or an object', () => {
  assert.equal(kindOfProcedure('tips'), 'tips');
  assert.equal(kindOfProcedure({ kind: 'brto', target: 'C6' }), 'brto');
  assert.equal(kindOfProcedure({ auto: true }), null);
  assert.equal(kindOfProcedure(undefined), null);
  assert.equal(kindOfProcedure(''), null);
});

test('every procedure kind a deck slide uses is a group, once, with entries', () => {
  const used = new Set();
  for (const d of DECKS) for (const s of withOverview(d).slides) { const k = kindOfProcedure(s.procedure); if (k) used.add(k); if (hasCatheter(s)) used.add(CATHETER); }
  assert.ok(used.has('tips') && used.has('brto') && used.has('bato'), 'the decks play TIPS, BRTO and BATO');
  assert.deepEqual(groups.map((g) => g.kind).sort(), [...used].sort());
  assert.equal(new Set(groups.map((g) => g.kind)).size, groups.length);
  for (const g of groups) assert.ok(g.entries.length > 0, g.kind);
});

test('every kind that procedure-names.js names and the decks use takes its label from there', () => {
  let n = 0;
  for (const g of groups) if (PROCEDURES[g.kind]) { n++; assert.equal(g.label, PROCEDURES[g.kind].label); }
  assert.ok(n >= 3, `at least tips, brto, bato (${n})`);
  assert.equal(labelOf('tips'), PROCEDURES.tips.label);
  assert.equal(labelOf('no-such-kind'), 'no-such-kind', 'an unknown kind shows as itself');
  for (const g of groups) assert.ok(g.label && g.label.trim(), g.kind);
});

test('every entry resolves to a real slide that plays the kind or shows the catheter, in the presenter\'s numbering', () => {
  for (const g of groups) for (const e of g.entries) {
    const d = DECKS.find((x) => x.id === e.deckId);
    assert.ok(d, `${g.kind}: deck ${e.deckId}`);
    assert.equal(e.deckTitle, d.title);
    const slides = withOverview(d).slides, s = slideOf(e);
    assert.ok(Number.isInteger(e.index) && e.index >= 1 && e.index < slides.length, `${e.deckId} index ${e.index} (0 is the outline)`);
    assert.ok(s, `${e.deckId} ${e.index}`);
    assert.equal(e.slideId, s.id || '');
    if (g.kind === CATHETER) assert.ok(hasCatheter(s), `${e.deckId} ${e.index} shows the catheter`);
    else assert.equal(kindOfProcedure(s.procedure), g.kind, `${e.deckId} ${e.index}`);
  }
});

test('no slide is listed twice in one group, and entries run in deck order, then slide order', () => {
  for (const g of groups) {
    const seen = new Set();
    for (const e of g.entries) { const k = `${e.deckId}:${e.index}`; assert.ok(!seen.has(k), `${g.kind} ${k}`); seen.add(k); }
    const deckAt = (id) => DECKS.findIndex((d) => d.id === id);
    for (let i = 1; i < g.entries.length; i++) {
      const a = g.entries[i - 1], b = g.entries[i];
      assert.ok(deckAt(a.deckId) < deckAt(b.deckId) || (a.deckId === b.deckId && a.index < b.index), `${g.kind} order at ${i}`);
    }
  }
});

test('the HVPG deck\'s catheter slides are listed (route, free, wedge...) and the group is last', () => {
  const cath = groups.find((g) => g.kind === CATHETER);
  assert.ok(cath, 'a catheter group');
  assert.ok(cath.entries.filter((e) => e.deckId === 'hvpg').length >= 4);
  assert.equal(groups.at(-1).kind, CATHETER);
  assert.equal(groups[0].kind, 'tips');
});

test('a made-up deck: a procedure object with a target, a catheter tool, a slide with both, and a deck with none', () => {
  const decks = [
    { id: 'a', title: 'A', slides: [{ id: 's1', title: 'one', procedure: { kind: 'brto', target: 'C6' } }, { id: 's2', title: 'two', tool: { kind: 'hvpg', catheter: true } }, { id: 's3', title: 'three', cath: 'wedge', procedure: 'tips' }] },
    { id: 'b', title: 'B', slides: [{ id: 'x', title: 'none' }] },
    { id: 'c', title: 'C', slides: [] },
  ];
  const g = procedureSlides(decks), by = Object.fromEntries(g.map((x) => [x.kind, x]));
  assert.deepEqual(Object.keys(by).sort(), [CATHETER, 'brto', 'tips'].sort());
  assert.deepEqual(by.brto.entries.map((e) => [e.deckId, e.index, e.note]), [['a', 1, 'target C6']]);   // (the outline slide is 0)
  assert.deepEqual(by[CATHETER].entries.map((e) => e.index), [2, 3]);
  assert.deepEqual(procedureSlides([]), []);
  assert.ok(procedureSlides(undefined).length > 0, 'the real decks by default');
});

test('whereText says deck, slide n of m', () => {
  assert.equal(whereText({ id: 'hvpg', at: 4 }, 15), 'Measuring HVPG and PPG, slide 5 of 15');
  assert.equal(whereText({ id: 'hvpg', at: 0 }, 0), 'Measuring HVPG and PPG, slide 1');
  assert.equal(whereText({ id: 'mine-1', at: 2 }, 9), 'mine-1, slide 3 of 9');
  assert.match(whereText(null, 0), /No talk open/);
});
